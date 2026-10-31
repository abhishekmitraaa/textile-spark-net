// Bundles the two code vocabularies and prints them as JSON (used by f3-seed.mjs).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export async function loadVocabularies() {
  const out = await build({
    stdin: {
      contents: `export * as seller from "@/data/sellerCategories"; export * as requirement from "@/data/requirementSchemas";`,
      resolveDir: root, loader: "ts",
    },
    bundle: true, platform: "node", format: "esm", write: false, tsconfig: path.join(root, "tsconfig.app.json"), logLevel: "error",
  });
  const url = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  return import(url);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = await loadVocabularies();
  const prod = new Set(); for (const c of v.seller.sellerCategories) { for (const f of v.seller.getFieldsForCategory(c.id)) prod.add(f.id); for (const s of c.subCategories) for (const f of s.fields ?? []) prod.add(f.id); for (const f of c.commonFields ?? []) prod.add(f.id); }
  const req = {}; for (const [k, secs] of Object.entries(v.requirement.SCHEMAS)) for (const s of secs) for (const f of s.fields) (req[f.key] ??= []).push(k);
  console.log(JSON.stringify({ productKeys: [...prod].sort(), requirementKeys: Object.fromEntries(Object.entries(req).sort()) }, null, 1));
}
