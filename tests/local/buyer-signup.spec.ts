/**
 * Buyer sign-up fixes (buyer sign-up audit 2026-11-13, items 1–15). Every answer is saved where it is used, nobody is
 * stranded, misrouted or locked to the wrong side, and back behaves. Local stack only.
 */
import { readFileSync } from "node:fs";
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

test.describe("B5 · accepting the Terms is recorded", () => {
  test("accept: one acceptance of the current version, the profile records it, and Home follows", async ({ browser }) => {
    const who = await freshAccount("b5-accept", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/terms`);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "NEXT" }).click();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 20_000 });
      expect(sql(`select count(*) || ':' || bool_and(terms_version = public.buyer_terms_version()) || ':' || max(source)
                    from public.terms_acceptances where profile_id = '${who.id}'`)).toBe("1:true:signup");
      expect(sql(`select onboarded || ':' || (terms_version = public.buyer_terms_version()) || ':' || (terms_accepted_at is not null)
                    from public.profiles where id = '${who.id}'`)).toBe("true:true:true");
    } finally {
      await ctx.close();
    }
  });

  test("the card shows the clauses of /terms, and both consent words open /terms", async ({ browser }) => {
    const who = await freshAccount("b5-card", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/terms`);
      const full = await page.locator("[data-terms-heading]").allInnerTexts();
      expect(full.length).toBeGreaterThan(10);
      await page.goto(`${BUYER_URL}/auth/terms`);
      await expect(page.locator("[data-terms-heading]").first()).toBeVisible();
      expect(await page.locator("[data-terms-heading]").allInnerTexts()).toEqual(full);
      for (const name of ["Terms & Conditions", "Privacy Policy"]) {
        await expect(page.getByRole("link", { name })).toHaveAttribute("href", "/terms");
      }
    } finally {
      await ctx.close();
    }
  });

  test("a browser can't mark itself onboarded", async () => {
    const who = await freshAccount("b5-patch", { onboarded: false });
    const s = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV ?? ".claude/tmp/local-stack-env.json", "utf8"));
    const res = await fetch(`${s.API}/rest/v1/profiles?id=eq.${who.id}`, {
      method: "PATCH",
      headers: { apikey: s.ANON, authorization: `Bearer ${who.session.access_token}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ onboarded: true }),
    });
    expect(res.status).toBe(403);
    expect(sql(`select onboarded from public.profiles where id = '${who.id}'`)).toBe("f");
  });
});

test.describe("B2 · the Sub-role answer is saved", () => {
  test("a pick is saved, one at a time, and shown again after a reload", async ({ browser }) => {
    const who = await freshAccount("b2-pick", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      const group = page.getByRole("radiogroup");
      await expect(group).toBeVisible();
      await group.getByRole("radio", { name: "Sourcing / Purchase Manager" }).click();
      await group.getByRole("radio", { name: "Designer / Design Head" }).click();
      await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page).toHaveURL(/\/auth\/account-info$/);
      expect(sql(`select buyer_role from public.buyer_profiles where id = '${who.id}'`)).toBe("designer");

      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await expect(page.getByRole("radio", { name: "Designer / Design Head" })).toHaveAttribute("aria-checked", "true");
    } finally {
      await ctx.close();
    }
  });

  test("a refused save says so and stays on the step", async ({ browser }) => {
    const who = await freshAccount("b2-refused", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.route("**/rest/v1/buyer_profiles*", (route) =>
        route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }));
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await page.getByRole("radio", { name: "Brand Owner / Founder" }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText("Couldn't save your answer")).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/sub-role$/);
    } finally {
      await ctx.close();
    }
  });

  test("Edit Profile shows the answer and changes it", async ({ browser }) => {
    const who = await freshAccount("b2-edit");
    sql(`insert into public.buyer_profiles (id, buyer_role) values ('${who.id}', 'merchandiser')
         on conflict (id) do update set buyer_role = excluded.buyer_role`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/profile/edit`);
      const field = page.getByLabel("What best describes you");
      await expect(field).toHaveValue("merchandiser");
      await field.selectOption("buying_house");
      await page.getByRole("button", { name: /^Save/ }).click();
      await expect.poll(() => sql(`select buyer_role from public.buyer_profiles where id = '${who.id}'`)).toBe("buying_house");
    } finally {
      await ctx.close();
    }
  });
});
