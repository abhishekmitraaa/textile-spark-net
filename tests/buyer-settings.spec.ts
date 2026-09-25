import { test, expect, type Browser } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The buyer sidebar's "Settings" lands on the buyer Settings page
 * (/profile/settings), not /profile (2026-09-23). The vendor's still lands on
 * /settings.
 *
 * The sidebar (DashboardSidebar) only renders inside DashboardLayout, and the
 * buyer page that uses it is /notifications, so that is where the click starts.
 *
 * ACCOUNTS: demo-buyer and demo-vendor. Read-only: nothing is saved, and
 * neither Log Out nor Delete is pressed. Requires `npm run dev` on :8080.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const SHOTS = path.join(REPO_ROOT, "screenshots");
const BUYER = "demo-buyer@cosora.dev";
const VENDOR = "demo-vendor@cosora.dev";

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD", "DEMO_VENDOR_PASSWORD"), "set DEMO_BUYER_PASSWORD and DEMO_VENDOR_PASSWORD in .env");

async function pageAs(browser: Browser, email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(data.session)] as const);
  return { ctx, page: await ctx.newPage() };
}

test("buyer sidebar Settings opens the buyer Settings page, not /profile", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, BUYER);

  await page.goto("/notifications", { waitUntil: "networkidle" });
  const settingsLink = page.getByRole("link", { name: "Settings", exact: true });
  await expect(settingsLink).toHaveCount(1);
  await settingsLink.click();
  await page.waitForURL("**/profile/settings");
  expect(new URL(page.url()).pathname).toBe("/profile/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // Account and security content only.
  for (const label of ["Security", "Your data", "Delete account", "Help & Legal"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Account email")).toBeVisible();
  await expect(page.getByText(BUYER)).toBeVisible();
  await expect(page.getByText("there's no password to manage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();
  // Not a copy of My Profile's identity/business forms.
  await expect(page.getByLabel("Business Name")).toHaveCount(0);
  // The sections fade in one after another (framer-motion stagger, under 1 s).
  // Without the wait the evidence screenshot catches them mid-fade.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SHOTS, "buyer-settings.png"), fullPage: true });

  await page.getByRole("button", { name: /Download your data/ }).click();
  await page.waitForURL("**/profile/data-export");

  // The /profile entry point, and "My Profile" still going to /profile.
  await page.goto("/profile", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Account & Security" }).click();
  await page.waitForURL("**/profile/settings");
  await page.goto("/notifications", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "My Profile", exact: true }).click();
  await page.waitForURL(/\/profile$/);
  await ctx.close();
});

test("vendor sidebar Settings still opens the vendor Settings page", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, VENDOR);
  await page.goto("/notifications", { waitUntil: "networkidle" });
  // A vendor's page load starts on the seller side (profiles.active_role,
  // MPF-13 fixed in Phase 17), so no switching is needed first.
  await expect(page.getByRole("link", { name: "Upload Product", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.waitForURL(/\/settings$/);
  expect(new URL(page.url()).pathname).toBe("/settings");
  await ctx.close();
});
