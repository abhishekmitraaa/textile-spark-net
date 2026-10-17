/**
 * Mitra's batch of 2026-10-17, part A. Local stack only.
 *   7. Video Close-Ups on a phone: nothing in the reel selects; Call Now's number opens ON TOP of the reel and the
 *      reel works after it (it opened underneath and left every control dead); on the seller's own store the card
 *      doesn't "visit" the page already shown; a video tagged to a listing that isn't live says so; a mouse drag
 *      moves to the next video instead of selecting text.
 *   3. The store's banner box: the drawn default when there is no banner, nothing overflows at 320 / 390 / 1280.
 *   2. One picture per category: the store's "Brand's Categories" are its listings' categories, and a picture set
 *      in Cosora-Admin shows on /categories, New Arrivals, the store and Trends alike.
 *  10. Sponsored rails: a plain heading, a quiet "Sponsored" beside it, "Ad" as small text, no pill or icon.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, service, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const sellers: string[] = [];
const objects: string[] = [];
const JPEG = readFileSync(path.join(process.cwd(), "src/assets/categories/tiles/menswear/shirts.jpg"));
const SHIRTS = "categories/menswear/shirts";
const catId = (name: string) => sql(`select id from public.categories where name = '${name.replace(/'/g, "''")}' limit 1`);

test.afterAll(async () => {
  for (const s of sellers) {
    sql(`delete from public.product_videos where vendor_id = '${s}';
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.products where vendor_id = '${s}';`);
  }
  sql(`update public.category_images set image_path = null, updated_by = null where id = '${SHIRTS}';`);
  if (objects.length) await service().storage.from("site-content").remove(objects);
  await snapshot();
});

async function snapshot() {
  const { API, SERVICE } = stack();
  const r = await fetch(`${API}/functions/v1/site-config-snapshot`, { method: "POST", headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: "{}" });
  expect(r.ok).toBe(true);
}

/** A seller with two live listings (a men's shirt, a dress), one rejected listing, and two videos. */
async function fixture() {
  const s = await freshAccount(`basell${tag}`, { seller: true });
  sellers.push(s.id);
  const listing = (name: string, cat: string, status = "live") =>
    sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq, category_id)
                    values ('${s.id}', '${name}', '${status}', 300, '10', '${catId(cat)}') returning id)
         insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p
         returning product_id`).split("\n")[0];
  const shirt = listing(`BA ${tag} Oxford`, "Men's Shirts");
  listing(`BA ${tag} Poplin`, "Men's Shirts");
  listing(`BA ${tag} Maxi`, "Women's Dresses");
  const rejected = listing(`BA ${tag} Old`, "Men's Shirts", "rejected");
  const video = (line: string, productId: string | null, views: number) =>
    sql(`insert into public.product_videos (vendor_id, product_id, category, brand_line, price, moq, status, views_count, thumbnail_url)
         values ('${s.id}', ${productId ? `'${productId}'` : "null"}, 'Shirts', '${line}', '₹300', '10', 'live', ${views}, '${BUYER_URL}/icon-192.png')
         returning id`).split("\n")[0];
  const untagged = video(`BA ${tag} untagged`, null, 800002);
  const offline = video(`BA ${tag} offline`, rejected, 800001);
  const tagged = video(`BA ${tag} tagged`, shirt, 800000);
  return { seller: s, shirt, untagged, offline, tagged };
}

const activeCard = (page: Page) => page.locator('[data-testid="reel-card"][data-active="true"]');
const activeSlide = (page: Page) => page.locator('[data-index]').filter({ has: activeCard(page) });

test("7. Video Close-Ups on a phone: no selecting, Call Now on top, store-page card, listing not available", async ({ browser }) => {
  test.setTimeout(180_000);
  const f = await fixture();
  const buyer = await freshAccount(`babuy${tag}`);
  // A phone in "desktop site" mode: a touch screen, but a user agent the app doesn't read as mobile, so Call Now
  // shows the number in a dialog instead of opening the dialler. That dialog opened under the reel.
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.route(/rpc\/increment_video_view/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.route(/rpc\/call_vendor_contact/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ phone: "+91 98000 00001", whatsapp: null, brand_name: `basell${tag} Textiles` }]) }));
  await page.route(/rpc\/log_call/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "logged" }) }));

  await page.goto(`${BUYER_URL}/video-closeups?v=${f.tagged}`);
  await expect(activeCard(page)).toContainText(`BA ${tag} tagged`, { timeout: 30_000 });

  // Nothing in the reel is selectable, whatever the pointer (the old rule held on touch screens only).
  const viewer = page.getByTestId("video-closeups-viewer");
  expect(await viewer.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  expect(await activeCard(page).locator("span").first().evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // A long press opens no menu: the reel cancels contextmenu.
  const prevented = await viewer.evaluate((el) => {
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.querySelector("img")!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);

  // Call Now: the number shows above the reel, takes taps, and the reel works again once it's closed.
  await activeSlide(page).getByRole("button", { name: "Call Now" }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("+91 98000 00001");
  // Drawn above the reel. (Hit-testing can't tell: an open dialog turns pointer events off on everything else,
  // the reel included, so a dialog painted UNDER the reel still received the taps while the reel looked dead.)
  const z = async (el: import("@playwright/test").Locator) => Number(await el.evaluate((e) => getComputedStyle(e).zIndex));
  expect(await z(dialog), "the call dialog is above the reel").toBeGreaterThan(await z(viewer));
  await dialog.getByRole("button", { name: "Close" }).tap();
  await expect(dialog).toHaveCount(0);
  await activeSlide(page).getByRole("button", { name: "Like" }).tap();
  await expect(activeSlide(page).getByRole("button", { name: "Unlike" })).toBeVisible();
  await expect.poll(() => sql(`select count(*) from public.video_likes where buyer_id = '${buyer.id}' and video_id = '${f.tagged}'`)).toBe("1");

  // The tagged, live listing opens.
  await expect(activeCard(page)).toContainText("View product");
  await activeCard(page).tap();
  await expect(page).toHaveURL(new RegExp(`/product/${f.shirt}$`));

  // On the seller's own store: the untagged video's card doesn't "visit" the page underneath, the seller's name
  // isn't a link, and the video tagged to a rejected listing says it isn't available.
  await page.goto(`${BUYER_URL}/vendor/${f.seller.id}`);
  await page.getByRole("button", { name: `BA ${tag} untagged` }).tap();
  await expect(activeCard(page)).toContainText(`BA ${tag} untagged`, { timeout: 30_000 });
  await expect(activeCard(page)).not.toContainText("Visit store");
  expect(await activeCard(page).evaluate((el) => el.tagName)).toBe("DIV");
  await expect(activeSlide(page).getByRole("button", { name: `basell${tag} Textiles` })).toHaveCount(0);
  await activeCard(page).tap();
  await expect(page).toHaveURL(new RegExp(`/vendor/${f.seller.id}$`));
  await expect(viewer).toBeVisible(); // still open: nothing pretended to navigate
  await page.goto(`${BUYER_URL}/video-closeups?v=${f.offline}`);
  await expect(activeCard(page)).toContainText(`BA ${tag} offline`, { timeout: 30_000 });
  await expect(activeCard(page).getByTestId("reel-listing-unavailable")).toHaveText("This listing isn't available right now");
  await expect(activeCard(page)).toContainText("Visit store");
  expect(errors).toEqual([]);
  await ctx.close();

  // A mouse drag moves to the next video and selects nothing.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await desk.newPage();
  await dp.route(/rpc\/increment_video_view/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await dp.goto(`${BUYER_URL}/video-closeups?v=${f.untagged}`);
  await expect(activeCard(dp)).toContainText(`BA ${tag} untagged`, { timeout: 30_000 });
  await dp.mouse.move(640, 500);
  await dp.mouse.down();
  await dp.mouse.move(640, 380, { steps: 6 });
  await dp.mouse.move(640, 260, { steps: 6 });
  await dp.mouse.up();
  await expect(dp).not.toHaveURL(new RegExp(`v=${f.untagged}`), { timeout: 10_000 });
  expect(await dp.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  await desk.close();
});

test("3. the store banner box: the drawn default, nothing overflows on a phone or a desktop", async ({ browser }) => {
  const f = await fixture();
  sql(`update public.vendor_profiles set brand_name = 'Shree Laxmi Narayan Handloom Weaving Mills ${tag}' where id = '${f.seller.id}'`);
  for (const width of [320, 390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/vendor/${f.seller.id}`);
    const hero = page.getByTestId("store-hero");
    await expect(hero.getByTestId("store-default-banner")).toBeVisible({ timeout: 30_000 });
    const h = (await hero.boundingBox())!;
    expect(h.height, `${width}px: room for the name, place and counts`).toBeGreaterThanOrEqual(207.5);
    const name = (await hero.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(name.x + name.width, `${width}px: the name stays inside`).toBeLessThanOrEqual(h.x + h.width + 0.5);
    expect(name.y, `${width}px: the name sits inside the banner`).toBeGreaterThanOrEqual(h.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px: no sideways scroll`).toBe(true);
    if (process.env.SHOTS) await hero.screenshot({ path: `${process.env.SHOTS}/3-store-banner-${width}.png` });
    await ctx.close();
  }
  // With a banner the picture is shown, and no default under it.
  sql(`update public.vendor_profiles set banner_url = '${BUYER_URL}/og-image.jpg' where id = '${f.seller.id}'`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/vendor/${f.seller.id}`);
  await expect(page.getByTestId("store-hero").locator("img").first()).toHaveAttribute("src", /og-image\.jpg$/, { timeout: 30_000 });
  await expect(page.getByTestId("store-default-banner")).toHaveCount(0);
  await ctx.close();
});

test("2. one picture per category: the store's categories, and an admin picture on every page", async ({ browser }) => {
  test.setTimeout(150_000);
  const f = await fixture();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // The store's categories are its live listings' categories, most listings first: Shirts (2), then Dresses.
  await page.goto(`${BUYER_URL}/vendor/${f.seller.id}`);
  const cats = page.getByTestId("brand-categories");
  await expect(cats.getByRole("button")).toHaveText(["Shirts", "Dresses"], { timeout: 30_000 });
  await expect(cats.locator(`img[data-slot="${SHIRTS}"]`)).toHaveAttribute("src", /shirts(-[A-Za-z0-9_-]+)?\.jpg$/);
  await expect(page.locator('img[src*="/brand/"]')).toHaveCount(0); // the six bundled cut-outs are gone
  // A tap narrows the store's items to that category.
  await cats.getByRole("button", { name: "Dresses" }).click();
  const items = page.locator("#store-items");
  await expect(items.getByText(`BA ${tag} Maxi`).first()).toBeVisible();
  await expect(items.getByText(`BA ${tag} Oxford`)).toHaveCount(0);

  // A picture set in Cosora-Admin for Menswear › Shirts shows on /categories, New Arrivals, the store and Trends.
  const name = `categories/${crypto.randomUUID()}.jpg`;
  const up = await service().storage.from("site-content").upload(name, JPEG, { contentType: "image/jpeg" });
  expect(up.error).toBeNull();
  objects.push(name);
  sql(`update public.category_images set image_path = '${name}' where id = '${SHIRTS}'`);
  await snapshot();
  const url = new RegExp(`site-content/${name}$`);
  await page.goto(`${BUYER_URL}/categories`);
  await page.getByRole("button", { name: "Menswear", exact: true }).first().click();
  await expect(page.locator(`img[data-slot="${SHIRTS}"]`)).toHaveAttribute("src", url, { timeout: 30_000 });
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(page.getByRole("link", { name: "Men's Shirt" }).locator("img")).toHaveAttribute("src", url, { timeout: 30_000 });
  await page.goto(`${BUYER_URL}/vendor/${f.seller.id}`);
  await expect(page.getByTestId("brand-categories").locator(`img[data-slot="${SHIRTS}"]`)).toHaveAttribute("src", url, { timeout: 30_000 });
  await page.goto(`${BUYER_URL}/home/trends`);
  // Trends' "Hot keywords" for men show Menswear › Shirts (camp collar, linen shirt).
  await page.getByRole("button", { name: "Women's Apparel/Simple" }).click();
  await page.getByRole("button", { name: "Men's Apparel/Casual" }).click();
  await expect.poll(() => page.locator("img").evaluateAll((els, re) => els.some((e) => new RegExp(re).test((e as HTMLImageElement).src)), url.source), { timeout: 30_000 }).toBe(true);
  expect(await page.locator('img[src*="picsum"]').count()).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("10. a sponsored rail is quiet: plain heading, a small Sponsored, 'Ad' as text", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const ads = [0, 1, 2, 3].map((i) => ({
    ad_id: crypto.randomUUID(), product_id: null, title: `BA ${tag} ad ${i}`, placement: "openListing", product_name: `BA ${tag} sponsored ${i}`,
    price_value: 250 + i, currency: "₹", image_url: `${BUYER_URL}/og-image.jpg`, vendor_id: crypto.randomUUID(), vendor_name: "Ad Seller",
    category_name: null, is_bumped: i === 0,
  }));
  await page.route(/rpc\/(active_ads|search_ads)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ads) }));
  await page.route(/rpc\/log_ad_impression/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  const rail = page.locator("section").filter({ has: page.getByRole("heading", { name: "Featured products" }) }).first();
  await expect(rail).toBeVisible({ timeout: 30_000 });
  await rail.scrollIntoViewIfNeeded();
  await expect(rail.getByText("Sponsored", { exact: true })).toBeVisible();
  await expect(rail.getByRole("heading", { name: /Sponsored/ })).toHaveCount(0);
  await expect(rail.getByText("Ad", { exact: true }).first()).toBeVisible();
  await expect(rail.getByText("Ad · Boosted")).toBeVisible();
  // The disclosure stays readable: gray-500, normal weight, not uppercase, not a pill.
  const style = await rail.getByText("Ad", { exact: true }).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, weight: s.fontWeight, transform: s.textTransform, bg: s.backgroundColor };
  });
  expect(style).toEqual({ color: "rgb(107, 114, 128)", weight: "400", transform: "none", bg: "rgba(0, 0, 0, 0)" });
  if (process.env.SHOTS) await rail.screenshot({ path: `${process.env.SHOTS}/10-sponsored-rail.png` });
  await ctx.close();
});
