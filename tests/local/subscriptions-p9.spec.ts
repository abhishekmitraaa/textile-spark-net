/**
 * Subscriptions P9 (2026-10-09): account managers and priority support, on the local stack.
 *   * A Silver seller opens Account manager from the menu (the Cosora account team), writes; an
 *     account manager answers from Cosora-Admin's My vendors; the seller reads the answer and
 *     books a call, which the account manager closes.
 *   * A VIP seller with a named manager sees her name, the requirement she picked and the
 *     month's review.
 *   * A seller with no plan is sent to the plans; the support role has no My vendors.
 *   * The support inbox marks a VIP seller's request and puts it first.
 * The rules behind it are checked by scripts/subscriptions/p9_account_managers.sql and the
 * end-to-end run in test.md. afterEach removes what each test made.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, sql, watchErrors,
} from "./stack";

const FLAG = "account_managers";
const sellers: string[] = [];
const staff: string[] = [];

test.afterEach(() => {
  while (sellers.length) {
    const id = sellers.pop() as string;
    disallowFeature(FLAG, id);
    sql(`delete from public.account_manager_messages where vendor_id = '${id}';
         delete from public.account_manager_threads where vendor_id = '${id}';
         delete from public.account_manager_callbacks where vendor_id = '${id}';
         delete from public.account_manager_notes where vendor_id = '${id}';
         delete from public.vendor_account_managers where vendor_id = '${id}';
         delete from public.support_tickets where requester_id = '${id}' and subject like 'P9 spec%';
         delete from public.notifications where profile_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
  while (staff.length) sql(`update admin.admin_users set is_active = false where id = '${staff.pop()}';`);
});

async function seller(prefix: string, plan: string | null) {
  const who = await freshAccount(prefix, { seller: true });
  sellers.push(who.id);
  allowFeature(FLAG, who.id);
  if (plan) {
    sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
         values ('${who.id}', '${plan}', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  }
  return who;
}

async function staffMember(prefix: string, role: string, fullName: string) {
  const who = await freshAccount(prefix);
  staff.push(who.id);
  sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${who.id}', '${role}', true)
         on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
       update public.profiles set full_name = '${fullName}' where id = '${who.id}';`);
  return who;
}

test("a Silver seller writes to the account team, gets an answer, and books a call", async ({ browser }) => {
  test.setTimeout(180_000);
  const s = await seller("p9-silver", "silver");
  const am = await staffMember("p9-am", "account_manager", "Meera Iyer");

  const vctx = await contextWithSession(browser, s.session, { width: 1280, height: 1000 });
  const vpage = await vctx.newPage();
  const verrors = watchErrors(vpage);
  await vpage.goto(`${BUYER_URL}/leads`);
  await vpage.getByRole("link", { name: "Account manager", exact: true }).click();
  await expect(vpage).toHaveURL(/\/account-manager$/);
  await expect(vpage.getByTestId("am-header")).toContainText("Your Cosora account team");
  await vpage.getByPlaceholder("Write a message").fill("Can you help me with my catalogue?");
  await vpage.getByTestId("am-send").click();
  await expect(vpage.getByTestId("am-messages")).toContainText("Can you help me with my catalogue?");

  // Cosora-Admin: the account manager finds it on My vendors and answers.
  const actx = await contextWithSession(browser, am.session, { width: 1440, height: 1000 });
  const apage = await actx.newPage();
  const aerrors = watchErrors(apage);
  await apage.goto(`${ADMIN_URL}/my-vendors`);
  await apage.getByText("Shared team", { exact: true }).click();
  const row = apage.getByTestId("am-vendor-row").filter({ hasText: "p9-silver Textiles" });
  await expect(row).toContainText("1 unread");
  await row.click();
  const detail = apage.getByTestId("am-vendor-detail");
  await expect(detail.getByTestId("am-thread")).toContainText("Can you help me with my catalogue?");
  await detail.getByLabel("Reply").fill("Of course. Send me the file and I'll check it today.");
  await detail.getByTestId("am-send").click();
  await expect(detail.getByTestId("am-thread")).toContainText("Send me the file");

  // The seller reads it, signed by the team, and books a call.
  await vpage.reload();
  await expect(vpage.getByTestId("am-messages")).toContainText("Send me the file");
  await expect(vpage.getByTestId("am-messages")).toContainText("Cosora account team");
  await vpage.getByRole("tab", { name: "Call me back" }).click();
  await vpage.getByLabel("Time").selectOption("afternoon");
  await vpage.getByTestId("am-book-call").click();
  await expect(vpage.getByTestId("am-call")).toContainText("Your call is booked");

  // The account manager closes it.
  await apage.keyboard.press("Escape");
  await apage.reload();
  await apage.getByText("Shared team", { exact: true }).click();
  await apage.getByTestId("am-vendor-row").filter({ hasText: "p9-silver Textiles" }).click();
  await apage.getByTestId("am-callback-done").click();
  await expect.poll(() => sql(`select status from public.account_manager_callbacks where vendor_id = '${s.id}'`)).toBe("done");
  expect(verrors).toEqual([]);
  expect(aerrors).toEqual([]);
  await vctx.close();
  await actx.close();
});

test("a VIP seller sees their named manager, a requirement she picked and the month's review", async ({ browser }) => {
  test.setTimeout(120_000);
  const v = await seller("p9-vip", "vip");
  const am = await staffMember("p9-am-vip", "account_manager", "Asha Mehta");
  sql(`insert into public.vendor_account_managers (vendor_id, manager_id) values ('${v.id}', '${am.id}');
       insert into public.account_manager_notes (vendor_id, kind, author_id, author_label, body, period) values
         ('${v.id}', 'concierge', '${am.id}', 'Asha', 'A repeat buyer needs 2,000 polos. Quote by Friday.', null),
         ('${v.id}', 'success_review', '${am.id}', 'Asha', 'September: 4 quotes, 1 won. Next: reply within the hour.', date_trunc('month', now())::date);`);
  const ctx = await contextWithSession(browser, v.session, { width: 390, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/account-manager`);
  await expect(page.getByTestId("am-header")).toContainText("Your account manager");
  await expect(page.getByTestId("am-header")).toContainText("Asha");
  await page.getByRole("tab", { name: "Picked for you" }).click();
  await expect(page.getByTestId("am-concierge")).toContainText("A repeat buyer needs 2,000 polos.");
  await expect(page.getByTestId("am-concierge")).toContainText("Picked by Asha");
  await page.getByRole("tab", { name: "Monthly reviews" }).click();
  await expect(page.getByTestId("am-reviews")).toContainText("September: 4 quotes, 1 won.");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("no plan: sent to the plans; support has no My vendors; the inbox puts VIP first", async ({ browser }) => {
  test.setTimeout(150_000);
  const free = await seller("p9-free", null);
  let ctx = await contextWithSession(browser, free.session, { width: 1280, height: 1000 });
  let page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/account-manager`);
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("An account manager comes with Silver, Gold and VIP")).toBeVisible();
  await ctx.close();

  const v = await seller("p9-vip-support", "vip");
  sql(`insert into public.support_tickets (id, requester_id, requester_side, channel, category, subject, status, is_test, created_at)
       values (gen_random_uuid(), '${v.id}', 'vendor', 'chat', 'other', 'P9 spec VIP needs help', 'open', true, now() - interval '5 minutes');
       insert into public.support_ticket_staff (ticket_id) select id from public.support_tickets where subject = 'P9 spec VIP needs help';
       insert into public.support_messages (ticket_id, author_id, author_kind, body)
         select id, '${v.id}', 'requester', 'help' from public.support_tickets where subject = 'P9 spec VIP needs help';`);
  const sup = await staffMember("p9-support", "support", "Sam Support");
  ctx = await contextWithSession(browser, sup.session, { width: 1440, height: 1000 });
  page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/my-vendors`);
  await expect(page.getByText("Section not available for your role")).toBeVisible();
  await expect(page.getByRole("link", { name: "My vendors" })).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/support`);
  const first = page.locator("tbody tr").first();
  await expect(first).toContainText("P9 spec VIP needs help");
  await expect(first).toContainText("VIP");
  await expect(first.getByTestId("support-reply-target")).toContainText("reply by");
  expect(errors).toEqual([]);
  await ctx.close();
});
