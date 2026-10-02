import { errorMessage } from "@/lib/errorMessage";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supportChatHref } from "@/lib/supportContact";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChevronLeft, Check, Clock, FileText, ExternalLink, ShieldCheck, AlertTriangle, Loader2, XCircle, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyVendorProfile } from "@/lib/queries/vendorStore";
import {
  resubmitKycDocument, submitCatalogue, catalogueFileProblem, BUSINESS_REGISTRATION_KINDS, CATALOGUE_ACCEPT,
  KYC_FILE_TYPES, MAX_CATALOGUE_FILES, MAX_KYC_BYTES, type BusinessRegistrationKind,
} from "@/lib/queries/vendorOnboarding";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
 * The documents registration collects (the Seller Registration FAQ's list, since
 * 2026-10-02): PAN card, GST certificate (when registered for GST), a business
 * registration, the owner's masked Aadhaar, and a product catalogue, for which a
 * listed product can stand in. A seller registered before then can add the missing
 * ones here. Any other type on file (a legacy CIN row) still renders after these.
 */
const COLLECTED_DOC_TYPES = ["pan", "gst", "business_registration", "aadhaar", "catalog"] as const;
/** Types a seller can add here when they never gave one. */
type AddableType = "business_registration" | "aadhaar" | "catalog";

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
  const navigate = useNavigate();
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
        action: { label: "Contact support", onClick: () => navigate(supportChatHref({ category: "vendor_kyc", entityType: "kyc", entityId: doc.id })) },
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

/** Same limits the onboarding upload copy states: "jpeg, png or pdf formats up to 5MB". */
const KYC_TYPES = KYC_FILE_TYPES;

/**
 * "Upload a replacement" — only on a REJECTED document (Master Prompt 8, Phase 3).
 *
 * The new scan becomes a new vendor_documents row; the guard trigger makes it
 * unreviewed, so it goes back into the admin's queue as "awaiting review", and
 * the rejected row and its file are removed (resubmitKycDocument →
 * replaceVendorDocuments, the same one-active-document rule onboarding uses).
 * The rejection itself stays on record in the vendor's kyc_rejected
 * notification.
 */
function ReplaceDocumentButton({ vendorId, doc }: { vendorId: string; doc: VendorDocumentRow }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const label = DOC_TYPE_LABELS[doc.docType] ?? doc.docType;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!KYC_TYPES.test(file.type)) {
      toast.error("Use a JPEG, PNG or PDF", { description: `${file.name} is not one of those formats.` });
      return;
    }
    if (file.size > MAX_KYC_BYTES) {
      toast.error("That file is over 5 MB", { description: "Scan or export it at a lower resolution and try again." });
      return;
    }
    setBusy(true);
    try {
      // A replacement keeps what went with the file (a registration's kind and number).
      await resubmitKycDocument(vendorId, doc.docType, file, doc.detail);
      await qc.invalidateQueries({ queryKey: ["vendor_documents"] });
      toast.success(`${label} sent for review`, { description: "Our team reviews submissions within 3–5 days." });
    } catch (err) {
      toast.error(`Couldn't upload your ${label}`, { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-vendor px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1f5fe0] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {busy ? "Uploading…" : `Upload a replacement ${label}`}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        aria-label={`Replacement ${label} file`}
        onChange={onFile}
      />
    </>
  );
}

/**
 * "Add" on a document the seller never gave (2026-10-02): a business registration
 * (its kind, number and certificate), the owner's masked Aadhaar (with consent), or
 * catalogue files. The same upload and row rules as onboarding; the new rows go
 * into review like any other.
 */
function AddDocumentButton({ vendorId, type }: { vendorId: string; type: AddableType }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<BusinessRegistrationKind | "">("");
  const [number, setNumber] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const kindInfo = BUSINESS_REGISTRATION_KINDS.find((k) => k.id === kind);
  const numberOk = !kindInfo ? false : kindInfo.numberRequired ? Boolean(kindInfo.pattern?.test(number.trim().toUpperCase())) : true;
  const label = DOC_TYPE_LABELS[type] ?? type;
  const ready = files.length > 0 && (type === "catalog" || (type === "aadhaar" ? consent : kind !== "" && numberOk));

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (type === "catalog") {
      const keep = [...files];
      for (const f of picked) {
        const problem = catalogueFileProblem(f);
        if (problem) { toast.error("That file can't be used for your catalogue", { description: problem }); continue; }
        if (keep.length >= MAX_CATALOGUE_FILES) { toast.error(`Up to ${MAX_CATALOGUE_FILES} catalogue files.`); break; }
        keep.push(f);
      }
      setFiles(keep);
      return;
    }
    const f = picked[0];
    if (!f) return;
    if (!KYC_TYPES.test(f.type)) { toast.error("Use a JPEG, PNG or PDF", { description: `${f.name} is not one of those formats.` }); return; }
    if (f.size > MAX_KYC_BYTES) { toast.error("That file is over 5 MB", { description: "Scan or export it at a lower resolution and try again." }); return; }
    setFiles([f]);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (type === "catalog") {
        await submitCatalogue(vendorId, files);
      } else if (type === "aadhaar") {
        await resubmitKycDocument(vendorId, "aadhaar", files[0], { masked: true, consent_at: new Date().toISOString() });
      } else {
        const n = number.trim().toUpperCase();
        await resubmitKycDocument(vendorId, "business_registration", files[0], { kind, ...(n ? { number: n } : {}) });
      }
      await qc.invalidateQueries({ queryKey: ["vendor_documents"] });
      setOpen(false);
      setFiles([]);
      toast.success(`${label} sent for review`, { description: "Our team reviews submissions within 3–5 days." });
    } catch (err) {
      toast.error("Couldn't add that document", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-vendor px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1f5fe0]"
      >
        <Upload className="h-3 w-3" /> Add
      </button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {type === "aadhaar" ? "Add your masked Aadhaar" : type === "catalog" ? "Add your product catalogue" : "Add your business registration"}
            </DialogTitle>
            <DialogDescription>
              {type === "aadhaar"
                ? "Upload a masked Aadhaar, where only the last 4 digits show. You can download one from myAadhaar (uidai.gov.in)."
                : type === "catalog"
                  ? `A PDF, Excel or CSV file, or photos of your range, up to ${MAX_CATALOGUE_FILES} files.`
                  : "Choose the registration your business has, then upload its certificate."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {type === "business_registration" && (
              <>
                <Select value={kind} onValueChange={(v) => { setKind(v as BusinessRegistrationKind); setNumber(""); }}>
                  <SelectTrigger aria-label="Business registration"><SelectValue placeholder="Choose a registration" /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_REGISTRATION_KINDS.map((k) => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {kindInfo && (
                  <div className="space-y-1">
                    <Label htmlFor="kyc-reg-number" className="text-xs">{kindInfo.numberLabel}</Label>
                    <Input id="kyc-reg-number" value={number} maxLength={60} placeholder={kindInfo.placeholder}
                      onChange={(e) => setNumber(e.target.value.toUpperCase())} />
                    {number.trim() && !numberOk && kindInfo.patternHint && <p className="text-xs text-red-600">{kindInfo.patternHint}</p>}
                  </div>
                )}
              </>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => input.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> {files.length ? "Choose different files" : "Choose a file"}
            </Button>
            {files.map((f) => <p key={f.name} className="truncate text-xs text-gray-600" data-no-translate>{f.name}</p>)}
            {type === "aadhaar" && (
              <label className="flex items-start gap-2 text-xs leading-5 text-gray-700">
                <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  I agree to share my masked Aadhaar with Cosora to verify who runs this business. It is stored privately,
                  only Cosora's team can open it, and it is deleted if I delete my account.
                </span>
              </label>
            )}
            <input
              ref={input}
              type="file"
              multiple={type === "catalog"}
              accept={type === "catalog" ? CATALOGUE_ACCEPT : "image/jpeg,image/png,application/pdf"}
              className="hidden"
              aria-label={`${label} file`}
              onChange={pick}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={busy || !ready}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send for review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** How many live or in-review products the seller has: a product stands in for a catalogue. */
function useMyProductCount(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["my_product_count", vendorId],
    enabled: Boolean(vendorId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products").select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId!).in("status", ["live", "under_review"]);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

const REG_KIND_LABELS = Object.fromEntries(BUSINESS_REGISTRATION_KINDS.map((k) => [k.id, k.label])) as Record<string, string>;

const Kyc = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { data: store } = useMyVendorProfile(user?.id);
  const { data: docs, isLoading } = useMyVendorDocuments(user?.id);

  const { data: productCount = 0 } = useMyProductCount(user?.id);
  const submitted = docs ?? [];
  // A catalogue can be several files (one row each); every other type is one row.
  const catalogs = submitted.filter((d) => d.docType === "catalog");
  const byType = new Map(submitted.filter((d) => d.docType !== "catalog").map((d) => [d.docType, d]));
  const reg = byType.get("business_registration");
  // What the seller gave with each document, so a row can say more than "supplied".
  const numbers: Record<string, string> = {
    pan: store?.pan ?? "",
    gst: store?.gstin ?? "",
    cin: store?.cin ?? "",
    business_registration: reg
      ? [REG_KIND_LABELS[String(reg.detail.kind ?? "")], reg.detail.number ? String(reg.detail.number) : ""].filter(Boolean).join(" · ")
      : "",
    aadhaar: byType.has("aadhaar") ? "Masked copy" : "",
    catalog: catalogs.length ? `${catalogs.length} file${catalogs.length === 1 ? "" : "s"}` : "",
  };
  // Registered without GST: allowed (Seller Registration FAQ), so nothing to add.
  const noGst = !store?.gstin && !byType.has("gst");
  const productStandsIn = catalogs.length === 0 && productCount > 0;
  const missing = [
    !byType.has("pan"), !reg, !byType.has("aadhaar"), catalogs.length === 0 && productCount === 0,
  ].filter(Boolean).length;

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
              store?.isVerified ? "bg-green-50" : rejectedCount > 0 ? "bg-red-50" : "bg-brand-vendor/10"
            }`}>
              <ShieldCheck className={`h-5 w-5 ${
                store?.isVerified ? "text-green-600" : rejectedCount > 0 ? "text-red-500" : "text-brand-vendor"
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
                  : rejectedCount > 0
                    ? `${rejectedCount} document${rejectedCount === 1 ? " was" : "s were"} rejected. See the reason below and upload a replacement.`
                    : missing === 1
                      ? "1 document is missing. Add it below and our team reviews it within 3–5 days."
                    : missing > 1
                      ? `${missing} documents are missing. Add them below and our team reviews them within 3–5 days.`
                      : `${verifiedCount} of ${submitted.length} document${submitted.length === 1 ? "" : "s"} verified. Our team reviews submissions within 3–5 days.`}
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
              // The catalogue's files share one row: rejected if any is, verified if all are.
              const doc = type === "catalog"
                ? (catalogs.find(isRejected) ?? catalogs.find((d) => !d.verified) ?? catalogs[0])
                : byType.get(type);
              const number = numbers[type];
              const rejected = doc ? isRejected(doc) : false;
              const notNeeded = !doc && ((type === "gst" && noGst) || (type === "catalog" && productStandsIn));
              const addable = !doc && !notNeeded && (type === "business_registration" || type === "aadhaar" || type === "catalog");
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
                          {type === "gst" && noGst ? "Not registered for GST"
                            : type === "catalog" && productStandsIn ? "Your listed products stand in for a catalogue"
                            : number ? number : doc ? "Supplied at registration" : "Not provided"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {type !== "catalog" && doc?.fileUrl && <ViewDocumentButton doc={doc} />}
                      {addable && user?.id && <AddDocumentButton vendorId={user.id} type={type as AddableType} />}
                      {notNeeded ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          Not needed
                        </span>
                      ) : !doc ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          Not submitted
                        </span>
                      ) : (type === "catalog" ? catalogs.every((d) => d.verified) : doc.verified) ? (
                        <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">
                          <Check className="h-3 w-3" /> Verified
                        </span>
                      ) : rejected ? (
                        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-brand-vendor/10 px-2 py-0.5 text-[10px] font-semibold text-brand-vendor">
                          <Clock className="h-3 w-3" /> In review
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The catalogue's files, each one viewable. */}
                  {type === "catalog" && catalogs.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-[52px]">
                      {catalogs.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-gray-600" data-no-translate>{String(c.detail.name ?? "Catalogue file")}</span>
                          {c.fileUrl && <ViewDocumentButton doc={c} />}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* The moderator's note, the same way /upload-video surfaces
                      one on a rejected clip. A vendor rejected without a reason
                      cannot fix anything. */}
                  {rejected && doc && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                        <p className="text-[11px] leading-4 text-gray-700">
                          <span className="font-semibold">Rejected:</span>{" "}
                          {doc.rejectionReason?.trim()
                            ? doc.rejectionReason
                            : "No reason was recorded. Contact support and we'll tell you what to re-submit."}
                        </p>
                      </div>
                      <Link
                        to={supportChatHref({ category: "vendor_kyc", entityType: "kyc", entityId: doc.id })}
                        className="ml-5 text-[11px] font-semibold text-brand-vendor underline"
                      >
                        Contact support
                      </Link>
                      {user?.id && (type === "catalog" || type === "aadhaar"
                        // A new catalogue replaces the whole set; a new Aadhaar needs the consent again.
                        ? <div className="mt-2"><AddDocumentButton vendorId={user.id} type={type} /></div>
                        : <ReplaceDocumentButton vendorId={user.id} doc={doc} />)}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Honest note about what this page can and cannot do. A REJECTED
            document can be replaced on its row (Master Prompt 8, Phase 3), and
            since 2026-10-02 a missing business registration, masked Aadhaar or
            catalogue can be added on its row. A PAN or GST number still goes
            through support: it lives in the business profile, not here. */}
        <motion.div variants={section} className="flex items-start gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <p className="text-xs leading-5 text-gray-600">
            Documents are collected during seller registration and verified by the Cosora team. If one is missing, add it
            on its row; if one is rejected, upload a replacement and it goes back into review. For your PAN or GST number,
            contact support from{" "}
            <button onClick={() => navigate(supportChatHref({ category: "vendor_kyc" }))} className="font-semibold text-brand-vendor underline">
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
