/**
 * Sign-up leaves no way back into itself (2026-10-12). The sign-up screens stay in the
 * browser's history under Home, so the device's back button used to reopen the Terms
 * agreement for a buyer who had just accepted it. Local stack only.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount } from "./stack";

test.describe("Sign-up, then back", () => {
  test("back from Home does not reopen Terms or the steps before it", async ({ browser }) => {
    const who = await freshAccount("signup-back");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      // The last steps of a buyer's sign-up, each one a history entry.
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await expect(page).toHaveURL(/\/auth\/sub-role$/);
      await page.goto(`${BUYER_URL}/auth/terms`);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "NEXT" }).click();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 20_000 });

      await page.goBack();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/);
      await expect(page.getByRole("button", { name: "NEXT" })).toHaveCount(0);

      // The step before Terms is closed too.
      await page.goBack();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/);
    } finally {
      await ctx.close();
    }
  });

  test("an account that has not finished sign-up still gets the Terms screen", async ({ browser }) => {
    const who = await freshAccount("signup-open");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/terms`);
      await expect(page.getByRole("button", { name: "NEXT" })).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/terms$/);
    } finally {
      await ctx.close();
    }
  });
});
