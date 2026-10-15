/**
 * The 2026-10-14 buyer fixes, on the local stack (Mitra's list of eight):
 *   1. a manager changes a category picture in Cosora-Admin, and New Arrivals and /categories show it
 *   2. the text under a product's picture opens the product (feed cards and the store page's grid)
 *   3. typing a new wishlist folder's name on a phone: the field stays above the keyboard
 *   4. Share on a product page offers WhatsApp and the rest, and copies the link
 *   5. a store page without the seal keeps its 3-dot menu level with Back
 *   6. on a touch screen, text isn't selectable by tapping, except fields and messages
 *   7. a store's catalogue downloads its PDF; a store with none shows no demo catalogues
 *   8. "Looking for New Brands?" suggests only sellers with live listings, with their pictures
 * Local stack only (stack.ts refuses anything else).
 */
import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const made: string[] = [];
// Cosora-Admin takes JPEG only since 2026-10-16 (it was this PNG icon).
const PICTURE = path.resolve("src/assets/categories/tiles/kidswear/frocks-dresses.jpg");

test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    sql(`delete from public.follows where follower_id = '${id}' or vendor_id = '${id}';
         delete from public.catalogues where vendor_id = '${id}';
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.products where vendor_id = '${id}';`);
  }
});

/** A seller with live listings, each with a picture. */
async function seller(letter: string, listings = 2) {
  const who = await freshAccount(`mf${letter}${tag}`, { seller: true });
  made.push(who.id);
  const names: string[] = [];
  for (let i = 1; i <= listings; i++) {
    const name = `MF ${tag} ${letter}${i}`;
    names.push(name);
    sql(`with p as (insert into public.products (vendor_id, name, status, price_value, fabric, gsm, enquiries_count)
                    values ('${who.id}', '${name}', 'live', ${100 + i}, 'Cotton', '180', ${i}) returning id)
         insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p;`);
  }
  const ids = names.map((n) => sql(`select id from public.products where name = '${n}'`));
  return { ...who, brand: `mf${letter}${tag} Textiles`, names, ids };
}

/** Taps where a piece of text is on screen, the way a finger does (whatever lies on top of it gets the tap). */
async function tapText(page: import("@playwright/test").Page, loc: import("@playwright/test").Locator) {
  await loc.scrollIntoViewIfNeeded();
  await expect.poll(async () => JSON.stringify(await loc.boundingBox())).toBe(JSON.stringify(await loc.boundingBox()));
  const b = (await loc.boundingBox())!;
  await page.mouse.click(b.x + Math.min(20, b.width / 2), b.y + b.height / 2);
}

async function buyerContext(browser: Browser, viewport = { width: 390, height: 860 }, phone = false) {
  const buyer = await freshAccount(`mfbuyer${tag}`);
  made.push(buyer.id);
  return { buyer, ctx: await contextWithSession(browser, buyer.session, viewport, phone) };
}

test("2. the text under a product's picture opens the product", async ({ browser }) => {
  const s = await seller("t", 1);
  const { ctx } = await buyerContext(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // The store page's grid: neither the picture nor the text opened anything before.
  await page.goto(`${BUYER_URL}/vendor/${s.id}`);
  const card = page.locator("div.rounded-xl").filter({ has: page.getByRole("img", { name: s.names[0], exact: true }) }).last();
  await tapText(page, card.getByText("Fabric: Cotton", { exact: false }));
  await expect(page).toHaveURL(new RegExp(`/product/${s.ids[0]}$`));

  // The seller's name and Call Now keep their own jobs.
  await page.goBack();
  await expect(card.getByRole("button", { name: /Call Now/ })).toBeVisible();
  const covered = await card.getByRole("button", { name: /Call Now/ }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === el;
  });
  expect(covered).toBe(true);

  // A feed card (Following → Most Popular uses the shared ListingProductCard).
  await page.goto(`${BUYER_URL}/home/followings`);
  const popular = page.locator("section").filter({ has: page.getByRole("heading", { name: "Most Popular", exact: true }) });
  const feedCard = popular.locator("div.rounded-xl").filter({ has: page.getByRole("img", { name: s.names[0], exact: true }) }).first();
  await tapText(page, feedCard.getByText("Fit Type", { exact: false }));
  await expect(page).toHaveURL(new RegExp(`/product/${s.ids[0]}$`));
  expect(errors).toEqual([]);
  await ctx.close();
});

test("3. a new folder's name stays above the phone's keyboard while it's typed", async ({ browser }) => {
  const s = await seller("w", 1);
  const SCREEN = { width: 390, height: 800 };
  const KEYBOARD = 330;
  const { ctx } = await buyerContext(browser, SCREEN, true);
  await ctx.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), { height: window.innerHeight, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/product/${s.ids[0]}`);
  await page.getByRole("button", { name: "Save product" }).first().click();
  const sheet = page.getByTestId("save-to-folder");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Create new folder" }).click();
  const field = sheet.getByLabel("New folder name");
  await expect(field).toBeFocused();
  expect(await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  await page.evaluate((kb) => {
    const vv = window.visualViewport as unknown as EventTarget & { height: number };
    vv.height = window.innerHeight - kb;
    vv.dispatchEvent(new Event("resize"));
  }, KEYBOARD);
  await field.fill("Summer samples");
  const box = () => field.evaluate((el) => el.getBoundingClientRect().bottom);
  await expect.poll(box).toBeLessThanOrEqual(SCREEN.height - KEYBOARD);
  await expect.poll(() => field.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await expect(field).toHaveValue("Summer samples");
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/3-folder-sheet-keyboard.png" });
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /Summer samples/ })).toBeVisible();
  await ctx.close();
});

test("4. Share offers WhatsApp and the rest, and copies the link", async ({ browser }) => {
  const s = await seller("s", 1);
  const { ctx } = await buyerContext(browser, { width: 1280, height: 900 });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BUYER_URL });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/product/${s.ids[0]}?from=test`);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible();
  const url = `${BUYER_URL}/product/${s.ids[0]}`;
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/4-share-sheet.png" });
  const enc = encodeURIComponent(url);
  await expect(sheet.locator('[data-share="whatsapp"]')).toHaveAttribute("href", `https://wa.me/?text=${encodeURIComponent(`${s.names[0]} on Cosora\n${url}`)}`);
  await expect(sheet.locator('[data-share="facebook"]')).toHaveAttribute("href", `https://www.facebook.com/sharer/sharer.php?u=${enc}`);
  for (const k of ["x", "linkedin", "telegram", "email"]) {
    expect(await sheet.locator(`[data-share="${k}"]`).getAttribute("href")).toContain(enc);
  }
  await expect(sheet.locator('[data-share="whatsapp"]')).toHaveAttribute("target", "_blank");
  await sheet.locator('[data-share="copy"]').click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("5. without a seal, the store page's menu is level with Back; with one, it's beside the seal", async ({ browser }) => {
  const s = await seller("m", 1);
  const { ctx } = await buyerContext(browser);
  const page = await ctx.newPage();
  const tops = async () => {
    const back = await page.getByRole("button", { name: "Back" }).first().boundingBox();
    const more = await page.getByTestId("vendor-more-menu").boundingBox();
    return { back: back!, more: more! };
  };
  await page.goto(`${BUYER_URL}/vendor/${s.id}`);
  await expect(page.getByTestId("vendor-more-menu")).toBeVisible();
  // The hero slides in; measure once it has settled.
  await expect.poll(async () => { const t = await tops(); return Math.abs(t.more.y - t.back.y); }).toBeLessThanOrEqual(1);
  const t = await tops();
  expect(Math.abs(t.more.height - t.back.height)).toBeLessThanOrEqual(1);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/5-store-no-seal.png", clip: { x: 0, y: 0, width: 390, height: 260 } });

  sql(`update public.vendor_profiles set is_verified = true where id = '${s.id}';`);
  await page.reload();
  await expect(page.getByRole("img", { name: "TrustedSEAL" })).toBeVisible();
  await expect.poll(async () => { const t = await tops(); return Math.abs(t.more.y - t.back.y); }).toBeLessThanOrEqual(3);
  const sealGap = async () => {
    const t = await tops();
    const seal = (await page.getByRole("img", { name: "TrustedSEAL" }).boundingBox())!;
    return { centre: Math.abs((t.more.y + t.more.height / 2) - (seal.y + seal.height / 2)), right: t.more.x > seal.x };
  };
  await expect.poll(async () => (await sealGap()).centre).toBeLessThanOrEqual(1);
  expect((await sealGap()).right).toBe(true);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/5-store-seal.png", clip: { x: 0, y: 0, width: 390, height: 260 } });
  await page.getByTestId("vendor-more-menu").click();
  await expect(page.getByRole("menuitem", { name: "Report this seller" })).toBeVisible();
  await ctx.close();
});

test("6. on a touch screen, tapping doesn't select text; fields and messages still can be", async ({ browser }) => {
  const s = await seller("x", 1);
  const { ctx } = await buyerContext(browser, { width: 390, height: 860 }, true);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/product/${s.ids[0]}`);
  await expect(page.getByRole("heading", { name: s.names[0] })).toBeVisible();
  const sel = (q: string) => page.locator(q).first().evaluate((el) => getComputedStyle(el).webkitUserSelect || getComputedStyle(el).userSelect);
  expect(await sel("h1")).toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("-webkit-tap-highlight-color"))).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await page.evaluate(() => {
    const i = document.createElement("input"); i.id = "probe-input"; document.body.appendChild(i);
    const p = document.createElement("p"); p.id = "probe-msg"; p.setAttribute("data-selectable", ""); p.textContent = "hi"; document.body.appendChild(p);
  });
  expect(await sel("#probe-input")).toBe("text");
  expect(await sel("#probe-msg")).toBe("text");
  await ctx.close();

  // A mouse can still select anything.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await desk.newPage();
  await p2.goto(`${BUYER_URL}/product/${s.ids[0]}`);
  await expect(p2.getByRole("heading", { name: s.names[0] })).toBeVisible();
  expect(await p2.locator("h1").first().evaluate((el) => getComputedStyle(el).userSelect)).not.toBe("none");
  await desk.close();
});

test("7. a catalogue downloads its PDF, and a store with none shows no demo catalogues", async ({ browser }) => {
  const s = await seller("c", 1);
  const empty = await seller("e", 1);
  const { API, SERVICE } = stack();
  const object = `${s.id}/mf-${tag}.pdf`;
  const pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
  const up = await fetch(`${API}/storage/v1/object/catalogues/${object}`, {
    method: "POST", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/pdf", "x-upsert": "true" }, body: pdf,
  });
  expect(up.ok).toBe(true);
  const fileUrl = `${API}/storage/v1/object/public/catalogues/${object}`;
  sql(`insert into public.catalogues (vendor_id, title, status, page_count, file_url)
       values ('${s.id}', 'Summer Lookbook ${tag}', 'live', 12, '${fileUrl}');`);

  const { ctx } = await buyerContext(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/vendor/${s.id}`);
  const link = page.getByTestId("catalogue-download");
  await expect(link).toHaveCount(1);
  await expect(link).toContainText("Download PDF");
  if (process.env.SHOTS) { await link.scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.SHOTS + "/7-catalogue.png" }); }
  const href = (await link.getAttribute("href"))!;
  expect(href).toContain(`/catalogues/${object}`);
  expect(href).toContain(`download=Summer-Lookbook-${tag}.pdf`);
  const res = await fetch(href);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition") ?? "").toMatch(/attachment/);

  const download = page.waitForEvent("download");
  await link.click();
  expect((await download).suggestedFilename()).toBe(`Summer-Lookbook-${tag}.pdf`);

  await page.goto(`${BUYER_URL}/vendor/${empty.id}`);
  await expect(page.getByRole("heading", { level: 1, name: empty.brand })).toBeVisible();
  await expect(page.getByText("Catalogues & Lookbooks")).toHaveCount(0);
  await ctx.close();
  await fetch(`${API}/storage/v1/object/catalogues/${object}`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
});

test("8. Looking for New Brands suggests only sellers with live listings, each with its pictures", async ({ browser }) => {
  const withListings = await seller("b", 2);
  const without = await freshAccount(`mfnone${tag}`, { seller: true });
  made.push(without.id);
  const { ctx } = await buyerContext(browser, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/home/followings`);
  const carousel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Looking for New Brands?" }) });
  await expect(carousel).toBeVisible();
  await expect(carousel.getByText(withListings.brand)).toBeVisible();
  await expect(carousel.getByText(`mfnone${tag} Textiles`)).toHaveCount(0);
  // Every organic slide has at least one product picture, and none comes from a placeholder service.
  const slides = carousel.locator("div.snap-center");
  const n = await slides.count();
  for (let i = 0; i < n; i++) {
    const slide = slides.nth(i);
    if (await slide.getByText("Paid placement").count()) continue;
    expect(await slide.getByTestId("new-brand-product").count()).toBeGreaterThan(0);
  }
  expect(await carousel.locator('img[src*="picsum"]').count()).toBe(0);
  const mine = slides.filter({ hasText: withListings.brand });
  await expect(mine.getByRole("img", { name: withListings.names[1] })).toBeVisible(); // most enquiries first
  await expect(mine.getByTestId("new-brand-product")).toHaveCount(2);
  if (process.env.SHOTS) await carousel.screenshot({ path: process.env.SHOTS + "/8-new-brands.png" });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("1. a manager changes a category picture in Cosora-Admin, and the buyer site shows it", async ({ browser }) => {
  test.setTimeout(150_000);
  const slot = "new-arrivals/kidswear";
  const tile = "categories/kidswear/frocks-dresses";
  const reset = () => sql(`update public.category_images set image_path = null, updated_by = null where id in ('${slot}', '${tile}');`);
  reset();
  try {
    const adminCtx = await signedInContext(browser, "manager", { width: 1440, height: 1000 });
    const admin = await adminCtx.newPage();
    const adminErrors = watchErrors(admin);
    await admin.goto(`${ADMIN_URL}/category-pictures`);
    await expect(admin.getByRole("heading", { name: "Category pictures" })).toBeVisible();
    const card = admin.locator(`[data-slot="${slot}"]`);
    await expect(card).toContainText("Default");
    await card.getByLabel("Picture for Kidswear").setInputFiles(PICTURE);
    await expect(admin.getByText("Picture saved for Kidswear")).toBeVisible();
    await expect(card).toContainText("Custom");
    const saved = sql(`select image_path from public.category_images where id = '${slot}'`);
    expect(saved).toMatch(/^categories\/[0-9a-f-]{36}\.jpg$/);
    expect(sql(`select count(*) from admin.audit_log where target_table = 'public.category_images' and target_id = '${slot}' and at > now() - interval '5 minutes'`)).not.toBe("0");

    // A sub-category tile on the Categories page tab.
    await admin.getByRole("button", { name: /Categories page/ }).click();
    await admin.getByLabel("Category").selectOption({ label: "Kids' Wear" });
    await admin.locator(`[data-slot="${tile}"]`).getByLabel("Picture for Frocks / Dresses").setInputFiles(PICTURE);
    await expect(admin.getByText("Picture saved for Frocks / Dresses")).toBeVisible();
    if (process.env.SHOTS) await admin.screenshot({ path: process.env.SHOTS + "/1-admin-category-pictures.png" });
    expect(adminErrors).toEqual([]);

    // The site's snapshot is rebuilt after the save (here by hand: the local trigger posts to production's address).
    const { API, SERVICE } = stack();
    const snap = await fetch(`${API}/functions/v1/site-config-snapshot`, { method: "POST", headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: "{}" });
    expect(snap.ok).toBe(true);

    const buyerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const buyer = await buyerCtx.newPage();
    await buyer.goto(`${BUYER_URL}/home/new-arrivals`);
    await expect(buyer.locator(`img[data-slot="${slot}"]`)).toHaveAttribute("src", new RegExp(`site-content/${saved}$`));
    if (process.env.SHOTS) { await buyer.locator(`img[data-slot="${slot}"]`).scrollIntoViewIfNeeded(); await buyer.screenshot({ path: process.env.SHOTS + "/1-new-arrivals-tile.png" }); }
    await expect(buyer.locator('img[data-slot="new-arrivals/winter-wear"]')).not.toHaveAttribute("src", /site-content/);
    await buyer.goto(`${BUYER_URL}/categories`);
    await buyer.getByRole("button", { name: "Kids' Wear" }).click();
    await expect(buyer.locator(`img[data-slot="${tile}"]`)).toHaveAttribute("src", /site-content\/categories\//);

    // Back to the default: the row clears and the old object is removed.
    await admin.getByRole("button", { name: "New Arrivals" }).click();
    await card.getByRole("button", { name: "Use default" }).click();
    await expect(admin.getByText("Kidswear shows the default again")).toBeVisible();
    expect(sql(`select coalesce(image_path, 'null') from public.category_images where id = '${slot}'`)).toBe("null");
    expect(sql(`select count(*) from storage.objects where bucket_id = 'site-content' and name = '${saved}'`)).toBe("0");
    await adminCtx.close();
    await buyerCtx.close();

    // Support may not open the page.
    const supportCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
    const sp = await supportCtx.newPage();
    await sp.goto(`${ADMIN_URL}/category-pictures`);
    await expect(sp.getByRole("link", { name: "Category pictures" })).toHaveCount(0);
    await expect(sp.getByRole("heading", { name: "Category pictures" })).toHaveCount(0);
    await supportCtx.close();
  } finally {
    const { API, SERVICE } = stack();
    const left = sql(`select coalesce(string_agg(image_path, ','), '') from public.category_images where id in ('${slot}', '${tile}') and image_path is not null`);
    for (const name of left.split(",").filter(Boolean)) {
      await fetch(`${API}/storage/v1/object/site-content/${name}`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    }
    reset();
    await fetch(`${API}/functions/v1/site-config-snapshot`, { method: "POST", headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: "{}" });
  }
});
