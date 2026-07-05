import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import VideoCloseUpsViewer from "@/components/buyer/VideoCloseUpsViewer";
import { VIDEO_CLOSE_UPS, rankVideoCloseUps } from "@/data/videoCloseUps";
import { useVideoCloseUps } from "@/lib/queries/videos";

// ─────────────────────────────────────────────────────────────
// /video-closeups — dedicated route
//
// Opens the full-screen Instagram-reel-style viewer immediately on mount
// (arriving here via a nav tap IS the "open" action) and navigates back
// when the viewer closes.
//
// Data source: real vendor-uploaded reels from `product_videos` (Supabase).
// While that loads, or if the catalogue has no videos yet, we fall back to
// the local sample clips so the reel never opens empty.
// ─────────────────────────────────────────────────────────────

export default function VideoCloseUpsPage() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  const [bookmarkedVideoIds, setBookmarkedVideoIds] = useState<Set<string>>(new Set());

  const { data: dbVideos } = useVideoCloseUps();
  const catalogue = dbVideos && dbVideos.length > 0 ? dbVideos : VIDEO_CLOSE_UPS;

  // Same in-session interest signal NewArrivals.tsx uses.
  const interestedCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const video of catalogue) {
      if (bookmarkedVideoIds.has(video.id)) cats.add(video.category);
    }
    return cats;
  }, [bookmarkedVideoIds, catalogue]);

  const rankedVideoCloseUps = useMemo(
    () => rankVideoCloseUps(catalogue, interestedCategories),
    [catalogue, interestedCategories]
  );

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      if (window.history.length > 1) navigate(-1);
      else navigate("/home/new-arrivals");
    }, 200);
  };

  return (
    <div className="min-h-screen bg-white">
      <VideoCloseUpsViewer
        videos={rankedVideoCloseUps}
        initialIndex={0}
        isOpen={isOpen}
        onClose={handleClose}
        onBookmarkChange={setBookmarkedVideoIds}
      />
    </div>
  );
}
