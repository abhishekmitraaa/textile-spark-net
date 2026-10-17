import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchCatalogueByIds, mapProductRow, type CatalogueRow, type ProductCardData, type RawProduct, type RawVendor } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// Buyer feeds, a page at a time (2026-10-14; migration 20261014120000_feed_products.sql).
//
// The feeds used to download every live listing (useLiveProducts) and filter, sort and page
// in the browser. PostgREST stops at 1,000 rows, so older listings vanished; the seller lookup
// failed silently past a few hundred sellers; every visit downloaded the whole catalogue.
// feed_products() returns one sorted, filtered page of ready cards; useFeed() asks for the next
// page as the buyer scrolls. Nothing here sorts or filters: the database decides the order.
// ─────────────────────────────────────────────────────────────

export type FeedSort = "newest" | "trending" | "discount" | "price_asc" | "price_desc" | "rating";

export interface FeedFilters {
  sort: FeedSort;
  /** Only these categories (categories.id). */
  categoryIds?: string[] | null;
  /** "men" | "women" | "kids" | "unisex"; null for all. */
  gender?: string | null;
  /** Only these sellers (Following). At most 500. */
  vendorIds?: string[] | null;
  onSale?: boolean;
  /** Name or seller name contains this. */
  query?: string | null;
  /** Leave these listings out (a row already shown above). At most 200. */
  excludeIds?: string[] | null;
  /** Sale tiers, whole percent: more than `discountAbove`, at most `discountUpto`. */
  discountAbove?: number | null;
  discountUpto?: number | null;
  /** Only these listings (For You's ranked ids). At most 200; a page may then hold all of them. */
  ids?: string[] | null;
}

export const FEED_PAGE_SIZE = 24;
/** feed_products' deepest offset is 960: 41 pages of 24. */
const MAX_PAGES = 41;

interface FeedRow {
  id: string; vendor_id: string; name: string; price_value: number | null; currency: string;
  compare_at_price: number | null; moq: string | null; fabric: string | null; gsm: string | null;
  fit_type: string | null; gender: string | null; rating_avg: number; enquiries_count: number;
  views_count: number | null; location: string | null; category_id: string | null; category_name: string | null;
  images: string[] | null; created_at: string; brand_name: string | null; vendor_city: string | null;
  is_verified: boolean; plan_id: string | null; plan_expires_at: string | null;
  ad_verified_until: string | null; boost: number;
}

/** A feed row as a card, through the same mapping every other card uses. */
export function mapFeedRow(r: FeedRow): ProductCardData {
  const product: RawProduct = {
    id: r.id, vendor_id: r.vendor_id, name: r.name, price_value: r.price_value, currency: r.currency,
    compare_at_price: r.compare_at_price, moq: r.moq, fabric: r.fabric, gsm: r.gsm, fit_type: r.fit_type,
    gender: r.gender, rating_avg: r.rating_avg, enquiries_count: r.enquiries_count, views_count: r.views_count,
    location: r.location, category_id: r.category_id,
    categories: r.category_name ? { name: r.category_name } : null,
    product_images: (r.images ?? []).map((url, position) => ({ url, position })),
  };
  const vendor: RawVendor = {
    brand_name: r.brand_name, is_verified: r.is_verified, city: r.vendor_city,
    plan_expires_at: r.plan_expires_at, ad_verified_until: r.ad_verified_until, plan_id: r.plan_id,
    searchBoost: r.boost,
  };
  return mapProductRow(product, vendor);
}

async function fetchFeedPage(f: FeedFilters, offset: number, limit: number): Promise<ProductCardData[]> {
  const { data, error } = await supabase.rpc("feed_products", {
    p_sort: f.sort,
    p_limit: limit,
    p_offset: offset,
    p_category_ids: f.categoryIds?.length ? f.categoryIds : undefined,
    p_gender: f.gender ?? undefined,
    p_vendor_ids: f.vendorIds ?? undefined,
    p_on_sale: f.onSale ?? false,
    p_query: f.query?.trim() ? f.query.trim() : undefined,
    p_exclude_ids: f.excludeIds?.length ? f.excludeIds : undefined,
    p_discount_above: f.discountAbove ?? undefined,
    p_discount_upto: f.discountUpto ?? undefined,
    p_ids: f.ids ?? undefined,
  });
  if (error) throw error;
  return ((data ?? []) as unknown as FeedRow[]).map(mapFeedRow);
}

function feedKey(f: FeedFilters) {
  return ["feed", f.sort, f.categoryIds ?? null, f.gender ?? null, f.vendorIds ?? null, f.onSale ?? false,
    f.query?.trim() || null, f.excludeIds ?? null, f.discountAbove ?? null, f.discountUpto ?? null, f.ids ?? null] as const;
}

/**
 * One feed, a page at a time. `items` is every page so far, without a listing twice (a listing
 * that moves between two page requests could otherwise repeat). Call `fetchNextPage()` when
 * the buyer nears the end; `hasNextPage` is false once a page comes back short.
 * `enabled: false` waits (Following before it knows who the buyer follows).
 */
export function useFeed(filters: FeedFilters, { enabled = true }: { enabled?: boolean } = {}) {
  const q = useInfiniteQuery({
    queryKey: feedKey(filters),
    queryFn: ({ pageParam }) => fetchFeedPage(filters, pageParam as number, FEED_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length < FEED_PAGE_SIZE || pages.length >= MAX_PAGES ? undefined : pages.length * FEED_PAGE_SIZE,
    enabled,
    staleTime: 60_000,
  });
  const seen = new Set<string>();
  const items: ProductCardData[] = [];
  for (const page of q.data?.pages ?? []) {
    for (const p of page) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      items.push(p);
    }
  }
  return {
    items,
    isPending: q.isPending && enabled,
    isError: q.isError,
    refetch: q.refetch,
    hasNextPage: Boolean(q.hasNextPage),
    isFetchingNextPage: q.isFetchingNextPage,
    fetchNextPage: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
  };
}

/** A fixed-size slice of a feed (a rail, "Top performing", "Recommended"): one request, no paging. */
export function useFeedSlice(filters: FeedFilters, limit: number, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...feedKey(filters), "slice", limit],
    queryFn: () => fetchFeedPage(filters, 0, limit),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Search Results with nothing typed: the live listings in feed order (paid tiers, then newest),
 * 96 at a time, as the page's richer rows (its facets read colour, pattern, sizes…). The page
 * filters what has loaded and asks for the next 96 as the buyer scrolls. It used to download the
 * whole catalogue (useCatalogue), cut at 1,000 rows.
 */
export function useBrowseCatalogue(enabled: boolean) {
  const PAGE = 96;
  const q = useInfiniteQuery({
    queryKey: ["feed", "browse-catalogue"],
    queryFn: async ({ pageParam }): Promise<{ rows: CatalogueRow[]; count: number }> => {
      const { data, error } = await supabase.rpc("feed_products", { p_sort: "newest", p_limit: PAGE, p_offset: pageParam as number });
      if (error) throw error;
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
      const at = new Map(ids.map((id, i) => [id, i]));
      const rows = (await fetchCatalogueByIds(ids)).sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
      return { rows, count: ids.length };
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.count < PAGE || pages.length * PAGE > 960 ? undefined : pages.length * PAGE),
    enabled,
    staleTime: 60_000,
  });
  const seen = new Set<string>();
  const rows: CatalogueRow[] = [];
  for (const page of q.data?.pages ?? []) for (const r of page.rows) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
  return {
    rows,
    isLoading: q.isPending && enabled,
    hasNextPage: Boolean(q.hasNextPage),
    isFetchingNextPage: q.isFetchingNextPage,
    fetchNextPage: () => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); },
  };
}

export interface CategoryCount { categoryId: string; categoryName: string; liveCount: number }

/** The categories with the most live listings (Search's category rail). */
export function useLiveCategoryCounts(limit = 8) {
  return useQuery({
    queryKey: ["live-category-counts", limit],
    queryFn: async (): Promise<CategoryCount[]> => {
      const { data, error } = await supabase.rpc("live_category_counts", { p_limit: limit });
      if (error) throw error;
      return ((data ?? []) as { category_id: string; category_name: string; live_count: number }[])
        .map((r) => ({ categoryId: r.category_id, categoryName: r.category_name, liveCount: r.live_count }));
    },
    staleTime: 5 * 60_000,
  });
}
