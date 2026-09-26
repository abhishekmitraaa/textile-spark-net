import { test, expect, type Browser } from "@playwright/test";
import { hasCredentials, demoPasswordFor, optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Managers assign teammates' roles (Mitra, 2026-09-26).
 *
 * Migration 20260925210601 lets a manager add, change and remove teammates in the
 * five team roles, and nothing else; Cosora-Admin's Admins page follows it.
 *   1. manager: "Admins" is in the nav (moderation still isn't). Super admins,
 *      the other manager and their own row are read-only, with Remove disabled.
 *      A teammate's role, the invite role and the grant role offer the five team
 *      roles only. Changing the teammate's role works, and the Admin Log shows it
 *      as the manager's. The role is put back.
 *   2. super admin: every role is still offered, and their own row is locked.
 * The database side (every refusal, invites, the log) is
 * scripts/manager-team-roles-check.mjs.
 *
 * ACCOUNTS: demo-admin, and the run-only fixtures rlstest-manager,
 * rlstest-manager2 and rlstest-support (FIXTURE_PASSWORD; created for the run,
 * then dropped).
 * WRITES: rlstest-support's role, changed and put back, and the two Admin Log rows
 * that makes. Log rows are permanent by design.
 * The screenshot masks every admin row except demo-admin and the fixtures.
 * Needs Cosora-Admin on :5174 (ADMIN_APP_URL overrides).
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const ADMIN_URL = process.env.ADMIN_APP_URL ?? "http://localhost:5174";
const SHOTS = path.join(REPO_ROOT, "screenshots");
const ADMIN = "demo-admin@cosora.dev";
const MANAGER = "rlstest-manager@cosora.test";
const MANAGER2 = "rlstest-manager2@cosora.test";
const SUPPORT = "rlstest-support@cosora.test";
const TEAM_LABELS = ["Product moderator", "Vendor ops", "Ads moderator", "Finance admin", "Support (read-only)"];
const ALL_LABELS = ["Super admin", ...TEAM_LABELS, "Manager"];

test.skip(!hasCredentials("DEMO_ADMIN_PASSWORD", "FIXTURE_PASSWORD"), "set DEMO_ADMIN_PASSWORD and FIXTURE_PASSWORD, and seed the rlstest-* admins");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const passwordFor = (email: string) => (email === ADMIN ? demoPasswordFor(email) : optionalCredential("FIXTURE_PASSWORD"));
async function adminPage(browser: Browser, email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: passwordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(data.session)] as const);
  return { db, ctx, page: await ctx.newPage() };
}

test("manager: adds, changes and removes teammates in the team roles only", async ({ browser }) => {
  const { db, ctx, page } = await adminPage(browser, MANAGER);
  const supportId = ((await db.rpc("admin_list_admins")).data ?? []).find((a: { email: string }) => a.email === SUPPORT)?.id;
  try {
    await page.goto(`${ADMIN_URL}/`, { waitUntil: "networkidle" });
    const nav = page.locator("aside");
    await expect(nav.getByRole("link", { name: "Admins", exact: true })).toBeVisible();
    for (const hidden of ["Products", "FAQs", "Accounts", "Subscriptions"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true }), `${hidden} is hidden from a manager`).toHaveCount(0);
    }
    await nav.getByRole("link", { name: "Admins", exact: true }).click();
    await page.waitForURL("**/admins");

    const row = (email: string) => page.locator("tr").filter({ hasText: email });
    await expect(row(SUPPORT)).toBeVisible({ timeout: 15_000 });
    for (const email of [ADMIN, MANAGER2]) {
      await expect(row(email).getByRole("combobox"), `${email}'s role is read-only`).toHaveCount(0);
      await expect(row(email)).toContainText("Super admin only");
      await expect(row(email).getByRole("button", { name: "Remove admin" })).toBeDisabled();
    }
    await expect(row(MANAGER).getByRole("combobox"), "their own role is read-only").toHaveCount(0);
    await expect(row(MANAGER).getByRole("button", { name: "Remove admin" })).toBeDisabled();

    const role = row(SUPPORT).getByRole("combobox");
    await expect(role.locator("option")).toHaveText(TEAM_LABELS);
    await expect(row(SUPPORT).getByRole("button", { name: "Remove admin" })).toBeEnabled();
    await expect(page.locator("#invite-role option")).toHaveText(TEAM_LABELS);
    await expect(page.locator("#promote-role option")).toHaveText(TEAM_LABELS);
    await expect(page.getByText("As a manager you add, change and remove teammates")).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS, "mgr-admins-manager.png"),
      fullPage: true,
      mask: [page.locator("tbody tr").filter({ hasNotText: /rlstest-|demo-admin@/ })],
    });

    // Change the teammate's role, then put it back.
    await role.selectOption("vendor_ops");
    await expect(page.getByText("Role updated").first()).toBeVisible();
    await expect(role).toHaveValue("vendor_ops");
    await role.selectOption("support");
    await expect(role).toHaveValue("support");

    // The Admin Log has it, as the manager's.
    await nav.getByRole("link", { name: "Admin Log" }).click();
    await page.waitForURL("**/admin-log");
    await page.getByLabel("Area").selectOption("admin.admin_users");
    const change = page.locator("tr[data-log-id]").filter({ hasText: "admin_role: support → vendor_ops" }).first();
    await expect(change).toContainText("RLS Test Manager", { timeout: 15_000 });
    await expect(change).toContainText("Manager");
    await expect(change).toContainText("Admin access");
  } finally {
    // Put the teammate back if a step failed half-way.
    const now = ((await db.rpc("admin_list_admins")).data ?? []).find((a: { id: string }) => a.id === supportId);
    if (supportId && now?.admin_role !== "support") await db.rpc("admin_set_role", { p_user_id: supportId, p_role: "support" });
    await ctx.close();
  }
});

test("super admin: every role is still offered, and their own row is locked", async ({ browser }) => {
  const { ctx, page } = await adminPage(browser, ADMIN);
  try {
    await page.goto(`${ADMIN_URL}/admins`, { waitUntil: "networkidle" });
    const row = (email: string) => page.locator("tr").filter({ hasText: email });
    await expect(row(SUPPORT).getByRole("combobox").locator("option")).toHaveText(ALL_LABELS, { timeout: 15_000 });
    await expect(row(MANAGER2).getByRole("combobox")).toHaveValue("manager");
    await expect(row(MANAGER2).getByRole("button", { name: "Remove admin" })).toBeEnabled();
    await expect(row(ADMIN).getByRole("combobox")).toBeDisabled();
    await expect(page.locator("#invite-role option")).toHaveText(ALL_LABELS);
    await expect(page.locator("#promote-role option")).toHaveText(ALL_LABELS);
  } finally {
    await ctx.close();
  }
});
