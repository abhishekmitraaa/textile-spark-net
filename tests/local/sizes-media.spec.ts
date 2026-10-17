/**
 * Mitra's batch of 2026-10-17, part B. Local stack only.
 *   6. Each garment has its own sizes: a bra offers band × cup (32B…), not S–5XL; editing it offers the same;
 *      the buyer sees a size chart with the seller's sizes marked.
 *   8. The product form keeps everything it asks (unit, SKU, all colours) and really uploads its videos and PDFs;
 *      the admin's "Review details" shows all of it, and Approve works from there.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const sellers: string[] = [];

test.afterAll(() => {
  for (const s of sellers) {
    sql(`delete from public.product_videos where vendor_id = '${s}';
         delete from public.product_documents where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.products where vendor_id = '${s}';`);
  }
});

const continueTo = async (page: Page, times: number) => {
  for (let i = 0; i < times; i++) await page.getByRole("button", { name: /^Continue/ }).click();
};

/** A 1-second WebM recorded in the page (no video files in the repo, no ffmpeg here). */
async function recordWebm(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 640;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(15);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    rec.start();
    let f = 0;
    const timer = setInterval(() => { ctx.fillStyle = `hsl(${(f++ * 25) % 360} 70% 50%)`; ctx.fillRect(0, 0, 360, 640); }, 60);
    await new Promise((r) => setTimeout(r, 1000));
    rec.stop();
    await stopped;
    clearInterval(timer);
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let s = "";
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const PNG_AS_PDF = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("a bra listing: band × cup sizes, its video and PDF stored, everything in the admin's review, a size chart", async ({ browser }) => {
  test.setTimeout(240_000);
  const seller = await freshAccount(`szsell${tag}`, { seller: true });
  sellers.push(seller.id);
  const name = `SZ ${tag} Lace T-shirt bra`;
  const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  // No Bunny keys locally: the upload falls back to Supabase storage, as it does in production without them.
  await page.route(/functions\/v1\/bunny-upload-url/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "not_configured" }) }));

  // ── The form: Apparel › Bras offers band × cup, not letters.
  await page.goto(`${BUYER_URL}/upload`);
  await page.getByRole("button", { name: /Apparel & Home/ }).first().click();
  await continueTo(page, 1);
  await page.getByRole("button", { name: "Bras", exact: true }).first().click();
  await continueTo(page, 1);
  await expect(page.getByRole("button", { name: "32B", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "5XL", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "32B", exact: true }).click();
  await page.getByRole("button", { name: "34C", exact: true }).click();
  await page.locator("#name").fill(name);
  await page.locator("#sku").fill(`SKU-${tag}`);
  await continueTo(page, 1);

  // ── Images step: a picture, a PDF (a fake one is refused), a video.
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "bra.jpg", mimeType: "image/jpeg", buffer: Buffer.from(await (await fetch(`${BUYER_URL}/og-image.jpg`)).arrayBuffer()) });
  await page.getByTestId("product-pdf-input").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: PNG_AS_PDF });
  await expect(page.getByText("fake.pdf isn't a real PDF.")).toBeVisible();
  await page.getByTestId("product-pdf-input").setInputFiles({ name: "Size and spec sheet.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText(/Size and spec sheet\.pdf/)).toBeVisible();
  const webm = await recordWebm(page);
  await page.getByTestId("product-video-input").setInputFiles({ name: "clip.webm", mimeType: "video/webm", buffer: webm });
  await expect(page.getByText(/clip\.webm ·/)).toBeVisible({ timeout: 15_000 });
  await continueTo(page, 1);

  // ── Pricing: price and unit; save.
  await page.locator("#price").fill("185");
  await page.locator("#unit").click().catch(async () => page.getByText("Select unit").click());
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await expect(page).toHaveURL(/\/products$/, { timeout: 90_000 });

  const id = sql(`select id from public.products where name = '${name}'`);
  expect(sql(`select array_to_string(sizes, ',') || '|' || (attributes ->> 'sku') || '|' || coalesce(unit, '-') from public.products where id = '${id}'`))
    .toMatch(new RegExp(`^32B,34C\\|SKU-${tag}\\|[a-z]+$`));
  expect(sql(`select name || '|' || size_bytes from public.product_documents where product_id = '${id}'`)).toBe(`Size and spec sheet.pdf|${PDF.length}`);
  expect(sql(`select count(*) from storage.objects o join public.product_documents d on d.path = o.name where o.bucket_id = 'product-files' and d.product_id = '${id}'`)).toBe("1");
  expect(sql(`select status || '|' || (video_url is not null) from public.product_videos where product_id = '${id}'`)).toBe("under_review|true");

  // ── Editing it offers its own sizes, not XS–XXXL.
  await page.goto(`${BUYER_URL}/upload?id=${id}`);
  await expect(page.locator("#name")).toHaveValue(name);
  await continueTo(page, 2);
  await expect(page.getByRole("button", { name: /^34C/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^30A/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^XXXL/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();

  // ── The admin's review shows everything, and approves from there.
  sql(`update public.products set status = 'under_review', description = 'Seamless lace, 3-hook back.', colour = 'Black',
         attributes = attributes || '{"colours": ["Black", "Nude", "Wine"]}'::jsonb where id = '${id}'`);
  const actx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await actx.newPage();
  const aerrors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/products`);
  const card = admin.locator("div.space-y-3 > *").filter({ has: admin.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "Review details" }).click();
  const details = admin.getByTestId("product-details");
  await expect(details).toBeVisible({ timeout: 30_000 });
  for (const text of ["Apparel & Home Categories › Bras", "₹185", "Seamless lace, 3-hook back.", "32B, 34C", `SKU-${tag}`, "Black, Nude, Wine", "Size and spec sheet.pdf"]) {
    await expect(details).toContainText(text);
  }
  await expect(details.locator("video")).toHaveCount(1);
  await expect(details.locator("img")).toHaveCount(1);
  await details.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => sql(`select status from public.products where id = '${id}'`)).toBe("live");
  expect(aerrors).toEqual([]);
  await actx.close();

  // ── The buyer: a size chart with the bands offered marked, and the PDF under the specifications.
  const bctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const buyer = await bctx.newPage();
  await buyer.goto(`${BUYER_URL}/product/${id}`);
  await buyer.getByRole("button", { name: "Size chart" }).click();
  const chart = buyer.getByTestId("size-chart");
  await expect(chart).toContainText("Bras (band and cup)");
  await expect(chart.locator('tr[data-offered="true"]')).toHaveCount(2); // bands 32 and 34
  await buyer.keyboard.press("Escape");
  await buyer.getByRole("button", { name: "Product Specifications" }).click();
  await expect(buyer.getByTestId("product-documents")).toContainText("Size and spec sheet.pdf");
  await bctx.close();
});
