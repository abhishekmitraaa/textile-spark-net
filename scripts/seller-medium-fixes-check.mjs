#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The rules behind Seller Home audit batch 1 (Medium items, 2026-11-17), checked without a browser:
//   src/lib/contactDetails.ts  SH-041 (only changed fields), SH-042 (overseas region), SH-043 (registration's rules)
//   src/lib/socialLinks.ts     SH-044 (each box its own platform; what the store shows)
//   src/lib/uploadForm.ts      SH-054 (required answers), SH-058 (photo types), SH-060 (the kept draft)
//
//   node scripts/seller-medium-fixes-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-medium-"));
const src = path.resolve("src");
const atAlias = {
  name: "at-alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, async (args) => {
      const r = await b.resolve("./" + args.path.slice(2), { resolveDir: src, kind: args.kind });
      return r;
    });
  },
};
const load = async (entry, name) => {
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, format: "esm", platform: "node", bundle: true, logLevel: "silent", plugins: [atAlias] });
  return import(pathToFileURL(outfile).href);
};
const contact = await load("src/lib/contactDetails.ts", "contact");
const social = await load("src/lib/socialLinks.ts", "social");
const upload = await load("src/lib/uploadForm.ts", "upload");
const slots = await load("src/lib/adSlots.ts", "slots");
const clientPricing = await load("src/lib/adPricing.ts", "clientPricing");
const edgePricing = await load("supabase/functions/_shared/adPricing.ts", "edgePricing");
const edgeReach = await load("supabase/functions/_shared/adReach.ts", "edgeReach");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n          ${detail}`}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Contact details ──
const blank = { ownerName: "", phone: "", whatsapp: "", ownerEmail: "", website: "", addressLine: "", area: "", landmark: "", city: "", state: "", postalCode: "" };
const loaded = { ...blank, ownerName: "R Sharma", phone: "+919876543210", whatsapp: "+919876543210", ownerEmail: "a@b.in", city: "Surat", state: "Gujarat", postalCode: "395002" };
check("SH-041: an edited email is the only change", eq(contact.contactChanges(loaded, { ...loaded, ownerEmail: "new@b.in" }), { ownerEmail: "new@b.in" }));
check("SH-041: nothing edited, nothing saved", eq(contact.contactChanges(loaded, { ...loaded, city: " Surat " }), {}));
check("SH-041: an emptied field is a change", eq(contact.contactChanges(loaded, { ...loaded, whatsapp: "" }), { whatsapp: "" }));
const ok = (changes, cc = "IN") => contact.checkContactChanges(changes, cc);
check("SH-043: '98765 43210' becomes +919876543210", ok({ phone: "98765 43210" }).patch?.phone === "+919876543210");
check("SH-043: 'call me' is refused", ok({ phone: "call me" }).ok === false);
check("SH-043: website 'x' is refused", ok({ website: "x" }).ok === false);
check("SH-043: 'mybiz.in' becomes https://mybiz.in", ok({ website: "mybiz.in" }).patch?.website === "https://mybiz.in");
check("SH-043: a bad email is refused", ok({ ownerEmail: "nobody" }).ok === false);
check("SH-043: a 5-digit PIN is refused in India", ok({ postalCode: "39500" }).ok === false);
check("SH-043: an unchanged old bad value isn't judged", ok({}).ok === true);
check("SH-042: India needs a listed state", ok({ state: "Greater London" }).ok === false);
check("SH-042: abroad, a typed region is fine", ok({ state: "Greater London" }, "GB").ok === true);
check("SH-042: abroad, a UK number with + is fine", ok({ phone: "+44 20 7946 0958" }, "GB").patch?.phone === "+442079460958");
check("SH-042: abroad, a +91 number is refused", ok({ phone: "+919876543210" }, "GB").ok === false);
check("SH-042: abroad, a UK postcode is fine", ok({ postalCode: "SW1A 1AA" }, "GB").ok === true);

// ── Social links ──
const n = social.normaliseSocialLink;
check("SH-044: facebook.com/x in the Facebook box", n("facebook", "facebook.com/mybiz") === "https://facebook.com/mybiz");
check("SH-044: an Instagram link in the Facebook box is refused", n("facebook", "https://instagram.com/mybiz") === null);
check("SH-044: @handle in the X box", n("x", "@mybiz") === "https://x.com/mybiz");
check("SH-044: @handle in the Instagram box", n("instagram", "@my.biz") === "https://instagram.com/my.biz");
check("SH-044: a platform's home page isn't a profile", n("youtube", "https://youtube.com/") === null);
check("SH-044: www. and m. subdomains count", n("facebook", "https://m.facebook.com/mybiz") !== null && n("linkedin", "in.linkedin.com/company/x") !== null);
check("SH-044: a social profile in the Website box is refused", n("other", "https://instagram.com/mybiz") === null);
check("SH-044: a website in the Website box", n("other", "mybiz.in") === "https://mybiz.in/");
check("SH-044: javascript: and http-auth are refused", n("other", "javascript:alert(1)") === null && n("other", "https://a:b@mybiz.in") === null);
check("SH-044: look-alike host refused", n("facebook", "https://facebook.com.evil.in/x") === null && n("facebook", "https://notfacebook.com/x") === null);
const shown = social.socialLinksForDisplay({ facebook: ["https://instagram.com/wrong", "facebook.com/right"], instagram: ["a", "b", "c", "d"], nonsense: ["x"] });
check("SH-044: the store shows only valid links, at most 3 per platform",
  shown.filter((l) => l.key === "facebook").length === 1 && shown.filter((l) => l.key === "instagram").length === 3 && !shown.some((l) => l.key === "nonsense"),
  JSON.stringify(shown));
check("SH-044: a broken social value shows nothing", eq(social.socialLinksForDisplay(null), []) && eq(social.socialLinksForDisplay([1]), []));

// ── Upload ──
const fields = [{ id: "bagType", label: "Bag Type", required: true }, { id: "material", label: "Material", required: true }, { id: "color", label: "Colour" }];
check("SH-054: unanswered required fields are named",
  eq(upload.missingRequired("details", fields, { bagType: "" , material: [] }, { productName: "Tote", price: "", publishing: false }), ["Bag Type", "Material"]));
check("SH-054: the product name is required", upload.missingRequired("details", [], {}, { productName: " ", price: "", publishing: false })[0] === "Product name");
check("SH-054: a draft may leave the price", eq(upload.missingRequired("pricing", [], {}, { productName: "x", price: "", publishing: false }), []));
check("SH-054: Publish needs the price", eq(upload.missingRequired("pricing", [], {}, { productName: "x", price: "", publishing: true }), ["Price"]));
check("SH-054: list wording", upload.listOf(["A", "B", "C"]) === "A, B and C" && upload.listOf(["A"]) === "A");
check("SH-058: BMP, TIFF and SVG aren't listing photos",
  !upload.isListingPhotoType("image/bmp") && !upload.isListingPhotoType("image/tiff") && !upload.isListingPhotoType("image/svg+xml") && upload.isListingPhotoType("image/webp"));
const draft = { v: 1, selectedCategory: "apparel-home", selectedSubCategory: null, selectedSubType: null, formValues: { moq: "50" }, productName: "Tote", productDescription: "", sku: "", price: "", unit: "", customizationAvailable: false };
check("SH-060: a kept draft reads back", eq(upload.parseUploadDraft(JSON.stringify(draft)), draft));
check("SH-060: junk is no draft", upload.parseUploadDraft("{") === null && upload.parseUploadDraft('{"v":2}') === null);
check("SH-060: an empty form isn't kept", !upload.draftHasAnswers({ ...draft, selectedCategory: null, formValues: {}, productName: "" }));

// ── Batch 2: advertising ──
const sellable = [...slots.sellableAdTypes()].sort();
check("SH-094: the browser and the server sell the same ad types", eq(sellable, [...edgePricing.SELLABLE_AD_TYPES].sort()),
  `browser ${sellable} / server ${[...edgePricing.SELLABLE_AD_TYPES].sort()}`);
check("SH-094: the deferred banners and their combo are not sold",
  !["websiteBanner", "mobileBanner", "webMobileCombo"].some((t) => sellable.includes(t)));
// Mitra, 2026-11-17: the four off-app types are sold again and done by hand by the Cosora team.
check("manual ad types are sold, and only those four",
  eq([...slots.MANUAL_AD_TYPES].sort(), ["directBroadcast", "fbInsta", "googleProduct", "socialCombo"])
  && slots.MANUAL_AD_TYPES.every((t) => sellable.includes(t)));
check("manual ad types never render as an in-app card",
  slots.MANUAL_AD_TYPES.every((t) => !slots.PLACED_AD_TYPES.includes(t)));
check("hasManualAdType reads the placement CSV",
  slots.hasManualAdType("openListing, fbInsta") && !slots.hasManualAdType("openListing,trustedSeal")
  && !slots.hasManualAdType(null) && slots.hasManualAdType("directBroadcast"));
check("SH-093: both copies give the seal 30 days and the certificate a year",
  eq(clientPricing.VERIFICATION_DAYS, edgePricing.VERIFICATION_DAYS) && edgePricing.VERIFICATION_DAYS.trustedSeal === 30 && edgePricing.VERIFICATION_DAYS.verifiedCertificate === 365);
const vs = edgePricing.verificationSpec({ placementIds: ["trustedSeal", "trustedSeal"], days: 999, items: [{ productId: "x", title: "t", imageUrl: null }], targetStates: ["GJ"] });
check("SH-093: a seal order is held to its form (one seal, 30 days, no listing, no targeting)",
  eq(vs.placementIds, ["trustedSeal"]) && vs.days === 30 && vs.items.length === 0 && vs.targetStates === undefined);
check("SH-093: seal + certificate together run a year",
  edgePricing.verificationSpec({ placementIds: ["trustedSeal", "verifiedCertificate"], days: 1, items: [] }).days === 365);
check("SH-093: an ad with a seal isn't verification-only", !edgePricing.isVerificationOnly({ placementIds: ["openListing", "trustedSeal"] }));
check("SH-093: a seal order is priced once (44), the certificate 199",
  edgePricing.computeOrderRupees(vs) === 44
  && edgePricing.computeOrderRupees(edgePricing.verificationSpec({ placementIds: ["verifiedCertificate"], days: 1, items: [] })) === 199);
const reach = await edgeReach.adReach("http://unused.invalid", "k", "v", { placementIds: ["verifiedCertificate"], days: 7, items: [] }, true);
check("SH-093: any plan may buy it (the reach rule isn't asked)", reach.ok === true && reach.spec.days === 365);

console.log(failures ? `\n${failures} failure(s)` : "\nall batch-1 and batch-2 rules hold");
process.exit(failures ? 1 : 0);
