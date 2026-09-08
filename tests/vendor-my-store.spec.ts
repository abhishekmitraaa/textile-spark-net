import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vendor "My Store" cluster — the de-mocking guard.
 *
 * Same shape as vendor-analytics.spec.ts and for the same reason: a fabricated
 * value renders exactly as convincingly as a real one, so asserting "a number
 * is on screen" would pass against the demo arrays this change removed.
 *
 *   1. NEGATIVE — every retired literal must be absent from the page.
 *   2. POSITIVE — values that can only have come from this vendor's own rows.
 *
 * ACCOUNT: demo-vendor@cosora.dev. READ-ONLY — this spec creates, mutates and
 * deletes nothing, so it is safe to run against the live project repeatedly and
 * alongside other work.
 *
 * demo-vendor happens to be an unusually good subject for both halves: it has a
 * real brand name, 1,240 followers, six products and five reviews (so the
 * positive assertions have something to match), and NO logo, banner, office
 * photos, PAN, GSTIN, CIN, catalogues or featured products (so most of the new
 * empty states are exercised in the same pass).
 *
 * Requires the dev server. Point at it with BUYER_APP_URL if it is not on :8080.
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
const SHOTS = path.join(REPO_ROOT, "screenshots");

const VENDOR = "demo-vendor@cosora.dev";
const PASSWORD = "cosora123";

/** Every literal the removed fixtures used to print. None may come back. */
const RETIRED = [
  "business name",                        // MyStore header placeholder
  "9010608951",                           // MyStore hardcoded phone
  "Add New Business",                     // removed row (no multi-business model)
  "Are you not receiving notifications?", // removed fake push-test banner
  "Caramel Fashion",                      // All Products heading
  "CARAMEL",                              // brand-name fallback
  "3,538",                                // All Items / product count
  "7,333",                                // followers
  "ABCPR1234D",                           // fake PAN
  "Rs 2 - 5 Cr",                          // fake annual turnover
  "Caramel_Tshirts_2026.pdf",
  "Denim_Lookbook_Q2.pdf",
  "PDF • 3.2 MB",
  "Loading more products...",
  "18 Pending",                           // badge that counted nothing
  "Info Missing",                         // literal badge
  "1 Year",                               // literal "Cosora Member Since"
  "Product name |",                        // demo product caption
  "SOHO",                                  // demo product brand caption
  "24 Ratings",                            // hardcoded Get Reviews figure
  "Review requests sent!",
  "Small-batch manufacturers",             // non-persisting capacity block
];

const ROUTES = ["/my-store", "/my-store/business", "/business-profile", "/business-profile-score"];

/** Only ever rendered by the deleted BusinessTools review component. Checked on
 *  that page alone: "Rajesh Kumar" is also demo-vendor's real owner_name, so a
 *  cluster-wide sweep for it would flag a genuine value. */
const RETIRED_BUSINESS_TOOLS = ["Rajesh Kumar", "Priya Sharma", "StyleMart Retailers", "Fashion Forward Exports"];

async function contextAs(browser: Browser): Promise<BrowserContext> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: VENDOR, password: PASSWORD });
  if (error) throw new Error(`login failed for ${VENDOR}: ${error.message}`);
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, session]) => window.localStorage.setItem(key, session),
    [STORAGE_KEY, JSON.stringify(data.session)] as [string, string],
  );
  return ctx;
}

/** Console errors, so "zero console errors" is measured rather than asserted. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function readVendorRow() {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: VENDOR, password: PASSWORD });
  if (error) throw error;
  const { data } = await db.from("vendor_profiles").select("*").eq("id", (await db.auth.getUser()).data.user!.id).maybeSingle();
  const { count: products } = await db
    .from("products").select("*", { count: "exact", head: true }).eq("vendor_id", data!.id);
  return { row: data!, products: products ?? 0 };
}

test.beforeAll(() => { mkdirSync(SHOTS, { recursive: true }); });

test("no retired fixture literal appears anywhere in the vendor cluster", async ({ browser }) => {
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);

  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    for (const literal of RETIRED) {
      expect(body, `${route} must not contain "${literal}"`).not.toContain(literal);
    }
    // The stock avatar and the Korean brand logos were <img> sources, not text.
    expect(await page.locator('img[src*="picsum.photos"]').count(), `${route}: no picsum stock photo`).toBe(0);
    expect(await page.locator('img[src*="/brands/"]').count(), `${route}: no third-party brand logos`).toBe(0);
  }
  await ctx.close();
});

test("/my-store header matches the vendor row", async ({ browser }) => {
  const { row } = await readVendorRow();
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/my-store");
  await expect(page.getByText(row.brand_name as string)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(row.phone as string)).toBeVisible();
  await expect(page.getByText(Number(row.rating_avg).toFixed(1), { exact: false }).first()).toBeVisible();
  await expect(page.getByText((row.followers_count as number).toLocaleString("en-IN"))).toBeVisible();

  // The completion bar the vendor documentation specifies and the build omitted.
  await expect(page.getByText("Profile Completion")).toBeVisible();
  await expect(page.getByText("Complete your profile to get verified and attract more buyers")).toBeVisible();

  await page.screenshot({ path: path.join(SHOTS, "vendor-my-store.png"), fullPage: true });
  expect(errors, "no console errors on /my-store").toEqual([]);
  await ctx.close();
});

test("/business-profile renders real counts, real identity and honest empty states", async ({ browser }) => {
  const { row, products } = await readVendorRow();
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/business-profile");
  await expect(page.getByRole("heading", { name: row.brand_name as string }).first()).toBeVisible({ timeout: 20_000 });

  // 4.2 — real hero counts.
  await expect(page.getByText((row.followers_count as number).toLocaleString("en-IN"))).toBeVisible();
  await expect(page.getByText(String(products), { exact: true }).first()).toBeVisible();

  // 4.3 — demo-vendor IS admin-verified, so the seal is earned and must show.
  // The gate itself is asserted by the "Get verified" branch on an unverified
  // account; here the positive branch proves the seal is not simply gone.
  expect(row.is_verified).toBe(true);
  await expect(page.getByText("TrustedSEAL")).toBeVisible();

  // 4.4 — GSTIN and CIN are now visible to the vendor at all (they never were),
  // and an empty PAN says "Add PAN" rather than showing a fabricated one.
  await expect(page.getByText("GSTIN")).toBeVisible();
  await expect(page.getByText("CIN")).toBeVisible();
  await expect(page.getByText("Add PAN")).toBeVisible();
  await expect(page.getByText("Cosora Member Since")).toBeVisible();

  // 5.2 — the real category text[], not brand logos.
  for (const cat of (row.category as string[]) ?? []) {
    await expect(page.getByText(cat).first()).toBeVisible();
  }

  // 5.1 / 5.3 — this vendor has no catalogues and no featured products, so both
  // render their empty state with a CTA rather than invented content.
  await expect(page.getByText("Upload Catalogue PDF")).toBeVisible();
  await expect(page.getByText("Pick products to feature on your storefront")).toBeVisible();

  // 5.5 — real product count, no "3,538".
  await expect(page.getByText(String(products), { exact: true }).first()).toBeVisible();

  await page.screenshot({ path: path.join(SHOTS, "vendor-business-profile.png"), fullPage: true });
  expect(errors, "no console errors on /business-profile").toEqual([]);
  await ctx.close();
});

test("/business-profile-score shows ticks for completed items and the stored score", async ({ browser }) => {
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/business-profile-score");
  await page.waitForLoadState("networkidle");
  // The percentage matches vendor_profiles.profile_score. Read the column AFTER
  // the page has loaded: fetchVendorDashboard recomputes the score and syncs it
  // back, so a value read beforehand can be one render stale.
  const { row } = await readVendorRow();
  await expect(page.getByText(`${row.profile_score}%`)).toBeVisible({ timeout: 20_000 });

  // 6.2 — this vendor has a phone, an About Us, a category, an email, a website
  // and live products, so several tiles must be ticked rather than "Missing".
  const ticks = await page.locator('[aria-label="Completed"]').count();
  expect(ticks, "completed tasks render a green tick, not Missing").toBeGreaterThan(0);
  const missing = await page.getByText("Missing", { exact: true }).count();
  expect(missing + ticks, "every tile carries a real state").toBe(13);

  await page.screenshot({ path: path.join(SHOTS, "vendor-profile-score.png"), fullPage: true });
  expect(errors, "no console errors on /business-profile-score").toEqual([]);
  await ctx.close();
});

test("/my-store/business badges are derived, and Business Tools has no fakes", async ({ browser }) => {
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/my-store/business");
  await expect(page.getByText("My Business")).toBeVisible({ timeout: 20_000 });
  // 3.2 — KYC and Payments are separate rows now. MyBusiness renders a mobile
  // list AND a desktop grid, so each row exists twice in the DOM with one of
  // them hidden by a breakpoint; `.last()` is the desktop copy this viewport
  // actually shows.
  await expect(page.getByText("KYC", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Payments", { exact: true }).last()).toBeVisible();

  await page.goto("/my-store/business/tools");
  await expect(page.getByText("Business Tools")).toBeVisible();
  // 3.3 — the invented reviews and the discard-the-phone-numbers form are gone.
  const body = await page.locator("body").innerText();
  for (const literal of RETIRED_BUSINESS_TOOLS) expect(body).not.toContain(literal);
  expect(body, "the discard-the-phone-numbers form is gone").not.toContain("Customer Mobile Number");

  // "Get Reviews" now shares a real link and a real QR image.
  await page.getByText("Get Reviews").click();
  await expect(page.getByRole("heading", { name: "Get Reviews" })).toBeVisible();
  const qr = page.locator('img[alt^="QR code linking to"]');
  await expect(qr).toBeVisible({ timeout: 15_000 });
  const src = await qr.getAttribute("src");
  expect(src, "the QR is a generated image, not a lucide icon").toMatch(/^data:image\/png;base64,/);

  await page.screenshot({ path: path.join(SHOTS, "vendor-get-reviews-qr.png"), fullPage: true });
  expect(errors, "no console errors on Business Tools").toEqual([]);
  await ctx.close();
});

test("no vendor page renders the buyer coral #ef4d62", async ({ browser }) => {
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();

  for (const route of [...ROUTES, "/kyc"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const offenders = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((el) => {
          const s = getComputedStyle(el);
          return s.backgroundColor === "rgb(239, 77, 98)" || s.color === "rgb(239, 77, 98)";
        })
        .map((el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 120)),
    );
    expect(offenders, `no #ef4d62 on ${route}`).toEqual([]);
  }
  await ctx.close();
});

test("/kyc reads vendor_documents", async ({ browser }) => {
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/kyc");
  await expect(page.getByRole("heading", { name: "KYC" })).toBeVisible({ timeout: 20_000 });
  // demo-vendor submitted no documents, so every row says so rather than
  // claiming a verification that never happened.
  for (const label of ["PAN", "GST", "CIN", "Aadhaar"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Not submitted").first()).toBeVisible();

  await page.screenshot({ path: path.join(SHOTS, "vendor-kyc.png"), fullPage: true });
  expect(errors, "no console errors on /kyc").toEqual([]);
  await ctx.close();
});

// ── 8.2 ────────────────────────────────────────────────────────────────────
test("8.2 a signed-out registration cannot reach the success screen", async ({ browser }) => {
  // No session at all: a plain context with nothing in localStorage.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);

  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Edit details" }).click();

  // Step 2
  await page.getByPlaceholder("Business name").fill("Signed Out Looms");
  await page.getByPlaceholder("Phone number").fill("9876500022");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.locator("input[data-input-otp]").first().fill("123456");
  await page.getByRole("dialog").getByRole("button", { name: "Verify" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Ring Road");
  await page.getByPlaceholder("City").fill("Surat");
  await page.getByPlaceholder("State").fill("Gujarat");
  await page.getByPlaceholder("6-digit pincode").fill("395002");
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();

  // Step 4
  await page.getByPlaceholder("Full name").fill("Nobody");
  await page.getByPlaceholder("name@company.com").fill("nobody@example.com");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Step 5 — category
  await expect(page.getByRole("heading", { name: "What kind of business are you?" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /business categories/i }).first().click();
  await page.getByRole("button", { name: /Add New Category/ }).click();
  await page.getByRole("button", { name: "Garment Manufacturer", exact: true }).click();
  await page.getByRole("button", { name: /^Done/ }).click();
  await page.getByRole("button", { name: "Proceed" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 6 — and here it stops. Premises photos upload to storage under the
  // vendor's own id, so with no session there is nothing to upload them as.
  // The registration is blocked EARLIER than the old submit-time guard would
  // have caught it, which is the stronger outcome: nothing is silently lost
  // because nothing is silently accepted.
  await expect(page.getByRole("heading", { name: "Add business images" })).toBeVisible();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "shopfront.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(page.getByText("Sign in to upload business images")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  // The success screen is unreachable — it never rendered at any point.
  await expect(page.getByText("Welcome to Cosora")).toHaveCount(0);
  await expect(page.getByText("The Good Times Start Now.")).toHaveCount(0);

  await ctx.close();
});
