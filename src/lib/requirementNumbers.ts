/**
 * Numbers out of what a buyer typed in a requirement form (2026-10-18 buyer audit).
 *
 * The forms used to strip every non-digit and read what was left: "12.50" became 1250, "1.5 tons"
 * became 15 and "500 kg / 2 tons" became 5002. Now the FIRST number is read, with its decimals and
 * with thousands separators (Indian or Western) removed: "₹12.50" → 12.5, "1,00,000 pcs" → 100000,
 * "500 kg / 2 tons" → 500. What the buyer typed is still kept whole elsewhere (the requirement's
 * attributes, or the Quick Quote's notes), so a number that can't be read is never lost.
 */

/** rfqs.quantity / rfq_submissions.quantity allow 0 to 100,000,000. */
export const MAX_QUANTITY = 100_000_000;

/** The first number in the text, or null. */
export function firstNumber(v: unknown): number | null {
  const m = String(v ?? "").match(/\d[\d,]*(?:\.\d+)?|\.\d+/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** A whole quantity for the quantity column: null when unreadable, zero or past the column's limit. */
export function quantityFrom(v: unknown): number | null {
  const n = firstNumber(v);
  if (n == null) return null;
  const whole = Math.round(n);
  return whole > 0 && whole <= MAX_QUANTITY ? whole : null;
}

/** An amount for a budget column, to the paisa: null when unreadable. */
export function amountFrom(v: unknown): number | null {
  const n = firstNumber(v);
  if (n == null || n < 0) return null;
  return Math.round(n * 100) / 100;
}
