/**
 * Subscriptions P5 (2026-10-09): ad reach by state, on the local stack.
 *   * A seller the ad_state_targeting switch lists, on a plan that reaches one state, sees
 *     the state picker in place of the older city chips, starting on their own state. A
 *     second state is refused; the ad they pay for (the demo checkout, no gateway locally)
 *     is published for review with the state they chose.
 *   * A seller the switch doesn't list keeps the city chips.
 *   * Cosora-Admin names the switch, and the review queue shows the states an ad reaches.
 * The ad payment functions run on a second edge runtime with no Razorpay keys
 * (LOCAL_AD_FUNCTIONS_URL; scripts/local-stack/README.md). Who then sees a running ad is
 * checked by scripts/subscriptions/p5_ad_reach.sql and the end-to-end run in test.md.
 * afterEach removes what each seller made and takes them off the switch.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, stack, watchErrors,
} from "./stack";

const FLAG = "ad_state_targeting";
const SIDE = process.env.LOCAL_AD_FUNCTIONS_URL;
const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    disallowFeature(FLAG, id);
    // A paid ad can't be deleted by a plain statement (its triggers guard it): local cleanup only.
    sql(`set session_replication_role = replica;
         delete from public.advertisements where vendor_id = '${id}';
         delete from public.ad_orders where vendor_id = '${id}';
         set session_replication_role = origin;
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
});

/** The ad order functions go to the runtime that serves them (no gateway keys: the demo checkout). */
async function withAdBackend(ctx: BrowserContext): Promise<void> {
  for (const name of ["razorpay-create-order", "razorpay-verify-payment"]) {
    await ctx.route(`${stack().API}/functions/v1/${name}`, async (route) => {
      const response = await route.fetch({ url: `${SIDE}/${name}` });
      await route.fulfill({ response });
    });
  }
}

/** A seller in Gujarat on Basic (one state) with one published listing. */
async function sellerOnBasic(prefix: string, listed: boolean) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  if (listed) allowFeature(FLAG, who.id);
  sql(`update public.vendor_profiles set state = 'Gujarat', state_code = 'GJ' where id = '${who.id}';
       insert into public.products (vendor_id, name, status, price_value) values ('${who.id}', 'P5 Poplin', 'live', 120);
       insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${who.id}', 'basic', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  return who;
}

test("a listed seller on a one-state plan chooses the state, and the ad is published with it", async ({ browser }) => {
  test.skip(!SIDE, "set LOCAL_AD_FUNCTIONS_URL to the runtime serving razorpay-create-order and razorpay-verify-payment");
  test.setTimeout(150_000);
  const who = await sellerOnBasic("p5-ads", true);
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  await withAdBackend(ctx);
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  await page.goto(`${BUYER_URL}/advertisements`);
  const states = page.getByTestId("ad-states");
  await expect(states).toBeVisible();
  await expect(states).toContainText("Plan: 1 state");
  await expect(states).toContainText("Buyers in other states won't see this ad.");
  await expect(page.getByTestId("ad-countries")).toHaveCount(0);            // countries are VIP's
  await expect(page.getByRole("button", { name: "Mumbai", exact: true })).toBeHidden();   // the older city chips

  // Starts on the seller's own state; a second is over the plan's reach.
  const gujarat = page.getByTestId("ad-state-GJ");
  const maharashtra = page.getByTestId("ad-state-MH");
  await expect(gujarat).toHaveAttribute("aria-pressed", "true");
  await maharashtra.click();
  await expect(page.getByText("Your plan targets up to 1 location (1 state)")).toBeVisible();
  await expect(maharashtra).toHaveAttribute("aria-pressed", "false");
  await gujarat.click();
  await maharashtra.click();
  await expect(maharashtra).toHaveAttribute("aria-pressed", "true");
  await expect(gujarat).toHaveAttribute("aria-pressed", "false");

  // One listing, then the demo checkout.
  await page.getByRole("button", { name: /P5 Poplin/ }).first().click();
  await page.getByRole("button", { name: /^Pay & Publish/ }).click();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page.getByText(/^Payment successful/)).toBeVisible();
  expect(sql(`select status || '|' || target_states::text || '|' || target_countries::text || '|' || coalesce(target_cities::text, 'null')
                from public.advertisements where vendor_id = '${who.id}'`)).toBe("pending_review|{MH}|{}|null");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a seller the switch doesn't list keeps the city chips", async ({ browser }) => {
  const who = await sellerOnBasic("p5-off", false);
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/advertisements`);
  await expect(page.getByRole("button", { name: "Mumbai", exact: true })).toBeVisible();
  await expect(page.getByTestId("ad-states")).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Cosora-Admin names the switch and the review queue shows the states an ad reaches", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await sellerOnBasic("p5-admin", true);
  // An ad waiting for review, as a paid order leaves it.
  sql(`set session_replication_role = replica;
       insert into public.advertisements (vendor_id, product_id, title, placement, status, starts_at, ends_at, target_states)
       select '${who.id}', p.id, 'P5 review me', 'openListing', 'pending_review', now(), now() + interval '7 days', '{MH}'
         from public.products p where p.vendor_id = '${who.id}';
       set session_replication_role = origin;`);

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/feature-flags`);
  await expect(page.getByTestId(`flag-${FLAG}`)).toContainText("Ad reach by state");

  await page.goto(`${ADMIN_URL}/ads`);
  const card = page.locator("div.transition-shadow").filter({ has: page.getByRole("heading", { name: "P5 review me" }) }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Show creative, targeting and history" }).click();
  await expect(card).toContainText("Target states");
  await expect(card).toContainText("MH");
  await expect(card).toContainText("Buyers known to be in another state don't see this campaign");
  expect(errors).toEqual([]);
  await ctx.close();
});
