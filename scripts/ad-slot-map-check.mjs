#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Phase 9.6 — "no ad type renders somewhere the plan didn't put it."
//
// The placement plan is data (src/lib/adSlots.ts), so it can be checked rather
// than eyeballed. The failure this guards against is quiet: someone adds an ad
// type to a slot's `types`, or a sixteenth product to the pricing page, and
// nothing breaks — the type simply starts rendering somewhere nobody decided
// it should, or stops being sold anywhere at all with no record of which.
//
// Same shape as ad-destination-check.mjs: esbuild-transpile the one
// import-free module and assert against it. No browser, no database — which
// matters, because there is currently no eligible campaign to render.
//
//   node scripts/ad-slot-map-check.mjs
// ─────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-adslots-"));
const outfile = path.join(dir, "adSlots.mjs");

await build({
  entryPoints: ["src/lib/adSlots.ts"],
  outfile,
  format: "esm",
  platform: "node",
  bundle: false,
  logLevel: "silent",
});

const {
  AD_TYPES, AD_SLOTS, PLACED_AD_TYPES, UNPLACED_AD_TYPES, BADGE_AD_TYPES,
  ON_PLATFORM_CARD_TYPES,
} = await import(pathToFileURL(outfile).href);

let failures = 0;
const rows = [];

function check(name, ok, detail = "") {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail });
}

// 1. The 15 sold ad types are exactly the 15 razorpay-verify-payment prices.
//    Hardcoded here on purpose: if the price list grows a product, this fails
//    and forces a placement decision instead of letting it ship unplaced.
const PRICED = [
  "openListing", "searchListing", "featuredProduct", "storePromotion",
  "directBroadcast", "wholesalerPick", "brandAd", "websiteBanner",
  "mobileBanner", "webMobileCombo", "fbInsta", "googleProduct",
  "socialCombo", "trustedSeal", "verifiedCertificate",
];
const missingFromMap = PRICED.filter((t) => !AD_TYPES.includes(t));
const extraInMap = AD_TYPES.filter((t) => !PRICED.includes(t));
check(
  "AD_TYPES matches the priced ad types",
  missingFromMap.length === 0 && extraInMap.length === 0,
  [missingFromMap.length ? `missing: ${missingFromMap.join(", ")}` : "",
   extraInMap.length ? `unexpected: ${extraInMap.join(", ")}` : ""].filter(Boolean).join(" | "),
);

// 2. Every ad type is accounted for exactly once: it has a slot, or it is
//    listed as unplaced with a stated reason, or it is the product-card badge.
const placed = new Set(PLACED_AD_TYPES);
const unplaced = new Set(Object.keys(UNPLACED_AD_TYPES));
const badge = new Set(BADGE_AD_TYPES);

const unaccounted = AD_TYPES.filter((t) => !placed.has(t) && !unplaced.has(t) && !badge.has(t));
check("every ad type is accounted for", unaccounted.length === 0,
  unaccounted.length ? `no slot and no stated reason: ${unaccounted.join(", ")}` : "");

const bothPlacedAndUnplaced = AD_TYPES.filter((t) => placed.has(t) && unplaced.has(t));
check("no ad type is both placed and unplaced", bothPlacedAndUnplaced.length === 0,
  bothPlacedAndUnplaced.join(", "));

// 3. Every unplaced type states WHY, in a sentence, not a shrug.
const thinReasons = Object.entries(UNPLACED_AD_TYPES)
  .filter(([, why]) => typeof why !== "string" || why.trim().length < 40)
  .map(([t]) => t);
check("every unplaced type states a reason", thinReasons.length === 0,
  thinReasons.length ? `too thin to be a decision: ${thinReasons.join(", ")}` : "");

// 4. No slot routes an ad type that is not a real product.
const bogus = Object.values(AD_SLOTS).flatMap((s) =>
  s.types.filter((t) => !AD_TYPES.includes(t)).map((t) => `${s.id}:${t}`));
check("no slot routes an unknown ad type", bogus.length === 0, bogus.join(", "));

// 5. Within ONE page, no ad type appears in two slots. This is the
//    de-duplication rule that NewArrivals used to enforce with array-index
//    arithmetic; routing by ad type only removes the need for it if the types
//    are genuinely disjoint per page.
const perPage = new Map();
for (const s of Object.values(AD_SLOTS)) {
  for (const t of s.types) {
    const key = `${s.page}:${t}`;
    perPage.set(key, [...(perPage.get(key) ?? []), s.id]);
  }
}
const collisions = [...perPage.entries()].filter(([, slots]) => slots.length > 1)
  .map(([key, slots]) => `${key} in ${slots.join(" + ")}`);
check("no ad type is in two slots on one page", collisions.length === 0, collisions.join("; "));

// 6. Slots have sane sizes and a label that reads as advertising. A rail that
//    does not say it is sponsored is the problem, whatever it renders.
const badSize = Object.values(AD_SLOTS).filter((s) => !Number.isInteger(s.max) || s.max < 1 || s.max > 24);
check("slot sizes are sane", badSize.length === 0, badSize.map((s) => `${s.id}=${s.max}`).join(", "));

const unlabelled = Object.values(AD_SLOTS).filter(
  (s) => !/sponsored|brand picks|new brands|most popular/i.test(s.label));
check("every slot label is set", unlabelled.length === 0,
  unlabelled.map((s) => `${s.id}="${s.label}"`).join(", "));

// 7. The untyped-rail backstop holds in both directions.
//
//    A rail that asks for no particular ad type falls back to
//    ON_PLATFORM_CARD_TYPES. If an UNPLACED type ever crept into that list it
//    would start rendering as a product card everywhere, which is exactly the
//    leak this list was added to stop — an fbInsta campaign appearing on a
//    Cosora product page. And if a PLACED type were missing from it, that type
//    would render in its own slot but vanish from the general rail.
const cardTypes = new Set(ON_PLATFORM_CARD_TYPES);
const leaked = [...unplaced].filter((t) => cardTypes.has(t));
check("no unplaced type can render as a card", leaked.length === 0,
  leaked.length ? `would leak into untyped rails: ${leaked.join(", ")}` : "");

const badgeLeak = [...badge].filter((t) => cardTypes.has(t));
check("no badge-only type renders as a card", badgeLeak.length === 0, badgeLeak.join(", "));

// A type whose ONLY slots are deferred is not expected to render anywhere yet,
// so it is exempt. Anything else that is placed but cannot render as a card
// would be sold, slotted, and still invisible.
const deferredOnly = new Set(
  [...placed].filter((t) => {
    const slotsWithType = Object.values(AD_SLOTS).filter((s) => s.types.includes(t));
    return slotsWithType.length > 0 && slotsWithType.every((s) => s.deferred);
  }),
);
const droppedFromCards = [...placed].filter((t) => !cardTypes.has(t) && !deferredOnly.has(t));
check("every live placed type can render as a card", droppedFromCards.length === 0,
  droppedFromCards.length ? `placed but excluded from untyped rails: ${droppedFromCards.join(", ")}` : "");

// 8. The five agreed artboards each have at least one slot.
const pages = new Set(Object.values(AD_SLOTS).map((s) => s.page));
const wantPages = ["newArrivals", "trends", "sale", "forYou", "following"];
const pagesMissing = wantPages.filter((p) => !pages.has(p));
check("all five artboards have a slot", pagesMissing.length === 0, pagesMissing.join(", "));

const deferredSlots = Object.values(AD_SLOTS).filter((s) => s.deferred).map((s) => s.id);

console.table(rows);
if (deferredSlots.length) console.log(`\ndeferred slots (defined, not rendered): ${deferredSlots.join(", ")}`);
console.log(`placed:   ${[...placed].sort().join(", ")}`);
console.log(`badge:    ${[...badge].sort().join(", ")}`);
console.log(`unplaced: ${[...unplaced].sort().join(", ")}`);
console.log(
  failures === 0
    ? `\nPLACEMENT MAP CONSISTENT — ${placed.size} placed, ${badge.size} badge, ${unplaced.size} unplaced of ${AD_TYPES.length}`
    : `\n${failures} CHECK(S) FAILED`,
);

rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
