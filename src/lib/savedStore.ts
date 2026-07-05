import { useSyncExternalStore } from "react";
import { img, makeListingProduct, type Gender, type ListingProduct } from "@/lib/listingProducts";
import { supabase } from "@/lib/supabase";
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

// ── Seed data ──
function seedProduct(
  id: string,
  name: string,
  manufacturer: string,
  location: string,
  priceValue: number,
  moq: string,
  rating: number,
  reviews: number,
  timeAgo: string,
  verified: boolean,
  seed: string
): SavedProduct {
  return {
    ...makeListingProduct(id, {
      name,
      manufacturer,
      vendorId: `v-${id}`,
      location,
      price: `₹${priceValue}`,
      priceValue,
      moq,
      rating,
      image: img(seed),
      secondaryImage: img(`${seed}-b`),
    }),
    reviews,
    timeAgo,
    verified,
    savedAt: Date.now(),
  };
}

const SEED_PRODUCTS: SavedProduct[] = [
  seedProduct("sp1", "Premium Cotton Polo T-Shirt", "Tirupur Textiles", "Tirupur, Tamil Nadu", 320, "MOQ: 100 pieces", 4.8, 156, "2 hours ago", true, "save-polo"),
  seedProduct("sp2", "Women's Casual Kurta Set", "Delhi Fashion Hub", "Delhi NCR", 850, "MOQ: 50 sets", 4.6, 89, "5 hours ago", true, "save-kurta"),
  seedProduct("sp3", "Kids Cotton Shorts", "Gujarat Garments", "Ahmedabad, Gujarat", 180, "MOQ: 200 pieces", 4.3, 45, "Yesterday", false, "save-shorts"),
  seedProduct("sp4", "Raw Denim Jeans - Indigo", "Ahmedabad Denim Co.", "Ahmedabad, Gujarat", 890, "MOQ: 250 pieces", 4.5, 74, "Yesterday", true, "save-denim"),
  seedProduct("sp5", "Linen Casual Shirt - Sky Blue", "Mumbai Linen House", "Mumbai, Maharashtra", 520, "MOQ: 200 pieces", 4.4, 61, "2 days ago", true, "save-linen"),
  seedProduct("sp6", "Ribbed Tank Top", "Bangalore Knits", "Bangalore, IND", 499, "MOQ: 2", 4.1, 132, "3 days ago", false, "save-tank"),
  seedProduct("sp7", "Camp Collar Shirt", "SilkThread Mills", "Bangalore, IND", 499, "MOQ: 2", 3.8, 54, "3 days ago", true, "save-camp"),
  seedProduct("sp8", "Pleated Midi Skirt", "Studio Kintsugi", "Surat, IND", 640, "MOQ: 50 pieces", 4.2, 38, "4 days ago", false, "save-skirt"),
  seedProduct("sp9", "Organic Cotton Fabric", "Verde Textiles", "Tirupur, Tamil Nadu", 180, "MOQ: 500 m", 4.9, 210, "5 days ago", true, "save-fabric"),
  seedProduct("sp10", "Wide-Leg Trouser", "Atelier Noor", "Tirupur, IND", 720, "MOQ: 60 pieces", 4.0, 47, "1 week ago", true, "save-trouser"),
  seedProduct("sp11", "Formal Blazer - Navy", "Corporate Threads", "Delhi NCR", 1450, "MOQ: 30 pieces", 4.5, 66, "1 week ago", true, "save-blazer"),
  seedProduct("sp12", "Two-Piece Formal Suit", "Corporate Threads", "Delhi NCR", 2200, "MOQ: 25 sets", 4.6, 52, "2 weeks ago", true, "save-suit"),
];

const SEED_STATE: PersistedState = {
  products: Object.fromEntries(SEED_PRODUCTS.map((p) => [p.id, p])),
  folders: [
    { id: ALL_SAVES_ID, name: "All Saves", productIds: SEED_PRODUCTS.map((p) => p.id) },
    { id: "summer", name: "Summer Collection", productIds: ["sp1", "sp5", "sp6", "sp8", "sp9"] },
    { id: "denim", name: "Denim Picks", productIds: ["sp4"] },
    { id: "sustainable", name: "Sustainable Fabrics", productIds: ["sp9"] },
    { id: "casual", name: "Casual Wear", productIds: ["sp3", "sp6", "sp7", "sp5"] },
    { id: "formal", name: "Formal Attire", productIds: ["sp11", "sp12", "sp2"] },
  ],
};

const STORAGE_KEY = "cosora.saved.v1";

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.folders && parsed.products) return parsed;
    }
  } catch {
    /* ignore */
  }
  return SEED_STATE;
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
// instantly and mirror to the DB fire-and-forget; on sign-in we hydrate real
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

async function hydrateSaved(uidValue: string): Promise<PersistedState> {
  const [{ data: folderRows }, { data: itemRows }, { data: fiRows }] = await Promise.all([
    supabase.from("saved_folders").select("id, name, created_at").eq("buyer_id", uidValue).order("created_at", { ascending: true }),
    supabase.from("saved_items").select("product_id, created_at").eq("buyer_id", uidValue).order("created_at", { ascending: false }),
    // RLS scopes saved_folder_items to the caller's own folders.
    supabase.from("saved_folder_items").select("folder_id, product_id, created_at").order("created_at", { ascending: false }),
  ]);
  const items = itemRows ?? [];
  const fis = fiRows ?? [];
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
      price: c.price, priceValue: c.priceValue, moq: c.moq, soldCount: c.soldCount, enquiries: c.enquiries,
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

/** Called by StoreSync when auth changes: hydrate from DB or revert to local. */
export async function setSavedUser(nextUserId: string | null) {
  if (nextUserId === userId) return;
  userId = nextUserId;
  if (!nextUserId) {
    commit({ ...loadPersisted(), pending: null }, false);
    return;
  }
  try {
    const persisted = await hydrateSaved(nextUserId);
    // Guard against a race where the user changed again mid-fetch.
    if (userId === nextUserId) commit({ ...persisted, pending: null }, false);
  } catch {
    /* keep current state on failure */
  }
}

// Fire-and-forget DB writers (RLS enforces ownership). Only real product UUIDs
// can be persisted (FK to products); synthetic/demo ids stay local-only.
function dbSaveItem(productId: string) {
  if (!userId || !isUuid(productId)) return;
  void supabase.from("saved_items").upsert({ buyer_id: userId, product_id: productId }, { onConflict: "buyer_id,product_id" }).then(() => {});
}
function dbAddToFolder(folderId: string, productId: string) {
  if (!userId || folderId === ALL_SAVES_ID || !isUuid(productId) || !isUuid(folderId)) return;
  void supabase.from("saved_folder_items").upsert({ folder_id: folderId, product_id: productId }, { onConflict: "folder_id,product_id" }).then(() => {});
}

// ── Modal control ──
// Accepts any product-ish object (the various feed cards have slightly different
// shapes) and normalizes it to a full SavedProduct with sensible defaults, so
// wishlisting works identically from every card on every page.
export function openSaveModal(product: Partial<SavedProduct> & { id: string }) {
  const priceValue =
    product.priceValue ??
    (typeof product.price === "string" ? parseInt(product.price.replace(/[^\d]/g, ""), 10) || 0 : 0);
  const normalized: SavedProduct = {
    id: product.id,
    vendorId: product.vendorId ?? `v-${product.id}`,
    name: product.name ?? "Product",
    manufacturer: product.manufacturer ?? "Manufacturer",
    location: product.location ?? "",
    price: product.price ?? "",
    priceValue,
    moq: product.moq ?? "",
    soldCount: product.soldCount ?? "",
    enquiries: product.enquiries ?? "",
    rating: product.rating ?? 0,
    fabric: product.fabric ?? "Cotton",
    gsm: product.gsm ?? "",
    fitType: product.fitType ?? "Regular",
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
  const products = { ...state.products, [product.id]: { ...product, savedAt: Date.now() } };
  const targets = new Set<string>([ALL_SAVES_ID, ...folderIds]);
  const folders = state.folders.map((f) =>
    targets.has(f.id) && !f.productIds.includes(product.id)
      ? { ...f, productIds: [product.id, ...f.productIds] }
      : f
  );
  commit({ ...state, products, folders, pending: null });
  dbSaveItem(product.id);
  for (const fid of folderIds) dbAddToFolder(fid, product.id);
}

export function createFolder(name: string, withProductId?: string): string {
  const id = userId ? newFolderId() : uid();
  const folderName = name.trim() || "New Folder";
  const folder: Folder = { id, name: folderName, productIds: withProductId ? [withProductId] : [] };
  commit({ ...state, folders: [...state.folders, folder] });
  if (userId && isUuid(id)) {
    void supabase.from("saved_folders").insert({ id, buyer_id: userId, name: folderName }).then(() => {});
    if (withProductId) { dbSaveItem(withProductId); dbAddToFolder(id, withProductId); }
  }
  return id;
}

export function renameFolder(id: string, name: string) {
  if (id === ALL_SAVES_ID) return;
  const trimmed = name.trim();
  commit({ ...state, folders: state.folders.map((f) => (f.id === id ? { ...f, name: trimmed || f.name } : f)) });
  if (userId && isUuid(id) && trimmed) void supabase.from("saved_folders").update({ name: trimmed }).eq("id", id).then(() => {});
}

export function deleteFolder(id: string) {
  if (id === ALL_SAVES_ID) return; // All Saves is permanent
  commit({ ...state, folders: state.folders.filter((f) => f.id !== id) });
  if (userId && isUuid(id)) void supabase.from("saved_folders").delete().eq("id", id).then(() => {});
}

// Remove a product from one folder. Removing from All Saves unsaves it everywhere.
export function removeFromFolder(folderId: string, productId: string) {
  if (folderId === ALL_SAVES_ID) {
    unsaveProduct(productId);
    return;
  }
  commit({
    ...state,
    folders: state.folders.map((f) => (f.id === folderId ? { ...f, productIds: f.productIds.filter((p) => p !== productId) } : f)),
  });
  if (userId && isUuid(folderId) && isUuid(productId)) {
    void supabase.from("saved_folder_items").delete().eq("folder_id", folderId).eq("product_id", productId).then(() => {});
  }
}

// Fully remove a product from every folder + the product map.
export function unsaveProduct(productId: string) {
  const products = { ...state.products };
  delete products[productId];
  commit({
    ...state,
    products,
    folders: state.folders.map((f) => ({ ...f, productIds: f.productIds.filter((p) => p !== productId) })),
  });
  if (userId && isUuid(productId)) {
    void supabase.from("saved_items").delete().eq("buyer_id", userId).eq("product_id", productId).then(() => {});
    void supabase.from("saved_folder_items").delete().eq("product_id", productId).then(() => {});
  }
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
