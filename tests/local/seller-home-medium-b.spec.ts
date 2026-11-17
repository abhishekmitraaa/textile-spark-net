// Seller Home audit, Medium fixes batch 2 (2026-11-17): what a seller sees, end to end on the local stack.
// Plan: documentation/seller-home-medium-fixes-plan-2026-11-17.md. Database: scripts/seller-home/medium_b.sql. Rules:
// scripts/seller-medium-fixes-check.mjs. The payment functions run in the local edge runtime (demo mode: no Razorpay keys).

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, sql } from "./stack";

// The edge runtime on :8099 has Razorpay test keys and RAZORPAY_API_URL pointed at a mock on :8787. This spec runs
// that mock itself (it only creates orders), and Checkout is a stand-in in the page that pays at once and signs as
// Razorpay does (HMAC of order_id|payment_id with the mock key secret), so the real paid path runs end to end.
const KEY_SECRET = process.env.LOCAL_RAZORPAY_KEY_SECRET ?? "local_mock_secret";
let mock: Server | null = null;
test.beforeAll(async () => {
  let n = 0;
  mock = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/orders") {
        const o = JSON.parse(body || "{}");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: `order_mb_${Date.now()}_${++n}`, amount: o.amount, currency: "INR", status: "created" }));
      } else {
        res.writeHead(404); res.end("{}");
      }
    });
  });
  await new Promise<void>((resolve) => mock!.listen(8787, "0.0.0.0", () => resolve()));
});
test.afterAll(async () => { await new Promise<void>((resolve) => (mock ? mock.close(() => resolve()) : resolve())); });

async function fakeCheckout(ctx: BrowserContext): Promise<void> {
  await ctx.exposeFunction("__rzpSignOrder", (orderId: string, paymentId: string) =>
    createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex"));
  await ctx.addInitScript(() => {
    let n = 0;
    type Opts = { order_id: string; handler: (r: Record<string, string>) => void };
    const w = window as unknown as { Razorpay: unknown; __rzpSignOrder: (o: string, p: string) => Promise<string> };
    w.Razorpay = class {
      constructor(private o: Opts) {}
      on() { /* payment.failed: never, here */ }
      open() {
        const paymentId = `pay_mb_${Date.now()}_${++n}`;
        void w.__rzpSignOrder(this.o.order_id, paymentId).then((signature) =>
          this.o.handler({ razorpay_order_id: this.o.order_id, razorpay_payment_id: paymentId, razorpay_signature: signature }));
      }
    };
  });
}

const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop()!;
    sql(`delete from public.calls where vendor_id = '${id}' or buyer_id = '${id}';
         delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.certificate_orders where vendor_id = '${id}';
         delete from admin.ad_review_log where ad_id in (select id from public.advertisements where vendor_id = '${id}');
         set session_replication_role = replica;
         delete from public.advertisements where vendor_id = '${id}';
         set session_replication_role = origin;
         delete from public.ad_orders where vendor_id = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function account(prefix: string, seller = true) {
  const who = await freshAccount(prefix, { seller });
  made.push(who.id);
  return who;
}

// The stack's own edge runtime serves a fixed list; the payment functions run in f3_edge_runtime on :8099, from the
// stack's functions folder (copy this branch's supabase/functions there first), as routeDummyOtp does for sign-in.
const EDGE = process.env.LOCAL_EDGE_URL ?? "http://localhost:8099";
async function routePayments(ctx: BrowserContext): Promise<void> {
  await ctx.route(/\/functions\/v1\/(razorpay-create-order|razorpay-verify-payment|discount-quote)$/, async (route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split("/").pop();
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
        "access-control-allow-methods": "POST, OPTIONS" } });
      return;
    }
    const res = await route.fetch({ url: `${EDGE}/${name}` });
    await route.fulfill({ response: res, headers: { ...res.headers(), "access-control-allow-origin": "*" } });
  });
}

async function open(browser: Browser, session: Parameters<typeof contextWithSession>[1], path: string): Promise<Page> {
  const ctx = await contextWithSession(browser, session, { width: 1280, height: 1000 });
  await routePayments(ctx);
  await fakeCheckout(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}${path}`);
  return page;
}

// ── SH-093: a Free seller buys the Trusted Seal on its own ──
test("a Free seller buys the Trusted Seal with no campaign and no listing", async ({ browser }) => {
  const who = await account("mb-seal");
  const page = await open(browser, who.session, "/advertisements#get-verified");
  const section = page.getByTestId("get-verified");
  await section.scrollIntoViewIfNeeded();
  await section.getByTestId("verify-trustedSeal").click();
  await expect(section.getByTestId("verify-buy")).toHaveText(/Pay · ₹44/);
  await section.getByTestId("verify-buy").click();
  await expect(page.getByText(/Your badge appears once Cosora approves it/)).toBeVisible({ timeout: 30_000 });
  expect(sql(`select status || '|' || amount from public.ad_orders where vendor_id = '${who.id}'`)).toBe("paid|4400");
  const row = sql(`select placement || '|' || coalesce(product_id::text, 'none') || '|' || status || '|' ||
                          round(extract(epoch from ends_at - starts_at) / 86400)
                     from public.advertisements where vendor_id = '${who.id}'`);
  expect(row).toBe("trustedSeal|none|pending_review|30");
});

test("the certificate is a year, and the builder no longer sells the seal or unseen ad types", async ({ browser }) => {
  const who = await account("mb-cert");
  const page = await open(browser, who.session, "/advertisements");
  // The campaign builder: no seal, no certificate, no website or social types, no goals that pick them.
  const builder = page.locator("#adCreationSteps");
  await expect(builder.getByText("Trusted Seal & Verified Badge")).toHaveCount(0);
  await expect(builder.getByText("Website Banner", { exact: false })).toHaveCount(0);
  await expect(builder.getByText("Visit your website")).toHaveCount(0);
  await expect(builder.getByText("Message you")).toHaveCount(0);
  // The certificate on its own.
  const section = page.getByTestId("get-verified");
  await section.scrollIntoViewIfNeeded();
  await section.getByTestId("verify-verifiedCertificate").click();
  await expect(section.getByTestId("verify-buy")).toHaveText(/Pay · ₹199/);
  await section.getByTestId("verify-buy").click();
  await expect(page.getByText(/Your badge appears once Cosora approves it/)).toBeVisible({ timeout: 30_000 });
  expect(sql(`select placement || '|' || round(extract(epoch from ends_at - starts_at) / 86400) from public.advertisements where vendor_id = '${who.id}'`))
    .toBe("verifiedCertificate|365");
  // The parcel is queued for the delivery team, as for a certificate bought before.
  expect(sql(`select count(*) from public.certificate_orders where vendor_id = '${who.id}'`)).toBe("1");
});

// ── SH-096: the registration switch stops a purchase on the server ──
test("an unregistered seller can't buy the seal while registration is required", async ({ browser }) => {
  const who = await account("mb-unreg");
  // Required for this seller only, who has no signed agreement (freshAccount writes none).
  allowFeature("seller_registration_required", who.id);
  try {
    const page = await open(browser, who.session, "/advertisements#get-verified");
    const section = page.getByTestId("get-verified");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Finish your seller registration first.", { exact: false })).toBeVisible();
    await expect(section.getByTestId("verify-trustedSeal")).toBeDisabled();
    // And the server refuses a direct call too.
    const answer = await page.evaluate(async () => {
      const key = Object.keys(localStorage).find((k) => k.endsWith("-auth-token"));
      const token = key ? JSON.parse(localStorage.getItem(key)!).access_token : "";
      const r = await fetch("http://localhost:8099/razorpay-create-order", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ spec: { placementIds: ["trustedSeal"], days: 30, items: [] } }),
      });
      return r.json();
    });
    expect(answer.error).toBe("not_registered");
    expect(sql(`select count(*) from public.advertisements where vendor_id = '${who.id}'`)).toBe("0");
  } finally {
    disallowFeature("seller_registration_required", who.id);
  }
});

// ── SH-097: old campaigns filed by what they are ──
test("a rejected campaign is 'Needs attention' with Cosora's reason and no Play button", async ({ browser }) => {
  const who = await account("mb-old");
  sql(`set session_replication_role = replica;
       insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at, daily_budget, moderation_reason)
       values ('${who.id}', 'MB Rejected', 'openListing', 'rejected', now(), now() + interval '5 days', 22, 'Blurry picture');
       set session_replication_role = origin;`);
  const page = await open(browser, who.session, "/old-advertisements");
  const card = page.getByTestId("campaign-card").filter({ hasText: "MB Rejected" });
  await expect(card).toContainText("Needs attention");
  await expect(card.getByTestId("campaign-reason")).toContainText("Blurry picture");
  await expect(card.getByRole("button", { name: /Resume|Pause/ })).toHaveCount(0);
});

// ── SH-101, SH-104: the inbox and bad thread ids ──
test("signed out, the inbox asks to sign in; a made-up thread id says it doesn't exist", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/chats`);
  await expect(page.getByTestId("chat-signed-out")).toBeVisible();
  await expect(page.getByText("StyleCraft Apparels")).toHaveCount(0);
  await ctx.close();

  const who = await account("mb-bad", false);
  const signedIn = await open(browser, who.session, "/chats/stylecraft-apparels");
  await expect(signedIn.getByText("This conversation no longer exists.")).toBeVisible();
});

// ── SH-105: opening a chat writes nothing; the first message creates it ──
test("opening a chat creates no conversation until the first message", async ({ browser }) => {
  const buyer = await account("mb-open", false);
  const seller = await account("mb-open-s");
  const page = await open(browser, buyer.session, `/chats/${seller.id}`);
  await expect(page.getByPlaceholder(/message/i)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const pair = `user_a = least('${buyer.id}'::uuid, '${seller.id}'::uuid) and user_b = greatest('${buyer.id}'::uuid, '${seller.id}'::uuid)`;
  expect(sql(`select count(*) from public.conversations where ${pair}`)).toBe("0");
  await page.getByPlaceholder(/message/i).fill("Hello from the medium spec");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Hello from the medium spec")).toBeVisible({ timeout: 15_000 });
  expect(sql(`select count(*) from public.conversations where ${pair}`)).toBe("1");
});

// ── SH-106: a seller's Calls tab shows buyers' calls ──
test("a seller's Calls tab lists the buyer who called, as incoming", async ({ browser }) => {
  const seller = await account("mb-calls");
  const buyer = await account("mb-calls-b", false);
  sql(`update public.profiles set full_name = 'Caller Buyer MB' where id = '${buyer.id}';
       insert into public.calls (buyer_id, vendor_id, direction, product_context) values ('${buyer.id}', '${seller.id}', 'outgoing', 'MB knit');`);
  const page = await open(browser, seller.session, "/chat");
  await page.getByRole("tab", { name: /Calls/ }).or(page.getByRole("button", { name: /^Calls/ })).first().click();
  await expect(page.getByText("Caller Buyer MB")).toBeVisible({ timeout: 15_000 });
});

// ── SH-079: a failed read is an error, not "nothing here" ──
test("Leads and Quotes show an error with Try again when the read fails", async ({ browser }) => {
  const who = await account("mb-err");
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  await page.route(/rest\/v1\/rfqs\?/, (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.route(/rest\/v1\/quotes\?/, (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.goto(`${BUYER_URL}/leads`);
  await expect(page.getByText("Your requirements couldn't be loaded")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No open buyer requirements right now")).toHaveCount(0);
  await page.goto(`${BUYER_URL}/quotes`);
  await expect(page.getByText("Your quotes couldn't be loaded")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No quotes submitted yet")).toHaveCount(0);
});
