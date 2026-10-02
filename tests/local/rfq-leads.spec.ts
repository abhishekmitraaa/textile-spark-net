/**
 * RFQ/leads pipeline (documentation/rfq-leads-pipeline-design-2026-10-02.md), on the
 * local stack only. R1: a signed-out visitor is asked to sign in instead of being told
 * there are no requirements, and a signed-in vendor never sees that prompt.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, signedInContext, watchErrors } from "./stack";

test.describe("R1: signed-out visitors", () => {
  test("/leads asks a signed-out visitor to sign in", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`${BUYER_URL}/leads`);
    await expect(page.getByText("Sign in to see buyer requirements")).toBeVisible();
    await expect(page.getByText("No open buyer requirements right now")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login");
    expect(errors).toEqual([]);
  });

  test("/seller-home asks a signed-out visitor to sign in", async ({ page }) => {
    await page.goto(`${BUYER_URL}/seller-home`);
    await expect(page.getByText("Sign in to see buyer requirements")).toBeVisible();
    await expect(page.getByText("No open buyer requirements right now. Check back soon.")).toHaveCount(0);
  });

  test("a signed-in vendor never sees the sign-in prompt", async ({ browser }) => {
    const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/leads`);
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Sign in to see buyer requirements")).toHaveCount(0);
    await ctx.close();
  });
});
