#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "Are the FAQ snapshots right, and can only the server write them?"
//
// Phase 23 of the My Profile brief (2026-09-24; Phase 9 Q2). The buyer app reads
// faq-snapshots/<surface>.json from the Storage CDN before the faqs table
// (src/lib/queries/faqs.ts); `faqs-snapshot` rebuilds them after every FAQ write and
// hourly (20260924174051_faq_snapshots_cdn_cache.sql). For each surface this checks:
//   1. the ORIGIN file (a cache-busting query goes past the CDN) matches the table's
//      active rows exactly: ids, order, questions, answers, categories, positions;
//   2. the CDN copy (the URL browsers fetch) matches too, or says how old it is:
//      after an edit it may trail by up to about a minute while the Smart CDN
//      invalidation spreads (measured ~47 s), which is by design;
//   3. the headers: 200, application/json, Cache-Control max-age=300;
//   4. the file holds only the public columns (no created_by, nothing inactive).
// Then that clients can't write the bucket: anon, and demo-buyer if its password is
// set, each try to upload a probe file and must be refused. The probe uses its own
// name, so a wrong success can't overwrite a real snapshot; it is reported, and
// must be deleted by hand.
//
// Read-only otherwise. Writes nothing when everything is as it should be.
//   node scripts/faq-snapshot-check.mjs
// ─────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { optionalCredential } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const BUCKET = "faq-snapshots";
const SURFACES = ["buyer_help", "seller_registration", "subscription"];
const MAX_AGE = 300;
const COLUMNS = ["answer", "category_label", "id", "position", "question"];

let failures = 0;
const rows = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail });
};
const note = (name, detail) => rows.push({ check: name, verdict: "note", detail });

const anon = createClient(URL_BASE, ANON, { auth: { persistSession: false } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const surface of SURFACES) {
  const { data: table, error } = await anon.from("faqs")
    .select("id, category_label, question, answer, position")
    .eq("surface", surface).eq("active", true)
    .order("position").order("created_at").order("id");
  if (error) { check(`${surface}: read the table`, false, error.message); continue; }

  const url = `${URL_BASE}/storage/v1/object/public/${BUCKET}/${surface}.json`;
  const origin = await fetch(`${url}?check=${Date.now()}`);
  const originDoc = origin.ok ? await origin.json() : null;
  check(`${surface}: origin file matches the table`, !!originDoc && same(originDoc.rows, table),
    originDoc ? `${originDoc.rows.length} rows vs ${table.length}, generated ${originDoc.generated_at}` : `HTTP ${origin.status}`);

  const cdn = await fetch(url);
  const cdnDoc = cdn.ok ? await cdn.json() : null;
  const cc = cdn.headers.get("cache-control") ?? "";
  check(`${surface}: CDN URL answers 200 JSON, max-age=${MAX_AGE}`,
    cdn.status === 200 && (cdn.headers.get("content-type") ?? "").startsWith("application/json") && cc.includes(`max-age=${MAX_AGE}`),
    `${cdn.status}, ${cdn.headers.get("content-type")}, "${cc}", cf-cache-status ${cdn.headers.get("cf-cache-status")}`);
  if (cdnDoc && same(cdnDoc.rows, table)) {
    check(`${surface}: CDN copy matches the table`, true, `generated ${cdnDoc.generated_at}`);
  } else if (cdnDoc) {
    const ageS = Math.round((Date.now() - Date.parse(cdnDoc.generated_at)) / 1000);
    // An older copy is by design for about a minute after an edit, while the Smart
    // CDN invalidation spreads. Only note it.
    const lagging = originDoc && same(originDoc.rows, table);
    note(`${surface}: CDN copy is behind the table`, `generated ${ageS} s ago. Re-run in a minute${lagging ? "" : " (the origin is behind too)"}`);
  } else {
    check(`${surface}: CDN copy readable`, false, `HTTP ${cdn.status}`);
  }

  if (originDoc) {
    const keys = [...new Set(originDoc.rows.flatMap((r) => Object.keys(r)))].sort();
    check(`${surface}: only public columns`, same(keys, COLUMNS) || originDoc.rows.length === 0, keys.join(","));
    check(`${surface}: version 1, count matches`, originDoc.version === 1 && originDoc.surface === surface && originDoc.count === originDoc.rows.length,
      `version ${originDoc.version}, count ${originDoc.count}`);
  }
}

// Clients can't write the bucket.
const probe = `zz-check-probe-${Date.now()}.json`;
const tryUpload = async (label, client) => {
  const { error } = await client.storage.from(BUCKET).upload(probe, new Blob(['{"probe":true}'], { type: "application/json" }), { upsert: true });
  check(`${label} can't upload to ${BUCKET}`, !!error, error ? `refused: ${error.message}` : `UPLOADED ${probe}: delete it by hand`);
  const over = await client.storage.from(BUCKET).upload("buyer_help.json", new Blob(["{}"], { type: "application/json" }), { upsert: true });
  check(`${label} can't overwrite buyer_help.json`, !!over.error, over.error ? `refused: ${over.error.message}` : "OVERWROTE buyer_help.json: rebuild it with the cron job");
};
await tryUpload("anon", anon);
const buyerPw = optionalCredential("DEMO_BUYER_PASSWORD");
if (buyerPw) {
  const buyer = createClient(URL_BASE, ANON, { auth: { persistSession: false } });
  const { error } = await buyer.auth.signInWithPassword({ email: "demo-buyer@cosora.dev", password: buyerPw });
  if (error) check("demo-buyer signs in", false, error.message);
  else await tryUpload("demo-buyer (signed in)", buyer);
} else {
  note("demo-buyer upload check", "skipped: DEMO_BUYER_PASSWORD not set");
}

console.table(rows);
console.log(failures === 0 ? "\nFAQ SNAPSHOTS OK" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
