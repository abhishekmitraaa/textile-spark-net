import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { trustSealFromParts } from "@/lib/plan";
import type { Rfq, VendorQuote, QuoteStatus } from "@/lib/quotesData";

// ─────────────────────────────────────────────────────────────
// RFQ ↔ Quotes data access (React Query over Supabase).
//
// Maps DB rows into the existing `Rfq` / `VendorQuote` shapes so the buyer
// My-Quotes UI and its child cards/modals keep working unchanged — only the
// data SOURCE moves from the static mock store to the real tables.
// ─────────────────────────────────────────────────────────────

interface RawRfq {
  id: string; title: string; product_name: string | null; quantity: number | null;
  budget_min: number | null; budget_max: number | null; image: string | null;
  category_id: string | null; buyer_id: string;
  status: "active" | "closed"; created_at: string;
}
interface RawQuote {
  id: string; rfq_id: string; vendor_id: string; currency: string;
  price_per_unit: number | null; price_inr: number | null; moq: number | null;
  lead_time: string | null; sampling_cost: number | null; sample_timeline: string | null;
  fabric: string | null; comment: string | null; status: QuoteStatus; created_at: string;
}
interface RawVendor { id: string; brand_name: string | null; is_verified: boolean; city: string | null; rating_avg: number; reviews_count: number; plan_expires_at: string | null; ad_verified_until: string | null }

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  return `${Math.floor(s / 86400)} days ago`;
}
function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function mapQuote(q: RawQuote, v?: RawVendor): VendorQuote {
  const name = v?.brand_name ?? "Vendor";
  return {
    id: q.id, rfqId: q.rfq_id, vendorId: q.vendor_id, vendorName: name, vendorInitials: initials(name),
    verified: trustSealFromParts(v?.is_verified, v?.plan_expires_at, v?.ad_verified_until), rating: Number(v?.rating_avg ?? 0), ratingCount: fmtK(v?.reviews_count ?? 0),
    location: v?.city ?? "India", responseTime: "—", status: q.status, currency: q.currency,
    pricePerUnit: Number(q.price_per_unit ?? 0), priceINR: Number(q.price_inr ?? q.price_per_unit ?? 0),
    moq: q.moq ?? 0, leadTime: q.lead_time ?? "—", sampling: Number(q.sampling_cost ?? 0),
    sampleTimeline: q.sample_timeline ?? "—", fabric: q.fabric ?? "—", comment: q.comment ?? "",
    submittedAgo: ago(q.created_at), isNew: q.status === "pending",
    attachments: { images: [], videos: [], documents: [] },
  };
}

function mapRfq(r: RawRfq, quotes: RawQuote[]): Rfq {
  const prices = quotes.map((q) => Number(q.price_inr ?? q.price_per_unit ?? 0)).filter((n) => n > 0);
  return {
    id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
    priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: r.image ?? "",
    status: r.status, newCount: quotes.filter((q) => q.status === "pending").length,
    lowest: prices.length ? Math.min(...prices) : 0,
    date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
  };
}

export interface BuyerQuotesData { rfqs: Rfq[]; quotesMap: Record<string, VendorQuote> }

async function fetchBuyerData(buyerId: string): Promise<BuyerQuotesData> {
  const { data: rfqData, error } = await supabase
    .from("rfqs").select("*").eq("buyer_id", buyerId).order("created_at", { ascending: false });
  if (error) throw error;
  const rfqRows = (rfqData ?? []) as RawRfq[];
  const rfqIds = rfqRows.map((r) => r.id);

  let quoteRows: RawQuote[] = [];
  if (rfqIds.length) {
    const { data } = await supabase.from("quotes").select("*").in("rfq_id", rfqIds);
    quoteRows = (data ?? []) as RawQuote[];
  }
  const vendorIds = Array.from(new Set(quoteRows.map((q) => q.vendor_id)));
  const vendorMap = new Map<string, RawVendor>();
  if (vendorIds.length) {
    const { data } = await supabase.from("vendor_profiles").select("id, brand_name, is_verified, city, rating_avg, reviews_count, plan_expires_at, ad_verified_until").in("id", vendorIds);
    for (const v of (data ?? []) as RawVendor[]) vendorMap.set(v.id, v);
  }

  const quotesMap: Record<string, VendorQuote> = {};
  for (const q of quoteRows) quotesMap[q.id] = mapQuote(q, vendorMap.get(q.vendor_id));
  const rfqs = rfqRows.map((r) => mapRfq(r, quoteRows.filter((q) => q.rfq_id === r.id)));
  return { rfqs, quotesMap };
}

export function useBuyerQuotes(buyerId: string | undefined) {
  return useQuery({
    queryKey: ["rfqs", "buyer", buyerId],
    queryFn: () => fetchBuyerData(buyerId as string),
    enabled: Boolean(buyerId),
  });
}

// ── Buyer: create an RFQ ──
export interface NewRfq {
  title: string; productName?: string; quantity?: number | null;
  budgetMin?: number | null; budgetMax?: number | null; description?: string | null; image?: string | null;
}
export async function createRfq(buyerId: string, input: NewRfq): Promise<string> {
  const { data, error } = await supabase
    .from("rfqs")
    .insert({
      buyer_id: buyerId, title: input.title, product_name: input.productName ?? input.title,
      quantity: input.quantity ?? null, budget_min: input.budgetMin ?? null, budget_max: input.budgetMax ?? null,
      description: input.description ?? null, image: input.image ?? null, status: "active",
    })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

// ── Buyer: change a quote's status (shortlist / accept / reject) ──
export async function setQuoteStatusDb(id: string, status: QuoteStatus): Promise<void> {
  const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
  if (error) throw error;
}

// ── Vendor: the open lead pool (active RFQs) ──
export interface LeadRfq {
  id: string; title: string; productName: string; units: number; priceMin: number; priceMax: number;
  image: string; date: string; alreadyQuoted: boolean;
  categoryId: string | null;
  /** True when this RFQ's category matches one of a PAID vendor's product
   *  categories — surfaced as a priority "premium" lead (see Part 3b). */
  matched: boolean;
}
async function fetchOpenRfqs(vendorId: string): Promise<LeadRfq[]> {
  const { data, error } = await supabase
    .from("rfqs").select("*").eq("status", "active").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawRfq[];

  const { data: myQuotes } = await supabase.from("quotes").select("rfq_id").eq("vendor_id", vendorId);
  const quoted = new Set((myQuotes ?? []).map((q) => q.rfq_id));

  // Category-matched premium leads (rule-based, no AI): for a PAID vendor
  // (Basic+, i.e. an active paid plan cached on vendor_profiles), RFQs whose
  // category_id is one of the vendor's own product categories are flagged and
  // sorted first. Free-tier vendors keep the plain unfiltered/unprioritised feed.
  const { data: vp } = await supabase
    .from("vendor_profiles").select("plan_expires_at").eq("id", vendorId).maybeSingle();
  const isPaid = Boolean(vp?.plan_expires_at && new Date(vp.plan_expires_at).getTime() > Date.now());

  let vendorCats = new Set<string>();
  if (isPaid) {
    const { data: prods } = await supabase
      .from("products").select("category_id").eq("vendor_id", vendorId).not("category_id", "is", null);
    vendorCats = new Set(((prods ?? []).map((p) => p.category_id).filter(Boolean)) as string[]);
  }

  const leads: LeadRfq[] = rows.map((r) => ({
    id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
    priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: r.image ?? "",
    date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    alreadyQuoted: quoted.has(r.id),
    categoryId: r.category_id ?? null,
    matched: isPaid && !!r.category_id && vendorCats.has(r.category_id),
  }));

  // Matched (premium) leads first; within each group keep created_at desc.
  return leads.sort((a, b) => Number(b.matched) - Number(a.matched));
}
export function useOpenRfqs(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["rfqs", "open", vendorId],
    queryFn: () => fetchOpenRfqs(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// ── Vendor: submit (or update) a quote on an RFQ ──
export interface NewQuote {
  rfqId: string; pricePerUnit: number; currency?: string; moq?: number | null;
  leadTime?: string | null; samplingCost?: number | null; sampleTimeline?: string | null;
  fabric?: string | null; comment?: string | null;
}
// ── Vendor: my submitted quotes (for the Quotes → "My Quotes" tab) ──
export interface MySubmittedQuote {
  id: string; quoteCode: string; rfqCode: string; rfqTitle: string;
  /** Buyer who posted the RFQ. Used to deep-link chat/call from the quote card. */
  buyerId: string; buyerName: string;
  pricePerUnit: number; moq: string; leadTime: string; submittedDate: string; lastUpdated: string;
  pcs: string; totalQuotes: number;
  status: "in_negotiation" | "accepted" | "awaiting" | "not_selected";
  buyerResponse?: string; buyerResponseDate?: string; image?: string; rankBadge?: string;
}

function mapQuoteStatus(s: QuoteStatus): MySubmittedQuote["status"] {
  if (s === "accepted") return "accepted";
  if (s === "rejected") return "not_selected";
  if (s === "shortlisted") return "in_negotiation";
  return "awaiting"; // pending
}

async function fetchMySubmittedQuotes(vendorId: string): Promise<MySubmittedQuote[]> {
  const { data: quotes, error } = await supabase
    .from("quotes").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (quotes ?? []) as RawQuote[];
  const rfqIds = Array.from(new Set(rows.map((q) => q.rfq_id)));
  const rfqMap = new Map<string, RawRfq>();
  if (rfqIds.length) {
    const { data } = await supabase.from("rfqs").select("*").in("id", rfqIds);
    for (const r of (data ?? []) as RawRfq[]) rfqMap.set(r.id, r);
  }

  // Real buyer names, batched over the distinct buyers behind those RFQs — same
  // shape as fetchConversations in chat.ts. One query, not one per row.
  const buyerIds = Array.from(new Set(Array.from(rfqMap.values()).map((r) => r.buyer_id).filter(Boolean)));
  const buyerNames = new Map<string, string>();
  if (buyerIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", buyerIds);
    for (const pr of data ?? []) if (pr.full_name) buyerNames.set(pr.id, pr.full_name);
  }

  // Competing-quote counts: how many vendors have quoted each of these RFQs.
  // PostgREST has no GROUP BY, so pull just the rfq_id column for the relevant
  // RFQs and tally client-side — still one round trip, not one per row.
  const quoteCounts = new Map<string, number>();
  if (rfqIds.length) {
    const { data } = await supabase.from("quotes").select("rfq_id").in("rfq_id", rfqIds);
    for (const row of (data ?? []) as { rfq_id: string }[]) {
      quoteCounts.set(row.rfq_id, (quoteCounts.get(row.rfq_id) ?? 0) + 1);
    }
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  return rows.map((q) => {
    const rfq = rfqMap.get(q.rfq_id);
    return {
      id: q.id,
      quoteCode: `QT-${q.id.slice(0, 8).toUpperCase()}`,
      rfqCode: `RFQ-${q.rfq_id.slice(0, 8).toUpperCase()}`,
      rfqTitle: rfq?.product_name ?? rfq?.title ?? "Requirement",
      buyerId: rfq?.buyer_id ?? "",
      buyerName: (rfq && buyerNames.get(rfq.buyer_id)) || "Buyer",
      pricePerUnit: Number(q.price_per_unit ?? q.price_inr ?? 0),
      moq: q.moq != null ? `${q.moq} pcs` : "—",
      leadTime: q.lead_time ?? "—",
      submittedDate: fmtDate(q.created_at),
      lastUpdated: fmtDate(q.created_at),
      pcs: rfq?.quantity != null ? `${rfq.quantity} pcs` : "—",
      totalQuotes: quoteCounts.get(q.rfq_id) ?? 0,
      status: mapQuoteStatus(q.status),
      image: rfq?.image ?? undefined,
    };
  });
}

export function useMySubmittedQuotes(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["quotes", "mine", vendorId],
    queryFn: () => fetchMySubmittedQuotes(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export async function submitQuote(vendorId: string, q: NewQuote): Promise<void> {
  const { error } = await supabase.from("quotes").upsert(
    {
      rfq_id: q.rfqId, vendor_id: vendorId, currency: q.currency ?? "₹",
      price_per_unit: q.pricePerUnit, price_inr: q.pricePerUnit, moq: q.moq ?? null,
      lead_time: q.leadTime ?? null, sampling_cost: q.samplingCost ?? null,
      sample_timeline: q.sampleTimeline ?? null, fabric: q.fabric ?? null, comment: q.comment ?? null,
      status: "pending",
    },
    { onConflict: "rfq_id,vendor_id" }
  );
  if (error) throw error;
}
