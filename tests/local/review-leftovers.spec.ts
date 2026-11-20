/**
 * The 2026-11-18 buyer review's leftovers in sign-in (2026-11-20; Mitra allowed Register, OtpVerify and AuthContext for
 * L-63 and L-64): fewer profile reads in a sign-up, the role picked on Register wins for an unfinished account, and a
 * sign-up that started on the sign-in callback (Google, the email link) leaves no steps in Back. Local stack only.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, routeDummyOtp, sql } from "./stack";

function freshPhone(): string {
  return `8${String(Date.now()).slice(-9)}`;
}

async function codeScreen(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/auth\/otp-verify$/, { timeout: 30_000 });
  await page.getByLabel("One-time code").click();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Next" }).click();
}

async function signInByPhone(page: Page, digits: string): Promise<void> {
  await page.goto(`${BUYER_URL}/auth/login`);
  await page.getByPlaceholder("Phone Number").fill(digits);
  await page.getByRole("button", { name: "Send Code" }).click();
  await codeScreen(page);
}

async function buyerSteps(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/auth\/sub-role$/, { timeout: 20_000 });
  await page.getByRole("radio", { name: "Designer / Design Head" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/account-info$/);
  await page.getByPlaceholder("Enter your name").fill("Asha Rao");
  await page.getByPlaceholder("name@company.com").fill("asha@example.com");
  await page.getByPlaceholder("Your company or brand name").fill("Asha Textiles");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/interest-preference$/);
  await page.locator("[data-interest-id]").first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/terms$/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/welcome$/, { timeout: 20_000 });
  await page.getByRole("button", { name: /^(Go to Home|Continue where you were)$/ }).click();
  await expect(page).not.toHaveURL(/\/auth\//, { timeout: 20_000 });
}

test.describe("L-64 · a phone sign-up reads the profile less", () => {
  test("Login → role → steps → Terms: three profile-row reads, one admin check", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    const reads = { row: 0, contact: 0, admin: 0 };
    page.on("request", (r) => {
      const u = r.url();
      if (/\/rest\/v1\/profiles\?.*select=[^&]*onboarded/.test(u) && r.method() === "GET") reads.row++;
      if (u.includes("/rest/v1/rpc/my_contact_info")) reads.contact++;
      if (u.includes("/rest/v1/rpc/is_admin")) reads.admin++;
    });
    try {
      await signInByPhone(page, freshPhone());
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      await page.getByRole("radio", { name: /^BUYER/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await buyerSteps(page);
      // Sign-in's own load (1), Account Information (1), Terms (1). It was 5 rows, 4 contact reads and 4 admin checks.
      expect(reads.row, JSON.stringify(reads)).toBeLessThanOrEqual(3);
      expect(reads.admin, JSON.stringify(reads)).toBe(1);
      expect(reads.contact, JSON.stringify(reads)).toBeLessThanOrEqual(2);
    } finally {
      await ctx.close();
    }
  });
});

test.describe("L-63 · Register's role wins for an account that hadn't finished", () => {
  test("an unfinished buyer who registers again as a seller goes on as a seller", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    const digits = freshPhone();
    try {
      // First visit: the number gets an account (a buyer by default) and stops at role selection.
      await signInByPhone(page, digits);
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      const id = sql(`select id from auth.users where phone = '91${digits}'`);
      expect(sql(`select active_role || ':' || onboarded from public.profiles where id = '${id}'`)).toBe("buyer:false");
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        await supabase.auth.signOut();
        sessionStorage.clear();
      });

      // Second visit: Register as a seller with the same number.
      await page.goto(`${BUYER_URL}/register?as=seller`);
      await page.getByRole("button", { name: /^Continue/ }).click();
      await page.getByPlaceholder("John Doe").fill("Ravi Kumar");
      await page.getByPlaceholder("My Factory").fill("Ravi Mills");
      await page.getByPlaceholder("Phone Number").fill(digits);
      await page.getByRole("button", { name: /Send Code/ }).click();
      await codeScreen(page);
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
      expect(sql(`select active_role from public.profiles where id = '${id}'`)).toBe("seller");
    } finally {
      await ctx.close();
    }
  });

  test("a finished buyer who uses Register keeps their own side", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    const digits = freshPhone();
    try {
      await signInByPhone(page, digits);
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      const id = sql(`select id from auth.users where phone = '91${digits}'`);
      sql(`update public.profiles set onboarded = true, terms_version = public.buyer_terms_version(), terms_accepted_at = now() where id = '${id}';
           insert into public.terms_acceptances (profile_id, terms_version, source) values ('${id}', public.buyer_terms_version(), 'signup');`);
      await page.evaluate(async () => {
        const { supabase } = await import("/src/lib/supabase.ts");
        await supabase.auth.signOut();
        sessionStorage.clear();
      });
      await page.goto(`${BUYER_URL}/register?as=seller`);
      await page.getByRole("button", { name: /^Continue/ }).click();
      await page.getByPlaceholder("John Doe").fill("Ravi Kumar");
      await page.getByPlaceholder("My Factory").fill("Ravi Mills");
      await page.getByPlaceholder("Phone Number").fill(digits);
      await page.getByRole("button", { name: /Send Code/ }).click();
      await codeScreen(page);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 30_000 });
      expect(sql(`select active_role from public.profiles where id = '${id}'`)).toBe("buyer");
    } finally {
      await ctx.close();
    }
  });
});

test.describe("M-58 · a sign-up that started on the sign-in callback leaves no steps in Back", () => {
  test("Home, then Back, is the page before sign-in, not Home again", async ({ browser }) => {
    test.setTimeout(150_000);
    const who = await freshAccount("m58", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session, { width: 390, height: 900 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/categories`);
      // What Google (or the email link) does: a new page load of the callback, with a session.
      await page.goto(`${BUYER_URL}/auth/callback`);
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      await page.getByRole("radio", { name: /^BUYER/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await buyerSteps(page);
      const landed = page.url();
      await page.goBack();
      await page.waitForTimeout(1500);
      // Before the fix every step was still in history and sent Back to Home again (4–5 times).
      expect(page.url()).not.toBe(landed);
      await expect(page).not.toHaveURL(/\/auth\//);
    } finally {
      await ctx.close();
    }
  });
});
