/**
 * The buyer feeds come a page at a time from feed_products (2026-10-14). They used to download
 * every live listing and page in the browser. One seller with 30 listings (more than a page of
 * 24) and one with three deals (20%, 40%, 60% off). Signed-out visitors unless noted. Local only.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const tag = Date.now().toString(36);
const made: string[] = [];
let bigSeller = "";
let dealSeller = "";
let category = { id: "", name: "" };

test.beforeAll(async () => {
  const big = await freshAccount(`fdbig${tag}`, { seller: true });
  const deals = await freshAccount(`fddeal${tag}`, { seller: true });
  bigSeller = big.id; dealSeller = deals.id;
  made.push(big.id, deals.id);
  const [id, name] = sql(`select id || '|' || name from public.categories where parent_id is not null order by name limit 1`).split("|");
  category = { id, name };
  // 30 listings, newest last-numbered first; every one with a picture, all in one category.
  sql(`with p as (
         insert into public.products (vendor_id, name, status, price_value, category_id, gender, created_at)
         select '${big.id}', 'FD ${tag} ' || lpad(g::text, 2, '0'), 'live', 100 + g, '${id}', 'Women', now() - ((40 - g) || ' minutes')::interval
           from generate_series(1, 30) g returning id)
       insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p;
       with p as (
         insert into public.products (vendor_id, name, status, price_value, compare_at_price, created_at)
         values ('${deals.id}', 'FD ${tag} deal20', 'live', 80, 100, now()),
                ('${deals.id}', 'FD ${tag} deal40', 'live', 60, 100, now()),
                ('${deals.id}', 'FD ${tag} deal60', 'live', 40, 100, now()) returning id)
       insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p;`);
});

test.afterAll(() => {
  for (const id of made) {
    sql(`delete from public.follows where follower_id = '${id}' or vendor_id = '${id}';
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.products where vendor_id = '${id}';`);
  }
});

/** Names of our listings on the page, in page order. */
const ours = (page: Page) =>
  page.locator(`img[alt^="FD ${tag} "]`).evaluateAll((els) => els.map((e) => e.getAttribute("alt") ?? ""));

/** Requests that downloaded the whole live catalogue the old way. */
function watchWholeCatalogue(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (r: Request) => {
    const u = r.url();
    if (u.includes("/rest/v1/products?") && u.includes("status=eq.live") && !u.includes("limit=") && !u.includes("id=in.")) hits.push(u);
  });
  return hits;
}

async function scrollToEnd(page: Page, until: () => Promise<boolean>) {
  for (let i = 0; i < 15 && !(await until()); i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(400);
  }
}

test("New Arrivals and Trends load page by page, every listing once", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const whole = watchWholeCatalogue(page);
  const feedCalls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/rpc/feed_products")) feedCalls.push(r.postData() ?? ""); });

  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(page.locator(`img[alt^="FD ${tag} "]`).first()).toBeVisible({ timeout: 30_000 });
  await scrollToEnd(page, async () => (await ours(page)).filter((n) => /FD \S+ \d\d$/.test(n)).length >= 30);
  const names = (await ours(page)).filter((n) => /FD \S+ \d\d$/.test(n));
  expect(new Set(names).size).toBe(30);                       // all 30, none twice
  expect(names.slice(0, 3)).toEqual([`FD ${tag} 30`, `FD ${tag} 29`, `FD ${tag} 28`]); // newest first (no plan)
  expect(feedCalls.filter((b) => b.includes('"p_offset":24')).length).toBeGreaterThan(0); // a second page was asked for
  await expect(page.getByText("You've seen everything new")).toBeVisible();

  await page.goto(`${BUYER_URL}/home/trends`);
  await expect(page.locator(`img[alt^="FD ${tag} "]`).first()).toBeVisible({ timeout: 30_000 });
  expect(whole).toEqual([]);
  await ctx.close();
});

test("Sale: tiers and order come from the database, and there are no invented deals", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const whole = watchWholeCatalogue(page);
  await page.goto(`${BUYER_URL}/home/sale`);
  // The deals grid (the flash deals above it are a row, not a grid).
  const grid = page.locator("div.grid").filter({ has: page.locator(`img[alt^="FD ${tag} deal"]`) }).last();
  await expect(grid.locator(`img[alt="FD ${tag} deal60"]`).first()).toBeVisible({ timeout: 30_000 });
  const deals = async () => (await grid.locator(`img[alt^="FD ${tag} deal"]`).evaluateAll((els) => els.map((e) => e.getAttribute("alt"))))
    .filter((v, i, a) => a.indexOf(v) === i);
  expect(await deals()).toEqual([`FD ${tag} deal60`, `FD ${tag} deal40`, `FD ${tag} deal20`]);
  await page.getByRole("button", { name: "25–50% off" }).click();
  const tierGrid = page.locator("div.grid").filter({ has: page.locator(`img[alt="FD ${tag} deal40"]`) }).last();
  await expect.poll(async () => (await tierGrid.locator(`img[alt^="FD ${tag} deal"]`).evaluateAll((els) => els.map((e) => e.getAttribute("alt"))))
    .filter((v, i, a) => a.indexOf(v) === i)).toEqual([`FD ${tag} deal40`]);
  await expect(page.getByText("Ribbed Tank Top")).toHaveCount(0); // the invented deals
  expect(whole).toEqual([]);
  await ctx.close();
});

test("Following: the followed seller's listings page by page, then Most Popular", async ({ browser }) => {
  const buyer = await freshAccount(`fdbuyer${tag}`);
  made.push(buyer.id);
  sql(`insert into public.follows (follower_id, vendor_id) values ('${buyer.id}', '${bigSeller}');`);
  const ctx = await contextWithSession(browser, buyer.session, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  const whole = watchWholeCatalogue(page);
  await page.goto(`${BUYER_URL}/home/followings`);
  const newIn = page.locator("section").filter({ has: page.getByRole("heading", { name: "Following New-In", exact: true }) });
  await expect(newIn.locator(`img[alt^="FD ${tag} "]`).first()).toBeVisible({ timeout: 30_000 });
  const inNewIn = async () => new Set(await newIn.locator(`img[alt^="FD ${tag} "]`).evaluateAll((els) => els.map((e) => e.getAttribute("alt")))).size;
  await scrollToEnd(page, async () => (await inNewIn()) >= 30);
  expect(await inNewIn()).toBe(30);
  // Only the followed seller in New-In; the deal seller is not followed.
  expect(await newIn.locator(`img[alt^="FD ${tag} deal"]`).count()).toBe(0);
  await scrollToEnd(page, async () => (await page.getByRole("heading", { name: "Most Popular", exact: true }).count()) > 0);
  await expect(page.getByRole("heading", { name: "Most Popular", exact: true })).toBeVisible();
  // Top performing: four of the followed seller's.
  const top = page.locator("section").filter({ has: page.getByRole("heading", { name: "Following Top Performing" }) });
  expect(await top.locator(`img[alt^="FD ${tag} "]`).count()).toBe(4);
  expect(whole).toEqual([]);
  await ctx.close();
});

test("Search: category counts from the database, and a chip narrows the feed", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const whole = watchWholeCatalogue(page);
  await page.goto(`${BUYER_URL}/search`);
  const chip = page.getByRole("button", { name: new RegExp(`^${category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+$`) });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const count = Number((await chip.textContent())!.replace(category.name, "").trim());
  expect(count).toBe(Number(sql(`select count(*) from public.products where status = 'live' and category_id = '${category.id}'`)));
  await chip.click();
  await expect(page.locator(`img[alt^="FD ${tag} "]`).first()).toBeVisible();
  expect(await page.locator(`img[alt^="FD ${tag} deal"]`).count()).toBe(0); // deals have no category
  expect(whole).toEqual([]);
  await ctx.close();
});

test("For You (signed out, interest picker done): the feed pages and says 'at least' while more remain", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("cosora.buyerPrefs.v1", JSON.stringify({ categories: [], locations: [], hasCompleted: true })));
  const page = await ctx.newPage();
  const whole = watchWholeCatalogue(page);
  await page.goto(`${BUYER_URL}/home/for-you`);
  await expect(page.getByText(/\d+\+? products for you/)).toBeVisible({ timeout: 30_000 });
  const live = Number(sql(`select count(*) from public.products where status = 'live'`));
  if (live > 24) await expect(page.getByText("24+ products for you")).toBeVisible();
  await scrollToEnd(page, async () => (await page.getByText("You're all caught up").count()) > 0);
  await expect(page.getByText(`${live} products for you`)).toBeVisible();
  expect(whole).toEqual([]);
  await ctx.close();
});
