import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";

// ─────────────────────────────────────────────────────────────
// Video closeups data access (React Query over Supabase).
//
// Reads vendor-uploaded reels from `product_videos` (status='live') and maps
// them into the exact `VideoCloseUp` shape the reel viewer already renders,
// so the Instagram-style viewer works over real data with no UI change.
// brandName comes from the owning vendor's public profile.
// ─────────────────────────────────────────────────────────────

const THUMB_PLACEHOLDER =
  "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=500&h=650&fit=crop";

interface RawVideo {
  id: string;
  vendor_id: string;
  category: string;
  brand_line: string;
  price: string | null;
  moq: string | null;
  rating: number;
  reviews: string | null;
  likes_count: number;
  views_count: number;
  thumbnail_url: string | null;
  video_url: string | null;
}

async function fetchVideoCloseUps(): Promise<VideoCloseUp[]> {
  const { data, error } = await supabase
    .from("product_videos")
    .select("id, vendor_id, category, brand_line, price, moq, rating, reviews, likes_count, views_count, thumbnail_url, video_url")
    .eq("status", "live")
    .order("views_count", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawVideo[];

  // Owning-vendor brand names (no direct FK to vendor_profiles, so join in memory).
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const brandMap = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vendors } = await supabase
      .from("vendor_profiles")
      .select("id, brand_name")
      .in("id", vendorIds);
    for (const v of vendors ?? []) brandMap.set(v.id, v.brand_name ?? "Vendor");
  }

  return rows.map((v) => ({
    id: v.id,
    vendorId: v.vendor_id,
    category: v.category,
    brandName: brandMap.get(v.vendor_id) ?? "Vendor",
    brandLine: v.brand_line,
    price: v.price ?? "",
    moq: v.moq ?? "2",
    rating: Number(v.rating),
    reviews: v.reviews ?? "",
    likes: v.likes_count,
    views: v.views_count,
    thumbnail: v.thumbnail_url ?? THUMB_PLACEHOLDER,
    videoUrl: v.video_url ?? undefined,
  }));
}

export function useVideoCloseUps() {
  return useQuery({ queryKey: ["product_videos", "live"], queryFn: fetchVideoCloseUps });
}

// ─────────────────────────────────────────────────────────────
// Vendor side — a vendor's OWN video closeups (any status) for the manage
// list, plus the create/delete mutations that feed the buyer reel.
// ─────────────────────────────────────────────────────────────

export interface MyVideoRow {
  id: string;
  caption: string;
  productName: string;
  category: string;
  thumbnail: string | null;
  status: "live" | "under_review" | "rejected" | "draft";
  views: number;
  likes: number;
  createdAt: string;
}

interface RawMyVideo {
  id: string; brand_line: string; category: string; thumbnail_url: string | null;
  status: string; views_count: number; likes_count: number; created_at: string;
  products: { name: string } | null;
}

async function fetchMyVideos(vendorId: string): Promise<MyVideoRow[]> {
  const { data, error } = await supabase
    .from("product_videos")
    .select("id, brand_line, category, thumbnail_url, status, views_count, likes_count, created_at, products ( name )")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawMyVideo[]).map((v) => ({
    id: v.id,
    caption: v.brand_line,
    productName: v.products?.name ?? "",
    category: v.category,
    thumbnail: v.thumbnail_url,
    status: (v.status as MyVideoRow["status"]) ?? "under_review",
    views: v.views_count,
    likes: v.likes_count,
    createdAt: new Date(v.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
  }));
}

export function useMyVideos(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["product_videos", "mine", vendorId],
    queryFn: () => fetchMyVideos(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export interface NewProductVideo {
  file: File;
  thumbnail?: File | null;
  caption: string;
  productId?: string | null;
  category?: string;
}

// Uploads the video (+ optional cover) to the product-videos bucket under the
// vendor's own folder, then inserts an under_review row. When a real product is
// tagged, its price/MOQ/category are copied so the buyer card shows live data.
export async function createProductVideo(vendorId: string, v: NewProductVideo): Promise<void> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const vext = v.file.name.split(".").pop()?.toLowerCase() || "mp4";
  const vpath = `${vendorId}/${key}.${vext}`;
  const { error: ve } = await supabase.storage.from("product-videos").upload(vpath, v.file, { upsert: true });
  if (ve) throw ve;
  const video_url = supabase.storage.from("product-videos").getPublicUrl(vpath).data.publicUrl;

  let thumbnail_url: string | null = null;
  if (v.thumbnail) {
    const text = v.thumbnail.name.split(".").pop()?.toLowerCase() || "jpg";
    const tpath = `${vendorId}/${key}-thumb.${text}`;
    const { error: te } = await supabase.storage.from("product-videos").upload(tpath, v.thumbnail, { upsert: true });
    if (te) throw te;
    thumbnail_url = supabase.storage.from("product-videos").getPublicUrl(tpath).data.publicUrl;
  }

  let category = v.category ?? "Fashion";
  let price: string | null = null;
  let moq: string | null = null;
  if (v.productId) {
    const { data: p } = await supabase
      .from("products")
      .select("price_value, currency, moq, categories ( name )")
      .eq("id", v.productId)
      .maybeSingle();
    if (p) {
      if (p.price_value != null) price = `${p.currency}${Math.round(Number(p.price_value))}`;
      moq = p.moq ?? null;
      const cat = (p as unknown as { categories: { name: string } | null }).categories?.name;
      if (cat) category = cat;
    }
  }

  const { error } = await supabase.from("product_videos").insert({
    vendor_id: vendorId,
    product_id: v.productId ?? null,
    brand_line: v.caption,
    category,
    price,
    moq,
    thumbnail_url,
    video_url,
    status: "under_review",
  });
  if (error) throw error;
}

export async function deleteProductVideo(id: string): Promise<void> {
  const { error } = await supabase.from("product_videos").delete().eq("id", id);
  if (error) throw error;
}
