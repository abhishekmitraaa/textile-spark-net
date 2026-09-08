import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Vendor analytics — the real computations behind the Analytics page.
//
// Everything here is derived from rows the vendor can actually read under RLS
// (`quotes`, `rfqs`, `conversations`, `messages`, `product_reviews`, `calls`).
// Nothing in this file invents a number: where a figure is not computable from
// the current schema the hook returns null and the surface says so.
//
// TWO KINDS OF METRIC, and the difference is load-bearing for the time filter:
//
//   • Windowed   — backed by a real per-row timestamp (quotes.created_at,
//                  messages.created_at, reviews.created_at, calls.created_at),
//                  so a 7/30/90/365-day filter genuinely re-scopes it.
//   • Lifetime   — backed by a monotonic counter with no event history
//                  (products.views_count, products.enquiries_count,
//                  advertisements.impressions/clicks). `increment_product_view`
//                  takes only `{ p: uuid }` — no timestamp, no viewer — so a
//                  window is impossible until engagement_events exists.
//
// Surfaces MUST label which kind a card is (see METRIC_SCOPE_NOTE) rather than
// letting a filter click silently do nothing.
// ─────────────────────────────────────────────────────────────

export type TimeWindowLabel = "7 days" | "30 days" | "90 days" | "1 year";

export const TIME_WINDOWS: TimeWindowLabel[] = ["7 days", "30 days", "90 days", "1 year"];

export const WINDOW_DAYS: Record<TimeWindowLabel, number> = {
  "7 days": 7,
  "30 days": 30,
  "90 days": 90,
  "1 year": 365,
};

/** Why a card ignores the time filter. Rendered verbatim next to lifetime cards. */
export const METRIC_SCOPE_NOTE =
  "Lifetime total — this counter stores no per-event timestamp, so it cannot be scoped to a date range yet.";

export function windowStart(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Inclusive-of-now, exclusive-of-older: [now - days, now]. */
export function inWindow(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() >= windowStart(days).getTime();
}

/** The window immediately before the current one — used for trend comparisons. */
export function inPriorWindow(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= windowStart(days * 2).getTime() && t < windowStart(days).getTime();
}

// ── Currency ─────────────────────────────────────────────────────────────
// Indian short scale, matching what the Quotes page has always displayed
// ("₹24.5L"). Crore above 1,00,00,000; lakh above 1,00,000; thousands below.
export function formatInrCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "₹0";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(n >= 10_00_00_000 ? 0 : 1).replace(/\.0$/, "")}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(n >= 10_00_000 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ─────────────────────────────────────────────────────────────
// Total Order Value — the retention metric (see CLAUDE.md).
//
// An accepted quote IS a won order here: `quotes` has no separate order table,
// and `quotes.status = 'accepted'` is the buyer's commitment. Value is the
// vendor's quoted per-unit price times the quantity the buyer asked for on the
// RFQ, which is the only quantity either side ever agreed on.
//
// A quote whose RFQ carries no quantity contributes ZERO rather than a guess,
// and is counted in `unpriced` so the surface can say the figure is partial
// instead of quietly understating the vendor's book.
// ─────────────────────────────────────────────────────────────

export interface WonOrder {
  quoteId: string;
  rfqId: string;
  /** Rupees. 0 when the RFQ carried no quantity. */
  value: number;
  quantity: number | null;
  pricePerUnit: number;
  createdAt: string;
}

export interface VendorOrderValue {
  orders: WonOrder[];
  /** Lifetime total order value in rupees. */
  total: number;
  /** Accepted quotes we could not price (RFQ had no quantity). */
  unpriced: number;
}

async function fetchVendorOrderValue(vendorId: string): Promise<VendorOrderValue> {
  const { data: quoteRows, error } = await supabase
    .from("quotes")
    .select("id, rfq_id, price_per_unit, price_inr, created_at")
    .eq("vendor_id", vendorId)
    .eq("status", "accepted");
  if (error) throw error;

  const rows = (quoteRows ?? []) as {
    id: string; rfq_id: string; price_per_unit: number | null; price_inr: number | null; created_at: string;
  }[];
  if (rows.length === 0) return { orders: [], total: 0, unpriced: 0 };

  const rfqIds = Array.from(new Set(rows.map((q) => q.rfq_id)));
  const qtyOf = new Map<string, number | null>();
  if (rfqIds.length) {
    const { data: rfqRows } = await supabase.from("rfqs").select("id, quantity").in("id", rfqIds);
    for (const r of (rfqRows ?? []) as { id: string; quantity: number | null }[]) qtyOf.set(r.id, r.quantity);
  }

  let unpriced = 0;
  const orders: WonOrder[] = rows.map((q) => {
    const quantity = qtyOf.get(q.rfq_id) ?? null;
    const pricePerUnit = Number(q.price_per_unit ?? q.price_inr ?? 0);
    if (quantity == null || quantity <= 0) unpriced += 1;
    return {
      quoteId: q.id,
      rfqId: q.rfq_id,
      quantity,
      pricePerUnit,
      value: quantity != null && quantity > 0 ? pricePerUnit * quantity : 0,
      createdAt: q.created_at,
    };
  });

  return { orders, total: orders.reduce((s, o) => s + o.value, 0), unpriced };
}

/**
 * Real Total Order Value. Shared deliberately: the Quotes page's metrics rail
 * and the Analytics card read this same hook, so the two surfaces can never
 * print different figures for the same vendor.
 */
export function useVendorOrderValue(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_order_value", vendorId],
    queryFn: () => fetchVendorOrderValue(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

/** Total order value won inside the last `days` days. */
export function orderValueSince(data: VendorOrderValue | undefined, days: number): number {
  return (data?.orders ?? []).filter((o) => inWindow(o.createdAt, days)).reduce((s, o) => s + o.value, 0);
}

// ─────────────────────────────────────────────────────────────
// Communication responsiveness.
//
// `messages` has (conversation_id, sender_id, created_at) and nothing else —
// no response-time column, no read receipt. That is enough: per conversation,
// the buyer's FIRST message and the vendor's FIRST reply after it give one real
// first-reply delay, which is the figure Etsy/Amazon actually report to sellers.
//
// The headline is a threshold percentage, not a bare average, because one
// week-old unanswered thread would drag an average into meaninglessness while
// the vendor's other twenty replies went out in minutes.
//
// A thread the buyer opened MORE than 24h ago with no reply at all counts as a
// miss, not as missing data — dropping it would quietly reward ignoring buyers.
// A thread opened inside the last 24h with no reply yet is still in flight and
// is excluded from the percentage (but does show in `awaitingReply`).
// ─────────────────────────────────────────────────────────────

export interface ThreadResponse {
  conversationId: string;
  /** The other party in the thread — the buyer. */
  buyerId: string;
  firstBuyerMessageAt: string;
  /** null when the vendor has never replied after the buyer's first message. */
  firstReplyAt: string | null;
  /** Hours between the buyer's first message and the vendor's first reply. */
  delayHours: number | null;
  /** True when the buyer is still waiting on this thread right now. */
  awaiting: boolean;
}

export interface VendorResponsiveness {
  threads: ThreadResponse[];
  /** Threads where the buyer's last message has no vendor reply after it. */
  awaitingReply: number;
  /** Threads that count toward the 24h percentage (answered, or overdue). */
  measured: number;
  /** Answered inside 24 hours, as a share of `measured`. null when measured = 0. */
  within24hPct: number | null;
  /** Mean first-reply delay in hours across answered threads. null when none. */
  avgHours: number | null;
  /** Median first-reply delay in hours across answered threads. null when none. */
  medianHours: number | null;
}

const EMPTY_RESPONSIVENESS: VendorResponsiveness = {
  threads: [], awaitingReply: 0, measured: 0, within24hPct: null, avgHours: null, medianHours: null,
};

async function fetchVendorResponsiveness(vendorId: string): Promise<VendorResponsiveness> {
  const { data: convRows, error } = await supabase
    .from("conversations")
    .select("id, user_a, user_b")
    .or(`user_a.eq.${vendorId},user_b.eq.${vendorId}`);
  if (error) throw error;
  const convs = (convRows ?? []) as { id: string; user_a: string; user_b: string }[];
  if (convs.length === 0) return EMPTY_RESPONSIVENESS;

  // One round trip for every message across the vendor's threads, ordered
  // oldest-first so the first buyer message and first reply fall out of a
  // single pass. RLS already restricts `messages` to the vendor's own threads;
  // the explicit `in` keeps the query honest rather than relying on the policy.
  const { data: msgRows, error: msgErr } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, created_at")
    .in("conversation_id", convs.map((c) => c.id))
    .order("created_at", { ascending: true });
  if (msgErr) throw msgErr;
  const msgs = (msgRows ?? []) as { conversation_id: string; sender_id: string; created_at: string }[];

  const byConv = new Map<string, typeof msgs>();
  for (const m of msgs) {
    const list = byConv.get(m.conversation_id);
    if (list) list.push(m);
    else byConv.set(m.conversation_id, [m]);
  }

  const now = Date.now();
  const threads: ThreadResponse[] = [];

  for (const c of convs) {
    const list = byConv.get(c.id) ?? [];
    if (list.length === 0) continue; // a thread nobody has written in yet
    const buyerId = c.user_a === vendorId ? c.user_b : c.user_a;

    const firstBuyer = list.find((m) => m.sender_id !== vendorId);
    if (!firstBuyer) continue; // vendor-initiated thread; no buyer wait to measure

    const firstReply = list.find(
      (m) => m.sender_id === vendorId && new Date(m.created_at).getTime() > new Date(firstBuyer.created_at).getTime(),
    );

    // "Awaiting" is about the thread's tail, not its head: the buyer is waiting
    // whenever the newest message in the thread is theirs.
    const last = list[list.length - 1];
    const awaiting = last.sender_id !== vendorId;

    threads.push({
      conversationId: c.id,
      buyerId,
      firstBuyerMessageAt: firstBuyer.created_at,
      firstReplyAt: firstReply?.created_at ?? null,
      delayHours: firstReply
        ? (new Date(firstReply.created_at).getTime() - new Date(firstBuyer.created_at).getTime()) / 3_600_000
        : null,
      awaiting,
    });
  }

  const answered = threads.filter((t) => t.delayHours != null);
  const overdue = threads.filter(
    (t) => t.delayHours == null && now - new Date(t.firstBuyerMessageAt).getTime() > 24 * 3_600_000,
  );
  const measured = answered.length + overdue.length;
  const within24h = answered.filter((t) => (t.delayHours as number) <= 24).length;

  const delays = answered.map((t) => t.delayHours as number).sort((a, b) => a - b);
  const median = delays.length
    ? delays.length % 2
      ? delays[(delays.length - 1) / 2]
      : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2
    : null;

  return {
    threads,
    awaitingReply: threads.filter((t) => t.awaiting).length,
    measured,
    within24hPct: measured ? Math.round((within24h / measured) * 100) : null,
    avgHours: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    medianHours: median,
  };
}

/**
 * One query behind BOTH the average-response-time panel (Phase 1.7) and the
 * responsiveness action list (Phase 2.2) — they render different things from
 * the same rows rather than each hitting `messages` separately.
 */
export function useVendorResponsiveness(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_responsiveness", vendorId],
    queryFn: () => fetchVendorResponsiveness(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

/** "1.5 days" / "4h" / "35m" — a delay in hours, rendered for a vendor. */
export function formatDelay(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)}h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1).replace(/\.0$/, "") : Math.round(days)} days`;
}

// ─────────────────────────────────────────────────────────────
// Lead → order funnel (Phase 2.1).
//
// Stage 1 is deliberately "requirements you could quote on", not "inquiries":
// `products.enquiries_count` is a lifetime counter with no timestamps, so it
// cannot open a windowed funnel, and an RFQ pool the vendor can actually see is
// the real top of this funnel. Directed RFQs (rfqs.vendor_id = me) are counted
// separately because they are a materially stronger lead than an open one.
// ─────────────────────────────────────────────────────────────

export interface LeadFunnel {
  /** RFQs created in-window that this vendor could quote on. */
  leads: number;
  /** Of those, RFQs addressed to this vendor specifically. */
  directLeads: number;
  quotesSent: number;
  quotesAccepted: number;
}

async function fetchLeadFunnel(vendorId: string): Promise<{
  rfqs: { id: string; vendorId: string | null; createdAt: string }[];
  quotes: { id: string; status: string; createdAt: string }[];
}> {
  const [{ data: rfqRows, error: rfqErr }, { data: quoteRows, error: qErr }] = await Promise.all([
    // RLS: open RFQs are readable by any vendor; directed RFQs only by their
    // target. Both are legitimately "leads this vendor could act on".
    supabase.from("rfqs").select("id, vendor_id, created_at"),
    supabase.from("quotes").select("id, status, created_at").eq("vendor_id", vendorId),
  ]);
  if (rfqErr) throw rfqErr;
  if (qErr) throw qErr;
  return {
    rfqs: ((rfqRows ?? []) as { id: string; vendor_id: string | null; created_at: string }[]).map((r) => ({
      id: r.id, vendorId: r.vendor_id, createdAt: r.created_at,
    })),
    quotes: ((quoteRows ?? []) as { id: string; status: string; created_at: string }[]).map((q) => ({
      id: q.id, status: q.status, createdAt: q.created_at,
    })),
  };
}

export function useLeadFunnelData(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_lead_funnel", vendorId],
    queryFn: () => fetchLeadFunnel(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export function funnelForWindow(
  data: { rfqs: { vendorId: string | null; createdAt: string }[]; quotes: { status: string; createdAt: string }[] } | undefined,
  days: number,
): LeadFunnel {
  const rfqs = (data?.rfqs ?? []).filter((r) => inWindow(r.createdAt, days));
  const quotes = (data?.quotes ?? []).filter((q) => inWindow(q.createdAt, days));
  return {
    leads: rfqs.length,
    directLeads: rfqs.filter((r) => r.vendorId != null).length,
    quotesSent: quotes.length,
    quotesAccepted: quotes.filter((q) => q.status === "accepted").length,
  };
}

// ─────────────────────────────────────────────────────────────
// Repeat buyers (Phase 2.4).
//
// A grouped count over touchpoints this vendor owns — calls placed to them,
// threads they are in, and RFQs addressed to them. A buyer with more than one
// touchpoint is a repeat buyer. Deliberately NOT a CRM: no per-buyer record is
// built or stored, only the tally.
// ─────────────────────────────────────────────────────────────

export interface RepeatBuyers {
  totalBuyers: number;
  repeatBuyers: number;
  /** Share of engaged buyers who came back, 0-100. null when no buyers yet. */
  repeatPct: number | null;
}

async function fetchRepeatBuyers(vendorId: string): Promise<RepeatBuyers> {
  const [{ data: callRows }, { data: convRows }, { data: rfqRows }] = await Promise.all([
    supabase.from("calls").select("buyer_id, created_at").eq("vendor_id", vendorId),
    supabase.from("conversations").select("user_a, user_b").or(`user_a.eq.${vendorId},user_b.eq.${vendorId}`),
    supabase.from("rfqs").select("buyer_id").eq("vendor_id", vendorId),
  ]);

  const touches = new Map<string, number>();
  const bump = (id: string | null | undefined) => {
    if (!id || id === vendorId) return;
    touches.set(id, (touches.get(id) ?? 0) + 1);
  };

  for (const c of (callRows ?? []) as { buyer_id: string }[]) bump(c.buyer_id);
  for (const c of (convRows ?? []) as { user_a: string; user_b: string }[]) {
    bump(c.user_a === vendorId ? c.user_b : c.user_a);
  }
  for (const r of (rfqRows ?? []) as { buyer_id: string }[]) bump(r.buyer_id);

  const totalBuyers = touches.size;
  const repeatBuyers = Array.from(touches.values()).filter((n) => n > 1).length;
  return {
    totalBuyers,
    repeatBuyers,
    repeatPct: totalBuyers ? Math.round((repeatBuyers / totalBuyers) * 100) : null,
  };
}

export function useRepeatBuyers(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_repeat_buyers", vendorId],
    queryFn: () => fetchRepeatBuyers(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// ─────────────────────────────────────────────────────────────
// Per-product ratings for the vendor's LIVE products (Phases 1.1 + 2.5).
//
// `product_reviews` has no vendor_id, so the vendor scoping is the product id
// list — which is also why this is restricted to live products: a rejected or
// unlisted product has no buyer-reachable review thread to link to.
// ─────────────────────────────────────────────────────────────

export interface ProductRating {
  productId: string;
  name: string;
  avg: number;
  count: number;
}

async function fetchVendorProductRatings(vendorId: string): Promise<ProductRating[]> {
  const { data: prodRows, error } = await supabase
    .from("products")
    .select("id, name")
    .eq("vendor_id", vendorId)
    .eq("status", "live");
  if (error) throw error;
  const products = (prodRows ?? []) as { id: string; name: string }[];
  if (products.length === 0) return [];

  const { data: reviewRows, error: revErr } = await supabase
    .from("product_reviews")
    .select("product_id, rating")
    .in("product_id", products.map((p) => p.id));
  if (revErr) throw revErr;

  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of (reviewRows ?? []) as { product_id: string; rating: number }[]) {
    const cur = agg.get(r.product_id) ?? { sum: 0, n: 0 };
    cur.sum += r.rating;
    cur.n += 1;
    agg.set(r.product_id, cur);
  }

  return products
    .map((p) => {
      const a = agg.get(p.id);
      return a && a.n > 0
        ? { productId: p.id, name: p.name, avg: Number((a.sum / a.n).toFixed(1)), count: a.n }
        : null;
    })
    .filter((x): x is ProductRating => x !== null)
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
}

export function useVendorProductRatings(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_product_ratings", vendorId],
    queryFn: () => fetchVendorProductRatings(vendorId as string),
    enabled: Boolean(vendorId),
  });
}
