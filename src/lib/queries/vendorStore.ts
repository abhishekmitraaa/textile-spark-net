import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// The vendor's OWN store profile (vendor_profiles row) — read + write.
// This is the same row the buyer-facing /vendor/:id page reads, so edits
// here surface directly to buyers. Logo/banner assets reuse the existing
// public `product-images` bucket under the vendor's own folder.
// ─────────────────────────────────────────────────────────────

export interface VendorStoreData {
  id: string;
  brandName: string;
  about: string;
  city: string;
  state: string;
  country: string;
  businessType: string;
  website: string;
  phone: string;
  whatsapp: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  addressLine: string;
  area: string;
  postalCode: string;
  landmark: string;
  ownerName: string;
  ownerEmail: string;
  pan: string;
  gstin: string;
  cin: string;
  isVerified: boolean;
  followers: number;
  ratingAvg: number;
  reviewsCount: number;
  profileScore: number;
  onboardingComplete: boolean;
}

async function fetchMyVendorProfile(id: string): Promise<VendorStoreData | null> {
  const { data, error } = await supabase.from("vendor_profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    brandName: data.brand_name ?? "",
    about: data.about ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
    country: data.country ?? "India",
    businessType: data.business_type ?? "",
    website: data.website ?? "",
    phone: data.phone ?? "",
    whatsapp: data.whatsapp ?? "",
    logoUrl: data.logo_url,
    bannerUrl: data.banner_url,
    addressLine: data.address_line ?? "",
    area: data.area ?? "",
    postalCode: data.postal_code ?? "",
    landmark: data.landmark ?? "",
    ownerName: data.owner_name ?? "",
    ownerEmail: data.owner_email ?? "",
    pan: data.pan ?? "",
    gstin: data.gstin ?? "",
    cin: data.cin ?? "",
    isVerified: data.is_verified,
    followers: data.followers_count,
    ratingAvg: Number(data.rating_avg),
    reviewsCount: data.reviews_count,
    profileScore: data.profile_score,
    onboardingComplete: data.onboarding_complete,
  };
}

export function useMyVendorProfile(id: string | undefined) {
  return useQuery({
    queryKey: ["vendor_profile", "mine", id],
    queryFn: () => fetchMyVendorProfile(id as string),
    enabled: Boolean(id),
  });
}

export interface VendorStorePatch {
  brandName?: string;
  about?: string;
  city?: string;
  state?: string;
  country?: string;
  businessType?: string;
  website?: string;
  phone?: string;
  whatsapp?: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  addressLine?: string;
  area?: string;
  postalCode?: string;
  landmark?: string;
}

export async function saveVendorProfile(id: string, p: VendorStorePatch): Promise<void> {
  const row: Record<string, unknown> = { id };
  if (p.brandName !== undefined) row.brand_name = p.brandName || null;
  if (p.about !== undefined) row.about = p.about || null;
  if (p.city !== undefined) row.city = p.city || null;
  if (p.state !== undefined) row.state = p.state || null;
  if (p.country !== undefined) row.country = p.country || null;
  if (p.businessType !== undefined) row.business_type = p.businessType || null;
  if (p.website !== undefined) row.website = p.website || null;
  if (p.phone !== undefined) row.phone = p.phone || null;
  if (p.whatsapp !== undefined) row.whatsapp = p.whatsapp || null;
  if (p.logoUrl !== undefined) row.logo_url = p.logoUrl;
  if (p.bannerUrl !== undefined) row.banner_url = p.bannerUrl;
  if (p.addressLine !== undefined) row.address_line = p.addressLine || null;
  if (p.area !== undefined) row.area = p.area || null;
  if (p.postalCode !== undefined) row.postal_code = p.postalCode || null;
  if (p.landmark !== undefined) row.landmark = p.landmark || null;
  const { error } = await supabase.from("vendor_profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

// Upload a store asset (logo/banner) to the public product-images bucket under
// the vendor's own folder; returns the public URL.
export async function uploadVendorImage(id: string, file: File, kind: "logo" | "banner"): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${id}/store/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
