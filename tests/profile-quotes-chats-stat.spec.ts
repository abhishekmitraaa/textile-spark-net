import { test, expect, type Browser, type BrowserContext, type Page, type Response } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Profile → Quotes and Chats stats count the user's OWN rows (MPF-1).
 *
 * useProfileStats() used to count `quotes` and `conversations` bare, leaning on
 * RLS to mean "mine". quotes_select also admits the quotes a user SENT as a
 * vendor and every quote for an admin; conversations_select admits every chat
 * for a support/super_admin admin. Each stat now filters on the owner column.
 *
 * For each account, three numbers must agree:
 *   1. an independent owner-filtered count, taken outside the app by a
 *      different route from the app's (my RFQ ids → quotes in them; my
 *      conversation ids from separate user_a and user_b filters, de-duplicated);
 *   2. the Quotes / Chats cells on /profile;
 *   3. the page each cell links to: "Total Quotes" on /requirement/my-quotes and
 *      "N Conversations" on /chats.
 *
 * ACCOUNTS
 *   - demo-admin@cosora.dev (super_admin). The one that can catch a regression:
 *     RLS shows it every quote and chat on the platform while it owns none, so
 *     the test first asserts the bare RLS count is LARGER than its own count. A
 *     plain buyer can't catch this bug; its numbers match either way.
 *   - demo-buyer@cosora.dev. Owns quotes and a chat, so a stat stuck at "0"
 *     (which is demo-admin's correct value) still fails.
 *
 * Every cell renders 0 before its query returns, so each page waits for the
 * count responses before asserting. Read-only: creates, mutates and deletes
 * nothing. Requires `npm run dev` on :8080.
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
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const SHOTS = path.join(REPO_ROOT, "screenshots");

const ADMIN = "demo-admin@cosora.dev";
const BUYER = "demo-buyer@cosora.dev";
test.skip(
  !hasCredentials("DEMO_ADMIN_PASSWORD", "DEMO_BUYER_PASSWORD"),
  "set DEMO_ADMIN_PASSWORD and DEMO_BUYER_PASSWORD in .env (see .env.example)",
);

async function signIn(email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session };
}

async function contextWith(browser: Browser, session: unknown): Promise<BrowserContext> {
  // Mobile width: the /chats list is single-column and the /profile stats row is one strip.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );
  return ctx;
}

interface Counts { quotes: number; chats: number }

// (1) Owner-filtered, by a different route from useProfileStats's inner join and .or().
async function ownCounts(db: SupabaseClient, uid: string): Promise<Counts> {
  const { data: rfqs, error: rErr } = await db.from("rfqs").select("id").eq("buyer_id", uid);
  if (rErr) throw rErr;
  const rfqIds = (rfqs ?? []).map((r) => r.id as string);
  let quotes = 0;
  if (rfqIds.length) {
    const { data, error } = await db.from("quotes").select("id").in("rfq_id", rfqIds);
    if (error) throw error;
    quotes = (data ?? []).length;
  }
  const [a, b] = await Promise.all([
    db.from("conversations").select("id").eq("user_a", uid),
    db.from("conversations").select("id").eq("user_b", uid),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const chats = new Set([...(a.data ?? []), ...(b.data ?? [])].map((r) => r.id as string)).size;
  return { quotes, chats };
}

// What the old code showed: a bare count, RLS only.
async function bareCounts(db: SupabaseClient): Promise<Counts> {
  const [q, c] = await Promise.all([
    db.from("quotes").select("*", { count: "exact", head: true }),
    db.from("conversations").select("*", { count: "exact", head: true }),
  ]);
  if (q.error) throw q.error;
  if (c.error) throw c.error;
  return { quotes: q.count ?? 0, chats: c.count ?? 0 };
}

const isHead = (table: string) => (r: Response) =>
  r.request().method() === "HEAD" && new URL(r.url()).pathname === `/rest/v1/${table}`;

function statValue(page: Page, label: string) {
  const cell = page.locator("button").filter({ has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) });
  return { cell, value: cell.locator("span").first() };
}

for (const account of [
  { email: ADMIN, shot: "profile-quotes-chats-stat-admin.png", mustDiscriminate: true },
  { email: BUYER, shot: "profile-quotes-chats-stat-buyer.png", mustDiscriminate: false },
]) {
  test(`Profile Quotes and Chats equal ${account.email}'s own counts and the pages they link to`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { db, session } = await signIn(account.email);
    const uid = session.user.id;

    const own = await ownCounts(db, uid);
    const bare = await bareCounts(db);
    if (account.mustDiscriminate) {
      // Without this the account can't tell the fix from the bug.
      expect(bare.quotes, "demo-admin must see more quotes through RLS than it owns").toBeGreaterThan(own.quotes);
      expect(bare.chats, "demo-admin must see more chats through RLS than it owns").toBeGreaterThan(own.chats);
    } else {
      expect(own.quotes, "demo-buyer needs quotes received for a non-zero check").toBeGreaterThan(0);
      expect(own.chats, "demo-buyer needs a conversation for a non-zero check").toBeGreaterThan(0);
    }

    const ctx = await contextWith(browser, session);
    const page = await ctx.newPage();

    // (2) /profile. Wait for both count requests (HEAD) before reading the cells.
    const profileCounts = Promise.all([page.waitForResponse(isHead("quotes")), page.waitForResponse(isHead("conversations"))]);
    await page.goto("/profile");
    for (const r of await profileCounts) expect(r.ok(), `${new URL(r.url()).pathname} count request`).toBe(true);
    const quotesCell = statValue(page, "Quotes");
    const chatsCell = statValue(page, "Chats");
    await expect(quotesCell.cell).toHaveCount(1);
    await expect(chatsCell.cell).toHaveCount(1);
    // Soft, so a regression in one cell doesn't hide the other.
    await expect.soft(quotesCell.value, "Quotes stat").toHaveText(String(own.quotes));
    await expect.soft(chatsCell.value, "Chats stat").toHaveText(String(own.chats));
    // Only the stats row: no name, email or phone in the image.
    await quotesCell.cell.locator("xpath=..").screenshot({ path: path.join(SHOTS, account.shot) });

    // (3a) The page the Quotes cell links to. Its RFQ read decides the total, so wait for it.
    const myRfqs = page.waitForResponse((r) => r.request().method() === "GET"
      && new URL(r.url()).pathname === "/rest/v1/rfqs" && r.url().includes(`buyer_id=eq.${uid}`));
    await quotesCell.cell.click();
    await expect(page).toHaveURL(/\/requirement\/my-quotes$/);
    expect((await myRfqs).ok(), "My Quotes RFQ read").toBe(true);
    await page.waitForLoadState("networkidle");
    const totalQuotes = page.locator("div").filter({ has: page.locator("span", { hasText: /^Total Quotes$/ }) }).last();
    await expect(totalQuotes.locator("span.text-lg"), "My Quotes → Total Quotes").toHaveText(String(own.quotes));

    // (3b) The page the Chats cell links to, via its conversation list read.
    await page.goto("/profile");
    const convList = page.waitForResponse((r) => r.request().method() === "GET"
      && new URL(r.url()).pathname === "/rest/v1/conversations");
    await statValue(page, "Chats").cell.click();
    await expect(page).toHaveURL(/\/chats$/);
    expect((await convList).ok(), "/chats conversation list read").toBe(true);
    await expect(page.getByText(/^\d+ Conversations$/), "/chats header").toHaveText(`${own.chats} Conversations`);

    await ctx.close();
  });
}
