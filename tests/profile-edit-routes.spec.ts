import { test, expect } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * /profile/edit and /profile/business-details are real routes (they replaced the
 * Edit Profile modal on /profile, 2026-09-23).
 *
 *   - Direct navigation and a hard reload both render the form, filled with the
 *     buyer's real values. There is no in-app click first, so this is what a
 *     shared link or a refresh gets.
 *   - A save on each page lands in buyer_profiles, read back through the database.
 *   - The /profile entry points lead to the routes. `?focus=city` focuses City.
 *     Signed out, both routes ask the visitor to sign in.
 *
 * ACCOUNT: demo-buyer@cosora.dev. MUTATING, but self-restoring: it snapshots
 * every column saveProfileFull() writes and puts them back in `finally`. Set
 * KEEP_EDIT_MARKERS=1 to leave the markers in place (for checking them with
 * SQL), then restore by hand. Requires `npm run dev` on :8080.
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

// Exactly the columns saveProfileFull() writes.
const PROFILE_COLS = "full_name, email, phone, avatar_url";
const BUYER_COLS =
  "display_name, company, city, job_title, department, business_type, website, industry, street, business_city, state, postal_code, country, gstin, pan";

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env (see .env.example)");

test("both routes render on a hard load, save to the database, and are reachable from /profile", async ({ browser }) => {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email: BUYER, password: demoPasswordFor(BUYER) });
  if (error) throw new Error(`login failed: ${error.message}`);
  const uid = auth.user.id;

  const { data: pBefore } = await db.from("profiles").select(PROFILE_COLS).eq("id", uid).single();
  const { data: bBefore } = await db.from("buyer_profiles").select(BUYER_COLS).eq("id", uid).single();
  expect(pBefore && bBefore, "snapshot").toBeTruthy();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(auth.session)] as const);
  const page = await ctx.newPage();
  const stamp = Date.now();

  try {
    // ── /profile/edit: straight to the URL, then a hard reload ──
    for (const load of ["goto", "reload"] as const) {
      if (load === "goto") await page.goto("/profile/edit", { waitUntil: "networkidle" });
      else await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
      await expect(page.getByLabel("Full Name"), `${load}: real name`).toHaveValue(pBefore!.full_name ?? "");
      await expect(page.getByLabel("City"), `${load}: real city`).toHaveValue(bBefore!.city ?? "");
    }
    // The fake email "Verify" did not survive the move.
    await expect(page.getByRole("button", { name: "Verify" })).toHaveCount(0);
    await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "profile-edit.png"), fullPage: true });

    const jobMarker = `[P4TEST] job ${stamp}`;
    await page.getByLabel("Job Title").fill(jobMarker);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL("**/profile");
    await expect(page.getByText("Profile updated")).toBeVisible();
    const { data: afterEdit } = await db.from("buyer_profiles").select("job_title").eq("id", uid).single();
    expect(afterEdit!.job_title, "the /profile/edit save reached buyer_profiles").toBe(jobMarker);

    // ── /profile/business-details: the same ──
    for (const load of ["goto", "reload"] as const) {
      if (load === "goto") await page.goto("/profile/business-details", { waitUntil: "networkidle" });
      else await page.reload({ waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Business details" })).toBeVisible();
      await expect(page.getByLabel("Business Name"), `${load}: real company`).toHaveValue(bBefore!.company ?? "");
      await expect(page.getByLabel("GSTIN"), `${load}: real GSTIN`).toHaveValue(bBefore!.gstin ?? "");
    }
    await page.screenshot({ path: path.join(SHOTS, "profile-business-details.png"), fullPage: true });

    const webMarker = `p4test-${stamp}.example.invalid`;
    await page.getByLabel("Website").fill(webMarker);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL("**/profile");
    await expect(page.getByText("Business details updated")).toBeVisible();
    const { data: afterBiz } = await db.from("buyer_profiles").select("website, job_title").eq("id", uid).single();
    expect(afterBiz!.website, "the /profile/business-details save reached buyer_profiles").toBe(webMarker);
    expect(afterBiz!.job_title, "the second save kept the first save's change").toBe(jobMarker);

    // ── Entry points on /profile ──
    await page.goto("/profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.waitForURL("**/profile/edit");
    await page.goto("/profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Change photo" }).click();
    await page.waitForURL("**/profile/edit");
    await page.goto("/profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Business Details" }).click();
    await page.waitForURL("**/profile/business-details");
    await page.goto("/profile/edit?focus=city", { waitUntil: "networkidle" });
    await expect(page.getByLabel("City")).toBeFocused();

    // ── Signed out ──
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    for (const url of ["/profile/edit", "/profile/business-details"]) {
      await anonPage.goto(url, { waitUntil: "networkidle" });
      await expect(anonPage.getByText("You're signed out"), url).toBeVisible();
    }
    await anon.close();
  } finally {
    if (!process.env.KEEP_EDIT_MARKERS) {
      await db.from("profiles").update(pBefore!).eq("id", uid);
      await db.from("buyer_profiles").update(bBefore!).eq("id", uid);
    }
    await ctx.close();
  }
});
