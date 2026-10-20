/**
 * The 2026-10-20 admin audit's low list (migration 20261020140000, Cosora-Admin fix/low-2026-10-20). Local
 * stack only; needs both apps.
 *   #16 Accounts finds a buyer who has only a phone number.
 *   #17 Certificates shows every order past the 1,000-row limit, the newest included.
 *   #18 Banner days are India's days whatever the admin's browser zone is.
 *   #19 A chat search that matches hundreds of people works.
 *   #20 Chat file links are signed again before they lapse.
 *   #21 A GSTIN typed before the saved one loads isn't overwritten.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql } from "./stack";

const tag = Date.now().toString(36);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const idFrom = (out: string): string => {
  const m = out.match(UUID);
  if (!m) throw new Error(`no id in: ${out}`);
  return m[0];
};

/** An account with a phone number and nothing else, the way a mobile sign-up often leaves one. */
function numberOnlyAccount(phoneDigits: string, name: string | null = null): string {
  return idFrom(sql(`with u as (
      insert into auth.users (id, instance_id, aud, role, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${phoneDigits}', '{}', '{}', now(), now())
      returning id)
    insert into public.profiles (id, full_name) select id, ${name === null ? "null" : `'${name}'`} from u
    on conflict (id) do update set full_name = excluded.full_name
    returning id;`));
}

test("#16 Accounts finds a buyer who has only a phone number", async ({ browser }) => {
  const digits = `98${String(Date.now()).slice(-8)}`;
  const id = numberOnlyAccount(`91${digits}`);
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/accounts`);
  await page.getByRole("textbox", { name: /^Search by name/ }).fill(`+91 ${digits.slice(0, 5)} ${digits.slice(5)}`);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1, { timeout: 15_000 });
  await expect(rows.first()).toContainText("no name");
  // The number itself is never shown in the results.
  await expect(page.locator("tbody")).not.toContainText(digits);
  sql(`delete from public.profiles where id = '${id}'; delete from auth.users where id = '${id}';`);
  await ctx.close();
});

test("#17 Certificates shows every order past 1,000, the newest included", async ({ browser }) => {
  test.setTimeout(120_000);
  // A vendor has at most one open order (certificate_orders_one_open_per_vendor), so the bulk is 1,004
  // delivered orders, and the newest of all is a fresh seller's order waiting to be printed: the one a
  // single oldest-first read of 1,000 rows cut off.
  const vendor = "22222222-2222-2222-2222-222222222222";
  const fresh = await freshAccount(`lowcert${tag}`, { seller: true });
  sql(`insert into public.certificate_orders (reference, vendor_id, status, purchased_at)
       select 'LOW-${tag}-' || g, '${vendor}', 'delivered', now() - interval '30 days' + make_interval(secs => g)
         from generate_series(1, 1004) g;
       insert into public.certificate_orders (reference, vendor_id, status, purchased_at)
       values ('LOW-${tag}-NEWEST', '${fresh.id}', 'processing', now());`);
  try {
    const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${ADMIN_URL}/certificates`);
    await expect(page.getByText(`LOW-${tag}-NEWEST`)).toBeVisible({ timeout: 30_000 });
    const delivered = Number(sql(`select count(*) from public.certificate_orders where status = 'delivered'`));
    await expect(page.getByRole("button", { name: new RegExp(`Delivered.*${delivered}`) })).toBeVisible();
    await ctx.close();
  } finally {
    sql(`delete from public.certificate_orders where reference like 'LOW-${tag}-%';`);
  }
});

test("#18 a banner set from a browser in Los Angeles runs on India's days", async ({ browser }) => {
  const title = `Low ${tag} banner`;
  // The local admin's session (what signedInContext stores), copied into a browser set to Los Angeles time.
  const signed = await signedInContext(browser, "admin");
  const p = await signed.newPage();
  await p.goto(`${ADMIN_URL}/login`);
  const storage = JSON.parse(await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))))) as Record<string, string>;
  await signed.close();
  const la = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Los_Angeles" });
  await la.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, storage);
  const page = await la.newPage();
  await page.goto(`${ADMIN_URL}/content`);
  await page.getByRole("button", { name: /Add( a banner)?$/ }).first().click();
  await page.locator("#banner-title").fill(title);
  await page.locator("#banner-start").fill("2026-11-05");
  await page.locator("#banner-end").fill("2026-11-10");
  await page.getByRole("button", { name: "Add banner" }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  try {
    const saved = sql(`select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') || '|' || to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI')
                       from public.site_banners where title = '${title}'`);
    // 5 Nov 00:00 IST = 4 Nov 18:30 UTC; "ends after 10 Nov" = 11 Nov 00:00 IST = 10 Nov 18:30 UTC.
    expect(saved).toBe("2026-11-04T18:30|2026-11-10T18:30");
    await expect(page.getByText("5 Nov 2026 to 10 Nov 2026")).toBeVisible();
  } finally {
    sql(`delete from public.site_banners where title = '${title}';`);
    await la.close();
  }
});

test("#19 a chat search that matches 300 people works", async ({ browser }) => {
  test.setTimeout(120_000);
  const name = `Lowbulk${tag}`;
  const ids = sql(`with u as (
      insert into auth.users (id, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()
        from generate_series(1, 300) returning id)
    insert into public.profiles (id, full_name) select id, '${name} ' || row_number() over () from u
    on conflict (id) do update set full_name = excluded.full_name
    returning id;`).match(new RegExp(UUID.source, "g"))!;
  expect(ids.length).toBe(300);
  const seller = "22222222-2222-2222-2222-222222222222";
  // A conversation for a person late in the list, the newest chat of all.
  const who = ids[ids.length - 1];
  const conv = idFrom(sql(`insert into public.conversations (user_a, user_b, last_message, last_message_at)
    values (least('${who}'::uuid, '${seller}'::uuid), greatest('${who}'::uuid, '${seller}'::uuid), 'Low ${tag} hello', now() + interval '1 minute')
    returning id;`));
  try {
    const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    const failures: string[] = [];
    page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/rest/v1/conversations")) failures.push(`${r.status()} ${r.url().length}`); });
    await page.goto(`${ADMIN_URL}/chats`);
    await page.getByRole("textbox").first().fill(name);
    await expect(page.getByText(`Low ${tag} hello`)).toBeVisible({ timeout: 30_000 });
    expect(failures).toEqual([]);
    await ctx.close();
  } finally {
    sql(`delete from public.conversations where id = '${conv}';
         delete from public.profiles where full_name like '${name} %';
         delete from auth.users where id in ('${ids.join("','")}');`);
  }
});

test("#20 a chat's file links are signed again before the hour runs out", async ({ browser }) => {
  const buyer = await freshAccount(`lowfile${tag}`);
  const seller = await freshAccount(`lowfiles${tag}`, { seller: true });
  const conv = idFrom(sql(`insert into public.conversations (user_a, user_b)
    values (least('${buyer.id}'::uuid, '${seller.id}'::uuid), greatest('${buyer.id}'::uuid, '${seller.id}'::uuid)) returning id;`));
  sql(`set session_replication_role = replica;
       insert into public.messages (conversation_id, sender_id, body, kind, attachment_path, attachment_name, attachment_mime, attachment_bytes)
       values ('${conv}', '${buyer.id}', '📎 low.pdf', 'file', '${conv}/${buyer.id}/low.pdf', 'low.pdf', 'application/pdf', 1234);`);
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.clock.install();
  let signs = 0;
  page.on("request", (r) => { if (r.url().includes("/storage/v1/object/sign/chat-attachments")) signs += 1; });
  await page.goto(`${ADMIN_URL}/chats/${conv}`);
  await expect.poll(() => signs, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  const first = signs;
  await page.clock.fastForward("56:00");
  await expect.poll(() => signs, { timeout: 30_000 }).toBeGreaterThan(first);
  await ctx.close();
  sql(`delete from public.messages where conversation_id = '${conv}'; delete from public.conversations where id = '${conv}';`);
});

test("#21 a GSTIN typed before the saved one loads stays as typed", async ({ browser }) => {
  const who = await freshAccount(`lowtax${tag}`, { seller: true });
  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  // The saved GSTIN answers late, the way a slow connection makes it.
  await page.route(/\/rest\/v1\/vendor_profiles\?select=gstin/, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await page.goto(`${BUYER_URL}/subscription`);
  const gstin = page.getByLabel("GSTIN");
  await gstin.fill("27AAPFU0939F1ZV");
  await page.waitForTimeout(5000);
  await expect(gstin).toHaveValue("27AAPFU0939F1ZV");
  await ctx.close();
});
