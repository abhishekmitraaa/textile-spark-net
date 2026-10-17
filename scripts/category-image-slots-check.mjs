#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// "The app's category picture slots and the database's rows are the same list." (2026-10-14)
//
// src/lib/categoryImageSlots.ts names every picture Cosora-Admin can change (New Arrivals'
// tiles, the Categories page's banners and tiles). public.category_images has one row per
// slot, seeded by the migration below; a slot the app shows but the table lacks can't be
// set, and a row the app doesn't show is a picture nobody sees. This loads the app's list
// and the migration's rows and compares them: every slot unique, well formed, and in both.
//
// Since 2026-10-17 a category's /categories tile is its picture on every page (src/lib/categoryPicture.ts):
// this also checks that every vendor-upload sub-category (src/data/sellerCategories.ts) and every New Arrivals
// tile points at a tile that exists. New Arrivals' own slots (new-arrivals/*) were removed by the migration
// *_universal_pictures_jpeg_only.sql; their seed rows in the first migration count as gone once it exists.
//
//   node scripts/category-image-slots-check.mjs          compare (exit 1 on a difference)
//   node scripts/category-image-slots-check.mjs --sql    print the seed rows for a migration
// ─────────────────────────────────────────────────────────────────────────────
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "cosora-slots-"));
const outfile = path.join(dir, "slots.mjs");
const entry = path.join(dir, "entry.ts");
const posix = (f) => path.join(root, f).split(path.sep).join("/");
writeFileSync(entry, [
  `export * from ${JSON.stringify(posix("src/lib/categoryImageSlots.ts"))};`,
  `export { SELLER_SUB_TILE } from ${JSON.stringify(posix("src/lib/categoryPicture.ts"))};`,
  `export { sellerCategories } from ${JSON.stringify(posix("src/data/sellerCategories.ts"))};`,
].join(String.fromCharCode(10)));
await build({
  entryPoints: [entry],
  outfile,
  format: "esm",
  platform: "node",
  bundle: true,
  logLevel: "silent",
  // The taxonomy imports its banner pictures; their bytes don't matter here.
  loader: { ".jpg": "empty", ".jpeg": "empty", ".png": "empty", ".webp": "empty" },
  plugins: [{
    name: "alias",
    setup(b) {
      b.onResolve({ filter: /^@\// }, async (args) => {
        const r = await b.resolve("./" + args.path.slice(2), { resolveDir: path.join(root, "src"), kind: args.kind });
        return r;
      });
    },
  }],
});
const { allCategoryImageSlots, SLOT_PATTERN, categoryTileSlot, NEW_ARRIVALS_TILES, SELLER_SUB_TILE, sellerCategories } = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });

const slots = allCategoryImageSlots();
const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

if (process.argv.includes("--sql")) {
  console.log(slots.map((s) => `  (${q(s.slot)}, ${q(s.surface)}, ${q(s.label)}, ${q(s.group)}, ${s.position})`).join(",\n"));
  process.exit(0);
}

let failures = 0;
const fail = (m) => { failures++; console.log(`*** FAIL *** ${m}`); };

const seen = new Set();
for (const s of slots) {
  if (seen.has(s.slot)) fail(`duplicate slot ${s.slot}`);
  seen.add(s.slot);
  if (!SLOT_PATTERN.test(s.slot) || s.slot.length > 120) fail(`malformed slot ${s.slot}`);
}

// Every Categories tile has its own default picture, and every picture a tile (src/lib/categoryTileImages.ts, 2026-10-16).
const tilesDir = path.join(root, "src", "assets", "categories", "tiles");
const tileSlots = new Set(slots.filter((s) => s.surface === "categories_tile").map((s) => s.slot.slice("categories/".length)));
for (const t of tileSlots) if (!existsSync(path.join(tilesDir, t + ".jpg"))) fail(`no default picture src/assets/categories/tiles/${t}.jpg`);
const tileFiles = existsSync(tilesDir)
  ? readdirSync(tilesDir).flatMap((top) => readdirSync(path.join(tilesDir, top)).map((f) => `${top}/${f}`))
  : [];
for (const f of tileFiles) if (!f.endsWith(".jpg") || !tileSlots.has(f.slice(0, -4))) fail(`src/assets/categories/tiles/${f} belongs to no tile`);
console.log(`${tileFiles.length} tile pictures for ${tileSlots.size} tiles`);

// Every listing category and every New Arrivals tile shows an existing tile's picture (2026-10-17).
const tileExists = (top, label) => seen.has(categoryTileSlot(top, label));
let sellerSubs = 0;
for (const c of sellerCategories) for (const sc of c.subCategories) {
  sellerSubs++;
  const t = SELLER_SUB_TILE[sc.name];
  if (!t) fail(`seller sub-category "${sc.name}" (${c.id}) has no picture: add it to SELLER_SUB_TILE in src/lib/categoryPicture.ts`);
  else if (!tileExists(t[0], t[1])) fail(`SELLER_SUB_TILE["${sc.name}"] names ${t[0]} / ${t[1]}, which is no /categories tile`);
}
for (const [name, t] of Object.entries(SELLER_SUB_TILE)) if (!tileExists(t[0], t[1])) fail(`SELLER_SUB_TILE["${name}"] names ${t[0]} / ${t[1]}, which is no /categories tile`);
for (const t of NEW_ARRIVALS_TILES) if (!tileExists(t.tile[0], t.tile[1])) fail(`New Arrivals tile ${t.key} names ${t.tile.join(" / ")}, which is no /categories tile`);
console.log(`${sellerSubs} seller sub-categories and ${NEW_ARRIVALS_TILES.length} New Arrivals tiles point at tiles`);

// The seed rows of the migration that creates the table: ('slot', 'surface', 'label', group|null, position).
const migDir = path.join(root, "supabase", "migrations");
const file = readdirSync(migDir).find((f) => /_category_images\.sql$/.test(f));
if (!file) {
  fail("no *_category_images.sql migration found");
} else {
  const sql = readFileSync(path.join(migDir, file), "utf8");
  const rows = [...sql.matchAll(/^\s*\('((?:new-arrivals|categories)\/[^']*)', '([a-z_]+)', '((?:[^']|'')*)', (null|'(?:[^']|'')*'), (\d+)\)/gm)]
    .map((m) => ({ slot: m[1], surface: m[2], label: m[3].replace(/''/g, "'"), group: m[4] === "null" ? null : m[4].slice(1, -1).replace(/''/g, "'"), position: Number(m[5]) }));
  // New Arrivals' own slots were deleted by a later migration (2026-10-17).
  if (readdirSync(migDir).some((f) => /_universal_pictures_jpeg_only\.sql$/.test(f))) {
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].slot.startsWith("new-arrivals/")) rows.splice(i, 1);
  }
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  for (const s of slots) {
    const r = bySlot.get(s.slot);
    if (!r) { fail(`${s.slot} is shown by the app but not seeded by ${file}`); continue; }
    if (r.surface !== s.surface || r.label !== s.label || r.group !== s.group || r.position !== s.position) {
      fail(`${s.slot} differs: app ${JSON.stringify(s)} vs migration ${JSON.stringify(r)}`);
    }
  }
  for (const r of rows) if (!seen.has(r.slot)) fail(`${r.slot} is seeded by ${file} but the app doesn't show it`);
  console.log(`${slots.length} slots in the app, ${rows.length} rows in ${file}`);
}

console.log(failures ? `${failures} problem(s)` : "PASS: the app and the migration list the same slots");
process.exit(failures ? 1 : 0);
