// A listing's other category answers (`products.attributes`) as specification rows on the product page
// (Mitra, 2026-11-24: "make sure every listing has all the descriptions filled").
//
// Labels and order are the listing form's own (useVocabulary(): the database's definitions in the reader's
// language): the sub-category's questions first, then the category's, then the seller type's. A key the form no
// longer asks keeps a label made from its id. Keys the page already shows from a column, and the seller's own SKU,
// are left out.
import type { FormField, Vocabulary } from "@/data/sellerCategories";
import { PRODUCT_COLUMN_FIELDS } from "@/lib/formAttributes";

export interface AttributeSpec { label: string; value: string }

/** Kept in attributes but shown elsewhere, or not for buyers. */
const NOT_SHOWN: ReadonlySet<string> = new Set([...PRODUCT_COLUMN_FIELDS, "sku", "colours"]);

/** "turnaroundTime" -> "Turnaround time". */
function humanise(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function valueText(v: unknown): string | null {
  if (v === true) return "Yes";
  if (Array.isArray(v)) {
    const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return items.length ? items.join(", ") : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "string") return v.trim() || null;
  return null;
}

/** The form's questions for a listing filed under `categoryName` (a sub-category's name), in the form's order. */
function formFields(categoryName: string | null, vocab: Vocabulary): FormField[] {
  const out: FormField[] = [];
  if (!categoryName) return out;
  const name = categoryName.trim().toLowerCase();
  for (const cat of vocab.categories) {
    const sub = cat.subCategories.find((s) => s.name.trim().toLowerCase() === name);
    const own = cat.name.trim().toLowerCase() === name;
    if (!sub && !own) continue;
    out.push(...(sub?.fields ?? []));
    out.push(...(cat.commonFields ?? []).filter((f) => !sub || !f.appliesTo || f.appliesTo.includes(sub.id)));
    out.push(...(vocab.baseFields[cat.type] ?? []));
  }
  // A buyer-side category the listing form doesn't offer still has the product form's base questions.
  if (out.length === 0) out.push(...(vocab.baseFields.product ?? []));
  return out;
}

export function attributeSpecs(
  attributes: Record<string, unknown> | null | undefined,
  categoryName: string | null,
  vocab: Vocabulary,
): AttributeSpec[] {
  if (!attributes) return [];
  const fields = formFields(categoryName, vocab);
  const labelOf = new Map<string, string>();
  const order: string[] = [];
  for (const f of fields) {
    if (!labelOf.has(f.id)) {
      labelOf.set(f.id, f.label);
      order.push(f.id);
    }
  }
  if ("subType" in attributes && !labelOf.has("subType")) labelOf.set("subType", "Type");
  const keys = Object.keys(attributes).filter((k) => !NOT_SHOWN.has(k));
  keys.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return a.localeCompare(b);
  });
  return keys.flatMap((key) => {
    const value = valueText(attributes[key]);
    return value ? [{ label: labelOf.get(key) ?? humanise(key), value }] : [];
  });
}
