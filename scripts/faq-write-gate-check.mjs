#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "Who passes each admin_faq_* gate?" Read-only: it writes nothing.
//
// Phase 22 of the My Profile brief (2026-09-24, Phase 9 Q3): support now writes
// FAQs as well as reading them. Each role calls all five RPCs with arguments that
// pass the gate but can't change a row:
//   admin_faq_list     → rows                            (admitted)
//   admin_faq_add      → 22023, unknown surface "zz_p22" (admitted: the gate ran first)
//   admin_faq_update   → [] for a uuid that doesn't exist (admitted)
//   admin_faq_delete   → [] for a uuid that doesn't exist (admitted)
//   admin_faq_reorder  → [] for a uuid that doesn't exist (admitted)
// A refused caller gets 42501 from every one.
//
// Expected since 20260924170736: support and super_admin pass all five;
// product_moderator, a non-admin and anon are refused all five. Before it, support
// passed only admin_faq_list.
//
// ACCOUNTS: demo-admin, demo-buyer, and the run-only fixtures rlstest-support and
// rlstest-productmod (cosora-admin/scripts/seed-test-admins.sql; drop them after
// with drop-test-admins.sql). Without FIXTURE_PASSWORD those two rows are skipped.
//
//   node scripts/faq-write-gate-check.mjs [--expect-before]
// ─────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { demoPasswordFor, optionalCredential } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BEFORE = process.argv.includes("--expect-before");
const NOPE = "00000000-0000-0000-0000-000000000022"; // no FAQ has this id
const WRITES = ["admin_faq_add", "admin_faq_update", "admin_faq_delete", "admin_faq_reorder"];
const CALLS = [
  ["admin_faq_list", {}],
  ["admin_faq_add", { p_surface: "zz_p22", p_category_label: "", p_question: "x", p_answer: "y" }],
  ["admin_faq_update", { p_id: NOPE, p_question: "x" }],
  ["admin_faq_delete", { p_id: NOPE }],
  ["admin_faq_reorder", { p_id: NOPE, p_position: 1 }],
];

const fixturePw = optionalCredential("FIXTURE_PASSWORD");
const ROLES = [
  { who: "super_admin (demo-admin)", email: "demo-admin@cosora.dev", pw: () => demoPasswordFor("demo-admin@cosora.dev"), admitted: () => true },
  { who: "support (rlstest-support)", email: "rlstest-support@cosora.test", pw: () => fixturePw, admitted: (fn) => !BEFORE || !WRITES.includes(fn) },
  { who: "product_moderator (rlstest-productmod)", email: "rlstest-productmod@cosora.test", pw: () => fixturePw, admitted: () => false },
  { who: "non-admin (demo-buyer)", email: "demo-buyer@cosora.dev", pw: () => demoPasswordFor("demo-buyer@cosora.dev"), admitted: () => false },
  { who: "anon", email: null, admitted: () => false },
];

let failures = 0;
const rows = [];
for (const r of ROLES) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  if (r.email) {
    const pw = r.pw();
    if (!pw) { rows.push({ caller: r.who, verdict: "SKIPPED (FIXTURE_PASSWORD not set)" }); continue; }
    const { error } = await db.auth.signInWithPassword({ email: r.email, password: pw });
    if (error) { failures++; rows.push({ caller: r.who, verdict: `*** login failed: ${error.message}` }); continue; }
  }
  const got = {};
  let ok = true;
  for (const [fn, args] of CALLS) {
    const { data, error } = await db.rpc(fn, args);
    // Admitted = the gate let the call through: success, or the function's own
    // "unknown surface" check (22023), which runs after the gate.
    const admitted = !error || error.code === "22023";
    const outcome = !error ? `ok (${Array.isArray(data) ? data.length : 0} rows)` : error.code;
    if (admitted !== r.admitted(fn)) ok = false;
    // A write that got through must have written nothing.
    if (fn !== "admin_faq_list" && !error && Array.isArray(data) && data.length) ok = false;
    got[fn.replace("admin_faq_", "")] = outcome;
  }
  if (!ok) failures++;
  rows.push({ caller: r.who, ...got, verdict: ok ? "PASS" : "*** FAIL ***" });
  if (r.email) await db.auth.signOut();
}

console.table(rows);
console.log(failures === 0
  ? `\nFAQ GATES AS EXPECTED (${BEFORE ? "before Phase 22: support reads only" : "support and super_admin write; everyone else refused"})`
  : `\n${failures} CALLER(S) NOT AS EXPECTED`);
process.exit(failures === 0 ? 0 : 1);
