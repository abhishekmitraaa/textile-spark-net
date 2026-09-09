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

// REMOVED 2026-09-10 (Master Prompt 6, item 1c): PREF_TO_DB_CATEGORY_NAMES and
// preferredVideoCategoryNames().
//
// They mapped a preference id → hardcoded DB `categories.name`(s), and were the
// last consumer of the pre-2026-09-07 flat taxonomy. The taxonomy migrations
// (20260907130200, 20260907140000) moved all live inventory onto the tree, and
// measured against the live tree the hardcoded names matched NOTHING:
//
//   tshirts     "T-shirts/Tops"        →  Men's T-Shirts, Unisex T-Shirts, Women's Tops
//   shirts      "Shirt"                →  Men's Shirts
//   dresses     "Dress", "Ethnic Wear" →  Women's Dresses, Women's Ethnic Wear
//   bottomwear  "Trousers", "Jeans"    →  Men's Jeans, Men's/Women's Pants/Trousers
//   kidswear    "Kidswear"             →  Kids Wear
//   accessories "Accessories",         →  Bags, Belts, Footwear, Jewellery, …
//               "Footwear"
//
// Eight of the nine preferences resolved to zero live categories, so
// preference-based reel ranking was silently a no-op. Only `activewear` matched,
// by coincidence of naming.
//
// The replacement is usePreferredVideoCategoryNames() in queries/forYou.ts,
// which resolves through the `pref_category_map` TABLE — the same single source
// of truth buyer_cold_start_embedding() and the For You feed already use — and
// joins to categories.name for the video side, which matches on
// `product_videos.category` (a text copy of the tagged product's category name)
// rather than on products.category_id.
//
// Context worth keeping about that column: it is plain text defaulting to
// 'Apparel', but createProductVideo populates it by copying the TAGGED product's
// categories.name and UploadVideo refuses to submit without a tagged product, so
// every real row carries a genuine categories.name. The two defaults ('Apparel'
// server-side, 'Fashion' in createProductVideo's fallback) are not category names
// and match no preference — correct rather than a gap, since an untagged video
// carries no category signal to personalise on.
