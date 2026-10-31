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

// ── The requirement form (Task 5) ──
async function openFabricRequirement(page: Page) {
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Create New Requirement/ }).click();
  await page.getByRole("button", { name: /Raw Materials/ }).first().click();
  await page.getByRole("button", { name: /Knitted Fabrics/ }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
const reqField = (page: Page, labelText: RegExp) =>
  page.locator("div", { has: page.locator(":scope > label", { hasText: labelText }) }).locator(":scope > input").first();

test("5a an admin's new requirement question is asked, and its answer is stored", async ({ browser }) => {
  test.setTimeout(150_000);
  const key = `f3q${tag}`;
  sql(`insert into public.attribute_definitions (form, schema_key, section_title, section_position, key, label, kind, position)
       select 'requirement', 'fabrics', section_title, 0, '${key}', 'F3 shrinkage ${tag}', 'text', 99
         from public.attribute_definitions where form = 'requirement' and schema_key = 'fabrics' and section_position = 0 limit 1`);
  try {
    const buyer = await freshAccount(`f3r${tag}`);
    const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 }, true);
    const page = await ctx.newPage();
    await openFabricRequirement(page);
    await reqField(page, new RegExp(`^F3 shrinkage ${tag}`)).fill("Under 3%");
    const fabricType = page.locator("div", { has: page.locator(":scope > label", { hasText: /^Fabric Type/ }) }).first();
    await fabricType.getByRole("button").first().click();
    await fabricType.getByRole("button", { name: "Linen", exact: true }).click();
    await reqField(page, /^Quantity/).fill("500 metres");
    await page.getByRole("button", { name: /Submit Quote Request/ }).click();
    await expect(page).toHaveURL(/\/requirement\/my-quotes$/, { timeout: 30_000 });
    expect(sql(`select attributes ->> '${key}' from public.rfq_submissions where buyer_id = '${buyer.id}'`)).toBe("Under 3%");
    await ctx.close();
  } finally {
    sql(`delete from public.attribute_definitions where form = 'requirement' and key = '${key}'`);
  }
});

test("5b if the questions can't be read, the requirement form asks today's questions", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`f3s${tag}`);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 }, true);
  const page = await ctx.newPage();
  await page.route(/\/rest\/v1\/attribute_definitions/, (r) => r.fulfill({ status: 500, body: "{}" }));
  await openFabricRequirement(page);
  await expect(reqField(page, /^Composition/)).toBeVisible({ timeout: 30_000 });
  await expect(reqField(page, /^Quantity/)).toBeVisible();
  await ctx.close();
});
