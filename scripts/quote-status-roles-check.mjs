#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "Who may change a quote's status, and who its terms?" (MPF-18, 2026-09-25)
//
// Migration 20260925173024 added trg_quotes_update_roles. Over real HTTP, as the
// real accounts, this checks on one of demo-vendor's quotes on a demo-buyer RFQ:
//   demo-vendor (wrote the quote)   may not set accepted / shortlisted / rejected;
//                                   may change its price; doing so on a quote the
//                                   buyer had accepted puts it back to pending;
//   demo-buyer (owns the request)   may shortlist and accept; may not change the
//                                   price, the comment, or the vendor.
//
// MUTATING, SELF-RESTORING: the quote's status, price and comment are read first
// and put back at the end (as the vendor for the price, as the buyer for the
// status), and the script fails if the final row differs. Neither account is an
// admin, so nothing reaches the Admin Log.
//   node scripts/quote-status-roles-check.mjs
// ─────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { demoPasswordFor } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const VENDOR = "22222222-2222-2222-2222-222222222222";

async function signIn(email) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, uid: data.user.id };
}

const buyer = await signIn("demo-buyer@cosora.dev");
const vendor = await signIn("demo-vendor@cosora.dev");

// A quote demo-vendor wrote on one of demo-buyer's requests.
const { data: rfqs } = await buyer.db.from("rfqs").select("id").eq("buyer_id", buyer.uid);
const { data: quotes, error: qErr } = await buyer.db.from("quotes")
  .select("id, status, price_per_unit, comment").eq("vendor_id", VENDOR)
  .in("rfq_id", (rfqs ?? []).map((r) => r.id)).order("created_at").limit(1);
if (qErr || !quotes?.length) throw new Error(`no demo-vendor quote on a demo-buyer RFQ: ${qErr?.message ?? "none found"}`);
const start = quotes[0];
const Q = start.id;

let failures = 0;
const rows = [];
const read = async () => (await buyer.db.from("quotes").select("status, price_per_unit, comment").eq("id", Q).single()).data;
async function step(who, label, patch, expect) {
  const db = who === "vendor" ? vendor.db : buyer.db;
  const { data, error } = await db.from("quotes").update(patch).eq("id", Q).select("status");
  const got = error ? error.code : `ok (${data.length} row${data.length === 1 ? "" : "s"}, now ${data[0]?.status})`;
  const ok = expect === "refused" ? error?.code === "42501" : !error && data.length === 1 && (expect === "ok" || data[0].status === expect);
  if (!ok) failures++;
  rows.push({ caller: who, attempt: label, result: got, verdict: ok ? "PASS" : `*** FAIL (want ${expect}) ***` });
}

await step("vendor", "set accepted", { status: "accepted" }, "refused");
await step("vendor", "set shortlisted", { status: "shortlisted" }, "refused");
await step("vendor", "set rejected", { status: "rejected" }, "refused");
await step("buyer", "change the price", { price_per_unit: 1 }, "refused");
await step("buyer", "change the comment", { comment: "buyer edit" }, "refused");
await step("buyer", "change the vendor", { vendor_id: buyer.uid }, "refused");
await step("buyer", "shortlist", { status: "shortlisted" }, "shortlisted");
await step("buyer", "accept", { status: "accepted" }, "accepted");
await step("vendor", "raise the price of the accepted quote", { price_per_unit: Number(start.price_per_unit) + 1 }, "pending");

// Put it back: the price as the vendor, the status as the buyer.
await step("vendor", "restore the price", { price_per_unit: start.price_per_unit }, "ok");
if ((await read())?.status !== start.status) await step("buyer", `restore the status (${start.status})`, { status: start.status }, start.status);
const end = await read();
const restored = end && end.status === start.status && Number(end.price_per_unit) === Number(start.price_per_unit) && end.comment === start.comment;
if (!restored) failures++;
rows.push({ caller: "-", attempt: "quote as it started", result: JSON.stringify(end), verdict: restored ? "PASS" : "*** NOT RESTORED ***" });

console.table(rows);
console.log(failures === 0 ? "\nQUOTE ROLES AS EXPECTED (buyer decides, vendor sets terms)" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
