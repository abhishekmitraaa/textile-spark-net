import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { clipOtherInterest, normaliseInterestIds, OTHER_INTEREST_ID, tidyOtherInterest } from "@/lib/buyerCategories";

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
//
// THE SYNC RULE (buyer sign-up audit 2026-11-13, item 2). While signed in, nothing is written until the saved
// interests have been read ("ready"). A failed or slow read used to look like "no interests": For You offered its
// first-run screen, and "Skip for now" saved an empty list over the buyer's real picks. Now a write before "ready"
// is refused without a request, a failed read is "error" (the screen offers Retry), and the Interest Preference
// save waits for the database and reports a refusal instead of logging it.
// ─────────────────────────────────────────────────────────────

export interface BuyerPreferences {
  categories: string[]; // buyer category ids (see src/lib/buyerCategories.ts)
  otherInterest: string; // the buyer's words for "Others"; "" unless "others" is picked
  locations: string[]; // location ids ("nopreference" is exclusive)
  hasCompleted: boolean; // onboarding finished (or skipped)
}

/** local: signed out (localStorage is the truth). loading / ready / error: the signed-in account's read. */
export type PrefsSync = "local" | "loading" | "ready" | "error";

const STORAGE_KEY = "cosora.buyerPrefs.v1";
const EMPTY: BuyerPreferences = { categories: [], otherInterest: "", locations: [], hasCompleted: false };

/** Keeps the words only while "others" is picked, cut to the column's limit. */
function cleanOther(categories: string[], text: unknown): string {
  if (!categories.includes(OTHER_INTEREST_ID) || typeof text !== "string") return "";
  return clipOtherInterest(text);
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
let sync: { status: PrefsSync; userId: string | null } = { status: "local", userId: null };
const listeners = new Set<() => void>();
let userId: string | null = null;

function notify() {
  listeners.forEach((l) => l());
}

function setSync(status: PrefsSync) {
  sync = { status, userId };
  notify();
}

/** True while a signed-in account's saved interests aren't known: every write is refused then. */
function writesBlocked(): boolean {
  return userId !== null && sync.status !== "ready";
}

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
  notify();
}

// Mirror the category preferences to the buyer's account. RLS restricts the
// upsert to the buyer's own row.
//
// One save at a time, each sending the state as it is when its turn comes: two
// saves fired together (For You saving the "Others" words, then a tile tap)
// could otherwise reach the database in either order and leave the older one.
// The returned promise rejects when this save is refused; the chain itself never does.
let saveChain: Promise<void> = Promise.resolve();
function dbSaveCategories(): Promise<void> {
  const uid = userId;
  if (!uid) return Promise.resolve();
  const mine = saveChain.then(async () => {
    if (userId !== uid) return; // signed out or switched account meanwhile
    const other = tidyOtherInterest(state.otherInterest);
    const { error } = await supabase
      .from("buyer_profiles")
      .upsert(
        { id: uid, preferred_categories: state.categories, preferred_interest_other: other || null },
        { onConflict: "id" },
      );
    if (error) throw error;
  });
  saveChain = mine.catch(() => {});
  return mine;
}

/** A background save (a tile tap on For You): a refusal is logged, the screen carries on. */
function saveInBackground() {
  dbSaveCategories().catch((e: { message?: string }) => console.warn("Saving interests failed:", e?.message));
}

async function readAccount(uid: string): Promise<void> {
  setSync("loading");
  const { data, error } = await supabase
    .from("buyer_profiles")
    .select("preferred_categories, preferred_interest_other")
    .eq("id", uid)
    .maybeSingle();
  if (userId !== uid) return; // user changed again mid-fetch
  if (error) {
    // Unknown is not empty: keep what is on screen, write nothing, and let the screen offer Retry.
    setSync("error");
    return;
  }
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
  setSync("ready");
}

/** Called by StoreSync on auth change: hydrate categories from the account (DB)
 *  or revert to the local (signed-out) snapshot. */
export async function setPreferencesUser(nextUserId: string | null) {
  if (nextUserId === userId) return;
  userId = nextUserId;
  if (!nextUserId) {
    // Revert to the local snapshot (categories fall back to the signed-out set).
    set(load());
    setSync("local");
    return;
  }
  try {
    await readAccount(nextUserId);
  } catch {
    if (userId === nextUserId) setSync("error");
  }
}

/** Reads the signed-in account's interests again (the Retry on a failed read). */
export async function retryPreferences(): Promise<void> {
  const uid = userId;
  if (!uid) return;
  try {
    await readAccount(uid);
  } catch {
    if (userId === uid) setSync("error");
  }
}

export function toggleCategory(id: string) {
  if (writesBlocked()) return;
  const has = state.categories.includes(id);
  set({ ...state, categories: has ? state.categories.filter((c) => c !== id) : [...state.categories, id] });
  saveInBackground();
}

/** Bulk-set the category preferences and the "Others" words (the Interest Preference screen's Save). Signed in, it
 *  resolves once the database has them and rejects when it refuses (the screen stays and says so); nothing changes
 *  on screen until then. */
export async function setCategories(ids: string[], otherInterest = ""): Promise<void> {
  if (writesBlocked()) throw new Error("Your saved interests haven't loaded yet. Try again in a moment.");
  const previous = state;
  set({ ...state, categories: Array.from(new Set(ids)), otherInterest, hasCompleted: true });
  try {
    await dbSaveCategories();
  } catch (e) {
    set(previous);
    throw e;
  }
}

/** The "Others" words on their own (For You saves them as the buyer types).
 *  Dropped unless "others" is picked. */
export function setOtherInterest(text: string) {
  if (writesBlocked()) return;
  if (cleanOther(state.categories, text) === state.otherInterest) return;
  set({ ...state, otherInterest: text });
  saveInBackground();
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
  if (writesBlocked()) return;
  set({ ...state, categories: state.categories.filter((c) => c !== id) });
  saveInBackground();
}

export function removeLocation(id: string) {
  set({ ...state, locations: state.locations.filter((l) => l !== id) });
}

/** Finish onboarding. skip=true completes with no filters (shows everything). */
export function completeOnboarding(skip = false) {
  if (writesBlocked()) return;
  if (skip) set({ categories: [], otherInterest: "", locations: [], hasCompleted: true });
  else set({ ...state, hasCompleted: true });
  saveInBackground();
}

/** Clear filters but stay on the feed (the "Reset preferences" action -> show all). */
export function resetFilters() {
  if (writesBlocked()) return;
  set({ ...state, categories: [], locations: [], hasCompleted: true });
  saveInBackground();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}
function getSync() {
  return sync;
}

export function usePreferences(): BuyerPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Whether the preferences on screen are the account's. `forUser` is the signed-in account (useAuth): until the store
 * has been told about it (StoreSync runs after sign-in is known), it counts as "loading", never as "local".
 */
export function usePreferencesSync(forUser: string | null | undefined, authLoading = false): PrefsSync {
  const s = useSyncExternalStore(subscribe, getSync, getSync);
  if (authLoading) return "loading";
  if (!forUser) return "local";
  return s.userId === forUser ? s.status : "loading";
}
