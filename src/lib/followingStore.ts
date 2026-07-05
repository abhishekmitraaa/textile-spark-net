import { useSyncExternalStore } from "react";
import { img } from "@/lib/listingProducts";

// ─────────────────────────────────────────────────────────────
// Shared "following" state for the buyer Following pages.
//
// Holds ALL known brands (both the ones the user follows and the ones
// suggested under "Looking for New Brands?"). Components derive their lists
// from the `isFollowing` / `isHidden` flags so a Follow / Unfollow / Hide on
// one page (the feed, the View-All manager) instantly reflects on the other.
//
// Backed by localStorage; uses useSyncExternalStore so no provider is needed.
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

const SEED: Brand[] = [
  {
    id: "prezel",
    name: "prezel",
    handle: "THEOT 3F I-26",
    logo: img("brand-prezel", 96, 96),
    location: "Seoul, KR",
    followers: "9,999+",
    items: 661,
    verified: true,
    isFollowing: true,
    isHidden: false,
    topProducts: [
      { name: "Tiered Maxi Dress", price: "$12.40", image: img("prezel-tp1", 300, 380) },
      { name: "Linen Shirt Dress", price: "$9.80", image: img("prezel-tp2", 300, 380) },
    ],
  },
  {
    id: "maison-lyra",
    name: "Maison Lyra",
    handle: "MLYRA 2F A-04",
    logo: img("brand-maisonlyra", 96, 96),
    location: "Bangalore, IN",
    followers: "4,210",
    items: 318,
    verified: true,
    isFollowing: true,
    isHidden: false,
    topProducts: [
      { name: "Cotton Co-ord Set", price: "$14.20", image: img("lyra-tp1", 300, 380) },
      { name: "Poplin Blouse", price: "$8.60", image: img("lyra-tp2", 300, 380) },
    ],
  },
  {
    id: "studio-kintsugi",
    name: "Studio Kintsugi",
    handle: "KINT 1F C-12",
    logo: img("brand-kintsugi", 96, 96),
    location: "Surat, IN",
    followers: "2,884",
    items: 192,
    isFollowing: true,
    isHidden: false,
    topProducts: [
      { name: "Pleated Midi Skirt", price: "$11.10", image: img("kint-tp1", 300, 380) },
      { name: "Boxy Knit Tee", price: "$7.40", image: img("kint-tp2", 300, 380) },
    ],
  },
  {
    id: "atelier-noor",
    name: "Atelier Noor",
    handle: "NOOR 4F B-09",
    logo: img("brand-noor", 96, 96),
    location: "Tiruppur, IN",
    followers: "6,530",
    items: 421,
    verified: true,
    isFollowing: true,
    isHidden: false,
    topProducts: [
      { name: "Wide-Leg Trouser", price: "$15.90", image: img("noor-tp1", 300, 380) },
      { name: "Cropped Cardigan", price: "$10.30", image: img("noor-tp2", 300, 380) },
    ],
  },
  // ── Suggested brands (not yet followed) — shown in "Looking for New Brands?" ──
  {
    id: "lune",
    name: "LUNE",
    handle: "LUNE 5F D-01",
    logo: img("brand-lune", 96, 96),
    location: "Busan, KR",
    followers: "1,267",
    items: 88,
    isAd: true,
    isFollowing: false,
    isHidden: false,
    topProducts: [
      { name: "Mickey Mouse Chuck", price: "$8.36", image: img("lune-tp1", 300, 380) },
      { name: "Snoopy Childrens Pajama", price: "$6.98", image: img("lune-tp2", 300, 380) },
    ],
  },
  {
    id: "okra-mills",
    name: "Okra Mills",
    handle: "OKRA 2F E-07",
    logo: img("brand-okra", 96, 96),
    location: "Ludhiana, IN",
    followers: "942",
    items: 64,
    isFollowing: false,
    isHidden: false,
    topProducts: [
      { name: "Ribbed Tank Top", price: "$5.20", image: img("okra-tp1", 300, 380) },
      { name: "Camp Collar Shirt", price: "$9.10", image: img("okra-tp2", 300, 380) },
    ],
  },
  {
    id: "voya",
    name: "VOYA Studio",
    handle: "VOYA 1F F-22",
    logo: img("brand-voya", 96, 96),
    location: "Jaipur, IN",
    followers: "3,019",
    items: 147,
    verified: true,
    isFollowing: false,
    isHidden: false,
    topProducts: [
      { name: "Block-Print Kurta", price: "$11.80", image: img("voya-tp1", 300, 380) },
      { name: "Gauze Sundress", price: "$13.40", image: img("voya-tp2", 300, 380) },
    ],
  },
];

function load(): Brand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Brand[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return SEED;
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
