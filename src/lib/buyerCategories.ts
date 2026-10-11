// ─────────────────────────────────────────────────────────────
// Buyer category vocabulary — the single shared definition used by the
// registration interest screen (InterestPreference), the For You feed +
// "Edit Preferences" (ForYou), the profile summary (Profile), and the
// preferences store. Previously this list was duplicated inline in a few
// pages and the registration screen used a different, disconnected set.
//
// These ids are what get persisted to `buyer_profiles.preferred_categories`,
// so keep them stable. Each one maps onto real categories in the database
// table `pref_category_map` (migration 20261010232412_interest_preferences_v2).
//
// 2026-10-11: the list moved from nine clothing types to the seventeen
// interests of the redesigned Interest Preference screen, plus "Others" with
// the buyer's own words (buyer_profiles.preferred_interest_other). The old ids
// still turn up from accounts saved before the change and from browsers that
// cached the old app, so LEGACY_INTEREST_IDS translates them; the migration
// translated every saved row once.
// ─────────────────────────────────────────────────────────────

// The tile photos are in buyerCategoryImages.ts, kept out of this file
// because the preferences store (on every page) imports it.
export interface BuyerCategory {
  id: string;
  label: string;
}

// Order is the design's (Interest Preference, 2026-10-11).
export const BUYER_CATEGORIES: BuyerCategory[] = [
  { id: "fabrics", label: "Fabrics" },
  { id: "womens-clothing", label: "Women's Clothing" },
  { id: "mens-clothing", label: "Men's Clothing" },
  { id: "cosmetics", label: "Cosmetics" },
  { id: "unisex-clothing", label: "Unisex Clothing" },
  { id: "kidswear", label: "Kidswear" },
  { id: "accessories", label: "Accessories" },
  { id: "labels-tags", label: "Labels & Tags" },
  { id: "it-software", label: "IT & Software" },
  { id: "raw-materials", label: "Raw Materials" },
  { id: "packaging", label: "Packaging" },
  { id: "trims-accessories", label: "Trims & Accessories" },
  { id: "fashion-designer", label: "Fashion Designer" },
  { id: "marketing-pr", label: "Marketing & PR" },
  { id: "freelancers", label: "Freelance" },
  { id: "exporter", label: "Exporter" },
  { id: "photography", label: "Photography" },
];

/** "Others": no categories behind it; the buyer types what they source instead.
 *  Stored like any other id so the profile can show it, with the words in
 *  buyer_profiles.preferred_interest_other. */
export const OTHER_INTEREST_ID = "others";
/** Same limit as the column's check constraint, which counts characters (code
 *  points), not UTF-16 units. */
export const OTHER_INTEREST_MAX = 60;

/** The "Others" words cut to the limit by whole characters, so an emoji at the
 *  end is never split into half a surrogate pair. */
export function clipOtherInterest(text: string): string {
  const chars = Array.from(text);
  return chars.length > OTHER_INTEREST_MAX ? chars.slice(0, OTHER_INTEREST_MAX).join("") : text;
}

export const BUYER_CATEGORY_LABEL: Record<string, string> = {
  ...Object.fromEntries(BUYER_CATEGORIES.map((c) => [c.id, c.label])),
  [OTHER_INTEREST_ID]: "Others",
};

export const isBuyerCategoryId = (id: string): boolean => id in BUYER_CATEGORY_LABEL;

/** The pre-2026-10-11 ids, by what they covered in pref_category_map. Must
 *  match the translation in the migration. fabrics, accessories and kidswear
 *  kept their ids. */
export const LEGACY_INTEREST_IDS: Record<string, string[]> = {
  tshirts: ["mens-clothing", "womens-clothing", "unisex-clothing"],
  shirts: ["mens-clothing"],
  coords: ["womens-clothing"],
  dresses: ["womens-clothing"],
  bottomwear: ["mens-clothing", "womens-clothing"],
  activewear: ["unisex-clothing"],
};

/** Saved ids in today's vocabulary: legacy ids translated, unknown ones
 *  dropped, duplicates removed, order kept. */
export function normaliseInterestIds(ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    for (const next of LEGACY_INTEREST_IDS[id] ?? [id]) if (isBuyerCategoryId(next)) out.add(next);
  }
  return Array.from(out);
}

/** The "Others" words as the database keeps them: control characters and
 *  runs of space folded to one space, ends trimmed (same as the
 *  buyer_profiles_interest_other_tidy trigger). */
export function tidyOtherInterest(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** How a saved interest reads on the profile and the For You chips. */
export function interestLabel(id: string, otherText?: string | null): string {
  if (id === OTHER_INTEREST_ID && otherText?.trim()) return otherText.trim();
  return BUYER_CATEGORY_LABEL[id] ?? id;
}

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
