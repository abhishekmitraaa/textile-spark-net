// Supabase Edge Function: subscription-create-order
//
// Creates a plain Razorpay order for a vendor's subscription purchase / upgrade
// / manual renewal and records a payment intent in
// public.subscription_payment_orders (mirrors ad_orders) so verify-payment AND
// the webhook can activate the subscription idempotently. The amount is computed
// SERVER-SIDE from subscription_plans (never trust a client amount); the vendor
// id comes from the caller's JWT.
//
// One-time / renewal charge only — NO Razorpay Subscriptions API, NO autopay.
// Each billing period is its own discrete order the vendor pays explicitly.
//
// DISCOUNT CODES (admin completion Phase 10, 2026-09-29). `discountCode` is
// optional. The database checks it against this plan before anything is
// created (a refused code costs nothing), the discount comes off the plan price
// and GST is charged on what's left (_shared/discounts.ts). Once the Razorpay
// order exists, one use of the code is reserved against its id, under the
// code's lock: if the last use went to someone else in between, the vendor is
// told here and the unpaid Razorpay order simply expires. The intent stores the
// list price, the discount and the redemption, so verify-payment and the webhook
// invoice exactly what was charged. A code that takes the total to ₹0 makes no
// Razorpay order: the id is free_<uuid> and verify-payment fulfils it.
//
// PLAN CHANGES (2026-10-02). What the order charges comes from the database's
// rule (_shared/planChange.ts): an upgrade is the plan's price less a credit for
// the unused part of what's paid; a renewal or downgrade is paid now and starts at
// the current end. A code comes off that charge, then GST. The intent stores the
// charge (list_rupees), the credit and the kind, so the invoice says what happened.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (+ platform SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY). Returns { error:"not_configured" } until the
// Razorpay keys are set, so the client falls back to the simulated checkout
// (which applies a code itself: subscription-verify-payment, demo mode).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// GST is computed in one place for all three subscription functions (MPF-11);
// subscriptionAmounts() applies it after the discount.
import { checkDiscount, normaliseCode, releaseDiscount, reserveDiscount, subscriptionAmounts } from "../_shared/discounts.ts";
import { quotePlanChange } from "../_shared/planChange.ts";

function vendorIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

interface PlanRow { monthly_price: number; yearly_price: number; is_invite_only: boolean }

async function fetchPlan(url: string, key: string, planId: string): Promise<PlanRow | null> {
  const r = await fetch(
    `${url}/rest/v1/subscription_plans?id=eq.${encodeURIComponent(planId)}&select=monthly_price,yearly_price,is_invite_only`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] as PlanRow : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "not_configured" }, 200);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const vendorId = vendorIdFromJwt(req);
  if (!vendorId) return json({ error: "unauthenticated" }, 401);

  let payload: { planId?: string; billingCycle?: string; gstNumber?: string; discountCode?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const planId = payload.planId;
  const billingCycle = payload.billingCycle === "yearly" ? "yearly" : "monthly";
  if (!planId || planId === "free") return json({ error: "bad_plan" }, 400);

  const plan = await fetchPlan(url, serviceKey, planId);
  if (!plan) return json({ error: "unknown_plan" }, 400);
  if (plan.is_invite_only) return json({ error: "invite_only" }, 200); // VIP: not self-serve

  const list = billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price;
  if (!list || list <= 0) return json({ error: "zero_amount" }, 400);

  // What this change costs this seller now: new, renewal, upgrade or downgrade.
  const change = await quotePlanChange(url, serviceKey, vendorId, planId, billingCycle);
  if (!change.ok) return json({ error: change.reason ?? "unavailable" }, 200);
  const charge = change.charge_rupees ?? list;

  // 0) The code, if any, before anything exists that it could leave behind. It
  //    comes off the charge, so an upgrade's code takes a share of the difference.
  const code = charge > 0 ? normaliseCode(payload.discountCode) : null;
  let discount = 0;
  if (code) {
    const check = await checkDiscount(url, serviceKey, code, vendorId, "subscription", { planId, planRupees: charge });
    if (!check.ok) return json({ error: "discount", reason: check.reason ?? "unavailable" }, 200);
    discount = check.discount_rupees ?? 0;
  }
  const money = subscriptionAmounts(charge, discount);
  const free = money.paise === 0;

  // 1) Create the Razorpay order: none when the code took the total to ₹0.
  let orderId: string;
  if (free) {
    orderId = `free_${crypto.randomUUID()}`;
  } else {
    try {
      const resp = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, "content-type": "application/json" },
        body: JSON.stringify({
          amount: money.paise, currency: "INR", receipt: `sub_${Date.now()}`,
          notes: {
            kind: "subscription", vendor: vendorId, plan: planId, cycle: billingCycle, change: change.kind ?? "new",
            ...(code ? { discount_code: code } : {}),
          },
        }),
      });
      if (!resp.ok) return json({ error: "order_failed", detail: (await resp.text()).slice(0, 300) }, 200);
      orderId = (await resp.json()).id;
    } catch (e) {
      return json({ error: "request_failed", detail: String(e) }, 200);
    }
  }

  // 2) Hold the code's use for this order. Refused here means another vendor
  //    took the last use (or an admin changed the code) since step 0.
  let redemptionId: string | null = null;
  let heldCode: string | null = null;
  if (code) {
    const held = await reserveDiscount(url, serviceKey, code, vendorId, "subscription", orderId, discount, { planId, planRupees: charge });
    if (!held.ok || !held.redemption_id) return json({ error: "discount", reason: held.reason ?? "unavailable" }, 200);
    redemptionId = held.redemption_id;
    heldCode = held.code ?? code;
  }

  // 3) Record the intent (service role) so activation is driven server-side.
  //
  // Must succeed before the client opens Checkout — see the same guard in
  // razorpay-create-order. Without this row a completed payment hits
  // activateFromOrder's "already paid / unknown" branch, which returns ok:true
  // without activating: the vendor is charged and stays on their old plan.
  const ins = await fetch(`${url}/rest/v1/subscription_payment_orders`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      order_id: orderId, vendor_id: vendorId, plan_id: planId, billing_cycle: billingCycle,
      amount: money.paise, gst_number: payload.gstNumber ?? null, status: "created",
      list_rupees: money.list, discount_rupees: money.discount,
      discount_code: heldCode, discount_redemption_id: redemptionId,
      change_kind: change.kind ?? "new", credit_rupees: change.credit_rupees ?? 0,
    }),
  });
  if (!ins.ok) {
    // Nobody can pay an order with no intent, so its use goes back.
    if (redemptionId) await releaseDiscount(url, serviceKey, redemptionId, orderId);
    return json({ error: "intent_failed", detail: (await ins.text()).slice(0, 300) }, 200);
  }

  return json({
    configured: true, orderId, amount: money.paise, currency: "INR", keyId, base: money.base, gst: money.gst,
    planId, billingCycle, list: money.list, discount: money.discount, discountCode: heldCode, free,
    change: change.kind ?? "new", credit: change.credit_rupees ?? 0, planPrice: change.list_rupees ?? list,
    periodStart: change.period_start ?? null,
  });
});
