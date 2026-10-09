/**
 * Subscriptions P12 (2026-10-09): admin tooling and KPIs, locally.
 *   * A finance admin schedules a Silver price for a date, cancels it, then changes it now; the
 *     vendor's plans page shows the new price at once.
 *   * A super admin gives a seller a complimentary Gold plan from the dialog (found by name):
 *     the seller is told and has Gold; the Complimentary list shows it; a seller with a paid
 *     plan running is refused.
 *   * The worklists: a plan in its grace days and a seller whose first payment failed are on
 *     their lists; support reads the figures and lists but can't give plans or change prices.
 * The rules are checked by scripts/subscriptions/p12_admin_tooling.sql. afterEach puts back what
 * each test changed (the Admin Log keeps its entries: it is append-only).
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, sql, watchErrors,
} from "./stack";

const made: string[] = [];
const staff: string[] = [];
let silverBefore: string | null = null;

test.afterEach(() => {
  if (silverBefore) {
    const [m, y] = silverBefore.split("|");
    sql(`update public.subscription_plans set monthly_price = ${m}, yearly_price = ${y} where id = 'silver';
         delete from public.subscription_plan_prices where reason like 'P12 spec%';`);
    silverBefore = null;
  }
  for (const id of made.splice(0)) {
    sql(`delete from public.subscription_grants where vendor_id = '${id}';
         delete from public.subscription_payment_orders where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';
         update public.vendor_profiles set plan_id = null, plan_expires_at = null where id = '${id}';`);
  }
  for (const id of staff.splice(0)) sql(`update admin.admin_users set is_active = false where id = '${id}';`);
});

async function staffMember(prefix: string, role: string) {
  const who = await freshAccount(prefix);
  staff.push(who.id);
  sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${who.id}', '${role}', true)
         on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;`);
  return who;
}

/** A seller with a brand name of its own (accounts from earlier runs stay in the local stack). */
async function seller(prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  const brand = `${prefix} ${Date.now().toString(36)} Mills`;
  sql(`update public.vendor_profiles set brand_name = '${brand}' where id = '${who.id}';`);
  return { ...who, brand };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

test("a finance admin schedules a price, cancels it, then changes it now; vendors see it at once", async ({ browser }) => {
  test.setTimeout(150_000);
  silverBefore = sql(`select monthly_price || '|' || yearly_price from public.subscription_plans where id = 'silver'`);
  const [m0] = silverBefore.split("|").map(Number);
  const fin = await staffMember("p12-finance", "finance_admin");
  const ctx = await contextWithSession(browser, fin.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/subscriptions`);
  await expect(page.getByTestId("subscription-kpis")).toContainText("Paid plans running");

  const row = page.getByTestId("plan-price-silver");
  await row.getByRole("button", { name: "Change price" }).click();
  await page.getByLabel("Monthly (₹)").fill(String(m0 + 100));
  await page.getByLabel("Date the price takes effect").fill(sql(`select to_char((now() at time zone 'Asia/Kolkata')::date + 7, 'YYYY-MM-DD')`));
  await page.getByLabel("Reason").fill("P12 spec: next month's price");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(row).toContainText(`${inr(m0 + 100)} /`);
  expect(sql(`select monthly_price from public.subscription_plans where id = 'silver'`)).toBe(String(m0));

  await row.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Reason").fill("P12 spec: not yet");
  await page.getByRole("button", { name: "Cancel the change" }).click();
  await expect(row).toContainText("none");

  await row.getByRole("button", { name: "Change price" }).click();
  await page.getByLabel("Monthly (₹)").fill(String(m0 + 200));
  await page.getByLabel("Reason").fill("P12 spec: price now");
  await page.getByRole("button", { name: "Change now" }).click();
  await expect(row).toContainText(inr(m0 + 200));
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByTestId("plan-price-history")).toContainText("P12 spec: price now");
  expect(errors).toEqual([]);
  await ctx.close();

  // The vendor's plans page reads the same price.
  const v = await seller("p12-price-reader");
  const vctx = await contextWithSession(browser, v.session, { width: 1280, height: 1000 });
  const vpage = await vctx.newPage();
  await vpage.goto(`${BUYER_URL}/subscription`);
  await expect(vpage.getByText(inr(m0 + 200)).first()).toBeVisible();
  await vctx.close();
});

test("a super admin gives a complimentary Gold plan; a seller with a paid plan running is refused", async ({ browser }) => {
  test.setTimeout(150_000);
  const lucky = await seller("p12-lucky");
  const paying = await seller("p12-paying");
  sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${paying.id}', 'silver', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  const boss = await staffMember("p12-super", "super_admin");
  const ctx = await contextWithSession(browser, boss.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/subscriptions`);

  await page.getByTestId("grant-open").click();
  await page.locator("#grant-vendor").fill(lucky.brand);
  await page.getByTestId("grant-vendor-hits").getByRole("button", { name: new RegExp(lucky.brand) }).click();
  await page.locator("#grant-plan").selectOption("gold");
  await page.getByLabel("Last day").fill(sql(`select to_char((now() at time zone 'Asia/Kolkata')::date + 45, 'YYYY-MM-DD')`));
  await page.getByLabel("Reason").fill("P12 spec launch promotion");
  await page.getByRole("button", { name: "Give the plan" }).click();
  await expect(page.getByText(new RegExp(`${lucky.brand} has Gold until`))).toBeVisible();

  await page.getByRole("button", { name: "Complimentary", exact: true }).click();
  await expect(page.getByTestId("sub-row").filter({ hasText: lucky.brand })).toContainText("complimentary");

  await page.getByTestId("grant-open").click();
  await page.locator("#grant-vendor").fill(paying.brand);
  await page.getByTestId("grant-vendor-hits").getByRole("button", { name: new RegExp(paying.brand) }).click();
  await page.getByLabel("Reason").fill("P12 spec should not happen");
  await page.getByRole("button", { name: "Give the plan" }).click();
  await expect(page.getByText(/paid for/)).toBeVisible();
  expect(sql(`select plan_id from public.vendor_subscriptions where vendor_id = '${paying.id}'`)).toBe("silver");
  expect(errors).toEqual([]);
  await ctx.close();

  const vctx = await contextWithSession(browser, lucky.session, { width: 1280, height: 1000 });
  const vpage = await vctx.newPage();
  await vpage.goto(`${BUYER_URL}/notifications`);
  await expect(vpage.getByText("You have a complimentary plan").first()).toBeVisible();
  expect(sql(`select plan_id || ':' || status from public.vendor_subscriptions where vendor_id = '${lucky.id}'`)).toBe("gold:active");
  await vctx.close();
});

test("the worklists find the plan in grace and the failed first payment; support only reads", async ({ browser }) => {
  test.setTimeout(150_000);
  const late = await seller("p12-late");
  const failed = await seller("p12-failed");
  sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${late.id}', 'basic', 'monthly', 'active', now() - interval '32 days', now() - interval '2 days');
       insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, list_rupees, payment_mode, created_at)
       values ('p12_spec_failed_${failed.id.slice(0, 8)}', '${failed.id}', 'gold', 'monthly', 271300, 'failed', 2299, 'live', now() - interval '1 hour');`);
  const sup = await staffMember("p12-support", "support");
  const ctx = await contextWithSession(browser, sup.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/subscriptions`);
  await expect(page.getByTestId("subscription-kpis")).toContainText("Payment trouble");
  await expect(page.getByTestId("grant-open")).toBeDisabled();
  await expect(page.getByTestId("plan-price-silver").getByRole("button", { name: "Change price" })).toBeDisabled();

  await page.getByRole("button", { name: "In grace days", exact: true }).click();
  await page.locator("#sub-search").fill(late.brand);
  await expect(page.getByTestId("sub-row")).toHaveCount(1);
  await expect(page.getByTestId("sub-row")).toContainText("in its grace days until");

  await page.getByRole("button", { name: "Payment trouble", exact: true }).click();
  await page.locator("#sub-search").fill(failed.brand);
  await expect(page.getByTestId("sub-row")).toHaveCount(1);
  await expect(page.getByTestId("sub-row")).toContainText("no subscription yet");
  await expect(page.getByTestId("sub-row")).toContainText("a payment failed");
  expect(errors).toEqual([]);
  await ctx.close();
});
