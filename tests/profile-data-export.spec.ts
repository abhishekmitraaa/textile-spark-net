import { test, expect, type Browser, type Page } from "@playwright/test";
import { hasCredentials, demoPasswordFor, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Profile → Data & Export: both downloads contain the buyer's rows and nobody else's.
 *
 * The danger this guards is quiet: RLS here is NOT "mine". Signed in as
 * demo-buyer, `rfqs` shows another buyer's active open RFQ, and `reviews` /
 * `product_reviews` / `profiles` show everyone's. An export that leaned on RLS
 * would still "work", and would ship other people's data. So the spec first
 * proves this buyer CAN see foreign rows (otherwise a missing filter would pass),
 * then clicks both real buttons, reads the real downloaded files, and asserts:
 *   - every row's owner field is this buyer (quotes: on this buyer's RFQs;
 *     messages: in this buyer's conversations);
 *   - nothing is missing (counts equal the buyer's own rows);
 *   - no id of a foreign RFQ, review or product review appears anywhere in the file.
 *
 * ACCOUNT: demo-buyer@cosora.dev (2 RFQs, 2 quotes received, 1 conversation,
 * 2 reviews, 3 product reviews on 2026-09-23). Read-only. Requires `npm run dev` on :8080.
 *
 * Phase 19 (MPF-8) sections: vendors_contacted, vendors_messaged, saved,
 * recently_viewed and following.
 *   - demo-buyer: every section equals its owner-filtered rows, and every link
 *     opens the right product or vendor page. demo-buyer has no saves, so the test
 *     creates two saves and a folder through its own session and removes them in
 *     afterEach, which also runs after a timeout; everything else is its existing
 *     data (2 calls to demo-vendor, a
 *     conversation it wrote in, 4 follows, 7 recently viewed, one of them no longer
 *     listed, which must have no link).
 *   - demo-admin: a super admin, so follows_select and calls_select show it
 *     EVERYONE's rows. That is the account where a missing owner filter would
 *     leak, so the export must still hold only its own. Read-only.
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
const BUYER = "demo-buyer@cosora.dev";

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env (see .env.example)");

// Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function ids(q: PromiseLike<{ data: { id: string }[] | null; error: unknown }>): Promise<string[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

async function downloadFrom(page: Page, rowTitle: string): Promise<string> {
  const row = page.locator("div.rounded-xl").filter({ hasText: rowTitle });
  const [dl] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "Export" }).click()]);
  return readFileSync(await dl.path(), "utf8");
}

test("Data & Export: both files hold this buyer's rows and nothing else", async ({ browser }) => {
  const db: SupabaseClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email: BUYER, password: demoPasswordFor(BUYER) });
  if (error) throw new Error(`login failed: ${error.message}`);
  const uid = auth.user.id;

  // What this buyer owns, and what RLS lets it SEE that it does not own.
  const ownRfqs = await ids(db.from("rfqs").select("id").eq("buyer_id", uid));
  const ownQuotes = ownRfqs.length ? await ids(db.from("quotes").select("id").in("rfq_id", ownRfqs)) : [];
  const ownConvs = await ids(db.from("conversations").select("id").or(`user_a.eq.${uid},user_b.eq.${uid}`));
  const ownMsgs = ownConvs.length ? await ids(db.from("messages").select("id").in("conversation_id", ownConvs)) : [];
  const ownReviews = await ids(db.from("reviews").select("id").eq("buyer_id", uid));
  const ownProductReviews = await ids(db.from("product_reviews").select("id").eq("buyer_id", uid));
  const foreignRfqs = await ids(db.from("rfqs").select("id").neq("buyer_id", uid));
  const foreignReviews = await ids(db.from("reviews").select("id").neq("buyer_id", uid));
  const foreignProductReviews = await ids(db.from("product_reviews").select("id").neq("buyer_id", uid));

  expect(ownRfqs.length, "the buyer needs RFQs for this to mean anything").toBeGreaterThan(0);
  expect(ownQuotes.length, "…and quotes on them").toBeGreaterThan(0);
  expect(foreignRfqs.length + foreignReviews.length + foreignProductReviews.length,
    "RLS must expose some foreign rows to this buyer, or a missing owner filter could not be caught").toBeGreaterThan(0);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(auth.session)] as const);
  const page = await ctx.newPage();
  await page.goto("/profile/data-export", { waitUntil: "networkidle" });
  await expect(page.getByText("Chats include the other person's messages too")).toBeVisible();

  // ── RFQ history CSV ──
  const csv = await downloadFrom(page, "Export RFQ History");
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  const [header, ...body] = rows.filter((r) => r.length > 1);
  expect(header[0]).toBe("rfq_id");
  const col = (name: string) => header.indexOf(name);
  for (const r of body) {
    expect(ownRfqs, `CSV row for an RFQ this buyer does not own: ${r[col("rfq_id")]}`).toContain(r[col("rfq_id")]);
    if (r[col("quote_id")]) expect(ownQuotes, "CSV quote not on this buyer's RFQs").toContain(r[col("quote_id")]);
  }
  expect(new Set(body.map((r) => r[col("rfq_id")])).size, "every RFQ is in the CSV").toBe(ownRfqs.length);
  expect(new Set(body.map((r) => r[col("quote_id")]).filter(Boolean)).size, "every quote is in the CSV").toBe(ownQuotes.length);
  for (const f of foreignRfqs) expect(csv, `foreign RFQ ${f} leaked into the CSV`).not.toContain(f);
  console.log(`CSV: ${body.length} rows, ${ownRfqs.length} RFQs, ${ownQuotes.length} quotes`);

  // ── All data JSON ──
  const text = await downloadFrom(page, "Export All Data");
  const doc = JSON.parse(text);
  expect(doc.profile.id).toBe(uid);
  if (doc.buyer_profile) expect(doc.buyer_profile.id).toBe(uid);
  expect(doc.export.note).toContain("other person's messages");
  for (const r of doc.rfqs) expect(r.buyer_id, "foreign RFQ in JSON").toBe(uid);
  for (const q of doc.quotes_received) expect(ownRfqs, "quote not on this buyer's RFQs").toContain(q.rfq_id);
  for (const c of doc.conversations) expect([c.user_a, c.user_b], "conversation without this buyer").toContain(uid);
  const convIds = new Set(doc.conversations.map((c: { id: string }) => c.id));
  for (const m of doc.messages) expect(convIds.has(m.conversation_id), "message outside this buyer's conversations").toBe(true);
  for (const r of doc.reviews) expect(r.buyer_id, "foreign review in JSON").toBe(uid);
  for (const r of doc.product_reviews) expect(r.buyer_id, "foreign product review in JSON").toBe(uid);

  expect(doc.rfqs.length).toBe(ownRfqs.length);
  expect(doc.quotes_received.length).toBe(ownQuotes.length);
  expect(doc.conversations.length).toBe(ownConvs.length);
  expect(doc.messages.length).toBe(ownMsgs.length);
  expect(doc.reviews.length).toBe(ownReviews.length);
  expect(doc.product_reviews.length).toBe(ownProductReviews.length);
  for (const f of [...foreignRfqs, ...foreignReviews, ...foreignProductReviews]) {
    expect(text, `foreign row ${f} leaked into the JSON`).not.toContain(f);
  }
  expect(text, "the search vector is not buyer data").not.toContain('"embedding"');
  console.log(`JSON counts: ${JSON.stringify(doc.export.counts)}`);

  await page.screenshot({ path: path.join(SHOTS, "profile-data-export.png") });
  await ctx.close();
});

// ── Phase 19 (MPF-8) ─────────────────────────────────────────

interface VendorRef { vendor_id: string; brand_name: string | null }
interface ProductRef { product_id: string; product_name: string | null; link: string | null }

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** What the new sections must hold for `uid`, read with owner filters, as that account. */
async function expectedSections(db: SupabaseClient, uid: string) {
  const ownRfqs = await ids(db.from("rfqs").select("id").eq("buyer_id", uid));
  const quoteVendors = ownRfqs.length
    ? (await rows<{ vendor_id: string }>(db.from("quotes").select("vendor_id").in("rfq_id", ownRfqs))).map((q) => q.vendor_id) : [];
  const convs = await rows<{ id: string; user_a: string; user_b: string }>(
    db.from("conversations").select("id, user_a, user_b").or(`user_a.eq.${uid},user_b.eq.${uid}`));
  const other = (c: { user_a: string; user_b: string }) => (c.user_a === uid ? c.user_b : c.user_a);
  const sent = convs.length
    ? new Set((await rows<{ conversation_id: string }>(db.from("messages").select("conversation_id")
        .in("conversation_id", convs.map((c) => c.id)).eq("sender_id", uid))).map((m) => m.conversation_id))
    : new Set<string>();
  const callVendors = (await rows<{ vendor_id: string }>(db.from("calls").select("vendor_id").eq("buyer_id", uid))).map((c) => c.vendor_id);
  const follows = await rows<{ vendor_id: string }>(db.from("follows").select("vendor_id").eq("follower_id", uid));
  const vendorIds = [...new Set([...convs.map(other), ...callVendors, ...quoteVendors, ...follows.map((f) => f.vendor_id)])];
  const brands = new Map((vendorIds.length
    ? await rows<{ id: string; brand_name: string | null }>(db.from("vendor_profiles").select("id, brand_name").in("id", vendorIds))
    : []).map((v) => [v.id, v.brand_name]));
  const isVendor = (id: string) => brands.has(id);
  const savedItems = await rows<{ product_id: string }>(db.from("saved_items").select("product_id").eq("buyer_id", uid));
  const folders = await rows<{ id: string; name: string }>(db.from("saved_folders").select("id, name").eq("buyer_id", uid));
  const folderItems = folders.length
    ? await rows<{ folder_id: string; product_id: string }>(db.from("saved_folder_items").select("folder_id, product_id").in("folder_id", folders.map((f) => f.id)))
    : [];
  const recent = await rows<{ product_id: string }>(db.from("recently_viewed").select("product_id").eq("buyer_id", uid));
  const productIds = [...new Set([...savedItems, ...folderItems, ...recent].map((r) => r.product_id))];
  const listed = new Map((productIds.length
    ? await rows<{ id: string; name: string }>(db.from("products").select("id, name").in("id", productIds))
    : []).map((p) => [p.id, p.name]));
  return {
    contacted: new Set([...convs.map(other).filter(isVendor), ...callVendors, ...quoteVendors]),
    messaged: new Set(convs.filter((c) => sent.has(c.id)).map(other).filter(isVendor)),
    callVendors: new Set(callVendors),
    brands,
    following: new Set(follows.map((f) => f.vendor_id)),
    savedItems: new Set(savedItems.map((s) => s.product_id)),
    folders,
    folderItems,
    recent: new Set(recent.map((r) => r.product_id)),
    listed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the downloaded file, checked field by field below
type ExportDoc = any;

async function exportAs(browser: Browser, session: unknown): Promise<{ doc: ExportDoc; page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  const page = await ctx.newPage();
  await page.goto("/profile/data-export", { waitUntil: "networkidle" });
  const text = await downloadFrom(page, "Export All Data");
  return { doc: JSON.parse(text), page, close: () => ctx.close() };
}

const idsOf = (list: VendorRef[]) => new Set(list.map((v) => v.vendor_id));

// Every call that records a visit: engagement events, ad impressions and clicks,
// and the view/enquiry counters (src/lib/queries/engagement.ts, ads.ts, products.ts).
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;

// The saves the Phase 19 test creates are removed in afterEach, which Playwright
// still runs when the test times out (a `finally` inside the test does not finish).
let removeTestSaves: (() => Promise<void>) | null = null;
test.afterEach(async () => {
  const remove = removeTestSaves;
  removeTestSaves = null;
  if (remove) await remove();
});

test("Data & Export: the Phase 19 sections hold this buyer's rows, with links that open the right page", async ({ browser }) => {
  test.setTimeout(240_000); // it opens every product and vendor link in the file
  const db: SupabaseClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email: BUYER, password: demoPasswordFor(BUYER) });
  if (error) throw new Error(`login failed: ${error.message}`);
  const uid = auth.user.id;

  // demo-buyer has no saves: two live products saved, one of them also in a folder.
  const live = await rows<{ id: string; name: string }>(db.from("products").select("id, name").eq("status", "live").order("id").limit(2));
  expect(live.length).toBe(2);
  const before = await rows<{ product_id: string }>(db.from("saved_items").select("product_id").eq("buyer_id", uid));
  expect(before.length, "this test adds and removes its own saves; start from none").toBe(0);
  const folderId = randomUUID();
  const created = { items: [] as string[], folder: false };
  removeTestSaves = async () => {
    const check = (r: { error: unknown }) => { if (r.error) throw r.error; };
    check(await db.from("saved_folder_items").delete().eq("folder_id", folderId));
    if (created.folder) check(await db.from("saved_folders").delete().eq("id", folderId));
    if (created.items.length) check(await db.from("saved_items").delete().eq("buyer_id", uid).in("product_id", created.items));
    const left = await rows<{ product_id: string }>(db.from("saved_items").select("product_id").eq("buyer_id", uid));
    const leftFolders = await rows<{ id: string }>(db.from("saved_folders").select("id").eq("buyer_id", uid));
    expect(left.length + leftFolders.length, "the test's saves are removed").toBe(0);
  };
  for (const p of live) {
    const { error: e } = await db.from("saved_items").insert({ buyer_id: uid, product_id: p.id });
    if (e) throw e;
    created.items.push(p.id);
  }
  const { error: fe } = await db.from("saved_folders").insert({ id: folderId, buyer_id: uid, name: "[P19 test] Export folder" });
  if (fe) throw fe;
  created.folder = true;
  const { error: fie } = await db.from("saved_folder_items").insert({ folder_id: folderId, product_id: live[0].id });
  if (fie) throw fie;

  const want = await expectedSections(db, uid);
  expect(want.callVendors.size, "the buyer needs a called vendor").toBeGreaterThan(0);
  expect(want.messaged.size, "…and a vendor it messaged").toBeGreaterThan(0);
  expect(want.following.size, "…and a followed vendor").toBeGreaterThan(0);
  expect(want.recent.size, "…and recently viewed products").toBeGreaterThan(0);

  const { doc, page, close } = await exportAs(browser, auth.session);
  try {
    const origin = new URL(page.url()).origin;

    // Vendors contacted (chat, call or quote) and messaged.
    expect(idsOf(doc.vendors_contacted)).toEqual(want.contacted);
    for (const id of want.callVendors) expect(idsOf(doc.vendors_contacted).has(id), `called vendor ${id}`).toBe(true);
    expect(idsOf(doc.vendors_messaged)).toEqual(want.messaged);
    for (const v of doc.vendors_messaged as VendorRef[]) expect(idsOf(doc.vendors_contacted).has(v.vendor_id), "messaged ⊆ contacted").toBe(true);
    for (const v of [...doc.vendors_contacted, ...doc.vendors_messaged] as VendorRef[]) {
      expect(v.brand_name, `brand of ${v.vendor_id}`).toBe(want.brands.get(v.vendor_id) || null);
      expect(Object.keys(v).sort()).toEqual(["brand_name", "vendor_id"]);
    }

    // Saved: all saves, and folders with their items.
    expect(new Set(doc.saved.all_saves.map((s: ProductRef) => s.product_id))).toEqual(want.savedItems);
    expect(doc.saved.folders.map((f: { id: string }) => f.id).sort()).toEqual(want.folders.map((f) => f.id).sort());
    const folder = doc.saved.folders.find((f: { id: string }) => f.id === folderId);
    expect(folder.name).toBe("[P19 test] Export folder");
    expect(folder.items.map((i: ProductRef) => i.product_id)).toEqual([live[0].id]);

    // Recently viewed and following.
    expect(new Set(doc.recently_viewed.map((r: ProductRef) => r.product_id))).toEqual(want.recent);
    expect(idsOf(doc.following)).toEqual(want.following);

    // Counts and the header.
    expect(doc.export.format_version).toBe(2);
    expect(doc.export.counts).toMatchObject({
      vendors_contacted: want.contacted.size, vendors_messaged: want.messaged.size,
      saved_items: want.savedItems.size, saved_folders: want.folders.length, saved_folder_items: want.folderItems.length,
      recently_viewed: want.recent.size, following: want.following.size,
    });
    expect(doc.export.contents).toContain("the vendors you follow");

    // Links: a live product or an existing vendor gets its page; anything else gets null.
    const productRefs: ProductRef[] = [...doc.saved.all_saves, ...doc.saved.folders.flatMap((f: { items: ProductRef[] }) => f.items), ...doc.recently_viewed];
    for (const p of productRefs) {
      const name = want.listed.get(p.product_id);
      expect(p.product_name, `name of ${p.product_id}`).toBe(name ?? null);
      expect(p.link, `link of ${p.product_id}`).toBe(name === undefined ? null : `${origin}/product/${p.product_id}`);
    }
    expect(productRefs.some((p) => p.link === null), "the unlisted recently-viewed product has no link").toBe(true);
    for (const f of doc.following as (VendorRef & { link: string | null })[]) {
      expect(f.brand_name).toBe(want.brands.get(f.vendor_id) || null);
      expect(f.link).toBe(want.brands.has(f.vendor_id) ? `${origin}/vendor/${f.vendor_id}` : null);
    }

    // Every link opens the right page. Opening them must not count as a visit, so
    // this is a signed-out context (no recently_viewed write) and every tracking
    // call is answered here: no view event, impression or counter reaches production.
    const linkCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    let tracked = 0;
    await linkCtx.route(TRACKING, (route) => { tracked++; return route.fulfill({ status: 204 }); });
    const linkPage = await linkCtx.newPage();
    const opened: string[] = [];
    try {
      for (const p of productRefs.filter((r) => r.link)) {
        if (opened.includes(p.link!)) continue;
        opened.push(p.link!);
        await linkPage.goto(p.link!, { waitUntil: "networkidle" });
        await expect(linkPage.getByText(p.product_name!, { exact: true }).first(), `product page for ${p.link}`).toBeVisible();
      }
      for (const f of (doc.following as { link: string | null; brand_name: string | null }[]).filter((r) => r.link)) {
        await linkPage.goto(f.link!, { waitUntil: "networkidle" });
        await expect(linkPage.getByText(f.brand_name!, { exact: true }).first(), `vendor page for ${f.link}`).toBeVisible();
      }
    } finally {
      await linkCtx.close();
    }
    console.log(`Phase 19 sections: ${JSON.stringify(doc.export.counts)}; ${opened.length} product links and ${doc.following.length} vendor links opened; ${tracked} tracking calls answered in the browser`);
  } finally {
    await close();
  }
});

test("Data & Export: an admin, whose RLS shows everyone's follows and calls, still exports only its own", async ({ browser }) => {
  test.skip(!hasCredentials("DEMO_ADMIN_PASSWORD"), "set DEMO_ADMIN_PASSWORD in .env");
  const { email, password } = demoAccount("admin");
  const db: SupabaseClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed: ${error.message}`);
  const uid = auth.user.id;

  // What RLS alone would hand this account: other people's follows and calls.
  const foreignFollows = await rows<{ follower_id: string; vendor_id: string }>(db.from("follows").select("follower_id, vendor_id").neq("follower_id", uid));
  const foreignCalls = await rows<{ vendor_id: string }>(db.from("calls").select("vendor_id").neq("buyer_id", uid));
  expect(foreignFollows.length, "RLS must show this admin foreign follows, or a missing filter could not be caught").toBeGreaterThan(0);
  expect(foreignCalls.length, "…and foreign calls").toBeGreaterThan(0);

  const want = await expectedSections(db, uid);
  const { doc, close } = await exportAs(browser, auth.session);
  try {
    expect(idsOf(doc.following), "following holds only the admin's own follows").toEqual(want.following);
    expect(idsOf(doc.vendors_contacted), "vendors_contacted holds only the admin's own contacts").toEqual(want.contacted);
    for (const c of foreignCalls) {
      if (!want.contacted.has(c.vendor_id)) expect(idsOf(doc.vendors_contacted).has(c.vendor_id), `foreign call's vendor ${c.vendor_id}`).toBe(false);
    }
    expect(new Set(doc.recently_viewed.map((r: ProductRef) => r.product_id))).toEqual(want.recent);
    expect(new Set(doc.saved.all_saves.map((s: ProductRef) => s.product_id))).toEqual(want.savedItems);
    console.log(`admin export: following ${doc.following.length} (RLS shows ${foreignFollows.length} foreign), vendors_contacted ${doc.vendors_contacted.length} (RLS shows ${foreignCalls.length} foreign calls)`);
  } finally {
    await close();
  }
});
