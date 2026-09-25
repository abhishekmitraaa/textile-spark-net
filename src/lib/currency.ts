// ─────────────────────────────────────────────────────────────
// Display currency (Phase 20 of the My Profile brief, 2026-09-24, MPF-11).
//
// A buyer's Regional Settings currency (₹ INR, $ USD, € EUR, £ GBP) converts the
// INR prices the buyer app DISPLAYS, using the daily rates in public.fx_rates
// (the fx-rates-refresh edge function, from the ECB's euro reference rates via
// Frankfurter).
//
// DISPLAY ONLY. Every price is set, quoted, paid, settled and invoiced in INR:
// vendor payment terms, Cosora's own plans and GST invoices do not change. So a
// converted figure is always marked "≈", and the page says so
// (ConvertedPriceNote). Amounts a buyer types (an RFQ budget) stay INR.
//
// With INR chosen, nothing chosen, or no rates yet, every call site gets back the
// exact INR text it rendered before this existed (DisplayCurrencyContext).
// ─────────────────────────────────────────────────────────────

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";
const CODES: readonly CurrencyCode[] = ["INR", "USD", "EUR", "GBP"];

/** "$ USD", the form Regional Settings stores, → "USD". Unset or unknown → INR. */
export function currencyCodeOf(setting: string | null | undefined): CurrencyCode {
  const code = (setting ?? "").trim().split(/\s+/).pop()?.toUpperCase();
  return CODES.includes(code as CurrencyCode) ? (code as CurrencyCode) : "INR";
}

/** A price's own currency as the app stores it ("₹" on products and quotes). */
export function isInrSymbol(currency: string | null | undefined): boolean {
  const c = (currency ?? "₹").trim().toUpperCase();
  return c === "₹" || c === "INR" || c === "RS" || c === "RS.";
}

export interface FxRates {
  /** Units of each currency per rupee; INR is 1. */
  rates: Partial<Record<CurrencyCode, number>>;
  /** The day the source published these rates (YYYY-MM-DD). */
  ratesDate: string;
  /** When Cosora last refreshed them. */
  updatedAt: string;
}

/**
 * An amount in `currency`. INR is formatINR's exact shape (en-IN grouping, no
 * paise), and formatINR now calls this. Other currencies show cents, since a
 * converted unit price is often a few dollars.
 */
export function formatCurrency(amount: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency", currency, maximumFractionDigits: currency === "INR" ? 0 : 2,
  }).format(amount);
}

/**
 * `amountInInr` shown in `currency`, or null when there is no rate for it.
 * Plain formatting: the "≈" and the display-only note are the caller's job.
 */
export function formatInCurrency(amountInInr: number, currency: CurrencyCode, fx?: FxRates | null): string | null {
  if (!Number.isFinite(amountInInr)) return null;
  if (currency === "INR") return formatCurrency(amountInInr, "INR");
  const rate = fx?.rates[currency];
  if (!rate || !Number.isFinite(rate)) return null;
  return formatCurrency(amountInInr * rate, currency);
}

/** "24 Sep": the day a set of rates was published (a YYYY-MM-DD date). */
export function formatRateDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

// "₹450", "₹ 450", "₹1,200.50": the app's own INR price text.
const INR_AMOUNT = /₹\s?(\d[\d,]*(?:\.\d+)?)/g;

/**
 * Every ₹ amount in `text` converted, "≈" before the first:
 * "₹5,000 - ₹50,000" → "≈ $52.11 - $521.05". Unchanged if nothing matches or a
 * rate is missing.
 */
export function convertInrText(text: string, currency: CurrencyCode, fx?: FxRates | null): string {
  if (currency === "INR" || typeof text !== "string") return text;
  let first = true;
  let failed = false;
  const out = text.replace(INR_AMOUNT, (whole, n: string) => {
    const converted = formatInCurrency(Number(n.replace(/,/g, "")), currency, fx);
    if (converted == null) { failed = true; return whole; }
    const s = first ? `≈ ${converted}` : converted;
    first = false;
    return s;
  });
  return failed ? text : out;
}
