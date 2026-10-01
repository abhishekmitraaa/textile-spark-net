/**
 * Staff registration (2026-10-01) end to end on the local stack: a super admin registers a
 * support staff member; with Resend not configured the temporary password is shown once;
 * the new person signs in with it, is made to choose their own, and lands in the panel
 * with Support access. A manager can register only the team roles.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, signedInContext, sql, watchErrors } from "./stack";

const stamp = Date.now().toString(36);

test.afterAll(() => {
  // Local only: drop the accounts this spec registered.
  sql(`delete from auth.users where id in (select user_id from admin.staff_members where personal_email like 'p7-%@example.com');`);
});

test("a super admin registers a support staff member, who must choose a password at first sign-in", async ({ browser }) => {
  const adminCtx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await adminCtx.newPage();
  const errors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/admins`);
  await expect(admin.getByText("Register a staff member").first()).toBeVisible();
  await admin.locator("#staff-name").fill("Asha Patel");
  await admin.locator("#staff-email").fill(`p7-asha-${stamp}@example.com`);
  await admin.locator("#staff-phone").fill("98765 43210");
  await admin.locator("#staff-role").selectOption("support");
  await admin.getByRole("button", { name: "Register", exact: true }).click();

  await expect(admin.getByText(/Asha Patel is registered\. The email didn't go, so give them the password yourself\./)).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByText("Email isn't set up yet (Resend, ToDo.md).", { exact: false })).toBeVisible();
  const employeeId = (await admin.locator("span.font-mono").first().innerText()).trim();
  expect(employeeId).toMatch(/^EMP-\d{4,}$/);
  const workEmail = sql(`select work_email from admin.staff_members where personal_email = 'p7-asha-${stamp}@example.com'`);
  expect(workEmail).toMatch(/^asha\.patel\d*@cosora\.in$/);
  const temporary = (await admin.locator("code").first().innerText()).trim();
  expect(temporary.length).toBeGreaterThanOrEqual(16);

  // The directory lists them, password still temporary; the Admin Log has the insert.
  await expect(admin.getByText(employeeId).first()).toBeVisible();
  await expect(admin.getByText("Temporary, not yet changed").first()).toBeVisible();
  expect(Number(sql(`select count(*) from admin.audit_log where target_table = 'admin.staff_members' and action = 'insert'`))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await adminCtx.close();

  // First sign-in with the temporary password.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').fill(workEmail);
  await page.locator('input[type="password"]').fill(temporary);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Choose your password")).toBeVisible();
  await page.locator("#new-password").fill("short1");
  await page.locator("#confirm-password").fill("short1");
  await page.getByRole("button", { name: "Save password and continue" }).click();
  await expect(page.getByText("Use at least 10 characters, with letters and numbers.")).toBeVisible();
  await page.locator("#new-password").fill(`Fresh-pass-${stamp}9`);
  await page.locator("#confirm-password").fill(`Fresh-pass-${stamp}9`);
  await page.getByRole("button", { name: "Save password and continue" }).click();
  await expect(page.getByText("Choose your password")).toHaveCount(0, { timeout: 20_000 });
  await page.goto(`${ADMIN_URL}/support`);
  await expect(page.getByText("Support inbox").first()).toBeVisible();
  expect(sql(`select (password_changed_at is not null)::text from admin.staff_members where work_email = '${workEmail}'`)).toBe("true");
  await ctx.close();
});

test("a manager can register only the team roles", async ({ browser }) => {
  const ctx = await signedInContext(browser, "manager", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/admins`);
  await expect(page.locator("#staff-role option").first()).toBeAttached();
  const roles = await page.locator("#staff-role option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(roles.length).toBeGreaterThan(0);
  expect(roles).not.toContain("super_admin");
  expect(roles).not.toContain("manager");
  await ctx.close();
});
