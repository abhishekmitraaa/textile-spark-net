import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 7, Phase 3 — /home/trends shows real listings or an honest
 * empty state, and its curated chrome no longer poses as data.
 *
 * What used to be on this page, all removed:
 *   - makeProduct(): generated cards named literally "Product name", with
 *     alternating "5.6k"/"1.6k" figures and "800+ sold", shown whenever the real
 *     catalogue was empty — including during every initial load.
 *   - "Top Brands for #hashtag": 36 invented brand names with picsum logos. With
 *     a live catalogue its grid showed the SAME three real products whichever
 *     invented brand was tapped, and "Visit Brand" opened /vendor/blessing.
 *   - Featured cards with USD prices ($16.22) that saved themselves into the
 *     buyer's collections; a styled hero linking to /product/st1.
 *   - "Hot Keywords" with invented "↑ 800%" growth figures, whose chips changed
 *     nothing on the page once real data existed.
 *
 * The empty and error states are driven by intercepting the catalogue request,
 * so this does not depend on the live catalogue being empty.
 *
 *   npx playwright test tests/mp7-trends-real-or-empty.spec.ts
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(REPO_ROOT, "screenshots");
const UUID = /^\/product\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strings the removed fabrication could put on screen. NOT "5.6k" / "800+ sold":
 * those also appear on REAL cards (a real enquiries_count of 5,600; a seeded
 * sold_count of 800 — see the product-page note on seeded columns). The
 * generator's fingerprint is its literal placeholder name.
 */
const RESIDUE = [
  "Product name", "Top Brands", "Visit Brand",
  "NEW TREND INSIGHTS", "Trending Arrivals", "Hot Keywords", "Also Trending", "↑",
];

async function text(page: Page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

async function productHrefs(page: Page) {
  return page.locator('a[href^="/product/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("P3.a with a live catalogue: only real listings, honest labels", async ({ page }) => {
  await page.goto("/home/trends");
  await expect(page.getByRole("heading", { name: "CURATED TREND PICKS" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Suggested searches")).toBeVisible();
  // Wait for the real feed, not the skeleton.
  await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({ timeout: 25_000 });

  const body = await text(page);
  for (const s of RESIDUE) expect(body, `residue "${s}"`).not.toContain(s);
  expect(body, "no USD price").not.toMatch(/\$\d/);

  // Every product card points at a real product id — no "feed-*", "st1", "*-p0".
  const hrefs = await productHrefs(page);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h, "product link is a real uuid").toMatch(UUID);

  await page.screenshot({ path: path.join(SHOTS, "mp7-trends-live.png"), fullPage: true });
});

test("P3.b the curated look and suggested searches open REAL searches", async ({ page }) => {
  await page.goto("/home/trends");
  await expect(page.getByText("Suggested searches")).toBeVisible({ timeout: 25_000 });

  const look = page.getByRole("link", { name: /Browse similar/ });
  expect(await look.getAttribute("href")).toMatch(/^\/search\/results\?q=/);

  await page.getByRole("button", { name: "rugby tee" }).click();
  await expect(page).toHaveURL(/\/search\/results\?q=rugby(%20|\+)tee/);
});

test("P3.c with an EMPTY catalogue the feed is empty — no generated cards", async ({ page }) => {
  await page.route("**/rest/v1/products?*", (r) =>
    r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : r.continue(),
  );
  await page.goto("/home/trends");
  await expect(page.getByText("No listings to show yet")).toBeVisible({ timeout: 25_000 });
  expect(await productHrefs(page), "no product cards at all").toEqual([]);
  const body = await text(page);
  for (const s of RESIDUE) expect(body, `residue "${s}"`).not.toContain(s);
  await page.screenshot({ path: path.join(SHOTS, "mp7-trends-empty.png"), fullPage: true });
});

test("P3.d a failed catalogue fetch is an error with Retry — not empty, not fake", async ({ page }) => {
  test.setTimeout(60_000); // React Query retries three times before surfacing an error.
  await page.route("**/rest/v1/products?*", (r) =>
    r.request().method() === "GET"
      ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
      : r.continue(),
  );
  await page.goto("/home/trends");
  await expect(page.getByText("Couldn't load listings")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("No listings to show yet")).toHaveCount(0);
  expect(await productHrefs(page)).toEqual([]);
});
