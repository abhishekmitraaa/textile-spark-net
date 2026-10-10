/**
 * Catalogue review in Cosora-Admin (2026-10-10), on the local stack.
 *   * A seller on Basic has two catalogues waiting. Cosora-Admin › Catalogues (in the Moderation menu) lists both
 *     with the seller and a link to the PDF. The moderator approves one (live) and rejects the other; Reject stays
 *     disabled until a reason is typed (20261010160000_catalogue_review).
 *   * The seller's catalogue page shows the rejected one with the moderator's reason.
 *   * The seller then renames the live one through the API: it goes back to review and the Catalogues queue shows
 *     it as Edited with the change (20261010124955_listing_edit_rereview).
 * afterEach removes what each run made.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql, stack, watchErrors } from "./stack";

const made: string[] = [];
test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    sql(`delete from public.catalogues where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
});

const tag = Date.now().toString(36);
const catalogue = (id: string) => sql(`select status || '|' || coalesce(rejection_reason, '-') from public.catalogues where id = '${id}'`);
const card = (page: Page, title: string) =>
  page.locator("div.space-y-3 > *").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test("a moderator approves and rejects catalogues; the seller sees why; an edit comes back as Edited", async ({ browser }) => {
  test.setTimeout(180_000);
  const seller = await freshAccount(`crseller${tag}`, { seller: true });
  made.push(seller.id);
  sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${seller.id}', 'basic', 'monthly', 'active', now() - interval '1 day', now() + interval '29 days');`);
  const ok = `CR spring lookbook ${tag}`;
  const bad = `CR price list ${tag}`;
  const [okId, badId] = [ok, bad].map((title) =>
    sql(`insert into public.catalogues (vendor_id, title, description, status, page_count, file_url)
         values ('${seller.id}', '${title}', 'Cotton and linen, 2026', 'under_review', 12, 'https://example.com/${tag}.pdf') returning id;`).split("\n")[0]);

  const adminCtx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await adminCtx.newPage();
  const adminErrors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/products`);
  await admin.getByRole("link", { name: "Catalogues" }).click();
  await expect(admin).toHaveURL(/\/catalogues$/);
  await expect(card(admin, ok)).toHaveCount(1);
  await expect(card(admin, ok).getByText(`crseller${tag} Textiles`)).toBeVisible();
  await expect(card(admin, ok).getByRole("link", { name: "Open PDF" })).toHaveAttribute("href", `https://example.com/${tag}.pdf`);

  await card(admin, ok).getByRole("button", { name: "Approve" }).click();
  await expect.poll(() => catalogue(okId)).toBe("live|-");

  await card(admin, bad).getByRole("button", { name: "Reject" }).click();
  const confirm = admin.getByRole("button", { name: "Reject catalogue" });
  await expect(confirm).toBeDisabled();
  await admin.getByPlaceholder("What should the seller fix?").fill("Prices are missing on pages 3 to 7.");
  await confirm.click();
  await expect.poll(() => catalogue(badId)).toBe("rejected|Prices are missing on pages 3 to 7.");

  await admin.getByRole("button", { name: "Live" }).click();
  await expect(card(admin, ok)).toHaveCount(1);
  await admin.getByRole("button", { name: "Rejected (audit)" }).click();
  await expect(card(admin, bad).getByText("Prices are missing on pages 3 to 7.")).toBeVisible();
  expect(adminErrors).toEqual([]);

  // The seller sees why.
  const sellerCtx = await contextWithSession(browser, seller.session, { width: 1280, height: 1000 });
  const page = await sellerCtx.newPage();
  await page.goto(`${BUYER_URL}/upload-catalogue`);
  const reason = page.getByTestId("catalogue-rejection-reason");
  await expect(reason).toContainText("Why it wasn't approved:");
  await expect(reason).toContainText("Prices are missing on pages 3 to 7.");
  await sellerCtx.close();

  // The seller renames the live catalogue straight through the API: back to review, shown as Edited.
  const s = stack();
  const api = createClient(s.API, s.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${seller.session.access_token}` } } });
  const { error } = await api.from("catalogues").update({ title: `${ok} (2027)` }).eq("id", okId);
  expect(error).toBeNull();
  expect(catalogue(okId)).toBe("under_review|-");
  await admin.getByRole("button", { name: "Queue (under review)" }).click();
  const edited = card(admin, `${ok} (2027)`);
  await expect(edited.getByText("Edited", { exact: true })).toBeVisible();
  await expect(edited.locator('[data-marker="listing-edit-notice"]')).toContainText(`Title: ${ok} → ${ok} (2027)`);
  await adminCtx.close();
});
