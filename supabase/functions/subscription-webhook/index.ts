// Supabase Edge Function: subscription-webhook  (deploy with verify_jwt = false)
//
// Razorpay's server-to-server events. Authenticated by the HMAC-SHA256 of the RAW body
// with RAZORPAY_WEBHOOK_SECRET (x-razorpay-signature); a JWT gate would refuse every
// callback, so verify_jwt stays off in config.toml.
//
// Subscriptions P1 (2026-10-08):
//   * Every accepted event is recorded once in admin.payment_events, keyed by Razorpay's
//     event id (x-razorpay-event-id), so a redelivery is recognised; one that never
//     finished (the database was unreachable) is processed again.
//   * payment.captured / order.paid: the order is fulfilled by the same database
//     transaction verify-payment uses (public.subscription_fulfil). This is the backstop
//     for a browser that closed before verify-payment ran.
//   * refund.processed / refund.failed: completes or fails the refund recorded on the
//     invoice; a processed refund issues a credit note.
//   * payment.dispute.*: one billing incident per disputed payment; each later event
//     (under review, action required, won, lost, closed) is added to it.
//   * subscription.* (autopay, subscriptions P3): the mandate's status follows Razorpay's;
//     subscription.charged renews the plan (or completes the first order, if the browser
//     never did); authenticated or activated completes a first order the browser left; a
//     new mandate's predecessors are cancelled; pending and halted tell the vendor.
//   * payment.failed and anything else: recorded only.
// A payment that isn't a plan payment (an ad, say) is recorded as not ours.
//
// Setup: Razorpay dashboard → Account & Settings → Webhooks, once in Test mode and again
// in Live mode (each mode keeps its own webhooks):
//   URL:    https://<project>.supabase.co/functions/v1/subscription-webhook
//   secret: the same value as the RAZORPAY_WEBHOOK_SECRET function secret (razorpay-webhook,
//           for ads, reads the same secret, so its webhook uses the same value)
//   events: payment.captured, payment.failed, order.paid, refund.processed, refund.failed,
//           payment.dispute.created, payment.dispute.under_review, payment.dispute.action_required,
//           payment.dispute.won, payment.dispute.lost, payment.dispute.closed,
//           and for autopay: subscription.authenticated, subscription.activated,
//           subscription.charged, subscription.pending, subscription.halted,
//           subscription.cancelled, subscription.completed
// Payments must be captured automatically (Account & Settings → Payment capture): an
// authorised payment that is never captured is refunded by Razorpay, and the reconciler
// only records it.

import { disputeEvent, finishPaymentEvent, fulfilOrder, recordPaymentEvent, refundEvent, sha256Hex } from "../_shared/fulfil.ts";
import { chargeTarget, mandateEvent, retireMandates, type MandateStatus } from "../_shared/autopay.ts";
import { firstSubscriptionPayment, razorpayKeys } from "../_shared/razorpay.ts";

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Entity = Record<string, unknown> | undefined;
function entity(evt: Record<string, unknown>, name: "payment" | "order" | "refund" | "dispute" | "subscription"): Entity {
  const payload = (evt?.payload ?? {}) as Record<string, unknown>;
  return (payload?.[name] as Record<string, unknown>)?.entity as Entity;
}
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// What each Razorpay subscription event says the mandate's status now is.
const MANDATE_STATUS: Record<string, MandateStatus> = {
  "subscription.authenticated": "authenticated", "subscription.activated": "active", "subscription.charged": "active",
  "subscription.pending": "pending", "subscription.halted": "halted", "subscription.cancelled": "cancelled",
  "subscription.completed": "completed", "subscription.expired": "expired",
};

interface Handled { outcome: string; detail?: unknown; retry?: boolean }

/** An autopay event: the mandate's status, then whatever order the event completes. */
async function subscriptionEvent(url: string, key: string, event: string, subscription: Entity, payment: Entity): Promise<Handled> {
  const subId = str(subscription?.id);
  const status = MANDATE_STATUS[event];
  if (!subId) return { outcome: "no_subscription_id" };
  if (!status) return { outcome: "ignored" };
  const paymentId = str(payment?.id);
  const ev = await mandateEvent(url, key, subId, status, str(payment?.method) ?? str(subscription?.payment_method), num(subscription?.charge_at));
  // The database couldn't be reached: leave the event unfinished so Razorpay's retry runs it.
  if (!ev) return { outcome: "unavailable", retry: true };
  if (!ev.known) return { outcome: "not_ours" };
  const keys = razorpayKeys();
  let outcome = `mandate_${ev.status}`;
  const detail: Record<string, unknown> = { subscription: subId, previous: ev.previous ?? null };

  if (event === "subscription.charged" && paymentId) {
    const target = await chargeTarget(url, key, subId, paymentId, num(payment?.amount));
    if (!target) return { outcome: "unavailable", retry: true };
    if (target.kind === "already" || !target.order_ref) {
      outcome = "already_fulfilled";
    } else {
      const f = await fulfilOrder(url, key, target.order_ref, paymentId, "webhook");
      if (!f.ok && f.reason === "unavailable") return { outcome: "unavailable", retry: true };
      outcome = f.ok ? (target.kind === "renewal" ? "renewed" : "fulfilled") : `refused:${f.reason}`;
      Object.assign(detail, { order_ref: target.order_ref, invoice_id: f.invoice_id ?? null, incident_id: f.incident_id ?? null });
    }
  } else if ((status === "authenticated" || status === "active") && ev.changed && ev.first_order_ref) {
    // Set up, and the browser hasn't completed the order its upfront amount paid for.
    const o = await fetch(`${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(ev.first_order_ref)}&select=status,amount`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    const order = o.ok ? ((await o.json()) as Array<{ status: string; amount: number }>)[0] : null;
    if (order?.status === "created") {
      const free = Number(order.amount) === 0;
      // Asked of Razorpay, never taken from this event: at activation the event's payment
      // is the first renewal's, not the upfront one this order was paid with.
      const paid = free ? null : keys ? await firstSubscriptionPayment(keys, subId) : null;
      if (free || paid) {
        const f = await fulfilOrder(url, key, ev.first_order_ref, paid, "webhook");
        if (!f.ok && f.reason === "unavailable") return { outcome: "unavailable", retry: true };
        outcome = f.ok ? "fulfilled" : `refused:${f.reason}`;
        Object.assign(detail, { order_ref: ev.first_order_ref, invoice_id: f.invoice_id ?? null, incident_id: f.incident_id ?? null });
      } else {
        // Razorpay hasn't invoiced the upfront payment yet: verify, subscription.charged or the reconciler completes it.
        outcome = "awaiting_payment";
      }
    }
  }

  if (ev.replace?.length && keys) Object.assign(detail, { replaced: await retireMandates(url, key, keys, ev.replace) });
  return { outcome, detail };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return reply({ error: "not_configured" });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") || "";
  const expected = await hmacHex(secret, raw);
  if (!safeEqual(expected, sig)) return new Response("invalid signature", { status: 400 });

  let evt: Record<string, unknown>;
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const event = String(evt?.event ?? "");
  const payment = entity(evt, "payment");
  const refund = entity(evt, "refund");
  const dispute = entity(evt, "dispute");
  const orderRef = str(payment?.order_id) ?? str(entity(evt, "order")?.id);
  const paymentRef = str(payment?.id) ?? str(refund?.payment_id) ?? str(dispute?.payment_id);
  const refundRef = str(refund?.id);
  const payloadSha = await sha256Hex(raw);
  const eventId = req.headers.get("x-razorpay-event-id") || `sha256:${payloadSha}`;

  const seen = await recordPaymentEvent(url, serviceKey, {
    eventId, event, source: "subscription-webhook", orderRef, paymentRef, refundRef, payloadSha256: payloadSha,
  });
  if (seen.duplicate && seen.outcome) return reply({ ok: true, duplicate: true, outcome: seen.outcome });

  let outcome = "recorded";
  let detail: unknown = null;

  if (event.startsWith("subscription.")) {
    const h = await subscriptionEvent(url, serviceKey, event, entity(evt, "subscription"), payment);
    if (h.retry) return reply({ ok: false, retry: true }, 500);
    outcome = h.outcome;
    detail = h.detail ?? null;
  } else if (event === "payment.captured" || event === "order.paid") {
    if (!orderRef) {
      outcome = "no_order_id";
    } else {
      const f = await fulfilOrder(url, serviceKey, orderRef, paymentRef, "webhook");
      // The database couldn't be reached: leave the event unfinished so Razorpay's retry runs it.
      if (!f.ok && f.reason === "unavailable") return reply({ ok: false, retry: true }, 500);
      outcome = f.ok ? (f.already ? "already_fulfilled" : "fulfilled") : f.reason === "unknown_order" ? "not_ours" : `refused:${f.reason}`;
      detail = { invoice_id: f.invoice_id ?? null, incident_id: f.incident_id ?? null, detail: f.detail ?? null };
    }
  } else if ((event === "refund.processed" || event === "refund.failed") && paymentRef && refundRef) {
    const r = await refundEvent(url, serviceKey, paymentRef, refundRef, event === "refund.processed" ? "processed" : "failed",
      typeof refund?.amount === "number" ? (refund.amount as number) : null);
    outcome = r.matched ? event : "not_ours";
    detail = r;
  } else if (event.startsWith("payment.dispute.") && paymentRef) {
    const incident = await disputeEvent(url, serviceKey, paymentRef, event, {
      amount: dispute?.amount ?? null, reason_code: dispute?.reason_code ?? null, status: dispute?.status ?? null,
    });
    outcome = "incident_opened";
    detail = { incident_id: incident };
  } else if (event !== "payment.failed") {
    outcome = "ignored";
  }

  await finishPaymentEvent(url, serviceKey, eventId, outcome, detail);
  return reply({ ok: true, outcome });
});
