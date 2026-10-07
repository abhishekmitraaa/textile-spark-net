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
//   * payment.dispute.*: opens a billing incident for finance.
//   * payment.failed and anything else: recorded only.
// Both webhook URLs (this and razorpay-webhook, for ads) receive every event for the
// account; an order that isn't a subscription order is recorded as not ours.
//
// Setup: Razorpay dashboard → Webhooks →
//   URL:    https://<project>.supabase.co/functions/v1/subscription-webhook
//   events: payment.captured, order.paid, payment.failed, refund.processed, refund.failed,
//           payment.dispute.created, payment.dispute.won, payment.dispute.lost, payment.dispute.closed
//   secret: the RAZORPAY_WEBHOOK_SECRET function secret

import { disputeEvent, finishPaymentEvent, fulfilOrder, recordPaymentEvent, refundEvent, sha256Hex } from "../_shared/fulfil.ts";

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
function entity(evt: Record<string, unknown>, name: "payment" | "order" | "refund" | "dispute"): Entity {
  const payload = (evt?.payload ?? {}) as Record<string, unknown>;
  return (payload?.[name] as Record<string, unknown>)?.entity as Entity;
}
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

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

  if (event === "payment.captured" || event === "order.paid") {
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
