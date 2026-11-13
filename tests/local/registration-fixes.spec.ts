/**
 * Seller registration fixes (2026-11-13; onboarding audit items 1–20), on the local stack.
 *
 * Task 8: the app knows where a registration stands. The gate waits for the database before deciding, an overseas
 * seller waiting for approval sees that, an unregistered seller is told why they can't publish, and a seller
 * registered without a Supplier Agreement can sign one on /kyc.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, sql, stack, watchErrors } from "./stack";

const GATE = "seller_registration_required";
const switchedOn: string[] = [];

test.afterEach(() => {
  while (switchedOn.length) disallowFeature(GATE, switchedOn.pop()!);
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

test("a failed submit leaves no registration and no files, and Submit works again", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("rf-fail");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await register(page, { stopBeforeSubmit: true });
  await page.route("**/rest/v1/rpc/submit_vendor_registration", (r) => r.abort("failed"));
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
