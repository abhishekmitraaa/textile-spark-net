/**
 * The seller registration form, walked as a new seller would (moved out of registration-fixes.spec.ts so other
 * specs can register through the real form too).
 */
import { expect, type Page } from "@playwright/test";

export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
export const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
export const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

export interface RegisterOpts {
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
export async function register(page: Page, o: RegisterOpts = {}) {
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
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
  await page.getByRole("button", { name: "Next", exact: true }).click();  // step 8 adds the product; nothing is sent until step 9
  // Step 9: the agreement.
  await page.getByRole("button", { name: "Edit details", exact: true }).click({ timeout: 10_000 });
  await page.locator("#contract-name").fill("Spec Owner");
  await page.locator("#supplier-agreement").click();
  if (!o.stopBeforeSubmit) await page.getByRole("button", { name: "Submit", exact: true }).click();
}
