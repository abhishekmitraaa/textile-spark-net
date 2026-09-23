/**
 * Phase D — prove that suspension actually blocks content creation, with a real
 * login against the real database.
 *
 * The shape that matters: each case is run TWICE against the same account, once
 * active and once suspended, and the pass condition is that the answer CHANGES.
 * Running only the suspended half would pass just as well if the insert were
 * broken for an unrelated reason (a missing column, a NOT NULL, a different
 * policy), which is exactly the kind of false confidence a gate test must not
 * give.
 *
 * Since MPF-2 the same pairing covers call logging through log_call(), the only
 * write path to `calls`. Alongside it, while active, the script asserts that a
 * direct INSERT/UPDATE/DELETE on `calls` is refused (42501) and that log_call()
 * refuses a target with no vendor_profiles row.
 *
 * INSERTs raise on a WITH CHECK violation, so these are judged on the error.
 * (Unlike UPDATE/DELETE, where an RLS denial is silent — see
 * Cosora-Admin/scripts/rls-matrix.mjs.)
 *
 * Suspension is applied through set_account_status() as a real admin, because
 * that is the only writer — a direct UPDATE is rejected by a BEFORE trigger for
 * every role. Everything written here is removed again and the account is
 * reinstated in a finally block, so a mid-run failure cannot leave a demo
 * account suspended. The account_suspensions rows it produces are NOT removed —
 * that table has no DELETE policy for any role by design, and pretending to
 * clean it would be a lie in the teardown.
 *
 * Run: node scripts/suspension-gate-check.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { demoAccount } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

const VENDOR = demoAccount("vendor");
const ADMIN = demoAccount("admin");
const TAG = `zz-gate-${Date.now()}`;

function client() {
  return createClient(URL_, ANON, { auth: { persistSession: false } });
}

async function signIn({ email, password }) {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, id: data.user.id };
}

const vendor = await signIn(VENDOR);
const admin = await signIn(ADMIN);

/**
 * MPF-2: `calls` is written only through log_call(), which needs a real vendor
 * that isn't the caller. demo-buyer's account also has a vendor_profiles row, so
 * the test call stays inside the demo accounts. NON_VENDOR is demo-admin, whose
 * account has none (both are checked below rather than assumed).
 */
const CALL_TARGET = "11111111-1111-1111-1111-111111111111";
const NON_VENDOR = admin.id;
{
  const { data: vp } = await admin.db.from("vendor_profiles").select("id").in("id", [CALL_TARGET, NON_VENDOR]);
  const ids = new Set((vp ?? []).map((r) => r.id));
  if (!ids.has(CALL_TARGET)) throw new Error("CALL_TARGET has no vendor_profiles row; pick another demo vendor");
  if (ids.has(NON_VENDOR)) throw new Error("NON_VENDOR has a vendor_profiles row; pick another non-vendor");
}

/**
 * Each case inserts one throwaway row and reports whether it was accepted.
 * `cleanup` removes it when it was.
 */
const CASES = {
  "products.insert": {
    run: () =>
      vendor.db
        .from("products")
        .insert({ vendor_id: vendor.id, name: TAG, status: "draft" })
        .select("id"),
    cleanup: () => vendor.db.from("products").delete().eq("name", TAG),
  },
  "rfqs.insert": {
    run: () =>
      vendor.db.from("rfqs").insert({ buyer_id: vendor.id, title: TAG }).select("id"),
    cleanup: () => vendor.db.from("rfqs").delete().eq("title", TAG),
  },
  "advertisements.insert": {
    run: () =>
      vendor.db
        .from("advertisements")
        .insert({ vendor_id: vendor.id, title: TAG, status: "draft" })
        .select("id"),
    cleanup: () => vendor.db.from("advertisements").delete().eq("title", TAG),
  },
  "reviews.insert": {
    run: () =>
      vendor.db
        .from("reviews")
        .insert({ buyer_id: vendor.id, vendor_id: vendor.id, rating: 5, body: TAG })
        .select("id"),
    cleanup: () => vendor.db.from("reviews").delete().eq("body", TAG),
  },
  // MPF-2. A suspended caller is refused 42501 by the function itself; an active
  // one gets a JSON status. "Allowed" means the gate admitted the caller: the
  // status is `logged`, or `rate_limited` / `too_many_calls` when the script is
  // re-run inside the limits' windows (no row is written then; that's the limit
  // working, not the gate). NOT cleaned up, and it cannot be: clients hold no
  // DELETE on `calls` since MPF-2, so each run leaves one call from demo-vendor
  // to demo-buyer's vendor profile with product_context = TAG. Clear those with
  // SQL if a clean demo history is needed: product_context like 'zz-gate-%'.
  "calls via log_call()": {
    run: async () => {
      const { data, error } = await vendor.db.rpc("log_call", { p_vendor_id: CALL_TARGET, p_product_context: TAG });
      return { data: error ? null : [data], error };
    },
    cleanup: async () => {},
  },
};

async function attempt(name) {
  const { data, error } = await CASES[name].run();
  if (!error && (data?.length ?? 0) > 0) {
    await CASES[name].cleanup();
    return { allowed: true, detail: "" };
  }
  return { allowed: false, detail: error ? `${error.code ?? ""} ${error.message}` : "0 rows" };
}

async function setStatus(status) {
  const { error } = await admin.db.rpc("set_account_status", {
    p_profile_id: vendor.id,
    p_new_status: status,
    p_reason_id: null,
    p_source: "admin_manual",
  });
  if (error) throw new Error(`set_account_status(${status}) failed: ${error.message}`);
}

const results = [];
let failures = 0;

/**
 * The ad case needs the vendor to be on a LIVE paid plan.
 *
 * enforce_plan_limits raises P0001 ("Advertising is a paid feature") from a
 * BEFORE trigger, which fires before RLS matters — so with an expired
 * subscription the insert is refused whether the account is suspended or not,
 * and the case proves nothing. The first run of this script hit exactly that:
 * the demo vendor's gold period had lapsed, so "DENY while suspended" was true
 * for entirely the wrong reason. That is precisely the false pass the
 * active/suspended pairing exists to catch.
 *
 * So: read the current period end, push it out far enough to run the case, and
 * put the ORIGINAL value back in the finally block. Never a blanket "set it to
 * a year from now" — that would silently hand a demo account a real plan.
 *
 * The STATUS matters too: get_vendor_plan() needs status = 'active' as well as a
 * future period end. Since the expiry sweep (2026-09-16) marked the demo vendor's
 * lapsed gold subscription 'expired', pushing the date alone left it on free,
 * and the ad case failed active and suspended alike (found 2026-09-23, MPF-2
 * run). The original status is saved and restored exactly like the date.
 */
let originalPeriodEnd = null;
let originalStatus = null;
{
  const { data } = await admin.db
    .from("vendor_subscriptions")
    .select("current_period_end, status")
    .eq("vendor_id", vendor.id)
    .maybeSingle();
  originalPeriodEnd = data?.current_period_end ?? null;
  originalStatus = data?.status ?? null;
  const lapsed = originalPeriodEnd && new Date(originalPeriodEnd) <= new Date();
  if (originalPeriodEnd && (lapsed || originalStatus !== "active")) {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: moved, error } = await admin.db
      .from("vendor_subscriptions")
      .update({ current_period_end: lapsed ? future : originalPeriodEnd, status: "active" })
      .eq("vendor_id", vendor.id)
      .select("vendor_id");
    if (error || (moved?.length ?? 0) !== 1) throw new Error(`could not arm the ad case: ${error?.message ?? "0 rows"}`);
  }
}

try {
  // ── Baseline: everything must be ALLOWED while active ──
  await setStatus("active");
  const before = {};
  for (const name of Object.keys(CASES)) before[name] = await attempt(name);

  // ── MPF-2 invariants, checked while ACTIVE so a refusal can't be the suspension ──
  // Direct writes to `calls` are refused outright (no client grant). The update
  // and delete filter on an id that can't exist, so if the grant ever came back
  // they would still touch nothing.
  const NO_ROW = "00000000-0000-0000-0000-000000000000";
  const directWrites = {
    "calls direct INSERT": () =>
      vendor.db.from("calls").insert({ buyer_id: vendor.id, vendor_id: CALL_TARGET, direction: "outgoing", product_context: TAG }).select("id"),
    "calls direct UPDATE": () => vendor.db.from("calls").update({ product_context: TAG }).eq("id", NO_ROW).select("id"),
    "calls direct DELETE": () => vendor.db.from("calls").delete().eq("id", NO_ROW).select("id"),
  };
  for (const [name, run] of Object.entries(directWrites)) {
    const { error } = await run();
    const ok = error?.code === "42501";
    if (!ok) failures++;
    results.push({
      action: `${name} (active)`,
      active: ok ? "DENY" : "*** ALLOW ***",
      suspended: "n/a",
      verdict: ok ? "PASS" : "*** FAIL ***",
      db_said: (error ? `${error.code} ${error.message}` : "no error").slice(0, 58),
    });
  }
  {
    const { error } = await vendor.db.rpc("log_call", { p_vendor_id: NON_VENDOR, p_product_context: TAG });
    const ok = error?.message === "not_a_vendor";
    if (!ok) failures++;
    results.push({
      action: "log_call() to a profile with no vendor row (active)",
      active: ok ? "DENY" : "*** ALLOW ***",
      suspended: "n/a",
      verdict: ok ? "PASS" : "*** FAIL ***",
      db_said: (error ? `${error.code} ${error.message}` : "no error").slice(0, 58),
    });
  }

  // ── Suspended: the same inserts must now be REFUSED ──
  await setStatus("suspended");
  const after = {};
  for (const name of Object.keys(CASES)) after[name] = await attempt(name);

  for (const name of Object.keys(CASES)) {
    // The gate is proven only by the pair. "Refused while suspended" alone
    // could just mean the insert never worked.
    const ok = before[name].allowed && !after[name].allowed;
    if (!ok) failures++;
    results.push({
      action: name,
      active: before[name].allowed ? "ALLOW" : "DENY",
      suspended: after[name].allowed ? "*** ALLOW ***" : "DENY",
      verdict: ok ? "PASS" : "*** FAIL ***",
      db_said: (after[name].detail || before[name].detail).slice(0, 58),
    });
  }

  // The documented NON-guarantee, asserted so it cannot quietly change: an ad
  // that is already active keeps running. Gating INSERT does not touch it.
  const { data: liveAds } = await admin.db
    .from("advertisements")
    .select("id")
    .eq("vendor_id", vendor.id)
    .eq("status", "active");
  results.push({
    action: "live ads survive suspension (documented limit)",
    active: "n/a",
    suspended: `${liveAds?.length ?? 0} still active`,
    verdict: "INFO",
    db_said: "INSERT gate does not stop a running campaign",
  });
} finally {
  // Always reinstate, even if a case threw. A demo account left suspended by a
  // failed test run is a worse outcome than the failure itself.
  await setStatus("active");
  // And put the billing period and status back EXACTLY as they were, expired or not.
  if (originalPeriodEnd !== null) {
    const { data: restored } = await admin.db
      .from("vendor_subscriptions")
      .update({ current_period_end: originalPeriodEnd, status: originalStatus })
      .eq("vendor_id", vendor.id)
      .select("vendor_id");
    if ((restored?.length ?? 0) !== 1) console.error("!! vendor_subscriptions NOT restored; fix by hand");
  }
  // NOT cleaned up, and it cannot be: account_suspensions has no DELETE policy
  // for any role, on purpose — a ledger a client can erase is not a ledger. So
  // each run of this script leaves two closed rows (one suspend, one reinstate)
  // on the demo vendor's history, and the notifications they generated. That is
  // the correct behaviour of the system under test, not a leak; clear them with
  // service-role SQL if a clean history is needed for a demo.
  await vendor.db.auth.signOut();
  await admin.db.auth.signOut();
}

console.table(results);
console.log(
  failures === 0
    ? "\nPASS - suspension blocks content creation and call logging, and the same writes work when active."
    : `\n${failures} CASE(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
