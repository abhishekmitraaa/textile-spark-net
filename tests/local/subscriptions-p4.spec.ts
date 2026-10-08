/**
 * Subscriptions P4 (2026-10-08): reminders, the grace days and paused listings, on the local
 * stack. The daily job is run by hand here (select public.expire_subscriptions()), as the
 * scheduled job would at 08:59 IST.
 *   * A seller whose plan ended is told on /subscription while the grace days run. After
 *     them the plan lapses to Free: listings over its limit are paused, and the seller
 *     swaps which are live from /products.
 *   * A seller whose plan is about to end without autopay picks the listings to keep
 *     beforehand; the lapse then keeps those, not the most viewed.
 *   * Cosora-Admin names the switch and shows paused listings without an Approve button.
 * Every seller is a fresh account the subscription_lifecycle switch lists; afterEach takes
 * them off it and removes their listings and plan.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, watchErrors,
} from "./stack";

const FLAG = "subscription_lifecycle";
const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    disallowFeature(FLAG, id);
    sql(`delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';
         delete from admin.subscription_reminder_log where vendor_id = '${id}';`);
  }
});

/** A listed seller on Gold with four published listings, A the most viewed. */
async function sellerOnGold(prefix: string, periodEnd: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  allowFeature(FLAG, who.id);
  sql(`insert into public.products (vendor_id, name, status, views_count, price_value, created_at) values
         ('${who.id}', 'P4 Listing A', 'live', 40, 100, now() - interval '4 minutes'),
         ('${who.id}', 'P4 Listing B', 'live', 30, 100, now() - interval '3 minutes'),
         ('${who.id}', 'P4 Listing C', 'live', 20, 100, now() - interval '2 minutes'),
         ('${who.id}', 'P4 Listing D', 'live', 10, 100, now() - interval '1 minute');
       insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${who.id}', 'gold', 'monthly', 'active', (${periodEnd}) - interval '1 month', ${periodEnd});`);
  const idOf = (name: string) => sql(`select id from public.products where vendor_id = '${who.id}' and name = '${name}'`);
  const states = () => sql(`select string_agg(right(name, 1) || '=' || status::text, ' ' order by name) from public.products where vendor_id = '${who.id}'`);
  return { who, idOf, states };
}

test("grace days on Subscription, then the lapse pauses listings and the seller swaps which are live", async ({ browser }) => {
  test.setTimeout(150_000);
  const { who, idOf, states } = await sellerOnGold("p4-grace", "now() - interval '2 days'");
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // In the grace days: still Gold, with the day to renew by.
  await page.goto(`${BUYER_URL}/subscription`);
  const ending = page.getByTestId("plan-ending");
  await expect(ending).toHaveAttribute("data-state", "grace");
  await expect(ending).toContainText("Your Gold plan ended on");
  await expect(ending).toContainText("Nothing has changed yet.");
  await expect(page.getByTestId("plan-status")).toHaveText("Grace period");
  await expect(ending.getByRole("button", { name: "Renew Gold" })).toBeVisible();
  expect(states()).toBe("A=live B=live C=live D=live");

  // The grace days pass and the daily job runs: Free allows 2, the two most viewed stay.
  sql(`update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = '${who.id}';
       select public.expire_subscriptions();`);
  expect(sql(`select status from public.vendor_subscriptions where vendor_id = '${who.id}'`)).toBe("expired");
  expect(states()).toBe("A=live B=live C=paused D=paused");
  expect(sql(`select string_agg(kind, ',' order by kind) from public.notifications where profile_id = '${who.id}'`)).toBe("listings_paused,plan_lapsed");

  await page.goto(`${BUYER_URL}/products`);
  const banner = page.getByTestId("listings-cap-banner");
  await expect(banner).toHaveAttribute("data-state", "paused");
  await expect(banner).toContainText("2 listings are paused");
  await expect(banner).toContainText("Your Free plan allows 2 listings.");

  // Swap: C in, A out.
  await banner.getByRole("button", { name: "Choose which are live" }).click();
  const dialog = page.getByTestId("live-listings-dialog");
  await expect(dialog.getByTestId("live-pick-count")).toHaveText("2 of 2 chosen");
  await expect(dialog.getByTestId(`live-pick-${idOf("P4 Listing C")}`)).toBeDisabled();   // full: nothing more can be ticked
  await dialog.getByTestId(`live-pick-${idOf("P4 Listing A")}`).click();
  await dialog.getByTestId(`live-pick-${idOf("P4 Listing C")}`).click();
  await expect(dialog.getByTestId("live-pick-count")).toHaveText("2 of 2 chosen");
  await dialog.getByTestId("live-pick-save").click();
  await expect(page.getByText("Your live listings are updated")).toBeVisible();
  expect(states()).toBe("A=paused B=live C=live D=paused");
  await expect(banner).toContainText("2 listings are paused");

  // The paused filter the notice links to.
  await page.goto(`${BUYER_URL}/products?status=paused`);
  await expect(page.locator("p:visible", { hasText: "P4 Listing A" })).toHaveCount(1);   // the mobile card's copy is hidden at this width
  await expect(page.getByText("P4 Listing B")).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("before the plan ends the seller picks the listings to keep, and the lapse keeps those", async ({ browser }) => {
  test.setTimeout(150_000);
  const { who, idOf, states } = await sellerOnGold("p4-keep", "now() + interval '3 days' - interval '1 minute'");
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  await page.goto(`${BUYER_URL}/subscription`);
  const ending = page.getByTestId("plan-ending");
  await expect(ending).toHaveAttribute("data-state", "ending");
  await expect(ending).toContainText("Your Gold plan ends in 3 days");
  await expect(ending).toContainText("After that you have 7 more days");

  await page.goto(`${BUYER_URL}/products`);
  const banner = page.getByTestId("listings-cap-banner");
  await expect(banner).toHaveAttribute("data-state", "next");
  await expect(banner).toContainText("Your plan is about to end");
  await expect(banner).toContainText("which allows 2 listings. You have 4.");

  // Starts from what the database would keep (A and B); the seller keeps B and D instead.
  await banner.getByRole("button", { name: "Choose listings" }).click();
  const dialog = page.getByTestId("live-listings-dialog");
  await expect(dialog.getByTestId("live-pick-count")).toHaveText("2 of 2 chosen");
  await expect(dialog.getByTestId(`live-pick-${idOf("P4 Listing A")}`)).toBeChecked();
  await dialog.getByTestId(`live-pick-${idOf("P4 Listing A")}`).click();
  await dialog.getByTestId(`live-pick-${idOf("P4 Listing D")}`).click();
  await dialog.getByTestId("live-pick-save").click();
  await expect(page.getByText("Your choice is saved")).toBeVisible();
  expect(sql(`select keep_product_ids::text from public.vendor_subscriptions where vendor_id = '${who.id}'`))
    .toBe(`{${idOf("P4 Listing B")},${idOf("P4 Listing D")}}`);
  expect(states()).toBe("A=live B=live C=live D=live");   // nothing changes until the plan does

  // A reminder goes out once (3 days left: the 4-day one), then the plan and its grace days pass.
  sql(`select public.expire_subscriptions(); select public.expire_subscriptions();`);
  expect(sql(`select count(*) || ':' || max(title) from public.notifications where profile_id = '${who.id}' and kind = 'plan_expiring'`))
    .toBe("1:Your Gold plan ends in 3 days");
  sql(`update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = '${who.id}';
       select public.expire_subscriptions();`);
  expect(states()).toBe("A=paused B=live C=paused D=live");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Cosora-Admin names the lifecycle switch and shows paused listings without Approve", async ({ browser }) => {
  test.setTimeout(120_000);
  const { who } = await sellerOnGold("p4-admin", "now() - interval '8 days'");
  sql(`select public.expire_subscriptions();`);

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/feature-flags`);
  await expect(page.getByTestId(`flag-${FLAG}`)).toContainText("Reminders, grace days and paused listings");

  await page.goto(`${ADMIN_URL}/products`);
  await page.getByRole("button", { name: "Paused (plan limit)" }).click();
  const card = page.locator("div.transition-shadow").filter({ has: page.getByRole("heading", { name: "P4 Listing D" }) }).first();
  await expect(card).toContainText("Paused by the vendor's plan limit.");
  await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);
  expect(sql(`select count(*) from public.products where vendor_id = '${who.id}' and status::text = 'paused'`)).toBe("2");
  expect(errors).toEqual([]);
  await ctx.close();
});
