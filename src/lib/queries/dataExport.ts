import { supabase } from "@/lib/supabase";
import { fetchMyContactInfo } from "@/lib/queries/myContact";

// ─────────────────────────────────────────────────────────────
// Profile → Data & Export (Phase 3 of the My Profile brief, 2026-09-23).
//
// Both exports run in the browser with the buyer's own session: no service
// role, no edge function, no job queue. A buyer's rows number in the tens today;
// make it async only if one buyer's own row counts ever justify it.
//
// EVERY QUERY FILTERS ON ITS OWNER COLUMN. RLS alone does not mean "mine" here.
// Measured live as demo-buyer on 2026-09-23 (RLS alone vs owner-filtered):
// profiles 20 vs 1; rfqs 3 vs 2, because rfqs_select shows every active open RFQ
// to any signed-in user; reviews 9 vs 2 and product_reviews 11 vs 3 (SELECT true).
// quotes, conversations and messages also admit the vendor side and admins. An
// RLS-only export would have shipped other people's data. See claude.md, "A 'my
// N' count filters on the owner column".
// ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

const PAGE = 1000;    // PostgREST's default max rows per request
const ID_CHUNK = 100; // keeps `in.(…)` filters well inside URL length limits

// Every page, so a long history is never silently cut at 1,000 rows. Callers
// order by a unique key so pages cannot overlap or skip.
async function allPages(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function inChunks(ids: string[], fetch: (chunk: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(...(await fetch(ids.slice(i, i + ID_CHUNK))));
  return out;
}

// `embedding` and `search_text` are left out: a 1,536-number search vector and
// its index text, not something the buyer entered.
const RFQ_COLS =
  "id, buyer_id, title, product_name, category_id, quantity, budget_min, budget_max, description, status, " +
  "vendor_id, product_id, colors, sizes_breakdown, customization_requested, customization_notes, " +
  "image, images, customization_images, created_at";
const QUOTE_COLS =
  "id, rfq_id, vendor_id, currency, price_per_unit, price_inr, moq, lead_time, sampling_cost, " +
  "sample_timeline, fabric, comment, status, created_at";

async function myRfqs(userId: string): Promise<Row[]> {
  return allPages((from, to) =>
    supabase.from("rfqs").select(RFQ_COLS).eq("buyer_id", userId)
      .order("created_at", { ascending: true }).order("id").range(from, to));
}

// Quotes RECEIVED: only those on the buyer's own RFQs. Not "quotes I can see",
// which for anyone who also sells includes the quotes they sent.
async function quotesOn(rfqIds: string[]): Promise<Row[]> {
  return inChunks(rfqIds, (chunk) =>
    allPages((from, to) =>
      supabase.from("quotes").select(QUOTE_COLS).in("rfq_id", chunk)
        .order("created_at", { ascending: true }).order("id").range(from, to)));
}

/** Display names for vendor ids: brand names are public (vprofiles_select is `true`). */
async function brandNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await inChunks([...new Set(ids)], async (chunk) => {
    const { data, error } = await supabase.from("vendor_profiles").select("id, brand_name").in("id", chunk);
    if (error) throw error;
    return (data ?? []) as Row[];
  });
  return new Map(rows.map((r) => [String(r.id), String(r.brand_name ?? "")]));
}

/**
 * Names of the products the buyer can still open. products_select admits only
 * `live` products (or one's own), so a product missing here is no longer listed
 * and gets no link (the same rule as the My Reviews page).
 */
async function productNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await inChunks([...new Set(ids)], async (chunk) => {
    const { data, error } = await supabase.from("products").select("id, name").in("id", chunk);
    if (error) throw error;
    return (data ?? []) as Row[];
  });
  return new Map(rows.map((r) => [String(r.id), String(r.name ?? "")]));
}

/** An absolute link on the site the export was made from, so it opens from the file. */
function siteLink(path: string): string {
  return new URL(path, window.location.origin).href;
}

// ── CSV ──────────────────────────────────────────────────────

// RFC 4180 quoting, plus a guard against spreadsheet formula injection: quote
// comments are written by vendors, and a cell starting with = + - @ would run
// as a formula when the buyer opens the file in Excel or Sheets. Numbers are
// left alone, so a negative figure stays a number.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const RFQ_CSV_HEADER = [
  "rfq_id", "rfq_title", "product", "quantity", "budget_min", "budget_max", "rfq_status", "rfq_created_at",
  "addressed_to", "quote_id", "quote_vendor", "quote_currency", "quote_price_per_unit", "quote_price_inr",
  "quote_moq", "quote_lead_time", "quote_sampling_cost", "quote_sample_timeline", "quote_fabric",
  "quote_comment", "quote_status", "quote_created_at",
];

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

export interface RfqCsvExport { filename: string; csv: string; rfqs: number; quotes: number }

/** One row per quote received; an RFQ with no quotes still gets one row. */
export async function buildRfqHistoryCsv(userId: string): Promise<RfqCsvExport> {
  const rfqs = await myRfqs(userId);
  const quotes = await quotesOn(rfqs.map((r) => String(r.id)));
  const names = await brandNames([
    ...quotes.map((q) => String(q.vendor_id)),
    ...rfqs.filter((r) => r.vendor_id).map((r) => String(r.vendor_id)),
  ]);

  const byRfq = new Map<string, Row[]>();
  for (const q of quotes) {
    const k = String(q.rfq_id);
    if (!byRfq.has(k)) byRfq.set(k, []);
    byRfq.get(k)!.push(q);
  }

  const lines = [RFQ_CSV_HEADER.join(",")];
  for (const r of rfqs) {
    const rfqPart = [
      r.id, r.title, r.product_name, r.quantity, r.budget_min, r.budget_max, r.status, r.created_at,
      r.vendor_id ? names.get(String(r.vendor_id)) || String(r.vendor_id) : "Open marketplace",
    ];
    const qs = byRfq.get(String(r.id)) ?? [];
    const quoteRows = qs.length ? qs : [null];
    for (const q of quoteRows) {
      const quotePart = q
        ? [q.id, names.get(String(q.vendor_id)) || q.vendor_id, q.currency, q.price_per_unit, q.price_inr, q.moq,
           q.lead_time, q.sampling_cost, q.sample_timeline, q.fabric, q.comment, q.status, q.created_at]
        : Array(13).fill(null);
      lines.push([...rfqPart, ...quotePart].map(csvCell).join(","));
    }
  }

  return {
    filename: `cosora-rfq-history-${todayIst()}.csv`,
    // The BOM makes Excel read the file as UTF-8, so non-Latin text survives.
    csv: "﻿" + lines.join("\r\n") + "\r\n",
    rfqs: rfqs.length,
    quotes: quotes.length,
  };
}

// ── JSON ─────────────────────────────────────────────────────

export const CHAT_SCOPE_NOTE =
  "Chats include the other person's messages too: a conversation is shared, so exporting yours means exporting the whole thread you took part in.";

export interface AllDataExport { filename: string; json: string; counts: Record<string, number> }

export async function buildAllDataJson(userId: string): Promise<AllDataExport> {
  // email and phone are not client-selectable on profiles (MPF-3); the export
  // takes them from my_contact_info() and keeps the object's original key order.
  const [{ data: p, error: pErr }, contact, { data: buyerProfile, error: bErr }] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, avatar_url, active_role, onboarded, account_status, created_at")
      .eq("id", userId).maybeSingle(),
    fetchMyContactInfo(),
    supabase.from("buyer_profiles").select("*").eq("id", userId).maybeSingle(),
  ]);
  if (pErr) throw pErr;
  if (bErr) throw bErr;
  const profile = p && {
    id: p.id, full_name: p.full_name, email: contact.email, phone: contact.phone, avatar_url: p.avatar_url,
    active_role: p.active_role, onboarded: p.onboarded, account_status: p.account_status, created_at: p.created_at,
  };

  const rfqs = await myRfqs(userId);
  const quotes = await quotesOn(rfqs.map((r) => String(r.id)));

  const conversations = await allPages((from, to) =>
    supabase.from("conversations")
      .select("id, user_a, user_b, status, last_message, last_message_at, created_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("created_at", { ascending: true }).order("id").range(from, to));
  const messages = await inChunks(conversations.map((c) => String(c.id)), (chunk) =>
    allPages((from, to) =>
      supabase.from("messages")
        .select("id, conversation_id, sender_id, body, kind, rfq_id, quote_id, created_at")
        .in("conversation_id", chunk)
        .order("created_at", { ascending: true }).order("id").range(from, to)));

  const reviews = await allPages((from, to) =>
    supabase.from("reviews").select("*").eq("buyer_id", userId)
      .order("created_at", { ascending: true }).order("id").range(from, to));
  const productReviews = await allPages((from, to) =>
    supabase.from("product_reviews").select("*").eq("buyer_id", userId)
      .order("created_at", { ascending: true }).order("id").range(from, to));

  // Who each conversation is with: a name only. Other people's contact details
  // are not part of this buyer's data.
  const others = conversations.map((c) => String(c.user_a === userId ? c.user_b : c.user_a));
  const names = await brandNames(others);
  const conversationsOut = conversations.map((c) => {
    const other = String(c.user_a === userId ? c.user_b : c.user_a);
    return { ...c, other_party_id: other, other_party_name: names.get(other) || null };
  });

  // ── Added in Phase 19 (MPF-8): vendors contacted, saved, recently viewed, following ──
  // Calls this buyer made. Only the vendor ids are exported, for vendors_contacted.
  const calls = await allPages((from, to) =>
    supabase.from("calls").select("vendor_id").eq("buyer_id", userId)
      .order("created_at", { ascending: true }).order("id").range(from, to));
  const savedItems = await allPages((from, to) =>
    supabase.from("saved_items").select("product_id, created_at").eq("buyer_id", userId)
      .order("created_at", { ascending: true }).order("product_id").range(from, to));
  const savedFolders = await allPages((from, to) =>
    supabase.from("saved_folders").select("id, name, created_at").eq("buyer_id", userId)
      .order("created_at", { ascending: true }).order("id").range(from, to));
  // saved_folder_items has no owner column: it is filtered to this buyer's own folders.
  const folderItems = await inChunks(savedFolders.map((f) => String(f.id)), (chunk) =>
    allPages((from, to) =>
      supabase.from("saved_folder_items").select("folder_id, product_id, created_at").in("folder_id", chunk)
        .order("created_at", { ascending: true }).order("folder_id").order("product_id").range(from, to)));
  const recentlyViewed = await allPages((from, to) =>
    supabase.from("recently_viewed").select("product_id, viewed_at").eq("buyer_id", userId)
      .order("viewed_at", { ascending: false }).order("product_id").range(from, to));
  const follows = await allPages((from, to) =>
    supabase.from("follows").select("vendor_id, created_at").eq("follower_id", userId)
      .order("created_at", { ascending: true }).order("vendor_id").range(from, to));

  // A conversation counterpart is a vendor only if it has a vendor_profiles row,
  // which is exactly what brandNames() returned for them.
  const conversationVendors = others.filter((id) => names.has(id));
  const callVendors = calls.map((c) => String(c.vendor_id));
  const quoteVendors = quotes.map((q) => String(q.vendor_id));
  const followedVendors = follows.map((f) => String(f.vendor_id));
  const moreNames = await brandNames([...callVendors, ...quoteVendors, ...followedVendors]);
  const vendorList = (ids: string[]) =>
    [...new Set(ids)]
      .map((id) => ({ vendor_id: id, brand_name: names.get(id) || moreNames.get(id) || null }))
      .sort((a, b) => (a.brand_name ?? "").localeCompare(b.brand_name ?? "") || a.vendor_id.localeCompare(b.vendor_id));

  // Messaged: a conversation where this buyer sent at least one message, not an empty shell.
  const sentIn = new Set(messages.filter((m) => m.sender_id === userId).map((m) => String(m.conversation_id)));
  const messagedVendors = conversations
    .filter((c) => sentIn.has(String(c.id)))
    .map((c) => String(c.user_a === userId ? c.user_b : c.user_a))
    .filter((id) => names.has(id));

  const products = await productNames(
    [...savedItems, ...folderItems, ...recentlyViewed].map((r) => String(r.product_id)));
  const product = (id: string) => ({
    product_id: id,
    product_name: products.get(id) || null,
    link: products.has(id) ? siteLink(`/product/${id}`) : null,
  });

  const saved = {
    all_saves: savedItems.map((s) => ({ ...product(String(s.product_id)), saved_at: s.created_at })),
    folders: savedFolders.map((f) => ({
      id: f.id,
      name: f.name,
      created_at: f.created_at,
      items: folderItems
        .filter((i) => i.folder_id === f.id)
        .map((i) => ({ ...product(String(i.product_id)), added_at: i.created_at })),
    })),
  };
  const recentlyViewedOut = recentlyViewed.map((r) => ({ ...product(String(r.product_id)), viewed_at: r.viewed_at }));
  const following = follows.map((f) => {
    const id = String(f.vendor_id);
    return {
      vendor_id: id,
      brand_name: moreNames.get(id) || null,
      // brandNames() only returns vendors that still exist (vendor_profiles is world-readable).
      link: moreNames.has(id) ? siteLink(`/vendor/${id}`) : null,
      followed_at: f.created_at,
    };
  });
  const vendorsContacted = vendorList([...conversationVendors, ...callVendors, ...quoteVendors]);
  const vendorsMessaged = vendorList(messagedVendors);

  const counts = {
    rfqs: rfqs.length,
    quotes_received: quotes.length,
    conversations: conversations.length,
    messages: messages.length,
    reviews: reviews.length,
    product_reviews: productReviews.length,
    vendors_contacted: vendorsContacted.length,
    vendors_messaged: vendorsMessaged.length,
    saved_items: savedItems.length,
    saved_folders: savedFolders.length,
    saved_folder_items: folderItems.length,
    recently_viewed: recentlyViewed.length,
    following: following.length,
  };

  const doc = {
    export: {
      generated_at: new Date().toISOString(),
      account_id: userId,
      format_version: 2,
      contents:
        "Your profile, business details, RFQs, the quotes you received on them, your conversations and their messages, " +
        "the reviews you wrote, the vendors you contacted (by chat, call or quote) and those you messaged, " +
        "your saved items and folders, the products you viewed recently, and the vendors you follow.",
      links:
        "Links open on the site this file was exported from. A null link means the product is no longer listed " +
        "or the vendor no longer exists.",
      note: CHAT_SCOPE_NOTE,
      counts,
    },
    profile: profile ?? null,
    buyer_profile: buyerProfile ?? null,
    rfqs,
    quotes_received: quotes,
    conversations: conversationsOut,
    messages,
    reviews,
    product_reviews: productReviews,
    vendors_contacted: vendorsContacted,
    vendors_messaged: vendorsMessaged,
    saved,
    recently_viewed: recentlyViewedOut,
    following,
  };

  return {
    filename: `cosora-data-export-${todayIst()}.json`,
    json: JSON.stringify(doc, null, 2),
    counts,
  };
}

// ── Download ─────────────────────────────────────────────────

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
