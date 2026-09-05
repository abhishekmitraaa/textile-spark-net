import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Video closeup engagement — views, likes, saves.
//
// Why this is its own module and not part of savedStore.ts: savedStore's whole
// state shape is folders-of-ListingProducts (saved_items + saved_folders +
// saved_folder_items, with an "All Saves" master folder). A saved VIDEO has no
// folder — the viewer has one bookmark button and no folder picker — so
// bolting saved_videos onto that store would mean either inventing a folder
// model the UI does not have, or carving out a special case in every selector.
// The DB shape is deliberately the same (composite PK, `buyer_id = auth.uid()`
// RLS, fire-and-forget writes); it is only the client state model that differs.
//
// Everything here mirrors the products equivalents in lib/queries/products.ts:
// a buyer owns none of these rows, so a counter change goes through a
// SECURITY DEFINER RPC and an ownership row goes through RLS.
// ─────────────────────────────────────────────────────────────

/**
 * Atomic +1 on product_videos.views_count. Scoped to status='live' inside the
 * function, so passing a draft/under_review/rejected id is a silent no-op
 * rather than something the client has to check first.
 *
 * Caller owns dedup, exactly like recordProductView: ProductDetail keys off
 * `sessionStorage["cosora.viewed.<id>"]`, and recordVideoView's caller does the
 * same with its own prefix. Once per viewer per session — a refresh does not
 * recount, a new session does.
 */
export async function recordVideoView(id: string): Promise<void> {
  const { error } = await supabase.rpc("increment_video_view", { p: id });
  if (error) throw error;
}

// ── Likes ────────────────────────────────────────────────────
// A row in video_likes IS the like; product_videos.likes_count is kept in step
// by an AFTER trigger. So the client never writes a count — it writes its own
// membership row and the counter follows. That is what makes a like undoable
// and what lets "did I already like this?" survive a refresh.

/** Every video the signed-in buyer has liked, of the ones currently on screen. */
export async function fetchLikedVideoIds(videoIds: string[]): Promise<Set<string>> {
  if (!videoIds.length) return new Set();
  const { data, error } = await supabase
    .from("video_likes")
    .select("video_id")
    .in("video_id", videoIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.video_id));
}

/** Fire-and-forget, like savedStore's dbSaveItem. RLS enforces ownership. */
export function likeVideo(buyerId: string, videoId: string): void {
  void supabase
    .from("video_likes")
    .upsert({ buyer_id: buyerId, video_id: videoId }, { onConflict: "buyer_id,video_id" })
    .then(() => {});
}

export function unlikeVideo(buyerId: string, videoId: string): void {
  void supabase
    .from("video_likes")
    .delete()
    .eq("buyer_id", buyerId)
    .eq("video_id", videoId)
    .then(() => {});
}

// ── Saves ────────────────────────────────────────────────────

/** Every video the signed-in buyer has saved, of the ones currently on screen. */
export async function fetchSavedVideoIds(videoIds: string[]): Promise<Set<string>> {
  if (!videoIds.length) return new Set();
  const { data, error } = await supabase
    .from("saved_videos")
    .select("video_id")
    .in("video_id", videoIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.video_id));
}

export function dbSaveVideo(buyerId: string, videoId: string): void {
  void supabase
    .from("saved_videos")
    .upsert({ buyer_id: buyerId, video_id: videoId }, { onConflict: "buyer_id,video_id" })
    .then(() => {});
}

export function dbUnsaveVideo(buyerId: string, videoId: string): void {
  void supabase
    .from("saved_videos")
    .delete()
    .eq("buyer_id", buyerId)
    .eq("video_id", videoId)
    .then(() => {});
}

// The dev-only sample reels in src/data/videoCloseUps.ts carry synthetic ids
// ("dev1"), which would 22P02 against a uuid FK. Same guard savedStore applies
// to synthetic product ids: they stay local-only.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPersistableVideoId = (id: string): boolean => UUID_RE.test(id);

// ── View dedup ───────────────────────────────────────────────
// ProductDetail can get away with a bare sessionStorage check because a
// product page mounts once per visit. A reel slide does not: scrolling down
// and back up re-activates the same slide, and the windowing unmounts and
// remounts it as it leaves and re-enters SLIDE_WINDOW. So the dedup here is
// two-layer — an in-memory set that survives remounts within this page load,
// and sessionStorage on top of it so a reload inside the same tab session
// doesn't recount either. Same "once per viewer per session" contract as
// recordProductView, just defended against a surface that revisits itself.

const viewedThisSession = new Set<string>();

/** True the first time this session claims `id`, false every time after. */
function claimFirstView(id: string): boolean {
  if (viewedThisSession.has(id)) return false;
  viewedThisSession.add(id);
  const key = `cosora.videoViewed.${id}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // Private mode / storage disabled: the in-memory set above still dedups
    // this page load, which is the case that actually matters here.
  }
  return true;
}

/**
 * What callers should use. Counts a view at most once per video per session,
 * skips the dev-only sample reels, and never rejects — a dropped counter is
 * not worth an error toast over a feed the buyer is still scrolling.
 */
export function recordVideoViewOnce(id: string): void {
  if (!isPersistableVideoId(id) || !claimFirstView(id)) return;
  void recordVideoView(id).catch(() => {});
}
