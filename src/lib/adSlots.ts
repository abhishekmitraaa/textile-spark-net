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

export interface AdSlot {
  /** Stable id. Used as the React Query key suffix, so renaming one splits its cache. */
  id: string;
  /** Buyer page this slot lives on. */
  page: "newArrivals" | "trends" | "sale" | "forYou" | "following";
  /** Heading shown above the slot. Always carries the word "Sponsored" or an "Ad" chip. */
  label: string;
  /** Ad types eligible for this slot. Passed straight to active_ads(filter_placements). */
  types: AdType[];
  /** How many cards the slot asks for. */
  max: number;
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
    label: "Sponsored", types: ["openListing"], max: 10,
  },
  newArrivalsBrandPicks: {
    id: "newArrivalsBrandPicks", page: "newArrivals",
    label: "Brand Picks", types: ["storePromotion", "brandAd"], max: 8,
  },
  // NOTE: `wholesalerPick` is sold with a "72h bump" and does NOT get one. It
  // is served and ordered exactly like every other eligible campaign
  // (created_at desc, id desc). The slot is real; the bump is not built. Logged
  // in ToDo.md — do not describe this placement as delivering the bump.
  trendsSponsored: {
    id: "trendsSponsored", page: "trends",
    label: "Sponsored", types: ["featuredProduct", "wholesalerPick"], max: 8,
  },
  saleSponsored: {
    id: "saleSponsored", page: "sale",
    label: "Sponsored deals", types: ["openListing", "featuredProduct"], max: 8,
  },
  forYouSponsored: {
    id: "forYouSponsored", page: "forYou",
    label: "Sponsored", types: ["openListing", "featuredProduct"], max: 4,
  },
  // Not a rail. These campaigns are INTERLEAVED into the organic brand
  // carousel at 1-in-4 (see NewBrandsCarousel), so `label` is the section they
  // appear inside, not a heading this slot renders, and `max` is an upper
  // bound on how many are fetched — the carousel's own ratio decides how many
  // are actually shown, which is always fewer.
  followingBrands: {
    id: "followingBrands", page: "following",
    label: "Looking for New Brands? (Sponsored slides)", types: ["storePromotion", "brandAd"], max: 8,
  },
  followingPopular: {
    id: "followingPopular", page: "following",
    label: "Most popular", types: ["openListing"], max: 8,
  },
} as const satisfies Record<string, AdSlot>;

export type AdSlotId = keyof typeof AD_SLOTS;

/** Ad types that have at least one real buyer-side slot. */
export const PLACED_AD_TYPES: readonly AdType[] =
  Array.from(new Set(Object.values(AD_SLOTS).flatMap((s) => s.types as readonly AdType[]))).sort();

/**
 * The seven types sold today with nowhere honest to render, plus trustedSeal's
 * premium twin. NOT an oversight — each has a specific reason, and inventing a
 * slot to make the count look better is exactly what this list exists to
 * prevent. Carried in code rather than a doc so the check script can assert
 * PLACED ∪ UNPLACED === AD_TYPES and neither list can silently drift.
 */
export const UNPLACED_AD_TYPES: Readonly<Record<string, string>> = {
  searchListing:
    "A real SearchResults page exists (unlike the planning note's assumption), so the " +
    "blocker is a product decision about whether Cosora wants sponsored search results " +
    "at all — not a missing surface. Build-or-retire.",
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
  verifiedCertificate:
    "Priced at ₹199 vs trustedSeal's ₹44 but renders the identical badge today. " +
    "Needs a distinct visual design before it can claim to be a different product.",
};

/** trustedSeal renders as the existing product-card badge, which is already live and correct. */
export const BADGE_AD_TYPES: readonly AdType[] = ["trustedSeal"];

/**
 * Ad types that may render as an on-platform card ANYWHERE, including rails
 * that predate the slot map and ask for no particular type — ProductDetail's
 * "Sponsored" rail being the one that exists today.
 *
 * This is the backstop for a real leak, found with live inventory: an untyped
 * rail calls active_ads() with no placement filter, which returns EVERY
 * eligible campaign. So a campaign whose only placements are off-platform
 * (fbInsta, googleProduct, socialCombo) or undeliverable (searchListing,
 * directBroadcast, webMobileCombo) was rendering as an ordinary product card.
 * A vendor who paid ₹59 for Facebook/Instagram reach was getting a card on a
 * Cosora product page instead — not what they bought, and it made the "these
 * seven have no placement" list quietly untrue.
 *
 * Badge types are excluded too: a campaign bought purely as trustedSeal or
 * verifiedCertificate buys a badge, not a card.
 */
export const ON_PLATFORM_CARD_TYPES: readonly AdType[] = [
  "openListing", "featuredProduct", "wholesalerPick", "storePromotion", "brandAd",
];
