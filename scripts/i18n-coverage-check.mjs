#!/usr/bin/env node
/**
 * Every string the app renders from its own code has a Hindi and a Gujarati
 * translation (2026-09-26).
 *
 * The language switch translates the rendered page from two catalogues keyed by
 * the English text, src/i18n/hi.json and gu.json (src/lib/i18n.ts,
 * components/i18n/AutoTranslate.tsx). Text with no entry stays English, which
 * is how the switch came to cover 370 of ~6,300 strings and read as
 * "selective". This check lists what the code can render and fails when
 * either catalogue lacks an entry.
 *
 * What counts as rendered text, in the files reachable from src/main.tsx:
 *   • JSX text;
 *   • string literals in display positions: JSX children, display attributes
 *     (placeholder, title, aria-label, alt, label, description, …), object
 *     property values unless the key is technical (id, href, icon, className,
 *     …), array elements, return values, toast(...) and new Error(...) messages;
 *   • template literals in those positions, as placeholder keys:
 *     `Show ${n} results` → "Show {0} results".
 * It over-collects a little (a label that is never shown still needs an
 * entry), which is the safe direction. Proper nouns and codes (brand names,
 * "GSM", "UK 8") are entered with the English as their translation.
 *
 * Also checks that no translation uses a placeholder its English key lacks. It may
 * leave one out: `{0} campaign{1}` puts an English plural "s" in {1}.
 *
 * Usage:
 *   node scripts/i18n-coverage-check.mjs                 exit 1 on anything missing
 *   node scripts/i18n-coverage-check.mjs --write-missing out.json
 *        writes { "<english>": ["file", …] } for what either catalogue lacks
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const require = createRequire(import.meta.url);
const ts = require("typescript");

// The translator itself (its tag names), the catalogue store and generated types.
// lib/supplierAgreement.ts is the contract a vendor signs, stored by version: it
// is shown in English only (data-no-translate in Onboarding.tsx) until a reviewed
// translation exists and the version names it.
// data/indiaStates.ts carries each state's Hindi and Gujarati itself (StateSelect shows them by
// language), and its `aliases` are spellings for matching typed input, never shown.
const SKIP_FILES = [/data[\\/]indiaStates\.ts$/, /lib[\\/]i18n\.ts$/, /i18n[\\/]AutoTranslate\.tsx$/, /lib[\\/]supplierAgreement\.ts$/, /database\.types\.ts$/, /\.test\.tsx?$/];

// Found by the extractor but never shown as text. "s" and "es" are English
// plural endings rendered as their own text node ({n === 1 ? "" : "es"}); both
// catalogues map them to "" so "3 match" + "es" doesn't read "3 मेलes".
const IGNORE = new Set([
  "es",
  "Tshirt", // Trends.tsx image key
  // lib/siteConfig.ts: font families and Google Fonts weight axes, CSS values only.
  "Open Sans", "Roboto", "DM Sans",
  "wght@300;400;500;600;700;800", "wght@300;400;500;700;900", "wght@300;400;500;600;700", "wght@300;400;700",
  // components/ui/carousel.tsx: thrown only when a developer misuses the hook.
  "useCarousel must be used within a <Carousel />",
  // pages/ReportFraud.tsx: lines of the email body Cosora staff receive. English on
  // purpose, and never on the page, so the translator never sees them.
  "What happened:", "(Screenshots attached, if any.)",
  // hooks/useVoiceRecorder.ts: MediaRecorder formats (a MIME type with a codec), not text.
  "audio/webm;codecs=opus", "audio/ogg;codecs=opus",
]);

const DISPLAY_ATTRS = new Set([
  "placeholder", "title", "aria-label", "alt", "label", "description", "heading", "subtitle", "subTitle",
  "text", "cta", "ctaLabel", "message", "hint", "note", "emptyText", "emptyTitle", "emptyDescription",
  "caption", "tooltip", "badge", "helper", "helperText", "confirmLabel", "cancelLabel", "actionLabel",
  "buttonLabel", "sub", "desc", "body", "headline", "tagline", "question", "answer", "prompt", "relatedLabel",
]);
// Object properties hold display text unless their key is plainly technical.
// (An allowlist of display keys missed `deadline`, `quote`, `change`, `l` …)
const TECHNICAL_KEYS = new Set([
  "id", "key", "slug", "route", "to", "href", "path", "url", "link", "src", "image", "img", "images", "icon",
  "Icon", "color", "bg", "className", "class", "variant", "size", "gradient", "accent", "tone", "style",
  "sort", "orderBy", "field", "column", "table", "queryKey", "param", "params", "storageKey", "mime",
  "accept", "format", "pattern", "code", "dial", "iso", "locale", "kind", "event", "source", "placement",
  "goal", "emoji", "testId", "transform", "width", "height", "top", "left", "right", "bottom", "background",
  "backgroundImage", "filter", "gridTemplateColumns", "fontFamily", "animation", "transition", "ease",
  "bucket", "rpc", "fn", "channel", "select", "onConflict", "method", "mode", "target", "rel",
]);
const CALLS = /^(toast|toast\.(success|error|info|warning|message|loading|promise)|t|translate|Error)$/;

// ── Files reachable from src/main.tsx ──
const parsed = new Map();
function parse(p) {
  if (!parsed.has(p)) {
    parsed.set(p, ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true,
      p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return parsed.get(p);
}
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
    if (/\.tsx?$/.test(c) && existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
const reachable = new Set();
(function reach(p) {
  if (reachable.has(p)) return;
  reachable.add(p);
  const specs = [];
  (function find(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) specs.push(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) specs.push(n.arguments[0].text);
    ts.forEachChild(n, find);
  })(parse(p));
  for (const s of specs) { const r = resolveImport(p, s); if (r) reach(r); }
})(path.join(SRC, "main.tsx"));

// ── Collect ──
const found = new Map(); // english -> Set(file)
const add = (s, file) => { if (!found.has(s)) found.set(s, new Set()); found.get(s).add(file); };
const norm = (s) => s.replace(/\s+/g, " ").trim();
// JSX text and JSX attribute strings decode HTML entities; the page shows "&", not "&amp;".
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", mdash: "—", ndash: "–", middot: "·", times: "×", rarr: "→", larr: "←", bull: "•", copy: "©", reg: "®", trade: "™", deg: "°", rupee: "₹" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m));
const hasWord = (s) => /[A-Za-z]{2,}/.test(s);
const isCss = (s) => /[{}]/.test(s) && /[;:]/.test(s);

// A class list only if EVERY word is a class: hyphenated ("text-sm", "mb-1.5",
// "hover:bg-x", "group-[.toast]:text-y") or a bare utility. A sentence that
// merely contains "hidden" or "order" is text (it used to be dropped as classes).
const BARE_UTILITIES = new Set(["flex", "grid", "block", "hidden", "inline", "relative", "absolute", "fixed", "sticky", "static", "truncate", "underline", "uppercase", "lowercase", "capitalize", "italic", "shrink", "grow", "ring", "outline", "rounded", "border", "shadow", "transition", "container", "contents", "invisible", "visible", "isolate", "group", "peer", "prose", "antialiased", "destructive", "toast"]);
function isClassList(s) {
  return s.split(/\s+/).every((tok) => {
    const t = tok.replace(/^!?([\w\-[\].&=:>*()]+:)+/, "").replace(/^!/, "");
    return /^-?[a-z][a-z0-9]*(-[\w./%[\]#()'=,]+)+$/.test(t) || BARE_UTILITIES.has(t);
  });
}

// `strong`: the string is written straight into the page (a JSX child or display
// attribute, a toast), so even a lowercase word like "active" is text there.
function looksHuman(s, strong = false) {
  if (!hasWord(s) || isCss(s)) return false;
  if (/^(https?:|mailto:|tel:|\/|#|\.|@\/|data:)/.test(s)) return false;
  if (/^\S+@\S+\.\S+$/.test(s) || /^Bearer /.test(s)) return false;     // emails, auth headers
  if (/^[A-Z][a-z]+\/[A-Z][a-z_]+$/.test(s) || s === "UTC") return false; // time zones
  if (/^[\w{}.-]+\.(csv|json|pdf|png|jpe?g|txt)$/i.test(s)) return false; // file names
  if (/\d(px|rem|em)\b|\b(rgba?|hsla?|blur|env|var)\(|^center\b|mandatory$|^\d+(\.\d+)?%?\s+\d/.test(s)) return false; // CSS values
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(s)) return false;         // PascalCase identifiers
  if (strong ? /^[a-z0-9]*[_.:0-9][a-z0-9_.:-]*$/.test(s) : /^[a-z0-9_.:-]+$/.test(s)) return false; // keys, slugs
  if (/^[a-z][a-zA-Z0-9]*$/.test(s) && (!strong || /[A-Z0-9]/.test(s))) return false; // camelCase
  if (/^[A-Z][A-Z0-9_]+$/.test(s) && s.includes("_")) return false;  // CONSTANT_KEYS
  if (isClassList(s)) return false;                                  // Tailwind classes
  if (/^(image|video|audio|application|text)\/[\w.+-]+(,\s*(image|video|audio|application|text)\/[\w.+-]+)*$/.test(s)) return false; // MIME types
  if (/^[a-z]+(\.[a-z]+)+$/.test(s)) return false;                   // dotted keys
  return true;
}
function calleeName(e) {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return `${calleeName(e.expression)}.${e.name.text}`;
  return "";
}
// 0: not shown. 1: probably shown (an object value, array element, return
// value). 2: written straight into the page (JSX child, display attribute, toast).
function displayStrength(node) {
  const p = node.parent;
  if (!p) return 0;
  if (ts.isJsxAttribute(p)) return DISPLAY_ATTRS.has(p.name.getText()) ? 2 : 0;
  if (ts.isJsxExpression(p)) {
    const gp = p.parent;
    return gp && ts.isJsxAttribute(gp) ? (DISPLAY_ATTRS.has(gp.name.getText()) ? 2 : 0) : 2;
  }
  if (ts.isConditionalExpression(p) && p.condition !== node) return displayStrength(p);
  if (ts.isBinaryExpression(p) && p.right === node && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind)) return displayStrength(p);
  if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p)) return displayStrength(p);
  if (ts.isPropertyAssignment(p) && p.initializer === node) return TECHNICAL_KEYS.has(p.name.getText().replace(/['"]/g, "")) ? 0 : 1;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const c = calleeName(p.expression);
    return /^toast/.test(c) || c === "t" || c === "translate" ? 2 : c === "Error" ? 1 : 0;
  }
  if (ts.isArrayLiteralExpression(p) || ts.isReturnStatement(p)) return 1;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return /(label|title|text|message|msg|copy|heading|note|hint|description|desc|placeholder|cta|subtitle|empty|line|summary|caption|status|detail|body|headline|tagline|reason|error|prompt|usage|intro|outro|disclaimer|notice|sub$)/i.test(p.name.text) ? 1 : 0;
  return 0;
}
function templateKey(t) {
  let s = t.head.text;
  t.templateSpans.forEach((sp, i) => { s += `{${i}}${sp.literal.text}`; });
  return norm(s);
}
function visit(node, file) {
  if (ts.isJsxText(node)) {
    const s = norm(decode(node.text));
    if (s && hasWord(s) && !isCss(s)) add(s, file);
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const p = node.parent;
    const s = norm(ts.isJsxAttribute(p) ? decode(node.text) : node.text);
    const strength = displayStrength(node);
    if (s && strength && looksHuman(s, strength === 2) && !ts.isImportDeclaration(p) && !ts.isExportDeclaration(p) && !ts.isLiteralTypeNode(p)) add(s, file);
  } else if (ts.isTemplateExpression(node) && displayStrength(node)) {
    const k = templateKey(node);
    // The literal parts must read as words. A path, URL, query or style value
    // (`/v1/${fn}`, `?id=${id}`, `${n}px`) is code, not text.
    const literal = norm(k.replace(/\{\d\}/g, " "));
    const codeLike = /^\S*[/?=&]\S*$/.test(literal) || /:\/\/|\b(px|rem|vh|vw|deg|ms)\b|calc\(|rgba?\(|url\(|\.eq\.|\.in\.|^Bearer\b|\.(csv|json|pdf|png|jpe?g|txt)$/i.test(k);
    if (hasWord(literal) && !codeLike && looksHuman(literal.replace(/^[/|·•,.:;-]+\s*/, ""))) add(k, file);
  }
  ts.forEachChild(node, (c) => visit(c, file));
}
for (const p of reachable) {
  if (SKIP_FILES.some((r) => r.test(p))) continue;
  visit(parse(p), path.relative(SRC, p).replace(/\\/g, "/"));
}
// Text the page shows that isn't in this codebase: written by database functions
// (notifications), stored in tables (FAQs, plans, categories), or produced by
// date formatting. src/i18n/external-strings.json lists it by source; each
// group's "_source" says where it comes from and how to refresh it.
const external = JSON.parse(readFileSync(path.join(SRC, "i18n", "external-strings.json"), "utf8"));
for (const [group, list] of Object.entries(external)) {
  if (!Array.isArray(list)) continue;
  for (const s of list) add(norm(s), `external-strings.json:${group}`);
}
for (const s of IGNORE) found.delete(s);

// ── Compare ──
const placeholders = (s) => [...s.matchAll(/\{(\d)\}/g)].map((m) => m[1]).sort().join(",");
const catalogs = Object.fromEntries(["hi", "gu"].map((l) => [l, JSON.parse(readFileSync(path.join(SRC, "i18n", `${l}.json`), "utf8"))]));

let failed = false;
const missing = new Map();
for (const [lang, cat] of Object.entries(catalogs)) {
  const miss = [...found.keys()].filter((s) => typeof cat[s] !== "string" || !cat[s].trim());
  // A translation may leave a placeholder out (an English plural "s"), never add one.
  const badPh = Object.entries(cat).filter(([en, tr]) => placeholders(tr).split(",").filter(Boolean).some((p) => !placeholders(en).split(",").includes(p))).map(([en]) => en);
  console.log(`${lang}: ${found.size - miss.length}/${found.size} strings translated; ${miss.length} missing; ${badPh.length} with mismatched placeholders`);
  for (const s of miss) missing.set(s, [...found.get(s)]);
  if (miss.length || badPh.length) failed = true;
  badPh.slice(0, 20).forEach((s) => console.log(`  placeholder mismatch: ${JSON.stringify(s)}`));
}
const outIdx = process.argv.indexOf("--write-missing");
if (outIdx > 0) {
  writeFileSync(process.argv[outIdx + 1], JSON.stringify(Object.fromEntries(missing), null, 1));
  console.log(`wrote ${missing.size} missing strings to ${process.argv[outIdx + 1]}`);
} else if (missing.size) {
  [...missing.keys()].slice(0, 25).forEach((s) => console.log(`  missing: ${JSON.stringify(s)} (${missing.get(s)[0]})`));
  if (missing.size > 25) console.log(`  … and ${missing.size - 25} more (--write-missing <file> lists them all)`);
}
console.log(`${reachable.size} files scanned.`);
process.exit(failed ? 1 : 0);
