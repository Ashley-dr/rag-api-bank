// src/services/turnstile.ts
// Cloudflare Turnstile server-side verification.

export async function verifyTurnstile(
  token: unknown,
  ip?: string,
): Promise<boolean> {
  // Dev uses Cloudflare's always-pass test secret when none is configured.
  const secret =
    process.env.TURNSTILE_SECRET_KEY ||
    (process.env.NODE_ENV !== "production"
      ? "1x0000000000000000000000000000000AA"
      : "");
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not configured.");
    return false;
  }
  if (typeof token !== "string" || !token || token.length > 2048) return false;

  const params = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") params.append("remoteip", ip);

  try {
    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: params },
    );
    const data = (await resp.json().catch(() => ({}))) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verify failed:", err);
    return false;
  }
}
