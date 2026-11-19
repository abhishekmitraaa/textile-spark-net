import { useSyncExternalStore } from "react";
import { type Gender, type ListingProduct } from "@/lib/listingProducts";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchProductCardsByIds } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// Recently Viewed store.
//
// A module-level list of the products the buyer has opened, newest first.
// ProductDetail calls recordView() on mount; the Recently Viewed page reads it
// via useRecentlyViewed(). Per-item delete is instant (removeRecent); the
// header trash clears everything (clearRecent, behind a confirm dialog).
//
// Two backings, and which one is authoritative depends on who is looking:
//   * Signed in  → the `recently_viewed` table is the source of truth. The
//     local list is replaced by the DB rows on sign-in and is not written to
//     localStorage while signed in (see commit()).
//   * Signed out → localStorage, and only localStorage.
//
// There is NO seed. An empty history is an empty list, rendered as the page's
// real empty state. See the note where SEED used to be.
// ─────────────────────────────────────────────────────────────

export interface RecentProduct extends ListingProduct {
  reviews: number;
  verified: boolean;
  viewedAt: number; // ms timestamp — drives ordering + relative label
}

const STORAGE_KEY = "cosora.recentlyViewed.v1";
const MAX_ITEMS = 40;

// Declared before load() runs at module init below — `const` is in the temporal
// dead zone until its line executes, so load() calling isUuid() would throw if
// these still sat further down the file where the DB-sync section begins.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

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

// REMOVED 2026-09-10 (Master Prompt 8): SEED and seed() — six invented products
// (rv1..rv6: "Premium Cotton Polo T-Shirt / Tirupur Textiles", "Kids Cotton
// Shorts / Gujarat Garments", …) returned by load() whenever localStorage was
// empty. Every first-time visitor, cleared browser and signed-out session saw
// six products they had never viewed, indistinguishable from real history, and
// every one linked to /product/rv1../product/rv6 — routes that have never
// existed. Their Chat and CALL NOW buttons targeted vendor ids "v-rv1".."v-rv6",
// which do not exist either. Same class of bug as the ForYou ad strip removed in
// Master Prompt 7.
//
// It was also worse than "shown on a fresh browser": recordView() builds the new
// list as [thisView, ...items], and on a first visit `items` WAS the seed — so a
// signed-out buyer's first real product view persisted all six fakes into
// localStorage alongside it, where they stayed after any fix to load() alone.
// load() now drops them (see below).

function load(): RecentProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProduct[];
    if (!Array.isArray(parsed)) return [];
    // Only a real product can reach recordView(): ProductDetail records a view
    // only once its DB row has loaded, so every legitimate entry carries a UUID.
    // Anything else is a seed row an older build persisted (see above) and can
    // never resolve to a real product page — drop it, and rewrite storage so it
    // stays dropped.
    const real = parsed.filter((p) => typeof p?.id === "string" && isUuid(p.id));
    if (real.length !== parsed.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(real));
      } catch {
        /* storage unavailable — still filtered in memory */
      }
    }
    return real;
  } catch {
    return [];
  }
}

let userId: string | null = null;
// True while a signed-in buyer's history is being fetched from the DB. The page
// reads it so an in-flight fetch renders as loading, not as "no history" — a
// spinner is not an empty list.
let hydrating = false;
let items: RecentProduct[] = load();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

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
  emit();
}

// ─────────────────────────────────────────────────────────────
// DB sync. When signed in, views persist to `recently_viewed` (product refs)
// and hydrate into rich RecentProduct rows via the products catalogue.
// ─────────────────────────────────────────────────────────────

async function hydrateRecent(uidValue: string): Promise<RecentProduct[]> {
  const { data, error } = await supabase
    .from("recently_viewed")
    .select("product_id, viewed_at")
    .eq("buyer_id", uidValue)
    .order("viewed_at", { ascending: false })
    .limit(MAX_ITEMS);
  // Throw rather than fall through to []: a failed fetch is not an empty
  // history, and treating it as one would wipe the list and show the buyer
  // "No recently viewed products" for history they do have.
  if (error) throw error;
  return cardsFor(data ?? []);
}

/** The real cards for these product ids, in the given order; listings that are no longer live drop out. */
async function cardsFor(rows: { product_id: string; viewed_at: string }[]): Promise<RecentProduct[]> {
  const cards = await fetchProductCardsByIds(rows.map((r) => r.product_id));
  const out: RecentProduct[] = [];
  for (const r of rows) {
    const c = cards[r.product_id];
    if (!c) continue;
    out.push({
      id: c.id, vendorId: c.vendorId, name: c.name, manufacturer: c.manufacturer, location: c.location,
      price: c.price, priceValue: c.priceValue, moq: c.moq, views: c.views ?? null, enquiries: c.enquiries,
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
    hydrating = false;
    commit(load(), false);
    return;
  }
  hydrating = true;
  emit();
  let rows: RecentProduct[] | null = null;
  try {
    rows = await hydrateRecent(nextUserId);
  } catch {
    /* keep current state on failure — never show a failed fetch as empty */
  }
  // A newer auth change (sign-out, account switch) superseded this fetch.
  if (userId !== nextUserId) return;
  hydrating = false;
  if (rows) commit(rows, false);
  else emit();
}

/**
 * Re-read the real cards for the listed ids, keeping when each was viewed (2026-11-18 review, H-05). Signed out, the
 * list lives in this browser and may hold what an older build invented (a rating, a gender, "Cotton", "5.6k"); views
 * recorded this session carry only what the product page passed. Reads only: nothing is written. A failed read keeps
 * the list as it is. The Recently Viewed page calls it on opening.
 */
export async function refreshRecentCards(): Promise<void> {
  if (items.length === 0 || hydrating) return;
  const forUser = userId;
  const asked = new Set(items.map((i) => i.id));
  let fresh: RecentProduct[];
  try {
    fresh = await cardsFor(items.map((i) => ({ product_id: i.id, viewed_at: new Date(i.viewedAt).toISOString() })));
  } catch {
    return;
  }
  if (userId !== forUser || hydrating) return; // the account changed meanwhile: its own list wins
  // Views recorded while the read was in flight stay on top; an id that was read but isn't live any more drops out.
  const newer = items.filter((i) => !asked.has(i.id));
  commit([...newer, ...fresh].slice(0, MAX_ITEMS));
}

/** What a view knows before the real card is read: nothing is made up (no rating, no fabric, no gender guess). */
function blankRecent(id: string): RecentProduct {
  return {
    id, vendorId: "", name: "", manufacturer: "", location: "", price: "", priceValue: 0, moq: "", views: null,
    enquiries: "", rating: 0, fabric: "", gsm: "", fitType: "", image: "", secondaryImage: "", gender: "unisex",
    reviews: 0, verified: false, viewedAt: 0,
  };
}

// Normalize any product-ish object to a full RecentProduct, preserving known
// fields from a prior view (base) and leaving the rest blank. It used to fill the gaps from makeListingProduct(), a
// mock helper that invented a 3.7–4.9 rating, a gender and "Cotton" for every view (2026-11-18 review, H-05).
function normalize(p: Partial<RecentProduct> & { id: string }, now: number, base?: RecentProduct): RecentProduct {
  const priceValue =
    p.priceValue ??
    base?.priceValue ??
    (typeof p.price === "string" ? parseInt(p.price.replace(/[^\d]/g, ""), 10) || 0 : 0);
  const fallback = base ?? blankRecent(p.id);
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
    // Nothing to undo for a view the buyer didn't ask to keep; a refusal is only logged (review M-19).
    void supabase
      .from("recently_viewed")
      .upsert({ buyer_id: userId, product_id: p.id, viewed_at: new Date(now).toISOString() }, { onConflict: "buyer_id,product_id" })
      .then(({ error }) => { if (error) console.warn("recently_viewed write refused", error.code); });
  }
}

/** Instant per-card delete (no confirm — per reference note). */
export function removeRecent(id: string) {
  const at = items.findIndex((i) => i.id === id);
  const removed = items[at];
  commit(items.filter((i) => i.id !== id));
  // Waits for the database; a refusal puts the card back and says so (2026-11-19, review M-19).
  if (userId && isUuid(id) && removed) {
    const forUser = userId;
    void supabase.from("recently_viewed").delete().eq("buyer_id", forUser).eq("product_id", id).then(({ error }) => {
      if (!error || userId !== forUser) return;
      const next = [...items];
      next.splice(Math.min(at, next.length), 0, removed);
      commit(next.slice(0, MAX_ITEMS));
      toast.error("Couldn't remove it from your history", { description: "Please try again." });
    });
  }
}

/** Clear entire history (behind a confirm dialog in the UI). */
export function clearRecent() {
  const before = items;
  commit([]);
  if (userId) {
    const forUser = userId;
    void supabase.from("recently_viewed").delete().eq("buyer_id", forUser).then(({ error }) => {
      if (!error || userId !== forUser) return;
      commit(before);
      toast.error("Couldn't clear your history", { description: "Please try again." });
    });
  }
}

// ── Hooks ──
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRecentlyViewed(): RecentProduct[] {
  return useSyncExternalStore(subscribe, () => items, () => items);
}

/** True while a signed-in buyer's history is being fetched from the DB. */
export function useRecentlyViewedHydrating(): boolean {
  return useSyncExternalStore(subscribe, () => hydrating, () => hydrating);
}

/**
 * Whose history the store currently holds (null = the signed-out local list).
 * Lets the page tell "signed in, but StoreSync has not handed the store this
 * user yet" — one render, since StoreSync's effect runs after the page's first
 * commit — apart from a genuinely empty history.
 */
export function useRecentlyViewedOwner(): string | null {
  return useSyncExternalStore(subscribe, () => userId, () => userId);
}
