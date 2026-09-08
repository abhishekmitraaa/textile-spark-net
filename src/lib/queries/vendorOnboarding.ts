import { supabase } from "@/lib/supabase";
import { resolveCategoryId } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// Persist the vendor registration (8-step Onboarding) to the DB.
// Text/identity → vendor_profiles; KYC numbers + the uploaded scan →
// vendor_documents; the step-7 product becomes a real under_review listing
// with its images. Completing onboarding also flags the account as an
// onboarded seller.
//
// Everything here is written from files the vendor actually uploaded to
// storage first — the form used to hand blob: URLs straight to the DB, which
// die on reload and point at nothing for anyone else.
// ─────────────────────────────────────────────────────────────

export interface OnboardingProduct {
  name: string;
  price?: string;
  /** Selling unit for `price` — pieces/kg/meters/sets/pairs. */
  unit?: string;
  moq?: string;
  fabric?: string;
  gsm?: string;
  category?: string | null;
  sizes?: string[];
  /**
   * `products.colour` is ONE text value across this codebase (see
   * resolveColour in Upload.tsx, which truncates a multiselect the same way).
   * The onboarding chip picker is multi-select, so the first pick is the one
   * that lands on the listing and the form says so out loud rather than
   * silently dropping the rest.
   */
  colours?: string[];
  /** Public storage URLs, already uploaded. Become product_images rows. */
  images?: string[];
}

export interface VendorOnboardingPayload {
  businessName: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  addressLine?: string;
  area?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  landmark?: string;
  ownerName?: string;
  ownerEmail?: string;
  country?: string;
  pan?: string;
  gstin?: string;
  cin?: string;
  aadhaar?: string;
  /** Business categories (vendor_profiles.category). Empty = invisible to category search. */
  category?: string[];
  /** Public storage URLs of the premises photos (vendor_profiles.office_photos). */
  officePhotos?: string[];
  /** Public storage URL of the uploaded PAN scan → vendor_documents.file_url. */
  panFileUrl?: string;
  product?: OnboardingProduct;
}

// A rough completeness score (0–100) shown on the vendor dashboard.
function computeProfileScore(p: VendorOnboardingPayload): number {
  const checks = [
    !!p.businessName, !!p.phone, !!p.website, !!(p.addressLine || p.area || p.city),
    !!p.ownerName, !!p.ownerEmail, !!p.pan, !!p.gstin, !!p.product?.name,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export async function saveVendorOnboarding(vendorId: string, p: VendorOnboardingPayload): Promise<void> {
  const profile_score = computeProfileScore(p);

  const { error: pe } = await supabase.from("vendor_profiles").upsert(
    {
      id: vendorId,
      brand_name: p.businessName || null,
      phone: p.phone || null,
      whatsapp: p.whatsapp || null,
      website: p.website || null,
      address_line: p.addressLine || null,
      area: p.area || null,
      city: p.city || null,
      state: p.state || null,
      postal_code: p.postalCode || null,
      landmark: p.landmark || null,
      owner_name: p.ownerName || null,
      owner_email: p.ownerEmail || null,
      country: p.country || "India",
      pan: p.pan || null,
      gstin: p.gstin || null,
      cin: p.cin || null,
      // Arrays are written as-is: an empty array is a meaningful "none yet",
      // not the same thing as null, so the `|| null` used for empty strings
      // above would be wrong here.
      ...(p.category ? { category: p.category } : {}),
      ...(p.officePhotos ? { office_photos: p.officePhotos } : {}),
      onboarding_complete: true,
      profile_score,
    },
    { onConflict: "id" }
  );
  if (pe) throw pe;

  // Record which KYC documents were supplied, with the uploaded scan where
  // there is one. `verified` stays false: an admin flips it after review — this
  // app has no way to verify a PAN and must not claim it did.
  const docs = (
    [
      p.pan ? { doc_type: "pan", file_url: p.panFileUrl ?? null } : null,
      p.gstin ? { doc_type: "gst", file_url: null } : null,
      p.cin ? { doc_type: "cin", file_url: null } : null,
      p.aadhaar ? { doc_type: "aadhaar", file_url: null } : null,
    ].filter(Boolean) as { doc_type: string; file_url: string | null }[]
  ).map((d) => ({ vendor_id: vendorId, ...d }));
  if (docs.length) {
    // Onboarding can legitimately be submitted twice (a failed product insert,
    // a retried submit). There is no unique constraint on (vendor_id,
    // doc_type), so clear this vendor's rows for exactly the types being
    // rewritten first — otherwise /kyc grows a duplicate row per attempt.
    const { error: dde } = await supabase
      .from("vendor_documents")
      .delete()
      .eq("vendor_id", vendorId)
      .in("doc_type", docs.map((d) => d.doc_type));
    if (dde) throw dde;
    const { error: de } = await supabase.from("vendor_documents").insert(docs);
    if (de) throw de;
  }

  // The step-7 product becomes a real listing (buyers see it once approved).
  if (p.product?.name) {
    const category_id = await resolveCategoryId(p.product.category, p.product.name);
    const { data: created, error: prErr } = await supabase
      .from("products")
      .insert({
        vendor_id: vendorId,
        name: p.product.name,
        price_value: p.product.price ? Number(p.product.price) : null,
        currency: "₹",
        category_id,
        moq: p.product.moq || "2",
        unit: p.product.unit || null,
        fabric: p.product.fabric || null,
        gsm: p.product.gsm || null,
        sizes: p.product.sizes?.length ? p.product.sizes : null,
        colour: p.product.colours?.[0] ?? null,
        status: "under_review",
      })
      .select("id")
      .single();
    if (prErr) throw prErr;

    const images = p.product.images ?? [];
    if (created && images.length > 0) {
      const { error: imgErr } = await supabase
        .from("product_images")
        .insert(images.map((url, i) => ({ product_id: created.id, url, position: i })));
      if (imgErr) throw imgErr;
    }
  }

  // Mark the account as an onboarded seller (best-effort; non-blocking).
  await supabase.from("profiles").update({ active_role: "seller", onboarded: true }).eq("id", vendorId);
}

// ─────────────────────────────────────────────────────────────
// Uploads for the registration form. Both land in the public `product-images`
// bucket under the vendor's own folder, matching uploadVendorImage /
// uploadVendorGalleryImage in vendorStore.ts.
// ─────────────────────────────────────────────────────────────

/**
 * The KYC scan (PAN card). Kept under `<vendor>/kyc/` so it is distinguishable
 * from catalogue imagery at a glance in the bucket.
 *
 * Honest limitation: `product-images` is a PUBLIC bucket. That is where every
 * other vendor asset in this app lives and moving KYC to a private bucket with
 * signed URLs is a change to the storage model, not to this form — flagged in
 * the report rather than half-done here.
 */
export async function uploadKycDocument(vendorId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${vendorId}/kyc/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

/** One image for the step-7 product. Mirrors Upload.tsx's `<vendor>/<key>/<i>` shape. */
export async function uploadOnboardingProductImage(vendorId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${vendorId}/onboarding-product/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
