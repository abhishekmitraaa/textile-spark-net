#!/usr/bin/env node
/**
 * site-config-snapshot carries /search's trending list (migration 20261018120000_search_trends), checked on
 * the LOCAL stack. The function file itself runs here under Node with a small Deno shim (no Deno on this
 * machine), so what is checked is the code that gets deployed:
 *
 *   1. the switch off: site.json has search_trends with public:false and no terms;
 *   2. the switch on for everyone (and a list with terms in force): site.json has them, words only;
 *   3. the buyer app's parser (src/lib/searchTrends.ts) accepts both files and rejects broken ones.
 *
 *   LOCAL_STACK_ENV=.claude/tmp/local-stack-env.json node --experimental-strip-types scripts/search-trends/snapshot-check.mjs
 *
 * It sets the switch and adds one run with three terms through psql (docker exec), and puts both back in
 * a finally: the switch as it was, the added run deleted. Refuses any API that isn't local.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV ?? path.join(ROOT, ".claude/tmp/local-stack-env.json"), "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API)) throw new Error(`refusing a non-local API: ${env.API}`);

const sql = (q) => execFileSync("docker", ["exec", "supabase_db_localstack", "psql", "-U", "postgres", "-tAc", q], { encoding: "utf8" }).trim();

// ── The function, under a Deno shim ──
let handler;
globalThis.Deno = {
  serve: (h) => { handler = h; },
  env: { get: (k) => ({ SUPABASE_URL: env.API, SUPABASE_ANON_KEY: env.ANON, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE })[k] },
};
await import(pathToFileURL(path.join(ROOT, "supabase/functions/site-config-snapshot/index.ts")).href);
const { parseSearchTrends, isShowable, istYesterday } = await import(pathToFileURL(path.join(ROOT, "src/lib/searchTrends.ts")).href);

async function rebuild() {
  const res = await handler(new Request("http://local/site-config-snapshot", {
    method: "POST",
    headers: { authorization: `Bearer ${env.SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ reason: "snapshot-check" }),
  }));
  const body = await res.json();
  if (body.status !== "ok") throw new Error(`rebuild: ${JSON.stringify(body)}`);
  const file = await fetch(`${env.API}/storage/v1/object/public/site-config/site.json?t=${Date.now()}`, { cache: "no-store" });
  return file.json();
}

let failed = 0;
const check = (id, cond, msg, detail) => {
  if (cond) console.log(`ok   ${id}  ${msg}`);
  else { failed++; console.log(`FAIL ${id}  ${msg}  ${JSON.stringify(detail).slice(0, 400)}`); }
};

const flagState = (key) => sql(`select enabled::text || '|' || array_to_string(allow_profile_ids, ',') from public.feature_flags where key = '${key}'`);
const before = flagState("search_trending");
const beforeTerms = flagState("search_trending_terms");
let addedRun = null;
try {
  sql("update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key in ('search_trending', 'search_trending_terms')");
  let doc = await rebuild();
  check("S1", doc.version === 1 && doc.search_trends && doc.search_trends.public === false && doc.search_trends.terms.length === 0,
        "switch off: site.json has search_trends, not public, no terms", doc.search_trends);
  check("S2", Array.isArray(doc.banners) && "hero_slides" in doc, "the rest of site.json is unchanged in shape", Object.keys(doc));
  const parsedOff = parseSearchTrends(doc.search_trends);
  check("S3", parsedOff && !isShowable(parsedOff), "the app parses it and shows nothing", parsedOff);

  // A list in force for yesterday, with three terms (as the nightly job would write).
  const y = istYesterday();
  addedRun = sql(`with r as (insert into admin.search_trend_runs (ist_day, trend_window, window_start, source, terms_found)
                    values ('${y}', 'day', '${y}', 'manual', 3) returning id)
                  insert into admin.search_trend_items (run_id, kind, rank, label, visitors, searches)
                  select r.id, k, n, l, 9, 9 from r,
                    (values ('term', 1, 'linen shirt'), ('term', 2, 'cotton kurta'), ('term', 3, 'denim jacket'), ('category', 1, 'Shirt')) v(k, n, l)
                  returning run_id`).split("\n")[0];
  // Categories only (20261018150000): the list on for everyone, typed terms off.
  sql("update public.feature_flags set enabled = true where key = 'search_trending'");
  doc = await rebuild();
  const co = doc.search_trends;
  check("S8", co?.public === true && co.terms.length === 0 && JSON.stringify(co.categories) === JSON.stringify([{ label: "Shirt" }]),
        "terms switch off: the file has the categories and no typed term", co);
  check("S9", isShowable(parseSearchTrends(co)), "the app shows a categories-only list", co);

  sql("update public.feature_flags set enabled = true where key = 'search_trending_terms'");
  doc = await rebuild();
  const st = doc.search_trends;
  check("S4", st?.public === true && st.shown === true && st.window === "day" && st.ist_day === y,
        "switch on for everyone: public, shown, yesterday's day list", st);
  check("S5", JSON.stringify(st.terms) === JSON.stringify([{ label: "linen shirt" }, { label: "cotton kurta" }, { label: "denim jacket" }])
        && JSON.stringify(st.categories) === JSON.stringify([{ label: "Shirt" }]), "terms and categories in rank order, words only", st);
  check("S6", !JSON.stringify(doc).includes("visitors"), "no count reaches the public file", null);
  const parsedOn = parseSearchTrends(st);
  check("S7", isShowable(parsedOn) && parsedOn.terms.length === 3 && parsedOn.categories[0] === "Shirt", "the app parses it and would show it", parsedOn);

  // The parser refuses what isn't the shape.
  check("P1", parseSearchTrends(null) === null && parseSearchTrends([]) === null && parseSearchTrends({ ...st, version: 2 }) === null,
        "not an object, or another version: no list", null);
  check("P2", !isShowable(parseSearchTrends({ ...st, ist_day: "2020-01-01" })), "a list for an older day isn't shown (job hasn't run)", null);
  check("P3", parseSearchTrends({ ...st, window: "year" }).shown === false, "an unknown window isn't shown", null);
  const messy = parseSearchTrends({ ...st, terms: [{ label: "a" }, { label: 5 }, "x", { label: "Linen Shirt" }, { label: "linen shirt" },
    ...Array.from({ length: 12 }, (_, i) => ({ label: `term ${i}` }))] });
  check("P4", messy.terms[0] === "Linen Shirt" && messy.terms.length === 10, "bad labels and repeats dropped, at most 10", messy.terms);
} finally {
  for (const [key, state] of [["search_trending", before], ["search_trending_terms", beforeTerms]]) {
    const [enabled, ids] = state.split("|");
    sql(`update public.feature_flags set enabled = ${enabled === "true"}, allow_profile_ids = '{${ids}}' where key = '${key}'`);
  }
  if (addedRun) sql(`delete from admin.search_trend_runs where id = ${Number(addedRun)}`);
  await rebuild().catch(() => {});
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
