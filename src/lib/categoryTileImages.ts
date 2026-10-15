// ─────────────────────────────────────────────────────────────
// Each sub-category's own default tile picture on /categories (2026-10-16, Mitra: "the
// pictures ... does not match with the categories which it displays").
//
// Until then every tile took the next photo from a small per-category pool
// (`images[i % images.length]`), so "Saree" could show a blazer. Now one JPEG per tile,
// src/assets/categories/tiles/<top>/<slug>.jpg, named by its slot (categoryImageSlots.ts),
// 480 × 480, quality 78, progressive; sources in src/assets/categories/sources.json. A picture
// set in Cosora-Admin › Category pictures still wins over this default.
//
// Adding or renaming a sub-category: add its file too. `node scripts/category-image-slots-check.mjs`
// fails on a tile without one.
// ─────────────────────────────────────────────────────────────

import { categoryTileSlot } from "@/lib/categoryImageSlots";

// Each file is emitted as its own hashed, cached asset (above Vite's inline limit); only the URLs are bundled.
const FILES = import.meta.glob<string>("../assets/categories/tiles/*/*.jpg", { eager: true, import: "default" });

const BY_SLOT: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([file, url]) => [
    "categories/" + file.replace(/^.*\/tiles\//, "").replace(/\.jpg$/, ""),
    url,
  ]),
);

/** The app's own picture for a sub-category tile, or undefined if it has none. */
export function categoryTileDefault(topId: string, subLabel: string): string | undefined {
  return BY_SLOT[categoryTileSlot(topId, subLabel)];
}
