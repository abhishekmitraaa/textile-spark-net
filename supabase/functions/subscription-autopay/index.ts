// Supabase Edge Function: subscription-autopay  (verify_jwt = true)
//
// Autopay for plans, through Razorpay Subscriptions (subscriptions P3, 2026-10-08). The
// caller is confirmed by Supabase Auth, must pass the checkout gate, and must be allowed by
// the subscription_autopay switch. POST { action, … }:
//
//   start   { planId, billingCycle, discountCode?, gstNumber? }
//           Buys, upgrades, renews or downgrades WITH autopay. The first period is priced
//           exactly as a one-off order is (the database's plan-change rule, then a discount
//           code, then GST) and becomes the Razorpay subscription's upfront amount; Razorpay
//           charges the plan's list price with GST from the end of that period on. A code
//           therefore applies to the first payment only.
//   start   { existing: true }
//           Turns autopay on for the plan already paid for (also how the payment method is
//           changed): the Razorpay subscription starts when the current period ends, with
//           no upfront amount, so the authorisation payment is Razorpay's small refunded one.
//   verify  { subscriptionId, paymentId, signature }
//           After Razorpay Checkout: checks HMAC-SHA256(paymentId|subscriptionId), marks the
//           mandate authenticated, fulfils the order its upfront amount paid for (the same
//           transaction every plan payment uses), and cancels the mandate it replaced.
//   cancel  {}
//           Turns autopay off: cancels the Razorpay subscription now. The plan runs to the
//           end of the period already paid for.
//
// The webhook (subscription-webhook) does the same work from Razorpay's side, so a closed
// browser loses nothing; billing-reconcile catches what both miss.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
// Without the Razorpay keys every action answers { error: "not_configured" }: there is no
// demo autopay.

import { checkDiscount, normaliseCode, releaseDiscount, reserveDiscount, subscriptionAmounts } from "../_shared/discounts.ts";
import { quotePlanChange } from "../_shared/planChange.ts";
import { verifiedUserId } from "../_shared/auth.ts";
import { checkoutGate } from "../_shared/checkoutGate.ts";
import { fulfilOrder, paymentModeForKey } from "../_shared/fulfil.ts";
import { cancelSubscription, createPlan, createSubscription, razorpayKeys, type RazorpayKeys } from "../_shared/razorpay.ts";
import { mandateEvent, openMandate, retireMandates } from "../_shared/autopay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

// How long an autopay runs before it has to be set up again: 10 years.
const TOTAL_COUNT = { monthly: 120, yearly: 10 } as const;
// The vendor has 30 minutes to finish checkout (as long as a discount code is held); after
// that Razorpay expires the subscription. Renewals must start later than that, so a period
// ending within the hour can't start an autopay.
const CHECKOUT_WINDOW_S = 30 * 60;
const MIN_LEAD_MS = 60 * 60_000;

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

interface Ctx { url: string; key: string; db: Record<string, string> }

async function rpc<T>(c: Ctx, fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${c.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: c.db, body: JSON.stringify(args) });
    if (!r.ok) return null;
    const t = await r.text();
    return t ? (JSON.parse(t) as T) : null;
  } catch {
    return null;
  }
}
async function rows<T>(c: Ctx, path: string): Promise<T[]> {
  try {
    const r = await fetch(`${c.url}/rest/v1/${path}`, { headers: c.db });
    return r.ok ? ((await r.json()) as T[]) : [];
  } catch {
    return [];
  }
}

/** The Razorpay plan renewals are charged on: the saved one, or a new one saved now. */
async function gatewayPlan(c: Ctx, keys: RazorpayKeys, mode: string, planId: string, planName: string, cycle: "monthly" | "yearly",
  listRupees: number, amountPaise: number): Promise<string | null> {
  const args = { p_plan: planId, p_cycle: cycle, p_mode: mode, p_amount_paise: amountPaise };
  const saved = await rpc<string>(c, "autopay_gateway_plan", args);
  if (saved) return saved;
  const made = await createPlan(keys, {
    cycle, name: `Cosora ${planName} (${cycle})`, amountPaise,
    description: `Cosora ${planName} plan, billed ${cycle}, including GST`,
  });
  if (!made.ok || !made.data?.id) return null;
  // Two checkouts can make the same plan at once: whichever was saved first is the one used.
  return await rpc<string>(c, "autopay_gateway_plan_save", { ...args, p_list_rupees: listRupees, p_razorpay_plan_id: made.data.id });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  const c: Ctx = { url, key: serviceKey, db: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" } };

  const vendorId = await verifiedUserId(req, url, serviceKey);
  if (!vendorId) return json({ error: "unauthenticated" }, 401);

  let body: {
    action?: string; planId?: string; billingCycle?: string; discountCode?: string; gstNumber?: string; existing?: boolean;
    subscriptionId?: string; paymentId?: string; signature?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const keys = razorpayKeys();
  if (!keys) return json({ error: "not_configured" });
  const mode = paymentModeForKey(keys.keyId);

  // ── cancel: autopay off ──
  if (body.action === "cancel") {
    const open = await openMandate(url, serviceKey, vendorId);
    if (!open) return json({ ok: true, already: true });
    const r = await retireMandates(url, serviceKey, keys, [open.sub_id]);
    return r.failed ? json({ ok: false, error: "cancel_failed" }) : json({ ok: true });
  }

  // ── verify: Razorpay Checkout came back ──
  if (body.action === "verify") {
    const { subscriptionId, paymentId, signature } = body;
    if (!subscriptionId || !paymentId || !signature) return json({ error: "missing_fields" }, 400);
    const expected = await hmacHex(keys.keySecret, `${paymentId}|${subscriptionId}`);
    if (!safeEqual(expected, signature)) return json({ ok: false, error: "bad_signature" });
    const mine = await rows<{ vendor_id: string; first_order_ref: string | null; plan_id: string }>(
      c, `subscription_mandates?razorpay_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=vendor_id,first_order_ref,plan_id`);
    if (!mine.length || mine[0].vendor_id !== vendorId) return json({ ok: false, error: "unknown_subscription" });

    const ev = await mandateEvent(url, serviceKey, subscriptionId, "authenticated");
    if (!ev?.known) return json({ ok: false, error: "unavailable", paid: true });
    let invoiceId: string | undefined;
    let fulfilError: string | undefined;
    if (mine[0].first_order_ref) {
      // The upfront amount paid for this order; a ₹0 one (credit or a code covered it) has no payment of its own.
      const order = await rows<{ amount: number }>(c, `subscription_payment_orders?order_id=eq.${encodeURIComponent(mine[0].first_order_ref)}&select=amount`);
      const free = order.length > 0 && Number(order[0].amount) === 0;
      const f = await fulfilOrder(url, serviceKey, mine[0].first_order_ref, free ? null : paymentId, "verify");
      invoiceId = f.invoice_id;
      if (!f.ok) fulfilError = f.reason ?? "unavailable";
    }
    const retired = await retireMandates(url, serviceKey, keys, ev.replace ?? []);
    return json({
      ok: !fulfilError, autopay: true, planId: mine[0].plan_id, invoiceId, error: fulfilError,
      // The money (if any) was taken: the page says so rather than "failed".
      paid: Boolean(fulfilError), replaced: retired.cancelled, replaceFailed: retired.failed || undefined,
    });
  }

  if (body.action !== "start") return json({ error: "bad_action" }, 400);

  // ── start ──
  const allowed = await rpc<boolean>(c, "feature_on_for", { p_key: "subscription_autopay", p_profile: vendorId });
  if (allowed !== true) return json({ error: "autopay_not_open" });
  const gate = await checkoutGate(url, serviceKey, vendorId);
  if (!gate.ok) return json({ error: gate.reason ?? "unavailable" });

  let planId: string;
  let cycle: "monthly" | "yearly";
  let startAtMs: number;
  let chargeRupees = 0;
  let discount = 0;
  let change: { kind?: string; credit_rupees?: number } = {};
  let code: string | null = null;

  if (body.existing) {
    // Autopay for the plan already paid for: nothing is charged now.
    const sub = await rows<{ plan_id: string; billing_cycle: string; status: string; current_period_end: string | null }>(
      c, `vendor_subscriptions?vendor_id=eq.${vendorId}&select=plan_id,billing_cycle,status,current_period_end`);
    const s = sub[0];
    if (!s || s.status !== "active" || s.plan_id === "free" || !s.current_period_end) return json({ error: "no_paid_plan" });
    planId = s.plan_id;
    cycle = s.billing_cycle === "yearly" ? "yearly" : "monthly";
    startAtMs = new Date(s.current_period_end).getTime();
  } else {
    if (!body.planId || body.planId === "free") return json({ error: "bad_plan" }, 400);
    planId = body.planId;
    cycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
    const q = await quotePlanChange(url, serviceKey, vendorId, planId, cycle);
    if (!q.ok || !q.period_end) return json({ error: q.reason ?? "unavailable" });
    change = q;
    chargeRupees = q.charge_rupees ?? 0;
    startAtMs = new Date(q.period_end).getTime();
    code = chargeRupees > 0 ? normaliseCode(body.discountCode) : null;
    if (code) {
      const check = await checkDiscount(url, serviceKey, code, vendorId, "subscription", { planId, planRupees: chargeRupees });
      if (!check.ok) return json({ error: "discount", reason: check.reason ?? "unavailable" });
      discount = check.discount_rupees ?? 0;
    }
  }
  // A period ending within minutes can't start an autopay: Razorpay needs a future start.
  if (startAtMs - Date.now() < MIN_LEAD_MS) return json({ error: "too_close_to_renewal" });

  const plan = await rows<{ name: string; monthly_price: number; yearly_price: number; is_invite_only: boolean }>(
    c, `subscription_plans?id=eq.${encodeURIComponent(planId)}&select=name,monthly_price,yearly_price,is_invite_only`);
  if (!plan.length) return json({ error: "unknown_plan" }, 400);
  if (plan[0].is_invite_only) return json({ error: "invite_only" });
  const listRupees = cycle === "yearly" ? plan[0].yearly_price : plan[0].monthly_price;
  if (!listRupees || listRupees <= 0) return json({ error: "zero_amount" }, 400);

  // Every renewal: the plan's price with GST. The first period: what this change costs now.
  const renewal = subscriptionAmounts(listRupees, 0);
  const first = subscriptionAmounts(chargeRupees, discount);

  const razorpayPlan = await gatewayPlan(c, keys, mode, planId, plan[0].name, cycle, listRupees, renewal.paise);
  if (!razorpayPlan) return json({ error: "plan_failed" });

  const made = await createSubscription(keys, {
    planId: razorpayPlan, totalCount: TOTAL_COUNT[cycle], startAt: Math.floor(startAtMs / 1000),
    expireBy: Math.floor(Date.now() / 1000) + CHECKOUT_WINDOW_S,
    upfront: first.paise > 0 ? { name: `${plan[0].name} plan, first period`, amountPaise: first.paise } : null,
    notes: { kind: "subscription_autopay", vendor: vendorId, plan: planId, cycle, change: body.existing ? "autopay_on" : change.kind ?? "new" },
  });
  if (!made.ok || !made.data?.id) return json({ error: "subscription_failed", detail: made.error });
  const subId = made.data.id;
  // From here a failure leaves a Razorpay subscription nobody can pay for: cancel it.
  const abandon = async (redemptionId: string | null) => {
    if (redemptionId) await releaseDiscount(url, serviceKey, redemptionId, subId);
    await cancelSubscription(keys, subId);
  };

  let redemptionId: string | null = null;
  let heldCode: string | null = null;
  if (code) {
    const held = await reserveDiscount(url, serviceKey, code, vendorId, "subscription", subId, discount, { planId, planRupees: chargeRupees });
    if (!held.ok || !held.redemption_id) {
      await abandon(null);
      return json({ error: "discount", reason: held.reason ?? "unavailable" });
    }
    redemptionId = held.redemption_id;
    heldCode = held.code ?? code;
  }

  let firstOrderRef: string | null = null;
  if (!body.existing) {
    // The order the upfront amount pays for, keyed by the Razorpay subscription id, so
    // verify, the webhook and the reconciler all find it.
    const ins = await fetch(`${url}/rest/v1/subscription_payment_orders`, {
      method: "POST",
      headers: { ...c.db, prefer: "return=minimal" },
      body: JSON.stringify({
        order_id: subId, vendor_id: vendorId, plan_id: planId, billing_cycle: cycle, amount: first.paise,
        gst_number: body.gstNumber ?? null, status: "created", payment_mode: first.paise === 0 ? "free" : mode, autopay: true,
        list_rupees: first.list, discount_rupees: first.discount, discount_code: heldCode, discount_redemption_id: redemptionId,
        change_kind: change.kind ?? "new", credit_rupees: change.credit_rupees ?? 0,
      }),
    });
    if (!ins.ok) {
      await abandon(redemptionId);
      return json({ error: "intent_failed", detail: (await ins.text()).slice(0, 300) });
    }
    firstOrderRef = subId;
  }

  const mandate = await rpc<string>(c, "autopay_mandate_create", {
    p_vendor: vendorId, p_sub_id: subId, p_plan: planId, p_cycle: cycle, p_mode: mode, p_list_rupees: listRupees,
    p_amount_paise: renewal.paise, p_first_order_ref: firstOrderRef, p_start_at: new Date(startAtMs).toISOString(),
  });
  if (!mandate) {
    await abandon(redemptionId);
    return json({ error: "mandate_failed" });
  }

  return json({
    configured: true, subscriptionId: subId, keyId: keys.keyId, currency: "INR",
    amount: first.paise, base: first.base, gst: first.gst, list: first.list, discount: first.discount, discountCode: heldCode,
    renewalAmount: renewal.paise, startsAt: new Date(startAtMs).toISOString(), planId, billingCycle: cycle,
    change: body.existing ? "autopay_on" : change.kind ?? "new", credit: change.credit_rupees ?? 0,
  });
});
