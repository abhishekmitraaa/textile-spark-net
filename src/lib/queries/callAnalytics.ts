import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { inWindow, inPriorWindow } from "@/lib/queries/vendorAnalytics";

// ─────────────────────────────────────────────────────────────
// Vendor-side call analytics.
//
// `calls` is the ONE existing real CTA-click event table in this codebase:
// useCallVendor's placeCall flow inserts a row on every Call Now tap. Until now
// nothing read it for analytics — `useCalls()` in queries/calls.ts is the
// buyer's own history list, scoped `buyer_id = auth.uid()`. This module is the
// vendor-side reader, scoped `vendor_id = <me>`.
//
// WHAT THIS TABLE DOES NOT HAVE, verified against the live schema:
// the columns are exactly (id, buyer_id, vendor_id, direction, product_context,
// created_at). There is no status, no duration, no answered/missed flag. A row
// records that the dialer was OPENED, not that a call connected — a `tel:` URL
// is all a web app can do. So:
//
//   • "Missed calls" is NOT COMPUTABLE and must never be rendered as a number.
//     `MISSED_CALLS_UNAVAILABLE` is the reason string every surface shows
//     instead.
//   • `direction` is 'outgoing' on every row that exists, because the insert
//     policy is `buyer_id = auth.uid()` — only the buyer can log, and from the
//     buyer's point of view every call is outgoing. From the VENDOR's point of
//     view that same row is an inbound call. The grouping below therefore maps
//     direction → vendor perspective rather than printing the raw value, and
//     still handles 'incoming' rows correctly if the RLS policy is ever widened
//     so useCallBuyer can log too (see queries/calls.ts).
// ─────────────────────────────────────────────────────────────

export const MISSED_CALLS_UNAVAILABLE =
  "Not tracked — a call row records the dialer opening, not whether the call connected.";

export interface VendorCall {
  id: string;
  buyerId: string;
  /** Vendor's perspective: a buyer-placed call is inbound to the vendor. */
  inbound: boolean;
  productContext: string | null;
  createdAt: string;
}

export interface CallContextBucket {
  context: string;
  count: number;
}

export interface CallAnalytics {
  calls: VendorCall[];
  /** Calls in the selected window, vendor's perspective. */
  inbound: number;
  outbound: number;
  total: number;
  /** Same window, one period earlier — the trend denominator. */
  priorTotal: number;
  /** Percentage change vs the prior window. null when the prior window is empty. */
  trendPct: number | null;
  /** Calls today, for the "N today" subtext on the Advertise stats strip. */
  today: number;
  /** Top product contexts in the window, busiest first. */
  byContext: CallContextBucket[];
}

async function fetchVendorCalls(vendorId: string): Promise<VendorCall[]> {
  const { data, error } = await supabase
    .from("calls")
    .select("id, buyer_id, direction, product_context, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as {
    id: string; buyer_id: string; direction: string; product_context: string | null; created_at: string;
  }[]).map((c) => ({
    id: c.id,
    buyerId: c.buyer_id,
    // 'outgoing' is the buyer dialling out = inbound to this vendor.
    inbound: (c.direction ?? "outgoing") === "outgoing",
    productContext: c.product_context,
    createdAt: c.created_at,
  }));
}

export function useVendorCalls(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_calls", vendorId],
    queryFn: () => fetchVendorCalls(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

/** Pure: slice a fetched call list to a window and summarise it. */
export function callAnalyticsForWindow(calls: VendorCall[] | undefined, days: number): CallAnalytics {
  const all = calls ?? [];
  const win = all.filter((c) => inWindow(c.createdAt, days));
  const prior = all.filter((c) => inPriorWindow(c.createdAt, days));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const contexts = new Map<string, number>();
  for (const c of win) {
    const key = c.productContext?.trim() || "General enquiry";
    contexts.set(key, (contexts.get(key) ?? 0) + 1);
  }

  const total = win.length;
  const priorTotal = prior.length;

  return {
    calls: win,
    inbound: win.filter((c) => c.inbound).length,
    outbound: win.filter((c) => !c.inbound).length,
    total,
    priorTotal,
    trendPct: priorTotal > 0 ? Math.round(((total - priorTotal) / priorTotal) * 100) : null,
    today: all.filter((c) => new Date(c.createdAt).getTime() >= startOfToday.getTime()).length,
    byContext: Array.from(contexts, ([context, count]) => ({ context, count })).sort((a, b) => b.count - a.count),
  };
}
