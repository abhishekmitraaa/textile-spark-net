/**
 * Profile score ranks sellers for buyers, and the CSV import is off (2026-10-22, migration 20261022100000).
 * Mitra: "profile score should be used to rank the vendor for suggesting to the buyer side and related things like
 * rfq discovery and brand/vendor discovery, stop the CSV import"; "not above paid plan".
 *   1 The database computes vendor_profiles.profile_score with the dashboard's formula; a seller can't set it.
 *   2 Recommended Premium Brands (top_vendors): paid plan first, then profile score, then rating.
 *   3 Brand suggestions (new_brand_suggestions): paid plan first, then profile score, then how recent.
 *   4 Search suggestions: sellers by paid plan, then profile score, then followers.
 *   5 Lead alerts for a buyer's requirement: within an equally good match, the higher profile score is told first.
 *   6 The CSV import is switched off: no page, no link, the database refuses it, the plans don't offer it.
 */
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUYER_URL, allowFeature, clientAs, contextWithSession, disallowFeature, freshAccount, sql, stack } from "./stack";

const tag = Date.now().toString(36);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const id = (out: string) => out.match(UUID)![0];
const cleanup: string[] = [];

test.afterAll(() => {
  for (const v of cleanup) {
    sql(`delete from public.follows where vendor_id = '${v}';
         delete from public.vendor_subscriptions where vendor_id = '${v}';
         delete from public.products where vendor_id = '${v}';`);
    disallowFeature("lead_alerts", v);
  }
});

function clientFor(session: { access_token: string }): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Columns the guards keep from everyone, the database owner included: set with triggers off. */
function forceColumns(vendor: string, set: string) {
  sql(`begin; set local session_replication_role = replica;
       update public.vendor_profiles set ${set} where id = '${vendor}'; commit;`);
}

/** Every profile field the score counts (67 points), set as the seller would. */
function completeProfile(vendor: string) {
  sql(`update public.vendor_profiles set
         about = 'We knit cotton jersey and fleece in Tiruppur since 1998.', website = 'https://example.com',
         category = '{Activewear}', office_photos = '{a.jpg,b.jpg,c.jpg,d.jpg,e.jpg}', year_established = 1998,
         employee_count = '51-100', annual_turnover = '5-10 Cr', capacity = '{50000 pcs/month}',
         social = '{"instagram": ["https://instagram.com/x"]}'::jsonb, phone = '+919800000000', owner_email = 'hi@example.com'
       where id = '${vendor}'`);
}

function liveProduct(vendor: string, name: string, opts: { created?: string; category?: string } = {}): string {
  const pid = id(sql(`insert into public.products (vendor_id, name, status, price_value, moq, category_id, created_at)
                      values ('${vendor}', '${name}', 'live', 300, '10', ${opts.category ? `'${opts.category}'` : "null"},
                              ${opts.created ?? "now()"}) returning id`));
  sql(`insert into public.product_images (product_id, url, position) values ('${pid}', '${BUYER_URL}/icon-192.png', 0)`);
  return pid;
}

const score = (vendor: string) => Number(sql(`select profile_score from public.vendor_profiles where id = '${vendor}'`));

test("1 the database computes the profile score, and a seller can't set it", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`ps1${tag}`, { seller: true });
  cleanup.push(seller.id);
  const buyer = await freshAccount(`ps1b${tag}`);
  expect(score(seller.id)).toBe(0);

  completeProfile(seller.id);                                       // 67
  liveProduct(seller.id, `PS1 ${tag} live`);                       // + 7 live listing
  for (let i = 0; i < 9; i++) {
    sql(`insert into public.products (vendor_id, name, status) values ('${seller.id}', 'PS1 ${tag} draft ${i}', 'draft')`);
  }                                                                 // + 10 for ten listings
  const db = clientFor(seller.session);
  for (let i = 0; i < 2; i++) {
    const rfq = id(sql(`insert into public.rfqs (buyer_id, title, quantity, status, expires_at)
                        values ('${buyer.id}', 'PS1 ${tag} rfq ${i}', 10, 'active', now() + interval '7 days') returning id`));
    expect((await db.from("quotes").insert({ rfq_id: rfq, vendor_id: seller.id, price_per_unit: 100 })).error).toBeNull();
  }                                                                 // + 7 for two quotes; no reviews (9)
  await expect.poll(() => score(seller.id)).toBe(91);

  // The seller's own write is replaced by the computed value.
  await db.from("vendor_profiles").update({ profile_score: 100 }).eq("id", seller.id);
  expect(score(seller.id)).toBe(91);
  // A listing going away is counted too.
  sql(`delete from public.products where vendor_id = '${seller.id}' and name = 'PS1 ${tag} draft 0'`);
  await expect.poll(() => score(seller.id)).toBe(81);

  // The dashboard's own count agrees with the database.
  const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/analytics`);
  await expect(page.getByText("You are at").first()).toContainText("81/100", { timeout: 30_000 });
  await ctx.close();
});

test("2 Recommended Premium Brands: paid plan first, then profile score, then rating", async () => {
  const full = await freshAccount(`ps2a${tag}`, { seller: true });
  const rated = await freshAccount(`ps2b${tag}`, { seller: true });
  const paid = await freshAccount(`ps2c${tag}`, { seller: true });
  cleanup.push(full.id, rated.id, paid.id);
  completeProfile(full.id);
  for (const v of [full, rated, paid]) liveProduct(v.id, `PS2 ${tag} ${v.id.slice(0, 4)}`);
  forceColumns(rated.id, `rating_avg = 5, reviews_count = 40`);
  forceColumns(paid.id, `plan_expires_at = now() + interval '30 days'`);
  expect(score(full.id)).toBeGreaterThan(score(rated.id));

  const buyer = await clientAs("buyer");
  const { data, error } = await buyer.rpc("top_vendors", { p_limit: 12 });
  expect(error).toBeNull();
  const order = (data as { id: string }[]).map((r) => r.id);
  const at = (v: string) => order.indexOf(v);
  expect(at(paid.id)).toBeGreaterThanOrEqual(0);
  expect(at(paid.id)).toBeLessThan(at(full.id));
  expect(at(full.id)).toBeLessThan(at(rated.id));
});

test("3 brand suggestions: paid plan first, then profile score, then how recent", async () => {
  const full = await freshAccount(`ps3a${tag}`, { seller: true });
  const fresh = await freshAccount(`ps3b${tag}`, { seller: true });
  cleanup.push(full.id, fresh.id);
  completeProfile(full.id);
  liveProduct(full.id, `PS3 ${tag} older`, { created: "now() - interval '2 days'" });
  liveProduct(fresh.id, `PS3 ${tag} newer`);
  const buyer = await freshAccount(`ps3c${tag}`);
  const { data, error } = await clientFor(buyer.session).rpc("new_brand_suggestions", { p_limit: 24 });
  expect(error).toBeNull();
  const order = (data as { vendor_id: string }[]).map((r) => r.vendor_id);
  expect(order).toContain(full.id);
  expect(order.indexOf(fresh.id) === -1 || order.indexOf(full.id) < order.indexOf(fresh.id)).toBe(true);
});

test("4 search suggestions: sellers by paid plan, then profile score, then followers", async () => {
  const full = await freshAccount(`psr${tag}a`, { seller: true });
  const popular = await freshAccount(`psr${tag}b`, { seller: true });
  cleanup.push(full.id, popular.id);
  completeProfile(full.id);
  for (let i = 0; i < 2; i++) {
    const f = await freshAccount(`ps4f${i}${tag}`);
    sql(`insert into public.follows (follower_id, vendor_id) values ('${f.id}', '${popular.id}')`);
  }
  const buyer = await clientAs("buyer");
  const { data, error } = await buyer.rpc("search_suggestions", { q: `psr${tag}`, max_results: 10 });
  expect(error).toBeNull();
  const vendors = (data as { kind: string; ref_id: string }[]).filter((r) => r.kind === "vendor").map((r) => r.ref_id);
  expect(vendors.indexOf(full.id)).toBeGreaterThanOrEqual(0);
  expect(vendors.indexOf(full.id)).toBeLessThan(vendors.indexOf(popular.id));
});

test("5 lead alerts: between equally good matches, the higher profile score is told first", async () => {
  const category = sql(`select id from public.categories where name = 'Activewear' limit 1`);
  const one = await freshAccount(`ps5a${tag}`, { seller: true });
  const two = await freshAccount(`ps5b${tag}`, { seller: true });
  cleanup.push(one.id, two.id);
  // The complete profile goes to the seller whose id sorts last, so an order by id alone can't pass.
  const [low, high] = one.id < two.id ? [one, two] : [two, one];
  completeProfile(high.id);
  for (const v of [low, high]) {
    allowFeature("lead_alerts", v.id);
    liveProduct(v.id, `PS5 ${tag} ${v.id.slice(0, 4)}`, { category });
    sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
         values ('${v.id}', 'gold', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days')`);
  }
  const max = sql(`select max_vendors from admin.lead_alert_config`);
  sql(`update admin.lead_alert_config set max_vendors = 1`);
  try {
    const buyer = await freshAccount(`ps5c${tag}`);
    sql(`insert into public.buyer_profiles (id) values ('${buyer.id}') on conflict (id) do nothing`);
    const rfq = id(sql(`insert into public.rfqs (buyer_id, title, category_id, quantity) values ('${buyer.id}', 'PS5 ${tag} hoodies', '${category}', 400) returning id`));
    const told = sql(`select string_agg(vendor_id::text, ',') from admin.lead_alerts where rfq_id = '${rfq}'`);
    expect(told).toBe(high.id);
  } finally {
    sql(`update admin.lead_alert_config set max_vendors = ${max}`);
  }
});

test("6 the CSV import is switched off", async ({ browser }) => {
  const seller = await freshAccount(`ps6${tag}`, { seller: true });
  cleanup.push(seller.id);
  allowFeature("bulk_import", seller.id);
  sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${seller.id}', 'gold', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days')`);
  try {
    const db = clientFor(seller.session);
    const r = await db.rpc("import_products", { p_rows: [{ name: "x" }], p_file_name: "x.csv", p_as_draft: true });
    expect(r.error, "import_products").not.toBeNull();

    const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 900 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/products`);
    await expect(page.getByRole("heading", { name: "Products" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("bulk-import-link")).toHaveCount(0);
    await page.goto(`${BUYER_URL}/catalogue/bulk-import`);
    await expect(page.getByTestId("bulk-file")).toHaveCount(0);
    await ctx.close();
    expect(sql(`select count(*) from public.subscription_plans where display ->> 'catalog' ilike '%bulk import%'`)).toBe("0");
  } finally {
    disallowFeature("bulk_import", seller.id);
  }
});
