import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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
}

// Compact counts, e.g. 5600 -> "5.6k".
function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

interface RawImage { url: string; position: number }
export interface RawVendor { brand_name: string | null; is_verified: boolean; city: string | null }
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
    verified: vendor?.is_verified,
  };
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
    const { data: vendors } = await supabase
      .from("vendor_profiles")
      .select("id, brand_name, is_verified, city")
      .in("id", vendorIds);
    for (const v of vendors ?? []) vendorMap.set(v.id, v as RawVendor);
  }

  return rows.map((r) => mapProductRow(r, vendorMap.get(r.vendor_id)));
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
      .from("vendor_profiles").select("id, brand_name, is_verified, city").in("id", vendorIds);
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

/** Trending = most enquired + best-selling first. */
export function sortTrending(products: ProductCardData[]): ProductCardData[] {
  return [...products].sort(
    (a, b) => b.soldCountNum + parseFloat(b.enquiries) - (a.soldCountNum + parseFloat(a.enquiries)),
  );
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
  gender: string; colour: string; image: string; secondaryImage: string; verified: boolean;
}

async function fetchCatalogue(): Promise<CatalogueRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, vendor_id, name, price_value, currency, moq, fabric, gsm, fit_type, gender, colour, location, rating_avg, sold_count, enquiries_count, product_images ( url, position )")
    .eq("status", "live")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as (RawProduct & { gender: string | null; colour: string | null })[];

  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const vendorMap = new Map<string, RawVendor>();
  if (vendorIds.length) {
    const { data: vendors } = await supabase
      .from("vendor_profiles").select("id, brand_name, is_verified, city").in("id", vendorIds);
    for (const v of vendors ?? []) vendorMap.set(v.id, v as RawVendor);
  }

  return rows.map((p) => {
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
      verified: v?.is_verified ?? false,
    };
  });
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
  location: string | null;
  categoryName: string | null;
  ratingAvg: number;
  reviewsCount: number;
  soldCount: number;
  images: string[];
  vendor: { brandName: string | null; isVerified: boolean; city: string | null; ratingAvg: number; reviewsCount: number } | null;
}

interface RawDetail extends RawProduct {
  description: string | null; gender: string | null; colour: string | null;
  reviews_count: number; categories: { name: string } | null;
}

async function fetchProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, vendor_id, name, description, price_value, currency, moq, fabric, gsm, fit_type, gender, colour, location, rating_avg, reviews_count, sold_count, enquiries_count, categories ( name ), product_images ( url, position )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as RawDetail;

  let vendor: ProductDetail["vendor"] = null;
  const { data: v } = await supabase
    .from("vendor_profiles")
    .select("brand_name, is_verified, city, rating_avg, reviews_count")
    .eq("id", row.vendor_id)
    .maybeSingle();
  if (v) vendor = { brandName: v.brand_name, isVerified: v.is_verified, city: v.city, ratingAvg: Number(v.rating_avg), reviewsCount: v.reviews_count };

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
    location: row.location,
    categoryName: row.categories?.name ?? null,
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

// Mutations. RLS guarantees a vendor can only touch their own rows.
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
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

let categoryCache: { id: string; name: string }[] | null = null;
async function loadCategories(): Promise<{ id: string; name: string }[]> {
  if (categoryCache) return categoryCache;
  const { data } = await supabase.from("categories").select("id, name");
  categoryCache = (data ?? []) as { id: string; name: string }[];
  return categoryCache;
}

/** Best-effort map of upload taxonomy text → a DB category id (or null). */
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
}

async function fetchProductForEdit(id: string): Promise<EditableProduct | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, price_value, moq, fabric, gsm, fit_type, gender, category_id, status, product_images ( url, position )")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as (EditableProduct & { product_images: RawImage[] | null });
  return {
    id: row.id, name: row.name, description: row.description, price_value: row.price_value,
    moq: row.moq, fabric: row.fabric, gsm: row.gsm, fit_type: row.fit_type, gender: row.gender,
    category_id: row.category_id, status: row.status,
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
}
export async function updateProduct(id: string, patch: ProductPatch): Promise<void> {
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) throw error;
}
