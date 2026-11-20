import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { Gender, ListingProduct } from "@/lib/listingProducts";
import { supabase } from "@/lib/supabase";
import { chunks } from "@/lib/chunks";
import { fetchProductCardsByIds } from "@/lib/queries/products";

// ─────────────────────────────────────────────────────────────
// Wishlist / Saved collections store.
//
// Holds folders ("collections") and the saved products in each, plus the
// ephemeral "pending" product that drives the global Save-to-folder modal.
// Any ListingProductCard bookmark opens that modal; saving writes here and
// the My Saves pages read from here. Backed by localStorage (folders +
// products persist; the pending-modal state does not).
// ─────────────────────────────────────────────────────────────

export interface SavedProduct extends ListingProduct {
  reviews: number;
  timeAgo: string;
  verified: boolean;
  savedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  productIds: string[];
}

interface PersistedState {
  folders: Folder[];
  products: Record<string, SavedProduct>;
}

export interface SavedState extends PersistedState {
  pending: SavedProduct | null; // product awaiting a folder choice (modal open when non-null)
}

export const ALL_SAVES_ID = "all-saves";

// Empty to start (2026-10-19). Signed-out visitors were shown 12 invented saved products in 5 folders
// ("Summer Collection", "Denim Picks"…) as if they had saved them.
const EMPTY_STATE: PersistedState = {
  products: {},
  folders: [{ id: ALL_SAVES_ID, name: "All Saves", productIds: [] }],
};

// What a browser may still hold from the old seed: its product ids and folder ids. Dropped on load; a seed folder
// the visitor added a real product to is kept.
const OLD_SEED_PRODUCT = /^sp\d+$/;
const OLD_SEED_FOLDERS = new Set(["summer", "denim", "sustainable", "casual", "formal"]);
function withoutOldSeed(p: PersistedState): PersistedState {
  const products = Object.fromEntries(Object.entries(p.products).filter(([id]) => !OLD_SEED_PRODUCT.test(id)));
  const folders = p.folders
    .map((f) => ({ ...f, productIds: f.productIds.filter((id) => !OLD_SEED_PRODUCT.test(id)) }))
    .filter((f) => !(OLD_SEED_FOLDERS.has(f.id) && f.productIds.length === 0));
  if (!folders.some((f) => f.id === ALL_SAVES_ID)) folders.unshift({ id: ALL_SAVES_ID, name: "All Saves", productIds: [] });
  return { products, folders };
}

const STORAGE_KEY = "cosora.saved.v1";

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.folders && parsed.products) return withoutOldSeed(parsed);
    }
  } catch {
    /* ignore */
  }
  return EMPTY_STATE;
}

let state: SavedState = { ...loadPersisted(), pending: null };
const listeners = new Set<() => void>();

function commit(next: SavedState, persist = true) {
  state = next;
  // When signed in the DB is the source of truth, so we don't also write the
  // seeded/local snapshot to localStorage (it would resurface on sign-out).
  if (persist && !userId) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ folders: state.folders, products: state.products }));
    } catch {
      /* storage unavailable */
    }
  }
  listeners.forEach((l) => l());
}

const uid = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ─────────────────────────────────────────────────────────────
// DB sync (Supabase). When a buyer is signed in the wishlist is backed by
// `saved_items` (the "All Saves" master set) + `saved_folders` /
// `saved_folder_items` (named folders). Mutations update local state
// instantly and mirror to the DB, undone when refused (M-19); on sign-in we hydrate real
// state, replacing the local seed. Signed out → localStorage (unchanged).
// ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);
const newFolderId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : uid();

let userId: string | null = null;

function relTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minute${min > 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return `${Math.floor(day / 7)} week${day >= 14 ? "s" : ""} ago`;
}

/**
 * Every row of a read, 1,000 at a time (review L-42): PostgREST stops at 1,000 rows without saying so, and saves past
 * that used to vanish from "All Saves" and from folders.
 */
const READ_PAGE = 1000;
async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await page(from, from + READ_PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data ?? []).length < READ_PAGE) return out;
  }
}

async function hydrateSaved(uidValue: string): Promise<PersistedState> {
  // Every read's error counts (2026-11-19, review M-18): a failed read used to come back as an empty "All Saves".
  const [folderRows, items] = await Promise.all([
    readAllRows<{ id: string; name: string; created_at: string }>((a, b) =>
      supabase.from("saved_folders").select("id, name, created_at").eq("buyer_id", uidValue)
        .order("created_at", { ascending: true }).order("id").range(a, b)),
    readAllRows<{ product_id: string; created_at: string }>((a, b) =>
      supabase.from("saved_items").select("product_id, created_at").eq("buyer_id", uidValue)
        .order("created_at", { ascending: false }).order("product_id").range(a, b)),
  ]);
  // A folder's items, by the account's own folder ids (a "my data" read filters on the owner, never RLS alone).
  const fis: { folder_id: string; product_id: string; created_at: string }[] = [];
  const folderIds = folderRows.map((f) => f.id);
  for (const ids of chunks(folderIds, 100)) {
    fis.push(...await readAllRows<{ folder_id: string; product_id: string; created_at: string }>((a, b) =>
      supabase.from("saved_folder_items").select("folder_id, product_id, created_at").in("folder_id", ids)
        .order("created_at", { ascending: false }).order("product_id").range(a, b)));
  }
  const savedAtById = new Map(items.map((i) => [i.product_id, i.created_at]));
  const allIds = Array.from(new Set([...items.map((i) => i.product_id), ...fis.map((f) => f.product_id)]));

  const cards = await fetchProductCardsByIds(allIds);
  const products: Record<string, SavedProduct> = {};
  for (const id of allIds) {
    const c = cards[id];
    if (!c) continue;
    const created = savedAtById.get(id);
    products[id] = {
      id: c.id, vendorId: c.vendorId, name: c.name, manufacturer: c.manufacturer, location: c.location,
      price: c.price, priceValue: c.priceValue, moq: c.moq, views: c.views ?? null, enquiries: c.enquiries,
      rating: c.rating, fabric: c.fabric, gsm: c.gsm, fitType: c.fitType, image: c.image, secondaryImage: c.secondaryImage,
      gender: (c.gender.toLowerCase() as Gender), category: c.categoryName ?? undefined,
      reviews: 0, timeAgo: created ? relTimeAgo(created) : "Just now",
      verified: c.verified ?? false, savedAt: created ? new Date(created).getTime() : Date.now(),
    };
  }

  const folders: Folder[] = [
    { id: ALL_SAVES_ID, name: "All Saves", productIds: items.map((i) => i.product_id).filter((id) => products[id]) },
  ];
  for (const fr of folderRows ?? []) {
    const pids = fis.filter((f) => f.folder_id === fr.id).map((f) => f.product_id).filter((id) => products[id]);
    folders.push({ id: fr.id, name: fr.name, productIds: pids });
  }
  return { folders, products };
}

/**
 * Whether the saves on screen are the account's (2026-11-19, review M-18/M-20): "local" signed out, "loading" while
 * the account's are read, "ready", or "error" (Retry with retrySaved()). Unknown is never "nothing saved".
 */
export type SavedSync = "local" | "loading" | "ready" | "error";
let sync: SavedSync = "local";
function setSync(next: SavedSync) {
  sync = next;
  listeners.forEach((l) => l());
}

async function load(forUser: string) {
  setSync("loading");
  try {
    const persisted = await hydrateSaved(forUser);
    // Guard against a race where the user changed again mid-fetch.
    if (userId !== forUser) return;
    commit({ ...persisted, pending: null }, false);
    setSync("ready");
  } catch {
    if (userId === forUser) setSync("error");
  }
}

/** Called by StoreSync when auth changes: hydrate from DB or revert to local. */
export async function setSavedUser(nextUserId: string | null) {
  if (nextUserId === userId) return;
  userId = nextUserId;
  if (!nextUserId) {
    commit({ ...loadPersisted(), pending: null }, false);
    setSync("local");
    return;
  }
  // Nothing of the previous account (or the signed-out list) shows while this one's are read.
  commit({ ...EMPTY_STATE, pending: null }, false);
  await load(nextUserId);
  await mergeGuestSaves(nextUserId);
}

/**
 * What was saved while signed out joins the account at sign-in (review L-32: it stayed in the browser, out of the
 * account's saves): the listings into All Saves, and each folder into the account's folder of the same name (made
 * when there is none) with its listings. A listing that's gone (or refused) is skipped. The browser's copy is cleared
 * once every folder is on the account, so nothing reaches another account that signs in on the same device; a folder
 * that couldn't be made keeps the copy for the next sign-in or Retry (code review of batch 2).
 */
async function mergeGuestSaves(forUser: string) {
  if (userId !== forUser || sync !== "ready") return;
  const guest = loadPersisted();
  const clearGuest = () => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } };
  const upsertEach = async <R,>(rows: R[], write: (rows: R[]) => PromiseLike<{ error: unknown }>) => {
    let added = 0;
    for (const group of chunks(rows, 100)) {
      const { error } = await write(group);
      if (!error) { added += group.length; continue; }
      // One bad id (a listing deleted since) refuses the whole group: try them one by one.
      for (const row of group) {
        const { error: one } = await write([row]);
        if (!one) added += 1;
      }
    }
    return added;
  };

  const ids = Object.keys(guest.products).filter((id) => isUuid(id) && !state.products[id]);
  let added = await upsertEach(ids.map((product_id) => ({ buyer_id: forUser, product_id })), (rows) =>
    supabase.from("saved_items").upsert(rows, { onConflict: "buyer_id,product_id", ignoreDuplicates: true }));

  let folderFailed = false;
  const accountFolders = new Map(
    state.folders.filter((f) => f.id !== ALL_SAVES_ID).map((f) => [f.name.trim().toLowerCase(), f.id] as const),
  );
  for (const folder of guest.folders) {
    if (userId !== forUser) return;
    const productIds = folder.productIds.filter(isUuid);
    if (folder.id === ALL_SAVES_ID || !productIds.length || !folder.name.trim()) continue;
    let folderId = accountFolders.get(folder.name.trim().toLowerCase());
    if (!folderId) {
      folderId = newFolderId();
      const { error } = await supabase.from("saved_folders").insert({ id: folderId, buyer_id: forUser, name: folder.name.trim() });
      if (error) { folderFailed = true; continue; }
      accountFolders.set(folder.name.trim().toLowerCase(), folderId);
      added += 1;
    }
    added += await upsertEach(productIds.map((product_id) => ({ folder_id: folderId as string, product_id })), (rows) =>
      supabase.from("saved_folder_items").upsert(rows, { onConflict: "folder_id,product_id", ignoreDuplicates: true }));
  }
  if (userId !== forUser) return;
  if (!folderFailed) clearGuest();
  if (added) await load(forUser);
}

/** Read the account's saves again after a failed read, then add what was saved signed out. */
export function retrySaved() {
  const forUser = userId;
  if (forUser) void load(forUser).then(() => mergeGuestSaves(forUser));
}

// Every write waits for the database; a refusal is undone on screen and said (2026-11-19, review M-19: they were
// fire-and-forget, so a refused save stayed on screen and was gone on the next visit). Only real product UUIDs can be
// persisted (FK to products); synthetic ids stay local-only.
async function mirror(
  op: () => PromiseLike<{ error: unknown }>,
  undo: () => void,
  failure: string,
): Promise<boolean> {
  const forUser = userId;
  const { error } = await op();
  if (!error) return true;
  // Signed out (or into another account) meanwhile: the list on screen isn't the one this write was for.
  if (userId !== forUser) return false;
  undo();
  toast.error(failure, { description: "Please try again." });
  return false;
}

/** Resolves once a folder made with createFolder() is saved (true), or refused (false). */
export function folderSaved(folderId: string): Promise<boolean> {
  return folderWrites.get(folderId) ?? Promise.resolve(true);
}

/** Take a product back out of folders it was put in (a refused save). */
function withdraw(productId: string, folderIds: string[], dropProduct: boolean) {
  const products = { ...state.products };
  if (dropProduct) delete products[productId];
  const from = new Set(folderIds);
  commit({
    ...state,
    products,
    folders: state.folders.map((f) => (from.has(f.id) ? { ...f, productIds: f.productIds.filter((p) => p !== productId) } : f)),
  });
}

// A folder made in this tab is written before anything is put in it (2026-10-19): the folder and its first product
// used to be sent at the same moment, the product could land first and be refused (no such folder yet), and the
// error was ignored, so the folder came back empty on the next visit. Each new folder's write is kept here; adding to
// it waits for it, and a failure is said.
const folderWrites = new Map<string, Promise<boolean>>();

async function dbAddToFolder(folderId: string, productId: string): Promise<boolean> {
  if (!userId || folderId === ALL_SAVES_ID || !isUuid(productId) || !isUuid(folderId)) return true;
  const ok = await (folderWrites.get(folderId) ?? Promise.resolve(true));
  if (!ok) return false;
  return mirror(
    () => supabase.from("saved_folder_items").upsert({ folder_id: folderId, product_id: productId }, { onConflict: "folder_id,product_id" }),
    () => withdraw(productId, [folderId], false),
    "Couldn't save to the folder",
  );
}

// ── Modal control ──
// Accepts any product-ish object (the various feed cards have slightly different
// shapes) and normalizes it to a full SavedProduct, so wishlisting works identically from every card on every page.
// A field the card didn't carry stays empty: it was filled with "Cotton", "Regular" and "Manufacturer", which the
// listing never said (review L-30).
export function openSaveModal(product: Partial<SavedProduct> & { id: string }) {
  const priceValue =
    product.priceValue ??
    (typeof product.price === "string" ? parseInt(product.price.replace(/[^\d]/g, ""), 10) || 0 : 0);
  const normalized: SavedProduct = {
    id: product.id,
    vendorId: product.vendorId ?? `v-${product.id}`,
    name: product.name ?? "Product",
    manufacturer: product.manufacturer ?? "",
    location: product.location ?? "",
    price: product.price ?? "",
    priceValue,
    moq: product.moq ?? "",
    views: product.views ?? null,
    enquiries: product.enquiries ?? "",
    rating: product.rating ?? 0,
    fabric: product.fabric ?? "",
    gsm: product.gsm ?? "",
    fitType: product.fitType ?? "",
    image: product.image ?? "",
    secondaryImage: product.secondaryImage ?? product.image ?? "",
    gender: product.gender ?? "unisex",
    category: product.category,
    locationId: product.locationId,
    reviews: product.reviews ?? 0,
    timeAgo: product.timeAgo ?? "Just now",
    verified: product.verified ?? false,
    savedAt: Date.now(),
  };
  commit({ ...state, pending: normalized }, false);
}
export function closeSaveModal() {
  commit({ ...state, pending: null }, false);
}

// ── Mutations ──
export function saveToFolders(product: SavedProduct, folderIds: string[]) {
  const wasSaved = Boolean(state.products[product.id]);
  const products = { ...state.products, [product.id]: { ...product, savedAt: Date.now() } };
  const targets = new Set<string>([ALL_SAVES_ID, ...folderIds]);
  const added = state.folders.filter((f) => targets.has(f.id) && !f.productIds.includes(product.id)).map((f) => f.id);
  const folders = state.folders.map((f) =>
    targets.has(f.id) && !f.productIds.includes(product.id)
      ? { ...f, productIds: [product.id, ...f.productIds] }
      : f
  );
  commit({ ...state, products, folders, pending: null });
  if (!userId || !isUuid(product.id)) return;
  const forUser = userId;
  void (async () => {
    const saved = await mirror(
      () => supabase.from("saved_items").upsert({ buyer_id: forUser, product_id: product.id }, { onConflict: "buyer_id,product_id" }),
      () => withdraw(product.id, added, !wasSaved),
      "Couldn't save this product",
    );
    if (saved) for (const fid of folderIds) await dbAddToFolder(fid, product.id);
  })();
}

export function createFolder(name: string): string {
  const id = userId ? newFolderId() : uid();
  const folderName = name.trim() || "New Folder";
  const folder: Folder = { id, name: folderName, productIds: [] };
  commit({ ...state, folders: [...state.folders, folder] });
  if (userId && isUuid(id)) {
    const forUser = userId;
    const write = (async () => {
      const { error } = await supabase.from("saved_folders").insert({ id, buyer_id: forUser, name: folderName });
      if (!error) return true;
      // Not saved: take it back off the screen rather than show a folder that won't be there next time.
      commit({ ...state, folders: state.folders.filter((f) => f.id !== id) });
      toast.error(`Couldn't create "${folderName}"`, { description: "Please try again." });
      return false;
    })();
    folderWrites.set(id, write);
  }
  return id;
}

export function renameFolder(id: string, name: string): Promise<boolean> {
  if (id === ALL_SAVES_ID) return Promise.resolve(false);
  const trimmed = name.trim();
  const before = state.folders.find((f) => f.id === id)?.name;
  commit({ ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: trimmed || f.name } : f)) });
  if (userId && isUuid(id) && trimmed && before !== undefined) {
    return mirror(
      () => supabase.from("saved_folders").update({ name: trimmed }).eq("id", id),
      () => commit({ ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: before } : f)) }),
      "Couldn't rename the folder",
    );
  }
  return Promise.resolve(Boolean(trimmed));
}

export function deleteFolder(id: string): Promise<boolean> {
  if (id === ALL_SAVES_ID) return Promise.resolve(false); // All Saves is permanent
  const at = state.folders.findIndex((f) => f.id === id);
  if (at < 0) return Promise.resolve(false);
  const folder = state.folders[at];
  commit({ ...state, folders: state.folders.filter((f) => f.id !== id) });
  if (userId && isUuid(id)) {
    return mirror(
      () => supabase.from("saved_folders").delete().eq("id", id),
      () => {
        const folders = [...state.folders];
        folders.splice(Math.min(at, folders.length), 0, folder);
        commit({ ...state, folders });
      },
      `Couldn't delete "${folder.name}"`,
    );
  }
  return Promise.resolve(true);
}

// Remove a product from one folder. Removing from All Saves unsaves it everywhere.
export function removeFromFolder(folderId: string, productId: string): Promise<boolean> {
  if (folderId === ALL_SAVES_ID) return unsaveProduct(productId);
  commit({
    ...state,
    folders: state.folders.map((f) => (f.id === folderId ? { ...f, productIds: f.productIds.filter((p) => p !== productId) } : f)),
  });
  if (userId && isUuid(folderId) && isUuid(productId)) {
    return mirror(
      () => supabase.from("saved_folder_items").delete().eq("folder_id", folderId).eq("product_id", productId),
      () => commit({
        ...state,
        folders: state.folders.map((f) => (f.id === folderId && !f.productIds.includes(productId) ? { ...f, productIds: [productId, ...f.productIds] } : f)),
      }),
      "Couldn't remove it from the folder",
    );
  }
  return Promise.resolve(true);
}

// Fully remove a product from every folder + the product map.
export function unsaveProduct(productId: string): Promise<boolean> {
  const product = state.products[productId];
  const memberOf = state.folders.filter((f) => f.productIds.includes(productId)).map((f) => f.id);
  const products = { ...state.products };
  delete products[productId];
  commit({
    ...state,
    products,
    folders: state.folders.map((f) => ({ ...f, productIds: f.productIds.filter((p) => p !== productId) })),
  });
  if (userId && isUuid(productId) && product) {
    const forUser = userId;
    // `inFolders` false: the folder rows were already deleted, so it comes back to All Saves only.
    const restore = (inFolders: boolean) => {
      const back = new Set(inFolders ? memberOf : [ALL_SAVES_ID]);
      commit({
        ...state,
        products: { ...state.products, [productId]: product },
        folders: state.folders.map((f) => (back.has(f.id) && !f.productIds.includes(productId) ? { ...f, productIds: [productId, ...f.productIds] } : f)),
      });
    };
    return (async () => {
      // Folder rows first: a save left in a folder with no saved_items row would be invisible but still there.
      const ok = await mirror(
        () => supabase.from("saved_folder_items").delete().eq("product_id", productId),
        () => restore(true),
        "Couldn't remove this save",
      );
      if (!ok) return false;
      return mirror(
        () => supabase.from("saved_items").delete().eq("buyer_id", forUser).eq("product_id", productId),
        () => restore(false),
        "Couldn't remove this save",
      );
    })();
  }
  return Promise.resolve(true);
}

export function isSaved(productId: string): boolean {
  return Boolean(state.products[productId]);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function useSaved(): SavedState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSavedSync(): SavedSync {
  return useSyncExternalStore(subscribe, () => sync, () => sync);
}

// Convenience selectors
export function folderProducts(s: SavedState, folderId: string): SavedProduct[] {
  const folder = s.folders.find((f) => f.id === folderId);
  if (!folder) return [];
  return folder.productIds.map((id) => s.products[id]).filter(Boolean);
}
export function folderCover(s: SavedState, folder: Folder): string | null {
  const first = folder.productIds.map((id) => s.products[id]).find(Boolean);
  return first ? first.image : null;
}
