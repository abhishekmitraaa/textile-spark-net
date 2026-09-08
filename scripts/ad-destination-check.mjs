#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Ad click routing — the campaign-goal branch, checked without a browser.
//
// WHY THIS SCRIPT EXISTS. Every other verification in `scripts/` asserts
// against the live database. This one asserts against a pure function, because
// the thing it protects cannot be reached from the UI today: `active_ads`
// returns zero rows (both of the demo vendor's campaigns ended in July), so a
// Playwright test could not click a sponsored card even if it wanted to. The
// branch still has to be right — it decides whether a vendor who paid ₹99/day
// for "Visit your profile" gets storefront traffic or product traffic.
//
// It transpiles `src/lib/adDestination.ts` alone with esbuild (already a Vite
// dependency) and imports the result. That file is deliberately import-free so
// this stays possible.
//
//   node scripts/ad-destination-check.mjs
// ─────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-adroute-"));
const outfile = path.join(dir, "adDestination.mjs");

await build({
  entryPoints: ["src/lib/adDestination.ts"],
  outfile,
  format: "esm",
  platform: "node",
  bundle: false,
  logLevel: "silent",
});

const { isProfileGoalAd, adDestination } = await import(pathToFileURL(outfile).href);

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok ? "" : `\n          expected ${e}\n          actual   ${a}`}`);
}

const VENDOR = "22222222-2222-2222-2222-222222222222";
const PRODUCT = "36f94dd6-1451-4f34-988b-da5259c6dd77";

console.log("\nisProfileGoalAd — placement is a comma-joined CSV, so this is membership");
check("null placement", isProfileGoalAd(null), false);
check("empty placement", isProfileGoalAd(""), false);
check("single non-profile placement", isProfileGoalAd("openListing"), false);
check("single profile placement", isProfileGoalAd("storePromotion"), true);
check("brandAd alone", isProfileGoalAd("brandAd"), true);
// The live rows really do look like this.
check("real CSV, no profile goal", isProfileGoalAd("openListing,trustedSeal"), false);
check("real CSV, no profile goal (2)", isProfileGoalAd("openListing,featuredProduct"), false);
check("CSV containing a profile goal", isProfileGoalAd("openListing,storePromotion"), true);
check("CSV with whitespace", isProfileGoalAd("openListing, brandAd"), true);
// Guards against a substring match sneaking back in.
check("substring must not match", isProfileGoalAd("notStorePromotionReally"), false);

console.log("\nadDestination — the routing decision");
check(
  "profile-goal ad goes to the STOREFRONT, not the product (the bug)",
  adDestination({ placement: "storePromotion", productId: PRODUCT, vendorId: VENDOR }),
  { path: `/vendor/${VENDOR}`, kind: "profile" },
);
check(
  "brandAd inside a CSV also goes to the storefront",
  adDestination({ placement: "openListing,brandAd", productId: PRODUCT, vendorId: VENDOR }),
  { path: `/vendor/${VENDOR}`, kind: "profile" },
);
check(
  "product-goal ad still goes to the product (unchanged behaviour)",
  adDestination({ placement: "openListing,featuredProduct", productId: PRODUCT, vendorId: VENDOR }),
  { path: `/product/${PRODUCT}`, kind: "product" },
);
check(
  "profile-goal ad with no product still works — used to be a dead card",
  adDestination({ placement: "storePromotion", productId: null, vendorId: VENDOR }),
  { path: `/vendor/${VENDOR}`, kind: "profile" },
);
check(
  "product-goal ad with no product falls back to the storefront",
  adDestination({ placement: "openListing", productId: null, vendorId: VENDOR }),
  { path: `/vendor/${VENDOR}`, kind: "profile" },
);
check(
  "nothing to open — caller must not navigate",
  adDestination({ placement: "openListing", productId: null, vendorId: null }),
  null,
);
check(
  "profile goal but no vendor id — falls through to the product",
  adDestination({ placement: "storePromotion", productId: PRODUCT, vendorId: null }),
  { path: `/product/${PRODUCT}`, kind: "product" },
);

rmSync(dir, { recursive: true, force: true });

console.log(failures === 0 ? "\nALL ROUTING CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
