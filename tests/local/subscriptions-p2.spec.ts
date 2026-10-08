/**
 * Subscriptions P2 (2026-10-08): notification delivery, on the local stack.
 *   * A seller the notification_delivery switch lists sees, in Settings, where Cosora reaches
 *     them, and turns WhatsApp alerts on: the opt-in is recorded with its history. A seller
 *     the switch doesn't list sees none of it.
 *   * Cosora-Admin's System Health shows the delivery outbox per channel, and a super admin
 *     queues a test to their own address.
 * The dispatcher itself is checked by scripts/subscriptions/notification-dispatch-check.mjs
 * and the end-to-end run in documentation/test.md (it needs a scheduled job and providers).
 * Cleanup is in afterEach: the switch's list and this run's test messages.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, stack, watchErrors,
} from "./stack";

const FLAG = "notification_delivery";
const listed: string[] = [];
let cleanAdminTests = false;

test.afterEach(() => {
  while (listed.length) disallowFeature(FLAG, listed.pop() as string);
  if (cleanAdminTests) {
    sql(`delete from admin.notification_outbox where template_key = 'delivery_test' and profile_id = '${stack().ids.admin}'`);
    cleanAdminTests = false;
  }
});

test("a listed seller sees where Cosora reaches them and turns WhatsApp alerts on", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await freshAccount("p2-wa", { seller: true });
  const owner = `owner-${who.id.slice(0, 8)}@example.com`;
  sql(`update public.vendor_profiles set owner_email = '${owner}', phone = '98765 43210' where id = '${who.id}'`);
  allowFeature(FLAG, who.id);
  listed.push(who.id);

  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/settings`);
  const card = page.getByTestId("whatsapp-alerts");
  await expect(card).toBeVisible();
  await expect(card).toContainText("+91 *******210");
  await expect(page.getByTestId("email-destination")).toHaveText(`Invoices and payment receipts are emailed to o${"*".repeat(owner.split("@")[0].length - 1)}@example.com.`);

  const toggle = page.getByRole("switch", { name: "WhatsApp alerts" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByText("WhatsApp alerts on")).toBeVisible();
  await expect(toggle).toBeChecked();
  expect(sql(`select opted_in || '/' || source from public.contact_consent where profile_id = '${who.id}' and channel = 'whatsapp'`)).toBe("true/vendor_settings");
  expect(sql(`select string_agg(opted_in::text, '>' order by id) from admin.contact_consent_log where profile_id = '${who.id}'`)).toBe("true");
  expect(errors).toEqual([]);
  await ctx.close();

  // Not on the switch: no WhatsApp section, no delivery promises.
  const other = await freshAccount("p2-off", { seller: true });
  const offCtx = await contextWithSession(browser, other.session, { width: 1280, height: 1000 });
  const offPage = await offCtx.newPage();
  await offPage.goto(`${BUYER_URL}/settings`);
  await expect(offPage.getByText("Notifications", { exact: true })).toBeVisible();
  await expect(offPage.getByTestId("whatsapp-alerts")).toHaveCount(0);
  await offCtx.close();
});

test("System Health shows notification delivery, and a super admin queues a test to themselves", async ({ browser }) => {
  cleanAdminTests = true;
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/system-health`);
  await expect(page.getByRole("heading", { name: "Notification delivery" })).toBeVisible();
  const table = page.getByTestId("notification-delivery");
  for (const label of ["Email", "WhatsApp", "SMS"]) await expect(table.getByRole("cell", { name: label, exact: true })).toBeVisible();

  const before = Number(sql(`select count(*) from admin.notification_outbox where template_key = 'delivery_test' and profile_id = '${stack().ids.admin}'`));
  await table.getByRole("row", { name: /^Email/ }).getByRole("button", { name: "Send a test" }).click();
  await expect(page.getByText(/^Test queued to l\*+@cosora\.test\./)).toBeVisible();
  expect(Number(sql(`select count(*) from admin.notification_outbox where template_key = 'delivery_test' and profile_id = '${stack().ids.admin}'
                       and channel = 'email' and status = 'queued'`))).toBe(before + 1);
  expect(errors).toEqual([]);
  await ctx.close();
});
