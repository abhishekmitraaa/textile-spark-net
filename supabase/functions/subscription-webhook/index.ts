// Supabase Edge Function: subscription-webhook  (deploy with verify_jwt = false)
//
// Server-to-server backstop from Razorpay. If a vendor completes payment but the
// browser closes before subscription-verify-payment runs, this still activates
// the subscription. Verifies the webhook signature (HMAC-SHA256 of the RAW body
// with RAZORPAY_WEBHOOK_SECRET) and activates the order's intent idempotently
// (shares the 'created' → 'paid' claim with verify-payment).
//
// No subscription-charged/cancelled events to handle — there is no recurring
// Razorpay subscription object; each period is a plain payment.captured.
//
// DISCOUNT CODES (admin completion Phase 10, 2026-09-29): as in verify-payment,
// a claimed intent is invoiced from its own list price and discount and its
// code's use is confirmed, and the invoice records the event's payment id.
//
// Setup: in the Razorpay dashboard add a webhook →
//   URL:    https://<project>.supabase.co/functions/v1/subscription-webhook
//   events: payment.captured (and optionally order.paid)
//   secret: set the same value as the RAZORPAY_WEBHOOK_SECRET function secret

// PLAN CHANGES (2026-10-02): as in verify-payment, the plan and its period come
// from subscription_activate (_shared/planChange.ts) and the invoice records the
// order's credit and kind.

// GST is computed in one place for all three subscription functions (MPF-11);
// subscriptionAmounts() applies it after the discount.
import { confirmDiscount, subscriptionAmounts } from "../_shared/discounts.ts";
import { activatePlanChange } from "../_shared/planChange.ts";

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

interface PlanRow { monthly_price: number; yearly_price: number }
async function fetchPlan(url: string, key: string, planId: string): Promise<PlanRow | null> {
  const r = await fetch(
    `${url}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(planId)}&select=monthly_price,yearly_price`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] as PlanRow : null;
}

async function activateSubscription(url: string, key: string, o: Record<string, unknown>, paymentId: string | null): Promise<boolean> {
  const planId = String(o.plan_id);
  const billingCycle = o.billing_cycle === "yearly" ? "yearly" : "monthly";
  const plan = await fetchPlan(url, key, planId);
  if (!plan) return false;
  // The order's own list price when it stored one (orders from 2026-09-29 on),
  // else the plan's; the discount comes off before GST.
  const list = o.list_rupees != null
    ? Number(o.list_rupees)
    : (billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price);
  const money = subscriptionAmounts(list, Number(o.discount_rupees ?? 0));

  // The plan, its period and the vendor_profiles cache, by the database's rule.
  const activation = await activatePlanChange(url, key, String(o.vendor_id), planId, billingCycle);
  if (!activation.ok || !activation.period_start || !activation.period_end) {
    console.error("subscription-webhook: activation refused after payment", o.order_id, activation.reason);
    return false;
  }
  const startIso = activation.period_start;
  const endIso = activation.period_end;
  const subscriptionId = activation.subscription_id ?? null;

  let invoiceNumber: string | null = null;
  try {
    const inv = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
    });
    if (inv.ok) invoiceNumber = await inv.json();
  } catch { /* null */ }

  const discounted = money.discount > 0;
  await fetch(`${url}/rest/v1/subscription_invoices`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      vendor_id: o.vendor_id, subscription_id: subscriptionId, plan_id: planId, amount: money.base,
      currency: "INR", gst_amount: money.gst, gst_number: o.gst_number ?? null, status: "paid",
      razorpay_payment_id: paymentId, razorpay_order_id: o.order_id, invoice_number: invoiceNumber,
      billing_period_start: startIso, billing_period_end: endIso,
      discount_amount: discounted ? money.discount : null,
      discount_code: discounted ? (o.discount_code ?? null) : null,
      change_kind: o.change_kind ?? activation.kind ?? null,
      credit_rupees: Number(o.credit_rupees ?? 0) > 0 ? Number(o.credit_rupees) : null,
    }),
  });
  return true;
}

async function activateFromOrder(url: string, key: string, orderId: string, paymentId: string | null): Promise<boolean> {
  const claim = await fetch(`${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return false; // already paid / unknown
  const o = claimed[0];
  // Charged the discounted price, so the code's use is the vendor's.
  if (o.discount_redemption_id) await confirmDiscount(url, key, String(o.discount_redemption_id), orderId);
  return await activateSubscription(url, key, o, paymentId);
}

function entity(evt: Record<string, unknown>, name: "payment" | "order"): Record<string, unknown> | undefined {
  const payload = (evt?.payload ?? {}) as Record<string, unknown>;
  return (payload?.[name] as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
}
function orderIdFromEvent(evt: Record<string, unknown>): string | null {
  return (entity(evt, "payment")?.order_id as string) || (entity(evt, "order")?.id as string) || null;
}
function paymentIdFromEvent(evt: Record<string, unknown>): string | null {
  return (entity(evt, "payment")?.id as string) || null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response(JSON.stringify({ error: "not_configured" }), { status: 200, headers: { "content-type": "application/json" } });

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

  const event = String(evt?.event ?? "");
  if (event !== "payment.captured" && event !== "order.paid") {
    return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200, headers: { "content-type": "application/json" } });
  }

  const orderId = orderIdFromEvent(evt);
  if (!orderId) return new Response(JSON.stringify({ ok: true, note: "no_order_id" }), { status: 200, headers: { "content-type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const activated = await activateFromOrder(url, serviceKey, orderId, paymentIdFromEvent(evt));
  return new Response(JSON.stringify({ ok: true, activated }), { status: 200, headers: { "content-type": "application/json" } });
});
