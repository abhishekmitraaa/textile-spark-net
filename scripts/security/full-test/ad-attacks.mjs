// Can a seller get advertising they did not pay for, or that nobody reviewed? LOCAL STACK ONLY.
// Every attack is made the way a browser could make it: the seller's own token against the public API.
import { TAG, sql, section, attack, note, rest, rpc, seller, buyer, staff, buy, anon, cleanup, summary } from "./lib.mjs";

const cat = sql("select id from public.categories where parent_id is not null order by name limit 1");
const adRow = (id) => sql(`select status || '|' || coalesce(placement, '-') || '|' || coalesce(to_char(ends_at at time zone 'utc', 'YYYY'), '-') || '|' || (ad_order_id is not null) from public.advertisements where id = '${id}'`);
const served = async (id, headers = anon, placements = null) => {
  const r = await rpc("active_ads", headers, { max_count: 200, ...(placements ? { filter_placements: placements } : {}) });
  return Array.isArray(r.body) && r.body.some((a) => a.ad_id === id);
};
const product = async (v, name) => {
  const id = (await rest("POST", "products?select=id", v.h, { vendor_id: v.id, name, category_id: cat, status: "under_review", price_value: 10 })).body[0].id;
  sql(`update public.products set status = 'live' where id = '${id}';`);
  return id;
};
const far = "2099-01-01T00:00:00Z";

try {
  const s = await seller("adgap");
  await buy(s, "basic");
  const p1 = await product(s, `FT adgap one ${TAG}`);
  const p2 = await product(s, `FT adgap two ${TAG}`);
  const mod = await staff("adgapmod", "ads_moderator");
  const reason = sql("select code from admin.ad_reason_codes where active order by code limit 1");

  section("A. An ad nobody paid for and nobody reviewed");
  const a = await rest("POST", "advertisements?select=id,status", s.h,
    { vendor_id: s.id, title: `FT free ad ${TAG}`, product_id: p1, status: "draft", placement: "featuredProduct,wholesalerPick,websiteBanner", starts_at: new Date().toISOString(), ends_at: far });
  const freeAd = a.body?.[0]?.id;
  note("A0 seller creates a draft ad straight through the API, no payment", `${a.status} ${JSON.stringify(a.body?.[0] ?? a.body)}`);
  if (freeAd) {
    const st = await rest("PATCH", `advertisements?id=eq.${freeAd}`, s.h, { status: "paused_by_vendor" }, "return=minimal");
    const res = await rpc("resume_ad_campaign", s.h, { p_ad_id: freeAd });
    const now = adRow(freeAd);
    const live = await served(freeAd);
    attack("A1 draft → 'paused' by a direct write → Resume: the unpaid, unreviewed ad is live", !now.startsWith("active"), `patch ${st.status}, resume ${res.status} ${JSON.stringify(res.body)}, row ${now}, shown to visitors: ${live}`);
    attack("A2 that ad is shown in the website banner slot it never bought", !(await served(freeAd, anon, ["websiteBanner"])), `row ${now}`);
  }
  const direct = await rest("POST", "advertisements?select=id,status", s.h,
    { vendor_id: s.id, title: `FT unpaid review ${TAG}`, product_id: p1, status: "pending_review", placement: "trustedSeal", starts_at: new Date().toISOString(), ends_at: far });
  const unpaid = direct.body?.[0]?.id;
  attack("A3 an unpaid ad can be put in the admin review queue (it looks like a paid one)", !(unpaid && adRow(unpaid).startsWith("pending_review")), `${direct.status} row ${unpaid ? adRow(unpaid) : "-"}`);
  if (unpaid) {
    const ap = await rpc("approve_ad_campaign", mod.h, { p_ad_id: unpaid });
    const badge = sql(`select coalesce(to_char(ad_verified_until at time zone 'utc', 'YYYY'), 'none') from public.vendor_profiles where id = '${s.id}'`);
    attack("A4 a reviewer who approves it grants the verified badge until 2099, never paid for", badge === "none", `approve ${ap.status} ${JSON.stringify(ap.body)}, badge until ${badge}`);
    sql(`update public.vendor_profiles set ad_verified_until = null where id = '${s.id}'; delete from public.vendor_ad_verifications where vendor_id = '${s.id}';`);
  }

  section("B. A paid, running ad: can the seller give themselves more than they bought?");
  const b0 = await rest("POST", "advertisements?select=id", s.h, { vendor_id: s.id, title: `FT paid ad ${TAG}`, product_id: p1, status: "draft" });
  const paid = b0.body[0].id;
  sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'active', placement = 'openListing', starts_at = now(), ends_at = now() + interval '1 day' where id = '${paid}';`);
  const before = adRow(paid);
  for (const [name, patch, sqlCheck] of [
    ["B1 extend the end date from 1 day to 2099", { ends_at: far }, `select to_char(ends_at at time zone 'utc', 'YYYY') = '2099' from public.advertisements where id = '${paid}'`],
    ["B2 add slots that were never bought (banner, wholesaler pick)", { placement: "openListing,websiteBanner,mobileBanner,wholesalerPick" }, `select placement like '%websiteBanner%' from public.advertisements where id = '${paid}'`],
    ["B3 restart the 'new' boost by resetting the start time", { starts_at: new Date(Date.now() - 1000).toISOString() }, `select starts_at > created_at + interval '1 second' from public.advertisements where id = '${paid}'`],
    ["B4 jump to the top of every ad slot by dating the ad in the future", { created_at: far }, `select to_char(created_at at time zone 'utc', 'YYYY') = '2099' from public.advertisements where id = '${paid}'`],
    ["B5 change the reviewed wording and picture after approval", { title: "UNREVIEWED wording", image_url: "https://example.com/unreviewed.jpg" }, `select title = 'UNREVIEWED wording' from public.advertisements where id = '${paid}'`],
    ["B6 point the approved ad at a different product", { product_id: p2 }, `select product_id = '${p2}' from public.advertisements where id = '${paid}'`],
  ]) {
    const r = await rest("PATCH", `advertisements?id=eq.${paid}`, s.h, patch, "return=minimal");
    attack(name, sql(sqlCheck) !== "t", `${r.status}${r.body?.message ? " " + r.body.message : ""}`);
  }
  note("B  the paid ad before and after", `${before}  →  ${adRow(paid)}`);
  attack("B7 the 1-day listing ad is now served in the banner slot", !(await served(paid, anon, ["websiteBanner"])));

  section("C. An ad the admin team paused, rejected or suspended");
  const mk = async (label) => {
    const id = (await rest("POST", "advertisements?select=id", s.h, { vendor_id: s.id, title: `FT ${label} ${TAG}`, product_id: p1, status: "draft" })).body[0].id;
    sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'active', placement = 'openListing', starts_at = now(), ends_at = now() + interval '7 days' where id = '${id}';`);
    return id;
  };
  const back = async (id) => {
    const p = await rest("PATCH", `advertisements?id=eq.${id}`, s.h, { status: "paused_by_vendor" }, "return=minimal");
    const r = await rpc("resume_ad_campaign", s.h, { p_ad_id: id });
    return `patch ${p.status}, resume ${r.status} ${JSON.stringify(r.body).slice(0, 120)}, row ${adRow(id)}`;
  };
  const c1 = await mk("admin paused");
  const pz = await rpc("pause_ad_campaign_by_admin", mod.h, { p_ad_id: c1, p_reason_code: reason, p_note: "policy" });
  const c1ev = await back(c1);
  attack("C1 seller un-pauses an ad that Cosora paused", !adRow(c1).startsWith("active"), `admin pause ${pz.status}; ${c1ev}`);
  const c2 = await mk("suspended");
  const sz = await rpc("suspend_ad_campaign", mod.h, { p_ad_id: c2, p_reason_code: reason, p_note: "policy" });
  const c2ev = await back(c2);
  attack("C2 seller restarts an ad that Cosora suspended", !adRow(c2).startsWith("active"), `suspend ${sz.status}; ${c2ev}`);
  const c3 = (await rest("POST", "advertisements?select=id", s.h, { vendor_id: s.id, title: `FT rejected ${TAG}`, product_id: p1, status: "pending_review", placement: "openListing", starts_at: new Date().toISOString(), ends_at: far })).body[0].id;
  sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'pending_review' where id = '${c3}';`);
  const rz = await rpc("reject_ad_campaign", mod.h, { p_ad_id: c3, p_reason_code: reason, p_note: "no" });
  const c3ev = await back(c3);
  attack("C3 seller publishes an ad that Cosora rejected", !adRow(c3).startsWith("active"), `reject ${rz.status}; ${c3ev}`);
  const c4 = await mk("expired");
  sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'expired', ends_at = now() - interval '1 day' where id = '${c4}';`);
  const e1 = await rest("PATCH", `advertisements?id=eq.${c4}`, s.h, { ends_at: far, status: "paused_by_vendor" }, "return=minimal");
  const e2 = await rpc("resume_ad_campaign", s.h, { p_ad_id: c4 });
  attack("C4 seller revives an ad whose paid time ran out", !adRow(c4).startsWith("active"), `patch ${e1.status}, resume ${e2.status} ${JSON.stringify(e2.body).slice(0, 100)}, row ${adRow(c4)}`);

  section("D. The same on the Free plan (no advertising at all)");
  const f = await seller("adgapfree");
  const fp = await product(f, `FT adgap free ${TAG}`);
  const fa = await rest("POST", "advertisements?select=id,status", f.h, { vendor_id: f.id, title: `FT free plan ad ${TAG}`, product_id: fp, status: "draft", placement: "websiteBanner", starts_at: new Date().toISOString(), ends_at: far });
  const fid = fa.body?.[0]?.id;
  if (fid) {
    await rest("PATCH", `advertisements?id=eq.${fid}`, f.h, { status: "paused_by_vendor" }, "return=minimal");
    const fr = await rpc("resume_ad_campaign", f.h, { p_ad_id: fid });
    attack("D1 a Free seller runs a banner ad without paying anything", !adRow(fid).startsWith("active"), `resume ${fr.status} ${JSON.stringify(fr.body).slice(0, 100)}, row ${adRow(fid)}, shown: ${await served(fid, anon, ["websiteBanner"])}`);
  } else attack("D1 a Free seller runs a banner ad without paying anything", true, `insert refused: ${fa.status} ${JSON.stringify(fa.body).slice(0, 160)}`);

  // Leave nothing running.
  sql(`set cosora.ad_review = 'on'; update public.advertisements set status = 'archived' where vendor_id in ('${s.id}', '${f.id}');`);
} catch (err) {
  console.log("CRASH " + (err?.stack ?? err));
} finally {
  cleanup();
  summary("Advertising gaps");
}
