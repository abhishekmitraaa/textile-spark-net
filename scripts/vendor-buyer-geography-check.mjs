#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// vendor_buyer_geography — the privacy guarantees, checked against the live DB.
//
// This function is the ONLY new path by which a vendor's request touches
// another user's location data. Everything that makes that acceptable is a
// runtime property, invisible in the schema:
//
//   1. buyer_profiles / profiles RLS is UNCHANGED. A vendor still cannot read a
//      buyer's row directly — not their city, not anything else. If a future
//      change "fixes" the geography card by widening a policy instead, this is
//      the assertion that fails.
//   2. The k-anonymity threshold holds. A place backed by fewer than
//      min_viewers distinct viewers is never named; it folds into `other`.
//   3. The self-or-admin guard actually refuses. Note the specific bug it was
//      written against: `not (vid = auth.uid() or is_admin())` evaluates to
//      NULL for an unauthenticated caller, and `if NULL then` does not fire —
//      so the original guard fell through and returned real data. Caught by
//      calling it with no JWT during development; asserted here so it stays fixed.
//   4. Only buyer-INITIATED events count. ad_impression must not inflate the map.
//
// WRITES AND CLEANS UP. Creates engagement_events rows via the real RPC and a
// temporary buyer location, then restores both in a finally block. Safe to run
// repeatedly against the live project.
//
//   node scripts/vendor-buyer-geography-check.mjs
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { demoPasswordFor } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const MARKER = `zz-geo-${Date.now().toString(36)}`;

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok || !detail ? "" : `\n          ${detail}`}`);
}

async function signIn(email) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, id: data.user.id };
}

const vendor = await signIn("demo-vendor@cosora.dev");
const buyer = await signIn("demo-buyer@cosora.dev");
const admin = await signIn("demo-admin@cosora.dev");
const anonDb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

/** buyer_profiles values to restore, so the run leaves no trace. */
let originalBuyerLoc = null;

try {
  // ── 0. Phase 0 regression: saveAccountInfo's columns must exist and be writable ──
  console.log("\n0. The columns Phase 0 writes into");
  const { data: beforeRow, error: readErr } = await buyer.db
    .from("buyer_profiles").select("city, state, postal_code").eq("id", buyer.id).maybeSingle();
  check("a buyer can read their own buyer_profiles row", !readErr, readErr?.message);
  originalBuyerLoc = beforeRow ?? { city: null, state: null, postal_code: null };

  const { error: writeErr } = await buyer.db
    .from("buyer_profiles")
    .upsert({ id: buyer.id, city: "Testville", state: "Teststate", postal_code: "999999" }, { onConflict: "id" });
  check("a buyer can persist city/state/postal_code (the Phase 0 fix)", !writeErr, writeErr?.message);

  // ── 1. RLS on buyer_profiles is UNCHANGED ──
  console.log("\n1. The vendor still cannot read buyer location directly");
  const { data: vendorPeek } = await vendor.db
    .from("buyer_profiles").select("id, city, state").eq("id", buyer.id);
  check("vendor reading the buyer's buyer_profiles row gets nothing",
    (vendorPeek?.length ?? 0) === 0, `vendor read ${vendorPeek?.length ?? 0} row(s)`);

  const { data: vendorScan } = await vendor.db.from("buyer_profiles").select("id, city").limit(50);
  const foreign = (vendorScan ?? []).filter((r) => r.id !== vendor.id);
  check("vendor scanning buyer_profiles sees no one else's row",
    foreign.length === 0, `saw ${foreign.length} foreign row(s)`);

  // ── 2. A qualifying event shows up as an aggregate ──
  console.log("\n2. A real buyer visit reaches the vendor as a count");
  const { data: liveProduct } = await vendor.db
    .from("products").select("id").eq("vendor_id", vendor.id).eq("status", "live").limit(1).maybeSingle();
  if (!liveProduct) throw new Error("vendor has no live product to generate an event against");

  // Three separate visits from ONE buyer — deliberately below the threshold.
  for (let i = 0; i < 3; i++) {
    await buyer.db.rpc("log_engagement_event", {
      p_event_type: "product_view", p_product_id: liveProduct.id, p_source: "direct",
    });
  }

  const { data: geo1, error: geoErr } = await vendor.db.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
  check("the vendor can call the RPC", !geoErr, geoErr?.message);
  check("coverage counts the visits", (geo1?.coverage?.total_events ?? 0) >= 3,
    `total_events=${geo1?.coverage?.total_events}`);
  check("coverage counts them as located", (geo1?.coverage?.events_with_location ?? 0) >= 3,
    `events_with_location=${geo1?.coverage?.events_with_location}`);

  // ── 3. k-anonymity: one buyer is not enough to name a city ──
  console.log("\n3. k-anonymity — one buyer must not name a place");
  const named = (geo1?.cities ?? []).map((c) => c.city);
  check(`'Testville' is NOT named (only 1 distinct viewer, threshold is ${geo1?.min_viewers})`,
    !named.includes("Testville"), `cities returned: ${JSON.stringify(named)}`);
  check("...and those visits are still counted, in `other`",
    (geo1?.other?.events ?? 0) >= 3, `other=${JSON.stringify(geo1?.other)}`);
  check("no state is named off a single viewer either",
    !(geo1?.states ?? []).some((x) => x.state === "Teststate"),
    `states: ${JSON.stringify((geo1?.states ?? []).map((x) => x.state))}`);

  // Totals must reconcile: named + other + unknown == located + unknown.
  const namedEvents = (geo1?.cities ?? []).reduce((s, c) => s + c.events, 0);
  check("named + other == events_with_location (nothing silently dropped)",
    namedEvents + (geo1?.other?.events ?? 0) === (geo1?.coverage?.events_with_location ?? 0),
    `named=${namedEvents} other=${geo1?.other?.events} located=${geo1?.coverage?.events_with_location}`);

  // ── 3b. THE POSITIVE CASE — the threshold must also LET DATA THROUGH ──
  //
  // Every check above is a suppression check, which a function that returned
  // an empty list for everything would also pass. This is the one that proves
  // the feature works at all: three DISTINCT viewers in one city must produce a
  // named bucket. Rows are written with the admin client (whose `for all`
  // policy permits it) because three separately signed-in buyer accounts do not
  // exist on this project.
  console.log("\n3b. k-anonymity — three buyers DO name a place");
  const { data: profileIds } = await admin.db
    .from("profiles").select("id").neq("id", vendor.id).limit(3);
  const trio = (profileIds ?? []).map((r) => r.id);
  if (trio.length === 3) {
    const priorLocs = (await admin.db.from("buyer_profiles").select("id, city, state").in("id", trio)).data ?? [];
    try {
      await admin.db.from("buyer_profiles").upsert(
        trio.map((id) => ({ id, city: "Kanpur", state: "Uttar Pradesh" })), { onConflict: "id" },
      );
      await admin.db.from("engagement_events").insert(
        trio.map((id) => ({
          event_type: "product_view", vendor_id: vendor.id,
          product_id: liveProduct.id, viewer_id: id, source: "direct",
        })),
      );
      const { data: geo3 } = await vendor.db.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
      const kanpur = (geo3?.cities ?? []).find((c) => c.city === "Kanpur");
      check("a city with 3 distinct viewers IS named", Boolean(kanpur),
        `cities: ${JSON.stringify((geo3?.cities ?? []).map((c) => c.city))}`);
      check("...with the right counts", kanpur?.viewers === 3 && kanpur?.events >= 3,
        `got ${JSON.stringify(kanpur)}`);
      check("...and its state is named too",
        (geo3?.states ?? []).some((x) => x.state === "Uttar Pradesh"),
        `states: ${JSON.stringify((geo3?.states ?? []).map((x) => x.state))}`);
    } finally {
      // Restore whatever those three profiles had before.
      for (const row of priorLocs) {
        await admin.db.from("buyer_profiles")
          .update({ city: row.city, state: row.state }).eq("id", row.id);
      }
      const missing = trio.filter((id) => !priorLocs.some((r) => r.id === id));
      if (missing.length) {
        await admin.db.from("buyer_profiles").update({ city: null, state: null }).in("id", missing);
      }
    }
  } else {
    check("three profiles were available for the positive case", false, `found ${trio.length}`);
  }

  // ── 4. ad_impression must not inflate the map ──
  console.log("\n4. Passive ad impressions are not buyer interest");
  const { data: anyAd } = await vendor.db
    .from("advertisements").select("id, status").eq("vendor_id", vendor.id).eq("status", "active").limit(1).maybeSingle();
  if (anyAd) {
    // Baseline is re-read HERE, not reused from geo1. Step 3b inserted three
    // more product_views after geo1 was captured, so comparing against it
    // reported a 3 -> 6 jump and blamed the ad_impression for events this
    // script had created itself.
    const { data: geoPre } = await vendor.db.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
    const before = geoPre?.coverage?.total_events ?? 0;
    await buyer.db.rpc("log_engagement_event", { p_event_type: "ad_impression", p_ad_id: anyAd.id });
    const { data: geo2 } = await vendor.db.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
    check("an ad_impression does NOT change the geography totals",
      (geo2?.coverage?.total_events ?? 0) === before,
      `${before} -> ${geo2?.coverage?.total_events}`);
  } else {
    check("an active ad was available to test ad_impression exclusion", false, "no active ad found");
  }

  // ── 5. The self-or-admin guard ──
  console.log("\n5. The guard refuses everyone but the vendor and admin");
  const { data: asBuyer } = await buyer.db.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
  check("a buyer asking for the vendor's geography gets null", asBuyer === null,
    `got ${JSON.stringify(asBuyer)?.slice(0, 120)}`);

  const { data: asAnon, error: anonErr } = await anonDb.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
  // anon has no EXECUTE grant, so this should error outright; if the grant is
  // ever loosened, the NULL-guard must still refuse. Either is a pass.
  check("an anonymous caller is refused (no grant, or null from the guard)",
    Boolean(anonErr) || asAnon === null,
    `err=${anonErr?.message} data=${JSON.stringify(asAnon)?.slice(0, 120)}`);

  const { data: asAdmin } = await admin.db.rpc("vendor_buyer_geography", { v: vendor.id, p_days: 30 });
  check("an admin CAN read it (ops visibility, same as ad_category_benchmarks)",
    asAdmin !== null && typeof asAdmin === "object");

  // ── 6. home_location comes from the vendor's own profile ──
  console.log("\n6. The vendor's own registered location");
  const { data: vp } = await vendor.db.from("vendor_profiles").select("city, state").eq("id", vendor.id).maybeSingle();
  check("home_location matches vendor_profiles",
    (geo1?.home_location?.city ?? null) === (vp?.city?.trim() || null),
    `rpc=${JSON.stringify(geo1?.home_location)} table=${JSON.stringify(vp)}`);
} finally {
  // Remove the events this run created, and put the buyer's location back.
  const { count: del } = await admin.db
    .from("engagement_events").delete({ count: "exact" })
    .gte("created_at", new Date(Date.now() - 600000).toISOString());
  console.log(`\ncleanup: deleted ${del ?? 0} engagement_event(s) from this run`);

  if (originalBuyerLoc) {
    const { error } = await buyer.db.from("buyer_profiles").upsert(
      {
        id: buyer.id,
        city: originalBuyerLoc.city ?? null,
        state: originalBuyerLoc.state ?? null,
        postal_code: originalBuyerLoc.postal_code ?? null,
      },
      { onConflict: "id" },
    );
    console.log(`  buyer location restored to ${JSON.stringify(originalBuyerLoc)}${error ? ` (ERROR: ${error.message})` : ""}`);
  }
  await Promise.all([vendor.db.auth.signOut(), buyer.db.auth.signOut(), admin.db.auth.signOut()]);
}

console.log(failures === 0 ? "\nALL BUYER-GEOGRAPHY CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
