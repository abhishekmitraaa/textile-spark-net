/**
 * Interest Preference v2 (2026-10-11): the redesigned picker, its "Others" words, and the
 * old ids carried over. Migration 20261010232412_interest_preferences_v2. Local stack only.
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

  test("For You: an interest shows the products in its categories", async ({ browser }) => {
    test.setTimeout(120_000);
    // Production showed "No matches found" here: the live product list had no
    // category ids, so the interest filter matched nothing (2026-10-11).
    const seller = await freshAccount("interest-seller", { seller: true });
    const name = `IP Dress ${Date.now().toString(36)}`;
    sql(`insert into public.products (vendor_id, name, status, price_value, category_id)
         select '${seller.id}', '${name}', 'live', 300, c.id from public.categories c
         join public.categories par on par.id = c.parent_id
         where c.name = 'Women''s Dresses' and par.name = 'Apparel & Home Categories'`);
    const who = await freshAccount("interest-filter");
    sql(`insert into public.buyer_profiles (id, preferred_categories) values ('${who.id}', '{womens-clothing}')
         on conflict (id) do update set preferred_categories = excluded.preferred_categories`);
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/for-you`);
      await expect(page.getByText(name)).toBeVisible();
      await expect(page.getByText("No matches found")).toHaveCount(0);
    } finally {
      await ctx.close();
      sql(`update public.products set status = 'paused' where vendor_id = '${seller.id}'`);
    }
  });

  test("For You: the same picker, and the Others words save even when the popup is closed with Escape", async ({ browser }) => {
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
      // Escape closes the popup without a blur (code review, 2026-10-11).
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect.poll(() => saved(who.id)).toBe("kidswear,others|Home decor");
      await expect(page.getByText("Home decor", { exact: true })).toBeVisible();

      // Words, then unpick straight away: two saves in a row; the last one wins.
      await page.getByRole("button", { name: "Edit Preferences" }).click();
      await dialog.getByLabel("What else do you source?").fill("Home decor and rugs");
      await dialog.getByRole("button", { name: "Others", exact: true }).click();
      await expect.poll(() => saved(who.id)).toBe("kidswear|-");
      await page.waitForTimeout(1500); // past the typing delay: nothing late overwrites it
      expect(saved(who.id)).toBe("kidswear|-");

      // An emoji at the limit is never cut in half.
      await dialog.getByRole("button", { name: "Others", exact: true }).click();
      await dialog.getByLabel("What else do you source?").fill("a".repeat(59) + "🧵🧵");
      await page.keyboard.press("Escape");
      await expect.poll(() => saved(who.id)).toBe(`kidswear,others|${"a".repeat(59)}🧵`);

      // An "Others" left empty is unpicked when the popup closes, not saved bare.
      await page.getByRole("button", { name: "Edit Preferences" }).click();
      await dialog.getByRole("button", { name: "Others", exact: true }).click(); // unpick
      await expect.poll(() => saved(who.id)).toBe("kidswear|-");
      await dialog.getByRole("button", { name: "Others", exact: true }).click(); // pick, type nothing
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect.poll(() => saved(who.id)).toBe("kidswear|-");
      await expect(page.getByText("Others", { exact: true })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
