import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clapperboard, Loader2 } from "lucide-react";
import VideoCloseUpsViewer from "@/components/buyer/VideoCloseUpsViewer";
import { devOnlyVideoCloseUps, rankVideoCloseUps } from "@/data/videoCloseUps";
import { useVideoCloseUps } from "@/lib/queries/videos";

// ─────────────────────────────────────────────────────────────
// /video-closeups — dedicated route
//
// Opens the full-screen reel viewer immediately on mount (arriving here via a
// nav tap IS the "open" action) and navigates back when the viewer closes.
//
// Data source: vendor-uploaded reels from `product_videos` (Supabase), and
// nothing else in production. The sample clips are dev-only — see
// devOnlyVideoCloseUps().
//
// The viewer renders null on an empty list, so with no live videos this route
// used to be a blank white screen with no way back. Loading and empty states
// are handled here instead.
// ─────────────────────────────────────────────────────────────

export default function VideoCloseUpsPage() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  const [bookmarkedVideoIds, setBookmarkedVideoIds] = useState<Set<string>>(new Set());

  const { data: dbVideos, isPending } = useVideoCloseUps();
  const usingDevFallback = !dbVideos?.length;
  const catalogue = usingDevFallback ? devOnlyVideoCloseUps() : dbVideos;

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

  // The viewer must receive a list whose ORDER never changes while it's open.
  // Bookmarking a slide feeds interestedCategories, which re-runs the ranking
  // and produces a differently-ordered array — so without this snapshot the
  // reel reshuffles under the user's finger mid-scroll, and with windowing that
  // is a visible jump onto a different product. Re-ranking now affects the next
  // open instead, which is the correct semantic anyway: in-session interest
  // should shape what you see next time, not shuffle the deck you're holding.
  //
  // The snapshot must not latch onto the dev fallback, though.
  // devOnlyVideoCloseUps() returns its samples SYNCHRONOUSLY while the real
  // query is still pending, so the first pass froze those and never re-synced —
  // in dev the reel showed sample clips even with real rows in the table, which
  // makes hand-testing this feature actively misleading. Tracking which source
  // the snapshot came from lets it re-arm exactly once, when real rows
  // supersede the fallback, without giving up the freeze.
  const [openList, setOpenList] = useState<typeof rankedVideoCloseUps>([]);
  const [snapshotFromDev, setSnapshotFromDev] = useState(false);
  useEffect(() => {
    if (!isOpen || rankedVideoCloseUps.length === 0) return;
    const supersededByRealData = snapshotFromDev && !usingDevFallback;
    if (openList.length === 0 || supersededByRealData) {
      setOpenList(rankedVideoCloseUps);
      setSnapshotFromDev(usingDevFallback);
    }
  }, [isOpen, openList.length, rankedVideoCloseUps, snapshotFromDev, usingDevFallback]);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      if (window.history.length > 1) navigate(-1);
      else navigate("/home/new-arrivals");
    }, 200);
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/home/new-arrivals");
  };

  // Nothing to show: either still fetching, or genuinely no live videos. The
  // viewer would render null in both cases, stranding the buyer on a blank
  // page, so this route owns those states itself.
  if (isPending || rankedVideoCloseUps.length === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button onClick={goBack} aria-label="Go back" className="-ml-1 p-1.5 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Video Close-Ups</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          {isPending ? (
            <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                <Clapperboard className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-900">No video close-ups yet</p>
              <p className="mt-1.5 text-sm text-gray-500 max-w-xs">
                Suppliers haven't posted any product videos yet. Check back soon.
              </p>
              <button
                onClick={goBack}
                className="mt-6 rounded-xl bg-[#ef4d62] px-5 py-2.5 text-sm font-bold text-white active:scale-[0.99]"
              >
                Back to browsing
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <VideoCloseUpsViewer
        videos={openList.length ? openList : rankedVideoCloseUps}
        initialIndex={0}
        isOpen={isOpen}
        onClose={handleClose}
        onBookmarkChange={setBookmarkedVideoIds}
      />
    </div>
  );
}
