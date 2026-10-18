import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { trustSealFromParts } from "@/lib/plan";
import { mapProductRow, PRODUCT_CARD_SELECT, type ProductCardData, type RawProduct, type RawVendor } from "@/lib/queries/products";

// Cached map plan_id → has_international, for the "International-ready" indicator.
let planIntlCache: Map<string, boolean> | null = null;
async function loadPlanIntl(): Promise<Map<string, boolean>> {
  if (planIntlCache) return planIntlCache;
  const { data } = await supabase.from("subscription_plans").select("id, limits");
  const m = new Map<string, boolean>();
  for (const p of (data ?? []) as { id: string; limits: { has_international?: boolean } | null }[]) {
    m.set(p.id, Boolean(p.limits?.has_international));
  }
  planIntlCache = m;
  return m;
}
import type { VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";
import { liveProductId, taggedListingUnavailable } from "@/lib/queries/videos";

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
  /** Vendor's plan includes international buyer access (Gold/VIP) and it's
   *  active. Surfaced to buyers as an "International-ready" indicator. */
  international: boolean;
  followers: number;
  ratingAvg: number;
  reviewsCount: number;
  // The vendor's public store identity (managed at /my-store). Their PAN, email,
  // phone, WhatsApp and street address are private (admin completion Phase 4,
  // Mitra 2026-09-27): a signed-in buyer gets phone and WhatsApp from
  // call_vendor_contact() (useVendorContact / useCallVendor in queries/calls.ts).
  logoUrl: string | null;
  bannerUrl: string | null;
  website: string | null;
  ownerName: string | null;
  gstin: string | null;
  cin: string | null;
  /** A number is on file. Says nothing more: the numbers themselves are private. */
  hasPhone: boolean;
  hasWhatsapp: boolean;
  employeeCount: string | null;
  yearEstablished: number | null;
  /** The vendor row's creation time, for "Cosora Member Since". */
  createdAt: string;
  /** Manufacturing capacity bands the vendor declared. Empty = not stated;
   *  the buyer page renders nothing rather than guessing. */
  capacity: string[];
  annualTurnover: string | null;
  products: ProductCardData[];
  videos: VideoCloseUp[];
}

interface RawVid {
  id: string; vendor_id: string; category: string; brand_line: string; price: string | null;
  moq: string | null; rating: number; reviews: string | null; likes_count: number;
  views_count: number; thumbnail_url: string | null; video_url: string | null;
  product_id: string | null; products: { id: string; status: string } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchVendorProfile(id: string): Promise<VendorProfileData | null> {
  // A slug or an old demo id ("v5") is no vendor: answer "not found" without a
  // request that could only fail on the uuid cast.
  if (!UUID_RE.test(id)) return null;
  // Public columns only. Never add phone, whatsapp, owner_email, pan or the street
  // address here: they are private (admin completion Phase 4).
  const { data: v, error } = await supabase
    .from("vendor_profiles")
    .select(
      "id, brand_name, about, city, state, country, business_type, is_verified, plan_expires_at, ad_verified_until, plan_id, followers_count, rating_avg, reviews_count, logo_url, banner_url, website, owner_name, gstin, cin, has_phone, has_whatsapp, employee_count, year_established, created_at, capacity, annual_turnover",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!v) return null;

  // Displayed trust seal = admin verification OR active paid plan OR active
  // ad-purchased seal (trustedSeal / verifiedCertificate).
  const displaySeal = trustSealFromParts(v.is_verified, v.plan_expires_at, v.ad_verified_until);
  // International-ready = active plan (Gold/VIP) with has_international.
  const planActive = Boolean(v.plan_expires_at && new Date(v.plan_expires_at).getTime() > Date.now());
  const international = planActive && Boolean(v.plan_id && (await loadPlanIntl()).get(v.plan_id));
  const vendorMini: RawVendor = { brand_name: v.brand_name, is_verified: displaySeal, city: v.city };

  const { data: prods } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("vendor_id", id)
    .eq("status", "live")
    .order("created_at", { ascending: false });
  const products = ((prods ?? []) as unknown as RawProduct[]).map((p) => mapProductRow(p, vendorMini));

  const { data: vids } = await supabase
    .from("product_videos")
    .select("id, vendor_id, category, brand_line, price, moq, rating, reviews, likes_count, views_count, thumbnail_url, video_url, product_id, products ( id, status )")
    .eq("vendor_id", id)
    .eq("status", "live")
    .order("views_count", { ascending: false })
    .limit(24);
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
    productId: liveProductId(r),
    listingUnavailable: taggedListingUnavailable(r),
  }));

  return {
    id: v.id,
    brandName: v.brand_name ?? "Vendor",
    about: v.about,
    city: v.city,
    state: v.state,
    country: v.country ?? "India",
    businessType: v.business_type,
    isVerified: displaySeal,
    international,
    followers: v.followers_count,
    ratingAvg: Number(v.rating_avg),
    reviewsCount: v.reviews_count,
    logoUrl: v.logo_url,
    bannerUrl: v.banner_url,
    website: v.website,
    ownerName: v.owner_name,
    gstin: v.gstin,
    cin: v.cin,
    hasPhone: Boolean(v.has_phone),
    hasWhatsapp: Boolean(v.has_whatsapp),
    employeeCount: v.employee_count,
    yearEstablished: v.year_established,
    createdAt: v.created_at,
    capacity: v.capacity ?? [],
    annualTurnover: v.annual_turnover,
    products,
    videos,
  };
}

export function useVendorProfile(id: string | undefined) {
  return useQuery({
    queryKey: ["vendor_profile", id],
    queryFn: () => fetchVendorProfile(id as string),
    enabled: Boolean(id),
    // This fans out to several queries (profile, products, videos, catalogues),
    // so refetching it on every mount and tab focus was the most expensive
    // default in the app.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────
// Top vendors, for the buyer home "Recommended Premium Brands" tiles.
//
// Ranking reuses the paid-plan signal already used elsewhere in this codebase
// (fetchOpenRfqs' `isPaid` check, trustSealFromParts): an active paid plan
// first, then rating, then review volume. There is no vendor-level ad
// placement to sell against yet, so this is an editorial/merit ranking, not
// a paid one — the "AD" label on that section is therefore not accurate for
// this data and the caller drops it.
//
// Only vendors with at least one live product qualify: a brand tile that
// opens onto an empty storefront is worse than no tile.
// ─────────────────────────────────────────────────────────────

export interface TopVendor {
  id: string;
  brandName: string;
  city: string | null;
  ratingAvg: number;
  reviewsCount: number;
  verified: boolean;
  /** Active paid plan — the tile ordering signal, also shown as a label. */
  paid: boolean;
  /** Cover image: the vendor's first live product photo. */
  imageUrl: string | null;
  liveProducts: number;
}

interface RawTopVendor {
  id: string; brand_name: string; city: string | null;
  rating_avg: number | null; reviews_count: number | null;
  is_verified: boolean | null; plan_expires_at: string | null; ad_verified_until: string | null;
  image_url: string | null; live_products: number;
}

// The database picks them (top_vendors(), 2026-10-19): paid plan first, then rating, then review count; only sellers
// with a live listing, the first listing's first picture as the cover. This used to download every seller and every
// live listing to pick four in the browser, on every New Arrivals visit.
async function fetchTopVendors(max: number): Promise<TopVendor[]> {
  const { data, error } = await supabase.rpc("top_vendors", { p_limit: max });
  if (error) throw error;
  const now = Date.now();
  const isPaid = (ts: string | null) => Boolean(ts && new Date(ts).getTime() > now);
  return ((data ?? []) as RawTopVendor[]).map((v): TopVendor => ({
    id: v.id,
    brandName: v.brand_name,
    city: v.city,
    ratingAvg: Number(v.rating_avg ?? 0),
    reviewsCount: Number(v.reviews_count ?? 0),
    verified: trustSealFromParts(v.is_verified, v.plan_expires_at, v.ad_verified_until),
    paid: isPaid(v.plan_expires_at),
    imageUrl: v.image_url,
    liveProducts: v.live_products,
  }));
}

export function useTopVendors(max = 4) {
  return useQuery({
    queryKey: ["vendor_profiles", "top", max],
    queryFn: () => fetchTopVendors(max),
    staleTime: 5 * 60 * 1000,
  });
}
