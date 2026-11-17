// The Upload form's rules that don't need React (Seller Home audit SH-054, SH-058, SH-060, SH-061; 2026-11-17).
// Pure, so scripts/upload-form-check.mjs runs them.

/** Listing photos the bucket stores and every browser shows. BMP, TIFF and SVG passed `image/*` and the bucket refused them. */
export const LISTING_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const LISTING_PHOTO_ACCEPT = LISTING_PHOTO_TYPES.join(",");
/** The longest side of a listing photo once shrunk in the browser, as for every other upload (SH-061). */
export const LISTING_PHOTO_MAX_SIDE = 1600;

export const isListingPhotoType = (type: string) => (LISTING_PHOTO_TYPES as readonly string[]).includes(type);

type Value = string | string[] | undefined;

/** A form answer counts when it has text, or a list with something in it. */
export function isAnswered(v: Value): boolean {
  if (Array.isArray(v)) return v.some((x) => String(x).trim() !== "");
  return typeof v === "string" && v.trim() !== "";
}

/**
 * The required questions of one step that are still unanswered, by label (SH-054). Details: the product name and every
 * field the category marks required (Bag Type, Material, MOQ, Lead Time, Location, Country of Origin…). Pricing: the
 * price, for Publish only (a draft may leave it).
 */
export function missingRequired(
  step: string,
  fields: { id: string; label: string; required?: boolean }[],
  values: Record<string, Value>,
  extra: { productName: string; price: string; publishing: boolean },
): string[] {
  const out: string[] = [];
  if (step === "details") {
    if (!extra.productName.trim()) out.push("Product name");
    for (const f of fields) if (f.required && !isAnswered(values[f.id])) out.push(f.label);
  }
  if (step === "pricing" && extra.publishing && !extra.price.trim()) out.push("Price");
  return out;
}

/** "Bag Type", "Bag Type and Material", "Bag Type, Material and MOQ". */
export function listOf(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** What is kept of an unfinished new listing across a refresh (SH-060). Photos, videos and PDFs can't be kept. */
export interface UploadDraft {
  v: 1;
  selectedCategory: string | null;
  selectedSubCategory: string | null;
  selectedSubType: string | null;
  formValues: Record<string, string | string[]>;
  productName: string;
  productDescription: string;
  sku: string;
  price: string;
  unit: string;
  customizationAvailable: boolean;
}

export const uploadDraftKey = (userId: string) => `cosora.upload.draft.${userId}`;

export function draftHasAnswers(d: UploadDraft | null): boolean {
  if (!d) return false;
  return Boolean(d.selectedCategory || d.productName.trim() || d.productDescription.trim() || d.price.trim()
    || Object.values(d.formValues).some((v) => isAnswered(v)));
}

/** A stored draft, or null when there is none or it isn't one of ours. */
export function parseUploadDraft(raw: string | null): UploadDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<UploadDraft>;
    if (d?.v !== 1 || typeof d.formValues !== "object" || d.formValues === null) return null;
    return {
      v: 1,
      selectedCategory: typeof d.selectedCategory === "string" ? d.selectedCategory : null,
      selectedSubCategory: typeof d.selectedSubCategory === "string" ? d.selectedSubCategory : null,
      selectedSubType: typeof d.selectedSubType === "string" ? d.selectedSubType : null,
      formValues: d.formValues as Record<string, string | string[]>,
      productName: String(d.productName ?? ""),
      productDescription: String(d.productDescription ?? ""),
      sku: String(d.sku ?? ""),
      price: String(d.price ?? ""),
      unit: String(d.unit ?? ""),
      customizationAvailable: d.customizationAvailable === true,
    };
  } catch {
    return null;
  }
}
