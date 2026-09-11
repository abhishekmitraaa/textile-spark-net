import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vendor registration — the WRITE PATH.
 *
 * This spec exists because a direct INSERT proves a column accepts a value; it
 * does not prove the form reaches the column. That gap is the entire bug this
 * work fixed: /onboarding collected state, pincode, premises photos, a PAN
 * scan, business categories, product unit/sizes/colours — and wrote none of
 * them. So every assertion below drives the REAL 9-step form and then reads the
 * database back.
 *
 * ACCOUNT: demo-buyer@cosora.dev, chosen because it has no vendor_profiles row
 * and no products, so completing registration creates a vendor from scratch
 * exactly as a new signup would. MUTATING but self-cleaning: the teardown
 * removes only rows this run created and restores profiles.active_role.
 *
 * Run with the dev server up:
 *   BUYER_APP_URL=http://localhost:8080 npx playwright test tests/vendor-onboarding-write-path.spec.ts
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

const EMAIL = "demo-buyer@cosora.dev";
const PASSWORD = optionalCredential("DEMO_BUYER_PASSWORD");
test.skip(!PASSWORD, "set DEMO_BUYER_PASSWORD in .env (see .env.example)");
const VENDOR_ID = "11111111-1111-1111-1111-111111111111";
/** The account's role before this run; restored in teardown. */
const ORIGINAL_ACTIVE_ROLE = "buyer";

// Typed into the form, asserted back out of the database.
const FORM = {
  businessName: "Playwright Looms Pvt Ltd",
  website: "https://playwrightlooms.example.com",
  building: "Unit 4",
  floor: "2nd Floor",
  area: "Ring Road",
  city: "Surat",
  state: "Gujarat",
  pincode: "395002",
  landmark: "Opposite Udhna Depot",
  ownerName: "Playwright Owner",
  category: "Garment Manufacturer",
  pan: "ABCDE1234F",
  panAddress: "Unit 4, Ring Road, Surat 395002",
  gstin: "24ABCDE1234F1Z5",
  cin: "U17110GJ2019PTC109876",
  product: { name: "Playwright Cotton Tee", price: "249", moq: "50", gsm: "180" },
};

/** A tiny real PNG, so uploads exercise storage with a valid image. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG_1PX });

async function signedInDb(): Promise<SupabaseClient> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`login failed: ${error.message}`);
  return db;
}

async function contextAs(browser: Browser): Promise<BrowserContext> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`login failed: ${error.message}`);
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, session]) => window.localStorage.setItem(key, session),
    [STORAGE_KEY, JSON.stringify(data.session)] as [string, string],
  );
  return ctx;
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/**
 * Storage paths this run uploaded, recorded as they are created. Storage is not
 * covered by a row delete and there is no cascade, so anything not removed here
 * stays in the private bucket referenced by nothing.
 */
const uploadedKycPaths: string[] = [];

/** Removes exactly what this run creates. */
async function cleanup() {
  // Escape hatch for the Phase 8.6 count check, which has to read the aggregate
  // while the row still exists. Clean up by re-running without the flag.
  if (process.env.KEEP_TEST_VENDOR) {
    console.log(`KEEP_TEST_VENDOR set — leaving ${EMAIL}'s vendor rows in place.`);
    return;
  }
  const db = await signedInDb();

  // Any KYC path still on a row, PLUS the ones recorded when they were uploaded.
  // Both halves are needed: test 8.7 deliberately strips this vendor back to a
  // bare row, so by the time teardown runs the vendor_documents rows naming
  // these objects are already gone — reading the rows alone silently misses
  // them and leaks the scan. Recording at creation time is what makes cleanup
  // survive a test that deletes rows before teardown.
  const { data: docRows } = await db.from("vendor_documents").select("file_url").eq("vendor_id", VENDOR_ID);
  const kycPaths = [
    ...uploadedKycPaths,
    ...(docRows ?? []).map((d) => d.file_url as string | null),
  ].filter((u): u is string => !!u && !u.startsWith("http"));

  const { data: products } = await db.from("products").select("id").eq("vendor_id", VENDOR_ID);
  for (const p of products ?? []) await db.from("product_images").delete().eq("product_id", p.id);
  await db.from("products").delete().eq("vendor_id", VENDOR_ID);
  await db.from("vendor_documents").delete().eq("vendor_id", VENDOR_ID);

  // The vendor_profiles row is BLANKED, not deleted.
  //
  // It used to be deleted, and that stopped being possible on purpose: a client
  // can no longer DELETE vendor_profiles at all (vprofiles_delete is admin-only),
  // and vendor_contracts.vendor_id is now ON DELETE RESTRICT so even an admin
  // cannot delete a vendor who has signed anything. Both changes exist because
  // the old cascade let a vendor destroy their own signed contract.
  //
  // A DELETE denied by RLS matches zero rows and RETURNS SUCCESS, so leaving the
  // old call here would have "passed" forever while cleaning nothing. Resetting
  // the row to its pre-onboarding state is the equivalent teardown that the new
  // rules actually permit.
  await db.from("vendor_profiles").update({
    brand_name: null, phone: null, whatsapp: null, website: null,
    address_line: null, area: null, city: null, state: null, postal_code: null,
    landmark: null, owner_name: null, owner_email: null,
    pan: null, gstin: null, cin: null,
    category: [], office_photos: [], logo_url: null, banner_url: null,
    about: null, year_established: null, employee_count: null,
    annual_turnover: null, capacity: [], social: {},
    onboarding_complete: false, profile_score: 0,
  }).eq("id", VENDOR_ID);
  await db.from("profiles").update({ active_role: ORIGINAL_ACTIVE_ROLE }).eq("id", VENDOR_ID);

  if (kycPaths.length) await db.storage.from("business-docs").remove(kycPaths);

  // NOTE: vendor_contracts is deliberately append-only — no delete policy for
  // anyone, admins included — so a contract this run signed CANNOT be removed
  // and will accumulate one row per run. That is a real product gap, not a
  // teardown oversight: saveVendorOnboarding() dedups vendor_documents but not
  // contracts, so a retried submit leaves a second permanent signature.
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  // Guard: this account must start with no vendor IDENTITY, or the assertions
  // below would be measuring somebody else's data.
  //
  // "No identity" used to mean "no vendor_profiles row". It now means "a row
  // that has not completed onboarding", because the row can no longer be
  // deleted by anyone once a contract references it — see cleanup(). A blanked
  // row and an absent row are equivalent for everything this spec asserts.
  const db = await signedInDb();
  const { data } = await db
    .from("vendor_profiles")
    .select("onboarding_complete, brand_name")
    .eq("id", VENDOR_ID)
    .maybeSingle();
  expect(
    data?.onboarding_complete ?? false,
    `${EMAIL} must not be a completed vendor before this run (found brand_name=${data?.brand_name})`,
  ).toBe(false);
});

test.afterAll(async () => { await cleanup(); });

// ── 8.1 ────────────────────────────────────────────────────────────────────
test("8.1 completing /onboarding writes every collected field to the database", async ({ browser }) => {
  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  page.setDefaultTimeout(25_000);

  await page.goto("/onboarding");

  // Step 1 → 2
  await page.getByRole("button", { name: "Edit details" }).click();

  // Step 2 — business details. Phone is prefilled from the profile and already
  // OTP-verified at signup, so the Verify button is only present when it isn't.
  await expect(page.getByRole("heading", { name: "Business Details", exact: true })).toBeVisible();
  await page.getByPlaceholder("Business name").fill(FORM.businessName);
  // Phone is a plain contact field — the "Verify" button and the OTP dialog are
  // gone, because this project has no SMS provider to verify against.
  await expect(page.getByRole("button", { name: "Verify", exact: true })).toHaveCount(0);
  await page.getByPlaceholder("Phone number").fill("9876500011");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByPlaceholder("https://yourwebsite.com").fill(FORM.website);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 — address. State and Pincode are the fields that did not exist.
  await expect(page.getByRole("heading", { name: "Business Address", exact: true })).toBeVisible();
  await page.getByPlaceholder("Shop no. / building no. (optional)").fill(FORM.building);
  await page.getByPlaceholder("Floor / tower (optional)").fill(FORM.floor);
  await page.getByPlaceholder("Area / Sector / Locality*").fill(FORM.area);
  await page.getByPlaceholder("City").fill(FORM.city);
  await page.getByPlaceholder("State").fill(FORM.state);
  await page.getByPlaceholder("6-digit pincode").fill(FORM.pincode);
  await page.getByPlaceholder("Add any nearby landmark (optional)").fill(FORM.landmark);
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();

  // Step 4 — owner
  await expect(page.getByRole("heading", { name: "Owner details", exact: true })).toBeVisible();
  await page.getByPlaceholder("Full name").fill(FORM.ownerName);
  await page.getByPlaceholder("name@company.com").fill(EMAIL);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Step 5 — business category (the step that did not exist; without it a
  // finished vendor is invisible to category search).
  await expect(page.getByRole("heading", { name: "What kind of business are you?" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /business categories/i }).first().click();
  await page.getByRole("button", { name: /Add New Category/ }).click();
  await page.getByRole("button", { name: FORM.category, exact: true }).click();
  await page.getByRole("button", { name: /^Done/ }).click();
  await page.getByRole("button", { name: "Proceed" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 6 — premises photos. Real uploads: these used to be blob: URLs.
  await expect(page.getByRole("heading", { name: "Add business images" })).toBeVisible();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles([file("shopfront.png"), file("interior.png")]);
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 40_000 });
  await page.getByRole("button", { name: "Next" }).click();

  // Step 7 — KYC. Honest copy, and the scan actually uploads.
  await expect(page.getByRole("heading", { name: "PAN details", exact: true })).toBeVisible();
  await page.locator("#pan-number").fill(FORM.pan);
  await page.getByRole("button", { name: "Check" }).first().click();
  await expect(page.getByText("Submitted for review").first()).toBeVisible();
  await expect(page.getByText("Verified", { exact: true })).toHaveCount(0); // never self-awarded
  await page.locator("#pan-full-name").fill(FORM.businessName);
  await page.getByRole("button", { name: "Check" }).first().click();
  await page.locator("#pan-address").fill(FORM.panAddress);
  // Three hidden file inputs share this accept string (PAN, GST, CIN); nth(0)
  // is PAN, in DOM order.
  const kycInputs = page.locator('input[accept="image/*,application/pdf"]');
  await kycInputs.nth(0).setInputFiles(file("pan-card.png"));
  await expect(page.getByText("Uploaded · awaiting review")).toBeVisible({ timeout: 40_000 });

  // GST — the number AND the certificate. `file_url` used to be hardcoded null
  // for this type, so an admin ruled on a string the vendor typed.
  await page.getByRole("radio").first().check();
  await page.getByPlaceholder("GSTIN").fill(FORM.gstin);
  await kycInputs.nth(1).setInputFiles(file("gst-certificate.png"));

  // CIN — optional, and only offered once a number is entered, because a
  // proprietorship has no CIN and this form has no entity-type field.
  await expect(page.locator("#cin-number")).toBeVisible();
  await page.locator("#cin-number").fill(FORM.cin);
  await kycInputs.nth(2).setInputFiles(file("incorporation-certificate.png"));
  await expect(page.getByText("Uploaded · awaiting review")).toHaveCount(3, { timeout: 40_000 });

  // Aadhaar is deliberately absent from this step and from the step-1 checklist.
  await expect(page.getByText(/aadhaar/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Next" }).click();

  // Step 8 — first product, including unit / sizes / colours.
  await expect(page.getByRole("heading", { name: "Add your first product" })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(file("product.png"));
  await page.locator("#product-name").fill(FORM.product.name);
  await page.locator("#product-price").fill(FORM.product.price);
  await page.locator("#product-moq").fill(FORM.product.moq);
  await page.locator("#product-gsm").fill(FORM.product.gsm);
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "L", exact: true }).click();
  await page.getByRole("button", { name: "Black", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled({ timeout: 40_000 });
  await page.getByRole("button", { name: "Submit" }).click();

  // Step 9 — contract
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.locator("#contract-name").fill(FORM.ownerName);
  await page.locator("#supplier-agreement").click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 40_000 });
  await page.screenshot({ path: path.join(SHOTS, "vendor-onboarding-welcome.png"), fullPage: true });

  // ── The assertion that matters: it reached the database ──
  const db = await signedInDb();
  const { data: vp } = await db.from("vendor_profiles").select("*").eq("id", VENDOR_ID).maybeSingle();
  expect(vp, "vendor_profiles row created").toBeTruthy();
  expect(vp!.brand_name).toBe(FORM.businessName);
  expect(vp!.city).toBe(FORM.city);
  expect(vp!.state, "STATE — a field the form never had").toBe(FORM.state);
  expect(vp!.postal_code, "POSTAL_CODE — a field the form never had").toBe(FORM.pincode);
  expect(vp!.landmark).toBe(FORM.landmark);
  expect(vp!.address_line).toContain(FORM.building);
  expect(vp!.area).toBe(FORM.area);
  expect(vp!.owner_name).toBe(FORM.ownerName);
  expect(vp!.owner_email).toBe(EMAIL);
  expect(vp!.website).toBe(FORM.website);
  expect(vp!.country).toBe("India");
  expect(vp!.pan).toBe(FORM.pan);
  expect(vp!.phone, "phone persisted").toBeTruthy();
  expect(vp!.whatsapp, "whatsapp opt-in persisted").toBeTruthy();
  expect(vp!.onboarding_complete).toBe(true);
  expect(vp!.category, "business categories persisted").toContain(FORM.category);

  const photos = (vp!.office_photos ?? []) as string[];
  expect(photos.length, "OFFICE_PHOTOS — were blob: URLs that died on reload").toBeGreaterThan(0);
  for (const url of photos) {
    expect(url, "a real storage URL, not a blob:").toMatch(/^https:\/\//);
    expect((await fetch(url)).ok, `office photo resolves: ${url}`).toBe(true);
  }

  const { data: docs } = await db.from("vendor_documents").select("*").eq("vendor_id", VENDOR_ID);
  const pan = (docs ?? []).find((d) => d.doc_type === "pan");
  expect(pan, "PAN document row exists").toBeTruthy();
  expect(pan!.file_url, "PAN scan uploaded — file_url was always null").toBeTruthy();
  expect(pan!.verified, "verification is an admin action, never self-awarded").toBe(false);
  // file_url is a PRIVATE storage PATH, not a URL. This assertion used to be a
  // bare fetch() of the column, which was correct while KYC lived in the public
  // product-images bucket and has thrown "Failed to parse URL" ever since that
  // moved to business-docs. A private object has exactly one read path.
  expect(pan!.file_url as string, "a storage path, not a public URL").not.toMatch(/^https?:\/\//);
  uploadedKycPaths.push(pan!.file_url as string);
  const { data: panSigned } = await db.storage.from("business-docs").createSignedUrl(pan!.file_url as string, 300);
  expect(panSigned?.signedUrl, "a signed URL can be minted for the owner").toBeTruthy();
  expect((await fetch(panSigned!.signedUrl)).ok, "PAN scan resolves through the signed URL").toBe(true);

  // GST and CIN now carry real scans. Both rows used to be written with
  // file_url: null unconditionally, so an admin was asked to approve or reject
  // a number the vendor typed with nothing to open.
  expect(vp!.gstin, "GSTIN persisted").toBe(FORM.gstin);
  expect(vp!.cin, "CIN persisted — the field had no input at all before").toBe(FORM.cin);
  for (const type of ["gst", "cin"]) {
    const doc = (docs ?? []).find((d) => d.doc_type === type);
    expect(doc, `${type} document row exists`).toBeTruthy();
    expect(doc!.file_url, `${type} scan uploaded — was hardcoded null`).toBeTruthy();
    expect(doc!.file_url as string, `${type} is a storage path`).not.toMatch(/^https?:\/\//);
    expect(doc!.verified, `${type} is not self-verified`).toBe(false);
    uploadedKycPaths.push(doc!.file_url as string);
    const { data: signed } = await db.storage.from("business-docs").createSignedUrl(doc!.file_url as string, 300);
    expect(signed?.signedUrl, `${type} can be signed`).toBeTruthy();
    expect((await fetch(signed!.signedUrl)).ok, `${type} resolves through the signed URL`).toBe(true);
  }

  // Aadhaar must NOT exist: nothing in the form collects it, and the step-1
  // checklist no longer asks for it.
  expect((docs ?? []).some((d) => d.doc_type === "aadhaar"), "no aadhaar row").toBe(false);

  const { data: products } = await db.from("products").select("*").eq("vendor_id", VENDOR_ID);
  expect(products?.length, "step-8 product created").toBe(1);
  const product = products![0];
  expect(product.name).toBe(FORM.product.name);
  expect(Number(product.price_value)).toBe(Number(FORM.product.price));
  expect(product.moq).toBe(FORM.product.moq);
  expect(product.gsm).toBe(FORM.product.gsm);
  expect(product.unit, "UNIT — collected and dropped before this change").toBeTruthy();
  expect(product.sizes, "SIZES — collected and dropped").toEqual(expect.arrayContaining(["M", "L"]));
  expect(product.colour, "COLOUR — collected and dropped").toBe("Black");

  const { data: images } = await db.from("product_images").select("*").eq("product_id", product.id);
  expect(images?.length, "product image row written").toBeGreaterThan(0);
  expect((await fetch(images![0].url as string)).ok, "product image resolves").toBe(true);

  expect(errors, "no console errors during registration").toEqual([]);
  await ctx.close();
});

// ── 8.3 / 8.4 (unverified branch) ──────────────────────────────────────────
test("8.3–8.4 the new vendor's pages show their own data, unverified", async ({ browser }) => {
  const db = await signedInDb();
  const { data: vp } = await db.from("vendor_profiles").select("*").eq("id", VENDOR_ID).maybeSingle();

  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  // 8.3 — /my-store header matches the row, and the logo picker works. This is
  // uploadVendorImage's first ever caller, which is why logo_url was null for
  // every vendor in the database.
  await page.goto("/my-store");
  await expect(page.getByText(FORM.businessName)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(vp!.phone as string)).toBeVisible();
  expect(await page.locator('img[src*="picsum.photos"]').count()).toBe(0);

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(file("logo.png"));
  await expect(page.getByText("Logo updated")).toBeVisible({ timeout: 40_000 });
  const { data: withLogo } = await db.from("vendor_profiles").select("logo_url").eq("id", VENDOR_ID).maybeSingle();
  expect(withLogo?.logo_url, "logo_url is set").toBeTruthy();
  expect((await fetch(withLogo!.logo_url as string)).ok, "logo resolves").toBe(true);
  await page.screenshot({ path: path.join(SHOTS, "vendor-my-store-new-vendor.png"), fullPage: true });

  // 8.4 — the seal must be ABSENT for this unverified vendor.
  await page.goto("/business-profile");
  await expect(page.getByRole("heading", { name: FORM.businessName }).first()).toBeVisible({ timeout: 25_000 });
  expect(vp!.is_verified, "this vendor is genuinely unverified").toBe(false);
  await expect(page.getByText("TrustedSEAL")).toHaveCount(0);
  await expect(page.getByText("Get verified")).toBeVisible();

  await expect(page.getByText(FORM.landmark)).toBeVisible();     // 4.5 landmark in the address
  await expect(page.getByText(FORM.category).first()).toBeVisible(); // 5.2 real categories
  // `exact` matters: a real GSTIN EMBEDS the PAN (state code + PAN + entity
  // code + Z + checksum), so a substring match resolves to both fields.
  await expect(page.getByText(FORM.pan, { exact: true })).toBeVisible();   // 4.4 real PAN, no fallback
  await expect(page.getByText(FORM.gstin, { exact: true })).toBeVisible(); // and the real GSTIN beside it
  await expect(page.getByText(FORM.product.name).first()).toBeVisible(); // 5.5 real product
  await page.screenshot({ path: path.join(SHOTS, "vendor-business-profile-new-vendor.png"), fullPage: true });

  // 8.5 — completed items show ticks.
  await page.goto("/business-profile-score");
  await page.waitForLoadState("networkidle");
  expect(await page.locator('[aria-label="Completed"]').count()).toBeGreaterThan(0);

  // /kyc shows the real submitted document.
  await page.goto("/kyc");
  await expect(page.getByText("In review").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("link", { name: /View/ }).first()).toBeVisible();

  expect(errors, "no console errors").toEqual([]);
  await ctx.close();
});

// ── 8.7 ────────────────────────────────────────────────────────────────────
test("8.7 a vendor with an empty profile sees empty states, not demo data", async ({ browser }) => {
  // Strip this vendor back to a bare row: no products, no documents, no
  // categories, no photos. This is the case the no-mock rule exists for.
  const db = await signedInDb();
  const { data: products } = await db.from("products").select("id").eq("vendor_id", VENDOR_ID);
  for (const p of products ?? []) await db.from("product_images").delete().eq("product_id", p.id);
  await db.from("products").delete().eq("vendor_id", VENDOR_ID);
  await db.from("vendor_documents").delete().eq("vendor_id", VENDOR_ID);
  await db.from("vendor_profiles").update({
    category: [], office_photos: [], logo_url: null, banner_url: null,
    pan: null, gstin: null, cin: null, about: null, website: null,
    year_established: null, employee_count: null, social: {},
  }).eq("id", VENDOR_ID);

  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/business-profile");
  await page.waitForLoadState("networkidle");

  // Honest empty states, each with the action that fills it.
  await expect(page.getByText("No reviews yet")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("No listings yet")).toBeVisible();
  await expect(page.getByText("Pick products to feature on your storefront")).toBeVisible();
  await expect(page.getByText("Add your business categories")).toBeVisible();
  await expect(page.getByText("Upload Catalogue PDF")).toBeVisible();
  await expect(page.getByText("Add PAN")).toBeVisible();

  // And none of the fabrications the sections used to fall back to.
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  for (const literal of [
    "ABCPR1234D", "Rs 2 - 5 Cr", "Caramel", "3,538", "7,333", "SOHO",
    "Caramel_Tshirts_2026.pdf", "Denim_Lookbook_Q2.pdf", "Loading more products...",
  ]) {
    expect(body, `empty vendor must not show "${literal}"`).not.toContain(literal);
  }
  expect(await page.locator('img[src*="/brands/"]').count(), "no Korean brand logos").toBe(0);
  // A vendor with no reviews must not get fabricated rating bars.
  expect(body).not.toContain("80%");

  await page.screenshot({ path: path.join(SHOTS, "vendor-empty-profile.png"), fullPage: true });
  expect(errors, "no console errors for an empty vendor").toEqual([]);
  await ctx.close();
});
