import { test, expect, type Browser, type Route } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient, type Session } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FAQ pages read a CDN snapshot, and fall back to the table (Phase 23 of the My
 * Profile brief, 2026-09-24; Phase 9 Q2).
 *
 * `faqs-snapshot` writes faq-snapshots/<surface>.json (Cache-Control max-age=300)
 * after every FAQ write and hourly; useFaqs() reads that file first and the table
 * only if the file can't be used. Three tests:
 *   1. The three FAQ pages (/profile/help and /seller signed out, /subscription as
 *      demo-vendor) render the snapshot's questions, in order, and make NO request
 *      to /rest/v1/faqs. The snapshot must also match the table.
 *   2. Break the snapshot six ways (network error, HTTP 500, invalid JSON, a
 *      future version, another surface's file, a 4.5 s stall past the 3 s timeout):
 *      each time the page reads the table and renders the same questions.
 *   3. An admin edit reaches fresh page loads within max-age, not instantly, and how
 *      long. Storage answers with `x-smart-cdn: true` here: the edge keeps a copy
 *      until the file changes and an overwrite invalidates it, so the delay is that
 *      invalidation spreading (Supabase: up to 60 s), not max-age. The test primes
 *      the CDN, adds an FAQ on Subscription (a vendor-only page, the least public
 *      surface), then loads the page fresh every few seconds until four loads in a
 *      row show it, recording the first load that did and the last that didn't.
 *      Then it deletes the FAQ and waits until no request gets it.
 *      scripts/faq-cdn-propagation.mjs measures the same thing without a visible edit.
 *
 * Nothing here writes analytics: tracking RPCs are answered in the browser.
 * ACCOUNTS: demo-vendor (read-only), demo-admin (test 3 adds one "[P23TEST" FAQ and
 * deletes it; afterEach deletes any left over). Test 3 takes about 2 minutes.
 * Tests 1 and 2 compare the page with the table, so run them at least 5 minutes
 * after the last FAQ edit. Needs the buyer app on :8080.
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
const SHOTS = path.join(REPO_ROOT, "screenshots");
const ADMIN = "demo-admin@cosora.dev";
const VENDOR = "demo-vendor@cosora.dev";
const MAX_AGE_S = 300; // FAQ_SNAPSHOT_MAX_AGE_S in src/lib/queries/faqs.ts
const SNAPSHOT_GLOB = "**/storage/v1/object/public/faq-snapshots/**";
const TABLE_READ = /\/rest\/v1\/faqs\?/;
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;
const snapshotUrl = (surface: Surface) => `${SUPABASE_URL}/storage/v1/object/public/faq-snapshots/${surface}.json`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Surface = "buyer_help" | "seller_registration" | "subscription";
type Row = { id: string; category_label: string | null; question: string };

test.skip(!hasCredentials("DEMO_ADMIN_PASSWORD", "DEMO_VENDOR_PASSWORD"), "set DEMO_ADMIN_PASSWORD and DEMO_VENDOR_PASSWORD in .env");
test.describe.configure({ mode: "serial" });

async function signIn(email: string) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, session: data.session as Session };
}

/** The table's active rows for a surface, read as anyone can. */
async function tableRows(surface: Surface): Promise<Row[]> {
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.from("faqs").select("id, category_label, question")
    .eq("surface", surface).eq("active", true)
    .order("position").order("created_at").order("id");
  if (error) throw new Error(error.message);
  return data as Row[];
}

/** The questions in the order a page shows them: Buyer Help groups by category, the others are flat. */
function displayed(surface: Surface, rows: Row[]): string[] {
  if (surface !== "buyer_help") return rows.map((r) => r.question);
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const label = r.category_label?.trim() || "General";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r.question);
  }
  return [...groups.values()].flat();
}

/** Opens a surface's page in a fresh context and reads what it renders, and what it fetched. */
async function openFaqPage(browser: Browser, surface: Surface, opts: { session?: Session; snapshot?: (r: Route) => Promise<void> } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (opts.session) {
    await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(opts.session)] as const);
  }
  await ctx.route(TRACKING, (r) => r.fulfill({ status: 204 }));
  if (opts.snapshot) await ctx.route(SNAPSHOT_GLOB, opts.snapshot);
  const page = await ctx.newPage();
  const snapshotStatuses: (number | "failed")[] = [];
  const tableStatuses: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/faq-snapshots/")) snapshotStatuses.push(r.status());
    if (TABLE_READ.test(r.url())) tableStatuses.push(r.status());
  });
  page.on("requestfailed", (r) => { if (r.url().includes("/faq-snapshots/")) snapshotStatuses.push("failed"); });

  let questions: string[];
  if (surface === "buyer_help") {
    await page.goto("/profile/help", { waitUntil: "networkidle" });
    await expect(page.getByText(/\d+ questions across \d+ topics/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Frequently Asked Questions/ }).click();
    await expect(page.locator("button[data-state]").first()).toBeVisible();
    questions = await page.locator("button[data-state]").allInnerTexts();
  } else {
    await page.goto(surface === "seller_registration" ? "/seller" : "/subscription", { waitUntil: "networkidle" });
    const block = page.locator(`[data-faq-surface="${surface}"]`);
    await expect(block.locator("button[data-state]").first()).toBeAttached({ timeout: 15_000 });
    questions = await block.locator("button[data-state]").allInnerTexts();
  }
  return { ctx, page, questions: questions.map((q) => q.trim()), snapshotStatuses, tableStatuses };
}

const SURFACES: { surface: Surface; signedIn: boolean }[] = [
  { surface: "buyer_help", signedIn: false },
  { surface: "seller_registration", signedIn: false },
  { surface: "subscription", signedIn: true },
];

let admin: Awaited<ReturnType<typeof signIn>>;
let vendor: Awaited<ReturnType<typeof signIn>>;
test.beforeAll(async () => {
  admin = await signIn(ADMIN);
  vendor = await signIn(VENDOR);
});
test.afterEach(async () => {
  const { data } = await admin.db.rpc("admin_faq_list");
  for (const r of (data ?? []) as { id: string; question: string }[]) {
    if (r.question.startsWith("[P23TEST")) await admin.db.rpc("admin_faq_delete", { p_id: r.id });
  }
});

test("the FAQ pages render the CDN snapshot and never query the table", async ({ browser }) => {
  for (const { surface, signedIn } of SURFACES) {
    const table = await tableRows(surface);
    const doc = await (await fetch(snapshotUrl(surface))).json();
    expect(doc.rows.map((r: Row) => r.id), `${surface}: the CDN snapshot matches the table (re-run 5 min after an FAQ edit)`)
      .toEqual(table.map((r) => r.id));

    const { ctx, page, questions, snapshotStatuses, tableStatuses } = await openFaqPage(browser, surface, { session: signedIn ? vendor.session : undefined });
    expect(questions, `${surface}: the page shows the snapshot's questions, in order`).toEqual(displayed(surface, table));
    expect(snapshotStatuses, `${surface}: the snapshot was fetched`).toContain(200);
    expect(tableStatuses, `${surface}: no request to /rest/v1/faqs`).toEqual([]);
    if (surface === "buyer_help") await page.screenshot({ path: path.join(SHOTS, "p23-help-from-snapshot.png"), fullPage: false });
    console.log(`${surface}: ${questions.length} questions from the snapshot (${snapshotStatuses.join(",")}), table requests: ${tableStatuses.length}`);
    await ctx.close();
  }
});

test("any snapshot failure falls back to the table, and the page renders the same FAQs", async ({ browser }) => {
  test.setTimeout(8 * 60_000); // 18 page loads, six of them through a deliberate 4.5 s stall
  const real = Object.fromEntries(await Promise.all(SURFACES.map(async ({ surface }) => [surface, await (await fetch(snapshotUrl(surface))).text()])));
  const modes: [string, (surface: Surface) => (r: Route) => Promise<void>][] = [
    ["network error", () => (r) => r.abort("failed")],
    ["HTTP 500", () => (r) => r.fulfill({ status: 500, body: "boom" })],
    ["invalid JSON", () => (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{not json" })],
    ["a future version", (s) => (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...JSON.parse(real[s]), version: 2 }) })],
    ["another surface's file", (s) => (r) => r.fulfill({ status: 200, contentType: "application/json", body: real[s === "subscription" ? "seller_registration" : "subscription"] })],
    ["a 4.5 s stall (timeout 3 s)", (s) => async (r) => { await sleep(4_500); await r.fulfill({ status: 200, contentType: "application/json", body: real[s] }).catch(() => {}); }],
  ];
  const results: string[] = [];
  for (const { surface, signedIn } of SURFACES) {
    const expected = displayed(surface, await tableRows(surface));
    for (const [name, make] of modes) {
      const { ctx, page, questions, tableStatuses } = await openFaqPage(browser, surface, { session: signedIn ? vendor.session : undefined, snapshot: make(surface) });
      expect(tableStatuses, `${surface}, ${name}: the page read the table`).toContain(200);
      expect(questions, `${surface}, ${name}: the same questions, in order`).toEqual(expected);
      if (surface === "buyer_help" && name === "network error") await page.screenshot({ path: path.join(SHOTS, "p23-help-fallback.png"), fullPage: false });
      results.push(`${surface} / ${name}: table ${tableStatuses.join(",")}, ${questions.length} questions`);
      await ctx.close();
    }
  }
  console.log(results.join("\n"));
});

test("an admin edit reaches fresh page loads within max-age: not instantly, and how long", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const url = snapshotUrl("subscription");
  const BROWSER_LIKE = { Origin: "http://localhost:8080", "Accept-Encoding": "gzip, deflate, br, zstd", "Cache-Control": "max-age=0" };
  const cdn = async (bust = false) => {
    const res = await fetch(bust ? `${url}?p23=${Date.now()}` : url, { headers: BROWSER_LIKE });
    const doc = await res.json();
    return { status: res.headers.get("cf-cache-status"), smart: res.headers.get("x-smart-cdn"), questions: (doc.rows as Row[]).map((r) => r.question) };
  };
  const timeline: string[] = [];
  const since = (t0: number) => +((Date.now() - t0) / 1000).toFixed(1);

  // 1. Prime: the CDN nodes this machine reaches hold the current version.
  for (let i = 0; i < 6; i++) await cdn();
  const primed = await cdn();
  timeline.push(`primed: cf-cache-status ${primed.status}, x-smart-cdn ${primed.smart}`);

  // 2. The edit, as the admin page makes it.
  const q = `[P23TEST ${Date.now()}] Is this question from the cache check?`;
  const { data: added, error } = await admin.db.rpc("admin_faq_add", { p_surface: "subscription", p_category_label: "", p_question: q, p_answer: "A test row; deleted within minutes." });
  expect(error).toBeNull();
  expect(added).toHaveLength(1);
  const t0 = Date.now();
  timeline.push("t=0: FAQ added through admin_faq_add");

  // 3. The origin file is rebuilt within seconds (a cache-busting query reaches it).
  let origin = await cdn(true);
  while (!origin.questions.includes(q) && Date.now() - t0 < 60_000) { await sleep(500); origin = await cdn(true); }
  expect(origin.questions, "the origin snapshot was rebuilt").toContain(q);
  timeline.push(`t=${since(t0)} s: origin snapshot rebuilt`);

  // 4. Fresh page loads (snapshot path, no table read) until four in a row show it.
  const loads: string[] = [];
  let firstShown = -1;
  let lastOld = -1;
  let inARow = 0;
  while (inARow < 4 && Date.now() - t0 < MAX_AGE_S * 1000) {
    const { ctx, page, questions, tableStatuses } = await openFaqPage(browser, "subscription", { session: vendor.session });
    expect(tableStatuses, "the page used the snapshot, not the table").toEqual([]);
    const shown = questions.includes(q);
    const at = since(t0);
    loads.push(`${at}s:${shown ? "new" : "old"}`);
    if (shown) {
      if (firstShown < 0) firstShown = at;
      if (inARow === 0) await page.locator('[data-faq-surface="subscription"]').screenshot({ path: path.join(SHOTS, "p23-subscription-after-edit.png") });
      inARow++;
    } else {
      lastOld = at;
      inARow = 0;
    }
    await ctx.close();
    await sleep(3_000);
  }
  timeline.push(`page loads after the edit: ${loads.join(" ")}`);
  timeline.push(`first fresh page load showing it: t=${firstShown} s; last one still showing the old list: ${lastOld < 0 ? "none" : `t=${lastOld} s`}`);
  expect(inARow, `four fresh page loads in a row show the edit within max-age (${MAX_AGE_S} s)`).toBe(4);

  // 5. Delete it, and wait until no request gets it any more.
  await admin.db.rpc("admin_faq_delete", { p_id: (added as { id: string }[])[0].id });
  const t1 = Date.now();
  let clean = 0;
  let lastSeen = -1;
  while (clean < 5 && Date.now() - t1 < MAX_AGE_S * 1000) {
    const rounds = await Promise.all([cdn(), cdn(), cdn()]);
    if (rounds.some((r) => r.questions.includes(q))) { clean = 0; lastSeen = since(t1); } else clean++;
    await sleep(2_000);
  }
  timeline.push(`after the delete: last request still serving it at +${lastSeen < 0 ? 0 : lastSeen} s; settled at +${since(t1)} s`);
  expect(clean, `the deleted FAQ left the CDN within max-age (${MAX_AGE_S} s)`).toBe(5);
  console.log(timeline.join("\n"));
});
