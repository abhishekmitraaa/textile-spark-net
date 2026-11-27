import { useState } from "react";
import { Play } from "lucide-react";

/**
 * A YouTube video that loads YouTube only when it is played (speed plan §9.1, 2026-11-28).
 *
 * An embedded player runs ~2 s of YouTube's scripts on a phone whether or not anyone presses play: on `/seller` it was
 * most of the page's blocking time. This shows the video's picture with a play button, and puts the player in its
 * place, already playing, on the first tap. The picture ships with the app (`poster`, an import), never hotlinked.
 */
export function YouTubeFacade({ videoId, title, poster }: { videoId: string; title: string; poster: string }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return (
      <iframe
        className="h-full w-full"
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      className="group relative block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-vendor"
    >
      <img src={poster} alt="" width={960} height={540} decoding="async" className="h-full w-full object-cover" />
      <span className="absolute left-1/2 top-1/2 flex h-14 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[#ff0000] shadow-lg transition-transform group-hover:scale-105">
        <Play className="h-7 w-7 fill-white text-white" aria-hidden />
      </span>
    </button>
  );
}
