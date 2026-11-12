#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// "The registration form and submit_vendor_registration() agree" (2026-11-13).
//
// src/lib/registrationValidation.ts checks the form before anything uploads; the database checks it again and
// decides. This runs the browser copy on the cases the database harness uses (scripts/onboarding/registration.sql)
// so the two can't drift silently.
//
//   node scripts/registration-validation-check.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-registration-"));
const outfile = path.join(dir, "registrationValidation.mjs");
await build({
  entryPoints: ["src/lib/registrationValidation.ts"], outfile, format: "esm", platform: "node", bundle: true,
  logLevel: "silent", alias: { "@": path.resolve("src") },
});
const v = await import(pathToFileURL(outfile).href);
const { errorMessage } = await (async () => {
  const out2 = path.join(dir, "errorMessage.mjs");
  await build({ entryPoints: ["src/lib/errorMessage.ts"], outfile: out2, format: "esm", platform: "node", bundle: true,
                logLevel: "silent", alias: { "@": path.resolve("src") } });
  return import(pathToFileURL(out2).href);
})();

let failed = 0;
let n = 0;
function eq(label, got, want) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

// Phones: digits are cleaned BEFORE any length cut (the audit's paste bug).
eq("+91 98765 43210", v.normalisePhone("+91 98765 43210", "IN"), "+919876543210");
eq("98765 43210", v.normalisePhone("98765 43210", "IN"), "+919876543210");
eq("0261 2345678 landline", v.normalisePhone("0261 2345678", "IN"), "+912612345678");
eq("12345 too short", v.normalisePhone("12345", "IN"), null);
eq("9198765 (the corrupted paste)", v.normalisePhone("9198765", "IN"), null);
eq("+1 415 555 0100 (US)", v.normalisePhone("+1 415 555 0100", "US"), "+14155550100");
eq("overseas without + refused", v.normalisePhone("4155550100", "US"), null);
eq("overseas +91 refused", v.normalisePhone("+91 98765 43210", "AE"), null);

// Email and website.
eq("email a", v.isValidEmail("a"), false);
eq("email ok", v.isValidEmail("owner@happy.example"), true);
eq("website not a url", v.normaliseWebsite("not a url"), null);
eq("website bare host", v.normaliseWebsite("review.example"), "https://review.example");
eq("website http upgraded", v.normaliseWebsite("http://shop.example/about"), "https://shop.example/about");
eq("website blank", v.normaliseWebsite("  "), null);

// The whole payload: the first problem, by field and key (the database's keys).
const good = {
  business_name: "Happy Mills", country_code: "IN", business_phone: "+912612345678", whatsapp: "+919876543210",
  website: null, whatsapp_updates: false,
  address: { line: "12", area: "Udhna", city: "Surat", state: "Gujarat", postal_code: "394210", landmark: null },
  owner: { name: "Happy Owner", email: "owner@happy.example" },
  primary_type: "manufacturer", capabilities: ["private_label"], categories: ["Garment Manufacturer"],
  premises_photos: ["pending"],
  documents: {
    pan: { number: "ABCPE1234F", holder_name: "Happy Owner", address: "12 Udhna, Surat", path: "pending" },
    gst: null, registration: { kind: "shop_establishment", number: null, path: "pending" }, aadhaar: { path: "pending" },
    catalogue: [], catalogue_pdf: null,
  },
  product: { name: "Kurta", price: 450, unit: "pieces", moq: 50, category_id: null, fabric: null, gsm: null,
             sizes: [], colour: null, images: ["pending"] },
  contract: { signed_name: "Happy Owner", signature_path: null, agreement_version: "2026-09-v1" },
};
const set = (p, k, val) => { const c = structuredClone(good); let o = c; const ks = k.split("."); for (const x of ks.slice(0, -1)) o = o[x]; o[ks.at(-1)] = val; return c; };
eq("good payload", v.validateRegistration(good), null);
eq("email a", v.validateRegistration(set(good, "owner.email", "a"))?.key, "invalid_email");
eq("state Gujarat State", v.validateRegistration(set(good, "address.state", "Gujarat State"))?.key, "invalid_state");
eq("blank city", v.validateRegistration(set(good, "address.city", " "))?.key, "invalid_city");
eq("price -50", v.validateRegistration(set(good, "product.price", -50))?.key, "invalid_product");
eq("moq 2.5", v.validateRegistration(set(good, "product.moq", 2.5))?.key, "invalid_product");
eq("no product image", v.validateRegistration(set(good, "product.images", []))?.key, "invalid_product");
eq("no premises photo", v.validateRegistration(set(good, "premises_photos", []))?.key, "missing_premises_photo");
eq("no categories", v.validateRegistration(set(good, "categories", []))?.key, "invalid_categories");
eq("bad capability", v.validateRegistration(set(good, "capabilities", ["abc"]))?.key, "invalid_capability");
eq("bad PAN", v.validateRegistration(set(good, "documents.pan.number", "ABCDE12345"))?.key, "invalid_pan");
eq("GSTIN of another PAN", v.validateRegistration(set(good, "documents.gst", { number: "27AAPFU0939F1ZV", path: "pending" }))?.key, "gstin_pan_mismatch");
eq("no aadhaar (India)", v.validateRegistration(set(good, "documents.aadhaar", null))?.key, "missing_document");
eq("udyam number format", v.validateRegistration(set(good, "documents.registration", { kind: "udyam", number: "12345", path: "pending" }))?.key, "invalid_registration");
eq("no product and no catalogue", v.validateRegistration(set(good, "product", null))?.key, "missing_document");

// The database's keys reach the seller as sentences.
eq("errorMessage maps invalid_email", errorMessage({ message: "invalid_email" }) !== "invalid_email", true);
eq("errorMessage keeps other messages", errorMessage({ message: "Something else" }), "Something else");
eq("every key has a sentence", Object.keys(v.REGISTRATION_ERROR_TEXT).length >= 27, true);

rmSync(dir, { recursive: true, force: true });
console.log(failed ? `FAIL ${failed}/${n}` : `ok ${n}/${n}`);
process.exit(failed ? 1 : 0);
