import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { thumbUrl } from "@/lib/thumbs";

/** How many cards at the top of a grid count as the first screen (two rows of two on a phone). */
export const PRIORITY_CARDS = 4;

const PHOTO = "absolute inset-0 w-full h-full object-cover transition-opacity duration-300";

/**
 * A card photo: the 480 px thumbnail the server made from the approved photo, else the full photo — also when the
 * thumbnail can't be loaded (not made yet, or a format the server doesn't read). See src/lib/thumbs.ts.
 */
function CardImg({ src, alt, className, priority }: { src: string; alt: string; className: string; priority?: boolean }) {
  const thumb = thumbUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      src={thumb && !failed ? thumb : src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      // The first cards on screen are the page's main picture (LCP): fetch them first, not lazily (speed plan 2.4).
      // React 18 has no fetchPriority prop; the lowercase attribute reaches the DOM as written.
      {...(priority ? { fetchpriority: "high" } : {})}
      onError={thumb && !failed ? () => setFailed(true) : undefined}
      className={className}
    />
  );
}

/**
 * Any small listing picture outside a product card (the New Arrivals carousel, sponsored rails, a store's grids):
 * the server-made 480 px thumbnail, else the full photo (speed plan 2.4, 2026-11-27). The home feed's carousel and
 * rails loaded 1206 px originals to show them at 112–169 px. Not for a picture shown large (the product page's own
 * photos keep the original).
 */
export function ThumbImg({ src, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string }) {
  const thumb = thumbUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      {...rest}
      src={thumb && !failed ? thumb : src}
      onError={thumb && !failed ? () => setFailed(true) : rest.onError}
    />
  );
}

/**
 * A product card's photo, and its second photo on hover (2026-11-18 review, H-12).
 *
 * Every card used to download both full-size photos at once, off screen too: two 1,600 px images per card, 48 per page
 * of 24, against Supabase's 5 GB a month. Now each is the server-made 480 px thumbnail (full photo as the fallback),
 * loaded lazily, and the second one is fetched only after the first hover, then kept for the fade.
 */
export function CardPhotos({ primary, secondary, alt, hovered, priority }: {
  primary: string;
  secondary?: string | null;
  alt: string;
  hovered: boolean;
  /** One of the first cards on screen (the first {@link PRIORITY_CARDS}): loaded at once, at high priority. */
  priority?: boolean;
}) {
  const [hoveredOnce, setHoveredOnce] = useState(false);
  useEffect(() => {
    if (hovered) setHoveredOnce(true);
  }, [hovered]);
  const second = hoveredOnce && secondary && secondary !== primary ? secondary : null;

  return (
    <>
      <CardImg src={primary} alt={alt} priority={priority} className={cn(PHOTO, second && hovered ? "opacity-0" : "opacity-100")} />
      {second && <CardImg src={second} alt="" className={cn(PHOTO, hovered ? "opacity-100" : "opacity-0")} />}
    </>
  );
}
