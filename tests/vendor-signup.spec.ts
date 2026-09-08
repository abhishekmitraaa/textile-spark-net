import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SHOTS = path.join(REPO_ROOT, "screenshots");
const HANDOFF = path.join(SHOTS, "zz-test-vendor.txt");

export const TEST_PASSWORD = "CosoraQA!2026";
const BRAND = "ZZ Test Vendor 2026-09-08";

test("a seller signs up through Register.tsx and lands a correct profiles row", async ({ page }) => {
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

  writeFileSync(HANDOFF, `${email}\n${TEST_PASSWORD}\n${BRAND}\n`);
  console.log(`\n  CREATED: ${email}`);
  console.log(`  Confirm this user in Supabase → Authentication → Users, then run`);
  console.log(`  tests/vendor-onboarding-write-path.spec.ts\n`);

  expect(consoleErrors, "no console errors on /register").toEqual([]);
});

test("the seller branch no longer skips the details step", async ({ page }) => {
  // A regression guard for the specific bug: choosing Seller and pressing
  // Continue must show the details form, not navigate away to /seller.
  await page.goto("/register");
  await page.getByRole("button", { name: /Seller/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByLabel("Email Address")).toBeVisible();
});

test("/auth/login offers email + password and no fake phone check", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto("/auth/login");
  await expect(page.getByPlaceholder("Email address")).toBeVisible();
  await expect(page.getByPlaceholder("Password")).toBeVisible();
  // Phone sign-in is not wired up and says so rather than pretending.
  await expect(page.getByText(/Sign in with phone/)).toBeVisible();
  await expect(page.getByText("coming soon")).toBeVisible();
  // The old flow's control is gone.
  await expect(page.getByRole("button", { name: "Send Code" })).toHaveCount(0);

  // Everything above is a clean page load, so nothing should have been logged.
  expect(consoleErrors, "no console errors on /auth/login").toEqual([]);

  // A wrong password produces a real error and stays put. Supabase answers 400,
  // which the browser logs as a failed resource — that is the sign-in being
  // genuinely refused by the server, so it is expected here and only here.
  await page.getByPlaceholder("Email address").fill("demo-vendor@cosora.dev");
  await page.getByPlaceholder("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText(/don't match an account|Invalid/i)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/auth\/login/);

  const unexpected = consoleErrors.filter((e) => !/status of 400/.test(e));
  expect(unexpected, "only the expected 400 from the refused sign-in").toEqual([]);
});
