/**
 * The 2026-10-21 vendor audit, items 6-10 (migration 20261021120000). Local stack only; needs the buyer app.
 *   #6 A quote card counts every seller's quotes on the requirement, not only this seller's.
 *   #7 Seller Home's Open Leads counts what Leads lists: not the seller's own requirements, not expired ones,
 *      not their own requests to other sellers.
 *   #8 The lead funnel counts open requirements and requests sent to this seller only.
 *   #9 A won quote keeps its requirement's title and quantity after the requirement is removed or closed.
 *   #10 A listing a buyer asked about can be deleted, and its files go with it.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUYER_URL, contextWithSession, freshAccount, sql, stack } from "./stack";

const tag = Date.now().toString(36);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const id = (out: string) => out.match(UUID)![0];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function clientFor(session: { access_token: string }): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** One value, read as the given account (RLS applies). */
function asAccount(account: string, query: string): string {
  const out = sql(`begin;
    select set_config('request.jwt.claims', '{"sub":"${account}","role":"authenticated"}', true) is not null as ok;
    set local role authenticated;
    ${query};
    commit;`);
  const lines = out.split("\n").filter((l) => l && l !== "BEGIN" && l !== "COMMIT" && l !== "SET" && l !== "t");
  return lines[lines.length - 1];
}

function requirement(buyer: string, title: string, extra: Partial<{ vendor: string; product: string; expires: string; quantity: number }> = {}): string {
  return id(sql(`insert into public.rfqs (buyer_id, title, product_name, quantity, status, expires_at, vendor_id, product_id)
    values ('${buyer}', '${title}', '${title}', ${extra.quantity ?? 100}, 'active', ${extra.expires ?? "now() + interval '7 days'"},
            ${extra.vendor ? `'${extra.vendor}'` : "null"}, ${extra.product ? `'${extra.product}'` : "null"}) returning id`));
}

async function quote(seller: { id: string; session: { access_token: string } }, rfq: string, price: number) {
  const { error } = await clientFor(seller.session).from("quotes").insert({ rfq_id: rfq, vendor_id: seller.id, price_per_unit: price });
  if (error) throw error;
}

async function openAs(browser: import("@playwright/test").Browser, session: import("@supabase/supabase-js").Session, path: string): Promise<Page> {
  const ctx = await contextWithSession(browser, session, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}${path}`);
  return page;
}

test("#6 a quote card counts every seller's quotes on the requirement", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`v6b${tag}`);
  const a = await freshAccount(`v6a${tag}`, { seller: true });
  const b = await freshAccount(`v6c${tag}`, { seller: true });
  const rfq = requirement(buyer.id, `V6 ${tag} polos`);
  await quote(a, rfq, 120);
  await quote(b, rfq, 110);
  const page = await openAs(browser, a.session, "/quotes");
  const card = page.locator("div", { has: page.getByText(`V6 ${tag} polos`) }).filter({ hasText: "quotes total" }).last();
  await expect(card).toContainText("2 quotes total", { timeout: 30_000 });
  await page.context().close();
});

test("#7 Open Leads counts what Leads lists", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`v7s${tag}`, { seller: true });
  const other = await freshAccount(`v7o${tag}`, { seller: true });
  const buyer = await freshAccount(`v7b${tag}`);
  requirement(seller.id, `V7 ${tag} own`);
  requirement(seller.id, `V7 ${tag} own direct`, { vendor: other.id });
  requirement(buyer.id, `V7 ${tag} expired`, { expires: "now() - interval '1 day'" });
  requirement(buyer.id, `V7 ${tag} open`);
  const expected = asAccount(seller.id, `select count(*) from public.rfqs
    where status = 'active' and vendor_id is null and expires_at > now() and buyer_id <> '${seller.id}'`);
  const page = await openAs(browser, seller.session, "/seller-home");
  const tile = page.getByText("Open Leads", { exact: true }).locator("xpath=../..").locator("p").first();
  await expect(tile).toHaveText(expected, { timeout: 30_000 });
  await page.context().close();
});

test("#8 the lead funnel counts open requirements and requests to this seller only", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`v8s${tag}`, { seller: true });
  const other = await freshAccount(`v8o${tag}`, { seller: true });
  const buyer = await freshAccount(`v8b${tag}`);
  requirement(seller.id, `V8 ${tag} own`);
  requirement(seller.id, `V8 ${tag} own direct`, { vendor: other.id });
  requirement(buyer.id, `V8 ${tag} to me`, { vendor: seller.id });
  requirement(buyer.id, `V8 ${tag} open`);
  const expected = asAccount(seller.id, `select count(*) from public.rfqs
    where status = 'active' and buyer_id <> '${seller.id}' and (vendor_id is null or vendor_id = '${seller.id}')
      and created_at >= now() - interval '7 days'`);
  const page = await openAs(browser, seller.session, "/analytics");
  const value = page.getByText("Buyer requirements you could quote on", { exact: true }).locator("xpath=..").locator("p").nth(1);
  await expect(value).toHaveText(expected, { timeout: 30_000 });
  await page.context().close();
});

test("#9 a won quote keeps its requirement after the requirement is removed", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`v9b${tag}`);
  const seller = await freshAccount(`v9s${tag}`, { seller: true });
  const title = `V9 ${tag} hoodies`;
  const rfq = requirement(buyer.id, title, { quantity: 40 });
  await quote(seller, rfq, 250);
  const accepted = await clientFor(buyer.session).from("quotes").update({ status: "accepted" }).eq("rfq_id", rfq).select("id");
  expect(accepted.error).toBeNull();
  sql(`update public.rfqs set status = 'closed', removed_at = now(), removed_by = '${stack().ids.admin}', removed_reason = 'audit test'
       where id = '${rfq}'`);

  const page = await openAs(browser, seller.session, "/quotes");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("40 pcs").first()).toBeVisible();
  // Total Order Value: 40 × ₹250 = ₹10,000, not an unpriced ₹0.
  await page.goto(`${BUYER_URL}/analytics`);
  const won = page.getByText("Total Order Value won").locator("xpath=..").locator("span").nth(1);
  await expect(won).not.toHaveText(/^₹0$/, { timeout: 30_000 });
  await expect(won).toHaveText(/10/);
  await page.context().close();
});

test("#10 a listing a buyer asked about can be deleted, and its files go with it", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await freshAccount(`v10s${tag}`, { seller: true });
  const buyer = await freshAccount(`v10b${tag}`);
  const db = clientFor(seller.session);
  const name = `V10 ${tag} kurta`;
  const pid = id(sql(`insert into public.products (vendor_id, name, status, price_value, moq)
                      values ('${seller.id}', '${name}', 'draft', 300, '5') returning id`));
  const imgPath = `${seller.id}/${pid}/${tag}.png`;
  expect((await db.storage.from("product-images").upload(imgPath, PNG, { contentType: "image/png" })).error).toBeNull();
  const imgUrl = db.storage.from("product-images").getPublicUrl(imgPath).data.publicUrl;
  sql(`insert into public.product_images (product_id, url, position) values ('${pid}', '${imgUrl}', 0)`);
  const docPath = `${seller.id}/${pid}/${crypto.randomUUID()}.pdf`;
  expect((await db.storage.from("product-files").upload(docPath, Buffer.from("%PDF-1.4\n"), { contentType: "application/pdf" })).error).toBeNull();
  sql(`insert into public.product_documents (product_id, path, name, position) values ('${pid}', '${docPath}', 'spec.pdf', 0)`);
  const rfq = requirement(buyer.id, `V10 ${tag} request`, { vendor: seller.id, product: pid });

  const page = await openAs(browser, seller.session, "/products");
  const row = page.locator("tr, div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "More actions" }) }).last();
  await row.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect(page.getByText("Product deleted")).toBeVisible({ timeout: 30_000 });

  expect(sql(`select count(*) from public.products where id = '${pid}'`)).toBe("0");
  expect(sql(`select coalesce(product_id::text, 'null') || '|' || title from public.rfqs where id = '${rfq}'`)).toBe(`null|V10 ${tag} request`);
  await expect.poll(async () => (await fetch(`${imgUrl}?n=${Date.now()}`)).status).not.toBe(200);
  expect(sql(`select count(*) from storage.objects where bucket_id = 'product-files' and name = '${docPath}'`)).toBe("0");
  await page.context().close();
});
