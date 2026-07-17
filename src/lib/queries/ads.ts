import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// (buyer-facing active-ads + analytics helpers are exported at the bottom)

// ─────────────────────────────────────────────────────────────
// Vendor advertisements (campaigns). Vendor-only visibility; a campaign
// promotes one of the vendor's products with a daily budget + placement.
// ─────────────────────────────────────────────────────────────

export type AdStatus = "draft" | "active" | "paused" | "ended";

export interface AdRow {
  id: string;
  title: string;
  productId: string | null;
  imageUrl: string | null;
  dailyBudget: number | null;
  placement: string | null;
  status: AdStatus;
  impressions: number;
  clicks: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

interface RawAd {
  id: string; title: string; product_id: string | null; image_url: string | null;
  daily_budget: number | null; placement: string | null; status: string;
  impressions: number; clicks: number; starts_at: string | null; ends_at: string | null; created_at: string;
}

function mapAd(a: RawAd): AdRow {
  return {
    id: a.id, title: a.title, productId: a.product_id, imageUrl: a.image_url,
    dailyBudget: a.daily_budget != null ? Number(a.daily_budget) : null,
    placement: a.placement, status: (a.status as AdStatus) ?? "draft",
    impressions: a.impressions, clicks: a.clicks,
    startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at,
  };
}

async function fetchMyAds(vendorId: string): Promise<AdRow[]> {
  const { data, error } = await supabase
    .from("advertisements")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawAd[]).map(mapAd);
}

export function useMyAds(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["advertisements", "mine", vendorId],
    queryFn: () => fetchMyAds(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export interface NewAd {
  title: string;
  productId?: string | null;
  imageUrl?: string | null;
  dailyBudget?: number | null;
  placement?: string | null;
  status?: AdStatus;
  endsAt?: string | null;
}

export async function createAd(vendorId: string, a: NewAd): Promise<void> {
  const { error } = await supabase.from("advertisements").insert({
    vendor_id: vendorId,
    title: a.title,
    product_id: a.productId ?? null,
    image_url: a.imageUrl ?? null,
    daily_budget: a.dailyBudget ?? null,
    placement: a.placement ?? null,
    status: a.status ?? "active",
    starts_at: new Date().toISOString(),
    ends_at: a.endsAt ?? null,
  });
  if (error) throw error;
}

export async function updateAdStatus(id: string, status: AdStatus): Promise<void> {
  const { error } = await supabase.from("advertisements").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteAd(id: string): Promise<void> {
  const { error } = await supabase.from("advertisements").delete().eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Buyer-facing: active ads that promote a live product, surfaced as
// "Sponsored" placements in the buyer feed. Read through a SECURITY DEFINER
// RPC so buyers get only safe fields (never budgets) and don't need table
// read access. Impressions/clicks are bumped via dedicated RPCs.
// ─────────────────────────────────────────────────────────────
export interface ActiveAd {
  adId: string;
  productId: string | null;
  title: string;
  placement: string | null;
  productName: string | null;
  price: string | null;
  imageUrl: string | null;
  vendorId: string | null;
  vendorName: string | null;
}

interface RawActiveAd {
  ad_id: string; product_id: string | null; title: string; placement: string | null;
  product_name: string | null; price_value: number | null; currency: string | null;
  image_url: string | null; vendor_id: string | null; vendor_name: string | null;
}

// categoryId (optional) filters serving to ads targeting that category, plus
// untargeted ads — real category targeting where a buyer category signal exists
// (e.g. the product-detail page's own category).
async function fetchActiveAds(max: number, categoryId?: string | null): Promise<ActiveAd[]> {
  const { data, error } = await supabase.rpc("active_ads", { max_count: max, filter_category: categoryId ?? undefined });
  if (error) throw error;
  return ((data ?? []) as RawActiveAd[]).map((a) => ({
    adId: a.ad_id,
    productId: a.product_id,
    title: a.title,
    placement: a.placement,
    productName: a.product_name,
    price: a.price_value != null ? `${a.currency ?? "₹"}${Math.round(Number(a.price_value))}` : null,
    imageUrl: a.image_url,
    vendorId: a.vendor_id,
    vendorName: a.vendor_name,
  }));
}

export function useActiveAds(max = 12, categoryId?: string | null) {
  return useQuery({
    queryKey: ["advertisements", "active", max, categoryId ?? null],
    queryFn: () => fetchActiveAds(max, categoryId),
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────
// Real, anonymized category benchmarks for the Advertise → Competitor page
// (see ad_category_benchmarks RPC). No named competitors — aggregates only.
// ─────────────────────────────────────────────────────────────
export interface CategoryBenchmark {
  category_id: string; category_name: string; product_count: number;
  vendor_count: number; avg_price: number; avg_views: number; your_products: number;
}
export interface AdBenchmarks {
  has_data: boolean;
  categories: CategoryBenchmark[];
  reviews: { yours: number; peer_avg: number };
  photos: { yours: number; peer_avg: number };
  active_ads_in_categories: number;
  peer_vendor_count: number;
}

async function fetchAdBenchmarks(vendorId: string): Promise<AdBenchmarks> {
  const { data, error } = await supabase.rpc("ad_category_benchmarks", { v: vendorId });
  if (error) throw error;
  return (data as unknown as AdBenchmarks) ?? { has_data: false, categories: [], reviews: { yours: 0, peer_avg: 0 }, photos: { yours: 0, peer_avg: 0 }, active_ads_in_categories: 0, peer_vendor_count: 0 };
}

export function useAdBenchmarks(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["ad_benchmarks", vendorId],
    queryFn: () => fetchAdBenchmarks(vendorId as string),
    enabled: Boolean(vendorId),
    staleTime: 5 * 60 * 1000,
  });
}

// Also expose a vendor's own live categories (id+name) for the ad targeting
// picker — the real DB categories the vendor sells in.
export interface AdCategoryOption { id: string; name: string }
async function fetchVendorCategories(vendorId: string): Promise<AdCategoryOption[]> {
  const { data: prods } = await supabase
    .from("products").select("category_id").eq("vendor_id", vendorId).not("category_id", "is", null);
  const ids = Array.from(new Set(((prods ?? []).map((p) => p.category_id).filter(Boolean)) as string[]));
  if (!ids.length) return [];
  const { data: cats } = await supabase.from("categories").select("id, name").in("id", ids);
  return ((cats ?? []) as AdCategoryOption[]).sort((a, b) => a.name.localeCompare(b.name));
}

export function useVendorCategories(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["ad_categories", vendorId],
    queryFn: () => fetchVendorCategories(vendorId as string),
    enabled: Boolean(vendorId),
    staleTime: 5 * 60 * 1000,
  });
}

export async function logAdImpression(adId: string): Promise<void> {
  await supabase.rpc("ad_impression", { ad: adId });
}

export async function logAdClick(adId: string): Promise<void> {
  await supabase.rpc("ad_click", { ad: adId });
}
