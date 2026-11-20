/**
 * A listing's minimum order as text (2026-11-20, review L-18). Upload stores the MOQ as typed and the price unit
 * apart, so a bare number ("2") gets the listing's unit ("2 pieces"); an MOQ that already says its unit, or a listing
 * without one, is shown as listed. The unit is read like `sellingUnit()` (lower case, "pcs" → "piece", "meter" →
 * "metre"), then made plural for any count but 1. `public.moq_text()` (migration 20261120110000) is the same rule for
 * `feed_products()`: change both together.
 */
const UNIT_SINGULAR: Record<string, string> = {
  pieces: "piece", pcs: "piece", pc: "piece", sets: "set", metres: "metre", meters: "metre", meter: "metre",
  kgs: "kg", dozens: "dozen", yards: "yard", rolls: "roll", pairs: "pair",
  projects: "project", hours: "hour", days: "day", months: "month",
};
const COUNTABLE = new Set(["piece", "set", "metre", "dozen", "yard", "roll", "pair", "project", "hour", "day", "month"]);

export function moqWithUnit(moq: string | null | undefined, unit: string | null | undefined): string | null {
  const m = moq?.trim() || null;
  const raw = unit?.trim().toLowerCase() || null;
  if (!m || !raw || !/^\d+$/.test(m)) return m;
  const u = UNIT_SINGULAR[raw] ?? raw;
  return `${m} ${u}${m !== "1" && COUNTABLE.has(u) ? "s" : ""}`;
}
