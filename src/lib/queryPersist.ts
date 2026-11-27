import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Public page data kept between visits (speed plan 4.5, 2026-11-28; documentation/speed-build-plan-2026-11-27.md §3).
 *
 * A return visit shows the feeds, product and store pages it saw last time at once, from this browser's IndexedDB,
 * and React Query refreshes them in the background as usual (they are older than `staleTime`).
 *
 * What is kept, and for whom:
 *  - Only the queries in `PUBLIC_KEYS`: data any visitor may read, the same for every visitor (feeds, listings, stores,
 *    reviews, categories, search results); not For You, which is the buyer's own. Never ads or paid placements (an
 *    ended campaign must not be shown or counted), never anything of an account's own (chats, quotes, saves, a
 *    seller's own rows), never a write.
 *  - One record per browser, for one account: the signed-in user's id, or "anon". It is read only by the same account,
 *    replaced when another account saves, and deleted at sign-out.
 *  - Only from the same build (`BUILD`, the entry script's name, which changes with every deploy), and only data fetched
 *    in the last 24 hours. An infinite feed keeps its first page only, so a return visit refetches one page.
 *
 * A failure anywhere (no IndexedDB, private mode, a full disk, data that can't be stored) leaves the app as it was.
 */

const DB_NAME = "cosora-cache";
const STORE = "queries";
const RECORD = "public";
const MAX_AGE_MS = 24 * 60 * 60_000;
const MAX_QUERIES = 80;
const SAVE_DELAY_MS = 2_000;
/** This deploy: the page's entry script, whose name changes with every build (this module loads on its own). */
const BUILD =
  (document.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null)?.src ?? import.meta.url;

/** First key part → `true` (every query under it) or the second key parts that are public. */
const PUBLIC_KEYS: Record<string, true | readonly string[]> = {
  feed: true,
  "site-config": true,
  pref_category_map: true,
  "live-category-counts": true,
  sample_vendor_ids: true,
  fx_rates: true,
  "help-guides": true,
  subscription_plans: true,
  product_documents: true,
  product_reviews: true,
  product_review_stats: true,
  category_id_by_name: true,
  attribute_definitions: ["product"],
  products: ["detail", "related", "brandpicks"],
  product_videos: ["listing", "one", "live"],
  reviews: ["vendor", "vendor_stats"],
  catalogues: ["vendor"],
  vendor_profiles: ["top"],
  search: ["results", "suggestions"],
};

export function isPublicQueryKey(key: readonly unknown[]): boolean {
  const [first, second] = key;
  // A store page is ["vendor_profile", id]; a seller's own row is ["vendor_profile", "mine", …].
  if (first === "vendor_profile") return key.length === 2 && second !== "mine";
  const rule = typeof first === "string" ? PUBLIC_KEYS[first] : undefined;
  if (rule === true) return true;
  return !!rule && typeof second === "string" && rule.includes(second);
}

interface SavedRecord { build: string; uid: string; savedAt: number; state: DehydratedState }

/** The signed-in account at start, read from supabase-js's own storage (its default key), without waiting for a refresh. */
function storedUserId(): string {
  try {
    const host = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split(".")[0];
    const raw = localStorage.getItem(`sb-${host}-auth-token`);
    const id = raw ? (JSON.parse(raw) as { user?: { id?: unknown } }).user?.id : undefined;
    return typeof id === "string" && id ? id : "anon";
  } catch {
    return "anon";
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? req.error);
  });
}

/** Keep the first page of an infinite query: a return visit refetches what it shows, not every page scrolled past. */
function firstPageOnly(data: unknown): unknown {
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) {
    const d = data as { pages: unknown[]; pageParams?: unknown[] };
    return { ...d, pages: d.pages.slice(0, 1), pageParams: (d.pageParams ?? []).slice(0, 1) };
  }
  return data;
}

function fresh(updatedAt: number, now: number) {
  return updatedAt > 0 && now - updatedAt < MAX_AGE_MS;
}

function snapshot(qc: QueryClient): DehydratedState {
  const now = Date.now();
  const state = dehydrate(qc, {
    shouldDehydrateQuery: (q: Query) =>
      q.state.status === "success" && isPublicQueryKey(q.queryKey) && fresh(q.state.dataUpdatedAt, now),
    shouldDehydrateMutation: () => false,
  });
  const queries = state.queries
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .slice(0, MAX_QUERIES)
    // A fetch in flight is not saved as a promise; the data it already has is.
    .map(({ promise: _promise, ...q }) => ({ ...q, state: { ...q.state, data: firstPageOnly(q.state.data) } }));
  return { mutations: [], queries };
}

/** Starts restoring and saving. Call once, right after the QueryClient is made. */
export function persistPublicQueries(qc: QueryClient): void {
  if (import.meta.env.DEV || typeof indexedDB === "undefined") return;
  let uid = storedUserId();
  let db: Promise<IDBDatabase | null> = openDb().catch(() => null);

  const restored = db.then(async (d) => {
    if (!d) return;
    const rec = await run<SavedRecord | undefined>(d, "readonly", (s) => s.get(RECORD));
    if (!rec || rec.build !== BUILD || rec.uid !== uid || !Array.isArray(rec.state?.queries)) return;
    const now = Date.now();
    const queries = rec.state.queries.filter((q) => isPublicQueryKey(q.queryKey) && fresh(q.state.dataUpdatedAt, now));
    // Data already fetched this visit is newer, and hydrate() keeps it.
    hydrate(qc, { mutations: [], queries });
  }).catch(() => undefined);

  // After a sign-out or a change of account, this page's memory may hold the previous account's feeds (Following is
  // keyed by the sellers it follows): nothing more is saved until the next page load.
  let frozen = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (frozen) return;
    void restored.then(() => db).then(async (d) => {
      // A sign-out while this waited: its delete is queued after any put already made, so check before making one.
      if (!d || frozen) return;
      const rec: SavedRecord = { build: BUILD, uid, savedAt: Date.now(), state: snapshot(qc) };
      try {
        await run(d, "readwrite", (s) => s.put(rec, RECORD));
      } catch {
        // Something in the data can't be stored (DataCloneError): keep only the queries that can.
        rec.state = { mutations: [], queries: rec.state.queries.filter((q) => { try { structuredClone(q); return true; } catch { return false; } }) };
        await run(d, "readwrite", (s) => s.put(rec, RECORD)).catch(() => undefined);
      }
    }).catch(() => undefined);
  };
  const later = () => { if (!timer) timer = setTimeout(save, SAVE_DELAY_MS); };

  qc.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success" && isPublicQueryKey(event.query.queryKey)) later();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && timer) save(); });

  supabase.auth.onAuthStateChange((event, session) => {
    const next = session?.user?.id ?? "anon";
    if (event === "SIGNED_OUT" || (uid !== "anon" && next !== uid)) frozen = true;
    if (event === "SIGNED_OUT") {
      // Nothing kept for an account outlives its sign-out.
      if (timer) { clearTimeout(timer); timer = undefined; }
      db = db.then(async (d) => { if (d) await run(d, "readwrite", (s) => s.delete(RECORD)).catch(() => undefined); return d; });
    }
    uid = next;
  });
}
