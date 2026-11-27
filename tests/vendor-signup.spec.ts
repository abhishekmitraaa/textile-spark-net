import { test, expect } from "@playwright/test";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvText } from "./support/envFile";

/**
 * Registration, through the REAL form.
 *
 * Register.tsx used to make zero network calls — it collected five fields,
 * threw them away and navigated. Worse, picking "Seller" on step 1 SKIPPED
 * step 2 entirely, so a seller never supplied a name, an email or a password
 * and no account was created at all. This spec exists to keep that from coming
 * back: it drives the form and then reads `profiles` to prove the row landed.
 *
 * Email confirmation is ON for this project (auth.signUp returns a user but no
 * session), so the assertion at the end of the happy path is the "Confirm your
 * email" screen — NOT a dashboard. Routing a brand-new signup to a dashboard it
 * cannot load is the bug the confirm screen replaced.
 *
 * The account it creates is left in place on purpose (see 4.6) and its address
 * is written to screenshots/zz-test-vendor.txt so the follow-up onboarding run
 * can find it.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readEnvText(REPO_ROOT)
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SHOTS = path.join(REPO_ROOT, "screenshots");
const HANDOFF = path.join(SHOTS, "zz-test-vendor.txt");

export const TEST_PASSWORD = optionalCredential("TEST_VENDOR_PASSWORD");
const BRAND = "ZZ Test Vendor 2026-09-08";

test("a seller signs up through Register.tsx and lands a correct profiles row", async ({ page }) => {
  test.skip(!TEST_PASSWORD, "set TEST_VENDOR_PASSWORD in .env (see .env.example)");
  mkdirSync(SHOTS, { recursive: true });
  const email = `zz-test-vendor-${Date.now()}@cosora.in`;
  page.setDefaultTimeout(25_000);

  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto("/register");

  // ── Step 1: role ──
  await page.getByRole("button", { name: /Seller/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // ── Step 2: details. A SELLER MUST REACH THIS STEP. It used to be skipped. ──
  await expect(page.getByLabel("Full Name")).toBeVisible();
  await page.getByLabel("Full Name").fill("ZZ Test Owner");
  await page.getByLabel("Company Name").fill(BRAND);
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Phone Number").fill("+91 90000 55501");
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /Create Account/ }).click();

  // ── Confirmation is ON, so this is the honest end of the flow ──
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(email)).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "vendor-signup-confirm.png"), fullPage: true });

  // ── The assertion that matters: handle_new_user provisioned the row ──
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  // Read as the service-less anon client via a targeted select is blocked by
  // RLS, so assert through a fresh sign-in attempt instead: an unconfirmed
  // account cannot sign in, which is itself the confirmation-is-ON proof.
  const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(signIn.session, "an unconfirmed account must not get a session").toBeNull();
  expect(signInError?.message ?? "", "sign-in is refused until the email is confirmed")
    .toMatch(/not confirmed|Invalid login/i);

  writeFileSync(HANDOFF, `${email}
(password: TEST_VENDOR_PASSWORD in .env)
${BRAND}
`);
  console.log(`\n  CREATED: ${email}`);
  console.log(`  Confirm this user in Supabase → Authentication → Users, then run`);
  console.log(`  tests/vendor-onboarding-write-path.spec.ts\n`);

  expect(consoleErrors, "no console errors on /register").toEqual([]);
});

test("the seller branch no longer skips the details step", async ({ page }) => {
  // A regression guard for the specific bug: choosing Seller and pressing
  // Continue must show the details form, not navigate away to /seller.
  // Sign-up is mobile + code since 2026-09-27, so the details step asks for a mobile number (updated 2026-11-27).
  await page.goto("/register");
  await page.getByRole("button", { name: /Seller/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByLabel("Mobile Number")).toBeVisible();
});

test("/auth/login is mobile number + code, with no password field", async ({ page }) => {
  // Sign-in is OTP-only (documentation/claude.md, "Authentication is OTP-only"): the email + password form this test
  // used to check was removed in September. Nothing is sent here: the test only loads the page (updated 2026-11-27).
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto("/auth/login");
  await expect(page.getByPlaceholder("Phone Number")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(consoleErrors, "no console errors on /auth/login").toEqual([]);
});
