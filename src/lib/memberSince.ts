import { differenceInCalendarMonths, formatDistanceToNowStrict } from "date-fns";

/**
 * "Cosora Member Since", from the vendor row's created_at. Both the vendor's own
 * Business Profile and the public /vendor/:id page show it, so they read the
 * same: it used to be the literal "1 Year" for every vendor on both.
 *
 * Null when there is no usable date; the caller decides what an unknown reads as.
 */
export function memberSinceLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  // Under a month reads better as "New this month" than "0 months".
  if (differenceInCalendarMonths(new Date(), created) < 1) return "New this month";
  return formatDistanceToNowStrict(created, { unit: "month", roundingMethod: "floor" })
    .replace(/^(\d+) months?$/, (_m, n) => (Number(n) >= 12
      ? formatDistanceToNowStrict(created, { unit: "year", roundingMethod: "floor" })
      : `${n} month${Number(n) === 1 ? "" : "s"}`));
}
