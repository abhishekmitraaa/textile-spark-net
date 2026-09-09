import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Where a vendor's buyer interest comes from.
//
// Reads the `vendor_buyer_geography` RPC and nothing else. The vendor has no
// read access to `buyer_profiles` and must not gain any: the function does the
// join server-side under SECURITY DEFINER and returns tallies only, so there is
// deliberately no client-side query here to "enrich" the result with.
//
// The RPC returns NULL for a caller who is neither the vendor nor an admin.
// That is a refusal, not an empty result, and is surfaced as `denied` rather
// than being flattened into the empty state — the two mean different things and
// this project keeps such states distinct (see claude.md).
// ─────────────────────────────────────────────────────────────

/** A named place, only ever returned when >= `minViewers` distinct viewers back it. */
export interface GeoCityBucket {
  city: string;
  state: string | null;
  events: number;
  viewers: number;
}

export interface GeoStateBucket {
  state: string;
  events: number;
  viewers: number;
}

export interface BuyerGeography {
  hasData: boolean;
  windowDays: number;
  /** k-anonymity threshold the server applied. Rendered, not assumed. */
  minViewers: number;
  cities: GeoCityBucket[];
  states: GeoStateBucket[];
  /** Places suppressed by the threshold, aggregated so totals still reconcile. */
  other: { events: number; viewers: number; places: number };
  /** Qualifying events whose viewer has no stored location (or was signed out). */
  unknownEvents: number;
  homeLocation: { city: string | null; state: string | null } | null;
  coverage: { totalEvents: number; eventsWithLocation: number };
  /** True when the RPC refused the caller. Never conflated with "no data". */
  denied: boolean;
}

interface RawGeo {
  has_data: boolean;
  window_days: number;
  min_viewers: number;
  cities: GeoCityBucket[] | null;
  states: GeoStateBucket[] | null;
  other: { events: number; viewers: number; places: number } | null;
  unknown_events: number;
  home_location: { city: string | null; state: string | null } | null;
  coverage: { total_events: number; events_with_location: number } | null;
}

const DENIED: BuyerGeography = {
  hasData: false, windowDays: 0, minViewers: 3, cities: [], states: [],
  other: { events: 0, viewers: 0, places: 0 }, unknownEvents: 0,
  homeLocation: null, coverage: { totalEvents: 0, eventsWithLocation: 0 },
  denied: true,
};

async function fetchBuyerGeography(vendorId: string, days: number): Promise<BuyerGeography> {
  const { data, error } = await supabase.rpc("vendor_buyer_geography", { v: vendorId, p_days: days });
  if (error) throw error;
  if (!data) return DENIED;

  const raw = data as unknown as RawGeo;
  return {
    hasData: Boolean(raw.has_data),
    windowDays: raw.window_days ?? days,
    minViewers: raw.min_viewers ?? 3,
    cities: raw.cities ?? [],
    states: raw.states ?? [],
    other: raw.other ?? { events: 0, viewers: 0, places: 0 },
    unknownEvents: raw.unknown_events ?? 0,
    homeLocation: raw.home_location ?? null,
    coverage: {
      totalEvents: raw.coverage?.total_events ?? 0,
      eventsWithLocation: raw.coverage?.events_with_location ?? 0,
    },
    denied: false,
  };
}

export function useBuyerGeography(vendorId: string | undefined, days: number) {
  return useQuery({
    queryKey: ["vendor_buyer_geography", vendorId, days],
    queryFn: () => fetchBuyerGeography(vendorId as string, days),
    enabled: Boolean(vendorId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * "Based on N of M recent visits with a known location."
 *
 * Always rendered, never suppressed when coverage is high — a vendor reading a
 * map needs to know it is built on 3 of 40 visits, and a line that only appears
 * when the news is bad teaches them to ignore it when it does appear.
 */
export function coverageSentence(g: BuyerGeography | undefined): string | null {
  if (!g || g.denied || g.coverage.totalEvents === 0) return null;
  const { eventsWithLocation: n, totalEvents: m } = g.coverage;
  return `Based on ${n} of ${m} recent visit${m === 1 ? "" : "s"} with a known location.`;
}

/** Percentage of qualifying visits that carried a location, 0-100. */
export function coveragePct(g: BuyerGeography | undefined): number | null {
  if (!g || g.denied || g.coverage.totalEvents === 0) return null;
  return Math.round((g.coverage.eventsWithLocation / g.coverage.totalEvents) * 100);
}
