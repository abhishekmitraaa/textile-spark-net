/**
 * Three fixes Mitra listed on 2026-10-16. Local stack only (stack.ts refuses anything else).
 *   1. Category pictures match their category: every tile on /categories has its own JPEG (it cycled a pool
 *      of Unsplash photos), banners are JPEG, New Arrivals' tiles are JPEG, and Cosora-Admin can still replace one.
 *   2. Reports reach Cosora-Admin, not email: a signed-out visitor is asked to sign in (no email form), and an
 *      account outside the support rollout reports fraud and sends feedback in the app; staff see both.
 *      Staff are warned when the reporter's account came from the test sign-in code (number never verified).
 *   3. Cosora-Admin's picture inputs take JPEG only: a PNG, and a PNG renamed .jpg, are refused; a JPEG saves;
 *      the bucket and its policies refuse anything else even past the app.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, clientAs, contextWithSession, freshAccount, service, setRollout, signedInContext, sql, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const TILE_JPEG = path.join(process.cwd(), "src/assets/categories/tiles/menswear/t-shirts.jpg");
// The smallest valid PNG: 1 × 1, transparent.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function allLoaded(page: Page, selector: string) {
  const imgs = page.locator(selector);
  const n = await imgs.count();
  for (let i = 0; i < n; i++) await imgs.nth(i).scrollIntoViewIfNeeded();
  await expect.poll(() => imgs.evaluateAll((els) => els.filter((e) => !(e as HTMLImageElement).complete || (e as HTMLImageElement).naturalWidth === 0).length),
    { timeout: 20_000 }).toBe(0);
  return imgs.evaluateAll((els) => els.map((e) => ({ src: (e as HTMLImageElement).currentSrc || (e as HTMLImageElement).src, slot: e.getAttribute("data-slot") ?? "" })));
}

test("1a. every Categories tile shows its own JPEG, and no picture comes from Unsplash", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const foreign: string[] = [];
  page.on("request", (r) => { if (/unsplash\.com/.test(r.url())) foreign.push(r.url()); });

  await page.goto(`${BUYER_URL}/categories`);
  const rail = page.locator("button").filter({ has: page.locator("span.w-9") });
  await expect(rail.first()).toBeVisible();
  const tops = await rail.count();
  expect(tops).toBe(11);

  let tiles = 0;
  const banners = () => page.locator('div.relative.rounded-2xl > img[data-slot^="categories/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")));
  let prev = "";
  for (let t = 0; t < tops; t++) {
    await rail.nth(t).click();
    // The panel animates out before the next one mounts: wait until only the new category's is there.
    await expect.poll(async () => { const b = await banners(); return b.length === 1 && b[0] !== prev ? "new" : b.join(","); },
      { timeout: 10_000 }).toBe("new");
    prev = (await banners())[0] ?? "";
    const [b] = await allLoaded(page, 'div.relative.rounded-2xl > img[data-slot^="categories/"]');
    // Dev serves the source path (…/banners/menswear.jpg), a build the hashed name (menswear-<hash>.jpg).
    expect(b.src, `banner ${b.slot}`).toMatch(new RegExp(`/${b.slot.split("/")[1]}(-[A-Za-z0-9_-]+)?\\.jpg$`));
    const shown = await allLoaded(page, 'span img[data-slot^="categories/"]');
    expect(shown.length).toBeGreaterThan(0);
    for (const s of shown) {
      // The file is named after its slot: categories/menswear/t-shirts → tiles/menswear/t-shirts.jpg.
      const [, top, leaf] = s.slot.split("/");
      expect(s.src, s.slot).toMatch(new RegExp(`(/tiles/${top}/${leaf}\\.jpg|/assets/${leaf}-[A-Za-z0-9_-]+\\.jpg)$`));
    }
    expect(new Set(shown.map((s) => s.src)).size, "no two tiles in a category share a picture").toBe(shown.length);
    tiles += shown.length;
  }
  expect(tiles).toBe(168);
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("1b. New Arrivals' category tiles show their category's JPEG tile", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  // Since 2026-10-17 each shows a /categories tile (one picture per category), not a slot of its own.
  const shown = await allLoaded(page, 'img[data-slot^="categories/"]');
  expect(shown.length).toBeGreaterThanOrEqual(12);
  for (const s of shown) {
    const [, top, leaf] = s.slot.split("/");
    expect(s.src, s.slot).toMatch(new RegExp(`(/tiles/${top}/${leaf}\\.jpg|/assets/${leaf}-[A-Za-z0-9_-]+\\.jpg)$`));
  }
  await ctx.close();
});

test("2a. signed out: report and feedback ask to sign in, and offer no email", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/report-fraud`);
  await expect(page.getByText("Sign in to report fraud. Your report goes straight to Cosora's team.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email this report" })).toHaveCount(0);
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

  await page.goto(`${BUYER_URL}/feedback`);
  await expect(page.getByText("Sign in to send feedback.")).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("2b. an account outside the rollout reports fraud and sends feedback in the app; staff see both", async ({ browser }) => {
  test.setTimeout(180_000);
  setRollout("off"); // as production
  try {
    const buyer = await freshAccount(`rpbuyer${tag}`);
    const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 }, true);
    const page = await ctx.newPage();
    const errors = watchErrors(page);

    await page.goto(`${BUYER_URL}/report-fraud`);
    await expect(page.getByText("Report a Potential Fraud")).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await page.locator("#fr-name").fill(`RP ${tag} Mills`);
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator("#fr-description").fill(`RP ${tag}: took an advance for 200 shirts and stopped replying.`);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Send the report" }).click();
    const done = page.getByText(/^We've recorded your report CS-\d{6}\.$/);
    await expect(done).toBeVisible({ timeout: 30_000 });
    const reportNo = (await done.innerText()).match(/CS-\d{6}/)![0];
    expect(sql(`select channel from public.support_tickets where ticket_no = '${reportNo}' and requester_id = '${buyer.id}'`)).toBe("fraud_report");

    // A follow-up in the report's own thread works too.
    await page.goto(`${BUYER_URL}/help/requests/${reportNo}`);
    await expect(page.getByText("Replying in the app isn't available yet.")).toHaveCount(0);

    await page.goto(`${BUYER_URL}/help`);
    await expect(page.getByRole("link", { name: "App feedback" })).toBeVisible();
    await page.goto(`${BUYER_URL}/feedback`);
    await page.locator("#feedback-body").fill(`RP ${tag}: the size filter resets when I go back.`);
    await page.getByRole("button", { name: "Send feedback" }).click();
    const fb = page.getByText(/^We've recorded it as CS-\d{6}\.$/);
    await expect(fb).toBeVisible({ timeout: 30_000 });
    const feedbackNo = (await fb.innerText()).match(/CS-\d{6}/)![0];
    expect(sql(`select channel from public.support_tickets where ticket_no = '${feedbackNo}'`)).toBe("feedback");
    expect(errors).toEqual([]);
    await ctx.close();

    const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
    const staff = await staffCtx.newPage();
    await staff.goto(`${ADMIN_URL}/support/fraud`);
    await expect(staff.getByText(reportNo).first()).toBeVisible({ timeout: 30_000 });
    await staff.goto(`${ADMIN_URL}/support/feedback`);
    await expect(staff.getByText(feedbackNo).first()).toBeVisible({ timeout: 30_000 });
    await staffCtx.close();
  } finally {
    setRollout("staff");
  }
});

test("2c. staff are told when a reporter's number was never verified (test sign-in code)", async ({ browser }) => {
  test.setTimeout(120_000);
  setRollout("off");
  try {
    const viaCode = await freshAccount(`rpcode${tag}`);
    sql(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"created_by":"otp-dev-verify"}' where id = '${viaCode.id}'`);
    const plain = await freshAccount(`rpplain${tag}`);
    const report = async (session: typeof viaCode.session, text: string) => {
      const ctx = await contextWithSession(browser, session);
      const page = await ctx.newPage();
      await page.goto(`${BUYER_URL}/report-fraud`);
      await page.getByRole("button", { name: "Next" }).click();
      await page.locator("#fr-description").fill(text);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Send the report" }).click();
      const done = page.getByText(/^We've recorded your report CS-\d{6}\.$/);
      await expect(done).toBeVisible({ timeout: 30_000 });
      const no = (await done.innerText()).match(/CS-\d{6}/)![0];
      await ctx.close();
      return no;
    };
    const fromCode = await report(viaCode.session, `RP ${tag}: via the test code`);
    const fromPlain = await report(plain.session, `RP ${tag}: an ordinary account`);

    const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
    const staff = await staffCtx.newPage();
    const errors = watchErrors(staff);
    await staff.goto(`${ADMIN_URL}/support/${fromCode}`);
    await expect(staff.getByText("Phone number not verified")).toBeVisible({ timeout: 30_000 });
    await staff.goto(`${ADMIN_URL}/support/${fromPlain}`);
    await expect(staff.getByText(`RP ${tag}: an ordinary account`).first()).toBeVisible({ timeout: 30_000 });
    await expect(staff.getByText("Phone number not verified")).toHaveCount(0);
    expect(errors).toEqual([]);
    await staffCtx.close();
  } finally {
    setRollout("staff");
  }
});

test("3. Cosora-Admin's pictures are JPEG only, in the app and in storage", async ({ browser }) => {
  test.setTimeout(180_000);
  const slot = "categories/womenswear/dresses";
  const before = sql(`select coalesce(image_path, '') from public.category_images where id = '${slot}'`);
  const ctx = await signedInContext(browser, "manager", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/category-pictures`);
  await page.getByLabel("Category").selectOption({ label: "Womenswear" });
  const input = page.getByLabel("Picture for Dresses");
  await expect(input).toHaveAttribute("accept", "image/jpeg,.jpg,.jpeg");

  await input.setInputFiles({ name: "tile.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/Use a JPEG picture \(\.jpg or \.jpeg\)/)).toBeVisible();
  await input.setInputFiles({ name: "renamed.jpg", mimeType: "image/jpeg", buffer: PNG });
  await expect(page.getByText(/isn't a JPEG picture/)).toBeVisible();
  expect(sql(`select coalesce(image_path, '') from public.category_images where id = '${slot}'`)).toBe(before);

  await input.setInputFiles({ name: "tile.jpg", mimeType: "image/jpeg", buffer: readFileSync(TILE_JPEG) });
  await expect(page.getByText("Picture saved for Dresses")).toBeVisible({ timeout: 30_000 });
  const saved = sql(`select image_path from public.category_images where id = '${slot}'`);
  expect(saved).toMatch(/^categories\/[0-9a-f-]{36}\.jpg$/);
  // Put the default back for the next run.
  sql(`update public.category_images set image_path = null where id = '${slot}'`);
  await service().storage.from("site-content").remove([saved]);
  await ctx.close();

  // Past the app: the bucket wants image/jpeg, the policies a .jpg name.
  const admin = await clientAs("admin");
  const bucket = admin.storage.from("site-content");
  const id = () => crypto.randomUUID();
  const png = await bucket.upload(`banners/${id()}.png`, PNG, { contentType: "image/png" });
  expect(png.error, "a PNG banner").not.toBeNull();
  const disguised = await bucket.upload(`blog/${id()}.webp`, PNG, { contentType: "image/jpeg" });
  expect(disguised.error, "a .webp name").not.toBeNull();
  const wrongType = await bucket.upload(`blog/${id()}.jpg`, PNG, { contentType: "image/png" });
  expect(wrongType.error, "a .jpg name sent as image/png").not.toBeNull();
  const okPath = `banners/${id()}.jpg`;
  const ok = await bucket.upload(okPath, readFileSync(TILE_JPEG), { contentType: "image/jpeg" });
  expect(ok.error).toBeNull();
  await bucket.remove([okPath]);
});
