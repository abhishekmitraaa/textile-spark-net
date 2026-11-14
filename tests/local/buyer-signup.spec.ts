/**
 * Buyer sign-up fixes (buyer sign-up audit 2026-11-13, items 1–15). Every answer is saved where it is used, nobody is
 * stranded, misrouted or locked to the wrong side, and back behaves. Local stack only.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { ADMIN_URL, allowFeature, BUYER_URL, contextWithSession, freshAccount, routeDummyOtp, signedInContext, sql } from "./stack";

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

  test("the card shows the clauses of /terms, and the consent words open /terms and /privacy", async ({ browser }) => {
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
      // The Privacy Policy has its own page since 2026-11-14.
      await expect(page.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/terms");
      await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
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
      await page.getByPlaceholder("name@company.com").fill("asha@example.com");
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
      await expect(page.getByPlaceholder("name@company.com")).toHaveValue("asha@example.com");
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

test.describe("B7 · back controls and Register", () => {
  test("the Interest Preference arrow goes back a step without adding an entry", async ({ browser }) => {
    const who = await freshAccount("b7-arrow", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/account-info`);
      await expect(page.getByPlaceholder("Enter your name")).toBeVisible();
      await page.evaluate(() => window.history.pushState(window.history.state, "", "/auth/interest-preference"));
      await page.reload();
      await expect(page.getByRole("heading", { name: "Interest Preference" })).toBeVisible();
      const before = await page.evaluate(() => window.history.length);
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page).toHaveURL(/\/auth\/account-info$/);
      expect(await page.evaluate(() => window.history.length)).toBe(before);
    } finally {
      await ctx.close();
    }
  });

  test("Account Information and Terms have a Back control", async ({ browser }) => {
    const who = await freshAccount("b7-back", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/account-info`);
      await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page).toHaveURL(/\/auth\/sub-role$/);
      await page.goto(`${BUYER_URL}/auth/terms`);
      await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("Register: the details step is a history entry, and back keeps what was typed", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/register`);
      await page.getByRole("button", { name: /Continue/ }).click();
      await expect(page).toHaveURL(/\/register\?step=2$/);
      await page.getByLabel("Full Name").fill("Asha Rao");
      await page.locator("input[name=brandName]").fill("Asha Textiles");
      await page.goBack();
      await expect(page).toHaveURL(/\/register$/);
      await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
      await page.getByRole("button", { name: /Continue/ }).click();
      await expect(page.getByLabel("Full Name")).toHaveValue("Asha Rao");
    } finally {
      await ctx.close();
    }
  });

  test("Register claims nothing invented, and its consent links open the Terms and the Privacy Policy", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/register`);
      await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text).not.toContain("50,000+");
      expect(text).not.toContain("10,000+");
      await page.getByRole("button", { name: /Continue/ }).click();
      await expect(page.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
      await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    } finally {
      await ctx.close();
    }
  });
});

/** A fresh 10-digit Indian mobile number for the dummy sign-in code. */
function freshPhone(): string {
  return `9${String(Date.now()).slice(-9)}`;
}

/** Signs in through Login and the code screen (any 6 digits: the dummy code). */
async function signInByPhone(page: Page, digits: string): Promise<void> {
  await page.goto(`${BUYER_URL}/auth/login`);
  await page.getByPlaceholder("Phone Number").fill(digits);
  await page.getByRole("button", { name: "Send Code" }).click();
  await expect(page).toHaveURL(/\/auth\/otp-verify$/, { timeout: 30_000 });
  await page.getByLabel("One-time code").click();
  await page.keyboard.type("123456");
  await page.getByRole("button", { name: "Next" }).click();
}

/** The profile reads AuthContext and the code screen make (they select `onboarded`). */
const PROFILE_READ = /\/rest\/v1\/profiles\?.*select=[^&]*onboarded/;

test.describe("C1 · a failed profile read never strands or misroutes", () => {
  test("a read that fails once, then works, lands normally", async ({ browser }) => {
    const who = await freshAccount("c1-once");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    let failed = 0;
    try {
      await page.route(PROFILE_READ, (route) =>
        failed++ === 0 ? route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }) : route.continue());
      await page.goto(`${BUYER_URL}/auth/callback`);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test("a read that keeps failing shows Retry on the callback page, and never role selection", async ({ browser }) => {
    const who = await freshAccount("c1-down");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    let down = true;
    try {
      await page.route(PROFILE_READ, (route) =>
        down ? route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }) : route.continue());
      await page.goto(`${BUYER_URL}/auth/callback`);
      await expect(page.getByText("We couldn't load your account")).toBeVisible({ timeout: 10_000 });
      await expect(page).not.toHaveURL(/role-selection/);
      down = false;
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });

  test("on the code screen: a returning account with a failing read gets Retry, not role selection", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    const digits = freshPhone();
    try {
      // First sign-in creates the account; finish it as an onboarded buyer.
      await signInByPhone(page, digits);
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      const id = sql(`select id from auth.users where phone = '91${digits}'`);
      sql(`update public.profiles set onboarded = true, terms_version = public.buyer_terms_version(), terms_accepted_at = now() where id = '${id}'`);
      await page.evaluate(() => localStorage.clear());
      await ctx.clearCookies();

      let down = true;
      await page.route(PROFILE_READ, (route) =>
        down ? route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }) : route.continue());
      await signInByPhone(page, digits);
      await expect(page.getByText("We couldn't load your account")).toBeVisible({ timeout: 15_000 });
      await expect(page).not.toHaveURL(/role-selection/);
      down = false;
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });
});

/** The buyer sign-up steps after role selection, filled in. */
async function finishBuyerSteps(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/auth\/sub-role$/, { timeout: 20_000 });
  await page.getByRole("radio", { name: "Designer / Design Head" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/account-info$/);
  await page.getByPlaceholder("Enter your name").fill("Asha Rao");
  await page.getByPlaceholder("name@company.com").fill("asha@example.com");
  await page.getByPlaceholder("Your company or brand name").fill("Asha Textiles");
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page).toHaveURL(/\/auth\/interest-preference$/);
  await page.locator("[data-interest-id]").first().click();
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page).toHaveURL(/\/auth\/terms$/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 20_000 });
}

test.describe("C2 · after sign-in or sign-up, back leaves the sign-in pages", () => {
  test("a new buyer: one back from Home returns to the page before sign-in", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/categories`);
      await signInByPhone(page, freshPhone());
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      await page.getByRole("radio", { name: /^BUYER/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await finishBuyerSteps(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/categories$/);
    } finally {
      await ctx.close();
    }
  });

  test("a returning buyer: one back from Home returns to the page before sign-in", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    const digits = freshPhone();
    try {
      await signInByPhone(page, digits);
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      const id = sql(`select id from auth.users where phone = '91${digits}'`);
      sql(`update public.profiles set onboarded = true, terms_version = public.buyer_terms_version(), terms_accepted_at = now() where id = '${id}'`);
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

      await page.goto(`${BUYER_URL}/categories`);
      await signInByPhone(page, digits);
      await expect(page).toHaveURL(/\/home\/new-arrivals$/, { timeout: 30_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/categories$/);
    } finally {
      await ctx.close();
    }
  });

  test("signed in, the sign-in pages send you home", async ({ browser }) => {
    const who = await freshAccount("c2-signedin");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      for (const path of ["/auth/login", "/auth/otp-verify"]) {
        await page.goto(`${BUYER_URL}${path}`);
        await expect(page, path).toHaveURL(/\/home\/new-arrivals$/);
      }
    } finally {
      await ctx.close();
    }
  });

  test("a reload in the middle of sign-up still rewinds at the end", async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/categories`);
      await signInByPhone(page, freshPhone());
      await expect(page).toHaveURL(/\/auth\/role-selection$/, { timeout: 30_000 });
      await page.getByRole("radio", { name: /^BUYER/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page).toHaveURL(/\/auth\/sub-role$/);
      await page.reload();
      await finishBuyerSteps(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/categories$/);
    } finally {
      await ctx.close();
    }
  });

  test("Register: a buyer goes on to the Sub-role step after the code", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await routeDummyOtp(ctx);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/register`);
      await page.getByRole("button", { name: /Continue/ }).click();
      await page.getByLabel("Full Name").fill("Asha Rao");
      await page.locator("input[name=brandName]").fill("Asha Textiles");
      await page.locator("input[name=phone]").fill(freshPhone());
      await page.getByRole("button", { name: /Send Code/ }).click();
      await expect(page).toHaveURL(/\/auth\/otp-verify$/, { timeout: 30_000 });
      await page.getByLabel("One-time code").click();
      await page.keyboard.type("123456");
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page).toHaveURL(/\/auth\/sub-role$/, { timeout: 30_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("C3 · the phone field takes a number however it is written", () => {
  test("+91, spaces, dashes and a leading 0 are cleaned to the 10 digits", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/login`);
      const field = page.getByPlaceholder("Phone Number");
      for (const typed of ["+91 99113 11001", "99113 11001", "991-131-1001", "+91-99113-11001"]) {
        await field.fill(typed);
        await expect(field, typed).toHaveValue("9911311001");
      }
      await field.fill("");
      await field.pressSequentially("09911311001");
      await expect(field).toHaveValue("9911311001");

      await field.fill("991131100");
      await expect(page.getByRole("button", { name: "Send Code" })).toBeDisabled();
      // Ten digits that happen to start with 91 stay as they are.
      await field.fill("9198765432");
      await expect(field).toHaveValue("9198765432");
    } finally {
      await ctx.close();
    }
  });

  test("a UK number written with its leading 0", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/login`);
      await page.getByRole("button", { name: /\+91/ }).click();
      await page.getByRole("button", { name: /United Kingdom/ }).click();
      const field = page.getByPlaceholder("Phone Number");
      await field.fill("07700 900123");
      await expect(field).toHaveValue("7700900123");
      await field.fill("+44 7700 900123");
      await expect(field).toHaveValue("7700900123");
    } finally {
      await ctx.close();
    }
  });
});

test.describe("D1 · staff see which emails nobody verified (Cosora-Admin)", () => {
  test("a typed email says 'not verified' on Accounts and on the support request; a confirmed one doesn't", async ({ browser }) => {
    const typed = await freshAccount("d1-typed");
    const confirmed = await freshAccount("d1-google");
    const tag = Date.now().toString(36);
    // The typed one: the profile's email isn't the account's confirmed sign-in address.
    sql(`update public.profiles set email = 'typed-${tag}@example.com', full_name = 'D1 Typed ${tag}' where id = '${typed.id}';
         update public.profiles set full_name = 'D1 Google ${tag}' where id = '${confirmed.id}';
         insert into public.support_tickets (id, requester_id, requester_side, channel, category, subject, status, is_test, created_at)
         values (gen_random_uuid(), '${typed.id}', 'buyer', 'chat', 'other', 'D1 ${tag}', 'open', true, now());
         insert into public.support_ticket_staff (ticket_id) select id from public.support_tickets where subject = 'D1 ${tag}';`);
    const ticketNo = sql(`select ticket_no from public.support_tickets where subject = 'D1 ${tag}'`);
    const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    try {
      await page.goto(`${ADMIN_URL}/accounts?q=D1%20Typed%20${tag}`);
      const typedRow = page.getByRole("row").filter({ hasText: `typed-${tag}@example.com` });
      await expect(typedRow.getByText("not verified")).toBeVisible();

      await page.goto(`${ADMIN_URL}/accounts?q=D1%20Google%20${tag}`);
      const googleRow = page.getByRole("row").filter({ hasText: confirmed.email });
      await expect(googleRow).toBeVisible();
      await expect(googleRow.getByText("not verified")).toHaveCount(0);

      await page.goto(`${ADMIN_URL}/support/${ticketNo}`);
      await expect(page.getByText(`typed-${tag}@example.com`)).toBeVisible();
      await expect(page.getByText("not verified")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});

test.describe("C1 · a sign-up step whose profile read fails", () => {
  test("shows the step instead of a blank page", async ({ browser }) => {
    const who = await freshAccount("c1-step", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.route(PROFILE_READ, (route) => route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }));
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await expect(page.getByRole("radiogroup")).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("C2 · a rewind that lands on a fresh page load", () => {
  test("the sign-in page it lands on finishes the landing", async ({ browser }) => {
    const who = await freshAccount("c2-crossdoc");
    const ctx = await contextWithSession(browser, who.session);
    // What finishAuthFlow leaves behind when history.go reaches an entry of another page load: the old page never
    // gets to navigate, so the sign-in page that loads must.
    await ctx.addInitScript(() => {
      if (!sessionStorage.getItem("c2-once")) {
        sessionStorage.setItem("c2-once", "1");
        sessionStorage.setItem("cosora.authFinishing", JSON.stringify({ at: Date.now(), dest: "/auth/welcome" }));
      }
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/login`);
      await expect(page).toHaveURL(/\/(auth\/welcome|home\/new-arrivals)$/, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Low 4 · For You's first-run screen", () => {
  test("shows no hotlinked stock picture", async ({ browser }) => {
    const who = await freshAccount("l4-pic");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    const hotlinked: string[] = [];
    page.on("request", (r) => { if (/picsum\.photos/.test(r.url())) hotlinked.push(r.url()); });
    try {
      await page.goto(`${BUYER_URL}/home/for-you`);
      await expect(page.getByRole("heading", { name: /Welcome to Cosora/ })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1000);
      expect(hotlinked).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test("the sourcing-location answer is kept on the account and follows the buyer", async ({ browser }) => {
    const who = await freshAccount("l4-loc");
    let ctx = await contextWithSession(browser, who.session);
    let page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/for-you`);
      await page.getByRole("button", { name: "Start" }).click();
      await page.locator("[data-interest-id]").first().click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Surat", exact: true }).click();
      await page.getByRole("button", { name: "Next" }).click();
      await expect.poll(() => sql(`select coalesce(array_to_string(preferred_locations, ','), '') from public.buyer_profiles where id = '${who.id}'`))
        .toBe("surat");
    } finally {
      await ctx.close();
    }
    // Another device: nothing in its browser.
    ctx = await contextWithSession(browser, who.session);
    page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/home/for-you`);
      await expect(page.getByRole("button", { name: "Remove Surat" })).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Low 7 · the profile is read once per page load", () => {
  test("Home reads the profile, is_admin and the contact details once each", async ({ browser }) => {
    const who = await freshAccount("l7-once");
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    const counts = { profile: 0, isAdmin: 0, contact: 0 };
    page.on("request", (r) => {
      const u = r.url();
      if (PROFILE_READ.test(u)) counts.profile++;
      if (/\/rpc\/is_admin\b/.test(u)) counts.isAdmin++;
      if (/\/rpc\/my_contact_info\b/.test(u)) counts.contact++;
    });
    try {
      await page.goto(`${BUYER_URL}/home/new-arrivals`);
      await page.waitForTimeout(5000);
      expect(counts).toEqual({ profile: 1, isAdmin: 1, contact: 1 });
    } finally {
      await ctx.close();
    }
  });
});

test.describe("Low 1, 2, 6, 8 · wording, signed-in steps, selected state, country picker", () => {
  test("role selection and Sub-role: no sign-in link, the picked card is a checked radio, plain wording", async ({ browser }) => {
    const who = await freshAccount("l126", { onboarded: false });
    const ctx = await contextWithSession(browser, who.session);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/role-selection`);
      await expect(page.getByRole("heading", { name: "I am a…" })).toBeVisible();
      const group = page.getByRole("radiogroup");
      await group.getByRole("radio", { name: /^BUYER/ }).click();
      await expect(group.getByRole("radio", { name: /^BUYER/ })).toHaveAttribute("aria-checked", "true");
      await expect(group.getByRole("radio", { name: /^SELLER/ })).toHaveAttribute("aria-checked", "false");
      await expect(page.getByText("Already have an account?")).toHaveCount(0);
      await page.goto(`${BUYER_URL}/auth/sub-role`);
      await expect(page.getByRole("radiogroup")).toBeVisible();
      await expect(page.getByText("Already have an account?")).toHaveCount(0);
      await page.goto(`${BUYER_URL}/auth/account-info`);
      await expect(page.getByText("solely for internal use")).toHaveCount(0);
      await expect(page.getByPlaceholder("name@company.com")).toBeVisible();
      await page.goto(`${BUYER_URL}/auth/interest-preference`);
      await expect(page.getByText("Choose the categories you source.")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("the country picker names the country and shows no flag letters", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BUYER_URL}/auth/login`);
      const picker = page.getByRole("button", { name: "Country code +91, India. Change" });
      await expect(picker).toBeVisible();
      expect(await picker.innerText()).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    } finally {
      await ctx.close();
    }
  });
});
