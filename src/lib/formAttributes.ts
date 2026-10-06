// What the product and requirement forms keep in `attributes` (Ranking Part 1, F1;
// documentation/ranking-foundations-design-2026-10-07.md).
//
// Both forms ask each category's questions, but until F1 they kept only the answers that
// had a column of their own and threw the rest away. `products.attributes` and
// `rfqs.attributes` now keep the rest, keyed by the form's own field ids. The database
// folds the values into search_text (attributes_search_text), so search and the
// embeddings use them; Parts 2 and 3 of the ranking read them too.
//
// Values are cleaned the same way on both sides: strings trimmed, blank answers and
// emptied lists dropped, a ticked checkbox ("true") stored as true and an unticked one
// ("false") not stored at all.

export type AttributeValue = string | string[] | boolean;
export type Attributes = Record<string, AttributeValue>;

/**
 * Product form fields that write a `products` column (or the form's own state) and so
 * never go into `attributes`. Keep in step with Upload.tsx's insert and update.
 */
export const PRODUCT_COLUMN_FIELDS: ReadonlySet<string> = new Set([
  "moq", "fabric", "gsm", "fit", "fit_type", "gender", "sizes", "colors", "color", "pattern", "occasion",
  "neckType", "sleeveType", "collarType", "originCountry", "waistSizes", "lengths", "location",
  "customizationAvailable",
]);

/** Requirement form keys that are stored elsewhere on the requirement, not in attributes. */
const REQUIREMENT_OWN_FIELDS: ReadonlySet<string> = new Set(["description"]);

function clean(value: unknown): AttributeValue | null {
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v ?? "").trim()).filter((v) => v !== "");
    return items.length > 0 ? items : null;
  }
  if (typeof value === "boolean") return value ? true : null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "true") return true;
    if (s === "false" || s === "") return null;
    return s;
  }
  return null;
}

function collect(values: Record<string, unknown>, skip: ReadonlySet<string>): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(values)) {
    if (skip.has(key)) continue;
    const cleaned = clean(value);
    if (cleaned !== null) out[key] = cleaned;
  }
  return out;
}

/** The product form's answers that have no column of their own. */
export function productAttributes(values: Record<string, unknown>): Attributes {
  return collect(values, PRODUCT_COLUMN_FIELDS);
}

/** The requirement form's category answers. */
export function requirementAttributes(values: Record<string, unknown>): Attributes {
  return collect(values, REQUIREMENT_OWN_FIELDS);
}

/** "fabricType" or "gsm_range" -> "Fabric type" / "Gsm range". */
function humanise(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Attributes as label/value pairs for display, ordered by key. Labels are humanised
 * from the field ids until F3 brings labelled definitions.
 */
export function attributeDetails(attributes: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  if (!attributes) return [];
  return Object.keys(attributes)
    .sort((a, b) => a.localeCompare(b))
    .flatMap((key) => {
      const v = clean(attributes[key]);
      if (v === null) return [];
      // clean() returns true for a ticked box and never false, so any boolean reads "Yes".
      const value = typeof v === "boolean" ? "Yes" : Array.isArray(v) ? v.join(", ") : v;
      return [{ label: humanise(key), value }];
    });
}
