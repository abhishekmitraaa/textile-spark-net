/**
 * Product moderation (2026-10-07, documentation/product-moderation-design-2026-10-07.md):
 * remove and flag a listing with a reason picked in the dialog from managed templates; the
 * vendor reads the outcome on My Products. Local stack only (tests/local/stack.ts).
 *
 *   npx playwright test -c playwright.local.config.ts tests/local/product-moderation.spec.ts
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, service, signedInContext, sql, stack, watchErrors } from "./stack";

const WIDE = { width: 1440, height: 1000 };
const TAG = "PM spec";

async function liveListing(name: string): Promise<string> {
  const { data, error } = await service()
    .from("products")
    .insert({ vendor_id: stack().ids.vendor, name, status: "live" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert listing: ${error?.message}`);
  return data.id as string;
}

function cleanup(): void {
  sql(`delete from public.notifications where kind like 'product_%' and body like '%${TAG}%';
       delete from admin.admin_flags where entity_type = 'product'
         and entity_id in (select id from public.products where name like '${TAG}%');
       delete from public.products where name like '${TAG}%';
       delete from admin.product_moderation_actions where product_name like '${TAG}%';
       delete from admin.product_moderation_reasons where label = '${TAG} reason';`);
}

test.beforeAll(cleanup);
test.afterEach(cleanup);

test("a product moderator removes a listing with a reason picked in the dialog; the vendor sees it", async ({ browser }) => {
  const name = `${TAG} counterfeit tee`;
  const id = await liveListing(name);

  const ctx = await signedInContext(browser, "moderator", WIDE);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/products`);
  await page.getByRole("button", { name: "Live", exact: true }).click();
  const card = page.getByTestId(`product-${id}`);
  await card.getByRole("button", { name: "Remove", exact: true }).click();

  // Nothing can be sent until a reason is picked, here, in the dialog.
  const confirm = page.getByRole("button", { name: "Remove listing", exact: true });
  await expect(confirm).toBeDisabled();
  // A flag-only reason isn't offered for a removal.
  await expect(page.getByLabel("Reason (required)").locator("option", { hasText: "Wrong category" })).toHaveCount(0);
  await page.getByLabel("Reason (required)").selectOption({ label: "Prohibited item" });
  await page.getByLabel("Details for the vendor (optional)").fill("Weapons-style buckle on the belt.");
  await expect(page.getByTestId("pm-preview")).toContainText("This product isn't allowed on Cosora");
  await expect(page.getByTestId("pm-preview")).toContainText("Details: Weapons-style buckle on the belt.");
  await confirm.click();
  await expect(page.getByText(`"${name}" was removed. The vendor has been told why.`)).toBeVisible();

  // The server, not the toast: rejected, removed, one ledger row, one notification.
  expect(
    sql(`select p.status || '|' || (p.removed_at is not null) || '|' ||
                (select count(*) from admin.product_moderation_actions a where a.product_id = p.id and a.action = 'remove') || '|' ||
                (select count(*) from public.notifications n where n.profile_id = p.vendor_id and n.kind = 'product_removed'
                   and n.body like '%${name}%')
           from public.products p where p.id = '${id}'`),
  ).toBe("rejected|true|1|1");

  await page.getByRole("button", { name: "Removed", exact: true }).click();
  await expect(card.getByText("removed", { exact: true })).toBeVisible();
  await expect(card.getByText(/Weapons-style buckle/)).toBeVisible();
  // Reinstating is for super admins and managers.
  await expect(card.getByRole("button", { name: "Reinstate" })).toBeDisabled();
  expect(errors).toEqual([]);
  await ctx.close();

  // The vendor: "Removed by Cosora", the reason, and no Edit.
  const vctx = await signedInContext(browser, "vendor", WIDE);
  const vpage = await vctx.newPage();
  await vpage.goto(`${BUYER_URL}/products`);
  const note = vpage.getByTestId("product-moderation-note").filter({ hasText: "Weapons-style buckle" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("Cosora removed this listing. It can't be edited or resubmitted.");
  await expect(vpage.locator("text=Removed by Cosora >> visible=true").first()).toBeVisible();
  await expect(vpage.getByRole("button", { name: `Edit ${name}` })).toHaveCount(0);
  await expect(vpage.getByRole("button", { name: `${name}: removed by Cosora` })).toBeDisabled();
  await vpage.screenshot({ path: "screenshots/product-moderation-vendor-removed.png" });
  await vctx.close();
});

test("a manager adds a reason, flags a live listing with it, and reinstates a removed one", async ({ browser }) => {
  const flagName = `${TAG} flagged dress`;
  const removedName = `${TAG} removed shirt`;
  const flagId = await liveListing(flagName);
  const removedId = await liveListing(removedName);

  const ctx = await signedInContext(browser, "manager", WIDE);
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // 1. A new reason, for flags only.
  await page.goto(`${ADMIN_URL}/moderation-reasons`);
  await page.getByRole("button", { name: "Add reason" }).click();
  await page.getByLabel("Name (what moderators pick)").fill(`${TAG} reason`);
  await page.getByLabel("Message the vendor reads").fill("Check the fabric weight you listed.");
  await page.getByText("Offer when removing").click(); // flags only
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId(`reason-${TAG} reason`)).toBeVisible();
  expect(sql(`select array_to_string(applies_to, ',') from admin.product_moderation_reasons where label = '${TAG} reason'`)).toBe("flag");

  // 2. Flag with it: hidden, back in the queue, the vendor told.
  await page.goto(`${ADMIN_URL}/products`);
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await page.getByTestId(`product-${flagId}`).getByRole("button", { name: "Flag", exact: true }).click();
  await expect(page.getByRole("button", { name: "Flag and hide" })).toBeDisabled();
  await page.getByLabel("Reason (required)").selectOption({ label: `${TAG} reason` });
  await page.getByRole("button", { name: "Flag and hide" }).click();
  await expect(page.getByText(`"${flagName}" is hidden and back in the queue.`, { exact: false })).toBeVisible();
  expect(sql(`select status || '|' || flag_reason from public.products where id = '${flagId}'`))
    .toBe("under_review|Check the fabric weight you listed.");
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(page.getByTestId(`product-${flagId}`).getByText("flagged", { exact: true })).toBeVisible();

  // 3. Remove the other through the API as a moderator would, then reinstate it here.
  const reason = sql(`select id from admin.product_moderation_reasons where label = 'Duplicate listing'`);
  sql(`begin;
       select set_config('request.jwt.claims', '{"sub":"${stack().ids.admin}","role":"authenticated"}', true);
       select set_config('request.jwt.claim.sub', '${stack().ids.admin}', true);
       set local role authenticated;
       select public.admin_product_remove('${removedId}', '${reason}', null);
       commit;`);
  await page.getByRole("button", { name: "Removed", exact: true }).click();
  await page.getByTestId(`product-${removedId}`).getByRole("button", { name: "Reinstate" }).click();
  const reinstate = page.getByRole("button", { name: "Reinstate", exact: true }).last();
  await expect(reinstate).toBeDisabled();
  await page.getByLabel("Why the removal is being undone (required)").fill("It was not a duplicate.");
  await reinstate.click();
  await expect(page.getByText(`"${removedName}" is back in the vendor's drafts`)).toBeVisible();
  expect(sql(`select status || '|' || coalesce(removed_at::text, 'none') from public.products where id = '${removedId}'`)).toBe("draft|none");
  expect(
    sql(`select count(*) from admin.audit_log where target_table = 'public.products' and target_id = '${removedId}'
           and reason = 'Reinstated: It was not a duplicate.'`),
  ).toBe("1");
  expect(errors).toEqual([]);
  await ctx.close();
});
