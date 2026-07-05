import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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
  status: "active" | "closed"; created_at: string;
}
interface RawQuote {
  id: string; rfq_id: string; vendor_id: string; currency: string;
  price_per_unit: number | null; price_inr: number | null; moq: number | null;
  lead_time: string | null; sampling_cost: number | null; sample_timeline: string | null;
  fabric: string | null; comment: string | null; status: QuoteStatus; created_at: string;
}
interface RawVendor { id: string; brand_name: string | null; is_verified: boolean; city: string | null; rating_avg: number; reviews_count: number }

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
    verified: v?.is_verified ?? false, rating: Number(v?.rating_avg ?? 0), ratingCount: fmtK(v?.reviews_count ?? 0),
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
    const { data } = await supabase.from("vendor_profiles").select("id, brand_name, is_verified, city, rating_avg, reviews_count").in("id", vendorIds);
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
}
async function fetchOpenRfqs(vendorId: string): Promise<LeadRfq[]> {
  const { data, error } = await supabase
    .from("rfqs").select("*").eq("status", "active").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawRfq[];

  const { data: myQuotes } = await supabase.from("quotes").select("rfq_id").eq("vendor_id", vendorId);
  const quoted = new Set((myQuotes ?? []).map((q) => q.rfq_id));

  return rows.map((r) => ({
    id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
    priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: r.image ?? "",
    date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    alreadyQuoted: quoted.has(r.id),
  }));
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
  id: string; quoteCode: string; rfqCode: string; rfqTitle: string; buyerName: string;
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
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  return rows.map((q) => {
    const rfq = rfqMap.get(q.rfq_id);
    return {
      id: q.id,
      quoteCode: `QT-${q.id.slice(0, 8).toUpperCase()}`,
      rfqCode: `RFQ-${q.rfq_id.slice(0, 8).toUpperCase()}`,
      rfqTitle: rfq?.product_name ?? rfq?.title ?? "Requirement",
      buyerName: "Buyer",
      pricePerUnit: Number(q.price_per_unit ?? q.price_inr ?? 0),
      moq: q.moq != null ? `${q.moq} pcs` : "—",
      leadTime: q.lead_time ?? "—",
      submittedDate: fmtDate(q.created_at),
      lastUpdated: fmtDate(q.created_at),
      pcs: rfq?.quantity != null ? `${rfq.quantity} pcs` : "—",
      totalQuotes: 0,
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
