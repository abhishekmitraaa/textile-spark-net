import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { trustSealFromParts } from "@/lib/plan";
import { ensureConversation } from "@/lib/queries/chat";
import { UNTARGETED, type Rfq, type VendorQuote, type QuoteStatus, type SizeQty } from "@/lib/quotesData";

// SizeQty lives with the other quote types (quotesData is the JSX-free type
// home). Re-exported here because callers already import it from this module.
export type { SizeQty };

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
  // Targeting columns. All null on an open-marketplace RFQ.
  vendor_id: string | null; product_id: string | null;
  sizes_breakdown: unknown; colors: string[] | null;
  customization_requested: boolean | null; customization_notes: string | null;
  customization_images: string[] | null;
}

// Every rfqs read names its columns rather than using select("*"), because the
// table now carries `embedding` — a 1536-element halfvec that serialises to
// ~20KB of JSON per row over the wire, on a payload nothing in the UI reads.
// `search_text` is excluded for the same reason (it is just the other columns
// concatenated). Keep this list and RawRfq in step.
//
// One literal with `as const`, not a concatenation: supabase-js parses the
// select string at the TYPE level to shape the result, and a `string` it cannot
// read statically degrades every one of these queries to GenericStringError[].
const RFQ_COLUMNS =
  "id, title, product_name, quantity, budget_min, budget_max, image, category_id, buyer_id, status, created_at, vendor_id, product_id, sizes_breakdown, colors, customization_requested, customization_notes, customization_images" as const;

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

function mapRfq(r: RawRfq, quotes: RawQuote[], targetVendor?: RawVendor): Rfq {
  const prices = quotes.map((q) => Number(q.price_inr ?? q.price_per_unit ?? 0)).filter((n) => n > 0);
  const base = {
    id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
    priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: r.image ?? "",
    status: r.status, newCount: quotes.filter((q) => q.status === "pending").length,
    lowest: prices.length ? Math.min(...prices) : 0,
    date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
  };

  // Open marketplace: nothing to target, nothing extra captured.
  if (!r.vendor_id) return { ...base, ...UNTARGETED };

  // Targeted: the vendor row is resolved even with zero quotes, so a pending
  // request can still name who it went to.
  const name = targetVendor?.brand_name ?? "Vendor";
  return {
    ...base,
    targetVendorId: r.vendor_id,
    targetVendorName: name,
    targetVendorInitials: initials(name),
    targetVendorVerified: trustSealFromParts(targetVendor?.is_verified, targetVendor?.plan_expires_at, targetVendor?.ad_verified_until),
    targetVendorRating: Number(targetVendor?.rating_avg ?? 0),
    targetVendorLocation: targetVendor?.city ?? "India",
    direct: {
      sentAgo: ago(r.created_at),
      sizes: (r.sizes_breakdown as SizeQty[] | null) ?? [],
      colors: r.colors ?? [],
      customizationRequested: r.customization_requested ?? false,
      customizationNotes: r.customization_notes ?? null,
      customizationImages: r.customization_images ?? [],
    },
  };
}

export interface BuyerQuotesData { rfqs: Rfq[]; quotesMap: Record<string, VendorQuote> }

async function fetchBuyerData(buyerId: string): Promise<BuyerQuotesData> {
  const { data: rfqData, error } = await supabase
    .from("rfqs").select(RFQ_COLUMNS).eq("buyer_id", buyerId).order("created_at", { ascending: false });
  if (error) throw error;
  const rfqRows = (rfqData ?? []) as RawRfq[];
  const rfqIds = rfqRows.map((r) => r.id);

  let quoteRows: RawQuote[] = [];
  if (rfqIds.length) {
    const { data } = await supabase.from("quotes").select("*").in("rfq_id", rfqIds);
    quoteRows = (data ?? []) as RawQuote[];
  }
  // One batched vendor lookup covering BOTH sources: the vendors who quoted,
  // and the target vendor of every targeted request. The second set matters on
  // its own because a targeted request that has not been replied to yet has no
  // quote row to carry its vendor, and the buyer still needs to see who it
  // went to.
  const vendorIds = Array.from(new Set([
    ...quoteRows.map((q) => q.vendor_id),
    ...rfqRows.map((r) => r.vendor_id).filter(Boolean) as string[],
  ]));
  const vendorMap = new Map<string, RawVendor>();
  if (vendorIds.length) {
    const { data } = await supabase.from("vendor_profiles").select("id, brand_name, is_verified, city, rating_avg, reviews_count, plan_expires_at, ad_verified_until").in("id", vendorIds);
    for (const v of (data ?? []) as RawVendor[]) vendorMap.set(v.id, v);
  }

  const quotesMap: Record<string, VendorQuote> = {};
  for (const q of quoteRows) quotesMap[q.id] = mapQuote(q, vendorMap.get(q.vendor_id));
  const rfqs = rfqRows.map((r) => mapRfq(
    r,
    quoteRows.filter((q) => q.rfq_id === r.id),
    r.vendor_id ? vendorMap.get(r.vendor_id) : undefined,
  ));
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
  /** A categories.id. Feeds the `category_match` half of match_vendor_rfqs, so
   *  it must be a real taxonomy row the caller RESOLVED — never a display name,
   *  a slug, or a guess re-derived from free text. Null is the correct value
   *  when no confident resolution exists; a wrong id is worse than none,
   *  because it scores the RFQ against vendors who do not sell the thing. */
  categoryId?: string | null;
}
export async function createRfq(buyerId: string, input: NewRfq): Promise<string> {
  const { data, error } = await supabase
    .from("rfqs")
    .insert({
      buyer_id: buyerId, title: input.title, product_name: input.productName ?? input.title,
      quantity: input.quantity ?? null, budget_min: input.budgetMin ?? null, budget_max: input.budgetMax ?? null,
      description: input.description ?? null, image: input.image ?? null,
      category_id: input.categoryId ?? null, status: "active",
    })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

// ── Buyer: create a TARGETED quote request from a product page ──
// A row with vendor_id + product_id set is a direct request to one vendor. It
// stays a real `rfqs` row, so My Quotes / compare keep working unchanged; the
// tightened rfqs_select policy keeps it out of every other vendor's feed.

export interface NewTargetedRfq {
  vendorId: string;
  productId: string;
  productName: string;
  /** Per-size quantities. Empty when the vendor listed no sizes. */
  sizesBreakdown: SizeQty[];
  /** Used when sizesBreakdown is empty. */
  totalQuantity: number;
  colors: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  customizationRequested: boolean;
  customizationNotes: string | null;
  customizationFiles: File[];
}

/**
 * Reference images for a customization request. Reuses the existing
 * `product-images` bucket: its RLS insert policy is uploader-scoped
 * (`(storage.foldername(name))[1] = auth.uid()::text`), not vendor-scoped, so a
 * buyer may write under their own uid folder. The bucket is public, so the
 * target vendor can read the URLs back. Same call shape as Upload.tsx.
 */
async function uploadCustomizationImages(buyerId: string, batchId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${buyerId}/rfq/${batchId}/${i}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    if (error) throw error;
    urls.push(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

function summarise(input: NewTargetedRfq, total: number): string {
  const parts = [`Quote request for ${input.productName}`, `Quantity: ${total}`];
  if (input.sizesBreakdown.length) {
    parts.push(`Sizes: ${input.sizesBreakdown.map((s) => `${s.size} x ${s.quantity}`).join(", ")}`);
  }
  if (input.colors.length) parts.push(`Colour: ${input.colors.join(", ")}`);
  if (input.budgetMin != null || input.budgetMax != null) {
    const lo = input.budgetMin != null ? `₹${input.budgetMin}` : "";
    const hi = input.budgetMax != null ? `₹${input.budgetMax}` : "";
    parts.push(`Budget: ${lo && hi ? `${lo} - ${hi}` : lo || hi}`);
  }
  if (input.customizationRequested) {
    parts.push(`Customization: ${input.customizationNotes?.trim() || "requested"}`);
  }
  return parts.join("\n");
}

/**
 * Inserts the targeted RFQ and announces it in the buyer↔vendor conversation as
 * a `quote_request` message, so it lands in the buyer's messaging immediately.
 * Returns the new rfq id. Images upload first so the row is written once,
 * complete, rather than inserted and then patched.
 */
export async function createTargetedQuoteRequest(buyerId: string, input: NewTargetedRfq): Promise<string> {
  const total = input.sizesBreakdown.length
    ? input.sizesBreakdown.reduce((n, s) => n + s.quantity, 0)
    : input.totalQuantity;

  let imageUrls: string[] = [];
  if (input.customizationRequested && input.customizationFiles.length) {
    imageUrls = await uploadCustomizationImages(buyerId, crypto.randomUUID(), input.customizationFiles);
  }

  // A targeted request is "quote me THIS listing", so the listing's own category
  // is the request's category by definition — read off the product rather than
  // prop-drilled from the modal, which keeps the caller unchanged and makes the
  // value impossible to get wrong. Nothing is inferred here: if the product has
  // no category_id, neither does the request.
  const { data: prod } = await supabase
    .from("products").select("category_id").eq("id", input.productId).maybeSingle();

  const { data, error } = await supabase
    .from("rfqs")
    .insert({
      buyer_id: buyerId,
      vendor_id: input.vendorId,
      product_id: input.productId,
      category_id: prod?.category_id ?? null,
      title: `Quote request: ${input.productName}`,
      product_name: input.productName,
      // Kept in sync with sizes_breakdown so every existing UI that reads
      // rfq.quantity (lead cards, My Quotes stats) works unmodified.
      quantity: total,
      sizes_breakdown: input.sizesBreakdown.length ? input.sizesBreakdown : null,
      colors: input.colors.length ? input.colors : null,
      budget_min: input.budgetMin,
      budget_max: input.budgetMax,
      customization_requested: input.customizationRequested,
      customization_notes: input.customizationRequested ? input.customizationNotes : null,
      customization_images: imageUrls.length ? imageUrls : null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;

  // Non-fatal: the request itself is saved even if the chat echo fails.
  try {
    const convId = await ensureConversation(buyerId, input.vendorId);
    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId,
        sender_id: buyerId,
        kind: "quote_request",
        rfq_id: data.id,
        body: summarise(input, total),
      });
    }
  } catch {
    /* ignore: the RFQ is the source of truth, the chat echo is a convenience */
  }

  return data.id;
}

// ── Buyer: change a quote's status (shortlist / accept / reject) ──
export async function setQuoteStatusDb(id: string, status: QuoteStatus): Promise<void> {
  const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
  if (error) throw error;
}

// ── Vendor: the open lead pool (active RFQs) ──

/**
 * Cosine similarity above which a lead is badged "Strong match".
 *
 * A placeholder, and labelled one on purpose. Nothing in this repo has yet
 * observed a real RFQ↔catalogue similarity — no embedding has ever been
 * generated (see the note on `matchOf` below) — so this is the usual
 * text-embedding-3-small "clearly on-topic" band rather than a tuned figure.
 * Check it against real scores before trusting it; with 3 RFQs and 7 vendors
 * there is nothing to fit it to.
 */
const STRONG_MATCH_SIMILARITY = 0.45;

export interface LeadRfq {
  id: string; title: string; productName: string; units: number; priceMin: number; priceMax: number;
  image: string; date: string; alreadyQuoted: boolean;
  categoryId: string | null;
  /** True when this RFQ's category is one of a PAID vendor's live product
   *  categories. Still the exact-overlap signal the badge has always meant —
   *  it is now one input to `score` rather than the whole ranking. */
  matched: boolean;
  /** Cosine similarity between the RFQ and the vendor's catalogue centroid.
   *  null for a free vendor (not scored), or when either side has no embedding
   *  yet — which is every row until the embedding pipeline runs. */
  similarity: number | null;
  /** 0.7 * similarity + 0.3 * matched, from match_vendor_rfqs. Sort key. */
  score: number;
  /** Semantic fit strong enough to say so in the UI. Distinct from `matched`:
   *  that one claims a category match specifically, and must stay truthful. */
  strongMatch: boolean;
}
async function fetchOpenRfqs(vendorId: string): Promise<LeadRfq[]> {
  const { data, error } = await supabase
    .from("rfqs").select(RFQ_COLUMNS).eq("status", "active")
    // Open marketplace only. Targeted requests (vendor_id set) belong to the
    // Direct Quote Requests inbox, not the shared lead pool. Every pre-existing
    // RFQ has vendor_id NULL, so this is a no-op for them.
    .is("vendor_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawRfq[];

  const { data: myQuotes } = await supabase.from("quotes").select("rfq_id").eq("vendor_id", vendorId);
  const quoted = new Set((myQuotes ?? []).map((q) => q.rfq_id));

  // The paywall is unchanged and deliberately so: free-tier vendors see the
  // plain unranked pool, paid vendors (Basic+, i.e. an active plan cached on
  // vendor_profiles) get relevance. That gate is the business model — the same
  // one IndiaMART and Alibaba run — and only the computation behind it moved.
  const { data: vp } = await supabase
    .from("vendor_profiles").select("plan_expires_at").eq("id", vendorId).maybeSingle();
  const isPaid = Boolean(vp?.plan_expires_at && new Date(vp.plan_expires_at).getTime() > Date.now());

  // What moved: this used to be a client-side Set intersection of the vendor's
  // product category_ids against rfqs.category_id — one tag against one tag,
  // blind to everything the buyer actually wrote. Ranking now happens in one
  // place server-side (match_vendor_rfqs), the same way match_products owns
  // product ranking, so the weighting is a single visible expression instead of
  // a sort key invented in the browser.
  //
  // Degrades to the old behaviour rather than failing. Until the embedding
  // pipeline has run (it needs OPENAI_API_KEY on generate-embedding and the
  // service_role_key vault secret — neither is set today), every similarity
  // comes back null and score collapses to the category term alone, which is
  // exactly what this code did before. A failed RPC does the same.
  let matchOf = new Map<string, { similarity: number | null; categoryMatch: boolean; score: number }>();
  if (isPaid) {
    const { data: scores, error: scoreErr } = await supabase
      .rpc("match_vendor_rfqs", { p_vendor_id: vendorId, match_count: 200 });
    if (!scoreErr && scores) {
      matchOf = new Map((scores as { rfq_id: string; similarity: number | null; category_match: boolean; score: number }[])
        .map((s) => [s.rfq_id, { similarity: s.similarity, categoryMatch: s.category_match, score: s.score }]));
    }
  }

  const leads: LeadRfq[] = rows.map((r) => {
    const m = matchOf.get(r.id);
    return {
      id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
      priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: r.image ?? "",
      date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
      alreadyQuoted: quoted.has(r.id),
      categoryId: r.category_id ?? null,
      matched: isPaid && (m?.categoryMatch ?? false),
      similarity: isPaid ? (m?.similarity ?? null) : null,
      score: isPaid ? (m?.score ?? 0) : 0,
      strongMatch: isPaid && (m?.similarity ?? 0) >= STRONG_MATCH_SIMILARITY,
    };
  });

  // Best fit first; ties keep the created_at desc the query already applied, so
  // a free vendor (every score 0) sees the untouched chronological pool.
  return leads.sort((a, b) => b.score - a.score);
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
    const { data } = await supabase.from("rfqs").select(RFQ_COLUMNS).in("id", rfqIds);
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

// ── Vendor: Direct Quote Requests inbox (targeted RFQs addressed to me) ──

export interface DirectQuoteRequest {
  id: string;
  buyerId: string;
  buyerName: string;
  productId: string | null;
  productName: string;
  productImage: string;
  quantity: number;
  sizes: SizeQty[];
  colors: string[];
  budgetMin: number;
  budgetMax: number;
  customizationRequested: boolean;
  customizationNotes: string | null;
  customizationImages: string[];
  date: string;
  alreadyQuoted: boolean;
}

async function fetchDirectQuoteRequests(vendorId: string): Promise<DirectQuoteRequest[]> {
  // RLS already restricts targeted rows to their target vendor; the explicit
  // vendor_id filter keeps the query honest rather than relying on the policy.
  const { data, error } = await supabase
    .from("rfqs")
    .select(RFQ_COLUMNS)
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawRfq[];
  if (rows.length === 0) return [];

  const [{ data: myQuotes }, { data: buyers }, { data: images }] = await Promise.all([
    supabase.from("quotes").select("rfq_id").eq("vendor_id", vendorId),
    supabase.from("profiles").select("id, full_name").in("id", [...new Set(rows.map((r) => r.buyer_id))]),
    supabase
      .from("product_images")
      .select("product_id, url, position")
      .in("product_id", [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[]),
  ]);

  const quoted = new Set((myQuotes ?? []).map((q) => q.rfq_id));
  const nameOf = new Map((buyers ?? []).map((b) => [b.id, b.full_name]));
  const coverOf = new Map<string, string>();
  for (const img of [...(images ?? [])].sort((a, b) => a.position - b.position)) {
    if (!coverOf.has(img.product_id)) coverOf.set(img.product_id, img.url);
  }

  return rows.map((r) => ({
    id: r.id,
    buyerId: r.buyer_id,
    buyerName: nameOf.get(r.buyer_id) ?? "Buyer",
    productId: r.product_id ?? null,
    productName: r.product_name ?? r.title,
    productImage: (r.product_id && coverOf.get(r.product_id)) || r.image || "",
    quantity: r.quantity ?? 0,
    sizes: (r.sizes_breakdown as SizeQty[] | null) ?? [],
    colors: r.colors ?? [],
    budgetMin: Number(r.budget_min ?? 0),
    budgetMax: Number(r.budget_max ?? 0),
    customizationRequested: r.customization_requested ?? false,
    customizationNotes: r.customization_notes ?? null,
    customizationImages: r.customization_images ?? [],
    date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    alreadyQuoted: quoted.has(r.id),
  }));
}

export function useDirectQuoteRequests(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["rfqs", "direct", vendorId],
    queryFn: () => fetchDirectQuoteRequests(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

/**
 * Mirrors a submitted quote into the buyer↔vendor chat as a `quote_reply`
 * message, but only for a TARGETED request. Open-marketplace quotes are
 * unchanged: they have no single conversation to land in.
 * Non-fatal by design, exactly like the quote_request echo.
 */
export async function echoQuoteReplyToChat(
  vendorId: string,
  rfqId: string,
  reply: { pricePerUnit: number; moq: number | null; leadTime: string | null; currency?: string },
): Promise<void> {
  try {
    const { data: rfq } = await supabase
      .from("rfqs")
      .select("id, buyer_id, vendor_id, product_name")
      .eq("id", rfqId)
      .maybeSingle();
    if (!rfq?.vendor_id || rfq.vendor_id !== vendorId) return; // not a targeted request

    const { data: quote } = await supabase
      .from("quotes").select("id").eq("rfq_id", rfqId).eq("vendor_id", vendorId).maybeSingle();

    const cur = reply.currency ?? "₹";
    const parts = [
      `Quote for ${rfq.product_name ?? "your request"}`,
      `Price: ${cur}${reply.pricePerUnit} per unit`,
    ];
    if (reply.moq != null) parts.push(`MOQ: ${reply.moq}`);
    if (reply.leadTime) parts.push(`Lead time: ${reply.leadTime}`);

    const convId = await ensureConversation(vendorId, rfq.buyer_id);
    if (!convId) return;
    await supabase.from("messages").insert({
      conversation_id: convId,
      sender_id: vendorId,
      kind: "quote_reply",
      rfq_id: rfqId,
      quote_id: quote?.id ?? null,
      body: parts.join("\n"),
    });
  } catch {
    /* the quote row is the source of truth; the chat echo is a convenience */
  }
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
