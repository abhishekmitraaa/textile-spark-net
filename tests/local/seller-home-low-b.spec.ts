// Seller Home audit, Low items batch 2 (2026-11-17): end to end on the local stack.
// Plan and record: documentation/seller-home-low-fixes-plan-2026-11-17.md. Database: 20261117140000.

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop()!;
    sql(`delete from public.chat_blocks where blocker_id = '${id}' or blocked_id = '${id}';
         delete from admin.lead_alerts where vendor_id = '${id}' or rfq_id in (select id from public.rfqs where buyer_id = '${id}');
         delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.calls where vendor_id = '${id}' or buyer_id = '${id}';
         delete from public.quotes where vendor_id = '${id}';
         delete from public.rfqs where buyer_id = '${id}' or vendor_id = '${id}';
         delete from public.reviews where vendor_id = '${id}' or buyer_id = '${id}';
         delete from admin.ad_review_log where ad_id in (select id from public.advertisements where vendor_id = '${id}');
         set session_replication_role = replica;
         delete from public.advertisements where vendor_id = '${id}';
         set session_replication_role = origin;
         delete from public.products where vendor_id = '${id}';
         delete from public.buyer_profiles where id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function account(prefix: string, seller = true) {
  const who = await freshAccount(`${prefix}${tag}`, { seller });
  made.push(who.id);
  return who;
}

function clientFor(session: Session | null): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    auth: { persistSession: false },
    global: session ? { headers: { Authorization: `Bearer ${session.access_token}` } } : undefined,
  });
}

const firstId = (out: string) => out.split("\n").map((l) => l.trim()).find((l) => /^[0-9a-f-]{36}$/.test(l))!;

async function open(browser: Browser, session: Session, path: string): Promise<Page> {
  const ctx = await contextWithSession(browser, session, { width: 1280, height: 1000 });
  const p = await ctx.newPage();
  await p.goto(`${BUYER_URL}${path}`);
  return p;
}

function conversation(a: string, b: string): string {
  return firstId(sql(`insert into public.conversations (user_a, user_b)
    values (least('${a}'::uuid, '${b}'::uuid), greatest('${a}'::uuid, '${b}'::uuid)) returning id`));
}

// ── SH-083, SH-084 ──
test("a direct request and its chat are one touch; a blocked buyer's requirement leaves the alert history", async ({ browser }) => {
  const s = await account("lbrep");
  const b = await account("lbrepb", false);
  // One direct request, and the conversation it opens: one buyer, not a repeat.
  sql(`insert into public.rfqs (buyer_id, vendor_id, title, quantity, status, expires_at)
       values ('${b.id}', '${s.id}', 'LB ${tag} direct', 10, 'active', now() + interval '7 days')`);
  conversation(s.id, b.id);
  const p = await open(browser, s.session, "/analytics");
  const card = p.locator("div", { has: p.getByText("Repeat Buyers", { exact: true }) }).filter({ hasText: "came back" }).last();
  await expect(card).toContainText("of 1 buyer came back more than once", { timeout: 30_000 });
  await expect(card.locator("p.text-2xl")).toHaveText("0");
  await p.context().close();

  // SH-084: an alert about the buyer's open requirement, then a block.
  const rfq = firstId(sql(`insert into public.rfqs (buyer_id, title, quantity, status, expires_at)
       values ('${b.id}', 'LB ${tag} open', 10, 'active', now() + interval '7 days') returning id`));
  sql(`insert into admin.lead_alerts (rfq_id, vendor_id, plan_id, channels) values ('${rfq}', '${s.id}', 'free', '{app}')`);
  const db = clientFor(s.session);
  const titles = async () => ((((await db.rpc("my_lead_alerts")).data as { alerts: { title: string }[] }).alerts) ?? []).map((a) => a.title);
  expect(await titles()).toContain(`LB ${tag} open`);
  sql(`insert into public.chat_blocks (blocker_id, blocked_id) values ('${b.id}', '${s.id}')`);
  expect(await titles()).not.toContain(`LB ${tag} open`);
});

// ── SH-099 ──
test("ad impressions are capped by the function itself; the page says only what is true", async ({ browser }) => {
  const s = await account("lbads");
  const ad = firstId(sql(`set session_replication_role = replica;
    insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at)
    values ('${s.id}', 'LB ${tag} ad', 'openListing', 'active', now(), now() + interval '7 days') returning id;
    set session_replication_role = origin;`));
  const impressions = () => Number(sql(`select impressions from public.advertisements where id = '${ad}'`));
  const anon = clientFor(null);
  // 40 signed-out calls with no session: one viewer, so one impression (the 5-second spacing).
  for (let i = 0; i < 40; i++) await anon.rpc("ad_impression", { ad });
  expect(impressions()).toBe(1);
  // Ten "different" sessions: each one is a viewer, capped like any other.
  for (let i = 0; i < 10; i++) await anon.rpc("ad_impression", { ad, p_session: `lb-${tag}-${i}` });
  expect(impressions()).toBe(11);
  // The owner's own views don't count.
  await clientFor(s.session).rpc("ad_impression", { ad });
  expect(impressions()).toBe(11);
  // A browser can't read the counter.
  expect((await anon.from("ad_impression_daily").select("n").limit(1)).error).not.toBeNull();

  // The X only on a draft: a submitted campaign has a review history nobody deletes.
  sql(`insert into admin.ad_review_log (ad_id, decision) values ('${ad}', 'submitted')`);
  const p = await open(browser, s.session, "/advertisements");
  const errors = watchErrors(p);
  await expect(p.getByText(`LB ${tag} ad`).first()).toBeVisible({ timeout: 30_000 });
  await expect(p.getByRole("button", { name: "Delete draft" })).toHaveCount(0);
  await expect(p.getByText("Date Range")).toHaveCount(0);
  await expect(p.getByText(/No subscriptions/)).toHaveCount(0);
  await expect(p.getByText(/Automatically finds and updates audiences/)).toHaveCount(0);
  await expect(p.getByText("Leave both empty to show your ad to every buyer.")).toBeVisible();
  expect(errors).toEqual([]);
  await p.context().close();
});

// ── SH-107 ──
test("in a chat the seller sees the buyer's small card, never while blocked; names aren't translated", async ({ browser }) => {
  const s = await account("lbchat");
  const b = await account("lbchatb", false);
  sql(`insert into public.buyer_profiles (id, company, city) values ('${b.id}', 'LB ${tag} Retail', 'Pune')
       on conflict (id) do update set company = excluded.company, city = excluded.city`);
  const conv = conversation(s.id, b.id);
  sql(`insert into public.messages (conversation_id, sender_id, body) values ('${conv}', '${b.id}', 'Hello from LB')`);

  const p = await open(browser, s.session, `/chats/${b.id}`);
  await expect(p.getByText("Hello from LB")).toBeVisible({ timeout: 30_000 });
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByText("View Buyer Profile").click();
  const card = p.getByTestId("buyer-card");
  await expect(card).toContainText(`LB ${tag} Retail`);
  await expect(card).toContainText("Pune");
  await expect(p).toHaveURL(new RegExp(`/chats/${b.id}`));
  await p.context().close();

  // Someone outside the conversation gets nothing; a block hides it from the seller too.
  const other = await account("lbchato", true);
  expect((await clientFor(other.session).rpc("chat_buyer_card", { p_other: b.id })).data).toEqual([]);
  sql(`insert into public.chat_blocks (blocker_id, blocked_id) values ('${b.id}', '${s.id}')`);
  expect((await clientFor(s.session).rpc("chat_buyer_card", { p_other: b.id })).data).toEqual([]);

  // The inbox keeps names and previews as written.
  sql(`delete from public.chat_blocks where blocker_id = '${b.id}'`);
  const inbox = await open(browser, s.session, "/chat");
  await expect(inbox.locator("[data-no-translate]", { hasText: "Hello from LB" }).first()).toBeAttached({ timeout: 30_000 });
  await inbox.context().close();
});

// ── SH-108, SH-109 ──
test("review stats come from the database, replies have a limit, and both pages have a heading", async ({ browser }) => {
  const s = await account("lbrev");
  const buyers = [await account("lbrev1", false), await account("lbrev2", false), await account("lbrev3", false)];
  [5, 4, 1].forEach((r, i) => sql(`insert into public.reviews (vendor_id, buyer_id, rating, body) values ('${s.id}', '${buyers[i].id}', ${r}, 'LB review ${i}')`));
  const stats = (await clientFor(null).rpc("vendor_review_stats", { p_vendor: s.id })).data as { count: number; avg: number };
  expect(stats.count).toBe(3);
  expect(Number(stats.avg)).toBe(3.3);

  const review = sql(`select id from public.reviews where vendor_id = '${s.id}' limit 1`).trim();
  const db = clientFor(s.session);
  expect((await db.rpc("reply_to_review", { review_id: review, reply: "x".repeat(2001) })).error?.message).toMatch(/2,000/);
  expect((await db.rpc("reply_to_review", { review_id: review, reply: "Thank you" })).error).toBeNull();

  const p = await open(browser, s.session, "/reviews");
  await expect(p.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible({ timeout: 30_000 });
  await expect(p.getByText("3.3").first()).toBeVisible();
  await p.goto(`${BUYER_URL}/help`);
  await expect(p.getByRole("heading", { level: 1, name: "Help & Support" })).toBeVisible({ timeout: 30_000 });
  await p.context().close();
});

// ── SH-085 ──
test("Quotes prints a price with its paise", async ({ browser }) => {
  const s = await account("lbq");
  const b = await account("lbqb", false);
  const rfq = firstId(sql(`insert into public.rfqs (buyer_id, title, quantity, status, expires_at)
       values ('${b.id}', 'LB ${tag} q', 10, 'active', now() + interval '7 days') returning id`));
  sql(`insert into public.quotes (rfq_id, vendor_id, price_per_unit) values ('${rfq}', '${s.id}', 99.5)`);
  const p = await open(browser, s.session, "/quotes");
  await expect(p.getByText("₹99.50").first()).toBeVisible({ timeout: 30_000 });
  await expect(p.getByText("₹ 99.5")).toHaveCount(0);
  await p.context().close();
});
