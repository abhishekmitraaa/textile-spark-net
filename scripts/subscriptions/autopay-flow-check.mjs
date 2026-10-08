#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Autopay, checked in Node (subscriptions P3, 2026-10-08).
//
// The real code of subscription-autopay, subscription-webhook, billing-reconcile and
// subscription-create-order, bundled with esbuild; Deno is stubbed and fetch() answers from
// a stand-in for PostgREST and for Razorpay's Plans, Subscriptions and Invoices APIs that
// records every call. The mandate's own rules (forward-only statuses, which order a charge
// is for, auto_renew) are scripts/subscriptions/p3_autopay.sql. This proves the functions:
//   * start: the first period is the upfront amount, priced as a one-off order is; the
//     renewal amount is the plan's price with GST; start_at is the end of the first
//     period; a Razorpay plan is made once; nothing is left behind when a step fails
//   * verify: the signature is HMAC(payment_id|subscription_id); the first order is
//     fulfilled by the one fulfilment transaction; the mandate replaced is cancelled, and
//     one that can't be opens an incident
//   * the webhook and the reconciler do the same from Razorpay's side
//   * one-off checkout is refused while autopay is on
//
//   node scripts/subscriptions/autopay-flow-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SB = "https://project.test";
const VENDOR = "11111111-1111-1111-1111-111111111111";
const OTHER = "99999999-9999-9999-9999-999999999999";
const KEY_SECRET = "rzp_test_secret";
const HOOK_SECRET = "rzp_hook_secret";
const LIVE = {
  SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-key",
  RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: HOOK_SECRET,
};
const NO_KEYS = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-key" };

let ENV = LIVE;
const handlers = {};
let loading = null;
globalThis.Deno = { serve: (h) => { handlers[loading] = h; }, env: { get: (k) => ENV[k] } };

const DAY = 86_400_000;
const PERIOD_END = new Date(Date.now() + 30 * DAY).toISOString();
let S;
function reset(over = {}) {
  S = {
    calls: [],
    plans: { gold: { name: "Gold", monthly_price: 2299, yearly_price: 22990, is_invite_only: false } },
    flag: true, gate: { ok: true },
    quote: { ok: true, kind: "new", plan_id: "gold", billing_cycle: "monthly", list_rupees: 2299, credit_rupees: 0, charge_rupees: 2299,
             period_start: new Date().toISOString(), period_end: PERIOD_END, starts_now: true },
    check: { ok: true, code: "LAUNCH25", discount_rupees: 458 }, reserve: null,
    gatewayPlan: null, orders: new Map(), mandates: new Map(), failIntent: false,
    vendorSub: null, open: null,
    rzpSeq: 0, rzpPlans: [], rzpSubs: [], rzpCancels: [], rzpCancelFails: false, rzpSubStatus: {}, rzpInvoices: {},
    events: new Map(), fulfil: null, dbDown: false, incidents: [], candidates: [],
    ...over,
  };
}
const res = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const eqv = (u, k) => (new URL(u).searchParams.get(k) ?? "").replace(/^eq\./, "");

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  let body;
  try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  S.calls.push({ method, url, body });
  const p = new URL(url).pathname;

  // ── Razorpay ──
  if (url.startsWith("https://api.razorpay.com")) {
    if (p === "/v1/plans") { const id = `plan_R${++S.rzpSeq}`; S.rzpPlans.push({ id, ...body }); return res({ id }); }
    if (p === "/v1/subscriptions" && method === "POST") { const id = `sub_R${++S.rzpSeq}`; S.rzpSubs.push({ id, ...body }); return res({ id, status: "created" }); }
    const cancel = /^\/v1\/subscriptions\/([^/]+)\/cancel$/.exec(p);
    if (cancel) {
      S.rzpCancels.push(cancel[1]);
      return S.rzpCancelFails ? res({ error: { description: "Internal server error" } }, 500) : res({ id: cancel[1], status: "cancelled" });
    }
    const one = /^\/v1\/subscriptions\/([^/]+)$/.exec(p);
    if (one) return res({ id: one[1], status: S.rzpSubStatus[one[1]] ?? "created", payment_method: "upi", charge_at: 1800000000 });
    if (p === "/v1/invoices") return res({ items: S.rzpInvoices[new URL(url).searchParams.get("subscription_id")] ?? [] });
    if (/^\/v1\/orders\/[^/]+\/payments$/.test(p)) return res({ items: [] });
    if (p === "/v1/orders") return res({ id: `order_R${++S.rzpSeq}`, amount: body.amount });
    return res({ error: { description: `unmocked ${p}` } }, 599);
  }

  // ── Supabase ──
  if (p === "/auth/v1/user") {
    const authz = init.headers?.authorization ?? init.headers?.Authorization ?? "";
    let sub = null;
    try { sub = JSON.parse(Buffer.from(authz.replace(/^Bearer\s+/i, "").split(".")[1], "base64url").toString()).sub; } catch { /* none */ }
    return sub ? res({ id: sub }) : res({ message: "no user" }, 401);
  }
  if (S.dbDown && p.startsWith("/rest/v1/")) return res({ message: "connection refused" }, 503);
  if (p === "/rest/v1/rpc/subscription_checkout_gate") return res(S.gate);
  if (p === "/rest/v1/rpc/feature_on_for") return res(S.flag);
  if (p === "/rest/v1/rpc/subscription_quote_for") return res(S.quote);
  if (p === "/rest/v1/rpc/discount_check") return res(S.check);
  if (p === "/rest/v1/rpc/discount_reserve") return res(S.reserve ?? { ...S.check, redemption_id: "red-1" });
  if (p === "/rest/v1/rpc/discount_release") return res({ ok: true });
  if (p === "/rest/v1/rpc/autopay_gateway_plan") return res(S.gatewayPlan);
  if (p === "/rest/v1/rpc/autopay_gateway_plan_save") { S.gatewayPlan ??= body.p_razorpay_plan_id; return res(S.gatewayPlan); }
  if (p === "/rest/v1/rpc/autopay_mandate_create") {
    S.mandates.set(body.p_sub_id, { vendor_id: body.p_vendor, first_order_ref: body.p_first_order_ref, plan_id: body.p_plan, status: "created", create: body });
    return res("mandate-1");
  }
  if (p === "/rest/v1/rpc/autopay_vendor_open") return res(S.open);
  if (p === "/rest/v1/rpc/autopay_mandate_event") {
    const m = S.mandates.get(body.p_sub_id);
    if (!m) return res({ known: false });
    const previous = m.status;
    const final = ["cancelled", "completed", "expired"].includes(previous);
    const status = final ? previous : body.p_status === "authenticated" && previous !== "created" ? previous : body.p_status;
    m.status = status;
    const replace = previous === "created" && ["authenticated", "active"].includes(status)
      ? [...S.mandates.entries()].filter(([id, x]) => id !== body.p_sub_id && x.vendor_id === m.vendor_id && ["authenticated", "active", "pending", "halted"].includes(x.status)).map(([id]) => id)
      : [];
    return res({ known: true, vendor_id: m.vendor_id, previous, status, changed: status !== previous, first_order_ref: m.first_order_ref, replace });
  }
  if (p === "/rest/v1/rpc/autopay_charge") {
    const m = S.mandates.get(body.p_sub_id);
    if (!m) return res({ known: false });
    const done = [...S.orders.values()].find((o) => o.payment_ref === body.p_payment_ref);
    if (done) return res({ known: true, kind: "already", order_ref: done.order_id });
    if (m.first_order_ref && S.orders.get(m.first_order_ref)?.status === "created") return res({ known: true, kind: "first", order_ref: m.first_order_ref });
    const ref = `subchg_${body.p_payment_ref}`;
    S.orders.set(ref, { order_id: ref, vendor_id: m.vendor_id, status: "created", amount: body.p_amount_paise });
    return res({ known: true, kind: "renewal", order_ref: ref });
  }
  if (p === "/rest/v1/rpc/autopay_incident") { S.incidents.push(body); return res("inc-1"); }
  if (p === "/rest/v1/rpc/subscription_fulfil") {
    const o = S.orders.get(body.p_order_ref);
    if (!o) return res({ ok: false, reason: "unknown_order" });
    if (o.status !== "created") return res({ ok: true, already: true, plan_id: "gold", invoice_id: "inv-1" });
    if (S.fulfil) return res(S.fulfil);
    Object.assign(o, { status: "paid", payment_ref: body.p_payment_ref, source: body.p_source });
    return res({ ok: true, plan_id: "gold", invoice_id: "inv-1" });
  }
  if (p === "/rest/v1/rpc/payment_event_record") {
    const seen = S.events.get(body.p_event_id);
    if (seen) return res({ duplicate: true, outcome: seen.outcome ?? null });
    S.events.set(body.p_event_id, { outcome: null });
    return res({ duplicate: false });
  }
  if (p === "/rest/v1/rpc/payment_event_finish") { Object.assign(S.events.get(body.p_event_id) ?? {}, { outcome: body.p_outcome, detail: body.p_detail }); return res(undefined, 204); }
  if (p === "/rest/v1/rpc/billing_reconcile_candidates") return res(S.candidates);
  if (p === "/rest/v1/rpc/billing_reconcile_mark") return res(undefined, 204);

  if (p === "/rest/v1/subscription_plans") { const plan = S.plans[eqv(url, "id")]; return res(plan ? [plan] : []); }
  if (p === "/rest/v1/vendor_subscriptions") return res(S.vendorSub ? [S.vendorSub] : []);
  if (p === "/rest/v1/subscription_mandates") { const m = S.mandates.get(eqv(url, "razorpay_subscription_id")); return res(m ? [m] : []); }
  if (p === "/rest/v1/subscription_payment_orders") {
    if (method === "POST") {
      if (S.failIntent) return res({ message: "intent refused" }, 400);
      S.orders.set(body.order_id, { ...body });
      return res(undefined, 201);
    }
    const o = S.orders.get(eqv(url, "order_id"));
    return res(o ? [o] : []);
  }
  return res({ message: `unmocked ${method} ${url}` }, 599);
};

const dir = mkdtempSync(path.join(tmpdir(), "cosora-autopay-"));
for (const f of ["subscription-autopay", "subscription-webhook", "billing-reconcile", "subscription-create-order"]) {
  const outfile = path.join(dir, `${f}.mjs`);
  await build({ entryPoints: [`supabase/functions/${f}/index.ts`], outfile, format: "esm", platform: "node", bundle: true, logLevel: "silent" });
  loading = f;
  await import(pathToFileURL(outfile).href);
}

const jwt = (sub, role = "authenticated") => `x.${Buffer.from(JSON.stringify({ sub, role })).toString("base64url")}.y`;
async function call(fn, body, { sub = VENDOR, env = LIVE, token } = {}) {
  ENV = env;
  const r = await handlers[fn](new Request(`${SB}/functions/v1/${fn}`, {
    method: "POST", headers: { authorization: `Bearer ${token ?? jwt(sub)}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: r.status, body: await r.json() };
}
async function hook(evt, eventId) {
  ENV = LIVE;
  const raw = JSON.stringify(evt);
  const sig = createHmac("sha256", HOOK_SECRET).update(raw).digest("hex");
  const r = await handlers["subscription-webhook"](new Request(`${SB}/functions/v1/subscription-webhook`, {
    method: "POST", headers: { "x-razorpay-signature": sig, "x-razorpay-event-id": eventId }, body: raw,
  }));
  return { status: r.status, body: await r.json().catch(() => null) };
}
const sign = (paymentId, subId) => createHmac("sha256", KEY_SECRET).update(`${paymentId}|${subId}`).digest("hex");
const rpcCalls = (fn) => S.calls.filter((c) => c.url.endsWith(`/rpc/${fn}`));
const rzp = (re) => S.calls.filter((c) => c.url.startsWith("https://api.razorpay.com") && re.test(new URL(c.url).pathname));
const subEvent = (event, subId, payment) => ({ event, payload: { subscription: { entity: { id: subId, charge_at: 1800000000, payment_method: "upi" } },
  ...(payment ? { payment: { entity: payment } } : {}) } });

let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 100) });
}

// ── A. start ────────────────────────────────────────────────────────────────
reset({ flag: false });
let r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly" });
check("A1 switch off for the account: refused, nothing made", r.body.error === "autopay_not_open" && rzp(/./).length === 0 && S.orders.size === 0, JSON.stringify(r.body));

reset();
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly" }, { env: NO_KEYS });
check("A2 no Razorpay keys: not_configured, nothing asked", r.body.error === "not_configured" && S.calls.filter((c) => c.url.includes("/rest/v1/")).length === 0);

reset({ gate: { ok: false, reason: "suspended" } });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly" });
check("A3 the checkout gate refuses: nothing made", r.body.error === "suspended" && rzp(/./).length === 0);

reset();
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly", gstNumber: "24AAPFU0939F1Z1" });
let sub = S.rzpSubs[0];
let order = S.orders.get(sub?.id);
check("A4 new: a Razorpay plan at ₹2,299 + GST, monthly", S.rzpPlans.length === 1 && S.rzpPlans[0].item.amount === 271300 && S.rzpPlans[0].period === "monthly" && S.rzpPlans[0].interval === 1,
  JSON.stringify(S.rzpPlans[0]?.item));
check("A4 new: the subscription starts when the first period ends, with the first period as its upfront amount",
  sub?.start_at === Math.floor(new Date(PERIOD_END).getTime() / 1000) && sub.addons?.[0]?.item.amount === 271300 && sub.total_count === 120
  && sub.plan_id === S.rzpPlans[0].id && sub.expire_by > Date.now() / 1000 && sub.expire_by < sub.start_at, JSON.stringify({ start: sub?.start_at, addons: sub?.addons }));
check("A4 new: the order is keyed by the subscription, marked autopay, in the key's mode",
  order?.autopay === true && order.amount === 271300 && order.payment_mode === "test" && order.list_rupees === 2299 && order.gst_number === "24AAPFU0939F1Z1"
  && order.change_kind === "new", JSON.stringify(order));
const created = rpcCalls("autopay_mandate_create")[0]?.body;
check("A4 new: the mandate records the renewal amount and its first order",
  created?.p_sub_id === sub?.id && created.p_amount_paise === 271300 && created.p_list_rupees === 2299 && created.p_first_order_ref === sub.id
  && created.p_mode === "test" && created.p_start_at === PERIOD_END, JSON.stringify(created));
check("A4 new: the browser gets what Checkout needs", r.body.subscriptionId === sub?.id && r.body.keyId === "rzp_test_key" && r.body.amount === 271300
  && r.body.renewalAmount === 271300 && r.body.startsAt === PERIOD_END, JSON.stringify(r.body));

reset({ gatewayPlan: "plan_saved" });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly" });
check("A5 a saved Razorpay plan is reused", S.rzpPlans.length === 0 && S.rzpSubs[0]?.plan_id === "plan_saved");

reset({ quote: { ok: true, kind: "upgrade", plan_id: "gold", billing_cycle: "monthly", list_rupees: 2299, credit_rupees: 466, charge_rupees: 1833,
                 period_start: new Date().toISOString(), period_end: PERIOD_END, starts_now: true } });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly", discountCode: " launch25 " });
sub = S.rzpSubs[0];
order = S.orders.get(sub?.id);
check("A6 upgrade + code: the upfront amount is the credited, discounted charge with GST; renewals are the list price",
  sub?.addons[0].item.amount === (1375 + 248) * 100 && S.rzpPlans[0].item.amount === 271300 && r.body.renewalAmount === 271300, sub?.addons[0].item.amount);
check("A6 the code is judged on the charge and held against the subscription",
  rpcCalls("discount_check")[0]?.body.p_plan_rupees === 1833 && rpcCalls("discount_reserve")[0]?.body.p_order_ref === sub?.id
  && order?.discount_rupees === 458 && order.discount_redemption_id === "red-1" && order.credit_rupees === 466 && order.change_kind === "upgrade",
  JSON.stringify(order));

reset({ reserve: { ok: false, reason: "exhausted" } });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" });
check("A7 the code's last use went elsewhere: the Razorpay subscription is cancelled, nothing kept",
  r.body.error === "discount" && r.body.reason === "exhausted" && S.rzpCancels[0] === S.rzpSubs[0]?.id && S.orders.size === 0 && S.mandates.size === 0, JSON.stringify(r.body));

reset({ failIntent: true });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" });
check("A8 the order can't be written: the code is released and the subscription cancelled",
  r.body.error === "intent_failed" && rpcCalls("discount_release").length === 1 && S.rzpCancels.length === 1 && S.mandates.size === 0, JSON.stringify(r.body));

reset({ quote: { ok: true, kind: "upgrade", plan_id: "gold", billing_cycle: "monthly", list_rupees: 2299, credit_rupees: 2299, charge_rupees: 0,
                 period_start: new Date().toISOString(), period_end: PERIOD_END, starts_now: true } });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly" });
sub = S.rzpSubs[0];
check("A9 credit covers the first period: no upfront amount, a ₹0 order in free mode",
  sub && !("addons" in sub) && S.orders.get(sub.id)?.amount === 0 && S.orders.get(sub.id).payment_mode === "free" && r.body.amount === 0, JSON.stringify(S.orders.get(sub?.id)));

reset({ quote: { ok: false, reason: "already_scheduled" } });
r = await call("subscription-autopay", { action: "start", planId: "gold", billingCycle: "monthly" });
check("A10 a paid next period already waits: refused, nothing made", r.body.error === "already_scheduled" && rzp(/./).length === 0);

reset({ vendorSub: { plan_id: "gold", billing_cycle: "monthly", status: "active", current_period_end: PERIOD_END } });
r = await call("subscription-autopay", { action: "start", existing: true });
sub = S.rzpSubs[0];
check("A11 autopay on for a paid plan: starts at the period's end, nothing charged now, no order",
  sub?.start_at === Math.floor(new Date(PERIOD_END).getTime() / 1000) && !("addons" in sub) && S.orders.size === 0
  && rpcCalls("autopay_mandate_create")[0]?.body.p_first_order_ref === null && rpcCalls("subscription_quote_for").length === 0 && r.body.change === "autopay_on",
  JSON.stringify(r.body));

reset({ vendorSub: { plan_id: "free", billing_cycle: "monthly", status: "active", current_period_end: null } });
r = await call("subscription-autopay", { action: "start", existing: true });
check("A12 no paid plan to turn autopay on for", r.body.error === "no_paid_plan" && rzp(/./).length === 0);

reset({ vendorSub: { plan_id: "gold", billing_cycle: "monthly", status: "active", current_period_end: new Date(Date.now() + 30 * 60_000).toISOString() } });
r = await call("subscription-autopay", { action: "start", existing: true });
check("A13 the period ends within the hour: too close to start an autopay", r.body.error === "too_close_to_renewal" && rzp(/./).length === 0);

// ── B. verify ───────────────────────────────────────────────────────────────
function seed({ firstOrder = true, amount = 271300, vendor = VENDOR } = {}) {
  S.mandates.set("sub_A", { vendor_id: vendor, first_order_ref: firstOrder ? "sub_A" : null, plan_id: "gold", status: "created" });
  if (firstOrder) S.orders.set("sub_A", { order_id: "sub_A", vendor_id: vendor, status: "created", amount });
}
reset(); seed();
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_1", signature: "0".repeat(64) });
check("B1 bad signature: nothing touched", r.body.error === "bad_signature" && rpcCalls("autopay_mandate_event").length === 0 && S.orders.get("sub_A").status === "created");

reset(); seed({ vendor: OTHER });
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_1", signature: sign("pay_1", "sub_A") });
check("B2 someone else's subscription: refused", r.body.error === "unknown_subscription" && rpcCalls("subscription_fulfil").length === 0);

reset(); seed();
S.mandates.set("sub_OLD", { vendor_id: VENDOR, first_order_ref: null, plan_id: "basic", status: "active" });
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_1", signature: sign("pay_1", "sub_A") });
let f = rpcCalls("subscription_fulfil")[0]?.body;
check("B3 good signature (payment|subscription): authenticated, the first order fulfilled with the payment",
  r.body.ok === true && r.body.autopay === true && S.mandates.get("sub_A").status === "authenticated"
  && f?.p_order_ref === "sub_A" && f.p_payment_ref === "pay_1" && f.p_source === "verify", JSON.stringify(r.body));
check("B3 the mandate it replaces is cancelled at Razorpay and marked", S.rzpCancels.join() === "sub_OLD" && S.mandates.get("sub_OLD").status === "cancelled" && r.body.replaced === 1);
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_1", signature: sign("sub_A", "pay_1") });
check("B3 the order|payment form of the signature is not accepted", r.body.error === "bad_signature");

reset(); seed({ amount: 0 });
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_auth", signature: sign("pay_auth", "sub_A") });
check("B4 a ₹0 first order: fulfilled with no payment of its own", r.body.ok && rpcCalls("subscription_fulfil")[0]?.body.p_payment_ref === null);

reset(); seed({ firstOrder: false });
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_auth", signature: sign("pay_auth", "sub_A") });
check("B5 autopay turned on for a paid plan: authenticated, nothing to fulfil", r.body.ok && rpcCalls("subscription_fulfil").length === 0 && S.mandates.get("sub_A").status === "authenticated");

reset({ rzpCancelFails: true }); seed();
S.mandates.set("sub_OLD", { vendor_id: VENDOR, first_order_ref: null, plan_id: "basic", status: "active" });
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_1", signature: sign("pay_1", "sub_A") });
check("B6 the old mandate won't cancel: a billing incident, since it could charge twice",
  r.body.ok && r.body.replaceFailed === 1 && S.incidents[0]?.p_kind === "autopay_cancel_failed" && S.incidents[0].p_sub_id === "sub_OLD"
  && S.mandates.get("sub_OLD").status === "active", JSON.stringify(S.incidents[0]));

reset({ fulfil: { ok: false, reason: "activation_failed", incident_id: "inc-9" } }); seed();
r = await call("subscription-autopay", { action: "verify", subscriptionId: "sub_A", paymentId: "pay_1", signature: sign("pay_1", "sub_A") });
check("B7 the plan can't be activated after payment: says so, and that the money was taken", r.body.ok === false && r.body.error === "activation_failed" && r.body.paid === true);

// ── C. cancel ───────────────────────────────────────────────────────────────
reset({ open: { sub_id: "sub_A", status: "active", plan_id: "gold", billing_cycle: "monthly", amount_paise: 271300 } }); seed();
S.mandates.get("sub_A").status = "active";
r = await call("subscription-autopay", { action: "cancel" });
check("C1 autopay off: cancelled at Razorpay now, then marked", r.body.ok === true && S.rzpCancels.join() === "sub_A" && S.mandates.get("sub_A").status === "cancelled"
  && rzp(/cancel$/)[0].body.cancel_at_cycle_end === false);
reset();
r = await call("subscription-autopay", { action: "cancel" });
check("C2 no autopay: nothing to do", r.body.ok === true && r.body.already === true && rzp(/./).length === 0);
reset({ rzpCancelFails: true, open: { sub_id: "sub_A", status: "active" } }); seed();
S.mandates.get("sub_A").status = "active";
r = await call("subscription-autopay", { action: "cancel" });
check("C3 Razorpay won't cancel: said so, still on, an incident", r.body.ok === false && r.body.error === "cancel_failed" && S.mandates.get("sub_A").status === "active" && S.incidents.length === 1);

// ── D. the webhook ──────────────────────────────────────────────────────────
reset(); seed();
S.mandates.get("sub_A").status = "active";
S.orders.get("sub_A").status = "paid";
let h = await hook(subEvent("subscription.charged", "sub_A", { id: "pay_R2", amount: 271300, method: "upi" }), "evt_c1");
f = rpcCalls("subscription_fulfil")[0]?.body;
check("D1 charged: a renewal order for that payment, fulfilled as a webhook",
  h.status === 200 && h.body.outcome === "renewed" && f?.p_order_ref === "subchg_pay_R2" && f.p_payment_ref === "pay_R2" && f.p_source === "webhook"
  && rpcCalls("autopay_charge")[0].body.p_amount_paise === 271300, JSON.stringify(h.body));
check("D1 charged: the mandate is active, with the method and next charge", rpcCalls("autopay_mandate_event")[0].body.p_status === "active"
  && rpcCalls("autopay_mandate_event")[0].body.p_method === "upi" && rpcCalls("autopay_mandate_event")[0].body.p_charge_at === new Date(1800000000 * 1000).toISOString());
h = await hook(subEvent("subscription.charged", "sub_A", { id: "pay_R2", amount: 271300 }), "evt_c2");
check("D2 the same charge in another event: already fulfilled, nothing more", h.body.outcome === "already_fulfilled" && rpcCalls("subscription_fulfil").length === 1);

reset(); seed();
h = await hook(subEvent("subscription.charged", "sub_A", { id: "pay_U1", amount: 271300 }), "evt_c3");
check("D3 charged before the browser verified: it is the first order's payment", h.body.outcome === "fulfilled" && rpcCalls("subscription_fulfil")[0]?.body.p_order_ref === "sub_A"
  && S.orders.size === 1);

reset({ rzpInvoices: { sub_A: [{ payment_id: "pay_UP", status: "paid", created_at: 5 }, { payment_id: "pay_later", status: "paid", created_at: 9 }] } }); seed();
h = await hook(subEvent("subscription.authenticated", "sub_A"), "evt_a1");
check("D4 authenticated, browser gone: Razorpay is asked for the upfront payment, and the first order fulfilled with it",
  h.body.outcome === "fulfilled" && rpcCalls("subscription_fulfil")[0]?.body.p_payment_ref === "pay_UP" && rzp(/^\/v1\/invoices$/).length === 1, JSON.stringify(h.body));

reset(); seed();
h = await hook(subEvent("subscription.authenticated", "sub_A"), "evt_a2");
check("D5 authenticated, Razorpay hasn't invoiced yet: waits, fulfils nothing", h.body.outcome === "awaiting_payment" && rpcCalls("subscription_fulfil").length === 0);

reset(); seed();
S.mandates.get("sub_A").status = "active";
for (const [event, want] of [["subscription.pending", "pending"], ["subscription.halted", "halted"], ["subscription.cancelled", "cancelled"]]) {
  h = await hook(subEvent(event, "sub_A"), `evt_${want}`);
  check(`D6 ${event}: the mandate is ${want}`, h.body.outcome === `mandate_${want}` && S.mandates.get("sub_A").status === want, JSON.stringify(h.body));
}
h = await hook(subEvent("subscription.activated", "sub_A"), "evt_late");
check("D6 an event after cancelled changes nothing", S.mandates.get("sub_A").status === "cancelled");

reset();
h = await hook(subEvent("subscription.charged", "sub_ELSE", { id: "pay_x", amount: 100 }), "evt_n1");
check("D7 a subscription that isn't ours: not_ours, nothing made", h.body.outcome === "not_ours" && rpcCalls("autopay_charge").length === 0);
h = await hook(subEvent("subscription.updated", "sub_A"), "evt_u1");
check("D7 subscription.updated: ignored", h.body.outcome === "ignored");

reset({ dbDown: true }); seed();
h = await hook(subEvent("subscription.charged", "sub_A", { id: "pay_R3", amount: 271300 }), "evt_d1");
check("D8 database down: 500, so Razorpay retries", h.status === 500);

// ── E. the reconciler ───────────────────────────────────────────────────────
const SERVICE = jwt(undefined, "service_role");
reset({ candidates: [{ order_id: "sub_A", vendor_id: VENDOR, payment_mode: "test" }, { order_id: "sub_B", vendor_id: VENDOR, payment_mode: "test" },
                     { order_id: "subchg_pay_R9", vendor_id: VENDOR, payment_mode: "test" }],
        rzpSubStatus: { sub_A: "authenticated", sub_B: "created" }, rzpInvoices: { sub_A: [{ payment_id: "pay_UP", status: "paid", created_at: 1 }] } });
seed();
S.mandates.set("sub_B", { vendor_id: VENDOR, first_order_ref: "sub_B", plan_id: "gold", status: "created" });
S.orders.set("sub_B", { order_id: "sub_B", status: "created", amount: 271300 });
S.orders.set("subchg_pay_R9", { order_id: "subchg_pay_R9", status: "created", amount: 271300 });
r = await call("billing-reconcile", {}, { token: SERVICE });
const fulfils = rpcCalls("subscription_fulfil").map((c) => `${c.body.p_order_ref}:${c.body.p_payment_ref}:${c.body.p_source}`);
check("E1 a subscription set up at Razorpay: its first order fulfilled with the upfront payment", fulfils.includes("sub_A:pay_UP:reconcile") && S.mandates.get("sub_A").status === "authenticated",
  fulfils.join(" "));
check("E2 one still at checkout: left unpaid", S.orders.get("sub_B").status === "created" && S.mandates.get("sub_B").status === "created");
check("E3 a renewal order: fulfilled with the payment its id names", fulfils.includes("subchg_pay_R9:pay_R9:reconcile"));
check("E4 all three marked; the tally adds up", rpcCalls("billing_reconcile_mark").length === 3 && r.body.fulfilled === 2 && r.body.unpaid === 1 && r.body.failed === 0, JSON.stringify(r.body));

// ── F. one-off checkout while autopay is on ─────────────────────────────────
reset({ open: { sub_id: "sub_A", status: "active" } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
check("F1 one-off checkout is refused while autopay is on", r.body.error === "autopay_active" && rzp(/^\/v1\/orders$/).length === 0 && S.orders.size === 0, JSON.stringify(r.body));
reset();
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
check("F2 and goes ahead as before without it", r.body.configured === true && rzp(/^\/v1\/orders$/).length === 1 && r.body.amount === 271300, JSON.stringify(r.body));

console.table(rows);
console.log(failures === 0 ? `\nAUTOPAY CONSISTENT — ${rows.length} checks` : `\n${failures} CHECK(S) FAILED`);
rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
