/**
 * Seller Home audit, the High items left after A–C (documentation/seller-home-high-fixes-plan-2026-11-16.md), on the
 * local stack.
 *
 *   LOCAL_STACK_ENV=../../.claude/tmp/local-stack-env.json LOCAL_BUYER_URL=http://localhost:8097 \
 *   LOCAL_ADMIN_URL=http://localhost:5185 npx playwright test -c playwright.local.config.ts tests/local/seller-home-high.spec.ts
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop()!;
    sql(`delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from admin.ad_review_log where ad_id in (select id from public.advertisements where vendor_id = '${id}');
         delete from public.advertisements where vendor_id = '${id}';
         delete from public.product_videos where vendor_id = '${id}';
         delete from public.catalogues where vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_premises_photos where vendor_id = '${id}';
         delete from public.vendor_documents where vendor_id = '${id}';
         delete from public.vendor_registrations where vendor_id = '${id}';
         delete from public.vendor_contracts where vendor_id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.buyer_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function seller(prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  return who;
}

async function open(browser: Browser, session: Parameters<typeof contextWithSession>[1], path: string): Promise<Page> {
  const ctx = await contextWithSession(browser, session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}${path}`);
  return page;
}

// ─────────────────────────── Task 1: the slideshow and Back (SH-086) ───────────────────────────

test("Back from Advertise skips the slideshow", async ({ browser }) => {
  const who = await seller("hi-slides");
  const page = await open(browser, who.session, "/seller-home");
  await page.locator('[data-testid="builtin-banner"] a[href="/advertisement-slideshow"]').first().click({ timeout: 20_000 });
  await page.waitForURL("**/advertisement-slideshow");
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForURL("**/advertisements");
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/seller-home");
  await page.context().close();
});
