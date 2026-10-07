/**
 * Ranking Part 1, F2 (documentation/ranking-foundations-design-2026-10-07.md): every vendor and
 * buyer has a canonical state; vendors say what they are, where they sell and how much they make.
 * Local stack only.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

test.describe("F2: one state picker", () => {
  test("a vendor can't save contact details without a state, and Odisha saves as OR", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("f2-state", { seller: true });
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/business-profile`);
      await page.locator("#contact-details").getByRole("button", { name: /Edit profile/ }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Pick the state your business is in")).toBeVisible();
      expect(sql(`select coalesce(state, '-') from public.vendor_profiles where id = '${who.id}'`)).toBe("-");

      await page.getByLabel("State").selectOption({ label: "Odisha" });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Contact details updated")).toBeVisible();
      expect(sql(`select state || '|' || state_code from public.vendor_profiles where id = '${who.id}'`)).toBe("Odisha|OR");
    } finally {
      await ctx.close();
    }
  });

  test("a buyer's business details save a state code", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("f2-buyer");
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/profile/business-details`);
      await page.getByLabel("State/Province").selectOption({ label: "Karnataka" });
      await page.getByRole("button", { name: /^Save/ }).click();
      await expect(page.getByText("Business details updated")).toBeVisible();
      expect(sql(`select state || '|' || state_code from public.buyer_profiles where id = '${who.id}'`)).toBe("Karnataka|KA");
    } finally {
      await ctx.close();
    }
  });
});
