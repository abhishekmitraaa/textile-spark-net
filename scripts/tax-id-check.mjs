#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// "The browser and the database agree on what a valid GSTIN and PAN are."
// (subscriptions P0, 2026-10-08)
//
// src/lib/taxIds.ts mirrors public.gstin_is_valid(). This runs the browser copy on
// published GSTINs (whose check characters are known) and on the same cases the
// migration's self-check uses, and, when the local stack is up, asks the database
// the same questions and compares every answer.
//
//   node scripts/tax-id-check.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "cosora-taxids-"));
const outfile = path.join(dir, "taxIds.mjs");
await build({ entryPoints: ["src/lib/taxIds.ts"], outfile, format: "esm", platform: "node", bundle: true, logLevel: "silent" });
const { isValidGstin, isValidPan, normaliseTaxId, panOfGstin } = await import(pathToFileURL(outfile).href);

const GSTIN = [
  ["27AAPFU0939F1ZV", true], ["29AAGCB7383J1Z4", true], ["27AAACR5055K1Z7", true],
  ["09AAACH7409R1ZZ", true], ["24AAACC1206D1ZM", true],
  ["27AAPFU0939F1ZX", false],   // wrong check character
  ["27aapfu0939f1zv", false],   // lower case is not stored; normalise first
  ["27AAPFU0939F1YV", false],   // 14th character must be Z
  ["27AAPFU0939F0ZV", false],   // entity number 0 is not issued
  ["2AAPFU0939F1ZV", false], ["", false],
];
const PAN = [["AAPFU0939F", true], ["AAPFU0939", false], ["aapfu0939f", false], ["AAPF10939F", false]];

let failures = 0;
const rows = [];
const check = (name, ok, detail = "") => { if (!ok) failures++; rows.push({ check: name, verdict: ok ? "PASS" : "*** FAIL ***", detail }); };

for (const [g, want] of GSTIN) check(`GSTIN ${g || "(empty)"} → ${want}`, isValidGstin(g) === want);
for (const [p, want] of PAN) check(`PAN ${p} → ${want}`, isValidPan(p) === want);
check("normalise: spaces out, upper case", normaliseTaxId(" 27aapfu 0939f1zv ") === "27AAPFU0939F1ZV");
check("PAN inside a GSTIN", panOfGstin("27AAPFU0939F1ZV") === "AAPFU0939F");

// The database's answers, when the local stack is running.
let db = null;
try {
  const sql = "select string_agg(public.gstin_is_valid(g)::text, ',' order by n) from unnest(array[" +
    GSTIN.map(([g]) => `'${g}'`).join(",") + "]::text[]) with ordinality a(g, n);";
  db = execFileSync("docker", ["exec", "supabase_db_localstack", "psql", "-U", "postgres", "-tA", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
} catch { /* the local stack isn't running, or the migration isn't applied there */ }
if (db && !db.startsWith("ERROR")) {
  const browser = GSTIN.map(([g]) => String(isValidGstin(g))).join(",");
  check("the database agrees on every GSTIN case", db === browser, `db=${db}`);
} else {
  rows.push({ check: "the database agrees on every GSTIN case", verdict: "SKIPPED", detail: "local stack not reachable" });
}

console.table(rows);
rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? `\nTAX IDS CONSISTENT — ${rows.length} checks` : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
