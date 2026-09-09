import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 4, Phase 1 — part 1 of 2.
 *
 * Creates a REAL account through the real /register form and stops at the
 * "Confirm your email" screen, which is where a real user stops too.
 *
 * It deliberately does not confirm the account: this project has no inbox for
 * the throwaway domain, so confirmation happens out of band (direct SQL against
 * auth.users, the equivalent of supabase.auth.admin.updateUserById with
 * email_confirm: true — there is no service-role key in this environment).
 * mp4-phase2-callback-onboarding.spec.ts picks up from there.
 *
 *   npx playwright test tests/mp4-phase1-register.spec.ts
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

export const SIGNUP = {
  email: "zz-mp4-vendor@cosora.in",
  password: "CosoraQA!2026",
  fullName: "Meridian Owner",
  phone: "9876500042",
  /**
   * The whole point of Phase 1. This string exists ONLY in auth user metadata
   * until applyPendingSignupProfile() runs, and it is deliberately different
   * from the business name typed later in onboarding so the two writes cannot
   * be confused for one another.
   */
  brandName: "Meridian Weaves",
};

test("MP4 P1.a — /register creates a real account and stops honestly at email confirmation", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.setDefaultTimeout(25_000);

  await page.goto("/register");

  // Step 1 — role. Picking Seller used to skip step 2 entirely; it must not.
  await page.locator("button").filter({ hasText: "Manufacturer / Supplier" }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 2 — the step a seller never used to reach.
  await expect(page.locator("#fullName")).toBeVisible();
  await page.locator("#fullName").fill(SIGNUP.fullName);
  await page.locator("#brandName").fill(SIGNUP.brandName);
  await page.locator("#email").fill(SIGNUP.email);
  await page.locator("#phone").fill(SIGNUP.phone);
  await page.locator("#password").fill(SIGNUP.password);

  await page.getByRole("button", { name: /Create Account/ }).click();

  // The honest ending: a signup with confirmation ON has no session, so this
  // must NOT route to a dashboard.
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(SIGNUP.email)).toBeVisible();

  console.log(`\n[MP4 P1.a] signed up ${SIGNUP.email} — confirm it, then run phase 2.\n`);
  expect(errors, "no console errors during signup").toEqual([]);
});
