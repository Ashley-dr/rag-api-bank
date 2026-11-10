// src/services/mailer.ts
// Sends mail through Microsoft Graph (app-only). Same Azure app settings the
// website uses for its forms.

async function getAccessToken(): Promise<string> {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error("Missing AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET");
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }).toString(),
    },
  );
  const data = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error_description || "Failed to get Microsoft token");
  }
  return data.access_token;
}

// strip CR/LF so values can never inject mail headers
const safeHeader = (s: string, max = 200): string =>
  String(s ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

export const isValidEmail = (e: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(e);

export interface MailOptions {
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Sends from MAIL_HUMAN to MAIL_HUMAN (the support mailbox notifies itself).
 * Set HANDOFF_MAIL_TO to deliver to a different inbox.
 */
export async function sendSupportMail(opts: MailOptions): Promise<void> {
  const from = safeHeader(process.env.MAIL_HUMAN || "");
  const to = safeHeader(process.env.HANDOFF_MAIL_TO || process.env.MAIL_HUMAN || "");
  if (!isValidEmail(from) || !isValidEmail(to)) {
    throw new Error("MAIL_HUMAN is missing or invalid");
  }

  const token = await getAccessToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: safeHeader(opts.subject, 150),
          body: { contentType: "HTML", content: opts.html },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(opts.replyTo && isValidEmail(opts.replyTo)
            ? { replyTo: [{ emailAddress: { address: opts.replyTo } }] }
            : {}),
        },
        saveToSentItems: true,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(`sendMail failed (${resp.status}): ${await resp.text()}`);
  }
}
