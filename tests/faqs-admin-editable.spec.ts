import { test, expect, type Browser, type Page } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient, type Session } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Admin-editable FAQs, end to end (2026-09-23).
 *
 * An admin edits FAQs in Cosora-Admin's FAQs page, and the live pages change
 * with no deploy:
 *   buyer_help           /profile/help, as a SIGNED-OUT visitor
 *   subscription         /subscription, as demo-vendor; "Contact us" opens /help
 *   seller_registration  /seller (the vendor landing page), as a SIGNED-OUT visitor
 * For each: add → appears last; edit → updates; move up → reorders (then moved
 * back); deactivate → disappears; delete → gone from admin. Each page's list is
 * compared with its state before the test, so the real content is left as found.
 *
 * Also: the 12 buyer Help FAQs render signed out; Andy's Subscription and Seller
 * Registration content (loaded 2026-09-23) is on its pages; and a non-admin (and
 * anon) gets a permission error calling every admin_faq_* RPC, writing the
 * table directly, and reading its created_by column.
 *
 * ACCOUNTS: demo-admin (super_admin), demo-vendor, demo-buyer. MUTATING,
 * self-cleaning: every row it creates starts with "[P9TEST" and is deleted in
 * `finally`, and seeded rows it reorders are moved back. Requires BOTH dev
 * servers: this app on :8080 and Cosora-Admin on :5174 (ADMIN_APP_URL overrides).
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
const ADMIN = "demo-admin@cosora.dev";
const VENDOR = "demo-vendor@cosora.dev";
const BUYER = "demo-buyer@cosora.dev";

test.skip(
  !hasCredentials("DEMO_ADMIN_PASSWORD", "DEMO_VENDOR_PASSWORD", "DEMO_BUYER_PASSWORD"),
  "set DEMO_ADMIN_PASSWORD, DEMO_VENDOR_PASSWORD and DEMO_BUYER_PASSWORD in .env",
);
test.setTimeout(240_000);

async function signIn(email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session as Session };
}

async function pageWith(browser: Browser, session: Session | null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (session) {
    await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  }
  return { ctx, page: await ctx.newPage() };
}

// ── Admin UI ──
async function openTab(page: Page, label: string) {
  await page.goto(`${ADMIN_URL}/faqs`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
}
async function adminAdd(page: Page, tab: string, f: { category?: string; question: string; answer: string }) {
  await openTab(page, tab);
  if (f.category) await page.getByLabel("Category").fill(f.category);
  await page.getByLabel("Question").fill(f.question);
  await page.getByLabel("Answer").fill(f.answer);
  await page.getByRole("button", { name: "Add FAQ" }).click();
  await expect(page.locator("tr").filter({ hasText: f.question })).toHaveCount(1);
}
const row = (page: Page, question: string) => page.locator("tr").filter({ hasText: question });
async function adminEdit(page: Page, tab: string, question: string, newQuestion: string) {
  await openTab(page, tab);
  await row(page, question).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Question").last().fill(newQuestion);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row(page, newQuestion)).toHaveCount(1);
}
async function adminMove(page: Page, tab: string, question: string, dir: "up" | "down") {
  await openTab(page, tab);
  await page.getByRole("button", { name: `Move ${dir}: ${question}` }).click();
  await page.waitForLoadState("networkidle");
}
async function adminToggle(page: Page, tab: string, question: string, action: "Deactivate" | "Reactivate") {
  await openTab(page, tab);
  await row(page, question).getByRole("button", { name: action }).click();
  await expect(row(page, question).getByRole("button", { name: action === "Deactivate" ? "Reactivate" : "Deactivate" })).toBeVisible();
}
async function adminDelete(page: Page, tab: string, question: string) {
  await openTab(page, tab);
  await row(page, question).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete FAQ" }).click();
  await expect(row(page, question)).toHaveCount(0);
}

// ── Live pages ──
async function buyerHelpQuestions(browser: Browser, category: string): Promise<string[]> {
  const { ctx, page } = await pageWith(browser, null); // signed out
  await page.goto("/profile/help", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Frequently Asked Questions/ }).click();
  const group = page.locator("div").filter({ has: page.getByText(category, { exact: true }) }).filter({ has: page.locator("[data-state]") }).last();
  const qs = await group.locator("button[data-state]").allInnerTexts();
  await ctx.close();
  return qs.map((q) => q.trim());
}
async function subscriptionQuestions(browser: Browser, vendorSession: Session): Promise<{ qs: string[]; contactHref: string | null }> {
  const { ctx, page } = await pageWith(browser, vendorSession);
  await page.goto("/subscription", { waitUntil: "networkidle" });
  const card = page.locator('[data-faq-surface="subscription"]');
  await expect(card).toBeVisible();
  const qs = (await card.locator("button[data-state]").allInnerTexts()).map((q) => q.trim());
  const contactHref = await card.getByRole("link", { name: /Contact us/ }).getAttribute("href");
  await ctx.close();
  return { qs, contactHref };
}
async function sellerLandingQuestions(browser: Browser): Promise<string[]> {
  const { ctx, page } = await pageWith(browser, null); // signed out: /seller is for visitors deciding to register
  await page.goto("/seller", { waitUntil: "networkidle" });
  const block = page.locator('[data-faq-surface="seller_registration"]');
  await expect(block.locator("button[data-state]").first()).toBeAttached();
  const qs = (await block.locator("button[data-state]").allInnerTexts()).map((q) => q.trim());
  await ctx.close();
  return qs;
}

test("admins edit FAQs on all three surfaces and the live pages follow; non-admins cannot", async ({ browser }) => {
  const admin = await signIn(ADMIN);
  const vendor = await signIn(VENDOR);
  const buyer = await signIn(BUYER);
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const MARK = `[P9TEST ${Date.now()}]`;

  // ── Non-admins get a permission error, at the database ──
  const calls: [string, Record<string, unknown>][] = [
    ["admin_faq_list", {}],
    ["admin_faq_add", { p_surface: "subscription", p_category_label: "", p_question: "x", p_answer: "y" }],
    ["admin_faq_update", { p_id: "00000000-0000-0000-0000-000000000000", p_question: "x" }],
    ["admin_faq_delete", { p_id: "00000000-0000-0000-0000-000000000000" }],
    ["admin_faq_reorder", { p_id: "00000000-0000-0000-0000-000000000000", p_position: 1 }],
  ];
  for (const [fn, args] of calls) {
    const asBuyer = await buyer.db.rpc(fn as never, args as never);
    expect(asBuyer.error?.code, `${fn} as demo-buyer`).toBe("42501");
    const asAnon = await anon.rpc(fn as never, args as never);
    expect(asAnon.error, `${fn} as anon`).not.toBeNull();
    console.log(`${fn}: buyer ${asBuyer.error?.code} | anon ${asAnon.error?.code} ${asAnon.error?.message}`);
  }
  const direct = await buyer.db.from("faqs").insert({ surface: "subscription", question: "x", answer: "y" });
  expect(direct.error?.code, "direct INSERT as demo-buyer").toBe("42501");
  // created_by would name the admin who wrote a row (20260923150408), so no client reads it.
  for (const [who, db] of [["anon", anon], ["demo-buyer", buyer.db]] as const) {
    const leak = await db.from("faqs").select("created_by").limit(1);
    expect(leak.error?.code, `faqs.created_by as ${who}`).toBe("42501");
  }

  // ── Signed out, buyer Help still renders the seeded FAQs ──
  {
    const { ctx, page } = await pageWith(browser, null);
    await page.goto("/profile/help", { waitUntil: "networkidle" });
    await expect(page.getByText("12 questions across 4 topics")).toBeVisible();
    await page.getByRole("button", { name: /Frequently Asked Questions/ }).click();
    await expect(page.getByRole("button", { name: "How do I create my first RFQ (Request for Quote)?" })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "faqs-buyer-help-signed-out.png"), fullPage: true });
    await ctx.close();
  }

  // ── Andy's content is on its pages (loaded 2026-09-23 through the admin RPCs) ──
  const subBase = await subscriptionQuestions(browser, vendor.session);
  expect(subBase.qs.slice(0, 5), "Andy's Subscription FAQ, in his order").toEqual([
    "Can I upgrade or downgrade my plan anytime?",
    "Is there a refund policy?",
    "What happens when I reach my lead limit?",
    "Do you offer discounts for annual billing?",
    "Lowest billing plan?",
  ]);
  expect(subBase.contactHref, "Contact us opens the Help page (Andy's content)").toBe("/help");
  {
    const { ctx, page } = await pageWith(browser, vendor.session);
    await page.goto("/subscription", { waitUntil: "networkidle" });
    const card = page.locator('[data-faq-surface="subscription"]');
    await card.getByRole("button", { name: "Lowest billing plan?" }).click();
    await expect(card.getByText(/₹699\/month/)).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: path.join(SHOTS, "faqs-subscription.png") });
    await card.getByRole("link", { name: /Contact us/ }).click();
    await expect(page).toHaveURL(/\/help$/);
    await ctx.close();
  }
  const sellerBase = await sellerLandingQuestions(browser);
  expect(sellerBase, "Andy's 10 Seller Registration FAQs, in his order").toHaveLength(10);
  expect(sellerBase[0]).toBe("What is Cosora?");
  expect(sellerBase[9]).toBe("Can I edit my listings after uploading?");
  {
    const { ctx, page } = await pageWith(browser, null);
    await page.goto("/seller", { waitUntil: "networkidle" });
    const block = page.locator('[data-faq-surface="seller_registration"]');
    await block.scrollIntoViewIfNeeded();
    await block.getByRole("button", { name: "Who can register as a seller on Cosora?" }).click();
    await expect(block.getByText("• Ready-made garments")).toBeVisible(); // line breaks survive
    await page.waitForTimeout(600); // whileInView fade-in
    await block.screenshot({ path: path.join(SHOTS, "faqs-seller-landing.png") });
    await ctx.close();
  }

  const { ctx: adminCtx, page: adminPage } = await pageWith(browser, admin.session);
  try {
    // ── Buyer Help ──
    const bq = `${MARK} Buyer help question?`;
    const bq2 = `${MARK} Buyer help question, edited?`;
    await adminAdd(adminPage, "Buyer Help", { category: "Getting Started", question: bq, answer: "Buyer help answer." });
    await adminPage.screenshot({ path: path.join(SHOTS, "faqs-admin-buyer-help.png"), fullPage: true });
    let gs = await buyerHelpQuestions(browser, "Getting Started");
    expect(gs.at(-1), "added FAQ shows last in its category").toBe(bq);
    await adminEdit(adminPage, "Buyer Help", bq, bq2);
    gs = await buyerHelpQuestions(browser, "Getting Started");
    expect(gs).toContain(bq2);
    expect(gs).not.toContain(bq);
    const before = gs.indexOf(bq2);
    await adminMove(adminPage, "Buyer Help", bq2, "up");
    gs = await buyerHelpQuestions(browser, "Getting Started");
    expect(gs.indexOf(bq2), "moved up one place").toBe(before - 1);
    await adminMove(adminPage, "Buyer Help", bq2, "down"); // restore the seeded row's position
    await adminToggle(adminPage, "Buyer Help", bq2, "Deactivate");
    gs = await buyerHelpQuestions(browser, "Getting Started");
    expect(gs, "deactivated FAQ is gone from the page").not.toContain(bq2);
    await adminDelete(adminPage, "Buyer Help", bq2);

    // ── Subscription ──
    const sq = `${MARK} Subscription question?`;
    const sq2 = `${MARK} Subscription question, edited?`;
    await adminAdd(adminPage, "Subscription", { question: sq, answer: "Subscription answer." });
    let sub = await subscriptionQuestions(browser, vendor.session);
    expect(sub.qs.at(-1)).toBe(sq);
    await adminEdit(adminPage, "Subscription", sq, sq2);
    sub = await subscriptionQuestions(browser, vendor.session);
    expect(sub.qs).toContain(sq2);
    const sBefore = sub.qs.indexOf(sq2);
    await adminMove(adminPage, "Subscription", sq2, "up");
    sub = await subscriptionQuestions(browser, vendor.session);
    expect(sub.qs.indexOf(sq2)).toBe(sBefore - 1);
    await adminMove(adminPage, "Subscription", sq2, "down");
    await adminToggle(adminPage, "Subscription", sq2, "Deactivate");
    sub = await subscriptionQuestions(browser, vendor.session);
    expect(sub.qs, "the real Subscription FAQ is back as it was").toEqual(subBase.qs);
    await adminDelete(adminPage, "Subscription", sq2);

    // ── Seller Registration, on /seller signed out ──
    const rq = `${MARK} Seller registration question?`;
    const rq2 = `${MARK} Seller registration question, edited?`;
    await adminAdd(adminPage, "Seller Registration", { question: rq, answer: "Seller registration answer." });
    let sl = await sellerLandingQuestions(browser);
    expect(sl.at(-1), "added FAQ shows last on /seller").toBe(rq);
    await adminEdit(adminPage, "Seller Registration", rq, rq2);
    sl = await sellerLandingQuestions(browser);
    expect(sl).toContain(rq2);
    expect(sl).not.toContain(rq);
    const rBefore = sl.indexOf(rq2);
    await adminMove(adminPage, "Seller Registration", rq2, "up");
    sl = await sellerLandingQuestions(browser);
    expect(sl.indexOf(rq2), "moved up one place").toBe(rBefore - 1);
    await adminMove(adminPage, "Seller Registration", rq2, "down");
    await adminToggle(adminPage, "Seller Registration", rq2, "Deactivate");
    sl = await sellerLandingQuestions(browser);
    expect(sl, "the real Seller Registration FAQ is back as it was").toEqual(sellerBase);
    await adminDelete(adminPage, "Seller Registration", rq2);
  } finally {
    // Anything a failed step left behind.
    const { data: left } = await admin.db.rpc("admin_faq_list");
    for (const r of (left ?? []) as { id: string; question: string }[]) {
      if (r.question.startsWith("[P9TEST")) await admin.db.rpc("admin_faq_delete", { p_id: r.id });
    }
    await adminCtx.close();
  }
});
