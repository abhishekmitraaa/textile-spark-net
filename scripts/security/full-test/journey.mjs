// The paid-plan journey, on the LOCAL stack: a fresh seller buys each paid plan through the real one-off path
// (create-order → mock Razorpay → verify-payment → fulfilment → invoice), then uses everything that plan includes,
// and is refused what it doesn't. Then plan changes (upgrade, renewal, downgrade) and the end of a plan.
import { env, SIDE, TAG, sql, check, note, section, svc, anon, asUser, token, emailOf, fn, rpc, rest, list, seller, buyer, staff, buy, planRow, cleanup, summary, tally } from "./lib.mjs";

const PLANS = ["basic", "silver", "gold", "vip"];
const price = Object.fromEntries(sql("select string_agg(id || ':' || monthly_price, ',') from public.subscription_plans").split(",").map((x) => x.split(":")));
const cap = { basic: 10, silver: 19, gold: 200, vip: -1 };
const want = {
  basic:  { crm: "none",      am: "none",   overseas: "none", featured: "none",      catalogue: "pdf",  bulk: false, channels: ["digest"],                          ad: "state_1",   states: 1 },
  silver: { crm: "pipeline",  am: "shared", overseas: "none", featured: "top10",     catalogue: "bulk", bulk: true,  channels: ["app", "digest"],                   ad: "state_4",   states: 4 },
  gold:   { crm: "analytics", am: "named",  overseas: "gold", featured: "top5",      catalogue: "bulk", bulk: true,  channels: ["app", "email", "whatsapp", "sms"], ad: "pan_india", states: null },
  vip:    { crm: "success",   am: "vip",    overseas: "vip",  featured: "spotlight", catalogue: "bulk", bulk: true,  channels: ["app", "email", "whatsapp", "sms"], ad: "global",    states: null },
};
// A category nobody else's test data uses.
const [cat, catName, catParent] = sql(`select c.id || '|' || c.name || '|' || pc.name from public.categories c join public.categories pc on pc.id = c.parent_id
   where not exists (select 1 from public.products p where p.category_id = c.id) and not exists (select 1 from public.rfqs r where r.category_id = c.id)
   order by c.name limit 1`).split("|");
console.log(`category: ${catParent} > ${catName} (${cat}); run ${TAG}`);

const v = {};
try {
  const admin = { h: asUser(await token(emailOf("admin"))) };
  const am = await staff("am", "account_manager");

  // ── 1. Buying each plan ──────────────────────────────────────────────────────────
  for (const p of PLANS) {
    section(`${p.toUpperCase()}: buy it (monthly, ₹${price[p]} + GST)`);
    const s = (v[p] = await seller(p));
    const before = await rpc("vendor_entitlements", s.h, { p_vendor: s.id });
    check(`${p}: starts on Free`, before.body?.plan_id === "free" && before.body?.paid === false, before.body);

    const { order, verify, triple } = await buy(s, p);
    const expectPaise = (Number(price[p]) + Math.round(Number(price[p]) * 0.18)) * 100;   // GST is rounded to the rupee
    check(`${p}: an order for ₹${expectPaise / 100} (list + 18% GST, to the rupee)`, order.body?.orderId?.startsWith("order_") && order.body?.amount === expectPaise, order.body);
    check(`${p}: payment verified, plan fulfilled, invoiced`, verify?.body?.ok === true && Boolean(verify.body.invoiceId ?? verify.body.invoice_id), verify?.body);
    s.triple = triple;
    s.invoiceId = verify?.body?.invoiceId ?? verify?.body?.invoice_id;
    check(`${p}: subscription row active`, planRow(s.id) === `${p}|active|-`, planRow(s.id));
    const inv = sql(`select document_type || '|' || payment_mode || '|' || total_paise || '|' || coalesce(razorpay_payment_id, '') || '|' || status from public.subscription_invoices where id = '${s.invoiceId}'`);
    check(`${p}: a test-mode document for the amount paid, carrying the payment id`, inv === `test|test|${expectPaise}|${triple.paymentId}|paid`, inv);
    check(`${p}: seal and search cache on the profile`, sql(`select plan_id || '|' || (plan_expires_at > now() + interval '27 days') from public.vendor_profiles where id = '${s.id}'`) === `${p}|true`);

    const e = (await rpc("vendor_entitlements", s.h, { p_vendor: s.id })).body ?? {};
    const f = e.features ?? {};
    const w = want[p];
    check(`${p}: entitlements say what the plan includes`,
      e.plan_id === p && e.paid === true && f.product_cap === cap[p] && f.ad_location_scope === w.ad && f.crm_level === w.crm && f.am_level === w.am
      && f.overseas_tier === w.overseas && f.featured === w.featured && f.catalogue === w.catalogue && f.bulk_import === w.bulk
      && JSON.stringify(f.lead_alert_channels) === JSON.stringify(w.channels)
      && f.crm_pipeline === (w.crm !== "none") && f.crm_analytics === ["analytics", "success"].includes(w.crm) && f.am_page === (w.am !== "none")
      && f.overseas_leads === (w.overseas !== "none") && f.lead_alerts === true && f.visibility_page === true,
      f);

    const r1 = await fn("invoice-render", s.h, { invoiceId: s.invoiceId });
    let pdfOk = false;
    if (r1.body?.path) {
      const sg = await fetch(`${env.API}/storage/v1/object/sign/invoices/${r1.body.path}`, { method: "POST", headers: s.h, body: JSON.stringify({ expiresIn: 120 }) });
      const sj = await sg.json().catch(() => null);
      if (sj?.signedURL) {
        const g = await fetch(`${env.API}/storage/v1${sj.signedURL}`);
        pdfOk = g.ok && new TextDecoder().decode(new Uint8Array(await g.arrayBuffer()).slice(0, 5)) === "%PDF-";
      }
    }
    check(`${p}: the invoice downloads as a PDF`, pdfOk, r1.body);
  }

  // ── 2. Listings: the limit of each plan ──────────────────────────────────────────
  section("Listings: each plan's limit");
  for (const p of PLANS) {
    const s = v[p];
    const n = cap[p] < 0 ? 30 : cap[p];
    const rows = Array.from({ length: n }, (_, i) => ({ vendor_id: s.id, name: `FT ${p} listing ${i + 1} ${TAG}`, category_id: cat, price_value: 100 + i, status: "under_review" }));
    const ins = await rest("POST", "products?select=id,status", s.h, rows);
    s.products = (ins.body ?? []).map((x) => x.id);
    check(`${p}: ${n} listings accepted, all sent to review`, ins.status === 201 && ins.rows === n && ins.body.every((x) => x.status === "under_review"), ins.status + " " + JSON.stringify(ins.body).slice(0, 160));
    const more = await rest("POST", "products?select=id", s.h, { vendor_id: s.id, name: `FT ${p} one too many ${TAG}`, category_id: cat, status: "under_review" });
    if (cap[p] < 0) check(`${p}: no limit, one more is accepted`, more.status === 201, more.body);
    else check(`${p}: listing ${n + 1} is refused with the plan's limit`, more.status >= 400 && /Product limit reached/.test(JSON.stringify(more.body)), more.status + " " + JSON.stringify(more.body));
    const live = await rest("PATCH", `products?id=eq.${s.products[0]}&select=status`, s.h, { status: "live" });
    check(`${p}: a seller can't publish their own listing`, live.status >= 400 || live.body?.[0]?.status !== "live", JSON.stringify(live.body));
    // Moderation approves three, for the features that need published listings.
    sql(`update public.products set status = 'live', sold_count = 5 where id in ('${s.products.slice(0, 3).join("','")}');`);
    const pc = (await rpc("my_product_cap", s.h)).body ?? {};
    check(`${p}: my_product_cap counts them`, pc.cap === cap[p] && pc.active === (cap[p] < 0 ? 31 : n) && pc.paused === 0, pc);
  }

  // ── 3. Ads: how far each plan reaches ────────────────────────────────────────────
  section("Ads: reach by plan");
  for (const p of PLANS) {
    const s = v[p];
    const w = want[p];
    const mk = (states, countries = []) => rest("POST", "advertisements?select=id,target_states,target_countries", s.h,
      { vendor_id: s.id, title: `FT ${p} ad ${TAG}`, product_id: s.products[0], target_states: states, target_countries: countries });
    const own = await mk([]);
    if (w.states) check(`${p}: an ad naming no state reaches the seller's own state`, own.status === 201 && JSON.stringify(own.body[0].target_states) === '["GJ"]', own.status + " " + JSON.stringify(own.body));
    else check(`${p}: an ad naming no state reaches all of India`, own.status === 201 && own.body[0].target_states.length === 0, own.status + " " + JSON.stringify(own.body));
    s.ad = own.body?.[0]?.id;
    const five = await mk(["GJ", "MH", "RJ", "DL", "KA"]);
    if (w.states) check(`${p}: five states are refused (the plan reaches ${w.states})`, five.status >= 400 && /exceeds your plan/.test(JSON.stringify(five.body)), five.status + " " + JSON.stringify(five.body));
    else check(`${p}: five states are accepted`, five.status === 201 && five.body[0].target_states.length === 5, five.status + " " + JSON.stringify(five.body));
    if (w.states) {
      const ok = await mk(["GJ", "MH", "RJ", "DL"].slice(0, w.states));
      check(`${p}: ${w.states} state(s) accepted`, ok.status === 201 && ok.body[0].target_states.length === w.states, ok.status + " " + JSON.stringify(ok.body));
    }
    const abroad = await mk(["GJ"], ["US", "AE"]);
    if (p === "vip") check("vip: countries outside India are accepted", abroad.status === 201 && abroad.body[0].target_countries.length === 2, abroad.status + " " + JSON.stringify(abroad.body));
    else check(`${p}: countries outside India are refused (VIP only)`, abroad.status >= 400 && /VIP/.test(JSON.stringify(abroad.body)), abroad.status + " " + JSON.stringify(abroad.body));
  }

  // ── 4. Bulk import ───────────────────────────────────────────────────────────────
  section("Bulk catalogue import");
  for (const p of PLANS) {
    const s = v[p];
    const r = await rpc("import_products", s.h, { p_rows: [{ name: `FT import A ${TAG}`, category: `${catParent} > ${catName}`, price: "250" }, { name: "", category: "nope" }], p_file_name: "ft.csv", p_as_draft: true });
    if (want[p].bulk) check(`${p}: a sheet imports; the bad row is reported, the good one becomes a draft`, r.ok && r.body?.created === 1 && r.body?.failed === 1, r.body);
    else check(`${p}: bulk import is refused`, !r.ok && /Silver, Gold and VIP/.test(JSON.stringify(r.body)), r.body);
  }

  // ── 5. CRM ───────────────────────────────────────────────────────────────────────
  section("CRM");
  for (const p of PLANS) {
    const s = v[p];
    const add = await rpc("crm_add_lead", s.h, { p_title: `FT lead ${TAG}`, p_buyer_name: "A buyer", p_value: 50000, p_tags: ["hot"] });
    if (want[p].crm === "none") { check(`${p}: the CRM is refused`, !add.ok && /Silver, Gold and VIP/.test(JSON.stringify(add.body)), add.body); continue; }
    check(`${p}: a lead is added`, add.ok && typeof add.body === "string", add.body);
    s.lead = add.body;
    const up = await rpc("crm_update_lead", s.h, { p_id: s.lead, p_patch: { stage: "contacted", value_inr: 75000 } });
    const noteR = await rpc("crm_add_note", s.h, { p_id: s.lead, p_body: "Called, wants samples" });
    const fu = await rpc("crm_add_follow_up", s.h, { p_id: s.lead, p_due: new Date(Date.now() + 864e5).toISOString(), p_note: "Send samples" });
    const row = sql(`select stage || '|' || value_inr || '|' || (next_follow_up_at is not null) || '|' || (select count(*) from public.vendor_lead_notes n where n.pipeline_id = l.id) from public.vendor_lead_pipeline l where id = '${s.lead}'`);
    check(`${p}: stage moved, value set, note and follow-up kept, history written`, up.ok && noteR.ok && fu.ok && row === "contacted|75000.00|true|3", row + " " + JSON.stringify([up.body, noteR.body, fu.body]));
    const an = await rpc("crm_analytics", s.h, { p_days: 30 });
    if (["analytics", "success"].includes(want[p].crm)) check(`${p}: CRM analytics answer`, an.ok && an.body?.created >= 1 && an.body?.funnel?.contacted >= 1, an.body);
    else check(`${p}: CRM analytics are refused (Gold and VIP)`, !an.ok && /Gold and VIP/.test(JSON.stringify(an.body)), an.body);
  }

  // ── 6. Account manager ───────────────────────────────────────────────────────────
  section("Account manager");
  for (const p of ["gold", "vip"]) {
    const a = await rpc("admin_am_assign", admin.h, { p_vendor: v[p].id, p_manager: am.id });
    check(`${p}: a super admin names the account manager`, a.ok, a.body);
  }
  for (const p of PLANS) {
    const s = v[p];
    const me = (await rpc("my_account_manager", s.h)).body ?? {};
    const send = await rpc("am_send", s.h, { p_body: `Hello from ${p}` });
    if (want[p].am === "none") { check(`${p}: no account manager page, and a message is refused`, me.available === false && !send.ok, [me, send.body]); continue; }
    const named = want[p].am !== "shared";
    check(`${p}: ${named ? "a named manager (first name only)" : "the shared account team"}; the message is sent`,
      me.available === true && me.level === want[p].am && (named ? me.manager?.name === "FT" : me.manager === null) && me.concierge === (p === "vip") && send.ok, [me, send.body]);
    const reply = await rpc("admin_am_send", am.h, { p_vendor: s.id, p_body: "Hello, how can we help?" });
    const thread = await rest("GET", "account_manager_messages?select=author_kind,author_label&order=created_at", s.h);
    check(`${p}: the account manager replies, signed as ${named ? "themselves" : "the team"}`,
      reply.ok && thread.rows === 2 && thread.body[1].author_kind === "staff" && thread.body[1].author_label === (named ? "FT" : "Cosora account team"), [reply.body, thread.body]);
    const cb = await rpc("am_request_callback", s.h, { p_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), p_window: "morning", p_note: "About ads" });
    check(`${p}: a callback is booked`, cb.ok, cb.body);
    const cn = await rpc("admin_am_note", am.h, { p_vendor: s.id, p_kind: "success_review", p_body: "This month: 3 leads won." });
    if (p === "vip") check("vip: the monthly success review reaches the seller", cn.ok && (await rest("GET", "account_manager_notes?select=kind", s.h)).rows === 1, cn.body);
    else check(`${p}: success reviews are refused (VIP only)`, !cn.ok && /VIP/.test(JSON.stringify(cn.body)), cn.body);
  }

  // ── 7. Lead alerts ───────────────────────────────────────────────────────────────
  section("Lead alerts: a buyer in India posts a requirement in the category");
  const home = await buyer("home", { country: "India", countryCode: "IN", onSwitches: ["featured_listings"] });
  const post = await rest("POST", "rfqs?select=id,overseas", home.h, { buyer_id: home.id, title: `FT need 500 kurtis call 98765 43210 ${TAG}`, category_id: cat, quantity: 500 });
  check("the requirement is posted", post.status === 201 && post.body[0].overseas === false, post.status + " " + JSON.stringify(post.body));
  const rfq = post.body?.[0]?.id;
  const alerts = Object.fromEntries(sql(`select coalesce(string_agg(vendor_id || '=' || plan_id || '/' || array_to_string(channels, '+') || '/' || coalesce(held, '-'), ',' order by created_at, id), '') from admin.lead_alerts where rfq_id = '${rfq}'`)
    .split(",").filter(Boolean).map((x) => x.split("=")));
  check("basic: held for the daily digest, nothing sent now", alerts[v.basic.id] === "basic//digest_only", alerts[v.basic.id]);
  check("silver: the bell rings now", alerts[v.silver.id] === "silver/app/-", alerts[v.silver.id]);
  check("gold: the bell and an email now", alerts[v.gold.id] === "gold/app+email/-", alerts[v.gold.id]);
  check("vip: the bell and an email now", alerts[v.vip.id] === "vip/app+email/-", alerts[v.vip.id]);
  const order = sql(`select string_agg(plan_id, ',' order by ctid) from admin.lead_alerts where rfq_id = '${rfq}'`);
  check("vip is told first", order.startsWith("vip"), order);
  const bell = sql(`select title from public.notifications where profile_id = '${v.silver.id}' and kind = 'lead_match' order by created_at desc limit 1`);
  check("the bell's title has the phone number removed", /kurtis/.test(bell) && !/98765/.test(bell), bell);
  const mail = sql(`select o.payload::text from admin.notification_outbox o join admin.notification_templates nt on nt.id = o.template_id where o.profile_id = '${v.gold.id}' and nt.key = 'lead_alert' order by o.created_at desc limit 1`);
  check("the email carries the category and quantity, none of the buyer's words", mail.includes(catName) && mail.includes("500") && !/kurtis|98765/.test(mail), mail);
  const mine = (await rpc("my_lead_alerts", v.basic.h, { p_limit: 5 })).body ?? {};
  check("basic: the Lead alerts page lists it as waiting for the digest", mine.available === true && mine.alerts?.[0]?.held === "digest_only", mine.alerts?.[0]);

  // ── 8. Overseas requirements ─────────────────────────────────────────────────────
  section("Overseas: a buyer in the United States posts a requirement");
  const abroad = await buyer("abroad", { country: "United States", countryCode: "US", onSwitches: ["overseas_leads"] });
  const op = await rest("POST", "rfqs?select=id,overseas,overseas_vip_until,buyer_country_code", abroad.h, { buyer_id: abroad.id, title: `FT overseas order ${TAG}`, category_id: cat, quantity: 2000 });
  const o = op.body?.[0] ?? {};
  check("it is marked overseas, with VIP's 24-hour first look", op.status === 201 && o.overseas === true && o.buyer_country_code === "US"
    && new Date(o.overseas_vip_until) - Date.now() > 23 * 36e5, op.status + " " + JSON.stringify(op.body));
  const sees = async (s) => (await rest("GET", `rfqs?id=eq.${o.id}&select=id`, s.h)).rows === 1;
  const quote = (s) => rest("POST", "quotes?select=id", s.h, { rfq_id: o.id, vendor_id: s.id, price_per_unit: 120, moq: 100 });
  check("vip sees it; gold, silver and basic don't", (await sees(v.vip)) && !(await sees(v.gold)) && !(await sees(v.silver)) && !(await sees(v.basic)));
  const gq = await quote(v.gold);
  check("gold can't quote yet: it is with VIP sellers first", gq.status >= 400 && /VIP sellers first/.test(JSON.stringify(gq.body)), gq.status + " " + JSON.stringify(gq.body));
  const vq = await quote(v.vip);
  check("vip quotes on it", vq.status === 201, vq.status + " " + JSON.stringify(vq.body));
  const cnt = (await rpc("overseas_lead_count", v.basic.h)).body ?? {};
  check("basic is told how many there are, nothing more", cnt.tier === "none" && cnt.open >= 1 && !("items" in cnt), cnt);
  sql(`update public.rfqs set overseas_vip_until = now() - interval '1 minute' where id = '${o.id}';`);
  check("after the first look, gold sees it; silver and basic still don't", (await sees(v.gold)) && !(await sees(v.silver)) && !(await sees(v.basic)));
  const gq2 = await quote(v.gold), sq = await quote(v.silver);
  check("gold quotes; silver is refused", gq2.status === 201 && sq.status >= 400 && /Gold and VIP/.test(JSON.stringify(sq.body)), gq2.status + " " + sq.status + " " + JSON.stringify(sq.body));
  const feed = (await rpc("match_vendor_rfqs", v.silver.h, { p_vendor_id: v.silver.id, match_count: 200 })).body ?? [];
  check("silver's ranked Leads feed leaves it out", Array.isArray(feed) && !feed.some((x) => x.rfq_id === o.id), feed.length);

  // ── 9. Featured places and the spotlight ─────────────────────────────────────────
  section("Featured places on the category page, as a buyer the switch lists");
  const fl = (await rpc("featured_listings", home.h, { p_category: cat, p_session: `s-${TAG}` })).body ?? [];
  const slot = (s) => fl.find((x) => x.vendor_id === s.id);
  check("vip takes place 1 as the spotlight; gold in the top 5; silver featured; basic not", fl[0]?.vendor_id === v.vip.id && fl[0]?.tier === "spotlight" && slot(v.gold)?.tier === "top5"
    && slot(v.gold)?.slot <= 5 && slot(v.silver)?.tier === "top10" && !slot(v.basic), fl);
  const sp = (await rpc("spotlight_listings", home.h, { p_category: cat, p_session: `s-${TAG}`, p_limit: 8 })).body ?? [];
  check("the Spotlight rail holds only the VIP seller's listings", sp.length >= 1 && sp.every((x) => x.vendor_id === v.vip.id), sp);
  const notListed = (await rpc("featured_listings", abroad.h, { p_category: cat, p_session: "x" })).body;
  check("a buyer the switch doesn't list sees none", Array.isArray(notListed) && notListed.length === 0, notListed);
  const logged = await rpc("log_featured_impressions", home.h, { p_items: fl.map((x) => ({ product_id: x.product_id, placement: "featured" })).concat([{ product_id: sp[0]?.product_id, placement: "spotlight" }]), p_session: `s-${TAG}` });
  const again = await rpc("log_featured_impressions", home.h, { p_items: fl.map((x) => ({ product_id: x.product_id, placement: "featured" })), p_session: `s-${TAG}` });
  check("impressions are recorded once per viewer", logged.body === fl.length + 1 && again.body === 0, [logged.body, again.body]);
  const vis = (await rpc("my_visibility", v.vip.h, { p_days: 30 })).body ?? {};
  check("vip: the Visibility page shows the place and the impressions", vis.featured === "spotlight" && vis.impressions?.featured === 1 && vis.impressions?.spotlight === 1, vis);
  const visB = (await rpc("my_visibility", v.basic.h, { p_days: 30 })).body ?? {};
  check("basic: priority in category, no featured place", visB.featured === "none" && visB.boost === 1, visB);

  // ── 10. Changing plans ───────────────────────────────────────────────────────────
  section("Changing plans");
  const up = await buy(v.basic, "silver");
  check("basic → silver is an upgrade, and the unused days are credited", up.order.body?.change === "upgrade" && up.order.body?.credit > 0 && up.order.body.amount < (Number(price.silver) + Math.round(Number(price.silver) * 0.18)) * 100
    && up.verify?.body?.ok === true && planRow(v.basic.id) === "silver|active|-", [up.order.body, up.verify?.body]);
  const endBefore = sql(`select current_period_end from public.vendor_subscriptions where vendor_id = '${v.gold.id}'`);
  const rn = await buy(v.gold, "gold");
  const endAfter = sql(`select current_period_end from public.vendor_subscriptions where vendor_id = '${v.gold.id}'`);
  check("gold → gold is a renewal: one more month from the end of this one", rn.order.body?.change === "renewal" && rn.verify?.body?.ok === true
    && Math.round((new Date(endAfter) - new Date(endBefore)) / 864e5) >= 28, [rn.order.body?.change, endBefore, endAfter]);
  const keep = await rpc("vendor_keep_products", v.vip.h, { p_ids: v.vip.products.slice(5, 8) });
  const dn = await buy(v.vip, "gold");
  check("vip → gold is a downgrade: paid now, starts when VIP's month ends", dn.order.body?.change === "downgrade" && dn.verify?.body?.ok === true
    && planRow(v.vip.id) === "vip|active|gold" && keep.ok, [dn.order.body, dn.verify?.body, planRow(v.vip.id), keep.body]);
  const dup = await fn("subscription-create-order", v.vip.h, { planId: "silver", billingCycle: "monthly" });
  check("a second change while one is waiting is refused", dup.body?.error === "already_scheduled", dup.body);

  // ── 11. The end of a plan ────────────────────────────────────────────────────────
  section("The end of a plan (the seller who moved to Silver; 10 listings, 3 published)");
  const s = v.basic;
  sql(`update public.vendor_subscriptions set current_period_end = now() - interval '1 hour' where vendor_id = '${s.id}'; select public.expire_subscriptions();`);
  let e = (await rpc("vendor_entitlements", s.h, { p_vendor: s.id })).body ?? {};
  check("the day after it ends: still Silver, in its grace days, told by when to renew", e.plan_id === "silver" && e.status === "grace" && Boolean(e.grace_until)
    && sql(`select count(*) from public.notifications where profile_id = '${s.id}' and kind = 'plan_expiring'`) === "1", [e.status, e.grace_until]);
  sql(`update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = '${s.id}'; select public.expire_subscriptions();`);
  e = (await rpc("vendor_entitlements", s.h, { p_vendor: s.id })).body ?? {};
  let pc = (await rpc("my_product_cap", s.h)).body ?? {};
  const kept = sql(`select string_agg(status::text, ',' order by status::text) from public.products where vendor_id = '${s.id}' and status::text in ('live', 'under_review')`);
  check("after the grace days: Free; 2 listings stay (published ones first), 8 are paused, nothing deleted", e.plan_id === "free" && e.paid === false && pc.cap === 2 && pc.active === 2 && pc.paused === 8 && kept === "live,live", [e.plan_id, pc, kept]);
  const crm = await rpc("crm_add_lead", s.h, { p_title: "after lapse" });
  check("the CRM closes with the plan", !crm.ok, crm.body);
  const paused = sql(`select string_agg(id::text, ',') from (select id from public.products where vendor_id = '${s.id}' and status::text = 'paused' order by id limit 3) x`).split(",");
  const swap3 = await rpc("vendor_set_live_products", s.h, { p_ids: paused });
  const swap2 = await rpc("vendor_set_live_products", s.h, { p_ids: paused.slice(0, 2) });
  pc = (await rpc("my_product_cap", s.h)).body ?? {};
  check("the seller chooses which 2 stay live; 3 are refused", !swap3.ok && swap2.ok && pc.active === 2 && pc.paused === 8, [swap3.body, swap2.body, pc]);
  const back = await buy(s, "basic");
  pc = (await rpc("my_product_cap", s.h)).body ?? {};
  check("buying Basic again brings every paused listing back", back.verify?.body?.ok === true && pc.cap === 10 && pc.active === 10 && pc.paused === 0, [back.verify?.body, pc]);
} catch (err) {
  tally.fail++;
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
  summary("Journey");
  process.exitCode = tally.fail ? 1 : 0;
}
