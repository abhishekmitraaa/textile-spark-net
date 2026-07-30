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

// Reels pulled for the buyer feed in one page. The viewer windows its slides,
// so this is about bytes over the wire, not what renders: an unbounded select
// on a growing table is a slow query and a large payload on every feed visit.
const FEED_LIMIT = 30;

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
  vendor_profiles: { brand_name: string | null } | null;
}

async function fetchVideoCloseUps(): Promise<VideoCloseUp[]> {
  // Single round-trip: the brand name is embedded via the
  // product_videos_vendor_profile_fkey constraint. This used to be two queries
  // — the rows, then a separate `in("id", vendorIds)` against vendor_profiles
  // joined in memory — because the only FK pointed at `profiles`.
  const { data, error } = await supabase
    .from("product_videos")
    .select("id, vendor_id, category, brand_line, price, moq, rating, reviews, likes_count, views_count, thumbnail_url, video_url, vendor_profiles ( brand_name )")
    .eq("status", "live")
    .order("views_count", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawVideo[];

  return rows.map((v) => ({
    id: v.id,
    vendorId: v.vendor_id,
    category: v.category,
    brandName: v.vendor_profiles?.brand_name ?? "Vendor",
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
  return useQuery({
    queryKey: ["product_videos", "live"],
    queryFn: fetchVideoCloseUps,
    // A reel only becomes visible after an admin approves it, and the stated
    // moderation window is 24-48h — so 5 minutes is already far fresher than
    // the content can actually change. Without this the default staleTime of 0
    // refetched the whole feed on every mount and every tab focus.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
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
  durationSeconds: number | null;
}

interface RawMyVideo {
  id: string; brand_line: string; category: string; thumbnail_url: string | null;
  status: string; views_count: number; likes_count: number; created_at: string;
  duration_seconds: number | null;
  products: { name: string } | null;
}

async function fetchMyVideos(vendorId: string): Promise<MyVideoRow[]> {
  const { data, error } = await supabase
    .from("product_videos")
    .select("id, brand_line, category, thumbnail_url, status, views_count, likes_count, created_at, duration_seconds, products ( name )")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawMyVideo[]).map((v) => ({
    id: v.id,
    caption: v.brand_line,
    productName: v.products?.name ?? "",
    category: v.category,
    thumbnail: v.thumbnail_url,
    durationSeconds: v.duration_seconds,
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
    // Much shorter than the buyer feed: this is the vendor's own list and it
    // has to reflect an upload they just made.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export interface NewProductVideo {
  file: File;
  thumbnail?: File | null;
  caption: string;
  productId?: string | null;
  category?: string;
  /** From probeVideoFile() — persisted so the vendor card and viewer don't have to guess. */
  durationSeconds?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  /** 0..1, called as chunks land. */
  onProgress?: (fraction: number) => void;
}

export const VIDEO_BUCKET = "product-videos";

// 50MB — the Free-plan ceiling (a bucket limit cannot exceed the project's
// global file size limit, and Free caps that at 50MB). Mirrored by
// storage.buckets.file_size_limit so bypassing the client gains nothing.
// Raise BOTH, dashboard global limit first, after moving to Pro.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
// .mov is excluded on purpose: iPhone .mov is HEVC, which Chrome and Android
// cannot decode, and there is no transcoding step here to fix it.
export const ACCEPTED_VIDEO_MIME = ["video/mp4", "video/webm"] as const;

/**
 * Upload via the TUS resumable protocol rather than a single PUT.
 *
 * Supabase recommends resumable uploads for anything over 6MB, and a product
 * video on a phone connection is exactly the case where a single request dies
 * halfway and the vendor has to start over. tus-js-client fingerprints the file
 * so an interrupted upload resumes from the last completed chunk.
 *
 * Two details that are requirements, not preferences:
 *  - chunkSize MUST be exactly 6MB; Supabase's TUS implementation rejects
 *    anything else.
 *  - the endpoint uses the DIRECT storage hostname (<ref>.storage.supabase.co),
 *    which Supabase documents as materially faster for large files than routing
 *    through the main project hostname.
 */
async function resumableUpload(path: string, file: File, onProgress?: (f: number) => void): Promise<void> {
  // Named export. Supabase's docs show `require('tus-js-client')` then
  // `new tus.Upload(...)`, which is the CommonJS namespace — under ESM the
  // dynamic import resolves to the module namespace, so destructure `Upload`
  // directly. Getting this wrong fails only at runtime, on submit.
  //
  // Loaded lazily so the library isn't in the bundle every buyer downloads;
  // it's only needed on the vendor upload page.
  const { Upload: TusUpload } = await import("tus-js-client");
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");

  // https://<ref>.supabase.co -> https://<ref>.storage.supabase.co
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(".supabase.co", ".storage.supabase.co");

  await new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${base}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
      uploadDataDuringCreation: true,
      // Without this the fingerprint sticks around and re-uploading the same
      // file later resumes a completed upload instead of starting fresh.
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: VIDEO_BUCKET,
        objectName: path,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });

    // Resume an interrupted upload of this exact file if one is pending.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }).catch(reject);
  });
}

// Uploads the video (+ optional cover) to the product-videos bucket under the
// vendor's own folder, then inserts an under_review row. When a real product is
// tagged, its price/MOQ/category are copied so the buyer card shows live data.
export async function createProductVideo(vendorId: string, v: NewProductVideo): Promise<void> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const vext = v.file.name.split(".").pop()?.toLowerCase() || "mp4";
  const vpath = `${vendorId}/${key}.${vext}`;
  // Resumable, so a dropped connection mid-upload continues rather than
  // restarting. The vendorId prefix is what the storage RLS policy checks.
  await resumableUpload(vpath, v.file, v.onProgress);
  const video_url = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(vpath).data.publicUrl;

  let thumbnail_url: string | null = null;
  if (v.thumbnail) {
    const text = v.thumbnail.name.split(".").pop()?.toLowerCase() || "jpg";
    const tpath = `${vendorId}/${key}-thumb.${text}`;
    // Posters are small, so a plain upload is fine here — but note this lands
    // in the SAME bucket as the video, which is why the bucket's MIME allowlist
    // has to include image types.
    const { error: te } = await supabase.storage.from(VIDEO_BUCKET).upload(tpath, v.thumbnail, { upsert: true });
    if (te) throw te;
    thumbnail_url = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(tpath).data.publicUrl;
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
    duration_seconds: v.durationSeconds ?? null,
    video_width: v.videoWidth ?? null,
    video_height: v.videoHeight ?? null,
    provider: "supabase",
    status: "under_review",
  });
  if (error) throw error;
}

/** Storage key from a public URL, or null if it isn't one of ours. */
function storageKeyFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${VIDEO_BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

export async function deleteProductVideo(id: string): Promise<void> {
  // Remove the objects BEFORE the row. The row is the only record of where the
  // files live, so deleting it first and then failing on storage leaves an
  // orphan nothing in the app can ever find again. This order fails the other
  // way: the row survives, and the vendor can simply retry the delete.
  const { data: row } = await supabase
    .from("product_videos")
    .select("video_url, thumbnail_url")
    .eq("id", id)
    .maybeSingle();

  if (row) {
    // Skip anything not hosted in our bucket — externally hosted rows (and any
    // future streaming-provider URLs) have nothing to remove here.
    const keys = [storageKeyFromPublicUrl(row.video_url), storageKeyFromPublicUrl(row.thumbnail_url)]
      .filter((k): k is string => Boolean(k));
    if (keys.length) {
      const { error: se } = await supabase.storage.from(VIDEO_BUCKET).remove(keys);
      if (se) throw se;
    }
  }

  const { error } = await supabase.from("product_videos").delete().eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Client-side probe: duration, intrinsic size, and a poster frame taken from
// the actual video.
//
// The poster matters for more than having *an* image. With preload="none" the
// browser has nothing to paint when playback starts, so the viewer shows the
// poster underneath and fades the video in over it. If that poster came from
// somewhere else its aspect ratio wouldn't match and the swap would visibly
// re-crop; taken from the file itself, the two are congruent by construction.
//
// This is not transcoding — no ffmpeg.wasm, no WebCodecs. It's one off-DOM
// <video> plus a canvas, works everywhere, and costs about 40 lines.
// ─────────────────────────────────────────────────────────────

export interface VideoProbe {
  durationSeconds: number;
  width: number;
  height: number;
  poster: File | null;
}

export function probeVideoFile(file: File, timeoutMs = 3000): Promise<VideoProbe | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    let settled = false;

    const done = (r: VideoProbe | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      el.load();
      resolve(r);
    };

    // iOS Safari occasionally refuses to decode a frame no matter what we do.
    // Time out and continue without a poster rather than blocking the upload.
    const timer = setTimeout(() => done(null), timeoutMs);

    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.onerror = () => done(null);

    el.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(el.duration) ? el.duration : 0;
      const width = el.videoWidth;
      const height = el.videoHeight;
      // A tenth of the way in — the very first frame is often black.
      el.currentTime = Math.min(1, durationSeconds * 0.1);

      el.onseeked = () => {
        try {
          // Cap the long edge so the poster is a thumbnail, not a full frame.
          const scale = Math.min(1, 720 / Math.max(width, height, 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return done({ durationSeconds, width, height, poster: null });
          ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
          // A blob: URL is same-origin, so the canvas is not tainted here.
          canvas.toBlob(
            (blob) => done({
              durationSeconds,
              width,
              height,
              poster: blob ? new File([blob], "poster.jpg", { type: "image/jpeg" }) : null,
            }),
            "image/jpeg",
            0.72,
          );
        } catch {
          done({ durationSeconds, width, height, poster: null });
        }
      };
    };

    el.src = url;
  });
}
