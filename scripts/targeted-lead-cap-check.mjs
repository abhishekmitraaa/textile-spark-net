/**
 * Targeted requests vs the lead cap — live check (Master Prompt 12, Part A).
 *
 * Decision (Andy, 2026-09-22): a quote on a request addressed DIRECTLY to the
 * vendor is never gated by the lead cap, even when the vendor has used every
 * open-marketplace lead. The open-marketplace side stays capped.
 *
 * Real HTTP sign-ins (real JWTs, real RLS, the real trigger), two accounts:
 *   buyer  — creates the targeted request(s), as a buyer would;
 *   vendor — is topped up to its open-marketplace cap, then quotes.
 *
 * Steps:
 *   1. vendor's own dashboard number (get_vendor_plan().usage.leads_used / cap);
 *   2. top the vendor up to the cap on open [LOADTEST] RFQs (never a real
 *      buyer's RFQ — a real inbox must not receive a test quote);
 *   3. buyer creates an ACTIVE request targeted at the vendor (or --rfq=<id>
 *      reuses one), vendor quotes it          -> must be ACCEPTED after the fix;
 *   4. vendor tries one more open RFQ          -> must be REFUSED (cap holds);
 *   5. with --closed: buyer creates a second targeted request and CLOSES it.
 *      The vendor's own RLS-bound read of that RFQ returns 0 rows — which is
 *      why the trigger cannot look the target up itself — and the quote must
 *      still be ACCEPTED.
 *
 * Every row written is tagged [LOADTEST] and belongs to a loadtest account.
 *
 * Run:  node scripts/targeted-lead-cap-check.mjs [--rfq=<id>] [--closed]
 *       [--vendor=loadtest-vendor-3] [--buyer=loadtest-buyer-1]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { credential } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const flag = (k) => process.argv.includes(`--${k}`);
const VENDOR = `${arg("vendor") ?? "loadtest-vendor-3"}@cosora.test`;
const BUYER = `${arg("buyer") ?? "loadtest-buyer-1"}@cosora.test`;
const PASSWORD = credential("LOADTEST_PASSWORD");
const TAG = "[LOADTEST] targeted lead-cap check (Master Prompt 12)";

async function signIn(email) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { c, id: data.user.id };
}
const vendor = await signIn(VENDOR);
const buyer = await signIn(BUYER);

async function dashboard() {
  const { data, error } = await vendor.c.rpc("get_vendor_plan", { v: vendor.id });
  if (error) throw new Error(`get_vendor_plan failed: ${error.message}`);
  return { used: data.usage.leads_used, cap: data.limits.leads_per_month, plan: data.effective_plan_id };
}
async function quote(rfqId, label) {
  const { data, error } = await vendor.c.from("quotes").insert({
    rfq_id: rfqId, vendor_id: vendor.id, price_per_unit: 199, moq: 100, lead_time: "14 days", comment: TAG,
  }).select("id");
  const out = error ? `REFUSED — ${error.code} ${error.message}` : `ACCEPTED — quote ${data[0].id}`;
  console.log(`${label.padEnd(30)}: ${out}`);
  return !error;
}
async function openUnquoted(n) {
  const { data: mine } = await vendor.c.from("quotes").select("rfq_id").eq("vendor_id", vendor.id);
  const done = new Set((mine ?? []).map((q) => q.rfq_id));
  const { data: open, error } = await vendor.c.from("rfqs").select("id")
    .is("vendor_id", null).eq("status", "active").like("title", "[LOADTEST]%")
    .order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error(`open RFQ read failed: ${error.message}`);
  return open.map((r) => r.id).filter((id) => !done.has(id)).slice(0, n);
}
async function targetedRfq(title) {
  const { data, error } = await buyer.c.from("rfqs").insert({
    buyer_id: buyer.id, vendor_id: vendor.id, title, quantity: 100,
    description: TAG,
  }).select("id");
  if (error) throw new Error(`targeted RFQ insert failed: ${error.message}`);
  return data[0].id;
}

console.log(`vendor ${VENDOR} (${vendor.id})`);
console.log(`buyer  ${BUYER} (${buyer.id})`);
let d = await dashboard();
console.log(`${"1 dashboard".padEnd(30)}: plan=${d.plan} leads_used=${d.used} / cap=${d.cap}`);

// 2. Top up to the cap on open [LOADTEST] RFQs.
if (d.cap >= 0 && d.used < d.cap) {
  for (const id of await openUnquoted(d.cap - d.used)) await quote(id, `2 top-up open RFQ ${id.slice(0, 8)}`);
  d = await dashboard();
}
console.log(`${"2 dashboard at cap?".padEnd(30)}: leads_used=${d.used} / cap=${d.cap}${d.used >= d.cap ? "  (AT CAP)" : "  (NOT at cap)"}`);

// 3. Targeted, active.
const tRfq = arg("rfq") ?? await targetedRfq("[LOADTEST] Direct: targeted lead-cap check (active)");
console.log(`${"3 targeted RFQ (active)".padEnd(30)}: ${tRfq}${arg("rfq") ? " (reused)" : " (created by buyer)"}`);
await quote(tRfq, "3 quote on targeted RFQ");

// 4. Open marketplace at the same moment.
const [nextOpen] = await openUnquoted(1);
if (nextOpen) await quote(nextOpen, `4 quote on open RFQ ${nextOpen.slice(0, 8)}`);

// 5. Targeted, then closed by the buyer.
if (flag("closed")) {
  const cRfq = await targetedRfq("[LOADTEST] Direct: targeted lead-cap check (closed)");
  const { error: closeErr } = await buyer.c.from("rfqs").update({ status: "closed" }).eq("id", cRfq);
  if (closeErr) throw new Error(`buyer could not close RFQ: ${closeErr.message}`);
  const { data: seen } = await vendor.c.from("rfqs").select("vendor_id").eq("id", cRfq);
  console.log(`${"5 targeted RFQ, then closed".padEnd(30)}: ${cRfq}`);
  console.log(`${"5 vendor's own RLS read of it".padEnd(30)}: ${seen?.length ?? 0} row(s) — a lookup inside the invoker trigger sees this`);
  await quote(cRfq, "5 quote on closed targeted RFQ");
}

d = await dashboard();
console.log(`${"6 dashboard after".padEnd(30)}: leads_used=${d.used} / cap=${d.cap}`);
await vendor.c.auth.signOut();
await buyer.c.auth.signOut();
