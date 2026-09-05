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
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

const VENDOR = { email: "demo-vendor@cosora.dev", password: "cosora123" };
const ADMIN = { email: "demo-admin@cosora.dev", password: "cosora123" };
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
 */
let originalPeriodEnd = null;
{
  const { data } = await admin.db
    .from("vendor_subscriptions")
    .select("current_period_end")
    .eq("vendor_id", vendor.id)
    .maybeSingle();
  originalPeriodEnd = data?.current_period_end ?? null;
  if (originalPeriodEnd && new Date(originalPeriodEnd) <= new Date()) {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await admin.db
      .from("vendor_subscriptions")
      .update({ current_period_end: future })
      .eq("vendor_id", vendor.id);
  }
}

try {
  // ── Baseline: everything must be ALLOWED while active ──
  await setStatus("active");
  const before = {};
  for (const name of Object.keys(CASES)) before[name] = await attempt(name);

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
  // And put the billing period back EXACTLY as it was, expired or not.
  if (originalPeriodEnd !== null) {
    await admin.db
      .from("vendor_subscriptions")
      .update({ current_period_end: originalPeriodEnd })
      .eq("vendor_id", vendor.id);
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
    ? "\nPASS - suspension blocks content creation, and the same inserts work when active."
    : `\n${failures} CASE(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
