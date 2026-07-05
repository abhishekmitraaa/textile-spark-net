import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mapProductRow, PRODUCT_CARD_SELECT, type ProductCardData, type RawProduct, type RawVendor } from "@/lib/queries/products";
import type { VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";

// ─────────────────────────────────────────────────────────────
// Buyer-facing vendor profile (/vendor/:id) — real vendor identity + the
// vendor's own live products and video closeups.
// ─────────────────────────────────────────────────────────────

export interface VendorProfileData {
  id: string;
  brandName: string;
  about: string | null;
  city: string | null;
  state: string | null;
  country: string;
  businessType: string | null;
  isVerified: boolean;
  followers: number;
  ratingAvg: number;
  reviewsCount: number;
  // Real store identity + contact (managed by the vendor at /my-store) so it
  // reflects to buyers instead of showing hardcoded placeholders.
  logoUrl: string | null;
  bannerUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  addressLine: string | null;
  area: string | null;
  postalCode: string | null;
  landmark: string | null;
  gstin: string | null;
  pan: string | null;
  products: ProductCardData[];
  videos: VideoCloseUp[];
}

interface RawVid {
  id: string; vendor_id: string; category: string; brand_line: string; price: string | null;
  moq: string | null; rating: number; reviews: string | null; likes_count: number;
  views_count: number; thumbnail_url: string | null; video_url: string | null;
}

async function fetchVendorProfile(id: string): Promise<VendorProfileData | null> {
  const { data: v, error } = await supabase
    .from("vendor_profiles")
    .select(
      "id, brand_name, about, city, state, country, business_type, is_verified, followers_count, rating_avg, reviews_count, logo_url, banner_url, phone, whatsapp, website, owner_name, owner_email, address_line, area, postal_code, landmark, gstin, pan",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!v) return null;

  const vendorMini: RawVendor = { brand_name: v.brand_name, is_verified: v.is_verified, city: v.city };

  const { data: prods } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("vendor_id", id)
    .eq("status", "live")
    .order("created_at", { ascending: false });
  const products = ((prods ?? []) as unknown as RawProduct[]).map((p) => mapProductRow(p, vendorMini));

  const { data: vids } = await supabase
    .from("product_videos")
    .select("id, vendor_id, category, brand_line, price, moq, rating, reviews, likes_count, views_count, thumbnail_url, video_url")
    .eq("vendor_id", id)
    .eq("status", "live")
    .order("views_count", { ascending: false });
  const videos: VideoCloseUp[] = ((vids ?? []) as unknown as RawVid[]).map((r) => ({
    id: r.id,
    vendorId: r.vendor_id,
    category: r.category,
    brandName: v.brand_name ?? "Vendor",
    brandLine: r.brand_line,
    price: r.price ?? "",
    moq: r.moq ?? "2",
    rating: Number(r.rating),
    reviews: r.reviews ?? "",
    likes: r.likes_count,
    views: r.views_count,
    thumbnail: r.thumbnail_url ?? products[0]?.image ?? "",
    videoUrl: r.video_url ?? undefined,
  }));

  return {
    id: v.id,
    brandName: v.brand_name ?? "Vendor",
    about: v.about,
    city: v.city,
    state: v.state,
    country: v.country ?? "India",
    businessType: v.business_type,
    isVerified: v.is_verified,
    followers: v.followers_count,
    ratingAvg: Number(v.rating_avg),
    reviewsCount: v.reviews_count,
    logoUrl: v.logo_url,
    bannerUrl: v.banner_url,
    phone: v.phone,
    whatsapp: v.whatsapp,
    website: v.website,
    ownerName: v.owner_name,
    ownerEmail: v.owner_email,
    addressLine: v.address_line,
    area: v.area,
    postalCode: v.postal_code,
    landmark: v.landmark,
    gstin: v.gstin,
    pan: v.pan,
    products,
    videos,
  };
}

export function useVendorProfile(id: string | undefined) {
  return useQuery({
    queryKey: ["vendor_profile", id],
    queryFn: () => fetchVendorProfile(id as string),
    enabled: Boolean(id),
  });
}
