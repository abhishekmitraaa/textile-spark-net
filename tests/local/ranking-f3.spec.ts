/**
 * Ranking F3: one vocabulary, editable by admins (2026-10-31, migration 20261031100000).
 * Plan documentation/ranking-f3-plan-2026-10-31.md. Local stack only; needs the buyer app (and Cosora-Admin for #6).
 *   3a An admin's change to a listing question (label, a new option) shows on the listing form.
 *   3b A turned-off question leaves the form; editing a listing keeps the answer it already had.
 *   3c If the questions can't be read, the form asks today's questions.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const tag = Date.now().toString(36);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const TEE = `form = 'product' and category_id = 'apparel-home' and subcategory_id = 'mens-tshirts'`;

const continueTo = async (page: Page) => page.getByRole("button", { name: /^Continue/ }).click();
const escapeRe = (s: string) => s.split("").map((c) => (/[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c)).join("");
/** A form field's label (a required one ends with "*"). */
const label = (page: Page, text: string) => page.locator("label").filter({ hasText: new RegExp(`^${escapeRe(text)}\\s*\\*?$`) });

async function openTeeForm(page: Page) {
  await page.goto(`${BUYER_URL}/upload`);
  await page.getByRole("button", { name: /Apparel & Home/ }).first().click();
  await continueTo(page);
  await page.getByRole("button", { name: "Men's T-Shirts", exact: true }).first().click();
  await continueTo(page);
}

/** Puts a question back the way the seed left it. */
function restore(key: string, snapshot: string) {
  const [lbl, options, active] = JSON.parse(snapshot) as [string, string[] | null, boolean];
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  sql(`update public.attribute_definitions set label = ${q(lbl)},
         options = ${options ? `array[${options.map(q).join(",")}]::text[]` : "null"},
         active = ${active} where ${TEE} and key = '${key}'`);
}
const snapshot = (key: string) =>
  sql(`select json_build_array(label, options, active)::text from public.attribute_definitions where ${TEE} and key = '${key}'`);

test("3a an admin's change to a listing question shows on the listing form", async ({ browser }) => {
  test.setTimeout(120_000);
  const before = snapshot("neckType");
  sql(`update public.attribute_definitions set label = 'Neckline style', options = options || array['Boat Neck ${tag}']
       where ${TEE} and key = 'neckType'`);
  try {
    const seller = await freshAccount(`f3a${tag}`, { seller: true });
    const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    await openTeeForm(page);
    await expect(label(page, "Neckline style")).toBeVisible({ timeout: 30_000 });
    await expect(label(page, "Neck Type")).toHaveCount(0);
    await page.getByRole("combobox").filter({ hasText: "Select neckline style" }).click();
    await expect(page.getByRole("option", { name: `Boat Neck ${tag}` })).toBeVisible();
    await ctx.close();
  } finally {
    restore("neckType", before);
  }
});

test("3b a turned-off question leaves the form; editing a listing keeps its answer", async ({ browser }) => {
  test.setTimeout(150_000);
  const seller = await freshAccount(`f3b${tag}`, { seller: true });
  const sub = sql(`select c.id from public.categories c join public.categories p on p.id = c.parent_id
                    where p.name = 'Apparel & Home' and c.name = 'Men''s T-Shirts' limit 1`);
  const pid = sql(`insert into public.products (vendor_id, name, status, price_value, moq, category_id, attributes)
                   values ('${seller.id}', 'F3 ${tag} tee', 'draft', 220, '20', ${sub ? `'${sub}'` : "null"},
                           '{"washCare": ["Machine Wash"], "sku": "F3-${tag}"}') returning id`).match(UUID)![0];
  const before = snapshot("washCare");
  sql(`update public.attribute_definitions set active = false where ${TEE} and key = 'washCare'`);
  try {
    const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    await openTeeForm(page);
    await expect(label(page, "Fabric").first()).toBeVisible({ timeout: 30_000 });
    await expect(label(page, "Wash Care")).toHaveCount(0);

    // Editing the listing and saving keeps the answer the form no longer asks.
    await page.goto(`${BUYER_URL}/upload?id=${pid}`);
    await expect(page.locator("#name")).toHaveValue(`F3 ${tag} tee`, { timeout: 30_000 });
    for (let i = 0; i < 3 && !(await page.getByRole("button", { name: "Save Changes" }).isVisible()); i++) await continueTo(page);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(/\/products$/, { timeout: 30_000 });
    expect(sql(`select attributes -> 'washCare' ->> 0 from public.products where id = '${pid}'`)).toBe("Machine Wash");
    await ctx.close();
  } finally {
    restore("washCare", before);
    sql(`delete from public.products where id = '${pid}'`);
  }
});

test("3c if the questions can't be read, the listing form asks today's questions", async ({ browser }) => {
  test.setTimeout(120_000);
  const before = snapshot("neckType");
  sql(`update public.attribute_definitions set label = 'Neckline style' where ${TEE} and key = 'neckType'`);
  try {
    const seller = await freshAccount(`f3c${tag}`, { seller: true });
    const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    await page.route(/\/rest\/v1\/attribute_definitions/, (r) => r.fulfill({ status: 500, body: "{}" }));
    await openTeeForm(page);
    await expect(label(page, "Neck Type")).toBeVisible({ timeout: 30_000 });
    await expect(label(page, "Wash Care")).toBeVisible();
    await ctx.close();
  } finally {
    restore("neckType", before);
  }
});
