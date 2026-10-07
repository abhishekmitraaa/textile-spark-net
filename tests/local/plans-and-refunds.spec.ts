/**
 * Plans do what the Subscription FAQ says (2026-10-02), on the local stack, where
 * checkouts take the demo path (no Razorpay keys):
 *   "you can upgrade your plan at any time and the difference will be prorated.
 *    Downgrades will take effect from your next billing cycle."
 *   "We offer a 7-day money-back guarantee for first-time subscribers."
 * A new seller buys Basic, upgrades to Gold (the unused part of Basic comes off),
 * pays ahead for Silver (it starts when Gold ends), and can't pay ahead twice. Then the
 * guarantee: the seller asks on /subscription and finance closes it in Cosora-Admin
 * once each payment is refunded.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, watchErrors } from "./stack";

// Fresh sellers put on the checkout switch's list come off it after each test.
const listed: string[] = [];
test.afterEach(() => { while (listed.length) disallowFeature("subscription_checkout", listed.pop() as string); });

async function choose(page: Page, button: RegExp) {
  await page.getByRole("button", { name: button }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("upgrade is prorated, a downgrade waits for the next period, and only one is paid ahead", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await freshAccount("p-plan", { seller: true });
  allowFeature("subscription_checkout", who.id); // checkouts are closed to unlisted accounts (subscriptions P0)
  listed.push(who.id);
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/subscription`);

  // A first purchase: the full price.
  await choose(page, /^Choose Basic/);
  await expect(page.getByRole("dialog").getByText("₹699")).toBeVisible();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Basic activated \(demo mode\)/)).toBeVisible({ timeout: 30_000 });
  expect(sql(`select plan_id from public.vendor_subscriptions where vendor_id = '${who.id}'`)).toBe("basic");

  // Ten days in (moved back in time here), Gold costs its price less what's left of Basic.
  sql(`update public.vendor_subscriptions set current_period_start = current_period_start - interval '10 days',
         current_period_end = current_period_end - interval '10 days' where vendor_id = '${who.id}';
       update public.subscription_invoices set billing_period_start = billing_period_start - interval '10 days',
         billing_period_end = billing_period_end - interval '10 days' where vendor_id = '${who.id}';`);
  const expected = Number(sql(`select floor(699 * extract(epoch from (billing_period_end - now())) / extract(epoch from (billing_period_end - billing_period_start)))
                                 from public.subscription_invoices where vendor_id = '${who.id}'`));
  await page.reload();
  await choose(page, /^Upgrade to Gold/);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Starts now. What's left of your current plan comes off the price.")).toBeVisible();
  await expect(dialog.getByText("Credit for the unused part of your current plan")).toBeVisible();
  await expect(dialog.getByText(new RegExp(`−₹${expected.toLocaleString("en-IN")}`))).toBeVisible();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Gold activated \(demo mode\)/)).toBeVisible({ timeout: 30_000 });
  const gold = sql(`select amount || '|' || coalesce(credit_rupees, 0) || '|' || change_kind from public.subscription_invoices
                     where vendor_id = '${who.id}' and plan_id = 'gold'`);
  const [amount, credit, kind] = gold.split("|");
  expect(Math.abs(Number(credit) - expected)).toBeLessThanOrEqual(1);
  expect(Number(amount)).toBe(2299 - Number(credit));
  expect(kind).toBe("upgrade");

  // A lower plan: paid now, starts when Gold ends.
  await choose(page, /^Switch to Silver/);
  await expect(page.getByRole("dialog").getByText(/^Starts on .*, when your current plan ends\. You pay for it now\.$/)).toBeVisible();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Silver is paid for \(demo mode\)/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Switching to Silver on .*\. It's paid for\.$/)).toBeVisible();
  expect(sql(`select plan_id || '|' || scheduled_plan_id from public.vendor_subscriptions where vendor_id = '${who.id}'`)).toBe("gold|silver");

  // Only one period is paid ahead: renewing Gold is off, and another lower plan is refused before paying.
  await expect(page.getByRole("button", { name: /^Current Plan/ }).first()).toBeDisabled();
  await choose(page, /^Switch to Basic/);
  await expect(page.getByText("You've already paid for your next plan period. You can change plans again once it starts.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay |Activate for free/ })).toBeDisabled();

  // The upgrade invoice shows the credit.
  const goldInvoice = sql(`select id from public.subscription_invoices where vendor_id = '${who.id}' and plan_id = 'gold'`);
  await page.goto(`${BUYER_URL}/subscription/invoice/${goldInvoice}`);
  await expect(page.getByText("Gold plan subscription (upgrade)")).toBeVisible();
  await expect(page.getByText("Credit for the unused part of your previous plan")).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("the 7-day guarantee: the seller asks, finance refunds and closes, the plan ends", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await freshAccount("p-refund", { seller: true });
  allowFeature("subscription_checkout", who.id); // checkouts are closed to unlisted accounts (subscriptions P0)
  listed.push(who.id);
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/subscription`);
  await choose(page, /^Choose Gold/);
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Gold activated \(demo mode\)/)).toBeVisible({ timeout: 30_000 });

  // A demo checkout took no money, so nothing is offered back.
  await page.reload();
  await expect(page.getByText("7-day money-back guarantee")).toHaveCount(0);

  // As if Razorpay had taken it (the live path stores the verified payment id).
  sql(`update public.subscription_invoices set razorpay_payment_id = 'pay_local_${who.id.slice(0, 8)}' where vendor_id = '${who.id}';`);
  await page.reload();
  await expect(page.getByText("7-day money-back guarantee")).toBeVisible();
  await expect(page.getByText(/Not satisfied\? You can ask for a full refund of ₹2,713 until /)).toBeVisible();
  await page.getByRole("button", { name: "Request a refund" }).click();
  await page.locator("#refund-reason").fill("Not the right fit yet");
  await page.getByRole("button", { name: "Request the refund" }).click();
  await expect(page.getByText(/You asked for a refund of ₹2,713 on /)).toBeVisible();

  // Finance: the request is listed; it can't close until the payment is refunded.
  const adminCtx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await adminCtx.newPage();
  await admin.goto(`${ADMIN_URL}/subscriptions`);
  const panel = admin.locator("section, div", { has: admin.getByText("7-day money-back guarantee", { exact: true }) }).first();
  await expect(admin.getByText(`p-refund Textiles`).first()).toBeVisible();
  await expect(admin.getByRole("button", { name: "Close and end the plan" })).toBeDisabled();
  // The Razorpay refund itself can't run locally (no keys); record it as admin-refund-payment would.
  sql(`update public.subscription_invoices set razorpay_refund_id = 'rfnd_local', refund_status = 'processed', status = 'refunded',
         refunded_at = now() where vendor_id = '${who.id}';`);
  await admin.reload();
  await admin.getByRole("button", { name: "Close and end the plan" }).first().click();
  await admin.getByRole("dialog").getByRole("button", { name: "Close and end the plan" }).click();
  await expect(admin.getByText("Request closed. The plan has ended and the seller has been told.")).toBeVisible();
  expect(await panel.count()).toBeGreaterThan(0);

  expect(sql(`select status from public.vendor_subscriptions where vendor_id = '${who.id}'`)).toBe("canceled");
  await page.reload();
  await expect(page.getByText(/We refunded ₹2,713 on /)).toBeVisible();
  expect(Number(sql(`select count(*) from public.notifications where profile_id = '${who.id}' and kind in ('refund_requested', 'refund_processed')`))).toBe(2);
  expect(errors).toEqual([]);
  await ctx.close();
  await adminCtx.close();
});
