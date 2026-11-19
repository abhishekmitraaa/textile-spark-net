import type { VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";

// ─────────────────────────────────────────────────────────────
// VIDEO CLOSE-UPS — dev sample data + ranking
//
// The ranking helper is shared by every buyer surface. The sample catalogue
// below is development-only; production reads `product_videos` exclusively via
// useVideoCloseUps(), and an empty result now renders as empty.
// ─────────────────────────────────────────────────────────────

// ── DEV/TEST ONLY. Never reaches a production buyer. ──────────────────────
//
// Read this through `devOnlyVideoCloseUps()`, not directly. Every buyer surface
// used to do `dbVideos?.length ? dbVideos : VIDEO_CLOSE_UPS`, so the feed always
// looked populated whether or not a single vendor had ever uploaded anything —
// which is precisely what hid the fact that the upload pipeline had never run.
//
// The clips are 9:16 portrait to match the viewer (the previous set were 16:9
// landscape letterboxed into a portrait reel) and are small files, because they
// exist to make playback testable, not to look like a catalogue.
const DEV_VIDEO_CLOSE_UPS: VideoCloseUp[] = [
  { id: "dev1", vendorId: "dev-v1", category: "Jeans",         brandName: "[DEV] Sample Mills",    brandLine: "Straight Fit Denim",     price: "₹560", moq: "2", rating: 3.8, reviews: "1.6k", likes: 3420,  views: 48200,  thumbnail: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=450&h=800&fit=crop", videoUrl: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4" },
  { id: "dev2", vendorId: "dev-v2", category: "T-shirts/Tops", brandName: "[DEV] Sample Knits",    brandLine: "Oversized Graphic Tee",  price: "₹399", moq: "2", rating: 4.1, reviews: "2.1k", likes: 5810,  views: 91500,  thumbnail: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=450&h=800&fit=crop", videoUrl: "https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4" },
  { id: "dev3", vendorId: "dev-v3", category: "Shirt",         brandName: "[DEV] Sample Linens",   brandLine: "Linen Camp Collar Shirt", price: "₹520", moq: "2", rating: 4.5, reviews: "3.4k", likes: 8760,  views: 156000, thumbnail: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=450&h=800&fit=crop", videoUrl: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_2MB.mp4" },
  { id: "dev4", vendorId: "dev-v4", category: "Dress",         brandName: "[DEV] Sample Weaves",   brandLine: "Floral Wrap Midi Dress", price: "₹720", moq: "4", rating: 4.0, reviews: "950",  likes: 2130,  views: 33400,  thumbnail: "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=450&h=800&fit=crop", videoUrl: "https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_2MB.mp4" },
];

/**
 * Sample reels for local development and Playwright runs only — `[]` in a
 * production build, so an empty catalogue renders as genuinely empty rather
 * than quietly serving fake vendors.
 *
 * `import.meta.env.DEV` is statically replaced by Vite, so the array is tree-
 * shaken out of the production bundle entirely.
 */
export function devOnlyVideoCloseUps(): VideoCloseUp[] {
  return import.meta.env.DEV ? DEV_VIDEO_CLOSE_UPS : [];
}

// ─────────────────────────────────────────────────────────────
// VIDEO CLOSE-UPS RANKING
//
// Adapted from how Instagram's Reels ranking is structured (per Adam
// Mosseri's public statements): pull a candidate pool, score each item
// against multiple weighted signals, sort by composite score. That
// STRUCTURE is legitimate and worth borrowing. What is NOT borrowed:
// Instagram's actual top signals — watch time, DM sends, likes-per-reach
// — because none of those exist here. There's no backend, no playback
// analytics, and no engagement-tracking pipeline. Faking those numbers
// client-side would look sophisticated and mean nothing; it would be
// decoration, not ranking.
//
// What Cosora genuinely has today, and what this function actually uses:
//
//   1. THE DATABASE'S ORDER (review M-22) — video_closeups_feed(): the tagged
//      listing's recent demand and the video's own age, on the recent-demand
//      scale (documentation/ranking.md 4.7). The list arrives in that order and
//      it is the tiebreak here. It used to be product_videos.rating × review
//      volume, a seeded number nothing writes.
//
//   2. IN-SESSION INTEREST MATCH — if the buyer has bookmarked any video
//      in a given category during this viewing session, other videos in
//      that same category get a relevance boost. This is a real, working
//      signal (bookmarks are genuinely stored in component state), but it
//      only has scope within the current session — there's no backend to
//      persist it across visits, so this is NOT the same as Instagram's
//      cross-session interest modeling. It resets on page reload.
//
//   3. VENDOR DIVERSITY — avoid placing two videos from the same vendor
//      back-to-back. Mirrors Instagram's stated goal of mixing creators
//      rather than over-showing one source.
//
//   4. STABLE TIEBREAK — ties keep the database's order, so the strip
//      doesn't reshuffle on every render.
//
// HONEST LIMITATION: with only 7 demo videos, this is enough to show real
// reordering behavior (verified separately) but is still a small catalogue
// relative to a real production inventory.
// ─────────────────────────────────────────────────────────────

export function rankVideoCloseUps(videos: VideoCloseUp[], interestedCategories: Set<string>): VideoCloseUp[] {
  // The buyer's interests first, otherwise the order the list arrived in (the database's).
  const scored = videos.map((video, originalIndex) => ({
    video, score: interestedCategories.has(video.category) ? 1 : 0, originalIndex,
  }));

  // Sort by score descending, stable tiebreak on original order.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  // Vendor-diversity pass: walk the score-sorted list and greedily avoid
  // placing two consecutive videos from the same vendor where an
  // alternative exists later in the list.
  const result: VideoCloseUp[] = [];
  const remaining = [...scored];
  while (remaining.length > 0) {
    const lastVendor = result[result.length - 1]?.vendorId;
    let pickIdx = remaining.findIndex(item => item.video.vendorId !== lastVendor);
    if (pickIdx === -1) pickIdx = 0; // no alternative left, must repeat vendor
    result.push(remaining[pickIdx].video);
    remaining.splice(pickIdx, 1);
  }

  return result;
}