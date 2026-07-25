import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────
// Followed-brand ids for the Search-Results Brand tab.
//
// Kept separate from `followingStore` (the Following-page brand store): those
// are a curated set of real followed/suggested brands with rich records, keyed
// by their own ids; the Search Brand tab surfaces *search-relevant* suppliers
// (`BRAND_RESULTS` in SearchResults) whose ids don't exist there. This is just
// a persistent Set<id> so a Follow on the search surface survives navigation
// and reloads without leaking those brands into the Following page.
//
// Same pattern as the other buyer stores: module-level state +
// useSyncExternalStore + localStorage, no provider needed.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "cosora.brandFollows.v1";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr as string[]);
    }
  } catch {
    /* ignore corrupt / unavailable storage */
  }
  return new Set();
}

// `state` is only ever reassigned to a NEW Set on change, so useSyncExternalStore
// sees a fresh reference when (and only when) something actually changed.
let state: Set<string> = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state]));
  } catch {
    /* storage may be unavailable (private mode); state still lives in memory */
  }
  listeners.forEach((l) => l());
}

export function toggleBrandFollow(id: string) {
  const next = new Set(state);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  state = next;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function useBrandFollows(): Set<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
