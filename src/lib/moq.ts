/**
 * A listing's minimum order as text (2026-11-20, review L-18). Upload stores the MOQ as typed and the price unit
 * apart, so a bare number ("2") gets the listing's unit ("2 pieces"); an MOQ that already says its unit, or a
 * listing without one, is shown as listed. `feed_products()` applies the same rule in SQL (migration
 * 20261120110000): change both together.
 */
const PLURAL_UNITS = new Set(["yard", "meter", "piece", "dozen", "set", "project", "hour", "day", "month"]);

export function moqWithUnit(moq: string | null | undefined, unit: string | null | undefined): string | null {
  const m = moq?.trim() || null;
  const u = unit?.trim() || null;
  if (!m || !u || !/^\d+$/.test(m)) return m;
  return `${m} ${u}${m !== "1" && PLURAL_UNITS.has(u) ? "s" : ""}`;
}
