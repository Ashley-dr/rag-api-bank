// src/routes/handoff.ts
// "Talk to a human": customer <-> support representative live chat.
//
//  Customer (header X-Handoff-Token):
//    POST /api/handoff                    create request (Turnstile) + email support
//    GET  /api/handoff/:id/messages       poll  (?after=<last message id>)
//    POST /api/handoff/:id/messages       send
//    POST /api/handoff/:id/close          end chat
//
//  Representative (header X-Agent-Token, from the link in the email):
//    GET  /api/handoff/agent/:id          request details + messages (?after=)
//    POST /api/handoff/agent/:id/messages reply (first reply joins the chat)
//    POST /api/handoff/agent/:id/close    end chat
//
//  GET /agent/:id#k=<token>               the representative's chat page

import express, { Router, Request, Response, RequestHandler } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import type { Pool } from "pg";
import pool from "../config/db.js";
import { sendSupportMail, isValidEmail } from "../services/mailer.js";
import { verifyTurnstile } from "../services/turnstile.js";

const TOPICS = new Set([
  "Loan inquiry",
  "Account concern",
  "Branch / ATM",
  "Complaint",
  "Careers",
  "Other",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LEN = 1000;
const MAX_MESSAGES_PER_SESSION = 500;
const AGENT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // email link valid 7 days

// ---------- helpers ----------
const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const clean = (v: unknown, max: number): string =>
  String(v ?? "").trim().slice(0, max);

// accepts 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
function normalizePhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("63")) d = "0" + d.slice(2);
  return /^0[1-9]\d{9}$/.test(d) ? d : "";
}

const sha256 = (s: string): string =>
  crypto.createHash("sha256").update(s).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function secret(): string {
  return process.env.HANDOFF_SECRET || process.env.ADMIN_API_KEY || "";
}

const hmac = (data: string): string =>
  crypto.createHmac("sha256", secret()).update(data).digest("hex");

export function makeAgentToken(id: string, now = Date.now()): string {
  const exp = String(now + AGENT_LINK_TTL_MS);
  return `${exp}.${hmac(`${id}.${exp}`)}`;
}

function verifyAgentToken(id: string, token: string): boolean {
  if (!secret() || !token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, hmac(`${id}.${exp}`));
}

function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// express-rate-limit v6 types don't line up with express' RequestHandler
const limiter = (opts: Record<string, unknown>): RequestHandler =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...opts,
  }) as unknown as RequestHandler;

type SessionRow = {
  id: string;
  name: string;
  contact_method: string;
  contact: string;
  topic: string;
  details: string;
  status: "waiting" | "active" | "closed";
  customer_token_hash: string;
  created_at: string;
};

type MessageRow = { id: string; sender: string; body: string; created_at: string };

const toMessage = (m: MessageRow) => ({
  id: Number(m.id),
  sender: m.sender,
  text: m.body,
  createdAt: m.created_at,
});

function buildAgentEmail(s: {
  id: string;
  name: string;
  contactMethod: string;
  contact: string;
  topic: string;
  details: string;
  link: string;
}): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 0;width:130px;vertical-align:top;"><b>${k}:</b></td><td style="padding:4px 0;">${escapeHtml(v) || "-"}</td></tr>`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#111;padding:18px;max-width:640px;">
    <div style="font-size:22px;font-weight:900;margin:2px 0 6px;">A customer is waiting to chat</div>
    <div style="font-size:13px;color:#444;margin:0 0 14px;">Someone asked to talk to a human on the ASPAC Bank website chatbot.</div>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row("Name", s.name)}
      ${row(s.contactMethod === "email" ? "Email" : "Phone", s.contact)}
      ${row("Topic", s.topic)}
    </table>
    <div style="margin:16px 0 6px;font-size:15px;font-weight:900;">Concern</div>
    <div style="font-size:14px;line-height:1.5;padding:12px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa;">
      ${escapeHtml(s.details).replace(/\n/g, "<br/>")}
    </div>
    <div style="margin:22px 0;">
      <a href="${escapeHtml(s.link)}" style="background:#229b15;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;display:inline-block;">Open chat</a>
    </div>
    <div style="font-size:12px;color:#666;">This link is private to you and expires in 7 days. Do not forward this email.<br/>The customer's earlier conversation with the AI assistant is not included.</div>
  </div>`.trim();
}

// ---------- router factory (pool injected so it can be tested) ----------
export function createHandoffRouter(db: Pool): Router {
  const router = express.Router();

  const createLimiter = limiter({
    windowMs: 10 * 60 * 1000,
    max: 5, // 5 requests / 10 min / IP
    skipFailedRequests: true, // typos / failed security checks don't count
    message: { error: "Too many requests", message: "Too many requests. Please try again later." },
  });
  const pollLimiter = limiter({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: "Too many requests", message: "Slow down a little." },
  });
  const sendLimiter = limiter({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "Too many requests", message: "You are sending messages too quickly." },
  });

  async function loadSession(id: string): Promise<SessionRow | null> {
    if (!UUID_RE.test(id)) return null;
    const { rows } = await db.query<SessionRow>(
      "SELECT * FROM handoff_sessions WHERE id = $1",
      [id],
    );
    return rows[0] || null;
  }

  async function loadMessages(id: string, after: unknown) {
    const afterId = Number.isFinite(Number(after)) ? Math.max(0, Number(after)) : 0;
    const { rows } = await db.query<MessageRow>(
      `SELECT id, sender, body, created_at FROM handoff_messages
       WHERE handoff_id = $1 AND id > $2 ORDER BY id ASC LIMIT 200`,
      [id, afterId],
    );
    return rows.map(toMessage);
  }

  async function addMessage(id: string, sender: string, body: string) {
    const { rows } = await db.query<MessageRow>(
      `INSERT INTO handoff_messages (handoff_id, sender, body)
       VALUES ($1, $2, $3) RETURNING id, sender, body, created_at`,
      [id, sender, body],
    );
    return toMessage(rows[0]);
  }

  async function closeSession(id: string, by: "customer" | "agent") {
    const { rowCount } = await db.query(
      `UPDATE handoff_sessions SET status = 'closed', closed_at = NOW(), closed_by = $2
       WHERE id = $1 AND status <> 'closed'`,
      [id, by],
    );
    if (rowCount) {
      await addMessage(
        id,
        "system",
        by === "customer" ? "The customer ended the chat." : "The representative ended the chat.",
      );
    }
  }

  // ----- auth middlewares -----
  type Authed = Request & { session?: SessionRow };

  const customerAuth: RequestHandler = async (req, res, next) => {
    try {
      const s = await loadSession(String(req.params.id));
      const token = String(req.headers["x-handoff-token"] || "");
      if (!s || !token || !safeEqual(sha256(token), s.customer_token_hash)) {
        res.status(404).json({ error: "Not found", message: "Chat not found." });
        return;
      }
      (req as Authed).session = s;
      next();
    } catch (err) {
      next(err);
    }
  };

  const agentAuth: RequestHandler = async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const token = String(req.headers["x-agent-token"] || "");
      if (!verifyAgentToken(id, token)) {
        res.status(401).json({ error: "Unauthorized", message: "Invalid or expired link." });
        return;
      }
      const s = await loadSession(id);
      if (!s) {
        res.status(404).json({ error: "Not found", message: "Chat not found." });
        return;
      }
      (req as Authed).session = s;
      next();
    } catch (err) {
      next(err);
    }
  };

  const parseText = (req: Request, res: Response): string | null => {
    const text = clean((req.body as { text?: unknown })?.text, MAX_MESSAGE_LEN);
    if (!text) {
      res.status(400).json({ error: "Invalid request", message: "Message cannot be empty." });
      return null;
    }
    return text;
  };

  const messageCapReached = async (id: string): Promise<boolean> => {
    const { rows } = await db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM handoff_messages WHERE handoff_id = $1",
      [id],
    );
    return Number(rows[0]?.n || 0) >= MAX_MESSAGES_PER_SESSION;
  };

  // ===== Representative routes (registered first: /agent/... before /:id/...) =====
  router.get("/agent/:id", pollLimiter, agentAuth, async (req, res, next) => {
    try {
      const s = (req as Authed).session as SessionRow;
      res.json({
        id: s.id,
        status: s.status,
        name: s.name,
        contactMethod: s.contact_method,
        contact: s.contact,
        topic: s.topic,
        details: s.details,
        createdAt: s.created_at,
        messages: await loadMessages(s.id, req.query.after),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/agent/:id/messages", sendLimiter, agentAuth, async (req, res, next) => {
    try {
      const s = (req as Authed).session as SessionRow;
      if (s.status === "closed") {
        res.status(409).json({ error: "Closed", message: "This chat has ended." });
        return;
      }
      const text = parseText(req, res);
      if (text === null) return;
      if (await messageCapReached(s.id)) {
        res.status(429).json({ error: "Limit", message: "Message limit reached for this chat." });
        return;
      }

      if (s.status === "waiting") {
        const { rowCount } = await db.query(
          "UPDATE handoff_sessions SET status = 'active', joined_at = NOW() WHERE id = $1 AND status = 'waiting'",
          [s.id],
        );
        if (rowCount) await addMessage(s.id, "system", "A representative has joined the chat.");
      }
      res.status(201).json({ message: await addMessage(s.id, "agent", text) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/agent/:id/close", sendLimiter, agentAuth, async (req, res, next) => {
    try {
      await closeSession((req as Authed).session!.id, "agent");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ===== Create request =====
  router.post("/", createLimiter, async (req, res, next) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;

      // honeypot: pretend success so bots don't learn
      if (clean(body.website, 80)) {
        res.status(201).json({ id: crypto.randomUUID(), token: crypto.randomBytes(16).toString("hex") });
        return;
      }

      if (!secret()) {
        console.error("handoff: HANDOFF_SECRET (or ADMIN_API_KEY) is not configured.");
        res.status(503).json({ error: "Unavailable", message: "Live chat is not available right now." });
        return;
      }

      if (!(await verifyTurnstile(body.turnstileToken, clientIp(req)))) {
        res.status(403).json({
          error: "Security check failed",
          message: "Security check failed. Please refresh and try again.",
        });
        return;
      }

      const method = body.contactMethod === "email" ? "email" : "phone";
      const name = clean(body.name, 120);
      const topic = typeof body.topic === "string" && TOPICS.has(body.topic) ? body.topic : "Other";
      const details = clean(body.details, 500);
      const chatSessionId = clean(body.sessionId, 80).replace(/[^\w-]/g, "");

      const bad = (message: string) => {
        res.status(400).json({ error: "Invalid request", message });
      };

      if (name.length < 2) return bad("Please enter your full name.");
      if (body.consent !== true) return bad("Consent is required.");
      if (details.length < 5) return bad("Please describe your concern.");

      let contact: string;
      if (method === "email") {
        contact = clean(body.contact, 160).toLowerCase();
        if (!isValidEmail(contact)) return bad("Invalid email address.");
      } else {
        contact = normalizePhone(body.contact);
        if (!contact) return bad("Invalid mobile number. Use 11 digits, e.g. 09XX XXX XXXX.");
      }

      const customerToken = crypto.randomBytes(32).toString("hex");
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO handoff_sessions
           (chat_session_id, name, contact_method, contact, topic, details, customer_token_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [chatSessionId, name, method, contact, topic, details, sha256(customerToken)],
      );
      const id = rows[0].id;

      // The first message is the customer's own concern. The AI conversation is NOT copied.
      await addMessage(id, "customer", details);

      const base = (
        process.env.AGENT_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
      ).replace(/\/+$/, "");
      const link = `${base}/agent/${id}#k=${makeAgentToken(id)}`;

      try {
        await sendSupportMail({
          subject: `Live chat request - ${topic} - ${name}`,
          html: buildAgentEmail({ id, name, contactMethod: method, contact, topic, details, link }),
          replyTo: method === "email" ? contact : undefined,
        });
      } catch (mailErr) {
        // No one would ever see this request, so don't keep it.
        console.error("handoff: notify email failed:", mailErr instanceof Error ? mailErr.message : mailErr);
        await db.query("DELETE FROM handoff_sessions WHERE id = $1", [id]);
        res.status(502).json({
          error: "Notify failed",
          message: "We could not reach our support team right now. Please try again shortly.",
        });
        return;
      }

      console.log(`🙋 Handoff request ${id} (${topic}, ${method})`);
      res.status(201).json({ id, token: customerToken });
    } catch (err) {
      next(err);
    }
  });

  // ===== Customer routes =====
  router.get("/:id/messages", pollLimiter, customerAuth, async (req, res, next) => {
    try {
      const s = (req as Authed).session as SessionRow;
      res.json({ status: s.status, messages: await loadMessages(s.id, req.query.after) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/messages", sendLimiter, customerAuth, async (req, res, next) => {
    try {
      const s = (req as Authed).session as SessionRow;
      if (s.status === "closed") {
        res.status(409).json({ error: "Closed", message: "This chat has ended." });
        return;
      }
      const text = parseText(req, res);
      if (text === null) return;
      if (await messageCapReached(s.id)) {
        res.status(429).json({ error: "Limit", message: "Message limit reached for this chat." });
        return;
      }
      res.status(201).json({ message: await addMessage(s.id, "customer", text) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/close", sendLimiter, customerAuth, async (req, res, next) => {
    try {
      await closeSession((req as Authed).session!.id, "customer");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ---------- representative chat page (served by the API itself) ----------
const AGENT_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ASPAC Bank - Live chat</title>
<style>
  :root{--g:#229b15;--bg:#f1f5f9;--line:#e2e8f0;--tx:#0f172a;--mut:#64748b}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--tx);height:100dvh;display:flex;flex-direction:column}
  header{background:linear-gradient(135deg,#229b15,#38cb2c);color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px}
  header h1{font-size:16px;margin:0;flex:1}
  .pill{font-size:11px;font-weight:700;text-transform:uppercase;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.25)}
  button{font:inherit;cursor:pointer}
  .btn{border:0;border-radius:999px;padding:8px 16px;font-weight:700;font-size:13px}
  .btn-end{background:#fff;color:#b91c1c}
  details{background:#fff;border-bottom:1px solid var(--line);padding:10px 16px;font-size:13px}
  details summary{cursor:pointer;font-weight:700}
  details dl{margin:8px 0 0;display:grid;grid-template-columns:90px 1fr;gap:4px 8px}
  details dt{color:var(--mut)} details dd{margin:0;white-space:pre-wrap;word-break:break-word}
  #msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}
  .m{max-width:82%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 2px rgba(0,0,0,.06)}
  .m.customer{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px}
  .m.agent{align-self:flex-end;background:var(--g);color:#fff;border-bottom-right-radius:4px}
  .m.system{align-self:center;background:transparent;color:var(--mut);font-size:12px;box-shadow:none;text-align:center}
  .t{display:block;font-size:10px;opacity:.65;margin-top:3px}
  form{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--line)}
  input{flex:1;min-width:0;font-size:16px;padding:11px 16px;border:1px solid var(--line);border-radius:999px;outline:none;background:#f8fafc}
  input:focus{border-color:#4ade80;background:#fff}
  .btn-send{background:var(--g);color:#fff;padding:0 22px}
  .btn-send:disabled,input:disabled{opacity:.5;cursor:not-allowed}
  #err{color:#b91c1c;font-size:12px;padding:0 16px 6px;min-height:0}
</style>
</head>
<body>
<header>
  <h1 id="title">Live chat</h1>
  <span class="pill" id="status">...</span>
  <button class="btn btn-end" id="end" type="button">End chat</button>
</header>
<details open>
  <summary>Customer details</summary>
  <dl id="info"></dl>
</details>
<div id="msgs" aria-live="polite"></div>
<div id="err"></div>
<form id="f" autocomplete="off">
  <input id="in" maxlength="1000" placeholder="Type your reply..." aria-label="Reply">
  <button class="btn btn-send" id="send" type="submit">Send</button>
</form>
<script src="/agent/console.js"></script>
</body>
</html>`;

const AGENT_CONSOLE_JS = `
(function () {
  var id = location.pathname.split("/").filter(Boolean).pop();
  var token = new URLSearchParams(location.hash.slice(1)).get("k") || "";
  var api = "/api/handoff/agent/" + encodeURIComponent(id);
  var $ = function (s) { return document.getElementById(s); };
  var msgsEl = $("msgs"), errEl = $("err"), input = $("in"), sendBtn = $("send");
  var last = 0, seen = {}, status = "waiting", timer;

  function headers() { return { "Content-Type": "application/json", "X-Agent-Token": token }; }
  function fail(m) { errEl.textContent = m || ""; }

  function addRow(label, value) {
    var dt = document.createElement("dt"); dt.textContent = label;
    var dd = document.createElement("dd"); dd.textContent = value || "-";
    $("info").appendChild(dt); $("info").appendChild(dd);
  }

  function render(m) {
    if (seen[m.id]) return;
    seen[m.id] = true; last = Math.max(last, m.id);
    var d = document.createElement("div");
    d.className = "m " + (m.sender === "agent" ? "agent" : m.sender === "customer" ? "customer" : "system");
    d.textContent = m.text;
    if (m.sender !== "system") {
      var t = document.createElement("span"); t.className = "t";
      t.textContent = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      d.appendChild(t);
    }
    var nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80;
    msgsEl.appendChild(d);
    if (nearBottom || m.sender === "agent") msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function setStatus(s) {
    status = s;
    $("status").textContent = s === "waiting" ? "Waiting" : s === "active" ? "Active" : "Ended";
    var closed = s === "closed";
    input.disabled = closed; sendBtn.disabled = closed; $("end").style.display = closed ? "none" : "";
    if (closed) { clearInterval(timer); input.placeholder = "This chat has ended"; }
  }

  async function load(first) {
    try {
      var r = await fetch(api + "?after=" + last, { headers: headers() });
      if (r.status === 401) { fail("This link is invalid or has expired."); clearInterval(timer); setStatus("closed"); return; }
      if (!r.ok) { fail("Connection problem, retrying..."); return; }
      var d = await r.json(); fail("");
      if (first) {
        $("title").textContent = "Chat with " + d.name;
        document.title = d.name + " - Live chat";
        addRow("Name", d.name); addRow(d.contactMethod === "email" ? "Email" : "Phone", d.contact);
        addRow("Topic", d.topic); addRow("Concern", d.details);
        addRow("Requested", new Date(d.createdAt).toLocaleString());
      }
      d.messages.forEach(render); setStatus(d.status);
    } catch (e) { fail("Connection problem, retrying..."); }
  }

  $("f").addEventListener("submit", async function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text || status === "closed") return;
    sendBtn.disabled = true;
    try {
      var r = await fetch(api + "/messages", { method: "POST", headers: headers(), body: JSON.stringify({ text: text }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { fail(d.message || "Could not send."); if (r.status === 409) setStatus("closed"); }
      else { input.value = ""; fail(""); await load(false); }
    } catch (err) { fail("Could not send. Check your connection."); }
    sendBtn.disabled = status === "closed"; input.focus();
  });

  $("end").addEventListener("click", async function () {
    if (!confirm("End this chat for the customer?")) return;
    await fetch(api + "/close", { method: "POST", headers: headers() }).catch(function () {});
    load(false);
  });

  load(true);
  timer = setInterval(function () { if (!document.hidden) load(false); }, 3000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(false); });
})();
`;

export const agentPageRouter: Router = express.Router();

agentPageRouter.get("/console.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store").send(AGENT_CONSOLE_JS);
});

agentPageRouter.get("/:id", (req, res) => {
  if (!UUID_RE.test(String(req.params.id))) {
    res.status(404).send("Not found");
    return;
  }
  res.type("html").set("Cache-Control", "no-store").send(AGENT_PAGE_HTML);
});

export default createHandoffRouter(pool);
