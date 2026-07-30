import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { trustSealFromParts } from "@/lib/plan";
import { PREF_TO_DB_CATEGORY_NAMES } from "@/lib/buyerCategories";

// ─────────────────────────────────────────────────────────────
// Products data access (React Query over Supabase)
//
// This is the shared read model that finally connects the two sides:
// what a vendor inserts here is what a buyer reads back (once it's live).
// Rows are mapped into the `ProductCardData` shape the existing buyer
// cards already expect, so the UI barely changes.
// ─────────────────────────────────────────────────────────────

const PLACEHOLDER = "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=500&h=650&fit=crop";

export interface ProductCardData {
  id: string;
  vendorId: string;
  name: string;
  manufacturer: string;
  location: string;
  price: string;
  priceValue: number;
  compareAtPrice: number | null;
  discountPct: number;
  moq: string;
  soldCount: string;
  soldCountNum: number;
  enquiries: string;
  rating: number;
  fabric: string;
  gsm: string;
  fitType: string;
  gender: string;
  categoryName: string | null;
  image: string;
  secondaryImage: string;
  verified?: boolean;
  /** Plan search-boost tier of the owning vendor (0 = Free/none … 4 = VIP),
   *  used as a real ranking weight in the buyer feed/search. */
  boost: number;
}

// Compact counts, e.g. 5600 -> "5.6k".
function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

interface RawImage { url: string; position: number }
// plan_expires_at feeds the displayed trust seal (admin is_verified OR active
// paid plan); plan_id + a resolved searchBoost feed search ranking. All optional
// so callers that don't need them can omit them.
export interface RawVendor { brand_name: string | null; is_verified: boolean; city: string | null; plan_expires_at?: string | null; ad_verified_until?: string | null; plan_id?: string | null; searchBoost?: number }
export interface RawProduct {
  id: string; vendor_id: string; name: string; price_value: number | null; currency: string;
  compare_at_price: number | null; moq: string | null; fabric: string | null; gsm: string | null;
  fit_type: string | null; gender: string | null; rating_avg: number; enquiries_count: number;
  sold_count: number; location: string | null; categories: { name: string } | null;
  product_images: RawImage[] | null;
}

// Shared select for a product row shaped into ProductCardData (see mapProductRow).
export const PRODUCT_CARD_SELECT =
  "id, vendor_id, name, price_value, currency, compare_at_price, moq, fabric, gsm, fit_type, gender, rating_avg, enquiries_count, sold_count, location, categories ( name ), product_images ( url, position )";

export function mapProductRow(p: RawProduct, vendor?: RawVendor): ProductCardData {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url);
  const priceValue = p.price_value != null ? Number(p.price_value) : 0;
  const compareAtPrice = p.compare_at_price != null ? Number(p.compare_at_price) : null;
  const price = p.price_value != null ? `${p.currency}${Math.round(priceValue)}` : "—";
  const discountPct =
    compareAtPrice && compareAtPrice > priceValue
      ? Math.round(((compareAtPrice - priceValue) / compareAtPrice) * 100)
      : 0;
  return {
    id: p.id,
    vendorId: p.vendor_id,
    name: p.name,
    manufacturer: vendor?.brand_name ?? "Vendor",
    location: p.location ?? vendor?.city ?? "India",
    price,
    priceValue,
    compareAtPrice,
    discountPct,
    moq: p.moq ?? "2",
    soldCount: `${p.sold_count}+ sold`,
    soldCountNum: p.sold_count,
    enquiries: fmtK(p.enquiries_count),
    rating: Number(p.rating_avg),
    fabric: p.fabric ?? "—",
    gsm: p.gsm ?? "—",
    fitType: p.fit_type ?? "—",
    gender: p.gender ?? "Unisex",
    categoryName: p.categories?.name ?? null,
    image: imgs[0] ?? PLACEHOLDER,
    secondaryImage: imgs[1] ?? imgs[0] ?? PLACEHOLDER,
    verified: trustSealFromParts(vendor?.is_verified, vendor?.plan_expires_at, vendor?.ad_verified_until),
    boost: vendor?.searchBoost ?? 0,
  };
}

// ── Search boost (real ranking weight from the vendor's plan) ──
// A vendor's products rank higher when their active paid plan has a higher
// search_boost_tier. Cached like the categories catalogue; 0 when no active
// paid plan. This is a genuine sort input — not simulated ranking.
let planBoostCache: Map<string, number> | null = null;
async function loadPlanBoosts(): Promise<Map<string, number>> {
  if (planBoostCache) return planBoostCache;
  const { data } = await supabase.from("subscription_plans").select("id, limits");
  const m = new Map<string, number>();
  for (const p of (data ?? []) as { id: string; limits: { search_boost_tier?: number } | null }[]) {
    const t = Number(p.limits?.search_boost_tier ?? 0);
    m.set(p.id, Number.isFinite(t) ? t : 0);
  }
  planBoostCache = m;
  return m;
}
function vendorBoost(boosts: Map<string, number>, planId?: string | null, planExpiresAt?: string | null): number {
  if (!planId || !planExpiresAt) return 0;
  if (new Date(planExpiresAt).getTime() <= Date.now()) return 0;
  return boosts.get(planId) ?? 0;
}

// products.vendor_id and vendor_profiles.id both FK to profiles.id, so there's
// no direct products→vendor_profiles relationship for PostgREST to embed. Fetch
// the two sets and join in memory (fine at this scale).
async function fetchLiveProducts(): Promise<ProductCardData[]> {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, vendor_id, name, price_value, currency, compare_at_price, moq, fabric, gsm, fit_type, gender, rating_avg, enquiries_count, sold_count, location, categories ( name ), product_images ( url, position )")
    .eq("status", "live")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (products ?? []) as unknown as RawProduct[];

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const vendorMap = new Map<string, RawVendor>();
  if (vendorIds.length) {
    const boosts = await loadPlanBoosts();
    const { data: vendors } = await supabase
      .from("vendor_profiles")
      .select("id, brand_name, is_verified, city, plan_expires_at, ad_verified_until, plan_id")
      .in("id", vendorIds);
    for (const v of vendors ?? []) {
      const rv = v as RawVendor;
      rv.searchBoost = vendorBoost(boosts, rv.plan_id, rv.plan_expires_at);
      vendorMap.set((v as { id: string }).id, rv);
    }
  }

  // Higher plan tiers rank first (real weight); created_at desc within a tier.
  return rows
    .map((r) => mapProductRow(r, vendorMap.get(r.vendor_id)))
    .sort((a, b) => b.boost - a.boost);
}

export function useLiveProducts() {
  return useQuery({ queryKey: ["products", "live"], queryFn: fetchLiveProducts });
}

// Fetch a set of products by id → keyed ProductCardData map. Used by the
// DB-backed Saved / Recently-Viewed stores to hydrate rich card objects from
// the bare product-id references they persist.
export async function fetchProductCardsByIds(ids: string[]): Promise<Record<string, ProductCardData>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.from("products").select(PRODUCT_CARD_SELECT).in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawProduct[];
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const vendorMap = new Map<string, RawVendor>();
  if (vendorIds.length) {
    const { data: vendors } = await supabase
      .from("vendor_profiles").select("id, brand_name, is_verified, city, plan_expires_at, ad_verified_until, plan_id").in("id", vendorIds);
    for (const v of vendors ?? []) vendorMap.set(v.id, v as RawVendor);
  }
  const out: Record<string, ProductCardData> = {};
  for (const r of rows) {
    const c = mapProductRow(r, vendorMap.get(r.vendor_id));
    out[c.id] = c;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Feed selectors — pure derivations over the single cached live-products
// query, so Trends / Sale / For You share one fetch (no extra round-trips).
// ─────────────────────────────────────────────────────────────

/** Trending = higher plan tiers first (real search boost), then most enquired +
 *  best-selling. */
export function sortTrending(products: ProductCardData[]): ProductCardData[] {
  const score = (p: ProductCardData) => p.soldCountNum + (parseFloat(p.enquiries) || 0);
  return [...products].sort((a, b) => (b.boost - a.boost) || (score(b) - score(a)));
}

/** Sale = anything discounted (compare_at_price above the live price), deepest cut first. */
export function filterSale(products: ProductCardData[]): ProductCardData[] {
  return products.filter((p) => p.discountPct > 0).sort((a, b) => b.discountPct - a.discountPct);
}

/**
 * For You = products in the buyer's preferred categories (case-insensitive
 * substring match, tolerant of taxonomy label differences). Falls back to the
 * full catalogue when the buyer has no preferences yet.
 */
export function filterForYou(products: ProductCardData[], categoryNames: string[]): ProductCardData[] {
  if (!categoryNames.length) return products;
  const wanted = categoryNames.map((c) => c.toLowerCase());
  const matched = products.filter((p) => {
    const cat = (p.categoryName ?? "").toLowerCase();
    return wanted.some((w) => cat.includes(w) || w.includes(cat) || p.name.toLowerCase().includes(w));
  });
  return matched.length ? matched : products;
}

// Richer live-catalogue rows for the Search page, which filters/sorts on many
// attributes (price, colour, fabric, fit, gender, gsm, rating, verified).
export interface CatalogueRow {
  id: string; vendorId: string; name: string; manufacturer: string; location: string;
  priceValue: number; moq: string; sold: string; enquiries: string; rating: number;
  popularity: number; discount: number; fabric: string; gsm: string; fit: string;
  gender: string; colour: string; image: string; secondaryImage: string; verified: boolean; boost: number;
  // Real vendor-entered attributes, so the search facets can filter on the
  // actual product instead of hashPick()ing a stable fake value per id.
  moqValue: number | null;
  pattern: string[]; occasion: string[]; sizes: string[];
  neckType: string; sleeveType: string; collarType: string; countryOfOrigin: string;
  waistSizes: string[]; lengths: string[];
  categoryId: string | null; categoryName: string; parentCategoryName: string;
}

async function fetchCatalogue(): Promise<CatalogueRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, vendor_id, name, price_value, currency, moq, fabric, gsm, fit_type, gender, colour, location, rating_avg, sold_count, enquiries_count, sizes, pattern, occasion, neck_type, sleeve_type, collar_type, country_of_origin, waist_sizes, lengths, category_id, categories ( name, parent_id ), product_images ( url, position )")
    .eq("status", "live")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as (RawProduct & {
    gender: string | null; colour: string | null; sizes: string[] | null;
    pattern: string[] | null; occasion: string[] | null;
    neck_type: string | null; sleeve_type: string | null; collar_type: string | null;
    country_of_origin: string | null; waist_sizes: string[] | null; lengths: string[] | null;
    category_id: string | null; categories: { name: string; parent_id: string | null } | null;
  })[];

  // Parent name for each product's category, so the Categories facet can group
  // subcategories under the taxonomy root the vendor picked from.
  const cats = await loadCategories();
  const parentName = (parentId: string | null | undefined) =>
    (parentId ? cats.find((c) => c.id === parentId)?.name : null) ?? "";

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const vendorMap = new Map<string, RawVendor>();
  if (vendorIds.length) {
    const boosts = await loadPlanBoosts();
    const { data: vendors } = await supabase
      .from("vendor_profiles").select("id, brand_name, is_verified, city, plan_expires_at, ad_verified_until, plan_id").in("id", vendorIds);
    for (const v of vendors ?? []) {
      const rv = v as RawVendor;
      rv.searchBoost = vendorBoost(boosts, rv.plan_id, rv.plan_expires_at);
      vendorMap.set((v as { id: string }).id, rv);
    }
  }

  const mapped = rows.map((p) => {
    const v = vendorMap.get(p.vendor_id);
    const imgs = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url);
    return {
      id: p.id,
      vendorId: p.vendor_id,
      name: p.name,
      manufacturer: v?.brand_name ?? "Vendor",
      location: p.location ?? v?.city ?? "India",
      priceValue: p.price_value != null ? Number(p.price_value) : 0,
      moq: `MOQ: ${p.moq ?? "2"}`,
      sold: `${p.sold_count}+ sold`,
      enquiries: fmtK(p.enquiries_count),
      rating: Number(p.rating_avg),
      popularity: p.sold_count,
      discount: 0,
      fabric: p.fabric ?? "—",
      gsm: p.gsm ?? "",
      fit: p.fit_type ?? "Regular",
      gender: p.gender ?? "Men",
      colour: p.colour ?? "",
      image: imgs[0] ?? PLACEHOLDER,
      secondaryImage: imgs[1] ?? imgs[0] ?? PLACEHOLDER,
      verified: trustSealFromParts(v?.is_verified, v?.plan_expires_at, v?.ad_verified_until),
      boost: v?.searchBoost ?? 0,
      // `moq` is free text the vendor typed ("100", "100 pcs", "MOQ 500"), so
      // pull the first number out of it rather than trusting the whole string.
      moqValue: (() => {
        const m = (p.moq ?? "").match(/\d[\d,]*/);
        return m ? Number(m[0].replace(/,/g, "")) : null;
      })(),
      pattern: p.pattern ?? [],
      occasion: p.occasion ?? [],
      sizes: p.sizes ?? [],
      neckType: p.neck_type ?? "",
      sleeveType: p.sleeve_type ?? "",
      collarType: p.collar_type ?? "",
      countryOfOrigin: p.country_of_origin ?? "",
      waistSizes: p.waist_sizes ?? [],
      lengths: p.lengths ?? [],
      categoryId: p.category_id ?? null,
      categoryName: p.categories?.name ?? "",
      parentCategoryName: parentName(p.categories?.parent_id),
    };
  });
  // Higher plan tiers rank first in search (real weight).
  return mapped.sort((a, b) => b.boost - a.boost);
}

export function useCatalogue() {
  return useQuery({ queryKey: ["products", "catalogue"], queryFn: fetchCatalogue });
}

// ─────────────────────────────────────────────────────────────
// Single product (buyer product-detail page). Returns the real row + its
// images + the owning vendor's public profile, or null if not found/visible.
// ─────────────────────────────────────────────────────────────

export interface ProductDetail {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  priceValue: number | null;
  currency: string;
  moq: string | null;
  fabric: string | null;
  gsm: string | null;
  fitType: string | null;
  gender: string | null;
  colour: string | null;
  sizes: string[] | null;
  // Collected by the vendor at listing time (see sellerCategories.ts). Null on
  // listings created before these columns existed, and on subcategories that
  // don't ask — e.g. shirts have collarType but no neckType, and vice versa.
  pattern: string[] | null;
  occasion: string[] | null;
  neckType: string | null;
  sleeveType: string | null;
  collarType: string | null;
  countryOfOrigin: string | null;
  waistSizes: string[] | null;
  lengths: string[] | null;
  customizationAvailable: boolean;
  location: string | null;
  categoryName: string | null;
  categoryId: string | null;
  ratingAvg: number;
  reviewsCount: number;
  soldCount: number;
  images: string[];
  vendor: { brandName: string | null; isVerified: boolean; city: string | null; ratingAvg: number; reviewsCount: number } | null;
}

interface RawDetail extends RawProduct {
  description: string | null; gender: string | null; colour: string | null;
  reviews_count: number; category_id: string | null; categories: { name: string } | null;
  sizes: string[] | null; customization_available: boolean | null;
  pattern: string[] | null; occasion: string[] | null;
  neck_type: string | null; sleeve_type: string | null; collar_type: string | null;
  country_of_origin: string | null;
  waist_sizes: string[] | null; lengths: string[] | null;
}

async function fetchProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, vendor_id, name, description, price_value, currency, moq, fabric, gsm, fit_type, gender, colour, sizes, pattern, occasion, neck_type, sleeve_type, collar_type, country_of_origin, waist_sizes, lengths, customization_available, location, category_id, rating_avg, reviews_count, sold_count, enquiries_count, categories ( name ), product_images ( url, position )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as RawDetail;

  let vendor: ProductDetail["vendor"] = null;
  const { data: v } = await supabase
    .from("vendor_profiles")
    .select("brand_name, is_verified, city, rating_avg, reviews_count, plan_expires_at, ad_verified_until")
    .eq("id", row.vendor_id)
    .maybeSingle();
  if (v) vendor = { brandName: v.brand_name, isVerified: trustSealFromParts(v.is_verified, v.plan_expires_at, v.ad_verified_until), city: v.city, ratingAvg: Number(v.rating_avg), reviewsCount: v.reviews_count };

  return {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    description: row.description,
    priceValue: row.price_value,
    currency: row.currency,
    moq: row.moq,
    fabric: row.fabric,
    gsm: row.gsm,
    fitType: row.fit_type,
    gender: row.gender,
    colour: row.colour,
    sizes: row.sizes ?? null,
    pattern: row.pattern ?? null,
    occasion: row.occasion ?? null,
    neckType: row.neck_type ?? null,
    sleeveType: row.sleeve_type ?? null,
    collarType: row.collar_type ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    waistSizes: row.waist_sizes ?? null,
    lengths: row.lengths ?? null,
    customizationAvailable: row.customization_available ?? false,
    location: row.location,
    categoryName: row.categories?.name ?? null,
    categoryId: row.category_id ?? null,
    ratingAvg: Number(row.rating_avg),
    reviewsCount: row.reviews_count,
    soldCount: row.sold_count,
    images: [...(row.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url),
    vendor,
  };
}

export function useProductById(id: string | undefined) {
  return useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => fetchProductById(id as string),
    enabled: Boolean(id),
  });
}

// ── Real engagement counters ──
// Atomic +1 via SECURITY DEFINER RPCs (mirrors ad_impression/ad_click): a buyer
// can't UPDATE a product they don't own, so the DB does it for them. Both RPCs
// are scoped to status='live' server-side. Callers own the dedup policy (e.g.
// once-per-session for views).
export async function recordProductView(id: string): Promise<void> {
  const { error } = await supabase.rpc("increment_product_view", { p: id });
  if (error) throw error;
}
export async function recordProductEnquiry(id: string): Promise<void> {
  const { error } = await supabase.rpc("increment_product_enquiry", { p: id });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Recommendation strips (ProductDetail: "You might also like" / "Brand Picks").
// Rule-based only — category match + same-vendor, no scoring/personalization —
// ordered by real engagement: enquiries_count first (a genuine signal now that
// it's incremented on real buyer contact), views_count as the tiebreak.
// Only ever returns `live` products (RLS + explicit filter), never the current
// product, and never pads: a sparse category/vendor simply yields fewer rows.
// ─────────────────────────────────────────────────────────────

const RELATED_LIMIT = 10;

// Load the vendor public-profile info (brand name, trust seal, plan boost) for a
// set of vendor ids — shared by the strip queries below.
async function vendorMapFor(vendorIds: string[]): Promise<Map<string, RawVendor>> {
  const vendorMap = new Map<string, RawVendor>();
  if (!vendorIds.length) return vendorMap;
  const boosts = await loadPlanBoosts();
  const { data: vendors } = await supabase
    .from("vendor_profiles")
    .select("id, brand_name, is_verified, city, plan_expires_at, ad_verified_until, plan_id")
    .in("id", vendorIds);
  for (const v of vendors ?? []) {
    const rv = v as RawVendor;
    rv.searchBoost = vendorBoost(boosts, rv.plan_id, rv.plan_expires_at);
    vendorMap.set((v as { id: string }).id, rv);
  }
  return vendorMap;
}

/** Turn a buyer's preferred category ids (buyerCategories vocabulary) into the
 *  real DB category ids they map to. Preferences with no dedicated DB category
 *  (co-ords / fabrics) contribute nothing. */
export async function resolvePreferredCategoryIds(prefIds: string[]): Promise<string[]> {
  const names = new Set<string>();
  for (const pid of prefIds) for (const n of PREF_TO_DB_CATEGORY_NAMES[pid] ?? []) names.add(n);
  if (!names.size) return [];
  const cats = await loadCategories();
  return cats.filter((c) => names.has(c.name)).map((c) => c.id);
}

async function fetchProductsByCategoryIds(categoryIds: string[], excludeId: string, limit: number): Promise<ProductCardData[]> {
  if (!categoryIds.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("status", "live")
    .in("category_id", categoryIds)
    .neq("id", excludeId)
    .order("enquiries_count", { ascending: false })
    .order("views_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawProduct[];
  const vendorMap = await vendorMapFor(Array.from(new Set(rows.map((r) => r.vendor_id))));
  return rows.map((r) => mapProductRow(r, vendorMap.get(r.vendor_id)));
}

async function fetchVendorOtherProducts(vendorId: string, excludeId: string, limit: number): Promise<ProductCardData[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .eq("status", "live")
    .eq("vendor_id", vendorId)
    .neq("id", excludeId)
    .order("enquiries_count", { ascending: false })
    .order("views_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawProduct[];
  const vendorMap = await vendorMapFor([vendorId]);
  return rows.map((r) => mapProductRow(r, vendorMap.get(r.vendor_id)));
}

/**
 * "You might also like": products in the buyer's preferred categories (from
 * `preferred_categories`), ranked by real performance. Falls back to the current
 * product's own category when the buyer has no usable saved preferences
 * (skipped onboarding / anonymous), so the strip never comes up empty for lack
 * of preference data.
 */
export function useYouMightLike(
  currentId: string | undefined,
  currentCategoryId: string | null | undefined,
  preferredCategoryIds: string[],
) {
  return useQuery({
    queryKey: ["products", "related", currentId, currentCategoryId, preferredCategoryIds],
    enabled: Boolean(currentId),
    queryFn: async () => {
      const preferred = await resolvePreferredCategoryIds(preferredCategoryIds);
      const categoryIds = preferred.length ? preferred : currentCategoryId ? [currentCategoryId] : [];
      return fetchProductsByCategoryIds(categoryIds, currentId as string, RELATED_LIMIT);
    },
  });
}

/** "Brand Picks": other live products from the current product's vendor. */
export function useVendorOtherProducts(vendorId: string | undefined, excludeId: string | undefined) {
  return useQuery({
    queryKey: ["products", "brandpicks", vendorId, excludeId],
    enabled: Boolean(vendorId && excludeId),
    queryFn: () => fetchVendorOtherProducts(vendorId as string, excludeId as string, RELATED_LIMIT),
  });
}

// ─────────────────────────────────────────────────────────────
// Vendor side — a vendor's OWN products, any status (RLS lets an owner see
// their draft/under_review/rejected rows that buyers never see).
// ─────────────────────────────────────────────────────────────

export interface VendorProductRow {
  id: string;
  name: string;
  price: string;          // price_value as a plain number string ("289")
  unit: string;
  image: string;
  status: "active" | "draft" | "pending";
  views: number;
  inquiries: number;
  profileScore: number;
  productCode: string;
}

interface RawMyProduct {
  id: string; name: string; price_value: number | null; status: string;
  enquiries_count: number; views_count: number; description: string | null; fabric: string | null;
  product_images: RawImage[] | null;
}

// DB status → the three UI states the vendor Products page renders.
function toUiStatus(s: string): VendorProductRow["status"] {
  if (s === "live") return "active";
  if (s === "under_review") return "pending";
  return "draft"; // draft + rejected both render as non-public here
}

// Rough listing-completeness score (mirrors the "Profile Score" idea) so the
// bar reflects real data instead of a hardcoded number.
function completeness(p: RawMyProduct): number {
  let s = 0;
  if (p.name) s += 20;
  if (p.price_value != null) s += 20;
  if ((p.product_images?.length ?? 0) > 0) s += 20;
  if (p.description) s += 20;
  if (p.fabric) s += 20;
  return s;
}

async function fetchMyProducts(vendorId: string): Promise<VendorProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price_value, status, enquiries_count, views_count, description, fabric, product_images ( url, position )")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawMyProduct[];
  return rows.map((p) => {
    const img = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? PLACEHOLDER;
    return {
      id: p.id,
      name: p.name,
      price: p.price_value != null ? String(Math.round(Number(p.price_value))) : "0",
      unit: "Piece",
      image: img,
      status: toUiStatus(p.status),
      views: p.views_count ?? 0,
      inquiries: p.enquiries_count,
      profileScore: completeness(p),
      productCode: `CSR-${p.id.slice(0, 4).toUpperCase()}`,
    };
  });
}

export function useMyProducts(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["products", "mine", vendorId],
    queryFn: () => fetchMyProducts(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// Guard against a silent zero-row write. A `.delete()`/`.update()` that matches
// nothing (row gone, or RLS-filtered because it isn't the caller's) returns no
// error — only an empty result set. Force the affected rows back with `.select()`
// and assert we actually touched one, matching the `assertWrote()` convention used
// elsewhere in the project rather than trusting a "no error means it worked" call.
function assertWrote(rows: { id: string }[] | null, action: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`${action} affected no rows — the product no longer exists or you don't have permission to change it.`);
  }
}

// Mutations. RLS guarantees a vendor can only touch their own rows.
export async function deleteProduct(id: string): Promise<void> {
  const { data, error } = await supabase.from("products").delete().eq("id", id).select("id");
  if (error) throw error;
  assertWrote(data, "Delete");
}

export async function duplicateProduct(vendorId: string, sourceId: string): Promise<void> {
  const { data: src, error: readErr } = await supabase
    .from("products")
    .select("name, description, price_value, currency, moq, fabric, gsm, fit_type, gender, colour, location, category_id")
    .eq("id", sourceId)
    .single();
  if (readErr) throw readErr;
  const { error } = await supabase
    .from("products")
    .insert({ ...src, vendor_id: vendorId, name: `${src.name} (Copy)`, status: "draft" });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Category resolution — the vendor upload taxonomy (data/sellerCategories.ts)
// is far more granular than the ~11 DB `categories` rows the buyer side reads.
// Match a product's category/sub-category/name text to the closest DB category
// so buyer category names + filters work. Ordered most-specific first (jeans
// before trousers; t-shirt/top before shirt).
// ─────────────────────────────────────────────────────────────
const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/jean|denim/i, "Jeans"],
  [/t-?shirt|\btee\b|tank ?top|crop ?top|\btops?\b|blouse|tunic|henley/i, "T-shirts/Tops"],
  [/\bshirt/i, "Shirt"],
  [/dress|gown|frock|jumpsuit/i, "Dress"],
  [/ethnic|kurt|saree|sari|lehenga|salwar|anarkali|palazzo|sherwani|dupatta/i, "Ethnic Wear"],
  [/kids|kidswear|\bboys\b|\bgirls\b|romper|onesie|infant|toddler/i, "Kidswear"],
  [/trouser|\bpant|chino|jogger|cargo|legging|palazzo|shorts/i, "Trousers"],
  [/footwear|\bshoe|sneaker|sandal|\bboot|heel|loafer|slipper/i, "Footwear"],
  [/activewear|sportswear|\bgym\b|track ?(suit|pant)|athletic|yoga|jersey/i, "Activewear"],
  [/winter|jacket|sweater|hoodie|sweatshirt|\bcoat|cardigan|thermal|puffer|blazer/i, "Winter Wear"],
  [/accessor|\bbag\b|belt|\bcap\b|\bhat\b|watch|sunglass|jewel|scarf|stole|\bsock|glove|wallet|clutch/i, "Accessories"],
];

interface CategoryRow { id: string; name: string; parent_id: string | null }
let categoryCache: CategoryRow[] | null = null;
async function loadCategories(): Promise<CategoryRow[]> {
  if (categoryCache) return categoryCache;
  const { data } = await supabase.from("categories").select("id, name, parent_id");
  categoryCache = (data ?? []) as CategoryRow[];
  return categoryCache;
}

/**
 * The precise category for a listing: the seeded subcategory row matching the
 * subcategory the vendor actually picked, looked up under its parent category.
 *
 * Prefer this over resolveCategoryId. The vendor selects an exact subcategory
 * ("Men's T-Shirts") in step 2 of the upload wizard; resolveCategoryId ignored
 * that and re-derived a far coarser bucket by regex-matching the product NAME,
 * so "Lounge Tee" and "Graphic Tee" both collapsed to "T-shirts/Tops" and the
 * buyer-facing Categories filter had nothing granular to group by.
 */
export async function resolveSubcategoryId(
  categoryName: string | null | undefined,
  subName: string | null | undefined,
): Promise<string | null> {
  if (!categoryName || !subName) return null;
  const cats = await loadCategories();
  const parent = cats.find((c) => c.name === categoryName && c.parent_id === null);
  if (!parent) return null;
  return cats.find((c) => c.name === subName && c.parent_id === parent.id)?.id ?? null;
}

/**
 * Best-effort map of upload taxonomy text → a DB category id (or null).
 *
 * Kept as the fallback for callers with no clean subcategory to work from —
 * chiefly the vendorOnboarding bulk-import path, which only has free-text
 * category names off an onboarding form.
 */
export async function resolveCategoryId(...hints: (string | null | undefined)[]): Promise<string | null> {
  const hay = hints.filter(Boolean).join(" ");
  if (!hay.trim()) return null;
  const cats = await loadCategories();
  for (const [re, name] of CATEGORY_KEYWORDS) {
    if (re.test(hay)) {
      const c = cats.find((x) => x.name === name);
      if (c) return c.id;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Vendor product editing — load one of the vendor's own rows into the Upload
// form's shape, and persist edits (RLS restricts both to the owner/admin).
// ─────────────────────────────────────────────────────────────
export interface EditableProduct {
  id: string;
  name: string;
  description: string | null;
  price_value: number | null;
  moq: string | null;
  fabric: string | null;
  gsm: string | null;
  fit_type: string | null;
  gender: string | null;
  category_id: string | null;
  status: string;
  images: string[];
  sizes: string[] | null;
  colour: string | null;
  // Edit mode skips the category/subcategory steps, so the Details step renders
  // no dynamic fields and the vendor never re-answers these. They are still read
  // back and written through unchanged on save — without that, every edit would
  // blank out attributes the vendor set when the listing was created.
  pattern: string[] | null;
  occasion: string[] | null;
  neck_type: string | null;
  sleeve_type: string | null;
  collar_type: string | null;
  country_of_origin: string | null;
  waist_sizes: string[] | null;
  lengths: string[] | null;
  customization_available: boolean;
}

async function fetchProductForEdit(id: string): Promise<EditableProduct | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, price_value, moq, fabric, gsm, fit_type, gender, category_id, status, sizes, colour, pattern, occasion, neck_type, sleeve_type, collar_type, country_of_origin, waist_sizes, lengths, customization_available, product_images ( url, position )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as (EditableProduct & { product_images: RawImage[] | null });
  return {
    id: row.id, name: row.name, description: row.description, price_value: row.price_value,
    moq: row.moq, fabric: row.fabric, gsm: row.gsm, fit_type: row.fit_type, gender: row.gender,
    category_id: row.category_id, status: row.status,
    sizes: row.sizes ?? null,
    colour: row.colour ?? null,
    pattern: row.pattern ?? null,
    occasion: row.occasion ?? null,
    neck_type: row.neck_type ?? null,
    sleeve_type: row.sleeve_type ?? null,
    collar_type: row.collar_type ?? null,
    country_of_origin: row.country_of_origin ?? null,
    waist_sizes: row.waist_sizes ?? null,
    lengths: row.lengths ?? null,
    customization_available: row.customization_available ?? false,
    images: [...(row.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url),
  };
}

export function useProductForEdit(id: string | undefined) {
  return useQuery({
    queryKey: ["products", "edit", id],
    queryFn: () => fetchProductForEdit(id as string),
    enabled: Boolean(id),
  });
}

export interface ProductPatch {
  name?: string;
  description?: string | null;
  price_value?: number | null;
  moq?: string | null;
  fabric?: string | null;
  gsm?: string | null;
  fit_type?: string | null;
  gender?: string | null;
  category_id?: string | null;
  status?: "draft" | "under_review";
  sizes?: string[] | null;
  colour?: string | null;
  pattern?: string[] | null;
  occasion?: string[] | null;
  neck_type?: string | null;
  sleeve_type?: string | null;
  collar_type?: string | null;
  country_of_origin?: string | null;
  waist_sizes?: string[] | null;
  lengths?: string[] | null;
  customization_available?: boolean;
}
export async function updateProduct(id: string, patch: ProductPatch): Promise<void> {
  const { data, error } = await supabase.from("products").update(patch).eq("id", id).select("id");
  if (error) throw error;
  assertWrote(data, "Update");
}
