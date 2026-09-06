// Manual smoke check for the rebuilt search surfaces.
// Usage: node scripts/search-smoke.mjs [baseUrl]
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:8081";
const FABRICATED = ["H&M", "Zara", "Levi's", "Handbags For Clothes", "Popular keywords",
  "Trending Keywords", "Father's Day", "Everest Outerwear", "Denim Republic",
  "FitForm Activewear", "$27.53", "Sponsored"];

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  // ── /search ──
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const searchText = await page.locator("body").innerText();

  const leaked = FABRICATED.filter((f) => searchText.includes(f));
  check("/search has no fabricated data", leaked.length === 0, leaked.join(", "));
  check("/search renders category rail", /Browse by category/i.test(searchText));
  await page.screenshot({ path: "screenshots/search-page.png", fullPage: true });

  // ── autocomplete ──
  const input = page.locator('input[placeholder="Search for items or brands"]');
  await input.click();
  await input.fill("shirt");
  await page.waitForTimeout(1200);
  const dropText = await page.locator("body").innerText();
  check("autocomplete shows real listing counts", /listing/i.test(dropText),
    dropText.match(/.{0,40}listing.{0,20}/i)?.[0] ?? "");
  check("autocomplete has no fake brands",
    !/H&M|Zara|Levi's/.test(dropText));
  await page.screenshot({ path: "screenshots/search-autocomplete.png" });

  // ── results ──
  await page.goto(`${BASE}/search/results?q=shirt`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const resText = await page.locator("body").innerText();
  const resLeaked = FABRICATED.filter((f) => resText.includes(f));
  check("/search/results has no fabricated data", resLeaked.length === 0, resLeaked.join(", "));

  const cards = await page.locator('a[href^="/product/"]').count();
  check("/search/results renders product cards", cards > 0, `${cards} product links`);
  const countLine = resText.match(/(\d+)\s+results?/);
  check("/search/results shows a real result count", Boolean(countLine), countLine?.[0] ?? "");
  await page.screenshot({ path: "screenshots/search-results.png", fullPage: true });

  // ── brand tab ──
  await page.getByRole("button", { name: /^Brand \d+$/ }).click();
  await page.waitForTimeout(1200);
  const brandText = await page.locator("body").innerText();
  check("brand tab shows real suppliers", /matching listing/i.test(brandText),
    brandText.match(/.{0,30}matching listing.{0,10}/i)?.[0] ?? "");
  await page.screenshot({ path: "screenshots/search-brand-tab.png", fullPage: true });

  // ── zero-result query ──
  await page.goto(`${BASE}/search/results?q=zzzznotathing`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const emptyText = await page.locator("body").innerText();
  check("empty state renders honestly", /No products match/i.test(emptyText));
  await page.screenshot({ path: "screenshots/search-empty.png", fullPage: true });

  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
