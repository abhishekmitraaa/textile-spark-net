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
