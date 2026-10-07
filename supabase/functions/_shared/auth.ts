// ─────────────────────────────────────────────────────────────
// Who is calling, as Supabase Auth confirms it (subscriptions P0, 2026-10-08;
// securityflags S-5).
//
// The payment functions used to read `sub` out of the bearer token without
// checking its signature, and relied on the platform's verify_jwt gate alone. That
// gate is a deploy-time setting: a config.toml slip ships the function without it,
// and then any hand-made token names any vendor. Asking Auth for the user behind
// the token checks the signature and the session on every call, whatever the
// setting.
//
// Answers null for a missing, expired or forged token; the caller replies 401.
// No Deno APIs, so Node can load it (scripts/discount-flow-check.mjs).
// ─────────────────────────────────────────────────────────────

export async function verifiedUserId(req: Request, url: string, apikey: string): Promise<string | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization.trim())) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey, authorization } });
    if (!r.ok) return null;
    const user = await r.json();
    return typeof user?.id === "string" && user.id.length > 0 ? user.id : null;
  } catch {
    return null;
  }
}
