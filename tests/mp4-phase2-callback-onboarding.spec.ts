import { test, expect, type Page, type Locator, type Browser, type BrowserContext } from "@playwright/test";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPLIER_AGREEMENT_VERSION } from "../src/lib/supplierAgreement";

/**
 * Master Prompt 4, Phases 1 (verify) + 2 + 4.3 — part 2 of 2.
 *
 * Requires mp4-phase1-register.spec.ts to have run AND the resulting account to
 * have been confirmed out of band.
 *
 * This vendor is left in the database on purpose. It is the evidence that the
 * write path works end to end, which two previous passes asserted and never
 * demonstrated. There is NO cleanup hook in this file, deliberately.
 *
 *   npx playwright test tests/mp4-phase2-callback-onboarding.spec.ts
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

// Overridable so the same proof can be re-run against a NEW throwaway vendor
// without editing the file that recorded the original run.
const EMAIL = process.env.MP_VENDOR_EMAIL ?? "zz-mp4-vendor@cosora.in";
const PASSWORD = optionalCredential("MP_VENDOR_PASSWORD");
test.skip(!PASSWORD, "set MP_VENDOR_PASSWORD in .env (see .env.example)");
/** Typed into /register step 2. Must reach vendor_profiles.brand_name via AuthCallback. */
const SIGNUP_BRAND = process.env.MP_VENDOR_BRAND ?? "Meridian Weaves";

/** Typed into /onboarding, asserted back out of the database. */
const FORM = {
  businessName: "Meridian Weaves Pvt Ltd",
  website: "https://meridianweaves.example.com",
  building: "Plot 17",
  floor: "3rd Floor",
  area: "Pandesara GIDC",
  city: "Surat",
  state: "Gujarat",
  pincode: "394221",
  landmark: "Near Pandesara Bus Stand",
  ownerName: "Meridian Owner",
  category: "Garment Manufacturer",
  pan: "AFZPK7190K",
  panAddress: "Plot 17, Pandesara GIDC, Surat 394221",
  gstin: "24AFZPK7190K1ZT",
  product: { name: "Meridian Poplin Shirt", price: "389", moq: "60", gsm: "140" },
};

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG_1PX });

let VENDOR_ID = "";

async function signedInDb(): Promise<SupabaseClient> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`login failed: ${error.message}`);
  return db;
}

/**
 * A session injected straight into localStorage — NOT a trip through /login.
 * That matters for P1.b: Login.tsx also calls applyPendingSignupProfile(), so
 * signing in through the UI would prove the wrong call site. This leaves
 * AuthCallback as the only code that could possibly have written brand_name.
 */
async function contextAs(browser: Browser): Promise<BrowserContext> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`login failed: ${error.message}`);
  VENDOR_ID = data.user!.id;
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, session]) => window.localStorage.setItem(key, session),
    [STORAGE_KEY, JSON.stringify(data.session)] as [string, string],
  );
  return ctx;
}

/**
 * Draw a stroke on the signature canvas with the mouse — the desktop path.
 *
 * This is a regression test as much as a step. The canvas sits inside a vaul
 * Drawer, which reads a pointer drag across its content as swipe-to-dismiss.
 * `touch-action: none` defends the touch path and the browser ignores
 * touch-action for a mouse, so before `data-vaul-no-drag` was added to the
 * canvas the first mouse stroke dismissed the drawer — and onOpenChange nulls
 * manualSignatureDataUrl when it closes unsaved, so a desktop vendor's
 * signature was discarded with no error at all. If that regresses, the
 * "Save Signature" click below cannot find its button.
 */
async function drawSignature(page: Page, canvas: Locator) {
  // The drawer SLIDES UP. Reading boundingBox() as soon as the canvas is
  // "visible" returns a mid-animation rectangle that is tens of pixels below
  // where the canvas ends up, so every subsequent click lands on the overlay
  // instead — which dismisses the drawer and looks exactly like a drawing bug.
  // Wait for the rect to stop moving before touching it.
  let box = (await canvas.boundingBox())!;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(100);
    const next = (await canvas.boundingBox())!;
    if (Math.abs(next.y - box.y) < 0.5 && Math.abs(next.x - box.x) < 0.5) { box = next; break; }
    box = next;
  }

  const at = (fx: number, fy: number): [number, number] => [box.x + box.width * fx, box.y + box.height * fy];
  await page.mouse.move(...at(0.10, 0.30));
  await page.mouse.down();
  // Deliberately includes strong DOWNWARD segments. Without data-vaul-no-drag
  // on the canvas, vaul reads those as swipe-to-dismiss and the drawer closes
  // mid-signature, discarding it silently.
  for (const [fx, fy] of [[0.25, 0.75], [0.40, 0.35], [0.55, 0.80], [0.70, 0.40], [0.85, 0.70]]) {
    await page.mouse.move(...at(fx, fy), { steps: 8 });
  }
  await page.mouse.up();
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  const db = await signedInDb();
  const { data: u } = await db.auth.getUser();
  VENDOR_ID = u.user!.id;
  console.log(`\n[MP4] throwaway vendor id = ${VENDOR_ID}\n`);
});

// ── Phase 1 VERIFY ─────────────────────────────────────────────────────────
test("MP4 P1.b — /auth/callback applies the signup brand name", async ({ browser }) => {
  const db = await signedInDb();

  // Precondition: the name is in metadata and in NO table. It can only be true
  // once per account — the write is the thing being proved, and it is an upsert
  // that persists. So this SKIPS rather than fails on a re-run: a red test here
  // would mean "already proved", which is not what red is for. Point it at a
  // fresh signup to run it again.
  const { data: before } = await db.from("vendor_profiles").select("brand_name").eq("id", VENDOR_ID).maybeSingle();
  test.skip(
    before?.brand_name != null,
    `already applied for ${EMAIL} (brand_name = ${before?.brand_name}) — re-run against a fresh signup`,
  );

  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);

  await page.goto("/auth/callback");
  // Not onboarded yet, so the callback routes to role selection. Where it goes
  // is not the assertion — what it wrote on the way is.
  await page.waitForURL(/\/auth\/role-selection|\/seller-home|\/home\//, { timeout: 30_000 });

  const { data: after } = await db.from("vendor_profiles").select("brand_name").eq("id", VENDOR_ID).maybeSingle();
  expect(after, "AuthCallback created the vendor_profiles row").toBeTruthy();
  expect(after!.brand_name, "the brand name typed at signup reached the database").toBe(SIGNUP_BRAND);

  expect(errors, "no console errors on the callback").toEqual([]);
  await ctx.close();
});

// ── Phase 2 ────────────────────────────────────────────────────────────────
test("MP4 P2 — a brand-new confirmed vendor completes /onboarding and every field lands", async ({ browser }) => {
  // One shot per vendor, and not for tidiness: vendor_contracts has no dedup
  // and is append-only for everyone including admins, so re-running this would
  // insert a SECOND signed contract for the same vendor that nothing can
  // remove. Skip rather than corrupt the evidence; use a fresh signup instead.
  const guard = await signedInDb();
  const { data: existing } = await guard
    .from("vendor_profiles").select("onboarding_complete").eq("id", VENDOR_ID).maybeSingle();
  test.skip(
    existing?.onboarding_complete === true,
    `${EMAIL} has already completed onboarding — re-run against a fresh signup`,
  );

  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  const errors = watchConsole(page);
  page.setDefaultTimeout(25_000);

  await page.goto("/onboarding");

  // Step 1 → 2
  await page.getByRole("button", { name: "Edit details" }).click();

  // Step 2 — business details
  await expect(page.getByRole("heading", { name: "Business Details", exact: true })).toBeVisible();
  await page.getByPlaceholder("Business name").fill(FORM.businessName);
  await expect(page.getByRole("button", { name: "Verify", exact: true })).toHaveCount(0);
  await page.getByPlaceholder("Phone number").fill("9876500042");
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await page.getByPlaceholder("https://yourwebsite.com").fill(FORM.website);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 — address. The map must follow the typed city, not default to Delhi.
  await expect(page.getByRole("heading", { name: "Business Address", exact: true })).toBeVisible();
  await page.getByPlaceholder("Shop no. / building no. (optional)").fill(FORM.building);
  await page.getByPlaceholder("Floor / tower (optional)").fill(FORM.floor);
  await page.getByPlaceholder("Area / Sector / Locality*").fill(FORM.area);
  await page.getByPlaceholder("City").fill(FORM.city);
  await page.getByPlaceholder("State").fill(FORM.state);
  await page.getByPlaceholder("6-digit pincode").fill(FORM.pincode);
  await page.getByPlaceholder("Add any nearby landmark (optional)").fill(FORM.landmark);

  // The Delhi NCR default is gone: the map geocodes what was typed.
  const mapSrc = await page.locator('iframe[src*="maps"]').first().getAttribute("src");
  expect(mapSrc, "map points at the typed location").toBeTruthy();
  expect(decodeURIComponent(mapSrc!), "map must NOT be hardcoded to Delhi NCR").not.toContain("Delhi NCR");
  expect(decodeURIComponent(mapSrc!)).toContain(FORM.pincode);

  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();

  // Step 4 — owner
  await expect(page.getByRole("heading", { name: "Owner details", exact: true })).toBeVisible();
  await page.getByPlaceholder("Full name").fill(FORM.ownerName);
  await page.getByPlaceholder("name@company.com").fill(EMAIL);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Step 5 — business category
  await expect(page.getByRole("heading", { name: "What kind of business are you?" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /business categories/i }).first().click();
  await page.getByRole("button", { name: /Add New Category/ }).click();
  await page.getByRole("button", { name: FORM.category, exact: true }).click();
  await page.getByRole("button", { name: /^Done/ }).click();
  await page.getByRole("button", { name: "Proceed" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 6 — premises photos (real uploads)
  await expect(page.getByRole("heading", { name: "Add business images" })).toBeVisible();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles([file("shopfront.png"), file("interior.png")]);
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 40_000 });
  await page.getByRole("button", { name: "Next" }).click();

  // Step 7 — PAN + GST. The scan goes to the PRIVATE business-docs bucket.
  await expect(page.getByRole("heading", { name: "PAN details", exact: true })).toBeVisible();
  await page.locator("#pan-number").fill(FORM.pan);
  await page.getByRole("button", { name: "Check" }).first().click();
  await expect(page.getByText("Submitted for review").first()).toBeVisible();
  await expect(page.getByText("Verified", { exact: true })).toHaveCount(0);
  await page.locator("#pan-full-name").fill(FORM.businessName);
  await page.getByRole("button", { name: "Check" }).first().click();
  await page.locator("#pan-address").fill(FORM.panAddress);
  await page.locator('input[accept="image/*,application/pdf"]').setInputFiles(file("pan-card.png"));
  await expect(page.getByText("Uploaded · awaiting review")).toBeVisible({ timeout: 40_000 });

  // GSTIN. (CIN has no input anywhere in this form — see the report.)
  await page.getByRole("radio").first().check();
  await page.getByPlaceholder("GSTIN").fill(FORM.gstin);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 8 — first product
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

  // Step 9 — contract, with a DRAWN signature so uploadSignature() runs.
  await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.locator("#contract-name").fill(FORM.ownerName);

  await page.getByRole("button", { name: "Change" }).click();
  await expect(page.getByText("Draw your signature")).toBeVisible();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await drawSignature(page, canvas);
  await page.getByRole("button", { name: "Save Signature" }).click();
  // The drawer must have closed by saving, not by being dismissed.
  await expect(page.getByText("Draw your signature")).toHaveCount(0);

  await page.locator("#supplier-agreement").click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: path.join(SHOTS, "mp4-onboarding-welcome.png"), fullPage: true });

  // ── 2.3 — the assertions that matter, against the database ──
  const db = await signedInDb();

  const { data: vp } = await db.from("vendor_profiles").select("*").eq("id", VENDOR_ID).maybeSingle();
  expect(vp, "vendor_profiles row exists").toBeTruthy();
  expect(vp!.brand_name).toBe(FORM.businessName);
  expect(vp!.pan).toBe(FORM.pan);
  expect(vp!.gstin).toBe(FORM.gstin);
  expect(vp!.state).toBe(FORM.state);
  expect(vp!.postal_code).toBe(FORM.pincode);
  expect(vp!.city).toBe(FORM.city);
  expect(vp!.landmark).toBe(FORM.landmark);
  expect(vp!.area).toBe(FORM.area);
  expect(vp!.address_line).toContain(FORM.building);
  expect(vp!.owner_name).toBe(FORM.ownerName);
  expect(vp!.owner_email).toBe(EMAIL);
  expect(vp!.website).toBe(FORM.website);
  expect(vp!.country).toBe("India");
  expect(vp!.onboarding_complete).toBe(true);
  expect(vp!.category).toContain(FORM.category);
  expect((vp!.office_photos as string[]).length).toBeGreaterThan(0);

  // Every KYC file_url is a PRIVATE storage PATH and must resolve only via a
  // signed URL. A path that still looks like a public URL is the old bug.
  const { data: docs } = await db.from("vendor_documents").select("*").eq("vendor_id", VENDOR_ID);
  const pan = (docs ?? []).find((d) => d.doc_type === "pan");
  expect(pan, "PAN document row").toBeTruthy();
  expect(pan!.verified, "never self-awarded").toBe(false);
  expect(pan!.file_url, "PAN scan path stored").toBeTruthy();
  expect(pan!.file_url as string, "a storage PATH, not a public URL").not.toMatch(/^https?:\/\//);
  expect(pan!.file_url as string, "vendor-id-first path shape is load-bearing").toMatch(
    new RegExp(`^${VENDOR_ID}/kyc/`),
  );
  const { data: signed } = await db.storage.from("business-docs").createSignedUrl(pan!.file_url as string, 300);
  expect(signed?.signedUrl, "a signed URL can be minted").toBeTruthy();
  expect((await fetch(signed!.signedUrl)).ok, "the signed URL actually resolves").toBe(true);

  const gst = (docs ?? []).find((d) => d.doc_type === "gst");
  expect(gst, "GST document row").toBeTruthy();

  // The contract — the row that has never existed in this database.
  const { data: contracts } = await db.from("vendor_contracts").select("*").eq("vendor_id", VENDOR_ID);
  expect(contracts?.length, "exactly one contract row").toBe(1);
  const contract = contracts![0];
  expect(contract.signed_name).toBe(FORM.ownerName);
  expect(contract.agreement_version, "must be the CURRENT constant, not a stale one")
    .toBe(SUPPLIER_AGREEMENT_VERSION);
  expect(contract.signature_url, "a DRAWN signature was uploaded").toBeTruthy();
  expect(contract.signature_url as string, "signature is a private path too").not.toMatch(/^https?:\/\//);
  const { data: sigSigned } = await db.storage
    .from("business-docs")
    .createSignedUrl(contract.signature_url as string, 300);
  expect((await fetch(sigSigned!.signedUrl)).ok, "the signature resolves").toBe(true);

  const { data: products } = await db.from("products").select("*").eq("vendor_id", VENDOR_ID);
  expect(products?.length, "step-8 product created").toBe(1);
  expect(products![0].name).toBe(FORM.product.name);
  expect(products![0].status, "vendors never publish straight to the feed").toBe("under_review");
  expect(products![0].sizes).toEqual(expect.arrayContaining(["M", "L"]));
  expect(products![0].colour).toBe("Black");

  const { data: images } = await db.from("product_images").select("*").eq("product_id", products![0].id);
  expect(images?.length, "product image row written").toBeGreaterThan(0);

  expect(errors, "no console errors during onboarding").toEqual([]);
  await ctx.close();
});

// ── Phase 4.3 ──────────────────────────────────────────────────────────────
test("MP4 P4.3 — the score written at onboarding equals the score the app displays", async ({ browser }) => {
  const db = await signedInDb();

  // What saveVendorOnboarding stored, read BEFORE any dashboard load can
  // recompute and overwrite it.
  const { data: atSubmit } = await db.from("vendor_profiles").select("profile_score").eq("id", VENDOR_ID).maybeSingle();
  const stored = atSubmit!.profile_score as number;

  const ctx = await contextAs(browser);
  const page = await ctx.newPage();
  await page.goto("/business-profile-score");
  await page.waitForLoadState("networkidle");

  const displayed = Number((await page.getByText(/^\d+%$/).first().innerText()).replace("%", ""));

  // And what the dashboard's own recompute left behind afterwards.
  const { data: afterLoad } = await db.from("vendor_profiles").select("profile_score").eq("id", VENDOR_ID).maybeSingle();
  const recomputed = afterLoad!.profile_score as number;

  console.log(`\n[MP4 P4.3] stored at submit=${stored}  displayed=${displayed}  after dashboard recompute=${recomputed}\n`);

  expect(displayed, "the page shows the stored score").toBe(stored);
  expect(recomputed, "the dashboard recompute is a no-op — one formula, one answer").toBe(stored);

  await page.screenshot({ path: path.join(SHOTS, "mp4-profile-score.png"), fullPage: true });
  await ctx.close();
});
