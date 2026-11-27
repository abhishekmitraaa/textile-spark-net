#!/usr/bin/env node
// node scripts/public-data-check.mjs — the rules of the signed-out edge cache (speed plan 4.1): what the app sends
// to /api/public-data (src/lib/publicData.ts) and what the function passes (api/public-data.ts). A signed-in request,
// a write, a count, search and analytics must never be proxied; only listed reads with plain arguments may pass.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(path.join(tmpdir(), "public-data-check-"));
const load = async (entry, name) => {
  const outfile = path.join(dir, name);
  await build({ entryPoints: [entry], outfile, format: "esm", platform: "node", bundle: true, logLevel: "silent",
    define: { "import.meta.env.VITE_PUBLIC_DATA_PROXY": "undefined" } });
  return import(pathToFileURL(outfile).href);
};
let fail = 0;
const eq = (name, got, want) => {
  const ok = want === "url" ? typeof got === "string" : got === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` (got ${got})`}`);
};
try {
  const { proxiedUrl } = await load("src/lib/publicData.ts", "client.mjs");
  const { argsOk, classify } = await load("api/public-data.ts", "server.mjs");
  const U = "https://x.supabase.co", K = "anonkey";
  const anon = { authorization: "Bearer anonkey", accept: "application/json" };
  const p = (url, method, headers, body) => proxiedUrl(url, method, new Headers(headers), body, U, K);
  eq("anon rpc listed", p(`${U}/rest/v1/rpc/feed_products`, "POST", anon, '{"p_limit":24}'), "url");
  eq("signed-in rpc", p(`${U}/rest/v1/rpc/feed_products`, "POST", { ...anon, authorization: "Bearer usertoken" }, "{}"), null);
  eq("analytics rpc", p(`${U}/rest/v1/rpc/log_engagement_event`, "POST", anon, "{}"), null);
  eq("search rpc", p(`${U}/rest/v1/rpc/search_products`, "POST", anon, "{}"), null);
  eq("anon table listed", p(`${U}/rest/v1/products?select=id&id=eq.1`, "GET", anon), "url");
  eq("private table", p(`${U}/rest/v1/profiles?select=id`, "GET", anon), null);
  eq("write to a listed table", p(`${U}/rest/v1/products`, "POST", anon, "{}"), null);
  eq("count (Prefer)", p(`${U}/rest/v1/products?select=id`, "GET", { ...anon, prefer: "count=exact" }), null);
  eq("HEAD", p(`${U}/rest/v1/products?select=id`, "HEAD", anon), null);
  eq("single object", (p(`${U}/rest/v1/products?select=id`, "GET", { ...anon, accept: "application/vnd.pgrst.object+json" }) ?? "").includes("acc=object"), true);
  eq("another host", p(`https://elsewhere/rest/v1/products`, "GET", anon), null);
  eq("storage", p(`${U}/storage/v1/object/public/x`, "GET", anon), null);
  eq("server: listed rpc", Boolean(classify("rpc/feed_products?select=id")), true);
  eq("server: traversal", classify("rpc/../profiles"), null);
  eq("server: private table", classify("profiles?select=*"), null);
  eq("server: search", classify("rpc/search_products"), null);
  eq("server: plain args", argsOk({ p_limit: 24, p_category_ids: ["a", "b"] }), true);
  eq("server: nested args", argsOk({ p: { x: 1 } }), false);
  eq("server: huge number", argsOk({ p_limit: 1e9 }), false);
  eq("server: array body", argsOk([1]), false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(fail ? 1 : 0);
