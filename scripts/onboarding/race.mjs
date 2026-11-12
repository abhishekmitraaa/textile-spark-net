// Two registration submits from one account at the same moment, with different submission ids, over real HTTP
// (PostgREST, so its safeupdate rules apply too). Exactly one may register: one product, one contract.
// LOCAL STACK ONLY. Usage: LOCAL_STACK_ENV=<path to local-stack-env.json> node scripts/onboarding/race.mjs
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV ?? ".claude/tmp/local-stack-env.json", "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API)) throw new Error(`not a local stack: ${env.API}`);
const svc = { apikey: env.SERVICE, Authorization: `Bearer ${env.SERVICE}` };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function json(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }

const email = `race-${randomUUID().slice(0, 8)}@harness.test`;
const created = await json(await fetch(`${env.API}/auth/v1/admin/users`, {
  method: "POST", headers: { ...svc, "content-type": "application/json" },
  body: JSON.stringify({ email, password: env.PASSWORD, email_confirm: true }),
}));
const uid = created.id;
const session = await json(await fetch(`${env.API}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: env.ANON, "content-type": "application/json" },
  body: JSON.stringify({ email, password: env.PASSWORD }),
}));
const user = { apikey: env.ANON, Authorization: `Bearer ${session.access_token}` };

const uploaded = { "business-docs": [], "product-images": [] };
async function upload(bucket, path, type = "image/png") {
  const res = await fetch(`${env.API}/storage/v1/object/${bucket}/${path}`, {
    method: "POST", headers: { ...user, "content-type": type }, body: PNG,
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${path}: ${res.status} ${await res.text()}`);
  uploaded[bucket].push(path);
  return path;
}
const pub = (path) => `${env.API}/storage/v1/object/public/product-images/${path}`;

const pan = await upload("business-docs", `${uid}/kyc/pan.png`);
const reg = await upload("business-docs", `${uid}/kyc/reg.png`);
const aad = await upload("business-docs", `${uid}/kyc/aadhaar.png`);
const office = await upload("product-images", `${uid}/office/o1.png`);
const img = await upload("product-images", `${uid}/onboarding-product/p1.png`);

const payload = {
  business_name: "Race Mills", country_code: "IN", business_phone: "+919876543210", whatsapp: null, website: null,
  whatsapp_updates: false,
  address: { line: "1", area: "Udhna", city: "Surat", state: "Gujarat", postal_code: "394210", landmark: null },
  owner: { name: "Race Owner", email: "owner@race.example" },
  primary_type: "manufacturer", capabilities: [], categories: ["Garment Manufacturer"],
  premises_photos: [pub(office)],
  documents: {
    pan: { number: "ABCPE1234F", holder_name: "Race Owner", address: "1 Udhna, Surat", path: pan },
    gst: null, registration: { kind: "other", number: null, path: reg }, aadhaar: { path: aad },
    catalogue: [], catalogue_pdf: null,
  },
  product: { name: "Race Kurta", price: 300, unit: "pieces", moq: 10, category_id: null, fabric: null, gsm: null,
             sizes: [], colour: null, images: [pub(img)] },
  contract: { signed_name: "Race Owner", signature_path: null, agreement_version: "2026-09-v1" },
};

const call = () => fetch(`${env.API}/rest/v1/rpc/submit_vendor_registration`, {
  method: "POST", headers: { ...user, "content-type": "application/json" },
  body: JSON.stringify({ p_submission: randomUUID(), p: payload }),
}).then(async (r) => ({ ok: r.ok, body: await json(r) }));

const results = await Promise.all([call(), call()]);
const count = async (table, col = "vendor_id") =>
  (await json(await fetch(`${env.API}/rest/v1/${table}?${col}=eq.${uid}&select=${col}`, { headers: svc }))).length;
const registrations = await count("vendor_registrations");
const products = await count("products");
const contracts = await count("vendor_contracts");
const errors = results.filter((r) => !r.ok).map((r) => r.body?.message ?? String(r.body));
console.log(`registrations=${registrations} products=${products} contracts=${contracts} errors=[${errors.join(",")}]`);

// Cleanup: children first (vendor_contracts is ON DELETE RESTRICT), then files, then the account.
for (const t of ["products", "vendor_documents", "vendor_contracts", "vendor_premises_photos", "vendor_registrations",
                 "catalogues", "vendor_catalog_recompute_queue"]) {
  await fetch(`${env.API}/rest/v1/${t}?vendor_id=eq.${uid}`, { method: "DELETE", headers: svc });
}
await fetch(`${env.API}/rest/v1/vendor_profiles?id=eq.${uid}`, { method: "DELETE", headers: svc });
for (const [bucket, paths] of Object.entries(uploaded)) {
  await fetch(`${env.API}/storage/v1/object/${bucket}`, {
    method: "DELETE", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ prefixes: paths }),
  });
}
await fetch(`${env.API}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: svc });
const ok = registrations === 1 && products === 1 && contracts === 1 && errors.length === 1 && /already_registered/.test(errors[0]);
process.exit(ok ? 0 : 1);
