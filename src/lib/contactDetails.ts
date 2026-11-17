// The Business Profile's Contact Details sheet: what changed, and whether it is valid (Seller Home audit SH-041–043,
// 2026-11-17). Pure functions, so scripts/contact-details-check.mjs can run them.
//
// - Only what the seller changed is saved (claude.md: "A form save sends only the fields the user changed"). The sheet
//   used to save all eleven fields from a read whose error was never checked, so a failed private-details read plus
//   one edited email blanked the phone, WhatsApp, owner and address.
// - A changed phone, WhatsApp, email, website or postal code passes the same rules as registration
//   (src/lib/registrationValidation.ts); the database checks the same columns (vendor_profiles_contact_checks).
// - A seller outside India types a region; in India the state comes from the list (ranking compares state codes).

import { isValidEmail, normalisePhone, normaliseWebsite } from "@/lib/registrationValidation";
import { stateCodeFor } from "@/data/indiaStates";

export type ContactForm = {
  ownerName: string; phone: string; whatsapp: string; ownerEmail: string; website: string;
  addressLine: string; area: string; landmark: string; city: string; state: string; postalCode: string;
};

export const CONTACT_FIELDS: (keyof ContactForm)[] = [
  "ownerName", "phone", "whatsapp", "ownerEmail", "website", "addressLine", "area", "landmark", "city", "state", "postalCode",
];

/** The fields whose trimmed value differs from what loaded. An emptied field is a change (saved as NULL). */
export function contactChanges(initial: ContactForm, form: ContactForm): Partial<ContactForm> {
  const out: Partial<ContactForm> = {};
  for (const k of CONTACT_FIELDS) {
    const next = (form[k] ?? "").trim();
    if (next !== (initial[k] ?? "").trim()) out[k] = next;
  }
  return out;
}

/**
 * Checks the changed fields and returns them as they are stored (a phone as +E.164, a website as https://), or the
 * first problem in words the sheet shows. Unchanged fields are never judged: a value saved before these checks stays
 * until its owner edits it, as with GSTIN and PAN.
 */
export function checkContactChanges(
  changes: Partial<ContactForm>, countryCode: string,
): { ok: true; patch: Partial<ContactForm> } | { ok: false; field: keyof ContactForm; message: string } {
  const india = (countryCode || "IN") === "IN";
  const patch: Partial<ContactForm> = { ...changes };
  const fail = (field: keyof ContactForm, message: string) => ({ ok: false as const, field, message });

  if (changes.ownerName !== undefined && changes.ownerName.length > 120) return fail("ownerName", "Keep the owner's name under 120 characters.");
  for (const k of ["phone", "whatsapp"] as const) {
    const v = changes[k];
    if (v === undefined || v === "") continue;
    const e164 = normalisePhone(v, india ? "IN" : "XX");
    if (!e164) {
      return fail(k, india
        ? `Enter a 10-digit Indian ${k === "phone" ? "phone" : "WhatsApp"} number.`
        : `Enter the full international ${k === "phone" ? "phone" : "WhatsApp"} number, starting with + and the country code.`);
    }
    patch[k] = e164;
  }
  if (changes.ownerEmail !== undefined && changes.ownerEmail !== "" && !isValidEmail(changes.ownerEmail)) {
    return fail("ownerEmail", "Enter an email address like you@business.in.");
  }
  if (changes.website !== undefined && changes.website !== "") {
    const site = normaliseWebsite(changes.website);
    if (!site) return fail("website", "Enter your website's address, like yourbusiness.in.");
    patch.website = site;
  }
  if (changes.state !== undefined) {
    if (india && !stateCodeFor(changes.state)) return fail("state", "Pick the state your business is in.");
    if (!india && changes.state.length > 80) return fail("state", "Keep the state or region under 80 characters.");
  }
  if (changes.postalCode !== undefined && changes.postalCode !== "") {
    const ok = india ? /^[1-9]\d{5}$/.test(changes.postalCode) : /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(changes.postalCode);
    if (!ok) return fail("postalCode", india ? "Enter a 6-digit PIN code." : "Enter a valid postal code.");
  }
  for (const k of ["addressLine", "area", "landmark", "city"] as const) {
    if (changes[k] !== undefined && changes[k]!.length > 200) return fail(k, "Keep each address line under 200 characters.");
  }
  return { ok: true, patch };
}
