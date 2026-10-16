import { useBackCloses } from "@/hooks/useBackCloses";
import { useDisplayCurrency } from "@/contexts/DisplayCurrencyContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCallVendor } from "@/lib/queries/calls";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Star, Bookmark, Share2, Volume2, VolumeX, Play, Heart, Eye, ChevronRight } from "lucide-react";
import CosoraLogo from "@/components/CosoraLogo";
import ShareSheet from "@/components/buyer/ShareSheet";
import { useAuth } from "@/contexts/AuthContext";
import { onThumbError, useProductReviewStats, type ReviewStats } from "@/lib/queries/videos";
import {
  recordVideoViewOnce,
  fetchLikedVideoIds, likeVideo, unlikeVideo,
  fetchSavedVideoIds, dbSaveVideo, dbUnsaveVideo,
  isPersistableVideoId,
} from "@/lib/queries/videoEngagement";

// Compact engagement-count formatting, reel-style: 1600 -> "1.6K",
// 1_250_000 -> "1.2M". Whole thousands/millions drop the ".0".
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export interface VideoCloseUp {
  id: string;
  vendorId: string;
  category: string;
  brandName: string;
  brandLine: string;
  price: string;
  moq: string;
  rating: number;
  reviews: string;
  /** Total likes this closeup has received. Instagram-reel-style engagement
   *  counter; the viewer adds +1 locally when the buyer taps the heart. */
  likes?: number;
  /** Total plays/views. Shown as a read-only counter next to the caption,
   *  same as a reel's view count. */
  views?: number;
  thumbnail: string;
  /**
   * Real video source. When present, the viewer plays this with native
   * <video> autoplay/loop (muted, per browser autoplay policy) instead of
   * showing a static thumbnail. Falls back to the thumbnail image if
   * absent or if the video fails to load — needed until vendor-uploaded
   * video URLs exist in the real catalogue.
   */
  videoUrl?: string;
  /**
   * The listing the video shows, when a buyer can open it (tagged and live). The card opens it; without one
   * it opens the seller's store (2026-10-16: the card went nowhere).
   */
  productId?: string | null;
}

interface VideoCloseUpsViewerProps {
  videos: VideoCloseUp[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Back closes the viewer (default). False on /video-closeups, where the
   * viewer is the page and back already leaves it.
   */
  backCloses?: boolean;
  /**
   * Fired whenever a video's bookmark state changes, passing the full
   * updated set of bookmarked video IDs. Lets the parent page derive
   * "categories the buyer has shown interest in this session" for
   * ranking purposes elsewhere on the page, without this viewer needing
   * to know anything about ranking itself.
   */
  onBookmarkChange?: (savedIds: Set<string>) => void;
  /** Fired with the video on screen, so /video-closeups can keep `?v=<id>` in its address. */
  onActiveChange?: (video: VideoCloseUp) => void;
}

// ─────────────────────────────────────────────────────────────
// VIDEO CLOSE-UPS VIEWER — Instagram/TikTok-style reels
//
// Real reel mechanics, not a slideshow with tap-zones:
//   - Vertical scroll-snap track. One video per "page", native browser
//     scrolling/swiping (touch, trackpad, mouse wheel) — not custom drag
//     math. Native scroll-snap is the right tool here: it's a discrete,
//     one-at-a-time selection exactly like the carousel pattern, and the
//     browser already does inertia/snapping correctly across input types.
//   - Each slide has a real <video> element (loop, muted, playsInline).
//     Only the slide that's actually centered in the viewport plays;
//     everything else is paused. Visibility is tracked with
//     IntersectionObserver (threshold 0.6) rather than scroll position
//     math, which is more robust and is also how the browser itself
//     reasons about "is this in view."
//   - Muted autoplay is a hard browser requirement (Chrome/Safari block
//     unmuted autoplay). A persistent tap-to-unmute control lets the
//     user opt into sound; the preference carries across slides in the
//     same viewer session via a single shared `muted` state.
//   - Progress bar reflects REAL video currentTime/duration via the
//     timeupdate event, not a fixed-duration timer.
//   - Falls back to the static thumbnail (current behavior) when a
//     slide has no videoUrl, so this works today with partial data
//     and upgrades automatically once real video URLs exist.
// ─────────────────────────────────────────────────────────────

// Slides either side of the active one that render their contents. Beyond this
// the shell is an empty <div>: no image, no <video>, no layout work. 2 keeps a
// poster ready one slide ahead of where a <video> is mounted, so scrolling
// never reveals an unpainted slide.
const SLIDE_WINDOW = 2;

export default function VideoCloseUpsViewer({ videos, initialIndex, isOpen, onClose, backCloses = true, onBookmarkChange, onActiveChange }: VideoCloseUpsViewerProps) {
  useBackCloses(isOpen, onClose, backCloses);
  const callVendor = useCallVendor();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  // Real review numbers of the listings shown, by listing id (product_review_stats).
  const reviewStats = useProductReviewStats(videos.map((v) => v.productId).filter((id): id is string => Boolean(id))).data;
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const [liked, setLiked] = useState<Set<string>>(new Set());
  // What the DB said when the viewer opened. `video.likes` already counts
  // these, so the displayed number is base + (current - hydrated), never
  // base + current — otherwise a like the buyer made yesterday would be
  // counted twice the moment the feed refetched.
  const [hydratedLikes, setHydratedLikes] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(true);
  // The video whose share sheet is open, or null.
  const [sharing, setSharing] = useState<VideoCloseUp | null>(null);
  const { showText } = useDisplayCurrency();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Stable across re-renders that hand back a new array of the same reels —
  // the parent re-ranks on every bookmark change, so `videos` identity alone
  // would re-run the hydration fetch on every tap.
  const persistableIds = useMemo(
    () => videos.map((v) => v.id).filter(isPersistableVideoId),
    [videos],
  );
  const idsKey = persistableIds.join(",");

  // Hydrate durable likes/saves for the signed-in buyer. Signed out, both
  // stay session-local exactly as before — there is no row to own.
  useEffect(() => {
    if (!isOpen || !user || !persistableIds.length) return;
    let cancelled = false;
    void Promise.all([
      fetchLikedVideoIds(persistableIds).catch(() => new Set<string>()),
      fetchSavedVideoIds(persistableIds).catch(() => new Set<string>()),
    ]).then(([likedIds, savedIds]) => {
      if (cancelled) return;
      // Merge rather than replace: a tap that landed while this was in flight
      // must not be undone by the response.
      setLiked((prev) => new Set([...likedIds, ...prev]));
      setSaved((prev) => new Set([...savedIds, ...prev]));
      setHydratedLikes(likedIds);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, idsKey]);

  // Scroll to the requested starting slide as soon as the viewer opens.
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(initialIndex);
    const target = slideRefs.current[initialIndex];
    // "auto" (not smooth) on open — we want to land exactly on the
    // requested slide instantly, not animate through intermediate ones.
    target?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [isOpen, initialIndex]);

  // Track which slide is actually centered in the viewport. This is the
  // single source of truth for "which video should be playing" — driven
  // by real visibility, not by scroll-offset arithmetic.
  useEffect(() => {
    if (!isOpen) return;
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { root: track, threshold: 0.6 }
    );

    slideRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [isOpen, videos.length]);

  // Lock body scroll while the full-screen viewer is open so the page
  // behind it can't also scroll.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // Signed out, a like or a save has nowhere to live: it used to light up and vanish on the next visit. Ask
  // them to sign in instead (2026-10-16).
  // A whole sentence each, so it translates as one (word order differs by language).
  const askToSignIn = (title: string) =>
    toast.info(title, {
      description: "Likes and saves are kept on your Cosora account.",
      action: { label: "Sign in", onClick: () => navigate("/login") },
    });

  // A save writes saved_videos, so a refresh keeps it and My Saves lists it. The set handed to
  // onBookmarkChange stays the IN-SESSION signal rankVideoCloseUps reads — deliberately not seeded from the
  // hydrated saves, because "what this buyer kept six weeks ago" and "what caught their eye just now" are
  // different questions and only the second one should reshuffle the next open.
  //
  // Shown at once, undone if the database refuses (it used to stay on screen and vanish on refresh).
  const toggleSave = (id: string) => {
    if (!user && isPersistableVideoId(id)) return askToSignIn("Sign in to save videos");
    const removing = saved.has(id);
    // Computed from the latest set (savedRef, also right inside the async undo) and handed to the parent
    // outside React's state update: telling the parent from inside setSaved's updater is a setState during
    // render, which React warns about.
    const apply = (remove: boolean) => {
      const next = new Set(savedRef.current);
      if (remove) next.delete(id);
      else next.add(id);
      savedRef.current = next;
      setSaved(next);
      onBookmarkChange?.(next);
    };
    apply(removing);
    if (user && isPersistableVideoId(id)) {
      (removing ? dbUnsaveVideo(user.id, id) : dbSaveVideo(user.id, id))
        .then(() => {
          void qc.invalidateQueries({ queryKey: ["saved_videos", user.id] });
          if (!removing) toast.success("Saved", { description: "Find it in My Saves.", action: { label: "Open", onClick: () => navigate("/saved") } });
        })
        .catch(() => {
          apply(!removing);
          toast.error(removing ? "Couldn't remove it from your saves" : "Couldn't save this video", { description: "Check your connection and try again." });
        });
    }
  };

  // Likes go through video_likes, not a counter RPC — a like is a toggle, so it needs a row that can be
  // deleted, not a number that only grows. The AFTER trigger keeps product_videos.likes_count in step.
  const toggleLike = (id: string) => {
    if (!user && isPersistableVideoId(id)) return askToSignIn("Sign in to like videos");
    const removing = liked.has(id);
    const apply = (remove: boolean) =>
      setLiked((prev) => {
        const next = new Set(prev);
        if (remove) next.delete(id);
        else next.add(id);
        return next;
      });
    apply(removing);
    if (user && isPersistableVideoId(id)) {
      (removing ? unlikeVideo(user.id, id) : likeVideo(user.id, id)).catch(() => {
        apply(!removing);
        toast.error("Couldn't save your like", { description: "Check your connection and try again." });
      });
    }
  };

  // The card opens the listing, or the seller's store when the video isn't tied to a live listing. Over a page
  // (backCloses) the viewer holds a history entry of its own: replace it, so back from the listing returns to
  // the page with the reel closed. On /video-closeups a normal push, so back returns to this video.
  const openLink = useCallback((path: string) => {
    if (backCloses) navigate(path, { replace: true });
    else navigate(path);
  }, [backCloses, navigate]);

  const scrollToSlide = useCallback((i: number) => {
    const target = slideRefs.current[Math.max(0, Math.min(videos.length - 1, i))];
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [videos.length]);

  // Keyboard, for a desktop without a touch screen: arrows move between videos, Escape closes, M mutes.
  // Ignored while the share sheet (or any field) has focus.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (sharing || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); scrollToSlide(activeIndex + 1); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); scrollToSlide(activeIndex - 1); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "m" || e.key === "M") setMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, sharing, activeIndex, scrollToSlide, onClose]);

  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  const activeVideo = videos[activeIndex];
  useEffect(() => {
    if (isOpen && activeVideo) onActiveChangeRef.current?.(activeVideo);
  }, [isOpen, activeVideo]);

  if (videos.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black"
        >
          {/* Close — fixed overlay, stays put while the track scrolls beneath it */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/50 to-transparent">
            <div className="flex items-center gap-2">
              <button onClick={onClose} aria-label="Close" className="p-1.5">
                <X className="w-6 h-6 text-white" />
              </button>
              {/* Cosora brand watermark, pinned to the top-left corner */}
              <CosoraLogo height={16} variant="white" className="opacity-90" />
            </div>
            <span className="text-sm text-white font-medium">{videos[activeIndex]?.category}</span>
            <button
              onClick={() => setMuted(m => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="p-1.5"
            >
              {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
            </button>
          </div>

          {/* Vertical scroll-snap track — the actual reel mechanic */}
          <div
            ref={trackRef}
            className="w-full h-full max-w-md mx-auto overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
            style={{ scrollSnapType: "y mandatory" }}
          >
            {videos.map((video, i) => {
              const distance = Math.abs(i - activeIndex);
              // The shell ALWAYS renders; only its contents are windowed. That
              // keeps scroll height, snap positions and slideRefs[i] exactly
              // correct with no measurement code, and — the reason this beats a
              // virtualiser here — every IntersectionObserver target stays
              // stable for the viewer's lifetime, so the observer effect never
              // has to re-run as the window slides.
              return (
                <div
                  key={video.id}
                  ref={el => { slideRefs.current[i] = el; }}
                  data-index={i}
                  className="relative w-full h-full snap-start snap-always"
                  style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
                >
                  {distance <= SLIDE_WINDOW && (
                    <VideoSlide
                      video={video}
                      distance={distance}
                      isActive={i === activeIndex}
                      muted={muted}
                      saved={saved.has(video.id)}
                      liked={liked.has(video.id)}
                      likeDelta={(liked.has(video.id) ? 1 : 0) - (hydratedLikes.has(video.id) ? 1 : 0)}
                      onToggleSave={() => toggleSave(video.id)}
                      onToggleLike={() => toggleLike(video.id)}
                      onCallNow={() => callVendor(video.vendorId, video.brandName)}
                      onShare={() => setSharing(video)}
                      reviews={video.productId ? reviewStats?.get(video.productId) ?? null : null}
                      onOpenCard={() => openLink(video.productId ? `/product/${video.productId}` : `/vendor/${video.vendorId}`)}
                      onOpenStore={() => openLink(`/vendor/${video.vendorId}`)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {/* Share (2026-10-14; the button did nothing). The link opens this video first:
              /video-closeups?v=<id>, which VideoCloseUpsPage reads. */}
          <ShareSheet
            open={sharing !== null}
            onOpenChange={(o) => { if (!o) setSharing(null); }}
            url={sharing ? `${window.location.origin}/video-closeups?v=${encodeURIComponent(sharing.id)}` : ""}
            title={sharing ? `${sharing.brandName}: ${sharing.brandLine} on Cosora` : ""}
            subtitle={sharing?.price ? showText(sharing.price) : null}
            image={sharing?.thumbnail ?? null}
            heading="Share this video"
            aboveFullscreen
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────

interface VideoSlideProps {
  video: VideoCloseUp;
  /** Slides away from the active one. Drives preload and whether a <video> mounts at all. */
  distance: number;
  isActive: boolean;
  muted: boolean;
  saved: boolean;
  liked: boolean;
  /** +1 / 0 / -1 — this session's change relative to the count already in `video.likes`. */
  likeDelta: number;
  onToggleSave: () => void;
  onToggleLike: () => void;
  onCallNow: () => void;
  onShare: () => void;
  /** The tagged listing's real reviews; null when it has none (or there's no live listing). */
  reviews: ReviewStats | null;
  /** Opens the listing, or the store when there's no live listing. */
  onOpenCard: () => void;
  onOpenStore: () => void;
}

function VideoSlide({ video, distance, isActive, muted, saved, liked, likeDelta, onToggleSave, onToggleLike, onCallNow, onShare, reviews, onOpenCard, onOpenStore }: VideoSlideProps) {
  const { showText } = useDisplayCurrency();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * Real playback state, and the ONE thing the tap overlay reads. Covers two
   * situations that used to be separate — the browser refusing autoplay, and
   * the buyer tapping to pause — because both leave a stopped video on screen
   * and both want the same affordance. Kept honest by the element's own
   * `play`/`pause` events below, so it can never disagree with what the video
   * is actually doing.
   */
  const [paused, setPaused] = useState(false);
  const [videoErrored, setVideoErrored] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  // Play the active slide's video, pause every other slide's. This is the
  // actual "reels" behavior — only one video plays at a time, and it's
  // always the one currently centered in the viewport.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video.videoUrl || videoErrored) return;

    if (isActive) {
      // Only rewind when there is something to rewind. An unconditional
      // `currentTime = 0` on an element with no buffered data queues a seek
      // and delays the first painted frame.
      if (el.readyState >= 1 && el.currentTime > 0.05) el.currentTime = 0;
      // Optimistic, and it matters: leaving `paused` true for the frame
      // between activation and play() resolving flashes a play icon over a
      // video that is starting perfectly well. `onPause`/`onPlay` below is
      // what corrects it if the browser actually refuses.
      //
      // This is also what makes a manual pause NOT survive a scroll away and
      // back — scrolling to a slide is a request to watch it, same as every
      // reel app.
      setPaused(false);
      const playPromise = el.play();
      // Autoplay can still be rejected by the browser in some cases (e.g.
      // power-saving mode) even when muted. Show the same tap-to-play
      // affordance a manual pause uses, instead of failing silently.
      playPromise?.catch(() => setPaused(true));
    } else {
      el.pause();
    }
  }, [isActive, video.videoUrl, videoErrored]);

  // Count a real view. The ACTIVE slide is the only one that counts — a slide
  // at distance 1 has a <video> mounted and metadata preloading, but nobody is
  // watching it, and counting those would make views_count a measure of
  // scroll velocity rather than attention. recordVideoViewOnce owns the
  // once-per-session dedup (a reel slide re-activates every time you scroll
  // back to it, and remounts as it re-enters SLIDE_WINDOW).
  //
  // This is what finally gives fetchVideoCloseUps's existing
  // .order("views_count") something real to sort on.
  useEffect(() => {
    if (!isActive) return;
    recordVideoViewOnce(video.id);
  }, [isActive, video.id]);

  // Release the media buffer when this slide scrolls out of the window.
  // Removing the element isn't enough on its own: the browser keeps the
  // decoded buffer around until GC and an in-flight range request carries on
  // downloading. `removeAttribute` + `load()` is the documented way to abort
  // it — NOT `src=""`, which resolves against the document URL and makes the
  // browser fetch the current page and try to decode it as media.
  useEffect(() => {
    const el = videoRef.current;
    return () => {
      if (!el) return;
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, []);

  // Keep mute state in sync with the shared viewer-level toggle.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  /**
   * Tap the video to pause, tap again to resume — the actual reels
   * interaction, not just a fallback for a blocked autoplay.
   *
   * Reads `el.paused` rather than the React state on purpose: the element is
   * the source of truth for whether it's playing, so a tap arriving while the
   * two disagree does what the video is actually doing, not what the last
   * render thought it was doing.
   */
  const togglePlayback = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => setPaused(true)); // onPlay below clears it on success
    } else {
      el.pause(); // onPause below flips `paused`
    }
  };

  const hasVideo = Boolean(video.videoUrl) && !videoErrored;

  // Displayed like count = the stored count plus this session's CHANGE to it,
  // so the number ticks up the moment they tap, exactly like a reel — and
  // ticks back down on an unlike, which a plain `+ (liked ? 1 : 0)` could not
  // express once likes became durable (a like made yesterday is already inside
  // `video.likes`; adding 1 for it again would double-count it). Floored at 0
  // for the unlike-a-stale-zero case.
  const baseLikes = video.likes ?? 0;
  const likeCount = Math.max(baseLikes + likeDelta, 0);

  // A <video> only exists for the active slide and its immediate neighbours.
  // Slide 2 shows just its poster, so a fling-scroll costs a handful of images
  // rather than speculatively downloading a video per slide passed.
  const mountVideo = hasVideo && distance <= 1;

  return (
    <>
      {/* Poster underlay — always painted, never removed. This is what makes
          the swap seamless: with preload="none" the browser has nothing to
          draw when play() is called, and a bare <video> renders as a black
          rectangle. The poster sits underneath and the video fades in over it
          once it has a frame. `poster` is also set on the element itself,
          which costs nothing extra since it is the same cached URL. */}
      <img
        src={video.thumbnail}
        alt={video.brandLine}
        decoding="async"
        // A Bunny poster is recorded at insert time but only exists once
        // encoding finishes, so a just-approved reel can 404 here. Falling back
        // to the bundled placeholder beats a broken-image glyph under the video.
        onError={onThumbError}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {mountVideo && (
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.thumbnail}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${videoReady ? "opacity-100" : "opacity-0"}`}
          loop
          muted={muted}
          playsInline
          // No picture-in-picture: a reel is a full-screen, scroll-snapped
          // surface. Popping the video into a floating window leaves this
          // slide's track scrolling underneath an empty spot while the
          // detached window keeps playing a slide the buyer has since
          // scrolled away from, and the two fight over play/pause — this is
          // the "it just glitches" a buyer hits from Chrome's native PiP
          // hover control or its context-menu entry. `disablePictureInPicture`
          // removes both AND blocks a programmatic requestPictureInPicture().
          disablePictureInPicture
          // Same reasoning for casting: handing a muted, looping, few-second
          // reel to a TV via the Remote Playback button is another surface
          // that can grab the element mid-scroll.
          disableRemotePlayback
          // Distance-based, not index-based. This used to read
          // `Math.abs(index) <= 1`, where `index` is the absolute slide number
          // — so slides 0 and 1 downloaded eagerly on open and every slide
          // from 2 on was permanently preload="none", stalling the moment it
          // was scrolled to. "metadata" on the neighbour fetches the moov atom
          // and one decodable frame, so the next slide is instantly playable
          // without pulling a whole second video.
          preload={distance === 0 ? "auto" : "metadata"}
          onLoadedData={() => setVideoReady(true)}
          onError={() => setVideoErrored(true)}
          // Source of truth for `paused`: anything that stops the video — a
          // tap, the browser refusing autoplay, the OS taking focus — is
          // reflected here rather than guessed at from whichever code path
          // triggered it.
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70 pointer-events-none" />

      {/* Tap-to-pause, and the manual-play affordance when autoplay was
          refused — one surface, because they're one interaction.

          Deliberately NOT z-10. It sits in the default stacking order, below
          the right-side actions, the views pill and the product card (all
          z-10) and below the top bar (z-20), so a tap on Like / Save / Share /
          Call Now still reaches those buttons and only a tap on the video
          itself toggles playback. Scrolling the reel is unaffected: a browser
          does not fire a click after a scroll gesture. */}
      {mountVideo && isActive && (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={paused ? "Play video" : "Pause video"}
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-none"
        >
          {/* Only the paused state gets an icon — a pause glyph sitting over
              a playing reel is the thing every video app learned to remove. */}
          {paused && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
            >
              <Play className="w-7 h-7 text-white fill-white" />
            </motion.span>
          )}
        </button>
      )}

      {/* Right-side actions */}
      <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5 z-10">
        <button onClick={onToggleLike} className="flex flex-col items-center gap-1" aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"}>
          <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
            <motion.span
              key={liked ? "liked" : "unliked"}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="flex"
            >
              <Heart className={`w-5 h-5 ${liked ? "fill-brand-buyer text-brand-buyer" : "text-white"}`} />
            </motion.span>
          </div>
          <span className="text-[10px] text-white tabular-nums">{formatCount(likeCount)}</span>
        </button>
        <button onClick={onToggleSave} className="flex flex-col items-center gap-1" aria-pressed={saved} aria-label={saved ? "Saved" : "Save"}>
          <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
            <Bookmark className={`w-5 h-5 ${saved ? "fill-white text-white" : "text-white"}`} />
          </div>
          <span className="text-[10px] text-white">{saved ? "Saved" : "Save"}</span>
        </button>
        <button onClick={onShare} aria-label="Share" className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-[10px] text-white">Share</span>
        </button>
      </div>

      {/* Views counter — read-only reel-style play count, sits just above
          the product card so it reads as metadata about the video itself. */}
      {video.views != null && (
        <div className="absolute bottom-[92px] left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur">
          <Eye className="w-3.5 h-3.5 text-white" />
          <span className="text-[11px] font-medium text-white tabular-nums">{formatCount(video.views)} views</span>
        </div>
      )}

      {/* Bottom product card. Tapping it opens the listing the video shows, or the seller's store when the
          video isn't tied to a live listing; the seller's name opens the store (2026-10-16: none of it went
          anywhere). The rating is the listing's real reviews, and absent without any. */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
        <div className="bg-white/95 backdrop-blur rounded-2xl p-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenCard}
            aria-label={video.productId ? `View ${video.brandLine}` : `Visit ${video.brandName}'s store`}
            data-testid="reel-card"
            data-active={isActive ? "true" : undefined}
            className="flex flex-1 min-w-0 items-center gap-3 text-left"
          >
            {/* Same URL as the poster, so a cache hit; the size hints stop a full-size decode for 48px. */}
            <img src={video.thumbnail} alt="" loading="lazy" decoding="async" onError={onThumbError} width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] text-gray-900 font-semibold truncate">{video.brandLine}</span>
              <span className="flex items-center gap-2 mt-0.5">
                {video.price && <span className="text-sm font-bold text-brand-buyer">{showText(video.price)}</span>}
                {video.moq && <span className="text-[10px] text-gray-400">MOQ: {video.moq}</span>}
                {reviews && reviews.count > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                    <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" /> {reviews.avg.toFixed(1)} · {reviews.count}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex items-center text-[10px] font-semibold text-brand-buyer">
                {video.productId ? "View product" : "Visit store"} <ChevronRight className="w-3 h-3" />
              </span>
            </span>
          </button>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <button type="button" onClick={onOpenStore} className="max-w-[120px] truncate text-[11px] font-bold text-gray-900 hover:underline">
              {video.brandName}
            </button>
            <button
              onClick={onCallNow}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-brand-buyer text-white text-xs font-bold rounded-xl hover:bg-brand-buyer/90 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> Call Now
            </button>
          </div>
        </div>
      </div>
    </>
  );
}