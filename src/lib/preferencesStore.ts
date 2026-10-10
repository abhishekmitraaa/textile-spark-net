import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { normaliseInterestIds, OTHER_INTEREST_ID, OTHER_INTEREST_MAX, tidyOtherInterest } from "@/lib/buyerCategories";

// ─────────────────────────────────────────────────────────────
// Buyer "For You" preferences.
//
// Captured during registration (InterestPreference) + onboarding (product
// types + sourcing locations) and reused by the For You feed, the filter
// popup, "Edit Preferences", and the profile summary. Uses
// useSyncExternalStore so every screen stays in sync without a provider.
//
// The CATEGORY piece is account-tied: when a buyer is signed in it is the
// real `buyer_profiles.preferred_categories` column (so it follows them
// across devices/pages), mirrored to the DB on every change and hydrated on
// sign-in. Signed out, it falls back to localStorage. The "Others" words
// (`buyer_profiles.preferred_interest_other`) travel with the categories and
// exist only while "others" is one of them (the database enforces that too).
// Locations + the onboarding-complete flag stay per-device in localStorage.
// ─────────────────────────────────────────────────────────────

export interface BuyerPreferences {
  categories: string[]; // buyer category ids (see src/lib/buyerCategories.ts)
  otherInterest: string; // the buyer's words for "Others"; "" unless "others" is picked
  locations: string[]; // location ids ("nopreference" is exclusive)
  hasCompleted: boolean; // onboarding finished (or skipped)
}

const STORAGE_KEY = "cosora.buyerPrefs.v1";
const EMPTY: BuyerPreferences = { categories: [], otherInterest: "", locations: [], hasCompleted: false };

/** Keeps the words only while "others" is picked, cut to the column's limit. */
function cleanOther(categories: string[], text: unknown): string {
  if (!categories.includes(OTHER_INTEREST_ID) || typeof text !== "string") return "";
  return text.slice(0, OTHER_INTEREST_MAX);
}

function load(): BuyerPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BuyerPreferences>;
      // Normalised: a snapshot saved before 2026-10-11 holds the old ids.
      const categories = Array.isArray(parsed.categories) ? normaliseInterestIds(parsed.categories) : [];
      return {
        categories,
        otherInterest: cleanOther(categories, parsed.otherInterest),
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
let userId: string | null = null;

function writeLocal() {
  try {
    // Locations + hasCompleted stay per-device always. Categories are only the
    // localStorage source of truth when signed OUT — when signed in the DB owns
    // them, so leave the previously stored (signed-out) categories untouched, to
    // avoid one account's picks leaking into the next signed-out session.
    const stored = load();
    const toSave: BuyerPreferences = {
      categories: userId ? stored.categories : state.categories,
      otherInterest: userId ? stored.otherInterest : state.otherInterest,
      locations: state.locations,
      hasCompleted: state.hasCompleted,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    /* storage may be unavailable; state still lives in memory */
  }
}

function set(next: BuyerPreferences) {
  state = { ...next, otherInterest: cleanOther(next.categories, next.otherInterest) };
  writeLocal();
  listeners.forEach((l) => l());
}

// Fire-and-forget: mirror the category preferences to the buyer's account.
// RLS restricts the upsert to the buyer's own row.
function dbSaveCategories() {
  if (!userId) return;
  const cats = state.categories;
  const other = tidyOtherInterest(state.otherInterest);
  void supabase
    .from("buyer_profiles")
    .upsert(
      { id: userId, preferred_categories: cats, preferred_interest_other: other || null },
      { onConflict: "id" },
    )
    .then(() => {});
}

/** Called by StoreSync on auth change: hydrate categories from the account (DB)
 *  or revert to the local (signed-out) snapshot. */
export async function setPreferencesUser(nextUserId: string | null) {
  if (nextUserId === userId) return;
  userId = nextUserId;
  if (!nextUserId) {
    // Revert to the local snapshot (categories fall back to the signed-out set).
    set(load());
    return;
  }
  try {
    const { data } = await supabase
      .from("buyer_profiles")
      .select("preferred_categories, preferred_interest_other")
      .eq("id", nextUserId)
      .maybeSingle();
    if (userId !== nextUserId) return; // user changed again mid-fetch
    // Normalised: a browser still running the old app can save the old ids.
    const cats = Array.isArray(data?.preferred_categories)
      ? normaliseInterestIds(data!.preferred_categories as string[])
      : [];
    // DB is the source of truth for categories on sign-in; keep local
    // locations, and treat existing saved categories as "already onboarded".
    set({
      categories: cats,
      otherInterest: data?.preferred_interest_other ?? "",
      locations: state.locations,
      hasCompleted: state.hasCompleted || cats.length > 0,
    });
  } catch {
    /* keep current state on failure */
  }
}

export function toggleCategory(id: string) {
  const has = state.categories.includes(id);
  set({ ...state, categories: has ? state.categories.filter((c) => c !== id) : [...state.categories, id] });
  dbSaveCategories();
}

/** Bulk-set the category preferences and the "Others" words (the Interest
 *  Preference screen's Save). */
export function setCategories(ids: string[], otherInterest = "") {
  set({ ...state, categories: Array.from(new Set(ids)), otherInterest, hasCompleted: true });
  dbSaveCategories();
}

/** The "Others" words on their own (For You saves them when the field loses
 *  focus). Dropped unless "others" is picked. */
export function setOtherInterest(text: string) {
  if (text === state.otherInterest) return;
  set({ ...state, otherInterest: text });
  dbSaveCategories();
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
  dbSaveCategories();
}

export function removeLocation(id: string) {
  set({ ...state, locations: state.locations.filter((l) => l !== id) });
}

/** Finish onboarding. skip=true completes with no filters (shows everything). */
export function completeOnboarding(skip = false) {
  if (skip) set({ categories: [], otherInterest: "", locations: [], hasCompleted: true });
  else set({ ...state, hasCompleted: true });
  dbSaveCategories();
}

/** Clear filters but stay on the feed (the "Reset preferences" action -> show all). */
export function resetFilters() {
  set({ ...state, categories: [], locations: [], hasCompleted: true });
  dbSaveCategories();
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
