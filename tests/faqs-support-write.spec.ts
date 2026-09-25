import { test, expect, type Browser, type Page } from "@playwright/test";
import { hasCredentials, demoPasswordFor, optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Support writes FAQs (Phase 22 of the My Profile brief, 2026-09-24; Phase 9 Q3).
 *
 * Migration 20260924170736 widened admin_faq_add / _update / _delete / _reorder
 * from super_admin to support + super_admin, and Cosora-Admin's roles.ts now
 * shows support the buttons. This drives the real page as a SUPPORT admin:
 *   on Buyer Help, Subscription and Seller Registration, add → edit → move up →
 *   move down → deactivate → delete, each checked in the database,
 * and then a PRODUCT_MODERATOR, which must still be refused: no FAQs in its nav,
 * "Section not available" on /faqs, and 42501 from every admin_faq_* RPC aimed at
 * a real row, which stays exactly as it was.
 *
 * The super_admin path is faqs-admin-editable.spec.ts, and the full role matrix
 * without writing anything is scripts/faq-write-gate-check.mjs.
 *
 * ACCOUNTS: the run-only fixtures rlstest-support and rlstest-productmod
 * (cosora-admin/scripts/seed-test-admins.sql, FIXTURE_PASSWORD; drop them after
 * with drop-test-admins.sql) and demo-admin, which takes the snapshot and cleans
 * up. MUTATING, self-cleaning: rows it adds start with "[P22TEST", and afterEach
 * deletes them and moves any reordered row back, then checks every FAQ matches
 * the snapshot. Needs Cosora-Admin on :5174 (ADMIN_APP_URL overrides) only.
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
const SUPPORT = "rlstest-support@cosora.test";
const PRODUCT_MOD = "rlstest-productmod@cosora.test";
const ADMIN = "demo-admin@cosora.dev";

test.skip(
  !hasCredentials("FIXTURE_PASSWORD", "DEMO_ADMIN_PASSWORD"),
  "set FIXTURE_PASSWORD and DEMO_ADMIN_PASSWORD in .env, and seed the rlstest-* admins",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

type Faq = {
  id: string; surface: string; category_label: string | null; question: string; answer: string;
  position: number; active: boolean; creator_email: string | null;
};

async function signIn(email: string) {
  const password = email === ADMIN ? demoPasswordFor(email) : optionalCredential("FIXTURE_PASSWORD");
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session as Session };
}
async function list(db: SupabaseClient): Promise<Faq[]> {
  const { data, error } = await db.rpc("admin_faq_list");
  if (error) throw new Error(`admin_faq_list: ${error.message}`);
  return data as Faq[];
}
const shape = (rows: Faq[]) =>
  rows.map(({ id, surface, category_label, question, answer, position, active }) => ({ id, surface, category_label, question, answer, position, active }))
    .sort((a, b) => a.id.localeCompare(b.id));

async function adminPage(browser: Browser, session: Session) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  return { ctx, page: await ctx.newPage() };
}

// ── The admin page, the same steps as faqs-admin-editable.spec.ts ──
async function openTab(page: Page, label: string) {
  await page.goto(`${ADMIN_URL}/faqs`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
}
const row = (page: Page, question: string) => page.locator("tr").filter({ hasText: question });
/** Runs a UI action and waits for the admin_faq_* call it makes; the page's own call must return 200. */
async function viaRpc(page: Page, fn: string, action: () => Promise<void>) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/rest/v1/rpc/${fn}`) && r.request().method() === "POST"),
    action(),
  ]);
  expect(res.status(), `${fn}, called by the admin page as support`).toBe(200);
}
async function noRefusal(page: Page) {
  // A refused RPC surfaces as a toast carrying the database's message.
  await expect(page.getByText(/requires the (support or )?super_admin role|permission denied/i)).toHaveCount(0);
}

let snapshot: ReturnType<typeof shape> = [];
let admin: Awaited<ReturnType<typeof signIn>>;

test.beforeAll(async () => {
  admin = await signIn(ADMIN);
  snapshot = shape(await list(admin.db));
});

test.afterEach(async () => {
  // Anything a failed step left behind: delete test rows, then move every real row
  // back to its snapshot position (a swap interrupted halfway leaves one moved).
  for (const r of await list(admin.db)) {
    if (r.question.startsWith("[P22TEST")) await admin.db.rpc("admin_faq_delete", { p_id: r.id });
  }
  const now = new Map((await list(admin.db)).map((r) => [r.id, r]));
  for (const s of snapshot) {
    const cur = now.get(s.id);
    if (cur && cur.position !== s.position) await admin.db.rpc("admin_faq_reorder", { p_id: s.id, p_position: s.position });
    if (cur && cur.active !== s.active) await admin.db.rpc("admin_faq_update", { p_id: s.id, p_active: s.active });
  }
  expect(shape(await list(admin.db)), "every FAQ is exactly as it was before the test").toEqual(snapshot);
});

test("support adds, edits, reorders, deactivates and deletes FAQs on all three surfaces", async ({ browser }) => {
  const support = await signIn(SUPPORT);
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const MARK = `[P22TEST ${Date.now()}]`;
  const { ctx, page } = await adminPage(browser, support.session);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // The page offers support the write controls now, with no read-only banner.
  await page.goto(`${ADMIN_URL}/faqs`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "FAQs" })).toBeVisible();
  await expect(page.getByText("Support and super admin can edit them.")).toBeVisible();
  await expect(page.locator('[data-marker="readonly-banner"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeEnabled();

  const surfaces = [
    { tab: "Buyer Help", surface: "buyer_help", category: "Account Management" },
    { tab: "Subscription", surface: "subscription" },
    { tab: "Seller Registration", surface: "seller_registration" },
  ] as const;

  for (const s of surfaces) {
    const q = `${MARK} ${s.tab} question?`;
    const q2 = `${MARK} ${s.tab} question, edited by support?`;

    // Add
    await openTab(page, s.tab);
    if ("category" in s) await page.getByLabel("Category").fill(s.category);
    await page.getByLabel("Question").fill(q);
    await page.getByLabel("Answer").fill(`${s.tab} answer, written by support.`);
    await viaRpc(page, "admin_faq_add", () => page.getByRole("button", { name: "Add FAQ" }).click());
    await expect(row(page, q)).toHaveCount(1);
    await noRefusal(page);
    let mine = (await list(admin.db)).find((r) => r.question === q);
    expect(mine, `${s.tab}: the row exists`).toBeTruthy();
    expect(mine!.surface).toBe(s.surface);
    expect(mine!.creator_email, `${s.tab}: created_by is the support admin`).toBe(SUPPORT);
    const live = await anon.from("faqs").select("id").eq("id", mine!.id).eq("active", true);
    expect(live.data, `${s.tab}: the live pages can read it (anon, active)`).toHaveLength(1);
    if (s.surface === "buyer_help") await page.screenshot({ path: path.join(SHOTS, "p22-support-faqs-after.png"), fullPage: false });

    // Edit
    await row(page, q).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Question").last().fill(q2);
    await viaRpc(page, "admin_faq_update", () => page.getByRole("button", { name: "Save" }).click());
    await expect(row(page, q2)).toHaveCount(1);
    await noRefusal(page);
    mine = (await list(admin.db)).find((r) => r.id === mine!.id)!;
    expect(mine.question, `${s.tab}: edited`).toBe(q2);

    // Reorder: up swaps with the row above it (a real one), down swaps back.
    const peers = (await list(admin.db))
      .filter((r) => r.surface === s.surface && r.active && (!("category" in s) || r.category_label === s.category))
      .sort((a, b) => a.position - b.position);
    const above = peers[peers.findIndex((r) => r.id === mine!.id) - 1];
    expect(above, `${s.tab}: there is a row above the new one`).toBeTruthy();
    const [myPos, abovePos] = [mine.position, above.position];
    await openTab(page, s.tab);
    await viaRpc(page, "admin_faq_reorder", () => page.getByRole("button", { name: `Move up: ${q2}` }).click());
    await noRefusal(page);
    let now = new Map((await list(admin.db)).map((r) => [r.id, r.position]));
    expect([now.get(mine.id), now.get(above.id)], `${s.tab}: moved up (swapped with "${above.question}")`).toEqual([abovePos, myPos]);
    await expect(page.getByRole("button", { name: `Move down: ${q2}` })).toBeEnabled(); // the list has refetched
    await viaRpc(page, "admin_faq_reorder", () => page.getByRole("button", { name: `Move down: ${q2}` }).click());
    await noRefusal(page);
    now = new Map((await list(admin.db)).map((r) => [r.id, r.position]));
    expect([now.get(mine.id), now.get(above.id)], `${s.tab}: moved back down`).toEqual([myPos, abovePos]);

    // Deactivate: hidden from the live pages, kept in the admin.
    await openTab(page, s.tab);
    await viaRpc(page, "admin_faq_update", () => row(page, q2).getByRole("button", { name: "Deactivate" }).click());
    await expect(row(page, q2).getByRole("button", { name: "Reactivate" })).toBeVisible();
    await noRefusal(page);
    expect((await list(admin.db)).find((r) => r.id === mine!.id)!.active, `${s.tab}: inactive`).toBe(false);
    const hidden = await anon.from("faqs").select("id").eq("id", mine.id);
    expect(hidden.data, `${s.tab}: the live pages no longer read it`).toHaveLength(0);

    // Delete
    await openTab(page, s.tab);
    await row(page, q2).getByRole("button", { name: "Delete" }).click();
    await viaRpc(page, "admin_faq_delete", () => page.getByRole("button", { name: "Delete FAQ" }).click());
    await expect(row(page, q2)).toHaveCount(0);
    await noRefusal(page);
    expect((await list(admin.db)).some((r) => r.id === mine!.id), `${s.tab}: deleted`).toBe(false);
    console.log(`support on ${s.tab}: add, edit, up, down, deactivate, delete — all written`);
  }
  expect(pageErrors, "no uncaught errors on the admin page").toEqual([]);
  await ctx.close();
});

test("a product_moderator is still refused: no FAQs page, and 42501 from every RPC", async ({ browser }) => {
  const mod = await signIn(PRODUCT_MOD);
  const { ctx, page } = await adminPage(browser, mod.session);

  await page.goto(`${ADMIN_URL}/`, { waitUntil: "networkidle" });
  await page.$$eval('aside nav button[aria-expanded="false"]', (bs) => bs.forEach((b) => (b as HTMLButtonElement).click()));
  const nav = (await page.locator("aside nav a").allInnerTexts()).map((t) => t.trim());
  expect(nav.length, "the product_moderator nav rendered").toBeGreaterThan(0);
  expect(nav, "no FAQs entry for product_moderator").not.toContain("FAQs");
  await page.goto(`${ADMIN_URL}/faqs`, { waitUntil: "networkidle" });
  await expect(page.getByText("Section not available for your role")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "p22-productmod-faqs-refused.png"), fullPage: false });

  // At the database, aimed at a real row.
  const target = snapshot.filter((r) => r.surface === "subscription").sort((a, b) => a.position - b.position)[0];
  const calls: [string, Record<string, unknown>][] = [
    ["admin_faq_list", {}],
    ["admin_faq_add", { p_surface: "subscription", p_category_label: "", p_question: "[P22TEST] product_moderator?", p_answer: "Should not exist." }],
    ["admin_faq_update", { p_id: target.id, p_question: "[P22TEST] rewritten by product_moderator?", p_active: false }],
    ["admin_faq_reorder", { p_id: target.id, p_position: target.position + 1 }],
    ["admin_faq_delete", { p_id: target.id }],
  ];
  for (const [fn, args] of calls) {
    const { error } = await mod.db.rpc(fn as never, args as never);
    expect(error?.code, `${fn} as product_moderator`).toBe("42501");
    console.log(`product_moderator ${fn}: ${error?.code} ${error?.message}`);
  }
  const after = shape(await list(admin.db)).find((r) => r.id === target.id);
  expect(after, "the targeted FAQ is untouched").toEqual(target);
  await ctx.close();
});
