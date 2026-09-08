import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// KYC documents (vendor_documents). Written at onboarding — one row per
// document type the vendor supplied, carrying the uploaded scan's public URL
// where there is one — and read back by /kyc.
//
// `verified` is flipped by an admin and by nothing in this app. The vendor's
// KYC status is therefore genuinely one of: nothing submitted, submitted and
// waiting, or verified. There is no fourth "looks fine to us" state.
// ─────────────────────────────────────────────────────────────

export type KycDocType = "pan" | "gst" | "cin" | "aadhaar";

export interface VendorDocumentRow {
  id: string;
  docType: string;
  fileUrl: string | null;
  verified: boolean;
  createdAt: string;
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
}

async function fetchMyVendorDocuments(vendorId: string): Promise<VendorDocumentRow[]> {
  const { data, error } = await supabase
    .from("vendor_documents")
    .select("id, doc_type, file_url, verified, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RawDoc[]).map((d) => ({
    id: d.id,
    docType: d.doc_type,
    fileUrl: d.file_url,
    verified: d.verified,
    createdAt: d.created_at,
  }));
}

export function useMyVendorDocuments(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_documents", "mine", vendorId],
    queryFn: () => fetchMyVendorDocuments(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

export type KycStatus = "none" | "in_review" | "verified";

/**
 * One word for the whole KYC pack, for a nav badge.
 *
 * "verified" only when every submitted document is verified — a vendor with a
 * verified PAN and an unreviewed GST is still mid-review, and saying otherwise
 * on the nav row is the kind of claim this feature exists to avoid.
 */
export function kycStatusOf(docs: VendorDocumentRow[] | undefined): KycStatus {
  if (!docs || docs.length === 0) return "none";
  return docs.every((d) => d.verified) ? "verified" : "in_review";
}
