import { test, expect, type Browser, type Page } from "@playwright/test";
import { hasCredentials, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { createClient, type Session } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The UI language follows the account (2026-09-26).
 *
 * Before this, the choice lived only in the browser's localStorage: the buyer's
 * Regional Settings saved buyer_profiles.regional.language and nothing read it,
 * and Vendor Settings applied vendor_profiles.regional.language only on its own
 * page, where a vendor with nothing saved got English over their pick.
 * Now every picker saves `ui_language` to the account's auth metadata, and
 * LanguageSync applies it at sign-in (src/lib/languagePreference.ts).
 *
 *   1. buyer: picking Hindi on Regional Settings saves it to the account; a
 *      fresh browser, set to Gujarati, signs in and opens in Hindi.
 *   2. vendor: picking Gujarati on Vendor Settings saves it; a fresh browser
 *      signs in and the seller home opens in Gujarati.
 *   3. a language picked on the sign-in screen, signed out, is kept and saved
 *      to the account when that tab signs in.
 *   4. an account with nothing saved keeps the device's language, and nothing
 *      is written to it.
 *
 * ACCOUNTS: demo-buyer, demo-vendor. WRITES: `ui_language` in their auth
 * metadata, cleared again in afterEach. Tracking RPCs are answered in the
 * browser, so no analytics are written. Requires `npm run dev` on :8080.
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
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD", "DEMO_VENDOR_PASSWORD"), "set DEMO_BUYER_PASSWORD and DEMO_VENDOR_PASSWORD in .env");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

type Role = "buyer" | "vendor";

async function signIn(role: Role): Promise<Session> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { email, password } = demoAccount(role);
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${role}: ${error.message}`);
  return data.session;
}
/** What the account has saved, read from a fresh sign-in. */
async function savedLang(role: Role): Promise<unknown> {
  return (await signIn(role)).user.user_metadata?.ui_language ?? null;
}
async function clearSaved(role: Role) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { email, password } = demoAccount(role);
  await db.auth.signInWithPassword({ email, password });
  const { error } = await db.auth.updateUser({ data: { ui_language: null } });
  if (error) throw new Error(`clear ${role}: ${error.message}`);
}

/** A browser whose device language is `deviceLang` (null: never chosen), signed in as `session`. */
async function openAs(browser: Browser, session: Session | null, deviceLang: string | null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(TRACKING, (route) => route.fulfill({ status: 204, body: "" }));
  await ctx.addInitScript(([k, v, lang]) => {
    // Only on the first load: later reloads keep what the app itself stored.
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    if (lang) localStorage.setItem("cosora.lang", lang);
    if (k && v) localStorage.setItem(k, v);
  }, [session ? STORAGE_KEY : null, session ? JSON.stringify(session) : null, deviceLang] as const);
  return { ctx, page: await ctx.newPage() };
}
const htmlLang = (page: Page) => page.evaluate(() => document.documentElement.lang);

test.afterEach(async () => {
  await clearSaved("buyer");
  await clearSaved("vendor");
});

test("buyer: Hindi picked on Regional Settings opens a fresh browser in Hindi at sign-in", async ({ browser }) => {
  await clearSaved("buyer");
  const a = await openAs(browser, await signIn("buyer"), null);
  try {
    await a.page.goto("/profile/regional-settings", { waitUntil: "networkidle" });
    await a.page.locator('select:has(option[value="hi"])').selectOption("hi");
    await expect.poll(() => htmlLang(a.page)).toBe("hi");
    await expect.poll(() => savedLang("buyer"), { timeout: 15_000 }).toBe("hi");
  } finally {
    await a.ctx.close();
  }

  // Another device, set to Gujarati, signs in: the account's Hindi wins.
  const b = await openAs(browser, await signIn("buyer"), "gu");
  try {
    await b.page.goto("/home/new-arrivals", { waitUntil: "networkidle" });
    await expect.poll(() => htmlLang(b.page)).toBe("hi");
    await expect(b.page.getByText("नए आगमन").first()).toBeVisible();
    await expect(b.page.getByText("New Arrivals", { exact: true })).toHaveCount(0);
    await b.page.screenshot({ path: path.join(SHOTS, "lang-buyer-home-hi.png") });
  } finally {
    await b.ctx.close();
  }
});

test("vendor: Gujarati picked on Vendor Settings opens the seller home in Gujarati at sign-in", async ({ browser }) => {
  await clearSaved("vendor");
  const a = await openAs(browser, await signIn("vendor"), null);
  try {
    await a.page.goto("/settings", { waitUntil: "networkidle" });
    await a.page.getByRole("button", { name: "ગુજરાતી" }).click();
    await expect.poll(() => htmlLang(a.page)).toBe("gu");
    await expect.poll(() => savedLang("vendor"), { timeout: 15_000 }).toBe("gu");
    // Reopening Settings no longer resets the language to what vendor_profiles held.
    await a.page.goto("/settings", { waitUntil: "networkidle" });
    await expect.poll(() => htmlLang(a.page)).toBe("gu");
  } finally {
    await a.ctx.close();
  }

  const b = await openAs(browser, await signIn("vendor"), null);
  try {
    await b.page.goto("/seller-home", { waitUntil: "networkidle" });
    await expect.poll(() => htmlLang(b.page)).toBe("gu");
    await expect(b.page.locator("aside").getByText("ડેશબોર્ડ").first()).toBeVisible();
    await b.page.screenshot({ path: path.join(SHOTS, "lang-vendor-home-gu.png") });
  } finally {
    await b.ctx.close();
  }
});

test("a language picked on the sign-in screen is kept and saved when that tab signs in", async ({ browser }) => {
  await clearSaved("buyer");
  const { ctx, page } = await openAs(browser, null, null);
  try {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /English/ }).first().click();
    await page.getByRole("button", { name: /Hindi/ }).click();
    await expect.poll(() => htmlLang(page)).toBe("hi");
    await expect(page.getByText("कोड भेजें")).toBeVisible();

    // The tab signs in (the session lands in storage, as after the code screen).
    const session = await signIn("buyer");
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)] as const);
    await page.goto("/home/new-arrivals", { waitUntil: "networkidle" });
    await expect.poll(() => htmlLang(page)).toBe("hi");
    await expect.poll(() => savedLang("buyer"), { timeout: 15_000 }).toBe("hi");
  } finally {
    await ctx.close();
  }
});

test("an account with no saved language keeps the device's and writes nothing", async ({ browser }) => {
  await clearSaved("buyer");
  const { ctx, page } = await openAs(browser, await signIn("buyer"), "gu");
  try {
    await page.goto("/home/new-arrivals", { waitUntil: "networkidle" });
    await expect.poll(() => htmlLang(page)).toBe("gu");
    await page.waitForTimeout(2_000);
    expect(await savedLang("buyer"), "nothing saved on the account's behalf").toBeNull();
  } finally {
    await ctx.close();
  }
});
