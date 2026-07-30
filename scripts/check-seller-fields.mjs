#!/usr/bin/env node
/**
 * Guard for src/data/sellerCategories.ts.
 *
 * The upload form is data-driven: whatever a category/subcategory declares is
 * what the vendor gets asked, and (since the attribute-persistence work) what
 * lands in `products`. Nothing in the type system stops a garment field being
 * offered on a bedsheet, a duplicate question being asked twice, or an
 * `appliesTo` list pointing at a subcategory id that no longer exists — so this
 * asserts those invariants instead.
 *
 * Run: npm run check:fields
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// esbuild ships with vite, so this needs no extra dependency. Bundling to a temp
// ESM file lets the check import the real exported helpers rather than
// re-implementing their composition rules and drifting from them.
const dir = mkdtempSync(join(tmpdir(), "cosora-fields-"));
const out = join(dir, "sellerCategories.mjs");
try {
  await build({
    entryPoints: ["src/data/sellerCategories.ts"],
    bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error",
  });

  const { sellerCategories, getFieldsForCategory, getOptionalCategoryFields } =
    await import(pathToFileURL(out).href);

  // Fields that only make sense on something physical, and a narrower set that
  // only makes sense on something worn.
  const GARMENT_ONLY = ["neckType", "collarType", "sleeveType", "apparelBottomType", "fit"];
  const PRODUCT_ONLY = ["pattern", "occasion", "sizes", "colors", "color", "originCountry",
                        "moq", "gsm", "fabric", "waistSizes", "lengths", ...GARMENT_ONLY];
  // Subcategories in apparel-home that are not worn on the body.
  const NOT_WORN = ["home-textiles"];
  const NOT_A_GARMENT = [...NOT_WORN, "footwear"];

  const failures = [];
  const fail = (m) => failures.push(m);

  for (const cat of sellerCategories) {
    const subIds = new Set(cat.subCategories.map((s) => s.id));

    // 1. Every appliesTo entry must name a real subcategory of this category.
    for (const f of cat.commonFields ?? []) {
      for (const id of f.appliesTo ?? []) {
        if (!subIds.has(id)) fail(`${cat.id}: field "${f.id}" appliesTo unknown subcategory "${id}"`);
      }
      if (f.appliesTo && f.appliesTo.length === 0) fail(`${cat.id}: field "${f.id}" has an empty appliesTo`);
    }

    for (const sub of cat.subCategories) {
      const spec = getFieldsForCategory(cat.id, sub.id);
      const opt = getOptionalCategoryFields(cat.id, sub.id);
      const rendered = [...spec, ...opt];
      const ids = rendered.map((f) => f.id);

      // 2. No field id may render twice — both copies bind to the same
      //    formValues key, so the second silently overwrites the first.
      const seen = new Set();
      for (const id of ids) {
        if (seen.has(id)) fail(`${cat.id}/${sub.id}: field "${id}" rendered twice`);
        seen.add(id);
      }

      // 3. Services and freelancers must never be asked product questions.
      if (cat.type !== "product") {
        const bad = ids.filter((id) => PRODUCT_ONLY.includes(id));
        if (bad.length) fail(`${cat.id}/${sub.id} (${cat.type}): product-only fields ${bad.join(", ")}`);
      }

      // 4. Garment construction questions must not reach non-garments.
      if (NOT_A_GARMENT.includes(sub.id)) {
        const bad = ids.filter((id) => GARMENT_ONLY.includes(id));
        if (bad.length) fail(`${cat.id}/${sub.id}: garment-only fields ${bad.join(", ")}`);
      }
      if (NOT_WORN.includes(sub.id)) {
        const bad = ids.filter((id) => ["closure", "apparelGender", "length"].includes(id));
        if (bad.length) fail(`${cat.id}/${sub.id}: wearable-only fields ${bad.join(", ")}`);
      }

      // 5. Multi-value columns must be fed by multi-value inputs. A `text` field
      //    sharing one of these ids yields a string, which then hits a text[]
      //    column (this is the live "UK 6-11" -> sizes bug).
      for (const f of rendered) {
        if (["pattern", "occasion", "waistSizes", "lengths"].includes(f.id)
            && !["multiselect", "size-selector"].includes(f.type)) {
          fail(`${cat.id}/${sub.id}: "${f.id}" is type "${f.type}" but backs an array column`);
        }
        if (["neckType", "sleeveType", "collarType", "originCountry"].includes(f.id)
            && f.type !== "select") {
          fail(`${cat.id}/${sub.id}: "${f.id}" is type "${f.type}" but backs a scalar column`);
        }
      }
    }
  }

  const combos = sellerCategories.reduce((n, c) => n + c.subCategories.length, 0);
  if (failures.length) {
    console.error(`\n✖ ${failures.length} problem(s) across ${combos} category/subcategory combinations:\n`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`\n✔ seller field checks passed across ${combos} category/subcategory combinations`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
