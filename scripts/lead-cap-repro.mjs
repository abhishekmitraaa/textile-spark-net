/**
 * Lead-cap display/enforcement mismatch — live reproduction (Master Prompt 11, Part 1).
 *
 * Signs in as a real synthetic vendor over HTTP (real JWT, real RLS, real
 * trigger) and:
 *   1. reads the vendor's own dashboard number, get_vendor_plan().usage.leads_used;
 *   2. tries to submit a quote on an open-marketplace RFQ it has not quoted.
 *
 * Before the fix: dashboard says 7/10, insert is refused with
 * "Monthly lead limit reached … you have already quoted 171", because
 * enforce_lead_cap() counted targeted replies that get_vendor_plan() excludes.
 * After the fix: the insert succeeds, and the counts agree.
 *
 * The quote it writes is tagged [LOADTEST] and belongs to a loadtest vendor, so
 * it is covered by the synthetic-data cleanup script.
 *
 * Run:  LOADTEST_PASSWORD=... node scripts/lead-cap-repro.mjs [vendorEmail] [rfqId]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const EMAIL = process.argv[2] || "loadtest-vendor-3@cosora.test";
const RFQ = process.argv[3] || "f59c6317-cd21-463f-9df9-b57674779f5b";
const PASSWORD = process.env.LOADTEST_PASSWORD;
if (!PASSWORD) throw new Error("LOADTEST_PASSWORD is not set");

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) throw new Error(`sign-in failed for ${EMAIL}: ${authErr.message}`);
const vendorId = auth.user.id;

const { data: plan, error: planErr } = await db.rpc("get_vendor_plan", { v: vendorId });
if (planErr) throw new Error(`get_vendor_plan failed: ${planErr.message}`);
console.log(`vendor     : ${EMAIL} (${vendorId})`);
console.log(`dashboard  : plan=${plan.effective_plan_id} leads_used=${plan.usage.leads_used} / cap=${plan.limits.leads_per_month}`);

const { data: ins, error: insErr } = await db.from("quotes").insert({
  rfq_id: RFQ, vendor_id: vendorId, price_per_unit: 199, moq: 100, lead_time: "14 days",
  comment: "[LOADTEST] lead-cap repro (Master Prompt 11)",
}).select("id, created_at");

if (insErr) {
  console.log(`quote      : REFUSED — ${insErr.code} ${insErr.message}`);
} else {
  console.log(`quote      : ACCEPTED — id ${ins[0].id} at ${ins[0].created_at}`);
  const { data: after } = await db.rpc("get_vendor_plan", { v: vendorId });
  console.log(`dashboard  : leads_used after insert = ${after.usage.leads_used}`);
}
await db.auth.signOut();
