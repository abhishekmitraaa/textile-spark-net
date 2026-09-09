import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 5, Phase 4 — the CONFIRMATION-LINK path specifically.
 *
 * Master Prompt 4 proved AuthCallback writes the signup brand name by injecting
 * a session into localStorage. This proves the same thing the way a real user
 * gets there: the app receives its session from the URL, with nothing already
 * in storage and Login.tsx never involved.
 *
 * HOW FAITHFUL IS IT: Supabase's confirmation link hits
 * `/auth/v1/verify?type=signup&redirect_to=…`, which (flowType implicit — see
 * src/lib/supabase.ts, detectSessionInUrl: true) redirects to
 * `/auth/callback#access_token=…&refresh_token=…&type=signup`. Test 2 navigates
 * to exactly that URL shape, so the app's own `detectSessionInUrl` parsing runs
 * for real. The one thing not reproduced is the verify endpoint minting the
 * tokens — those come from a password grant in Node instead, because there is
 * no mailbox for the throwaway domain and no service-role key here to mint a
 * link. Nothing under test depends on where the tokens came from: what is being
 * proved is that a session arriving IN THE URL results in brand_name landing in
 * the database.
 *
 * Run test 1, confirm the account out of band, then run test 2.
 *   npx playwright test tests/mp5-phase4-confirmation-link.spec.ts
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

const EMAIL = "zz-mp5-link@cosora.in";
const PASSWORD = "CosoraQA!2026";
const FULL_NAME = "Kesar Owner";
const PHONE = "9876500077";
/** The whole point. Lives only in user metadata until AuthCallback moves it. */
const BRAND = "Kesar Textiles";

const anon = () => createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

test.describe.configure({ mode: "serial" });

test("MP5 P4.a — sign up through /register and stop at the confirmation screen", async ({ page }) => {
  page.setDefaultTimeout(25_000);

  // If it already exists from a previous run, skip straight to P4.b.
  const probe = anon();
  const { error: existing } = await probe.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  test.skip(!existing, `${EMAIL} already exists and is confirmed — P4.b can run`);

  await page.goto("/register");
  await page.locator("button").filter({ hasText: "Manufacturer / Supplier" }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.locator("#fullName")).toBeVisible();
  await page.locator("#fullName").fill(FULL_NAME);
  await page.locator("#brandName").fill(BRAND);
  await page.locator("#email").fill(EMAIL);
  await page.locator("#phone").fill(PHONE);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Create Account/ }).click();

  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible({ timeout: 40_000 });
  console.log(`\n[MP5 P4.a] created ${EMAIL} — confirm it, then P4.b will proceed.\n`);
});

test("MP5 P4.b — the confirmation link's landing URL writes brand_name", async ({ browser }) => {
  // Longer than the default 60s: this test spends most of its life waiting for a
  // human to confirm the account in the Supabase dashboard.
  test.setTimeout(330_000);

  // Wait for the out-of-band confirmation. An unconfirmed account cannot get a
  // session at all, so a successful sign-in IS the confirmation signal.
  const deadline = Date.now() + 240_000;
  let session: Awaited<ReturnType<ReturnType<typeof anon>["auth"]["signInWithPassword"]>>["data"] | null = null;
  let lastErr = "";
  while (Date.now() < deadline) {
    const { data, error } = await anon().auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (!error && data.session) { session = data; break; }
    lastErr = error?.message ?? "no session";
    await new Promise((r) => setTimeout(r, 5_000));
  }
  expect(session, `never became confirmed within 4 minutes (last: ${lastErr})`).toBeTruthy();

  const userId = session!.user!.id;
  const db = anon();
  await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

  // PRECONDITION — the brand name is in metadata and in NO table.
  const meta = (session!.user!.user_metadata ?? {}) as Record<string, unknown>;
  expect(meta.brand_name, "the signup captured it into user metadata").toBe(BRAND);
  const { data: before } = await db.from("vendor_profiles").select("brand_name").eq("id", userId).maybeSingle();
  test.skip(before?.brand_name != null, `already applied for ${EMAIL} — re-run against a fresh signup`);
  console.log(`[MP5 P4.b] before: metadata.brand_name=${meta.brand_name}  vendor_profiles.brand_name=${before?.brand_name ?? "(no row)"}`);

  // A COMPLETELY COLD browser: nothing in localStorage, no Login.tsx, no
  // injected session. The only thing that can sign this context in is the URL.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  const seeded = await page.evaluate(() => Object.keys(window.localStorage).length).catch(() => -1);
  expect(seeded === 0 || seeded === -1, "the context starts with empty localStorage").toBe(true);

  const hash = new URLSearchParams({
    access_token: session!.session!.access_token,
    refresh_token: session!.session!.refresh_token,
    expires_in: "3600",
    token_type: "bearer",
    type: "signup",
  }).toString();

  await page.goto(`/auth/callback#${hash}`);
  await page.waitForURL(/\/auth\/role-selection|\/seller-home|\/home\//, { timeout: 45_000 });

  // THE ASSERTION: the column, not the redirect.
  const { data: after } = await db.from("vendor_profiles").select("brand_name").eq("id", userId).maybeSingle();
  console.log(`[MP5 P4.b] after:  vendor_profiles.brand_name=${after?.brand_name ?? "(no row)"}  landed on ${page.url()}`);
  expect(after, "AuthCallback created the vendor_profiles row").toBeTruthy();
  expect(after!.brand_name, "the brand name typed at signup reached the database").toBe(BRAND);

  expect(errors, "no console errors on the callback").toEqual([]);
  await ctx.close();
});
