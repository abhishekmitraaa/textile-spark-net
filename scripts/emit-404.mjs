#!/usr/bin/env node
/**
 * Copies the built dist/index.html to dist/404.html.
 *
 * Vercel serves 404.html, at a real 404 status, for any request that matches no
 * file and no rewrite. Making it the SPA itself means an unknown URL still boots
 * the app and react-router renders the NotFound page, so a visitor sees the
 * proper "not found" screen and a crawler sees the proper status.
 *
 * It has to be the built file, not a copy in public/: the built index.html
 * carries the hashed asset URLs for this deploy.
 */
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const src = path.join(dist, "index.html");
if (!existsSync(src)) {
  console.error("emit-404: dist/index.html not found. Run vite build first.");
  process.exit(1);
}
copyFileSync(src, path.join(dist, "404.html"));
console.log("emit-404: dist/404.html written");
