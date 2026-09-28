#!/usr/bin/env node
/**
 * Theme codemod (admin completion Phase 9, 2026-09-29).
 *
 * Swaps the five brand colours written as Tailwind arbitrary values
 * (`bg-[#ef4d62]/10`, `hover:text-[#256FEF]`) for the theme's `brand-*` colours
 * (`bg-brand-buyer/10`), which read the CSS variables the site theme sets
 * (src/index.css, tailwind.config.ts, SiteThemeApplier). At the default theme the colour
 * is the same, so pages render pixel-identical until an admin changes the theme.
 *
 *   #256fef → brand-vendor   #ef4d62 → brand-buyer   #14ae5c → brand-success
 *   #d0d4dc → brand-border   #363636 → brand-ink
 *
 * What it leaves alone, and lists:
 *   - every other hex: derived shades (a darker hover coral, a lighter blue) and the rest
 *     of the palette. They don't follow the theme; they're listed for review.
 *   - a brand hex outside a Tailwind colour class. Constants and inline styles were moved to
 *     brand() (src/lib/brand.ts) by hand; a <canvas> stroke can't read CSS variables.
 *
 * Usage:
 *   node scripts/theme-codemod.mjs          rewrite src/ and print a report
 *   node scripts/theme-codemod.mjs --check  change nothing; exit 1 if a brand-hex class is left
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const CHECK = process.argv.includes("--check");

const TOKENS = { "256fef": "vendor", ef4d62: "buyer", "14ae5c": "success", d0d4dc: "border", "363636": "ink" };
const CLASS =
  /(?<![\w-])(text|bg|border(?:-[trblxyse])?|ring(?:-offset)?|divide|outline|fill|stroke|from|via|to|decoration|accent|caret|shadow|placeholder)-\[#([0-9a-fA-F]{6})\]/g;
const BRAND_HEX = /#(256fef|ef4d62|14ae5c|d0d4dc|363636)\b/gi;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

let converted = 0;
const changedFiles = [];
const leftovers = [];

for (const file of files(SRC)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const before = readFileSync(file, "utf8");
  let n = 0;
  const after = before.replace(CLASS, (m, util, hex) => {
    const token = TOKENS[hex.toLowerCase()];
    if (!token) return m;
    n++;
    return `${util}-brand-${token}`;
  });
  if (n > 0) {
    converted += n;
    changedFiles.push(`${rel} (${n})`);
    if (!CHECK) writeFileSync(file, after, "utf8");
  }
  const text = CHECK ? before : after;
  text.split(/\r?\n/).forEach((line, i) => {
    if (BRAND_HEX.test(line)) leftovers.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    BRAND_HEX.lastIndex = 0;
  });
}

console.log(`${CHECK ? "would convert" : "converted"} ${converted} brand-hex classes in ${changedFiles.length} files`);
if (changedFiles.length && (CHECK || process.argv.includes("--verbose"))) console.log("  " + changedFiles.join("\n  "));
console.log(`${leftovers.length} brand hex literal(s) left outside Tailwind classes${leftovers.length ? ":" : ""}`);
for (const l of leftovers) console.log("  " + l);
if (CHECK && converted > 0) process.exit(1);
