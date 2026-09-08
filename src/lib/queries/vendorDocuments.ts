import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { KYC_BUCKET, assertKycBucket } from "@/lib/queries/vendorOnboarding";

// ─────────────────────────────────────────────────────────────
// KYC documents (vendor_documents). Written at onboarding — one row per
// document type the vendor supplied — and read back by /kyc.
//
// `file_url` holds a PATH in the private `business-docs` bucket, not a URL.
// There is no public URL for these: reads go through signedKycUrl() below.
//
// `verified` is flipped by an admin through set_vendor_document_verified() and
// by nothing in this app. The vendor's KYC status is therefore genuinely one
// of: nothing submitted, submitted and waiting, rejected with a reason, or
// verified. There is no fifth "looks fine to us" state.
// ─────────────────────────────────────────────────────────────

export type KycDocType = "pan" | "gst" | "cin" | "aadhaar";

export interface VendorDocumentRow {
  id: string;
  docType: string;
  fileUrl: string | null;
  verified: boolean;
  createdAt: string;
  /** Moderator note. Only meaningful once reviewedAt is set — read it WITH the
   *  review timestamp, because a never-reviewed document is not a rejected one. */
  rejectionReason: string | null;
  reviewedAt: string | null;
}

/** Human labels for the doc_type values saveVendorOnboarding writes. */
export const DOC_TYPE_LABELS: Record<string, string> = {
  pan: "PAN",
  gst: "GST",
  cin: "CIN",
  aadhaar: "Aadhaar",
};

interface RawDoc {
  id: string;
  doc_type: string;
  file_url: string | null;
  verified: boolean;
  created_at: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
}

async function fetchMyVendorDocuments(vendorId: string): Promise<VendorDocumentRow[]> {
  const { data, error } = await supabase
    .from("vendor_documents")
    .select("id, doc_type, file_url, verified, created_at, rejection_reason, reviewed_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RawDoc[]).map((d) => ({
    id: d.id,
    docType: d.doc_type,
    fileUrl: d.file_url,
    verified: d.verified,
    createdAt: d.created_at,
    rejectionReason: d.rejection_reason,
    reviewedAt: d.reviewed_at,
  }));
}

export function useMyVendorDocuments(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_documents", "mine", vendorId],
    queryFn: () => fetchMyVendorDocuments(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// ─────────────────────────────────────────────────────────────
// Reading a KYC document
//
// `business-docs` is private, so there is no public URL to render. A read is a
// short-lived signed URL minted on demand for the one document being opened —
// never eagerly for a whole list, because that would hand out URLs for
// documents nobody looked at.
// ─────────────────────────────────────────────────────────────

/** Long enough to open a document, short enough that a leaked URL is worthless. */
export const KYC_URL_TTL_SECONDS = 300;

/**
 * `vendor_documents.file_url` holds a bare storage path. Rows written before
 * the move to `business-docs` held a full public URL instead; the backfill in
 * `scripts/migrate-kyc-to-private-bucket.mjs` rewrites those, but this tolerates
 * one that slipped through rather than minting a signed URL for a nonsense key.
 */
function toStoragePath(fileUrl: string): string {
  const marker = `/object/public/${KYC_BUCKET}/`;
  const i = fileUrl.indexOf(marker);
  if (i !== -1) return fileUrl.slice(i + marker.length);
  const legacy = "/object/public/product-images/";
  const j = fileUrl.indexOf(legacy);
  if (j !== -1) return fileUrl.slice(j + legacy.length);
  return fileUrl;
}

export interface SignedKycUrl {
  url: string | null;
  /** Set when the object is missing or the caller is not allowed to read it. */
  error: string | null;
}

/**
 * Mint a signed URL for one KYC document.
 *
 * Never throws: a missing object or an RLS refusal must render "file
 * unavailable", not a broken `<img>` or an unhandled rejection. The same
 * function serves the vendor (owner branch of `business_docs_owner_select`) and
 * an admin (`is_admin()` branch) — there is no second code path for admins.
 */
export async function signedKycUrl(
  path: string,
  ttlSeconds: number = KYC_URL_TTL_SECONDS,
): Promise<SignedKycUrl> {
  assertKycBucket(KYC_BUCKET);
  if (!path) return { url: null, error: "No file was uploaded for this document." };
  try {
    const { data, error } = await supabase.storage
      .from(KYC_BUCKET)
      .createSignedUrl(toStoragePath(path), ttlSeconds);
    if (error || !data?.signedUrl) {
      return { url: null, error: error?.message ?? "This file is unavailable." };
    }
    return { url: data.signedUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type KycStatus = "none" | "in_review" | "rejected" | "verified";

/** True when an admin looked at this document and refused it. */
export function isRejected(d: VendorDocumentRow): boolean {
  return !d.verified && d.reviewedAt !== null;
}

/**
 * One word for the whole KYC pack, for a nav badge.
 *
 * "verified" only when every submitted document is verified — a vendor with a
 * verified PAN and an unreviewed GST is still mid-review, and saying otherwise
 * on the nav row is the kind of claim this feature exists to avoid.
 */
export function kycStatusOf(docs: VendorDocumentRow[] | undefined): KycStatus {
  if (!docs || docs.length === 0) return "none";
  // A rejection outranks a pending document: it is the one state the vendor has
  // to act on, so it must not be hidden behind "in review".
  if (docs.some(isRejected)) return "rejected";
  return docs.every((d) => d.verified) ? "verified" : "in_review";
}
