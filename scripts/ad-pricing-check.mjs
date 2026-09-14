#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// "The price the vendor is shown is the price Razorpay charges."
//
// Two copies of the pricing rules have to exist — the browser cannot import a
// Deno edge module — so this asserts they cannot drift:
//
//   src/lib/adPricing.ts                        what the checkout panel SHOWS
//   supabase/functions/_shared/adPricing.ts     what the payment path CHARGES
//
// A drift here is close to invisible in the app: the vendor sees one number,
// agrees to it, and is billed another. Nothing would throw.
//
// Also asserts the property the 2026-09-14 billing fix is FOR: a vendor-level
// placement (trustedSeal / verifiedCertificate) costs the same whether the
// order covers one product or twenty.
//
//   node scripts/ad-pricing-check.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-adpricing-"));

async function load(entry, outName) {
  const outfile = path.join(dir, outName);
  await build({ entryPoints: [entry], outfile, format: "esm", platform: "node", bundle: false, logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
}

const client = await load("src/lib/adPricing.ts", "client.mjs");
const edge = await load("supabase/functions/_shared/adPricing.ts", "edge.mjs");

let failures = 0;
const rows = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail });
};

// 1. The price tables are identical, key for key.
const ck = Object.keys(client.AD_PRICE).sort();
const ek = Object.keys(edge.AD_PRICE).sort();
check("price tables have the same ad types", ck.join(",") === ek.join(","),
  `client=${ck.length} edge=${ek.length}`);
const priceDiffs = ck.filter((k) => client.AD_PRICE[k] !== edge.AD_PRICE[k])
  .map((k) => `${k}: client ₹${client.AD_PRICE[k]} vs edge ₹${edge.AD_PRICE[k]}`);
check("every price matches", priceDiffs.length === 0, priceDiffs.join("; "));

// 2. The behavioural type sets match.
const setEq = (a, b) => [...a].sort().join(",") === [...b].sort().join(",");
check("VENDOR_LEVEL_TYPES match", setEq(client.VENDOR_LEVEL_TYPES, edge.VENDOR_LEVEL_TYPES),
  `client=[${[...client.VENDOR_LEVEL_TYPES]}] edge=[${[...edge.VENDOR_LEVEL_TYPES]}]`);
check("PER_MESSAGE_TYPES match", setEq(client.PER_MESSAGE_TYPES, edge.PER_MESSAGE_TYPES),
  `client=[${[...client.PER_MESSAGE_TYPES]}] edge=[${[...edge.PER_MESSAGE_TYPES]}]`);

// 3. The FORMULAS agree, swept over many generated orders. This is the one that
//    actually catches a drift — two tables can match while two formulas differ.
const TYPES = ck;
let mismatches = [];
let sweeps = 0;
// Deterministic pseudo-random so a failure is reproducible.
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 4000; i++) {
  const n = 1 + Math.floor(rnd() * 4);
  const placements = Array.from({ length: n }, () => TYPES[Math.floor(rnd() * TYPES.length)]);
  const days = 1 + Math.floor(rnd() * 400);
  const products = Math.floor(rnd() * 12); // includes 0, to exercise the clamp
  const spec = {
    placementIds: placements,
    days,
    items: Array.from({ length: products }, (_, k) => ({ productId: `p${k}`, title: `P${k}`, imageUrl: null })),
  };
  const a = client.computeOrderRupees(placements, days, products);
  const b = edge.computeOrderRupees(spec);
  sweeps++;
  if (a !== b) mismatches.push(`[${placements}] ${days}d x${products} -> client ₹${a} vs edge ₹${b}`);
}
check(`shown price === charged price (${sweeps} generated orders)`, mismatches.length === 0,
  mismatches.slice(0, 3).join(" | "));

// 4. THE FIX: a vendor-level placement costs the same regardless of how many
//    products the order covers. Before 2026-09-14 verifiedCertificate at 30 days
//    across 3 products billed ₹17,910 for one printed certificate.
const vendorScaling = [];
for (const id of edge.VENDOR_LEVEL_TYPES) {
  const at1 = client.computeOrderRupees([id], 30, 1);
  const at9 = client.computeOrderRupees([id], 30, 9);
  const at365 = client.computeOrderRupees([id], 365, 1);
  if (at1 !== at9) vendorScaling.push(`${id} scales with products: ₹${at1} -> ₹${at9}`);
  if (at1 !== at365) vendorScaling.push(`${id} scales with days: ₹${at1} -> ₹${at365}`);
  if (at1 !== edge.AD_PRICE[id]) vendorScaling.push(`${id} is not its list price: ₹${at1} vs ₹${edge.AD_PRICE[id]}`);
}
check("vendor-level types are charged once, flat", vendorScaling.length === 0, vendorScaling.join("; "));

// 5. Per-product types must STILL scale with product count — the fix must not
//    have quietly made everything flat.
const perProductScaling = [];
for (const id of ["openListing", "featuredProduct", "storePromotion"]) {
  const at1 = client.computeOrderRupees([id], 7, 1);
  const at3 = client.computeOrderRupees([id], 7, 3);
  if (at3 !== at1 * 3) perProductScaling.push(`${id}: ₹${at1} x3 should be ₹${at1 * 3}, got ₹${at3}`);
}
check("per-product types still scale with product count", perProductScaling.length === 0,
  perProductScaling.join("; "));

// 6. buildAdRows materialises vendor-level placements as exactly ONE row with no
//    product_id — the thing that stops N parcels and N seal grants.
const mixedSpec = {
  placementIds: ["openListing", "verifiedCertificate", "trustedSeal"],
  days: 30,
  items: [1, 2, 3, 4].map((k) => ({ productId: `p${k}`, title: `P${k}`, imageUrl: null })),
};
const built = edge.buildAdRows("vendor-1", mixedSpec);
const vendorRows = built.filter((r) => r.product_id === null);
const productRows = built.filter((r) => r.product_id !== null);
check("mixed order yields one vendor-level row", vendorRows.length === 1,
  `got ${vendorRows.length} rows with product_id = null`);
check("mixed order yields one row per product", productRows.length === 4,
  `got ${productRows.length}, want 4`);
check("the vendor-level row carries only vendor-level placements",
  vendorRows[0]?.placement === "verifiedCertificate,trustedSeal",
  `got "${vendorRows[0]?.placement}"`);
check("product rows carry no vendor-level placement",
  productRows.every((r) => !r.placement.includes("Certificate") && !r.placement.includes("trustedSeal")),
  productRows.map((r) => r.placement).join(" | "));

// 7. A certificate-only order still produces exactly one row (the shape the
//    live demo certificate purchases use).
const certOnly = edge.buildAdRows("vendor-1", {
  placementIds: ["verifiedCertificate"], days: 365,
  items: [1, 2, 3].map((k) => ({ productId: `p${k}`, title: `P${k}`, imageUrl: null })),
});
check("certificate-only order across 3 products = 1 row", certOnly.length === 1,
  `got ${certOnly.length}`);
check("certificate-only order across 3 products = list price",
  edge.computeOrderRupees({ placementIds: ["verifiedCertificate"], days: 365, items: [1, 2, 3].map((k) => ({ productId: `p${k}` })) }) === 199,
  `got ₹${edge.computeOrderRupees({ placementIds: ["verifiedCertificate"], days: 365, items: [1, 2, 3].map((k) => ({ productId: `p${k}` })) })}, want ₹199`);

console.table(rows);
console.log(
  failures === 0
    ? `\nPRICING CONSISTENT — shown price equals charged price across ${sweeps} generated orders`
    : `\n${failures} CHECK(S) FAILED`,
);

rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
