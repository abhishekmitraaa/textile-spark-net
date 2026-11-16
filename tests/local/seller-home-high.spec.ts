/**
 * Seller Home audit, the High items left after A–C (documentation/seller-home-high-fixes-plan-2026-11-16.md), on the
 * local stack.
 *
 *   LOCAL_STACK_ENV=../../.claude/tmp/local-stack-env.json LOCAL_BUYER_URL=http://localhost:8097 \
 *   LOCAL_ADMIN_URL=http://localhost:5185 npx playwright test -c playwright.local.config.ts tests/local/seller-home-high.spec.ts
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, service, sql } from "./stack";
import { PNG } from "./registrationForm";

const made: string[] = [];

test.afterEach(async () => {
  while (made.length) {
    const id = made.pop()!;
    // Storage refuses a direct delete of its rows: files go through its API.
    const files = sql(`select name from storage.objects where bucket_id = 'product-videos' and name like '${id}/%'`).split("\n").filter(Boolean);
    if (files.length) await service().storage.from("product-videos").remove(files);
    sql(`delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from admin.ad_review_log where ad_id in (select id from public.advertisements where vendor_id = '${id}');
         delete from public.advertisements where vendor_id = '${id}';
         delete from public.product_videos where vendor_id = '${id}';
         delete from public.catalogues where vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_premises_photos where vendor_id = '${id}';
         delete from public.vendor_documents where vendor_id = '${id}';
         delete from public.vendor_registrations where vendor_id = '${id}';
         delete from public.vendor_contracts where vendor_id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.buyer_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function seller(prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  return who;
}

async function open(browser: Browser, session: Parameters<typeof contextWithSession>[1], path: string): Promise<Page> {
  const ctx = await contextWithSession(browser, session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}${path}`);
  return page;
}

// ─────────────────────────── Task 1: the slideshow and Back (SH-086) ───────────────────────────

test("Back from Advertise skips the slideshow", async ({ browser }) => {
  const who = await seller("hi-slides");
  const page = await open(browser, who.session, "/seller-home");
  await page.locator('[data-testid="builtin-banner"] a[href="/advertisement-slideshow"]').first().click({ timeout: 20_000 });
  await page.waitForURL("**/advertisement-slideshow");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForURL("**/advertisements");
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/seller-home");
  await page.context().close();
});

// ─────────────────────────── Task 2: a video's cover (SH-068) ───────────────────────────

const videoFiles = (id: string) =>
  Number(sql(`select count(*) from storage.objects where bucket_id = 'product-videos' and name like '${id}/%'`));

/** Runs the app's own createProductVideo() in the page, with a small clip and the cover given. */
async function uploadVideo(page: Page, vendorId: string, cover: "png" | "corrupt"): Promise<string> {
  // No Bunny on the local stack: the clip goes to Storage, the path this fix is about.
  await page.route("**/functions/v1/bunny-upload-url", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, error: "not_configured" }) }));
  return page.evaluate(async ({ vendorId, png, cover }) => {
    const m = await import("/src/lib/queries/videos.ts" as string);
    const bytes = cover === "png" ? Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0)) : new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const video = new File([new Uint8Array(4096)], "clip.mp4", { type: "video/mp4" });
    try {
      await m.createProductVideo(vendorId, {
        file: video, thumbnail: new File([bytes], "cover.png", { type: "image/png" }), caption: "High fixes clip",
      });
      return "ok";
    } catch (e) {
      return "error: " + ((e as { message?: string })?.message ?? JSON.stringify(e));
    }
  }, { vendorId, png: PNG.toString("base64"), cover });
}

test("a PNG cover is stored as a JPEG", async ({ browser }) => {
  const who = await seller("hi-png");
  const page = await open(browser, who.session, "/upload-video");
  await expect(page.getByText("JPG, PNG or WebP · 9:16 ratio preferred")).toBeVisible({ timeout: 20_000 });
  expect(await uploadVideo(page, who.id, "png")).toBe("ok");
  const thumb = sql(`select thumbnail_url from public.product_videos where vendor_id = '${who.id}'`);
  expect(thumb).toMatch(/-thumb\.jpg$/);
  expect(sql(`select metadata ->> 'mimetype' from storage.objects where bucket_id = 'product-videos' and name like '${who.id}/%-thumb.jpg'`)).toBe("image/jpeg");
  await page.context().close();
});

test("a refused video row leaves no files", async ({ browser }) => {
  const who = await seller("hi-refused");
  const page = await open(browser, who.session, "/upload-video");
  await page.route("**/rest/v1/product_videos*", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "refused for the test" }) })
      : r.continue());
  expect(await uploadVideo(page, who.id, "png")).toContain("refused for the test");
  expect(videoFiles(who.id)).toBe(0);
  await page.context().close();
});

test("a corrupt cover is refused cleanly", async ({ browser }) => {
  const who = await seller("hi-corrupt");
  const page = await open(browser, who.session, "/upload-video");
  expect(await uploadVideo(page, who.id, "corrupt")).toContain("That picture couldn't be read. Choose a JPG, PNG or WebP.");
  expect(videoFiles(who.id)).toBe(0);
  expect(sql(`select count(*) from public.product_videos where vendor_id = '${who.id}'`)).toBe("0");
  await page.context().close();
});

// ─────────────────────────── Task 3: catalogues have no visibility choice (SH-071) ───────────────────────────

test("the catalogue form has no visibility question", async ({ browser }) => {
  const who = await seller("hi-cat");
  sql(`insert into public.catalogues (vendor_id, title, status) values ('${who.id}', 'Hi Fixes Catalogue', 'under_review');`);
  const page = await open(browser, who.session, "/upload-catalogue");
  await expect(page.getByText("Hi Fixes Catalogue")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Who can view this catalogue?")).toHaveCount(0);
  await expect(page.getByText("All Buyers")).toHaveCount(0);
  await expect(page.getByText("Verified Only")).toHaveCount(0);
  await page.context().close();
});
