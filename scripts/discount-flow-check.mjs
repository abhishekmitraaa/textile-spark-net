#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// "A discount code changes what is charged and invoiced, and nothing else."
// (admin completion Phase 10, 2026-09-29)
//
// Runs the seven payment edge functions' real code in Node: each is bundled with
// esbuild, Deno.serve / Deno.env are stubbed, and fetch() answers from an
// in-memory stand-in for PostgREST and Razorpay that records every call. No
// network, no database: the database side (discount_check / reserve / confirm /
// release) is scripts/admin-completion/14_discounts.sql and the race is
// scripts/discount-race-check.sql. This proves the functions around them:
//
//   * with no code, every function sends exactly what it sent before Phase 10
//   * a code is checked before a Razorpay order exists, reserved against the
//     order id after it, and a failed intent write releases it
//   * a lost race (reserve refused after check) leaves no intent, so nothing
//     can be paid for it
//   * invoices come from the stored list price and discount, GST on the rest,
//     and carry the verified payment id
//   * a ₹0 order has no Razorpay order and is fulfilled only when it is the
//     caller's, its stored amount is 0 and its redemption confirms
//   * demo mode applies a code through the same reserve / confirm / release
//   * the webhooks confirm the use when they are the ones to claim the order
//
//   node scripts/discount-flow-check.mjs
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
    razorpaySeq: 0,
    // Plan changes (2026-10-02): what subscription_quote_for / subscription_activate
    // answer. null = a first purchase at the plan's price.
    quote: null, activation: null,
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

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = (init.method ?? "GET").toUpperCase();
  let body;
  try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = init.body; }
  S.calls.push({ method, url, body });
  const p = new URL(url).pathname;

  if (url.startsWith("https://api.razorpay.com/v1/orders")) return res({ id: `order_T${++S.razorpaySeq}`, amount: body.amount });

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
                   "razorpay-create-order", "razorpay-verify-payment", "razorpay-webhook", "discount-quote"];
for (const f of FUNCTIONS) {
  const outfile = path.join(dir, `${f}.mjs`);
  await build({ entryPoints: [`supabase/functions/${f}/index.ts`], outfile, format: "esm", platform: "node", bundle: true, logLevel: "silent" });
  loading = f;
  await import(pathToFileURL(outfile).href);
}

const jwt = (sub) => `x.${Buffer.from(JSON.stringify({ sub, role: "authenticated" })).toString("base64url")}.y`;
async function call(fn, body, { sub = VENDOR, env = LIVE } = {}) {
  ENV = env;
  const r = await handlers[fn](new Request(`${SB}/functions/v1/${fn}`, {
    method: "POST", headers: { authorization: `Bearer ${jwt(sub)}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: r.status, body: await r.json() };
}
async function hook(fn, evt, { sign = true } = {}) {
  ENV = LIVE;
  const raw = JSON.stringify(evt);
  const sig = sign ? createHmac("sha256", HOOK_SECRET).update(raw).digest("hex") : "bad";
  const r = await handlers[fn](new Request(`${SB}/functions/v1/${fn}`, { method: "POST", headers: { "x-razorpay-signature": sig }, body: raw }));
  return { status: r.status, text: await r.text() };
}
const sign = (orderId, paymentId) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const rpcCalls = (fn) => S.calls.filter((c) => c.url.endsWith(`/rpc/${fn}`));
const rzpCalls = () => S.calls.filter((c) => c.url.startsWith("https://api.razorpay.com"));
const indexOf = (pred) => S.calls.findIndex(pred);

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
check("A6 100% off: no Razorpay order, a free_ id, ₹0 intent", rzpCalls().length === 0 && r.body.free === true && /^free_/.test(r.body.orderId) && intent?.amount === 0 && intent.discount_rupees === 2299,
  JSON.stringify(r.body));
const freeSubOrder = r.body.orderId;

reset();
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" }, { env: DEMO });
check("A7 demo mode: not_configured before anything, code or not", r.body.error === "not_configured" && S.calls.length === 0);

reset();
r = await call("subscription-create-order", { planId: "vip", billingCycle: "monthly", discountCode: "LAUNCH25" });
check("A8 invite-only plan: refused before the code is looked at", r.body.error === "invite_only" && rpcCalls("discount_check").length === 0);

// ── B. subscription-verify-payment ──────────────────────────────────────────
function seedSubIntent(over = {}) {
  S.subIntents.set("order_T1", {
    order_id: "order_T1", vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 203400, gst_number: "27ABCDE1234F1Z5",
    status: "created", list_rupees: 2299, discount_rupees: 575, discount_code: "LAUNCH25", discount_redemption_id: "red-1", ...over,
  });
}
reset(); seedSubIntent();
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_1", signature: sign("order_T1", "pay_1") });
let inv = S.invoices[0];
check("B1 paid: the use is confirmed for this order", rpcCalls("discount_confirm")[0]?.body.p_redemption === "red-1" && rpcCalls("discount_confirm")[0]?.body.p_order_ref === "order_T1");
check("B1 paid: invoice is the stored price less the discount, GST on the rest",
  inv?.amount === 1724 && inv.gst_amount === 310 && inv.discount_amount === 575 && inv.discount_code === "LAUNCH25", JSON.stringify(inv));
check("B1 paid: invoice records the verified payment id", inv?.razorpay_payment_id === "pay_1" && inv.razorpay_order_id === "order_T1", inv?.razorpay_payment_id);
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_1", signature: sign("order_T1", "pay_1") });
check("B1 paid twice: second call activates nothing", r.body.already === true && S.invoices.length === 1);

reset(); seedSubIntent({ amount: 271300, list_rupees: undefined, discount_rupees: 0, discount_code: null, discount_redemption_id: null });
await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_2", signature: sign("order_T1", "pay_2") });
inv = S.invoices[0];
check("B2 an intent from before Phase 10: invoiced from the plan as before", inv?.amount === 2299 && inv.gst_amount === 414 && inv.discount_amount === null && rpcCalls("discount_confirm").length === 0,
  JSON.stringify(inv));

reset(); seedSubIntent();
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_1", signature: "0".repeat(64) });
check("B3 bad signature: nothing claimed", r.body.error === "bad_signature" && S.subIntents.get("order_T1").status === "created");

reset(); S.subIntents.set(freeSubOrder, { order_id: freeSubOrder, vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 0,
  status: "created", list_rupees: 2299, discount_rupees: 2299, discount_code: "FREEMONTH", discount_redemption_id: "red-9" });
r = await call("subscription-verify-payment", { orderId: freeSubOrder, free: true }, { sub: OTHER });
check("B4 free order, someone else's: refused", r.body.error === "unknown_order" && rpcCalls("discount_confirm").length === 0 && S.invoices.length === 0);
r = await call("subscription-verify-payment", { orderId: "order_T1", free: true });
check("B4 free: a real order id isn't a free order", r.body.error === "not_free");
S.confirmOk = false;
r = await call("subscription-verify-payment", { orderId: freeSubOrder, free: true });
check("B4 free, redemption won't confirm: nothing activated", r.body.error === "discount_unconfirmed" && S.subIntents.get(freeSubOrder).status === "created" && S.invoices.length === 0);
S.confirmOk = true;
r = await call("subscription-verify-payment", { orderId: freeSubOrder, free: true });
inv = S.invoices[0];
check("B4 free: confirmed first, then claimed and invoiced at ₹0",
  r.body.ok === true && indexOf((c) => c.url.endsWith("/rpc/discount_confirm")) < indexOf((c) => c.method === "PATCH" && c.url.includes("/subscription_payment_orders"))
  && inv?.amount === 0 && inv.gst_amount === 0 && inv.discount_amount === 2299 && inv.razorpay_payment_id === null, JSON.stringify(inv));
S.subIntents.set("free_amount", { order_id: "free_amount", vendor_id: VENDOR, plan_id: "gold", billing_cycle: "monthly", amount: 100, status: "created", discount_redemption_id: "red-8" });
r = await call("subscription-verify-payment", { orderId: "free_amount", free: true });
check("B4 free: a stored amount above ₹0 is refused", r.body.error === "not_free" && S.subIntents.get("free_amount").status === "created");

reset();
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly" }, { env: DEMO });
inv = S.invoices[0];
check("B5 demo, no code: exactly as before (₹2,299 + ₹414, no discount calls)",
  r.body.ok && r.body.demo && inv?.amount === 2299 && inv.gst_amount === 414 && inv.discount_amount === null && inv.discount_code === null
  && S.calls.filter((c) => c.url.includes("/rpc/discount_")).length === 0, JSON.stringify(inv));

reset();
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly", discountCode: "launch25" }, { env: DEMO });
inv = S.invoices[0];
const drs = rpcCalls("discount_reserve")[0]?.body;
check("B6 demo, code: reserved on a demo_ reference with no expected price",
  /^demo_/.test(drs?.p_order_ref ?? "") && drs.p_expected_rupees === null && drs.p_plan_rupees === 2299, JSON.stringify(drs));
check("B6 demo, code: invoiced with the discount, then the same use confirmed",
  inv?.amount === 1724 && inv.gst_amount === 310 && inv.discount_amount === 575 && rpcCalls("discount_confirm")[0]?.body.p_order_ref === drs?.p_order_ref, JSON.stringify(inv));

reset({ reserve: { ok: false, reason: "already_used" } });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" }, { env: DEMO });
check("B7 demo, code refused: says why, activates nothing", r.body.ok === false && r.body.reason === "already_used" && S.subsUpserts.length === 0 && S.invoices.length === 0);

reset({ failSubscription: true });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly", discountCode: "LAUNCH25" }, { env: DEMO });
check("B8 demo, activation fails: the use is released", r.body.ok === false && rpcCalls("discount_release").length === 1 && rpcCalls("discount_confirm").length === 0);

// ── C. subscription-webhook ─────────────────────────────────────────────────
reset(); seedSubIntent();
let h = await hook("subscription-webhook", { event: "payment.captured", payload: { payment: { entity: { id: "pay_7", order_id: "order_T1" } } } });
inv = S.invoices[0];
check("C1 webhook claims: use confirmed, invoice discounted, payment id kept",
  h.status === 200 && rpcCalls("discount_confirm").length === 1 && inv?.amount === 1724 && inv.discount_amount === 575 && inv.razorpay_payment_id === "pay_7", JSON.stringify(inv));
h = await hook("subscription-webhook", { event: "payment.captured", payload: { payment: { entity: { id: "pay_7", order_id: "order_T1" } } } }, { sign: false });
check("C1 webhook, bad signature: 400", h.status === 400 && S.invoices.length === 1);

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
check("G4 no code: invalid, no database call", r.body.reason === "invalid" && S.calls.length === 0);

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

reset({ activation: { ...UPGRADE, period_start: "2026-10-02T10:00:00.000Z", period_end: "2026-11-02T10:00:00.000Z" } });
seedSubIntent({ amount: 216300, list_rupees: 1833, discount_rupees: 0, discount_code: null, discount_redemption_id: null, credit_rupees: 466, change_kind: "upgrade" });
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_u", signature: sign("order_T1", "pay_u") });
inv = S.invoices[0];
check("H4 paid upgrade: activated through the rule, invoiced at the charge with its credit and period",
  r.body.ok && S.subsUpserts[0]?.p_plan === "gold" && inv?.amount === 1833 && inv.gst_amount === 330 && inv.credit_rupees === 466
  && inv.change_kind === "upgrade" && inv.billing_period_start === "2026-10-02T10:00:00.000Z" && inv.billing_period_end === "2026-11-02T10:00:00.000Z",
  JSON.stringify(inv));

reset({ activation: { ok: false, reason: "already_scheduled" } });
seedSubIntent({ discount_rupees: 0, discount_code: null, discount_redemption_id: null, list_rupees: 2299, amount: 271300 });
r = await call("subscription-verify-payment", { orderId: "order_T1", paymentId: "pay_x", signature: sign("order_T1", "pay_x") });
check("H5 activation refused after payment: said so, no invoice", r.body.ok === false && S.invoices.length === 0, JSON.stringify(r.body));

reset({ quote: { ...UPGRADE, credit_rupees: 2299, charge_rupees: 0 } });
r = await call("subscription-create-order", { planId: "gold", billingCycle: "monthly" });
const coveredOrder = r.body.orderId;
check("H6 credit covers it all: no Razorpay order, a free_ id", rzpCalls().length === 0 && r.body.free === true && /^free_/.test(coveredOrder ?? ""),
  JSON.stringify(r.body));
r = await call("subscription-verify-payment", { orderId: coveredOrder, free: true });
inv = S.invoices[0];
check("H6 and it activates with no code to confirm, invoiced at ₹0 with the credit",
  r.body.ok === true && rpcCalls("discount_confirm").length === 0 && inv?.amount === 0 && inv.credit_rupees === 2299, JSON.stringify(inv));

reset({ quote: UPGRADE });
r = await call("subscription-verify-payment", { demo: true, planId: "gold", billingCycle: "monthly" }, { env: DEMO });
inv = S.invoices[0];
check("H7 demo upgrade: priced by the same rule", r.body.ok && inv?.amount === 1833 && inv.credit_rupees === 466 && inv.change_kind === "upgrade",
  JSON.stringify(inv));

reset();
seedSubIntent({ discount_rupees: 0, discount_code: null, discount_redemption_id: null, list_rupees: 1833, amount: 216300, credit_rupees: 466, change_kind: "upgrade" });
h = await hook("subscription-webhook", { event: "payment.captured", payload: { payment: { entity: { id: "pay_h", order_id: "order_T1" } } } });
inv = S.invoices[0];
check("H8 webhook: the invoice keeps the order's credit and kind", h.status === 200 && inv?.credit_rupees === 466 && inv.change_kind === "upgrade" && inv.amount === 1833,
  JSON.stringify(inv));

reset({ quote: UPGRADE });
r = await call("discount-quote", { kind: "subscription", planId: "gold", billingCycle: "monthly", code: "LAUNCH25" });
check("H9 the checkout's code quote is off the charge too", r.body.ok && r.body.list === 1833 && rpcCalls("discount_check")[0]?.body.p_plan_rupees === 1833,
  JSON.stringify(r.body));

console.table(rows);
console.log(failures === 0
  ? `\nDISCOUNT FLOWS CONSISTENT — ${rows.length} checks across ${FUNCTIONS.length} functions`
  : `\n${failures} CHECK(S) FAILED`);
rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
