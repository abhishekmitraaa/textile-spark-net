import { useSyncExternalStore } from "react";
import { img, makeListingProduct, type Gender, type ListingProduct } from "@/lib/listingProducts";
import { supabase } from "@/lib/supabase";
import { fetchProductCardsByIds } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// Recently Viewed store.
//
// A module-level list of the products the buyer has opened, newest first,
// backed by localStorage. ProductDetail calls recordView() on mount; the
// Recently Viewed page reads it via useRecentlyViewed(). Per-item delete is
// instant (removeRecent); the header trash clears everything (clearRecent,
// behind a confirm dialog).
// ─────────────────────────────────────────────────────────────

export interface RecentProduct extends ListingProduct {
  reviews: number;
  verified: boolean;
  viewedAt: number; // ms timestamp — drives ordering + relative label
}

const STORAGE_KEY = "cosora.recentlyViewed.v1";
const MAX_ITEMS = 40;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Human-friendly "time since" label ("2 hours ago", "Yesterday", …). */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min > 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} week${wk > 1 ? "s" : ""} ago`;
  const mo = Math.floor(day / 30);
  return `${mo} month${mo > 1 ? "s" : ""} ago`;
}

// ── Seed data (matches the reference; 6 products) ──
function seed(
  id: string, name: string, manufacturer: string, location: string,
  priceValue: number, moq: string, rating: number, reviews: number,
  verified: boolean, gender: Gender, seedImg: string, ago: number
): RecentProduct {
  return {
    ...makeListingProduct(id, {
      name, manufacturer, vendorId: `v-${id}`, location,
      price: `₹${priceValue}`, priceValue, moq, rating, gender,
      image: img(seedImg), secondaryImage: img(`${seedImg}-b`),
    }),
    reviews,
    verified,
    viewedAt: Date.now() - ago,
  };
}

const SEED: RecentProduct[] = [
  seed("rv1", "Premium Cotton Polo T-Shirt", "Tirupur Textiles", "Tirupur, Tamil Nadu", 320, "MOQ: 100 pieces", 4.8, 156, true, "men", "rv-polo", 2 * HOUR),
  seed("rv2", "Women's Casual Kurta Set", "Delhi Fashion Hub", "Delhi NCR", 850, "MOQ: 50 sets", 4.6, 89, true, "women", "rv-kurta", 5 * HOUR),
  seed("rv3", "Kids Cotton Shorts", "Gujarat Garments", "Ahmedabad, Gujarat", 180, "MOQ: 200 pieces", 4.3, 45, false, "kids", "rv-shorts", DAY + 2 * HOUR),
  seed("rv4", "Denim Jeans - Slim Fit", "Mumbai Denim Co.", "Mumbai, Maharashtra", 650, "MOQ: 75 pieces", 4.7, 203, true, "men", "rv-denim", DAY + 4 * HOUR),
  seed("rv5", "Formal Cotton Shirt", "Bangalore Apparel", "Bangalore, Karnataka", 420, "MOQ: 100 pieces", 4.5, 78, true, "men", "rv-shirt", 2 * DAY),
  seed("rv6", "Sports Track Pants", "Active Wear India", "Ludhiana, Punjab", 380, "MOQ: 150 pieces", 4.2, 34, false, "unisex", "rv-track", 3 * DAY),
];

function load(): RecentProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RecentProduct[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return SEED;
}

let items: RecentProduct[] = load();
const listeners = new Set<() => void>();

function commit(next: RecentProduct[], persist = true) {
  items = next;
  // Signed in → DB is source of truth; don't also write the local snapshot.
  if (persist && !userId) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }
  listeners.forEach((l) => l());
}

// ─────────────────────────────────────────────────────────────
// DB sync. When signed in, views persist to `recently_viewed` (product refs)
// and hydrate into rich RecentProduct rows via the products catalogue.
// ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
let userId: string | null = null;

async function hydrateRecent(uidValue: string): Promise<RecentProduct[]> {
  const { data } = await supabase
    .from("recently_viewed")
    .select("product_id, viewed_at")
    .eq("buyer_id", uidValue)
    .order("viewed_at", { ascending: false })
    .limit(MAX_ITEMS);
  const rows = data ?? [];
  const cards = await fetchProductCardsByIds(rows.map((r) => r.product_id));
  const out: RecentProduct[] = [];
  for (const r of rows) {
    const c = cards[r.product_id];
    if (!c) continue;
    out.push({
      id: c.id, vendorId: c.vendorId, name: c.name, manufacturer: c.manufacturer, location: c.location,
      price: c.price, priceValue: c.priceValue, moq: c.moq, soldCount: c.soldCount, enquiries: c.enquiries,
      rating: c.rating, fabric: c.fabric, gsm: c.gsm, fitType: c.fitType, image: c.image, secondaryImage: c.secondaryImage,
      gender: (c.gender.toLowerCase() as Gender), category: c.categoryName ?? undefined,
      reviews: 0, verified: c.verified ?? false, viewedAt: new Date(r.viewed_at).getTime(),
    });
  }
  return out;
}

/** Called by StoreSync on auth change: hydrate from DB or revert to local. */
export async function setRecentUser(nextUserId: string | null) {
  if (nextUserId === userId) return;
  userId = nextUserId;
  if (!nextUserId) {
    commit(load(), false);
    return;
  }
  try {
    const rows = await hydrateRecent(nextUserId);
    if (userId === nextUserId) commit(rows, false);
  } catch {
    /* keep current state on failure */
  }
}

// Normalize any product-ish object to a full RecentProduct, preserving known
// fields from a prior view (base) and filling gaps with sensible defaults.
function normalize(p: Partial<RecentProduct> & { id: string }, now: number, base?: RecentProduct): RecentProduct {
  const priceValue =
    p.priceValue ??
    base?.priceValue ??
    (typeof p.price === "string" ? parseInt(p.price.replace(/[^\d]/g, ""), 10) || 0 : 0);
  const fallback = base ?? makeListingProduct(p.id);
  const defined = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  return {
    ...fallback,
    ...defined,
    id: p.id,
    priceValue,
    reviews: p.reviews ?? base?.reviews ?? 0,
    verified: p.verified ?? base?.verified ?? false,
    viewedAt: now,
  } as RecentProduct;
}

// ── Mutations ──

/** Record (or bump) a product view. Moves it to the front of the list. */
export function recordView(p: Partial<RecentProduct> & { id: string }) {
  const now = Date.now();
  const base = items.find((i) => i.id === p.id);
  const merged = normalize(p, now, base);
  commit([merged, ...items.filter((i) => i.id !== p.id)].slice(0, MAX_ITEMS));
  if (userId && isUuid(p.id)) {
    void supabase
      .from("recently_viewed")
      .upsert({ buyer_id: userId, product_id: p.id, viewed_at: new Date(now).toISOString() }, { onConflict: "buyer_id,product_id" })
      .then(() => {});
  }
}

/** Instant per-card delete (no confirm — per reference note). */
export function removeRecent(id: string) {
  commit(items.filter((i) => i.id !== id));
  if (userId && isUuid(id)) void supabase.from("recently_viewed").delete().eq("buyer_id", userId).eq("product_id", id).then(() => {});
}

/** Clear entire history (behind a confirm dialog in the UI). */
export function clearRecent() {
  commit([]);
  if (userId) void supabase.from("recently_viewed").delete().eq("buyer_id", userId).then(() => {});
}

// ── Hook ──
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRecentlyViewed(): RecentProduct[] {
  return useSyncExternalStore(subscribe, () => items, () => items);
}
