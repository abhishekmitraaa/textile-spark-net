/**
 * The rest of the 2026-10-21 vendor audit (migration 20261021130000). Local stack only; needs the buyer app.
 *   #11 A seller is told when Cosora approves or rejects a listing, video or catalogue (once, with the reason),
 *       and Products shows a rejected listing as Rejected, with the reason (was "Draft", todo.md).
 *   #12 The quote form starts empty on another lead.
 *   #14 A seller's "Download your data" has their store, listings, quotes sent, catalogues and videos.
 *   Low: a revised quote's "Last updated" is its revision date; a SKU can be cleared; buyer-written text on
 *       Quotes isn't machine-translated; Delete on Products asks first.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { BUYER_URL, clientAs, contextWithSession, freshAccount, sql, stack } from "./stack";

const tag = Date.now().toString(36);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const id = (out: string) => out.match(UUID)![0];

function clientFor(session: { access_token: string }): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function openAs(browser: Browser, session: Session, path: string, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const ctx = await contextWithSession(browser, session, viewport);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}${path}`);
  return page;
}

function product(vendor: string, name: string, status = "under_review"): string {
  return id(sql(`insert into public.products (vendor_id, name, status, price_value, moq)
                 values ('${vendor}', '${name}', '${status}', 200, '10') returning id`));
}

const notes = (vendor: string) =>
  sql(`select coalesce(string_agg(kind || '|' || coalesce(body, ''), E'\\n' order by created_at), '') from public.notifications where profile_id = '${vendor}'`);

test("#11 a seller is told when a listing, video or catalogue is approved or rejected", async () => {
  const seller = await freshAccount(`r11${tag}`, { seller: true });
  const admin = await clientAs("admin");
  const ok = product(seller.id, `R11 ${tag} approved`);
  const bad = product(seller.id, `R11 ${tag} rejected`);
  // As Cosora-Admin's moderation does it (lib/moderation.ts): a status update guarded on the status it saw.
  expect((await admin.from("products").update({ status: "live", rejection_reason: null }).eq("id", ok).eq("status", "under_review").select("id")).data).toHaveLength(1);
  expect((await admin.from("products").update({ status: "rejected", rejection_reason: "Photos are blurry." }).eq("id", bad).eq("status", "under_review").select("id")).data).toHaveLength(1);

  const cat = id(sql(`insert into public.catalogues (vendor_id, title, status) values ('${seller.id}', 'R11 ${tag} catalogue', 'under_review') returning id`));
  expect((await admin.from("catalogues").update({ status: "rejected", rejection_reason: "Prices missing." }).eq("id", cat).select("id")).data).toHaveLength(1);
  const vid = id(sql(`insert into public.product_videos (vendor_id, category, video_url, status)
                      values ('${seller.id}', 'Fashion', 'https://video.example.com/${tag}.mp4', 'under_review') returning id`));
  expect((await admin.from("product_videos").update({ status: "live" }).eq("id", vid).select("id")).data).toHaveLength(1);

  // A removal already tells the seller itself (admin_product_remove): still one notice, not two.
  const removed = product(seller.id, `R11 ${tag} removed`, "live");
  const reason = sql(`select id from admin.product_moderation_reasons where active and 'remove' = any (applies_to) limit 1`);
  const rm = await admin.rpc("admin_product_remove", { p_product_id: removed, p_reason_id: reason, p_note: null });
  if (rm.error) throw rm.error;

  const got = notes(seller.id);
  expect(got).toContain(`product_approved|"R11 ${tag} approved"`);
  expect(got).toMatch(new RegExp(`product_rejected\\|"R11 ${tag} rejected".*Photos are blurry\\.`));
  expect(got).toMatch(/catalogue_rejected\|.*Prices missing\./);
  expect(got).toContain("video_approved|");
  expect(got.split("\n").filter((l) => l.includes(`R11 ${tag} removed`))).toHaveLength(1);
  // Leave nothing live in the shared feeds (the video's address doesn't resolve).
  sql(`delete from public.product_videos where id = '${vid}';
       delete from public.catalogues where id = '${cat}';
       delete from public.products where vendor_id = '${seller.id}';`);
});

test("#11b Products shows a rejected listing as Rejected, with the reason", async ({ browser }) => {
  const seller = await freshAccount(`r11b${tag}`, { seller: true });
  const pid = product(seller.id, `R11b ${tag} kurta`);
  sql(`update public.products set status = 'rejected', rejection_reason = 'Add the fabric weight.' where id = '${pid}'`);
  const page = await openAs(browser, seller.session, "/products");
  const row = page.locator("div").filter({ hasText: `R11b ${tag} kurta` }).filter({ hasText: "Rejected" }).last();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText("Add the fabric weight.");
  await page.context().close();
});

test("#12 the quote form starts empty on another lead", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`r12${tag}`, { seller: true });
  const buyer = await freshAccount(`r12b${tag}`);
  for (const t of ["A", "B"]) {
    sql(`insert into public.rfqs (buyer_id, title, product_name, quantity, status, expires_at)
         values ('${buyer.id}', 'R12 ${tag} lead ${t}', 'R12 ${tag} lead ${t}', 100, 'active', now() + interval '7 days')`);
  }
  const page = await openAs(browser, seller.session, "/leads");
  const card = (t: string) => page.locator("div").filter({ has: page.getByText(`R12 ${tag} lead ${t}`, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /Submit Quote|Send Quote/ }) }).last();
  const viewAll = page.getByRole("button", { name: /View all|Show all|See all/ });
  await expect(page.getByText(`R12 ${tag} lead A`, { exact: true }).or(viewAll.first())).toBeVisible({ timeout: 30_000 });
  if (!(await page.getByText(`R12 ${tag} lead A`, { exact: true }).isVisible())) await viewAll.first().click();

  await card("A").getByRole("button", { name: "Submit Quote" }).click();
  await page.getByPlaceholder("Price / unit (₹)").fill("450");
  await page.getByPlaceholder("MOQ").fill("500");
  await card("B").getByRole("button", { name: "Submit Quote" }).click();
  await expect(page.getByPlaceholder("Price / unit (₹)")).toHaveValue("");
  await expect(page.getByPlaceholder("MOQ")).toHaveValue("");
  await page.context().close();
});

test("#14 a seller's data export has their store, listings, quotes sent, catalogues and videos", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`r14${tag}`, { seller: true });
  const buyer = await freshAccount(`r14b${tag}`);
  product(seller.id, `R14 ${tag} shirt`, "draft");
  const rfq = id(sql(`insert into public.rfqs (buyer_id, title, quantity, status, expires_at)
                      values ('${buyer.id}', 'R14 ${tag} rfq', 10, 'active', now() + interval '7 days') returning id`));
  const q = await clientFor(seller.session).from("quotes").insert({ rfq_id: rfq, vendor_id: seller.id, price_per_unit: 99 });
  expect(q.error).toBeNull();
  sql(`insert into public.catalogues (vendor_id, title, status) values ('${seller.id}', 'R14 ${tag} catalogue', 'draft')`);

  const page = await openAs(browser, seller.session, "/profile/data-export");
  const download = page.waitForEvent("download");
  await page.getByText("Export All Data", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'justify-between')][1]").getByRole("button", { name: "Export" }).click();
  const file = await (await download).path();
  const doc = JSON.parse(readFileSync(file!, "utf8"));
  expect(doc.seller?.store?.brand_name).toBe(`r14${tag} Textiles`);
  expect(doc.seller.listings.map((p: { name: string }) => p.name)).toContain(`R14 ${tag} shirt`);
  expect(doc.seller.quotes_sent).toHaveLength(1);
  expect(doc.seller.quotes_sent[0].price_per_unit).toBe(99);
  expect(doc.seller.catalogues.map((c: { title: string }) => c.title)).toContain(`R14 ${tag} catalogue`);
  expect(JSON.stringify(doc.seller)).not.toContain("embedding");
  await page.context().close();
});

test("low: a revised quote shows its revision date, and buyer text isn't machine-translated", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`rlq${tag}`, { seller: true });
  const buyer = await freshAccount(`rlqb${tag}`);
  const s = stack();
  const image = `${s.API}/storage/v1/object/public/product-images/${buyer.id}/rfq/${tag}/0.jpg`;
  const rfq = id(sql(`insert into public.rfqs (buyer_id, title, product_name, quantity, status, expires_at, image)
                      values ('${buyer.id}', 'RLQ ${tag} jackets', 'RLQ ${tag} jackets', 10, 'active', now() + interval '7 days', '${image}') returning id`));
  const db = clientFor(seller.session);
  expect((await db.from("quotes").insert({ rfq_id: rfq, vendor_id: seller.id, price_per_unit: 300 })).error).toBeNull();
  // Sent on 5 January (and, once quotes have it, last revised then too).
  sql(`begin; alter table public.quotes disable trigger user;
       update public.quotes set created_at = '2026-01-05 10:00+05:30' where rfq_id = '${rfq}';
       do $$ begin
         if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'updated_at') then
           execute 'update public.quotes set updated_at = ''2026-01-05 10:00+05:30'' where rfq_id = ''${rfq}''';
         end if;
       end $$;
       alter table public.quotes enable trigger user; commit;`);
  // The seller revises the price today.
  expect((await db.from("quotes").update({ price_per_unit: 280 }).eq("rfq_id", rfq).eq("vendor_id", seller.id).select("id")).data).toHaveLength(1);

  const page = await openAs(browser, seller.session, "/quotes");
  const today = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  await expect(page.getByText(`Last updated: ${today}`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Submitted 5 Jan 2026").first()).toBeVisible();
  // What the buyer typed is kept out of the page translator.
  const title = page.getByText(`RLQ ${tag} jackets`, { exact: true }).first();
  expect(await title.evaluate((el) => Boolean(el.closest("[data-no-translate]")))).toBe(true);
  await page.context().close();
});

test("low: a SKU can be cleared in the edit form", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`rls${tag}`, { seller: true });
  const pid = id(sql(`insert into public.products (vendor_id, name, status, price_value, moq, attributes)
                      values ('${seller.id}', 'RLS ${tag} tee', 'draft', 150, '10', '{"sku": "OLD-SKU-1"}') returning id`));
  const page = await openAs(browser, seller.session, `/upload?id=${pid}`);
  const skuBox = page.getByLabel(/SKU/i).first();
  await expect(skuBox).toHaveValue("OLD-SKU-1", { timeout: 30_000 });
  await skuBox.fill("");
  for (let i = 0; i < 3 && !(await page.getByRole("button", { name: "Save Changes" }).isVisible()); i++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(/\/products$/, { timeout: 30_000 });
  expect(sql(`select coalesce(attributes ->> 'sku', 'none') from public.products where id = '${pid}'`)).toBe("none");
  await page.context().close();
});

test("low: Delete on Products asks first, and Cancel keeps the listing", async ({ browser }) => {
  const seller = await freshAccount(`rld${tag}`, { seller: true });
  const name = `RLD ${tag} saree`;
  const pid = id(sql(`insert into public.products (vendor_id, name, status, price_value, moq)
                      values ('${seller.id}', '${name}', 'draft', 900, '5') returning id`));
  const page = await openAs(browser, seller.session, "/products");
  const row = page.locator("div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "More actions" }) }).last();
  await row.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(name);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(sql(`select count(*) from public.products where id = '${pid}'`)).toBe("1");
  await page.context().close();
});
