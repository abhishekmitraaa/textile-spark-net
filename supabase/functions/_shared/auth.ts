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
  return (await verifiedUser(req, url, apikey))?.id ?? null;
}

/**
 * The same check, with what an admin action also needs: whether the account is still on a temporary password
 * (`app_metadata.must_change_password`, set only by the service role). A staff account on one may change its password
 * and nothing else (Cosora-Admin review 2026-11-22, AR-H06).
 */
export async function verifiedUser(req: Request, url: string, apikey: string): Promise<{ id: string; mustChangePassword: boolean } | null> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization.trim())) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey, authorization } });
    if (!r.ok) return null;
    const user = await r.json();
    if (typeof user?.id !== "string" || user.id.length === 0) return null;
    return { id: user.id, mustChangePassword: user?.app_metadata?.must_change_password === true };
  } catch {
    return null;
  }
}
