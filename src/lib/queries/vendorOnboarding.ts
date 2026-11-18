import { supabase } from "@/lib/supabase";
import { fileExt } from "@/lib/fileExt";
import type { Json } from "@/lib/database.types";
import { resolveCategoryId } from "@/lib/queries/products";
import { SUPPLIER_AGREEMENT_VERSION } from "@/lib/supplierAgreement";
import { writeOwnVendorRow } from "@/lib/queries/vendorStore";

// ─────────────────────────────────────────────────────────────
// The vendor registration: its files and the one call that saves it (submit_vendor_registration, 2026-11-13),
// plus /kyc's document replacements. The database writes the profile, documents, first product, premises photos,
// catalogue and Supplier Agreement in one transaction, or nothing.
//
// Everything here is written from files the vendor actually uploaded to
// storage first — the form used to hand blob: URLs straight to the DB, which
// die on reload and point at nothing for anyone else.
// ─────────────────────────────────────────────────────────────

// The kinds of business registration, their number formats and the payload type live in registrationValidation.ts
// (pure, so scripts/registration-validation-check.mjs can run them); re-exported here for existing imports.
export { BUSINESS_REGISTRATION_KINDS, type BusinessRegistrationKind } from "@/lib/registrationValidation";
import type { BusinessRegistrationKind, OwnerIdKind, RegistrationPayload } from "@/lib/registrationValidation";
import { shrinkImage } from "@/lib/shrinkImage";
import { isValidPan, normaliseTaxId, panOfGstin } from "@/lib/taxIds";
import { fetchMySellerRegistration } from "@/lib/queries/sellerRegistration";

/**
 * One active document per type, and no stranded scan behind it.
 *
 * Replaces this vendor's rows for exactly the given doc types, then removes the
 * storage objects the old rows pointed at. Shared by onboarding (every type at
 * once) and by /kyc's replacement of a rejected document (one type), so the
 * two can never drift into different hygiene rules.
 *
 * A resubmission is a NEW row, never an edit of the old one:
 * vendor_documents_guard_review_columns() refuses a vendor's change to
 * verified / rejection_reason / reviewed_*, and forces a fresh INSERT to
 * unreviewed, so the new row reads "awaiting review" by construction.
 *
 * Order (Master Prompt 8): insert the new rows FIRST, then delete the
 * superseded ones by id, then remove their objects. Onboarding used to delete
 * first; a failed insert then left the vendor with no row at all. There is
 * no unique constraint on (vendor_id, doc_type), so the brief overlap is legal.
 * Storage is not covered by a row delete and there is no cascade, so the old
 * paths are read BEFORE the rows go; the rows go before the objects, so a
 * failed storage delete leaves a harmless orphan rather than a live row
 * pointing at a missing file. Legacy rows may hold a full public URL from
 * before KYC moved to the private bucket; those are skipped, not guessed at.
 */
export interface VendorDocumentInsert {
  vendor_id: string;
  doc_type: string;
  file_url: string | null;
  /** vendor_documents.detail: a registration's kind and number, an Aadhaar's consent, a catalogue file's name. */
  detail?: Record<string, unknown>;
}

/**
 * How far replaceVendorDocuments got. "no": the new rows aren't saved (nothing was sent, or the database refused
 * them). "maybe": the insert's answer was lost. "yes": they are saved, even if a later step failed. A caller
 * removes the files it uploaded for them only on "no" (onboarding audit #31: a saved row lost its file).
 */
export interface ReplaceProgress { newRows: "no" | "maybe" | "yes" }

export async function replaceVendorDocuments(
  vendorId: string,
  docs: VendorDocumentInsert[],
  progress: ReplaceProgress = { newRows: "no" },
): Promise<void> {
  if (!docs.length) return;
  const docTypes = docs.map((d) => d.doc_type);

  const { data: superseded, error: re } = await supabase
    .from("vendor_documents")
    .select("id, file_url")
    .eq("vendor_id", vendorId)
    .in("doc_type", docTypes);
  if (re) throw re;

  progress.newRows = "maybe";
  const { error: ie } = await supabase
    .from("vendor_documents")
    .insert(docs.map((d) => ({ ...d, detail: (d.detail ?? {}) as Json })));
  if (ie) {
    if (isServerRefusal(ie)) progress.newRows = "no";
    throw ie;
  }
  progress.newRows = "yes";

  const oldIds = (superseded ?? []).map((d) => d.id as string);
  if (oldIds.length) {
    const { error: de } = await supabase.from("vendor_documents").delete().in("id", oldIds);
    if (de) throw de;
  }

  // Best-effort: a vendor's submission must not fail because a superseded
  // file could not be tidied up.
  const stale = (superseded ?? [])
    .map((d) => d.file_url as string | null)
    .filter((u): u is string => !!u && !u.startsWith("http") && !docs.some((d) => d.file_url === u));
  if (stale.length) {
    const { error: se } = await supabase.storage.from(KYC_BUCKET).remove(stale);
    if (se) console.warn("[vendorDocuments] superseded KYC objects not removed:", se.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Uploads for the registration form.
//
// Two buckets, on purpose. Product photos are meant to be seen by buyers and
// go to the PUBLIC `product-images`. A PAN card is not a product photo: KYC
// goes to the PRIVATE `business-docs` and is only ever read through a
// short-lived signed URL.
// ─────────────────────────────────────────────────────────────

/**
 * The one bucket a KYC document may ever live in.
 *
 * This used to be `product-images`, which is public — a PAN card was fetchable
 * by anyone who guessed or was given the URL, with no auth at all. Everything
 * below exists to make that unrepresentable rather than merely fixed.
 */
export const KYC_BUCKET = "business-docs";

/**
 * Cheap invariant, deliberately not a comment. Any function that writes a
 * `/kyc/` path calls this first, so putting one back in a public bucket fails
 * loudly at the call site instead of being rediscovered in six months.
 */
export function assertKycBucket(bucket: string): void {
  if (bucket !== KYC_BUCKET) {
    throw new Error(
      `KYC documents may only be stored in the private "${KYC_BUCKET}" bucket, not "${bucket}". ` +
      `A public bucket makes identity documents fetchable without auth.`,
    );
  }
}

/**
 * The KYC scan (PAN card).
 *
 * The `${vendorId}/kyc/...` shape is REQUIRED, not cosmetic: the
 * `business_docs_owner_select` policy keys on `foldername(name)[1] = auth.uid()`
 * (OR `is_admin()`), so flattening the path would make every document either
 * unreadable or readable by the wrong vendor.
 *
 * Returns the storage PATH, not a URL. `business-docs` is private, and
 * `getPublicUrl()` on a private bucket cheerfully returns a string that 400s —
 * worse than an error, because it looks like it worked. Reads go through
 * `signedKycUrl()` in queries/vendorDocuments.ts.
 */
export async function uploadKycDocument(vendorId: string, file: File): Promise<string> {
  assertKycBucket(KYC_BUCKET);
  const ext = fileExt(file.name, file.type === "application/pdf" ? "pdf" : "jpg");
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${vendorId}/kyc/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from(KYC_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

/**
 * /kyc: replace a REJECTED document with a new scan (Master Prompt 8, Phase 3).
 *
 * Until this existed a rejected vendor had no way back: /kyc said "contact
 * support", and onboarding, the only upload path, is closed once
 * onboarding_complete is set. Uploads through uploadKycDocument(), so the
 * bucket and `${vendorId}/kyc/...` path rules are the same ones onboarding
 * obeys, then swaps the row through replaceVendorDocuments(). If the database
 * refused the new row, the new object is referenced by nothing, so it is
 * removed rather than left as an orphan identity scan. If the row may be saved
 * (its answer was lost, or removing the old row failed) the file stays: a stray
 * scan is cheaper than a document pointing at nothing. A retry supersedes it.
 */
export async function resubmitKycDocument(
  vendorId: string, docType: string, file: File, detail?: Record<string, unknown>,
): Promise<void> {
  const path = await uploadKycDocument(vendorId, file);
  const progress: ReplaceProgress = { newRows: "no" };
  try {
    await replaceVendorDocuments(vendorId, [{ vendor_id: vendorId, doc_type: docType, file_url: path, detail }], progress);
  } catch (err) {
    if (progress.newRows === "no") await supabase.storage.from(KYC_BUCKET).remove([path]);
    throw err;
  }
}

/** Why a PAN can't be added on /kyc, or null when it can (the registration's rules, registrationValidation.ts). */
export function panProblem(input: { number: string; holderName: string; address: string; currentPan: string; gstin: string }): string | null {
  const pan = normaliseTaxId(input.number);
  if (!isValidPan(pan)) return "Check the PAN: 5 letters, 4 digits, then a letter (ABCDE1234F).";
  if (input.currentPan && normaliseTaxId(input.currentPan) !== pan) return "A different PAN is on file. Contact support to change it.";
  if (input.gstin && panOfGstin(normaliseTaxId(input.gstin)) !== pan) return "The GSTIN doesn't match your PAN. A GSTIN contains the PAN it was issued for.";
  const name = input.holderName.trim().length;
  if (name < 3 || name > 120) return "Enter the name as it's printed on the PAN card.";
  const address = input.address.trim().length;
  if (address < 5 || address > 300) return "Enter the address on the PAN card.";
  return null;
}

/**
 * /kyc: a seller with no PAN card on file adds it (onboarding audit #33), as the registration stores it: the number
 * on the profile (vendor_profiles.pan, whose guard checks it again) and the card as a document with the name and
 * address on it. A number already on file is kept: changing one goes through support. The number is saved first, so
 * a failed upload leaves a seller who can try the card again, never a card with no number.
 */
export async function addPanDocument(
  vendorId: string,
  input: { number: string; holderName: string; address: string; file: File; currentPan: string; gstin: string },
): Promise<void> {
  const problem = panProblem(input);
  if (problem) throw new Error(problem);
  const pan = normaliseTaxId(input.number);
  if (!input.currentPan) await writeOwnVendorRow({ id: vendorId, pan });
  await resubmitKycDocument(vendorId, "pan", input.file, {
    holder_name: input.holderName.trim().replace(/\s+/g, " "),
    address: input.address.trim().replace(/\s+/g, " "),
  });
}

/**
 * /kyc: add the catalogue (or replace it) as a set of files, one row each. A seller
 * registered before 2026-10-02 was never asked for one. Same bucket and path rules
 * as every KYC upload; if the database refused the rows the new objects are removed, and kept when the rows may be
 * saved (as resubmitKycDocument).
 */
export async function submitCatalogue(vendorId: string, files: File[]): Promise<void> {
  const paths: string[] = [];
  const progress: ReplaceProgress = { newRows: "no" };
  try {
    for (const f of files) paths.push(await uploadKycDocument(vendorId, f));
    await replaceVendorDocuments(vendorId, files.map((f, i) => ({
      vendor_id: vendorId, doc_type: "catalog", file_url: paths[i], detail: { name: f.name, mime: f.type },
    })), progress);
  } catch (err) {
    if (paths.length && progress.newRows === "no") await supabase.storage.from(KYC_BUCKET).remove(paths);
    throw err;
  }
}

// ── File rules for the registration documents ─────────────────
/** Scans and certificates: "jpeg, png or pdf formats up to 5MB", as the form says. */
export const KYC_FILE_TYPES = /^(image\/(jpeg|png)|application\/pdf)$/;
export const MAX_KYC_BYTES = 5 * 1024 * 1024;

/** A catalogue: PDF, Excel or CSV up to 10 MB, or images up to 5 MB; up to 5 files. */
export const CATALOGUE_ACCEPT =
  "application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/jpeg,image/png,image/webp";
export const MAX_CATALOGUE_FILES = 5;

/** Why a catalogue file can't be used, or null when it can. */
export function catalogueFileProblem(file: File): string | null {
  const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
  const isDoc = /^(application\/pdf|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/csv)$/.test(file.type)
    || /\.(xlsx|xls|csv)$/i.test(file.name);
  if (!isImage && !isDoc) return `${file.name} isn't a PDF, an Excel or CSV file, or an image.`;
  if (isImage && file.size > MAX_KYC_BYTES) return `${file.name} is over 5 MB.`;
  if (!isImage && file.size > 2 * MAX_KYC_BYTES) return `${file.name} is over 10 MB.`;
  return null;
}

/**
 * The drawn/typed signature from the contract step, as a PNG.
 *
 * Same private bucket as KYC and for the same reason — a signature is identity
 * material, not marketing collateral. Takes a data: URL because that is what
 * `canvas.toDataURL()` hands back.
 */
export async function uploadSignature(vendorId: string, dataUrl: string): Promise<string> {
  assertKycBucket(KYC_BUCKET);
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${vendorId}/contract/${Date.now()}.png`;
  const { error } = await supabase.storage
    .from(KYC_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/png" });
  if (error) throw error;
  return path;
}

// ─────────────────────────────────────────────────────────────
// The registration submit (2026-11-13): upload, then ONE database call.
//
// Every file is uploaded when the seller submits, never when it is picked, so an abandoned form leaves nothing in
// storage. Then submit_vendor_registration() writes the whole registration in one transaction, or nothing. If it
// refuses, the files this attempt uploaded point at nothing and are removed: but only after the database confirms
// no registration exists, because a reply lost after a successful commit would otherwise delete files a real
// registration now points at.
// ─────────────────────────────────────────────────────────────

/** The files a registration carries, as the form holds them. */
export interface RegistrationFiles {
  pan?: File | null;
  gst?: File | null;
  registration?: File | null;
  aadhaar?: File | null;
  taxId?: File | null;
  ownerId?: File | null;
  /** Staff-reference catalogue files (PDF, Excel, CSV, images). */
  catalogue: File[];
  /** The one PDF published to the store's catalogue section (through catalogue review). */
  cataloguePdf?: File | null;
  /** A drawn signature, as the canvas's data: URL. */
  signature?: string | null;
  premises: File[];
  productImages: File[];
}

/** What the uploads produced: every path (for cleanup) and the values the payload needs. */
export interface UploadedFiles {
  privatePaths: string[];
  publicFiles: { bucket: "product-images" | "catalogues"; path: string }[];
  pan?: string;
  gst?: string;
  registration?: string;
  aadhaar?: string;
  taxId?: string;
  ownerId?: string;
  catalogue: { path: string; name: string; mime: string }[];
  cataloguePdf?: { url: string; title: string };
  signature?: string;
  premises: string[];
  productImages: string[];
}

const uploadSuffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Run at most `limit` uploads at once: a phone on mobile data shouldn't open twenty at a time. */
async function inBatches<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** An empty record of uploads: the caller keeps it, so an upload that fails half-way still lists what landed. */
export function emptyUploads(): UploadedFiles {
  return { privatePaths: [], publicFiles: [], catalogue: [], premises: [], productImages: [] };
}

export async function uploadRegistrationFiles(uid: string, files: RegistrationFiles, up: UploadedFiles = emptyUploads()): Promise<UploadedFiles> {
  assertKycBucket(KYC_BUCKET);
  const privateFile = async (f: File): Promise<string> => {
    const path = await uploadKycDocument(uid, f);
    up.privatePaths.push(path);
    return path;
  };
  const publicImage = async (f: File, folder: "office" | "onboarding-product"): Promise<string> => {
    // JPEG, so the server can make the card thumbnail (product-thumbs reads JPEG and PNG, not WebP; review H-12).
    const { blob, ext } = await shrinkImage(f, 1600, "jpeg");
    const path = `${uid}/${folder}/${uploadSuffix()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, blob, { upsert: false, contentType: blob.type || undefined });
    if (error) throw error;
    up.publicFiles.push({ bucket: "product-images", path });
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  };

  if (files.pan) up.pan = await privateFile(files.pan);
  if (files.gst) up.gst = await privateFile(files.gst);
  if (files.registration) up.registration = await privateFile(files.registration);
  if (files.aadhaar) up.aadhaar = await privateFile(files.aadhaar);
  if (files.taxId) up.taxId = await privateFile(files.taxId);
  if (files.ownerId) up.ownerId = await privateFile(files.ownerId);
  up.catalogue = await inBatches(files.catalogue, 3, async (f) => ({ path: await privateFile(f), name: f.name, mime: f.type }));
  if (files.cataloguePdf) {
    const path = `${uid}/${uploadSuffix()}.pdf`;
    const { error } = await supabase.storage.from("catalogues").upload(path, files.cataloguePdf, { upsert: false, contentType: "application/pdf" });
    if (error) throw error;
    up.publicFiles.push({ bucket: "catalogues", path });
    const title = files.cataloguePdf.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Catalogue";
    up.cataloguePdf = { url: supabase.storage.from("catalogues").getPublicUrl(path).data.publicUrl, title };
  }
  if (files.signature) {
    up.signature = await uploadSignature(uid, files.signature);
    up.privatePaths.push(up.signature);
  }
  up.premises = await inBatches(files.premises, 3, (f) => publicImage(f, "office"));
  up.productImages = await inBatches(files.productImages, 3, (f) => publicImage(f, "onboarding-product"));
  return up;
}

export type SubmitResult = { status: "registered" | "pending_review"; supersededFiles: string[] };

/** The one call that registers the seller. A retry with the same submission id returns the first answer. */
export async function submitVendorRegistration(submissionId: string, payload: RegistrationPayload): Promise<SubmitResult> {
  const { data, error } = await supabase.rpc("submit_vendor_registration", {
    p_submission: submissionId,
    p: payload as unknown as Json,
  });
  if (error) throw error;
  const r = (data ?? {}) as { status?: string; superseded_files?: unknown; superseded_public?: unknown };
  // Only these two are a saved registration; anything else (a submission Cosora has since answered) is not a success.
  if (r.status !== "registered" && r.status !== "pending_review") {
    throw Object.assign(new Error("submission_closed"), { code: "P0001" });
  }
  const status = r.status;
  const supersededFiles = Array.isArray(r.superseded_files) ? r.superseded_files.filter((x): x is string => typeof x === "string") : [];
  // The files the new submission replaced (a resubmission), which nothing points at any more: best effort, never a
  // reason to fail the registration.
  if (supersededFiles.length) {
    const { error: se } = await supabase.storage.from(KYC_BUCKET).remove(supersededFiles);
    if (se) console.warn("[registration] superseded KYC files not removed:", se.message);
  }
  const publicFiles = Array.isArray(r.superseded_public)
    ? (r.superseded_public as { bucket?: unknown; path?: unknown }[]).filter(
        (f): f is { bucket: "product-images" | "catalogues"; path: string } =>
          (f.bucket === "product-images" || f.bucket === "catalogues") && typeof f.path === "string")
    : [];
  for (const bucket of ["product-images", "catalogues"] as const) {
    const paths = publicFiles.filter((f) => f.bucket === bucket).map((f) => f.path);
    if (!paths.length) continue;
    const { error: pe } = await supabase.storage.from(bucket).remove(paths);
    if (pe) console.warn(`[registration] superseded ${bucket} files not removed:`, pe.message);
  }
  return { status, supersededFiles };
}

/** Which files a submit sends, by identity: equal signatures mean the same picks (for reusing a lost submit's uploads). */
export function registrationFilesSignature(files: RegistrationFiles): string {
  const id = (f: File | null | undefined) => (f ? [f.name, f.size, f.lastModified, f.type] : null);
  return JSON.stringify({
    pan: id(files.pan), gst: id(files.gst), registration: id(files.registration), aadhaar: id(files.aadhaar),
    taxId: id(files.taxId), ownerId: id(files.ownerId), catalogue: files.catalogue.map(id),
    cataloguePdf: id(files.cataloguePdf), signature: files.signature ?? null,
    premises: files.premises.map(id), productImages: files.productImages.map(id),
  });
}

/**
 * True when the database answered with a refusal (an SQLSTATE): the transaction rolled back, so nothing this
 * attempt sent was saved. A network failure or a lost reply has no code: the registration may have been saved.
 */
export function isServerRefusal(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}

/**
 * After a refused submit: remove what this attempt uploaded, ONLY once the database says the account has no
 * registration from it. Any doubt (the read fails, or a registration exists) keeps the files: a stray file is
 * cheaper than a registration pointing at deleted documents.
 */
export async function cleanupRegistrationUploads(uploaded: UploadedFiles, submissionId: string): Promise<void> {
  let safe = false;
  try {
    const r = await fetchMySellerRegistration();
    safe = (r.status === "none" || r.status === "rejected") && r.latestSubmission !== submissionId;
  } catch {
    safe = false;
  }
  if (!safe) return;
  if (uploaded.privatePaths.length) {
    const { error } = await supabase.storage.from(KYC_BUCKET).remove(uploaded.privatePaths);
    if (error) console.warn("[registration] uploads not removed:", error.message);
  }
  for (const bucket of ["product-images", "catalogues"] as const) {
    const paths = uploaded.publicFiles.filter((f) => f.bucket === bucket).map((f) => f.path);
    if (paths.length) {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) console.warn(`[registration] ${bucket} uploads not removed:`, error.message);
    }
  }
}

export type { OwnerIdKind, RegistrationPayload };
