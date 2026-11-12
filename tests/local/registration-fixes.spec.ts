/**
 * Seller registration fixes (2026-11-13; onboarding audit items 1–20), on the local stack.
 *
 * Task 8: the app knows where a registration stands. The gate waits for the database before deciding, an overseas
 * seller waiting for approval sees that, an unregistered seller is told why they can't publish, and a seller
 * registered without a Supplier Agreement can sign one on /kyc.
 */
import { expect, test } from "@playwright/test";
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
