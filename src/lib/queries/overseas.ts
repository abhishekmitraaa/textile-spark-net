import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Overseas requirements (subscriptions P7, 2026-10-09).
//
// A requirement from a buyer outside India is visible only to Gold and VIP vendors. VIP
// sees it first, for 24 hours, when a VIP vendor lists in its category; otherwise Gold
// sees it at once. The database applies the rule to every read (the rfqs policy, the
// ranked feed, the quote guard and lead alerts); the app only labels what comes back.
//
// Every other vendor is told how many there are, from overseas_lead_count(), which
// returns numbers and nothing about any requirement.
// ─────────────────────────────────────────────────────────────

export type OverseasTier = "vip" | "gold" | "none";

export interface OverseasLeadCount {
  /** The overseas_leads switch lists this vendor (or is on for everyone). */
  available: boolean;
  tier: OverseasTier;
  /** Posted this month (IST), open or not. */
  thisMonth: number;
  /** Open now. */
  open: number;
}

async function fetchOverseasLeadCount(): Promise<OverseasLeadCount | null> {
  const { data, error } = await supabase.rpc("overseas_lead_count");
  if (error) {
    // Before the P7 migration the function doesn't exist: there is nothing to tell.
    if (error.code === "PGRST202") return null;
    throw error;
  }
  const r = (data ?? {}) as { available?: boolean; tier?: string; this_month?: number; open?: number };
  const tier: OverseasTier = r.tier === "vip" || r.tier === "gold" ? r.tier : "none";
  return { available: Boolean(r.available), tier, thisMonth: Number(r.this_month ?? 0), open: Number(r.open ?? 0) };
}

export function useOverseasLeadCount(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["overseas_lead_count", vendorId],
    queryFn: fetchOverseasLeadCount,
    enabled: Boolean(vendorId),
    staleTime: 5 * 60 * 1000,
  });
}

/** The time now, refreshed every `everyMs` while the component is mounted (for countdowns). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}

/** "5 h 12 min", "12 min", "under a minute": how long until `iso`, or null once it has passed. */
export function timeUntil(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (!(ms > 0)) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "under a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
