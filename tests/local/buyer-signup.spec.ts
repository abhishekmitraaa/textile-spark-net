/**
 * Buyer sign-up fixes (buyer sign-up audit 2026-11-13, items 1–15). Every answer is saved where it is used, nobody is
 * stranded, misrouted or locked to the wrong side, and back behaves. Local stack only.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const STEPS = ["/auth/sub-role", "/auth/account-info", "/auth/interest-preference", "/auth/terms"];

/** Writes (POST/PATCH/DELETE) the page sends to the database API. */
function watchWrites(page: Page): Request[] {
  const writes: Request[] = [];
  page.on("request", (r) => {
    if (/\/rest\/v1\//.test(r.url()) && ["POST", "PATCH", "DELETE", "PUT"].includes(r.method())
        && !/\/rpc\/(log_engagement_event|my_feature_flags|is_admin|my_contact_info|my_seller_registration|increment_)/.test(r.url())) {
      writes.push(r);
    }
  });
  return writes;
}

test.describe("B1 · the sign-up steps need a session and close once sign-up is finished", () => {
  test("a signed-out visitor is sent to sign in from every step, and nothing is written", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await ctx.newPage();
    const writes = watchWrites(page);
    try {
      for (const step of [...STEPS, "/auth/role-selection"]) {
        await page.goto(`${BUYER_URL}${step}`);
        await expect(page, step).toHaveURL(/\/auth\/login$/);
      }
      expect(writes.map((w) => w.url())).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("a finished buyer can't reopen role selection or a step in a new tab", async ({ browser }) => {
    const who = await freshAccount("b1-done");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      for (const step of ["/auth/role-selection", ...STEPS]) {
        await page.goto(`${BUYER_URL}${step}`);
        await expect(page, step).toHaveURL(/\/home\/new-arrivals$/);
      }
      expect(sql(`select active_role from public.profiles where id = '${who.id}'`)).toBe("buyer");
    } finally {
      await ctx.close();
    }
  });

  test("an unfinished account still gets role selection and every step", async ({ browser }) => {
    const who = await freshAccount("b1-open", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      for (const step of ["/auth/role-selection", ...STEPS]) {
        await page.goto(`${BUYER_URL}${step}`);
        await expect(page, step).toHaveURL(new RegExp(`${step}$`));
      }
    } finally {
      await ctx.close();
    }
  });

  test("an account onboarded before Terms were recorded can open Terms only", async ({ browser }) => {
    const who = await freshAccount("b1-noterms", { terms: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/terms`);
      await expect(page).toHaveURL(/\/auth\/terms$/);
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/);
    } finally {
      await ctx.close();
    }
  });

  test("a registered seller is sent to Seller Home from the steps", async ({ browser }) => {
    const who = await freshAccount("b1-seller", { seller: true });
    sql(`update public.profiles set active_role = 'seller' where id = '${who.id}'`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await expect(page).toHaveURL(/\/seller-home$/);
    } finally {
      await ctx.close();
    }
  });
});
