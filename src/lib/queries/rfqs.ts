import { useQuery } from "@tanstack/react-query";
import { attributeDetails, type Attributes } from "@/lib/formAttributes";
import { supabase } from "@/lib/supabase";
import { trustSealFromParts } from "@/lib/plan";
import { shrinkImage } from "@/lib/shrinkImage";
import { ownStorageUrl } from "@/lib/storageUrl";
import { ensureConversation } from "@/lib/queries/chat";
import { UNTARGETED, type Rfq, type VendorQuote, type QuoteStatus, type QuoteTerms, type SizeQty } from "@/lib/quotesData";

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
  // Set when Cosora removed the RFQ (RFQ/leads R3); the buyer reads both.
  removed_at: string | null; removed_reason: string | null;
  // The buyer's category answers (Ranking F1).
  attributes: Record<string, unknown> | null;
  // When an open requirement stops taking quotes (7 days, extendable; 2026-10-19). Null on a direct request.
  expires_at: string | null;
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
  "id, title, product_name, quantity, budget_min, budget_max, image, category_id, buyer_id, status, created_at, vendor_id, product_id, sizes_breakdown, colors, customization_requested, customization_notes, customization_images, removed_at, removed_reason, attributes, expires_at" as const;

// The vendor's lead pool also reads how a requirement is marked overseas (subscriptions P7):
// RFQ_COLUMNS plus the three columns the database stamps. Only this read needs them, so a
// buyer's pages don't depend on them. Keep it in step with RFQ_COLUMNS.
const OPEN_LEAD_COLUMNS =
  "id, title, product_name, quantity, budget_min, budget_max, image, category_id, buyer_id, status, created_at, vendor_id, product_id, sizes_breakdown, colors, customization_requested, customization_notes, customization_images, removed_at, removed_reason, attributes, expires_at, overseas, buyer_country_code, overseas_vip_until, images" as const;
interface RawLeadRfq extends RawRfq {
  overseas: boolean; buyer_country_code: string | null; overseas_vip_until: string | null;
  images: string[] | null;
}

interface RawQuote {
  id: string; rfq_id: string; vendor_id: string; currency: string;
  price_per_unit: number | null; price_inr: number | null; moq: number | null;
  lead_time: string | null; sampling_cost: number | null; sample_timeline: string | null;
  fabric: string | null; comment: string | null; status: QuoteStatus; created_at: string;
  /** When the seller last revised the terms (set by the database); null until then. */
  updated_at?: string | null;
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
    terms: {
      currency: q.currency, price_per_unit: q.price_per_unit, moq: q.moq, lead_time: q.lead_time,
      sampling_cost: q.sampling_cost, sample_timeline: q.sample_timeline,
    },
  };
}

function mapRfq(r: RawRfq, quotes: RawQuote[], targetVendor?: RawVendor, productCover?: string): Rfq {
  const prices = quotes.map((q) => Number(q.price_inr ?? q.price_per_unit ?? 0)).filter((n) => n > 0);
  const base = {
    id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
    priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0),
    // The buyer's own picture; for a request about a listing, the listing's; then a customization
    // reference. "" shows RfqThumb's placeholder.
    image: ownStorageUrl(r.image) || productCover || ownStorageUrl(r.customization_images?.[0]) || "",
    status: r.status, removedReason: r.removed_at ? (r.removed_reason ?? "") : null,
    expiresAt: r.expires_at ?? null,
    newCount: quotes.filter((q) => q.status === "pending").length,
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
      customizationImages: (r.customization_images ?? []).filter((u) => ownStorageUrl(u)),
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

  // The cover of each listing a direct request is about: the request itself has no picture of its own
  // unless the buyer attached one.
  const coverOf = new Map<string, string>();
  const productIds = [...new Set(rfqRows.filter((r) => !ownStorageUrl(r.image) && r.product_id).map((r) => r.product_id as string))];
  if (productIds.length) {
    const { data } = await supabase.from("product_images").select("product_id, url, position").in("product_id", productIds);
    for (const img of [...(data ?? [])].sort((a, b) => a.position - b.position)) {
      if (!coverOf.has(img.product_id)) coverOf.set(img.product_id, img.url);
    }
  }

  const quotesMap: Record<string, VendorQuote> = {};
  for (const q of quoteRows) quotesMap[q.id] = mapQuote(q, vendorMap.get(q.vendor_id));
  const rfqs = rfqRows.map((r) => mapRfq(
    r,
    quoteRows.filter((q) => q.rfq_id === r.id),
    r.vendor_id ? vendorMap.get(r.vendor_id) : undefined,
    r.product_id ? coverOf.get(r.product_id) : undefined,
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
  budgetMin?: number | null; budgetMax?: number | null; description?: string | null;
  /** The requirement's pictures, already uploaded (uploadRfqImages). The first is its cover. */
  images?: string[];
  /** A categories.id. Feeds the `category_match` half of match_vendor_rfqs, so
   *  it must be a real taxonomy row the caller RESOLVED — never a display name,
   *  a slug, or a guess re-derived from free text. Null is the correct value
   *  when no confident resolution exists; a wrong id is worse than none,
   *  because it scores the RFQ against vendors who do not sell the thing. */
  categoryId?: string | null;
  /** The form's category answers (Ranking F1), from requirementAttributes(). */
  attributes?: Attributes;
}
// An open requirement (Post Your Requirement, Quick Quote) goes to Cosora's review first (2026-10-17, Mitra:
// "RFQs should go through the admin panel for approval"): it is an rfq_submissions row until an admin approves it,
// which copies it into rfqs, where sellers see it (migration 20261017140000). Returns the submission's id.
// The database refuses an open requirement written straight to rfqs.
export async function createRfq(buyerId: string, input: NewRfq): Promise<string> {
  const { data, error } = await supabase
    .from("rfq_submissions")
    .insert({
      buyer_id: buyerId, title: input.title, product_name: input.productName ?? input.title,
      quantity: input.quantity ?? null, budget_min: input.budgetMin ?? null, budget_max: input.budgetMax ?? null,
      description: input.description ?? null,
      // `image` is the cover every list shows; `images` holds them all (2026-10-14: the pictures a
      // buyer added were never uploaded, so every requirement showed a broken image).
      image: input.images?.[0] ?? null, images: input.images?.length ? input.images : null,
      category_id: input.categoryId ?? null,
      attributes: input.attributes ?? {},
    })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

/** A buyer's requirement still with Cosora's review, or not approved (an approved one is an rfqs row). */
export interface RfqSubmission {
  id: string;
  title: string;
  image: string | null;
  quantity: number | null;
  state: "pending" | "rejected";
  /** Why it wasn't approved: the reason's message, then the reviewer's note. */
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

async function fetchMySubmissions(buyerId: string): Promise<RfqSubmission[]> {
  const { data, error } = await supabase
    .from("rfq_submissions")
    .select("id, title, image, quantity, state, buyer_message, review_note, created_at, reviewed_at")
    .eq("buyer_id", buyerId)
    .in("state", ["pending", "rejected"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    image: r.image,
    quantity: r.quantity,
    state: r.state as "pending" | "rejected",
    reason: [r.buyer_message, r.review_note].filter(Boolean).join(" ") || null,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  }));
}

/** The buyer's requirements waiting for review or not approved; refreshes every 30 s while one waits. */
export function useMyRfqSubmissions(buyerId: string | undefined) {
  return useQuery({
    queryKey: ["rfq_submissions", buyerId],
    queryFn: () => fetchMySubmissions(buyerId as string),
    enabled: Boolean(buyerId),
    refetchInterval: (q) => (q.state.data?.some((r) => r.state === "pending") ? 30_000 : false),
  });
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
 * A requirement's pictures: the full form's and Quick Quote's photos, and a direct request's
 * customization references (2026-10-14; it was customization only). Reuses the existing
 * `product-images` bucket: its RLS insert policy is uploader-scoped
 * (`(storage.foldername(name))[1] = auth.uid()::text`), not vendor-scoped, so a
 * buyer may write under their own uid folder. The bucket is public, so the
 * target vendor can read the URLs back. Same call shape as Upload.tsx.
 */
export async function uploadRfqImages(buyerId: string, files: File[]): Promise<string[]> {
  const batchId = crypto.randomUUID();
  // Shrunk first (lib/shrinkImage.ts), then uploaded side by side: five phone photos at full size
  // took long enough on mobile data that buyers gave up.
  const prepared = await Promise.all(files.slice(0, RFQ_MAX_IMAGES).map((f) => shrinkImage(f)));
  return Promise.all(prepared.map(async ({ blob, ext }, i) => {
    const path = `${buyerId}/rfq/${batchId}/${i}.${ext}`;
    const { error } = await supabase.storage.from("product-images")
      .upload(path, blob, { upsert: true, contentType: blob.type || undefined, cacheControl: "31536000" });
    if (error) throw error;
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }));
}

/** The most pictures a requirement takes (the forms say "up to 5"). */
export const RFQ_MAX_IMAGES = 5;

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
    imageUrls = await uploadRfqImages(buyerId, input.customizationFiles);
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

/** The buyer's "Extend 7 days" (extend_rfq_deadline): allowed once the deadline is a day away or past. */
export async function extendRfqDeadline(rfqId: string): Promise<string> {
  const { data, error } = await supabase.rpc("extend_rfq_deadline", { p_rfq_id: rfqId });
  if (error) throw error;
  return data as string;
}

/** Can the buyer extend it now? The same rule extend_rfq_deadline() applies. */
export function canExtendDeadline(expiresAt: string | null | undefined, now = Date.now()): boolean {
  return Boolean(expiresAt) && new Date(expiresAt as string).getTime() - now <= 24 * 3600_000;
}

/** The seller changed the quote after the buyer loaded it, so it wasn't accepted. */
export class QuoteChangedError extends Error {
  constructor() {
    super("The seller changed this quote since you opened it. Check the new terms before accepting.");
    this.name = "QuoteChangedError";
  }
}

// ── Buyer: change a quote's status (shortlist / accept / reject) ──
// Accepting checks the terms are still the ones the buyer saw (2026-10-19): a seller may revise a pending quote at
// any time, and a bare status update accepted whatever price was there by then. The check is part of the update
// itself, so a revision landing at the same moment can't slip between them.
export async function setQuoteStatusDb(id: string, status: QuoteStatus, seen?: QuoteTerms): Promise<void> {
  if (status !== "accepted" || !seen) {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
    if (error) throw error;
    return;
  }
  let q = supabase.from("quotes").update({ status }).eq("id", id).eq("currency", seen.currency);
  for (const col of ["price_per_unit", "moq", "lead_time", "sampling_cost", "sample_timeline"] as const) {
    const v = seen[col];
    q = v == null ? q.is(col, null) : q.eq(col, v);
  }
  const { data, error } = await q.select("id");
  if (error) throw error;
  if (!data?.length) throw new QuoteChangedError();
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
  /** True when this RFQ's category is one of the vendor's live product
   *  categories. Still the exact-overlap signal the badge has always meant —
   *  it is now one input to `score` rather than the whole ranking. */
  matched: boolean;
  /** Cosine similarity between the RFQ and the vendor's catalogue centroid.
   *  null when either side has no embedding yet, or when scoring failed. */
  similarity: number | null;
  /** 0.7 * similarity + 0.3 * matched, from match_vendor_rfqs. Sort key. */
  score: number;
  /** Semantic fit strong enough to say so in the UI. Distinct from `matched`:
   *  that one claims a category match specifically, and must stay truthful. */
  strongMatch: boolean;
  /** The buyer's category answers as label/value pairs (Ranking F1). */
  details: { label: string; value: string }[];
  /** From a buyer outside India (subscriptions P7). Only Gold and VIP vendors read these;
   *  the database decides, this only labels them. */
  overseas: boolean;
  /** The buyer's country when they posted (ISO code), or null. */
  buyerCountryCode: string | null;
  /** While in the future, only VIP vendors see it; it opens to Gold then. */
  vipUntil: string | null;
  /** All the buyer's pictures, the cover first; buyer-written URLs checked (lib/storageUrl.ts). */
  images: string[];
  /** When it stops taking quotes. */
  expiresAt: string | null;
}
async function fetchOpenRfqs(vendorId: string): Promise<LeadRfq[]> {
  const { data, error } = await supabase
    .from("rfqs").select(OPEN_LEAD_COLUMNS).eq("status", "active")
    // Still taking quotes: an open requirement's 7-day deadline, which the buyer can extend (2026-10-19).
    .gt("expires_at", new Date().toISOString())
    // Open marketplace only. Targeted requests (vendor_id set) belong to the
    // Direct Quote Requests inbox, not the shared lead pool. Every pre-existing
    // RFQ has vendor_id NULL, so this is a no-op for them.
    .is("vendor_id", null)
    // Not the seller's own requirements (posted as a buyer): they can't be quoted (enforce_quote_rfq_open,
    // 2026-10-21), and rfqs_select shows a buyer their own rows, so the pool listed them.
    .neq("buyer_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawLeadRfq[];

  const { data: myQuotes } = await supabase.from("quotes").select("rfq_id").eq("vendor_id", vendorId);
  const quoted = new Set((myQuotes ?? []).map((q) => q.rfq_id));

  // Every vendor gets the same ranking (Mitra, 2026-10-02: leads are the same on
  // every plan; documentation/rfq-leads-pipeline-design-2026-10-02.md, R2). The
  // weighting lives in one place server-side (match_vendor_rfqs), the same way
  // match_products owns product ranking.
  //
  // Degrades to the chronological list rather than failing: until both sides
  // have an embedding, similarity comes back null and score collapses to the
  // category term alone; a failed RPC leaves every score at 0.
  let matchOf = new Map<string, { similarity: number | null; categoryMatch: boolean; score: number }>();
  const { data: scores, error: scoreErr } = await supabase
    .rpc("match_vendor_rfqs", { p_vendor_id: vendorId, match_count: 200 });
  if (!scoreErr && scores) {
    matchOf = new Map((scores as { rfq_id: string; similarity: number | null; category_match: boolean; score: number }[])
      .map((s) => [s.rfq_id, { similarity: s.similarity, categoryMatch: s.category_match, score: s.score }]));
  }

  const leads: LeadRfq[] = rows.map((r) => {
    const m = matchOf.get(r.id);
    return {
      id: r.id, title: r.title, productName: r.product_name ?? r.title, units: r.quantity ?? 0,
      priceMin: Number(r.budget_min ?? 0), priceMax: Number(r.budget_max ?? 0), image: ownStorageUrl(r.image) ?? "",
      date: new Date(r.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
      alreadyQuoted: quoted.has(r.id),
      categoryId: r.category_id ?? null,
      matched: m?.categoryMatch ?? false,
      similarity: m?.similarity ?? null,
      score: m?.score ?? 0,
      strongMatch: (m?.similarity ?? 0) >= STRONG_MATCH_SIMILARITY,
      details: attributeDetails(r.attributes),
      overseas: Boolean(r.overseas),
      buyerCountryCode: r.buyer_country_code ?? null,
      vipUntil: r.overseas_vip_until ?? null,
      // Every picture the buyer added, the cover first (2026-10-19: only the cover reached sellers).
      images: (r.images?.length ? r.images : [r.image]).map((u) => ownStorageUrl(u)).filter((u): u is string => Boolean(u)),
      expiresAt: r.expires_at ?? null,
    };
  });

  // Best fit first; ties keep the created_at desc the query already applied.
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
  /** Raw `quotes.created_at`. `submittedDate` is already localised for display,
   *  so anything that needs to compare or window a quote reads this instead. */
  submittedDateIso: string;
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

/** A requirement the seller has quoted, as my_quoted_rfqs() returns it. */
export interface QuotedRfq {
  rfq_id: string; title: string; product_name: string | null; quantity: number | null; image: string | null;
  buyer_id: string; status: "active" | "closed"; quotes_total: number;
}

/**
 * Every requirement the signed-in seller has quoted, with its quote count from all sellers (2026-10-21).
 * Not read from rfqs and quotes directly: their policies show a seller only active requirements and only
 * their own quotes, so each card said "1 quotes total" and a removed requirement lost its title and quantity.
 */
export async function fetchMyQuotedRfqs(): Promise<Map<string, QuotedRfq>> {
  const { data, error } = await supabase.rpc("my_quoted_rfqs");
  if (error) throw error;
  return new Map(((data ?? []) as QuotedRfq[]).map((r) => [r.rfq_id, r]));
}

async function fetchMySubmittedQuotes(vendorId: string): Promise<MySubmittedQuote[]> {
  const { data: quotes, error } = await supabase
    .from("quotes").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (quotes ?? []) as RawQuote[];
  const rfqMap = rows.length ? await fetchMyQuotedRfqs() : new Map<string, QuotedRfq>();

  // Real buyer names, batched over the distinct buyers behind those RFQs — same
  // shape as fetchConversations in chat.ts. One query, not one per row.
  const buyerIds = Array.from(new Set(Array.from(rfqMap.values()).map((r) => r.buyer_id).filter(Boolean)));
  const buyerNames = new Map<string, string>();
  if (buyerIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", buyerIds);
    for (const pr of data ?? []) if (pr.full_name) buyerNames.set(pr.id, pr.full_name);
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
      submittedDateIso: q.created_at,
      lastUpdated: fmtDate(q.updated_at ?? q.created_at),
      pcs: rfq?.quantity != null ? `${rfq.quantity} pcs` : "—",
      totalQuotes: rfq?.quotes_total ?? 1,
      status: mapQuoteStatus(q.status),
      // A buyer-written URL: only this project's Storage is shown (lib/storageUrl.ts).
      image: ownStorageUrl(rfq?.image) ?? undefined,
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
    productImage: (r.product_id && coverOf.get(r.product_id)) || ownStorageUrl(r.image) || "",
    quantity: r.quantity ?? 0,
    sizes: (r.sizes_breakdown as SizeQty[] | null) ?? [],
    colors: r.colors ?? [],
    budgetMin: Number(r.budget_min ?? 0),
    budgetMax: Number(r.budget_max ?? 0),
    customizationRequested: r.customization_requested ?? false,
    customizationNotes: r.customization_notes ?? null,
    customizationImages: (r.customization_images ?? []).filter((u) => ownStorageUrl(u)),
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
