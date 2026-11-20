import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The rating chip on a product card (2026-11-20, review L-08): one look everywhere, and nothing at all without a rating.
 * Cards printed "★0 | 0", "0.0 | 0" and "★0 | 91" (a zero rating reads as a bad one, and the bare enquiry count beside
 * it said nothing). Position it with `className`; the chip draws its own background.
 */
export function RatingChip({ rating, className, size = "sm" }: { rating: number; className?: string; size?: "xs" | "sm" }) {
  if (!(rating > 0)) return null;
  return (
    <div
      className={cn("flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-0.5 lg:px-2 lg:py-1", className)}
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      <Star aria-hidden="true" className={cn("fill-yellow-400 text-yellow-400", size === "xs" ? "h-2.5 w-2.5" : "h-2.5 w-2.5 lg:h-3 lg:w-3")} />
      <span className={cn("font-bold text-gray-800", size === "xs" ? "text-[9px]" : "text-[9px] lg:text-xs")}>{rating.toFixed(1)}</span>
    </div>
  );
}
