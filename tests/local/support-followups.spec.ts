/**
 * Help & Support follow-ups found in the 2026-10-02 manual pass, on the local stack:
 *   - a fraud report says which seller or listing it's about ("Report this seller" on a
 *     store page, "Report this listing" on a product, or a pasted Cosora link), so a
 *     confirmed finding names the account and its status instead of "Not linked";
 *   - support dates follow the reader's language (the sentences around them already did);
 *   - a fraud report's header names the channel once.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, clearSupport, openAllHours, restoreHours, setRollout, signedInContext, sql, stack, watchErrors } from "./stack";

test.beforeAll(() => {
  clearSupport();
  openAllHours();
  setRollout("staff");
});
test.afterAll(() => restoreHours());

async function sendReport(page: import("@playwright/test").Page, description: string, url?: string) {
  if (url) await page.locator("#fr-url").fill(url);
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator("#fr-description").fill(description);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Send the report" }).click();
  const done = page.getByText(/^We've recorded your report CS-\d{6}\.$/);
  await expect(done).toBeVisible({ timeout: 30_000 });
  return (await done.innerText()).match(/CS-\d{6}/)![0];
}

test("Report this seller: the report names the seller, and the confirmed finding names the account", async ({ browser }) => {
  const vendorId = stack().ids.vendor;
  const brand = sql(`select brand_name from public.vendor_profiles where id = '${vendorId}'`);
  const buyerCtx = await signedInContext(browser, "buyer");
  const buyer = await buyerCtx.newPage();
  const errors = watchErrors(buyer);

  await buyer.goto(`${BUYER_URL}/vendor/${vendorId}`);
  await buyer.getByRole("button", { name: "More" }).click();
  await buyer.getByRole("menuitem", { name: "Report this seller" }).click();
  await expect(buyer).toHaveURL(new RegExp(`/report-fraud\\?entity_type=vendor&entity_id=${vendorId}$`));
  await expect(buyer.getByText("This report is about the seller whose page you came from.")).toBeVisible();
  await buyer.locator("#fr-name").fill("The seller page I came from");
  await buyer.getByRole("button", { name: "Next" }).click();
  await buyer.locator("#fr-description").fill("Asked for payment to a personal account, then blocked me.");
  await buyer.getByRole("button", { name: "Next" }).click();
  await buyer.getByRole("button", { name: "Next" }).click();
  await expect(buyer.getByText("A seller on Cosora")).toBeVisible(); // the review step says what it's about
  await buyer.getByRole("button", { name: "Send the report" }).click();
  const done = buyer.getByText(/^We've recorded your report CS-\d{6}\.$/);
  await expect(done).toBeVisible({ timeout: 30_000 });
  const ticketNo = (await done.innerText()).match(/CS-\d{6}/)![0];

  expect(sql(`select d.reported_entity_type || '|' || d.reported_entity_id from public.support_fraud_details d
                join public.support_tickets t on t.id = d.ticket_id where t.ticket_no = '${ticketNo}'`)).toBe(`vendor|${vendorId}`);

  // The header names the channel once.
  await buyer.goto(`${BUYER_URL}/help/requests/${ticketNo}`);
  await expect(buyer.getByText(`Fraud report · ${ticketNo}`)).toBeVisible();
  await expect(buyer.getByText(/Fraud report · Fraud report/)).toHaveCount(0);

  // Support confirms it; the lasting record names the account and its status then.
  const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const staff = await staffCtx.newPage();
  await staff.goto(`${ADMIN_URL}/support/${ticketNo}`);
  await staff.locator("#fraud-outcome").selectOption("warned");
  await staff.locator("#fraud-note").fill("Asked for payment to a personal account (local follow-up spec).");
  await staff.getByRole("button", { name: "Save outcome" }).click();
  await expect(staff.getByText("Outcome saved. The reporter is told their report was reviewed.")).toBeVisible();
  expect(sql(`select subject_kind || '|' || subject_profile_id || '|' || subject_name || '|' || account_status
                from admin.fraud_findings where ticket_no = '${ticketNo}'`)).toBe(`vendor|${vendorId}|${brand}|active`);
  await staff.goto(`${ADMIN_URL}/support/fraud`);
  const row = staff.locator("tr").filter({ hasText: ticketNo });
  await expect(row.getByText(brand).first()).toBeVisible();
  await expect(row.getByText("Not linked to an account")).toHaveCount(0);

  expect(errors).toEqual([]);
  await buyerCtx.close();
  await staffCtx.close();
});

test("a pasted Cosora listing link counts as the listing; a link elsewhere doesn't", async ({ browser }) => {
  // A live listing to report (local only; the moderation trigger lets the service role publish).
  const productId = sql(`select set_config('request.jwt.claims', '{"role":"service_role"}', false);
    update public.products set status = 'live' where id = (select id from public.products order by status = 'live' desc, created_at limit 1) returning id;`)
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0] ?? "";
  expect(productId).toMatch(/^[0-9a-f-]{36}$/);
  const ctx = await signedInContext(browser, "buyer");
  const page = await ctx.newPage();

  await page.goto(`${BUYER_URL}/report-fraud`);
  const linked = await sendReport(page, "The listing's photos are stolen from another brand.", `${BUYER_URL}/product/${productId}`);
  expect(sql(`select coalesce(d.reported_entity_type, '-') || '|' || coalesce(d.reported_entity_id::text, '-')
                from public.support_fraud_details d join public.support_tickets t on t.id = d.ticket_id
               where t.ticket_no = '${linked}'`)).toBe(`product|${productId}`);

  // From the product page itself.
  await page.goto(`${BUYER_URL}/product/${productId}`);
  await page.getByRole("button", { name: "Report this listing" }).click();
  await expect(page).toHaveURL(new RegExp(`/report-fraud\\?entity_type=product&entity_id=${productId}$`));
  await expect(page.getByText("This report is about the listing you came from.")).toBeVisible();

  // Not a Cosora address: kept as text, not linked.
  await page.goto(`${BUYER_URL}/report-fraud`);
  const unlinked = await sendReport(page, "A fake site copying Cosora sellers.", `https://example.com/product/${productId}`);
  expect(sql(`select coalesce(d.reported_entity_type, '-') from public.support_fraud_details d
                join public.support_tickets t on t.id = d.ticket_id where t.ticket_no = '${unlinked}'`)).toBe("-");
  await ctx.close();
});

test("support dates follow the language: a callback booked in Hindi reads in Hindi", async ({ browser }) => {
  const ctx = await signedInContext(browser, "vendor");
  await ctx.addInitScript(() => localStorage.setItem("cosora.lang", "hi"));
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/help/callback`);
  await page.getByRole("radio").first().click(); // the first topic
  const slot = page.getByRole("radio", { name: /^\d\d:00–\d\d:00$/ }).first();
  await slot.click();
  await page.locator("button[type=submit], button").filter({ hasText: /कॉलबैक बुक करें|Book the callback/ }).first().click();
  const booked = page.getByText(/CS-\d{6}/).first();
  await expect(booked).toBeVisible({ timeout: 30_000 });
  const body = await page.locator("body").innerText();
  // A Hindi weekday and month (सोम, मंगल, बुध, गुरु, शुक्र, शनि, रवि; अक्टू॰ …), not "Mon, 5 Oct".
  expect(body).toMatch(/(सोम|मंगल|बुध|गुरु|शुक्र|शनि|रवि)[^\n]*\d{1,2} [^\s,]+/);
  expect(body).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} (Oct|Nov|Dec|Jan)\b/);

  // And the request's own line about the booking.
  const ticketNo = body.match(/CS-\d{6}/)![0];
  await page.goto(`${BUYER_URL}/help/requests/${ticketNo}`);
  const thread = await page.locator("body").innerText();
  expect(thread).not.toMatch(/\d{4}-\d{2}-\d{2}/); // the raw date the database gives
  expect(thread).toMatch(/(सोम|मंगल|बुध|गुरु|शुक्र|शनि|रवि), \d{1,2}/);
  expect(errors).toEqual([]);
  await ctx.close();
});
