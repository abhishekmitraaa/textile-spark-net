/**
 * Subscriptions P10 (2026-10-09): featured listings, the spotlight and seal tiers, locally.
 *   * A listed buyer opening a category sees the VIP's and the Gold seller's products first,
 *     tagged Featured, the VIP seal, and the Spotlight; a buyer not listed sees none of it.
 *   * The home page carries the Spotlight for the listed buyer.
 *   * A VIP seller reads their Visibility page from the menu; a seller with no plan is sent
 *     to the plans.
 * The choosing is checked by scripts/subscriptions/p10_visibility.sql and the end-to-end run in
 * test.md. afterEach removes what each test made.
 */
import { expect, test } from "@playwright/test";
import {
  BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, sql, watchErrors,
} from "./stack";

const FLAG = "featured_listings";
const made: { accounts: string[]; categories: string[] } = { accounts: [], categories: [] };

test.afterEach(() => {
  for (const id of made.accounts.splice(0)) {
    disallowFeature(FLAG, id);
    sql(`delete from public.featured_impressions where vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
  for (const c of made.categories.splice(0)) sql(`delete from public.categories where id = '${c}';`);
});

async function seller(prefix: string, plan: string | null, categoryId: string, product: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.accounts.push(who.id);
  sql(`update public.vendor_profiles set plan_id = ${plan ? `'${plan}'` : "null"}, plan_expires_at = ${plan ? "now() + interval '20 days'" : "null"},
         brand_name = '${prefix} Mills' where id = '${who.id}';
       insert into public.products (vendor_id, name, status, category_id, sold_count) values ('${who.id}', '${product}', 'live', '${categoryId}', 5);`);
  if (plan) {
    sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
         values ('${who.id}', '${plan}', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  }
  return who;
}

function category(name: string): string {
  const id = sql(`insert into public.categories (name) values ('${name}') returning id`).split("\n")[0];
  made.categories.push(id);
  return id;
}

test("a listed buyer sees featured places, the VIP seal and the spotlight; another buyer doesn't", async ({ browser }) => {
  test.setTimeout(150_000);
  const name = `P10 Spec Knits ${Date.now().toString(36)}`;
  const cat = category(name);
  await seller("p10-vip", "vip", cat, "P10 spec VIP polo");
  await seller("p10-gold", "gold", cat, "P10 spec Gold polo");
  await seller("p10-free", null, cat, "P10 spec Free polo");
  const buyer = await freshAccount("p10-buyer");
  made.accounts.push(buyer.id);
  allowFeature(FLAG, buyer.id);

  let ctx = await contextWithSession(browser, buyer.session, { width: 1280, height: 1000 });
  let page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/search/results?category=${encodeURIComponent(name)}`);
  const tags = page.getByTestId("featured-tag");
  await expect(tags).toHaveCount(2);
  const cards = page.locator("div.rounded-xl.border", { has: page.getByTestId("featured-tag") });
  await expect(cards.nth(0)).toContainText("P10 spec VIP polo");
  await expect(cards.nth(0).getByTestId("seal-tier")).toHaveText("VIP");
  await expect(cards.nth(1)).toContainText("P10 spec Gold polo");
  await expect(page.getByTestId("spotlight-rail")).toContainText("P10 spec VIP polo");
  await expect.poll(() => sql(`select count(*) from public.featured_impressions f join public.products p on p.id = f.product_id where p.category_id = '${cat}'`)).toBe("3");

  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(page.getByTestId("spotlight-rail")).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();

  const other = await freshAccount("p10-other");
  made.accounts.push(other.id);
  ctx = await contextWithSession(browser, other.session, { width: 1280, height: 1000 });
  page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/search/results?category=${encodeURIComponent(name)}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("featured-tag")).toHaveCount(0);
  await expect(page.getByTestId("spotlight-rail")).toHaveCount(0);
  await expect(page.getByTestId("seal-tier")).toHaveCount(0);
  await ctx.close();
});

test("a VIP seller reads Visibility from the menu; a seller with no plan is sent to the plans", async ({ browser }) => {
  test.setTimeout(120_000);
  const cat = category(`P10 Spec Vis ${Date.now().toString(36)}`);
  const vip = await seller("p10-vis-vip", "vip", cat, "P10 spec visible polo");
  allowFeature(FLAG, vip.id);
  let ctx = await contextWithSession(browser, vip.session, { width: 1280, height: 1000 });
  let page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/leads`);
  await page.getByRole("link", { name: "Visibility", exact: true }).click();
  await expect(page).toHaveURL(/\/visibility$/);
  await expect(page.getByTestId("visibility-place")).toContainText("Spotlight: place 1");
  await expect(page.getByTestId("visibility-spotlight")).toContainText("0");
  expect(errors).toEqual([]);
  await ctx.close();

  const free = await seller("p10-vis-free", null, cat, "P10 spec hidden polo");
  allowFeature(FLAG, free.id);
  ctx = await contextWithSession(browser, free.session, { width: 1280, height: 1000 });
  page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/visibility`);
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("Visibility comes with a paid plan")).toBeVisible();
  await ctx.close();
});
