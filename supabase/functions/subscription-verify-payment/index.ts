// Supabase Edge Function: subscription-verify-payment
//
// Three ways a plan order is completed, all ending in ONE database transaction,
// public.subscription_fulfil (subscriptions P1, 2026-10-08), which claims the order's
// intent, confirms its discount code, activates the plan and issues the invoice:
//
//   Live or test mode (RAZORPAY_KEY_SECRET set): checks the payment signature
//     (HMAC-SHA256 of `orderId|paymentId`) and fulfils the order create-order recorded.
//     Plan, vendor, cycle and price come from that stored order, never the client.
//   { orderId, free: true }: an order a discount code (or an upgrade's credit) took to
//     ₹0 has no Razorpay order and no signature; it must be the caller's own and its
//     stored amount 0, and the database confirms its redemption before claiming it. As in
//     demo mode, a plan that can't be activated undoes everything and releases the code.
//   Demo mode (no key secret): prices the purchase by the same rule a live order uses
//     (_shared/planChange.ts), holds a code's use the same way, records a demo order and
//     fulfils it. Nothing is charged, so a demo invoice says so. If the plan can't be
//     activated the whole fulfilment is undone and the code's use is released.
//
// The caller is confirmed by Supabase Auth (_shared/auth.ts, S-5), and the demo path asks
// the checkout gate first (_shared/checkoutGate.ts, P0). The webhook and the reconciler
// fulfil the same orders; whichever comes first does it, and the others find it done.
//
// History: until 2026-10-08 this function claimed the intent, confirmed the code,
// activated the plan and wrote the invoice in four separate calls, and the webhook kept
// its own copy of the same code (securityflags S-8).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

// GST is computed in one place (_shared/gst.ts via subscriptionAmounts, MPF-11).
import { normaliseCode, releaseDiscount, reserveDiscount, subscriptionAmounts } from "../_shared/discounts.ts";
import { quotePlanChange } from "../_shared/planChange.ts";
import { verifiedUserId } from "../_shared/auth.ts";
import { checkoutGate } from "../_shared/checkoutGate.ts";
import { fulfilOrder, type FulfilResult } from "../_shared/fulfil.ts";

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

/** Close an order nothing was paid for and nothing was kept from (demo and ₹0 orders only). */
async function failOrder(url: string, key: string, orderId: string): Promise<void> {
  await fetch(`${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ status: "failed" }),
  });
}

/** What the browser is told about a fulfilment. */
function answer(f: FulfilResult, extra: Record<string, unknown> = {}) {
  return {
    ok: f.ok, planId: f.plan_id, already: f.already ?? undefined, invoiceId: f.invoice_id,
    error: f.ok ? undefined : (f.reason ?? "unavailable"), ...extra,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "server_misconfigured" }, 500);

  let body: {
    orderId?: string; paymentId?: string; signature?: string; demo?: boolean; free?: boolean;
    planId?: string; billingCycle?: string; gstNumber?: string; discountCode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // ── A ₹0 order: the stored order is the proof ──
  if (body.free) {
    const vendorId = await verifiedUserId(req, url, serviceKey);
    if (!vendorId) return json({ ok: false, error: "unauthenticated" }, 401);
    const orderId = body.orderId;
    if (!orderId || !orderId.startsWith("free_")) return json({ ok: false, error: "not_free" }, 400);
    const r = await fetch(
      `${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=vendor_id,plan_id,amount,status,discount_redemption_id`,
      { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
    );
    const rows = r.ok ? await r.json() : [];
    const o = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!o || o.vendor_id !== vendorId) return json({ ok: false, error: "unknown_order" });
    if (o.status !== "created") return json({ ok: true, already: true, planId: o.plan_id });
    if (Number(o.amount) !== 0) return json({ ok: false, error: "not_free" });
    const f = await fulfilOrder(url, serviceKey, orderId, null, "free");
    if (f.reason === "activation_failed") {
      // Nothing was paid and nothing was kept: the code's use goes back, the order is closed.
      if (o.discount_redemption_id) await releaseDiscount(url, serviceKey, o.discount_redemption_id, orderId);
      await failOrder(url, serviceKey, orderId);
    }
    return json(answer(f));
  }

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  // ── Demo mode: no gateway configured; nothing is charged ──
  if (!keySecret) {
    const vendorId = await verifiedUserId(req, url, serviceKey);
    if (!vendorId) return json({ ok: false, error: "unauthenticated" }, 401);
    const gate = await checkoutGate(url, serviceKey, vendorId);
    if (!gate.ok) return json({ ok: false, demo: true, error: gate.reason ?? "unavailable" });

    const planId = body.planId;
    if (!planId || planId === "free") return json({ ok: false, error: "bad_plan" }, 400);
    const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

    // Priced by the same rule a live order is: what this change costs now.
    const change = await quotePlanChange(url, serviceKey, vendorId, planId, billingCycle);
    if (!change.ok) return json({ ok: false, error: change.reason ?? "unavailable", demo: true });
    const charge = change.charge_rupees ?? 0;

    const orderId = `demo_${crypto.randomUUID()}`;
    const code = charge > 0 ? normaliseCode(body.discountCode) : null;
    let discount = 0;
    let redemptionId: string | null = null;
    let heldCode: string | null = null;
    if (code) {
      // A code in demo mode goes through the same reservation a live order does.
      const held = await reserveDiscount(url, serviceKey, code, vendorId, "subscription", orderId, null, { planId, planRupees: charge });
      if (!held.ok || !held.redemption_id) {
        return json({ ok: false, demo: true, error: "discount", reason: held.reason ?? "unavailable" });
      }
      discount = held.discount_rupees ?? 0;
      redemptionId = held.redemption_id;
      heldCode = held.code ?? code;
      if (discount <= 0) {
        // Nothing to take off: don't keep a use the order won't record.
        await releaseDiscount(url, serviceKey, redemptionId, orderId);
        redemptionId = null;
        heldCode = null;
      }
    }
    const money = subscriptionAmounts(charge, discount);

    const ins = await fetch(`${url}/rest/v1/subscription_payment_orders`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({
        order_id: orderId, vendor_id: vendorId, plan_id: planId, billing_cycle: billingCycle,
        amount: money.paise, gst_number: body.gstNumber ?? null, status: "created", payment_mode: "demo",
        list_rupees: money.list, discount_rupees: money.discount, discount_code: discount > 0 ? heldCode : null,
        discount_redemption_id: discount > 0 ? redemptionId : null,
        change_kind: change.kind ?? "new", credit_rupees: change.credit_rupees ?? 0,
      }),
    });
    if (!ins.ok) {
      if (redemptionId) await releaseDiscount(url, serviceKey, redemptionId, orderId);
      return json({ ok: false, demo: true, error: "intent_failed", detail: (await ins.text()).slice(0, 300) });
    }

    const f = await fulfilOrder(url, serviceKey, orderId, null, "demo");
    if (!f.ok) {
      // Nothing was kept: the order stays unpaid (marked failed) and the code's use goes back.
      if (redemptionId) await releaseDiscount(url, serviceKey, redemptionId, orderId);
      await failOrder(url, serviceKey, orderId);
    }
    return json(answer(f, { demo: true }));
  }

  // ── Live or test mode: verify the signature, then fulfil the recorded order ──
  const { orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature) return json({ error: "missing_fields" }, 400);
  const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) return json({ ok: false, error: "bad_signature" }, 200);

  return json(answer(await fulfilOrder(url, serviceKey, orderId, paymentId, "verify")));
});
