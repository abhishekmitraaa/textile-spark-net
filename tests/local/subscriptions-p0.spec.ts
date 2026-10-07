/**
 * Subscriptions P0 (2026-10-08), on the local stack (checkouts take the demo path there):
 *   * Plan checkouts are closed to accounts the subscription_checkout switch doesn't list:
 *     /subscription says so up front, and the payment functions refuse anyway.
 *   * A super admin lists the seller on Cosora-Admin's Feature switches page, with a
 *     reason; the seller can then buy a plan, including VIP, which is no longer invite-only.
 *   * GSTIN and PAN are checked before they are saved.
 *   * Billing details: the form refuses a GSTIN from another state, then saves.
 * Cleanup is in afterEach (a timed-out test cuts a `finally` short): the switch's list and
 * the billing details go back to how they were. The Admin Log is append-only, so each run
 * uses its own reason text.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, stack, watchErrors,
} from "./stack";

const FLAG = "subscription_checkout";
const listed: string[] = [];
let billingBefore: string | null = null;

test.afterEach(() => {
  while (listed.length) disallowFeature(FLAG, listed.pop() as string);
  if (billingBefore !== null) {
    if (billingBefore === "") sql(`delete from admin.billing_entity`);
    billingBefore = null;
  }
});

const listSize = () => Number(sql(`select cardinality(allow_profile_ids) from public.feature_flags where key = '${FLAG}'`));

test("checkout stays closed until the seller is listed, then VIP can be bought", async ({ browser }) => {
  test.setTimeout(150_000);
  const who = await freshAccount("p0-switch", { seller: true });
  const reason = `P0 spec: list ${who.id}`;
  const vendor = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await vendor.newPage();
  const errors = watchErrors(page);

  // Closed: the page says so and offers no checkout.
  await page.goto(`${BUYER_URL}/subscription`);
  await expect(page.getByText("Plan purchases open soon")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Choose Basic/ })).toBeDisabled();
  // The functions refuse even if the page is bypassed: the seller's own token, straight
  // to the demo checkout.
  const { API, ANON } = stack();
  const direct = await fetch(`${API}/functions/v1/subscription-verify-payment`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${who.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ demo: true, planId: "gold", billingCycle: "monthly" }),
  });
  expect(await direct.json()).toMatchObject({ ok: false, error: "payments_not_open" });
  expect(sql(`select count(*) from public.vendor_subscriptions where vendor_id = '${who.id}'`)).toBe("0");

  // A super admin lists the seller, with a reason.
  const before = listSize();
  const admin = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const adminPage = await admin.newPage();
  await adminPage.goto(`${ADMIN_URL}/feature-flags`);
  await expect(adminPage.getByRole("heading", { name: "Plan checkout" })).toBeVisible();
  await adminPage.getByPlaceholder("Search by name or email").fill("p0-switch");
  await adminPage.getByRole("button", { name: "Add" }).first().click();
  await expect(adminPage.getByRole("button", { name: "Save switch" })).toBeDisabled(); // no reason yet
  await adminPage.getByLabel("Reason").fill(reason);
  listed.push(who.id);
  await adminPage.getByRole("button", { name: "Save switch" }).click();
  await expect(adminPage.getByText("Switch saved.")).toBeVisible();
  const n = before + 1;
  await expect(adminPage.getByText(`On for ${n} listed account${n === 1 ? "" : "s"}`)).toBeVisible();
  expect(sql(`select count(*) from admin.audit_log where target_table = 'public.feature_flags' and reason = '${reason}'`)).toBe("1");
  await admin.close();

  // Open for this seller: VIP is bought like any other plan.
  await page.reload();
  await expect(page.getByText("Plan purchases open soon")).toHaveCount(0);
  await expect(page.getByText("By invitation")).toHaveCount(0);
  await page.getByRole("button", { name: /^Choose Cosora VIP/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Cosora VIP activated \(demo mode\)/)).toBeVisible({ timeout: 30_000 });
  expect(sql(`select plan_id from public.vendor_subscriptions where vendor_id = '${who.id}'`)).toBe("vip");
  expect(errors).toEqual([]);
  await vendor.close();
});

test("GSTIN and PAN are checked before they are saved", async ({ browser }) => {
  const who = await freshAccount("p0-tax", { seller: true });
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/subscription`);

  const gstin = page.getByLabel("GSTIN");
  await gstin.fill("27AAPFU0939F1ZX"); // wrong check character
  await gstin.blur();
  await expect(page.getByText(/Enter a valid 15-character GSTIN/)).toBeVisible();
  expect(sql(`select coalesce(gstin, 'null') from public.vendor_profiles where id = '${who.id}'`)).toBe("null");

  await gstin.fill("27aapfu0939f1zv"); // lower case is fine: it is upper-cased
  await gstin.blur();
  await expect(page.getByText("Tax details saved")).toBeVisible();
  expect(sql(`select gstin from public.vendor_profiles where id = '${who.id}'`)).toBe("27AAPFU0939F1ZV");

  const pan = page.getByLabel("PAN");
  await pan.fill("AAPF10939F");
  await pan.blur();
  await expect(page.getByText(/Enter a valid 10-character PAN/)).toBeVisible();
  await pan.fill("AAPFU0939F");
  await pan.blur();
  await expect(page.getByText(/Enter a valid 10-character PAN/)).toHaveCount(0);
  await expect.poll(() => sql(`select pan from public.vendor_profiles where id = '${who.id}'`)).toBe("AAPFU0939F");
  await ctx.close();
});

test("billing details refuse a GSTIN from another state, then save with a reason", async ({ browser }) => {
  billingBefore = sql(`select coalesce((select to_jsonb(b)::text from admin.billing_entity b), '')`);
  test.skip(billingBefore !== "", "billing details are already set on this stack; the spec only fills an empty one");
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/billing-details`);
  await expect(page.getByRole("heading", { name: "Billing details" })).toBeVisible();
  await expect(page.getByText("Not set yet")).toBeVisible();
  await page.getByLabel("Legal name").fill("Cosora Test Private Limited");
  await page.getByLabel("Registered address").fill("1 Ring Road");
  await page.getByLabel("City").fill("Surat");
  await page.getByLabel("PIN code").fill("395002");
  await page.getByLabel("State").selectOption("GJ");
  await page.getByLabel("GSTIN").fill("27AAPFU0939F1ZV"); // a Maharashtra GSTIN
  await page.getByLabel("PAN").fill("AAPFU0939F");
  await page.getByLabel("Reason").fill(`P0 spec: billing ${Date.now()}`);
  await page.getByRole("button", { name: "Save billing details" }).click();
  await expect(page.getByText("A GSTIN registered in Gujarat starts with 24.")).toBeVisible();

  await page.getByLabel("State").selectOption("MH");
  await page.getByRole("button", { name: "Save billing details" }).click();
  await expect(page.getByText("Billing details saved.")).toBeVisible();
  expect(sql(`select gstin || '|' || state_code from admin.billing_entity`)).toBe("27AAPFU0939F1ZV|MH");
  await ctx.close();
});
