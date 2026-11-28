// Region move (documentation/region-move-runbook-2026-11-28.md):
//   node scripts/region-move/copy-storage.mjs <objects.csv> <keys.env> <old ref> <new ref>
// Copies every object listed in objects.csv (bucket,name,mimetype,cacheControl,size; exported from the new project's
// storage.objects after the data restore) from the old project's Storage to the new one, same bucket and path,
// upserting. keys.env holds PROD_SERVICE_KEY and MUMBAI_SERVICE_KEY and lives in .claude/tmp/region-move/ (git-ignored),
// never in the repo. Failures go to copy-storage.log next to the CSV.
import { readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
const [csvPath, keysPath, OLD, NEW] = process.argv.slice(2);
if (!csvPath || !keysPath || !OLD || !NEW) { console.error("usage: copy-storage.mjs <objects.csv> <keys.env> <old ref> <new ref>"); process.exit(2); }
const env = Object.fromEntries(readFileSync(keysPath, "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const FROM = `https://${OLD}.supabase.co`, TO = `https://${NEW}.supabase.co`;
const parse = (line) => { const out = []; let cur = "", q = false; for (let i = 0; i < line.length; i++) { const ch = line[i];
  if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
  else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const rows = readFileSync(csvPath, "utf8").split("\n").filter(Boolean).map(parse);
const enc = (n) => n.split("/").map(encodeURIComponent).join("/");
let ok = 0, fail = 0, bytes = 0; const log = path.join(path.dirname(csvPath), "copy-storage.log");
async function one([bucket, name, mime, cache]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const g = await fetch(`${FROM}/storage/v1/object/authenticated/${bucket}/${enc(name)}`, { headers: { Authorization: `Bearer ${env.PROD_SERVICE_KEY}`, apikey: env.PROD_SERVICE_KEY } });
      if (!g.ok) throw new Error(`get ${g.status}`);
      const body = Buffer.from(await g.arrayBuffer());
      const p = await fetch(`${TO}/storage/v1/object/${bucket}/${enc(name)}`, { method: "POST", body,
        headers: { Authorization: `Bearer ${env.MUMBAI_SERVICE_KEY}`, apikey: env.MUMBAI_SERVICE_KEY, "Content-Type": mime, "x-upsert": "true", "cache-control": cache.replace(/^max-age=/, "") } });
      if (!p.ok) throw new Error(`put ${p.status} ${(await p.text()).slice(0, 120)}`);
      ok++; bytes += body.length; return;
    } catch (e) { if (attempt === 3) { fail++; appendFileSync(log, `${bucket}/${name}\t${e.message}\n`); } }
  }
}
const queue = [...rows]; await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await one(queue.shift()); }));
console.log(`copied ${ok}, failed ${fail}, ${(bytes / 1048576).toFixed(1)} MB`);
