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
          <span
            aria-hidden
            className="absolute right-[6%] top-1/2 -translate-y-[58%] select-none text-[min(52vw,15rem)] font-extrabold leading-none text-white/[0.12]"
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

/** The hero box: a little taller than wide-screen on a phone (room for the name, place and counts over the banner), a strip from `sm` up. */
export const STORE_HERO_BOX = "relative aspect-[16/11] min-h-[13rem] sm:aspect-auto sm:h-60 lg:h-64";
