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

// Keyword map used for client-side matching of a live product (its DB category
// name + product name) to a preference id — drives the For You feed filter.
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

// Maps a preference id → the real DB `categories.name`(s) it corresponds to, so
// a buyer's preferences can drive a genuine product query (products.category_id).
// A preference with no real garment category (co-ords / fabrics have no dedicated
// DB category yet) maps to nothing and simply contributes no products — callers
// fall back to the current product's own category so a strip never comes up empty.
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
