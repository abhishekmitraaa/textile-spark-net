import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasCredentials, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MPF-3: profiles.email and profiles.phone are private (migration 20260923171821).
 *
 * The database layer is checked by scripts/profile-contact-privacy-check.mjs
 * (every role, over HTTP) and scripts/contact-gate-check.mjs (the refusals of
 * call_buyer_contact() in every suspension and chat-lock state). This spec is
 * the UI layer, plus the signed-out HTTP proof so the Playwright suite fails too
 * if a grant ever reopens the columns:
 *
 *   1. Signed out, over HTTP: both MPF-3 proof requests and every other route to
 *      the two columns are refused (401, 42501) with no rows and no count.
 *   2. Every page that reads profiles, as demo-buyer, demo-vendor and signed
 *      out: no profiles read and no contact RPC is refused. /profile and
 *      /profile/edit show the buyer's own email and phone.
 *   3. Vendor "Call Buyer": the number comes from call_buyer_contact() and is
 *      shown; with the buyer suspended, the click is refused with the gate's copy.
 *   4. Cosora-Admin: Accounts search and the account drawer, the Chats search,
 *      a thread and the review queue still resolve people and emails.
 *
 * MUTATING, self-restoring (test 3 only). The Call Buyer button renders only on
 * an accepted quote, so the test accepts one of demo-vendor's pending quotes on
 * demo-buyer's RFQ, and suspends demo-buyer through set_account_status.
 * `finally` reinstates the buyer and sets the quote back to pending. Each run
 * leaves one suspension ledger row and two notifications for demo-buyer, as
 * scripts/contact-gate-check.mjs does.
 *
 * Needs both dev servers: this app (baseURL) and Cosora-Admin on ADMIN_APP_URL
 * (default :5174). The phone is compared, never printed, and masked in the
 * screenshot.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const ADMIN_URL = process.env.ADMIN_APP_URL ?? "http://localhost:5174";
const SHOTS = path.join(REPO_ROOT, "screenshots");

const BUYER_ID = "11111111-1111-1111-1111-111111111111";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";

test.describe.configure({ mode: "serial" });
test.skip(
  !hasCredentials("DEMO_BUYER_PASSWORD", "DEMO_VENDOR_PASSWORD", "DEMO_ADMIN_PASSWORD"),
  "set DEMO_BUYER_PASSWORD, DEMO_VENDOR_PASSWORD and DEMO_ADMIN_PASSWORD in .env",
);

async function session(role: "buyer" | "vendor" | "admin") {
  const { email, password } = demoAccount(role);
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${role}: ${error.message}`);
  return { db, session: data.session, id: data.user!.id, email };
}

async function contextFor(browser: Browser, s: { session: unknown } | null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (s) {
    await ctx.addInitScript(
      ([key, value]: [string, string]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(s.session)] as [string, string],
    );
  }
  return ctx;
}

// Every request that touches the two columns or their new readers.
const CONTACT_READ = /\/rest\/v1\/(profiles|rpc\/(my_contact_info|call_buyer_contact|admin_profile_search|admin_profile_emails))(\?|$)/;

function watchContactReads(page: Page) {
  const reads: { status: number; what: string }[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(SUPABASE_URL) || !CONTACT_READ.test(u)) return;
    const url = new URL(u);
    reads.push({ status: r.status(), what: `${url.pathname.replace("/rest/v1/", "")} ${url.searchParams.get("select") ?? ""}`.trim() });
  });
  return reads;
}

async function setStatus(admin: SupabaseClient, id: string, status: "active" | "suspended") {
  if (id !== BUYER_ID) throw new Error(`refusing to change the status of ${id}`);
  const { error } = await admin.rpc("set_account_status", {
    p_profile_id: id, p_new_status: status, p_reason_id: null, p_source: "admin_manual",
  });
  if (error) throw new Error(`set_account_status: ${error.message}`);
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("signed out: email and phone are refused by every route, and the other columns still read", async ({ request }) => {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  for (const q of [
    "select=id&email=not.is.null", // the two MPF-3 proof requests
    "select=id&phone=not.is.null",
    "select=email",
    "select=phone",
    "select=*",
    "select=id&order=email",
    "select=id&or=(email.ilike.*a*,phone.ilike.*9*)",
  ]) {
    const r = await request.get(`${SUPABASE_URL}/rest/v1/profiles?${q}`, { headers: { ...headers, Prefer: "count=exact" } });
    expect(r.status(), q).toBe(401);
    expect(r.headers()["content-range"], `${q}: no count`).toBeUndefined();
    const body = await r.json();
    expect(Array.isArray(body), `${q}: no rows`).toBe(false);
    expect(body.code, q).toBe("42501");
  }
  const ok = await request.get(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,full_name,avatar_url,active_role,onboarded,account_status,created_at&limit=1`,
    { headers },
  );
  expect(ok.status(), "the app's signed-out read of the other columns").toBe(200);
});

/** Load a page and let its reads settle. Some pages (product detail) keep polling, so idle is capped. */
async function visit(page: Page, url: string) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

test("no page's profile read is refused, and the buyer sees their own email and phone", async ({ browser, request }) => {
  test.setTimeout(300_000); // 27 page loads across three sessions
  const buyer = await session("buyer");
  const { data: own, error: ownErr } = await buyer.db.rpc("my_contact_info").maybeSingle();
  expect(ownErr).toBeNull();
  expect(own?.email && own?.phone, "demo-buyer has an email and a phone to show").toBeTruthy();

  const products = await request.get(`${SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const productId = (await products.json())[0]?.id as string;
  expect(productId, "a public product to open").toBeTruthy();

  const sweep: Record<string, { who: { session: unknown } | null; pages: string[] }> = {
    "demo-buyer": {
      who: buyer,
      pages: ["/profile", "/profile/edit", "/profile/business-details", "/profile/reviews", "/profile/data-export",
        "/chats", `/chats/${VENDOR_ID}`, "/requirement/my-quotes", "/settings", `/vendor/${VENDOR_ID}`,
        `/product/${productId}`, "/notifications"],
    },
    "demo-vendor": {
      who: await session("vendor"),
      pages: ["/quotes", "/leads", "/chats", `/chats/${BUYER_ID}`, "/reviews", "/dashboard", "/analytics",
        "/my-store", "/subscription", "/business-profile"],
    },
    "signed out": { who: null, pages: ["/", "/seller", `/vendor/${VENDOR_ID}`, `/product/${productId}`, "/home/new-arrivals"] },
  };

  for (const [who, { who: s, pages }] of Object.entries(sweep)) {
    const ctx = await contextFor(browser, s);
    const page = await ctx.newPage();
    const reads = watchContactReads(page);
    for (const url of pages) {
      await visit(page, url);
      if (who === "demo-buyer" && url === "/profile") {
        await expect(page.getByText(own!.email!, { exact: true }).first(), "/profile shows the own email").toBeVisible();
        await expect(page.getByText(own!.phone!, { exact: true }).first(), "/profile shows the own phone").toBeVisible();
      }
      if (who === "demo-buyer" && url === "/profile/edit") {
        await expect(page.getByLabel("Email Address")).toHaveValue(own!.email!);
        await expect(page.getByLabel("Phone Number")).toHaveValue(own!.phone!);
      }
    }
    const refused = reads.filter((r) => r.status >= 400);
    expect(refused, `${who}: refused profile reads`).toEqual([]);
    if (s) expect(reads.length, `${who}: the sweep exercised profile reads`).toBeGreaterThan(0);
    await ctx.close();
  }
});

test("vendor Call Buyer gets the number from call_buyer_contact(), and is refused for a suspended buyer", async ({ browser }) => {
  const buyer = await session("buyer");
  const vendor = await session("vendor");
  const admin = await session("admin");
  const { data: own } = await buyer.db.rpc("my_contact_info").maybeSingle();
  const phone = own?.phone as string;
  expect(phone, "demo-buyer has a phone").toBeTruthy();

  const { data: candidates, error } = await buyer.db
    .from("quotes")
    .select("id, status, rfqs!inner(buyer_id, image)")
    .eq("vendor_id", VENDOR_ID)
    .eq("rfqs.buyer_id", BUYER_ID)
    .eq("status", "pending")
    .order("id");
  expect(error).toBeNull();
  const quote = (candidates ?? []).find((q) => (q.rfqs as unknown as { image: string | null }).image);
  expect(quote, "a pending demo-vendor quote on a demo-buyer RFQ with an image").toBeTruthy();

  const { data: before } = await buyer.db.from("profiles").select("account_status").eq("id", BUYER_ID).single();
  if (before?.account_status === "suspended") await setStatus(admin.db, BUYER_ID, "active"); // a crashed earlier run

  const ctx = await contextFor(browser, vendor);
  const page = await ctx.newPage();
  try {
    const { error: acceptErr } = await buyer.db.from("quotes").update({ status: "accepted" }).eq("id", quote!.id);
    expect(acceptErr).toBeNull();

    await page.goto("/quotes", { waitUntil: "networkidle" });
    const callButton = page.getByRole("button", { name: "Call Buyer" });
    await expect(callButton).toHaveCount(1);

    const released = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/call_buyer_contact"));
    await callButton.click();
    expect((await released).status(), "call_buyer_contact released the number").toBe(200);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(phone, { exact: true }), "the buyer's real number").toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "mpf3-call-buyer.png"), mask: [dialog.locator("a[href^='tel:']")] });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await setStatus(admin.db, BUYER_ID, "suspended");
    const refused = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/call_buyer_contact"));
    await callButton.click();
    const r = await refused;
    expect(r.status(), "refused by the database, not only by the UI").toBe(403);
    expect((await r.json()).message).toBe("target_suspended");
    await expect(page.getByText("Calling is unavailable").first()).toBeVisible();
    await expect(page.getByText("This account is currently suspended.").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "mpf3-call-buyer-suspended.png") });
  } finally {
    await setStatus(admin.db, BUYER_ID, "active");
    await buyer.db.from("quotes").update({ status: "pending" }).eq("id", quote!.id);
    await ctx.close();
  }
  const { data: after } = await buyer.db.from("quotes").select("status").eq("id", quote!.id).single();
  expect(after?.status, "quote restored").toBe("pending");
  const { data: status } = await buyer.db.from("profiles").select("account_status").eq("id", BUYER_ID).single();
  expect(status?.account_status, "buyer reinstated").toBe("active");
});

test("Cosora-Admin still finds accounts by email and resolves chat participants", async ({ browser }) => {
  const admin = await session("admin");
  const buyer = await session("buyer");
  const [a, b] = [BUYER_ID, VENDOR_ID].sort();
  const { data: conv } = await buyer.db.from("conversations").select("id").eq("user_a", a).eq("user_b", b).single();
  expect(conv?.id, "the demo pair's conversation").toBeTruthy();

  const ctx = await contextFor(browser, admin);
  const page = await ctx.newPage();
  const reads = watchContactReads(page);

  await page.goto(`${ADMIN_URL}/accounts`, { waitUntil: "networkidle" });
  await page.getByLabel("Search by name or email").fill(buyer.email);
  const row = page.getByRole("row").filter({ hasText: buyer.email });
  await expect(row, "found by email, and the email is shown").toHaveCount(1);
  await row.getByRole("button", { name: "Manage" }).click();
  await expect(page.getByRole("heading", { name: "Account status" })).toBeVisible();
  // Suspension history names each actor through admin_profile_emails(). A failed
  // lookup falls back to "by an admin" without an error, so assert the name.
  // demo-buyer's history has rows by demo-admin (test 3, contact-gate-check).
  const { data: me } = await admin.db.rpc("admin_profile_emails", { p_ids: [admin.id] });
  const actor = (me?.[0]?.full_name || me?.[0]?.email) as string;
  expect(actor, "demo-admin has a name or email").toBeTruthy();
  await expect(page.getByText(`by ${actor}`, { exact: false }).first(), "history names the admin").toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "mpf3-admin-accounts.png"), fullPage: true });

  await page.goto(`${ADMIN_URL}/chats`, { waitUntil: "networkidle" });
  await page.getByLabel("Find a conversation").fill(buyer.email);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Unknown account/)).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/chats/${conv!.id}`, { waitUntil: "networkidle" });
  await expect(page.getByText(/Unknown account/)).toHaveCount(0);
  await page.goto(`${ADMIN_URL}/chat-review`, { waitUntil: "networkidle" });
  await expect(page.getByText(/Unknown account/)).toHaveCount(0);

  const used = new Set(reads.map((r) => r.what.split(" ")[0]));
  expect(used.has("rpc/admin_profile_search"), "Accounts and Chats search went through the RPC").toBe(true);
  expect(used.has("rpc/admin_profile_emails"), "participants and actors went through the RPC").toBe(true);
  expect(reads.filter((r) => r.status >= 400), "refused admin reads").toEqual([]);
  await ctx.close();
});
