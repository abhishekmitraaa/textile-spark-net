import logo from "@/assets/Buyer/logos/Cosoralogo.png";
import { cn } from "@/lib/utils";

// The source PNG (src/assets/Buyer/logos/Cosoralogo.png) is a 500×500 canvas
// with the wordmark centred inside a lot of transparent padding. Rendering it
// raw at a small height would shrink the wordmark to nothing, so we CSS-crop to
// the wordmark's exact pixel bounds (measured by decoding the PNG once).
const BB = { x: 37, y: 199, w: 420, h: 86, full: 500 } as const;

interface CosoraLogoProps {
  /** Rendered wordmark height in px (the crop box height). */
  height?: number;
  /** "brand" = the source red; "white" = inverted to white for dark backgrounds. */
  variant?: "brand" | "white";
  className?: string;
  onClick?: () => void;
}

/**
 * Cosora brand wordmark. Single source of truth for the logo across the buyer
 * app, landing page and registration flow. Use `variant="white"` on dark/coloured
 * backgrounds (it inverts the red source to white via a CSS filter).
 */
export default function CosoraLogo({ height = 24, variant = "brand", className, onClick }: CosoraLogoProps) {
  const s = height / BB.h; // source-pixel → screen-pixel scale
  return (
    <span
      onClick={onClick}
      role="img"
      aria-label="Cosora"
      className={cn("inline-block overflow-hidden align-middle leading-none", onClick && "cursor-pointer", className)}
      style={{ width: BB.w * s, height: BB.h * s }}
    >
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="block max-w-none select-none"
        style={{
          width: BB.full * s,
          height: BB.full * s,
          marginLeft: -BB.x * s,
          marginTop: -BB.y * s,
          filter: variant === "white" ? "brightness(0) invert(1)" : undefined,
        }}
      />
    </span>
  );
}
