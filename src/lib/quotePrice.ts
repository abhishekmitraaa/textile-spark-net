/**
 * A quote's price per unit as the seller typed it (Seller Home audit SH-081): a number above 0 with at most two decimal
 * places ("450", "450.75", "1,200.50"). Anything else is null, and the form says so: the forms tested only
 * `if (!price)`, so -5 went in. The database holds the same floor (quotes_price_positive) and the column's
 * numeric(12,2) holds the rest.
 */
export const QUOTE_PRICE_MAX = 9_999_999_999.99;
export function quotePrice(text: string): number | null {
  const t = text.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= QUOTE_PRICE_MAX ? n : null;
}

/** An optional MOQ: blank is none; otherwise a whole number above 0. `undefined` means it isn't one. */
export function quoteMoq(text: string): number | null | undefined {
  const t = text.replace(/,/g, "").trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n > 0 && n <= 2_147_483_647 ? n : undefined;
}
