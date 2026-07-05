import { supabase } from "@/lib/supabase";
import { resolveCategoryId } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// Persist the vendor registration (8-step Onboarding) to the DB.
// Text/identity → vendor_profiles; KYC numbers → vendor_documents (scan files
// attachable later); the step-7 product becomes a real under_review listing.
// Completing onboarding also flags the account as an onboarded seller.
// ─────────────────────────────────────────────────────────────

export interface OnboardingProduct {
  name: string;
  price?: string;
  moq?: string;
  fabric?: string;
  gsm?: string;
  category?: string | null;
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
      onboarding_complete: true,
      profile_score,
    },
    { onConflict: "id" }
  );
  if (pe) throw pe;

  // Record which KYC documents were supplied (scan files can be attached later).
  const docs = (
    [
      p.pan ? "pan" : null,
      p.gstin ? "gst" : null,
      p.cin ? "cin" : null,
      p.aadhaar ? "aadhaar" : null,
    ].filter(Boolean) as string[]
  ).map((doc_type) => ({ vendor_id: vendorId, doc_type }));
  if (docs.length) {
    const { error: de } = await supabase.from("vendor_documents").insert(docs);
    if (de) throw de;
  }

  // The step-7 product becomes a real listing (buyers see it once approved).
  if (p.product?.name) {
    const category_id = await resolveCategoryId(p.product.category, p.product.name);
    const { error: prErr } = await supabase.from("products").insert({
      vendor_id: vendorId,
      name: p.product.name,
      price_value: p.product.price ? Number(p.product.price) : null,
      currency: "₹",
      category_id,
      moq: p.product.moq || "2",
      fabric: p.product.fabric || null,
      gsm: p.product.gsm || null,
      status: "under_review",
    });
    if (prErr) throw prErr;
  }

  // Mark the account as an onboarded seller (best-effort; non-blocking).
  await supabase.from("profiles").update({ active_role: "seller", onboarded: true }).eq("id", vendorId);
}
