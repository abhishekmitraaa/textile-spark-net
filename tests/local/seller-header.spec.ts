/**
 * The seller dashboard's header on the local stack: the seller's own name and city (it said "Kumar Textiles • Mumbai"
 * to every seller until 2026-11-13).
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

test("the seller header shows the seller's own name and city, never a demo one", async ({ browser }) => {
  const who = await freshAccount("hdr-name", { seller: true });
  sql(`update public.vendor_profiles set brand_name = 'Udhna Weaves', city = 'Surat' where id = '${who.id}';`);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/seller-home`);
  await expect(page.getByRole("banner").getByText("Udhna Weaves")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("banner").getByText("• Surat")).toBeVisible();
  await expect(page.getByText("Kumar Textiles")).toHaveCount(0);
  await ctx.close();
});
