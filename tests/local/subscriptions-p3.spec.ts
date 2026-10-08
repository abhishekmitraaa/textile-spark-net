/**
 * Subscriptions P3 (2026-10-08): autopay, on the local stack.
 *   * A seller the subscription_autopay switch lists buys a plan with "Renew automatically"
 *     ticked (it is by default): the plan is active, the invoice issued, and /subscription
 *     says autopay is on and what it will charge. They turn it off (the plan stays to the
 *     end of its period), and back on for the plan already paid for.
 *   * A seller the switch doesn't list is offered no autopay, and checks out as before.
 *
 * The local stack has no Razorpay keys, so autopay needs LOCAL_SIDE_FUNCTIONS_URL: an edge
 * runtime that serves subscription-autopay with keys and RAZORPAY_API_URL pointed at a mock
 * Razorpay (scripts/local-stack/README.md); without it the autopay test is skipped. Razorpay
 * Checkout is a stand-in that approves at once and signs as Razorpay does
 * (HMAC of payment_id|subscription_id with the mock key secret).
 * Cleanup is in afterEach: the switches' lists.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, sql, stack, watchErrors,
} from "./stack";

const SIDE = process.env.LOCAL_SIDE_FUNCTIONS_URL;
const KEY_SECRET = process.env.LOCAL_RAZORPAY_KEY_SECRET ?? "local_mock_secret";
const listed: Array<[string, string]> = [];

function allow(flag: string, id: string) {
  allowFeature(flag, id);
  listed.push([flag, id]);
}
test.afterEach(() => {
  while (listed.length) {
    const [flag, id] = listed.pop() as [string, string];
    disallowFeature(flag, id);
  }
});

/** subscription-autopay goes to the runtime that has Razorpay keys; Checkout approves at once. */
async function withAutopayBackend(ctx: BrowserContext): Promise<void> {
  await ctx.route(`${stack().API}/functions/v1/subscription-autopay`, async (route) => {
    const response = await route.fetch({ url: `${SIDE}/subscription-autopay` });
    await route.fulfill({ response });
  });
  await ctx.exposeFunction("__rzpSign", (paymentId: string, subscriptionId: string) =>
    createHmac("sha256", KEY_SECRET).update(`${paymentId}|${subscriptionId}`).digest("hex"));
  await ctx.addInitScript(() => {
    let n = 0;
    type Opts = { subscription_id: string; handler: (r: Record<string, string>) => void };
    const w = window as unknown as { Razorpay: unknown; __rzpSign: (p: string, s: string) => Promise<string> };
    w.Razorpay = class {
      constructor(private o: Opts) {}
      open() {
        const paymentId = `pay_ui_${Date.now()}_${++n}`;
        void w.__rzpSign(paymentId, this.o.subscription_id).then((signature) =>
          this.o.handler({ razorpay_payment_id: paymentId, razorpay_subscription_id: this.o.subscription_id, razorpay_signature: signature }));
      }
    };
  });
}

test("a listed seller buys with autopay, turns it off, and turns it back on", async ({ browser }) => {
  test.skip(!SIDE, "needs LOCAL_SIDE_FUNCTIONS_URL: an edge runtime with Razorpay keys pointed at a mock Razorpay");
  test.setTimeout(180_000);
  const who = await freshAccount("p3-auto", { seller: true });
  allow("subscription_checkout", who.id);
  allow("subscription_autopay", who.id);

  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  await withAutopayBackend(ctx);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/subscription`);
  const card = page.getByTestId("autopay-card");
  await expect(card).toHaveAttribute("data-state", "off");
  await expect(card).toContainText('Choose a plan below and keep "Renew automatically" ticked to set up autopay.');

  // Checkout: autopay is ticked by default and says what it will charge.
  await page.getByRole("button", { name: /^Choose Gold/ }).click();
  const dialog = page.getByRole("dialog");
  const option = dialog.getByTestId("autopay-option");
  await expect(option.getByRole("checkbox")).toBeChecked();
  await expect(option).toContainText(/your plan renews at ₹2,713 every month, until you turn autopay off\./);
  await dialog.getByRole("button", { name: /^Pay ₹2,713/ }).click();
  await expect(page.getByText("You're now on Gold!")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Autopay is on").first()).toBeVisible();

  await expect(card).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("autopay-detail")).toContainText(/^Your Gold plan renews at ₹2,713\.00 on /);
  expect(sql(`select s.plan_id || '/' || s.status || '/' || s.auto_renew || ' ' || m.status || ' ' || o.status || '/' || o.autopay
                from public.vendor_subscriptions s
                join public.subscription_mandates m on m.vendor_id = s.vendor_id
                join public.subscription_payment_orders o on o.order_id = m.first_order_ref
               where s.vendor_id = '${who.id}'`)).toBe("gold/active/true authenticated paid/true");
  expect(sql(`select document_type || ' ' || total_paise from public.subscription_invoices where vendor_id = '${who.id}'`)).toBe("test 271300");

  // Off: asks first; the plan stays.
  await card.getByRole("button", { name: "Turn off autopay" }).click();
  await expect(card.getByRole("alertdialog")).toContainText(/^Turn autopay off\? Your plan will end on /);
  await card.getByRole("button", { name: "Yes, turn it off" }).click();
  await expect(page.getByText("Autopay is off").first()).toBeVisible();
  await expect(card).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("autopay-detail")).toContainText(/^Your plan ends on .* unless you renew it\./);
  expect(sql(`select s.status || '/' || s.auto_renew || ' ' || (select string_agg(status, ',' order by created_at) from public.subscription_mandates where vendor_id = s.vendor_id)
                from public.vendor_subscriptions s where s.vendor_id = '${who.id}'`)).toBe("active/false cancelled");

  // Back on, for the plan already paid for: nothing is invoiced.
  await card.getByRole("button", { name: "Turn on autopay" }).click();
  await expect(card).toHaveAttribute("data-state", "on", { timeout: 30_000 });
  expect(sql(`select (select count(*) from public.subscription_invoices where vendor_id = '${who.id}') || ' '
                     || (select string_agg(status, ',' order by created_at) from public.subscription_mandates where vendor_id = '${who.id}')`)).toBe("1 cancelled,authenticated");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a seller the switch doesn't list is offered no autopay", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await freshAccount("p3-plain", { seller: true });
  allow("subscription_checkout", who.id);
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/subscription`);
  await expect(page.getByRole("button", { name: /^Choose Basic/ })).toBeEnabled();
  await expect(page.getByTestId("autopay-card")).toHaveCount(0);
  await page.getByRole("button", { name: /^Choose Basic/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /^Pay / })).toBeVisible();
  await expect(dialog.getByTestId("autopay-option")).toHaveCount(0);
  await dialog.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Basic activated \(demo mode\)/)).toBeVisible({ timeout: 30_000 });
  expect(sql(`select count(*) from public.subscription_mandates where vendor_id = '${who.id}'`)).toBe("0");
  await ctx.close();
});
