/**
 * Seller registration collects the Seller Registration FAQ's documents (2026-10-02), on
 * the local stack. A new account registers end to end: the documents step can't be
 * skipped or passed without a PAN card, a business registration and a masked Aadhaar
 * (with consent); the product step needs a product when there's no catalogue. Then
 * /kyc: an existing seller adds the documents they never gave, a catalogue included.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, watchErrors } from "./stack";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CSV = Buffer.from("name,fabric,moq\nCotton shirt,Cotton,100\n");
const scan = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

async function pickOption(page: Page, trigger: string, option: string) {
  await page.getByRole("combobox", { name: trigger }).click();
  await page.getByRole("option", { name: option }).click();
}

test("a new seller registers with every document the FAQ lists", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await freshAccount("p-reg");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/onboarding`);

  // Steps 1-4: the business.
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByPlaceholder("Business name").fill("Local Weaves");
  await page.getByPlaceholder("Phone number").fill("9000000102");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Ring Road");
  await page.getByPlaceholder("City").fill("Surat");
  await page.getByPlaceholder("State").fill("Gujarat");
  await page.getByPlaceholder("6-digit pincode").fill("395002");
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();
  await page.getByPlaceholder("Full name").fill("Meera Shah");
  await page.getByPlaceholder("name@company.com").fill("meera@example.com");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Steps 5 and 6 (categories, premises photos) can still be skipped.
  await page.getByRole("button", { name: "Skip" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Skip" }).click();

  // Step 7: no Skip, and Next waits for every required document.
  await expect(page.getByText("Business registration*")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  const next = page.getByRole("button", { name: "Next", exact: true });
  await page.locator("#pan-number").fill("ABCDE1234F");
  await page.locator("#pan-full-name").fill("Local Weaves");
  await page.locator("#pan-address").fill("Ring Road, Surat, Gujarat 395002");
  await page.locator('input[type="file"][accept="image/*,application/pdf"]').first().setInputFiles(scan("pan.png"));
  await expect(next).toBeDisabled();
  await pickOption(page, "Business registration", "Udyam (MSME) registration certificate");
  await page.locator("#reg-number").fill("UDYAM-GJ-01-12");
  await expect(page.getByText("A Udyam number looks like UDYAM-GJ-01-0000001.")).toBeVisible();
  await page.locator("#reg-number").fill("UDYAM-GJ-01-0000001");
  await page.getByLabel("Business registration certificate file").setInputFiles(scan("udyam.png"));
  await expect(next).toBeDisabled();
  await page.getByLabel("Masked Aadhaar file").setInputFiles(scan("aadhaar-masked.png"));
  await expect(next).toBeDisabled(); // consent not given yet
  await page.getByText("I agree to share my masked Aadhaar with Cosora").click();
  await expect(next).toBeEnabled();
  await next.click();

  // Step 8: no catalogue, so a product is needed and Skip is gone.
  await expect(page.getByText("Add your first product")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await expect(submit).toBeDisabled();
  await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(scan("shirt.png"));
  await page.locator("#product-name").fill("Cotton shirt");
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();

  // Step 9: the contract.
  await page.getByRole("button", { name: "Edit details" }).click({ timeout: 20_000 });
  await page.locator("#supplier-agreement").click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 30_000 });

  // What was stored.
  const docs = sql(`select string_agg(doc_type || ':' || (file_url is not null) || ':' || detail::text, ' | ' order by doc_type)
                      from public.vendor_documents where vendor_id = '${who.id}'`);
  expect(docs).toContain(`aadhaar:true:{"masked": true`);
  expect(docs).toContain(`business_registration:true:{"kind": "udyam", "number": "UDYAM-GJ-01-0000001"}`);
  expect(docs).toContain("pan:true:{}");
  expect(docs).not.toContain("gst:"); // registered without GST, as the FAQ allows
  expect(Number(sql(`select count(*) from public.products where vendor_id = '${who.id}' and status = 'under_review'`))).toBe(1);
  expect(sql(`select count(*) from public.vendor_documents where vendor_id = '${who.id}' and verified`)).toBe("0");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("an existing seller adds a missing business registration, masked Aadhaar and catalogue on /kyc", async ({ browser }) => {
  const who = await freshAccount("p-kyc", { seller: true });
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/kyc`);
  await expect(page.getByText(/documents are missing/)).toBeVisible();
  await expect(page.getByText("Not registered for GST")).toBeVisible();

  const row = (label: string) => page.locator("div.border-b", { has: page.getByText(label, { exact: true }) }).first();

  // Business registration: a shop licence (its number is optional).
  await row("Business registration").getByRole("button", { name: "Add" }).click();
  await pickOption(page, "Business registration", "Shop and establishment licence");
  await page.getByLabel("Business registration file").setInputFiles(scan("licence.png"));
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Business registration sent for review")).toBeVisible();

  // The masked Aadhaar needs the consent.
  await row("Aadhaar (masked)").getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Aadhaar (masked) file").setInputFiles(scan("aadhaar.png"));
  await expect(page.getByRole("button", { name: "Send for review" })).toBeDisabled();
  await page.getByText("I agree to share my masked Aadhaar with Cosora").click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Aadhaar (masked) sent for review")).toBeVisible();

  // A catalogue of two files: a PDF and a CSV.
  await row("Product catalogue").getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Product catalogue file").setInputFiles([
    { name: "range-2026.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "price-list.csv", mimeType: "text/csv", buffer: CSV },
  ]);
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Product catalogue sent for review")).toBeVisible();
  await expect(page.getByText("2 files")).toBeVisible();
  await expect(page.getByText("range-2026.pdf")).toBeVisible();

  const kinds = sql(`select string_agg(doc_type, ',' order by doc_type) from public.vendor_documents where vendor_id = '${who.id}'`);
  expect(kinds).toBe("aadhaar,business_registration,catalog,catalog");
  expect(sql(`select detail ->> 'kind' from public.vendor_documents where vendor_id = '${who.id}' and doc_type = 'business_registration'`)).toBe("shop_establishment");
  expect(errors).toEqual([]);
  await ctx.close();
});
