/**
 * The 2026-10-13 batch, on the local stack: review reports, admin activity and the delivery team.
 * (The GSTIN and PAN guard and every refusal are checked by scripts/todo-batch/harness.sql.)
 *
 *   1. A buyer reports a seller's review from the seller's page; the review's author gets no
 *      Report control on it. Support opens Cosora-Admin › Reported reviews, and Remove stays
 *      disabled until a reason is typed. Removing deletes the review and tells its author. A super
 *      admin then finds support's page visit on the Admin Log's Activity tab.
 *   2. A delivery-team member lands on Certificates and is offered no other section.
 *
 * afterEach removes what each run made. Activity rows and Admin Log rows stay: they are the record.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql, watchErrors,
} from "./stack";

const tag = Date.now().toString(36);
const reviews: string[] = [];
const staff: string[] = [];

test.afterEach(() => {
  for (const id of reviews.splice(0)) {
    sql(`delete from admin.review_reports where review_id = '${id}';
         delete from public.reviews where id = '${id}';`);
  }
  for (const id of staff.splice(0)) sql(`update admin.admin_users set is_active = false where id = '${id}';`);
});

test("a buyer reports a review; support removes it; the author is told; the visit is on the Activity tab", async ({ browser }) => {
  test.setTimeout(240_000);
  const seller = await freshAccount(`rrseller${tag}`, { seller: true });
  const author = await freshAccount(`rrauthor${tag}`);
  const reporter = await freshAccount(`rrreporter${tag}`);
  const body = `RR invented praise ${tag}`;
  const reviewId = sql(`insert into public.reviews (vendor_id, buyer_id, rating, body, reviewer_name)
                        values ('${seller.id}', '${author.id}', 5, '${body}', 'RR Author') returning id;`).split("\n")[0];
  reviews.push(reviewId);
  const reports = () => sql(`select count(*) || '|' || coalesce(string_agg(distinct status, ','), '-') from admin.review_reports where review_id = '${reviewId}'`);

  // The author sees their review, with nothing to report.
  const authorCtx = await contextWithSession(browser, author.session, { width: 1280, height: 900 });
  const authorPage = await authorCtx.newPage();
  await authorPage.goto(`${BUYER_URL}/vendor/${seller.id}`);
  const ownCard = authorPage.locator("div.rounded-xl").filter({ hasText: body }).last();
  await expect(ownCard).toBeVisible();
  await expect(ownCard.getByRole("button", { name: "Report" })).toHaveCount(0);
  await authorCtx.close();

  // Another buyer reports it.
  const reporterCtx = await contextWithSession(browser, reporter.session, { width: 1280, height: 900 });
  const page = await reporterCtx.newPage();
  const pageErrors = watchErrors(page);
  await page.goto(`${BUYER_URL}/vendor/${seller.id}`);
  const card = page.locator("div.rounded-xl").filter({ hasText: body }).last();
  await card.getByRole("button", { name: "Report" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Report this review" })).toBeVisible();
  const send = sheet.getByRole("button", { name: "Report review" });
  await expect(send).toBeDisabled();
  await sheet.getByLabel("Fake or not a real customer").check();
  await sheet.getByLabel("Note").fill("We never dealt with this buyer.");
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/report-sheet.png" });
  await send.click();
  await expect(page.getByText("Review reported")).toBeVisible();
  await expect.poll(reports).toBe("1|open");
  await expect(card.getByRole("button", { name: "Reported" })).toBeDisabled();
  expect(pageErrors).toEqual([]);
  await reporterCtx.close();

  // Support decides it in Cosora-Admin.
  const supportCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const admin = await supportCtx.newPage();
  const adminErrors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/support`);
  await admin.getByRole("link", { name: "Reported reviews" }).click();
  await expect(admin).toHaveURL(/\/review-reports$/);
  const queued = admin.locator(`[data-review-report="${reviewId}"]`);
  await expect(queued).toContainText(body);
  await expect(queued).toContainText("Fake or not a real customer");
  await expect(queued).toContainText("We never dealt with this buyer.");
  await expect(queued).toContainText(`rrseller${tag} Textiles`);
  if (process.env.SHOTS) await admin.screenshot({ path: process.env.SHOTS + "/review-queue.png" });
  await queued.getByRole("button", { name: "Remove review" }).click();
  const confirm = admin.getByRole("dialog").getByRole("button", { name: "Remove review" });
  await expect(confirm).toBeDisabled();
  await admin.getByLabel("Reason").fill("Not a real customer of this seller.");
  await confirm.click();
  await expect.poll(reports).toBe("1|removed");
  expect(sql(`select count(*) from public.reviews where id = '${reviewId}'`)).toBe("0");
  await expect(queued).toHaveCount(0);

  // The author is told, in Cosora's words; the reporter and the seller are told nothing.
  expect(sql(`select count(*) || '|' || bool_and(body !~* 'report')::text from public.notifications
              where profile_id = '${author.id}' and kind = 'review_removed'`)).toBe("1|true");
  expect(sql(`select count(*) from public.notifications
              where profile_id in ('${reporter.id}', '${seller.id}') and kind = 'review_removed'`)).toBe("0");

  await admin.getByRole("button", { name: "Removed", exact: true }).click();
  await expect(admin.locator(`[data-review-report="${reviewId}"]`)).toContainText("Not a real customer of this seller.");
  expect(adminErrors).toEqual([]);
  await supportCtx.close();

  // Support's visit was recorded, and a super admin reads it.
  expect(Number(sql(`select count(*) from admin.activity_views v join public.profiles p on p.id = v.actor_id
                     where p.email = 'local-support@cosora.test' and v.kind = 'page' and v.path = '/review-reports'
                       and v.at > now() - interval '5 minutes'`))).toBeGreaterThan(0);
  const superCtx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const log = await superCtx.newPage();
  const logErrors = watchErrors(log);
  await log.goto(`${ADMIN_URL}/admin-log`);
  await log.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(log.getByRole("columnheader", { name: "Pages opened" })).toBeVisible();
  await log.getByLabel("Kind").selectOption("page");
  await expect(log.getByRole("link", { name: "/review-reports" }).first()).toBeVisible();
  if (process.env.SHOTS) await log.screenshot({ path: process.env.SHOTS + "/activity-tab.png" });
  expect(logErrors).toEqual([]);
  await superCtx.close();
});

test("the delivery team works Certificates and is offered nothing else", async ({ browser }) => {
  const who = await freshAccount(`rrdelivery${tag}`);
  staff.push(who.id);
  sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${who.id}', 'delivery_team', true)
       on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;`);
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/`);
  await expect(page).toHaveURL(/\/certificates$/);
  await expect(page.getByRole("heading", { name: /Certificates/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Certificates" })).toBeVisible();
  for (const hidden of ["Vendors", "Payments", "Subscriptions", "Reported reviews", "Admin Log", "Admins"]) {
    await expect(page.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
