import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/** The exact shape a `vendor_profiles` insert accepts. */
type VendorProfileInsert = Database["public"]["Tables"]["vendor_profiles"]["Insert"];

/**
 * Write the signed-in vendor's own `vendor_profiles` row: UPDATE it, or INSERT it
 * on a first save. Every client write to the table goes through here.
 *
 * Never an upsert that updates. `INSERT ... ON CONFLICT DO UPDATE SET col =
 * EXCLUDED.col` needs SELECT on every column it copies, and a vendor's PAN, email,
 * phone, WhatsApp and street address aren't client-readable (admin completion
 * Phase 4b): the Phase 4b rehearsal refused exactly that with 42501. A plain UPDATE
 * or INSERT, and `ON CONFLICT DO NOTHING`, need no SELECT on what they write.
 */
export async function writeOwnVendorRow(row: VendorProfileInsert): Promise<void> {
  const { id, ...patch } = row;
  const hasPatch = Object.keys(patch).length > 0;
  if (hasPatch) {
    const { data, error } = await supabase.from("vendor_profiles").update(patch).eq("id", id).select("id");
    if (error) throw error;
    if (data && data.length > 0) return;
  }
  // No row yet: this save creates it. ON CONFLICT DO NOTHING returns no row when
  // another save created it in between, and then the patch goes to that row.
  const { data: inserted, error: insertError } = await supabase
    .from("vendor_profiles")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (insertError) throw insertError;
  if ((inserted && inserted.length > 0) || !hasPatch) return;
  const { data: again, error: againError } = await supabase
    .from("vendor_profiles")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (againError) throw againError;
  // Zero rows twice means RLS refused the row: never report that as saved.
  if (!again || again.length === 0) throw new Error("Couldn't save your business profile. Please try again.");
}

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
  /** Admin-set verification is only one of the three inputs to the displayed
   *  trust seal — see trustSealFromParts(). Both of these feed it, and the
   *  buyer-facing /vendor/:id page computes the seal from the same three, so
   *  the vendor sees exactly the badge buyers see. */
  planExpiresAt: string | null;
  adVerifiedUntil: string | null;
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
  /** Turnover band, e.g. "Rs 1 - 5 Cr". Same range-picker shape as employeeCount. */
  annualTurnover: string;
  /** Manufacturing capacity bands. Empty means unset — never a default of ["Medium"]. */
  capacity: string[];
  /** platform slug -> list of profile URLs, e.g. { instagram: ["https://..."] }. */
  social: Record<string, string[]>;
  /** Ordered, curated product ids featured in "Brand's Recommendations".
   *  Order is meaningful — it is the order the vendor dragged them into. */
  recommendedProductIds: string[];
  /** ISO timestamp the vendor row was created — drives "Cosora Member Since",
   *  which was the literal string "1 Year" for every vendor. */
  createdAt: string;
}

// Every column the store screens show, named. Not `*`: that pulled the 1,536-
// dimension catalog_embedding into every store screen, and it will fail outright
// once the private columns lose their table-wide grant (admin completion Phase 4b).
const MY_STORE_COLUMNS = `id, brand_name, about, city, state, country, business_type, website, logo_url, banner_url,
  owner_name, gstin, cin, is_verified, plan_expires_at, ad_verified_until, followers_count, rating_avg, reviews_count,
  profile_score, onboarding_complete, category, office_photos, year_established, employee_count, annual_turnover,
  capacity, social, recommended_product_ids, created_at`;

/** The vendor's eight private fields. */
export type VendorPrivate = Database["public"]["Functions"]["my_vendor_private"]["Returns"][number];

/**
 * The signed-in vendor's own private fields: PAN, email, phone, WhatsApp and
 * street address (admin completion Phase 4). my_vendor_private() only ever
 * returns the caller's row, so anyone else's id gets null rather than the
 * caller's own details under another vendor's name.
 */
export async function fetchMyVendorPrivate(vendorId: string): Promise<VendorPrivate | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.id !== vendorId) return null;
  const { data, error } = await supabase.rpc("my_vendor_private");
  if (error) throw error;
  return data?.[0] ?? null;
}

async function fetchMyVendorProfile(id: string): Promise<VendorStoreData | null> {
  const [{ data, error }, priv] = await Promise.all([
    supabase.from("vendor_profiles").select(MY_STORE_COLUMNS).eq("id", id).maybeSingle(),
    fetchMyVendorPrivate(id),
  ]);
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
    phone: priv?.phone ?? "",
    whatsapp: priv?.whatsapp ?? "",
    logoUrl: data.logo_url,
    bannerUrl: data.banner_url,
    addressLine: priv?.address_line ?? "",
    area: priv?.area ?? "",
    postalCode: priv?.postal_code ?? "",
    landmark: priv?.landmark ?? "",
    ownerName: data.owner_name ?? "",
    ownerEmail: priv?.owner_email ?? "",
    pan: priv?.pan ?? "",
    gstin: data.gstin ?? "",
    cin: data.cin ?? "",
    isVerified: data.is_verified,
    planExpiresAt: data.plan_expires_at,
    adVerifiedUntil: data.ad_verified_until,
    followers: data.followers_count,
    ratingAvg: Number(data.rating_avg),
    reviewsCount: data.reviews_count,
    profileScore: data.profile_score,
    onboardingComplete: data.onboarding_complete,
    category: data.category ?? [],
    officePhotos: data.office_photos ?? [],
    yearEstablished: data.year_established,
    employeeCount: data.employee_count ?? "",
    annualTurnover: data.annual_turnover ?? "",
    capacity: data.capacity ?? [],
    social: (data.social as Record<string, string[]> | null) ?? {},
    recommendedProductIds: data.recommended_product_ids ?? [],
    createdAt: data.created_at,
  };
}

/** An invoice's or receipt's "Bill to": the vendor's public identity and their private address, email and PAN. */
export interface BillTo {
  brand_name: string | null; owner_name: string | null; owner_email: string | null;
  address_line: string | null; area: string | null; city: string | null; state: string | null;
  postal_code: string | null; gstin: string | null; pan: string | null;
}

/**
 * "Bill to" for one of the signed-in vendor's own invoices or receipts. The
 * private half comes from my_vendor_private(), so it is filled in only when
 * `vendorId` is the caller; anyone else gets the public half.
 */
export async function fetchBillTo(vendorId: string): Promise<BillTo | null> {
  const [{ data, error }, priv] = await Promise.all([
    supabase.from("vendor_profiles").select("brand_name, owner_name, city, state, gstin").eq("id", vendorId).maybeSingle(),
    fetchMyVendorPrivate(vendorId),
  ]);
  if (error) throw error;
  if (!data) return null;
  return {
    brand_name: data.brand_name, owner_name: data.owner_name, city: data.city, state: data.state, gstin: data.gstin,
    owner_email: priv?.owner_email ?? null, address_line: priv?.address_line ?? null, area: priv?.area ?? null,
    postal_code: priv?.postal_code ?? null, pan: priv?.pan ?? null,
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
  annualTurnover?: string;
  capacity?: string[];
  social?: Record<string, string[]>;
  recommendedProductIds?: string[];
}

export async function saveVendorProfile(id: string, p: VendorStorePatch): Promise<void> {
  const row: VendorProfileInsert = { id };
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
  if (p.annualTurnover !== undefined) row.annual_turnover = p.annualTurnover || null;
  if (p.capacity !== undefined) row.capacity = p.capacity;
  if (p.social !== undefined) row.social = p.social;
  if (p.recommendedProductIds !== undefined) row.recommended_product_ids = p.recommendedProductIds;
  await writeOwnVendorRow(row);
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

export type VendorNotificationSettings = {
  emailNewRfq: boolean;
  emailNewMessage: boolean;
  emailAdStatus: boolean;
  emailPlanExpiry: boolean;
  emailProductStatus: boolean;
  emailNewsletter: boolean;
  pushNewRfq: boolean;
  pushNewMessage: boolean;
  pushNewLead: boolean;
};

export type VendorRegionalSettings = {
  language: "en" | "hi" | "gu";
};

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
  // The computed key is one of two literal column names, but TS widens
  // `{ [key]: value }` to an index signature and the builder rejects that.
  // Building the row explicitly keeps it checked against the real columns.
  const row: VendorProfileInsert =
    key === "notifications"
      ? { id, notifications: value as VendorNotificationSettings }
      : { id, regional: value as VendorRegionalSettings };
  await writeOwnVendorRow(row);
}
