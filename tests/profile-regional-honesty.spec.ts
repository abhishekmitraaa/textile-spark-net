import { test, expect } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regional Settings says plainly what it can't do (2026-09-23).
 *
 * Currency and timezone are saved but nothing reads them: every price shows in
 * ₹ INR, and no time is converted. Picking anything else must say so, the way an
 * untranslated language already does. Picking the defaults shows no note.
 *
 * ACCOUNT: demo-buyer@cosora.dev. MUTATING, self-restoring: it snapshots
 * buyer_profiles.regional and writes it back. Requires `npm run dev` on :8080.
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

test("a currency or timezone the app can't honour says so; the defaults say nothing", async ({ browser }) => {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email: BUYER, password: demoPasswordFor(BUYER) });
  if (error) throw new Error(`login failed: ${error.message}`);
  const uid = auth.user.id;
  const { data: before } = await db.from("buyer_profiles").select("regional").eq("id", uid).single();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(auth.session)] as const);
  const page = await ctx.newPage();
  const currencyNote = page.getByText("prices across Cosora still show in ₹ INR");
  const tzNote = page.getByText("Cosora doesn’t use it yet");

  try {
    await page.goto("/profile/regional-settings", { waitUntil: "networkidle" });
    const [currency, timezone] = [page.locator("select").nth(0), page.locator("select").nth(1)];

    await currency.selectOption("₹ INR");
    await timezone.selectOption("IST (India Standard Time)");
    await expect(currencyNote).toHaveCount(0);
    await expect(tzNote).toHaveCount(0);

    await currency.selectOption("$ USD");
    await expect(page.getByText("Prices still show in ₹ INR for now.")).toBeVisible();
    await expect(currencyNote).toBeVisible();

    await timezone.selectOption("Eastern Time (ET)");
    await expect(page.getByText("Times in Cosora aren't converted to it yet.")).toBeVisible();
    await expect(tzNote).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "profile-regional-honesty.png") });

    // The choice is saved, which is the one thing the note claims.
    await expect.poll(async () => {
      const { data } = await db.from("buyer_profiles").select("regional").eq("id", uid).single();
      return (data?.regional as { currency?: string; timezone?: string } | null)?.currency;
    }).toBe("$ USD");

    await currency.selectOption("₹ INR");
    await timezone.selectOption("IST (India Standard Time)");
    await expect(currencyNote).toHaveCount(0);
    await expect(tzNote).toHaveCount(0);
  } finally {
    await db.from("buyer_profiles").update({ regional: before?.regional ?? null }).eq("id", uid);
    await ctx.close();
  }
});
