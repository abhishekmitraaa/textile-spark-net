// ─────────────────────────────────────────────────────────────
// Razorpay's Plans, Subscriptions and Invoices APIs, as autopay uses them (subscriptions
// P3, 2026-10-08). The order and refund calls in the older payment functions are unchanged
// and stay where they are.
//
// As Razorpay documents them (checked 2026-10-08):
//   * A plan (POST /v1/plans) is a period, an interval and an item amount. It can't be edited.
//   * A subscription (POST /v1/subscriptions) with a future start_at and an `addons` upfront
//     amount charges that amount in the authorisation payment (captured, not refunded) and
//     the plan amount from start_at on. With a future start_at and no addon the
//     authorisation payment is a small token amount, refunded.
//   * POST /v1/subscriptions/{id}/cancel cancels at once; cancel_at_cycle_end isn't allowed
//     before the first charge, and a plan's period here never depends on it.
//   * A subscription's payments are found through its invoices
//     (GET /v1/invoices?subscription_id=…).
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET; RAZORPAY_API_URL (optional, default
// https://api.razorpay.com; only a local or staging mock changes it).
// ─────────────────────────────────────────────────────────────

export interface RazorpayKeys {
  keyId: string;
  keySecret: string;
}

export function razorpayKeys(): RazorpayKeys | null {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  return keyId && keySecret ? { keyId, keySecret } : null;
}

export interface RazorpayAnswer<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Razorpay's own description of a refusal, or why it couldn't be reached. */
  error?: string;
}

async function call<T>(keys: RazorpayKeys, method: "GET" | "POST", path: string, body?: unknown): Promise<RazorpayAnswer<T>> {
  const base = Deno.env.get("RAZORPAY_API_URL") || "https://api.razorpay.com";
  try {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => null);
    if (r.ok) return { ok: true, status: r.status, data: data as T };
    const description = (data as { error?: { description?: string } } | null)?.error?.description;
    return { ok: false, status: r.status, data: null, error: description || `Razorpay answered ${r.status}.` };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: `Razorpay couldn't be reached: ${String(e).slice(0, 120)}` };
  }
}

export function createPlan(keys: RazorpayKeys, p: { cycle: "monthly" | "yearly"; name: string; amountPaise: number; description: string }) {
  return call<{ id: string }>(keys, "POST", "/v1/plans", {
    period: p.cycle, interval: 1,
    item: { name: p.name, amount: p.amountPaise, currency: "INR", description: p.description },
  });
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  charge_at?: number | null;
  start_at?: number | null;
  payment_method?: string | null;
}

export function createSubscription(keys: RazorpayKeys, s: {
  planId: string;
  totalCount: number;
  /** Unix seconds; must be in the future. */
  startAt: number;
  /** Unix seconds: an authorisation not made by then expires the subscription (an abandoned checkout). */
  expireBy: number;
  /** The first period's charge, taken in the authorisation payment. */
  upfront?: { name: string; amountPaise: number } | null;
  notes: Record<string, string>;
}) {
  return call<RazorpaySubscription>(keys, "POST", "/v1/subscriptions", {
    plan_id: s.planId, total_count: s.totalCount, quantity: 1, start_at: s.startAt, expire_by: s.expireBy, customer_notify: true,
    ...(s.upfront ? { addons: [{ item: { name: s.upfront.name, amount: s.upfront.amountPaise, currency: "INR" } }] } : {}),
    notes: s.notes,
  });
}

export function cancelSubscription(keys: RazorpayKeys, subscriptionId: string) {
  return call<RazorpaySubscription>(keys, "POST", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: false });
}

export function fetchSubscription(keys: RazorpayKeys, subscriptionId: string) {
  return call<RazorpaySubscription>(keys, "GET", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** The payments made against a one-off order (the reconciler asks). */
export function orderPayments(keys: RazorpayKeys, orderId: string) {
  return call<{ items?: Array<{ id: string; status: string; amount: number }> }>(keys, "GET", `/v1/orders/${encodeURIComponent(orderId)}/payments`);
}

/** The first paid payment on a subscription, if Razorpay has invoiced one. */
export async function firstSubscriptionPayment(keys: RazorpayKeys, subscriptionId: string): Promise<string | null> {
  const r = await call<{ items?: Array<{ payment_id?: string | null; status?: string; created_at?: number }> }>(
    keys, "GET", `/v1/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`);
  const paid = (r.data?.items ?? []).filter((i) => i.status === "paid" && i.payment_id);
  paid.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
  return paid[0]?.payment_id ?? null;
}
