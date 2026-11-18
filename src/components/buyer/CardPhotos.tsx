import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PHOTO = "absolute inset-0 w-full h-full object-cover transition-opacity duration-300";

/**
 * A product card's photo, and its second photo on hover (2026-11-18 review, H-12).
 *
 * Every card used to download both full-size photos at once, off screen too: two 1,600 px images per card, 48 per page
 * of 24, against Supabase's 5 GB a month. Now the photo loads lazily (the browser fetches it as it nears the screen),
 * and the second one is fetched only after the first hover, then kept for the fade.
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
      <img
        src={primary}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(PHOTO, second && hovered ? "opacity-0" : "opacity-100")}
      />
      {second && (
        <img
          src={second}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(PHOTO, hovered ? "opacity-100" : "opacity-0")}
        />
      )}
    </>
  );
}
