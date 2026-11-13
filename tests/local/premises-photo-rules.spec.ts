/**
 * Business Profile on the local stack: premises photos and the banner take the registration's pictures (JPEG, PNG or
 * WebP up to 5 MB) and premises photos are shrunk before upload (onboarding audit #32).
 */
import { deflateSync, crc32 } from "node:zlib";
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

/** A plain PNG of the given size (one colour; small on disk, large in pixels). */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3, 0);
  for (let x = 0; x < width; x++) row.set([37, 111, 239], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("premises photos: a GIF and a 6 MB file are refused by name, a large photo is shrunk to 1600 px", async ({ browser }) => {
  test.setTimeout(90_000);
  const who = await freshAccount("pp-rules", { seller: true });
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/business-profile`);
  const photos = page.locator('input[type="file"][aria-label="Add premises photos"]');
  await expect(photos).toBeAttached({ timeout: 15_000 });

  await photos.setInputFiles([
    { name: "spinner.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") },
    { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(6 * 1024 * 1024, 1) },
    { name: "floor.png", mimeType: "image/png", buffer: png(2400, 1800) },
  ]);
  await expect(page.getByText("Use a JPEG, PNG or WebP picture")).toBeVisible();
  await expect(page.getByText("huge.png is over 5 MB")).toBeVisible();
  await expect(page.getByText("Photo sent for review")).toBeVisible({ timeout: 20_000 });

  expect(sql(`select count(*) from public.vendor_premises_photos where vendor_id = '${who.id}';`)).toBe("1");
  const url = sql(`select url from public.vendor_premises_photos where vendor_id = '${who.id}';`);
  const width = await page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    return img.naturalWidth;
  }, url);
  expect(width).toBe(1600);
  await ctx.close();
});

test("the banner refuses a GIF and keeps the banner it had", async ({ browser }) => {
  const who = await freshAccount("pp-banner", { seller: true });
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/business-profile`);
  const banner = page.getByLabel("Banner picture");
  await expect(banner).toBeAttached({ timeout: 15_000 });
  await banner.setInputFiles({ name: "banner.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(page.getByText("Use a JPEG, PNG or WebP picture")).toBeVisible();
  expect(sql(`select coalesce(banner_url, 'none') from public.vendor_profiles where id = '${who.id}';`)).toBe("none");
  await ctx.close();
});
