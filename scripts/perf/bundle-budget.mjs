#!/usr/bin/env node
/**
 * Bundle budget (speed plan 0.3). Runs at the end of `npm run build`, against dist/.
 *
 *   node scripts/perf/bundle-budget.mjs [distDir]
 *
 * Fails the build when:
 *   - the first load (the entry script and every script index.html preloads with it) is over `firstLoadGzipKB`;
 *   - the app part of it (the entry script) is over `entryGzipKB`;
 *   - the `vendor-core` library file is over `vendorCoreGzipKB` (raise that only in a commit that changes
 *     package.json: the file is meant to change only when the libraries do, speed plan 1.7);
 *   - an image in dist/assets is over `imageMaxKB` and isn't in `imageAllow` (the files over it on 2026-11-27, which
 *     Phase 2.6 shrinks; take a file off the list once it is under).
 * Lower the numbers in scripts/perf/budget.json as each phase lands; never raise them to let a build through without
 * saying why in the commit.
 *
 * Which npm packages are in which file: `npm run perf:bundle` (a source-map build, scripts/perf/bundle-report.mjs).
 */
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.resolve(root, process.argv[2] || "dist");
const budget = JSON.parse(readFileSync(path.join(root, "scripts/perf/budget.json"), "utf8"));
const html = path.join(dist, "index.html");
if (!existsSync(html)) {
  console.error(`bundle-budget: ${html} not found. Run vite build first.`);
  process.exit(1);
}

const kb = (n) => n / 1024;
const gz = (file) => gzipSync(readFileSync(file)).length;
const page = readFileSync(html, "utf8");
const entry = [...page.matchAll(/<script[^>]+type="module"[^>]+src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const preloads = [...page.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (entry.length !== 1) {
  console.error(`bundle-budget: expected one entry script in index.html, found ${entry.length}.`);
  process.exit(1);
}
const firstLoad = [...new Set([...entry, ...preloads])];
const sizes = Object.fromEntries(firstLoad.map((f) => [f, gz(path.join(dist, f))]));
const total = Object.values(sizes).reduce((a, b) => a + b, 0);
const vendorCore = firstLoad.find((f) => /\/vendor-core-[^/]+\.js$/.test(f));

const problems = [];
const check = (label, value, limit) => {
  const line = `${label.padEnd(28)} ${kb(value).toFixed(1).padStart(7)} KB gzip  (budget ${limit} KB)`;
  console.log((kb(value) > limit ? "OVER  " : "ok    ") + line);
  if (kb(value) > limit) problems.push(line);
};
console.log("bundle-budget: first load = " + firstLoad.map((f) => path.basename(f)).join(" + "));
check("First load (all scripts)", total, budget.firstLoadGzipKB);
check("Entry script (app code)", sizes[entry[0]], budget.entryGzipKB);
if (vendorCore) check("vendor-core (libraries)", sizes[vendorCore], budget.vendorCoreGzipKB);
else problems.push("vendor-core chunk missing from the first load (vite.config.ts manualChunks)");

const allow = new Set(budget.imageAllow || []);
const strip = (f) => f.replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/i, "$1"); // name without Vite's hash
const big = readdirSync(path.join(dist, "assets"))
  .filter((f) => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(f))
  .map((f) => ({ f, size: statSync(path.join(dist, "assets", f)).size }))
  .filter(({ size }) => kb(size) > budget.imageMaxKB);
const newBig = big.filter(({ f }) => !allow.has(strip(f)));
console.log(`ok    Images over ${budget.imageMaxKB} KB: ${big.length} (${big.length - newBig.length} on the allow list)`);
for (const { f, size } of newBig) problems.push(`image ${f} is ${kb(size).toFixed(0)} KB (over ${budget.imageMaxKB} KB, not on imageAllow)`);

if (problems.length) {
  console.error("\nbundle-budget: over budget:\n  " + problems.join("\n  "));
  console.error("See scripts/perf/budget.json and documentation/speed-build-plan-2026-11-27.md §3.4, §3.9.");
  process.exit(1);
}
console.log("bundle-budget: within budget.");
