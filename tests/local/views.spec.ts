/**
 * "X views" instead of "X sold" (Mitra, 2026-10-17: sales happen off Cosora, so a sold count can't be real).
 * Local stack only.
 *   - a view counts once per listing, per viewer, per day: the same browser twice = 1, another browser = 2, a
 *     signed-in account = its own viewer; calling the counter in a loop changes nothing
 *   - a listing that isn't live doesn't count; nobody reads the ledger directly
 *   - cards show "N views", nothing at 0, and never "sold"
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { BUYER_URL, contextWithSession, freshAccount, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const sellers: string[] = [];

test.afterAll(() => {
  for (const s of sellers) {
    sql(`delete from public.product_view_daily where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.products where vendor_id = '${s}';`);
  }
});

const views = (id: string) => sql(`select views_count from public.products where id = '${id}'`);

test("a view counts once per viewer per day, and cards show real views", async ({ browser }) => {
  test.setTimeout(150_000);
  const s = await freshAccount(`vwsell${tag}`, { seller: true });
  sellers.push(s.id);
  const make = (name: string, status: string, sold: number) =>
    sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq)
                    values ('${s.id}', '${name}', '${status}', 300, '10') returning id)
         insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p
         returning product_id`).split("\n")[0];
  const viewed = make(`VW ${tag} viewed`, "live", 0);
  const quiet = make(`VW ${tag} quiet`, "live", 0);
  const draft = make(`VW ${tag} draft`, "draft", 0);
  // Seed data used to carry made-up sales: put one on a listing to prove it isn't shown.
  sql(`update public.products set sold_count = 800 where id in ('${viewed}', '${quiet}')`);
  expect(views(viewed)).toBe("0");

  // One browser, two visits (two tabs, so the per-tab guard doesn't hide the second call): one view.
  const a = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const calls: string[] = [];
  a.on("request", (r) => { if (r.url().includes("rpc/increment_product_view")) calls.push(r.postData() ?? ""); });
  for (let i = 0; i < 2; i++) {
    const page = await a.newPage();
    await page.goto(`${BUYER_URL}/product/${viewed}`);
    await expect(page.getByText(`VW ${tag} viewed`).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => calls.length).toBe(i + 1);
    await page.close();
  }
  expect(JSON.parse(calls[0]).p_viewer).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.parse(calls[1]).p_viewer).toBe(JSON.parse(calls[0]).p_viewer);
  await expect.poll(() => views(viewed)).toBe("1");

  // Another browser: two.
  const b = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const pb = await b.newPage();
  await pb.goto(`${BUYER_URL}/product/${viewed}`);
  await expect(pb.getByText(`VW ${tag} viewed`).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => views(viewed)).toBe("2");
  await b.close();

  // A signed-in account is its own viewer: three. Calling the counter in a loop changes nothing.
  const buyer = await freshAccount(`vwbuy${tag}`);
  const c = await contextWithSession(browser, buyer.session);
  const pc = await c.newPage();
  await pc.goto(`${BUYER_URL}/product/${viewed}`);
  await expect(pc.getByText(`VW ${tag} viewed`).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => views(viewed)).toBe("3");
  await c.close();
  const { API, ANON } = stack();
  const anon = createClient(API, ANON, { auth: { persistSession: false } });
  const key = crypto.randomUUID();
  for (let i = 0; i < 5; i++) expect((await anon.rpc("increment_product_view", { p: viewed, p_viewer: key })).error).toBeNull();
  expect(views(viewed)).toBe("4");
  for (let i = 0; i < 3; i++) await anon.rpc("increment_product_view", { p: viewed });
  expect(views(viewed)).toBe("5"); // keyless calls (an older app) count once a day in all
  for (let i = 0; i < 3; i++) await anon.rpc("increment_product_view", { p: viewed, p_viewer: "not-a-uuid" });
  expect(views(viewed)).toBe("5");

  // A listing that isn't live doesn't count; nobody reads the ledger.
  await anon.rpc("increment_product_view", { p: draft, p_viewer: crypto.randomUUID() });
  expect(views(draft)).toBe("0");
  const ledger = await anon.from("product_view_daily").select("*").limit(1);
  expect(ledger.error).not.toBeNull();

  // Cards: "5 views" on the store page, nothing for the listing nobody viewed, and no "sold" anywhere.
  const page = await a.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/vendor/${s.id}`);
  const items = page.locator("#store-items");
  await expect(items.getByText("5 views").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\bsold\b/i)).toHaveCount(0);
  await expect(page.getByText(/800\+?/)).toHaveCount(0);
  const quietCard = items.locator("div").filter({ hasText: `VW ${tag} quiet` }).last();
  await expect(quietCard).not.toContainText("views");
  expect(errors).toEqual([]);
  await a.close();
});

test("signed-out 'Chat directly' taps count only when the buyer, signed in, reaches that seller's chat", async ({ browser }) => {
  test.setTimeout(150_000);
  const s = await freshAccount(`vwpend${tag}`, { seller: true });
  sellers.push(s.id);
  const make = (name: string) =>
    sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq)
                    values ('${s.id}', '${name}', 'live', 300, '10') returning id)
         insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p
         returning product_id`).split("\n")[0];
  const a = make(`VW ${tag} pending A`);
  const b = make(`VW ${tag} pending B`);
  const enq = () => sql(`select string_agg(enquiries_count::text, ',' order by name) from public.products where id in ('${a}', '${b}')`);
  const buyer = await freshAccount(`vwpb${tag}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  // Signed out: tap Chat directly on A, then on B. Nothing counts; both are kept.
  for (const id of [a, b]) {
    await page.goto(`${BUYER_URL}/product/${id}`);
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: /Chat Directly/ }).click();
  }
  expect(enq()).toBe("0,0");
  const kept = await page.evaluate(() => sessionStorage.getItem("cosora.pendingEnquiries") ?? "");
  expect(kept).toContain(a);
  expect(kept).toContain(b);
  // Signing in somewhere else counts nothing.
  const key = `sb-${new URL(stack().API).hostname.split(".")[0]}-auth-token`;
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(buyer.session)]);
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await page.waitForTimeout(2000);
  expect(enq()).toBe("0,0");
  // A malformed chat link reached inside the app doesn't crash it (the path used to be decoded on every page, which
  // threw "URI malformed" and blanked the screen) and counts nothing.
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.evaluate(() => { history.pushState({}, "", "/chats/%E0%A4%A"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(2000);
  expect(crashes).toEqual([]);
  expect((await page.locator("body").innerText()).trim()).not.toBe("");
  expect(enq()).toBe("0,0");
  // Reaching that seller's chat counts both, once, and feeds recent demand.
  await page.goto(`${BUYER_URL}/chats/${s.id}`);
  await expect.poll(enq).toBe("1,1");
  expect(sql(`select (public.listing_demand_now('${a}') > 0 and public.listing_demand_now('${b}') > 0)::text`)).toBe("true");
  expect(await page.evaluate(() => sessionStorage.getItem("cosora.pendingEnquiries"))).toBeNull();
  await page.reload();
  await page.waitForTimeout(1500);
  expect(enq()).toBe("1,1");
  await ctx.close();
});

test("Brand Picks put the seller's listings most in demand recently first", async ({ browser }) => {
  test.setTimeout(120_000);
  const s = await freshAccount(`vwbp${tag}`, { seller: true });
  sellers.push(s.id);
  const make = (name: string) =>
    sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq, enquiries_count, views_count)
                    values ('${s.id}', '${name}', 'live', 300, '10', ${name.endsWith("old") ? 999 : 0}, ${name.endsWith("old") ? 9999 : 0}) returning id)
         insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p
         returning product_id`).split("\n")[0];
  const anchor = make(`BP ${tag} anchor`);
  const old = make(`BP ${tag} old`); // huge all-time totals, no recent demand
  const viewed = make(`BP ${tag} viewed`);
  const asked = make(`BP ${tag} asked`);
  sql(`select public.add_listing_demand('${viewed}', 3); select public.add_listing_demand('${asked}', 10);`);
  void old;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/product/${anchor}`);
  await expect(page.getByRole("heading", { name: /Brand Picks/ })).toBeVisible({ timeout: 30_000 });
  const cards = page.getByRole("link", { name: new RegExp(`BP ${tag} (asked|viewed|old)`) });
  await expect(cards).toHaveCount(3);
  const order = await cards.evaluateAll((els) => els.map((e) => [e.getAttribute("aria-label"), e.textContent, ...Array.from(e.querySelectorAll("img"), (i) => i.alt)].join(" ")));
  expect(order.map((t) => t.match(/(asked|viewed|old)/)![1])).toEqual(["asked", "viewed", "old"]);
  await ctx.close();
});
