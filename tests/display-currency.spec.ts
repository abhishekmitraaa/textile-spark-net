import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { hasCredentials, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MPF-11 (Phase 20): a buyer's Regional Settings currency converts DISPLAYED prices,
 * at the cached public.fx_rates rate, for display only.
 *
 *   1. With no currency set (INR), every line with "₹" on eleven buyer pages is
 *      captured. Then "$ USD" is picked in the real Regional Settings picker, and the
 *      same pages are captured again. Every line must be either unchanged (the few
 *      prices left in INR by design: the invented New Arrivals hero, service-vendor
 *      rates) or that line with each ₹ amount converted at the cached USD rate,
 *      worked out here independently of the app's code, marked "≈", optionally with
 *      the INR price beside it. The converted count must be > 0 on every product page.
 *   2. The display-only note shows; Regional Settings states the rate and that
 *      payments stay in INR; the buyer-menu drawer's picker shows the same setting.
 *   3. A received quote shows "≈ $x (₹y)".
 * The currency is put back exactly as it was (demo-buyer's is NULL) in afterEach.
 *
 * Visits write nothing: tracking RPCs and recently_viewed writes are answered in
 * the browser (claude.md, "A spec that opens product or vendor pages...").
 * ACCOUNT: demo-buyer (its Regional Settings currency, restored). Requires
 * `npm run dev` on :8080 and a populated fx_rates row.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const STORAGE_KEY = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const SHOTS = path.join(REPO_ROOT, "screenshots");
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;
const NOTE = "Prices marked ≈ are converted from ₹ INR to USD";

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env");

let restore: (() => Promise<void>) | null = null;
test.afterEach(async () => {
  const r = restore;
  restore = null;
  if (r) await r();
});

async function linesOn(page: Page, url: string): Promise<string[]> {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return (await page.evaluate(() => document.body.innerText))
    .split("\n").map((l) => l.trim())
    .filter((l) => (l.includes("₹") || l.includes("≈")) && !l.startsWith("Prices marked ≈"))
    .sort();
}

async function buyerContext(ctx: BrowserContext, session: unknown) {
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  await ctx.route(TRACKING, (r) => r.fulfill({ status: 204 }));
  await ctx.route(/\/rest\/v1\/recently_viewed/, (r) =>
    r.request().method() === "GET" ? r.continue() : r.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
}

test("a buyer who picks USD sees prices converted at the cached rate, for display only", async ({ browser }) => {
  test.setTimeout(420_000);
  const { email, password } = demoAccount("buyer");
  const db: SupabaseClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const uid = auth.user.id;

  const { data: bp } = await db.from("buyer_profiles").select("regional").eq("id", uid).maybeSingle();
  const original = bp?.regional ?? null;
  expect((original as { currency?: string } | null)?.currency ?? "₹ INR", "start from INR").toBe("₹ INR");
  restore = async () => {
    const { error: e } = await db.from("buyer_profiles").update({ regional: original }).eq("id", uid);
    if (e) throw e;
    const { data: back } = await db.from("buyer_profiles").select("regional").eq("id", uid).maybeSingle();
    expect(JSON.stringify(back?.regional ?? null), "the currency is put back exactly").toBe(JSON.stringify(original));
  };

  const { data: fxRow } = await db.from("fx_rates").select("rates, rates_date").eq("base_currency", "INR").single();
  const usd = Number((fxRow!.rates as Record<string, number>).USD);
  expect(usd).toBeGreaterThan(0);
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const inrAmount = /₹\s?(\d[\d,]*(?:\.\d+)?)/g;
  const usdOf = (n: string) => money.format(Number(n.replace(/,/g, "")) * usd);
  // The two converted forms, computed here rather than with the app's own code.
  const converted = (line: string) => { let first = true; return line.replace(inrAmount, (_m, n) => { const s = `${first ? "≈ " : ""}${usdOf(n)}`; first = false; return s; }); };
  const withInr = (line: string) => line.replace(/₹\s?(\d[\d,]*(?:\.\d+)?)/, (m, n) => `≈ ${usdOf(n)} (${m})`);
  // Compared without spaces or "≈": two prices on one line (a sale price and the
  // struck-through original) each carry their own "≈". A converted line must still
  // have at least one.
  const squash = (s: string) => s.replace(/[\s≈]+/g, "");

  const { data: live } = await db.from("products").select("id").eq("status", "live").order("id").limit(1);
  const pages = [
    "/home/new-arrivals", "/home/trends", "/home/for-you", "/home/sale", "/home/followings",
    "/search/results?q=shirt", `/product/${live![0].id}`, "/vendor/22222222-2222-2222-2222-222222222222",
    "/recently-viewed", "/requirement/my-quotes", "/services",
  ];
  const mustConvert = new Set(["/home/new-arrivals", "/home/sale", "/search/results?q=shirt", `/product/${live![0].id}`,
    "/vendor/22222222-2222-2222-2222-222222222222", "/recently-viewed", "/requirement/my-quotes"]);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await buyerContext(ctx, auth.session);
  const page = await ctx.newPage();
  let fxReads = 0;
  page.on("request", (r) => { if (r.url().includes("/rest/v1/fx_rates")) fxReads++; });

  // ── 1a. INR, as today ──
  const before: Record<string, string[]> = {};
  for (const p of pages) before[p] = await linesOn(page, p);
  expect(fxReads, "an INR buyer never reads the rates").toBe(0);
  await expect(page.getByText(NOTE)).toHaveCount(0);

  // ── Pick USD in Regional Settings ──
  await page.goto("/profile/regional-settings", { waitUntil: "networkidle" });
  await expect(page.getByText("Display only: vendors quote and are paid in ₹ INR")).toBeVisible();
  await page.locator("select").first().selectOption("$ USD");
  await expect(page.getByText("$ USD saved")).toBeVisible();
  await expect(page.getByText(`(1 USD ≈ ₹${(1 / usd).toFixed(2)}), marked ≈.`)).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "mpf11-regional-settings-usd.png") });
  const { data: saved } = await db.from("buyer_profiles").select("regional").eq("id", uid).single();
  expect((saved!.regional as { currency: string }).currency).toBe("$ USD");

  // ── 1b. The same pages in USD ──
  const summary: string[] = [];
  for (const p of pages) {
    const after = await linesOn(page, p);
    const left = [...after];
    let conv = 0;
    const same: string[] = [];
    for (const b of before[p]) {
      const options = [converted(b), withInr(b), b].map(squash);
      const i = left.findIndex((a) => options.includes(squash(a)));
      expect(i, `${p}: no counterpart for "${b}" (expected "${converted(b)}" or unchanged)`).toBeGreaterThanOrEqual(0);
      if (squash(left[i]) === squash(b)) {
        if (/₹\s?\d/.test(b)) same.push(b);
      } else {
        expect(left[i], `${p}: a converted price is marked ≈`).toContain("≈");
        conv++;
      }
      left.splice(i, 1);
    }
    // The product page's INR price beside the conversion, if it lays out on its own line.
    expect(left.filter((l) => !/^\(₹\d[\d,]*\)$/.test(l)), `${p}: lines with no INR counterpart`).toEqual([]);
    if (mustConvert.has(p)) expect(conv, `${p}: converted prices`).toBeGreaterThan(0);
    if (conv > 0) await expect(page.getByText(NOTE).first(), `${p}: the display-only note`).toBeVisible();
    summary.push(`${p}: ${conv} converted, ${same.length} left in INR${same.length ? ` (${[...new Set(same)].slice(0, 3).join(" · ")})` : ""}`);
  }
  console.log(summary.join("\n"));

  // The product page keeps the vendor's own price beside the conversion.
  await page.goto(`/product/${live![0].id}`, { waitUntil: "networkidle" });
  await expect(page.getByText(/^\(₹\d[\d,]*\)$/).first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "mpf11-product-usd.png") });

  // ── 2. The drawer's picker is the same setting ──
  await page.goto("/home/new-arrivals", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "mpf11-new-arrivals-usd.png") });
  // BuyerTopBar's last button is the ⋮ menu.
  await page.locator("div.sticky.top-0").first().locator("button").last().click();
  const drawerSelect = page.getByText("Default Currency", { exact: true }).locator("..").locator("select");
  await expect(drawerSelect).toHaveValue("$ USD");
  await expect(page.getByText("Converts prices for display only. Payments stay in ₹ INR.")).toBeVisible();

  // ── 3. A received quote: converted, with the INR price beside it ──
  await page.goto("/requirement/my-quotes", { waitUntil: "networkidle" });
  await page.getByRole("button").filter({ hasText: /Lowest:|Quoted/ }).first().click();
  const quotePrice = page.getByText(/^≈ \$\d[\d,]*\.\d\d \(₹\d[\d,]*\)$/).first();
  await expect(quotePrice).toBeVisible();
  const [, dollars, rupees] = (await quotePrice.innerText()).match(/^≈ (\$[\d,.]+) \(₹([\d,]+)\)$/)!;
  expect(dollars).toBe(usdOf(rupees));
  await page.screenshot({ path: path.join(SHOTS, "mpf11-quote-usd.png") });
  await ctx.close();
});
