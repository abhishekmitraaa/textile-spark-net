/**
 * The second batch of 2026-10-14 buyer fixes, on the local stack (Mitra's list of four):
 *   1. New Arrivals' top carousel shows the listings a manager picks in Cosora-Admin (it showed eight
 *      invented products); with none picked, popular live listings
 *   2. "Create New Requirement": the way on (Continue) is always on screen, and picking a category
 *      shows the sub-category choice below it
 *   3. requirement pictures: the form's and Quick Quote's photos are uploaded and shown in My Quotes;
 *      Quick Quote saves the requirement at all; a requirement with no picture shows a placeholder
 *   4. the Instagram link is www.instagram.com/cosora.in
 * Local stack only (stack.ts refuses anything else).
 */
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, service, signedInContext, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const made: string[] = [];
const PICTURE = path.resolve("public/icon-192.png");

test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    sql(`delete from public.hero_slides where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.quotes where rfq_id in (select id from public.rfqs where buyer_id = '${id}');
         delete from public.rfqs where buyer_id = '${id}';
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.products where vendor_id = '${id}';`);
  }
});

/** A seller with live listings, each with a picture. */
async function seller(letter: string, listings: number) {
  const who = await freshAccount(`hs${letter}${tag}`, { seller: true });
  made.push(who.id);
  const names: string[] = [];
  for (let i = 1; i <= listings; i++) {
    const name = `HS ${tag} ${letter}${i}`;
    names.push(name);
    sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq, fabric, gsm, enquiries_count)
                    values ('${who.id}', '${name}', 'live', ${300 + i}, '${10 * i}', 'Cotton', '180', ${i}) returning id)
         insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p;`);
  }
  const ids = names.map((n) => sql(`select id from public.products where name = '${n}'`));
  return { ...who, names, ids };
}

/** The buyer's uploaded requirement photos (local Storage refuses a direct DELETE; the Storage API removes them). */
async function removeUploads(buyerId: string) {
  const names = sql(`select string_agg(name, ',') from storage.objects where bucket_id = 'product-images' and name like '${buyerId}/%'`);
  if (names) await service().storage.from("product-images").remove(names.split(","));
}

async function rebuildSnapshot() {
  // The site's snapshot is rebuilt after a save (here by hand: the local trigger posts to production's address).
  const { API, SERVICE } = stack();
  const res = await fetch(`${API}/functions/v1/site-config-snapshot`, {
    method: "POST", headers: { authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: "{}",
  });
  expect(res.ok).toBe(true);
}

const carousel = (page: Page) => page.locator('section[aria-roledescription="carousel"]');
/** The listing the carousel shows in front: the one link in it that can take focus. */
const frontSlide = (page: Page) => carousel(page).locator('a[href^="/product/"][tabindex="0"]');

test("1. a manager picks New Arrivals' carousel, and the buyer site shows it", async ({ browser }) => {
  test.setTimeout(180_000);
  sql("delete from public.hero_slides;");
  const s = await seller("c", 3);

  const adminCtx = await signedInContext(browser, "manager", { width: 1440, height: 1000 });
  const admin = await adminCtx.newPage();
  const adminErrors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/new-arrivals-carousel`);
  await expect(admin.getByRole("heading", { name: "New Arrivals carousel" })).toBeVisible();
  await expect(admin.getByText("Nothing picked: the site shows the most popular live listings.")).toBeVisible();

  // Search by listing name; add the second, then the first, then move the first up.
  await admin.getByLabel("Search live listings").fill(`HS ${tag}`);
  const hit = (id: string) => admin.locator(`[data-hero-hit="${id}"]`);
  await expect(hit(s.ids[0])).toBeVisible();
  await hit(s.ids[1]).getByRole("button", { name: "Add" }).click();
  await hit(s.ids[0]).getByRole("button", { name: "Add" }).click();
  await expect(hit(s.ids[0]).getByRole("button", { name: "Added" })).toBeDisabled();
  await admin.getByRole("button", { name: `Move ${s.names[0]} up` }).click();
  await expect(admin.getByText("Unsaved changes")).toBeVisible();
  // A schedule that ends before it starts can't be saved.
  await admin.locator(`#start-${s.ids[1]}`).fill("2030-01-02T10:00");
  await admin.locator(`#end-${s.ids[1]}`).fill("2030-01-01T10:00");
  await expect(admin.getByText("Ends before it starts.")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Save carousel" })).toBeDisabled();
  await admin.locator(`#start-${s.ids[1]}`).fill("");
  await admin.locator(`#end-${s.ids[1]}`).fill("");
  await admin.getByRole("button", { name: "Save carousel" }).click();
  await expect(admin.getByText("Carousel saved: 2 listings")).toBeVisible();
  expect(sql(`select string_agg(product_id::text, ',' order by position) from public.hero_slides`)).toBe(`${s.ids[0]},${s.ids[1]}`);
  expect(sql(`select count(*) from admin.audit_log where target_table = 'public.hero_slides' and at > now() - interval '5 minutes'`)).not.toBe("0");
  if (process.env.SHOTS) await admin.screenshot({ path: process.env.SHOTS + "/b1-admin-carousel.png" });
  await rebuildSnapshot();

  const buyerCtx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const buyer = await buyerCtx.newPage();
  const buyerErrors = watchErrors(buyer);
  await buyer.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(carousel(buyer)).toContainText("01 / 02");
  await expect(frontSlide(buyer)).toHaveAttribute("href", `/product/${s.ids[0]}`);
  await expect(frontSlide(buyer)).toContainText(s.names[0]);
  await expect(buyer.locator('a[href^="/product/ef-"]')).toHaveCount(0);
  if (process.env.SHOTS) await buyer.screenshot({ path: process.env.SHOTS + "/b1-new-arrivals-carousel.png" });

  // A pick that stops being live leaves the carousel by itself.
  sql(`update public.products set status = 'paused' where id = '${s.ids[0]}'`);
  await buyer.reload();
  await expect(carousel(buyer)).toContainText("01 / 01");
  await expect(frontSlide(buyer)).toHaveAttribute("href", `/product/${s.ids[1]}`);
  await expect(admin.locator(`[data-hero-row="${s.ids[0]}"]`)).toBeVisible();
  await admin.reload();
  await expect(admin.locator(`[data-hero-row="${s.ids[0]}"]`)).toContainText("Not live: hidden from the carousel");

  // Nothing picked: popular live listings, real ones.
  await admin.getByRole("button", { name: `Remove ${s.names[0]}` }).click();
  await admin.getByRole("button", { name: `Remove ${s.names[1]}` }).click();
  await admin.getByRole("button", { name: "Save carousel" }).click();
  await expect(admin.getByText("Carousel cleared: it shows popular listings")).toBeVisible();
  expect(sql("select count(*) from public.hero_slides")).toBe("0");
  await rebuildSnapshot();
  await buyer.reload();
  await expect(frontSlide(buyer)).toHaveAttribute("href", /^\/product\/[0-9a-f-]{36}$/);
  const href = (await frontSlide(buyer).getAttribute("href")) as string;
  expect(sql(`select status from public.products where id = '${href.split("/").pop()}'`)).toBe("live");
  expect(adminErrors).toEqual([]);
  expect(buyerErrors).toEqual([]);
  await adminCtx.close();
  await buyerCtx.close();

  // Support may not open the page.
  const supportCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const sp = await supportCtx.newPage();
  await sp.goto(`${ADMIN_URL}/new-arrivals-carousel`);
  await expect(sp.getByRole("link", { name: "New Arrivals carousel" })).toHaveCount(0);
  await expect(sp.getByRole("heading", { name: "New Arrivals carousel" })).toHaveCount(0);
  await supportCtx.close();
});

/** Whether an element is on screen and is what a tap at its centre lands on. */
async function tappable(page: Page, loc: import("@playwright/test").Locator) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) return false;
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
}

test("2. Create New Requirement: Continue is always on screen, and a category shows its sub-categories", async ({ browser }) => {
  const buyer = await freshAccount(`hsbuyer${tag}`);
  made.push(buyer.id);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 760 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Create New Requirement/ }).click();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();

  const go = page.getByRole("button", { name: "Continue" });
  await expect(go).toBeDisabled();
  await expect(page.getByText("Pick a category to continue")).toBeVisible();
  expect(await tappable(page, go)).toBe(true); // on the first screen, above the bottom bar
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/b2-step1-first-screen.png" });

  // Scrolled to the bottom of the list it's still there, and the To-top button doesn't cover it.
  await page.mouse.wheel(0, 3000);
  await expect(page.getByRole("button", { name: "Scroll to top" })).toBeVisible();
  expect(await tappable(page, go)).toBe(true);
  const top = (await page.getByRole("button", { name: "Scroll to top" }).boundingBox())!;
  const bar = (await go.locator("xpath=ancestor::div[contains(@class,'fixed')][1]").boundingBox())!;
  const nav = (await page.locator("nav.fixed").boundingBox())!;
  expect(top.y + top.height).toBeLessThanOrEqual(bar.y);
  expect(Math.abs(bar.y + bar.height - nav.y)).toBeLessThanOrEqual(1); // resting on the bottom bar, no gap
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/b2-step1-scrolled.png" });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Apparel & Home Categories/ }).click();
  await expect(page.getByText(/Narrow it down/)).toBeInViewport();
  await expect(go).toBeEnabled();
  await expect(page.getByText("Selected")).toBeVisible();
  if (process.env.SHOTS) { await page.waitForTimeout(1000); await page.screenshot({ path: process.env.SHOTS + "/b2-step1-picked.png" }); }
  await go.click();
  await expect(page.getByText("Step 2 of 2")).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("3a. the requirement form uploads its photos, and My Quotes shows the cover", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`hsform${tag}`);
  made.push(buyer.id);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 860 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Create New Requirement/ }).click();
  await page.getByRole("button", { name: /Apparel & Home Categories/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Select type" }).click();
  await page.locator("div.absolute.z-20 button").first().click();
  await page.getByPlaceholder("e.g., 500 pieces").fill("500");
  await expect(page.getByText("Add photos")).toBeVisible();
  await expect(page.getByText(/videos or PDF/)).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles(PICTURE);
  await expect(page.getByText("Cover", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Submit Quote Request/ }).click();
  await expect(page).toHaveURL(/\/requirement\/my-quotes$/, { timeout: 20_000 });

  const row = sql(`select image || '|' || cardinality(images) from public.rfqs where buyer_id = '${buyer.id}'`);
  const [image, count] = row.split("|");
  expect(count).toBe("1");
  expect(image).toMatch(new RegExp(`/storage/v1/object/public/product-images/${buyer.id}/rfq/[0-9a-f-]{36}/0\\.(webp|jpg|png)$`));
  const objectName = image.split("/product-images/")[1];
  expect(sql(`select count(*) from storage.objects where bucket_id = 'product-images' and name = '${objectName}'`)).toBe("1");
  await expect(page.locator(`img[src="${image}"]`)).toBeVisible();
  expect(await page.locator(`img[src="${image}"]`).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/b3-my-quotes-cover.png" });
  expect(errors).toEqual([]);
  await removeUploads(buyer.id);
  await ctx.close();
});

test("3b. Quick Quote saves the requirement with its photo; signed out it asks to sign in", async ({ browser }) => {
  test.setTimeout(120_000);
  // Signed out: nothing is saved, and it says why.
  const anonCtx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  const anon = await anonCtx.newPage();
  await anon.goto(`${BUYER_URL}/requirement/post-requirement`);
  await anon.getByRole("button", { name: /Quick Quote/ }).first().click();
  await anon.getByPlaceholder("e.g., Cotton T-Shirt, Leather Wallet").fill(`QQ anon ${tag}`);
  await anon.getByPlaceholder("e.g., 500 pieces, 1000 units").fill("100");
  await anon.getByRole("button", { name: /Submit Quick Quote/ }).click();
  await expect(anon.getByText("Sign in to post a requirement")).toBeVisible();
  expect(sql(`select count(*) from public.rfqs where title = 'QQ anon ${tag}'`)).toBe("0");
  await anonCtx.close();

  const buyer = await freshAccount(`hsquick${tag}`);
  made.push(buyer.id);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 860 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Quick Quote/ }).first().click();
  await page.getByPlaceholder("e.g., Cotton T-Shirt, Leather Wallet").fill(`QQ linen shirts ${tag}`);
  await page.getByPlaceholder("e.g., 500 pieces, 1000 units").fill("250 pieces");
  await page.getByPlaceholder("Any specific requirements? Colors, sizes, fabric...").fill("Navy and white");
  await page.locator('input[type="file"][multiple]').setInputFiles(PICTURE);
  await expect(page.getByText(/1\/5 photos/)).toBeVisible();
  await page.getByRole("button", { name: /Submit Quick Quote/ }).click();
  await expect(page.getByText("Quick Quote posted")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/requirement\/my-quotes$/);

  const row = sql(`select title || '|' || quantity || '|' || description || '|' || image || '|' || status
                     from public.rfqs where buyer_id = '${buyer.id}'`);
  const [title, qty, description, image, status] = row.split("|");
  expect(title).toBe(`QQ linen shirts ${tag}`);
  expect(qty).toBe("250");
  expect(description).toBe("Quantity: 250 pieces\nNavy and white");
  expect(status).toBe("active");
  expect(image).toContain(`/product-images/${buyer.id}/rfq/`);
  await expect(page.locator(`img[src="${image}"]`)).toBeVisible();
  expect(errors).toEqual([]);
  await removeUploads(buyer.id);
  await ctx.close();
});

test("3c. My Quotes: no picture shows a placeholder, a foreign URL isn't fetched, a direct request shows its listing", async ({ browser }) => {
  const s = await seller("d", 1);
  const buyer = await freshAccount(`hsthumb${tag}`);
  made.push(buyer.id);
  sql(`insert into public.rfqs (buyer_id, title, product_name, quantity, image) values
         ('${buyer.id}', 'No picture ${tag}', 'No picture ${tag}', 10, null),
         ('${buyer.id}', 'Foreign ${tag}', 'Foreign ${tag}', 10, 'https://tracker.example.com/pixel.png');
       insert into public.rfqs (buyer_id, vendor_id, product_id, title, product_name, quantity)
         values ('${buyer.id}', '${s.id}', '${s.ids[0]}', 'Quote request: ${s.names[0]}', '${s.names[0]}', 20);`);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 860 }, true);
  const page = await ctx.newPage();
  const foreign: string[] = [];
  page.on("request", (r) => { if (r.url().includes("tracker.example.com")) foreign.push(r.url()); });
  await page.goto(`${BUYER_URL}/requirement/my-quotes`);
  await expect(page.getByRole("img", { name: `No picture ${tag}: no picture` })).toBeVisible();
  await expect(page.getByRole("img", { name: `Foreign ${tag}: no picture` })).toBeVisible();
  await expect(page.locator('img[src=""]')).toHaveCount(0);
  await expect(page.locator(`img[src="${BUYER_URL}/icon-192.png"]`).first()).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/b3-my-quotes-placeholders.png" });
  expect(foreign).toEqual([]);
  await ctx.close();
});

test("4. the Instagram links go to www.instagram.com/cosora.in", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const want = "https://www.instagram.com/cosora.in/";
  await page.goto(`${BUYER_URL}/seller`);
  await expect(page.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", want);
  await page.goto(`${BUYER_URL}/help`);
  await expect(page.locator('a[href*="instagram.com"]').first()).toHaveAttribute("href", want);
  await ctx.close();
});
