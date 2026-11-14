/**
 * Buyer sign-up fixes (buyer sign-up audit 2026-11-13, items 1–15). Every answer is saved where it is used, nobody is
 * stranded, misrouted or locked to the wrong side, and back behaves. Local stack only.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { allowFeature, BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

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

test.describe("B3 · Account Information prefills, saves only what changed, and its location works", () => {
  const DELHI = { latitude: 28.6139391, longitude: 77.2090212 };
  async function mockLookup(page: Page, answer: Record<string, unknown>, seen: string[] = []) {
    await page.route("https://api.bigdatacloud.net/**", (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
    });
    return seen;
  }

  test("locate, Next, back: every answer is shown again, and the lookup gets a rounded position", async ({ browser }) => {
    const who = await freshAccount("b3-locate", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    await ctx.grantPermissions(["geolocation"]);
    await ctx.setGeolocation(DELHI);
    const page = await ctx.newPage();
    try {
      const seen = await mockLookup(page, { postcode: "110001", city: "New Delhi", principalSubdivision: "Delhi", countryCode: "IN" });
      await page.goto(`${BUYER_URL}/auth/account-info`);
      await expect(page.getByText("Your approximate location (about 1 km) is looked up by BigDataCloud.")).toBeVisible();
      await page.getByPlaceholder("Enter your name").fill("Asha Rao");
      await page.getByPlaceholder("Please enter a valid email address.").fill("asha@example.com");
      await page.getByPlaceholder("Your company or brand name").fill("Asha Textiles");
      await page.getByRole("button", { name: "Use current location" }).click();
      const pin = page.getByPlaceholder("Enter Pincode");
      await expect(pin).toHaveValue("110001");
      await expect(pin).toBeEnabled();
      expect(seen).toHaveLength(1);
      const q = new URL(seen[0]).searchParams;
      for (const k of ["latitude", "longitude"]) expect((q.get(k) ?? "").split(".")[1]?.length ?? 0, k).toBeLessThanOrEqual(2);

      await page.getByRole("button", { name: "NEXT" }).click();
      await expect(page).toHaveURL(/\/auth\/interest-preference$/);
      expect(sql(`select concat_ws('|', company, postal_code, city, state) from public.buyer_profiles where id = '${who.id}'`))
        .toBe("Asha Textiles|110001|New Delhi|Delhi");
      expect(sql(`select full_name from public.profiles where id = '${who.id}'`)).toBe("Asha Rao");

      await page.goBack();
      await expect(page).toHaveURL(/\/auth\/account-info$/);
      await expect(page.getByPlaceholder("Enter your name")).toHaveValue("Asha Rao");
      await expect(page.getByPlaceholder("Please enter a valid email address.")).toHaveValue("asha@example.com");
      await expect(page.getByPlaceholder("Your company or brand name")).toHaveValue("Asha Textiles");
      await expect(page.getByPlaceholder("Enter Pincode")).toHaveValue("110001");
    } finally {
      await ctx.close();
    }
  });

  test("a typed pincode replaces the located place: city and state are cleared", async ({ browser }) => {
    const who = await freshAccount("b3-typed", { onboarded: false });
    sql(`update public.profiles set full_name = 'Asha Rao', email = 'asha@example.com' where id = '${who.id}';
         insert into public.buyer_profiles (id, company, postal_code, city, state) values ('${who.id}', 'Asha Textiles', '560001', 'Bengaluru', 'Karnataka')
         on conflict (id) do update set company = excluded.company, postal_code = excluded.postal_code, city = excluded.city, state = excluded.state;`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/account-info`);
      const pin = page.getByPlaceholder("Enter Pincode");
      await expect(pin).toHaveValue("560001");
      await pin.fill("110001");
      await page.getByRole("button", { name: "NEXT" }).click();
      await expect(page).toHaveURL(/\/auth\/interest-preference$/);
      expect(sql(`select concat_ws('|', postal_code, coalesce(city, 'NULL'), coalesce(state, 'NULL')) from public.buyer_profiles where id = '${who.id}'`))
        .toBe("110001|NULL|NULL");
    } finally {
      await ctx.close();
    }
  });

  test("Next with nothing changed writes nothing", async ({ browser }) => {
    const who = await freshAccount("b3-same", { onboarded: false });
    sql(`update public.profiles set full_name = 'Asha Rao', email = 'asha@example.com' where id = '${who.id}';
         insert into public.buyer_profiles (id, display_name, company, postal_code) values ('${who.id}', 'Asha Rao', 'Asha Textiles', '110001')
         on conflict (id) do update set company = excluded.company, postal_code = excluded.postal_code;`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/account-info`);
      await expect(page.getByPlaceholder("Your company or brand name")).toHaveValue("Asha Textiles");
      const writes = watchWrites(page);
      await page.getByRole("button", { name: "NEXT" }).click();
      await expect(page).toHaveURL(/\/auth\/interest-preference$/);
      expect(writes.filter((w) => /\/rest\/v1\/(profiles|buyer_profiles)/.test(w.url())).map((w) => w.url())).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("a position outside India says the lookup is for India and leaves the pincode to type", async ({ browser }) => {
    const who = await freshAccount("b3-uk", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    await ctx.grantPermissions(["geolocation"]);
    await ctx.setGeolocation({ latitude: 51.5074, longitude: -0.1278 });
    const page = await ctx.newPage();
    try {
      await mockLookup(page, { postcode: "SW1A 1AA", city: "London", principalSubdivision: "England", countryCode: "GB" });
      await page.goto(`${BUYER_URL}/auth/account-info`);
      await page.getByRole("button", { name: "Use current location" }).click();
      await expect(page.getByText("Pincode lookup works for India only")).toBeVisible();
      const pin = page.getByPlaceholder("Enter Pincode");
      await expect(pin).toBeEnabled();
      await expect(pin).toHaveValue("");
    } finally {
      await ctx.close();
    }
  });
});

test.describe("B4 · interests are never lost or wiped", () => {
  const SAVED = "{fabrics,kidswear}";

  test("a refused save keeps the buyer on Interest Preference with a message, and nothing changes", async ({ browser }) => {
    const who = await freshAccount("b4-save", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.route("**/rest/v1/buyer_profiles*", (route) =>
        route.request().method() === "POST" ? route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }) : route.continue());
      await page.goto(`${BUYER_URL}/auth/interest-preference`);
      await page.locator("[data-interest-id]").first().click({ force: true });
      await page.getByRole("button", { name: /^Save/ }).click();
      await expect(page.getByText("Couldn't save your interests")).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/interest-preference$/);
      expect(sql(`select coalesce(preferred_categories::text, 'none') from public.buyer_profiles where id = '${who.id}'
                  union all select 'none' limit 1`)).toBe("none");
    } finally {
      await ctx.close();
    }
  });

  test("a failed read on For You shows an error with Retry, never the first-run screen, and writes nothing", async ({ browser }) => {
    const who = await freshAccount("b4-read");
    sql(`insert into public.buyer_profiles (id, preferred_categories) values ('${who.id}', '${SAVED}')
         on conflict (id) do update set preferred_categories = excluded.preferred_categories`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    const writes = watchWrites(page);
    let fail = true;
    try {
      await page.route("**/rest/v1/buyer_profiles*preferred_categories*", (route) =>
        fail && route.request().method() === "GET" ? route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }) : route.continue());
      await page.goto(`${BUYER_URL}/home/for-you`);
      await expect(page.getByText("Couldn't load your interests")).toBeVisible();
      await expect(page.getByRole("button", { name: "Skip for now" })).toHaveCount(0);
      expect(writes.filter((w) => /buyer_profiles/.test(w.url()))).toHaveLength(0);
      expect(sql(`select preferred_categories::text from public.buyer_profiles where id = '${who.id}'`)).toBe(SAVED);

      fail = false;
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(page.getByText("Couldn't load your interests")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Skip for now" })).toHaveCount(0);
      expect(sql(`select preferred_categories::text from public.buyer_profiles where id = '${who.id}'`)).toBe(SAVED);
    } finally {
      await ctx.close();
    }
  });

  test("while the saved interests are loading: no first-run screen, and Save waits", async ({ browser }) => {
    const who = await freshAccount("b4-slow");
    sql(`insert into public.buyer_profiles (id, preferred_categories) values ('${who.id}', '${SAVED}')
         on conflict (id) do update set preferred_categories = excluded.preferred_categories`);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.route("**/rest/v1/buyer_profiles*preferred_categories*", async (route) => {
        await new Promise((r) => setTimeout(r, 3000));
        await route.continue();
      });
      await page.goto(`${BUYER_URL}/home/for-you`);
      await expect(page.getByText("Loading your interests")).toBeVisible();
      await expect(page.getByRole("button", { name: "Skip for now" })).toHaveCount(0);

      await page.goto(`${BUYER_URL}/profile/interest-preference`);
      await page.locator("[data-interest-id]").first().click({ force: true });
      await expect(page.getByRole("button", { name: /^Save/ })).toBeDisabled();
      await expect(page.locator("[data-interest-id][aria-pressed='true']")).toHaveCount(2, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("B6 · an unfinished sign-up is finished first, behind buyer_signup_required", () => {
  test("an unfinished buyer opening Home goes to role selection", async ({ browser }) => {
    const who = await freshAccount("b6-unfinished", { onboarded: false });
    allowFeature("buyer_signup_required", who.id);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/new-arrivals`);
      await expect(page).toHaveURL(/\/auth\/role-selection$/);
    } finally {
      await ctx.close();
    }
  });

  test("an onboarded buyer with no Terms record accepts them once, then stays on Home", async ({ browser }) => {
    const who = await freshAccount("b6-terms", { terms: false });
    allowFeature("buyer_signup_required", who.id);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/new-arrivals`);
      await expect(page).toHaveURL(/\/auth\/terms$/);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "NEXT" }).click();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 20_000 });
      await page.reload();
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/);
      expect(sql(`select source from public.terms_acceptances where profile_id = '${who.id}'`)).toBe("reaccept");
    } finally {
      await ctx.close();
    }
  });

  test("with the switch off nothing redirects", async ({ browser }) => {
    const who = await freshAccount("b6-off", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/new-arrivals`);
      await page.waitForTimeout(2500);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/);
    } finally {
      await ctx.close();
    }
  });

  test("a registered seller is never caught, on either side", async ({ browser }) => {
    const who = await freshAccount("b6-seller", { seller: true, terms: false });
    sql(`update public.profiles set active_role = 'seller' where id = '${who.id}';
         insert into public.vendor_contracts (vendor_id, signed_name, agreement_version) values ('${who.id}', 'b6 seller', 'harness')
         on conflict do nothing;`);
    allowFeature("buyer_signup_required", who.id);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      for (const path of ["/seller-home", "/home/new-arrivals"]) {
        await page.goto(`${BUYER_URL}${path}`);
        await page.waitForTimeout(2500);
        await expect(page, path).toHaveURL(new RegExp(`${path}$`));
      }
    } finally {
      await ctx.close();
    }
  });

  test("Help stays open for an unfinished account", async ({ browser }) => {
    const who = await freshAccount("b6-help", { onboarded: false });
    allowFeature("buyer_signup_required", who.id);
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      for (const path of ["/profile/help", "/help"]) {
        await page.goto(`${BUYER_URL}${path}`);
        await page.waitForTimeout(2000);
        await expect(page, path).toHaveURL(new RegExp(`${path}$`));
      }
    } finally {
      await ctx.close();
    }
  });
});
