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
  ON_PLATFORM_CARD_TYPES, FULFILMENT_AD_TYPES, SLOT_ONLY_AD_TYPES, adSlotBlock,
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
//    listed as unplaced with a stated reason, or it is the product-card badge,
//    or it is a physical article the vendor is sent rather than a placement.
const placed = new Set(PLACED_AD_TYPES);
const unplaced = new Set(Object.keys(UNPLACED_AD_TYPES));
const badge = new Set(BADGE_AD_TYPES);
const fulfilment = new Set(FULFILMENT_AD_TYPES);
const slotOnly = new Set(Object.keys(SLOT_ONLY_AD_TYPES));

const unaccounted = AD_TYPES.filter(
  (t) => !placed.has(t) && !unplaced.has(t) && !badge.has(t) && !fulfilment.has(t));
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

const fulfilmentLeak = [...fulfilment].filter((t) => cardTypes.has(t) || placed.has(t));
check("no fulfilment type is placed or rendered", fulfilmentLeak.length === 0,
  fulfilmentLeak.length
    ? `a physical article cannot be an impression: ${fulfilmentLeak.join(", ")}` : "");

// A type whose ONLY slots are deferred is not expected to render anywhere yet,
// and a type listed in SLOT_ONLY_AD_TYPES is deliberately confined to its own
// slots. Anything ELSE that is placed but cannot render as a card would be
// sold, slotted, and still invisible — which is the failure this catches.
const deferredOnly = new Set(
  [...placed].filter((t) => {
    const slotsWithType = Object.values(AD_SLOTS).filter((s) => s.types.includes(t));
    return slotsWithType.length > 0 && slotsWithType.every((s) => s.deferred);
  }),
);
const droppedFromCards = [...placed].filter(
  (t) => !cardTypes.has(t) && !deferredOnly.has(t) && !slotOnly.has(t));
check("every live placed type can render as a card", droppedFromCards.length === 0,
  droppedFromCards.length ? `placed but excluded from untyped rails: ${droppedFromCards.join(", ")}` : "");

// A deliberate exclusion has to name a type that is actually placed and
// actually excluded, or the list is stale cover for a real omission.
const staleSlotOnly = [...slotOnly].filter((t) => !placed.has(t) || cardTypes.has(t));
check("every slot-only exclusion is real", staleSlotOnly.length === 0,
  staleSlotOnly.length ? `listed but not placed, or not actually excluded: ${staleSlotOnly.join(", ")}` : "");

// 8. Every page that sells advertising has at least one slot.
const pages = new Set(Object.values(AD_SLOTS).map((s) => s.page));
const wantPages = ["newArrivals", "trends", "sale", "forYou", "following", "search", "searchResults"];
const pagesMissing = wantPages.filter((p) => !pages.has(p));
check("every advertising page has a slot", pagesMissing.length === 0, pagesMissing.join(", "));

// 9. REPETITION (Mitra, 2026-09-13: "the ad slots have to be repetitive and not
//    just exist as one single rail"). Encoded so it cannot quietly regress to a
//    single rail at the top of a page nobody scrolls back to.
//
//    Every live slot repeats, EXCEPT one that is interleaved into an organic
//    list — that is already spread down the page, and giving it blocks too
//    would double-count it. A deferred slot renders nothing, so it repeats
//    nothing.
const notRepeated = Object.values(AD_SLOTS).filter(
  (s) => !s.deferred && !s.interleaved && !s.repeat);
check("every live rail slot repeats down its page", notRepeated.length === 0,
  notRepeated.map((s) => s.id).join(", "));

// The blocks are disjoint slices of ONE window of `max` rows, so the arithmetic
// has to close exactly. If max < block*blocks the last block is silently
// starved; if max > block*blocks the surplus is fetched and never rendered —
// impressions logged for ads nobody saw.
const badRepeat = Object.values(AD_SLOTS)
  .filter((s) => s.repeat)
  .filter((s) => s.repeat.block < 1 || s.repeat.blocks < 2 || s.max !== s.repeat.block * s.repeat.blocks)
  .map((s) => `${s.id}: max=${s.max} vs ${s.repeat.block}x${s.repeat.blocks}`);
check("repeat arithmetic closes", badRepeat.length === 0, badRepeat.join("; "));

const bothRepeatAndInterleaved = Object.values(AD_SLOTS)
  .filter((s) => s.repeat && s.interleaved).map((s) => s.id);
check("no slot is both repeated and interleaved", bothRepeatAndInterleaved.length === 0,
  bothRepeatAndInterleaved.join(", "));

// 10. adSlotBlock PARTITIONS the window — the property the whole "repetitive"
//     design rests on. If blocks overlapped, one vendor's campaign would appear
//     several times down a page it was sold once on, and each appearance would
//     log its own impression. Exercised at every inventory depth from empty to
//     a full window plus surplus, because the short-inventory cases are the
//     ones that actually happen today.
const partitionFaults = [];
for (const s of Object.values(AD_SLOTS)) {
  const blocks = s.repeat ? s.repeat.blocks : 1;
  for (let depth = 0; depth <= s.max + 3; depth++) {
    const window = Array.from({ length: depth }, (_, i) => `ad${i}`);
    const out = [];
    for (let b = 0; b < blocks; b++) out.push(...adSlotBlock(s.id, window, b));
    const seen = new Set(out);
    if (seen.size !== out.length) {
      partitionFaults.push(`${s.id}@${depth}: an ad appears in two blocks`);
      break;
    }
    // Every row the slot fetched must land in some block, up to `max`.
    const expected = Math.min(depth, s.max);
    if (out.length !== expected) {
      partitionFaults.push(`${s.id}@${depth}: rendered ${out.length} of ${expected} fetched`);
      break;
    }
  }
  // A block index past the configured count must render nothing, not wrap.
  if (adSlotBlock(s.id, Array.from({ length: s.max }, (_, i) => i), blocks).length !== 0) {
    partitionFaults.push(`${s.id}: block ${blocks} is out of range but rendered rows`);
  }
}
check("blocks partition the window, never repeat an ad", partitionFaults.length === 0,
  partitionFaults.slice(0, 4).join("; "));

const deferredSlots = Object.values(AD_SLOTS).filter((s) => s.deferred).map((s) => s.id);

console.table(rows);
if (deferredSlots.length) console.log(`\ndeferred slots (defined, not rendered): ${deferredSlots.join(", ")}`);
const repeated = Object.values(AD_SLOTS)
  .filter((s) => s.repeat)
  .map((s) => `${s.id} ${s.repeat.blocks}x${s.repeat.block}`);
console.log(`repeated slots: ${repeated.join(", ")}`);
console.log(`placed:     ${[...placed].sort().join(", ")}`);
console.log(`badge:      ${[...badge].sort().join(", ")}`);
console.log(`fulfilment: ${[...fulfilment].sort().join(", ")}`);
console.log(`unplaced:   ${[...unplaced].sort().join(", ")}`);
console.log(
  failures === 0
    ? `\nPLACEMENT MAP CONSISTENT — ${placed.size} placed, ${badge.size} badge, ` +
      `${fulfilment.size} fulfilment, ${unplaced.size} unplaced of ${AD_TYPES.length}`
    : `\n${failures} CHECK(S) FAILED`,
);

rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
