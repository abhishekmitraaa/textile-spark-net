import { test, expect, type Browser, type Page, type Route } from "@playwright/test";
import { hasCredentials, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MPF-13: the side a page load starts on, and a database-backed vendorRegistered.
 *
 * UserRoleContext used to start every page load as "buyer", and vendorRegistered
 * lived only in localStorage. Now `role` is seeded from profiles.active_role
 * when the profile loads (a switch made after that stands until a reload), and
 * vendorRegistered is vendor_profiles.onboarding_complete, with localStorage only
 * a per-account hint until that read returns.
 *
 *   1. demo-vendor (active_role 'seller'), a browser with nothing stored: hard
 *      loads of /seller-home and /notifications show the seller sidebar with no
 *      switching. demo-vendor's onboarding_complete is false (seeded, never
 *      onboarded), and since MPF-22 (2026-09-25) only a seller who completed
 *      onboarding may use the buyer side: Switch to Buyer goes to /onboarding with
 *      "Finish your seller registration to use the buyer side", and the account
 *      stays on the seller side. Mitra chose onboarding_complete alone as the
 *      signal (Phase 17).
 *   1b. demo-vendor with the registration answered as complete: Switch to Buyer
 *      stands while moving around in-app, Seller goes straight back to
 *      /seller-home, and a reload is the seller side again.
 *   2. demo-buyer with a completed registration on file: Seller goes straight to
 *      /seller-home, and the hint is corrected to "true". It stays seller while
 *      moving around in-app; a reload is buyer again (its active_role).
 *   3. demo-buyer's real row (onboarding_complete false) with a stale "true" hint
 *      planted: Seller goes to /onboarding (the database wins), and the hint is
 *      corrected to "false".
 *   4. demo-buyer with no vendor_profiles row: Seller goes to /onboarding.
 *
 * Cases 1b, 2 and 4 answer the app's onboarding_complete read in the browser. No
 * buyer-role account has a completed registration, and setting one on demo-buyer
 * would list it as a vendor and break the "a completed vendor has a signed
 * contract" rule. Read-only: nothing is written to the database.
 * Requires `npm run dev` on :8080.
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
const hintKey = (id: string) => `cosora.vendorRegistered.${id}`;
// UserRoleContext's own read, and only that one (other vendor_profiles reads select more columns).
const REGISTRATION_READ = /\/rest\/v1\/vendor_profiles\?select=onboarding_complete&id=eq\./;
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD", "DEMO_VENDOR_PASSWORD"), "set DEMO_BUYER_PASSWORD and DEMO_VENDOR_PASSWORD in .env");

async function pageAs(browser: Browser, role: "buyer" | "vendor", hints: Record<string, string> = {}) {
  const { email, password } = demoAccount(role);
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${role}: ${error.message}`);
  // A fresh context has nothing stored: only the session, plus any planted hint.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([entries]) => {
    for (const [k, v] of Object.entries(entries as Record<string, string>)) window.localStorage.setItem(k, v);
  }, [{ [STORAGE_KEY]: JSON.stringify(data.session), ...hints }] as const);
  // Switching to Buyer lands on /home/new-arrivals, whose sponsored rail counts ad
  // impressions. Answered in the browser so the spec writes no analytics (a run on
  // 2026-09-25 had added 27 impressions as demo-vendor).
  await ctx.route(TRACKING, (r) => r.fulfill({ status: 204 }));
  await ctx.route(/\/rest\/v1\/recently_viewed/, (r) =>
    r.request().method() === "GET" ? r.continue() : r.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  return { ctx, page: await ctx.newPage(), id: data.user.id };
}

// Answers the registration read with these rows (PostgREST returns an array for maybeSingle's GET).
async function answerRegistration(page: Page, rows: unknown[]) {
  await page.route(REGISTRATION_READ, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) }));
}

const waitForRegistration = (page: Page) => page.waitForResponse((r) => REGISTRATION_READ.test(r.url()));

// In-app navigation through React Router, with no page load.
async function spaNavigate(page: Page, to: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);
  await page.waitForURL(`**${to}`);
}

const sidebar = (page: Page) => page.locator("aside");
async function expectSide(page: Page, side: "seller" | "buyer", why: string) {
  const seller = sidebar(page).getByRole("link", { name: "Upload Product", exact: true });
  const buyer = sidebar(page).getByRole("link", { name: "New Arrivals", exact: true });
  await expect(side === "seller" ? seller : buyer, `${why}: the ${side} sidebar`).toBeVisible();
  await expect(side === "seller" ? buyer : seller, `${why}: not the other one`).toHaveCount(0);
}
const switchTo = (page: Page, side: "Buyer" | "Seller") =>
  sidebar(page).getByRole("button", { name: side, exact: true }).click();
const hintOf = (page: Page, id: string) => page.evaluate((k) => window.localStorage.getItem(k), hintKey(id));

test("a vendor's hard load is the seller side; an unregistered seller can't switch to Buyer (MPF-22)", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "vendor");
  try {
    const read = waitForRegistration(page);
    await page.goto("/seller-home", { waitUntil: "networkidle" });
    expect((await (await read).json())[0]?.onboarding_complete, "demo-vendor's real row: never onboarded").toBe(false);
    await expectSide(page, "seller", "hard load of /seller-home");
    await page.screenshot({ path: path.join(SHOTS, "mpf13-vendor-hard-load.png") });

    // The original MPF-13 report: /notifications, then Settings, went to the buyer Settings.
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await expectSide(page, "seller", "hard load of /notifications");
    await sidebar(page).getByRole("link", { name: "Settings", exact: true }).click();
    await page.waitForURL(/\/settings$/);

    // MPF-22: only a seller who completed onboarding may use the buyer side.
    await switchTo(page, "Buyer");
    await page.waitForURL("**/onboarding");
    await expect(page.getByText("Finish your seller registration to use the buyer side")).toBeVisible();
    await page.waitForTimeout(800); // let the page's fade-in finish before the screenshot
    await page.screenshot({ path: path.join(SHOTS, "mpf22-switch-to-buyer-unregistered.png") });
    await spaNavigate(page, "/notifications");
    await expectSide(page, "seller", "still the seller side after the refused switch");
  } finally {
    await ctx.close();
  }
});

test("a seller with a completed registration switches to Buyer and back freely; a reload is the seller side", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "vendor");
  try {
    await answerRegistration(page, [{ onboarding_complete: true }]);
    const read = waitForRegistration(page);
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await read;
    await expectSide(page, "seller", "a registered seller's hard load");

    // A switch to Buyer stands while moving around in-app...
    await switchTo(page, "Buyer");
    await page.waitForURL("**/home/new-arrivals");
    await spaNavigate(page, "/notifications");
    await expectSide(page, "buyer", "after switching to Buyer, in-app");
    // ...back to Seller goes straight to the dashboard...
    await switchTo(page, "Seller");
    await page.waitForURL("**/seller-home");
    await spaNavigate(page, "/notifications");
    await expectSide(page, "seller", "after switching back to Seller");
    // ...and a reload seeds from active_role again.
    await switchTo(page, "Buyer");
    await page.waitForURL("**/home/new-arrivals");
    await page.reload({ waitUntil: "networkidle" });
    await spaNavigate(page, "/notifications");
    await expectSide(page, "seller", "after a reload");
  } finally {
    await ctx.close();
  }
});

test("a buyer with a completed registration on file goes straight to /seller-home, until a reload", async ({ browser }) => {
  const { ctx, page, id } = await pageAs(browser, "buyer");
  try {
    await answerRegistration(page, [{ onboarding_complete: true }]);
    const read = waitForRegistration(page);
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await read;
    await expectSide(page, "buyer", "a buyer's hard load");
    expect(await hintOf(page, id), "the hint is corrected to the database").toBe("true");

    await switchTo(page, "Seller");
    await page.waitForURL("**/seller-home");
    await expectSide(page, "seller", "after switching to Seller");

    // In-app: still seller.
    await sidebar(page).getByRole("link", { name: "Leads", exact: true }).click();
    await page.waitForURL("**/leads");
    await spaNavigate(page, "/notifications");
    await expectSide(page, "seller", "moving around in-app");

    // A reload is the side it signed up on: buyer.
    await page.reload({ waitUntil: "networkidle" });
    await expectSide(page, "buyer", "after a reload");
  } finally {
    await ctx.close();
  }
});

test("the database beats a stale localStorage hint: an unregistered buyer goes to /onboarding", async ({ browser }) => {
  const buyerId = "11111111-1111-1111-1111-111111111111";
  const { ctx, page, id } = await pageAs(browser, "buyer", { [hintKey(buyerId)]: "true" });
  expect(id).toBe(buyerId);
  try {
    const read = waitForRegistration(page);
    await page.goto("/notifications", { waitUntil: "networkidle" });
    const res = await read;
    expect((await res.json())[0]?.onboarding_complete, "demo-buyer's real row").toBe(false);
    await switchTo(page, "Seller");
    await page.waitForURL("**/onboarding");
    expect(await hintOf(page, id), "the stale hint is corrected").toBe("false");
  } finally {
    await ctx.close();
  }
});

test("a buyer with no vendor_profiles row goes to /onboarding", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "buyer");
  try {
    await answerRegistration(page, []);
    const read = waitForRegistration(page);
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await read;
    await switchTo(page, "Seller");
    await page.waitForURL("**/onboarding");
  } finally {
    await ctx.close();
  }
});
