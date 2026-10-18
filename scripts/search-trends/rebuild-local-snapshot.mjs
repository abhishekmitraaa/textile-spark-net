#!/usr/bin/env node
/**
 * Rebuilds site-config/site.json on the LOCAL stack by running the real site-config-snapshot function
 * under Node with a Deno shim (no Deno on this machine). On the local stack the snapshot triggers post to
 * the production URL written into public.site_config_queue_snapshot(), so nothing rebuilds the local file
 * by itself; tests/local/search-trending.spec.ts calls this after each change.
 *
 *   LOCAL_STACK_ENV=.claude/tmp/local-stack-env.json node --experimental-strip-types scripts/search-trends/rebuild-local-snapshot.mjs
 *
 * Prints the function's answer as JSON. Refuses any API that isn't local.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV ?? path.join(ROOT, ".claude/tmp/local-stack-env.json"), "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API)) throw new Error(`refusing a non-local API: ${env.API}`);

let handler;
globalThis.Deno = {
  serve: (h) => { handler = h; },
  env: { get: (k) => ({ SUPABASE_URL: env.API, SUPABASE_ANON_KEY: env.ANON, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE })[k] },
};
await import(pathToFileURL(path.join(ROOT, "supabase/functions/site-config-snapshot/index.ts")).href);
const res = await handler(new Request("http://local/site-config-snapshot", {
  method: "POST",
  headers: { authorization: `Bearer ${env.SERVICE}`, "content-type": "application/json" },
  body: JSON.stringify({ reason: "local rebuild" }),
}));
const body = await res.json();
console.log(JSON.stringify(body));
process.exit(body.status === "ok" ? 0 : 1);
