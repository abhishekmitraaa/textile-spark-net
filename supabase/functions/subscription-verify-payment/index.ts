// Supabase Edge Function: subscription-verify-payment
//
// Live mode (RAZORPAY_KEY_SECRET set): verifies the payment signature
// (HMAC-SHA256 of `orderId|paymentId`) then activates the subscription recorded
// in subscription_payment_orders — idempotently (a conditional 'created' →
// 'paid' claim, so the webhook and this call never double-activate). Plan /
// vendor / cycle come from the stored intent, not the client.
//
// Demo mode (no key secret): activates directly from the client-supplied
// planId + billingCycle using the vendor id from the JWT, so the subscription
// flow works before the gateway is wired — exactly like the ad flow's
// simulated checkout. The amount is still computed SERVER-SIDE from the plan.
//
// DISCOUNT CODES (admin completion Phase 10, 2026-09-29):
//   * A claimed intent is invoiced from its own list price and discount (GST on
//     the discounted base), not from the plan's price today, and its code's use
//     is confirmed. An intent from before 2026-09-29 has no list price and is
//     invoiced from the plan, as before.
//   * The signature-verified payment id is stored on the invoice. It used to be
//     verified and then dropped, so a live invoice read as "not
//     gateway-verified" in the payments ledger.
//   * Demo mode applies a code the way a live order does: reserved against a
//     demo_<uuid> reference, confirmed once the plan is active (released if not).
//   * { orderId, free: true } fulfils an order a code took to ₹0 (no Razorpay
//     order, so no signature), only when the order is the caller's, its stored
//     amount is 0 and its redemption confirms.
//
// PLAN CHANGES (2026-10-02): the plan, its period and the plan cached on
// vendor_profiles come from subscription_activate (_shared/planChange.ts), which
// applies the database's rule at this moment: an upgrade starts now, a renewal or
// downgrade at the current end. The invoice covers the period it returns and
// records the credit and the kind. Demo mode prices with the same rule. An order
// whose charge was ₹0 before any code (an upgrade fully covered by credit) is a
// free order too.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

// GST is computed in one place for all three subscription functions (MPF-11);
// subscriptionAmounts() applies it after the discount.
import { confirmDiscount, normaliseCode, releaseDiscount, reserveDiscount, subscriptionAmounts } from "../_shared/discounts.ts";
import { activatePlanChange, quotePlanChange, type ChangeKind } from "../_shared/planChange.ts";

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
function vendorIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).sub ?? null;
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

/**
 * What the order was priced at: the charge before a code (list), the code that came
 * off it, and the plan change behind it (the credit an upgrade got, and its kind).
 */
interface Pricing { list: number; discount: number; code: string | null; credit?: number; kind?: ChangeKind | null }

interface ActivateInput {
  vendorId: string; planId: string; billingCycle: "monthly" | "yearly";
  gstNumber: string | null; paymentId: string | null; orderId: string | null;
  /** Absent: priced from the plan (a demo activation with no code, or an intent from before the discount columns). */
  pricing?: Pricing;
}

// Shared: upsert the subscription, cache the plan on vendor_profiles, and write
// a paid invoice. The amount is always computed server-side: from the order's
// stored price when it has one, else from the plan.
async function activateSubscription(url: string, key: string, input: ActivateInput): Promise<{ ok: boolean; error?: string; planId?: string }> {
  const plan = await fetchPlan(url, key, input.planId);
  if (!plan) return { ok: false, error: "unknown_plan" };
  // Invite-only tiers (VIP) are never self-serve — even in demo/unconfigured
  // mode, where create-order returns not_configured before it can reject them.
  // Admins provision VIP directly; the self-serve activation path must refuse it.
  if (plan.is_invite_only) return { ok: false, error: "invite_only" };
  const list = input.pricing?.list ?? (input.billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price);
  const money = subscriptionAmounts(list, input.pricing?.discount ?? 0);

  // The plan, its period and the vendor_profiles cache, by the database's rule
  // (new and upgrade start now; renewal and downgrade at the current end).
  const activation = await activatePlanChange(url, key, input.vendorId, input.planId, input.billingCycle);
  if (!activation.ok || !activation.period_start || !activation.period_end) {
    // Only a race gets here (two conflicting orders paid at once). The money is
    // taken and the order claimed, so it must be looked at, not lost quietly.
    console.error("subscription-verify-payment: activation refused after payment", input.orderId, activation.reason);
    return { ok: false, error: activation.reason === "already_scheduled" ? "already_scheduled" : "activation_failed" };
  }
  const startIso = activation.period_start;
  const endIso = activation.period_end;
  const subscriptionId = activation.subscription_id ?? null;

  // Invoice number from the DB sequence (RPC).
  let invoiceNumber: string | null = null;
  try {
    const inv = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
    });
    if (inv.ok) invoiceNumber = await inv.json();
  } catch { /* fall through with null */ }

  // amount is the taxable value (after any discount) and gst_amount the GST on
  // it, as every reader of this table already assumes; the discount sits beside.
  const discounted = money.discount > 0;
  await fetch(`${url}/rest/v1/subscription_invoices`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({
      vendor_id: input.vendorId, subscription_id: subscriptionId, plan_id: input.planId,
      amount: money.base, currency: "INR", gst_amount: money.gst, gst_number: input.gstNumber, tds_amount: null,
      status: "paid", razorpay_payment_id: input.paymentId, razorpay_order_id: input.orderId,
      invoice_number: invoiceNumber, billing_period_start: startIso, billing_period_end: endIso,
      discount_amount: discounted ? money.discount : null,
      discount_code: discounted ? input.pricing?.code ?? null : null,
      change_kind: input.pricing?.kind ?? activation.kind ?? null,
      credit_rupees: (input.pricing?.credit ?? 0) > 0 ? input.pricing?.credit : null,
    }),
  });

  return { ok: true, planId: input.planId };
}

// Claim the intent ('created' → 'paid') and activate exactly once.
async function activateFromOrder(url: string, key: string, orderId: string, paymentId: string | null): Promise<{ ok: boolean; planId?: string; already?: boolean }> {
  const claim = await fetch(`${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: "PATCH",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify({ status: "paid", paid_at: new Date().toISOString() }),
  });
  const claimed = claim.ok ? await claim.json() : [];
  if (!Array.isArray(claimed) || claimed.length === 0) return { ok: true, already: true }; // already paid / unknown
  const o = claimed[0];
  // The vendor was charged the discounted price, so the code's use is theirs,
  // even if the reservation lapsed while they paid.
  if (o.discount_redemption_id) await confirmDiscount(url, key, o.discount_redemption_id, orderId);
  const res = await activateSubscription(url, key, {
    vendorId: o.vendor_id, planId: o.plan_id, billingCycle: o.billing_cycle,
    gstNumber: o.gst_number ?? null, paymentId, orderId,
    pricing: o.list_rupees != null
      ? {
          list: Number(o.list_rupees), discount: Number(o.discount_rupees ?? 0), code: o.discount_code ?? null,
          credit: Number(o.credit_rupees ?? 0), kind: o.change_kind ?? null,
        }
      : undefined,
  });
  return { ok: res.ok, planId: res.planId };
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

  // A code took this order to ₹0: create-order made no Razorpay order, so there
  // is no signature to check. The stored order is the proof instead.
  if (body.free) {
    const vendorId = vendorIdFromJwt(req);
    if (!vendorId) return json({ ok: false, error: "unauthenticated" }, 401);
    const orderId = body.orderId;
    if (!orderId || !orderId.startsWith("free_")) return json({ ok: false, error: "not_free" }, 400);
    const r = await fetch(
      `${url}/rest/v1/subscription_payment_orders?order_id=eq.${encodeURIComponent(orderId)}&select=vendor_id,plan_id,amount,status,discount_redemption_id,list_rupees`,
      { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
    );
    const rows = r.ok ? await r.json() : [];
    const o = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!o || o.vendor_id !== vendorId) return json({ ok: false, error: "unknown_order" });
    if (o.status !== "created") return json({ ok: true, already: true, planId: o.plan_id });
    if (Number(o.amount) !== 0) return json({ ok: false, error: "not_free" });
    if (o.discount_redemption_id) {
      if (!(await confirmDiscount(url, serviceKey, o.discount_redemption_id, orderId))) {
        return json({ ok: false, error: "discount_unconfirmed" });
      }
    } else if (o.list_rupees == null || Number(o.list_rupees) !== 0) {
      // ₹0 with no code is only an upgrade the credit covered in full.
      return json({ ok: false, error: "not_free" });
    }
    return json(await activateFromOrder(url, serviceKey, orderId, null));
  }

  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  // Demo mode — no gateway configured; activate from the client request.
  if (!keySecret) {
    const vendorId = vendorIdFromJwt(req);
    if (!vendorId) return json({ ok: false, error: "unauthenticated" }, 401);
    const planId = body.planId;
    if (!planId || planId === "free") return json({ ok: false, error: "bad_plan" }, 400);
    const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
    const gstNumber = body.gstNumber ?? null;

    // Priced by the same rule a live order is: what this change costs now.
    const plan = await fetchPlan(url, serviceKey, planId);
    if (!plan) return json({ ok: false, error: "unknown_plan", demo: true });
    if (plan.is_invite_only) return json({ ok: false, error: "invite_only", demo: true });
    const change = await quotePlanChange(url, serviceKey, vendorId, planId, billingCycle);
    if (!change.ok) return json({ ok: false, error: change.reason ?? "unavailable", demo: true });
    const charge = change.charge_rupees ?? (billingCycle === "yearly" ? plan.yearly_price : plan.monthly_price);
    const planned = { credit: change.credit_rupees ?? 0, kind: change.kind ?? null };

    const code = charge > 0 ? normaliseCode(body.discountCode) : null;
    if (!code) {
      const res = await activateSubscription(url, serviceKey, {
        vendorId, planId, billingCycle, gstNumber, paymentId: null, orderId: null,
        pricing: { list: charge, discount: 0, code: null, ...planned },
      });
      return json({ ...res, demo: true });
    }

    // A code in demo mode goes through the same reservation a live order does.
    const ref = `demo_${crypto.randomUUID()}`;
    const held = await reserveDiscount(url, serviceKey, code, vendorId, "subscription", ref, null, { planId, planRupees: charge });
    if (!held.ok || !held.redemption_id) {
      return json({ ok: false, demo: true, error: "discount", reason: held.reason ?? "unavailable" });
    }
    const res = await activateSubscription(url, serviceKey, {
      vendorId, planId, billingCycle, gstNumber, paymentId: null, orderId: null,
      pricing: { list: charge, discount: held.discount_rupees ?? 0, code: held.code ?? code, ...planned },
    });
    if (res.ok) await confirmDiscount(url, serviceKey, held.redemption_id, ref);
    else await releaseDiscount(url, serviceKey, held.redemption_id, ref);
    return json({ ...res, demo: true });
  }

  // Live mode — verify the signature, then activate the recorded intent.
  const { orderId, paymentId, signature } = body;
  if (!orderId || !paymentId || !signature) return json({ error: "missing_fields" }, 400);
  const expected = await hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) return json({ ok: false, error: "bad_signature" }, 200);

  const result = await activateFromOrder(url, serviceKey, orderId, paymentId);
  return json(result);
});
