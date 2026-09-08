// ─────────────────────────────────────────────────────────────
// Where a tap on a paid ad should land.
//
// Deliberately in its own dependency-free module rather than inside
// queries/ads.ts: this is the one branch in the change that alters real
// buyer-facing navigation and decides whether a vendor gets what they paid
// for, so it has to be verifiable without a browser, a session or a database.
// `scripts/ad-destination-check.mjs` transpiles this file alone and exercises
// every case. queries/ads.ts re-exports both functions, so call sites are
// unchanged.
//
// THE BUG THIS FIXES. `SponsoredRail.tsx` and `NewArrivals.tsx` both did
// `if (a.productId) navigate(`/product/${a.productId}`)` for every ad, whatever
// its placement. Advertisements.tsx lets a vendor choose a campaign goal and
// maps "Visit your profile" to the storePromotion and brandAd placements
// (GOAL_PLACEMENTS), but nothing downstream read that — so a vendor who paid
// ₹99/day to send buyers to their storefront got product traffic instead, and a
// profile-goal ad with no product_id was a card that navigated nowhere at all.
// ─────────────────────────────────────────────────────────────

/**
 * Placements sold under the "Visit your profile" campaign goal. Mirrors
 * `GOAL_PLACEMENTS.visitProfile` in Advertisements.tsx — the two lists describe
 * the same product decision and must be changed together.
 */
export const PROFILE_GOAL_PLACEMENTS = ["storePromotion", "brandAd"] as const;

const PROFILE_GOAL_SET: ReadonlySet<string> = new Set(PROFILE_GOAL_PLACEMENTS);

/**
 * `advertisements.placement` is a COMMA-JOINED CSV, not a single value —
 * razorpay-verify-payment's adRows() does `spec.placementIds.join(",")`, so a
 * real row reads `"openListing,trustedSeal"`. Membership, never equality.
 *
 * One purchase can carry several placements; if any of them was sold under the
 * profile goal, the storefront is what the vendor bought.
 */
export function isProfileGoalAd(placement: string | null | undefined): boolean {
  if (!placement) return false;
  return placement.split(",").some((p) => PROFILE_GOAL_SET.has(p.trim()));
}

export interface AdDestination {
  path: string;
  kind: "profile" | "product";
}

export interface AdRouteInput {
  placement: string | null;
  productId: string | null;
  vendorId: string | null;
}

/**
 * Returns null when the ad can go nowhere. That is a real case — an ad row
 * whose product and vendor are both missing — and the caller must NOT navigate
 * rather than routing somewhere arbitrary.
 */
export function adDestination(ad: AdRouteInput): AdDestination | null {
  if (isProfileGoalAd(ad.placement) && ad.vendorId) {
    return { path: `/vendor/${ad.vendorId}`, kind: "profile" };
  }
  if (ad.productId) return { path: `/product/${ad.productId}`, kind: "product" };
  // The goal says product, but there is no product to open. The storefront is
  // the honest fallback: better than swallowing a click the vendor paid for.
  if (ad.vendorId) return { path: `/vendor/${ad.vendorId}`, kind: "profile" };
  return null;
}
