// ─────────────────────────────────────────────────────────────
// GST — the browser's copy of supabase/functions/_shared/gst.ts.
//
// The plan checkout shows its GST line before a vendor pays (admin completion
// Phase 10, 2026-09-29). What is charged is always worked out by the edge
// function; this only decides the number shown beside it, so
// scripts/gst-check.mjs asserts the two copies agree for every whole rupee up to
// ₹1,00,000, the way src/lib/adPricing.ts is held to its twin.
//
// Dependency-free on purpose, so the check script can load it.
// ─────────────────────────────────────────────────────────────

/** The GST rate on Cosora's plans (18%). */
export const GST_RATE = 0.18;

/** GST on a whole-rupee price, rounded to the rupee, and the total with it. */
export function gstOn(baseRupees: number, rate: number = GST_RATE): { base: number; rate: number; gst: number; total: number } {
  const gst = Math.round(baseRupees * rate);
  return { base: baseRupees, rate, gst, total: baseRupees + gst };
}
