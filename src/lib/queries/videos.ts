import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";
import videoThumbPlaceholder from "@/assets/placeholders/video-thumb-placeholder.svg";

// ─────────────────────────────────────────────────────────────
// Video closeups data access (React Query over Supabase).
//
// Reads vendor-uploaded reels from `product_videos` (status='live') and maps
// them into the exact `VideoCloseUp` shape the reel viewer already renders,
// so the Instagram-style viewer works over real data with no UI change.
// brandName comes from the owning vendor's public profile.
// ─────────────────────────────────────────────────────────────

// Bundled, not hotlinked. This sits on the critical path of every reel card
// that has no poster of its own, and the whole premise of the feed is staying
// fast — a third-party image host is a DNS lookup, a TLS handshake and an
// availability dependency for something the app can ship itself in 652 bytes.
// It is also the poster the <video> element paints underneath before the first
// frame decodes, so a slow/blocked fetch shows as a black rectangle.
const THUMB_PLACEHOLDER = videoThumbPlaceholder;

/**
 * Swap a poster that failed to load for the bundled placeholder.
 *
 * Needed because of Bunny: a provider='bunny' row records its thumbnail URL at
 * INSERT time (it is deterministic from the GUID) but the file does not exist
 * until Bunny finishes encoding — seconds to a couple of minutes after upload.
 * In that window the vendor's own list would otherwise paint a browser
 * broken-image glyph over their brand-new video.
 *
 * Guarded against a loop: if the placeholder itself somehow fails, clearing
 * onerror stops the handler re-firing forever.
 */
export function onThumbError(e: { currentTarget: HTMLImageElement }): void {
  const el = e.currentTarget;
  if (el.dataset.fallbackApplied) return;
  el.dataset.fallbackApplied = "1";
  el.onerror = null;
  el.src = THUMB_PLACEHOLDER;
}

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
  /**
   * The moderator's note from `reject_vendor_content`. Only ever meaningful
   * alongside status === "rejected": approve now nulls it out
   * (20260905172020), but a row rejected, resubmitted and still pending keeps
   * the old note, so read it WITH the status, never on its own.
   *
   * The vendor has to be told what to fix. It was stored and trigger-protected
   * from the start, but never selected here, so the rejected badge was a dead
   * end — resubmit, get rejected again, no new information.
   */
  rejectionReason: string | null;
}

interface RawMyVideo {
  id: string; brand_line: string; category: string; thumbnail_url: string | null;
  status: string; views_count: number; likes_count: number; created_at: string;
  duration_seconds: number | null; rejection_reason: string | null;
  products: { name: string } | null;
}

async function fetchMyVideos(vendorId: string): Promise<MyVideoRow[]> {
  const { data, error } = await supabase
    .from("product_videos")
    .select("id, brand_line, category, thumbnail_url, status, views_count, likes_count, created_at, duration_seconds, rejection_reason, products ( name )")
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
    rejectionReason: v.rejection_reason,
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
 *
 * RETURNS THE PATH THE BYTES ACTUALLY LANDED AT, which is not always the path
 * passed in. tus fingerprints an upload as
 *   tus-br-{name}-{type}-{size}-{lastModified}-{endpoint}
 * — note the absence of objectName. So when a vendor reloads mid-upload and
 * resubmits, the caller mints a fresh random path but findPreviousUploads()
 * matches the OLD session, whose server-side URL is already bound to the OLD
 * objectName. The bytes go there; anything recorded against the fresh path is
 * a dangling reference, and the real object becomes an unreachable orphan
 * (audited: a 30MB object referenced by no row, which the delete path can
 * never find because it only looks at URLs a row points at).
 *
 * So the resolution order is: look for a resumable session for this exact file
 * FIRST, adopt its objectName if there is one, and only mint a new path when
 * there isn't. The caller must persist what this returns.
 */
async function resumableUpload(path: string, file: File, onProgress?: (f: number) => void): Promise<string> {
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
  const endpoint = `${base}/storage/v1/upload/resumable`;

  const options = (objectName: string) => ({
    endpoint,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
    uploadDataDuringCreation: true,
    // Without this the fingerprint sticks around and re-uploading the same
    // file later resumes a completed upload instead of starting fresh.
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: VIDEO_BUCKET,
      objectName,
      contentType: file.type,
      cacheControl: "3600",
    },
    chunkSize: 6 * 1024 * 1024,
  });

  // Probe only — never started. findPreviousUploads() just reads the URL
  // storage under this file's fingerprint, so the objectName handed in here is
  // irrelevant to the lookup; it exists to satisfy the constructor.
  const probe = new TusUpload(file, options(path));
  const previous = await probe.findPreviousUploads();

  // Adopt the earlier session's objectName so the resumed bytes and the row we
  // are about to write agree. Guarded on the folder prefix: the fingerprint is
  // per-file, not per-user, so on a shared browser a different vendor could
  // otherwise resume into someone else's folder — which storage RLS would
  // reject, turning a clean retry into an opaque failure.
  const folder = path.slice(0, path.lastIndexOf("/") + 1);
  const carried = previous.find(
    (p) => typeof p.metadata?.objectName === "string" && p.metadata.objectName.startsWith(folder),
  );
  const objectName = carried?.metadata.objectName ?? path;

  await new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      ...options(objectName),
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    // Only resume the session we actually adopted above.
    if (carried) upload.resumeFromPreviousUpload(carried);
    upload.start();
  });

  return objectName;
}

// ─────────────────────────────────────────────────────────────
// Bunny Stream upload path (provider='bunny').
//
// The bytes never touch Supabase Storage on this path. The browser uploads
// straight to Bunny over TUS, authorised by a signature only the
// `bunny-upload-url` edge function can compute — see that function's header for
// why the API key cannot come anywhere near here.
//
// `product_videos.provider` exists precisely so this is a data change rather
// than a schema change (20260730205449). Nothing about moderation is affected:
// the row still inserts as under_review and the same BEFORE trigger still
// enforces it.
// ─────────────────────────────────────────────────────────────

interface BunnyUploadSlot {
  videoId: string;
  libraryId: string;
  expirationTime: number;
  signature: string;
  endpoint: string;
  /** The resolution the function chose from the source dimensions, e.g. 480. */
  rendition: number;
  playbackUrl: string;
  thumbnailUrl: string;
}

/**
 * Ask the edge function for an upload slot.
 *
 * Returns null ONLY for `not_configured`, which is the single response that may
 * fall back to the Supabase Storage path — it means Bunny was never set up on
 * this project, not that this upload failed. Every other error throws, exactly
 * as createRazorpayOrder distinguishes them, and for the same reason: swallowing
 * a real failure into the fallback branch would silently keep writing
 * provider='supabase' rows long after the migration was supposed to be done.
 */
async function requestBunnySlot(
  title: string,
  width?: number | null,
  height?: number | null,
): Promise<BunnyUploadSlot | null> {
  // width/height come from probeVideoFile(). They are not cosmetic: the function
  // uses them to pick which play_<res>p.mp4 rendition to point video_url at,
  // because Bunny only builds renditions the source supports. Sending nothing
  // falls back to the 720p cap, which 404s for a sub-720p phone clip — measured,
  // not theorised (a real 478x850 vendor video encodes to 240/360/480 only).
  const { data, error } = await supabase.functions.invoke("bunny-upload-url", {
    body: { title, width, height },
  });
  if (error) {
    // A non-2xx surfaces as FunctionsHttpError whose message is just
    // "non-2xx status"; dig the real reason out of the response body so the
    // vendor sees "This account is suspended" rather than a status code.
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        detail = body.detail || body.error || detail;
      } catch {
        /* keep the original message */
      }
    }
    throw new Error(detail);
  }
  if (data?.error === "not_configured") return null;
  if (data?.error) throw new Error(String(data.detail || data.error));
  if (!data?.configured) return null;
  return data as BunnyUploadSlot;
}

/**
 * TUS straight to Bunny.
 *
 * Deliberately does NOT reuse resumableUpload(): that function's whole body
 * past the constructor is Supabase-specific (the objectName-adoption dance that
 * exists because Supabase binds an upload session to an object path). Bunny
 * binds the session to a VideoId instead, so none of it applies.
 *
 * Resume is switched OFF here — `storeFingerprintForResuming: false`. The
 * signature and VideoId come from a slot minted seconds ago and expire in an
 * hour, so a fingerprint persisted from a previous attempt would resume against
 * a stale VideoId with a signature that no longer validates: an opaque 401
 * where a clean restart would have worked. The cost is that an abandoned
 * attempt leaves an empty video object at Bunny, which is exactly what
 * bunny-reconcile lists (and why its age guard exists).
 *
 * chunkSize is 8MB. Supabase requires exactly 6MB; Bunny has no such rule, but
 * tus-js-client defaults to a single unsplit request, which would throw away
 * resumability on the connections this feature exists to survive.
 */
async function bunnyResumableUpload(
  slot: BunnyUploadSlot,
  file: File,
  title: string,
  onProgress?: (f: number) => void,
): Promise<void> {
  const { Upload: TusUpload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: slot.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: slot.signature,
        AuthorizationExpire: String(slot.expirationTime),
        LibraryId: slot.libraryId,
        VideoId: slot.videoId,
      },
      storeFingerprintForResuming: false,
      metadata: { filetype: file.type, title },
      chunkSize: 8 * 1024 * 1024,
      onError: reject,
      onProgress: (sent, total) => onProgress?.(total ? sent / total : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

// Uploads the video (+ optional cover) and inserts an under_review row. When a
// real product is tagged, its price/MOQ/category are copied so the buyer card
// shows live data.
//
// Two upload paths, chosen by whether Bunny is configured on this project:
//   'bunny'    — browser uploads straight to Bunny Stream; no Supabase egress,
//                no bucket limit, poster generated by Bunny.
//   'supabase' — the original TUS-to-Storage path, unchanged. Still the only
//                path when Bunny is not configured, and still what every
//                existing row uses.
export async function createProductVideo(vendorId: string, v: NewProductVideo): Promise<void> {
  let video_url: string;
  let thumbnail_url: string | null = null;
  let provider = "supabase";
  let bunny_video_id: string | null = null;

  const slot = await requestBunnySlot(v.caption || "Video closeup", v.videoWidth, v.videoHeight);

  if (slot) {
    provider = "bunny";
    bunny_video_id = slot.videoId;
    await bunnyResumableUpload(slot, v.file, v.caption || "Video closeup", v.onProgress);
    video_url = slot.playbackUrl;
    // Bunny extracts its own poster during encoding, so the canvas-probe poster
    // is not uploaded on this path — that is the point of moving providers. The
    // URL is deterministic from the GUID, so it can be recorded now even though
    // the file does not exist until encoding finishes; until then the UI falls
    // back to the bundled placeholder via the img onError handlers.
    thumbnail_url = slot.thumbnailUrl;
  } else {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const vext = v.file.name.split(".").pop()?.toLowerCase() || "mp4";
    // Resumable, so a dropped connection mid-upload continues rather than
    // restarting. The vendorId prefix is what the storage RLS policy checks.
    //
    // The path we propose is only a proposal: if this file has an interrupted
    // session pending, the upload resumes into THAT session's object instead.
    // Record what comes back, never the proposal — recording the proposal is
    // what produced a broken video_url plus a permanently orphaned object.
    const vpath = await resumableUpload(`${vendorId}/${key}.${vext}`, v.file, v.onProgress);
    video_url = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(vpath).data.publicUrl;

    if (v.thumbnail) {
      const text = v.thumbnail.name.split(".").pop()?.toLowerCase() || "jpg";
      // Derive the poster path from the video path that actually won, not from
      // `key`. On a resumed upload those differ, and pairing them means a retry
      // overwrites its own poster (upsert) instead of leaving one stranded.
      const tpath = `${vpath.replace(/\.[^./]+$/, "")}-thumb.${text}`;
      // Posters are small, so a plain upload is fine here — but note this lands
      // in the SAME bucket as the video, which is why the bucket's MIME allowlist
      // has to include image types.
      const { error: te } = await supabase.storage.from(VIDEO_BUCKET).upload(tpath, v.thumbnail, { upsert: true });
      if (te) throw te;
      thumbnail_url = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(tpath).data.publicUrl;
    }
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
    provider,
    bunny_video_id,
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
  // Remove the media BEFORE the row. The row is the only record of where the
  // files live, so deleting it first and then failing leaves an orphan nothing
  // in the app can ever find again. This order fails the other way: the row
  // survives, and the vendor can simply retry the delete.
  //
  // That reasoning did not stop applying when the bytes moved to Bunny — it got
  // sharper. Bunny storage is billed and there is no bucket table to reconcile
  // against from SQL, so the row is genuinely the only handle. The Bunny call
  // goes first for the same reason, and it needs the row to still exist because
  // the row is what proves the caller owns the asset.
  const { data: row } = await supabase
    .from("product_videos")
    .select("video_url, thumbnail_url, provider, bunny_video_id")
    .eq("id", id)
    .maybeSingle();

  if (row?.provider === "bunny" && row.bunny_video_id) {
    // The API key lives only in the edge function, so deletion has to go
    // through it. It resolves ownership from the row itself and treats a 404 at
    // Bunny as success, which is what makes a retry after a partial failure
    // able to finish instead of deadlocking.
    const { data, error } = await supabase.functions.invoke("bunny-delete-video", { body: { rowId: id } });
    if (error) {
      let detail = error.message;
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          detail = body.detail || body.error || detail;
        } catch {
          /* keep the original message */
        }
      }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(String(data.detail || data.error));
  }

  if (row) {
    // Storage objects. A bunny row has none — storageKeyFromPublicUrl returns
    // null for any URL outside our bucket, so this is a no-op there rather than
    // a special case. It still runs for a bunny row on purpose: a row that was
    // migrated between providers could carry one of each.
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

// ─────────────────────────────────────────────────────────────
// Container sniffing — a STOPGAP, and worth being precise about what it does
// and does not close.
//
// `file.type` is whatever the OS guessed from the extension. Rename an iPhone
// .mov to .mp4 and the browser reports video/mp4, ACCEPTED_VIDEO_MIME passes
// it, the bucket's server-side allowlist passes it too (it checks the same
// declared type), and it lands in the feed as a clip that plays on Safari and
// shows a black rectangle on Chrome and Android — most buyers here.
//
// Reading the first 12 bytes settles it, because the discriminator is not
// "does this have an ftyp box" — QuickTime is ISO-BMFF too and has one. It is
// the MAJOR BRAND in bytes 8..12: 'qt  ' is QuickTime, anything else with an
// ftyp box is an MP4 family brand.
//
// What this does NOT catch, deliberately: HEVC muxed into a genuine MP4
// container (brand 'isom'/'hvc1'), or a hand-crafted header on any payload.
// Those need a real transcoder to reject — Phase 8's provider migration, where
// the encoder simply fails on what it cannot decode. This narrows the
// ACCIDENTAL case, which is the realistic one: a phone renaming a file.
// ─────────────────────────────────────────────────────────────

export type VideoContainer = "mp4" | "webm" | "quicktime" | "unknown";

export async function sniffVideoContainer(file: File): Promise<VideoContainer> {
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return "unknown";
  }
  if (head.length < 12) return "unknown";

  // EBML magic — Matroska, of which WebM is a profile.
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";

  const ascii = (from: number, to: number) =>
    Array.from(head.slice(from, to), (b) => String.fromCharCode(b)).join("");

  // ISO base media: [4-byte size][ 'f','t','y','p' ][4-byte major brand]
  if (ascii(4, 8) !== "ftyp") return "unknown";
  return ascii(8, 12) === "qt  " ? "quicktime" : "mp4";
}

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
