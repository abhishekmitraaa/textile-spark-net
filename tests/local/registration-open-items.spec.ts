/**
 * The registration form's open items after the 2026-11-13 release (onboarding audit #21–#25, #27, #29), on the local
 * stack. Each case walks only as far as it needs to.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount } from "./stack";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });

async function open(browser: import("@playwright/test").Browser, prefix: string) {
  const who = await freshAccount(prefix);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/onboarding`);
  await expect(page.getByRole("button", { name: "Edit details", exact: true })).toBeVisible({ timeout: 15_000 });
  return { ctx, page };
}

/** Steps 2–4, with valid answers. */
async function throughOwner(page: Page) {
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByPlaceholder("Business name").fill("Open Items Mills");
  await page.locator("#mobile").fill("9123456780");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Udhna");
  await page.getByPlaceholder("City").fill("Surat");
  await page.locator("#onboarding-state").selectOption({ label: "Gujarat" });
  await page.getByPlaceholder("6-digit pincode").fill("394210");
  await page.getByRole("button", { name: "Add business address" }).click();
  await page.getByRole("button", { name: "Save business address" }).click();
  await page.getByPlaceholder("Full name").fill("Spec Owner");
  await page.getByPlaceholder("name@company.com").fill("owner@spec.example");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#business-type")).toBeVisible({ timeout: 10_000 });
}

test("a signed-in seller sees no Login button; the documents list's Okay closes it; the overview row opens step 2", async ({ browser }) => {
  const { ctx, page } = await open(browser, "oi-head");
  await expect(page.getByRole("button", { name: "Login" })).toHaveCount(0);

  await page.getByRole("button", { name: "Documents required for registration" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Okay" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /Business information/ }).click();
  await expect(page.getByRole("heading", { name: "Business Details" })).toBeVisible();
  await ctx.close();
});

test("step 3 has no dead search box or movable-pin claim, and the X clears the address", async ({ browser }) => {
  const { ctx, page } = await open(browser, "oi-addr");
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByPlaceholder("Business name").fill("Open Items Mills");
  await page.locator("#mobile").fill("9123456780");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByPlaceholder("Search for area, street name")).toHaveCount(0);
  await expect(page.getByText(/Move pin/)).toHaveCount(0);
  await page.getByPlaceholder("Area / Sector / Locality*").fill("Udhna");
  await page.getByPlaceholder("City").fill("Surat");
  await page.getByRole("button", { name: "Clear the address" }).click();
  await expect(page.getByPlaceholder("Area / Sector / Locality*")).toHaveValue("");
  await expect(page.getByPlaceholder("City")).toHaveValue("");
  await ctx.close();
});

test("leaving mid-registration asks first; the help button steps aside while a field is in use", async ({ browser }) => {
  const { ctx, page } = await open(browser, "oi-leave");
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByPlaceholder("Business name").fill("Half Done Mills");
  const help = page.getByRole("button", { name: "WhatsApp help" });
  await expect(help).toBeHidden(); // the name field has focus
  await page.getByRole("heading", { name: "Business Details" }).click();
  await expect(help).toBeVisible();

  let asked = false;
  page.on("dialog", async (d) => { if (d.type() === "beforeunload") asked = true; await d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked, { timeout: 5_000 }).toBe(true);
  await ctx.close();
});

test("one Back per step; the category picker is a dialog", async ({ browser }) => {
  const { ctx, page } = await open(browser, "oi-back");
  await throughOwner(page);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Add business categories" }).click();
  await expect(page.getByRole("dialog", { name: "Add Business Categories" })).toBeVisible();
  await ctx.close();
});

test("the PAN step says the format looks right, not that anything was submitted; step 8 adds the product, then a saved signature survives Close", async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page } = await open(browser, "oi-sign");
  await throughOwner(page);
  await page.locator("#business-type").selectOption("manufacturer");
  await page.getByRole("button", { name: "Add business categories" }).click();
  await page.getByRole("button", { name: "+ Add New Category" }).click();
  await page.getByText("Garment Manufacturer", { exact: true }).click();
  await page.getByRole("button", { name: /Done \(1\)/ }).click();
  const proceed = page.getByRole("button", { name: "Proceed", exact: true });
  if (await proceed.isVisible().catch(() => false)) await proceed.click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Business images").setInputFiles([png("front.png")]);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.locator("#pan-number").fill("ABCPE1234F");
  await page.getByRole("button", { name: "Check", exact: true }).first().click();
  await expect(page.getByText("Format looks right").first()).toBeVisible();
  await expect(page.getByText("Submitted for review")).toHaveCount(0);
  await page.locator("#pan-full-name").fill("Spec Owner");
  await page.locator("#pan-address").fill("12 Udhna, Surat");
  await page.getByLabel("PAN file").setInputFiles([png("pan.png")]);
  await page.locator("#reg-kind").click();
  await page.getByRole("option", { name: "Shop and establishment licence" }).click();
  await page.getByLabel("Business registration certificate file").setInputFiles([pdf("licence.pdf")]);
  await page.getByLabel("Masked Aadhaar file").setInputFiles([png("aadhaar.png")]);
  await page.getByText(/I agree to share my masked Aadhaar/).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByLabel("Product images").setInputFiles([png("kurta.png")]);
  await page.locator("#product-name").fill("Spec Cotton Kurta");
  await page.locator("#product-price").fill("450");
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("First product added. It's sent with your registration.")).toBeVisible();
  await expect(page.getByText("Product details uploaded")).toHaveCount(0);

  // Step 9: draw and save a signature, then open the drawer again and Close without saving.
  await page.getByRole("button", { name: "Edit details", exact: true }).click({ timeout: 10_000 });
  await page.getByRole("button", { name: "Change" }).click();
  const canvas = page.locator("canvas");
  // The drawer slides up: read the canvas's place once it has stopped moving, or the stroke lands beside it.
  let box = (await canvas.boundingBox())!;
  await expect.poll(async () => {
    const now = (await canvas.boundingBox())!;
    const still = now.y === box.y && now.height === box.height;
    box = now;
    return still;
  }, { intervals: [150] }).toBe(true);
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Save Signature" }).click();
  await expect(page.getByAltText("Manual signature")).toBeVisible();
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByAltText("Manual signature")).toBeVisible();
  await ctx.close();
});
