#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "How long after an FAQ edit does every visitor get the new file?"
//
// Phase 23 of the My Profile brief (2026-09-24; Phase 9 Q2). The FAQ pages read
// faq-snapshots/<surface>.json from the Storage CDN. Storage answers with
// `x-smart-cdn: true` on this project: the edge keeps a copy until the object
// changes, and an overwrite invalidates it (Supabase: up to 60 s to propagate).
// So the delay a visitor sees is that propagation, not the files' max-age.
//
// Each trial makes a CONTENT-NEUTRAL admin edit: demo-admin calls
// admin_faq_update on the first Subscription FAQ with p_active set to the value it
// already has. Only updated_at changes, so no visitor sees a difference, but it is
// a real admin write: trg_faqs_snapshot fires and all three files are rebuilt with
// a new generated_at. The script then measures:
//   origin   when a cache-busting request first sees the new generated_at;
//   first    when the plain URL (what browsers fetch) first serves it;
//   all      after the last time ANY request still got the old one. Every 2 s it
//            fetches all three files in three request styles (plain gzip; a
//            browser's CORS request from the app with br and max-age=0; identity).
//            Done when 5 rounds in a row are all new.
// Anonymous reads only, apart from the one no-op update per trial.
//
//   node scripts/faq-cdn-propagation.mjs [trials=3]
// ─────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { demoAccount } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const TRIALS = Number(process.argv[2] ?? 3);
const SURFACES = ["buyer_help", "seller_registration", "subscription"];
const STYLES = {
  plain: { "Accept-Encoding": "gzip" },
  browser: { Origin: "http://localhost:8080", "Accept-Encoding": "gzip, deflate, br, zstd", "Cache-Control": "max-age=0" },
  identity: { "Accept-Encoding": "identity" },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (s) => `${URL_BASE}/storage/v1/object/public/faq-snapshots/${s}.json`;

async function read(surface, headers, bust = false) {
  const res = await fetch(bust ? `${fileUrl(surface)}?probe=${Date.now()}${Math.random()}` : fileUrl(surface), { headers });
  const doc = await res.json();
  return { gen: doc.generated_at, status: res.headers.get("cf-cache-status"), smart: res.headers.get("x-smart-cdn") };
}

const admin = createClient(URL_BASE, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const acct = demoAccount("admin");
const { error: loginError } = await admin.auth.signInWithPassword(acct);
if (loginError) throw new Error(`demo-admin login: ${loginError.message}`);
const { data: list, error: listError } = await admin.rpc("admin_faq_list", { p_surface: "subscription" });
if (listError) throw new Error(listError.message);
const target = list.find((r) => r.active);
console.log(`no-op edit target: a Subscription FAQ (active=${target.active}), trials: ${TRIALS}`);

const results = [];
for (let trial = 1; trial <= TRIALS; trial++) {
  // Prime: the edges this machine reaches hold the current version.
  const before = await read("subscription", STYLES.plain, true);
  for (let i = 0; i < 3; i++) for (const s of SURFACES) for (const h of Object.values(STYLES)) await read(s, h);
  const primed = await read("subscription", STYLES.browser);

  const { data: upd, error } = await admin.rpc("admin_faq_update", { p_id: target.id, p_active: target.active });
  if (error || !upd?.length) throw new Error(`no-op update failed: ${error?.message ?? "no row"}`);
  const t0 = Date.now();
  const at = () => +((Date.now() - t0) / 1000).toFixed(1);

  let origin = null;
  let newGen = null;
  while (Date.now() - t0 < 60_000) {
    const o = await read("subscription", STYLES.plain, true);
    if (o.gen !== before.gen) { origin = at(); newGen = o.gen; break; }
    await sleep(500);
  }
  if (!newGen) { results.push({ trial, error: "origin never changed in 60 s" }); continue; }

  let first = null;
  let lastStale = null;
  let staleResponses = 0;
  let responses = 0;
  let cleanRounds = 0;
  const statuses = {};
  while (Date.now() - t0 < 360_000 && cleanRounds < 5) {
    let allNew = true;
    await Promise.all(SURFACES.flatMap((s) => Object.entries(STYLES).map(async ([style, h]) => {
      const r = await read(s, h);
      responses++;
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      // Each rebuild writes all three files within a second or two, so "new" is any
      // generated_at later than the one before the edit.
      if (Date.parse(r.gen) > Date.parse(before.gen)) {
        if (first === null) first = at();
      } else {
        allNew = false;
        staleResponses++;
        lastStale = at();
      }
    })));
    cleanRounds = allNew ? cleanRounds + 1 : 0;
    await sleep(2_000);
  }
  results.push({
    trial,
    primed_status: primed.status,
    smart_cdn: primed.smart,
    origin_s: origin,
    first_new_s: first,
    last_stale_s: lastStale ?? 0,
    stale_responses: `${staleResponses}/${responses}`,
    settled: cleanRounds >= 5,
    statuses: JSON.stringify(statuses),
  });
  if (trial < TRIALS) await sleep(20_000);
}
console.table(results);
const settled = results.filter((r) => r.settled);
if (settled.length) {
  const worst = Math.max(...settled.map((r) => r.last_stale_s));
  console.log(`\nWorst case across ${settled.length} trial(s): the last old copy was served ${worst} s after the edit.`);
}
process.exit(results.every((r) => r.settled) ? 0 : 1);
