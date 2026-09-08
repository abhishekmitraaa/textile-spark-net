import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { inWindow } from "@/lib/queries/vendorAnalytics";

// ─────────────────────────────────────────────────────────────
// Real ad performance for the vendor's own campaigns.
//
// MONEY LANGUAGE IS FIXED, and it is not a style preference: Cosora ads are
// flat-rate prepaid placements, not an auction. There is no bid, no second
// price, no per-impression cost, and no attributed order revenue — so CPC, CPM
// and ROAS are all figures this schema cannot support. Every money figure here
// is "revenue booked", matching Cosora-Admin's AdsMonitoring.tsx. Never rename
// these to "cost per lead" or "return on ad spend".
//
// WHERE THE MONEY LIVES, verified against the live schema:
//   • `ad_orders` (order_id, vendor_id, amount, status, spec, paid_at,
//     created_at) is the only row that records a payment. `amount` is in PAISE
//     — razorpay-create-order multiplies by 100 — so every read here divides.
//   • `ad_orders` has NO ad_id. One order publishes one `advertisements` row
//     per item in its spec (see razorpay-verify-payment's adRows()), all sharing
//     the order's placement CSV, starts_at and ends_at. Per-campaign
//     attribution therefore divides an order's amount evenly across its items
//     and matches each item to the campaign that promotes that product and
//     started nearest the payment.
//   • Campaigns published through the DEMO path (publishDemoAds, used when no
//     Razorpay secret is configured) create NO ad_orders row at all. Those
//     campaigns really did book ₹0, and that is what they show. Do not
//     back-fill them from the price table to make the column look populated.
// ─────────────────────────────────────────────────────────────

export const REVENUE_PER_LEAD_LABEL = "revenue booked ÷ leads";

interface RawAdOrder {
  order_id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  spec: unknown;
}

interface SpecItem { productId?: string | null }
interface OrderSpec { items?: SpecItem[] }

export interface AdOrderRow {
  orderId: string;
  /** Rupees. `ad_orders.amount` is stored in paise. */
  amount: number;
  paidAt: string;
  productIds: string[];
}

export interface CampaignRow {
  adId: string;
  title: string;
  productId: string | null;
  placement: string | null;
  status: string;
  impressions: number;
  clicks: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdPerformance {
  orders: AdOrderRow[];
  campaigns: CampaignRow[];
  /** Rupees booked but not matchable to a specific campaign. */
  unattributed: number;
  /** adId → rupees booked. */
  revenueByCampaign: Record<string, number>;
}

async function fetchAdPerformance(vendorId: string): Promise<AdPerformance> {
  const [{ data: orderRows, error: oErr }, { data: adRows, error: aErr }] = await Promise.all([
    supabase.from("ad_orders").select("order_id, amount, status, paid_at, created_at, spec").eq("vendor_id", vendorId),
    supabase
      .from("advertisements")
      .select("id, title, product_id, placement, status, impressions, clicks, starts_at, ends_at")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false }),
  ]);
  if (oErr) throw oErr;
  if (aErr) throw aErr;

  const campaigns: CampaignRow[] = ((adRows ?? []) as {
    id: string; title: string; product_id: string | null; placement: string | null; status: string;
    impressions: number; clicks: number; starts_at: string | null; ends_at: string | null;
  }[]).map((a) => ({
    adId: a.id, title: a.title, productId: a.product_id, placement: a.placement, status: a.status,
    impressions: a.impressions ?? 0, clicks: a.clicks ?? 0, startsAt: a.starts_at, endsAt: a.ends_at,
  }));

  // Only money that actually arrived. 'created' is an unpaid intent and
  // 'refund_review' is money flagged for return — neither is booked revenue.
  const orders: AdOrderRow[] = ((orderRows ?? []) as RawAdOrder[])
    .filter((o) => o.status === "paid")
    .map((o) => {
      const spec = (o.spec ?? {}) as OrderSpec;
      const productIds = (spec.items ?? []).map((i) => i?.productId ?? "").filter(Boolean) as string[];
      return {
        orderId: o.order_id,
        amount: Number(o.amount ?? 0) / 100,
        paidAt: o.paid_at ?? o.created_at,
        productIds,
      };
    });

  // Attribute each order's amount across the campaigns it published. A campaign
  // is claimed at most once so a repeat purchase of the same product lands on
  // the later campaign rather than doubling up on the first.
  const revenueByCampaign: Record<string, number> = {};
  const claimed = new Set<string>();
  let unattributed = 0;

  for (const order of [...orders].sort((a, b) => +new Date(a.paidAt) - +new Date(b.paidAt))) {
    if (order.productIds.length === 0) {
      unattributed += order.amount;
      continue;
    }
    const perItem = order.amount / order.productIds.length;
    const paidAt = new Date(order.paidAt).getTime();
    for (const productId of order.productIds) {
      const match = campaigns
        .filter((c) => c.productId === productId && !claimed.has(c.adId) && c.startsAt)
        .sort((a, b) => Math.abs(+new Date(a.startsAt as string) - paidAt) - Math.abs(+new Date(b.startsAt as string) - paidAt))[0];
      if (match) {
        claimed.add(match.adId);
        revenueByCampaign[match.adId] = (revenueByCampaign[match.adId] ?? 0) + perItem;
      } else {
        unattributed += perItem;
      }
    }
  }

  return { orders, campaigns, unattributed, revenueByCampaign };
}

export function useAdPerformance(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_ad_performance", vendorId],
    queryFn: () => fetchAdPerformance(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

/** Rupees booked inside the last `days` days. */
export function revenueBookedSince(data: AdPerformance | undefined, days: number): number {
  return (data?.orders ?? []).filter((o) => inWindow(o.paidAt, days)).reduce((s, o) => s + o.amount, 0);
}

/** Lifetime clicks/impressions summed across the vendor's campaigns. */
export function adCountersTotal(data: AdPerformance | undefined): { clicks: number; impressions: number } {
  const campaigns = data?.campaigns ?? [];
  return {
    clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
    impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
  };
}

// ── Per-campaign "revenue booked ÷ leads" (Phase 2.8) ─────────────────────
// The same computation as the vendor-wide figure on the Advertise stats strip,
// sliced per campaign instead of summed across all of them. The lead
// denominator is leads that arrived inside THAT campaign's own active window
// (starts_at → ends_at), which is the only window in which the campaign could
// have influenced anything.

export interface CampaignEconomics extends CampaignRow {
  revenueBooked: number;
  leadsInFlight: number;
  /** Rupees booked per lead. null when the campaign generated no leads. */
  revenuePerLead: number | null;
}

export function campaignEconomics(
  perf: AdPerformance | undefined,
  leadDates: string[],
): CampaignEconomics[] {
  const campaigns = perf?.campaigns ?? [];
  return campaigns.map((c) => {
    const start = c.startsAt ? new Date(c.startsAt).getTime() : null;
    const end = c.endsAt ? new Date(c.endsAt).getTime() : Date.now();
    const leadsInFlight = start == null
      ? 0
      : leadDates.filter((d) => {
          const t = new Date(d).getTime();
          return t >= start && t <= end;
        }).length;
    const revenueBooked = perf?.revenueByCampaign[c.adId] ?? 0;
    return {
      ...c,
      revenueBooked,
      leadsInFlight,
      revenuePerLead: leadsInFlight > 0 ? revenueBooked / leadsInFlight : null,
    };
  });
}
