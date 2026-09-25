import { test, expect } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * /profile/notifications says the switches are saved preferences, not live
 * delivery (2026-09-23). Nothing sends email or push from them yet, so the page
 * must not promise "get notified" or "instant alerts". The switches still load
 * the buyer's saved choices.
 *
 * ACCOUNT: demo-buyer@cosora.dev. Read-only: nothing is saved. Requires
 * `npm run dev` on :8080.
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

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env (see .env.example)");

test("notification switches are presented as saved preferences, and still load the saved choices", async ({ browser }) => {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email: BUYER, password: demoPasswordFor(BUYER) });
  if (error) throw new Error(`login failed: ${error.message}`);
  const { data: bp } = await db.from("buyer_profiles").select("notifications").eq("id", auth.user.id).single();
  const saved = (bp?.notifications ?? {}) as Record<string, boolean>;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(auth.session)] as const);
  const page = await ctx.newPage();
  await page.goto("/profile/notifications", { waitUntil: "networkidle" });

  await expect(page.getByRole("note")).toContainText("aren’t live yet");
  await expect(page.getByText("Saved for when Cosora starts sending email")).toBeVisible();
  await expect(page.getByText("Saved for when browser and app notifications launch")).toBeVisible();
  const body = await page.locator("body").innerText();
  for (const overclaim of ["Instant alerts", "Get notified"]) {
    expect(body, `"${overclaim}" implies live delivery`).not.toContain(overclaim);
  }

  // Wording changed, loading did not: the newsletter switch shows the saved value.
  if (typeof saved.emailNewsletter === "boolean") {
    const row = page.locator("div.flex.items-start").filter({ hasText: "Newsletter & Tips" });
    await expect(row.getByRole("switch")).toHaveAttribute("data-state", saved.emailNewsletter ? "checked" : "unchecked");
  }
  await expect(page.getByRole("switch")).toHaveCount(6);
  await page.screenshot({ path: path.join(SHOTS, "profile-notifications-honesty.png") });
  await ctx.close();
});

/**
 * MPF-12 (2026-09-25): the same honesty everywhere the switches, or a summary of
 * them, appear. All three read NOTIFICATION_DELIVERY_LIVE (lib/notificationDelivery.ts).
 *   /profile          the Notifications row says "Not live yet", not "On" / "Off";
 *   /settings         Vendor Settings: the amber note and "saved for when it
 *                     launches" subtitles, and the switches still load the vendor's
 *                     saved choices;
 *   /seller-home      the RFQ card points to Leads instead of offering alerts.
 * Read-only. Tracking RPCs are answered in the browser.
 */
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;
const VENDOR = "demo-vendor@cosora.dev";

test("MPF-12: /profile, Vendor Settings and the seller home don't imply live delivery", async ({ browser }) => {
  test.skip(!hasCredentials("DEMO_VENDOR_PASSWORD"), "set DEMO_VENDOR_PASSWORD in .env");
  const open = async (email: string) => {
    const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
    if (error) throw new Error(`login failed: ${error.message}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(data.session)] as const);
    await ctx.route(TRACKING, (r) => r.fulfill({ status: 204 }));
    return { db, uid: data.user.id, ctx, page: await ctx.newPage() };
  };

  // Buyer: the /profile row.
  {
    const { ctx, page } = await open(BUYER);
    await page.goto("/profile", { waitUntil: "networkidle" });
    const row = page.getByRole("button", { name: /^Notifications/ });
    await expect(row).toContainText("Not live yet");
    await expect(row).not.toContainText(/\bOn\b|\bOff\b/);
    await ctx.close();
  }

  // Vendor: Settings, then the seller home.
  const { db, uid, ctx, page } = await open(VENDOR);
  const { data: vp } = await db.from("vendor_profiles").select("notifications").eq("id", uid).single();
  const saved = (vp?.notifications ?? {}) as Record<string, boolean>;
  await page.goto("/settings", { waitUntil: "networkidle" });
  const section = page.locator("section").filter({ hasText: "Notifications" }).first();
  await expect(section.getByRole("note")).toContainText("aren’t live yet");
  await expect(section.getByText("Saved for when Cosora starts sending email")).toBeVisible();
  await expect(section.getByText("Saved for when browser and app notifications launch")).toBeVisible();
  await expect(section.getByText("Choose what you'd like to be notified about.")).toHaveCount(0);
  await expect(section.getByRole("switch")).toHaveCount(9);
  if (typeof saved.emailNewRfq === "boolean") {
    const rfqRow = section.locator("div.flex.items-start").filter({ hasText: "When a buyer posts a requirement" });
    await expect(rfqRow.getByRole("switch")).toHaveAttribute("data-state", saved.emailNewRfq ? "checked" : "unchecked");
  }
  await section.screenshot({ path: path.join(SHOTS, "mpf12-vendor-settings-notifications.png") });

  await page.goto("/seller-home", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("New RFQs in your categories")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("They appear on your Leads page. Email and push alerts aren't live yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "View Leads" })).toBeVisible();
  await expect(page.getByText("Get notified for matching RFQs")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set Alerts" })).toHaveCount(0);
  await ctx.close();
});
