// ─────────────────────────────────────────────────────────────
// GSTIN and PAN checks (subscriptions P0, 2026-10-08).
//
// The GSTIN rule mirrors public.gstin_is_valid() in the database: 2 digits (the
// state's GST code), the PAN, an entity number (1-9 or A-Z), Z, and a check
// character, the GSTN mod-36 checksum over the first 14 characters. Keep the two in
// step: scripts/tax-id-check.mjs runs the same cases as the migration's self-check.
// Pure functions, no imports, so Node can load this file.
// ─────────────────────────────────────────────────────────────

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Upper-cased, with spaces removed: how a typed tax id is compared and stored. */
export function normaliseTaxId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidPan(value: string): boolean {
  return PAN_SHAPE.test(value);
}

export function isValidGstin(value: string): boolean {
  if (!GSTIN_SHAPE.test(value)) return false;
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(value[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (total % 36)) % 36] === value[14];
}

/** The PAN inside a GSTIN (characters 3 to 12). */
export function panOfGstin(gstin: string): string {
  return gstin.slice(2, 12);
}
