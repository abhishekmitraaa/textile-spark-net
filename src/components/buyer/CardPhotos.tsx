import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { thumbUrl } from "@/lib/thumbs";

const PHOTO = "absolute inset-0 w-full h-full object-cover transition-opacity duration-300";

/**
 * A card photo: the 480 px thumbnail the server made from the approved photo, else the full photo — also when the
 * thumbnail can't be loaded (not made yet, or a format the server doesn't read). See src/lib/thumbs.ts.
 */
function CardImg({ src, alt, className }: { src: string; alt: string; className: string }) {
  const thumb = thumbUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <img
      src={thumb && !failed ? thumb : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={thumb && !failed ? () => setFailed(true) : undefined}
      className={className}
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
export function CardPhotos({ primary, secondary, alt, hovered }: {
  primary: string;
  secondary?: string | null;
  alt: string;
  hovered: boolean;
}) {
  const [hoveredOnce, setHoveredOnce] = useState(false);
  useEffect(() => {
    if (hovered) setHoveredOnce(true);
  }, [hovered]);
  const second = hoveredOnce && secondary && secondary !== primary ? secondary : null;

  return (
    <>
      <CardImg src={primary} alt={alt} className={cn(PHOTO, second && hovered ? "opacity-0" : "opacity-100")} />
      {second && <CardImg src={second} alt="" className={cn(PHOTO, hovered ? "opacity-100" : "opacity-0")} />}
    </>
  );
}
