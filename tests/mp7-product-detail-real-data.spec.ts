import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 7, Phase 1 — /product/:id renders the product it was asked for.
 *
 * The page used to build `{ ...mockChinos, ...realFields }`, so a real listing
 * inherited everything its row did not override: GOTS and OEKO-TEX claimed as
 * fact on every product, a 4-hour vendor response time, product code
 * TF-MDS-0412, four invented named reviewers on any product without reviews,
 * and the chinos' photos plus a Google sample MP4 on any product without images.
 *
 * The two products below were picked because they differ on exactly the axes
 * that used to fall through to the template — verified against the live
 * database (anon key, status='live') before this spec was written:
 *
 *   Premium Cotton Polo  — 4 real product_reviews, has a description,
 *                          vendor "Demo Textiles Co." with 5 real vendor reviews.
 *   Chikankari Anarkali  — ZERO product_reviews, NO description, vendor
 *                          "Lucknow Chikankari Co." whose vendor_profiles row
 *                          claims reviews_count = 4800 with zero `reviews` rows.
 *
 * Runs signed out: buyers browse without an account, and RLS lets anon read
 * live listings. No credentials are involved.
 *
 *   npx playwright test tests/mp7-product-detail-real-data.spec.ts
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(REPO_ROOT, "screenshots");

const POLO = {
  id: "36f94dd6-1451-4f34-988b-da5259c6dd77",
  name: "Premium Cotton Polo",
  price: "₹499",
  moq: "MOQ 2",
  vendor: "Demo Textiles Co.",
  category: "Men's T-Shirts",
};
const ANARKALI = {
  id: "b0000000-0000-0000-0000-000000000017",
  name: "Chikankari Anarkali",
  price: "₹1850",
  moq: "MOQ 20 pieces",
  vendor: "Lucknow Chikankari Co.",
  category: "Women's Ethnic Wear",
};

/** Every string the deleted mock template could put on screen. */
const TEMPLATE_RESIDUE = [
  "Premium Cotton Chinos", "Textile Forge", "GOTS", "OEKO-TEX", "TF-MDS-0412",
  "Usually responds", "Anubhav Kumar", "Vaibhav Tripathi", "Ramakant", "Seema",
  "100% organic cotton", "280 GSM", "/ Piece",
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function bodyText(page: Page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

async function assertNoTemplate(page: Page, label: string) {
  const text = await bodyText(page);
  for (const s of TEMPLATE_RESIDUE) expect(text, `${label}: template string "${s}" leaked`).not.toContain(s);
  // No hotlinked placeholder imagery and no sample video anywhere on the page.
  expect(await page.locator('img[src*="picsum.photos"]').count(), `${label}: picsum image`).toBe(0);
  expect(await page.locator('video[src*="gtv-videos-bucket"]').count(), `${label}: sample MP4`).toBe(0);
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("P1.a two real products render their OWN data, and differ from each other", async ({ page }) => {
  const errors = watchConsole(page);
  page.setDefaultTimeout(25_000);
  const seen: Record<string, { h1: string; vendor: string }> = {};

  for (const p of [POLO, ANARKALI]) {
    await page.goto(`/product/${p.id}`);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(p.name);

    const text = await bodyText(page);
    expect(text, `${p.name}: price`).toContain(p.price);
    expect(text, `${p.name}: MOQ, with no invented unit suffix`).toContain(p.moq);
    expect(text, `${p.name}: vendor`).toContain(p.vendor);
    expect(text, `${p.name}: category`).toContain(p.category);
    await assertNoTemplate(page, p.name);

    seen[p.id] = { h1: (await h1.innerText()).trim(), vendor: p.vendor };
    await page.screenshot({ path: path.join(SHOTS, `mp7-product-${p.id.slice(0, 8)}.png`), fullPage: true });
  }

  expect(seen[POLO.id].h1).not.toBe(seen[ANARKALI.id].h1);
  expect(seen[POLO.id].vendor).not.toBe(seen[ANARKALI.id].vendor);
  expect(errors, "no console errors").toEqual([]);
});

test("P1.b a product with real reviews shows them; a vendor's rating comes from real rows", async ({ page }) => {
  page.setDefaultTimeout(25_000);
  await page.goto(`/product/${POLO.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(POLO.name);

  // Vendor card: 5 real `reviews` rows, avg 4.40.
  await expect(page.getByText("(5 reviews)")).toBeVisible();

  await page.getByRole("button", { name: "reviews", exact: true }).click();
  await expect(page.getByText("4 reviews", { exact: true })).toBeVisible();
  await expect(page.getByText("No ratings yet")).toHaveCount(0);
  await assertNoTemplate(page, "Polo reviews tab");
});

test("P1.c a product with no reviews and no description says so — it borrows nothing", async ({ page }) => {
  page.setDefaultTimeout(25_000);
  await page.goto(`/product/${ANARKALI.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ANARKALI.name);

  // vendor_profiles.reviews_count says 4800; there are zero `reviews` rows.
  await expect(page.getByText("No vendor reviews yet")).toBeVisible();
  expect(await bodyText(page)).not.toContain("4800");
  await expect(page.getByText("The vendor hasn't added a description.")).toBeVisible();
  await expect(page.getByText("Country of origin not specified by the vendor.")).toBeVisible();

  await page.getByRole("button", { name: "reviews", exact: true }).click();
  await expect(page.getByText("No ratings yet")).toBeVisible();
  await expect(page.getByText("No reviews yet. Be the first to review this product.")).toBeVisible();
  await assertNoTemplate(page, "Anarkali reviews tab");
  await page.screenshot({ path: path.join(SHOTS, "mp7-product-no-reviews-tab.png"), fullPage: true });
});

test("P1.d a nonexistent product id is 'not found' — never a fallback listing", async ({ page }) => {
  await page.goto("/product/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Couldn't load this product")).toHaveCount(0);
  await assertNoTemplate(page, "nonexistent id");
  await page.screenshot({ path: path.join(SHOTS, "mp7-product-not-found.png"), fullPage: true });
});

test("P1.e a malformed id is 'not found', not a load error", async ({ page }) => {
  // PostgREST rejects a non-uuid with an ERROR, so without the client-side
  // guard this would surface as "Couldn't load".
  await page.goto("/product/not-a-real-id");
  await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Couldn't load this product")).toHaveCount(0);
  await assertNoTemplate(page, "malformed id");
});
