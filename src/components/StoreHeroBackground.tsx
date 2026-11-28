import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The picture behind a store's hero (the buyer's /vendor/:id and the seller's own /business-profile): the seller's
 * banner, or, until they upload one, a default drawn in CSS.
 *
 * 2026-10-17 (Mitra: "the default banner is not optimised for mobile"). The default was a dark brand gradient
 * under a 75% black wash with the store name in 48 px letters spaced 0.3em apart across the middle: on a phone
 * the name ran off both edges, was cut mid-word and sat on top of the name, location and counts. Now:
 * - a woven-cloth texture over the brand colour (a few lines of CSS: nothing to download, sharp at any size);
 * - the store's first letter as a large faint monogram on the right, sized to the box, so it never overflows;
 * - the dark wash only at the bottom, under the text, so the banner itself shows.
 *
 * 2026-11-28 (Mitra: the default "is optimised for the desktop view but not for phone view"). On a phone the letter
 * filled the whole box and ran behind the name and counts, so it read as a cropped store name ("T" of "Teenplus").
 * Below `sm` the default now shows the whole name as a faint wordmark across the top, sized to fit the width
 * (<FittedWordmark>), clear of the back button and of the text at the bottom; from `sm` up the monogram stays.
 * A seller's own banner is untouched.
 *
 * The parent sets the box size; this fills it.
 */
export default function StoreHeroBackground({
  bannerUrl,
  brandName,
  tone,
}: {
  bannerUrl?: string | null;
  brandName: string;
  /** The side's brand colour: coral on the buyer side, blue on the seller's. */
  tone: "buyer" | "vendor";
}) {
  const initial = brandName.trim().charAt(0).toUpperCase() || "C";
  return (
    <>
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt={`${brandName} banner`}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          data-testid="store-default-banner"
          className={cn(
            "absolute inset-0 overflow-hidden",
            tone === "buyer"
              ? "bg-gradient-to-br from-brand-buyer via-[#d4455f] to-[#7a2a3d]"
              : "bg-gradient-to-br from-brand-vendor via-[#2f7bf5] to-[#1b4fb8]",
          )}
        >
          {/* Warp and weft: two fine diagonal line sets read as cloth. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, #fff 0 1px, transparent 1px 9px)",
            }}
          />
          {/* Phone: the whole name, between the top buttons (top-12) and the name block (the bottom ~58%). */}
          <div aria-hidden className="absolute inset-x-5 top-12 bottom-[58%] text-white/[0.16] sm:hidden">
            <FittedWordmark text={brandName.trim() || "Cosora"} />
          </div>
          {/* Wider screens: the first letter as a monogram on the right. */}
          <span
            aria-hidden
            className="absolute right-[6%] top-1/2 hidden -translate-y-[58%] select-none text-[15rem] font-extrabold leading-none text-white/[0.12] sm:block"
          >
            {initial}
          </span>
        </div>
      )}
      {/* Readable text at the bottom only; the top two thirds of the banner stay as uploaded. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
    </>
  );
}

/**
 * One line of text scaled to fill its box, never cut: drawn at a fixed size in an SVG, measured, and the SVG's
 * viewBox set to the text's own bounds, so the browser scales it to the box (`meet`). Measured again when the box
 * changes size (it is display:none on wider screens) and once the web font has loaded (other letter widths).
 */
function FittedWordmark({ text }: { text: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const [viewBox, setViewBox] = useState<string | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = textRef.current;
      if (!el) return;
      try {
        const b = el.getBBox();
        if (b.width > 0 && b.height > 0) setViewBox(`${b.x} ${b.y} ${b.width} ${b.height}`);
      } catch {
        // Not rendered (display:none): measured when it is.
      }
    };
    measure();
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) measure(); });
    const ro = typeof ResizeObserver === "undefined" || !svgRef.current ? null : new ResizeObserver(measure);
    if (ro && svgRef.current) ro.observe(svgRef.current);
    return () => { alive = false; ro?.disconnect(); };
  }, [text]);
  return (
    <svg
      ref={svgRef}
      viewBox={viewBox ?? "0 0 1 1"}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      style={{ visibility: viewBox ? "visible" : "hidden" }}
    >
      <text ref={textRef} x={0} y={0} fontSize={100} fontWeight={800} letterSpacing={4} fill="currentColor">
        {text.toUpperCase()}
      </text>
    </svg>
  );
}

/** The hero box: a little taller than wide-screen on a phone (room for the name, place and counts over the banner), a strip from `sm` up. */
export const STORE_HERO_BOX = "relative aspect-[16/11] min-h-[13rem] sm:aspect-auto sm:h-60 lg:h-64";
