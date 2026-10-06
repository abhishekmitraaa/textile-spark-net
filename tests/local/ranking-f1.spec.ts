/**
 * Ranking Part 1, F1 (documentation/ranking-foundations-design-2026-10-07.md): the product and
 * requirement forms keep every answer they ask for. The first block tests the pure helpers that
 * decide what goes into `attributes`; the rest runs against the local stack.
 */
import { expect, test, type Page } from "@playwright/test";
import { productAttributes, requirementAttributes, attributeDetails } from "../../src/lib/formAttributes";
import { BUYER_URL, contextWithSession, freshAccount, signedInContext, sql } from "./stack";

async function continueTo(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole("button", { name: /^Continue/ }).click();
}

test.describe("F1: the product form keeps every answer", () => {
  test("a new knitted fabric keeps its composition and location", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("f1-fabric", { seller: true });
    const name = `F1 knit ${Date.now()}`;
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/upload`);
      await page.getByRole("button", { name: /Raw Materials/ }).first().click();
      await continueTo(page, 1);
      await page.getByRole("button", { name: /Knitted Fabrics/ }).first().click();
      await continueTo(page, 1);
      await page.locator("#name").fill(name);
      await page.locator("#composition").fill("Cotton 95% Spandex 5%");
      await page.locator("#location").fill("Surat");
      await continueTo(page, 2);
      await page.getByRole("button", { name: "Save as Draft" }).click();
      await expect(page).toHaveURL(/\/products$/, { timeout: 30_000 });
      expect(sql(`select coalesce(attributes ->> 'composition', '-') || '|' || coalesce(location, '-')
                    from public.products where name = '${name}'`)).toBe("Cotton 95% Spandex 5%|Surat");
    } finally {
      await ctx.close();
      sql(`delete from public.products where name = '${name}'`);
    }
  });

  test("editing a product keeps its attributes and location", async ({ browser }) => {
    test.setTimeout(120_000);
    const who = await freshAccount("f1-edit", { seller: true });
    const name = `F1 edit ${Date.now()}`;
    const id = sql(`insert into public.products (vendor_id, name, status, location, attributes)
                    values ('${who.id}', '${name}', 'draft', 'Ludhiana', '{"composition": "Linen 100%", "knitType": "Jersey"}')
                    returning id`).split("\n")[0]; // psql also prints "INSERT 0 1"
    const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/upload?id=${id}`);
      await expect(page.locator("#name")).toHaveValue(name);
      await page.locator("#name").fill(`${name} v2`);
      await continueTo(page, 2);
      await page.getByRole("button", { name: "Save as Draft" }).click();
      await expect(page).toHaveURL(/\/products$/, { timeout: 30_000 });
      expect(sql(`select name || '|' || (attributes ->> 'composition') || '|' || (attributes ->> 'knitType') || '|' || location
                    from public.products where id = '${id}'`)).toBe(`${name} v2|Linen 100%|Jersey|Ludhiana`);
    } finally {
      await ctx.close();
      sql(`delete from public.products where id = '${id}'`);
    }
  });
});

test.describe("F1 helpers", () => {
  test("productAttributes keeps what has no column, cleaned", () => {
    expect(
      productAttributes({
        // Columns (or their own state): never stored in attributes.
        moq: "100", fabric: "Cotton", gsm: "180", fit: "Regular", gender: "Men", sizes: ["S", "M"],
        colors: ["Blue"], pattern: ["Solid"], occasion: ["Casual"], neckType: "Round", sleeveType: "Half",
        collarType: "Spread", originCountry: "India", waistSizes: ["30"], lengths: ["32"], location: "Surat",
        customizationAvailable: "true",
        // Category answers with no column.
        composition: "  Cotton 60% Polyester 40% ",
        width: "58",
        certifications: ["GOTS", " ", "OEKO-TEX"],
        sampleAvailable: "true",
        washable: "false",
        leadTime: "",
        finishes: [],
        blanks: ["", "  "],
      }),
    ).toEqual({
      composition: "Cotton 60% Polyester 40%",
      width: "58",
      certifications: ["GOTS", "OEKO-TEX"],
      sampleAvailable: true,
    });
  });

  test("productAttributes of nothing is an empty object", () => {
    expect(productAttributes({})).toEqual({});
  });

  test("requirementAttributes keeps the category answers, not the description", () => {
    expect(
      requirementAttributes({ description: "Need soon", fabricType: "Linen", gsmRange: " 160-180 ", sizes: ["S", ""], notes: "" }),
    ).toEqual({ fabricType: "Linen", gsmRange: "160-180", sizes: ["S"] });
    expect(requirementAttributes({ description: "only this" })).toEqual({});
  });

  test("attributeDetails humanises keys and joins lists", () => {
    expect(attributeDetails({ fabricType: "Linen", sizes: ["S", "M"], sampleAvailable: true, gsm_range: "180" })).toEqual([
      { label: "Fabric type", value: "Linen" },
      { label: "Gsm range", value: "180" },
      { label: "Sample available", value: "Yes" },
      { label: "Sizes", value: "S, M" },
    ]);
  });
});

test.describe("F1: the requirement form keeps its answers", () => {
  test("a knitted-fabric requirement keeps its composition", async ({ browser }) => {
    test.setTimeout(120_000);
    const composition = `F1 cotton ${Date.now()}`;
    const ctx = await signedInContext(browser, "buyer", { width: 1280, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/requirement/post-requirement`);
      await page.getByRole("button", { name: /Create New Requirement/ }).click();
      await page.getByRole("button", { name: /Raw Materials/ }).first().click();
      await page.getByRole("button", { name: /Knitted Fabrics/ }).first().click();
      await page.getByRole("button", { name: "Save" }).click();
      const field = (label: RegExp) =>
        page.locator("div", { has: page.locator(":scope > label", { hasText: label }) }).locator(":scope > input").first();
      await field(/^Composition/).fill(composition);
      // The set's required questions: Fabric Type (a custom dropdown) and Quantity.
      const fabricType = page.locator("div", { has: page.locator(":scope > label", { hasText: /^Fabric Type/ }) }).first();
      await fabricType.getByRole("button").first().click();
      await fabricType.getByRole("button", { name: "Linen", exact: true }).click();
      await field(/^Quantity/).fill("500 metres");
      await page.getByRole("button", { name: /Submit Quote Request/ }).click();
      await expect(page).toHaveURL(/\/requirement\/my-quotes$/, { timeout: 30_000 });
      expect(sql(`select count(*) || '|' || max(attributes ->> 'productType') from public.rfqs
                   where buyer_id = '11111111-1111-1111-1111-111111111111' and attributes ->> 'composition' = '${composition}'`)).toBe("1|Linen");
    } finally {
      await ctx.close();
      sql(`delete from public.rfqs where attributes ->> 'composition' = '${composition}'`);
    }
  });
});
