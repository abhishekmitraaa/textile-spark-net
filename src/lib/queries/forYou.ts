import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// "For You" — personalised buyer feed ordering + the preference→category map.
//
// Replaces the PREF_CAT_KEYWORDS substring match that used to decide which
// preference a product belonged to. That heuristic read a product's category
// name and title and looked for "tee"/"jean"/"shirt" — so "Mesh Panel Training
// Tee" (Activewear) counted as a T-shirt, and anything whose wording didn't
// happen to contain a keyword counted as nothing at all.
//
// Both halves now come from the database:
//   * ORDERING  — for_you_products(): taste vector, else onboarding-preference
//                 centroid, else global popularity. It reports which tier ran.
//   * FILTERING — pref_category_map: preference id → real categories.id.
// ─────────────────────────────────────────────────────────────

/** Which tier of for_you_products actually produced the ordering. */
export type ForYouSource = "taste" | "cold_start" | "popularity";

export interface ForYouRow {
  id: string;
  /** Cosine distance to the buyer's vector; null on the popularity tier, where
   *  no vector exists. Not 0 — 0 would read as a perfect match. */
  distance: number | null;
  source: ForYouSource;
}

export interface ForYouRanking {
  /** Product ids, best first. */
  order: string[];
  /** Rank by product id, for sorting a already-fetched pool without a re-fetch. */
  rankOf: Map<string, number>;
  source: ForYouSource;
}

/**
 * Ask the database how to order this buyer's feed.
 *
 * Returns ids only. The card data still comes from the single cached
 * useLiveProducts() fetch that Trends / Sale / For You already share, so this
 * adds one lightweight round-trip rather than a second catalogue download.
 */
export async function fetchForYouRanking(
  buyerId: string,
  matchCount = 200,
): Promise<ForYouRanking> {
  const { data, error } = await supabase.rpc("for_you_products", {
    p_buyer_id: buyerId,
    match_count: matchCount,
  });
  if (error) throw error;

  const rows = (data ?? []) as ForYouRow[];
  const rankOf = new Map<string, number>();
  rows.forEach((r, i) => rankOf.set(r.id, i));
  return {
    order: rows.map((r) => r.id),
    rankOf,
    // Every row carries the same source; an empty result can only happen if the
    // catalogue itself is empty, in which case there is nothing to label.
    source: rows[0]?.source ?? "popularity",
  };
}

export function useForYouRanking(buyerId: string | undefined) {
  return useQuery({
    queryKey: ["for_you", buyerId],
    queryFn: () => fetchForYouRanking(buyerId as string),
    enabled: Boolean(buyerId),
    // The taste vector moves as the buyer browses, but not within a few seconds
    // of it. Matches the catalogue's own caching so the two don't fight.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** preference id → the categories.id values it covers. */
export type PrefCategoryMap = Record<string, string[]>;

/**
 * The one definition of "which categories does preference X mean".
 *
 * Lives in the DB (pref_category_map) rather than in TypeScript so the frontend
 * filter and buyer_cold_start_embedding() cannot drift apart. The old
 * PREF_TO_DB_CATEGORY_NAMES pointed at legacy flat category names that no live
 * product uses any more.
 */
export async function fetchPrefCategoryMap(): Promise<PrefCategoryMap> {
  const { data, error } = await supabase
    .from("pref_category_map")
    .select("pref_id, category_id");
  if (error) throw error;
  const out: PrefCategoryMap = {};
  for (const r of data ?? []) (out[r.pref_id] ??= []).push(r.category_id);
  return out;
}

export function usePrefCategoryMap() {
  return useQuery({
    queryKey: ["pref_category_map"],
    queryFn: fetchPrefCategoryMap,
    // Reference data: changes only when a migration changes it.
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * The same map, resolved one step further into `categories.name`.
 *
 * The products side matches on `products.category_id`, so it wants ids. The
 * VIDEO side matches on `product_videos.category`, which is plain text holding
 * a copy of the tagged product's category NAME — so it wants names, and the
 * lookup has to go pref_id → categories.id → categories.name.
 *
 * This replaces the hardcoded PREF_TO_DB_CATEGORY_NAMES table, which pointed at
 * pre-2026-09-07 flat category names. Measured against the live taxonomy, that
 * table had essentially no overlap left with reality:
 *
 *   tshirts     "T-shirts/Tops"        →  Men's T-Shirts, Unisex T-Shirts, Women's Tops
 *   shirts      "Shirt"                →  Men's Shirts
 *   dresses     "Dress", "Ethnic Wear" →  Women's Dresses, Women's Ethnic Wear
 *   bottomwear  "Trousers", "Jeans"    →  Men's Jeans, Men's/Women's Pants/Trousers
 *   kidswear    "Kidswear"             →  Kids Wear
 *   accessories "Accessories",         →  Bags, Belts, Caps & Hats, Footwear, Gloves,
 *               "Footwear"                Jewellery, Scarves & Stoles, Socks,
 *                                         Sunglasses, Watches
 *
 * Every left-hand name matched zero live rows. Only `activewear` -> "Activewear"
 * survived the retaxonomy, and only by coincidence of naming. So preference-based
 * reel ranking was silently a no-op for eight of the nine preferences.
 *
 * One round trip via an embedded select rather than two, and cached as long as
 * the id map next to it — both are reference data that only a migration changes.
 */
export async function fetchPrefCategoryNames(): Promise<PrefCategoryMap> {
  const { data, error } = await supabase
    .from("pref_category_map")
    .select("pref_id, categories(name)");
  if (error) throw error;
  const out: PrefCategoryMap = {};
  for (const r of data ?? []) {
    // PostgREST types a to-one embed as possibly-array; narrow without asserting.
    const cat = r.categories as { name: string } | { name: string }[] | null;
    const name = Array.isArray(cat) ? cat[0]?.name : cat?.name;
    if (name) (out[r.pref_id] ??= []).push(name);
  }
  return out;
}

export function usePrefCategoryNames() {
  return useQuery({
    queryKey: ["pref_category_map", "names"],
    queryFn: fetchPrefCategoryNames,
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * The buyer's stored preferences expressed in the vocabulary
 * `product_videos.category` actually stores.
 *
 * Returns [] while the map is still loading, which the callers already handle —
 * an empty interest set means rankVideoCloseUps falls back to its default order
 * rather than showing nothing, so a slow reference fetch degrades to
 * "unpersonalised", never to "empty reel".
 */
export function usePreferredVideoCategoryNames(prefIds: string[]): string[] {
  const { data: map } = usePrefCategoryNames();
  if (!map) return [];
  const names = new Set<string>();
  for (const id of prefIds) for (const n of map[id] ?? []) names.add(n);
  return Array.from(names);
}

/**
 * Invert the map: categories.id → the preference id that covers it.
 *
 * Built once per render rather than scanned per product. No category is covered
 * by two preferences in the current seed, but the tie-break is alphabetical
 * rather than "whichever row came back first" so the result stays deterministic
 * if that ever changes.
 */
export function categoryToPrefId(map: PrefCategoryMap): Map<string, string> {
  const out = new Map<string, string>();
  for (const prefId of Object.keys(map).sort()) {
    for (const catId of map[prefId]) if (!out.has(catId)) out.set(catId, prefId);
  }
  return out;
}
