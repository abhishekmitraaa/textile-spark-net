/**
 * Seller Home fixes (documentation/seller-home-fixes-plan-2026-11-16.md), on the local stack.
 *
 *   LOCAL_STACK_ENV=../../.claude/tmp/local-stack-env.json LOCAL_BUYER_URL=http://localhost:8097 \
 *   LOCAL_ADMIN_URL=http://localhost:8097 npx playwright test -c playwright.local.config.ts tests/local/seller-home-fixes.spec.ts
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const made: string[] = [];
const rfqsMade: string[] = [];

test.afterEach(() => {
  while (rfqsMade.length) sql(`delete from public.rfqs where id = '${rfqsMade.pop()}';`);
  while (made.length) {
    const id = made.pop()!;
    sql(`delete from public.chat_blocks where blocker_id = '${id}' or blocked_id = '${id}';
         delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function seller(prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  return who;
}

async function openHome(browser: Browser, session: Parameters<typeof contextWithSession>[1]): Promise<Page> {
  const ctx = await contextWithSession(browser, session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/seller-home`);
  return page;
}

// ─────────────────────────── Task 4: data and states ───────────────────────────

test("home makes at most 8 API calls on load", async ({ browser }) => {
  const who = await seller("sh-calls");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  const calls: string[] = [];
  page.on("request", (r) => {
    if (/127\.0\.0\.1:54321\/rest\/v1\//.test(r.url())) calls.push(r.url().replace(/^.*\/rest\/v1\//, "").slice(0, 60));
  });
  await page.goto(`${BUYER_URL}/seller-home`);
  await expect(page.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  // App-wide start-up reads every page makes (session profile, saved items, recently viewed, preferences) aren't
  // Seller Home's; the page and its shell are what this counts.
  const appBoot = /^(profiles\?|rpc\/my_contact_info|rpc\/is_admin|saved_|recently_viewed|buyer_profiles\?|vendor_profiles\?select=onboarding_complete)/;
  const own = calls.filter((u) => !appBoot.test(u));
  expect(own.filter((u) => u.startsWith("rpc/seller_home_summary")).length, own.join("\n")).toBe(1);
  // None of the old per-list downloads and counts.
  expect(own.filter((u) => /^(products|rfqs|quotes|conversations|conversation_member_state|product_videos)\?/.test(u)), own.join("\n")).toEqual([]);
  expect(own.length, own.join("\n")).toBeLessThanOrEqual(8);
  await ctx.close();
});

test("home states are distinct", async ({ browser }) => {
  // Signed out.
  const anon = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const p0 = await anon.newPage();
  await p0.goto(`${BUYER_URL}/seller-home`);
  await expect(p0.getByText("Sign in to see your business")).toBeVisible({ timeout: 20_000 });
  await expect(p0.getByText("45%")).toHaveCount(0);
  await anon.close();

  // Signed in, no seller row.
  const buyer = await freshAccount("sh-buyer");
  made.push(buyer.id);
  const p1 = await openHome(browser, buyer.session);
  await expect(p1.getByText("Start selling on Cosora")).toBeVisible({ timeout: 20_000 });
  await expect(p1.getByRole("link", { name: "Register as a seller" })).toHaveAttribute("href", "/onboarding");
  await p1.context().close();

  // The summary fails.
  const broken = await seller("sh-error");
  const ctx = await contextWithSession(browser, broken.session);
  const p2 = await ctx.newPage();
  await p2.route("**/rest/v1/rpc/seller_home_summary*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await p2.goto(`${BUYER_URL}/seller-home`);
  await expect(p2.getByText("We couldn't load your dashboard")).toBeVisible({ timeout: 20_000 });
  await expect(p2.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(p2.getByText("0 Open Leads")).toHaveCount(0);
  await ctx.close();

  // A new seller: real numbers, never the invented 45%.
  const fresh = await seller("sh-fresh");
  const p3 = await openHome(browser, fresh.session);
  await expect(p3.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  await expect(p3.getByText("45%")).toHaveCount(0);
  await p3.context().close();
});

test("score ring shows a skeleton, never 0%, while loading", async ({ browser }) => {
  const who = await seller("sh-ring");
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.route("**/rest/v1/rpc/seller_home_summary*", async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.continue();
  });
  await page.goto(`${BUYER_URL}/seller-home`);
  const ring = page.getByTestId("profile-score-ring");
  await expect(ring).toHaveAttribute("data-loading", "true", { timeout: 20_000 });
  await expect(ring).not.toContainText("%");
  await expect(ring).toHaveAttribute("data-loading", "false", { timeout: 20_000 });
  await expect(ring).toContainText("%");
  await ctx.close();
});

test("blocked buyer's lead never shows", async ({ browser }) => {
  const who = await seller("sh-block");
  const [rfqId, buyerId] = sql(
    `select id || '|' || buyer_id from public.rfqs where status = 'active' and vendor_id is null and expires_at > now()
       and not overseas and buyer_id <> '${who.id}' order by created_at desc limit 1;`,
  ).split("|");
  const page = await openHome(browser, who.session);
  await expect(page.locator(`[data-lead-id="${rfqId}"]`)).toBeVisible({ timeout: 20_000 });

  sql(`insert into public.chat_blocks (blocker_id, blocked_id, created_at) values ('${who.id}', '${buyerId}', now());`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`[data-lead-id="${rfqId}"]`)).toHaveCount(0);
  await page.context().close();
});

test("recent leads put direct requests first and leave out archived chats", async ({ browser }) => {
  const who = await seller("sh-direct");
  const [kept, archived] = sql(
    `select id from public.profiles where id <> '${who.id}' and full_name is not null order by id limit 2;`,
  ).split("\n");
  const rfq = sql(
    `insert into public.rfqs (buyer_id, vendor_id, title, product_name, quantity, status)
     values ('${kept}', '${who.id}', 'Direct seller-home request', 'Direct seller-home request', 50, 'active') returning id;`,
  ).split("\n")[0];
  rfqsMade.push(rfq);
  for (const other of [kept, archived]) {
    sql(`insert into public.conversations (user_a, user_b) values (least('${who.id}'::uuid, '${other}'::uuid), greatest('${who.id}'::uuid, '${other}'::uuid));
         insert into public.messages (conversation_id, sender_id, kind, body)
         select id, '${other}', 'text', 'hello from ${other.slice(0, 4)}' from public.conversations
          where user_a = least('${who.id}'::uuid, '${other}'::uuid) and user_b = greatest('${who.id}'::uuid, '${other}'::uuid);`);
  }
  sql(`insert into public.conversation_member_state (conversation_id, user_id, archived_at)
       select id, '${who.id}', now() from public.conversations
        where user_a = least('${who.id}'::uuid, '${archived}'::uuid) and user_b = greatest('${who.id}'::uuid, '${archived}'::uuid);`);

  const page = await openHome(browser, who.session);
  const firstLead = page.locator("[data-lead-id]").first();
  await expect(firstLead).toHaveAttribute("data-lead-id", rfq, { timeout: 20_000 });
  await expect(page.locator(`[data-chat-id="${kept}"]`)).toBeVisible();
  await expect(page.locator(`[data-chat-id="${archived}"]`)).toHaveCount(0);
  await page.context().close();
});

// ─────────────────────────── Task 5: content and copy ───────────────────────────

test("no invented claims on the home", async ({ browser }) => {
  const who = await seller("sh-claims");
  const page = await openHome(browser, who.session);
  await expect(page.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  const text = await page.locator("main").innerText();
  for (const phrase of ["40%", "3 more products", "Competitor's Advertisements", "Welcome back"]) expect(text).not.toContain(phrase);
  await expect(page.getByText("Here's an overview of your business.")).toBeVisible();
  await page.context().close();
});

test("next step card names the first missing signal", async ({ browser }) => {
  const who = await seller("sh-next");
  const page = await openHome(browser, who.session);
  const card = page.getByTestId("next-step-card");
  await expect(card).toContainText("Next step", { timeout: 20_000 });
  await expect(card).toContainText("Add a contact phone number");
  await expect(card).toContainText("+8 points");
  await expect(card.getByRole("link")).toHaveAttribute("href", "/business-profile");
  await page.context().close();
});

test("alerts card follows entitlement", async ({ browser }) => {
  const plain = await seller("sh-alerts-a");
  const p1 = await openHome(browser, plain.session);
  await expect(p1.getByText("New requirements appear on your Leads page")).toBeVisible({ timeout: 20_000 });
  await expect(p1.getByTestId("alerts-card").getByRole("link")).toHaveAttribute("href", "/leads");
  await p1.context().close();

  const gold = await seller("sh-alerts-b");
  sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
       values ('${gold.id}', 'gold', 'monthly', 'active', now(), now() + interval '30 days');
       update public.feature_flags set allow_profile_ids = array_append(allow_profile_ids, '${gold.id}'::uuid) where key = 'lead_alerts';`);
  try {
    const p2 = await openHome(browser, gold.session);
    await expect(p2.getByText("Set up lead alerts")).toBeVisible({ timeout: 20_000 });
    await expect(p2.getByTestId("alerts-card").getByRole("link")).toHaveAttribute("href", "/lead-alerts");
    await p2.context().close();
  } finally {
    sql(`update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, '${gold.id}'::uuid) where key = 'lead_alerts';
         delete from public.vendor_subscriptions where vendor_id = '${gold.id}';`);
  }
});

test("prices keep their paise", async ({ browser }) => {
  const who = await seller("sh-paise");
  sql(`insert into public.products (vendor_id, name, price_value, status, enquiries_count) values ('${who.id}', 'Paise shirt', 799.50, 'live', 3);`);
  const page = await openHome(browser, who.session);
  await expect(page.getByText("₹799.50")).toBeVisible({ timeout: 20_000 });
  await page.context().close();
});

test("no button inside a link", async ({ browser }) => {
  const who = await seller("sh-nest");
  const page = await openHome(browser, who.session);
  await expect(page.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.querySelectorAll("main a button, main a [role=button]").length)).toBe(0);
  await page.context().close();
});

test("quick actions: one catalogue entry, Browse Leads, ticks when done", async ({ browser }) => {
  const who = await seller("sh-tiles");
  sql(`update public.vendor_profiles set website = 'https://tiles.example' where id = '${who.id}';`);
  const page = await openHome(browser, who.session);
  await expect(page.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main a[href="/upload-catalogue"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Browse Leads/ })).toHaveAttribute("href", "/leads");
  await expect(page.locator('main a:has-text("Add Website")')).toHaveAttribute("data-done", "true");
  await expect(page.locator('main a:has-text("Add Email")')).toHaveAttribute("data-done", "false");
  await page.context().close();
});

test("laptop right column has no gap over 48 px", async ({ browser }) => {
  const who = await seller("sh-layout");
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/seller-home`);
  await expect(page.getByRole("heading", { name: "Recent Leads" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const boxes = await page.locator("[data-right-card]").evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; })
      .sort((a, b) => a.top - b.top));
  expect(boxes.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].top - boxes[i - 1].bottom).toBeLessThanOrEqual(48);
  await ctx.close();
});

test("analysis subtitles are neutral and Inquiries says Lifetime", async ({ browser }) => {
  const who = await seller("sh-analysis");
  const page = await openHome(browser, who.session);
  const analysis = page.getByTestId("analysis-panel");
  await expect(analysis).toBeVisible({ timeout: 20_000 });
  expect(await analysis.locator(".text-green-600, .text-red-500").count()).toBe(0);
  await expect(analysis.getByTestId("stat-Inquiries")).toContainText("Lifetime");
  await page.context().close();
});

// ─────────────────────────── Task 6: vendor blue ───────────────────────────

test("seller pages are vendor blue", async ({ browser }) => {
  const who = await seller("sh-blue");
  const page = await openHome(browser, who.session);
  const bodyPrimary = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--primary").trim());
  const btn = page.getByRole("button", { name: "INCREASE SCORE" });
  await expect(btn).toBeVisible({ timeout: 20_000 });
  expect(await btn.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(37, 111, 239)");
  for (const path of ["/leads", "/products"]) {
    await page.goto(`${BUYER_URL}${path}`);
    await page.waitForLoadState("networkidle");
    const active = page.locator(`aside a[href="${path}"]`).first();
    expect(await active.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(37, 111, 239)");
    // Dialogs and sheets render in a portal on <body>, outside the seller shell: body carries the vendor colours too.
    expect(await bodyPrimary()).toBe("218 86% 54%");
  }
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await page.waitForLoadState("networkidle");
  expect(await bodyPrimary()).toBe("352 85% 62%");
  await page.context().close();
});

// ─────────────────────────── Task 7: the address decides the shell ───────────────────────────

const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

/** A registered seller on Seller Home who has just switched to Buyer (laptop). */
async function switchedToBuyer(browser: Browser, prefix: string): Promise<Page> {
  const who = await seller(prefix);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.setViewportSize(LAPTOP);
  await page.goto(`${BUYER_URL}/seller-home`);
  await expect(page.locator("aside").getByText("Seller Menu")).toBeVisible({ timeout: 20_000 });
  await page.locator("header").getByRole("button", { name: "Buyer" }).click();
  await expect(page).toHaveURL(/\/home\/new-arrivals$/);
  return page;
}

/** Client-side navigation (no reload, so the side isn't re-read from the account). */
async function clientGo(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("back after switching shows the seller menu", async ({ browser }) => {
  const page = await switchedToBuyer(browser, "sh-back");
  await page.goBack();
  await expect(page).toHaveURL(/\/seller-home$/);
  await expect(page.locator("aside").getByText("Seller Menu")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("aside").getByText("Buyer Menu")).toHaveCount(0);
  await expect(page.locator('header input[type="search"]')).not.toHaveAttribute("placeholder", "Search for items or brands...");
  await page.context().close();
});

test("forward after that shows the buyer menu", async ({ browser }) => {
  const page = await switchedToBuyer(browser, "sh-forward");
  await page.goBack();
  await expect(page.locator("aside").getByText("Seller Menu")).toBeVisible({ timeout: 10_000 });
  await page.setViewportSize(PHONE);
  await page.goForward();
  await expect(page).toHaveURL(/\/home\/new-arrivals$/);
  const tabs = page.locator("nav").filter({ has: page.locator('a[href="/categories"]') });
  await expect(tabs.locator('a[href="/categories"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('nav a[href="/upload"]')).toHaveCount(0);
  await page.context().close();
});

test("help keeps the side you came from", async ({ browser }) => {
  // From the buyer side: Help is the buyer's.
  const page = await switchedToBuyer(browser, "sh-help");
  await clientGo(page, "/help");
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Seller Menu")).toHaveCount(0);
  // Back on a seller page the side is the seller's again, and Help then stays the seller's.
  await clientGo(page, "/seller-home");
  await expect(page.locator("aside").getByText("Seller Menu")).toBeVisible({ timeout: 10_000 });
  await clientGo(page, "/help");
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.locator("aside").getByText("Seller Menu")).toBeVisible({ timeout: 10_000 });
  await page.context().close();
});
