#!/usr/bin/env node
/**
 * Keeps vercel.json's SPA rewrites in step with the routes in src/App.tsx.
 *
 * Why this exists: the app used to end vercel.json with a `/(.*) -> /index.html`
 * catch-all, so every URL on www.cosora.in, real or not, returned 200 with the
 * marketplace shell. That is a site-wide soft 404: junk URLs get indexed and eat
 * crawl budget. The fix is an explicit allowlist, one rewrite per real route,
 * with anything unmatched falling through to dist/404.html at a real 404 status.
 *
 * An allowlist can drift. A route added to App.tsx but not to vercel.json would
 * still render (404.html is the same SPA), but it would be served with a 404
 * status and fall out of the index without anyone noticing. So:
 *
 *   node scripts/spa-routes.mjs --write   regenerate the rewrites from App.tsx
 *   node scripts/spa-routes.mjs           check only; exit 1 on any drift
 *
 * The check runs as the first step of `npm run build`, so drift fails the Vercel
 * build and production stays on the last good deploy instead of silently
 * deindexing a page.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(root, "src", "App.tsx");
const VERCEL = path.join(root, "vercel.json");
const SPA_DEST = "/index.html";

/**
 * Every route path literal in App.tsx: `path="/x"` in JSX and `path: "/x"` in the
 * route arrays (buyerShellRoutes). "*" is the NotFound catch-all and "/" is
 * served straight from the filesystem, so neither needs a rewrite.
 */
export function appRoutes() {
  const src = readFileSync(APP, "utf8");
  const found = new Set();
  for (const m of src.matchAll(/\bpath\s*[=:]\s*"([^"]+)"/g)) found.add(m[1]);
  found.delete("*");
  found.delete("/");
  const bad = [...found].filter((p) => !p.startsWith("/"));
  if (bad.length) {
    console.error(`spa-routes: relative or unexpected route paths in App.tsx: ${bad.join(", ")}`);
    console.error("This script assumes a flat route table. Extend it before relying on the allowlist.");
    process.exit(1);
  }
  return [...found].sort();
}

function readVercel() {
  return JSON.parse(readFileSync(VERCEL, "utf8"));
}

const write = process.argv.includes("--write");
const routes = appRoutes();
const config = readVercel();
const rewrites = config.rewrites ?? [];
const fixed = rewrites.filter((r) => r.destination !== SPA_DEST);
const current = rewrites.filter((r) => r.destination === SPA_DEST).map((r) => r.source);

if (write) {
  config.rewrites = [...fixed, ...routes.map((source) => ({ source, destination: SPA_DEST }))];
  writeFileSync(VERCEL, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`spa-routes: wrote ${routes.length} SPA rewrites to vercel.json`);
  process.exit(0);
}

const catchAll = current.filter((s) => s === "/(.*)" || s === "/:path*" || s === "/(.*)?");
const missing = routes.filter((r) => !current.includes(r));
const stale = current.filter((s) => !routes.includes(s));

if (catchAll.length || missing.length || stale.length) {
  console.error("spa-routes: vercel.json is out of step with src/App.tsx.");
  if (catchAll.length) console.error(`  catch-all rewrite present (reintroduces the soft 404): ${catchAll.join(", ")}`);
  if (missing.length) console.error(`  routes with no rewrite (would serve 404 status): ${missing.join(", ")}`);
  if (stale.length) console.error(`  rewrites for routes that no longer exist: ${stale.join(", ")}`);
  console.error("Run: npm run routes:sync");
  process.exit(1);
}

console.log(`spa-routes: ${routes.length} routes, vercel.json in sync`);
