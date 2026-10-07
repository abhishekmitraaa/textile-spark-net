// ─────────────────────────────────────────────────────────────
// Fulfilling a plan order, and recording what Razorpay tells us (subscriptions P1,
// 2026-10-08).
//
// public.subscription_fulfil(order, payment, source) does the whole fulfilment in one
// database transaction: it claims the order's intent, confirms its discount code,
// activates the plan, and issues the invoice. verify-payment, the webhook and the
// reconciler all call it, so none of them keeps its own copy of the invoice code, and
// a refusal after money was taken opens a billing incident (securityflags S-8).
//
// No Deno APIs, so Node can load it (scripts/discount-flow-check.mjs).
// ─────────────────────────────────────────────────────────────

export type FulfilSource = "verify" | "webhook" | "free" | "demo" | "reconcile";
export type PaymentMode = "live" | "test" | "demo" | "free";

export interface FulfilResult {
  ok: boolean;
  already?: boolean;
  /** unknown_order, discount_unconfirmed, not_free, activation_failed, or unavailable (the call itself failed). */
  reason?: string;
  detail?: string;
  plan_id?: string;
  invoice_id?: string;
  invoice_number?: string;
  document_type?: string;
  incident_id?: string;
}

async function rpc<T>(url: string, key: string, fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    let data: T | null = null;
    try { data = text ? (JSON.parse(text) as T) : null; } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    return { ok: false, status: 0, data: null, text: String(e) };
  }
}

export async function fulfilOrder(url: string, key: string, orderRef: string, paymentRef: string | null, source: FulfilSource): Promise<FulfilResult> {
  const r = await rpc<FulfilResult>(url, key, "subscription_fulfil", { p_order_ref: orderRef, p_payment_ref: paymentRef, p_source: source });
  if (r.ok && r.data) return r.data;
  // A demo order whose plan couldn't be activated raises, so nothing is kept.
  const raised = (r.data as unknown as { message?: string } | null)?.message ?? r.text;
  if (/activation refused/i.test(raised)) return { ok: false, reason: "activation_failed", detail: raised };
  return { ok: false, reason: "unavailable", detail: raised.slice(0, 300) };
}

/** The mode of a Razorpay key id: test keys start rzp_test_, live keys rzp_live_. */
export function paymentModeForKey(keyId: string): PaymentMode {
  return keyId.startsWith("rzp_test_") ? "test" : "live";
}

// ── Webhook events (admin.payment_events) ──
export async function recordPaymentEvent(url: string, key: string, e: {
  eventId: string; event: string; source: "subscription-webhook" | "billing-reconcile";
  orderRef?: string | null; paymentRef?: string | null; refundRef?: string | null; payloadSha256?: string | null;
}): Promise<{ duplicate: boolean; outcome?: string | null }> {
  const r = await rpc<{ duplicate: boolean; outcome?: string | null }>(url, key, "payment_event_record", {
    p_event_id: e.eventId, p_event: e.event, p_source: e.source, p_order_ref: e.orderRef ?? null,
    p_payment_ref: e.paymentRef ?? null, p_refund_ref: e.refundRef ?? null, p_payload_sha256: e.payloadSha256 ?? null,
  });
  // If the record can't be written, treat the event as new: fulfilment is idempotent anyway.
  return r.ok && r.data ? r.data : { duplicate: false };
}

export async function finishPaymentEvent(url: string, key: string, eventId: string, outcome: string, detail: unknown): Promise<void> {
  await rpc(url, key, "payment_event_finish", { p_event_id: eventId, p_outcome: outcome, p_detail: detail ?? null });
}

export async function refundEvent(url: string, key: string, paymentRef: string, refundRef: string, status: "processed" | "failed", amountPaise: number | null) {
  const r = await rpc<{ matched: boolean; invoice_id?: string }>(url, key, "subscription_refund_event", {
    p_payment_ref: paymentRef, p_refund_ref: refundRef, p_status: status, p_amount_paise: amountPaise,
  });
  return r.data ?? { matched: false };
}

export async function disputeEvent(url: string, key: string, paymentRef: string, event: string, detail: unknown) {
  const r = await rpc<string>(url, key, "billing_dispute_event", { p_payment_ref: paymentRef, p_event: event, p_detail: detail ?? {} });
  return r.data;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
