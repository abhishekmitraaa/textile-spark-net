/**
 * Sign-up leaves no way back into itself (2026-10-12). The sign-up screens stay in the
 * browser's history under Home, so the device's back button used to reopen the Terms
 * agreement for a buyer who had just accepted it, and an empty registration form for a
 * seller who had just finished it. The video viewer is an overlay with no entry of its
 * own, so back used to leave the page under it; now it closes the video. Local stack only.
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

test.describe("Registered seller, then back", () => {
  test("the registration form and the role screen go to Seller Home", async ({ browser }) => {
    const who = await freshAccount("vendor-back", { seller: true });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      // Seller Home first, so the app has read that this account is registered.
      await page.goto(`${BUYER_URL}/seller-home`);
      await expect(page).toHaveURL(/\/seller-home$/);
      await page.waitForFunction((k) => localStorage.getItem(k) !== null, `cosora.vendorRegistered.${who.id}`);

      await page.goto(`${BUYER_URL}/onboarding`);
      await expect(page).toHaveURL(/\/seller-home$/);
      await page.goto(`${BUYER_URL}/auth/role-selection`);
      await expect(page).toHaveURL(/\/seller-home$/);
    } finally {
      await ctx.close();
    }
  });

  test("an account that is not a seller yet still gets the registration form", async ({ browser }) => {
    const who = await freshAccount("vendor-open");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/onboarding`);
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(page.locator("body")).not.toBeEmpty();
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Video Close-Ups on Home, then back", () => {
  test("back closes the video and stays on Home; the close button leaves no spare entry", async ({ browser }) => {
    const who = await freshAccount("video-back");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/categories`);
      await page.goto(`${BUYER_URL}/home/new-arrivals`);
      const rail = page.getByRole("heading", { name: "Video Close-Ups" }).locator("xpath=following-sibling::div[1]").getByRole("button");
      const close = page.getByRole("button", { name: "Close", exact: true });
      await expect(rail.first()).toBeVisible({ timeout: 30_000 });

      await rail.first().click();
      await expect(close).toBeVisible();
      await page.goBack();
      await expect(close).toHaveCount(0);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/);

      // Closed with its own button: the next back press leaves Home, as it should.
      await rail.first().click();
      await expect(close).toBeVisible();
      await close.click();
      await expect(close).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(/\/categories$/);
    } finally {
      await ctx.close();
    }
  });
});
