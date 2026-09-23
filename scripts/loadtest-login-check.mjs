/**
 * Can the synthetic load-test accounts actually sign in? (Master Prompt 12, Part D)
 *
 * The 370 `loadtest-*@cosora.test` users were inserted straight into
 * auth.users with NULL in four string columns GoTrue scans as non-null text
 * (confirmation_token, recovery_token, email_change_token_new, email_change).
 * GoTrue then fails the password grant with HTTP 500 before it ever checks the
 * password, so every account looked fine in SQL and none could sign in.
 *
 * This hits the real token endpoint over HTTP, prints the status GoTrue
 * returned, and for a 200 makes one authenticated PostgREST read (the caller's
 * own profile row) to prove the JWT is usable, not just issued.
 *
 * Run:  node scripts/loadtest-login-check.mjs loadtest-buyer-1 loadtest-vendor-5 ...
 *       (bare names get "@cosora.test" appended; LOADTEST_PASSWORD from .env)
 */
import { readFileSync } from "node:fs";
import { credential } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = credential("LOADTEST_PASSWORD");

const names = process.argv.slice(2);
if (!names.length) throw new Error("pass one or more account names, e.g. loadtest-buyer-1");

let failed = 0;
for (const n of names) {
  const email = n.includes("@") ? n : `${n}@cosora.test`;
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) {
    failed++;
    console.log(`${email.padEnd(34)} HTTP ${res.status}  ${body.error_code ?? body.code ?? ""} ${body.msg ?? body.error_description ?? body.message ?? ""}`.trimEnd());
    continue;
  }
  const uid = body.user?.id;
  const prof = await fetch(`${URL_}/rest/v1/profiles?id=eq.${uid}&select=id,active_role`, {
    headers: { apikey: ANON, Authorization: `Bearer ${body.access_token}` },
  });
  const rows = await prof.json().catch(() => []);
  const ok = prof.status === 200 && Array.isArray(rows) && rows.length === 1;
  if (!ok) failed++;
  console.log(`${email.padEnd(34)} HTTP 200  user ${uid}  own-profile read: HTTP ${prof.status}, ${Array.isArray(rows) ? rows.length : 0} row${ok ? ` (active_role=${rows[0].active_role})` : "  <-- FAILED"}`);
}
process.exitCode = failed ? 1 : 0;
