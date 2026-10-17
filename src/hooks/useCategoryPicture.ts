import { useCallback } from "react";
import { useCategoryImages, categoryImageUrl } from "@/lib/siteConfig";
import { categoryTileDefault } from "@/lib/categoryTileImages";
import { categoryTileSlot } from "@/lib/categoryImageSlots";
import { tileForSellerSub } from "@/lib/categoryPicture";

/**
 * A category's one picture (lib/categoryPicture.ts): the /categories tile, as set in Cosora-Admin or shipped by
 * the app. `ready` is false only on a first visit while the admin's choices load, so a tile can wait instead of
 * showing the default and swapping it.
 */
export function useCategoryPicture() {
  const { images, ready } = useCategoryImages();
  const pictureFor = useCallback(
    (topId: string, subLabel: string): string | undefined => {
      const slot = categoryTileSlot(topId, subLabel);
      const fallback = categoryTileDefault(topId, subLabel);
      return images[slot] ? categoryImageUrl(images, slot, fallback ?? "") : fallback;
    },
    [images],
  );
  /** For a listing's category (public.categories.name, the vendor upload list). */
  const pictureForSellerSub = useCallback(
    (name: string | null | undefined): { src: string; slot: string } | null => {
      const t = tileForSellerSub(name);
      if (!t) return null;
      const src = pictureFor(t.topId, t.subLabel);
      return src ? { src, slot: categoryTileSlot(t.topId, t.subLabel) } : null;
    },
    [pictureFor],
  );
  return { ready, pictureFor, pictureForSellerSub };
}
