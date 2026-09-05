import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Chat + chat-moderation pipeline — UI layer.
 *
 * The companion to Cosora-Admin/scripts/chat-pipeline-matrix.mjs, which covers
 * the same features at the database layer. A feature is only verified when both
 * pass: the whole point of this pass is catching the case where one layer is
 * correct and the other has not caught up. (The vendor_profiles.account_status
 * regression was exactly that — a perfect DB layer under a broken UI.)
 *
 * FIXTURES ONLY. Never demo-buyer/demo-vendor: `messages` has no DELETE policy
 * for any role, so every message these tests send is permanent, and a crashed
 * run would leave a demo account suspended. Run
 * Cosora-Admin/scripts/seed-chat-fixtures.sql first.
 *
 * AUTH: sessions are minted through supabase-js in Node and injected into
 * localStorage before the app boots, rather than driven through the login form.
 * The form is not what these tests are about, and OTP is the real production
 * path anyway — driving a password form here would test a dev affordance.
 */

// This repo is ESM ("type": "module"), so __dirname does not exist.
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
/** supabase-js v2 default. Must match or the app boots signed out. */
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// NOT under test-results/: Playwright wipes that directory at the start of
// every run, so screenshots written there are destroyed by the next spec file
// and cannot serve as durable evidence in documentation/test.md.
const SHOTS = path.join(REPO_ROOT, "screenshots", "chat-pipeline");
mkdirSync(SHOTS, { recursive: true });

const F = {
  buyerA: "cf000001-0000-0000-0000-000000000001",
  vendorA: "cf000003-0000-0000-0000-000000000003",
};
const LOGIN = {
  buyerA: "chatfx-buyer-a@cosora.test",
  vendorA: "chatfx-vendor-a@cosora.test",
  support: "rlstest-support@cosora.test",
};
const PASSWORD_FIXTURE = "TestPass123!";

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
}

async function apiSignIn(email: string, password = PASSWORD_FIXTURE) {
  const db = admin();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session, id: data.user!.id };
}

/** Boot a context already signed in as `email`. */
async function contextAs(browser: BrowserContext["browser"], email: string) {
  const { session, id, db } = await apiSignIn(email);
  const ctx = await browser!.newContext();
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(session)] as const,
  );
  return { ctx, id, db };
}

/** Support-role client, for driving moderation state from the test. */
let support: { db: SupabaseClient; id: string };
let convId: string;

async function unlockConversation() {
  const { data: pending } = await support.db
    .from("conversation_reviews")
    .select("id")
    .eq("conversation_id", convId)
    .eq("status", "pending");
  for (const r of pending ?? []) {
    await support.db.rpc("resolve_conversation_review", {
      p_review_id: r.id,
      p_verdict: "resumed",
      p_resume: true,
    });
  }
}

async function conversationStatus() {
  const { data } = await support.db.from("conversations").select("status").eq("id", convId).single();
  return data?.status as string;
}

async function setAccountStatus(profileId: string, status: "active" | "suspended") {
  // Guard rail — this spec must never touch a non-fixture account.
  if (!profileId.startsWith("cf00000")) throw new Error(`refusing to suspend non-fixture ${profileId}`);
  const { error } = await support.db.rpc("set_account_status", {
    p_profile_id: profileId,
    p_new_status: status,
    p_reason_id: null,
    p_source: "admin_manual",
  });
  if (error) throw new Error(`set_account_status: ${error.message}`);
}

test.beforeAll(async () => {
  const s = await apiSignIn(LOGIN.support);
  support = { db: s.db, id: s.id };

  // Open (or reuse) the fixture pair, as a participant — conversations_insert
  // is participants-only, so an admin cannot create one.
  const buyer = await apiSignIn(LOGIN.buyerA);
  const [a, b] = [F.buyerA, F.vendorA].sort();
  const { data, error } = await buyer.db
    .from("conversations")
    .upsert({ user_a: a, user_b: b }, { onConflict: "user_a,user_b" })
    .select("id")
    .single();
  if (error) throw new Error(`fixture conversation: ${error.message}`);
  convId = data.id;
  await unlockConversation();
});

test.afterAll(async () => {
  await unlockConversation();
  for (const id of [F.buyerA, F.vendorA]) {
    const { data } = await support.db.from("profiles").select("account_status").eq("id", id).single();
    if (data?.account_status !== "active") await setAccountStatus(id, "active");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — the conversation-lock UI, on BOTH sides of the same thread at once
// ─────────────────────────────────────────────────────────────────────────────
test("T5.1/T5.2 locked thread: both sides show banner, dead composer, no call button", async ({ browser }) => {
  const buyer = await contextAs(browser, LOGIN.buyerA);
  const vendor = await contextAs(browser, LOGIN.vendorA);
  const buyerPage = await buyer.ctx.newPage();
  const vendorPage = await vendor.ctx.newPage();

  // Baseline: unlocked, composer alive, call button present.
  await unlockConversation();
  await buyerPage.goto(`/chats/${F.vendorA}`);
  await buyerPage.waitForLoadState("networkidle");
  const composer = buyerPage.getByPlaceholder("Message");
  await expect(composer).toBeEnabled();
  await buyerPage.screenshot({ path: path.join(SHOTS, "T5-01-unlocked-buyer.png"), fullPage: true });

  // The legally-required monitoring disclosure must be present BEFORE the lock…
  const disclosureBefore = await buyerPage.getByText(/monitor/i).count();
  expect(disclosureBefore, "monitoring disclosure must render on an unlocked thread").toBeGreaterThan(0);

  // Lock it, through the real RPC, as a participant would.
  const buyerApi = await apiSignIn(LOGIN.buyerA);
  await buyerApi.db.rpc("submit_report", {
    p_conversation_id: convId,
    p_message_id: null,
    p_reported_reason: "Scam, fraud or spam",
  });
  expect(await conversationStatus()).toBe("under_review");

  for (const [who, page] of [["buyer", buyerPage], ["vendor", vendorPage]] as const) {
    await page.goto(`/chats/${who === "buyer" ? F.vendorA : F.buyerA}`);
    await page.waitForLoadState("networkidle");

    // Banner, present and not dismissable (no close control inside it).
    const banner = page.getByText(/under review for a possible policy violation/i);
    await expect(banner, `${who}: lock banner`).toBeVisible();

    // Composer disabled, with the moderation placeholder rather than "Message".
    const input = page.getByPlaceholder(/Sending is paused while this chat is reviewed/i);
    await expect(input, `${who}: composer placeholder swaps`).toBeVisible();
    await expect(input, `${who}: composer disabled`).toBeDisabled();

    // Send button VISIBLY dimmed, not merely disabled-but-bright. This regressed
    // once via a Framer inline-opacity issue, so it is asserted on computed
    // opacity, not on the disabled attribute.
    const send = page.getByRole("button", { name: /send/i });
    if (await send.count()) {
      const opacity = await send.first().evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity, `${who}: send button opacity while locked`).toBeLessThan(0.95);
    }

    // Call button HIDDEN entirely, not greyed.
    await expect(page.getByRole("button", { name: /^call$/i }), `${who}: call button removed`).toHaveCount(0);

    // Disclosure still present while locked — a "must always be true" rule.
    expect(await page.getByText(/monitor/i).count(), `${who}: disclosure while locked`).toBeGreaterThan(0);

    await page.screenshot({ path: path.join(SHOTS, `T5-02-locked-${who}.png`), fullPage: true });
  }

  await unlockConversation();
  await buyer.ctx.close();
  await vendor.ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — blocklist: the UI must say why, and must NOT eat the draft
// ─────────────────────────────────────────────────────────────────────────────
test("T2.1 blocklisted send: error toast, draft retained, no message row", async ({ browser }) => {
  const term = "chatfx-zzuiblocked";
  await support.db.from("keyword_blocklist").insert({ term, added_by: support.id });
  await unlockConversation();

  const buyer = await contextAs(browser, LOGIN.buyerA);
  const page = await buyer.ctx.newPage();
  await page.goto(`/chats/${F.vendorA}`);
  await page.waitForLoadState("networkidle");

  const before = await support.db.from("messages").select("id").eq("conversation_id", convId);

  const draft = `hello ${term} there`;
  const composer = page.getByPlaceholder("Message");
  await composer.fill(draft);
  await composer.press("Enter");

  // Title and body asserted separately. A regex matching both is a strict-mode
  // violation, and pinning each half also pins the exact documented copy.
  await expect(page.getByText("Message not sent", { exact: true })).toBeVisible();
  await expect(page.getByText(/isn't allowed on Cosora/i)).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T2-01-blocklist-toast.png"), fullPage: true });

  // The contract: sendText() resolving false leaves the typed text in place.
  await expect(composer, "draft must survive a rejected send").toHaveValue(draft);

  const after = await support.db.from("messages").select("id").eq("conversation_id", convId);
  expect(after.data?.length, "no message row may be written").toBe(before.data?.length);

  await support.db.from("keyword_blocklist").delete().eq("term", term);
  await buyer.ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// T1.3 — realtime, both directions, two live contexts
// ─────────────────────────────────────────────────────────────────────────────
test("T1.3 realtime delivery buyer→vendor and vendor→buyer without reload", async ({ browser }) => {
  await unlockConversation();
  const buyer = await contextAs(browser, LOGIN.buyerA);
  const vendor = await contextAs(browser, LOGIN.vendorA);
  const buyerPage = await buyer.ctx.newPage();
  const vendorPage = await vendor.ctx.newPage();

  await buyerPage.goto(`/chats/${F.vendorA}`);
  await vendorPage.goto(`/chats/${F.buyerA}`);
  await buyerPage.waitForLoadState("networkidle");
  await vendorPage.waitForLoadState("networkidle");

  const b2v = `chatfx-ui-b2v-${Math.random().toString(36).slice(2, 7)}`;
  await buyerPage.getByPlaceholder("Message").fill(b2v);
  await buyerPage.getByPlaceholder("Message").press("Enter");
  await expect(vendorPage.getByText(b2v), "buyer→vendor must arrive with no reload").toBeVisible({ timeout: 20_000 });
  await vendorPage.screenshot({ path: path.join(SHOTS, "T1-03-realtime-b2v.png"), fullPage: true });

  const v2b = `chatfx-ui-v2b-${Math.random().toString(36).slice(2, 7)}`;
  await vendorPage.getByPlaceholder("Message").fill(v2b);
  await vendorPage.getByPlaceholder("Message").press("Enter");
  await expect(buyerPage.getByText(v2b), "vendor→buyer must arrive with no reload").toBeVisible({ timeout: 20_000 });
  await buyerPage.screenshot({ path: path.join(SHOTS, "T1-03-realtime-v2b.png"), fullPage: true });

  await buyer.ctx.close();
  await vendor.ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — contact exposure gating on the vendor profile
// ─────────────────────────────────────────────────────────────────────────────
test("T9.1 signed-out visitor sees a sign-in prompt, never contact details", async ({ browser }) => {
  const ctx = await browser.newContext(); // deliberately NO session
  const page = await ctx.newPage();
  await page.goto(`/vendor/${F.vendorA}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/Sign in to see contact details/i)).toBeVisible();
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body, "phone must not appear anywhere on the page").not.toContain("90000 00003");
  expect(body, "owner email must not appear").not.toContain("chatfx-vendor-a@cosora.test");
  await page.screenshot({ path: path.join(SHOTS, "T9-01-signed-out.png"), fullPage: true });
  await ctx.close();
});

test("T9.2/9.3/9.4 signed-in clear vs blocked, registry data survives", async ({ browser }) => {
  await unlockConversation();
  await setAccountStatus(F.vendorA, "active");

  const buyer = await contextAs(browser, LOGIN.buyerA);
  const page = await buyer.ctx.newPage();

  // 9.2 clear
  await page.goto(`/vendor/${F.vendorA}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("+91 90000 00003")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T9-02-clear.png"), fullPage: true });

  // 9.3 target suspended
  await setAccountStatus(F.vendorA, "suspended");
  await page.goto(`/vendor/${F.vendorA}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Contact details aren't available/i)).toBeVisible();
  await expect(page.getByText(/This account is currently suspended/i)).toBeVisible();
  let body = await page.locator("body").innerText();
  expect(body, "phone must be gone when the target is suspended").not.toContain("90000 00003");
  // 9.4 registry data stays — paused, not erased.
  await expect(page.getByText(/Business Type/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T9-03-target-suspended.png"), fullPage: true });
  await setAccountStatus(F.vendorA, "active");

  // 9.3 caller suspended
  await setAccountStatus(F.buyerA, "suspended");
  await page.goto(`/vendor/${F.vendorA}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Your account is suspended/i)).toBeVisible();
  body = await page.locator("body").innerText();
  expect(body, "phone must be gone when the caller is suspended").not.toContain("90000 00003");
  await page.screenshot({ path: path.join(SHOTS, "T9-04-caller-suspended.png"), fullPage: true });
  await setAccountStatus(F.buyerA, "active");

  // 9.3 conversation under review
  const buyerApi = await apiSignIn(LOGIN.buyerA);
  await buyerApi.db.rpc("submit_report", {
    p_conversation_id: convId, p_message_id: null, p_reported_reason: "Scam, fraud or spam",
  });
  await page.goto(`/vendor/${F.vendorA}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/This chat is under review/i)).toBeVisible();
  body = await page.locator("body").innerText();
  expect(body, "phone must be gone while the thread is under review").not.toContain("90000 00003");
  await page.screenshot({ path: path.join(SHOTS, "T9-05-under-review.png"), fullPage: true });
  await unlockConversation();

  await buyer.ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// T10.5 — the notifications page reads the real table
// ─────────────────────────────────────────────────────────────────────────────
test("T10.5 notifications page renders real rows, not the old localStorage seed", async ({ browser }) => {
  // Produce a REAL notification through the real path.
  await setAccountStatus(F.buyerA, "suspended");
  await setAccountStatus(F.buyerA, "active");

  const buyer = await contextAs(browser, LOGIN.buyerA);
  const page = await buyer.ctx.newPage();
  await page.goto("/notifications");
  await page.waitForLoadState("networkidle");

  // Guard against the blank-page failure this test originally caught: an
  // uncaught error in the realtime effect killed the React tree and rendered
  // nothing at all. Body text length is the cheapest possible regression guard.
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.length, "page must not render blank (React crash)").toBeGreaterThan(200);

  await expect(page.getByText(/Your account is active again/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "T10-05-notifications.png"), fullPage: true });

  // The old fabricated feed must NOT be presented as real. These titles come
  // from the dev-only seed; in a dev build they are expected, so this asserts
  // the REAL row is present rather than asserting the seed is absent.
  const realRows = await buyer.db.from("notifications").select("id, title").eq("profile_id", F.buyerA);
  expect(realRows.data?.length ?? 0, "a real notifications row must exist").toBeGreaterThan(0);

  await buyer.ctx.close();
});
