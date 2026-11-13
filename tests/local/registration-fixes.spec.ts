/**
 * Seller registration fixes (2026-11-13; onboarding audit items 1–20), on the local stack.
 *
 * Task 8: the app knows where a registration stands. The gate waits for the database before deciding, an overseas
 * seller waiting for approval sees that, an unregistered seller is told why they can't publish, and a seller
 * registered without a Supplier Agreement can sign one on /kyc.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, stack, watchErrors } from "./stack";

const GATE = "seller_registration_required";
const switchedOn: string[] = [];
/** Sellers whose listings a test made: removed after it, so the feeds (and reach.sql's baselines) stay as they were. */
const listingSellers: string[] = [];

test.afterEach(() => {
  while (switchedOn.length) disallowFeature(GATE, switchedOn.pop()!);
  while (listingSellers.length) sql(`delete from public.products where vendor_id = '${listingSellers.pop()}';`);
});

function gateOn(id: string) {
  allowFeature(GATE, id);
  switchedOn.push(id);
}

function signContract(id: string) {
  sql(`insert into public.vendor_contracts (vendor_id, signed_name, agreement_version) values ('${id}', 'Spec Owner', '2026-09-v1');`);
}

test("a registered seller on a fresh browser opening /onboarding lands on /seller-home", async ({ browser }) => {
  const who = await freshAccount("rf-gate", { seller: true });
  signContract(who.id);
  // A fresh context: no registration hint in localStorage, so the gate must wait for the database.
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await expect(page).toHaveURL(/\/seller-home$/, { timeout: 15_000 });
  await ctx.close();
});

test("a pending overseas seller sees the waiting screen", async ({ browser }) => {
  const who = await freshAccount("rf-pending");
  sql(`insert into public.vendor_profiles (id, brand_name, country, country_code) values ('${who.id}', 'Dubai Spec', 'United Arab Emirates', 'AE');
       insert into public.vendor_registrations (id, vendor_id, country_code, status) values (gen_random_uuid(), '${who.id}', 'AE', 'pending_review');`);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await expect(page.getByRole("heading", { name: /waiting for Cosora's approval/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);
  await ctx.close();
});

test("an unregistered seller with the switch on sees the banner, and a new listing is refused with the reason", async ({ browser }) => {
  const who = await freshAccount("rf-banner");
  sql(`insert into public.vendor_profiles (id, brand_name) values ('${who.id}', 'Unregistered Spec');`);
  gateOn(who.id);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/seller-home`);
  const banner = page.getByRole("status").filter({ hasText: "Finish your seller registration" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner.getByRole("link", { name: /Finish registration/i })).toHaveAttribute("href", "/onboarding");

  const s = stack();
  const client = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  await client.auth.setSession({ access_token: who.session.access_token, refresh_token: who.session.refresh_token });
  const { error } = await client.from("products").insert({ vendor_id: who.id, name: "Refused listing" });
  expect(error?.message).toBe("Finish your seller registration first");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a seller registered without an agreement signs it on /kyc, and the prompt goes", async ({ browser }) => {
  const who = await freshAccount("rf-sign", { seller: true });
  gateOn(who.id);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/kyc`);
  const card = page.getByRole("region", { name: "Sign the Supplier Agreement" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByLabel("Your full name").fill("Spec Owner");
  await card.getByRole("checkbox").check();
  await card.getByRole("button", { name: "Sign the agreement" }).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
  expect(sql(`select count(*) from public.vendor_contracts where vendor_id = '${who.id}';`)).toBe("1");
  await ctx.close();
});

// ═════════════════════════════ Task 9: the form ═════════════════════════════
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

interface RegisterOpts {
  overseas?: boolean;
  mobilePaste?: string;
  whatsappUpdates?: boolean;
  /** Stop on step 9 without pressing Submit. */
  stopBeforeSubmit?: boolean;
}

async function pasteInto(page: Page, selector: string, text: string) {
  await page.locator(selector).click();
  await page.evaluate(([sel, t]) => {
    const el = document.querySelector(sel) as HTMLInputElement;
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [selector, text] as const);
  await page.keyboard.insertText(text);
}

/** Walks the whole form as a new seller would. */
async function register(page: Page, o: RegisterOpts = {}) {
  await page.getByRole("button", { name: "Edit details" }).click();
  // Step 2: business details.
  if (o.overseas) await page.locator("#registered-country").selectOption({ label: "United Arab Emirates" });
  await page.getByPlaceholder("Business name").fill(o.overseas ? "Dubai Spec Trading" : "Spec Mills");
  if (o.mobilePaste) await pasteInto(page, "#mobile", o.mobilePaste);
  else await page.locator("#mobile").fill(o.overseas ? "+971 50 123 4567" : "9123456780");
  if (o.whatsappUpdates) await page.getByLabel("Send me Cosora updates on WhatsApp").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 3: address.
  await page.getByPlaceholder("Area / Sector / Locality*").fill(o.overseas ? "Al Quoz" : "Udhna");
  await page.getByPlaceholder("City").fill(o.overseas ? "Dubai" : "Surat");
  if (o.overseas) {
    await page.getByPlaceholder("State, province or region").fill("Dubai");
    await page.getByPlaceholder("Postal code").fill("00000");
  } else {
    await page.locator("#onboarding-state").selectOption({ label: "Gujarat" });
    await page.getByPlaceholder("6-digit pincode").fill("394210");
  }
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();
  // Step 4: owner.
  await page.getByPlaceholder("Full name").fill("Spec Owner");
  await page.getByPlaceholder("name@company.com").fill("owner@spec.example");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Step 5: what the business is.
  await expect(page.locator("#business-type")).toBeVisible({ timeout: 10_000 });
  await page.locator("#business-type").selectOption("manufacturer");
  await page.getByRole("button", { name: "Add business categories" }).click();
  await page.getByRole("button", { name: "+ Add New Category" }).click();
  await page.getByText("Garment Manufacturer", { exact: true }).click();
  await page.getByRole("button", { name: /Done \(1\)/ }).click();
  const proceed = page.getByRole("button", { name: "Proceed", exact: true });
  if (await proceed.isVisible().catch(() => false)) await proceed.click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 6: premises photos (held until submit).
  await page.getByLabel("Business images").setInputFiles([png("front.png")]);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 7: documents.
  if (o.overseas) {
    await page.locator("#os-reg-number").fill("TL-12345");
    await page.getByLabel("Registration certificate file", { exact: true }).setInputFiles([pdf("licence.pdf")]);
    await page.locator("#os-id-kind").selectOption("passport");
    await page.getByLabel("Owner ID file", { exact: true }).setInputFiles([png("passport.png")]);
  } else {
    await page.locator("#pan-number").fill("ABCPE1234F");
    await page.locator("#pan-full-name").fill("Spec Owner");
    await page.locator("#pan-address").fill("12 Udhna, Surat");
    await page.getByLabel("PAN file").setInputFiles([png("pan.png")]);
    await page.locator("#reg-kind").click();
    await page.getByRole("option", { name: "Shop and establishment licence" }).click();
    await page.getByLabel("Business registration certificate file").setInputFiles([pdf("licence.pdf")]);
    await page.getByLabel("Masked Aadhaar file").setInputFiles([png("aadhaar.png")]);
    await page.getByText(/I agree to share my masked Aadhaar/).click();
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 8: first product.
  await expect(page.getByLabel("Product images")).toBeAttached({ timeout: 10_000 });
  await page.getByLabel("Product images").setInputFiles([png("kurta.png")]);
  await page.locator("#product-name").fill("Spec Cotton Kurta");
  await page.locator("#product-price").fill("450");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  // Step 9: the agreement.
  await page.getByRole("button", { name: "Edit details" }).click({ timeout: 10_000 });
  await page.locator("#contract-name").fill("Spec Owner");
  await page.locator("#supplier-agreement").click();
  if (!o.stopBeforeSubmit) await page.getByRole("button", { name: "Submit", exact: true }).click();
}

const objectsOf = (id: string) =>
  Number(sql(`select count(*) from storage.objects where split_part(name, '/', 1) = '${id}';`));

test("India happy path: one contract, the flag, the numbers as typed, consent recorded", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("rf-india");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/onboarding`);
  await register(page, { mobilePaste: "+91 98765 43210", whatsappUpdates: true });
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 30_000 });
  expect(sql(`select onboarding_complete || '|' || phone || '|' || whatsapp || '|' || business_type || '|' || country_code
              from public.vendor_profiles where id = '${who.id}';`)).toBe("true|+919876543210|+919876543210|Manufacturer|IN");
  expect(sql(`select count(*) from public.vendor_contracts where vendor_id = '${who.id}';`)).toBe("1");
  expect(sql(`select detail ->> 'holder_name' from public.vendor_documents where vendor_id = '${who.id}' and doc_type = 'pan';`)).toBe("Spec Owner");
  expect(sql(`select count(*) || '|' || coalesce(max(moq), 'null') from public.products where vendor_id = '${who.id}';`)).toBe("1|null");
  expect(sql(`select opted_in from public.contact_consent where profile_id = '${who.id}' and channel = 'whatsapp';`)).toBe("t");
  expect(sql(`select count(*) from public.vendor_premises_photos where vendor_id = '${who.id}' and status = 'under_review';`)).toBe("1");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a refused submit leaves no registration and no files, and Submit works again", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("rf-fail");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await register(page, { stopBeforeSubmit: true });
  // The database refuses (as it does for a bad agreement): the transaction rolled back, so the uploads go.
  await page.route("**/rest/v1/rpc/submit_vendor_registration", (r) => r.fulfill({
    status: 400, contentType: "application/json",
    body: JSON.stringify({ code: "22023", message: "invalid_contract", details: null, hint: null }),
  }));
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Registration not saved")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => objectsOf(who.id), { timeout: 15_000 }).toBe(0);
  expect(sql(`select count(*) from public.vendor_contracts where vendor_id = '${who.id}';`)).toBe("0");
  expect(sql(`select coalesce(bool_or(onboarding_complete), false) from public.vendor_profiles where id = '${who.id}';`)).toBe("f");
  await page.unroute("**/rest/v1/rpc/submit_vendor_registration");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 30_000 });
  expect(sql(`select count(*) from public.products where vendor_id = '${who.id}';`)).toBe("1");
  await ctx.close();
});

test("a dropped connection keeps the uploads, and Submit sends the same files again", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("rf-drop");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await register(page, { stopBeforeSubmit: true });
  // No answer at all: the database may still be saving, so nothing it might use is removed (review #6).
  await page.route("**/rest/v1/rpc/submit_vendor_registration", (r) => r.abort("failed"));
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Registration not saved")).toBeVisible({ timeout: 30_000 });
  const files = objectsOf(who.id);
  expect(files).toBeGreaterThan(0);
  expect(sql(`select count(*) from public.vendor_registrations where vendor_id = '${who.id}';`)).toBe("0");
  await page.unroute("**/rest/v1/rpc/submit_vendor_registration");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 30_000 });
  // The same files were sent again: no second copy, nothing left over.
  expect(objectsOf(who.id)).toBe(files);
  expect(sql(`select count(*) from public.products where vendor_id = '${who.id}';`)).toBe("1");
  await ctx.close();
});

test("keeps files when the RPC committed but the response was lost, and the retry adds nothing", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("rf-lost");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await register(page, { stopBeforeSubmit: true });
  await page.route("**/rest/v1/rpc/submit_vendor_registration", async (r) => {
    await r.fetch();               // the database commits...
    await r.fulfill({ status: 503, body: "{}" });   // ...and the reply is lost
  });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Registration not saved")).toBeVisible({ timeout: 30_000 });
  expect(sql(`select onboarding_complete from public.vendor_profiles where id = '${who.id}';`)).toBe("t");
  const files = objectsOf(who.id);
  expect(files).toBeGreaterThan(0);
  await page.unroute("**/rest/v1/rpc/submit_vendor_registration");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 30_000 });
  expect(sql(`select count(*) from public.products where vendor_id = '${who.id}';`)).toBe("1");
  expect(sql(`select count(*) from public.vendor_contracts where vendor_id = '${who.id}';`)).toBe("1");
  expect(objectsOf(who.id)).toBe(files);
  await ctx.close();
});

test("location: an unknown state stays unpicked and blocks the address; a typed city isn't overwritten", async ({ browser }) => {
  const who = await freshAccount("rf-geo");
  const ctx = await contextWithSession(browser, who.session);
  await ctx.grantPermissions(["geolocation"]);
  await ctx.setGeolocation({ latitude: 21.17, longitude: 72.83 });
  const page = await ctx.newPage();
  await page.route("**/api.bigdatacloud.net/**", (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ city: "Surat", locality: "Athwa", principalSubdivision: "Gujarat State", postcode: "395001" }),
  }));
  await page.goto(`${BUYER_URL}/onboarding`);
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByPlaceholder("Business name").fill("Geo Mills");
  await page.locator("#mobile").fill("9123456780");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByPlaceholder("City").fill("Typed City");
  await page.getByRole("button", { name: "Use current location" }).click();
  await expect(page.getByPlaceholder("6-digit pincode")).toHaveValue("395001", { timeout: 10_000 });
  await expect(page.getByPlaceholder("City")).toHaveValue("Typed City");
  await expect(page.locator("#onboarding-state")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Add business address" })).toBeDisabled();
  await page.getByPlaceholder("City").fill("");
  await page.locator("#onboarding-state").selectOption({ label: "Gujarat" });
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Athwa");
  await expect(page.getByRole("button", { name: "Add business address" })).toBeDisabled();   // City is required
  await ctx.close();
});

test("steps 5 and 6 can't be skipped, and the owner email must be real", async ({ browser }) => {
  const who = await freshAccount("rf-skip");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByPlaceholder("Business name").fill("Skip Mills");
  await page.locator("#mobile").fill("9123456780");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Udhna");
  await page.getByPlaceholder("City").fill("Surat");
  await page.locator("#onboarding-state").selectOption({ label: "Gujarat" });
  await page.getByPlaceholder("6-digit pincode").fill("394210");
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();
  await page.getByPlaceholder("Full name").fill("Skip Owner");
  await page.getByPlaceholder("name@company.com").fill("a");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByPlaceholder("name@company.com").fill("owner@skip.example");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#business-type")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Skip/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await ctx.close();
});

test("an overseas seller (switch on) registers with a passport and waits for approval", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("rf-os");
  allowFeature("overseas_seller_registration", who.id);
  try {
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/onboarding`);
    await register(page, { overseas: true });
    await expect(page.getByRole("heading", { name: /waiting for Cosora's approval/i })).toBeVisible({ timeout: 30_000 });
    expect(sql(`select status from public.vendor_registrations where vendor_id = '${who.id}';`)).toBe("pending_review");
    expect(sql(`select coalesce(onboarding_complete, false) || '|' || country_code || '|' || phone from public.vendor_profiles where id = '${who.id}';`))
      .toBe("false|AE|+971501234567");
    expect(sql(`select string_agg(doc_type, ',' order by doc_type) from public.vendor_documents where vendor_id = '${who.id}';`))
      .toBe("business_registration,owner_id");
    await ctx.close();
  } finally {
    disallowFeature("overseas_seller_registration", who.id);
  }
});

test("a rejected overseas seller sees the reason and the details they gave", async ({ browser }) => {
  const who = await freshAccount("rf-rej");
  allowFeature("overseas_seller_registration", who.id);
  try {
    sql(`insert into public.vendor_profiles (id, brand_name, city, country, country_code, owner_name)
           values ('${who.id}', 'Rejected Trading', 'Dubai', 'United Arab Emirates', 'AE', 'Rej Owner');
         insert into public.vendor_registrations (id, vendor_id, country_code, status, reason)
           values (gen_random_uuid(), '${who.id}', 'AE', 'rejected', 'Licence is expired');`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/onboarding`);
    await expect(page.getByText("Licence is expired")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(page.getByPlaceholder("Business name")).toHaveValue("Rejected Trading");
    await expect(page.locator("#registered-country")).toHaveValue("AE");
    await ctx.close();
  } finally {
    disallowFeature("overseas_seller_registration", who.id);
  }
});

// ═════════════════════════════ Task 10: what buyers see ═════════════════════════════
/** A public product-images URL in the seller's own folder: the shape vendor_premises_photos accepts. */
const photoUrl = (vendor: string, name: string) => `${stack().API}/storage/v1/object/public/product-images/${vendor}/office/${name}.png`;

/** A registered seller outside India with one live listing (written as postgres: no review, no publish gate). */
async function overseasSellerWithListing(prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  const name = `Spec ${prefix} ${Date.now().toString(36)}`;
  sql(`update public.vendor_profiles set country = 'United Arab Emirates', country_code = 'AE' where id = '${who.id}';
       insert into public.products (vendor_id, name, price_value, currency, moq, status) values ('${who.id}', '${name}', 250, '₹', '50', 'live');`);
  listingSellers.push(who.id);
  return { ...who, product: name };
}

test("a new seller's store shows no stock photos and no invented Sells list", async ({ browser }) => {
  const who = await freshAccount("rf-store");
  sql(`insert into public.vendor_profiles (id, brand_name, onboarding_complete) values ('${who.id}', 'Plain Store Spec', true);`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/vendor/${who.id}`);
  await expect(page.getByText("Plain Store Spec").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("office-pictures")).toHaveCount(0);
  await expect(page.getByTestId("store-sells")).toHaveCount(0);
  await expect(page.getByText("Hospital Uniforms")).toHaveCount(0);
  const stock = await page.locator("img").evaluateAll((imgs) =>
    imgs.filter((i) => /sewing-line|factory-floor|thread-rack/.test((i as HTMLImageElement).src)).length);
  expect(stock).toBe(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("an approved premises photo and the registered categories reach the store; a rejected photo says why", async ({ browser }) => {
  const who = await freshAccount("rf-photos", { seller: true });
  const approved = photoUrl(who.id, "approved");
  sql(`update public.vendor_profiles set category = '{Menswear,Fabrics}' where id = '${who.id}';
       insert into public.vendor_premises_photos (vendor_id, url, position, status) values ('${who.id}', '${approved}', 0, 'live');
       insert into public.vendor_premises_photos (vendor_id, url, position, status, rejection_reason)
         values ('${who.id}', '${photoUrl(who.id, "rejected")}', 1, 'rejected', 'Blurry, please retake in daylight');`);
  // The cache column holds the approved photo only.
  expect(sql(`select array_to_string(office_photos, ',') from public.vendor_profiles where id = '${who.id}';`)).toBe(approved);

  const buyer = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const store = await buyer.newPage();
  await store.goto(`${BUYER_URL}/vendor/${who.id}`);
  const pics = store.getByTestId("office-pictures");
  await expect(pics).toBeVisible({ timeout: 15_000 });
  await expect(pics.locator("img")).toHaveCount(1);
  await expect(pics.locator("img")).toHaveAttribute("src", approved);
  await expect(store.getByTestId("store-sells")).toContainText("Menswear");
  await expect(store.getByTestId("store-sells")).toContainText("Fabrics");
  await buyer.close();

  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/business-profile`);
  await expect(page.getByTestId("premises-photo-rejections")).toContainText("Blurry, please retake in daylight", { timeout: 15_000 });
  await expect(page.locator('[data-testid="premises-photo"][data-status="rejected"]')).toContainText("Not approved");
  await ctx.close();
});

test("adding a photo on Business Profile sends it for review instead of publishing it", async ({ browser }) => {
  const who = await freshAccount("rf-addphoto", { seller: true });
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/business-profile`);
  await expect(page.getByRole("button", { name: "Add premises photos" })).toBeVisible({ timeout: 15_000 });
  // Registration no longer asks where the seller delivers or how much they make: Business Profile does (D4).
  await expect(page.getByTestId("reach-nudge").getByRole("button", { name: "Add the states you deliver to" })).toBeVisible();
  await expect(page.getByTestId("reach-nudge").getByRole("button", { name: "Add how much you make each month" })).toBeVisible();
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "floor.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator('[data-testid="premises-photo"][data-status="under_review"]')).toContainText("In review", { timeout: 15_000 });
  expect(sql(`select status || ':' || (url like '%/product-images/${who.id}/%')::text from public.vendor_premises_photos where vendor_id = '${who.id}';`))
    .toBe("under_review:true");
  // Not on the store until Cosora approves it.
  expect(sql(`select cardinality(office_photos) from public.vendor_profiles where id = '${who.id}';`)).toBe("0");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a registered seller outside India carries the International supplier label on the store and the card", async ({ browser }) => {
  const who = await overseasSellerWithListing("rf-intl");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/vendor/${who.id}`);
  await expect(page.getByTestId("international-supplier").first())
    .toContainText("International supplier · United Arab Emirates", { timeout: 15_000 });

  // Search Results, browsing with Supplier location: International (the database filters).
  await page.goto(`${BUYER_URL}/search/results`);
  await page.getByRole("button", { name: /filter/i }).first().click();
  await page.getByRole("button", { name: "International", exact: true }).click();
  const card = page.locator("div.rounded-xl").filter({ hasText: who.product });
  await expect(card.first()).toBeVisible({ timeout: 15_000 });
  await expect(card.first().getByTestId("international-supplier")).toHaveText("International supplier");
  await ctx.close();
});

test("Supplier location: International lists only registered sellers outside India", async () => {
  const intl = await overseasSellerWithListing("rf-only");
  // Waiting for approval: not registered, so neither labelled nor listed.
  const pending = await overseasSellerWithListing("rf-wait");
  sql(`update public.vendor_profiles set onboarding_complete = false where id = '${pending.id}';`);
  const s = stack();
  const anon = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc("feed_products", { p_sort: "newest", p_limit: 96, p_supplier: "international" });
  expect(error).toBeNull();
  const rows = (data ?? []) as { name: string; vendor_country_code: string | null }[];
  expect(rows.some((r) => r.name === intl.product)).toBe(true);
  expect(rows.some((r) => r.name === pending.product)).toBe(false);
  expect(rows.every((r) => r.vendor_country_code != null && r.vendor_country_code !== "IN")).toBe(true);
  const all = await anon.rpc("feed_products", { p_sort: "newest", p_limit: 200 });
  const waiting = ((all.data ?? []) as { name: string; vendor_country_code: string | null }[]).find((r) => r.name === pending.product);
  expect(waiting).toBeTruthy();
  expect(waiting?.vendor_country_code).toBeNull();
});

test("a Free seller publishes 1 PDF catalogue; the second is refused with the plan's message", async ({ browser }) => {
  const who = await freshAccount("rf-cat", { seller: true });
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/upload-catalogue`);
  await expect(page.getByTestId("catalogue-allowance")).toContainText("Your Free plan includes 1 PDF catalogue", { timeout: 15_000 });
  await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({ name: "range.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByPlaceholder("e.g. Summer Collection 2025").fill("Spec range");
  await page.getByRole("button", { name: "Upload Catalogue" }).click();
  await expect(page.getByTestId("catalogue-allowance"))
    .toContainText("The Free plan includes 1 PDF catalogue. Upgrade to Basic or above to add more.", { timeout: 15_000 });
  expect(sql(`select count(*) from public.catalogues where vendor_id = '${who.id}';`)).toBe("1");

  // The database decides, whatever the page shows.
  const s = stack();
  const client = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  await client.auth.setSession({ access_token: who.session.access_token, refresh_token: who.session.refresh_token });
  const { error } = await client.from("catalogues").insert({ vendor_id: who.id, title: "Second" });
  expect(error?.message).toBe("The Free plan includes 1 PDF catalogue. Upgrade to Basic or above to add more.");
  await ctx.close();
});

// ═════════════════════════════ Task 11: Cosora-Admin ═════════════════════════════
/** A seller outside India waiting for approval, with a signed agreement, submitted `daysAgo` days ago. */
async function pendingOverseasSeller(prefix: string, daysAgo = 0) {
  const who = await freshAccount(prefix);
  const brand = `${prefix} ${Date.now().toString(36)}`;
  sql(`insert into public.vendor_profiles (id, brand_name, country, country_code) values ('${who.id}', '${brand}', 'United Arab Emirates', 'AE');
       insert into public.vendor_registrations (id, vendor_id, country_code, status, created_at)
         values (gen_random_uuid(), '${who.id}', 'AE', 'pending_review', now() - interval '${daysAgo} days');`);
  signContract(who.id);
  return { ...who, brand };
}

test("an admin approves an overseas registration from the queue, and the seller can publish", async ({ browser }) => {
  const seller = await pendingOverseasSeller("rf-approve");
  gateOn(seller.id);
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/registrations`);
  const row = page.getByTestId("registration-row").filter({ hasText: seller.brand });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("United Arab Emirates (AE)");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });
  expect(sql(`select r.status || ':' || v.onboarding_complete from public.vendor_registrations r join public.vendor_profiles v on v.id = r.vendor_id where r.vendor_id = '${seller.id}';`))
    .toBe("registered:true");
  expect(errors).toEqual([]);
  await ctx.close();

  // Registered: the publish gate lets the seller's listing in (to review).
  const s = stack();
  const client = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  await client.auth.setSession({ access_token: seller.session.access_token, refresh_token: seller.session.refresh_token });
  listingSellers.push(seller.id);
  const { error } = await client.from("products").insert({ vendor_id: seller.id, name: "First overseas listing" });
  expect(error).toBeNull();
});

test("the registrations queue lists the oldest first with days waiting, and a rejection needs a reason", async ({ browser }) => {
  const older = await pendingOverseasSeller("rf-older", 7);
  const newer = await pendingOverseasSeller("rf-newer", 1);
  const ctx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/registrations`);
  const rows = page.getByTestId("registration-row");
  await expect(rows.filter({ hasText: newer.brand })).toBeVisible({ timeout: 15_000 });
  const names = await rows.allInnerTexts();
  const at = (b: string) => names.findIndex((t) => t.includes(b));
  expect(at(older.brand)).toBeGreaterThanOrEqual(0);
  expect(at(older.brand)).toBeLessThan(at(newer.brand));
  await expect(rows.filter({ hasText: older.brand })).toContainText("7 days waiting");

  await rows.filter({ hasText: newer.brand }).getByRole("button", { name: "Ask for changes" }).click();
  const send = page.getByRole("button", { name: "Send back to the seller" });
  await expect(send).toBeDisabled();
  await page.getByPlaceholder(/registration certificate has expired/).fill("The licence copy is unreadable.");
  await send.click();
  await expect(rows.filter({ hasText: newer.brand })).toHaveCount(0, { timeout: 15_000 });
  expect(sql(`select status || ':' || reason from public.vendor_registrations where vendor_id = '${newer.id}';`))
    .toBe("rejected:The licence copy is unreadable.");
  await ctx.close();
});

test("a moderator approves and rejects premises photos from the queue", async ({ browser }) => {
  const who = await freshAccount("rf-queue", { seller: true });
  const good = photoUrl(who.id, "good");
  const dark = photoUrl(who.id, "dark");
  // Their files exist (approval checks), and they're the oldest in the queue, so they're on its first page.
  sql(`insert into storage.objects (bucket_id, name, metadata) values
         ('product-images', '${who.id}/office/good.png', '{}'), ('product-images', '${who.id}/office/dark.png', '{}');`);
  sql(`insert into public.vendor_premises_photos (vendor_id, url, position, created_at) values
         ('${who.id}', '${good}', 0, '2020-01-01'), ('${who.id}', '${dark}', 1, '2020-01-02');`);
  const ctx = await signedInContext(browser, "moderator", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/premises-photos`);
  // By this seller's own files: every seller from freshAccount("rf-queue") has the same name.
  const cards = page.getByTestId("photo-card").filter({ has: page.locator(`img[src*="/${who.id}/"]`) });
  await expect(cards).toHaveCount(2, { timeout: 15_000 });
  await cards.filter({ has: page.locator(`img[src="${good}"]`) }).getByRole("button", { name: "Approve" }).click();
  await expect(cards).toHaveCount(1, { timeout: 15_000 });
  await cards.getByRole("button", { name: "Reject" }).click();
  await page.getByPlaceholder(/photo is blurred/).fill("Too dark to see the floor.");
  await page.getByRole("button", { name: "Reject photo" }).click();
  await expect(cards).toHaveCount(0, { timeout: 15_000 });
  expect(sql(`select string_agg(status || ':' || coalesce(rejection_reason, ''), ',' order by position) from public.vendor_premises_photos where vendor_id = '${who.id}';`))
    .toBe("live:,rejected:Too dark to see the floor.");
  expect(sql(`select array_to_string(office_photos, ',') from public.vendor_profiles where id = '${who.id}';`)).toBe(good);

  // An approved photo can be pulled down later, with a reason; it leaves the store.
  await page.getByRole("button", { name: "Approved" }).click();
  await expect(cards).toHaveCount(1, { timeout: 15_000 });
  await cards.getByRole("button", { name: "Pull down" }).click();
  await page.getByPlaceholder(/photo is blurred/).fill("Shows another company's signboard.");
  await page.getByRole("button", { name: "Pull down photo" }).click();
  await expect(cards).toHaveCount(0, { timeout: 15_000 });
  expect(sql(`select cardinality(office_photos) from public.vendor_profiles where id = '${who.id}';`)).toBe("0");
  await ctx.close();
});

test("the KYC panel shows what came with each document: PAN holder, GSTIN, an overseas seller's IDs", async ({ browser }) => {
  const who = await freshAccount("rf-kyc", { seller: true });
  sql(`insert into public.vendor_documents (vendor_id, doc_type, file_url, detail) values
         ('${who.id}', 'pan', '${who.id}/kyc/pan.png', '{"holder_name": "Spec Holder", "address": "12 Ring Road, Surat"}'),
         ('${who.id}', 'gst', '${who.id}/kyc/gst.pdf', '{"number": "24ABCDE1234F1Z5"}'),
         ('${who.id}', 'tax_id', '${who.id}/kyc/trn.pdf', '{"number": "TRN100200300", "country": "AE"}'),
         ('${who.id}', 'owner_id', '${who.id}/kyc/id.png', '{"kind": "passport", "country": "AE"}');`);
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/vendors/${who.id}`);
  await expect(page.getByText("Name: Spec Holder · Address: 12 Ring Road, Surat")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("GSTIN 24ABCDE1234F1Z5")).toBeVisible();
  // The submit stores the country's code; the panel names it.
  await expect(page.getByText("TRN100200300 · United Arab Emirates (AE)")).toBeVisible();
  await expect(page.getByText("Passport · United Arab Emirates (AE)")).toBeVisible();
  await ctx.close();
});
