/**
 * /kyc on the local stack: an existing seller adds the registration documents they never
 * gave (the Seller Registration FAQ's list, 2026-10-02), a catalogue included.
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

// The full registration (every document, both countries, failures and retries) is
// tests/local/registration-fixes.spec.ts since the single submit (2026-11-13).

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
