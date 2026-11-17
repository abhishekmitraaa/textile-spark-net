/**
 * The open ToDo items completed on 2026-11-05 (Mitra: "complete them fully"), on the local stack only.
 * The database half of the requirement deadline is in scripts/todo-open/deadline.sql.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, service, signedInContext, sql } from "./stack";

const VENDOR = "22222222-2222-2222-2222-222222222222";
const BUYER = "11111111-1111-1111-1111-111111111111";

test("a rejected campaign gives its reason in words, not the code", async ({ browser }) => {
  const title = `TODO spec campaign ${Date.now().toString(36)}`;
  await service().from("advertisements").insert({
    vendor_id: VENDOR, title, status: "rejected", moderation_reason: "misleading_claims Please fix the headline",
  });
  try {
    const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/advertisements`);
    const card = page.locator("div.rounded-xl.border").filter({ hasText: title });
    await expect(card.getByText("Not approved: Misleading or unverifiable claims — Please fix the headline")).toBeVisible();
    await expect(card.getByText(/misleading_claims/)).toHaveCount(0);
    await ctx.close();
  } finally {
    sql(`delete from public.advertisements where title = '${title}'`);
  }
});

test("the ad types billed per day say /day", async ({ browser }) => {
  const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/advertisements`);
  await page.getByRole("button", { name: /^More \(\d+ more options\)$/ }).click();
  // A card's accessible name starts with its title; Playwright's string name match is a substring match.
  const card = (name: string) => page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) });
  for (const name of ["Wholesaler Pick Ad", "Brand Ad", "Facebook & Instagram Ad", "Google Product Ad", "Social Media Combo"]) {
    await expect(card(name), name).toContainText("/day");
    await expect(card(name), name).not.toContainText("one-time");
  }
  // The website and mobile banners and their combo aren't sold (SH-094); the off-app types are, done by hand (Mitra,
  // 2026-11-17). The certificate is bought on its own in Get verified (SH-093), where its term is a year.
  await expect(card("Web & Mobile Combo"), "Web & Mobile Combo").toHaveCount(0);
  await expect(page.getByTestId("verify-verifiedCertificate")).toContainText("1 year of the badge from approval");
  await ctx.close();
});

test("the Privacy Policy is a real page and every link points to it", async ({ browser, page }) => {
  await page.goto(`${BUYER_URL}/privacy`);
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Support chats, calls and reports/ })).toBeVisible();
  await page.goto(`${BUYER_URL}/register`);
  await page.getByRole("button", { name: /^Buyer/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("link", { name: "Privacy Policy" }).first()).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toHaveAttribute("href", "/terms");

  const ctx = await signedInContext(browser, "buyer", { width: 1440, height: 1000 });
  const p2 = await ctx.newPage();
  await p2.goto(`${BUYER_URL}/profile`);
  await p2.getByRole("button", { name: "Privacy Policy" }).click();
  await expect(p2).toHaveURL(/\/privacy$/);
  await ctx.close();
});

test("Cosora-Admin's Leads says Deadline passed for a requirement past its deadline", async ({ browser }) => {
  const title = `TODO spec deadline ${Date.now().toString(36)}`;
  // Triggers off: the database sets a new requirement's deadline 7 days ahead on insert.
  sql(`set session_replication_role = replica; insert into public.rfqs (buyer_id, title, status, expires_at, created_at)
       values ('${BUYER}', '${title}', 'active', now() - interval '1 hour', now() - interval '8 days')`);
  try {
    const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${ADMIN_URL}/leads`);
    await page.getByRole("button", { name: "Deadline passed" }).click();
    await page.getByLabel("Search").fill(title);
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row.getByText("Deadline passed")).toBeVisible();
    await row.getByRole("button", { name: "View" }).click();
    await expect(page.getByTestId("lead-deadline")).toContainText("Deadline passed");
    await ctx.close();
  } finally {
    sql(`delete from public.rfqs where title = '${title}'`);
  }
});

test("the invented claims are gone from the seller landing page, Cosora Studio, /dashboard and Advertisements", async ({ browser, page }) => {
  await page.goto(`${BUYER_URL}/seller`);
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText("Buyers pay you directly")).toBeVisible();
  for (const gone of ["Hotping", "1 million", "95% of shopping malls", "0% Commission", "0% commission", "Seller success stories", "largest online B2B"]) {
    await expect(page.getByText(gone, { exact: false }), gone).toHaveCount(0);
  }

  await page.goto(`${BUYER_URL}/cosora-studio`);
  await expect(page.getByRole("heading", { name: "Cosora Studio", level: 1 })).toBeVisible();
  await expect(page.getByText("Coming soon")).toBeVisible();
  for (const gone of ["Vogue", "Aarav Mehta", "98765 43210", "Chat & Book Now"]) {
    await expect(page.getByText(gone, { exact: false }), gone).toHaveCount(0);
  }
  await page.goto(`${BUYER_URL}/cosora-studio/1`);
  await expect(page).toHaveURL(/\/cosora-studio$/);

  const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
  const p2 = await ctx.newPage();
  await p2.goto(`${BUYER_URL}/dashboard`);
  await expect(p2).toHaveURL(/\/seller-home$/);
  await p2.goto(`${BUYER_URL}/advertisements`);
  await expect(p2.getByRole("heading", { name: "How Advertising Works" })).toBeVisible();
  for (const gone of ["Success Stories", "5.9 Lakh", "goes live instantly", "Every buyer is vetted", "Join thousands of suppliers"]) {
    await expect(p2.getByText(gone, { exact: false }), gone).toHaveCount(0);
  }
  await ctx.close();
});
