/**
 * Back buttons in seller registration and on Seller Home right after it (2026-11-14), on the local stack.
 *
 * The phone's back button used to leave /onboarding from any step, with no warning, and every answer was lost; step 9
 * had no Back; Back on the "documents added" screen skipped the documents form; and after registering, Seller Home's
 * back bounced off /onboarding and then showed the sign-up landing page's "Get Started".
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount } from "./stack";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });

/** Opens /onboarding the way a seller does: from the seller landing page's button (an in-app navigation). */
async function enter(browser: import("@playwright/test").Browser, prefix: string) {
  const who = await freshAccount(prefix);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/seller`);
  await page.locator('a[href="/onboarding"]').filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeVisible({ timeout: 15_000 });
  return { who, ctx, page };
}

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const step = (page: Page, n: number) => page.getByText(`Step ${n} of 9`);

async function toStep2(page: Page) {
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByPlaceholder("Business name").fill("Back Spec Mills");
  await page.locator("#mobile").fill("9123456780");
}
async function toStep3(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Udhna");
  await page.getByPlaceholder("City").fill("Surat");
  await page.locator("#onboarding-state").selectOption({ label: "Gujarat" });
  await page.getByPlaceholder("6-digit pincode").fill("394210");
}
async function toStep4(page: Page) {
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();
  await page.getByPlaceholder("Full name").fill("Spec Owner");
  await page.getByPlaceholder("name@company.com").fill("owner@spec.example");
}
async function toStep5(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#business-type")).toBeVisible({ timeout: 10_000 });
  await page.locator("#business-type").selectOption("manufacturer");
  await page.getByRole("button", { name: "Add business categories" }).click();
  await page.getByRole("button", { name: "+ Add New Category" }).click();
  await page.getByText("Garment Manufacturer", { exact: true }).click();
  await page.getByRole("button", { name: /Done \(1\)/ }).click();
  const proceed = page.getByRole("button", { name: "Proceed", exact: true });
  if (await proceed.isVisible().catch(() => false)) await proceed.click();
}
async function toStep6(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Business images").setInputFiles([png("front.png")]);
}
async function toStep7(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
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
async function toStep8(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Product images")).toBeAttached({ timeout: 10_000 });
  await page.getByLabel("Product images").setInputFiles([png("kurta.png")]);
  await page.locator("#product-name").fill("Spec Cotton Kurta");
  await page.locator("#product-price").fill("450");
}
async function toContract(page: Page) {
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(heading(page, "Partner contract checkpoint")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(heading(page, "E-Signature")).toBeVisible();
}

test("the phone's back walks the steps and keeps every answer; forward walks them again", async ({ browser }) => {
  test.setTimeout(150_000);
  const { ctx, page } = await enter(browser, "ob-walk");
  await toStep2(page); await toStep3(page); await toStep4(page); await toStep5(page); await toStep6(page); await toStep7(page);
  await expect(step(page, 7)).toBeVisible();

  await page.goBack();
  await expect(step(page, 6)).toBeVisible();
  await expect(page.locator('img[alt*="usiness"], img[alt*="remises"]')).toHaveCount(1);
  await page.goBack();
  await expect(step(page, 5)).toBeVisible();
  await expect(page.locator("#business-type")).toHaveValue("manufacturer");
  await page.goBack();
  await expect(heading(page, "Owner details")).toBeVisible();
  await expect(page.getByPlaceholder("Full name")).toHaveValue("Spec Owner");
  await page.goBack();
  await expect(heading(page, "Business Address")).toBeVisible();
  await expect(page.getByPlaceholder("City")).toHaveValue("Surat");
  await page.goBack();
  await expect(heading(page, "Business Details")).toBeVisible();
  await expect(page.getByPlaceholder("Business name")).toHaveValue("Back Spec Mills");
  await expect(page).toHaveURL(/\/onboarding$/);

  for (let i = 0; i < 5; i++) await page.goForward();
  await expect(step(page, 7)).toBeVisible();
  await expect(page.locator("#pan-number")).toHaveValue("ABCPE1234F");
  // The on-screen Back is the same move.
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(step(page, 6)).toBeVisible();
  await ctx.close();
});

test("back from step 1 asks before leaving once something was answered: Stay keeps the answers, Leave goes", async ({ browser }) => {
  const { ctx, page } = await enter(browser, "ob-leave");
  await toStep2(page);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeVisible();
  await page.goBack();
  const ask = page.getByRole("dialog", { name: "Leave your registration?" });
  await expect(ask).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
  await ask.getByRole("button", { name: "Stay and continue" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByPlaceholder("Business name")).toHaveValue("Back Spec Mills");

  // The logo asks too.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(heading(page, "Business Address")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByAltText("Cosora For Sellers").click();
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Stay and continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.goBack();
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page).toHaveURL(/\/seller$/);
  await ctx.close();
});

test("back from step 1 with nothing answered leaves in one press", async ({ browser }) => {
  const { ctx, page } = await enter(browser, "ob-quick");
  await page.goBack();
  await expect(page).toHaveURL(/\/seller$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await ctx.close();
});

test("step 9 has a Back on both screens, and the phone's back works there too", async ({ browser }) => {
  test.setTimeout(150_000);
  const { ctx, page } = await enter(browser, "ob-nine");
  await toStep2(page); await toStep3(page); await toStep4(page); await toStep5(page); await toStep6(page); await toStep7(page);
  await toStep8(page); await toContract(page);

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(heading(page, "Partner contract checkpoint")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(step(page, 8)).toBeVisible();
  await expect(page.locator("#product-name")).toHaveValue("Spec Cotton Kurta");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Edit details", exact: true }).click({ timeout: 10_000 });
  await expect(heading(page, "E-Signature")).toBeVisible();
  await page.goBack();
  await expect(heading(page, "Partner contract checkpoint")).toBeVisible();
  await ctx.close();
});

test("Back on the 'documents added' screen returns to step 6, and Next shows the documents form again", async ({ browser }) => {
  test.setTimeout(150_000);
  const { ctx, page } = await enter(browser, "ob-added");
  await toStep2(page); await toStep3(page); await toStep4(page); await toStep5(page); await toStep6(page); await toStep7(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Business documents added")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click({ timeout: 1_200 });
  await expect(step(page, 6)).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(heading(page, "Business documents")).toBeVisible();
  await expect(page.locator("#pan-number")).toHaveValue("ABCPE1234F");
  await ctx.close();
});

test("after registering, Seller Home's back goes to the page before the registration, which offers Seller Home", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await enter(browser, "ob-done");
  await toStep2(page); await toStep3(page); await toStep4(page); await toStep5(page); await toStep6(page); await toStep7(page);
  await toStep8(page); await toContract(page);
  await page.locator("#contract-name").fill("Spec Owner");
  await page.locator("#supplier-agreement").click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Welcome to Cosora")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Go to Seller Home" }).click();
  await expect(page).toHaveURL(/\/seller-home$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

  await page.goBack();
  await expect(page).toHaveURL(/\/seller$/);
  const home = page.getByRole("link", { name: "Go to seller home" }).filter({ visible: true }).first();
  await expect(home).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Started", exact: true })).toHaveCount(0);
  await home.click();
  await expect(page).toHaveURL(/\/seller-home$/);
  await ctx.close();
});
