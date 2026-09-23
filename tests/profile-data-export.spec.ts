import { test, expect, type Page } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
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
