import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thumbnails for the photos attached to a product review, with a tap-to-expand
 * lightbox. Shared by ProductDetail's review list and the My Reviews cards so
 * the buyer sees their own photos exactly as everyone else does.
 */
export function ReviewPhotoStrip({ photos, className = "" }: { photos: string[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {photos.map((url, i) => (
          <button
            key={url + i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(i);
            }}
            className="h-16 w-16 overflow-hidden rounded-lg bg-gray-100 border border-gray-200"
            aria-label={`View review photo ${i + 1}`}
          >
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {open !== null && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(null);
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(null);
              }}
              aria-label="Close"
              className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={photos[open]}
              alt=""
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
