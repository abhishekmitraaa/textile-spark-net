/**
 * Subscriptions P11 (2026-10-09): bulk catalogue import, locally.
 *   * A Silver seller on the switch finds it from Products, downloads the template, uploads a
 *     sheet (the template's example row left in, two good rows, one with a category Cosora
 *     doesn't have) and imports: two products go to review, the bad row is named by its
 *     spreadsheet row, and the import shows in Recent imports.
 *   * In Hindi, the page and the server's row message read in Hindi.
 *   * A Basic seller, and a Silver seller the switch doesn't list, are sent to the plans and see
 *     no link on Products.
 * The import's rules are checked by scripts/subscriptions/p11_catalogue.sql. afterEach removes
 * what each test made.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, sql, watchErrors,
} from "./stack";

const FLAG = "bulk_import";
const made: string[] = [];

test.afterEach(() => {
  for (const id of made.splice(0)) {
    disallowFeature(FLAG, id);
    sql(`delete from public.product_import_batches where vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
});

async function seller(prefix: string, plan: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  sql(`update public.vendor_profiles set plan_id = '${plan}', plan_expires_at = now() + interval '20 days', brand_name = '${prefix} Mills'
        where id = '${who.id}';
       insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${who.id}', '${plan}', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  return who;
}

/** The template as downloaded, with rows added under its example row. */
function sheet(template: string, rows: string[]): Buffer {
  return Buffer.from(template.replace(/\r\n$/, "") + "\r\n" + rows.join("\r\n") + "\r\n", "utf8");
}

async function downloadTemplate(page: Page): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("bulk-template").click()]);
  expect(download.suggestedFilename()).toBe("cosora-products-template.csv");
  return readFileSync(await download.path(), "utf8").replace(/^\uFEFF/, "");
}

test("a Silver seller imports a sheet from Products: good rows go to review, the bad one is named", async ({ browser }) => {
  test.setTimeout(120_000);
  const silver = await seller("p11-silver", "silver");
  allowFeature(FLAG, silver.id);
  const ctx = await contextWithSession(browser, silver.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  await page.goto(`${BUYER_URL}/products`);
  await page.getByTestId("bulk-import-link").click();
  await expect(page).toHaveURL(/\/catalogue\/bulk-import$/);
  await expect(page.getByRole("heading", { name: "Bulk import" })).toBeVisible();

  const template = await downloadTemplate(page);
  expect(template.split("\r\n")[0]).toBe(
    "Name,Category,Price,Compare at price,MOQ,Unit,Description,Fabric,GSM,Fit,Gender,Colour,Sizes,Pattern,Occasion,Country of origin,Image URLs");

  await page.getByTestId("bulk-file").setInputFiles({
    name: "p11-spec.csv",
    mimeType: "text/csv",
    buffer: sheet(template, [
      `P11 spec polo A,Activewear,240,300,500 pcs,pcs,"Pique, bio-washed",Cotton,220,Regular,Men,Navy,"S, M, L",Solid,Casual,India,https://example.com/p11-a.jpg`,
      `P11 spec polo B,Activewear,"1,250",,,,,,,,,,,,,,`,
      `P11 spec bad,Not a category,100,,,,,,,,,,,,,,`,
    ]),
  });
  await expect(page.getByTestId("bulk-preview")).toContainText("p11-spec.csv");
  await expect(page.getByTestId("bulk-preview")).toContainText("3 rows");
  await expect(page.getByTestId("bulk-problems")).toContainText("Row 2: the template's example, left out");

  await page.getByTestId("bulk-import").click();
  await expect(page.getByTestId("bulk-result")).toContainText("2 added");
  await expect(page.getByTestId("bulk-result")).toContainText("1 not added");
  await expect(page.getByTestId("bulk-errors")).toContainText(`Row 5: category "Not a category" isn't one of Cosora's categories`);
  await expect(page.getByTestId("bulk-history")).toContainText("2 of 3 added");

  expect(sql(`select string_agg(p.name || ':' || p.status || ':' || coalesce(p.price_value::text, '-') || ':' || (select count(*) from public.product_images i where i.product_id = p.id), ',' order by p.name)
                from public.products p where p.vendor_id = '${silver.id}'`))
    .toBe("P11 spec polo A:under_review:240.00:1,P11 spec polo B:under_review:1250.00:0");

  await page.getByRole("link", { name: "Open Products" }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByText("P11 spec polo A").filter({ visible: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("in Hindi the page and the server's row message read in Hindi", async ({ browser }) => {
  test.setTimeout(120_000);
  const gold = await seller("p11-gold-hi", "gold");
  allowFeature(FLAG, gold.id);
  const ctx = await contextWithSession(browser, gold.session, { width: 1280, height: 1000 });
  await ctx.addInitScript(() => { try { localStorage.setItem("cosora.lang", "hi"); } catch { /* none */ } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  await page.goto(`${BUYER_URL}/catalogue/bulk-import`);
  await expect(page.getByRole("heading", { name: "बल्क इम्पोर्ट" })).toBeVisible();
  const template = await downloadTemplate(page);
  // The file keeps English headings whatever the page's language, and so does the column list.
  expect(template.startsWith("Name,Category,")).toBe(true);
  await expect(page.locator("dt").first()).toHaveText("Name *");

  await page.getByTestId("bulk-file").setInputFiles({
    name: "p11-hi.csv", mimeType: "text/csv",
    buffer: sheet(template, [`P11 spec hi bad,Not a category,100,,,,,,,,,,,,,,`]),
  });
  await page.getByTestId("bulk-import").click();
  await expect(page.getByTestId("bulk-errors")).toContainText(`पंक्ति 3: कैटेगरी "Not a category" Cosora की कैटेगरी में नहीं है`);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a Basic seller, and a Silver seller off the switch, are sent to the plans", async ({ browser }) => {
  test.setTimeout(120_000);
  const basic = await seller("p11-basic", "basic");
  allowFeature(FLAG, basic.id);
  const silverOff = await seller("p11-silver-off", "silver");

  for (const who of [basic, silverOff]) {
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/products`);
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("bulk-import-link")).toHaveCount(0);
    await page.goto(`${BUYER_URL}/catalogue/bulk-import`);
    await expect(page).toHaveURL(/\/subscription/);
    await expect(page.getByText("Bulk import comes with Silver, Gold and VIP")).toBeVisible();
    await ctx.close();
  }
});
