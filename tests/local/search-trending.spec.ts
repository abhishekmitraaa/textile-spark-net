/**
 * Trending searches on /search (2026-10-18; migration 20261018120000_search_trends). Local stack only
 * (stack.ts refuses anything else).
 *
 *   1. Switched off: nobody sees a trending section, signed in or not.
 *   2. On for listed accounts only: a listed buyer sees yesterday's terms and the most searched category,
 *      read from trending_searches(); a visitor still sees nothing (the snapshot holds no terms).
 *   3. On for everyone: a visitor sees the list from site-config/site.json alone (no call to the
 *      database), with "Trending yesterday", and tapping a term runs that search.
 *   4. Cosora-Admin: a manager reads the counts but can't hide; support hides a term with a reason, and it
 *      leaves the buyer's page.
 *
 * Seeds 5 terms searched by 3 guest visitors each yesterday (India time) and one click into "Shirt"; removes
 * them, the runs made during the spec and the hidden term afterwards, and puts the switch back.
 * The local triggers post to production's snapshot URL, so the local site.json is rebuilt by
 * scripts/search-trends/rebuild-local-snapshot.mjs (the real function under a Deno shim).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, signedInContext, sql, stack, watchErrors } from "./stack";

// Letters only, so a term never holds 5 digits in a row (those are never published).
const tag = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const TERMS = ["cotton kurta", "denim jacket", "hoodie", "linen shirt", "polo t-shirt"].map((t) => `${t} ${tag}`);
const SHIRT_PRODUCT = "0ea791f9-644d-4c72-aa94-edf803d1abda";
const VENDOR = "22222222-2222-2222-2222-222222222222";

let switchBefore = "";
let firstRun = 0;

function rebuildSnapshot() {
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(process.cwd(), "scripts/search-trends/rebuild-local-snapshot.mjs")], {
    env: { ...process.env, LOCAL_STACK_ENV: process.env.LOCAL_STACK_ENV ?? ".claude/tmp/local-stack-env.json" },
    encoding: "utf8",
  });
}
const setSwitch = (enabled: boolean, ids: string[] = []) => {
  sql(`update public.feature_flags set enabled = ${enabled}, allow_profile_ids = '{${ids.join(",")}}'::uuid[] where key = 'search_trending';`);
  rebuildSnapshot();
};
const refresh = () => sql("select admin.search_trends_refresh('manual');");

/** /search once the site config has loaded (the section's only source besides the RPC). */
async function openSearch(page: Page) {
  const config = page.waitForResponse((r) => r.url().includes("/site-config/site.json"));
  await page.goto(`${BUYER_URL}/search`);
  await config;
  await expect(page.getByText("PHOTO SEARCH")).toBeVisible();
}

test.beforeAll(() => {
  switchBefore = sql("select enabled::text || '|' || array_to_string(allow_profile_ids, ',') from public.feature_flags where key = 'search_trending';");
  firstRun = Number(sql("select coalesce(max(id), 0) + 1 from admin.search_trend_runs;"));
  const yesterdayNoon = "((now() at time zone 'Asia/Kolkata')::date - 1 + time '12:00') at time zone 'Asia/Kolkata'";
  const rows = TERMS.flatMap((t, i) => [1, 2, 3].map((v) =>
    `('search_impression', '${VENDOR}', null, 's:pw-${tag}-${i}-${v}', '${t}', ${yesterdayNoon})`));
  rows.push(`('search_click', '${VENDOR}', '${SHIRT_PRODUCT}', 's:pw-${tag}-click', 'shirt', ${yesterdayNoon})`);
  sql(`insert into public.engagement_events (event_type, vendor_id, product_id, session_id, query_text, created_at)
       values ${rows.join(",\n")};`);
  refresh();
});

test.afterAll(() => {
  sql(`delete from public.engagement_events where session_id like 's:pw-${tag}-%';`);
  sql(`delete from admin.search_trend_hidden where term_norm like '% ${tag}';`);
  sql(`delete from admin.search_trend_runs where id >= ${firstRun};`);
  const [enabled, ids] = switchBefore.split("|");
  setSwitch(enabled === "true", ids ? ids.split(",") : []);
});

test("1. switched off: no trending section for a visitor or a signed-in buyer", async ({ browser }) => {
  setSwitch(false);
  for (const ctx of [await browser.newContext({ viewport: { width: 390, height: 900 } }), await signedInContext(browser, "buyer")]) {
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await openSearch(page);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("trending-searches")).toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test("2. on for listed accounts: the listed buyer sees it, a visitor doesn't", async ({ browser }) => {
  setSwitch(false, [stack().ids.buyer]);
  const ctx = await signedInContext(browser, "buyer");
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const rpc = page.waitForResponse((r) => r.url().includes("/rpc/trending_searches"));
  await openSearch(page);
  await rpc;
  const section = page.getByTestId("trending-searches");
  await expect(section).toBeVisible();
  await expect(section).toContainText("Trending yesterday");
  const shown = await section.getByTestId("trending-term").allInnerTexts();
  expect(shown.filter((t) => t.endsWith(tag))).toEqual(TERMS);
  await expect(section.getByTestId("trending-category").filter({ hasText: "Shirt" })).toBeVisible();
  // Words only: no count anywhere in the section.
  expect(await section.innerText()).not.toMatch(/\b3\b|visitor/i);
  expect(errors).toEqual([]);
  await ctx.close();

  const anon = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const visitor = await anon.newPage();
  await openSearch(visitor);
  await visitor.waitForTimeout(1500);
  await expect(visitor.getByTestId("trending-searches")).toHaveCount(0);
  await anon.close();
});

test("3. on for everyone: a visitor gets it from site.json alone, and a term runs its search", async ({ browser }) => {
  setSwitch(true);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const calls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/rpc/trending_searches")) calls.push(r.url()); });
  await openSearch(page);
  const section = page.getByTestId("trending-searches");
  await expect(section).toContainText("Trending yesterday");
  expect((await section.getByTestId("trending-term").allInnerTexts()).filter((t) => t.endsWith(tag))).toEqual(TERMS);
  expect(calls, "the list comes from the CDN file, not the database").toEqual([]);
  await section.getByTestId("trending-term").filter({ hasText: TERMS[3] }).click();
  await expect(page).toHaveURL(new RegExp(`/search/results\\?q=${encodeURIComponent(TERMS[3]).replace(/%20/g, "(%20|\\+)")}`));
  expect(errors).toEqual([]);
  await ctx.close();
});

test("4. Cosora-Admin: a manager reads; support hides a term and it leaves the buyer's page", async ({ browser }) => {
  setSwitch(true);
  // Manager: the counts, no Hide.
  const mctx = await signedInContext(browser, "manager", { width: 1440, height: 1000 });
  const manager = await mctx.newPage();
  await manager.goto(`${ADMIN_URL}/trending-searches`);
  const row = manager.locator(`[data-trend-row="${TERMS[2]}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("3");
  await expect(manager.locator('[data-marker="readonly-banner"]')).toBeVisible();
  await expect(row.getByRole("button", { name: /Hide/ })).toHaveCount(0);
  await mctx.close();

  // Support: hide with a reason.
  const sctx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const support = await sctx.newPage();
  const errors = watchErrors(support);
  await support.goto(`${ADMIN_URL}/trending-searches`);
  await support.locator(`[data-trend-row="${TERMS[2]}"]`).getByRole("button", { name: `Hide ${TERMS[2]}` }).click();
  await support.getByLabel("Reason (in the Admin Log)").fill("Spec: not something we list");
  await support.getByRole("button", { name: "Hide it" }).click();
  await expect(support.locator(`[data-trend-row="${TERMS[2]}"]`)).toHaveCount(0, { timeout: 15_000 });
  await expect(support.locator(`[data-hidden-term="${TERMS[2]}"]`)).toContainText("Spec: not something we list");
  expect(errors).toEqual([]);
  await sctx.close();
  expect(sql(`select count(*) from admin.audit_log where reason = 'Trending search hidden: Spec: not something we list';`)).not.toBe("0");

  // The buyer's page, after the snapshot rebuild the hide queued.
  rebuildSnapshot();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await openSearch(page);
  const section = page.getByTestId("trending-searches");
  await expect(section).toBeVisible();
  const shown = await section.getByTestId("trending-term").allInnerTexts();
  expect(shown).not.toContain(TERMS[2]);
  expect(shown.filter((t) => t.endsWith(tag))).toEqual(TERMS.filter((_, i) => i !== 2));
  await ctx.close();
});
