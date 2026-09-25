// ─────────────────────────────────────────────────────────────
// GST on a charge Cosora makes — single source of truth (Phase 20 of the My
// Profile brief, 2026-09-24, MPF-11 part B).
//
// WHERE IT CAME FROM. The vendor subscription flow computed GST in three copies
// that had to agree:
//     supabase/functions/subscription-create-order/index.ts   (the Razorpay order amount)
//     supabase/functions/subscription-verify-payment/index.ts (the invoice's gst_amount)
//     supabase/functions/subscription-webhook/index.ts        (the invoice's gst_amount)
// each as `const GST_RATE = 0.18; const gst = Math.round(base * GST_RATE);`. All
// three now import this file, with the same result for every amount
// (scripts/gst-check.mjs proves it). The formula as found, not assumed:
//   - one rate, 18%, for every plan and billing cycle: Cosora's plans are one kind
//     of service, so there is no per-category rate in the code;
//   - on the whole-rupee base price (subscription_plans.monthly_price / yearly_price);
//   - rounded to the nearest whole rupee (Math.round), then total = base + gst;
//     the Razorpay amount is total × 100 paise;
//   - the GSTIN a vendor gives is only recorded on the order and the invoice. It
//     changes nothing in the arithmetic: no CGST/SGST vs IGST split, no reverse
//     charge. That is the flow as built, not a tax opinion.
//
// READY, AND NOT CALLED BY ANYTHING BUYER-FACING. Buyers pay Cosora nothing
// today: plans, ads and certificates are all bought by vendors. So nothing in
// the buyer app charges tax, and nothing should be built or simulated just to
// call this. When a real buyer-facing paid feature exists, its edge function
// imports gstOn() here, passing its own rate if its service has a different one.
// A price the browser SHOWS before paying would need a client mirror kept in
// step by a check script, the way src/lib/adPricing.ts mirrors adPricing.ts.
//
// No imports and no Deno APIs, so Node's type stripping can load it directly
// (scripts/gst-check.mjs).
// ─────────────────────────────────────────────────────────────

/** The GST rate on Cosora's plans (18%), as the subscription flow has always charged it. */
export const GST_RATE = 0.18;

export interface GstBreakdown {
  /** The price before tax, in whole rupees. */
  base: number;
  /** The rate applied, e.g. 0.18. */
  rate: number;
  /** GST in whole rupees: Math.round(base × rate). */
  gst: number;
  /** base + gst, in whole rupees. Razorpay wants total × 100 (paise). */
  total: number;
}

/**
 * GST on a whole-rupee price, rounded to the rupee. Exactly the arithmetic the
 * three copies did, so it validates nothing: the callers already refuse a
 * missing or zero price, and a caller with new inputs should check its own.
 */
export function gstOn(baseRupees: number, rate: number = GST_RATE): GstBreakdown {
  const gst = Math.round(baseRupees * rate);
  return { base: baseRupees, rate, gst, total: baseRupees + gst };
}
