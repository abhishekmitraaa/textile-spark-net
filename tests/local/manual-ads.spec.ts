// Ad types done by hand (Mitra, 2026-11-17: "bring back all the ad types except the mobile banner and the website
// banner … those ads will go to the admin dashboard as they will be done manually"). End to end on the local stack:
// the builder offers them with a notice, the server sells them, Cosora-Admin › Ads › Manual work lists them and marks
// them done, and the seller is told. Migration 20261117120000_manual_ad_work.sql; rules in
// scripts/seller-medium-fixes-check.mjs. Plan: documentation/manual-ad-types-2026-11-17.md.

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { ADMIN_URL, BUYER_URL, clientAs, contextWithSession, freshAccount, signedInContext, sql, stack, watchErrors } from "./stack";

const made: string[] = [];
test.afterEach(() => {
  while (made.length) {
    const id = made.pop()!;
    sql(`delete from admin.ad_review_log where ad_id in (select id from public.advertisements where vendor_id = '${id}');
         set session_replication_role = replica;
         delete from public.advertisements where vendor_id = '${id}';
         set session_replication_role = origin;
         delete from public.ad_orders where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${id}');
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

function clientFor(session: Session): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

/** A campaign as the payment path leaves it: in review. Written past the moderation trigger, as the harnesses do. */
function campaign(vendor: string, title: string, placement: string, status = "pending_review"): string {
  return sql(`set session_replication_role = replica;
    insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at)
    values ('${vendor}', '${title}', '${placement}', '${status}', now(), now() + interval '7 days') returning id;
    set session_replication_role = origin;`).split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l.trim()))!.trim();
}

function setStatus(ad: string, status: string): void {
  sql(`set session_replication_role = replica; update public.advertisements set status = '${status}' where id = '${ad}';
       set session_replication_role = origin;`);
}

test("the database: who lists, who marks, and only after approval", async () => {
  const s = await seller("manual-db");
  const ad = campaign(s.id, "Manual DB", "openListing,fbInsta");
  const plain = campaign(s.id, "Plain DB", "openListing");
  const me = clientFor(s.session);

  // A seller can't list the team's work; it sees its own campaign, not yet done.
  const denied = await me.rpc("admin_ad_manual_list");
  expect(denied.error?.code).toBe("42501");
  const mine = await me.rpc("my_ad_manual_work");
  expect(mine.error).toBeNull();
  expect(mine.data).toEqual([{ ad_id: ad, done_at: null }]);

  // Support reads it and can't mark it.
  const support = await clientAs("support");
  const listed = await support.rpc("admin_ad_manual_list");
  expect(listed.error).toBeNull();
  const row = (listed.data as { ad_id: string; manual_types: string[]; status: string }[]).find((r) => r.ad_id === ad);
  expect(row?.manual_types).toEqual(["fbInsta"]);
  expect((listed.data as { ad_id: string }[]).some((r) => r.ad_id === plain)).toBe(false);
  expect((await support.rpc("admin_ad_manual_done", { p_ad: ad, p_done: true })).error?.code).toBe("42501");

  // A super admin: not while it's in review, never for a campaign with no manual type.
  const admin = await clientAs("admin");
  const early = await admin.rpc("admin_ad_manual_done", { p_ad: ad, p_done: true });
  expect(early.error?.message).toMatch(/Approve the campaign/);
  const none = await admin.rpc("admin_ad_manual_done", { p_ad: plain, p_done: true });
  expect(none.error?.message).toMatch(/no ad type that is done by hand/);

  // Approved: marked done through PostgREST (safeupdate is loaded there), the seller is told, the Admin Log has it.
  setStatus(ad, "active");
  const done = await admin.rpc("admin_ad_manual_done", { p_ad: ad, p_done: true, p_note: "Posted on the Cosora page" });
  expect(done.error).toBeNull();
  expect(sql(`select kind || '|' || title from public.notifications where profile_id = '${s.id}' and kind = 'ad_manual_done'`))
    .toBe("ad_manual_done|Cosora has set up your ad");
  // The audit trigger keys target_id on an "id" column; this table's key is ad_id, so the campaign is in the changes.
  expect(sql(`select action || '|' || actor_role from admin.audit_log
               where target_table = 'admin.ad_manual_work' and changes ->> 'ad_id' = '${ad}'`)).toBe("insert|super_admin");
  const after = await me.rpc("my_ad_manual_work");
  expect((after.data as { done_at: string | null }[])[0].done_at).not.toBeNull();

  // "Not done" takes it back; the seller's view follows.
  expect((await admin.rpc("admin_ad_manual_done", { p_ad: ad, p_done: false })).error).toBeNull();
  expect((await me.rpc("my_ad_manual_work")).data).toEqual([{ ad_id: ad, done_at: null }]);
  expect(sql(`select string_agg(action, ',' order by id) from admin.audit_log
               where target_table = 'admin.ad_manual_work' and changes ->> 'ad_id' = '${ad}'`)).toBe("insert,delete");
});

test("the server sells the four again, and still not the website banners", async () => {
  // A paid plan (Free can't run ads), and a stand-in for Razorpay's order API on :8787 (the edge runtime's
  // RAZORPAY_API_URL), so a sellable order goes all the way to an order id.
  let mock: Server | null = null;
  let n = 0;
  mock = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const o = JSON.parse(body || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: `order_manual_${Date.now()}_${++n}`, amount: o.amount, currency: "INR", status: "created" }));
    });
  });
  await new Promise<void>((resolve) => mock!.listen(8787, "0.0.0.0", () => resolve()));
  try {
    const s = await seller("manual-order");
    sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
         values ('${s.id}', 'basic', 'monthly', 'active', now() - interval '1 day', now() + interval '29 days');`);
    const product = sql(`with p as (insert into public.products (vendor_id, name, status, price_value, moq, category_id)
        values ('${s.id}', 'Manual order listing', 'live', 300, '10', (select id from public.categories order by name limit 1))
        returning id) select id from p`).split("\n")[0].trim();
    const edge = process.env.LOCAL_EDGE_URL ?? "http://localhost:8099";
    const order = async (placementIds: string[]) => {
      const res = await fetch(`${edge}/razorpay-create-order`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${s.session.access_token}`, apikey: stack().ANON },
        body: JSON.stringify({ spec: { placementIds, days: 3, items: [{ productId: product, title: "Manual order listing", imageUrl: null }] } }),
      });
      return (await res.json()) as { error?: string; order_id?: string; orderId?: string };
    };
    for (const t of ["fbInsta", "googleProduct", "socialCombo", "directBroadcast"]) {
      const answer = await order(["openListing", t]);
      expect(answer.error, `${t}: ${JSON.stringify(answer)}`).toBeUndefined();
      expect(answer.order_id ?? answer.orderId, t).toMatch(/^order_manual_/);
    }
    for (const t of ["websiteBanner", "mobileBanner", "webMobileCombo"]) {
      expect((await order(["openListing", t])).error, t).toBe("not_sold");
    }
    expect(sql(`select count(*) from public.ad_orders where vendor_id = '${s.id}'`)).toBe("4");
  } finally {
    await new Promise<void>((resolve) => (mock ? mock.close(() => resolve()) : resolve()));
  }
});

test("the builder tags the four and explains what happens; Your Campaigns says where it is", async ({ browser }) => {
  const s = await seller("manual-ui");
  const inReview = campaign(s.id, "Manual review UI", "openListing,googleProduct");
  const doneAd = campaign(s.id, "Manual done UI", "openListing,fbInsta", "active");
  sql(`insert into admin.ad_manual_work (ad_id, done_at, done_by, note)
       values ('${doneAd}', '2026-11-17 10:00+05:30', (select id from auth.users where email = 'local-admin@cosora.test'), null)`);
  void inReview;

  const ctx = await contextWithSession(browser, s.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/advertisements`);
  await page.getByRole("button", { name: /^More \(\d+ more options\)$/ }).click();
  const card = (name: string) => page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) });
  for (const name of ["Facebook & Instagram Ad", "Google Product Ad", "Social Media Combo", "Direct Broadcast"]) {
    await expect(card(name), name).toContainText("Set up by hand by the Cosora team");
  }
  await expect(card("Brand Ad")).not.toContainText("Set up by hand");
  await expect(page.getByTestId("manual-ad-banner")).toHaveCount(0);
  await card("Facebook & Instagram Ad").click();
  const banner = page.getByTestId("manual-ad-banner");
  await expect(banner).toContainText("The Cosora team sets these up by hand");
  await expect(banner).toContainText("Facebook & Instagram Ad");

  // Your Campaigns: one waiting for review, one done.
  const status = page.getByTestId("manual-ad-status");
  await expect(status.filter({ hasText: "After approval, the Cosora team sets up" })).toHaveCount(1);
  await expect(status.filter({ hasText: "Set up by the Cosora team on 17 Nov 2026." })).toHaveCount(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Cosora-Admin › Ads › Manual work: an ads writer marks one done; support only reads", async ({ browser }) => {
  const s = await seller("manual-admin");
  const title = `Manual admin ${Date.now().toString(36)}`;
  campaign(s.id, title, "openListing,socialCombo", "active");

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await ctx.newPage();
  const errors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/ads`);
  await admin.getByRole("radio", { name: "Manual work" }).click();
  const row = admin.getByTestId("manual-row").filter({ hasText: title });
  await expect(row).toContainText("Social Media Combo");
  await row.getByRole("button", { name: "Mark done" }).click();
  await admin.getByLabel(/Note/).fill("Boosted post, 3 days");
  await admin.getByRole("dialog").getByRole("button", { name: "Mark done" }).click();
  await expect(admin.getByText("Marked done. The seller has been told.")).toBeVisible();
  await admin.getByRole("button", { name: /^Done/ }).click();
  await expect(admin.getByTestId("manual-row").filter({ hasText: title })).toContainText("Boosted post, 3 days");
  expect(sql(`select count(*) from public.notifications where profile_id = '${s.id}' and kind = 'ad_manual_done'`)).toBe("1");
  expect(errors).toEqual([]);
  await ctx.close();

  const sctx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const sp = await sctx.newPage();
  await sp.goto(`${ADMIN_URL}/ads`);
  await sp.getByRole("radio", { name: "Manual work" }).click();
  await sp.getByRole("button", { name: /^Done/ }).click();
  await expect(sp.getByTestId("manual-row").filter({ hasText: title })).toBeVisible();
  await expect(sp.getByRole("button", { name: "Not done" })).toHaveCount(0);
  await sctx.close();
});
