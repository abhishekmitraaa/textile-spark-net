import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────
// Buyer "For You" preferences.
//
// Captured during onboarding (product types + sourcing locations) and reused
// by the For You feed, the filter popup, and "Edit Preferences". Backed by
// localStorage; uses useSyncExternalStore so the onboarding flow, the feed,
// and the filter modal all stay in sync without a provider.
// ─────────────────────────────────────────────────────────────

export interface BuyerPreferences {
  categories: string[]; // category ids
  locations: string[]; // location ids ("nopreference" is exclusive)
  hasCompleted: boolean; // onboarding finished (or skipped)
}

const STORAGE_KEY = "cosora.buyerPrefs.v1";
const EMPTY: BuyerPreferences = { categories: [], locations: [], hasCompleted: false };

function load(): BuyerPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BuyerPreferences;
      return {
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        hasCompleted: Boolean(parsed.hasCompleted),
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return EMPTY;
}

let state: BuyerPreferences = load();
const listeners = new Set<() => void>();

function set(next: BuyerPreferences) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; state still lives in memory */
  }
  listeners.forEach((l) => l());
}

export function toggleCategory(id: string) {
  const has = state.categories.includes(id);
  set({ ...state, categories: has ? state.categories.filter((c) => c !== id) : [...state.categories, id] });
}

export function toggleLocation(id: string) {
  if (id === "nopreference") {
    // "No preference" is exclusive: selecting it clears everything else.
    const has = state.locations.includes("nopreference");
    set({ ...state, locations: has ? [] : ["nopreference"] });
    return;
  }
  const without = state.locations.filter((l) => l !== "nopreference");
  const has = without.includes(id);
  set({ ...state, locations: has ? without.filter((l) => l !== id) : [...without, id] });
}

export function removeCategory(id: string) {
  set({ ...state, categories: state.categories.filter((c) => c !== id) });
}

export function removeLocation(id: string) {
  set({ ...state, locations: state.locations.filter((l) => l !== id) });
}

/** Finish onboarding. skip=true completes with no filters (shows everything). */
export function completeOnboarding(skip = false) {
  if (skip) set({ categories: [], locations: [], hasCompleted: true });
  else set({ ...state, hasCompleted: true });
}

/** Clear filters but stay on the feed (the "Reset preferences" action -> show all). */
export function resetFilters() {
  set({ ...state, categories: [], locations: [], hasCompleted: true });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function usePreferences(): BuyerPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
