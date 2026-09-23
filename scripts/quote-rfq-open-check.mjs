/**
 * Only an RFQ that is open to THIS vendor accepts their quote — live check
 * (Master Prompt 12, decided 2026-09-23: "closed RFQs should not receive any quotes").
 *
 * Real HTTP sign-ins. The buyer creates four [LOADTEST] requests, then vendor A
 * quotes each one:
 *   R1  open marketplace, active                 -> ACCEPTED   (control)
 *   R1  same request, re-submitted after the buyer closes it (the app's upsert)
 *                                                -> REFUSED    (a closed RFQ takes no quotes, edits included)
 *   R2  open marketplace, closed by the buyer    -> REFUSED
 *   R3  addressed to vendor A, closed by buyer   -> REFUSED
 *   R4  addressed to vendor B, active            -> REFUSED    (not A's to answer; A cannot
 *                                                               even list it, the id stands in
 *                                                               for a guessed one)
 *   R5  addressed to vendor A, active            -> ACCEPTED   (control)
 * Before the fix every one of these is ACCEPTED except where the lead cap says
 * otherwise, so run it on a vendor with lead headroom.
 *
 * Every row is tagged [LOADTEST] and belongs to loadtest accounts.
 *
 * Run:  node scripts/quote-rfq-open-check.mjs [--vendor=loadtest-vendor-56]
 *       [--other=loadtest-vendor-57] [--buyer=loadtest-buyer-1]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { credential } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const PASSWORD = credential("LOADTEST_PASSWORD");
const TAG = "[LOADTEST] quote-on-open-RFQ check (Master Prompt 12)";

async function signIn(name) {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${name}@cosora.test`, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${name}: ${error.message}`);
  return { c, id: data.user.id, name };
}
const vendor = await signIn(arg("vendor", "loadtest-vendor-56"));
const other = await signIn(arg("other", "loadtest-vendor-57"));
const buyer = await signIn(arg("buyer", "loadtest-buyer-1"));

async function rfq(label, target, close) {
  const { data, error } = await buyer.c.from("rfqs").insert({
    buyer_id: buyer.id, vendor_id: target?.id ?? null, quantity: 100, description: TAG,
    title: `[LOADTEST] ${label}`,
  }).select("id");
  if (error) throw new Error(`rfq insert failed: ${error.message}`);
  if (close) await closeRfq(data[0].id);
  return data[0].id;
}
async function closeRfq(id) {
  const { error } = await buyer.c.from("rfqs").update({ status: "closed" }).eq("id", id);
  if (error) throw new Error(`buyer could not close ${id}: ${error.message}`);
}
// The app's own write: submitQuote() in src/lib/queries/rfqs.ts is an upsert on (rfq_id, vendor_id).
async function quote(label, rfqId, expect) {
  const { error } = await vendor.c.from("quotes").upsert(
    { rfq_id: rfqId, vendor_id: vendor.id, price_per_unit: 199, moq: 100, lead_time: "14 days", comment: TAG, status: "pending" },
    { onConflict: "rfq_id,vendor_id" },
  );
  const got = error ? "REFUSED" : "ACCEPTED";
  console.log(`${label.padEnd(44)}: ${got.padEnd(8)} ${error ? `${error.code} ${error.message}` : ""}  [expected ${expect}${got === expect ? "" : " — MISMATCH"}]`);
  return got === expect;
}

const plan = (await vendor.c.rpc("get_vendor_plan", { v: vendor.id })).data;
console.log(`vendor ${vendor.name} (${vendor.id}) leads ${plan.usage.leads_used}/${plan.limits.leads_per_month}; other ${other.name}; buyer ${buyer.name}`);

const r1 = await rfq("open-RFQ check R1 (open, active)", null, false);
const r2 = await rfq("open-RFQ check R2 (open, closed)", null, true);
const r3 = await rfq("open-RFQ check R3 (to vendor, closed)", vendor, true);
const r4 = await rfq("open-RFQ check R4 (to other vendor)", other, false);
const r5 = await rfq("open-RFQ check R5 (to vendor, active)", vendor, false);

const results = [
  await quote("R1 open marketplace, active", r1, "ACCEPTED"),
  await quote("R5 addressed to this vendor, active", r5, "ACCEPTED"),
  await quote("R2 open marketplace, closed", r2, "REFUSED"),
  await quote("R3 addressed to this vendor, closed", r3, "REFUSED"),
  await quote("R4 addressed to a different vendor", r4, "REFUSED"),
];
await closeRfq(r1);
results.push(await quote("R1 re-submitted after the buyer closed it", r1, "REFUSED"));

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} as expected   (R1 ${r1.slice(0, 8)} R2 ${r2.slice(0, 8)} R3 ${r3.slice(0, 8)} R4 ${r4.slice(0, 8)} R5 ${r5.slice(0, 8)})`);
process.exitCode = pass === results.length ? 0 : 1;
for (const s of [vendor, other, buyer]) await s.c.auth.signOut();
