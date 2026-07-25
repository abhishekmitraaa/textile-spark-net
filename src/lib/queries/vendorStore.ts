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
  /** Business categories the vendor sells in (vendor_profiles.category, text[]). */
  category: string[];
  /** Public URLs of office/premises photos (vendor_profiles.office_photos, text[]). */
  officePhotos: string[];
  yearEstablished: number | null;
  /** Free-text bucket, e.g. "250 - 500". Not a number: the UI offers ranges. */
  employeeCount: string;
  /** platform slug -> list of profile URLs, e.g. { instagram: ["https://..."] }. */
  social: Record<string, string[]>;
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
    category: data.category ?? [],
    officePhotos: data.office_photos ?? [],
    yearEstablished: data.year_established,
    employeeCount: data.employee_count ?? "",
    social: (data.social as Record<string, string[]> | null) ?? {},
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
  // owner_name / owner_email existed as columns and were already read by
  // fetchMyVendorProfile, but had no write path until now.
  ownerName?: string;
  ownerEmail?: string;
  category?: string[];
  officePhotos?: string[];
  yearEstablished?: number | null;
  employeeCount?: string;
  social?: Record<string, string[]>;
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
  if (p.ownerName !== undefined) row.owner_name = p.ownerName || null;
  if (p.ownerEmail !== undefined) row.owner_email = p.ownerEmail || null;
  // Arrays and jsonb are written as-is: an empty array/object is a meaningful
  // "cleared" value here, not the same thing as null, so the `|| null` coercion
  // used for empty strings above would be wrong.
  if (p.category !== undefined) row.category = p.category;
  if (p.officePhotos !== undefined) row.office_photos = p.officePhotos;
  if (p.yearEstablished !== undefined) row.year_established = p.yearEstablished;
  if (p.employeeCount !== undefined) row.employee_count = p.employeeCount || null;
  if (p.social !== undefined) row.social = p.social;
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

// Upload one office/premises photo. Same bucket and shape as uploadVendorImage,
// but gallery images accumulate rather than replace, so the filename carries a
// random suffix as well as a timestamp: a multi-file picker can fire several
// uploads inside the same millisecond and `upsert: true` would silently
// overwrite the earlier ones.
export async function uploadVendorGalleryImage(id: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${id}/office/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

// ─────────────────────────────────────────────────────────────
// Vendor Settings (notifications / regional) — JSON on vendor_profiles.
// Mirrors the buyer-side useSettings/saveSetting in queries/profile.ts. Each
// key merges with its defaults object so a missing key (or missing row) falls
// back rather than reading as undefined. Social links are NOT settings and do
// not live here: they are profile content on `vendor_profiles.social`, read and
// written through VendorStoreData/VendorStorePatch above.
//
// Honest limitation: these toggles persist a real preference but nothing yet
// *sends* an email/push based on them (no delivery pipeline). The UI copy
// reflects that — it lets a vendor choose what they'd like to be notified about.
// ─────────────────────────────────────────────────────────────

export interface VendorNotificationSettings {
  emailNewRfq: boolean;
  emailNewMessage: boolean;
  emailAdStatus: boolean;
  emailPlanExpiry: boolean;
  emailProductStatus: boolean;
  emailNewsletter: boolean;
  pushNewRfq: boolean;
  pushNewMessage: boolean;
  pushNewLead: boolean;
}

export interface VendorRegionalSettings {
  language: "en" | "hi" | "gu";
}

export const DEFAULT_VENDOR_NOTIFICATIONS: VendorNotificationSettings = {
  emailNewRfq: true,
  emailNewMessage: true,
  emailAdStatus: true,
  emailPlanExpiry: true,
  emailProductStatus: true,
  emailNewsletter: false,
  pushNewRfq: true,
  pushNewMessage: true,
  pushNewLead: true,
};

export const DEFAULT_VENDOR_REGIONAL: VendorRegionalSettings = { language: "en" };

export interface VendorSettings {
  notifications: VendorNotificationSettings;
  regional: VendorRegionalSettings;
}

export function useVendorSettings(id: string | undefined) {
  return useQuery({
    queryKey: ["vendor_settings", id],
    queryFn: async (): Promise<VendorSettings> => {
      const { data } = await supabase
        .from("vendor_profiles")
        .select("notifications, regional")
        .eq("id", id as string)
        .maybeSingle();
      return {
        notifications: { ...DEFAULT_VENDOR_NOTIFICATIONS, ...((data?.notifications as Partial<VendorNotificationSettings>) ?? {}) },
        regional: { ...DEFAULT_VENDOR_REGIONAL, ...((data?.regional as Partial<VendorRegionalSettings>) ?? {}) },
      };
    },
    enabled: Boolean(id),
  });
}

export async function saveVendorSetting(
  id: string,
  key: "notifications" | "regional",
  value: VendorNotificationSettings | VendorRegionalSettings
): Promise<void> {
  const { error } = await supabase.from("vendor_profiles").upsert({ id, [key]: value }, { onConflict: "id" });
  if (error) throw error;
}
