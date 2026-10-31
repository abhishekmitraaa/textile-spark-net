// Ranking F3: prints the seed rows of public.attribute_definitions as SQL, from the two code vocabularies
// (src/data/sellerCategories.ts for listings, src/data/requirementSchemas.ts for requirements). Day one, the
// forms rebuilt from these rows ask exactly today's questions.   node scripts/ranking/f3-seed.mjs > seed.sql
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadVocabularies } from "./f3-dump.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const matchKeys = JSON.parse(readFileSync(path.join(here, "f3-match-keys.json"), "utf8"));
const CORE = new Set(["quantity", "budget", "description", "files", "productType", "productName"]);

const q = (v) => (v === undefined || v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (!a || a.length === 0 ? "null" : `array[${a.map(q).join(", ")}]::text[]`);
const b = (v) => (v ? "true" : "false");

const COLS = ["form", "category_id", "subcategory_id", "layer", "seller_type", "applies_to_subcategories", "schema_key",
  "section_title", "section_position", "key", "label", "kind", "options", "unit", "placeholder", "required",
  "full_width", "half", "core", "match_key", "match_weight", "position"];

export async function seedRows() {
  const v = await loadVocabularies();
  const rows = [];
  const product = (f, extra, position) => rows.push({
    form: "product", ...extra, key: f.id, label: f.label, kind: f.type, options: f.options, unit: f.unit,
    placeholder: f.placeholder, required: !!f.required, full_width: !!f.fullWidth, half: false, core: false,
    match_key: null, match_weight: 0, position,
  });
  // The seller-type base fields, once per type (getFieldsForCategory with no subcategory returns only them).
  for (const type of ["product", "service", "freelancer"]) {
    const cat = v.seller.sellerCategories.find((c) => c.type === type && !c.buyerOnly);
    v.seller.getFieldsForCategory(cat.id).forEach((f, i) => product(f, { layer: "base", seller_type: type }, i));
  }
  for (const c of v.seller.sellerCategories) {
    if (c.buyerOnly) continue;
    for (const s of c.subCategories) (s.fields ?? []).forEach((f, i) => product(f, { layer: "sub", category_id: c.id, subcategory_id: s.id }, i));
    (c.commonFields ?? []).forEach((f, i) => product(f, { layer: "common", category_id: c.id, applies_to_subcategories: f.appliesTo }, i));
  }
  for (const [schema, sections] of Object.entries(v.requirement.SCHEMAS)) {
    sections.forEach((sec, si) => sec.fields.forEach((f, fi) => rows.push({
      form: "requirement", schema_key: schema, section_title: sec.title, section_position: si, key: f.key, label: f.label,
      kind: f.type, options: f.options, placeholder: f.placeholder, required: !!f.required, full_width: false,
      half: !!f.half, core: CORE.has(f.key), match_key: matchKeys[f.key] ?? null, match_weight: matchKeys[f.key] ? 1 : 0,
      position: fi,
    })));
  }
  return rows;
}

export function seedSql(rows) {
  const val = (r) => "(" + [q(r.form), q(r.category_id), q(r.subcategory_id), q(r.layer), q(r.seller_type),
    arr(r.applies_to_subcategories), q(r.schema_key), q(r.section_title), r.section_position ?? "null", q(r.key),
    q(r.label), q(r.kind), arr(r.options), q(r.unit), q(r.placeholder), b(r.required), b(r.full_width), b(r.half),
    b(r.core), q(r.match_key), r.match_weight, r.position].join(", ") + ")";
  return `insert into public.attribute_definitions (${COLS.join(", ")}) values\n  ${rows.map(val).join(",\n  ")};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await seedRows();
  process.stdout.write(seedSql(rows));
  const by = rows.reduce((m, r) => ((m[r.form] = (m[r.form] ?? 0) + 1), m), {});
  console.error(`rows: ${rows.length} ${JSON.stringify(by)}`);
}
