/**
 * /kyc on the local stack: a seller with no PAN card on file adds it (onboarding audit #33): the number on the
 * profile, the card as a document with the name and address on it, as the registration stores them.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const card = { name: "pan.png", mimeType: "image/png", buffer: PNG };

async function openPan(browser: import("@playwright/test").Browser, prefix: string, profile = "") {
  const who = await freshAccount(prefix, { seller: true });
  if (profile) sql(`update public.vendor_profiles set ${profile} where id = '${who.id}';`);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/kyc`);
  const row = page.locator("div.border-b", { has: page.getByText("PAN", { exact: true }) }).first();
  await row.getByRole("button", { name: "Add" }).click({ timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "Add your PAN" })).toBeVisible();
  return { who, ctx, page };
}

async function fillCard(page: Page) {
  await page.locator("#kyc-pan-name").fill("Spec Owner");
  await page.locator("#kyc-pan-address").fill("12 Udhna Main Road, Surat");
  await page.getByLabel("PAN file").setInputFiles(card);
}

test("a seller with no PAN adds the number, the name and address on it, and the card", async ({ browser }) => {
  const { who, ctx, page } = await openPan(browser, "pan-add");
  await page.locator("#kyc-pan-number").fill("abcpe1234f");
  await fillCard(page);
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("PAN sent for review")).toBeVisible();

  expect(sql(`select pan from public.vendor_profiles where id = '${who.id}';`)).toBe("ABCPE1234F");
  expect(sql(`select detail ->> 'holder_name' || ' | ' || (detail ->> 'address') || ' | ' || verified
              from public.vendor_documents where vendor_id = '${who.id}' and doc_type = 'pan';`))
    .toBe("Spec Owner | 12 Udhna Main Road, Surat | false");
  expect(sql(`select count(*) from public.vendor_documents d join storage.objects o
              on o.bucket_id = 'business-docs' and o.name = d.file_url where d.vendor_id = '${who.id}' and d.doc_type = 'pan';`)).toBe("1");
  // The row now shows the number, in review.
  await expect(page.getByText("ABCPE1234F")).toBeVisible();
  await ctx.close();
});

test("a GSTIN on file must contain the PAN", async ({ browser }) => {
  const { who, ctx, page } = await openPan(browser, "pan-gst", "gstin = '27AAPFU0939F1ZV'");
  await fillCard(page);
  await page.locator("#kyc-pan-number").fill("ABCPE1234F");
  await expect(page.getByText("The GSTIN doesn't match your PAN.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for review" })).toBeDisabled();
  await page.locator("#kyc-pan-number").fill("AAPFU0939F");
  await expect(page.getByText("The GSTIN doesn't match your PAN.", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("PAN sent for review")).toBeVisible();
  expect(sql(`select pan from public.vendor_profiles where id = '${who.id}';`)).toBe("AAPFU0939F");
  await ctx.close();
});

test("a PAN number already on file is kept; only the card is added", async ({ browser }) => {
  const { who, ctx, page } = await openPan(browser, "pan-keep", "pan = 'ABCPE1234F'");
  await expect(page.locator("#kyc-pan-number")).toHaveText("ABCPE1234F");
  await expect(page.locator("input#kyc-pan-number")).toHaveCount(0);
  await fillCard(page);
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("PAN sent for review")).toBeVisible();
  expect(sql(`select pan from public.vendor_profiles where id = '${who.id}';`)).toBe("ABCPE1234F");
  expect(sql(`select count(*) from public.vendor_documents where vendor_id = '${who.id}' and doc_type = 'pan';`)).toBe("1");
  await ctx.close();
});
