// A paid-plan seller creating an ad through the API, on the LOCAL stack (2026-10-10).
//
// "The API" is what any signed-in browser can call with its own token, not only what the app's screens call:
//   * the table:      POST/PATCH  {API}/rest/v1/advertisements          (Supabase's REST API over the database)
//   * the functions:  POST        {API}/rest/v1/rpc/resume_ad_campaign, pause_ad_campaign_by_vendor, resubmit_ad_campaign
//   * the purchase:   POST        {functions}/razorpay-create-order → Razorpay checkout → razorpay-verify-payment
// For each paid plan a new seller buys the plan through the real one-off path, then tries the table and the
// functions directly (what server_owned_columns closed), then buys an ad the real way and has it reviewed.
// A Free seller is tried too. Payments go to the mock Razorpay through the side runtime (lib.mjs).
import { TAG, sql, check, attack, section, rest, rpc, fn, anon, seller, staff, buy, sign, cleanup, summary } from "./lib.mjs";

// The ad payment functions run on a side runtime with the mock Razorpay keys (scripts/local-stack/README.md).
const AD = process.env.AD_PAY_URL ?? "http://localhost:8096";
const cat = sql("select id from public.categories where parent_id is not null order by name limit 1");
const far = "2099-01-01T00:00:00Z";
const adRow = (id) => sql(`select status || '|' || coalesce(placement, '-') || '|' || coalesce(to_char(ends_at at time zone 'utc', 'YYYY'), '-')
                              || '|' || (ad_order_id is not null) || '|' || impressions || '|' || (created_at <= now())
                           from public.advertisements where id = '${id}'`);
const served = async (id) => {
  const r = await rpc("active_ads", anon, { max_count: 200 });
  return Array.isArray(r.body) && r.body.some((a) => a.ad_id === id);
};
const inQueue = (id) => sql(`select count(*) from public.advertisements where id = '${id}' and status = 'pending_review'`) === "1";

try {
  const mod = await staff("adreviewer", "ads_moderator");

  for (const plan of ["basic", "silver", "gold", "vip"]) {
    section(`${plan}: a seller who paid for the plan`);
    const s = await seller(`ad${plan}`);
    const bought = await buy(s, plan);
    check(`${plan}: the plan was bought through the real checkout`, bought.verify?.body?.ok === true || bought.verify?.body?.already === true,
      JSON.stringify(bought.verify?.body ?? bought.order?.body).slice(0, 160));
    const p = (await rest("POST", "products?select=id", s.h, { vendor_id: s.id, name: `FT ad ${plan} ${TAG}`, category_id: cat, status: "under_review", price_value: 10 })).body[0].id;
    sql(`update public.products set status = 'live' where id = '${p}';`);

    // 1. The table, straight: asks for review, a 2099 end, the banner, an order id and counters.
    const ins = await rest("POST", "advertisements?select=id,status", s.h, {
      vendor_id: s.id, product_id: p, title: `FT direct ${plan} ${TAG}`, status: "pending_review", placement: "websiteBanner,wholesalerPick",
      starts_at: new Date().toISOString(), ends_at: far, created_at: far, impressions: 9999, clicks: 999, ad_order_id: null,
    });
    const direct = ins.body?.[0]?.id;
    check(`${plan}: POST /rest/v1/advertisements is accepted as a draft (${ins.status})`, ins.status === 201 && ins.body?.[0]?.status === "draft", JSON.stringify(ins.body).slice(0, 160));
    if (direct) {
      const row = adRow(direct);
      attack(`${plan}: the direct ad is not in the review queue, not served, has no order, counters at zero, dated now`,
        !inQueue(direct) && !(await served(direct)) && row.split("|")[3] === "false" && row.split("|")[4] === "0" && row.split("|")[5] === "true", row);
      const tries = [];
      for (const status of ["pending_review", "active", "paused_by_vendor"]) {
        const r = await rest("PATCH", `advertisements?id=eq.${direct}`, s.h, { status }, "return=minimal");
        tries.push(`${status}:${r.status}`);
      }
      const res = await rpc("resume_ad_campaign", s.h, { p_ad_id: direct });
      const sub = await rpc("resubmit_ad_campaign", s.h, { p_ad_id: direct });
      attack(`${plan}: PATCH status and the resume / resubmit functions can't move the draft`,
        adRow(direct).startsWith("draft") && tries.every((t) => t.endsWith(":403")) && !res.ok && !sub.ok,
        `${tries.join(" ")}; resume ${res.status}; resubmit ${sub.status}; now ${adRow(direct)}`);
    }

    // 2. The real purchase: an order, the (mock) Razorpay payment, Razorpay's signature.
    const order = await fn("razorpay-create-order", s.h, { spec: { placementIds: ["openListing"], days: 3, items: [{ productId: p, title: `FT paid ${plan}`, imageUrl: null }], targetStates: [] } }, AD);
    check(`${plan}: razorpay-create-order makes a Razorpay order for the ad`, Boolean(order.body?.orderId) && order.body?.amount > 0, JSON.stringify(order.body).slice(0, 200));
    if (!order.body?.orderId) continue;
    const paymentId = `pay_ftad_${plan}_${TAG}`;
    const forged = await fn("razorpay-verify-payment", s.h, { orderId: order.body.orderId, paymentId, signature: "0".repeat(64) }, AD);
    attack(`${plan}: a made-up signature publishes nothing`, forged.body?.ok !== true || forged.body?.count === 0, JSON.stringify(forged.body).slice(0, 120));
    const paid = await fn("razorpay-verify-payment", s.h, { orderId: order.body.orderId, paymentId, signature: sign(order.body.orderId, paymentId) }, AD);
    const paidAd = sql(`select id from public.advertisements where ad_order_id = '${order.body.orderId}' limit 1`);
    check(`${plan}: after payment the campaign waits for review, tied to its order`, paid.body?.ok === true && Boolean(paidAd) && inQueue(paidAd),
      `${JSON.stringify(paid.body).slice(0, 120)} → ${paidAd ? adRow(paidAd) : "no campaign"}`);
    if (!paidAd) continue;
    attack(`${plan}: not served before review`, !(await served(paidAd)));

    // 3. Review, then what the owner may do with a running paid campaign.
    const ap = await rpc("approve_ad_campaign", mod.h, { p_ad_id: paidAd });
    check(`${plan}: an ads moderator approves it and it is served`, ap.ok && adRow(paidAd).startsWith("active") && (await served(paidAd)), `${ap.status} ${JSON.stringify(ap.body)} ${adRow(paidAd)}`);
    const ext = await rest("PATCH", `advertisements?id=eq.${paidAd}`, s.h, { ends_at: far, placement: "openListing,websiteBanner" }, "return=minimal");
    attack(`${plan}: the owner can't extend it or add slots (${ext.status})`, ext.status === 403 && !adRow(paidAd).includes("2099"), adRow(paidAd));
    const pz = await rpc("pause_ad_campaign_by_vendor", s.h, { p_ad_id: paidAd });
    const paused = adRow(paidAd).split("|")[0];
    const rs = await rpc("resume_ad_campaign", s.h, { p_ad_id: paidAd });
    check(`${plan}: the owner pauses and resumes it through the functions`, pz.ok && paused === "paused_by_vendor" && rs.ok && adRow(paidAd).startsWith("active"),
      `pause ${pz.status} → ${paused}; resume ${rs.status} → ${adRow(paidAd)}`);
    sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'archived' where vendor_id = '${s.id}';`);
  }

  section("free: a seller with no paid plan");
  const f = await seller("adfree");
  const fp = (await rest("POST", "products?select=id", f.h, { vendor_id: f.id, name: `FT ad free ${TAG}`, category_id: cat, status: "under_review", price_value: 10 })).body[0].id;
  sql(`update public.products set status = 'live' where id = '${fp}';`);
  const fi = await rest("POST", "advertisements?select=id", f.h, { vendor_id: f.id, product_id: fp, title: `FT free ${TAG}` });
  attack(`free: POST /rest/v1/advertisements is refused (${fi.status})`, fi.status >= 400, JSON.stringify(fi.body).slice(0, 140));
  const fo = await fn("razorpay-create-order", f.h, { spec: { placementIds: ["openListing"], days: 3, items: [{ productId: fp, title: "FT free", imageUrl: null }] } }, AD);
  attack("free: razorpay-create-order refuses to take payment for an ad", !fo.body?.orderId, JSON.stringify(fo.body).slice(0, 160));
} catch (err) {
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
  summary("Paid-plan seller ads through the API");
}
