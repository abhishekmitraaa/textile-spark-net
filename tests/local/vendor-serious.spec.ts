/**
 * The 2026-10-21 vendor audit's serious list (migration 20261021100000). Local stack only; needs the buyer app.
 *   #1 Adding photos while editing a listing keeps the photos it already has.
 *   #2 Removing a photo in the edit form removes that photo, and keeps a newly added one.
 *   #3 A picture an approved listing, catalogue or video uses can't be overwritten or replaced in Storage, and a
 *      listing can't link one of Cosora's files by a second spelling of its address.
 *   #4 The public product-images, avatars and catalogues buckets take only their own file types and sizes.
 *   #5 A seller can't quote their own requirement, and doesn't see it among their leads.
 */
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUYER_URL, clientAs, contextWithSession, freshAccount, sql, stack } from "./stack";
import { createClient } from "@supabase/supabase-js";

const tag = Date.now().toString(36);
// Distinct small PNGs: the same 1×1 picture with a different tail, so each one's bytes can be told apart.
const BASE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (label: string) => Buffer.concat([BASE_PNG, Buffer.from(label)]);
const sha = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

function clientFor(session: { access_token: string }): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A fresh seller with one draft listing whose two photos are already in Storage. */
async function sellerWithListing(prefix: string) {
  const seller = await freshAccount(`${prefix}${tag}`, { seller: true });
  const db = clientFor(seller.session);
  const pid = sql(`insert into public.products (vendor_id, name, status, price_value, moq)
                   values ('${seller.id}', 'VS ${tag} ${prefix}', 'draft', 250, '10') returning id`).match(/[0-9a-f-]{36}/)![0];
  const originals = [png(`orig-0-${prefix}`), png(`orig-1-${prefix}`)];
  const urls: string[] = [];
  for (let i = 0; i < 2; i++) {
    const path = `${seller.id}/${pid}/${i}.png`;
    const { error } = await db.storage.from("product-images").upload(path, originals[i], { contentType: "image/png" });
    if (error) throw error;
    urls.push(db.storage.from("product-images").getPublicUrl(path).data.publicUrl);
  }
  sql(`insert into public.product_images (product_id, url, position)
       values ('${pid}', '${urls[0]}', 0), ('${pid}', '${urls[1]}', 1)`);
  return { seller, db, pid, originals, urls };
}

async function bytesAt(url: string): Promise<string> {
  const res = await fetch(`${url}?nocache=${Date.now()}`);
  return sha(Buffer.from(await res.arrayBuffer()));
}

function listingUrls(pid: string): string[] {
  const out = sql(`select coalesce(string_agg(url, '|' order by position), '') from public.product_images where product_id = '${pid}'`);
  return out ? out.split("|") : [];
}

async function openImagesStep(browser: import("@playwright/test").Browser, session: import("@supabase/supabase-js").Session, pid: string) {
  const ctx = await contextWithSession(browser, session, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/upload?id=${pid}`);
  await expect(page.locator('img[alt="Image 2"]')).toBeVisible({ timeout: 30_000 }).catch(async () => {
    // The edit form opens on Details; the photos are one step on.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator('img[alt="Image 2"]')).toBeVisible({ timeout: 30_000 });
  });
  return { ctx, page };
}

async function saveChanges(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(/\/products$/, { timeout: 30_000 });
}

test("#1 adding a photo while editing keeps the listing's existing photos", async ({ browser }) => {
  test.setTimeout(120_000);
  const { seller, pid, originals, urls } = await sellerWithListing("vs1");
  const { ctx, page } = await openImagesStep(browser, seller.session, pid);
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "added.png", mimeType: "image/png", buffer: png("added-1") });
  await expect(page.locator('img[alt="Image 3"]')).toBeVisible();
  await saveChanges(page);

  // The two stored photos are byte-for-byte what they were: the new one went to a path of its own.
  expect(await bytesAt(urls[0])).toBe(sha(originals[0]));
  expect(await bytesAt(urls[1])).toBe(sha(originals[1]));
  const after = listingUrls(pid);
  expect(after).toHaveLength(3);
  expect(new Set(after).size).toBe(3);
  expect(after.slice(0, 2)).toEqual(urls);
  expect(await bytesAt(after[2])).toBe(sha(png("added-1")));
  await ctx.close();
});

test("#2 removing an existing photo in the edit form removes it and keeps the new one", async ({ browser }) => {
  test.setTimeout(120_000);
  const { seller, pid, urls } = await sellerWithListing("vs2");
  const { ctx, page } = await openImagesStep(browser, seller.session, pid);
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "added.png", mimeType: "image/png", buffer: png("added-2") });
  await expect(page.locator('img[alt="Image 3"]')).toBeVisible();
  // Remove the first (existing) photo.
  await page.locator('img[alt="Image 1"]').locator("xpath=..").locator("button").click();
  await expect(page.locator('img[alt="Image 3"]')).toHaveCount(0);
  await saveChanges(page);

  const after = listingUrls(pid);
  expect(after).toHaveLength(2);
  expect(after).not.toContain(urls[0]);
  expect(after[0]).toBe(urls[1]);
  expect(await bytesAt(after[1])).toBe(sha(png("added-2")));
  await ctx.close();
});

test("#3 a photo a listing uses can't be overwritten or replaced in Storage", async () => {
  const { seller, db, pid, originals, urls } = await sellerWithListing("vs3");
  sql(`update public.products set status = 'live' where id = '${pid}'`);
  const path0 = `${seller.id}/${pid}/0.png`;

  // Overwrite in place (upsert).
  const over = await db.storage.from("product-images").upload(path0, png("swapped"), { upsert: true, contentType: "image/png" });
  expect(over.error, "overwrite of a listing's photo").not.toBeNull();
  // Remove, then upload again at the same path.
  await db.storage.from("product-images").remove([path0]);
  const again = await db.storage.from("product-images").upload(path0, png("swapped"), { contentType: "image/png" });
  expect(again.error, "re-upload at a listing photo's path").not.toBeNull();
  expect(sql(`select status from public.products where id = '${pid}'`)).toBe("live");
  // The second photo is untouched; nothing new is served at the first path.
  expect(await bytesAt(urls[1])).toBe(sha(originals[1]));
  const res = await fetch(`${urls[0]}?nocache=${Date.now()}`);
  if (res.ok) expect(sha(Buffer.from(await res.arrayBuffer()))).not.toBe(sha(png("swapped")));

  // A listing can't point at one of Cosora's files by a second spelling of its address (a query, a fragment,
  // percent-encoding, a dot segment, the render endpoint): the in-use check matches the plain address, so the
  // file behind such a link could be overwritten after review. Outside links (a CSV import's) still work.
  const free1 = `${seller.id}/${pid}/free.png`;
  expect((await db.storage.from("product-images").upload(free1, png("free"), { contentType: "image/png" })).error).toBeNull();
  const plain = db.storage.from("product-images").getPublicUrl(free1).data.publicUrl;
  const spellings = [
    `${plain}?v=1`, `${plain}#x`, plain.replace("free.png", "fre%65.png"), plain.replace(`/${pid}/`, `/${pid}/./`),
    plain.replace("/object/public/", "/render/image/public/"), plain.replace("/storage/v1/", "/STORAGE/v1/"),
    // Spellings a browser or the server normalises (second security review): backslashes are slashes, tabs
    // and newlines are dropped, percent-encoding is decoded.
    `${new URL(plain).origin}${new URL(plain).pathname.split("/").join("\\")}?v=1`,
    `${plain.replace("/storage/", "/stor\tage/")}?v=1`,
    `${plain.replace("/storage/", "/st\norage/")}?v=1`,
    `${plain.replace("/storage/", "/%73torage/")}?v=1`,
    `${plain.replace("/storage/", "/%2573torage/")}?v=1`,
    `${plain.replace("/storage/v1/", "/storage%2Fv1/")}?v=1`,
  ];
  for (const url of spellings) {
    const r = await db.from("product_images").insert({ product_id: pid, url, position: 9 });
    expect(r.error, `listing photo link ${url}`).not.toBeNull();
  }
  expect((await db.from("product_images").insert({ product_id: pid, url: "https://images.example.com/a.jpg", position: 9 })).error,
    "outside link").toBeNull();
  sql(`delete from public.product_images where product_id = '${pid}' and position = 9`);

  // Another seller can't put this seller's file on their own listing (a stolen photo, which also froze the
  // owner's file as "in use").
  const other = await sellerWithListing("vs3b");
  const stolen = await other.db.from("product_images").insert({ product_id: other.pid, url: plain, position: 9 });
  expect(stolen.error, "another seller's file on a listing").not.toBeNull();
  expect((await db.storage.from("product-images").upload(free1, png("free-2"), { upsert: true, contentType: "image/png" })).error,
    "the owner can still replace a file no listing of theirs uses").toBeNull();

  // A picture no listing uses (a store logo, say) can still be replaced.
  const free = `${seller.id}/store/logo-${tag}.png`;
  expect((await db.storage.from("product-images").upload(free, png("logo-a"), { contentType: "image/png" })).error).toBeNull();
  expect((await db.storage.from("product-images").upload(free, png("logo-b"), { upsert: true, contentType: "image/png" })).error).toBeNull();

  // A catalogue's PDF, once a catalogue uses it, can't be overwritten either.
  const cpath = `${seller.id}/${tag}.pdf`;
  const pdf = Buffer.from("%PDF-1.4\n%audit\n");
  expect((await db.storage.from("catalogues").upload(cpath, pdf, { contentType: "application/pdf" })).error).toBeNull();
  const curl = db.storage.from("catalogues").getPublicUrl(cpath).data.publicUrl;
  sql(`insert into public.catalogues (vendor_id, title, file_url, status) values ('${seller.id}', 'VS ${tag}', '${curl}', 'live')`);
  const cover = await db.storage.from("catalogues").upload(cpath, Buffer.from("%PDF-1.4\n%swapped\n"), { upsert: true, contentType: "application/pdf" });
  expect(cover.error, "overwrite of a catalogue's PDF").not.toBeNull();
});

test("#4 the public buckets take only their own file types and sizes", async () => {
  const buyer = await clientAs("buyer");
  const uid = (await buyer.auth.getUser()).data.user!.id;
  const put = (bucket: string, name: string, body: Buffer, contentType: string) =>
    buyer.storage.from(bucket).upload(`${uid}/vs4-${tag}-${name}`, body, { contentType, upsert: true });
  const big = Buffer.alloc(11 * 1024 * 1024, 1);

  // Pictures are still fine.
  for (const bucket of ["product-images", "avatars"]) {
    const ok = await put(bucket, "ok.png", png("ok"), "image/png");
    expect(ok.error, `${bucket} png`).toBeNull();
    expect((await put(bucket, "page.html", Buffer.from("<h1>x</h1>"), "text/html")).error, `${bucket} html`).not.toBeNull();
    expect((await put(bucket, "blob.bin", Buffer.from("x"), "application/octet-stream")).error, `${bucket} binary`).not.toBeNull();
    expect((await put(bucket, "big.jpg", big, "image/jpeg")).error, `${bucket} 11 MB`).not.toBeNull();
    await buyer.storage.from(bucket).remove([`${uid}/vs4-${tag}-ok.png`]);
  }
  // Catalogues: PDFs and cover pictures, up to 20 MB.
  expect((await put("catalogues", "c.pdf", Buffer.from("%PDF-1.4\n"), "application/pdf")).error).toBeNull();
  expect((await put("catalogues", "c.png", png("cover"), "image/png")).error).toBeNull();
  expect((await put("catalogues", "c.html", Buffer.from("<h1>x</h1>"), "text/html")).error).not.toBeNull();
  expect((await put("catalogues", "c-big.pdf", Buffer.alloc(21 * 1024 * 1024, 1), "application/pdf")).error).not.toBeNull();
  await buyer.storage.from("catalogues").remove([`${uid}/vs4-${tag}-c.pdf`, `${uid}/vs4-${tag}-c.png`]);
});

test("#5 a seller can't quote their own requirement and doesn't see it in Leads", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`vs5${tag}`, { seller: true });
  const title = `VS ${tag} own requirement`;
  const rid = sql(`insert into public.rfqs (buyer_id, title, product_name, quantity, status, expires_at)
                   values ('${seller.id}', '${title}', '${title}', 100, 'active', now() + interval '7 days') returning id`).match(/[0-9a-f-]{36}/)![0];
  const db = clientFor(seller.session);
  const q = await db.from("quotes").insert({ rfq_id: rid, vendor_id: seller.id, price_per_unit: 50, currency: "INR" });
  expect(q.error, "quote on own requirement").not.toBeNull();
  expect(sql(`select count(*) from public.quotes where rfq_id = '${rid}'`)).toBe("0");

  const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/leads`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(title)).toHaveCount(0);
  await ctx.close();
  sql(`delete from public.rfqs where id = '${rid}'`);
});
