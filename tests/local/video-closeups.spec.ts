/**
 * Video Close-Ups: every control does something a buyer can see (Mitra, 2026-10-16: "no options in the video
 * closeups are working for a buyer, make everything functional"). Local stack only.
 *   - signed out, Like and Save ask to sign in (they lit up and vanished on the next visit)
 *   - signed in, Like and Save are stored; a refused write is undone on screen and said
 *   - a saved video is listed in My Saves and plays from there (no page listed them), shown saved from the first
 *     frame, and removing it while the reel still loads sticks (2026-10-17)
 *   - the card opens the tagged listing, or the seller's store; the seller's name opens the store; back returns
 *     to the same video (the card went nowhere)
 *   - the rating is the listing's real reviews, and absent without any ("★ 0 ·")
 *   - arrows move between videos and the address follows; Escape closes
 *   - from New Arrivals, the card opens the listing and back returns to New Arrivals with the reel closed
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const sellers: string[] = [];
const buyers: string[] = [];

test.afterAll(() => {
  for (const s of sellers) {
    sql(`delete from public.product_videos where vendor_id = '${s}';
         delete from public.product_reviews where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.products where vendor_id = '${s}';`);
  }
});

/** A seller with one live listing (2 real reviews: 5 and 4) and two videos: one tagged with it, one not. */
async function fixture() {
  const s = await freshAccount(`vcseller${tag}`, { seller: true });
  sellers.push(s.id);
  const product = sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq, fabric, gsm)
                         values ('${s.id}', 'VC ${tag} Linen Shirt', 'live', 450, '20', 'Linen', '160') returning id)
                       insert into public.product_images (product_id, url, position) select id, '${BUYER_URL}/icon-192.png', 0 from p
                       returning product_id`).split("\n")[0];
  const r1 = await freshAccount(`vcrev1${tag}`);
  const r2 = await freshAccount(`vcrev2${tag}`);
  sql(`insert into public.product_reviews (product_id, buyer_id, rating, body) values
         ('${product}', '${r1.id}', 5, 'Great linen'), ('${product}', '${r2.id}', 4, 'Good');`);
  // Stored numbers the card must NOT show: rating 0, reviews null on the tagged one; 4.9 / "2.1k" on the other.
  const tagged = sql(`insert into public.product_videos (vendor_id, product_id, category, brand_line, price, moq, status, views_count, thumbnail_url, rating, reviews)
                      values ('${s.id}', '${product}', 'Shirts', 'VC ${tag} tagged', '₹450', '20', 'live', 900001, '${BUYER_URL}/icon-192.png', 0, null)
                      returning id`).split("\n")[0];
  const untagged = sql(`insert into public.product_videos (vendor_id, category, brand_line, price, moq, status, views_count, thumbnail_url, rating, reviews)
                        values ('${s.id}', 'Shirts', 'VC ${tag} untagged', '₹300', '10', 'live', 900000, '${BUYER_URL}/icon-192.png', 4.9, '2.1k')
                        returning id`).split("\n")[0];
  return { seller: s, product, tagged, untagged };
}

// The card of the video on screen (neighbouring slides are mounted too, for smooth scrolling).
const card = (page: Page) => page.locator('[data-testid="reel-card"][data-active="true"]');
const likeBtn = (page: Page) => page.getByRole("button", { name: /^(Like|Unlike)$/ }).first();
const saveBtn = (page: Page) => page.getByRole("button", { name: /^(Save|Saved)$/ }).first();

test("every Video Close-Ups control works for a buyer", async ({ browser }) => {
  test.setTimeout(240_000);
  const f = await fixture();

  // ── Signed out: Like and Save ask to sign in, and stay off.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/video-closeups?v=${f.tagged}`);
    await expect(page.getByText(`VC ${tag} tagged`).first()).toBeVisible({ timeout: 30_000 });
    await likeBtn(page).tap();
    await expect(page.getByText("Sign in to like videos")).toBeVisible();
    await expect(likeBtn(page)).toHaveAttribute("aria-label", "Like");
    await saveBtn(page).tap();
    await expect(page.getByText("Sign in to save videos")).toBeVisible();
    await expect(saveBtn(page)).toHaveAttribute("aria-pressed", "false");
    await ctx.close();
  }

  const buyer = await freshAccount(`vcbuyer${tag}`);
  buyers.push(buyer.id);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.route(/rpc\/increment_video_view/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));

  // ── The card: real reviews, "View product", seller name.
  await page.goto(`${BUYER_URL}/video-closeups?v=${f.tagged}`);
  await expect(page.getByText(`VC ${tag} tagged`).first()).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText("4.5 · 2");
  await expect(card(page)).toContainText("View product");
  await expect(card(page)).not.toContainText(" 0 ·");

  // ── Like and Save are stored.
  await likeBtn(page).tap();
  await expect(likeBtn(page)).toHaveAttribute("aria-label", "Unlike");
  await expect.poll(() => sql(`select count(*) from public.video_likes where buyer_id = '${buyer.id}' and video_id = '${f.tagged}'`)).toBe("1");
  await saveBtn(page).tap();
  await expect(page.getByText("Find it in My Saves.")).toBeVisible();
  await expect.poll(() => sql(`select count(*) from public.saved_videos where buyer_id = '${buyer.id}' and video_id = '${f.tagged}'`)).toBe("1");

  // ── The card opens the listing; back returns to the same video.
  // The "Saved" toast lies over the card for a few seconds; tapping through it made Playwright retry and scroll
  // the reel, which moved the active video, so the tap sometimes landed on the next one (2026-10-21).
  await expect(page.getByText("Find it in My Saves.")).toBeHidden({ timeout: 15_000 });
  await card(page).tap();
  await expect(page).toHaveURL(new RegExp(`/product/${f.product}$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/video-closeups\\?v=${f.tagged}$`));
  await expect(page.getByText(`VC ${tag} tagged`).first()).toBeVisible({ timeout: 30_000 });
  await expect(likeBtn(page)).toHaveAttribute("aria-label", "Unlike"); // still liked after the round trip

  // ── The seller's name opens the store.
  await page.getByRole("button", { name: `vcseller${tag} Textiles` }).first().tap();
  await expect(page).toHaveURL(new RegExp(`/vendor/${f.seller.id}$`));

  // ── A video without a live listing: no rating (its stored 4.9 / 2.1k never shows), "Visit store".
  await page.goto(`${BUYER_URL}/video-closeups?v=${f.untagged}`);
  await expect(page.getByText(`VC ${tag} untagged`).first()).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText("Visit store");
  await expect(card(page)).not.toContainText("4.9");
  await expect(card(page)).not.toContainText("2.1k");
  await card(page).tap();
  await expect(page).toHaveURL(new RegExp(`/vendor/${f.seller.id}$`));

  // ── A refused write is undone on screen and said.
  await page.goto(`${BUYER_URL}/video-closeups?v=${f.untagged}`);
  await expect(page.getByText(`VC ${tag} untagged`).first()).toBeVisible({ timeout: 30_000 });
  await page.route(/rest\/v1\/video_likes/, (r) => r.request().method() === "POST"
    ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
    : r.continue());
  await likeBtn(page).tap();
  await expect(page.getByText("Couldn't save your like")).toBeVisible();
  await expect(likeBtn(page)).toHaveAttribute("aria-label", "Like");
  await page.unroute(/rest\/v1\/video_likes/);

  // ── Keyboard: down moves to the next video and the address follows; Escape closes.
  const before = new URL(page.url()).searchParams.get("v");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => new URL(page.url()).searchParams.get("v"), { timeout: 10_000 }).not.toBe(before);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/\/video-closeups/, { timeout: 10_000 });

  // ── My Saves lists the saved video, and it plays from there.
  await page.goto(`${BUYER_URL}/saved`);
  await expect(page.getByText("Saved videos")).toBeVisible({ timeout: 30_000 });
  // The reel's own load of saved state is held back 3 s: the video still shows saved at once (My Saves knows),
  // and removing it during the load sticks, on screen and in the database (2026-10-17).
  await page.route(/rest\/v1\/saved_videos\?select=video_id/, async (r) => {
    await new Promise((res) => setTimeout(res, 3_000));
    await r.continue();
  });
  await page.getByTestId("saved-video").first().tap();
  await expect(page.getByText(`VC ${tag} tagged`).first()).toBeVisible();
  await expect(saveBtn(page)).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  await saveBtn(page).tap();
  await expect(saveBtn(page)).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(4_000); // the held-back load has answered by now
  await expect(saveBtn(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => sql(`select count(*) from public.saved_videos where buyer_id = '${buyer.id}' and video_id = '${f.tagged}'`)).toBe("0");
  await page.unroute(/rest\/v1\/saved_videos\?select=video_id/);
  await page.getByRole("button", { name: "Close" }).tap();
  await expect(page.getByTestId("reel-card")).toHaveCount(0);

  expect(errors).toEqual([]);
  await ctx.close();
});

test("from New Arrivals, the card opens the listing and back returns with the reel closed", async ({ browser }) => {
  test.setTimeout(180_000);
  const f = sellers.length ? null : await fixture();
  const product = f?.product ?? sql(`select id from public.products where name = 'VC ${tag} Linen Shirt'`);
  const buyer = await freshAccount(`vcna${tag}`);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  await page.route(/rpc\/increment_video_view/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  // A rail tile shows the category and price; its picture's alt is the video's title.
  const tile = page.getByRole("button", { name: new RegExp(`VC ${tag} tagged`) }).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.tap();
  await expect(card(page)).toBeVisible();
  // The reel opens on the tapped video; its card opens the listing.
  await expect(card(page)).toContainText("View product");
  await card(page).tap();
  await expect(page).toHaveURL(new RegExp(`/product/${product}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/home\/new-arrivals$/);
  await expect(page.getByTestId("reel-card")).toHaveCount(0);
  await ctx.close();
});
