/**
 * Every Cosora-Admin page, for every admin role (2026-10-20 admin audit, low list #22: 19 of the 48 pages
 * had no test at all). Local stack only; needs the admin app.
 *
 *   1. A super admin opens every page: it renders, throws nothing, and no API call fails.
 *   2. Each of the nine roles signs in and lands on a page of its own (three roles used to loop between "/"
 *      and a route that didn't exist), then opens every page its sidebar offers: none is refused by the
 *      database or by the section gate, and none throws.
 *
 * ROUTES mirrors Cosora-Admin src/App.tsx; a page added there belongs here too.
 */
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_URL, contextWithSession, freshAccount, signedInContext, sql } from "./stack";

const ROUTES = [
  "/products", "/videos", "/catalogues", "/vendors", "/vendors/:id", "/ads", "/subscriptions", "/accounts",
  "/chats", "/chats/:id", "/review-reports", "/chat-review", "/chat-keywords", "/chat-patterns", "/chat-reasons",
  "/requirement-review", "/requirement-reasons", "/faqs", "/geography", "/content", "/category-pictures",
  "/new-arrivals-carousel", "/blogs", "/payments", "/certificates", "/discounts", "/customers", "/leads",
  "/traction", "/trending-searches", "/system-health", "/reports", "/admins", "/admin-log", "/support",
  "/support/callbacks", "/support/fraud", "/support/feedback", "/support/settings", "/support/:ticketNo",
  "/feature-flags", "/my-vendors", "/billing-details",
];

const ROLES = [
  "super_admin", "manager", "product_moderator", "vendor_ops", "ads_moderator",
  "finance_admin", "support", "account_manager", "delivery_team",
];

const tag = Date.now().toString(36);
const staff: string[] = [];
test.afterAll(() => {
  for (const id of staff.splice(0)) sql(`update admin.admin_users set is_active = false where id = '${id}';`);
});

/** Page errors and failed API calls, from the moment this is called. */
function watch(page: Page): { problems: string[] } {
  const out = { problems: [] as string[] };
  page.on("pageerror", (e) => out.problems.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && /\/(rest|functions|storage)\/v1\//.test(r.url())) {
      out.problems.push(`${r.status()} ${r.request().method()} ${r.url().split("?")[0].replace(/^https?:\/\/[^/]+/, "")}`);
    }
  });
  return out;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

test("1. a super admin opens every page: each renders, throws nothing, and no API call fails", async ({ browser }) => {
  test.setTimeout(300_000);
  const conv = sql(`select id from public.conversations limit 1`);
  const ticket = sql(`select ticket_no from public.support_tickets limit 1`);
  const fill: Record<string, string> = {
    "/vendors/:id": "/vendors/22222222-2222-2222-2222-222222222222",
    "/chats/:id": `/chats/${conv}`,
    "/support/:ticketNo": `/support/${ticket}`,
  };
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const w = watch(page);
  const report: string[] = [];
  for (const route of ROUTES) {
    const target = fill[route] ?? route;
    if (target.endsWith("/")) continue; // no fixture row for this one
    w.problems.length = 0;
    await page.goto(`${ADMIN_URL}${target}`);
    await settle(page);
    const main = (await page.locator("main").innerText().catch(() => "")).trim();
    if (new URL(page.url()).pathname !== target) report.push(`${route}: ended on ${new URL(page.url()).pathname}`);
    if (main.length < 20) report.push(`${route}: empty page`);
    if (/Section not available for your role/.test(main)) report.push(`${route}: section refused`);
    for (const p of w.problems) report.push(`${route}: ${p}`);
  }
  expect(report).toEqual([]);
  await ctx.close();
});

for (const role of ROLES) {
  test(`2. ${role}: lands on its own page and opens every page its sidebar offers`, async ({ browser }) => {
    test.setTimeout(240_000);
    const who = await freshAccount(`pages${role.replace(/_/g, "")}${tag}`);
    staff.push(who.id);
    sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${who.id}', '${role}', true)
           on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;`);
    const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    const w = watch(page);
    await page.goto(`${ADMIN_URL}/`);
    await expect(page).not.toHaveURL(/\/$/, { timeout: 20_000 });
    const landed = new URL(page.url()).pathname;
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname, "no bounce after landing").toBe(landed);

    const links = await page.locator("nav a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    expect(links.length, "the sidebar offers something").toBeGreaterThan(0);
    const report: string[] = [];
    for (const href of links) {
      w.problems.length = 0;
      await page.goto(`${ADMIN_URL}${href}`);
      await settle(page);
      const main = (await page.locator("main").innerText().catch(() => "")).trim();
      if (/Section not available for your role/.test(main)) report.push(`${href}: section refused`);
      if (/permission denied|not authorized|requires the [a-z_ ,]+ role/i.test(main)) report.push(`${href}: refusal shown`);
      for (const p of w.problems) report.push(`${href}: ${p}`);
    }
    expect(report).toEqual([]);
    await ctx.close();
  });
}
