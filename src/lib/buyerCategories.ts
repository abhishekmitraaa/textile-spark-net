// ─────────────────────────────────────────────────────────────
// Buyer category vocabulary — the single shared definition used by the
// registration interest screen (InterestPreference), the For You feed +
// "Edit Preferences" (ForYou), the profile summary (Profile), and the
// preferences store. Previously this list was duplicated inline in a few
// pages and the registration screen used a different, disconnected set.
//
// These ids are what get persisted to `buyer_profiles.preferred_categories`,
// so keep them stable.
// ─────────────────────────────────────────────────────────────

export interface BuyerCategory {
  id: string;
  label: string;
  icon: string; // emoji
}

export const BUYER_CATEGORIES: BuyerCategory[] = [
  { id: "tshirts", label: "T-Shirts", icon: "👕" },
  { id: "shirts", label: "Shirts", icon: "👔" },
  { id: "coords", label: "Co-ords", icon: "🧥" },
  { id: "dresses", label: "Dresses", icon: "👗" },
  { id: "bottomwear", label: "Bottomwear", icon: "👖" },
  { id: "fabrics", label: "Fabrics", icon: "🧵" },
  { id: "accessories", label: "Fashion Accessories", icon: "👜" },
  { id: "kidswear", label: "Kidswear", icon: "🧒" },
  { id: "activewear", label: "Activewear", icon: "🏃" },
];

export const BUYER_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  BUYER_CATEGORIES.map((c) => [c.id, c.label]),
);

export const isBuyerCategoryId = (id: string): boolean => id in BUYER_CATEGORY_LABEL;

// DEAD as of 2026-09-07 — no runtime caller left. It drove the For You feed's
// category filter until that moved to pref_category_map (matching on
// categories.id, not on words in a title). Kept only so the heuristic it
// encoded is on record; do NOT wire it back up. It mis-filed "Mesh Panel
// Training Tee" (Activewear) as a T-shirt on the "tee" keyword, and dropped any
// product whose wording contained no keyword at all.
export const PREF_CAT_KEYWORDS: Record<string, string[]> = {
  tshirts: ["t-shirt", "tee", "tank", "polo", "tops"],
  shirts: ["shirt"],
  coords: ["co-ord", "coord"],
  dresses: ["dress", "anarkali", "kurta"],
  bottomwear: ["jean", "trouser", "pant", "jogger", "short"],
  fabrics: ["fabric"],
  accessories: ["accessor", "belt", "bag", "sneaker", "footwear"],
  kidswear: ["kid"],
  activewear: ["active", "training", "track", "sport", "mesh"],
};

// Maps a preference id → DB `categories.name`(s).
//
// SUPERSEDED FOR PRODUCTS — do not use this to resolve products.category_id.
// The `pref_category_map` TABLE is the single source of truth for that, and it
// is what buyer_cold_start_embedding() and the For You feed both read.
//
// Why: every name below is a LEGACY flat category. The 2026-09-07 taxonomy
// migrations (20260907130200, 20260907140000) moved all live inventory onto the
// tree, so measured against the live catalogue 'T-shirts/Tops', 'Shirt',
// 'Dress', 'Ethnic Wear', 'Trousers', 'Jeans' and 'Kidswear' now hold ZERO live
// products. 'Activewear' and 'Footwear' are worse than stale — they are
// ambiguous, matching both a dead legacy row and a live tree child.
//
// Still used by preferredVideoCategoryNames() below, which targets
// `product_videos.category` (a text copy of the tagged product's category name)
// rather than products.category_id. KNOWN STALENESS, recorded not fixed: a reel
// tagged to a re-pointed product now carries a tree name, so these legacy names
// no longer match it either. Fixing the video side means pointing that function
// at pref_category_map too — separate work, tracked in the changelog.
//
// A preference with no real garment category (co-ords / fabrics have no
// dedicated DB category) maps to nothing and contributes no products.
export const PREF_TO_DB_CATEGORY_NAMES: Record<string, string[]> = {
  tshirts: ["T-shirts/Tops"],
  shirts: ["Shirt"],
  coords: [],
  dresses: ["Dress", "Ethnic Wear"],
  bottomwear: ["Trousers", "Jeans"],
  fabrics: [],
  accessories: ["Accessories", "Footwear"],
  kidswear: ["Kidswear"],
  activewear: ["Activewear"],
};

/**
 * The buyer's preferences, expressed in the vocabulary `product_videos.category`
 * actually uses.
 *
 * Checked against the live DB before writing this: `product_videos.category` is
 * plain text with a default of 'Apparel', NOT an FK like `products.category_id`
 * — but createProductVideo populates it by copying the TAGGED PRODUCT's
 * `categories.name`, and UploadVideo refuses to submit without a tagged product.
 * So in practice every real row carries a genuine `categories.name` (the one
 * live row's is "Buttons"), which is exactly the vocabulary the map above
 * already targeted. Same taxonomy, reached one step earlier: the video side
 * wants the NAMES, where the products side needs `categories.id`.
 *
 * (An earlier version of this comment named a `resolvePreferredCategoryIds` in
 * products.ts as the products-side counterpart. No such function has ever
 * existed — the products side went straight to pref_category_map instead.)
 *
 * The two defaults ('Apparel' server-side, 'Fashion' in createProductVideo's
 * fallback) are not `categories.name` values and match no preference. That is
 * correct rather than a gap — an untagged video has no category signal to
 * personalise on — but it is why this is a lookup and not an assumption that
 * every video row maps to something.
 */
export function preferredVideoCategoryNames(prefIds: string[]): string[] {
  const names = new Set<string>();
  for (const id of prefIds) for (const n of PREF_TO_DB_CATEGORY_NAMES[id] ?? []) names.add(n);
  return Array.from(names);
}
