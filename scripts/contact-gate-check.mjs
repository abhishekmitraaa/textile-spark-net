/**
 * callGate() / useContactGate() — the reason code for every state, checked
 * against the real database.
 *
 * callGate() is CLIENT-SIDE logic over server-owned data, and it has to be:
 * placing a call is a `tel:` URL, not a write, so there is no policy that can
 * enforce it. That makes it exactly the kind of rule that rots silently — the
 * data can change shape underneath it and nothing fails. Hence this.
 *
 * The four states, and the ORDER they resolve in (caller before target before
 * conversation) are the contract:
 *
 *   caller_suspended  — my account is suspended
 *   target_suspended  — theirs is
 *   under_review      — our thread is locked
 *   null              — go ahead
 *
 * Ordering matters and is asserted: when BOTH accounts are suspended the answer
 * must be `caller_suspended`, because "your account is suspended, contact
 * support" is actionable and "this account is currently suspended" is not.
 *
 * This reimplements callGate's queries rather than importing it — the module is
 * TSX-adjacent and pulls in React. Keeping the two in step is the point of the
 * comment block above each case; if callGate changes, this must change with it.
 *
 * Run: node scripts/contact-gate-check.mjs
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

const BUYER = { email: "demo-buyer@cosora.dev", password: "cosora123" };
const VENDOR = { email: "demo-vendor@cosora.dev", password: "cosora123" };
const ADMIN = { email: "demo-admin@cosora.dev", password: "cosora123" };

function client() {
  return createClient(URL_, ANON, { auth: { persistSession: false } });
}

async function signIn({ email, password }) {
  const db = client();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, id: data.user.id };
}

/** A faithful port of callGate() from src/lib/queries/calls.ts. */
async function callGate(db, meId, otherId) {
  const ids = meId && meId !== otherId ? [meId, otherId] : [otherId];
  const { data: rows } = await db.from("profiles").select("id, account_status").in("id", ids);
  const statusOf = (id) => rows?.find((r) => r.id === id)?.account_status ?? "active";

  if (meId && statusOf(meId) === "suspended") return "caller_suspended";
  if (statusOf(otherId) === "suspended") return "target_suspended";

  if (meId) {
    const [a, b] = [meId, otherId].sort();
    const { data: conv } = await db
      .from("conversations")
      .select("status")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (conv?.status === "under_review") return "under_review";
  }
  return null;
}

const buyer = await signIn(BUYER);
const vendor = await signIn(VENDOR);
const admin = await signIn(ADMIN);

async function setStatus(id, status) {
  const { error } = await admin.db.rpc("set_account_status", {
    p_profile_id: id,
    p_new_status: status,
    p_reason_id: null,
    p_source: "admin_manual",
  });
  if (error) throw new Error(`set_account_status failed: ${error.message}`);
}

async function setConversation(status) {
  const [a, b] = [buyer.id, vendor.id].sort();
  // As the BUYER, not the admin. conversations_insert/_update are
  // participants-only — an admin can SELECT the row (there is an admin clause)
  // but cannot create or touch one, which is the whole reason
  // resolve_conversation_review() has to exist. Upserting as the admin returned
  // null here and took the script down.
  const { data, error } = await buyer.db
    .from("conversations")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not open the test conversation: ${error?.message}`);
  if (status === "under_review") {
    // The only client-reachable way to lock a thread. A direct UPDATE is
    // refused by enforce_conversation_status() even for an admin.
    await buyer.db.rpc("submit_report", {
      p_conversation_id: data.id,
      p_message_id: null,
      p_reported_reason: "zz-contact-gate-check",
    });
  } else {
    const { data: pending } = await admin.db
      .from("conversation_reviews")
      .select("id")
      .eq("conversation_id", data.id)
      .eq("status", "pending");
    for (const r of pending ?? []) {
      await admin.db.rpc("resolve_conversation_review", {
        p_review_id: r.id,
        p_verdict: "resumed",
        p_resume: true,
      });
    }
  }
  return data.id;
}

const results = [];
let failures = 0;

function check(name, expected, actual) {
  const ok = expected === actual;
  if (!ok) failures++;
  results.push({
    state: name,
    expected: String(expected),
    actual: String(actual),
    verdict: ok ? "PASS" : "*** FAIL ***",
  });
}

let convId = null;

try {
  // ── none: both active, thread active ──
  await setStatus(buyer.id, "active");
  await setStatus(vendor.id, "active");
  convId = await setConversation("active");
  check("none (both active)", null, await callGate(buyer.db, buyer.id, vendor.id));

  // ── under_review: nothing suspended, thread locked ──
  await setConversation("under_review");
  check("conversation under_review", "under_review", await callGate(buyer.db, buyer.id, vendor.id));
  // Both directions: the vendor is just as blocked as the buyer.
  check("under_review, other direction", "under_review", await callGate(vendor.db, vendor.id, buyer.id));
  await setConversation("active");

  // ── target_suspended ──
  await setStatus(vendor.id, "suspended");
  check("target suspended", "target_suspended", await callGate(buyer.db, buyer.id, vendor.id));

  // ── caller_suspended, and it WINS over target_suspended ──
  await setStatus(buyer.id, "suspended");
  check(
    "both suspended -> caller wins (actionable copy)",
    "caller_suspended",
    await callGate(buyer.db, buyer.id, vendor.id),
  );

  await setStatus(vendor.id, "active");
  check("caller suspended only", "caller_suspended", await callGate(buyer.db, buyer.id, vendor.id));

  // ── suspension outranks the thread lock ──
  await setStatus(buyer.id, "active");
  await setConversation("under_review");
  await setStatus(vendor.id, "suspended");
  check(
    "suspended target outranks a locked thread",
    "target_suspended",
    await callGate(buyer.db, buyer.id, vendor.id),
  );
} finally {
  await setStatus(buyer.id, "active");
  await setStatus(vendor.id, "active");
  await setConversation("active");
  await buyer.db.auth.signOut();
  await vendor.db.auth.signOut();
  await admin.db.auth.signOut();
}

// ── R-18: what a SIGNED-OUT visitor can reach ────────────────────────────────
//
// Checked against actual current behaviour, not assumed.
//
// In the UI it holds. VendorProfile.tsx branches on `!user` FIRST and renders a
// sign-in prompt, and the Website Address row in the "Detailed information"
// card is gated on `contactVisible`, which is `Boolean(user) && ...`. Neither
// consults callGate for a signed-out visitor, so no phone, email, address or
// website is painted. That is a UI fact and it is intact.
//
// It is NOT a data fact, and the difference is worth stating plainly:
// `vprofiles_select` is `USING (true)`, so the anon key can read
// vendor_profiles.phone straight from PostgREST. The check below records that
// rather than asserting it away — closing it means column-level restriction or
// a view, which is a marketplace-visibility decision, not a bug fix.
{
  const anon = client();
  const { data } = await anon
    .from("vendor_profiles")
    .select("brand_name, phone")
    .not("phone", "is", null)
    .limit(1);
  const reachable = (data?.length ?? 0) > 0;
  results.push({
    state: "R-18 — anon can read vendor_profiles.phone via PostgREST",
    expected: "documented gap",
    actual: reachable ? "YES — readable" : "no rows with a phone",
    verdict: "INFO",
  });
}

console.table(results);
console.log(
  failures === 0
    ? "\nPASS - callGate returns the right reason for every state, in the right order."
    : `\n${failures} STATE(S) WRONG`,
);
console.log(
  "NOTE: the R-18 row is INFO, not a failure. The UI gate holds; the underlying\n" +
    "column is world-readable because vprofiles_select is USING (true).",
);
process.exit(failures === 0 ? 0 : 1);
