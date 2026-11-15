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
