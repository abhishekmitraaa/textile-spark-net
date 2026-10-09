/**
 * Subscriptions P7 (2026-10-09): overseas requirements, on the local stack.
 *   * A buyer picks their country on Business details; the name and its code are saved. Their
 *     requirement is then an overseas one: a VIP seller sees it on Overseas leads (from the
 *     sidebar) with the buyer's country and the head start's countdown, a Gold seller doesn't
 *     until the head start is over, and then quotes on it.
 *   * A Silver seller is told how many there were this month on Leads, and the page sends
 *     them to the plans with a line saying why.
 *   * Cosora-Admin names the switch and shows the marking on the requirement's detail.
 * Who reads what, the ranked feed, the quote guard, lead alerts and the count's contents are
 * checked by scripts/subscriptions/p7_overseas.sql and the end-to-end run in test.md.
 * afterEach removes what each test made.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, watchErrors,
} from "./stack";

const FLAG = "overseas_leads";
const sellers: string[] = [];
const buyers: string[] = [];

test.afterEach(() => {
  while (buyers.length) {
    const id = buyers.pop() as string;
    disallowFeature(FLAG, id);
    sql(`delete from public.quotes where rfq_id in (select id from public.rfqs where buyer_id = '${id}');
         delete from public.rfqs where buyer_id = '${id}';`);
  }
  while (sellers.length) {
    const id = sellers.pop() as string;
    disallowFeature(FLAG, id);
    sql(`delete from public.notifications where profile_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
});

const category = () => sql(`select id from public.categories where name = 'Activewear' limit 1`);

/** A seller on the switch who lists in Activewear, on `plan`. */
async function seller(prefix: string, plan: string) {
  const who = await freshAccount(prefix, { seller: true });
  sellers.push(who.id);
  allowFeature(FLAG, who.id);
  sql(`insert into public.products (vendor_id, name, status, category_id, price_value) values ('${who.id}', 'P7 Track Pants', 'live', '${category()}', 150);
       insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${who.id}', '${plan}', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  return who;
}

/** A buyer in Germany on the switch. */
async function overseasBuyer(prefix: string) {
  const buyer = await freshAccount(prefix);
  buyers.push(buyer.id);
  allowFeature(FLAG, buyer.id);
  sql(`insert into public.buyer_profiles (id, country, country_code) values ('${buyer.id}', 'Germany', 'DE')
       on conflict (id) do update set country = excluded.country, country_code = excluded.country_code;`);
  return buyer;
}

/** The buyer posts a requirement in Activewear; the database stamps it. Its id. */
const post = (buyerId: string, title: string) =>
  sql(`insert into public.rfqs (buyer_id, title, category_id, quantity) values ('${buyerId}', '${title}', '${category()}', 900) returning id`).split("\n")[0];

test("a buyer abroad picks a country; VIP sees their requirement first, then Gold quotes on it", async ({ browser }) => {
  test.setTimeout(180_000);
  // The buyer picks their country (the free text it replaces is kept until they do).
  const buyer = await freshAccount("p7-buyer");
  buyers.push(buyer.id);
  allowFeature(FLAG, buyer.id);
  const bctx = await contextWithSession(browser, buyer.session, { width: 1280, height: 1000 });
  const bpage = await bctx.newPage();
  const berrors = watchErrors(bpage);
  await bpage.goto(`${BUYER_URL}/profile/business-details`);
  const country = bpage.locator("#bd-country");
  await expect(country).toHaveValue("");
  await country.selectOption({ label: "Germany" });
  await bpage.getByRole("button", { name: /^Save/ }).click();
  await expect(bpage).toHaveURL(/\/profile$/);
  expect(sql(`select country || '/' || country_code from public.buyer_profiles where id = '${buyer.id}'`)).toBe("Germany/DE");
  await bpage.goto(`${BUYER_URL}/profile/business-details`);
  await expect(bpage.locator("#bd-country")).toHaveValue("DE");
  expect(berrors).toEqual([]);
  await bctx.close();

  // Their requirement: VIP has a head start (a VIP seller lists in the category).
  const vip = await seller("p7-vip", "vip");
  const gold = await seller("p7-gold", "gold");
  const rfq = post(buyer.id, "P7 spec 900 linen trousers");
  expect(sql(`select overseas || '/' || (overseas_vip_until > now() + interval '23 hours') from public.rfqs where id = '${rfq}'`)).toBe("true/true");

  const vctx = await contextWithSession(browser, vip.session, { width: 1280, height: 1000 });
  const vpage = await vctx.newPage();
  const verrors = watchErrors(vpage);
  await vpage.goto(`${BUYER_URL}/leads`);
  await vpage.getByRole("link", { name: "Overseas leads", exact: true }).click();
  await expect(vpage).toHaveURL(/\/overseas-leads$/);
  await expect(vpage.getByRole("heading", { name: "Overseas requirements", level: 1 })).toBeVisible();
  const card = vpage.locator("div.rounded-xl", { hasText: "P7 spec 900 linen trousers" });
  await expect(card.getByTestId("overseas-badge")).toHaveText("Overseas · Germany");
  await expect(card.getByTestId("vip-head-start")).toHaveText(/VIP first look: opens to Gold in 23 h \d+ min/);
  expect(verrors).toEqual([]);
  await vctx.close();

  // Gold: not yet, and told how many are with VIP first.
  const gctx = await contextWithSession(browser, gold.session, { width: 1280, height: 1000 });
  const gpage = await gctx.newPage();
  const gerrors = watchErrors(gpage);
  await gpage.goto(`${BUYER_URL}/overseas-leads`);
  await expect(gpage.getByRole("heading", { name: "Overseas requirements", level: 1 })).toBeVisible();
  await expect(gpage.getByTestId("overseas-with-vip")).toHaveText(/^\d+ with VIP sellers first$/);
  await expect(gpage.getByText("P7 spec 900 linen trousers")).toHaveCount(0);

  // The head start ends: Gold sees it (no countdown) and quotes.
  sql(`update public.rfqs set overseas_vip_until = now() - interval '1 minute' where id = '${rfq}'`);
  await gpage.reload();
  const gcard = gpage.locator("div.rounded-xl", { hasText: "P7 spec 900 linen trousers" });
  await expect(gcard.getByTestId("overseas-badge")).toHaveText("Overseas · Germany");
  await expect(gcard.getByTestId("vip-head-start")).toHaveCount(0);
  await gcard.getByRole("button", { name: "Submit Quote" }).click();
  await gcard.getByPlaceholder("Price / unit (₹)").fill("240");
  await gcard.getByRole("button", { name: "Send Quote" }).click();
  await expect(gcard.getByText("Quote submitted")).toBeVisible();
  expect(sql(`select count(*) from public.quotes where rfq_id = '${rfq}' and vendor_id = '${gold.id}'`)).toBe("1");
  expect(gerrors).toEqual([]);
  await gctx.close();
});

test("a Silver seller is told how many, and the page sends them to the plans", async ({ browser }) => {
  test.setTimeout(120_000);
  const silver = await seller("p7-silver", "silver");
  const buyer = await overseasBuyer("p7-buyer-s");
  post(buyer.id, "P7 spec hidden from silver");

  const ctx = await contextWithSession(browser, silver.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/leads`);
  const teaser = page.getByTestId("overseas-teaser");
  await expect(teaser).toContainText(/\d+ requirements? from (a buyer|buyers) outside India this month/);
  await expect(teaser).toContainText("Overseas requirements are part of the Gold and VIP plans.");
  await expect(page.getByText("P7 spec hidden from silver")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Overseas leads", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("overseas-leads-link")).toHaveCount(0);

  await page.goto(`${BUYER_URL}/overseas-leads`);
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("Overseas requirements come with Gold and VIP")).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Cosora-Admin names the switch and shows the marking on the requirement", async ({ browser }) => {
  test.setTimeout(120_000);
  await seller("p7-admin-vip", "vip");
  const buyer = await overseasBuyer("p7-buyer-a");
  post(buyer.id, "P7 spec seen by staff");

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/feature-flags`);
  await expect(page.getByTestId(`flag-${FLAG}`)).toContainText("Overseas requirements");

  await page.goto(`${ADMIN_URL}/leads`);
  await page.getByLabel("Search").fill("P7 spec seen by staff");
  await page.getByRole("row", { name: /P7 spec seen by staff/ }).getByRole("button", { name: "View" }).click();
  await expect(page.getByText("overseas · Germany")).toBeVisible();
  await expect(page.getByTestId("lead-vip-until")).toContainText("VIP vendors only until");
  expect(errors).toEqual([]);
  await ctx.close();
});
