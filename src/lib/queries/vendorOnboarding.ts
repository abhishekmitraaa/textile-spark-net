import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database.types";
import { resolveCategoryId } from "@/lib/queries/products";
import { SUPPLIER_AGREEMENT_VERSION } from "@/lib/supplierAgreement";
import { syncProfileScore } from "@/lib/queries/vendorDashboard";
import { writeOwnVendorRow } from "@/lib/queries/vendorStore";

// ─────────────────────────────────────────────────────────────
// Persist the vendor registration (8-step Onboarding) to the DB.
// Text/identity → vendor_profiles; KYC numbers + the uploaded scan →
// vendor_documents; the step-7 product becomes a real under_review listing
// with its images. Completing onboarding also flags the account as an
// onboarded seller.
//
// Everything here is written from files the vendor actually uploaded to
// storage first — the form used to hand blob: URLs straight to the DB, which
// die on reload and point at nothing for anyone else.
// ─────────────────────────────────────────────────────────────

export interface OnboardingProduct {
  name: string;
  price?: string;
  /** Selling unit for `price` — pieces/kg/meters/sets/pairs. */
  unit?: string;
  moq?: string;
  fabric?: string;
  gsm?: string;
  category?: string | null;
  sizes?: string[];
  /**
   * `products.colour` is ONE text value across this codebase (see
   * resolveColour in Upload.tsx, which truncates a multiselect the same way).
   * The onboarding chip picker is multi-select, so the first pick is the one
   * that lands on the listing and the form says so out loud rather than
   * silently dropping the rest.
   */
  colours?: string[];
  /** Public storage URLs, already uploaded. Become product_images rows. */
  images?: string[];
}

/** The kinds of business registration onboarding accepts (vendor_documents.detail.kind). */
export type BusinessRegistrationKind = "udyam" | "incorporation" | "shop_establishment" | "partnership" | "other";

export const BUSINESS_REGISTRATION_KINDS: {
  id: BusinessRegistrationKind;
  label: string;
  /** What the number is called, and whether it's required. */
  numberLabel: string;
  numberRequired: boolean;
  placeholder: string;
  /** A format check only: nothing here can look a number up. */
  pattern?: RegExp;
  patternHint?: string;
}[] = [
  {
    id: "udyam", label: "Udyam (MSME) registration certificate", numberLabel: "Udyam registration number",
    numberRequired: true, placeholder: "UDYAM-GJ-01-0000001",
    pattern: /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/, patternHint: "A Udyam number looks like UDYAM-GJ-01-0000001.",
  },
  {
    id: "incorporation", label: "Certificate of incorporation (company or LLP)", numberLabel: "CIN or LLPIN",
    numberRequired: true, placeholder: "U17110GJ2015PTC012345",
    pattern: /^([LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|[A-Z]{3}-\d{4})$/,
    patternHint: "A CIN has 21 characters (for example U17110GJ2015PTC012345); an LLPIN looks like AAA-1234.",
  },
  { id: "shop_establishment", label: "Shop and establishment licence", numberLabel: "Licence number (optional)", numberRequired: false, placeholder: "" },
  { id: "partnership", label: "Partnership deed", numberLabel: "Registration number, if registered (optional)", numberRequired: false, placeholder: "" },
  { id: "other", label: "Other business registration", numberLabel: "Registration number (optional)", numberRequired: false, placeholder: "" },
];

export interface VendorOnboardingPayload {
  businessName: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  addressLine?: string;
  area?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  landmark?: string;
  ownerName?: string;
  ownerEmail?: string;
  country?: string;
  pan?: string;
  gstin?: string;
  /** CIN or LLPIN, when the business registration is a certificate of incorporation (vendor_profiles.cin). */
  cin?: string;
  /** Business categories (vendor_profiles.category). Empty = invisible to category search. */
  category?: string[];
  /** Public storage URLs of the premises photos (vendor_profiles.office_photos). */
  officePhotos?: string[];
  /** Storage PATH of the uploaded PAN scan (business-docs) → vendor_documents.file_url. */
  panFileUrl?: string;
  /** Storage PATH of the uploaded GST certificate (business-docs). */
  gstFileUrl?: string;
  /**
   * The business registration (Seller Registration FAQ: "Business registration (or
   * MSME/Udyam)", 2026-10-02): which kind, its number, and the uploaded certificate.
   */
  businessRegistration?: { kind: BusinessRegistrationKind; number?: string; fileUrl: string };
  /**
   * The owner's MASKED Aadhaar (first 8 digits hidden), with the time they agreed to
   * share it. The Aadhaar number itself is never asked for or stored.
   */
  aadhaar?: { fileUrl: string; consentAt: string };
  /** Catalogue files (PDF, Excel, CSV or images). A first product can stand in for these. */
  catalogue?: { fileUrl: string; name: string; mime: string }[];
  /** The signed supplier agreement. Written in the same call as the profile, so
   *  a vendor with onboarding_complete = true always has a contract on file. */
  contract?: {
    signedName: string;
    /** business-docs path of the signature PNG, when one was drawn. */
    signatureUrl?: string;
  };
  product?: OnboardingProduct;
}

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

export async function replaceVendorDocuments(
  vendorId: string,
  docs: VendorDocumentInsert[],
): Promise<void> {
  if (!docs.length) return;
  const docTypes = docs.map((d) => d.doc_type);

  const { data: superseded, error: re } = await supabase
    .from("vendor_documents")
    .select("id, file_url")
    .eq("vendor_id", vendorId)
    .in("doc_type", docTypes);
  if (re) throw re;

  const { error: ie } = await supabase
    .from("vendor_documents")
    .insert(docs.map((d) => ({ ...d, detail: (d.detail ?? {}) as Json })));
  if (ie) throw ie;

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

export async function saveVendorOnboarding(vendorId: string, p: VendorOnboardingPayload): Promise<void> {
  // An update, or an insert on a first registration, never an updating upsert:
  // the private columns written here aren't client-readable (writeOwnVendorRow).
  await writeOwnVendorRow(
    {
      id: vendorId,
      brand_name: p.businessName || null,
      phone: p.phone || null,
      whatsapp: p.whatsapp || null,
      website: p.website || null,
      address_line: p.addressLine || null,
      area: p.area || null,
      city: p.city || null,
      state: p.state || null,
      postal_code: p.postalCode || null,
      landmark: p.landmark || null,
      owner_name: p.ownerName || null,
      owner_email: p.ownerEmail || null,
      country: p.country || "India",
      pan: p.pan || null,
      gstin: p.gstin || null,
      cin: p.cin || null,
      // Arrays are written as-is: an empty array is a meaningful "none yet",
      // not the same thing as null, so the `|| null` used for empty strings
      // above would be wrong here.
      ...(p.category ? { category: p.category } : {}),
      ...(p.officePhotos ? { office_photos: p.officePhotos } : {}),
      onboarding_complete: true,
    },
  );

  // Record which KYC documents were supplied, with the uploaded scan where
  // there is one. `verified` stays false: an admin flips it after review — this
  // app has no way to verify a PAN and must not claim it did.
  //
  // The set is the Seller Registration FAQ's (Andy, 2026-10-01/02): PAN card, GST
  // certificate (when registered for GST), a business registration (Udyam/MSME, an
  // incorporation certificate, a shop licence or a partnership deed), the owner's
  // Aadhaar, and a product catalogue, for which a first product can stand in.
  //
  // Aadhaar is the MASKED copy only (first 8 digits hidden, as UIDAI's masked Aadhaar
  // shows it), with the moment the owner agreed to share it. The number is never
  // asked for or stored: Aadhaar Act 2016 / UIDAI rules constrain what an entity
  // that isn't an authorised KUA/AUA may keep. Counsel to confirm before launch
  // (ToDo.md); the database refuses an Aadhaar row not marked masked.
  const docs: VendorDocumentInsert[] = [];
  if (p.pan) docs.push({ vendor_id: vendorId, doc_type: "pan", file_url: p.panFileUrl ?? null });
  if (p.gstin) docs.push({ vendor_id: vendorId, doc_type: "gst", file_url: p.gstFileUrl ?? null });
  if (p.businessRegistration) {
    docs.push({
      vendor_id: vendorId, doc_type: "business_registration", file_url: p.businessRegistration.fileUrl,
      detail: { kind: p.businessRegistration.kind, ...(p.businessRegistration.number ? { number: p.businessRegistration.number } : {}) },
    });
  }
  if (p.aadhaar) {
    docs.push({ vendor_id: vendorId, doc_type: "aadhaar", file_url: p.aadhaar.fileUrl, detail: { masked: true, consent_at: p.aadhaar.consentAt } });
  }
  for (const c of p.catalogue ?? []) {
    docs.push({ vendor_id: vendorId, doc_type: "catalog", file_url: c.fileUrl, detail: { name: c.name, mime: c.mime } });
  }
  await replaceVendorDocuments(vendorId, docs);
  // The step-7 product becomes a real listing (buyers see it once approved).
  if (p.product?.name) {
    const category_id = await resolveCategoryId(p.product.category, p.product.name);
    const { data: created, error: prErr } = await supabase
      .from("products")
      .insert({
        vendor_id: vendorId,
        name: p.product.name,
        price_value: p.product.price ? Number(p.product.price) : null,
        currency: "₹",
        category_id,
        moq: p.product.moq || "2",
        unit: p.product.unit || null,
        fabric: p.product.fabric || null,
        gsm: p.product.gsm || null,
        sizes: p.product.sizes?.length ? p.product.sizes : null,
        colour: p.product.colours?.[0] ?? null,
        status: "under_review",
      })
      .select("id")
      .single();
    if (prErr) throw prErr;

    const images = p.product.images ?? [];
    if (created && images.length > 0) {
      const { error: imgErr } = await supabase
        .from("product_images")
        .insert(images.map((url, i) => ({ product_id: created.id, url, position: i })));
      if (imgErr) throw imgErr;
    }
  }

  // The signed supplier agreement. Deliberately inside this function rather
  // than alongside it: onboarding_complete = true and "no contract on file"
  // must not be a reachable combination, so the same call that sets the flag
  // writes the record.
  if (p.contract?.signedName?.trim()) {
    // One signature per (vendor, agreement version). A retried submit against
    // the SAME agreement text is a no-op, not a second signature: the table has
    // no UPDATE or DELETE policy for anyone, so a duplicate written here could
    // never be removed by any means. A re-sign after SUPPLIER_AGREEMENT_VERSION
    // changes is a different version and still inserts — that is a genuinely new
    // signature event.
    //
    // `trg_vendor_contracts_one_per_version` enforces this in the database and
    // is the real guarantee; this check just means the normal retry path never
    // depends on the trigger firing. It is not an `.upsert(onConflict:…)`
    // because there is no unique index to conflict on — the historical
    // duplicate this bug produced is deliberately preserved, and a UNIQUE
    // constraint cannot be created over it.
    const { data: alreadySigned, error: cse } = await supabase
      .from("vendor_contracts")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("agreement_version", SUPPLIER_AGREEMENT_VERSION)
      .limit(1)
      .maybeSingle();
    if (cse) throw cse;

    if (!alreadySigned) {
      const { error: ce } = await supabase.from("vendor_contracts").insert({
        vendor_id: vendorId,
        signed_name: p.contract.signedName.trim(),
        signature_url: p.contract.signatureUrl ?? null,
        agreement_version: SUPPLIER_AGREEMENT_VERSION,
      });
      if (ce) throw ce;
    }
  }

  // Mark the account as an onboarded seller (best-effort; non-blocking).
  await supabase.from("profiles").update({ active_role: "seller", onboarded: true }).eq("id", vendorId);

  // Score the rows that now exist, using the same function every screen reads.
  // LAST, on purpose: `syncProfileScore` counts products, so the step-7 listing
  // has to be inserted before it runs.
  //
  // Non-blocking, matching the `profiles` update above and the dashboard's own
  // write-back: the vendor has a completed registration either way, the next
  // dashboard load recomputes this column regardless, and failing a submit that
  // already persisted everything real — over a derived integer — would be the
  // worse outcome. It warns rather than passing silently.
  try {
    await syncProfileScore(vendorId);
  } catch (e) {
    console.warn("[vendorOnboarding] profile_score sync failed:", e);
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
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${vendorId}/kyc/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from(KYC_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

/**
 * After a FAILED onboarding submit: remove the KYC scans that submit uploaded
 * but that no `vendor_documents` row points at (Master Prompt 8, Phase 4).
 *
 * Only unreferenced ones: saveVendorOnboarding() can fail AFTER it has written
 * the document rows (for example on the product insert), and removing those
 * objects would leave live rows pointing at missing files. A referenced upload
 * is superseded, and removed, by the next successful submit.
 */
export async function discardUnreferencedKycUploads(vendorId: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { data } = await supabase
    .from("vendor_documents")
    .select("file_url")
    .eq("vendor_id", vendorId)
    .in("file_url", paths);
  const referenced = new Set((data ?? []).map((d) => d.file_url as string));
  const loose = paths.filter((p) => !referenced.has(p));
  if (loose.length) {
    const { error } = await supabase.storage.from(KYC_BUCKET).remove(loose);
    if (error) console.warn("[vendorOnboarding] unreferenced KYC uploads not removed:", error.message);
  }
}

/**
 * /kyc: replace a REJECTED document with a new scan (Master Prompt 8, Phase 3).
 *
 * Until this existed a rejected vendor had no way back: /kyc said "contact
 * support", and onboarding, the only upload path, is closed once
 * onboarding_complete is set. Uploads through uploadKycDocument(), so the
 * bucket and `${vendorId}/kyc/...` path rules are the same ones onboarding
 * obeys, then swaps the row through replaceVendorDocuments(). If the row
 * write fails, the new object is referenced by nothing, so it is removed
 * rather than left as an orphan identity scan.
 */
export async function resubmitKycDocument(
  vendorId: string, docType: string, file: File, detail?: Record<string, unknown>,
): Promise<void> {
  const path = await uploadKycDocument(vendorId, file);
  try {
    await replaceVendorDocuments(vendorId, [{ vendor_id: vendorId, doc_type: docType, file_url: path, detail }]);
  } catch (err) {
    await supabase.storage.from(KYC_BUCKET).remove([path]);
    throw err;
  }
}

/**
 * /kyc: add the catalogue (or replace it) as a set of files, one row each. A seller
 * registered before 2026-10-02 was never asked for one. Same bucket and path rules
 * as every KYC upload; if the rows can't be written the new objects are removed.
 */
export async function submitCatalogue(vendorId: string, files: File[]): Promise<void> {
  const paths: string[] = [];
  try {
    for (const f of files) paths.push(await uploadKycDocument(vendorId, f));
    await replaceVendorDocuments(vendorId, files.map((f, i) => ({
      vendor_id: vendorId, doc_type: "catalog", file_url: paths[i], detail: { name: f.name, mime: f.type },
    })));
  } catch (err) {
    if (paths.length) await supabase.storage.from(KYC_BUCKET).remove(paths);
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

/** One image for the step-7 product. Mirrors Upload.tsx's `<vendor>/<key>/<i>` shape. */
export async function uploadOnboardingProductImage(vendorId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${vendorId}/onboarding-product/${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
