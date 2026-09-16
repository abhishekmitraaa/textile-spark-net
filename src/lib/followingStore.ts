import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────
// Shared "following" state for the buyer Following pages, SIGNED OUT ONLY.
//
// Signed in, the real source of truth is the `follows` table, read and written
// by useFollowing() in queries/follows.ts; this store is never consulted. What
// is left here is the signed-out fallback: brands the visitor has interacted
// with in this browser, held in localStorage and exposed through
// useSyncExternalStore so no provider is needed.
//
// There is NO seed. An empty list is an empty list — see the note below.
// ─────────────────────────────────────────────────────────────

export interface BrandTopProduct {
  name: string;
  price: string;
  image: string;
}

export interface Brand {
  id: string;
  name: string;
  handle: string; // e.g. "THEOT 3F I-26"
  logo: string;
  location: string;
  followers: string; // display string, e.g. "9,999+"
  items: number;
  verified?: boolean;
  isFollowing: boolean;
  isHidden: boolean;
  isAd?: boolean;
  topProducts: BrandTopProduct[];
}

const STORAGE_KEY = "cosora.following.v2";

// REMOVED 2026-09-16 (Master Prompt 9): SEED — seven invented brands ("prezel",
// "Maison Lyra", "Studio Kintsugi", "Atelier Noor", "LUNE" selling a "Mickey
// Mouse Chuck" for "$8.36", "Okra Mills", "VOYA Studio"), four of them marked
// isFollowing: true. load() returned them whenever localStorage was empty, and
// useFollowing() falls back to this store whenever the visitor is signed out —
// so every signed-out visitor was shown four brands they had never followed,
// plus three "suggestions" that do not exist, across the Following feed,
// Following → View all, the vendor page's follow chip and the new-brands
// carousel. Their ids ("prezel") are not vendor ids, so every tile linked to a
// /vendor/:id route with no vendor behind it.
//
// Same class of bug as ForYou's ad strip (Master Prompt 7) and Recently Viewed
// (Master Prompt 8), and the worst of the three: load() also treated an EMPTY
// array as missing (`Array.isArray(parsed) && parsed.length`), so a visitor who
// deliberately unfollowed all seven got every one of them back on the next
// load. An intentionally empty list now stays empty.

// Real follows are keyed by `vendor_profiles.id`, a UUID. A row with any other
// shape is a leftover seed brand from before the removal above, and can never
// resolve to a real vendor — dropped on load rather than silently kept.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string) => UUID_RE.test(s);

function load(): Brand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Brand[];
    // No `&& parsed.length` here, deliberately: an empty array is a real,
    // intentional state ("I unfollowed everything"), not a missing value.
    if (!Array.isArray(parsed)) return [];
    const real = parsed.filter((b) => typeof b?.id === "string" && isUuid(b.id));
    if (real.length !== parsed.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(real));
      } catch {
        /* storage unavailable — still filtered in memory */
      }
    }
    return real;
  } catch {
    /* corrupt storage */
    return [];
  }
}

let state: Brand[] = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode); state still lives in memory */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

// These patch a brand ALREADY in the list; they do not insert one. With the
// seed gone a signed-out visitor's list starts empty, so there is nothing for
// them to patch — which is why useFollowing() asks a signed-out visitor to sign
// in rather than calling followBrand() and appearing to do nothing.
function setBrand(id: string, patch: Partial<Brand>) {
  state = state.map((b) => (b.id === id ? { ...b, ...patch } : b));
  emit();
}

export const followBrand = (id: string) => setBrand(id, { isFollowing: true, isHidden: false });
export const unfollowBrand = (id: string) => setBrand(id, { isFollowing: false });
export const hideBrand = (id: string) => setBrand(id, { isHidden: true });

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function useBrands(): Brand[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
