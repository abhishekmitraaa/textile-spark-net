/**
 * Edited listings go back to review, and Cosora-Admin sees what changed (2026-10-10), on the local stack.
 *   * A seller opens one of their live listings to edit it and is told saving sends it back to review.
 *     They change the price and save: the listing is under review (hidden from buyers) and the change is
 *     recorded (20261010124955_listing_edit_rereview).
 *   * In Cosora-Admin › Products the listing is in the queue with an "Edited" badge and the change,
 *     "Price: 450 → 99". Approving puts it live and closes the record.
 *   * The same change made straight through the API, not the app, does the same.
 * afterEach removes the listings each run made.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql, stack, watchErrors } from "./stack";

const made: string[] = [];
test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    sql(`delete from public.products where vendor_id = '${id}';`);
  }
});

const tag = Date.now().toString(36);

async function sellerWithLiveListing(prefix: string) {
  const who = await freshAccount(`${prefix}${tag}`, { seller: true });
  made.push(who.id);
  const cat = sql("select id from public.categories where parent_id is not null order by name limit 1");
  const name = `LE ${prefix} ${tag}`;
  const id = sql(`insert into public.products (vendor_id, name, description, status, price_value, moq, category_id, country_of_origin)
                  values ('${who.id}', '${name}', 'Cotton poplin, 120 GSM', 'live', 450, '10', '${cat}', 'India') returning id;`).split("\n")[0];
  sql(`insert into public.product_images (product_id, url, position) values ('${id}', 'https://picsum.photos/seed/le${tag}/400/500', 0);`);
  return { ...who, productId: id, name };
}

/** The admin card for one listing. */
const adminCard = (page: Page, name: string) =>
  page.locator("div.space-y-3 > *").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("a seller's edit to a live listing goes back to review, and the moderator sees what changed", async ({ browser }) => {
  test.setTimeout(180_000);
  const seller = await sellerWithLiveListing("le-app");

  const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/upload?id=${seller.productId}`);
  await expect(page.getByTestId("edit-rereview-note")).toBeVisible();
  // Details → Images → Pricing.
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#price").fill("99");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Product updated")).toBeVisible();
  await expect.poll(() => sql(`select status from public.products where id = '${seller.productId}'`)).toBe("under_review");
  expect(sql(`select was_status || ' ' || (changes -> 'price_value')::text from admin.listing_edits
               where entity = 'product' and entity_id = '${seller.productId}' and resolved_at is null`)).toBe('live {"to": 99.00, "from": 450.00}');
  expect(errors).toEqual([]);
  await ctx.close();

  const adminCtx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await adminCtx.newPage();
  await admin.goto(`${ADMIN_URL}/products`);
  const card = adminCard(admin, seller.name);
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Edited", { exact: true })).toBeVisible();
  const notice = card.locator('[data-marker="listing-edit-notice"]');
  await expect(notice).toContainText("Edited by the seller after it was approved.");
  await expect(notice).toContainText("Price: 450 → 99");
  await card.getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => sql(`select status from public.products where id = '${seller.productId}'`)).toBe("live");
  expect(sql(`select outcome || ' ' || (resolved_at is not null) from admin.listing_edits where entity_id = '${seller.productId}'`)).toBe("live true");
  await adminCtx.close();
});

test("the same edit through the API, not the app, also goes back to review", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await sellerWithLiveListing("le-api");
  const s = stack();
  const api = createClient(s.API, s.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${seller.session.access_token}` } } });

  // Asks to stay live while changing the name, then swaps the picture: both are edits.
  const { error } = await api.from("products").update({ name: `${seller.name} SALE`, status: "live" }).eq("id", seller.productId);
  expect(error).toBeNull();
  const pic = await api.from("product_images").insert({ product_id: seller.productId, url: "https://picsum.photos/seed/swap/400/500", position: 1 });
  expect(pic.error).toBeNull();
  expect(sql(`select status from public.products where id = '${seller.productId}'`)).toBe("under_review");
  expect(sql(`select (changes -> 'name' ->> 'to') || ' | ' || (changes -> 'images' ->> 'added') from admin.listing_edits
               where entity_id = '${seller.productId}' and resolved_at is null`)).toBe(`${seller.name} SALE | 1`);

  const adminCtx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await adminCtx.newPage();
  await admin.goto(`${ADMIN_URL}/products`);
  const card = adminCard(admin, `${seller.name} SALE`);
  await expect(card.getByText("Edited", { exact: true })).toBeVisible();
  await expect(card.locator('[data-marker="listing-edit-notice"]')).toContainText(`Name: ${seller.name} → ${seller.name} SALE`);
  await expect(card.locator('[data-marker="listing-edit-notice"]')).toContainText("Pictures: 1 added");
  await adminCtx.close();
});
