import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dummy OTP: any 6 digits sign in (2026-09-27).
 *
 * No SMS can be sent yet, so the code screen used to say "no code was sent"
 * and nobody could get past it. Now, when Supabase refuses the send, the
 * `otp-dev-verify` edge function accepts any 6 digits and returns a real
 * session for the number (src/lib/auth/otp.ts). It is a sign-in bypass by
 * design; see documentation/securityflags.md (2026-09-27).
 *
 *   1. Login: the code screen says test mode (no "code sent", nothing to
 *      resend), and any 6 digits sign in as that number's account.
 *   2. Register: the same, from the signup form.
 *
 * ACCOUNT: one probe account for +1 555-010-0001 (the 555-01xx range is
 * reserved as fictional), created by the first run and reused by every run
 * after, so the spec creates nothing new. Tracking RPCs are answered in the
 * browser. Requires `npm run dev` on :8080.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const STORAGE_KEY = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const SHOTS = path.join(REPO_ROOT, "screenshots");
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;

const PROBE_DIGITS = "5550100001";
const PROBE_EMAIL = `p1${PROBE_DIGITS}@phone.cosora.invalid`;
const SIGNED_IN_ROUTE = /\/(auth\/role-selection|home\/new-arrivals|onboarding|seller-home)$/;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.route(TRACKING, (route) => route.fulfill({ status: 204, body: "" }));
});

/** On the code screen: test mode is stated, then any 6 digits sign in. */
async function enterAnyCode(page: Page, shot: string) {
  await expect(page).toHaveURL(/\/auth\/otp-verify$/);
  const notice = page.getByTestId("otp-test-mode");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("no code was sent");
  await expect(notice).toContainText("type any 6 digits");
  // Nothing was sent, so nothing claims it was, and there is nothing to resend.
  await expect(page.getByText("You will receive an OTP")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Resend OTP|Try sending the code again/ })).toHaveCount(0);

  const next = page.getByRole("button", { name: "Next" });
  await expect(next).toBeDisabled();
  await page.getByLabel("One-time code").pressSequentially("482913");
  await expect(next).toBeEnabled();
  await page.waitForTimeout(400); // let the last box and the button finish animating
  await page.screenshot({ path: path.join(SHOTS, shot) });
  await next.click();

  await expect(page).toHaveURL(SIGNED_IN_ROUTE, { timeout: 30_000 });
  const session = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), STORAGE_KEY);
  expect(session?.user?.email, "signed in as the number's own account").toBe(PROBE_EMAIL);
  expect(session?.user?.app_metadata?.created_by).toBe("otp-dev-verify");
}

test("login: any 6 digits sign in as the typed number", async ({ page }) => {
  await page.goto("/auth/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /\+91/ }).click();
  await page.getByRole("button", { name: /United States/ }).click();
  await page.getByPlaceholder("Phone Number").fill(PROBE_DIGITS);
  await page.getByRole("button", { name: "Send Code" }).click();
  await enterAnyCode(page, "dummy-otp-login.png");
});

test("register: any 6 digits finish signup from the form", async ({ page }) => {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Buyer/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full Name").fill("OTP Probe");
  await page.getByLabel(/Brand Name/).fill("OTP Probe");
  await page.getByLabel("Country code").selectOption({ label: "🇺🇸 +1" });
  await page.getByPlaceholder("Phone Number").fill(PROBE_DIGITS);
  await page.getByRole("button", { name: /Send Code/ }).click();
  await enterAnyCode(page, "dummy-otp-register.png");
});
