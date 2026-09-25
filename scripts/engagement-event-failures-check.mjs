#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "Does a refused analytics event leave a trace now?" (MPF-23, 2026-09-25)
//
// Migration 20260925173423: log_engagement_event() records failures it used to
// swallow in admin.engagement_event_failures, read by admin_engagement_event_failures()
// (super_admin, vendor_ops) on Cosora-Admin's System Health page. Over real HTTP:
//   1. signed out, an event with a source outside the CHECK list: the call still
//      succeeds (a page view never breaks), and the failure is counted, with this
//      run's marker as its last source;
//   2. signed out, a click for a vendor id that doesn't exist: quiet, not counted;
//   3. demo-admin can read the failures; demo-buyer and anon cannot.
// Neither call writes an engagement event.
//
// LEAVES ONE MARKED FAILURE ROW (or +1 on this hour's row): clients can't delete
// from admin.*. Remove it with SQL afterwards:
//   delete from admin.engagement_event_failures where last_source like 'zz_check_%';
//   node scripts/engagement-event-failures-check.mjs
// ─────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { demoPasswordFor } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
async function signIn(email) {
  const db = client();
  const { error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return db;
}

const anon = client();
const admin = await signIn("demo-admin@cosora.dev");
const buyer = await signIn("demo-buyer@cosora.dev");
const MARK = `zz_check_${Date.now()}`;

let failures = 0;
const rows = [];
const check = (name, ok, detail) => { if (!ok) failures++; rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail }); };
const sourceRows = async () => {
  const { data, error } = await admin.rpc("admin_engagement_event_failures", { p_days: 1 });
  if (error) throw new Error(`admin_engagement_event_failures: ${error.message}`);
  return data;
};
const total = (list) => list.reduce((n, r) => n + r.count, 0);

const { data: live } = await anon.from("products").select("id").eq("status", "live").limit(1);
const productId = live?.[0]?.id;
if (!productId) throw new Error("no live product to test with");

const before = await sourceRows();
const bad = await anon.rpc("log_engagement_event", { p_event_type: "product_view", p_product_id: productId, p_source: MARK });
check("signed out, bad source: the call still succeeds", !bad.error, bad.error ? bad.error.message : "no error");
const after = await sourceRows();
const mine = after.find((r) => r.last_source === MARK);
check("…and the failure is recorded", total(after) === total(before) + 1 && mine?.constraint_name === "engagement_events_source_check",
  mine ? `${mine.error_code} ${mine.constraint_name}, count ${mine.count}` : `count ${total(before)} → ${total(after)}`);

const junk = await anon.rpc("log_engagement_event", {
  p_event_type: "cta_click", p_vendor_id: randomUUID(), p_source: "direct", p_cta_name: MARK,
});
const afterJunk = await sourceRows();
check("signed out, unknown vendor id: quiet", !junk.error && total(afterJunk) === total(after),
  `call ${junk.error ? junk.error.code : "ok"}, count ${total(after)} → ${total(afterJunk)}`);

const asBuyer = await buyer.rpc("admin_engagement_event_failures", { p_days: 1 });
check("demo-buyer can't read the failures", asBuyer.error?.code === "42501", asBuyer.error?.code ?? "READ");
const asAnon = await anon.rpc("admin_engagement_event_failures", { p_days: 1 });
check("anon can't read the failures", Boolean(asAnon.error), asAnon.error?.code ?? "READ");

console.table(rows);
console.log(failures === 0 ? `\nREFUSED EVENTS ARE RECORDED (marker ${MARK}; remove it with the SQL above)` : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
