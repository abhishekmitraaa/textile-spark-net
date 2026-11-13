// ─────────────────────────────────────────────────────────────
// Seller registration: the payload, its checks, and what each refusal means (2026-11-13).
//
// The database decides (submit_vendor_registration, migration 20261113100100). This file is the courtesy copy so
// the form can stop a mistake before anything uploads, and the one place a refusal key becomes a sentence.
// Pure: no network, no React. scripts/registration-validation-check.mjs runs it on the database harness's cases.
// ─────────────────────────────────────────────────────────────
import { isValidGstin, isValidPan, normaliseTaxId, panOfGstin } from "@/lib/taxIds";
import { stateCodeFor } from "@/data/indiaStates";
import { PRIMARY_TYPES, CAPABILITIES } from "@/data/vendorTypes";
import { COUNTRIES } from "@/data/countries";

/** The Supplier Agreement version the database accepts (src/lib/supplierAgreement.ts holds the same value). */
export const REGISTRATION_AGREEMENT_VERSION = "2026-09-v1";

/** The kinds of business registration an Indian seller gives (vendor_documents.detail.kind). */
export type BusinessRegistrationKind = "udyam" | "incorporation" | "shop_establishment" | "partnership" | "other";

export const BUSINESS_REGISTRATION_KINDS: {
  id: BusinessRegistrationKind;
  label: string;
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

export type OwnerIdKind = "passport" | "national_id";

/** What submit_vendor_registration() takes. File fields hold storage paths (private) or public URLs. */
export interface RegistrationPayload {
  business_name: string;
  country_code: string;
  business_phone: string;
  whatsapp: string | null;
  website: string | null;
  whatsapp_updates: boolean;
  address: { line: string | null; area: string; city: string; state: string | null; postal_code: string; landmark: string | null };
  owner: { name: string; email: string };
  primary_type: string;
  capabilities: string[];
  categories: string[];
  premises_photos: string[];
  documents: {
    pan?: { number: string; holder_name: string; address: string; path: string } | null;
    gst?: { number: string; path: string } | null;
    registration: { kind: BusinessRegistrationKind | "foreign_registration"; number: string | null; path: string } | null;
    aadhaar?: { path: string } | null;
    tax_id?: { number: string; path: string } | null;
    owner_id?: { kind: OwnerIdKind; path: string } | null;
    catalogue: { path: string; name: string; mime: string }[];
    catalogue_pdf: { url: string; title: string } | null;
  };
  product: {
    name: string; price: number; unit: string; moq: number | null; category_id: string | null;
    fabric: string | null; gsm: string | null; sizes: string[]; colour: string | null; images: string[];
  } | null;
  contract: { signed_name: string; signature_path: string | null; agreement_version: string };
}

/** What each refusal means to the seller. The keys are the database's messages (22023 / P0001 / 42501). */
export const REGISTRATION_ERROR_TEXT: Record<string, string> = {
  invalid_payload: "Something in the form didn't come through. Check each step and submit again.",
  payload_too_large: "The registration is too large to send. Shorten long answers and submit again.",
  invalid_country: "Choose the country your business is registered in.",
  invalid_business_name: "Enter your business name (2 to 120 characters).",
  invalid_phone: "Enter a complete business phone number.",
  invalid_whatsapp: "Enter a complete WhatsApp number, with its country code.",
  invalid_website: "Enter your website's full address, like https://yourbusiness.com, or choose None.",
  invalid_owner_name: "Enter the owner's full name.",
  invalid_email: "Enter a working email address, like name@business.com.",
  invalid_address: "Enter the area, sector or locality of your business.",
  invalid_city: "Enter your city.",
  invalid_state: "Choose your state from the list.",
  invalid_postal_code: "Enter a valid pincode or postal code.",
  invalid_primary_type: "Choose what kind of business you are.",
  invalid_capability: "One of the capabilities isn't on the list. Choose them again.",
  invalid_categories: "Add at least one business category.",
  missing_premises_photo: "Add at least one photo of your business premises.",
  premises_photo_limit: "A store shows up to 12 premises photos.",
  invalid_file: "One of your files didn't upload properly. Remove it, add it again and submit.",
  invalid_pan: "Check your PAN, the name on it and the address.",
  invalid_gstin: "That GSTIN isn't valid. Check it against your GST certificate.",
  gstin_pan_mismatch: "The GSTIN doesn't match your PAN. A GSTIN contains the PAN it was issued for.",
  invalid_registration: "Check your business registration: its kind and its number.",
  missing_document: "A required document is missing. Check the documents step.",
  invalid_product: "Check your first product: a name, a price above zero, a whole-number MOQ and at least one photo.",
  too_many_products: "Your plan's listing limit is reached, so the first product can't be added.",
  catalogue_limit: "Your plan's catalogue allowance is used. Upgrade to add another catalogue.",
  invalid_contract: "Type your full name to sign the Supplier Agreement.",
  already_registered: "This account is already registered as a seller.",
  awaiting_approval: "Your registration is waiting for Cosora's approval.",
  submission_closed: "Cosora has already answered this registration. Check your details and submit again.",
  account_inactive: "This account can't register right now. Contact Cosora support.",
};

/** A refusal key → its sentence, or null when the message isn't one of ours. */
export function registrationErrorText(message: string): string | null {
  return Object.prototype.hasOwnProperty.call(REGISTRATION_ERROR_TEXT, message) ? REGISTRATION_ERROR_TEXT[message] : null;
}

/**
 * A phone number as E.164, or null. Digits are cleaned BEFORE any length is checked (pasting "+91 98765 43210"
 * into a 10-character box used to store 9198765). India: a 10-digit number, a leading 0 or 91 dropped, landlines
 * with their STD code allowed. Elsewhere: the full international number with its "+", 8 to 15 digits, not +91.
 */
export function normalisePhone(raw: string, countryCode: string): string | null {
  const trimmed = (raw ?? "").trim();
  let digits = trimmed.replace(/\D/g, "");
  if (countryCode === "IN") {
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    return /^[1-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
  }
  if (!trimmed.startsWith("+") || digits.startsWith("91")) return null;
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

export function isValidEmail(value: string): boolean {
  const v = (value ?? "").trim();
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(v);
}

/** A website as an https:// address, or null when it isn't one. http:// is upgraded; a bare host gets https://. */
export function normaliseWebsite(value: string): string | null {
  let v = (value ?? "").trim();
  if (!v) return null;
  v = v.replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(v)) v = `https://${v}`;
  return v.length <= 200 && /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?(\/\S*)?$/.test(v) ? v : null;
}

const text = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const len = (v: string | null | undefined, min: number, max: number) => text(v).length >= min && text(v).length <= max;

export interface RegistrationProblem { field: string; key: string }

/** The first problem with a payload (the same order the database checks in), or null. */
export function validateRegistration(p: RegistrationPayload): RegistrationProblem | null {
  const bad = (field: string, key: string): RegistrationProblem => ({ field, key });
  const india = p.country_code === "IN";
  if (!COUNTRIES.some((c) => c.code === p.country_code)) return bad("country_code", "invalid_country");
  if (!len(p.business_name, 2, 120)) return bad("business_name", "invalid_business_name");
  if (!p.business_phone || (india ? !/^\+91\d{10}$/.test(p.business_phone) : !/^\+[1-9]\d{7,14}$/.test(p.business_phone) || p.business_phone.startsWith("+91"))) {
    return bad("business_phone", "invalid_phone");
  }
  if (p.whatsapp && !/^\+[1-9]\d{7,14}$/.test(p.whatsapp)) return bad("whatsapp", "invalid_whatsapp");
  if (p.website && normaliseWebsite(p.website) !== p.website) return bad("website", "invalid_website");
  if (!len(p.owner.name, 2, 120)) return bad("owner.name", "invalid_owner_name");
  if (!isValidEmail(p.owner.email)) return bad("owner.email", "invalid_email");
  if (!len(p.address.area, 1, 120)) return bad("address.area", "invalid_address");
  if (!len(p.address.city, 2, 80)) return bad("address.city", "invalid_city");
  if (india) {
    if (!stateCodeFor(p.address.state ?? "")) return bad("address.state", "invalid_state");
    if (!/^[1-9]\d{5}$/.test(text(p.address.postal_code))) return bad("address.postal_code", "invalid_postal_code");
  } else {
    if (text(p.address.state).length > 80) return bad("address.state", "invalid_state");
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(text(p.address.postal_code))) return bad("address.postal_code", "invalid_postal_code");
  }
  if (!PRIMARY_TYPES.some((t) => t.value === p.primary_type)) return bad("primary_type", "invalid_primary_type");
  if (p.capabilities.some((c) => !CAPABILITIES.some((k) => k.value === c))) return bad("capabilities", "invalid_capability");
  const cats = p.categories.map(text).filter(Boolean);
  if (cats.length < 1 || cats.length > 20 || cats.some((c) => c.length > 80)) return bad("categories", "invalid_categories");
  if (p.premises_photos.length === 0) return bad("premises_photos", "missing_premises_photo");
  if (p.premises_photos.length > 12) return bad("premises_photos", "premises_photo_limit");

  const d = p.documents;
  if (india) {
    if (d.tax_id || d.owner_id) return bad("documents", "invalid_registration");
    if (!d.pan || !d.registration || !d.aadhaar) return bad("documents", "missing_document");
    const pan = normaliseTaxId(d.pan.number);
    if (!isValidPan(pan) || !len(d.pan.holder_name, 3, 120) || !len(d.pan.address, 5, 300)) return bad("documents.pan", "invalid_pan");
    if (d.gst) {
      const gstin = normaliseTaxId(d.gst.number);
      if (!isValidGstin(gstin)) return bad("documents.gst", "invalid_gstin");
      if (panOfGstin(gstin) !== pan) return bad("documents.gst", "gstin_pan_mismatch");
    }
    const kind = BUSINESS_REGISTRATION_KINDS.find((k) => k.id === d.registration?.kind);
    const number = text(d.registration.number).toUpperCase();
    if (!kind || (kind.numberRequired && !kind.pattern?.test(number)) || number.length > 60) {
      return bad("documents.registration", "invalid_registration");
    }
  } else {
    if (d.pan || d.gst || d.aadhaar) return bad("documents", "invalid_registration");
    if (!d.registration || !d.owner_id) return bad("documents", "missing_document");
    if (d.registration.kind !== "foreign_registration" || !len(d.registration.number, 1, 60)
        || !["passport", "national_id"].includes(d.owner_id.kind)
        || (d.tax_id && !len(d.tax_id.number, 2, 40))) {
      return bad("documents.registration", "invalid_registration");
    }
  }
  if (d.catalogue.length > 5) return bad("documents.catalogue", "invalid_file");

  if (p.product) {
    const pr = p.product;
    if (!len(pr.name, 2, 140) || !(pr.price > 0) || pr.price > 10_000_000
        || (pr.moq != null && (!Number.isInteger(pr.moq) || pr.moq < 1 || pr.moq > 10_000_000))
        || pr.images.length < 1 || pr.images.length > 6 || pr.sizes.length > 40) {
      return bad("product", "invalid_product");
    }
  }
  if (!p.product && d.catalogue.length === 0 && !d.catalogue_pdf) return bad("product", "missing_document");
  if (!len(p.contract.signed_name, 2, 120) || p.contract.agreement_version !== REGISTRATION_AGREEMENT_VERSION) {
    return bad("contract", "invalid_contract");
  }
  return null;
}
