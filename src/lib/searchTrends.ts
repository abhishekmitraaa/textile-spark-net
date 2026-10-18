// ─────────────────────────────────────────────────────────────
// Trending searches on /search (2026-10-18; migration 20261018120000_search_trends.sql).
//
// MEASURED, NOT CURATED. The list is computed every night from the searches buyers make on Cosora
// (admin.search_trends_refresh): yesterday's most searched terms (India time), widened to the week or the
// month when yesterday is thin, and the categories people searched for or clicked into from search. A
// typed term is listed only once at least 3 different visitors searched it. Words only: no counts reach
// the browser, so the page never prints a number it can't stand behind.
//
// This file only reads and checks the shape (it has no dependencies, so the snapshot check script can
// load it). It arrives two ways: in site-config/site.json (lib/siteConfig.ts) when the
// `search_trending` switch is on for everyone, and from trending_searches() for accounts on the
// switch's list (lib/queries/searchTrends.ts).
// ─────────────────────────────────────────────────────────────

export type TrendWindow = "day" | "week" | "month";

export interface SearchTrends {
  /** The switch is on for everyone, so the snapshot carries the list. */
  public: boolean;
  /** The list is shown to whoever asked. */
  shown: boolean;
  window: TrendWindow | null;
  /** The India date the list is for (the window's last day): "YYYY-MM-DD". */
  istDay: string | null;
  terms: string[];
  categories: string[];
}

export const TREND_TERMS_MAX = 10;
export const TREND_CATEGORIES_MAX = 6;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS: readonly string[] = ["day", "week", "month"];

function labels(list: unknown, max: number): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const label = item && typeof item === "object" ? (item as { label?: unknown }).label : undefined;
    if (typeof label !== "string") continue;
    const text = label.trim();
    if (text.length < 2 || text.length > 60 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/** What trending_searches() returns (or the snapshot's copy of it), or null if it isn't that shape. */
export function parseSearchTrends(doc: unknown): SearchTrends | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  if (d.version !== 1 || typeof d.public !== "boolean" || typeof d.shown !== "boolean") return null;
  const window = typeof d.window === "string" && WINDOWS.includes(d.window) ? (d.window as TrendWindow) : null;
  const istDay = typeof d.ist_day === "string" && DAY.test(d.ist_day) ? d.ist_day : null;
  return {
    public: d.public,
    shown: d.shown && window !== null && istDay !== null,
    window,
    istDay,
    terms: labels(d.terms, TREND_TERMS_MAX),
    categories: labels(d.categories, TREND_CATEGORIES_MAX),
  };
}

/** Yesterday's date in India, "YYYY-MM-DD" (India has no daylight saving: UTC+5:30 all year). */
export function istYesterday(now = Date.now()): string {
  return new Date(now + 5.5 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Worth showing now: on for this caller, something in it, and for yesterday. A list for an older day means
 * the nightly job hasn't run yet (00:10 to about 00:11 India time) or has failed; then nothing is shown
 * rather than a list labelled "yesterday" that isn't.
 */
export function isShowable(t: SearchTrends | null, now = Date.now()): t is SearchTrends {
  return Boolean(t && t.shown && t.istDay === istYesterday(now) && (t.terms.length > 0 || t.categories.length > 0));
}
