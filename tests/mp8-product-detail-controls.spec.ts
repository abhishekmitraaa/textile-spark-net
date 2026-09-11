import { test, expect } from "@playwright/test";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 8, Phase 6 — no control on /product/:id that does nothing.
 *
 * - Follow is the real `follows` row: clicking it writes one, a reload still
 *   says "Following", unfollowing deletes it. It was local useState.
 * - "Add Fabric", "Download PDF", "Translate", the review "Helpful?" tally and
 *   the review ⋮ menu are gone. None had a handler that did anything real.
 *
 * ACCOUNT: demo-buyer. Leaves no trace: it picks a live product whose vendor
 * demo-buyer does not already follow, and unfollows at the end.
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
const BUYER = { email: "demo-buyer@cosora.dev", password: optionalCredential("DEMO_BUYER_PASSWORD") };

test.skip(!BUYER.password, "set DEMO_BUYER_PASSWORD in .env (see .env.example)");

test("P6 Follow persists through the follows table; the five inert controls are gone", async ({ browser }) => {
  test.setTimeout(90_000);
  mkdirSync(SHOTS, { recursive: true });
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword(BUYER);
  if (error) throw error;
  const me = auth.user!.id;

  const { data: followed } = await db.from("follows").select("vendor_id").eq("follower_id", me);
  const already = new Set((followed ?? []).map((f) => f.vendor_id as string));
  const { data: live } = await db.from("products").select("id, vendor_id").eq("status", "live").limit(50);
  const pick = (live ?? []).find((p) => !already.has(p.vendor_id as string) && p.vendor_id !== me);
  expect(pick, "a live product whose vendor demo-buyer does not follow").toBeTruthy();
  const followRow = async () =>
    (await db.from("follows").select("vendor_id").eq("follower_id", me).eq("vendor_id", pick!.vendor_id)).data ?? [];

  const ctx = await browser.newContext();
  await ctx.addInitScript(([k, v]: [string, string]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, JSON.stringify(auth.session)] as [string, string]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`/product/${pick!.id}`);
  const followBtn = page.getByRole("button", { name: "+ Follow" });
  await expect(followBtn).toBeVisible({ timeout: 30_000 });

  for (const gone of ["Add Fabric", "Download PDF", "Translate", "Helpful?"]) {
    await expect(page.getByText(gone, { exact: true }), `"${gone}" is removed`).toHaveCount(0);
  }

  // Follow → a real row → survives a reload.
  await followBtn.click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await followRow()).length, { timeout: 10_000 }).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(SHOTS, "mp8-p6-product-following.png"), fullPage: false });

  // Unfollow → the row is gone; demo-buyer ends as it started.
  await page.getByRole("button", { name: "Following" }).click();
  await expect(page.getByRole("button", { name: "+ Follow" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await followRow()).length, { timeout: 10_000 }).toBe(0);

  expect(errors, "no page errors on /product/:id").toEqual([]);
  await ctx.close();
});
