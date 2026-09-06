import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fetchCatalogueByIds, type CatalogueRow } from "./products";

// ─────────────────────────────────────────────────────────────
// Server-side product search.
//
// Replaces two client-side approximations at once: the substring filter in
// SearchResults (which shipped the entire live table to the browser to run
// `.includes()` over it) and the fabricated autocomplete dictionaries in
// Search.tsx. Ranking now happens in one place — `match_products` — where
// keyword relevance, semantic similarity and paid search boost are fused
// together instead of fighting each other across two layers.
// ─────────────────────────────────────────────────────────────

/** Debounce a fast-changing value (search input) before it reaches a query. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Autocomplete ──

export type SuggestionKind = "category" | "product" | "vendor";

export interface SearchSuggestion {
  kind: SuggestionKind;
  label: string;
  refId: string;
  /** Real count: live listings for a category, enquiries for a product,
   *  followers for a vendor. Never an invented search volume. */
  countHint: number;
  verified: boolean | null;
}

interface RawSuggestion {
  kind: SuggestionKind;
  label: string;
  ref_id: string;
  count_hint: number | null;
  verified: boolean | null;
}

async function fetchSuggestions(query: string, perKind: number): Promise<SearchSuggestion[]> {
  const { data, error } = await supabase.rpc("search_suggestions", { q: query, max_results: perKind });
  if (error) throw error;
  return ((data ?? []) as RawSuggestion[]).map((r) => ({
    kind: r.kind,
    label: r.label,
    refId: r.ref_id,
    countHint: r.count_hint ?? 0,
    verified: r.verified,
  }));
}

/**
 * Autocomplete for the search box. Keyword-only and deliberately so: this fires
 * per keystroke, and an embedding round-trip per character would be both slow
 * and a needless cost. Semantic matching happens on the submitted search.
 */
export function useSearchSuggestions(query: string, perKind = 5) {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", "suggestions", q, perKind],
    enabled: q.length >= 2,
    queryFn: () => fetchSuggestions(q, perKind),
    staleTime: 60_000,
  });
}

// ── Results ──

/** Generous enough that the client can compute facet counts over a real result
 *  set rather than a single page, without shipping the whole catalogue. */
export const SEARCH_MATCH_COUNT = 200;

interface RawSearchRow {
  id: string;
  score: number;
  fts_rank: number | null;
  vec_rank: number | null;
  boost_tier: number;
  embedding_used: boolean;
}

export interface SearchResult {
  rows: CatalogueRow[];
  /** False when the query had no cached embedding and this was keyword-only —
   *  surfaced so the UI can be honest about degraded results. */
  embeddingUsed: boolean;
}

async function runSearch(query: string, matchCount: number): Promise<RawSearchRow[]> {
  const { data, error } = await supabase.rpc("search_products", { query, match_count: matchCount });
  if (error) throw error;
  return (data ?? []) as RawSearchRow[];
}

async function fetchSearch(query: string, matchCount: number): Promise<SearchResult> {
  let ranked = await runSearch(query, matchCount);
  let embeddingUsed = ranked[0]?.embedding_used ?? false;

  // Cold query: no cached vector, so the above was keyword-only. Warm the cache
  // and run once more. This costs an OpenAI call the FIRST time a term is ever
  // searched and nothing on every search after it, by anyone.
  //
  // Known wrinkle: `embedding_used` rides on the rows, so a query returning zero
  // rows can't report it and will re-warm each time. That resolves itself once
  // the backfill lands — vector search returns nearest neighbours regardless of
  // threshold, so a populated index effectively always returns rows.
  if (!embeddingUsed) {
    try {
      const { data: warm } = await supabase.functions.invoke("embed-query", { body: { query } });
      if (warm?.ok) {
        ranked = await runSearch(query, matchCount);
        embeddingUsed = ranked[0]?.embedding_used ?? false;
      }
    } catch {
      // Embedding unavailable (no key, no billing, OpenAI down). Keyword-only
      // results are a legitimate answer, not an error state.
    }
  }

  // `.in("id", ...)` returns rows in storage order, not ranked order, so the
  // server's fused ranking has to be reapplied after hydration.
  const position = new Map(ranked.map((r, i) => [r.id, i]));
  const rows = await fetchCatalogueByIds(ranked.map((r) => r.id));
  rows.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  return { rows, embeddingUsed };
}

export function useProductSearch(query: string, matchCount = SEARCH_MATCH_COUNT) {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", "results", q, matchCount],
    enabled: q.length > 0,
    queryFn: () => fetchSearch(q, matchCount),
  });
}
