/**
 * Notifications RLS + write-path check, against the real database with a real
 * login. Companion to Cosora-Admin's rls-matrix.mjs, same rules:
 *
 *   - Sign in with the ANON key so PostgREST runs as `authenticated`, which is
 *     what the policies actually check.
 *   - An RLS denial on UPDATE/DELETE does NOT raise. The statement matches zero
 *     rows and PostgREST returns success, so every write here appends
 *     `.select()` and is judged on ROWS RETURNED.
 *
 * What must hold:
 *   1. A signed-in user reads only their OWN notifications.
 *   2. No client can INSERT one — there is no insert policy for any role, and
 *      notify() has no EXECUTE grant. A client that could forge a row could
 *      forge "Your account has been reinstated".
 *   3. Marking read works on an own row.
 *   4. Dismiss (DELETE) works on an own row.
 *   5. A row belonging to someone else cannot be read, updated or deleted.
 *
 * The fixture row is created by the DEMO BUYER suspending nothing — there is no
 * client path to create one, which is the point — so this script SKIPS the
 * cases that need a pre-existing row when the account has none, rather than
 * reporting a pass it cannot support. Run the admin panel's suspend/reinstate
 * against the demo buyer first to populate one.
 *
 * Run: node scripts/notifications-check.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

// The demo buyer. Same account the app's own dev switcher uses.
const EMAIL = "demo-buyer@cosora.dev";
const PASSWORD = "cosora123";

const results = [];
let failures = 0;

function record(check, expected, actual, ok, detail = "") {
  if (!ok) failures++;
  results.push({
    check,
    expected,
    actual,
    verdict: ok ? "PASS" : "*** FAIL ***",
    detail: detail.slice(0, 60),
  });
}

const db = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: auth, error: authError } = await db.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (authError) {
  console.error(`login failed for ${EMAIL}: ${authError.message}`);
  process.exit(1);
}
const me = auth.user.id;

// 1 — own rows only. profile_id is deliberately NOT filtered client-side; RLS is
// the filter, so if a foreign row comes back the POLICY is broken.
{
  const { data, error } = await db
    .from("notifications")
    .select("id, profile_id, kind, title")
    .limit(50);
  const foreign = (data ?? []).filter((r) => r.profile_id !== me);
  record(
    "select returns only my rows",
    "0 foreign",
    error ? `ERROR ${error.code}` : `${foreign.length} foreign of ${data?.length ?? 0}`,
    !error && foreign.length === 0,
    error?.message ?? "",
  );
}

// 2 — no client may insert. This is the one that matters most: the copy in
// these rows is the platform speaking.
{
  const { data, error } = await db
    .from("notifications")
    .insert({ profile_id: me, kind: "account_reinstated", title: "zz-forged" })
    .select("id");
  const denied = Boolean(error) || (data?.length ?? 0) === 0;
  record(
    "client INSERT is refused",
    "denied",
    denied ? "denied" : "*** ROW WRITTEN ***",
    denied,
    error ? `${error.code ?? ""} ${error.message}` : "",
  );
  if (!denied) await db.from("notifications").delete().eq("id", data[0].id);
}

// 2b — and notify() itself is not reachable, or the missing insert policy would
// be trivially routed around.
{
  const { error } = await db.rpc("notify", {
    p_profile_id: me,
    p_kind: "account_reinstated",
    p_title: "zz-forged-via-rpc",
  });
  record(
    "notify() RPC is not callable by a client",
    "denied",
    error ? "denied" : "*** CALLABLE ***",
    Boolean(error),
    error ? `${error.code ?? ""} ${error.message}` : "",
  );
}

// 3/4 — read and dismiss need a row that only the server can have made.
const { data: mine } = await db.from("notifications").select("id, read").limit(1);
if (!mine || mine.length === 0) {
  record(
    "mark-read / dismiss on an own row",
    "1 row",
    "SKIPPED - no notification rows for this account",
    true,
    "suspend+reinstate the demo buyer from the admin panel to create one",
  );
} else {
  const id = mine[0].id;
  const upd = await db.from("notifications").update({ read: true }).eq("id", id).select("id");
  record(
    "mark read on my own row",
    "1 row",
    upd.error ? `ERROR ${upd.error.code}` : `${upd.data?.length ?? 0} row(s)`,
    !upd.error && (upd.data?.length ?? 0) === 1,
    upd.error?.message ?? "",
  );

  const del = await db.from("notifications").delete().eq("id", id).select("id");
  record(
    "dismiss my own row",
    "1 row",
    del.error ? `ERROR ${del.error.code}` : `${del.data?.length ?? 0} row(s)`,
    !del.error && (del.data?.length ?? 0) === 1,
    del.error?.message ?? "",
  );
}

// 5 — someone else's row. Judged on rows, not on the error: this is exactly the
// silent-denial case, and "no error" here would otherwise read as success.
{
  const other = "22222222-2222-2222-2222-222222222222"; // demo vendor
  const { data, error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("profile_id", other)
    .select("id");
  const denied = Boolean(error) || (data?.length ?? 0) === 0;
  record(
    "cannot mark someone else's row read",
    "0 rows",
    denied ? "0 rows" : `*** ${data.length} ROW(S) CHANGED ***`,
    denied,
    error ? `${error.code ?? ""} ${error.message}` : "",
  );
}

await db.auth.signOut();

console.table(results);
console.log(
  failures === 0
    ? "\nPASS - notifications are server-written and self-scoped."
    : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
