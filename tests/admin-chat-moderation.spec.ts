import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cosora-Admin UI — the admin half of the chat-moderation pipeline.
 *
 * Lives in this repo because this is where Playwright is configured; it drives
 * the OTHER app, on its own port. `ADMIN_APP_URL` overrides the default.
 *
 * The two checks the brief calls highest-value are both here:
 *   T11.1 — the vendor_profiles.account_status regression. That column was
 *           DROPPED, and a PostgREST select naming a missing column is a hard
 *           400, so the page either loads or it does not. This is a pure
 *           UI-layer test of a fact the DB layer cannot express.
 *   T6.3  — the Resume button. resolve_conversation_review defaults p_resume to
 *           FALSE, so a UI that omits it reports success and leaves the thread
 *           locked. Asserted end-to-end: click the button, then read
 *           conversations.status back out of the database.
 *
 * FIXTURES ONLY, and every state change is reversed in afterAll.
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
const ADMIN_URL = process.env.ADMIN_APP_URL ?? "http://localhost:5174";

// NOT under test-results/: Playwright wipes that directory at the start of
// every run, so screenshots written there are destroyed by the next spec file
// and cannot serve as durable evidence in documentation/test.md.
const SHOTS = path.join(REPO_ROOT, "screenshots", "chat-pipeline");
mkdirSync(SHOTS, { recursive: true });

const F = {
  buyerA: "cf000001-0000-0000-0000-000000000001",
  vendorA: "cf000003-0000-0000-0000-000000000003",
};
const PASSWORD_ADMIN = "TestPass123!";

async function apiSignIn(email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD_ADMIN });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session, id: data.user!.id };
}

let support: SupabaseClient;
let convId: string;

test.beforeAll(async () => {
  support = (await apiSignIn("rlstest-support@cosora.test")).db;
  const buyer = await apiSignIn("chatfx-buyer-a@cosora.test");
  const [a, b] = [F.buyerA, F.vendorA].sort();
  const { data, error } = await buyer.db
    .from("conversations")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" })
    .select("id")
    .single();
  if (error) throw new Error(`fixture conversation: ${error.message}`);
  convId = data.id;
});

test.afterAll(async () => {
  const { data: pending } = await support
    .from("conversation_reviews").select("id").eq("conversation_id", convId).eq("status", "pending");
  for (const r of pending ?? []) {
    await support.rpc("resolve_conversation_review", { p_review_id: r.id, p_verdict: "resumed", p_resume: true });
  }
});

async function adminContextAs(browser: any, email: string) {
  const { session } = await apiSignIn(email);
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, value]: [string, string]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)],
  );
  return ctx;
}

async function conversationStatus() {
  const { data } = await support.from("conversations").select("status").eq("id", convId).single();
  return data?.status as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// T11.1 — the dropped-column regression
// ─────────────────────────────────────────────────────────────────────────────
test("T11.1 Vendors and VendorDetail load as vendor_ops, no dropped-column error", async ({ browser }) => {
  const ctx = await adminContextAs(browser, "rlstest-vendorops@cosora.test");
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${ADMIN_URL}/vendors`);
  await page.waitForLoadState("networkidle");
  // The failure mode was a 42703 surfaced through the page's ErrorNote, so this
  // asserts on the absence of that specific text as well as on real content.
  await expect(page.getByText(/account_status does not exist/i)).toHaveCount(0);
  await expect(page.getByText("Chat Fixture Brand A")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T11-01-vendors-list.png"), fullPage: true });

  await page.goto(`${ADMIN_URL}/vendors/${F.vendorA}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/account_status does not exist/i)).toHaveCount(0);
  await expect(page.getByText(/Account status/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T11-01-vendor-detail.png"), fullPage: true });

  expect(errors, "no uncaught page errors").toEqual([]);
  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// T6.1/T6.3 — the review queue, and Resume actually resuming
// ─────────────────────────────────────────────────────────────────────────────
test("T6.1/T6.3 support resumes a locked thread from the queue and it really unlocks", async ({ browser }) => {
  // Lock the fixture thread through the real participant path.
  const buyer = await apiSignIn("chatfx-buyer-a@cosora.test");
  await buyer.db.rpc("submit_report", {
    p_conversation_id: convId,
    p_message_id: null,
    p_reported_reason: "Scam, fraud or spam",
  });
  expect(await conversationStatus()).toBe("under_review");

  const ctx = await adminContextAs(browser, "rlstest-support@cosora.test");
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/chat-review`);
  await page.waitForLoadState("networkidle");

  // T6.1 — the queue shows the item, its source, and the reporter's own words.
  await expect(page.getByText("Scam, fraud or spam").first()).toBeVisible();
  await expect(page.getByText(/user report/i).first()).toBeVisible();
  await expect(page.getByText("Chat Fixture Buyer A").first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T6-01-review-queue.png"), fullPage: true });

  // T6.3 — click the real Resume button and confirm the DATABASE changed.
  page.once("dialog", (d) => d.accept()); // the action is confirm()-guarded
  await page.getByRole("button", { name: /^Resume$/ }).first().click();
  await expect(page.getByText(/Chat resumed/i)).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T6-03-resumed-toast.png"), fullPage: true });

  // The assertion that matters. A UI that forgets p_resume=true would show this
  // same success toast while leaving the thread locked.
  await expect
    .poll(async () => conversationStatus(), {
      message: "conversations.status must actually be back to active",
      timeout: 10_000,
    })
    .toBe("active");

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// T6.9 — the role gate, in the nav rather than only in the database
// ─────────────────────────────────────────────────────────────────────────────
test("T6.9 ads_moderator sees no chat moderation nav and is refused the route", async ({ browser }) => {
  const ctx = await adminContextAs(browser, "rlstest-adsmod@cosora.test");
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/ads`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: /Review queue/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Keyword blocklist/i })).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "T6-09-adsmod-nav.png"), fullPage: true });

  // And typing the URL directly must not work either.
  await page.goto(`${ADMIN_URL}/chat-review`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Scam, fraud or spam")).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "T6-09-adsmod-direct-route.png"), fullPage: true });

  await ctx.close();
});
