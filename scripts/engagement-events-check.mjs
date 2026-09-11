#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// engagement_events — the invariants that make the analytics trustworthy.
//
// Every figure Phase 3 added to the vendor Analytics page is a GROUP BY over
// this table, so the table's guarantees ARE the numbers' guarantees. Four of
// them are load-bearing and none can be checked by reading the schema:
//
//   1. No client can INSERT directly. There is no INSERT policy at all, so the
//      only way in is log_engagement_event.
//   2. viewer_id comes from auth.uid() inside the function and is not a
//      parameter — otherwise anyone holding the anon key (it ships in the
//      bundle) could forge unique-visitor and attribution figures.
//   3. vendor_id is derived from the product or ad server-side, so traffic
//      cannot be attributed to someone else's storefront.
//   4. The status guard mirrors the counter RPCs: a view of a non-live product
//      and an impression on a non-active ad are dropped, exactly as
//      increment_product_view / ad_impression drop them. Without this the event
//      log and views_count disagree about the same visit.
//
// Plus RLS: a vendor reads their own rows, a buyer reads none — not even the
// events the buyer themselves generated.
//
// WRITES AND CLEANS UP. Rows are tagged with a unique run marker in cta_name /
// query_text and deleted as demo-admin (whose `for all` policy permits it) in a
// finally block. Safe to run repeatedly against the live project.
//
//   node scripts/engagement-events-check.mjs
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
const MARKER = `zz-eecheck-${Date.now().toString(36)}`;

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

// Restored in the finally block whatever happens.
let pausedAdId = null;

try {
  // Subjects: one live product and one that is not live, both this vendor's.
  const { data: live } = await vendor.db
    .from("products").select("id, name").eq("vendor_id", vendor.id).eq("status", "live").limit(1).maybeSingle();
  // The status guard is the whole reason this check exists, so the subjects it
  // needs are CREATED rather than hoped for. An earlier run of this script
  // skipped both cases because the demo vendor happened to have no non-live
  // product and no paused ad — a check that silently skips the thing it is for
  // is worse than no check.
  //
  // The subject is found through the ADMIN client, not the vendor's. Two live
  // facts force that: `products` RLS is `status = 'live' OR own OR admin`, so a
  // vendor cannot see anyone else's non-live rows, and this vendor's own six
  // products are all live. Creating one instead is not an option either — a
  // real plan trigger refuses it ("your free plan allows 2 listed product(s);
  // you already have 6").
  //
  // Whose product it is does not matter: the guard is a property of the
  // function, and the event it would write is dropped before any vendor
  // attribution happens.
  const { data: notLive } = await admin.db
    .from("products").select("id, name, status").neq("status", "live").limit(1).maybeSingle();

  const { data: ad } = await vendor.db
    .from("advertisements").select("id, status").eq("vendor_id", vendor.id).limit(1).maybeSingle();
  // Pause it for the duration of the check, then put it back exactly as found.
  if (ad && ad.status === "active") {
    const { error } = await vendor.db.from("advertisements").update({ status: "paused" }).eq("id", ad.id);
    if (!error) { pausedAdId = ad.id; ad.status = "paused"; }
  }

  console.log(`\nsubjects: live=${live?.id ?? "none"} notLive=${notLive?.id ?? "none"} (${notLive?.status ?? "-"}) ad=${ad?.id ?? "none"} (${ad?.status ?? "-"})`);

  // ── 1. No direct INSERT, for any role ──
  console.log("\n1. The table has no INSERT policy — the RPC is the only way in");
  for (const [who, client] of [["authenticated buyer", buyer.db], ["anon", anonDb], ["the vendor themselves", vendor.db]]) {
    const { error } = await client.from("engagement_events").insert({
      event_type: "product_view", vendor_id: vendor.id, product_id: live?.id ?? null,
    });
    check(`direct INSERT is refused for ${who}`, Boolean(error), `expected an RLS error, got none`);
  }

  // ── 2. viewer_id is auth.uid(), never the caller's claim ──
  console.log("\n2. viewer_id is taken from auth.uid() inside the function");
  await buyer.db.rpc("log_engagement_event", {
    p_event_type: "cta_click", p_vendor_id: vendor.id, p_cta_name: `${MARKER}-viewer`,
  });
  const { data: viewerRows } = await admin.db
    .from("engagement_events").select("viewer_id, vendor_id").eq("cta_name", `${MARKER}-viewer`);
  check("a buyer's event records the BUYER as viewer_id", viewerRows?.[0]?.viewer_id === buyer.id,
    `expected ${buyer.id}, got ${viewerRows?.[0]?.viewer_id}`);
  check("...and the named vendor as vendor_id", viewerRows?.[0]?.vendor_id === vendor.id);

  // Signed out: viewer_id null, session_id kept as the dedup fallback.
  await anonDb.rpc("log_engagement_event", {
    p_event_type: "cta_click", p_vendor_id: vendor.id,
    p_cta_name: `${MARKER}-anon`, p_session_id: "sess-abc",
  });
  const { data: anonRows } = await admin.db
    .from("engagement_events").select("viewer_id, session_id").eq("cta_name", `${MARKER}-anon`);
  check("a signed-out event has viewer_id null", anonRows?.[0]?.viewer_id === null);
  check("...and keeps session_id as the dedup fallback", anonRows?.[0]?.session_id === "sess-abc");

  // Signed in: session_id is dropped rather than stored beside a known viewer.
  await buyer.db.rpc("log_engagement_event", {
    p_event_type: "cta_click", p_vendor_id: vendor.id,
    p_cta_name: `${MARKER}-sess`, p_session_id: "sess-should-be-dropped",
  });
  const { data: sessRows } = await admin.db
    .from("engagement_events").select("session_id").eq("cta_name", `${MARKER}-sess`);
  check("a signed-in event drops session_id (no second identifier)", sessRows?.[0]?.session_id === null,
    `got ${JSON.stringify(sessRows?.[0]?.session_id)}`);

  // ── 3. vendor_id is derived from the subject, not trusted from the caller ──
  console.log("\n3. vendor_id is derived server-side from the product/ad");
  if (live) {
    await buyer.db.rpc("log_engagement_event", {
      p_event_type: "product_view", p_product_id: live.id,
      p_vendor_id: buyer.id,               // a lie: attribute it to the buyer
      p_source: "organic_search", p_query_text: `${MARKER}-forge`,
    });
    const { data: forged } = await admin.db
      .from("engagement_events").select("vendor_id, product_id, source").eq("query_text", `${MARKER}-forge`);
    check("a forged p_vendor_id is ignored in favour of the product's owner",
      forged?.[0]?.vendor_id === vendor.id,
      `expected ${vendor.id}, got ${forged?.[0]?.vendor_id}`);
    check("...and source is stored as given", forged?.[0]?.source === "organic_search");
  } else {
    check("a live product was available to test with", false, "setup failed");
  }

  // ── 4. The status guard mirrors the counter RPCs ──
  console.log("\n4. The status guard matches increment_product_view / ad_impression");
  if (notLive) {
    const before = await admin.db.from("engagement_events").select("id", { count: "exact", head: true })
      .eq("product_id", notLive.id).eq("event_type", "product_view");
    await buyer.db.rpc("log_engagement_event", {
      p_event_type: "product_view", p_product_id: notLive.id, p_query_text: `${MARKER}-notlive`,
    });
    const after = await admin.db.from("engagement_events").select("id", { count: "exact", head: true })
      .eq("product_id", notLive.id).eq("event_type", "product_view");
    check(`a product_view on a '${notLive.status}' product is dropped, as the counter drops it`,
      (after.count ?? 0) === (before.count ?? 0), `count went ${before.count} → ${after.count}`);

    // ...but a cta_click naming that same product is still a real button press.
    await buyer.db.rpc("log_engagement_event", {
      p_event_type: "cta_click", p_product_id: notLive.id, p_cta_name: `${MARKER}-ctanotlive`,
    });
    const { data: ctaRows } = await admin.db
      .from("engagement_events").select("id").eq("cta_name", `${MARKER}-ctanotlive`);
    check("...but a cta_click naming the same product IS recorded", (ctaRows?.length ?? 0) === 1);
  } else {
    check("a non-live product was available to test with", false, "setup failed");
  }

  if (ad && ad.status !== "active") {
    const before = await admin.db.from("engagement_events").select("id", { count: "exact", head: true })
      .eq("ad_id", ad.id).eq("event_type", "ad_impression");
    await buyer.db.rpc("log_engagement_event", { p_event_type: "ad_impression", p_ad_id: ad.id });
    const after = await admin.db.from("engagement_events").select("id", { count: "exact", head: true })
      .eq("ad_id", ad.id).eq("event_type", "ad_impression");
    check(`an ad_impression on a '${ad.status}' ad is dropped`, (after.count ?? 0) === (before.count ?? 0));
  } else {
    check("a non-active ad was available to test with", false,
      `ad is '${ad?.status ?? "none"}' — could not pause one`);
  }

  // ── 5. A bad event_type is swallowed, not raised at the buyer ──
  console.log("\n5. Telemetry failures never surface as a broken page");
  const { error: badTypeErr } = await buyer.db.rpc("log_engagement_event", {
    p_event_type: "not_a_real_type", p_vendor_id: vendor.id,
  });
  check("an event_type outside the check constraint returns cleanly", !badTypeErr,
    `got ${badTypeErr?.message}`);
  const { error: badRefErr } = await buyer.db.rpc("log_engagement_event", {
    p_event_type: "product_view", p_product_id: "00000000-0000-0000-0000-000000000000",
  });
  check("an unknown product id returns cleanly", !badRefErr, `got ${badRefErr?.message}`);

  // ── 6. RLS on read ──
  console.log("\n6. RLS — a vendor reads their own traffic, a buyer reads none");
  const { data: vendorRead } = await vendor.db
    .from("engagement_events").select("id, vendor_id").eq("vendor_id", vendor.id).limit(50);
  check("the vendor can read their own events", (vendorRead?.length ?? 0) > 0,
    `read ${vendorRead?.length ?? 0} rows`);
  check("...and every row they read is theirs", (vendorRead ?? []).every((r) => r.vendor_id === vendor.id));

  const { data: buyerRead } = await buyer.db.from("engagement_events").select("id").limit(50);
  check("a buyer reads NOTHING — not even events they generated themselves",
    (buyerRead?.length ?? 0) === 0, `buyer read ${buyerRead?.length ?? 0} rows`);

  const { data: anonRead } = await anonDb.from("engagement_events").select("id").limit(50);
  check("anon reads nothing", (anonRead?.length ?? 0) === 0);
} finally {
  // Clean up every row this run created. demo-admin's `for all` policy allows it.
  const { error: delErr, count } = await admin.db
    .from("engagement_events")
    .delete({ count: "exact" })
    .or(`cta_name.like.${MARKER}%,query_text.like.${MARKER}%`);
  console.log(`\ncleanup: removed ${count ?? 0} tagged row(s)${delErr ? ` (ERROR: ${delErr.message})` : ""}`);
  // The status-guard cases intentionally write nothing, and the bad-reference
  // cases write nothing, so anything left over would be a leak worth seeing.
  const { count: leftovers } = await admin.db
    .from("engagement_events").select("id", { count: "exact", head: true })
    .or(`cta_name.like.${MARKER}%,query_text.like.${MARKER}%`);
  if (leftovers) console.log(`  WARNING: ${leftovers} tagged row(s) survived cleanup`);

  if (pausedAdId) {
    const { error } = await vendor.db.from("advertisements").update({ status: "active" }).eq("id", pausedAdId);
    console.log(`  ad ${pausedAdId} restored to active${error ? ` (ERROR: ${error.message})` : ""}`);
  }
  await Promise.all([vendor.db.auth.signOut(), buyer.db.auth.signOut(), admin.db.auth.signOut()]);
}

console.log(failures === 0 ? "\nALL ENGAGEMENT CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
