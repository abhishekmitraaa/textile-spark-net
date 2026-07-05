import type { VideoCloseUp } from "@/components/buyer/VideoCloseUpsViewer";

// ─────────────────────────────────────────────────────────────
// VIDEO CLOSE-UPS — shared data + ranking
//
// Originally lived inline in NewArrivals.tsx. Extracted here so it can
// also be used by the dedicated /video-closeups route (opened from the
// bottom nav, reachable from any page) without duplicating the catalogue
// or the ranking logic in two places.
// ─────────────────────────────────────────────────────────────

// NOTE: videoUrl values are freely-licensed public sample clips
// (Google's GCS sample-videos bucket), used here only as stand-ins so
// playback is genuinely testable. Swap for real vendor-uploaded video
// URLs once the catalogue has them — the viewer component already
// falls back to the thumbnail image automatically if videoUrl is
// absent or fails to load, so removing these is also safe.
export const VIDEO_CLOSE_UPS: VideoCloseUp[] = [
  { id: "vid1", vendorId: "v5",  category: "Jeans",          brandName: "Nam Pyunghwa / FORCE", brandLine: "Straight Fit Denim",      price: "$6.78",  moq: "2", rating: 3.8, reviews: "1.6k", likes: 3420,  views: 48200,  thumbnail: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&h=650&fit=crop",  videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" },
  { id: "vid2", vendorId: "v6",  category: "T-shirts/Tops",  brandName: "Nam Pyunghwa / FORCE", brandLine: "Oversized Graphic Tee",   price: "$16.37", moq: "2", rating: 3.8, reviews: "1.6k", likes: 5810,  views: 91500,  thumbnail: "https://images.unsplash.com/photo-1622445275576-721325763afe?w=500&h=650&fit=crop", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4" },
  { id: "vid3", vendorId: "v7",  category: "Jeans",          brandName: "Tiruppur Mills",       brandLine: "Slim Fit Stretch Jeans",  price: "$26.71", moq: "2", rating: 4.2, reviews: "2.1k", likes: 12400, views: 210000, thumbnail: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&h=650&fit=crop", videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4" },
  { id: "vid4", vendorId: "v8",  category: "Shirt",          brandName: "Surat Textiles Co.",   brandLine: "Linen Camp Collar Shirt", price: "$14.20", moq: "2", rating: 4.5, reviews: "3.4k", likes: 8760,  views: 156000, thumbnail: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&h=650&fit=crop",  videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4" },
  { id: "vid5", vendorId: "v9",  category: "Dress",          brandName: "Jaipur Weaves",        brandLine: "Floral Wrap Midi Dress",  price: "$19.99", moq: "4", rating: 4.0, reviews: "950",  likes: 2130,  views: 33400,  thumbnail: "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=500&h=650&fit=crop",  videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4" },
  { id: "vid6", vendorId: "v10", category: "Activewear",     brandName: "FitForm Apparel",      brandLine: "Mesh Panel Training Tee",  price: "$8.50",  moq: "6", rating: 3.6, reviews: "510",  likes: 940,   views: 18700,  thumbnail: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500&h=650&fit=crop",  videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4" },
  { id: "vid7", vendorId: "v11", category: "Ethnic Wear",    brandName: "Lucknow Chikankari Co.", brandLine: "Hand-Embroidered Kurta", price: "$22.40", moq: "2", rating: 4.7, reviews: "4.8k", likes: 21500, views: 1250000, thumbnail: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&h=650&fit=crop",   videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
];

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
//   1. VENDOR QUALITY (rating, weighted by review volume) — this is real,
//      already-present catalogue data. Maps to Instagram's "information
//      about the creator" signal (follower count / engagement history).
//      Review count is log-scaled so a vendor with 2.1k reviews isn't
//      treated as 1000x more trustworthy than one with 1.6k — it's a
//      damping curve, not a linear multiplier.
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
//   4. STABLE TIEBREAK — ties fall back to original catalogue order, so
//      the strip doesn't visually reshuffle on every render once scores
//      are equal.
//
// HONEST LIMITATION: with only 7 demo videos, this is enough to show real
// reordering behavior (verified separately) but is still a small catalogue
// relative to a real production inventory.
// ─────────────────────────────────────────────────────────────

function parseReviewCount(reviews: string): number {
  // "1.6k" -> 1600, "2.1k" -> 2100, "850" -> 850
  const match = reviews.match(/^([\d.]+)(k)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  return match[2] ? num * 1000 : num;
}

function vendorQualityScore(video: VideoCloseUp): number {
  const reviewCount = parseReviewCount(video.reviews);
  // log-damped review volume so 2.1k vs 1.6k reviews isn't a huge swing,
  // but a vendor with meaningfully more reviews still edges ahead.
  const reviewWeight = Math.log10(reviewCount + 1);
  return video.rating * reviewWeight;
}

export function rankVideoCloseUps(videos: VideoCloseUp[], interestedCategories: Set<string>): VideoCloseUp[] {
  const INTEREST_BOOST = 2.5; // flat additive bonus for an in-session category match

  const scored = videos.map((video, originalIndex) => {
    let score = vendorQualityScore(video);
    if (interestedCategories.has(video.category)) score += INTEREST_BOOST;
    return { video, score, originalIndex };
  });

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