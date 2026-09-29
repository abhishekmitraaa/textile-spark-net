#!/usr/bin/env node
/**
 * Keeps the CSP's script-src hashes in step with the inline <script> blocks in
 * the built index.html.
 *
 * index.html carries one inline script (the pre-paint site-theme applier). A CSP
 * that restricts scripts must list its SHA-256 hash, and that hash changes with
 * every edit to the script, including whitespace. Nothing would say so: under
 * Report-Only the reports would start arriving, and once the policy enforces,
 * the theme would silently stop loading.
 *
 *   node scripts/csp-inline-hashes.mjs          check; exit 1 if a hash is missing
 *   node scripts/csp-inline-hashes.mjs --write  replace the policy's hashes with the current ones
 *
 * Runs as the last step of `npm run build`, against dist/index.html, which is
 * what is actually served (and what dist/404.html is copied from).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = path.join(root, "dist", "index.html");
const VERCEL = path.join(root, "vercel.json");
const HEADERS = ["Content-Security-Policy-Report-Only", "Content-Security-Policy"];

if (!existsSync(HTML)) {
  console.error("csp-inline-hashes: dist/index.html not found. Run vite build first.");
  process.exit(1);
}

const html = readFileSync(HTML, "utf8");
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((body) => body.trim())
  .map((body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);

const config = JSON.parse(readFileSync(VERCEL, "utf8"));
const entries = (config.headers ?? []).flatMap((h) => h.headers ?? []).filter((h) => HEADERS.includes(h.key));
// Only policies that restrict scripts need the hashes.
const scriptPolicies = entries.filter((h) => /(^|;)\s*script-src\b/.test(h.value));

if (process.argv.includes("--write")) {
  for (const h of scriptPolicies) {
    h.value = h.value.replace(/(^|;)(\s*script-src)([^;]*)/, (_, pre, name, list) => {
      const kept = list.split(/\s+/).filter((t) => t && !t.startsWith("'sha256-"));
      return `${pre}${name} ${[...kept, ...hashes].join(" ")}`;
    });
  }
  writeFileSync(VERCEL, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`csp-inline-hashes: wrote ${hashes.length} hash(es) into ${scriptPolicies.length} policy header(s)`);
  process.exit(0);
}

const missing = scriptPolicies.flatMap((h) => hashes.filter((x) => !h.value.includes(x)).map((x) => `${h.key}: ${x}`));
if (missing.length) {
  console.error("csp-inline-hashes: an inline <script> in index.html is not allowed by the CSP.");
  for (const m of missing) console.error(`  missing ${m}`);
  console.error("If the script change was intended, run: npm run csp:sync (after a build), then commit vercel.json.");
  process.exit(1);
}
console.log(`csp-inline-hashes: ${hashes.length} inline script(s), all allowed by ${scriptPolicies.length} policy header(s)`);
