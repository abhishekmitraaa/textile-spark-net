/**
 * Help & Support P5 on the local stack: sellers get the Seller Help questions, buyers the
 * buyer ones, and a stored Hindi translation is what a Hindi reader sees.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, signedInContext, sql, watchErrors } from "./stack";

const SELLER_Q = "How long does verification take?";
const SELLER_Q_HI = "वेरिफ़िकेशन में कितना समय लगता है?";

async function openFaqs(page: import("@playwright/test").Page) {
  await page.getByText("Frequently Asked Questions").click();
  await page.getByPlaceholder("Search FAQs...").fill("verification take");
}

test("a seller sees the Seller Help questions; a buyer doesn't", async ({ browser }) => {
  // 17 from P5, plus "Can I change my plan?" and "Can I get a refund?" (2026-10-02).
  expect(Number(sql(`select count(*) from public.faqs where surface = 'seller_help' and active`))).toBe(19);

  const vendorCtx = await signedInContext(browser, "vendor");
  const vendor = await vendorCtx.newPage();
  const errors = watchErrors(vendor);
  await vendor.goto(`${BUYER_URL}/help`);
  await openFaqs(vendor);
  await expect(vendor.getByText(SELLER_Q).first()).toBeVisible();
  expect(errors).toEqual([]);
  await vendorCtx.close();

  const buyerCtx = await signedInContext(browser, "buyer");
  const buyer = await buyerCtx.newPage();
  await buyer.goto(`${BUYER_URL}/help`);
  await openFaqs(buyer);
  await expect(buyer.getByText(SELLER_Q)).toHaveCount(0);
  await buyerCtx.close();
});

test("a Hindi reader sees the stored Hindi translation", async ({ browser }) => {
  const ctx = await signedInContext(browser, "vendor");
  await ctx.addInitScript(() => localStorage.setItem("cosora.lang", "hi"));
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/help`);
  await page.locator("button", { hasText: /Frequently Asked Questions|अक्सर पूछे जाने वाले प्रश्न/ }).first().click();
  await expect(page.getByText(SELLER_Q_HI).first()).toBeVisible();
  await ctx.close();
});

test("the admin FAQs page lists Seller Help with its translations", async ({ browser }) => {
  const ctx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/faqs`);
  await page.getByRole("button", { name: /^Seller Help \d+$/ }).click();
  await expect(page.getByText(SELLER_Q).first()).toBeVisible();
  await ctx.close();
});
