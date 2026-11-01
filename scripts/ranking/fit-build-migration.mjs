// Builds supabase/migrations/20261101100000_ranking_fit.sql from scripts/ranking/fit-migration.sql (Ranking Fit,
// 2026-11-01): the "-- @@ROOTS@@" lines become one VALUES row per top-level seller category (id, name, the unit its
// capacity is compared in), read from src/data/sellerCategories.ts so the families never drift from the forms.
// Run: node scripts/ranking/fit-build-migration.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVocabularies } from "./f3-dump.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const q = (s) => (s === null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

// src/data/vendorTypes.ts defaultCapacityUnit, except services: their capacity (orders, projects) is never
// compared with a requirement's quantity.
const unitOf = (c) => (c.type !== "product" ? null : c.id === "raw-materials" ? "metres" : c.id === "chemicals-dyes" ? "kg" : "pieces");

const { seller } = await loadVocabularies();
const rows = seller.sellerCategories.map((c) => `      (${q(c.id)}, ${q(c.name)}, ${q(unitOf(c))})`).join(",\n");
const sql = readFileSync(join(here, "fit-migration.sql"), "utf8").replace(/-- @@ROOTS@@/g, () => rows);
if (sql.includes("@@ROOTS@@")) throw new Error("placeholder left");
writeFileSync(join(root, "supabase", "migrations", "20261101100000_ranking_fit.sql"), sql);
console.log(`roots: ${seller.sellerCategories.length}`);
