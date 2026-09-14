// ─────────────────────────────────────────────────────────────────────────────
// AD PRICING + CAMPAIGN ROW CONSTRUCTION — single source of truth.
//
// WHY THIS FILE EXISTS. Until 2026-09-14 the price table and the amount formula
// were copy-pasted into FOUR places that had to agree and had no way to prove
// they did:
//     supabase/functions/razorpay-create-order/index.ts   (computeAmountRupees)
//     supabase/functions/razorpay-verify-payment/index.ts (computeAmountPaise)
//     supabase/functions/razorpay-webhook/index.ts        (adRows)
//     src/pages/Advertisements.tsx                        (the price the vendor is SHOWN)
// The client copy is unavoidable (a browser cannot import a Deno edge module),
// but it now mirrors `src/lib/adPricing.ts`, and `scripts/ad-pricing-check.mjs`
// asserts the two tables and both formulas agree. The three edge functions all
// import THIS file, so there is exactly one server-side formula.
//
// ── THE BUG THIS FIXES (Mitra's decision, 2026-09-14) ──
//
// `trustedSeal` (₹44) and `verifiedCertificate` (₹199) are properties of the
// VENDOR, not of a product: buying either lights the verified badge on every one
// of that vendor's product cards, via vendor_ad_verifications →
// vendor_profiles.ad_verified_until. Proven live: Demo Textiles Co. bought the
// seal against ONE product and the badge renders on all six of their listings.
//
// But billing multiplied every placement by the number of products in the order
// AND by the number of days. So a vendor buying the ₹199 certificate across
// 3 products for 30 days was charged 199 × 30 × 3 = ₹17,910 for one printed
// certificate, and the fulfilment trigger created THREE parcels. On the 365-day
// ends_at the live certificate campaigns actually carry, it is ₹72,635.
//
// Vendor-level types are now:
//   * charged ONCE per order — not once per product, and not once per day
//   * materialised as ONE campaign row with product_id = null
//
// ── STILL WRONG, DELIBERATELY NOT CHANGED HERE (see todo.md) ──
//
// Six more types are ADVERTISED at a flat price (`period: ""` in the Advertise
// catalogue) but are still billed per-day by the `days` multiplier below:
// wholesalerPick ₹59, brandAd ₹69, webMobileCombo ₹129, fbInsta ₹59,
// googleProduct ₹59, socialCombo ₹99. Repricing six live products is a business
// decision, not an engineering one, so their behaviour is unchanged and the
// discrepancy is logged for Mitra rather than silently "fixed". The two
// vendor-level types above are the exception only because per-vendor billing
// that still scales with campaign length is not per-vendor billing in any
// useful sense.
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
 * About the VENDOR, not a product. Charged once for the whole order and
 * materialised as a single campaign row with no product_id.
 *
 * These are also the only types billed FLAT (no × days) today — see the header.
 */
export const VENDOR_LEVEL_TYPES = new Set(["trustedSeal", "verifiedCertificate"]);

/** How many billing units one placement costs across a campaign of `days`. */
export function unitsFor(id: string, days: number): number {
  if (PER_MESSAGE_TYPES.has(id)) return 1;
  if (VENDOR_LEVEL_TYPES.has(id)) return 1; // flat, for the life of the campaign
  return days;
}

export function clampDays(days: unknown): number {
  const n = Math.floor(Number(days) || 1);
  return Math.max(1, n);
}

/** Split a purchase's placements by how they are billed and materialised. */
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

/** Rupee subtotal for a set of placements over `days`, for ONE product. */
export function subtotalRupees(ids: readonly string[], days: number): number {
  return ids.reduce((sum, id) => {
    const price = AD_PRICE[id];
    return price ? sum + price * unitsFor(id, days) : sum;
  }, 0);
}

export interface AdItem { productId: string; title: string; imageUrl: string | null }
export interface AdSpec {
  placementIds: string[];
  days: number;
  items: AdItem[];
  campaignLabel?: string;
  targetCategories?: string[];
  targetCities?: string[];
}

/**
 * What the vendor actually owes, in rupees.
 *
 *   per-product placements × number of products   +   vendor-level placements × 1
 *
 * The vendor-level term is deliberately NOT multiplied by item count. That is
 * the whole fix.
 */
export function computeOrderRupees(spec: AdSpec): number {
  const days = clampDays(spec?.days);
  const items = Math.max(1, (spec?.items ?? []).length);
  const { perProduct, vendorLevel } = splitPlacements(spec?.placementIds);
  return subtotalRupees(perProduct, days) * items + subtotalRupees(vendorLevel, days);
}

export function computeOrderPaise(spec: AdSpec): number {
  return computeOrderRupees(spec) * 100;
}

export function campaignEndIso(spec: AdSpec): string {
  return new Date(Date.now() + clampDays(spec?.days) * 86_400_000).toISOString();
}

export interface AdRow {
  vendor_id: string;
  product_id: string | null;
  title: string;
  image_url: string | null;
  daily_budget: number;
  placement: string;
  status: string;
  starts_at: string;
  ends_at: string;
  target_categories: string[] | null;
  target_cities: string[] | null;
}

/**
 * The campaign rows a paid order becomes.
 *
 *   * one row PER PRODUCT carrying the per-product placements
 *   * plus, if the order bought any vendor-level placement, exactly ONE more
 *     row carrying those, with product_id = null
 *
 * That second row is what stops a 3-product certificate order from creating
 * three campaigns, three seal grants and three physical parcels.
 *
 * Every row requests status 'active'; guard_ad_activation redirects it to
 * 'pending_review' on INSERT for any non-admin caller, service_role included.
 * Payment is never approval.
 */
export function buildAdRows(vendorId: string, spec: AdSpec): AdRow[] {
  const days = clampDays(spec?.days);
  const { perProduct, vendorLevel } = splitPlacements(spec?.placementIds);
  const startsAt = new Date().toISOString();
  const endsAt = campaignEndIso(spec);
  const label = spec?.campaignLabel || "Ad";
  const targetCategories =
    Array.isArray(spec?.targetCategories) && spec.targetCategories.length ? spec.targetCategories : null;
  const targetCities =
    Array.isArray(spec?.targetCities) && spec.targetCities.length ? spec.targetCities : null;

  const rows: AdRow[] = [];

  if (perProduct.length > 0) {
    const perProductRupees = subtotalRupees(perProduct, days);
    const dailyBudget = Math.max(1, Math.round(perProductRupees / days));
    for (const it of spec?.items ?? []) {
      rows.push({
        vendor_id: vendorId,
        product_id: it.productId,
        title: it.title ? `${it.title} — ${label}` : label,
        image_url: it.imageUrl ?? null,
        daily_budget: dailyBudget,
        placement: perProduct.join(","),
        status: "active",
        starts_at: startsAt,
        ends_at: endsAt,
        target_categories: targetCategories,
        target_cities: targetCities,
      });
    }
  }

  if (vendorLevel.length > 0) {
    const vendorRupees = subtotalRupees(vendorLevel, days);
    rows.push({
      vendor_id: vendorId,
      product_id: null,
      // Names the account, not a product — this row is not about a listing.
      title: `Account verification — ${label}`,
      image_url: null,
      daily_budget: Math.max(1, Math.round(vendorRupees / days)),
      placement: vendorLevel.join(","),
      status: "active",
      starts_at: startsAt,
      ends_at: endsAt,
      // A vendor-level entitlement is not targeted at a category or a city.
      target_categories: null,
      target_cities: null,
    });
  }

  return rows;
}
