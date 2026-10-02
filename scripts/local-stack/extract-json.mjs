// Local stack, step 2: turn a saved query result into the JSON load-schema.mjs reads.
//   node scripts/local-stack/extract-json.mjs <saved-result.txt> <out.json>
// Accepts either the bare JSON rows a SQL client copies, or the Supabase MCP tool's reply
// (the rows wrapped in an <untrusted-data-…> block, itself inside {"result": "…"}).
import { readFileSync, writeFileSync } from "node:fs";

const [input, out] = process.argv.slice(2);
if (!input || !out) { console.error("usage: node extract-json.mjs <saved-result.txt> <out.json>"); process.exit(2); }
let text = readFileSync(input, "utf8");
try { const outer = JSON.parse(text); text = typeof outer.result === "string" ? outer.result : text; } catch { /* plain text */ }
let rows;
const open = text.search(/<untrusted-data-[0-9a-f-]+>\n/);
if (open >= 0) {
  const start = text.indexOf("\n", open) + 1;
  rows = JSON.parse(text.slice(start, text.lastIndexOf("</untrusted-data-")).trim());
} else rows = JSON.parse(text);
writeFileSync(out, JSON.stringify(rows));
console.log(`${input}: ${rows.length} row(s) -> ${out}`);
