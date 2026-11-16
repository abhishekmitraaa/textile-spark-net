/**
 * Seller Home audit, the High items left after A–C (documentation/seller-home-high-fixes-plan-2026-11-16.md), on the
 * local stack.
 *
 *   LOCAL_STACK_ENV=../../.claude/tmp/local-stack-env.json LOCAL_BUYER_URL=http://localhost:8097 \
 *   LOCAL_ADMIN_URL=http://localhost:5185 npx playwright test -c playwright.local.config.ts tests/local/seller-home-high.spec.ts
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, service, signedInContext, sql } from "./stack";
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

// ─────────────────────────── Task 4: the chat header (SH-100) ───────────────────────────

test("a chat header invents nothing", async ({ browser }) => {
  const who = await seller("hi-hdr");
  const buyer = await freshAccount("hi-hdr-b");
  made.push(buyer.id);
  sql(`update public.profiles set full_name = 'Hdr Buyer' where id = '${buyer.id}';
       with c as (insert into public.conversations (user_a, user_b)
                  values (least('${who.id}'::uuid, '${buyer.id}'::uuid), greatest('${who.id}'::uuid, '${buyer.id}'::uuid)) returning id)
       insert into public.messages (conversation_id, sender_id, body) select id, '${buyer.id}', 'Do you make polo shirts?' from c;`);
  const page = await open(browser, who.session, `/chats/${buyer.id}`);
  const header = page.getByTestId("chat-header");
  await expect(header).toContainText("Hdr Buyer", { timeout: 20_000 });
  await expect(page.getByText("Do you make polo shirts?")).toBeVisible();
  await expect(page.getByTestId("chat-header-avatar")).toHaveText("HB");
  // No rating, presence, place or request that nothing stores.
  await expect(header).not.toContainText("4.6");
  await expect(header).not.toContainText("Offline");
  await expect(header).not.toContainText("India");
  await expect(page.getByText("RFQ-NEW")).toHaveCount(0);
  await expect(page.getByText("New enquiry")).toHaveCount(0);
  await page.context().close();
});

// ─────────────────────────── Task 8: ad days (SH-088) ───────────────────────────

test("campaign cards tell the truth about days", async ({ browser }) => {
  const who = await seller("hi-ads");
  sql(`insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at, daily_budget, paused_at) values
         ('${who.id}', 'Hi Waiting Ad', 'openListing', 'pending_review', now() - interval '5 days', now() - interval '2 days', 22, null),
         ('${who.id}', 'Hi Paused Ad', 'openListing', 'paused_by_vendor', now() - interval '6 days', now() - interval '1 day', 22, now() - interval '5 days'),
         ('${who.id}', 'Hi Paused Seal', 'trustedSeal', 'paused_by_vendor', now() - interval '2 days', now() + interval '5 days', 44, now() - interval '1 day');`);
  const page = await open(browser, who.session, "/advertisements");
  const card = (title: string) => page.locator("div.rounded-xl.border", { hasText: title }).last();

  // Paid five days ago for three days, still in review: nothing has run out.
  await expect(card("Hi Waiting Ad")).toContainText("Waiting for review", { timeout: 20_000 });
  await expect(card("Hi Waiting Ad")).toContainText("Your paid time (3 days) starts when it is approved.");

  // A seal keeps running while paused, and says so.
  await expect(card("Hi Paused Seal")).toContainText("The seal's days keep running while it is paused.");

  // Paused past its end date, but the pause began with four days left: not finished, and Resume gives them back.
  await expect(card("Hi Paused Ad")).toContainText("Its remaining days are kept until you resume.");
  await expect(card("Hi Paused Ad")).not.toContainText("Finished");
  await card("Hi Paused Ad").getByRole("button", { name: "Resume" }).click();
  await expect(card("Hi Paused Ad")).toContainText("Live", { timeout: 15_000 });
  const left = Number(sql(`select round(extract(epoch from ends_at - now()) / 86400.0, 2) from public.advertisements where vendor_id = '${who.id}' and title = 'Hi Paused Ad'`));
  expect(left).toBeGreaterThan(3.95);
  expect(left).toBeLessThan(4.05);
  await page.context().close();
});

test("a campaign reviewed late is approved for its full days", async ({ browser }) => {
  const who = await seller("hi-late");
  const title = `Hi Late Ad ${Date.now().toString(36)}`;
  sql(`insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at, daily_budget)
       values ('${who.id}', '${title}', 'openListing', 'pending_review', now() - interval '5 days', now() - interval '2 days', 22);`);
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/ads`);
  const card = page.locator("div", { has: page.getByRole("heading", { name: title }) }).filter({ has: page.getByRole("button", { name: "Approve" }) }).last();
  await expect(card.getByRole("heading", { name: title })).toBeVisible({ timeout: 20_000 });
  // Paid five days ago for three days: not "already ended", and Approve works.
  await expect(card).not.toContainText("already ended");
  await card.getByRole("button", { name: "Show creative, targeting and history" }).click();
  await expect(card).toContainText("3 days from approval");
  await expect(card.getByRole("button", { name: "Approve" })).toBeEnabled();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved — now live")).toBeVisible({ timeout: 15_000 });
  const row = sql(`select status || '|' || round(extract(epoch from ends_at - now()) / 86400.0, 2) from public.advertisements where title = '${title}'`).split("|");
  expect(row[0]).toBe("active");
  expect(Number(row[1])).toBeGreaterThan(2.95);
  expect(Number(row[1])).toBeLessThan(3.05);
  await ctx.close();
});

// ─────────────────────────── Task 9: Edit and resubmit (SH-089) ───────────────────────────

/** A seller with a live listing (two pictures) and a campaign Cosora sent back. */
async function campaignSentBack(prefix: string) {
  const who = await seller(prefix);
  const pic = (n: number) => `http://127.0.0.1:54321/storage/v1/object/public/product-images/${who.id}/hi-${n}.jpg`;
  const product = sql(`insert into public.products (vendor_id, name, status, price_value) values ('${who.id}', 'Hi Polo Shirt', 'live', 250) returning id`).split("\n")[0];
  sql(`insert into public.product_images (product_id, url, position) values ('${product}', '${pic(1)}', 0), ('${product}', '${pic(2)}', 1);
       insert into public.advertisements (vendor_id, product_id, title, image_url, placement, status, starts_at, ends_at, daily_budget, moderation_reason, moderated_at)
       values ('${who.id}', '${product}', 'Hi Old Title', '${pic(1)}', 'openListing', 'changes_requested', now() - interval '2 days', now() + interval '1 day', 22,
               'poor_creative Use a clearer photo', now());`);
  return { who, pic };
}

test("a seller edits and resubmits a campaign", async ({ browser }) => {
  const { who, pic } = await campaignSentBack("hi-edit");
  const page = await open(browser, who.session, "/advertisements");
  const card = page.locator("div.rounded-xl.border", { hasText: "Hi Old Title" }).last();
  await expect(card).toContainText("Changes needed", { timeout: 20_000 });
  await card.getByRole("button", { name: "Edit and resubmit" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Image or copy quality");
  await expect(dialog).toContainText("Use a clearer photo");
  await dialog.getByLabel("Title").fill("Hi New Title");
  await dialog.getByRole("button", { name: "Use picture 2" }).click();
  await dialog.getByRole("button", { name: "Resubmit for review" }).click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("div.rounded-xl.border", { hasText: "Hi New Title" }).last()).toContainText("Waiting for review");
  const row = sql(`select status || '|' || title || '|' || image_url from public.advertisements where vendor_id = '${who.id}'`).split("|");
  expect(row).toEqual(["pending_review", "Hi New Title", pic(2)]);
  expect(sql(`select decision || '>' || new_status from admin.ad_review_log l join public.advertisements a on a.id = l.ad_id
               where a.vendor_id = '${who.id}' order by l.created_at desc limit 1`)).toBe("resubmitted>pending_review");
  await page.context().close();
});

test("a campaign can't be resubmitted without a title", async ({ browser }) => {
  const { who } = await campaignSentBack("hi-edit2");
  const page = await open(browser, who.session, "/advertisements");
  const card = page.locator("div.rounded-xl.border", { hasText: "Hi Old Title" }).last();
  await card.getByRole("button", { name: "Edit and resubmit" }).click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Title")).toHaveValue("Hi Old Title");
  await dialog.getByLabel("Title").fill("   ");
  await expect(dialog.getByRole("button", { name: "Resubmit for review" })).toBeDisabled();
  // Closing without saving changes nothing.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(sql(`select status || '|' || title from public.advertisements where vendor_id = '${who.id}'`)).toBe("changes_requested|Hi Old Title");
  await page.context().close();
});
