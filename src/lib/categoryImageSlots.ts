// ─────────────────────────────────────────────────────────────
// Category pictures Cosora's team can change (2026-10-14, Mitra: "the manager admin should be
// able to change the category pictures on New Arrivals and on the Categories page").
//
// Every picture has a SLOT, a fixed id. public.category_images holds one row per slot
// (migration 20261014090000_category_images.sql); Cosora-Admin › Category pictures sets or
// clears its image. A slot with no image shows the default the app ships. Slots:
//   categories/<top>                a category's banner on /categories
//   categories/<top>/<sub>          a sub-category's tile on /categories, and the picture of that category on
//                                   every other page (New Arrivals' "Shop by category", a store's categories,
//                                   Trends; lib/categoryPicture.ts)
// New Arrivals' tiles had slots of their own (new-arrivals/<key>) until 2026-10-17, so the same category could
// show two pictures; they now show their category's tile (migration 20261017100000 removed those rows).
//
// Adding or renaming a tile or a sub-category changes its slot: add the row in a migration
// too, or the admin can't set it. `node scripts/category-image-slots-check.mjs` compares
// this list with the migration's rows. JSX- and asset-free, so the script can load it.
// ─────────────────────────────────────────────────────────────

import { CATEGORY_TAXONOMY } from "@/lib/categoryTaxonomy";

/** New Arrivals' tiles, in order, each showing the picture of a /categories tile: [top id, tile label]. */
export const NEW_ARRIVALS_TILES = [
  { key: "womens-apparel", name: "Women's Apparel", tile: ["womenswear", "Dresses"] },
  { key: "mens-apparel", name: "Men's Apparel", tile: ["menswear", "T-Shirts"] },
  { key: "mens-jeans", name: "Men's Jeans", tile: ["menswear", "Bottomwear"] },
  { key: "mens-shirt", name: "Men's Shirt", tile: ["menswear", "Shirts"] },
  { key: "accessories", name: "Accessories", tile: ["accessories", "Bags"] },
  { key: "womens-trousers", name: "Women's Trousers", tile: ["womenswear", "Bottomwear"] },
  { key: "womens-tshirts", name: "Women's T-shirts", tile: ["womenswear", "T-Shirts"] },
  { key: "womens-shoes", name: "Women's Shoes", tile: ["footwear", "Women's Footwear"] },
  { key: "kidswear", name: "Kidswear", tile: ["kidswear", "Frocks / Dresses"] },
  { key: "ethnic-wear", name: "Ethnic Wear", tile: ["womenswear", "Ethnic Wear"] },
  { key: "activewear", name: "Activewear", tile: ["womenswear", "Sportswear — Upper Body"] },
  { key: "winter-wear", name: "Winter Wear", tile: ["menswear", "Winterwear"] },
] as const;

export type NewArrivalsTileKey = (typeof NEW_ARRIVALS_TILES)[number]["key"];

/** "Sportswear — Upper Body" → "sportswear-upper-body"; "Kids' Footwear" → "kids-footwear". */
export function slotSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const categoryBannerSlot = (topId: string) => `categories/${topId}`;
export const categoryTileSlot = (topId: string, subLabel: string) => `categories/${topId}/${slotSlug(subLabel)}`;

/** The same rule as the table's CHECK. */
export const SLOT_PATTERN = /^categories\/[a-z0-9-]+(\/[a-z0-9-]+)?$/;

export type SlotSurface = "categories_banner" | "categories_tile";

export interface CategoryImageSlot {
  slot: string;
  surface: SlotSurface;
  label: string;
  /** The category a tile belongs to, for grouping on the admin page. */
  group: string | null;
  position: number;
}

/** Every slot, in the order the admin page lists them. */
export function allCategoryImageSlots(): CategoryImageSlot[] {
  const out: CategoryImageSlot[] = [];
  let pos = 0;
  for (const top of CATEGORY_TAXONOMY) {
    out.push({ slot: categoryBannerSlot(top.id), surface: "categories_banner", label: top.label, group: top.label, position: ++pos });
    for (const s of top.subs) {
      out.push({ slot: categoryTileSlot(top.id, s.label), surface: "categories_tile", label: s.label, group: top.label, position: ++pos });
    }
  }
  return out;
}
