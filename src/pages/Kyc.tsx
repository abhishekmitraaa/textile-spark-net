import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChevronLeft, Check, Clock, FileText, ExternalLink, ShieldCheck, AlertTriangle, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyVendorProfile } from "@/lib/queries/vendorStore";
import {
  useMyVendorDocuments, DOC_TYPE_LABELS, signedKycUrl, isRejected,
  KYC_URL_TTL_SECONDS, type VendorDocumentRow,
} from "@/lib/queries/vendorDocuments";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

// ─────────────────────────────────────────────────────────────
// /kyc — what Cosora holds for this vendor and where each document stands.
//
// Split out of the old "KYC & Payments" nav row, which pointed at
// /subscription. /subscription is billing: it does no KYC, shows no document
// and cannot tell a vendor why they are not verified yet. This page reads
// vendor_documents directly, so "In review" means a real unverified row and
// "Verified" means an admin actually verified it.
// ─────────────────────────────────────────────────────────────

/**
 * The document types onboarding can actually collect.
 *
 * `aadhaar` is deliberately NOT here. Nothing in the app collects one — see the
 * Aadhaar note in saveVendorOnboarding() — so listing it produced a permanent
 * "Not provided" row inviting the vendor to supply something no field accepts,
 * which is the same broken promise the step-1 "documents required" dialog used
 * to make. A legacy aadhaar row, if one exists, still renders: the list below
 * is this set PLUS any other type the vendor actually has on file.
 */
const COLLECTED_DOC_TYPES = ["pan", "gst", "cin"] as const;

/**
 * "View document" — mints a signed URL for THIS document only, at the moment
 * it is asked for.
 *
 * Deliberately not resolved on mount for every row: `business-docs` is private
 * and a signed URL is a bearer token for five minutes, so loading the page
 * should not hand out credentials for documents nobody opened. The trade is one
 * short spinner on the first click, which is the right way round.
 */
function ViewDocumentButton({ doc }: { doc: VendorDocumentRow }) {
  const [loading, setLoading] = useState(false);

  const open = async () => {
    if (!doc.fileUrl || loading) return;
    setLoading(true);
    const { url, error } = await signedKycUrl(doc.fileUrl, KYC_URL_TTL_SECONDS);
    setLoading(false);
    if (!url) {
      // A missing object or an RLS refusal renders as a message, never as a
      // broken tab or a dead <img>.
      toast.error("File unavailable", {
        description: error ?? "This document could not be opened. Contact support if it persists.",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={open}
      disabled={loading}
      className="flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
      {loading ? "Opening…" : "View"}
    </button>
  );
}

const Kyc = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: store } = useMyVendorProfile(user?.id);
  const { data: docs, isLoading } = useMyVendorDocuments(user?.id);

  const submitted = docs ?? [];
  const byType = new Map(submitted.map((d) => [d.docType, d]));
  // The number the vendor actually gave us, so the empty state can tell the
  // difference between "no document uploaded" and "no number supplied at all".
  const numbers: Record<string, string> = {
    pan: store?.pan ?? "",
    gst: store?.gstin ?? "",
    cin: store?.cin ?? "",
    aadhaar: "",
  };

  const verifiedCount = submitted.filter((d) => d.verified).length;
  const rejectedCount = submitted.filter(isRejected).length;

  return (
    <DashboardLayout>
      <motion.div
        className="max-w-2xl mx-auto pb-8 space-y-4"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={section} className="flex items-center gap-3">
          <motion.button whileTap={TAP} transition={TAP_T} onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </motion.button>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-none">KYC</h1>
            <p className="text-xs text-gray-400 mt-0.5">Verify your business documents</p>
          </div>
        </motion.div>

        {/* Status band */}
        <motion.div variants={section} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              store?.isVerified ? "bg-green-50" : rejectedCount > 0 ? "bg-red-50" : "bg-[#256fef]/10"
            }`}>
              <ShieldCheck className={`h-5 w-5 ${
                store?.isVerified ? "text-green-600" : rejectedCount > 0 ? "text-red-500" : "text-[#256fef]"
              }`} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {store?.isVerified
                  ? "Your business is verified"
                  : rejectedCount > 0
                    ? "Action needed on your documents"
                    : "Verification in progress"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {store?.isVerified
                  ? "Buyers see the verified badge on your storefront and listings."
                  : submitted.length === 0
                    ? "We don't have any documents from you yet. Add them during seller registration or send them to our team."
                    : rejectedCount > 0
                      ? `${rejectedCount} document${rejectedCount === 1 ? " was" : "s were"} rejected. See the reason below and send us a replacement.`
                      : `${verifiedCount} of ${submitted.length} document${submitted.length === 1 ? "" : "s"} verified. Our team reviews submissions within 24–48 hours.`}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Documents */}
        {isLoading ? (
          <motion.div variants={section} className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[70px] animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </motion.div>
        ) : (
          <motion.div variants={listContainer} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {/* Collected types always shown (so a missing PAN reads as an
                action), plus any other type this vendor genuinely has on file. */}
            {[
              ...COLLECTED_DOC_TYPES,
              ...[...byType.keys()].filter(
                (t) => !(COLLECTED_DOC_TYPES as readonly string[]).includes(t),
              ),
            ].map((type) => {
              const doc = byType.get(type);
              const number = numbers[type];
              const rejected = doc ? isRejected(doc) : false;
              return (
                <motion.div variants={listItem} key={type}
                  className="border-b border-gray-100 px-4 py-4 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                        <FileText className="h-5 w-5 text-gray-500" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{DOC_TYPE_LABELS[type] ?? type}</p>
                        <p className="truncate text-xs text-gray-400">
                          {number ? number : doc ? "Supplied at registration" : "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {doc?.fileUrl && <ViewDocumentButton doc={doc} />}
                      {!doc ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          Not submitted
                        </span>
                      ) : doc.verified ? (
                        <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">
                          <Check className="h-3 w-3" /> Verified
                        </span>
                      ) : rejected ? (
                        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-[#256fef]/10 px-2 py-0.5 text-[10px] font-semibold text-[#256fef]">
                          <Clock className="h-3 w-3" /> In review
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The moderator's note, the same way /upload-video surfaces
                      one on a rejected clip. A vendor rejected without a reason
                      cannot fix anything. */}
                  {rejected && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      <p className="text-[11px] leading-4 text-gray-700">
                        <span className="font-semibold">Rejected:</span>{" "}
                        {doc?.rejectionReason?.trim()
                          ? doc.rejectionReason
                          : "No reason was recorded. Contact support and we'll tell you what to re-submit."}
                      </p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Honest note about what this page can and cannot do. There is no
            vendor-facing re-upload path yet: onboarding writes these rows and
            an admin verifies them, so pretending there is an "Upload" button
            here would be a button that goes nowhere. */}
        <motion.div variants={section} className="flex items-start gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <p className="text-xs leading-5 text-gray-600">
            Documents are collected during seller registration and verified by the Cosora team — this page shows their
            current status. To correct or add a document, contact support from{" "}
            <button onClick={() => navigate("/help")} className="font-semibold text-[#256fef] underline">
              Help &amp; Support
            </button>
            .
          </p>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Kyc;
