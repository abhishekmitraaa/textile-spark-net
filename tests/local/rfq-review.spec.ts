/**
 * Mitra's batch of 2026-10-17, part C. Local stack only.
 *   9. A requirement waits for an admin before sellers see it: the buyer is told "usually 3–5 minutes"; My Quotes
 *      says "Under review"; a reviewer approves it (sellers then see it), or picks a manager-made reason (the buyer
 *      reads it and is notified); a buyer can't skip review by writing to rfqs; only reviewers review, only
 *      managers and super admins write reasons.
 *   5. "Others (Custom)" is offered to buyers, not to sellers listing, and counts as every seller's category.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, clientAs, contextWithSession, freshAccount, signedInContext, sql, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const sellers: string[] = [];
const buyers: string[] = [];

test.afterAll(() => {
  for (const b of buyers) {
    sql(`delete from public.rfqs where buyer_id = '${b}'; delete from public.rfq_submissions where buyer_id = '${b}';
         delete from public.notifications where profile_id = '${b}';`);
  }
  for (const s of sellers) {
    sql(`delete from public.product_images where product_id in (select id from public.products where vendor_id = '${s}');
         delete from public.products where vendor_id = '${s}';`);
  }
});

const field = (page: Page, label: RegExp) =>
  page.locator("div", { has: page.locator(":scope > label", { hasText: label }) }).locator(":scope > input").first();

async function postOthers(page: Page, what: string) {
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Create New Requirement/ }).click();
  await page.getByRole("button", { name: /Others \(Custom\)/ }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await field(page, /^What is it\?/).fill(what);
  await field(page, /^Quantity/).fill("40 pieces");
  await page.getByRole("button", { name: /Submit Quote Request/ }).click();
  await expect(page.getByTestId("rfq-sent-for-review")).toHaveText("Sent for review", { timeout: 30_000 });
  await expect(page.getByText(/usually takes 3–5 minutes/)).toBeVisible();
}

test("a requirement waits for review; not approved with a reason, or approved for every seller", async ({ browser }) => {
  test.setTimeout(240_000);
  // A seller whose only live listing is in a category the requirement is not.
  const seller = await freshAccount(`rvsell${tag}`, { seller: true });
  sellers.push(seller.id);
  sql(`insert into public.products (vendor_id, name, status, price_value, moq, category_id)
       values ('${seller.id}', 'RV ${tag} buttons', 'live', 2, '1000', (select id from public.categories where name = 'Buttons' limit 1))`);
  const buyer = await freshAccount(`rvbuy${tag}`);
  buyers.push(buyer.id);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // ── Sellers listing a product aren't offered "Others".
  const sctx = await contextWithSession(browser, seller.session, { width: 1280, height: 900 });
  const spage = await sctx.newPage();
  await spage.goto(`${BUYER_URL}/upload`);
  await expect(spage.getByRole("button", { name: /Apparel & Home/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(spage.getByRole("button", { name: /Others \(Custom\)/ })).toHaveCount(0);
  await sctx.close();

  // ── 1. Posted: sent for review, nothing for sellers yet.
  const first = `RV ${tag} stage costume`;
  await postOthers(page, first);
  await expect.poll(() => sql(`select state from public.rfq_submissions where buyer_id = '${buyer.id}' and title like '%${first}%'`)).toBe("pending");
  expect(sql(`select count(*) from public.rfqs where buyer_id = '${buyer.id}'`)).toBe("0");
  await page.goto(`${BUYER_URL}/requirement/my-quotes`);
  await expect(page.getByTestId("rfq-submission").filter({ hasText: first })).toContainText("Under review");

  // ── A buyer can't skip review by writing to rfqs.
  const api = await (async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { stack } = await import("./stack");
    const s = stack();
    return createClient(s.API, s.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${buyer.session.access_token}` } } });
  })();
  const skip = await api.from("rfqs").insert({ buyer_id: buyer.id, title: `RV ${tag} skip`, status: "active" });
  expect(skip.error, "an open requirement straight to rfqs").not.toBeNull();
  const forged = await api.from("rfq_submissions").insert({ buyer_id: buyer.id, title: `RV ${tag} forged`, state: "approved" } as never);
  expect(forged.error, "a submission that sets its own state").not.toBeNull();

  // ── Only reviewers review; only managers and super admins write reasons.
  const support = await clientAs("support");
  const subId = sql(`select id from public.rfq_submissions where buyer_id = '${buyer.id}' and title like '%${first}%'`);
  expect((await support.rpc("admin_rfq_review", { p_id: subId, p_decision: "approve" })).error?.code).toBe("42501");
  const moderator = await clientAs("moderator");
  expect((await moderator.rpc("admin_rfq_review_reason_save", { p_id: null, p_label: "Nope", p_buyer_message: "Not allowed here at all." })).error?.code).toBe("42501");
  const manager = await clientAs("manager");
  const reasonLabel = `RV ${tag} reason`;
  const saved = await manager.rpc("admin_rfq_review_reason_save", { p_id: null, p_label: reasonLabel, p_buyer_message: `Please add sizes and a reference picture (${tag}).` });
  expect(saved.error).toBeNull();

  // ── 2. Not approved, with the manager's reason: the buyer reads it and is notified.
  const actx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await actx.newPage();
  const aerrors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/requirement-review`);
  await expect(admin.getByRole("link", { name: /Requirements/ })).toBeVisible();
  const card = admin.getByTestId("rfq-submission-card").filter({ hasText: first });
  await expect(card).toContainText("Others: every seller", { timeout: 30_000 });
  await card.getByRole("button", { name: "Not approve" }).click();
  await admin.getByLabel("Reason").selectOption({ label: reasonLabel });
  await expect(admin.getByText(`Please add sizes and a reference picture (${tag}).`)).toBeVisible();
  await admin.getByLabel("Note to the buyer (optional)").fill("The cape length too.");
  await admin.getByRole("dialog").getByRole("button", { name: "Not approve" }).click();
  await expect.poll(() => sql(`select state from public.rfq_submissions where id = '${subId}'`)).toBe("rejected");
  expect(sql(`select title from public.notifications where profile_id = '${buyer.id}' and kind = 'rfq_review'`)).toBe("Your requirement wasn't approved");
  await page.reload();
  const rejected = page.getByTestId("rfq-submission").filter({ hasText: first });
  await expect(rejected).toContainText("Not approved");
  await expect(rejected).toContainText(`Please add sizes and a reference picture (${tag}). The cape length too.`);
  await expect(page.getByTestId("buyer-bell")).toHaveAccessibleName(/1 unread/);
  await page.getByTestId("buyer-bell").click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByText("Your requirement wasn't approved")).toBeVisible();

  // ── 3. Approved: a real requirement every seller sees, the unrelated one included.
  const second = `RV ${tag} embroidered jacket`;
  await postOthers(page, second);
  const sub2 = await (async () => { await expect.poll(() => sql(`select count(*) from public.rfq_submissions where buyer_id = '${buyer.id}' and title like '%${second}%'`)).toBe("1"); return sql(`select id from public.rfq_submissions where buyer_id = '${buyer.id}' and title like '%${second}%'`); })();
  await admin.reload();
  await admin.getByTestId("rfq-submission-card").filter({ hasText: second }).getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => sql(`select state || '|' || (rfq_id is not null) from public.rfq_submissions where id = '${sub2}'`)).toBe("approved|true");
  const rfqId = sql(`select rfq_id from public.rfq_submissions where id = '${sub2}'`);
  expect(sql(`select r.status || '|' || c.name from public.rfqs r join public.categories c on c.id = r.category_id where r.id = '${rfqId}'`)).toBe("active|Others (Custom)");
  expect(sql(`select category_match from public.match_rfq_vendors('${rfqId}', 500) where vendor_id = '${seller.id}'`)).toBe("t");
  const sellerApi = await (async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { stack } = await import("./stack");
    const s = stack();
    return createClient(s.API, s.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${seller.session.access_token}` } } });
  })();
  const seen = await sellerApi.from("rfqs").select("id").eq("id", rfqId);
  expect(seen.data?.length).toBe(1);
  expect(sql(`select count(*) from public.notifications where profile_id = '${buyer.id}' and title = 'Your requirement is live'`)).toBe("1");
  await page.goto(`${BUYER_URL}/requirement/my-quotes`);
  await expect(page.getByText(second).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("rfq-submission").filter({ hasText: second })).toHaveCount(0);

  expect(errors).toEqual([]);
  expect(aerrors).toEqual([]);
  await actx.close();
  await ctx.close();
  sql(`update admin.rfq_review_reasons set active = false where label = '${reasonLabel}'`);
});
