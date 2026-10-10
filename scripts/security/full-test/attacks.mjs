// The attack pass, on the LOCAL stack: what a seller, a buyer or a member of staff could try in order to get a plan
// without paying, use what their plan doesn't include, read or change someone else's data, or act above their role.
// Every attempt goes through the public API with the attacker's own session; the database is then read to see what
// really happened. HOLDS = the system refused or nothing changed. GAP = it worked.
import { createHmac } from "node:crypto";
import { env, SIDE, TAG, HOOK_SECRET, sql, check, attack, note, section, svc, anon, asUser, token, emailOf, fn, rpc, rest, seller, buyer, staff, buy, sign, planRow, cleanup, summary, tally } from "./lib.mjs";

const one = (q) => sql(q);
const refused = (r) => !r.ok;                                     // an RPC or REST call that answered 4xx
const noRows = (r) => !r.ok || r.rows === 0;                      // a read or write that touched nothing
const [cat] = sql(`select c.id from public.categories c where c.parent_id is not null
   and not exists (select 1 from public.products p where p.category_id = c.id) and not exists (select 1 from public.rfqs r where r.category_id = c.id) order by c.name desc limit 1`).split("|");

try {
  // ── The cast ─────────────────────────────────────────────────────────────────────
  section("Setting up: a paying seller (the victim), a Free seller (the attacker), a Basic seller, buyers, staff");
  const victim = await seller("victim");
  const vb = await buy(victim, "gold");
  check("the victim buys Gold", vb.verify?.body?.ok === true && planRow(victim.id) === "gold|active|-", vb.verify?.body);
  victim.invoiceId = vb.verify.body.invoiceId ?? vb.verify.body.invoice_id;
  const vp = await rest("POST", "products?select=id", victim.h, [1, 2, 3].map((i) => ({ vendor_id: victim.id, name: `FT victim listing ${i} ${TAG}`, category_id: cat, price_value: 500, status: "under_review" })));
  victim.products = vp.body.map((x) => x.id);
  sql(`update public.products set status = 'live' where id in ('${victim.products.join("','")}');`);
  victim.lead = (await rpc("crm_add_lead", victim.h, { p_title: `Victim lead ${TAG}`, p_value: 90000 })).body;
  victim.callback = (await rpc("am_request_callback", victim.h, { p_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), p_window: "evening" })).body;
  await rpc("am_send", victim.h, { p_body: "Private message to my account team" });
  victim.ad = (await rest("POST", "advertisements?select=id", victim.h, { vendor_id: victim.id, title: `Victim ad ${TAG}`, product_id: victim.products[0] })).body?.[0]?.id;
  victim.pdf = (await fn("invoice-render", victim.h, { invoiceId: victim.invoiceId })).body?.path;
  check("the victim has a lead, a callback, an ad and an invoice PDF", Boolean(victim.lead && victim.callback && victim.ad && victim.pdf), [victim.lead, victim.callback, victim.ad, victim.pdf]);

  const mallory = await seller("mallory");
  const basic = await seller("basicx");
  check("the Basic seller buys Basic", (await buy(basic, "basic")).verify?.body?.ok === true);
  const outsider = await seller("outsider", { onSwitches: [] });
  const home = await buyer("homex", { country: "India", countryCode: "IN" });
  const abroad = await buyer("abroadx", { country: "United States", countryCode: "US", onSwitches: ["overseas_leads"] });
  const support = { h: asUser(await token(emailOf("support"))) }, moderator = { h: asUser(await token(emailOf("moderator"))) }, manager = { h: asUser(await token(emailOf("manager"))) };
  const admin = { h: asUser(await token(emailOf("admin"))) };
  const finance = await staff("fin", "finance_admin");
  const am = await staff("amx", "account_manager");

  // ── A. A paid plan without paying ────────────────────────────────────────────────
  section("A. Getting a paid plan without paying");
  let r = await rest("PATCH", `vendor_subscriptions?vendor_id=eq.${basic.id}`, basic.h, { plan_id: "vip", current_period_end: "2099-01-01T00:00:00Z" });
  attack("A1 a seller edits their own subscription row to VIP", planRow(basic.id) === "basic|active|-", `${r.status} rows=${r.rows} → ${planRow(basic.id)}`);
  r = await rest("POST", "vendor_subscriptions", mallory.h, { vendor_id: mallory.id, plan_id: "vip", billing_cycle: "yearly", status: "active", current_period_start: new Date().toISOString(), current_period_end: "2099-01-01T00:00:00Z" });
  attack("A2 a Free seller inserts a VIP subscription row", planRow(mallory.id) === "none", `${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
  // return=minimal throughout A3: asking for the row back fails on this table's private columns before the write is tried.
  r = await rest("PATCH", `vendor_profiles?id=eq.${mallory.id}`, mallory.h, { plan_id: "vip", plan_expires_at: "2099-01-01T00:00:00Z" }, "return=minimal");
  attack("A3 a Free seller writes the plan that drives the seal, search boost and featured places onto their profile",
    one(`select coalesce(plan_id, '-') || '|' || coalesce(plan_expires_at::text, '-') from public.vendor_profiles where id = '${mallory.id}'`) === "-|-", `${r.status} ${JSON.stringify(r.body).slice(0, 110)}`);
  r = await rest("PATCH", `vendor_profiles?id=eq.${mallory.id}`, mallory.h, { is_verified: true, ad_verified_until: "2099-01-01T00:00:00Z" }, "return=minimal");
  attack("A3b … or marks themselves verified", one(`select is_verified::text || '|' || coalesce(ad_verified_until::text, '-') from public.vendor_profiles where id = '${mallory.id}'`) === "false|-", `${r.status}`);
  const fake = `free_${crypto.randomUUID()}`;
  r = await rest("POST", "subscription_payment_orders", mallory.h, { order_id: fake, vendor_id: mallory.id, plan_id: "vip", billing_cycle: "yearly", amount: 0, status: "created", payment_mode: "test", list_rupees: 220000, discount_rupees: 220000, change_kind: "new", credit_rupees: 0 });
  const fv = await fn("subscription-verify-payment", mallory.h, { free: true, orderId: fake });
  attack("A4 forging a ₹0 order and asking for it to be fulfilled", planRow(mallory.id) === "none" && fv.body?.ok !== true, `insert ${r.status}; verify ${JSON.stringify(fv.body)}`);
  const mo = await fn("subscription-create-order", mallory.h, { planId: "vip", billingCycle: "yearly" });
  check("(the attacker can start a real VIP checkout)", Boolean(mo.body?.orderId), mo.body);
  r = await fn("subscription-verify-payment", mallory.h, { orderId: mo.body.orderId, paymentId: "pay_forged", signature: "0".repeat(64) });
  attack("A5 a made-up payment signature on a real order", planRow(mallory.id) === "none" && r.body?.error === "bad_signature", JSON.stringify(r.body));
  r = await fn("subscription-verify-payment", mallory.h, { orderId: mo.body.orderId, paymentId: vb.triple.paymentId, signature: vb.triple.signature });
  attack("A5b the victim's genuine signature on the attacker's order", planRow(mallory.id) === "none" && r.body?.error === "bad_signature", JSON.stringify(r.body));
  r = await fn("subscription-verify-payment", mallory.h, { orderId: mo.body.orderId, paymentId: "pay_x", signature: createHmac("sha256", "guess").update(`${mo.body.orderId}|pay_x`).digest("hex") });
  attack("A5c a signature made with a guessed secret", planRow(mallory.id) === "none" && r.body?.error === "bad_signature", JSON.stringify(r.body));
  const vEnd = one(`select current_period_end::text || '|' || (select count(*) from public.subscription_invoices where vendor_id = '${victim.id}') from public.vendor_subscriptions where vendor_id = '${victim.id}'`);
  r = await fn("subscription-verify-payment", mallory.h, vb.triple);
  attack("A6 replaying the victim's whole payment from the attacker's session", planRow(mallory.id) === "none"
    && one(`select current_period_end::text || '|' || (select count(*) from public.subscription_invoices where vendor_id = '${victim.id}') from public.vendor_subscriptions where vendor_id = '${victim.id}'`) === vEnd, JSON.stringify(r.body).slice(0, 120));
  const five = await Promise.all([1, 2, 3, 4, 5].map(() => fn("subscription-verify-payment", victim.h, vb.triple)));
  attack("A7 the victim replays their own payment five times at once to stack months", one(`select current_period_end::text || '|' || (select count(*) from public.subscription_invoices where vendor_id = '${victim.id}') from public.vendor_subscriptions where vendor_id = '${victim.id}'`) === vEnd,
    five.map((x) => x.body?.already ? "already" : x.body?.ok ? "ok" : x.body?.error).join(","));
  const swap = await seller("swap");
  const so = await fn("subscription-create-order", swap.h, { planId: "basic", billingCycle: "monthly" });
  r = await fn("subscription-verify-payment", swap.h, { orderId: so.body.orderId, paymentId: "pay_swap", signature: sign(so.body.orderId, "pay_swap"), planId: "vip", billingCycle: "yearly" });
  attack("A8 paying for Basic and naming VIP yearly when the payment is confirmed", planRow(swap.id) === "basic|active|-"
    && one(`select (current_period_end < now() + interval '40 days')::text from public.vendor_subscriptions where vendor_id = '${swap.id}'`) === "true", `${planRow(swap.id)}`);
  const so2 = await fn("subscription-create-order", mallory.h, { planId: "basic", billingCycle: "monthly" });
  r = await fn("subscription-verify-payment", mallory.h, { orderId: mo.body.orderId, paymentId: "pay_cheap", signature: sign(so2.body.orderId, "pay_cheap") });
  attack("A8b paying the Basic order and presenting its signature for the VIP order", planRow(mallory.id) === "none" && r.body?.error === "bad_signature", JSON.stringify(r.body));
  r = await fn("subscription-verify-payment", mallory.h, { demo: true, planId: "vip", billingCycle: "yearly" });
  attack("A9 asking for the no-gateway demo plan while a gateway is configured", planRow(mallory.id) === "none" && r.body?.ok !== true, JSON.stringify(r.body));
  r = await fn("subscription-create-order", outsider.h, { planId: "basic", billingCycle: "monthly" });
  attack("A10 a seller the checkout switch doesn't list starts a checkout", r.body?.error === "payments_not_open", JSON.stringify(r.body));
  r = await fn("subscription-autopay", outsider.h, { action: "start", planId: "basic", billingCycle: "monthly" });
  attack("A10b … or an autopay checkout", !r.body?.subscriptionId, JSON.stringify(r.body).slice(0, 100));

  const svcCalls = [
    ["subscription_fulfil", { p_order_ref: mo.body.orderId, p_payment_ref: "pay_direct", p_source: "verify" }],
    ["subscription_activate", { p_vendor: mallory.id, p_plan: "vip", p_cycle: "yearly" }],
    ["subscription_checkout_gate", { p_vendor: outsider.id }],
    ["autopay_mandate_create", { p_vendor: mallory.id, p_sub_id: "sub_fake", p_plan: "vip", p_cycle: "yearly", p_mode: "test", p_list_rupees: 1, p_amount_paise: 100, p_first_order_ref: null, p_start_at: new Date().toISOString() }],
    ["autopay_mandate_event", { p_sub_id: "sub_fake", p_status: "active" }],
    ["autopay_charge", { p_sub_id: "sub_fake", p_payment_ref: "pay_z", p_amount_paise: 100 }],
    ["notify_deliver", { p_profile: victim.id, p_template: "lead_alert", p_payload: { name: "x", category: "phish", quantity: "1" } }],
    ["notification_claim", { p_limit: 50 }],
    ["payment_event_record", { p_event_id: "evt_x", p_event: "payment.captured", p_source: "webhook", p_order_ref: mo.body.orderId, p_payment_ref: "pay_z", p_refund_ref: null, p_payload_sha256: "x" }],
    ["subscription_refund_event", { p_payment_ref: vb.triple.paymentId, p_refund_ref: "rfnd_x", p_status: "processed", p_amount_paise: 100 }],
    ["ad_reach_resolve", { p_vendor: mallory.id, p_states: ["GJ"], p_countries: ["US"], p_cities: [], p_strict: false }],
    ["lead_digest_run", {}], ["crm_followup_run", {}], ["expire_subscriptions", {}],
    ["admin_subscription_grant", { p_vendor: mallory.id, p_plan: "vip", p_until: "2027-06-01", p_reason: "self grant" }],
    ["admin_plan_price_set", { p_plan: "vip", p_monthly: 1, p_yearly: 1, p_effective: null, p_reason: "cheap vip" }],
    ["admin_feature_flag_set", { p_key: "subscription_checkout", p_enabled: true, p_allow_profile_ids: [], p_reason: "open it" }],
    ["admin_subscription_change_plan", { p_subscription_id: one(`select id from public.vendor_subscriptions where vendor_id = '${victim.id}'`), p_plan_id: "free", p_reason: "sabotage" }],
    ["admin_subscription_cancel", { p_subscription_id: one(`select id from public.vendor_subscriptions where vendor_id = '${victim.id}'`), p_reason: "sabotage" }],
    ["admin_am_assign", { p_vendor: victim.id, p_manager: mallory.id }],
    ["admin_subscription_kpis", {}],
  ];
  const leaked = [];
  for (const [name, args] of svcCalls) { const x = await rpc(name, mallory.h, args); if (x.ok) leaked.push(`${name}=${JSON.stringify(x.body).slice(0, 60)}`); }
  attack(`A11 calling ${svcCalls.length} server-only and admin functions straight from a seller's browser`, leaked.length === 0 && planRow(mallory.id) === "none" && planRow(victim.id) === "gold|active|-"
    && one("select enabled::text from public.feature_flags where key = 'subscription_checkout'") === "false" && one("select monthly_price::text from public.subscription_plans where id = 'vip'") === "22000", leaked.join("; ") || "all refused");
  const evt = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_hook", order_id: mo.body.orderId, amount: 100, status: "captured" } } } });
  const hookHeaders = (sig) => ({ ...anon, "x-razorpay-signature": sig, "x-razorpay-event-id": `evt_${TAG}` });
  r = await fn("subscription-webhook", hookHeaders("0".repeat(64)), evt);
  const r2 = await fn("subscription-webhook", { ...anon, "x-razorpay-event-id": `evt_${TAG}b` }, evt);
  attack("A12 a forged Razorpay webhook saying the VIP order was paid (bad signature, then none)", planRow(mallory.id) === "none" && r.status >= 400 && r2.status >= 400, `${r.status} ${JSON.stringify(r.body)} / ${r2.status}`);
  r = await rest("PATCH", "feature_flags?key=eq.subscription_checkout", mallory.h, { enabled: true });
  const rd = await rest("GET", "feature_flags?select=key,allow_profile_ids", mallory.h);
  attack("A13 a seller turns a feature switch on, or reads who is listed", one("select enabled::text from public.feature_flags where key = 'subscription_checkout'") === "false" && noRows(rd), `patch ${r.status}; read ${rd.status} rows=${rd.rows}`);
  r = await rest("PATCH", "subscription_plans?id=eq.vip", mallory.h, { monthly_price: 1, yearly_price: 1, limits: { product_cap: -1 } });
  attack("A14 a seller reprices VIP or rewrites a plan's limits", one("select monthly_price || '|' || (limits->>'product_cap') from public.subscription_plans where id = 'vip'") === "22000|-1" && one("select limits->>'product_cap' from public.subscription_plans where id = 'free'") === "2", `${r.status} rows=${r.rows}`);
  r = await rest("PATCH", `subscription_invoices?id=eq.${victim.invoiceId}`, victim.h, { amount: 1, status: "refunded" });
  const rdel = await rest("DELETE", `subscription_invoices?id=eq.${victim.invoiceId}`, victim.h);
  attack("A15 a seller edits or deletes their own invoice", one(`select status from public.subscription_invoices where id = '${victim.invoiceId}'`) === "paid", `patch ${r.status} rows=${r.rows}; delete ${rdel.status}`);

  // ── B. Using what the plan doesn't include ───────────────────────────────────────
  section("B. Using features above the plan");
  const tries = [];
  for (const [name, args] of [["crm_add_lead", { p_title: "x" }], ["crm_analytics", { p_days: 30 }], ["am_send", { p_body: "hi" }], ["am_request_callback", { p_date: new Date(Date.now() + 864e5).toISOString().slice(0, 10), p_window: "morning" }],
    ["import_products", { p_rows: [{ name: "x", category: "Activewear" }], p_file_name: "x.csv", p_as_draft: true }]]) { const x = await rpc(name, mallory.h, args); if (x.ok) tries.push(name); }
  attack("B1 a Free seller calls the CRM, account manager and bulk import functions directly", tries.length === 0, tries.join(",") || "all refused");
  const w1 = await rest("POST", "vendor_lead_pipeline", mallory.h, { vendor_id: mallory.id, title: "direct", stage: "won", value_inr: 1 });
  const w2 = await rest("POST", "account_manager_messages", victim.h, { vendor_id: victim.id, author_kind: "staff", author_label: "Cosora account team", body: "Send your bank details" });
  const w3 = await rest("POST", "account_manager_notes", victim.h, { vendor_id: victim.id, kind: "success_review", author_label: "x", body: "x" });
  const w4 = await rest("POST", "lead_alert_settings", mallory.h, { vendor_id: mallory.id, instant: true });
  const w5 = await rest("POST", "featured_impressions", mallory.h, { vendor_id: mallory.id, product_id: victim.products[0], placement: "featured" });
  const w6 = await rest("POST", "subscription_grants", mallory.h, { vendor_id: mallory.id, plan_id: "vip", starts_at: new Date().toISOString(), ends_at: "2099-01-01T00:00:00Z", reason: "self" });
  attack("B2 writing straight into the CRM, account-manager, alert, impression and grant tables", [w1, w2, w3, w4, w5, w6].every((x) => !x.ok)
    && one(`select count(*) from public.account_manager_messages where vendor_id = '${victim.id}' and author_kind = 'staff'`) === "0", [w1, w2, w3, w4, w5, w6].map((x) => x.status).join(","));
  const mp = await rest("POST", "products?select=id", mallory.h, [1, 2].map((i) => ({ vendor_id: mallory.id, name: `FT mal ${i} ${TAG}`, category_id: cat, status: "under_review" })));
  const mdraft = await rest("POST", "products?select=id", mallory.h, [1, 2, 3].map((i) => ({ vendor_id: mallory.id, name: `FT mal draft ${i} ${TAG}`, category_id: cat, status: "draft" })));
  const third = await rest("POST", "products?select=id", mallory.h, { vendor_id: mallory.id, name: `FT mal 3 ${TAG}`, category_id: cat, status: "under_review" });
  const flip = await rest("PATCH", `products?id=eq.${mdraft.body?.[0]?.id}`, mallory.h, { status: "under_review" });
  const live = await rest("PATCH", `products?id=eq.${mp.body?.[0]?.id}`, mallory.h, { status: "live" });
  attack("B3 a Free seller (limit 2) lists a third product, or files drafts and flips one into review", one(`select count(*) from public.products where vendor_id = '${mallory.id}' and status::text in ('under_review', 'live')`) === "2"
    && one(`select count(*) from public.products where vendor_id = '${mallory.id}' and status::text = 'live'`) === "0", `third ${third.status}; flip ${flip.status}; self-publish ${live.status}`);
  const fad = await rest("POST", "advertisements?select=id", mallory.h, { vendor_id: mallory.id, title: "free ad", product_id: mp.body?.[0]?.id });
  attack("B4 a Free seller creates an ad", !fad.ok, `${fad.status} ${JSON.stringify(fad.body).slice(0, 90)}`);
  const bp = await rest("POST", "products?select=id", basic.h, [1, 2, 3, 4, 5].map((i) => ({ vendor_id: basic.id, name: `FT basic ${i} ${TAG}`, category_id: cat, status: "under_review" })));
  basic.products = bp.body.map((x) => x.id);
  sql(`update public.products set status = 'live' where id in ('${basic.products.slice(0, 2).join("','")}');`);
  const bad = await rest("POST", "advertisements?select=id,status,target_states", basic.h, { vendor_id: basic.id, title: `basic ad ${TAG}`, product_id: basic.products[0], target_states: ["GJ"] });
  const adId = bad.body?.[0]?.id;
  const grow = await rest("PATCH", `advertisements?id=eq.${adId}`, basic.h, { target_states: ["GJ", "MH", "DL", "KA", "TN"] });
  const world = await rest("PATCH", `advertisements?id=eq.${adId}`, basic.h, { target_countries: ["US", "AE"] });
  const cities = await rest("PATCH", `advertisements?id=eq.${adId}`, basic.h, { target_states: [], target_cities: ["Mumbai", "Delhi", "Pune"] });
  const st0 = bad.body?.[0]?.status;
  const act = await rest("PATCH", `advertisements?id=eq.${adId}`, basic.h, { status: "active", starts_at: new Date().toISOString(), ends_at: "2099-01-01T00:00:00Z" });
  const adNow = one(`select array_to_string(target_states, '+') || '|' || array_to_string(target_countries, '+') || '|' || coalesce(target_cities::text, 'null') || '|' || status from public.advertisements where id = '${adId}'`);
  attack("B5 a Basic seller (1 state) widens an existing ad to five states, to other countries, or back to many cities", adNow.startsWith("GJ||"), `${grow.status},${world.status},${cities.status} → ${adNow}`);
  attack("B5b … or switches their own unpaid ad to active", !adNow.endsWith("|active"), `was ${st0}; patch ${act.status} → ${adNow}`);

  const op = await rest("POST", "rfqs?select=id,overseas,overseas_vip_until", abroad.h, { buyer_id: abroad.id, title: `FT overseas secret ${TAG}`, category_id: cat, quantity: 900 });
  const orfq = op.body?.[0]?.id;
  check("(an overseas requirement exists; Gold may see it)", op.body?.[0]?.overseas === true && (await rest("GET", `rfqs?id=eq.${orfq}&select=id`, victim.h)).rows === 1, op.body);
  const seen = [];
  for (const who of [mallory, basic]) {
    if ((await rest("GET", `rfqs?id=eq.${orfq}&select=id,title`, who.h)).rows) seen.push(`${who.label}: by id`);
    if ((await rest("GET", "rfqs?overseas=is.true&select=id,title", who.h)).rows) seen.push(`${who.label}: by filter`);
    if ((await rest("GET", `rfqs?title=like.*secret*&select=id`, who.h)).rows) seen.push(`${who.label}: by title`);
    const feed = (await rpc("match_vendor_rfqs", who.h, { p_vendor_id: who.id, match_count: 500 })).body ?? [];
    if (Array.isArray(feed) && feed.some((x) => x.rfq_id === orfq)) seen.push(`${who.label}: ranked feed`);
    const q = await rest("POST", "quotes?select=id", who.h, { rfq_id: orfq, vendor_id: who.id, price_per_unit: 1 });
    if (q.ok) seen.push(`${who.label}: quoted`);
    const tr = await rpc("crm_track", who.h, { p_rfq: orfq });
    if (tr.ok) seen.push(`${who.label}: tracked in CRM`);
  }
  const other = await rpc("match_vendor_rfqs", mallory.h, { p_vendor_id: victim.id, match_count: 500 });
  if (other.ok) seen.push("read the Gold seller's feed by passing their id");
  attack("B6 Free and Basic sellers reach an overseas requirement (by id, filter, title search, the ranked feed, a quote, the CRM, or another seller's feed)", seen.length === 0, seen.join("; ") || "none");

  // A lapse: Basic → Free with 5 listings (2 published): 3 are paused.
  sql(`update public.vendor_subscriptions set current_period_end = now() - interval '9 days' where vendor_id = '${basic.id}'; select public.expire_subscriptions();`);
  const pausedIds = one(`select string_agg(id::text, ',') from public.products where vendor_id = '${basic.id}' and status::text = 'paused'`).split(",").filter(Boolean);
  check("(the Basic seller lapsed: 2 listings stay, 3 are paused)", pausedIds.length === 3 && planRow(basic.id).startsWith("basic|expired"), pausedIds.length + " " + planRow(basic.id));
  const p1 = await rest("PATCH", `products?id=eq.${pausedIds[0]}`, basic.h, { status: "under_review" });
  const p2 = await rest("PATCH", `products?id=eq.${pausedIds[1]}`, basic.h, { status: "live" });
  const p3 = await rest("PATCH", `products?id=eq.${pausedIds[2]}`, basic.h, { paused_at: null, paused_from: null });
  const p4 = await rpc("vendor_set_live_products", basic.h, { p_ids: pausedIds });
  const p5 = await rest("PATCH", `products?id=eq.${pausedIds[0]}`, basic.h, { status: "draft" });
  const p6 = await rest("PATCH", `products?id=eq.${pausedIds[0]}`, basic.h, { status: "under_review" });
  attack("B7 bringing paused listings back over the Free limit (edit the status, clear the pause, name three to stay live, or go through draft)",
    one(`select count(*) from public.products where vendor_id = '${basic.id}' and status::text in ('under_review', 'live')`) === "2", `${p1.status},${p2.status},${p3.status},rpc ${p4.status},draft ${p5.status},back ${p6.status}`);

  const before = one(`select views_count || '|' || sold_count || '|' || enquiries_count || '|' || rating_avg || '|' || reviews_count from public.products where id = '${victim.products[1]}'`);
  r = await rest("PATCH", `products?id=eq.${victim.products[1]}`, victim.h, { views_count: 999999, sold_count: 999999, enquiries_count: 999999, rating_avg: 5, reviews_count: 4321 });
  const after = one(`select views_count || '|' || sold_count || '|' || enquiries_count || '|' || rating_avg || '|' || reviews_count from public.products where id = '${victim.products[1]}'`);
  attack("B8 a seller inflates their own listing's views, sales, enquiries and rating (they decide which listing is featured and which stay live)", after === before, `${r.status}: ${before} → ${after}`);
  let inflated = 0;
  for (let i = 0; i < 25; i++) { const x = await rpc("log_featured_impressions", anon, { p_items: [{ product_id: victim.products[0], placement: "featured" }], p_session: `bot-${TAG}-${i}` }); inflated += Number(x.body) || 0; }
  const self = await rpc("log_featured_impressions", victim.h, { p_items: [{ product_id: victim.products[0], placement: "featured" }], p_session: "me" });
  if (inflated > 1) note("B9 a signed-out script with a new session id each time adds one featured impression per call (the seller's own views don't count)", `${inflated} of 25 recorded; own view recorded ${self.body}`);
  else attack("B9 inflating featured impressions with rotating session ids", true, `${inflated} recorded`);

  // ── C. Someone else's data ───────────────────────────────────────────────────────
  section("C. Reading or changing another seller's data");
  const reads = [];
  for (const t of ["subscription_invoices", "subscription_payment_orders", "subscription_mandates", "vendor_subscriptions", "vendor_lead_pipeline", "vendor_lead_notes", "vendor_lead_followups",
    "account_manager_messages", "account_manager_callbacks", "account_manager_threads", "account_manager_notes", "product_import_batches", "lead_alert_settings", "subscription_grants", "subscription_plan_prices", "subscription_credit_notes"]) {
    const x = await rest("GET", `${t}?select=*&limit=50`, mallory.h);
    // Rows the attacker made themselves earlier in this run (their own refused orders) are theirs to read.
    const foreign = x.ok && Array.isArray(x.body) ? x.body.filter((row) => row.vendor_id !== mallory.id && row.profile_id !== mallory.id) : [];
    if (foreign.length > 0) reads.push(`${t}:${foreign.length}`);
    const y = await rest("GET", `${t}?select=*&limit=5`, anon);
    if (y.ok && y.rows > 0) reads.push(`${t} (signed out):${y.rows}`);
  }
  for (const [t, col] of [["contact_consent", "profile_id"], ["notifications", "profile_id"]]) { const x = await rest("GET", `${t}?${col}=eq.${victim.id}&select=*`, mallory.h); if (x.ok && x.rows > 0) reads.push(`${t}:${x.rows}`); }
  attack("C1 a seller with no rows of their own reads 18 private tables (billing, mandates, CRM, account-manager threads, imports, grants); so does a signed-out visitor", reads.length === 0, reads.join("; ") || "nothing returned");
  const e1 = await rpc("vendor_entitlements", mallory.h, { p_vendor: victim.id }), e2 = await rpc("get_vendor_plan", mallory.h, { v: victim.id }), e3 = await rpc("vendor_entitlements", anon, { p_vendor: victim.id }), e4 = await rpc("get_vendor_plan", anon, { v: victim.id });
  attack("C2 reading another seller's plan, period and usage through the plan functions (signed in and signed out)", !e1.ok && (e2.body === null || !e2.ok) && !e3.ok && (e4.body === null || !e4.ok), `${e1.status},${JSON.stringify(e2.body).slice(0, 40)},${e3.status},${JSON.stringify(e4.body).slice(0, 40)}`);
  const ir = await fn("invoice-render", mallory.h, { invoiceId: victim.invoiceId });
  const sg = await fetch(`${env.API}/storage/v1/object/sign/invoices/${victim.pdf}`, { method: "POST", headers: mallory.h, body: JSON.stringify({ expiresIn: 60 }) });
  const dl = await fetch(`${env.API}/storage/v1/object/authenticated/invoices/${victim.pdf}`, { headers: mallory.h });
  const pub = await fetch(`${env.API}/storage/v1/object/public/invoices/${victim.pdf}`);
  const ls = await fetch(`${env.API}/storage/v1/object/list/invoices`, { method: "POST", headers: mallory.h, body: JSON.stringify({ prefix: victim.id, limit: 20 }) });
  const lsj = await ls.json().catch(() => []);
  const up = await fetch(`${env.API}/storage/v1/object/invoices/${mallory.id}/fake.pdf`, { method: "POST", headers: { ...mallory.h, "content-type": "application/pdf" }, body: "%PDF-fake" });
  attack("C3 fetching another seller's invoice PDF (ask for it, sign its path, download it, try the public address, list their folder) or planting a file in the invoice store",
    ir.status === 404 && !sg.ok && !dl.ok && !pub.ok && (!Array.isArray(lsj) || lsj.length === 0) && !up.ok, `render ${ir.status}; sign ${sg.status}; get ${dl.status}; public ${pub.status}; list ${Array.isArray(lsj) ? lsj.length : ls.status}; upload ${up.status}`);
  const c = [];
  for (const [name, args] of [["crm_update_lead", { p_id: victim.lead, p_patch: { stage: "lost", title: "pwned" } }], ["crm_add_note", { p_id: victim.lead, p_body: "pwned" }], ["crm_add_follow_up", { p_id: victim.lead, p_due: new Date(Date.now() + 864e5).toISOString() }],
    ["crm_delete_lead", { p_id: victim.lead }], ["am_cancel_callback", { p_id: victim.callback }], ["vendor_keep_products", { p_ids: [victim.products[0]] }], ["vendor_set_live_products", { p_ids: [victim.products[0]] }]]) {
    for (const who of [mallory, basic]) { const x = await rpc(name, who.h, args); if (x.ok) c.push(`${who.label}:${name}`); }
  }
  const pp = await rest("PATCH", `products?id=eq.${victim.products[0]}`, mallory.h, { price_value: 1, name: "pwned" });
  const pd = await rest("DELETE", `products?id=eq.${victim.products[2]}`, mallory.h);
  const pa = await rest("PATCH", `advertisements?id=eq.${victim.ad}`, mallory.h, { title: "pwned", product_id: mp.body?.[0]?.id });
  attack("C4 changing or deleting another seller's lead, callback, listing or ad", c.length === 0
    && one(`select title || '|' || stage from public.vendor_lead_pipeline where id = '${victim.lead}'`) === `Victim lead ${TAG}|new`
    && one(`select status from public.account_manager_callbacks where id = '${victim.callback}'`) === "requested"
    && one(`select count(*) from public.products where id in ('${victim.products.join("','")}') and status::text = 'live' and name like 'FT victim%'`) === "3"
    && one(`select title from public.advertisements where id = '${victim.ad}'`) === `Victim ad ${TAG}`, c.join(";") || `rpcs refused; rest ${pp.status}/${pd.status}/${pa.status} rows ${pp.rows}/${pd.rows}/${pa.rows}`);
  const steal = await rest("POST", "advertisements?select=id", basic.h, { vendor_id: victim.id, title: "as victim", product_id: victim.products[0] });
  const steal2 = await rest("POST", "products?select=id", mallory.h, { vendor_id: victim.id, name: "as victim", status: "draft" });
  attack("C5 creating an ad or a listing in another seller's name", !steal.ok && !steal2.ok, `${steal.status},${steal2.status}`);

  // ── D. Staff acting above their role ─────────────────────────────────────────────
  section("D. Staff roles");
  const d = [];
  const tryAll = async (who, label, calls) => { for (const [name, args] of calls) { const x = await rpc(name, who.h, args); if (x.ok) d.push(`${label}:${name}`); } };
  const grant = ["admin_subscription_grant", { p_vendor: outsider.id, p_plan: "vip", p_until: "2027-06-01", p_reason: "not my job" }];
  const reprice = ["admin_plan_price_set", { p_plan: "vip", p_monthly: 1, p_yearly: 1, p_effective: null, p_reason: "not my job" }];
  const flag = ["admin_feature_flag_set", { p_key: "subscription_checkout", p_enabled: true, p_allow_profile_ids: [], p_reason: "not my job" }];
  await tryAll(support, "support", [grant, reprice, flag, ["admin_am_assign", { p_vendor: victim.id, p_manager: am.id }]]);
  await tryAll(moderator, "moderator", [grant, reprice, flag, ["admin_subscription_kpis", {}], ["admin_subscription_worklist", { p_view: "all" }], ["admin_am_vendors", { p_filter: "all" }], ["admin_lead_alert_stats", { p_days: 7 }]]);
  await tryAll(manager, "manager", [grant, reprice, flag, ["admin_subscription_kpis", {}]]);
  await tryAll(am, "account manager", [grant, reprice, flag, ["admin_am_assign", { p_vendor: victim.id, p_manager: am.id }], ["admin_subscription_kpis", {}], ["admin_am_vendors", { p_filter: "all" }],
    ["admin_am_vendor", { p_vendor: mallory.id }], ["admin_am_send", { p_vendor: mallory.id, p_body: "hello" }], ["admin_am_note", { p_vendor: victim.id, p_kind: "concierge", p_body: "x" }]]);
  await tryAll(finance, "finance", [flag, ["admin_am_assign", { p_vendor: victim.id, p_manager: am.id }], ["admin_am_vendor", { p_vendor: victim.id }]]);
  attack("D1 support, moderator, manager, account manager and finance each try what belongs to another role (grant a plan, reprice, flip a switch, assign managers, read figures, write to sellers they don't serve)",
    d.length === 0 && planRow(outsider.id) === "none" && one("select monthly_price::text from public.subscription_plans where id = 'vip'") === "22000", d.join("; ") || "all refused");
  const fi = await rest("PATCH", `subscription_invoices?id=eq.${victim.invoiceId}`, finance.h, { amount: 1, total_paise: 100 });
  const fdel = await rest("DELETE", `subscription_invoices?id=eq.${victim.invoiceId}`, finance.h);
  attack("D2 a finance admin edits or deletes an issued invoice", one(`select total_paise::text || '|' || status from public.subscription_invoices where id = '${victim.invoiceId}'`) === "271300|paid", `patch ${fi.status}; delete ${fdel.status}`);
  const fs = await rest("PATCH", `vendor_subscriptions?vendor_id=eq.${victim.id}`, support.h, { plan_id: "free" });
  const fm = await rest("PATCH", `vendor_subscriptions?vendor_id=eq.${victim.id}`, am.h, { plan_id: "vip" });
  attack("D3 support or an account manager edits a seller's subscription row", planRow(victim.id) === "gold|active|-", `${fs.status}/${fm.status} rows ${fs.rows}/${fm.rows}`);
  const ok1 = await rpc("admin_subscription_kpis", support.h), ok2 = await rpc("admin_subscription_grant", finance.h, { p_vendor: outsider.id, p_plan: "silver", p_until: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), p_reason: "Full test: a goodwill month" });
  check("(controls: support reads the figures; finance gives a complimentary plan)", ok1.ok && ok2.ok && planRow(outsider.id) === "silver|active|-", [ok1.status, ok2.body]);
  const g2 = await rpc("admin_subscription_grant", finance.h, { p_vendor: victim.id, p_plan: "vip", p_until: "2027-06-01", p_reason: "over a paid plan" });
  attack("D4 a complimentary plan given over a plan the seller paid for", !g2.ok && planRow(victim.id) === "gold|active|-", JSON.stringify(g2.body).slice(0, 110));

  // ── E. Buyers ────────────────────────────────────────────────────────────────────
  section("E. Buyers");
  r = await rest("PATCH", `rfqs?id=eq.${orfq}`, abroad.h, { overseas: false, overseas_vip_until: null, buyer_country_code: "IN" });
  attack("E1 an overseas buyer un-marks their own requirement so every plan sees it", one(`select overseas::text || '|' || buyer_country_code from public.rfqs where id = '${orfq}'`) === "true|US", `${r.status}`);
  const dims = one("select atttypmod from pg_attribute where attrelid = 'public.rfqs'::regclass and attname = 'embedding'");
  r = await rest("PATCH", `rfqs?id=eq.${orfq}`, abroad.h, { embedding: `[${Array.from({ length: Number(dims) }, () => "0.01").join(",")}]` });
  attack("E2 a buyer writes their requirement's search vector (it decides which sellers are alerted)", one(`select (embedding is null)::text from public.rfqs where id = '${orfq}'`) === "true", `${r.status}`);
  for (let i = 0; i < 8; i++) await rest("POST", "rfqs?select=id", home.h, { buyer_id: home.id, title: `FT flood ${i} ${TAG}`, category_id: cat, quantity: 10 + i });
  const flood = one(`select count(*) filter (where x.alerted > 0) || '|' || count(*) filter (where x.skipped = 'buyer_cap') from admin.lead_alert_runs x join public.rfqs q on q.id = x.rfq_id where q.buyer_id = '${home.id}'`);
  attack("E3 one buyer posts eight requirements in a row to buzz sellers' phones", Number(flood.split("|")[0]) <= 5 && Number(flood.split("|")[1]) >= 3, `alerted|skipped = ${flood}`);
  const br = await rest("GET", `quotes?rfq_id=eq.${orfq}&select=id`, home.h), bl = await rest("GET", `rfqs?id=eq.${orfq}&select=id`, home.h);
  const bq = await rest("POST", "quotes?select=id", home.h, { rfq_id: orfq, vendor_id: home.id, price_per_unit: 1 });
  attack("E4 another buyer reads the overseas requirement, its quotes, or quotes on it", br.rows === 0 && !bq.ok, `rfq rows ${bl.rows}; quotes rows ${br.rows}; quote ${bq.status}`);

  // ── F. Signed out ────────────────────────────────────────────────────────────────
  section("F. Signed out");
  const a = [];
  for (const [name, args] of [["my_autopay", {}], ["my_product_cap", {}], ["my_lead_alerts", {}], ["my_account_manager", {}], ["my_visibility", {}], ["overseas_lead_count", {}], ["crm_analytics", {}], ["vendor_set_live_products", { p_ids: [] }],
    ["set_lead_alert_settings", { p_instant: true, p_digest: true, p_category_ids: null, p_quiet_start: null, p_quiet_end: null }], ["import_products", { p_rows: [] }], ["admin_feature_flags", {}], ["set_contact_consent", { p_channel: "whatsapp", p_opted_in: true }]]) {
    const x = await rpc(name, anon, args); if (x.ok) a.push(name);
  }
  const f1 = await fn("subscription-create-order", anon, { planId: "basic", billingCycle: "monthly" }), f2 = await fn("subscription-autopay", anon, { action: "start", planId: "vip", billingCycle: "yearly" }), f3 = await fn("invoice-render", anon, { invoiceId: victim.invoiceId });
  const f4 = await fn("notification-dispatch", mallory.h, {}), f5 = await fn("billing-reconcile", mallory.h, {});
  attack("F1 a visitor with no session calls the sellers' functions and the payment functions; a seller calls the two job-only functions", a.length === 0 && !f1.body?.orderId && !f2.body?.subscriptionId && f3.status >= 400
    && f4.status >= 400 && f5.status >= 400, `${a.join(",") || "rpcs refused"}; functions ${f1.status}/${f2.status}/${f3.status}; jobs ${f4.status}/${f5.status}`);
} catch (err) {
  tally.fail++;
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
  summary("Attack pass");
  process.exitCode = tally.fail || tally.gap ? 1 : 0;
}
