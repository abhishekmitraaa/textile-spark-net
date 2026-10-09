#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// "A discount code changes what is charged and invoiced, and nothing else."
// (admin completion Phase 10, 2026-09-29)
//
// Runs the eight payment edge functions' real code in Node: each is bundled with
// esbuild, Deno.serve / Deno.env are stubbed, and fetch() answers from an
// in-memory stand-in for PostgREST and Razorpay that records every call. No
// network, no database: the database side (discount_check / reserve / confirm /
// release) is scripts/admin-completion/14_discounts.sql, the race is
// scripts/discount-race-check.sql, and the fulfilment transaction with its invoice
// arithmetic is scripts/subscriptions/p1_billing_core.sql. This proves the functions
// around them:
//
//   * with no code, every function sends exactly what it sent before Phase 10
//   * a code is checked before a Razorpay order exists, reserved against the
//     order id after it, and a failed intent write releases it
//   * a lost race (reserve refused after check) leaves no intent, so nothing
//     can be paid for it
//   * the intent stores what was charged (list, discount, credit, kind, payment
//     mode); since subscriptions P1 (2026-10-08) a plan order is completed by ONE
//     database call, public.subscription_fulfil, from verify, the webhook and the
//     reconciler alike, and no function writes a plan or an invoice itself
//   * a ₹0 order has no Razorpay order and is fulfilled only when it is the
//     caller's and its stored amount is 0
//   * demo mode applies a code through the same reserve / confirm / release, and a
//     refused demo or ₹0 fulfilment releases the code and closes the order
//   * the subscription webhook records each event once, retries what the database
//     couldn't take, and handles refund and dispute events
//   * the ad webhooks confirm the use when they are the ones to claim the order
//
//   node scripts/discount-flow-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { createHash, createHmac } from "node:crypto";
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
const DEMO = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-key" };

// ── Deno, stubbed ───────────────────────────────────────────────────────────
let ENV = LIVE;
const handlers = {};
let loading = null;
globalThis.Deno = { serve: (h) => { handlers[loading] = h; }, env: { get: (k) => ENV[k] } };

// ── The stand-in for PostgREST and Razorpay ─────────────────────────────────
let S; // state, reset per scenario
function reset(over = {}) {
  S = {
    calls: [],
    plans: { gold: { monthly_price: 2299, yearly_price: 22990, is_invite_only: false },
             vip: { monthly_price: 22000, yearly_price: 220000, is_invite_only: true } },
    subIntents: new Map(), adOrders: new Map(),
    invoices: [], ads: [], subsUpserts: [],
    check: { ok: true, code: "LAUNCH25", applies_to: "vendor_plan", kind: "percent", value: 25, discount_rupees: 575 },
    reserve: null, // defaults to check + redemption id
    confirmOk: true,
    failIntent: false, failSubscription: false, failAds: false,
    adScope: "pan_india",
    // Subscriptions P5: whether state targeting is on for the vendor, and their own state.
    stateTargeting: true, homeState: "GJ", reachFails: false,
    razorpaySeq: 0,
    // Plan changes (2026-10-02): what subscription_quote_for / subscription_activate
    // answer. null = a first purchase at the plan's price.
    quote: null, activation: null,
    // Subscriptions P0 (2026-10-08): what Auth says about the bearer token (null =
    // the token's own sub; false = Auth refuses it), and what the checkout gate answers.
    authId: null, authOk: true,
    gate: { ok: true }, gateFails: false,
    // Subscriptions P1 (2026-10-08): subscription_fulfil's answer (null = the default
    // model below; { status, body } = an error response), the database being down,
    // the webhook event store, and Razorpay's payments per order for the reconciler.
    fulfil: null, fulfilDown: false, fulfilled: [],
    events: new Map(),
    candidates: [], rzpPayments: {}, rzpPaymentsFail: false,
    refundMatched: true,
    ...over,
  };
}
const PERIOD = { period_start: "2026-10-02T00:00:00.000Z", period_end: "2026-11-02T00:00:00.000Z" };
function defaultQuote(body) {
  const plan = S.plans[body.p_plan];
  const price = plan ? (body.p_cycle === "yearly" ? plan.yearly_price : plan.monthly_price) : 0;
  return { ok: true, kind: "new", plan_id: body.p_plan, billing_cycle: body.p_cycle, list_rupees: price,
           credit_rupees: 0, charge_rupees: price, starts_now: true, ...PERIOD };
}
const res = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const q = (u, k) => new URL(u).searchParams.get(k);
const eqv = (u, k) => (q(u, k) ?? "").replace(/^eq\./, "");

/**
 * public.subscription_fulfil's contract, as the SQL harness proves it: an unknown order
 * is refused, a done one answers `already`, a ₹0 order whose redemption won't confirm
 * claims nothing; otherwise the order is claimed and invoiced in one go.
 */
function fulfilModel(body) {
  if (S.fulfilDown) return res({ message: "connection refused" }, 503);
  const o = S.subIntents.get(body.p_order_ref);
  if (!o) return res({ ok: false, reason: "unknown_order" });
  if (o.status !== "created") return res({ ok: o.status === "paid", already: true, plan_id: o.plan_id, invoice_id: "inv-1" });
  if (S.fulfil) return S.fulfil.status ? res(S.fulfil.body, S.fulfil.status) : res(S.fulfil);
  if (Number(o.amount) === 0 && o.discount_redemption_id && !S.confirmOk) return res({ ok: false, reason: "discount_unconfirmed" });
  o.status = "paid";
  S.fulfilled.push({ ...body });
  return res({ ok: true, plan_id: o.plan_id, invoice_id: "inv-1", invoice_number: "RCT/2627/000001", document_type: "receipt" });
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  let body;
  try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  S.calls.push({ method, url, body });
  const p = new URL(url).pathname;

  // Razorpay: an order's payments (the reconciler), then order creation.
  const pays = /^\/v1\/orders\/([^/]+)\/payments$/.exec(p);
  if (url.startsWith("https://api.razorpay.com") && pays) {
    if (S.rzpPaymentsFail) return res({ error: { description: "server error" } }, 502);
    return res({ items: S.rzpPayments[decodeURIComponent(pays[1])] ?? [] });
  }
  if (url.startsWith("https://api.razorpay.com/v1/orders")) return res({ id: `order_T${++S.razorpaySeq}`, amount: body.amount });

  // Supabase Auth: the user behind the bearer token (subscriptions P0, S-5).
  if (p === "/auth/v1/user") {
    if (!S.authOk) return res({ message: "invalid JWT" }, 401);
    const authz = init.headers?.authorization ?? init.headers?.Authorization ?? "";
    let sub = null;
    try { sub = JSON.parse(Buffer.from(authz.replace(/^Bearer\s+/i, "").split(".")[1], "base64url").toString()).sub; } catch { /* none */ }
    return sub ? res({ id: S.authId ?? sub }) : res({ message: "no user" }, 401);
  }
  if (p === "/rest/v1/rpc/subscription_checkout_gate") return S.gateFails ? res({ message: "boom" }, 500) : res(S.gate);
  // Autopay (P3): no mandate here; scripts/subscriptions/autopay-flow-check.mjs covers the refusal.
  if (p === "/rest/v1/rpc/autopay_vendor_open") return res(null);

  if (p === "/rest/v1/rpc/discount_check") return res(S.check);
  if (p === "/rest/v1/rpc/discount_reserve") return res(S.reserve ?? (S.check.ok ? { ...S.check, redemption_id: "red-1" } : S.check));
  if (p === "/rest/v1/rpc/discount_confirm") return res({ ok: S.confirmOk });
  if (p === "/rest/v1/rpc/discount_release") return res({ ok: true });
  if (p === "/rest/v1/rpc/next_invoice_number") return res("INV-0001");
  if (p === "/rest/v1/rpc/subscription_quote_for") return res(S.quote ?? defaultQuote(body));
  if (p === "/rest/v1/rpc/subscription_activate") {
    if (S.failSubscription) return res({ message: "boom" }, 500);
    S.subsUpserts.push(body);
    return res({ ...(S.activation ?? S.quote ?? defaultQuote(body)), subscription_id: "sub-1" });
  }

  // Subscriptions P1: the fulfilment transaction, the event store, refunds, disputes, reconciling.
  if (p === "/rest/v1/rpc/subscription_fulfil") return fulfilModel(body);
  if (p === "/rest/v1/rpc/payment_event_record") {
    const seen = S.events.get(body.p_event_id);
    if (seen) return res({ duplicate: true, outcome: seen.outcome ?? null });
    S.events.set(body.p_event_id, { ...body, outcome: null });
    return res({ duplicate: false });
  }
  if (p === "/rest/v1/rpc/payment_event_finish") {
    const e = S.events.get(body.p_event_id);
    if (e) Object.assign(e, { outcome: body.p_outcome, detail: body.p_detail });
    return res(undefined, 204);
  }
  if (p === "/rest/v1/rpc/subscription_refund_event") return res({ matched: S.refundMatched, invoice_id: S.refundMatched ? "inv-r" : null });
  if (p === "/rest/v1/rpc/billing_dispute_event") return res("inc-d");
  if (p === "/rest/v1/rpc/billing_reconcile_candidates") return res(S.candidates);
  if (p === "/rest/v1/rpc/billing_reconcile_mark") return res(undefined, 204);

  // Subscriptions P5: admin.ad_reach, as the database answers it (the plan in force decides).
  if (p === "/rest/v1/rpc/ad_reach_resolve") {
    if (S.reachFails) return res({ message: "boom" }, 500);
    const allow = S.adScope === "state_1" ? 1 : S.adScope === "state_4" ? 4 : null;
    if (S.adScope === "none") return res({ ok: false, blocked: true, reason: "no_ads_on_plan", message: "Advertising is a paid feature" });
    const cities = body.p_cities ?? [];
    if (!S.stateTargeting) {
      const kept = allow !== null ? cities.slice(0, allow) : cities;
      return res({ ok: true, blocked: false, state_targeting: false, states: [], countries: [], cities: kept, requested: cities.length, allowed: allow ?? cities.length });
    }
    let states = [...new Set((body.p_states ?? []).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
    let countries = [...new Set((body.p_countries ?? []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x) && x !== "IN"))];
    const asked = states.length;
    if (countries.length && S.adScope !== "global") {
      if (body.p_strict) return res({ ok: false, blocked: false, reason: "countries_need_vip", message: "Reaching buyers outside India is part of the VIP plan." });
      countries = [];
    }
    if (allow !== null) {
      if (states.length === 0) {
        if (!S.homeState) return res({ ok: false, blocked: !body.p_strict, reason: "choose_state", message: "Choose the state this ad should reach." });
        states = [S.homeState];
      } else if (states.length > allow) {
        if (body.p_strict) return res({ ok: false, blocked: false, reason: "too_many_states", message: "Ad targeting exceeds your plan" });
        states = states.slice(0, allow);
      }
    }
    return res({ ok: true, blocked: false, state_targeting: true, states, countries, cities: [], requested: asked, allowed: allow ?? states.length });
  }

  if (p === "/rest/v1/subscription_plans") {
    const plan = S.plans[eqv(url, "id")];
    if ((q(url, "select") ?? "").includes("limits")) return res([{ limits: { ad_location_scope: S.adScope } }]);
    return res(plan ? [plan] : []);
  }
  if (p === "/rest/v1/vendor_subscriptions" && method === "GET") {
    return res([{ plan_id: "gold", status: "active", current_period_end: new Date(Date.now() + 864e5).toISOString() }]);
  }
  if (p === "/rest/v1/vendor_subscriptions") {
    if (S.failSubscription) return res({ message: "boom" }, 500);
    S.subsUpserts.push(body);
    return res([{ id: "sub-1" }], 201);
  }
  if (p === "/rest/v1/vendor_profiles") return res(undefined, 204);

  for (const [table, map] of [["subscription_payment_orders", S.subIntents], ["ad_orders", S.adOrders]]) {
    if (p !== `/rest/v1/${table}`) continue;
    if (method === "POST") {
      if (S.failIntent) return res({ message: "intent refused" }, 400);
      map.set(body.order_id, { ...body });
      return res(undefined, 201);
    }
    const row = map.get(eqv(url, "order_id"));
    if (method === "GET") return res(row ? [row] : []);
    if (method === "PATCH") {
      const wantStatus = q(url, "status");
      if (!row || (wantStatus && row.status !== wantStatus.replace(/^eq\./, ""))) return res([]);
      Object.assign(row, body);
      return res([{ ...row }]);
    }
  }
  if (p === "/rest/v1/subscription_invoices") { S.invoices.push(body); return res(undefined, 201); }
  if (p === "/rest/v1/advertisements") {
    if (S.failAds) return res({ message: "boom" }, 500);
    S.ads.push(...body);
    return res(undefined, 201);
  }
  return res({ message: `unmocked ${method} ${url}` }, 599);
};

// ── Load the functions ──────────────────────────────────────────────────────
const dir = mkdtempSync(path.join(tmpdir(), "cosora-discount-flow-"));
const FUNCTIONS = ["subscription-create-order", "subscription-verify-payment", "subscription-webhook",
                   "razorpay-create-order", "razorpay-verify-payment", "razorpay-webhook", "discount-quote",
                   "billing-reconcile"];
for (const f of FUNCTIONS) {
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
async function hook(fn, evt, { sign = true, eventId } = {}) {
  ENV = LIVE;
  const raw = JSON.stringify(evt);
  const sig = sign ? createHmac("sha256", HOOK_SECRET).update(raw).digest("hex") : "bad";
  const headers = { "x-razorpay-signature": sig, ...(eventId ? { "x-razorpay-event-id": eventId } : {}) };
  const r = await handlers[fn](new Request(`${SB}/functions/v1/${fn}`, { method: "POST", headers, body: raw }));
  return { status: r.status, text: await r.text() };
}
const sign = (orderId, paymentId) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const rpcCalls = (fn) => S.calls.filter((c) => c.url.endsWith(`/rpc/${fn}`));
const rzpCalls = () => S.calls.filter((c) => c.url.startsWith("https://api.razorpay.com"));
const indexOf = (pred) => S.calls.findIndex(pred);
/** A function wrote a plan or an invoice itself, instead of through subscription_fulfil. */
const edgeWrites = () => rpcCalls("subscription_activate").length + S.invoices.length + rpcCalls("next_invoice_number").length;
const captured = (payId, orderId) => ({ event: "payment.captured", payload: { payment: { entity: { id: payId, order_id: orderId } } } });

let failures = 0;
const rows = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 110) });
}

const SPEC = {
  placementIds: ["openListing", "verifiedCertificate"], days: 7, campaignLabel: "Launch",
  items: [{ productId: "p1", title: "Shirt", imageUrl: null }, { productId: "p2", title: "Saree", imageUrl: null }],
};
// openListing ₹22 × 7 days × 2 products = ₹308; the certificate ₹199 once: ₹507.

// ── A. subscription-create-order ────────────────────────────────────────────
reset();
let r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
let intent = [...S.subIntents.values()][0];
check("A1 no code: Razorpay gets ₹2,299 + GST", rzpCalls()[0]?.body.amount === 271300, rzpCalls()[0]?.body.amount);
check("A1 no code: no discount calls", rpcCalls("discount_check").length + rpcCalls("discount_reserve").length === 0);
check("A1 no code: intent stores the list price, no discount",
  intent?.amount === 271300 && intent.list_rupees === 2299 && intent.discount_rupees === 0 && intent.discount_code === null && intent.discount_redemption_id === null,
  JSON.stringify(intent));
check("A1 no code: response unchanged in substance", r.body.configured && r.body.amount === 271300 && r.body.base === 2299 && r.body.gst === 414 && r.body.free === false,
  JSON.stringify(r.body));
check("A1 test keys: the intent is a test-mode order", intent?.payment_mode === "test", intent?.payment_mode);

reset();
await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" }, { env: { ...LIVE, RAZORPAY_KEY_ID: "rzp_live_key" } });
check("A1 live keys: the intent is a live order", [...S.subIntents.values()][0]?.payment_mode === "live", [...S.subIntents.values()][0]?.payment_mode);

reset();
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "  launch25 " });
intent = [...S.subIntents.values()][0];
const chk = rpcCalls("discount_check")[0]?.body;
const rsv = rpcCalls("discount_reserve")[0]?.body;
check("A2 code: checked with the plan and its price, upper-cased", chk?.p_code === "LAUNCH25" && chk.p_plan_id === "gold" && chk.p_plan_rupees === 2299 && chk.p_order_kind === "subscription",
  JSON.stringify(chk));
check("A2 code: checked before Razorpay, reserved after it, before the intent",
  indexOf((c) => c.url.endsWith("/rpc/discount_check")) < indexOf((c) => c.url.startsWith("https://api.razorpay.com"))
  && indexOf((c) => c.url.startsWith("https://api.razorpay.com")) < indexOf((c) => c.url.endsWith("/rpc/discount_reserve"))
  && indexOf((c) => c.url.endsWith("/rpc/discount_reserve")) < indexOf((c) => c.url.endsWith("/subscription_payment_orders") && c.method === "POST"));
check("A2 code: Razorpay gets ₹1,724 + GST ₹310", rzpCalls()[0]?.body.amount === 203400, rzpCalls()[0]?.body.amount);
check("A2 code: reserved against the Razorpay order, at the quoted discount",
  rsv?.p_order_ref === "order_T1" && rsv.p_expected_rupees === 575 && rsv.p_plan_rupees === 2299, JSON.stringify(rsv));
check("A2 code: intent stores list, discount, code and redemption",
  intent?.amount === 203400 && intent.list_rupees === 2299 && intent.discount_rupees === 575 && intent.discount_code === "LAUNCH25" && intent.discount_redemption_id === "red-1",
  JSON.stringify(intent));
check("A2 code: response shows the discount", r.body.discount === 575 && r.body.list === 2299 && r.body.discountCode === "LAUNCH25" && r.body.free === false, JSON.stringify(r.body));

reset({ check: { ok: false, reason: "expired" } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "OLD10" });
check("A3 refused code: says why, creates nothing", r.body.error === "discount" && r.body.reason === "expired" && rzpCalls().length === 0 && S.subIntents.size === 0,
  JSON.stringify(r.body));

reset({ reserve: { ok: false, reason: "exhausted" } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" });
check("A4 last use lost after the check: refused, no intent (nothing payable)", r.body.error === "discount" && r.body.reason === "exhausted" && S.subIntents.size === 0,
  `${JSON.stringify(r.body)}; razorpay orders ${rzpCalls().length}`);

reset({ failIntent: true });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" });
const rel = rpcCalls("discount_release")[0]?.body;
check("A5 intent write fails: the use is released", r.body.error === "intent_failed" && rel?.p_redemption === "red-1" && rel.p_order_ref === "order_T1", JSON.stringify(rel));

reset({ check: { ok: true, code: "FREEMONTH", applies_to: "vendor_plan", kind: "percent", value: 100, discount_rupees: 2299 } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "FREEMONTH" });
intent = [...S.subIntents.values()][0];
check("A6 100% off: no Razorpay order, a free_ id, ₹0 intent in free mode",
  rzpCalls().length === 0 && r.body.free === true && /^free_/.test(r.body.orderId) && intent?.amount === 0 && intent.discount_rupees === 2299 && intent.payment_mode === "free",
  JSON.stringify(r.body));
const freeSubOrder = r.body.orderId;

reset();
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" }, { env: DEMO });
check("A7 demo mode: not_configured before anything, code or not", r.body.error === "not_configured" && S.calls.length === 0);

reset();
r = await call("subscription-create-order", { planId: "vip", billingCycle: "monthly", discountCode: "LAUNCH25" });
check("A8 invite-only plan: refused before the code is looked at", r.body.error === "invite_only" && rpcCalls("discount_check").length === 0);

// ── B. subscription-verify-payment: one database call completes the order (P1) ──
function seedSubIntent(over = {}) {
  S.subIntents.set("order_T1", {
    order_id: "order_T1", vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 203400, gst_number: "27ABCDE1234F1Z5",
    status: "created", list_rupees: 2299, discount_rupees: 575, discount_code: "LAUNCH25", discount_redemption_id: "red-1",
    payment_mode: "test", ...over,
  });
}
reset(); seedSubIntent();
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_1", signature: sign("order_T1", "pay_1") });
let fc = rpcCalls("subscription_fulfil");
check("B1 paid: fulfilled by one database call with the verified payment",
  fc.length === 1 && fc[0].body.p_order_ref === "order_T1" && fc[0].body.p_payment_ref === "pay_1" && fc[0].body.p_source === "verify",
  JSON.stringify(fc.map((c) => c.body)));
check("B1 paid: the function claims, confirms, activates and invoices nothing itself",
  edgeWrites() === 0 && rpcCalls("discount_confirm").length === 0 && !S.calls.some((c) => c.method === "PATCH" && c.url.includes("/subscription_payment_orders")),
  `edge writes ${edgeWrites()}`);
check("B1 paid: the browser gets the plan and the invoice", r.body.ok === true && r.body.planId === "gold" && r.body.invoiceId === "inv-1", JSON.stringify(r.body));
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_1", signature: sign("order_T1", "pay_1") });
check("B1 paid twice: the database says it's done; nothing more happens", r.body.ok === true && r.body.already === true && S.fulfilled.length === 1,
  JSON.stringify(r.body));

reset(); seedSubIntent(); S.fulfilDown = true;
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_2", signature: sign("order_T1", "pay_2") });
check("B2 database unreachable after a good signature: 'unavailable' (the webhook or the reconciler finishes it)",
  r.body.ok === false && r.body.error === "unavailable" && S.subIntents.get("order_T1").status === "created", JSON.stringify(r.body));

reset(); seedSubIntent();
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_1", signature: "0".repeat(64) });
check("B3 bad signature: nothing claimed, the database never asked",
  r.body.error === "bad_signature" && S.subIntents.get("order_T1").status === "created" && rpcCalls("subscription_fulfil").length === 0);

reset(); S.subIntents.set(freeSubOrder, { order_id: freeSubOrder, vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 0,
  status: "created", list_rupees: 2299, discount_rupees: 2299, discount_code: "FREEMONTH", discount_redemption_id: "red-9", payment_mode: "free" });
r = await call("subscription-verify-payment", { orderId: freeSubOrder, free: true }, { sub: OTHER });
check("B4 free order, someone else's: refused before the database is asked", r.body.error === "unknown_order" && rpcCalls("subscription_fulfil").length === 0);
r = await call("subscription-verify-payment", { orderId: "order_T1", free: true });
check("B4 free: a real order id isn't a free order", r.body.error === "not_free");
S.confirmOk = false;
r = await call("subscription-verify-payment", { orderId: freeSubOrder, free: true });
check("B4 free, redemption won't confirm: nothing activated", r.body.error === "discount_unconfirmed" && S.subIntents.get(freeSubOrder).status === "created");
S.confirmOk = true;
r = await call("subscription-verify-payment", { orderId: freeSubOrder, free: true });
fc = rpcCalls("subscription_fulfil").at(-1)?.body;
check("B4 free: fulfilled as 'free', with no payment", r.body.ok === true && fc?.p_source === "free" && fc.p_payment_ref === null && edgeWrites() === 0,
  JSON.stringify(fc));
S.subIntents.set("free_amount", { order_id: "free_amount", vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 100, status: "created", discount_redemption_id: "red-8" });
r = await call("subscription-verify-payment", { orderId: "free_amount", free: true });
check("B4 free: a stored amount above ₹0 is refused", r.body.error === "not_free" && S.subIntents.get("free_amount").status === "created");

reset({ fulfil: { status: 400, body: { code: "P0001", message: "activation refused: already_scheduled" } } });
S.subIntents.set("free_ref", { order_id: "free_ref", vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 0, status: "created",
  discount_redemption_id: "red-7", payment_mode: "free" });
r = await call("subscription-verify-payment", { orderId: "free_ref", free: true });
check("B4 free, plan refused: the code's use goes back and the order is closed",
  r.body.error === "activation_failed" && rpcCalls("discount_release")[0]?.body.p_redemption === "red-7" && S.subIntents.get("free_ref").status === "failed",
  JSON.stringify(r.body));

reset();
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly" }, { env: DEMO });
intent = [...S.subIntents.values()][0];
fc = rpcCalls("subscription_fulfil")[0]?.body;
check("B5 demo, no code: a demo order at ₹2,299 + ₹414, no discount calls",
  r.body.ok && r.body.demo && /^demo_/.test(intent?.order_id ?? "") && intent.amount === 271300 && intent.list_rupees === 2299 && intent.discount_rupees === 0
  && intent.payment_mode === "demo" && S.calls.filter((c) => c.url.includes("/rpc/discount_")).length === 0, JSON.stringify(intent));
check("B5 demo: fulfilled by the same database call, as 'demo'", fc?.p_order_ref === intent?.order_id && fc.p_source === "demo" && edgeWrites() === 0,
  JSON.stringify(fc));

reset();
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly", discountCode: "launch25" }, { env: DEMO });
intent = [...S.subIntents.values()][0];
const drs = rpcCalls("discount_reserve")[0]?.body;
check("B6 demo, code: reserved on a demo_ reference with no expected price",
  /^demo_/.test(drs?.p_order_ref ?? "") && drs.p_expected_rupees === null && drs.p_plan_rupees === 2299, JSON.stringify(drs));
check("B6 demo, code: the demo order carries the discount and its redemption into fulfilment",
  intent?.order_id === drs?.p_order_ref && intent.amount === 203400 && intent.discount_rupees === 575 && intent.discount_redemption_id === "red-1"
  && rpcCalls("subscription_fulfil")[0]?.body.p_order_ref === drs?.p_order_ref, JSON.stringify(intent));

reset({ reserve: { ok: false, reason: "already_used" } });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" }, { env: DEMO });
check("B7 demo, code refused: says why, creates nothing", r.body.ok === false && r.body.reason === "already_used" && S.subIntents.size === 0
  && rpcCalls("subscription_fulfil").length === 0);

reset({ fulfil: { status: 400, body: { code: "P0001", message: "activation refused: already_scheduled" } } });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" }, { env: DEMO });
intent = [...S.subIntents.values()][0];
check("B8 demo, plan refused: the use is released and the demo order closed",
  r.body.ok === false && r.body.error === "activation_failed" && rpcCalls("discount_release").length === 1 && intent?.status === "failed",
  JSON.stringify(r.body));

// ── C. subscription-webhook: events once, fulfilment, refunds, disputes (P1) ──
reset(); seedSubIntent();
let h = await hook("subscription-webhook", captured("pay_7", "order_T1"), { eventId: "evt_1" });
fc = rpcCalls("subscription_fulfil");
check("C1 captured: recorded under Razorpay's event id, then fulfilled as 'webhook'",
  h.status === 200 && rpcCalls("payment_event_record")[0]?.body.p_event_id === "evt_1"
  && fc.length === 1 && fc[0].body.p_payment_ref === "pay_7" && fc[0].body.p_source === "webhook" && edgeWrites() === 0,
  h.text);
check("C1 captured: the event is finished with its outcome", S.events.get("evt_1")?.outcome === "fulfilled", S.events.get("evt_1")?.outcome);
h = await hook("subscription-webhook", captured("pay_7", "order_T1"), { eventId: "evt_1" });
check("C2 the same event again: answered from the record, the database not asked to fulfil",
  h.status === 200 && JSON.parse(h.text).duplicate === true && rpcCalls("subscription_fulfil").length === 1, h.text);
h = await hook("subscription-webhook", captured("pay_7", "order_T1"), { eventId: "evt_2" });
check("C2 a second event for a done order: 'already_fulfilled'", S.events.get("evt_2")?.outcome === "already_fulfilled", S.events.get("evt_2")?.outcome);
h = await hook("subscription-webhook", captured("pay_7", "order_T1"), { sign: false });
check("C3 bad signature: 400, nothing recorded", h.status === 400 && S.events.size === 2);

reset(); seedSubIntent(); S.fulfilDown = true;
h = await hook("subscription-webhook", captured("pay_8", "order_T1"), { eventId: "evt_d" });
check("C4 database down: 500 so Razorpay retries, the event left unfinished", h.status === 500 && S.events.get("evt_d")?.outcome === null, h.text);
S.fulfilDown = false;
h = await hook("subscription-webhook", captured("pay_8", "order_T1"), { eventId: "evt_d" });
check("C4 the retry: the unfinished event is processed", h.status === 200 && S.events.get("evt_d")?.outcome === "fulfilled", S.events.get("evt_d")?.outcome);

reset();
const noIdEvt = captured("pay_9", "order_T1");
h = await hook("subscription-webhook", noIdEvt);
const sha = createHash("sha256").update(JSON.stringify(noIdEvt)).digest("hex");
check("C5 no event id header: keyed by the payload's hash", rpcCalls("payment_event_record")[0]?.body.p_event_id === `sha256:${sha}`);
check("C5 an order that isn't a plan order: 'not_ours'", h.status === 200 && JSON.parse(h.text).outcome === "not_ours", h.text);

reset();
h = await hook("subscription-webhook", { event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 203400 } } } }, { eventId: "evt_r" });
const rfe = rpcCalls("subscription_refund_event")[0]?.body;
check("C6 refund.processed: completes the invoice's refund with Razorpay's amount",
  rfe?.p_payment_ref === "pay_1" && rfe.p_refund_ref === "rfnd_1" && rfe.p_status === "processed" && rfe.p_amount_paise === 203400
  && S.events.get("evt_r")?.outcome === "refund.processed", JSON.stringify(rfe));
reset({ refundMatched: false });
h = await hook("subscription-webhook", { event: "refund.failed", payload: { refund: { entity: { id: "rfnd_2", payment_id: "pay_ad" } } } }, { eventId: "evt_rf" });
check("C6 a refund on someone else's payment (an ad): 'not_ours'",
  rpcCalls("subscription_refund_event")[0]?.body.p_status === "failed" && S.events.get("evt_rf")?.outcome === "not_ours");

reset();
h = await hook("subscription-webhook", { event: "payment.dispute.created", payload: { dispute: { entity: { id: "disp_1", payment_id: "pay_1", amount: 203400, reason_code: "fraud" } } } }, { eventId: "evt_x" });
check("C7 dispute: opens a billing incident", rpcCalls("billing_dispute_event")[0]?.body.p_payment_ref === "pay_1" && S.events.get("evt_x")?.outcome === "incident_opened");

reset();
h = await hook("subscription-webhook", { event: "payment.failed", payload: { payment: { entity: { id: "pay_f", order_id: "order_T1" } } } }, { eventId: "evt_f" });
check("C8 payment.failed: recorded only", h.status === 200 && S.events.get("evt_f")?.outcome === "recorded" && rpcCalls("subscription_fulfil").length === 0);

// ── D. razorpay-create-order ────────────────────────────────────────────────
reset();
r = await call("razorpay-create-order", { spec: SPEC });
let ado = [...S.adOrders.values()][0];
check("D1 no code: Razorpay gets the ₹507 it always did", rzpCalls()[0]?.body.amount === 50700 && ado?.amount === 50700 && ado.discount_paise === 0 && ado.discount_code === null,
  JSON.stringify(ado));

reset({ check: { ok: true, code: "CERT500", applies_to: "certificate", kind: "flat", value: 500, discount_rupees: 199 } });
r = await call("razorpay-create-order", { spec: SPEC, discountCode: "cert500" });
ado = [...S.adOrders.values()][0];
const dchk = rpcCalls("discount_check")[0]?.body;
check("D2 code: the order split into ad lines ₹308 and the certificate ₹199", dchk?.p_ad_rupees === 308 && dchk.p_certificate_rupees === 199 && dchk.p_order_kind === "ad",
  JSON.stringify(dchk));
check("D2 code: Razorpay gets ₹308; the order stores ₹199 off", rzpCalls()[0]?.body.amount === 30800 && ado?.amount === 30800 && ado.discount_paise === 19900 && ado.discount_code === "CERT500" && ado.discount_redemption_id === "red-1",
  JSON.stringify(ado));

reset({ check: { ok: true, code: "ALLFREE", applies_to: "ad_purchase", kind: "percent", value: 100, discount_rupees: 507 } });
r = await call("razorpay-create-order", { spec: SPEC, discountCode: "ALLFREE" });
ado = [...S.adOrders.values()][0];
check("D3 ₹0: no Razorpay order, a free_ id, ₹0 order", rzpCalls().length === 0 && r.body.free === true && /^free_/.test(r.body.orderId) && ado?.amount === 0,
  JSON.stringify(r.body));
const freeAdOrder = r.body.orderId;

reset({ check: { ok: false, reason: "not_applicable", applies_to: "certificate" } });
r = await call("razorpay-create-order", { spec: { ...SPEC, placementIds: ["openListing"] }, discountCode: "CERT500" });
check("D4 refused: nothing created", r.body.error === "discount" && r.body.reason === "not_applicable" && rzpCalls().length === 0 && S.adOrders.size === 0);

// Subscriptions P5: what the plan lets the ad reach is asked before any money moves.
reset({ adScope: "none" });
r = await call("razorpay-create-order", { spec: SPEC });
check("D5 Free vendor: refused before Razorpay, nothing stored", r.body.error === "ad_reach" && r.body.reason === "no_ads_on_plan" && rzpCalls().length === 0 && S.adOrders.size === 0,
  JSON.stringify(r.body));

reset({ adScope: "state_1" });
r = await call("razorpay-create-order", { spec: { ...SPEC, targetStates: ["GJ", "MH"] } });
check("D6 one-state plan, two states: refused with the reason, nothing created", r.body.error === "ad_reach" && r.body.reason === "too_many_states" && rzpCalls().length === 0 && S.adOrders.size === 0,
  JSON.stringify(r.body));
check("D6 the question was asked strictly", rpcCalls("ad_reach_resolve")[0]?.body.p_strict === true && rpcCalls("ad_reach_resolve")[0]?.body.p_vendor === VENDOR);

reset({ adScope: "state_1" });
r = await call("razorpay-create-order", { spec: { ...SPEC, targetCities: ["mumbai"] } });
ado = [...S.adOrders.values()][0];
check("D7 one-state plan, none named: the stored order reaches the vendor's own state, no cities",
  r.body.orderId && JSON.stringify(ado?.spec.targetStates) === '["GJ"]' && ado.spec.targetCities === undefined && ado.amount === 50700, JSON.stringify(ado?.spec));

reset({ reachFails: true });
r = await call("razorpay-create-order", { spec: SPEC });
check("D8 the plan can't be read: refused, nothing created", r.body.error === "ad_reach" && r.body.reason === "unavailable" && rzpCalls().length === 0 && S.adOrders.size === 0);

// ── E. razorpay-verify-payment ──────────────────────────────────────────────
reset();
S.adOrders.set("order_A1", { order_id: "order_A1", vendor_id: VENDOR, spec: SPEC, amount: 30800, status: "created",
  discount_paise: 19900, discount_code: "CERT500", discount_redemption_id: "red-2" });
r = await call("razorpay-verify-payment", { orderId: "order_A1", paymentId: "pay_a", signature: sign("order_A1", "pay_a") });
check("E1 paid: use confirmed, campaigns created against the order",
  r.body.ok && rpcCalls("discount_confirm")[0]?.body.p_redemption === "red-2" && S.ads.length === 3 && S.ads.every((a) => a.ad_order_id === "order_A1"),
  `ads ${S.ads.length}`);

reset();
S.adOrders.set(freeAdOrder, { order_id: freeAdOrder, vendor_id: VENDOR, spec: SPEC, amount: 0, status: "created",
  discount_paise: 50700, discount_code: "ALLFREE", discount_redemption_id: "red-3" });
r = await call("razorpay-verify-payment", { orderId: freeAdOrder, free: true }, { sub: OTHER });
check("E2 free order, someone else's: refused", r.body.error === "unknown_order" && S.ads.length === 0);
r = await call("razorpay-verify-payment", { orderId: freeAdOrder, free: true });
check("E2 free: confirmed, claimed, published", r.body.ok && S.ads.length === 3 && S.adOrders.get(freeAdOrder).status === "paid"
  && indexOf((c) => c.url.endsWith("/rpc/discount_confirm")) < indexOf((c) => c.method === "PATCH" && c.url.includes("/ad_orders")));

reset({ check: { ok: true, code: "ADS10", applies_to: "ad_purchase", kind: "percent", value: 10, discount_rupees: 31 } });
r = await call("razorpay-verify-payment", { demo: true, spec: SPEC, discountCode: "ads10" }, { env: DEMO });
const ers = rpcCalls("discount_reserve")[0]?.body;
check("E3 demo, code: reserved on a demo_ reference with the spec's split, then confirmed",
  r.body.ok && /^demo_/.test(ers?.p_order_ref ?? "") && ers.p_ad_rupees === 308 && ers.p_certificate_rupees === 199
  && rpcCalls("discount_confirm")[0]?.body.p_order_ref === ers.p_order_ref && S.ads.length === 3, JSON.stringify(ers));

reset({ adScope: "none" });
r = await call("razorpay-verify-payment", { demo: true, spec: SPEC, discountCode: "ADS10" }, { env: DEMO });
check("E4 demo, Free vendor: blocked before any use is reserved", r.body.error === "plan_not_eligible" && rpcCalls("discount_reserve").length === 0);

// Subscriptions P5: a paid order is clamped to the plan, never refused over its reach.
reset({ adScope: "state_1" });
S.adOrders.set("order_A2", { order_id: "order_A2", vendor_id: VENDOR, spec: { ...SPEC, targetStates: ["MH", "GJ", "RJ"], targetCountries: ["US"] }, amount: 50700, status: "created" });
r = await call("razorpay-verify-payment", { orderId: "order_A2", paymentId: "pay_b", signature: sign("order_A2", "pay_b") });
const targeted = S.ads.filter((a) => a.product_id !== null);
check("E7 paid on a one-state plan with three states and a country: published to the first state only",
  r.body.ok && targeted.length === 2 && targeted.every((a) => JSON.stringify(a.target_states) === '["MH"]' && a.target_countries.length === 0)
  && rpcCalls("ad_reach_resolve")[0]?.body.p_strict === false && r.body.requested === 3 && r.body.allowed === 1,
  JSON.stringify(targeted.map((a) => [a.target_states, a.target_countries])));
check("E7 the account-level row carries no targeting", S.ads.filter((a) => a.product_id === null).every((a) => a.target_states.length === 0 && a.target_cities === null));

reset({ adScope: "state_4", homeState: null });
S.adOrders.set("order_A3", { order_id: "order_A3", vendor_id: VENDOR, spec: SPEC, amount: 50700, status: "created" });
r = await call("razorpay-verify-payment", { orderId: "order_A3", paymentId: "pay_c", signature: sign("order_A3", "pay_c") });
check("E8 paid, a state plan with no state to reach: not published, sent to refund review",
  r.body.ok === false && S.ads.length === 0 && S.adOrders.get("order_A3").status === "refund_review", JSON.stringify(r.body));

reset({ adScope: "state_1", stateTargeting: false });
S.adOrders.set("order_A4", { order_id: "order_A4", vendor_id: VENDOR, spec: { ...SPEC, targetCities: ["mumbai", "delhi"], targetStates: ["MH"] }, amount: 50700, status: "created" });
r = await call("razorpay-verify-payment", { orderId: "order_A4", paymentId: "pay_d", signature: sign("order_A4", "pay_d") });
check("E9 state targeting off: cities clamped as before, no states",
  r.body.ok && S.ads.filter((a) => a.product_id !== null).every((a) => JSON.stringify(a.target_cities) === '["mumbai"]' && a.target_states.length === 0),
  JSON.stringify(S.ads.map((a) => [a.target_cities, a.target_states])));

reset({ reachFails: true });
S.adOrders.set("order_A5", { order_id: "order_A5", vendor_id: VENDOR, spec: SPEC, amount: 50700, status: "created" });
r = await call("razorpay-verify-payment", { orderId: "order_A5", paymentId: "pay_e", signature: sign("order_A5", "pay_e") });
check("E10 the plan can't be read: nothing published (never over-reach), refund review", S.ads.length === 0 && S.adOrders.get("order_A5").status === "refund_review");

reset({ failAds: true });
r = await call("razorpay-verify-payment", { demo: true, spec: SPEC, discountCode: "ADS10" }, { env: DEMO });
check("E5 demo, campaigns fail to insert: the use is released", r.body.ok === false && rpcCalls("discount_release").length === 1 && rpcCalls("discount_confirm").length === 0);

reset();
r = await call("razorpay-verify-payment", { demo: true, spec: SPEC }, { env: DEMO });
check("E6 demo, no code: exactly as before (no discount calls)", r.body.ok && S.ads.length === 3 && S.calls.filter((c) => c.url.includes("/rpc/discount_")).length === 0);

// ── F. razorpay-webhook ─────────────────────────────────────────────────────
reset();
S.adOrders.set("order_A1", { order_id: "order_A1", vendor_id: VENDOR, spec: SPEC, amount: 30800, status: "created",
  discount_paise: 19900, discount_code: "CERT500", discount_redemption_id: "red-2" });
h = await hook("razorpay-webhook", { event: "payment.captured", payload: { payment: { entity: { id: "pay_w", order_id: "order_A1" } } } });
check("F1 webhook claims: use confirmed, campaigns created", h.status === 200 && rpcCalls("discount_confirm").length === 1 && S.ads.length === 3);

reset({ adScope: "state_1" });
S.adOrders.set("order_A6", { order_id: "order_A6", vendor_id: VENDOR, spec: { ...SPEC, targetStates: ["KA", "TN"] }, amount: 50700, status: "created" });
h = await hook("razorpay-webhook", { event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: "order_A6" } } } });
check("F2 webhook: the same clamp as verify-payment",
  h.status === 200 && S.ads.filter((a) => a.product_id !== null).every((a) => JSON.stringify(a.target_states) === '["KA"]'),
  JSON.stringify(S.ads.map((a) => a.target_states)));

reset({ adScope: "none" });
S.adOrders.set("order_A7", { order_id: "order_A7", vendor_id: VENDOR, spec: SPEC, amount: 50700, status: "created" });
h = await hook("razorpay-webhook", { event: "payment.captured", payload: { payment: { entity: { id: "pay_y", order_id: "order_A7" } } } });
check("F3 webhook, Free vendor: not published, refund review", h.status === 200 && S.ads.length === 0 && S.adOrders.get("order_A7").status === "refund_review");

// ── G. discount-quote ───────────────────────────────────────────────────────
reset();
r = await call("discount-quote", { kind: "subscription", planId: "gold", billingCycle: "monthly", code: "launch25" });
check("G1 plan quote: the checkout's numbers", r.body.ok && r.body.list === 2299 && r.body.discount === 575 && r.body.base === 1724 && r.body.gst === 310 && r.body.total === 2034,
  JSON.stringify(r.body));
check("G1 plan quote: holds nothing", rpcCalls("discount_reserve").length === 0 && S.subIntents.size === 0);

reset({ check: { ok: true, code: "CERT500", applies_to: "certificate", kind: "flat", value: 500, discount_rupees: 199 } });
r = await call("discount-quote", { kind: "ad", spec: SPEC, code: "CERT500" });
check("G2 ad quote: split and total", r.body.ok && r.body.gross === 507 && r.body.ads === 308 && r.body.certificate === 199 && r.body.discount === 199 && r.body.total === 308,
  JSON.stringify(r.body));

reset({ check: { ok: false, reason: "wrong_target", applies_to: "certificate" } });
r = await call("discount-quote", { kind: "subscription", planId: "gold", billingCycle: "yearly", code: "CERT500" });
check("G3 refusal: reason and what the code is for", r.body.ok === false && r.body.reason === "wrong_target" && r.body.appliesTo === "certificate"
  && rpcCalls("discount_check")[0]?.body.p_plan_rupees === 22990, JSON.stringify(r.body));

reset();
r = await call("discount-quote", { kind: "subscription", planId: "gold", billingCycle: "monthly", code: "   " });
// Only the Auth lookup of the caller (subscriptions P0) happens; nothing reaches the database.
check("G4 no code: invalid, no database call", r.body.reason === "invalid" && S.calls.filter((c) => c.url.includes("/rest/v1/")).length === 0);

reset();
r = await call("discount-quote", { kind: "subscription", planId: "vip", billingCycle: "monthly", code: "LAUNCH25" });
check("G5 invite-only plan: not quoted", r.body.reason === "invite_only" && rpcCalls("discount_check").length === 0);

// ── H. plan changes (2026-10-02): the charge comes from the database's rule ──
const UPGRADE = { ok: true, kind: "upgrade", plan_id: "gold", billing_cycle: "monthly", list_rupees: 2299,
                  credit_rupees: 466, charge_rupees: 1833, starts_now: true, ...PERIOD };
reset({ quote: UPGRADE });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
intent = [...S.subIntents.values()][0];
check("H1 upgrade: Razorpay gets the charge (₹2,299 − ₹466 credit) + GST", rzpCalls()[0]?.body.amount === 216300, rzpCalls()[0]?.body.amount);
check("H1 upgrade: the intent stores the charge, the credit and the kind",
  intent?.list_rupees === 1833 && intent.credit_rupees === 466 && intent.change_kind === "upgrade", JSON.stringify(intent));
check("H1 upgrade: the response says so", r.body.change === "upgrade" && r.body.credit === 466 && r.body.planPrice === 2299 && r.body.list === 1833,
  JSON.stringify(r.body));

reset({ quote: UPGRADE, check: { ok: true, code: "LAUNCH25", applies_to: "vendor_plan", kind: "percent", value: 25, discount_rupees: 458 } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" });
check("H2 upgrade + code: the code is judged against the charge, not the plan's price",
  rpcCalls("discount_check")[0]?.body.p_plan_rupees === 1833 && rpcCalls("discount_reserve")[0]?.body.p_plan_rupees === 1833
  && rzpCalls()[0]?.body.amount === (1375 + 248) * 100, `${rpcCalls("discount_check")[0]?.body.p_plan_rupees} / ${rzpCalls()[0]?.body.amount}`);

reset({ quote: { ok: false, reason: "already_scheduled" } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "yearly" });
check("H3 a second paid next period: refused, nothing created", r.body.error === "already_scheduled" && rzpCalls().length === 0 && S.subIntents.size === 0,
  JSON.stringify(r.body));

reset();
seedSubIntent({ amount: 216300, list_rupees: 1833, discount_rupees: 0, discount_code: null, discount_redemption_id: null, credit_rupees: 466, change_kind: "upgrade" });
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_u", signature: sign("order_T1", "pay_u") });
check("H4 paid upgrade: the stored charge, credit and kind go to the database untouched; the function writes none of it",
  r.body.ok && rpcCalls("subscription_fulfil").length === 1 && edgeWrites() === 0
  && S.subIntents.get("order_T1").credit_rupees === 466 && S.subIntents.get("order_T1").list_rupees === 1833, JSON.stringify(r.body));

reset({ fulfil: { ok: false, reason: "activation_failed", detail: "already_scheduled", incident_id: "inc-1" } });
seedSubIntent({ discount_rupees: 0, discount_code: null, discount_redemption_id: null, list_rupees: 2299, amount: 271300 });
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_x", signature: sign("order_T1", "pay_x") });
check("H5 plan refused after payment: said so; nothing released or closed (the money is real, finance has an incident)",
  r.body.ok === false && r.body.error === "activation_failed" && rpcCalls("discount_release").length === 0
  && !S.calls.some((c) => c.method === "PATCH" && c.url.includes("/subscription_payment_orders")), JSON.stringify(r.body));

reset({ quote: { ...UPGRADE, credit_rupees: 2299, charge_rupees: 0 } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
const coveredOrder = r.body.orderId;
check("H6 credit covers it all: no Razorpay order, a free_ id", rzpCalls().length === 0 && r.body.free === true && /^free_/.test(coveredOrder ?? ""),
  JSON.stringify(r.body));
r = await call("subscription-verify-payment", { orderId: coveredOrder, free: true });
check("H6 and it is fulfilled as 'free' with no code to confirm",
  r.body.ok === true && rpcCalls("discount_confirm").length === 0 && rpcCalls("subscription_fulfil").at(-1)?.body.p_source === "free"
  && S.subIntents.get(coveredOrder).credit_rupees === 2299, JSON.stringify(r.body));

reset({ quote: UPGRADE });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly" }, { env: DEMO });
intent = [...S.subIntents.values()][0];
check("H7 demo upgrade: priced by the same rule", r.body.ok && intent?.list_rupees === 1833 && intent.credit_rupees === 466 && intent.change_kind === "upgrade"
  && intent.amount === 216300, JSON.stringify(intent));

reset();
seedSubIntent({ discount_rupees: 0, discount_code: null, discount_redemption_id: null, list_rupees: 1833, amount: 216300, credit_rupees: 466, change_kind: "upgrade" });
h = await hook("subscription-webhook", captured("pay_h", "order_T1"), { eventId: "evt_h" });
check("H8 webhook: the same order, the same database call, as 'webhook'",
  h.status === 200 && rpcCalls("subscription_fulfil")[0]?.body.p_source === "webhook" && edgeWrites() === 0, h.text);

reset({ quote: UPGRADE });
r = await call("discount-quote", { kind: "subscription", planId: "gold", billingCycle: "monthly", code: "LAUNCH25" });
check("H9 the checkout's code quote is off the charge too", r.body.ok && r.body.list === 1833 && rpcCalls("discount_check")[0]?.body.p_plan_rupees === 1833,
  JSON.stringify(r.body));

// ── I. subscriptions P0 (2026-10-08): Auth confirms the caller; the gate decides ──
reset({ authOk: false });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
check("I1 create-order: a token Auth refuses gets 401, and nothing is created",
  r.status === 401 && rzpCalls().length === 0 && S.subIntents.size === 0, `${r.status} ${JSON.stringify(r.body)}`);

reset({ authId: OTHER });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
intent = [...S.subIntents.values()][0];
check("I2 create-order: the vendor is who Auth says, not the token's sub",
  rpcCalls("subscription_checkout_gate")[0]?.body.p_vendor === OTHER && intent?.vendor_id === OTHER, JSON.stringify(intent));

for (const reason of ["payments_not_open", "not_vendor", "suspended", "deleted"]) {
  reset({ gate: { ok: false, reason } });
  r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
  check(`I3 create-order: gate '${reason}' answers it and creates nothing`,
    r.body.error === reason && rzpCalls().length === 0 && S.subIntents.size === 0 && rpcCalls("discount_check").length === 0,
    JSON.stringify(r.body));
}

reset({ gateFails: true });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
check("I4 create-order: an unanswered gate refuses", r.body.error === "unavailable" && rzpCalls().length === 0, JSON.stringify(r.body));

reset({ gate: { ok: false, reason: "payments_not_open" } });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly" }, { env: DEMO });
check("I5 demo checkout: the gate refuses before any order or fulfilment",
  r.body.ok === false && r.body.error === "payments_not_open" && rpcCalls("subscription_fulfil").length === 0 && S.subIntents.size === 0,
  JSON.stringify(r.body));

reset({ authOk: false });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly" }, { env: DEMO });
check("I6 demo checkout: a token Auth refuses gets 401", r.status === 401 && S.subIntents.size === 0, r.status);

reset({ authOk: false });
r = await call("discount-quote", { kind: "subscription", planId: "gold", billingCycle: "monthly", code: "LAUNCH25" });
check("I7 discount-quote: a token Auth refuses gets 401", r.status === 401 && rpcCalls("discount_check").length === 0, r.status);

reset();
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
check("I8 create-order: an allowed vendor still checks out as before",
  r.body.configured === true && rzpCalls()[0]?.body.amount === 271300 && rpcCalls("subscription_checkout_gate").length === 1, JSON.stringify(r.body));

// ── J. billing-reconcile (subscriptions P1): payments that never reached us ──
const SERVICE = jwt(undefined, "service_role");
reset();
r = await call("billing-reconcile", {});
check("J1 a signed-in user's token is refused", r.status === 403 && rpcCalls("billing_reconcile_candidates").length === 0, r.status);

reset();
r = await call("billing-reconcile", {}, { token: SERVICE, env: DEMO });
check("J2 no Razorpay keys: nothing to check", r.body.note === "not_configured" && S.calls.length === 0, JSON.stringify(r.body));

reset({ candidates: [{ order_id: "order_T1", vendor_id: VENDOR, payment_mode: "test", created_at: "2026-10-08T00:00:00Z" },
                     { order_id: "order_T2", vendor_id: VENDOR, payment_mode: "test", created_at: "2026-10-08T00:00:00Z" },
                     { order_id: "order_T3", vendor_id: VENDOR, payment_mode: "test", created_at: "2026-10-08T00:00:00Z" }],
        rzpPayments: { order_T1: [{ id: "pay_c", status: "captured", amount: 203400 }], order_T2: [{ id: "pay_a", status: "authorized", amount: 271300 }] } });
seedSubIntent();
r = await call("billing-reconcile", {}, { token: SERVICE });
fc = rpcCalls("subscription_fulfil");
check("J3 a captured payment: recorded, then fulfilled as 'reconcile'",
  fc.length === 1 && fc[0].body.p_order_ref === "order_T1" && fc[0].body.p_payment_ref === "pay_c" && fc[0].body.p_source === "reconcile"
  && S.events.get("reconcile:order_T1:pay_c")?.outcome === "fulfilled", JSON.stringify(fc.map((c) => c.body)));
check("J4 authorised but not captured: recorded, not fulfilled",
  S.events.get("reconcile:order_T2:pay_a:authorized")?.outcome === "authorized_not_captured", S.events.get("reconcile:order_T2:pay_a:authorized")?.outcome);
check("J5 every order checked is marked; the tally adds up",
  rpcCalls("billing_reconcile_mark").map((c) => c.body.p_order_ref).join() === "order_T1,order_T2,order_T3"
  && r.body.checked === 3 && r.body.fulfilled === 1 && r.body.unpaid === 2 && r.body.failed === 0, JSON.stringify(r.body));

reset({ candidates: [{ order_id: "order_T1", vendor_id: VENDOR, payment_mode: "test", created_at: "2026-10-08T00:00:00Z" }], rzpPaymentsFail: true });
r = await call("billing-reconcile", {}, { token: SERVICE });
check("J6 Razorpay unreachable: counted as failed and left unmarked for the next run",
  r.body.failed === 1 && rpcCalls("billing_reconcile_mark").length === 0 && rpcCalls("subscription_fulfil").length === 0, JSON.stringify(r.body));

console.table(rows);
console.log(failures === 0
  ? `\nDISCOUNT FLOWS CONSISTENT — ${rows.length} checks across ${FUNCTIONS.length} functions`
  : `\n${failures} CHECK(S) FAILED`);
rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
