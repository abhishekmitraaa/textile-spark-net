// ─────────────────────────────────────────────────────────────
// Which ad type is allowed to render in which buyer-side slot.
//
// Dependency-free on purpose, like adDestination.ts: this is the whole Phase 5
// placement decision as data, so `scripts/ad-slot-map-check.mjs` can assert
// "no ad type renders somewhere the plan didn't put it" without a browser or a
// database. Every rail passes its slot's `types` to active_ads(filter_placements),
// which matches server-side against the comma-joined `placement` column.
//
// `advertisements.placement` is a CSV ("openListing,trustedSeal"), so one
// purchase can legitimately light up several slots. That is intended: the
// vendor bought several placements.
// ─────────────────────────────────────────────────────────────

/** Every vendor-purchasable ad type id, exactly as razorpay-verify-payment prices them. */
export const AD_TYPES = [
  "openListing", "searchListing", "featuredProduct", "storePromotion",
  "directBroadcast", "wholesalerPick", "brandAd", "websiteBanner",
  "mobileBanner", "webMobileCombo", "fbInsta", "googleProduct",
  "socialCombo", "trustedSeal", "verifiedCertificate",
] as const;

export type AdType = (typeof AD_TYPES)[number];

/**
 * How a slot repeats down its page.
 *
 * THE RULE THAT MAKES THIS HONEST: the blocks are DISJOINT SLICES of one
 * ordered window, never the same ads drawn again. `useAdSlotBlocks` fetches
 * `block * blocks` campaigns in one request and hands block 0 rows 1–n, block 1
 * rows n+1–2n, and so on. So repeating the slot buys the page more POSITIONS,
 * not more impressions of the same campaign — a buyer scrolling never meets the
 * same ad twice, and no vendor's impression count is inflated by the layout.
 *
 * When inventory is short the later blocks are simply absent, exactly as a slot
 * with no inventory renders nothing at all. Four live campaigns across three
 * blocks of four is one block, not the same four ads three times.
 */
export interface AdSlotRepeat {
  /** Cards in one block. */
  block: number;
  /** Upper bound on how many blocks render. `max` must equal block * blocks. */
  blocks: number;
}

export interface AdSlot {
  /** Stable id. Used as the React Query key suffix, so renaming one splits its cache. */
  id: string;
  /** Buyer page this slot lives on. */
  page: "newArrivals" | "trends" | "sale" | "forYou" | "following" | "search" | "searchResults";
  /** Heading shown above the slot. Always carries the word "Sponsored" or an "Ad" chip. */
  label: string;
  /** Ad types eligible for this slot. Passed straight to active_ads(filter_placements). */
  types: AdType[];
  /** How many cards the slot asks for in total, across every block. */
  max: number;
  /**
   * Present on every live slot that renders as a rail: the slot appears at
   * several points down the page rather than once at the top. Absent only on a
   * deferred slot (nothing renders) or an interleaved one (see `interleaved`).
   */
  repeat?: AdSlotRepeat;
  /**
   * The slot is mixed INTO an organic list rather than rendered as its own
   * rail, so it is already spread down the page and takes no `repeat`. The
   * host component owns the ratio and must derive it from how much organic
   * content exists, never from how much inventory is available to sell.
   */
  interleaved?: boolean;
  /**
   * Defined but NOT rendered yet. A deferred slot reserves the placement
   * decision without pretending the surface exists — its ad types are still
   * "placed" in the plan, but nothing on the buyer side asks for them, so a
   * campaign buying them delivers nothing today.
   */
  deferred?: boolean;
}

export const AD_SLOTS = {
  // DEFERRED. The plan gives New Arrivals a 1216x130 banner above the category
  // chips, and says it "reuses the admin's existing (unused) banner-management
  // table". There is no such table — nothing in the database matches %banner%,
  // confirmed live. Rendering these as ordinary product cards would missell
  // both types, so the slot is reserved and left unrendered until there is a
  // banner creative model (dimensions, click-through URL, separate upload).
  newArrivalsBanner: {
    id: "newArrivalsBanner", page: "newArrivals",
    label: "Sponsored", types: ["websiteBanner", "mobileBanner"], max: 1,
    deferred: true,
  },
  newArrivalsSponsored: {
    id: "newArrivalsSponsored", page: "newArrivals",
    label: "Sponsored", types: ["openListing"], max: 12,
    repeat: { block: 4, blocks: 3 },
  },
  newArrivalsBrandPicks: {
    id: "newArrivalsBrandPicks", page: "newArrivals",
    label: "Brand Picks", types: ["storePromotion", "brandAd"], max: 8,
    repeat: { block: 4, blocks: 2 },
  },
  // NOTE: `wholesalerPick` is sold with a "72h bump" and does NOT get one. It
  // is served and ordered exactly like every other eligible campaign
  // (created_at desc, id desc). The slot is real; the bump is not built. Logged
  // in ToDo.md — do not describe this placement as delivering the bump.
  trendsSponsored: {
    id: "trendsSponsored", page: "trends",
    label: "Sponsored", types: ["featuredProduct", "wholesalerPick"], max: 12,
    repeat: { block: 4, blocks: 3 },
  },
  saleSponsored: {
    id: "saleSponsored", page: "sale",
    label: "Sponsored deals", types: ["openListing", "featuredProduct"], max: 12,
    repeat: { block: 4, blocks: 3 },
  },
  forYouSponsored: {
    id: "forYouSponsored", page: "forYou",
    label: "Sponsored", types: ["openListing", "featuredProduct"], max: 12,
    repeat: { block: 4, blocks: 3 },
  },
  // Not a rail. These campaigns are INTERLEAVED into the organic brand
  // carousel at 1-in-4 (see NewBrandsCarousel), so `label` is the section they
  // appear inside, not a heading this slot renders, and `max` is an upper
  // bound on how many are fetched — the carousel's own ratio decides how many
  // are actually shown, which is always fewer.
  followingBrands: {
    id: "followingBrands", page: "following",
    label: "Looking for New Brands? (Sponsored slides)", types: ["storePromotion", "brandAd"], max: 8,
    interleaved: true,
  },
  followingPopular: {
    id: "followingPopular", page: "following",
    label: "Most popular", types: ["openListing"], max: 8,
    repeat: { block: 4, blocks: 2 },
  },
  // ── Search ──────────────────────────────────────────────────────────────
  // `searchListing` was UNPLACED until Mitra's decision on 2026-09-13: it goes
  // on the page the buyer lands on when they tap Search, down in the scrolled
  // feed. Two slots, because /search and /search/results are different routes
  // with different intent — one is browsing with no query, the other is a
  // ranked answer to a typed term — and a buyer who moves from one to the other
  // should not be shown the identical rail twice.
  //
  // The results-page slot is the one that carries real intent: it is given the
  // query's category context, so a search for jeans serves campaigns targeting
  // jeans. The landing slot has no query yet, so it takes the category chip the
  // buyer has selected, or nothing.
  searchSponsored: {
    id: "searchSponsored", page: "search",
    label: "Sponsored", types: ["searchListing", "openListing"], max: 12,
    repeat: { block: 4, blocks: 3 },
  },
  searchResultsSponsored: {
    id: "searchResultsSponsored", page: "searchResults",
    label: "Sponsored", types: ["searchListing", "featuredProduct"], max: 12,
    repeat: { block: 4, blocks: 3 },
  },
} as const satisfies Record<string, AdSlot>;

export type AdSlotId = keyof typeof AD_SLOTS;

/**
 * The slice of a repeating slot's fetched window that block `index` renders.
 *
 * Generic and dependency-free so `scripts/ad-slot-map-check.mjs` can assert the
 * property that actually matters — the blocks PARTITION the window: every ad
 * appears in exactly one block, none appears in two. That is the difference
 * between a page with several sponsored positions and a page showing the same
 * campaign four times while charging one vendor for one placement.
 *
 * Returns [] for a block past the end of the inventory, which is how a short
 * window collapses to fewer blocks instead of repeating itself to fill them.
 */
export function adSlotBlock<T>(slot: AdSlotId, items: readonly T[], index: number): T[] {
  const spec: AdSlot = AD_SLOTS[slot];
  const r = spec.repeat;
  // A slot with no `repeat` has exactly one block. It is still capped at `max`:
  // active_ads() already limits the window, but a caller that passed a longer
  // list would otherwise render more cards than the slot was sold for.
  if (!r) return index === 0 ? items.slice(0, spec.max) : [];
  if (!Number.isInteger(index) || index < 0 || index >= r.blocks) return [];
  return items.slice(index * r.block, (index + 1) * r.block);
}

/** Ad types that have at least one real buyer-side slot. */
export const PLACED_AD_TYPES: readonly AdType[] =
  Array.from(new Set(Object.values(AD_SLOTS).flatMap((s) => s.types as readonly AdType[]))).sort();

/**
 * Types sold today with nowhere honest to render. NOT an oversight — each has a
 * specific reason, and inventing a slot to make the count look better is
 * exactly what this list exists to prevent. Carried in code rather than a doc
 * so the check script can assert every ad type is accounted for exactly once
 * and neither list can silently drift.
 */
export const UNPLACED_AD_TYPES: Readonly<Record<string, string>> = {
  directBroadcast:
    "Sold per message (₹15/msg) but there is no buyer-facing messaging surface to " +
    "deliver into. Blocked on Cosora's own messaging service (separate repo).",
  webMobileCombo:
    "A bundle of websiteBanner + mobileBanner, which already share the single " +
    "New Arrivals banner slot. A separate placement would render the same banner twice.",
  fbInsta:
    "Off-platform Facebook/Instagram reach. No on-platform slot can honestly represent it.",
  googleProduct:
    "Off-platform Google Shopping reach. Same as fbInsta.",
  socialCombo:
    "Bundle of fbInsta + googleProduct, both off-platform.",
};

/** trustedSeal renders as the existing product-card badge, which is already live and correct. */
export const BADGE_AD_TYPES: readonly AdType[] = ["trustedSeal"];

/**
 * Types that are not buyer-side placements at all, and never will be: the
 * vendor buys a physical article, not an impression.
 *
 * `verifiedCertificate` (₹199) was listed as UNPLACED with the reason "renders
 * the identical badge to trustedSeal, needs a distinct visual design". That was
 * wrong about what the product IS. Mitra confirmed on 2026-09-13 that it is a
 * printed certificate that gets couriered to the vendor, which is why the admin
 * panel already has a Certificates fulfilment screen. So it has no slot for the
 * same reason a T-shirt has no slot, and the thing to check is that it is
 * FULFILLED (certificate_orders) and trackable, not that it renders.
 */
export const FULFILMENT_AD_TYPES: readonly AdType[] = ["verifiedCertificate"];

/**
 * Ad types that may render as an on-platform card ANYWHERE, including rails
 * that predate the slot map and ask for no particular type — ProductDetail's
 * "Sponsored" rail being the one that exists today.
 *
 * This is the backstop for a real leak, found with live inventory: an untyped
 * rail calls active_ads() with no placement filter, which returns EVERY
 * eligible campaign. So a campaign whose only placements are off-platform
 * (fbInsta, googleProduct, socialCombo) or undeliverable (directBroadcast,
 * webMobileCombo) was rendering as an ordinary product card. A vendor who paid
 * ₹59 for Facebook/Instagram reach was getting a card on a Cosora product page
 * instead — not what they bought, and it made the "these have no placement"
 * list quietly untrue.
 *
 * `searchListing` is deliberately NOT here. It now has two real slots, but it
 * is search inventory: a vendor buying it bought placement in search, not a
 * card on every product page. Badge and fulfilment types are excluded for the
 * same reason — a campaign bought as trustedSeal buys a badge, and one bought
 * as verifiedCertificate buys a parcel.
 */
export const ON_PLATFORM_CARD_TYPES: readonly AdType[] = [
  "openListing", "featuredProduct", "wholesalerPick", "storePromotion", "brandAd",
];

/**
 * Placed types deliberately kept OUT of ON_PLATFORM_CARD_TYPES, with the reason.
 *
 * Without this list the check script cannot tell a considered exclusion from an
 * accidental one, and its "every live placed type can render as a card" rule
 * would either fail on a correct decision or have to be deleted — which is how
 * the fbInsta leak got in. A type here renders through its own slot and only
 * its own slot.
 */
export const SLOT_ONLY_AD_TYPES: Readonly<Record<string, string>> = {
  searchListing:
    "Search inventory. It has two real slots (/search and /search/results) but must " +
    "not fall into the untyped ProductDetail rail: a vendor who bought placement in " +
    "search did not buy a card on every product page.",
};
