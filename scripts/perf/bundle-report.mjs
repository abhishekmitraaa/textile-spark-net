#!/usr/bin/env node
/**
 * Which npm packages are in which script file, and how big (speed plan §3.9, 0.3).
 *
 *   npm run perf:bundle      builds with source maps into .perf-dist/ and prints the table
 *   node scripts/perf/bundle-report.mjs <dist dir built with --sourcemap>
 *
 * Every byte of every script is traced back to its source file through the source maps. "First load" is the entry
 * script plus the scripts index.html preloads with it. A package that appears in the first load for the first time
 * is the thing to look at in review: anything over 10 KB gzip belongs with the page that needs it (Phase 6).
 */
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { SourceMapConsumer } = require("source-map-js"); // ships with Vite (via postcss)

const dist = path.resolve(process.argv[2] || ".perf-dist");
const assets = path.join(dist, "assets");
const page = readFileSync(path.join(dist, "index.html"), "utf8");
const firstLoad = new Set(
  [...page.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]),
);
const files = readdirSync(assets).filter((f) => f.endsWith(".js") && existsSync(path.join(assets, f + ".map")));
if (!files.length) {
  console.error(`bundle-report: no .js.map files in ${assets}. Build with --sourcemap.`);
  process.exit(1);
}

const pkgOf = (src) => {
  const m = (src || "").replace(/\\/g, "/").match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return m ? m[1] : null;
};
const packages = {}; // name -> { min, gz, first, files:Set }
let appMin = 0, libMin = 0, firstGz = 0, firstLibGz = 0;
for (const f of files) {
  const code = readFileSync(path.join(assets, f), "utf8");
  const lines = code.split("\n");
  const map = new SourceMapConsumer(JSON.parse(readFileSync(path.join(assets, f + ".map"), "utf8")));
  const ms = [];
  map.eachMapping((m) => ms.push(m), null, SourceMapConsumer.GENERATED_ORDER);
  const parts = {};
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i], n = ms[i + 1];
    const line = lines[m.generatedLine - 1] || "";
    const end = n && n.generatedLine === m.generatedLine ? n.generatedColumn : line.length;
    const k = pkgOf(m.source) || "(app)";
    (parts[k] = parts[k] || []).push(line.slice(m.generatedColumn, end));
  }
  const first = firstLoad.has(f);
  if (first) firstGz += gzipSync(code).length;
  for (const [k, chunks] of Object.entries(parts)) {
    const text = chunks.join("");
    if (k === "(app)") { appMin += text.length; continue; }
    libMin += text.length;
    const g = gzipSync(text).length;
    const p = (packages[k] = packages[k] || { min: 0, gz: 0, firstGz: 0, files: new Set() });
    p.min += text.length; p.gz += g; p.files.add(f);
    if (first) { p.firstGz += g; firstLibGz += g; }
  }
}
const K = (n) => (n / 1024).toFixed(1);
console.log(`${files.length} script files; ${K(appMin + libMin)} KB minified, of which npm packages ${K(libMin)} KB (${Math.round((100 * libMin) / (appMin + libMin))} %).`);
console.log(`First load (${[...firstLoad].join(" + ")}): ${K(firstGz)} KB gzip, of which packages ≈ ${K(firstLibGz)} KB.\n`);
console.log("| Package | KB minified | KB gzip | In the first load (KB gzip) | Files |");
console.log("|---|---:|---:|---:|---|");
for (const [k, p] of Object.entries(packages).sort((a, b) => b[1].min - a[1].min)) {
  const names = [...p.files].map((f) => f.replace(/-[A-Za-z0-9_-]{8}\.js$/, ""));
  console.log(`| ${k} | ${K(p.min)} | ${K(p.gz)} | ${p.firstGz ? K(p.firstGz) : "–"} | ${names.length > 3 ? names.slice(0, 3).join(", ") + ` +${names.length - 3}` : names.join(", ")} |`);
}
