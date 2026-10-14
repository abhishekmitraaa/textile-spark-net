import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A requirement's picture, for buyers (My Quotes, a direct request) and vendors (leads, direct
 * requests) alike (2026-10-14). Requirements posted before then have no picture and showed a broken
 * image; a missing or failed picture now shows a placeholder. Buyer-written URLs are checked where
 * the rows are mapped (lib/storageUrl.ts), not here.
 */
export default function RfqThumb({ src, alt = "", className }: { src: string | null | undefined; alt?: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const box = cn("shrink-0 rounded-lg bg-gray-100", className);
  if (!src || failed === src) {
    return (
      <span className={cn(box, "grid place-items-center text-gray-300")} role="img" aria-label={alt ? `${alt}: no picture` : "No picture"}>
        <ImageOff className="h-1/3 w-1/3 min-h-4 min-w-4" aria-hidden />
      </span>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(src)} className={cn(box, "object-cover")} />;
}
