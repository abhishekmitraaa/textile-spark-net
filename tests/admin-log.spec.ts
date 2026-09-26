import { test, expect, type Browser } from "@playwright/test";
import { hasCredentials, demoPasswordFor, optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Admin Log in Cosora-Admin (MPF-26, 2026-09-25).
 *
 * Migration 20260925174031 records every admin change (a trigger on each table the
 * panel writes), admin sign-ins and sign-outs, and the edge functions' invites and
 * refunds in admin.audit_log, append-only. /admin-log shows it to super_admin and
 * the new manager role (20260925173658) only.
 *   1. super_admin: signs in through the real login form (a "Signed in" row),
 *      changes an FAQ answer and puts it back through admin_faq_update (the FAQ
 *      page's own RPC), and the log shows both changes with the admin's name and
 *      role, the IST date and time, and the answer before and after. Signing out
 *      from the panel adds a "Signed out" row.
 *   2. manager: sees the Admin Log and Admins in the nav and no moderation
 *      section; the page lists the entries; /faqs is not available to it.
 *   3. product_moderator: /admin-log is not available, and the RPC refuses it.
 *
 * ACCOUNTS: demo-admin, and the run-only fixtures rlstest-manager and
 * rlstest-productmod (FIXTURE_PASSWORD; created for the run, then dropped).
 * WRITES: two FAQ edits that restore the answer exactly, and the log rows they and
 * the sign-in and sign-out produce. Log rows are permanent by design.
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
const PRODUCT_MOD = "rlstest-productmod@cosora.test";

test.skip(!hasCredentials("DEMO_ADMIN_PASSWORD", "FIXTURE_PASSWORD"), "set DEMO_ADMIN_PASSWORD and FIXTURE_PASSWORD, and seed the rlstest-* admins");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const passwordFor = (email: string) => (email === ADMIN ? demoPasswordFor(email) : optionalCredential("FIXTURE_PASSWORD"));
async function signIn(email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: passwordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session };
}
async function adminPage(browser: Browser, email: string) {
  const { db, session } = await signIn(email);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  return { db, ctx, page: await ctx.newPage() };
}
async function lastLogId(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.rpc("admin_audit_log_list", { p_limit: 1 });
  if (error) throw new Error(`admin_audit_log_list: ${error.message}`);
  return data?.[0]?.id ?? 0;
}

test("super_admin: sign-in, an FAQ change and its undo, and sign-out are all in the Admin Log", async ({ browser }) => {
  const { db } = await signIn(ADMIN);
  const since = await lastLogId(db);
  const { data: faqs } = await db.rpc("admin_faq_list");
  const faq = (faqs as { id: string; answer: string; surface: string; active: boolean }[])
    .find((f) => f.surface === "buyer_help" && f.active)!;
  const MARK = `[P27 Admin Log test ${Date.now()}]`;

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  try {
    // Sign in through the real form.
    await page.goto(`${ADMIN_URL}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').fill(ADMIN);
    await page.locator('input[type="password"]').fill(passwordFor(ADMIN)!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("link", { name: "Admin Log" })).toBeVisible({ timeout: 20_000 });

    // Change an FAQ answer and put it back, through the FAQ page's RPC.
    const set = await db.rpc("admin_faq_update", { p_id: faq.id, p_answer: MARK });
    expect(set.error).toBeNull();
    const back = await db.rpc("admin_faq_update", { p_id: faq.id, p_answer: faq.answer });
    expect(back.error).toBeNull();

    await page.getByRole("link", { name: "Admin Log" }).click();
    await page.waitForURL("**/admin-log");
    await page.getByLabel("Area").selectOption("public.faqs");
    const rows = page.locator("tr[data-log-id]").filter({ hasText: MARK.slice(0, 30) });
    await expect(rows).toHaveCount(2, { timeout: 15_000 });
    const change = rows.nth(1); // newest first: the undo is on top
    await expect(change).toContainText("Demo Admin");
    await expect(change).toContainText("Super admin");
    await expect(change).toContainText("Changed");
    await expect(change).toContainText("FAQ");
    // en-IN's short month is 3 or 4 letters ("Sept").
    await expect(change).toContainText(/\d{1,2} [A-Z][a-z]{2,3} 2026, \d{2}:\d{2}:\d{2} IST/);
    await expect(change).toContainText(`answer: ${faq.answer.slice(0, 20)}`);
    await expect(change).toContainText(`→ ${MARK}`);
    await page.locator("table").screenshot({ path: path.join(SHOTS, "mpf26-admin-log-faq.png") });

    await page.getByLabel("Area").selectOption("");
    await page.getByLabel("Action").selectOption("sign_in");
    await expect(page.locator("tr[data-log-id]").filter({ hasText: "Demo Admin" }).first()).toContainText("Signed in to the admin panel");

    // Sign out from the panel.
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
  } finally {
    await ctx.close();
  }

  // What the database recorded for this run, in order.
  const { data: rows } = await db.rpc("admin_audit_log_list", { p_limit: 50 });
  const mine = (rows as { id: number; action: string; target_table: string | null; actor_role: string; changes: Record<string, { from: unknown; to: unknown }> }[])
    .filter((r) => r.id > since).reverse();
  const summary = mine.map((r) => `${r.action}${r.target_table ? ` ${r.target_table}` : ""}`);
  console.log(`logged this run: ${summary.join(", ")}`);
  expect(summary).toEqual(["sign_in", "update public.faqs", "update public.faqs", "sign_out"]);
  expect(mine[1].changes.answer.to).toBe(MARK);
  expect(mine[2].changes.answer.from).toBe(MARK);
  expect(mine[2].changes.answer.to).toBe(faq.answer);
  expect(mine.every((r) => r.actor_role === "super_admin")).toBe(true);

  const now = (await db.rpc("admin_faq_list")).data as { id: string; answer: string }[];
  expect(now.find((f) => f.id === faq.id)?.answer, "the FAQ answer is restored").toBe(faq.answer);
});

test("manager: the Admin Log is its section, and moderation isn't", async ({ browser }) => {
  const { ctx, page } = await adminPage(browser, MANAGER);
  try {
    await page.goto(`${ADMIN_URL}/`, { waitUntil: "networkidle" });
    const nav = page.locator("aside");
    await expect(nav.getByRole("link", { name: "Admin Log" })).toBeVisible();
    // Since 2026-09-26 a manager also manages teammates on the Admins page
    // (tests/admins-manager.spec.ts).
    await expect(nav.getByRole("link", { name: "Admins", exact: true })).toBeVisible();
    for (const hidden of ["Products", "FAQs", "Accounts", "Subscriptions"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true }), `${hidden} is hidden from a manager`).toHaveCount(0);
    }
    await expect(nav).toContainText("Manager");
    await nav.getByRole("link", { name: "Admin Log" }).click();
    await page.waitForURL("**/admin-log");
    await expect(page.locator("tr[data-log-id]").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SHOTS, "mpf26-admin-log-manager.png") });
    await page.goto(`${ADMIN_URL}/faqs`, { waitUntil: "networkidle" });
    await expect(page.getByText("Section not available for your role")).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("product_moderator: no Admin Log, in the panel or in the database", async ({ browser }) => {
  const { db, ctx, page } = await adminPage(browser, PRODUCT_MOD);
  try {
    await page.goto(`${ADMIN_URL}/admin-log`, { waitUntil: "networkidle" });
    await expect(page.getByText("Section not available for your role")).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: "Admin Log" })).toHaveCount(0);
    const { error } = await db.rpc("admin_audit_log_list", { p_limit: 1 });
    expect(error?.code).toBe("42501");
  } finally {
    await ctx.close();
  }
});
