/**
 * Video Close-Ups: Share works, and a shared link opens on its video (2026-10-14).
 * The viewer's Share button did nothing. Now it opens the share sheet above the
 * full-screen viewer, with a link to /video-closeups?v=<id>, and that link opens
 * the reel on that video, also when it's outside the feed's first 30.
 * Local stack only.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, freshAccount, sql } from "./stack";

const tag = Date.now().toString(36);
let seller = "";

test.afterAll(() => {
  if (seller) sql(`delete from public.product_videos where vendor_id = '${seller}';`);
});

test("Share opens above the viewer, and its link opens the reel on that video", async ({ browser }) => {
  test.setTimeout(120_000);
  seller = (await freshAccount(`vshare${tag}`, { seller: true })).id;
  // 31 popular videos fill the feed's first page; the 32nd has no views, so it's only reachable by its link.
  sql(`insert into public.product_videos (vendor_id, category, brand_line, price, status, views_count, thumbnail_url)
       select '${seller}', 'Shirts', 'VS ${tag} ' || g, '₹' || (100 + g), 'live', 100000 + g, '${BUYER_URL}/icon-192.png'
         from generate_series(1, 31) g;
       insert into public.product_videos (vendor_id, category, brand_line, price, status, views_count, thumbnail_url)
       values ('${seller}', 'Shirts', 'VS ${tag} hidden', '₹99', 'live', 0, '${BUYER_URL}/icon-192.png');`);
  const top = sql(`select id from public.product_videos where vendor_id = '${seller}' order by views_count desc limit 1`);
  const hidden = sql(`select id from public.product_videos where brand_line = 'VS ${tag} hidden'`);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BUYER_URL });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/rpc\/increment_video_view/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "null" }));

  // Share on the first slide.
  await page.goto(`${BUYER_URL}/video-closeups`);
  await expect(page.getByText(`VS ${tag} 31`).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Share", exact: true }).first().click();
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible();
  // Above the viewer: the sheet, not the video, is what a tap at its centre reaches.
  const onTop = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(onTop).toBe(true);
  const link = `${BUYER_URL}/video-closeups?v=${top}`;
  await expect(sheet.locator('[data-share="whatsapp"]')).toHaveAttribute("href", new RegExp(encodeURIComponent(link).replace(/[.?*+^$()|[\]\\]/g, "\\$&")));
  await sheet.locator('[data-share="copy"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/video-share-sheet.png" });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share", exact: true }).first()).toBeVisible(); // the viewer stayed open

  // A link to a video outside the first 30 opens on it.
  await page.goto(`${BUYER_URL}/video-closeups?v=${hidden}`);
  const first = page.locator("[data-index='0']");
  await expect(first.getByText(`VS ${tag} hidden`)).toBeVisible({ timeout: 30_000 });
  // An id that isn't a live video just opens the feed.
  await page.goto(`${BUYER_URL}/video-closeups?v=00000000-0000-0000-0000-000000000000`);
  await expect(page.locator("[data-index='0']").getByText(`VS ${tag} 31`)).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});
