// ─────────────────────────────────────────────────────────────────────────────
// AD PRICING — the browser's copy.
//
// This MIRRORS supabase/functions/_shared/adPricing.ts, which is what the
// payment path actually charges. A browser cannot import a Deno edge module, so
// one duplicate is unavoidable — but it is now the ONLY duplicate (it replaced
// four hand-maintained copies), and `scripts/ad-pricing-check.mjs` transpiles
// both files and asserts the price tables, the type sets and the amount formula
// agree across a large sweep of generated specs.
//
// That check matters more than it sounds: this file decides the number the
// vendor is SHOWN before they press pay, and the edge module decides the number
// Razorpay actually charges. If they drift, a vendor is quoted one price and
// billed another, and nothing in the app would notice.
//
// Dependency-free on purpose, like adSlots.ts and adDestination.ts, so the
// check script can exercise it with no browser and no database.
// ─────────────────────────────────────────────────────────────────────────────

export const AD_PRICE: Record<string, number> = {
  openListing: 22, searchListing: 35, featuredProduct: 55, storePromotion: 99,
  directBroadcast: 15, wholesalerPick: 59, brandAd: 69, websiteBanner: 89,
  mobileBanner: 99, webMobileCombo: 129, fbInsta: 59, googleProduct: 59,
  socialCombo: 99, trustedSeal: 44, verifiedCertificate: 199,
};

/** Billed once per message, never per day. */
export const PER_MESSAGE_TYPES = new Set(["directBroadcast"]);

/**
 * About the VENDOR, not a product. Charged once for the whole order — not once
 * per product and not once per day — and materialised server-side as a single
 * campaign row with no product_id.
 */
export const VENDOR_LEVEL_TYPES = new Set(["trustedSeal", "verifiedCertificate"]);

export function unitsFor(id: string, days: number): number {
  if (PER_MESSAGE_TYPES.has(id)) return 1;
  if (VENDOR_LEVEL_TYPES.has(id)) return 1;
  return days;
}

export function clampDays(days: unknown): number {
  const n = Math.floor(Number(days) || 1);
  return Math.max(1, n);
}

export function splitPlacements(ids: readonly string[] | undefined | null): {
  perProduct: string[];
  vendorLevel: string[];
} {
  const list = (ids ?? []).filter((id) => AD_PRICE[id] != null);
  return {
    perProduct: list.filter((id) => !VENDOR_LEVEL_TYPES.has(id)),
    vendorLevel: list.filter((id) => VENDOR_LEVEL_TYPES.has(id)),
  };
}

export function subtotalRupees(ids: readonly string[], days: number): number {
  return ids.reduce((sum, id) => {
    const price = AD_PRICE[id];
    return price ? sum + price * unitsFor(id, days) : sum;
  }, 0);
}

/**
 * What the vendor owes, in rupees:
 *   per-product placements × product count  +  vendor-level placements × 1
 */
export function computeOrderRupees(
  placementIds: readonly string[] | undefined | null,
  days: number,
  productCount: number,
): number {
  const d = clampDays(days);
  const items = Math.max(1, productCount);
  const { perProduct, vendorLevel } = splitPlacements(placementIds);
  return subtotalRupees(perProduct, d) * items + subtotalRupees(vendorLevel, d);
}

/**
 * The per-line breakdown the checkout panel shows, so a vendor can see WHY a
 * vendor-level line does not scale with the number of products they picked.
 * Without this the new total just looks like a different number.
 */
export interface PriceLine {
  id: string;
  rupees: number;
  /** True when this line is charged once for the account, not per product. */
  vendorLevel: boolean;
  /** How the line was computed, for the UI to render under it. */
  basis: string;
}

export function priceLines(
  placementIds: readonly string[] | undefined | null,
  days: number,
  productCount: number,
): PriceLine[] {
  const d = clampDays(days);
  const items = Math.max(1, productCount);
  const { perProduct, vendorLevel } = splitPlacements(placementIds);
  const lines: PriceLine[] = [];
  for (const id of perProduct) {
    const unit = unitsFor(id, d);
    lines.push({
      id,
      rupees: AD_PRICE[id] * unit * items,
      vendorLevel: false,
      basis: PER_MESSAGE_TYPES.has(id)
        ? `₹${AD_PRICE[id]} × ${items} product${items === 1 ? "" : "s"}`
        : `₹${AD_PRICE[id]} × ${d} day${d === 1 ? "" : "s"} × ${items} product${items === 1 ? "" : "s"}`,
    });
  }
  for (const id of vendorLevel) {
    lines.push({
      id,
      rupees: AD_PRICE[id],
      vendorLevel: true,
      basis: "charged once for your account",
    });
  }
  return lines;
}
