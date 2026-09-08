import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vendor Analytics + Advertise stats — the de-mocking guard.
 *
 * This spec exists because the failure mode it catches is invisible: a
 * fabricated figure renders exactly as convincingly as a real one. Asserting
 * "the page shows a number" would pass against the fixtures this change
 * removed. So the assertions come in two halves:
 *
 *   1. NEGATIVE — the retired fixture values must not appear anywhere on the
 *      page. These are the literal strings the old constants rendered
 *      (viewsData/weeklyData/sourceData/categoryData/inquiryData, the Ratings
 *      Snapshot card, Advertisements' STATS, and Quotes' performance card).
 *      Any of them coming back means a fixture was restored.
 *   2. POSITIVE — figures that can only come from this vendor's real rows
 *      (their actual category names, their actual review counts) are on screen.
 *
 * ACCOUNT: demo-vendor@cosora.dev. Read-only — this spec creates, mutates and
 * deletes nothing, so it is safe to run against the live project repeatedly.
 * Requires `npm run dev` on :8080 (playwright.config.ts does not manage it).
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
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const VENDOR = "demo-vendor@cosora.dev";
const PASSWORD_DEMO = "cosora123";
// `screenshots/`, not `test-results/` — Playwright wipes test-results at the
// start of every run, and documentation/test.md references these by path.
const SHOTS = path.join(REPO_ROOT, "screenshots");

/** Every value the removed fixtures used to print. None may return. */
const RETIRED_FIXTURES = [
  "4.2 / 5",                 // Ratings Snapshot average
  "24 reviews",              // Ratings Snapshot count
  "312 helpful votes",       // Ratings Snapshot — a metric that never existed
  // NB: the "Traffic Sources" CARD is back and is now real (Phase 3.3), so the
  // title is no longer a fixture marker — but the fixture's invented series
  // labels still are. The real card labels its rows "Search" / "Category
  // browse" / "Ads", never these.
  "Direct Search",           // sourceData
  "Browse Category",         // sourceData
  "Cotton Fabrics",          // categoryData — not a real category in this taxonomy
  "Premium Cotton Blend",    // topProducts / "Top rated listing" fixture
  "Italian Silk Collection", // topProducts
  "Organic Hemp Fabric",     // topProducts
];

const RETIRED_ADS_FIXTURES = [
  "27.2K",             // Business Profile Views
  "Avg. Cost/Lead",    // a metric this flat-rate ad model cannot support
  "+23% this month",   // Leads Generated subtext
  "in the last one month", // Missed Calls subtext
];

async function contextAs(browser: Browser, email: string): Promise<BrowserContext> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD_DEMO });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(data.session)] as const,
  );
  return ctx;
}

test.describe("Vendor analytics is counted, not fabricated", () => {
  test("T1 Analytics page renders real figures and no retired fixture", async ({ browser }) => {
    const ctx = await contextAs(browser, VENDOR);
    const pageObj = await ctx.newPage();
    await pageObj.goto("/analytics", { waitUntil: "networkidle" });
    await expect(pageObj.getByRole("heading", { name: "Analytics" })).toBeVisible();

    // Let React Query settle every panel before reading the DOM.
    await expect(pageObj.getByText("Total Order Value").first()).toBeVisible();
    await pageObj.waitForTimeout(1500);

    const body = (await pageObj.locator("body").innerText()).replace(/\s+/g, " ");
    for (const fixture of RETIRED_FIXTURES) {
      expect(body, `retired fixture "${fixture}" is back on /analytics`).not.toContain(fixture);
    }

    // Positive: this vendor's REAL category names drive Views by Category.
    await pageObj.getByRole("tab", { name: "Views" }).click();
    const viewsText = (await pageObj.locator("body").innerText()).replace(/\s+/g, " ");
    expect(viewsText).toContain("Views by Category");
    expect(viewsText, "real taxonomy category missing from the breakdown").toMatch(/Men's T-Shirts|Men's Shirts|Activewear|Women's Dresses/);

    // The time filter must never look like it did nothing: lifetime-backed
    // cards carry the "Lifetime" pill and windowed cards say "Last <range>".
    expect(viewsText).toContain("Lifetime");
    // Recharts animates on mount; without this the pie is captured mid-draw and
    // the evidence screenshot shows an empty chart area under a real legend.
    await pageObj.waitForTimeout(1200);
    await pageObj.screenshot({ path: path.join(SHOTS, "analytics-views.png"), fullPage: true });

    await pageObj.getByRole("tab", { name: "Overview" }).click();
    await pageObj.waitForTimeout(500);
    await pageObj.screenshot({ path: path.join(SHOTS, "analytics-overview.png"), fullPage: true });
    await ctx.close();
  });

  test("T2 Time filter re-scopes the windowed cards", async ({ browser }) => {
    const ctx = await contextAs(browser, VENDOR);
    const pageObj = await ctx.newPage();
    await pageObj.goto("/analytics", { waitUntil: "networkidle" });
    await pageObj.waitForTimeout(1200);

    // The Total Order Value card is windowed, so its scope pill must track the
    // selected range rather than staying on the default.
    await expect(pageObj.getByText("Last 7 days").first()).toBeVisible();
    await pageObj.getByRole("button", { name: "90 days" }).click();
    await expect(pageObj.getByText("Last 90 days").first()).toBeVisible();
    await ctx.close();
  });

  test("T3 Advertise stats strip is real, and says what it cannot measure", async ({ browser }) => {
    const ctx = await contextAs(browser, VENDOR);
    const pageObj = await ctx.newPage();
    await pageObj.goto("/advertisements", { waitUntil: "networkidle" });
    await pageObj.waitForTimeout(1500);

    const body = (await pageObj.locator("body").innerText()).replace(/\s+/g, " ");
    for (const fixture of RETIRED_ADS_FIXTURES) {
      expect(body, `retired fixture "${fixture}" is back on /advertisements`).not.toContain(fixture);
    }
    // Missed calls must be stated as untracked, never printed as a number.
    expect(body).toContain("Missed Calls");
    expect(body).toContain("records the dialer opening");
    // The flat-rate replacement for "Avg. Cost/Lead".
    expect(body).toContain("Revenue Booked / Lead");

    await pageObj.screenshot({ path: path.join(SHOTS, "advertise-stats.png"), fullPage: true });
    await ctx.close();
  });

  test("T5 engagement panels distinguish 'not switched on' from 'no data'", async ({ browser }) => {
    const ctx = await contextAs(browser, VENDOR);
    const pageObj = await ctx.newPage();
    await pageObj.goto("/analytics", { waitUntil: "networkidle" });
    await pageObj.waitForTimeout(1500);

    // The rebuilt panels are present by name whether or not the migration has
    // been applied — a chart that silently disappears reads as a bug.
    await expect(pageObj.getByText("Performance Trends")).toBeVisible();
    await pageObj.getByRole("tab", { name: "Views" }).click();
    await expect(pageObj.getByText("Traffic Sources")).toBeVisible();

    // Whichever state the project is in, it must be SAID. Before the
    // engagement_events migration is applied this is the not-switched-on
    // notice; afterwards it is a chart or a genuine empty-window message.
    // What must never happen is a panel that renders neither.
    const body = (await pageObj.locator("body").innerText()).replace(/\s+/g, " ");
    const switchedOff = body.includes("Visit-level tracking is not switched on");
    const emptyWindow = body.includes("No tracked activity in the last");
    const hasChart = (await pageObj.locator(".recharts-surface").count()) > 0;
    expect(
      switchedOff || emptyWindow || hasChart,
      "an engagement panel rendered neither data, an empty state, nor the not-switched-on notice",
    ).toBe(true);

    // The tabs added for the event-backed panels.
    await expect(pageObj.getByRole("tab", { name: "Search" })).toBeVisible();
    await expect(pageObj.getByRole("tab", { name: "Actions" })).toBeVisible();

    await pageObj.screenshot({ path: path.join(SHOTS, "analytics-engagement.png"), fullPage: true });
    await ctx.close();
  });

  test("T4 Quotes performance card is counted, not the ₹24.5L fixture", async ({ browser }) => {
    const ctx = await contextAs(browser, VENDOR);
    const pageObj = await ctx.newPage();
    await pageObj.goto("/quotes", { waitUntil: "networkidle" });
    await pageObj.waitForTimeout(1500);

    const body = (await pageObj.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body, "the ₹24.5L Total Order Value fixture is back").not.toContain("₹24.5L");
    expect(body, "the 1.5 days response-time fixture is back").not.toContain("1.5 days");
    expect(body, "the 'This Month: 8 quotes' fixture is back").not.toContain("This Month: 8 quotes");
    expect(body).toContain("Total Order Value");

    await pageObj.screenshot({ path: path.join(SHOTS, "quotes-performance.png"), fullPage: true });
    await ctx.close();
  });
});
