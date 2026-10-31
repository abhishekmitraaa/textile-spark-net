// Assembles supabase/migrations/20261031100000_ranking_f3_attribute_definitions.sql from the head, the generated
// seed (f3-seed.mjs) and the tail.   node scripts/ranking/f3-build-migration.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { seedRows, seedSql } from "./f3-seed.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "../../supabase/migrations/20261031100000_ranking_f3_attribute_definitions.sql");
const parts = ["f3-migration-head.sql", null, "f3-migration-tail.sql"];
const seed = seedSql(await seedRows());
writeFileSync(out, parts.map((p) => (p ? readFileSync(path.join(here, p), "utf8") : seed)).join("\n"));
console.log(out);
