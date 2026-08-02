import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Single source of truth for star colours across every review surface.
// Previously duplicated in five places (MyReviews Stars/StarPicker plus the
// four page-local WriteReviewModal copies), which had drifted to two different
// palettes — amber #f5a623 on My Reviews vs. Tailwind yellow-400 in the modals.
const ACTIVE = "#f5a623";
const IDLE = "#e5e7eb";
const IDLE_STRONG = "#d1d5db";

const SIZES = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-5 h-5",
  lg: "w-7 h-7",
  xl: "w-8 h-8",
} as const;

export type StarSize = keyof typeof SIZES;

/** Read-only star row. */
export function StarRating({
  value,
  size = "sm",
  className = "",
}: {
  value: number;
  size?: StarSize;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={SIZES[size]}
          style={{ color: n <= value ? ACTIVE : IDLE }}
          fill={n <= value ? ACTIVE : IDLE}
        />
      ))}
    </div>
  );
}

/** Interactive star picker with hover preview. */
export function StarPicker({
  value,
  onChange,
  size = "lg",
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: StarSize;
  className?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(SIZES[size], "transition-colors")}
            style={{ color: n <= shown ? ACTIVE : IDLE_STRONG }}
            fill={n <= shown ? ACTIVE : IDLE_STRONG}
          />
        </button>
      ))}
    </div>
  );
}
