/**
 * Interest Preference v2 (2026-10-11): the redesigned picker, its "Others" words, and the
 * old ids carried over. Migration 20261011050000_interest_preferences_v2. Local stack only.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, watchErrors } from "./stack";

const tile = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const saved = (id: string) =>
  sql(`select array_to_string(preferred_categories, ',') || '|' || coalesce(preferred_interest_other, '-')
       from public.buyer_profiles where id = '${id}'`);

test.describe("Interest Preference", () => {
  test("registration: picks and the Others words save to the account, then on to Terms", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("interest-reg");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    try {
      await page.goto(`${BUYER_URL}/auth/interest-preference`);
      await expect(page.getByRole("heading", { name: "Interest Preference" })).toBeVisible();
      const save = page.getByRole("button", { name: "Save", exact: true });
      await expect(save).toBeDisabled();

      await tile(page, "Women's Clothing").click();
      await expect(tile(page, "Women's Clothing")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("1 selected")).toBeVisible();

      // An empty Others is no interest: Save waits for the words.
      await tile(page, "Others").click();
      await expect(save).toBeDisabled();
      await expect(page.getByText("Tell us what “Others” is, or unselect it.")).toBeVisible();
      await page.getByLabel("What else do you source?").fill("  Leather \t goods ");
      await expect(save).toBeEnabled();
      await save.click();

      await expect(page).toHaveURL(/\/auth\/terms$/);
      await expect.poll(() => saved(who.id)).toBe("womens-clothing,others|Leather goods");
      expect(errors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("profile: old ids read in the new words, and an edit saves only what's picked", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("interest-legacy");
    // What a browser still on the old app would save after the migration ran.
    sql(`insert into public.buyer_profiles (id, preferred_categories) values ('${who.id}', '{tshirts,coords}')
         on conflict (id) do update set preferred_categories = excluded.preferred_categories`);
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/profile`);
      for (const label of ["Men's Clothing", "Women's Clothing", "Unisex Clothing"]) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
      }
      await page
        .getByRole("heading", { name: "Interest & Preferences" })
        .locator("xpath=ancestor::div[2]")
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await expect(page).toHaveURL(/\/profile\/interest-preference$/);
      await expect(tile(page, "Men's Clothing")).toHaveAttribute("aria-pressed", "true");
      await expect(tile(page, "Unisex Clothing")).toHaveAttribute("aria-pressed", "true");

      await tile(page, "Men's Clothing").click();
      await tile(page, "Packaging").click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect.poll(() => saved(who.id)).toBe("womens-clothing,unisex-clothing,packaging|-");
      await expect(page.getByText("Packaging", { exact: true })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("For You: the same picker, and the Others words save when the box loses focus", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("interest-foryou");
    sql(`insert into public.buyer_profiles (id, preferred_categories) values ('${who.id}', '{kidswear}')
         on conflict (id) do update set preferred_categories = excluded.preferred_categories`);
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/for-you`);
      await page.getByRole("button", { name: "Edit Preferences" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: "Kidswear", exact: true })).toHaveAttribute("aria-pressed", "true");
      await dialog.getByRole("button", { name: "Others", exact: true }).click();
      await dialog.getByLabel("What else do you source?").fill("Home decor");
      await dialog.getByRole("heading", { name: "Edit your preferences" }).click(); // blur
      await expect.poll(() => saved(who.id)).toBe("kidswear,others|Home decor");

      // Unpicking Others drops the words, in the app and in the database.
      await dialog.getByRole("button", { name: "Others", exact: true }).click();
      await expect.poll(() => saved(who.id)).toBe("kidswear|-");
    } finally {
      await ctx.close();
    }
  });
});
