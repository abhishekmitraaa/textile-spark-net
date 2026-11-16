// Publishing a paid ad order, for razorpay-verify-payment and razorpay-webhook (2026-10-13).
//
// Either path may be the one that publishes: the browser's verify call, or Razorpay's
// webhook when the browser closed first. They used to carry their own copies of this, and
// both marked the order 'paid' in one REST call and inserted its campaigns in another. A
// failure between the two left a paid order with nothing published, which neither path
// would touch again.
//
// Now the order is read first and nothing is written until the campaigns are ready. Then
// public.ad_order_fulfil() marks it paid and inserts every campaign in one transaction
// (migration 20261013100400). Any failure leaves the order 'created', and the answer says
// `retry`, so the caller can ask again and the webhook can answer 5xx for Razorpay to
// re-deliver.
//
// The vendor's plan is still held to before anything is published (./adReach.ts):
//   * nothing can be published on the plan: the order goes to refund review, in the same
//     single write that takes it out of 'created';
//   * the plan could not be read at all: nothing is written, try again. (That used to be
//     treated as "no ads on the plan" and sent a good order to refund review.)
//
// No Deno APIs, so Node can load it.

import { buildAdRows, type AdSpec } from "./adPricing.ts";
import { confirmDiscount } from "./discounts.ts";
import { adReach } from "./adReach.ts";

export interface PublishResult {
  /** False when nothing was published and something is wrong (blocked, or retry). */
  ok: boolean;
  count: number;
  /** Nothing was written; the same call can be made again. */
  retry?: boolean;
  /** The order was not waiting: already paid, flagged, or unknown. */
  already?: boolean;
  blocked?: boolean;
  refundFlagged?: boolean;
  requested?: number;
  allowed?: number;
}

function headers(key: string, prefer?: string): Record<string, string> {
  return {
    apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}

/** Take a waiting order straight to refund review. One write, so it can't stop half-way. */
async function sendToRefundReview(url: string, key: string, orderId: string): Promise<{ done: boolean; taken: boolean; redemption: string | null }> {
  try {
    const r = await fetch(`${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
      method: "PATCH",
      headers: headers(key, "return=representation"),
      body: JSON.stringify({ status: "refund_review", paid_at: new Date().toISOString() }),
    });
    if (!r.ok) return { done: false, taken: false, redemption: null };
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return { done: true, taken: Boolean(row), redemption: row?.discount_redemption_id ?? null };
  } catch {
    return { done: false, taken: false, redemption: null };
  }
}

export async function publishOrder(url: string, key: string, orderId: string): Promise<PublishResult> {
  let order: { vendor_id: string; spec: AdSpec; discount_redemption_id: string | null } | null;
  try {
    const r = await fetch(
      `${url}/rest/v1/ad_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created&select=vendor_id,spec,discount_redemption_id`,
      { headers: headers(key) },
    );
    if (!r.ok) return { ok: false, count: 0, retry: true };
    const rows = await r.json();
    order = Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return { ok: false, count: 0, retry: true };
  }
  if (!order) return { ok: true, count: 0, already: true };

  const decision = await adReach(url, key, order.vendor_id, order.spec);
  if (!decision.ok && decision.reason === "unavailable") {
    return { ok: false, count: 0, retry: true, requested: decision.requested, allowed: 0 };
  }

  const rows = decision.ok
    ? buildAdRows(order.vendor_id, decision.spec).map((r) => ({ ...r, ad_order_id: orderId }))
    : [];

  if (rows.length === 0) {
    // Paid, but nothing can be published: the plan has no ads, or the order has no campaigns.
    const flag = await sendToRefundReview(url, key, orderId);
    if (!flag.done) return { ok: false, count: 0, retry: true, requested: decision.requested, allowed: 0 };
    if (!flag.taken) return { ok: true, count: 0, already: true };
    // Charged the discounted price, so the code's use is the vendor's.
    if (flag.redemption) await confirmDiscount(url, key, flag.redemption, orderId);
    return { ok: false, count: 0, blocked: true, refundFlagged: true, requested: decision.requested, allowed: 0 };
  }

  let done: { claimed?: boolean; count?: number; discount_redemption_id?: string | null };
  try {
    const r = await fetch(`${url}/rest/v1/rpc/ad_order_fulfil`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ p_order_id: orderId, p_rows: rows }),
    });
    if (!r.ok) {
      console.error("ad_order_fulfil failed", orderId, r.status, (await r.text()).slice(0, 300));
      return { ok: false, count: 0, retry: true, requested: decision.requested, allowed: decision.allowed };
    }
    done = await r.json();
  } catch (e) {
    console.error("ad_order_fulfil unreachable", orderId, String(e).slice(0, 200));
    return { ok: false, count: 0, retry: true, requested: decision.requested, allowed: decision.allowed };
  }
  // The other path published it between our read and our write.
  if (!done?.claimed) return { ok: true, count: 0, already: true };

  if (done.discount_redemption_id) await confirmDiscount(url, key, done.discount_redemption_id, orderId);
  // The campaigns land on `pending_review` whatever buildAdRows() asked for:
  // guard_ad_activation redirects them on INSERT. Payment is never approval.
  return { ok: true, count: Number(done.count ?? rows.length), requested: decision.requested, allowed: decision.allowed };
}
