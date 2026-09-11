#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Photo search — photo → image-search → query → the app's own search path,
// plus the two guards added 2026-09-10: "not a product photo" and the limiter.
//
// WHY THIS SCRIPT EXISTS. The 2026-07-04 changelog entry verified that the
// `image-search` edge function was "deployed + reachable" — which, with no
// OPENAI_API_KEY set, meant it answered `{ error: "not_configured" }`. Nobody
// ever proved that a real photo produces a real query, or that the query then
// runs through catalogue search. For two months the photo buttons toasted
// "isn't set up yet" and nothing noticed. This is that missing check.
//
// It asserts five things against the LIVE project:
//
//   1. The function's input guard still answers `no_image` (costs nothing).
//   2. A real product photo produces `{ query }` — not `not_configured`, not a
//      vision error — and the query honours the function's own contract:
//      3–6 lowercase words, no punctuation. A hyphen INSIDE a word is allowed,
//      because the function's own prompt example is "men white cotton polo
//      t-shirt".
//   3. That query, fed into `fetchSearch` from src/lib/queries/search.ts — the
//      exact function `useProductSearch` runs on /search/results — resolves
//      without throwing and returns an array. An EMPTY array is a pass: the
//      point is that the pipeline runs end to end, not that this one photo has
//      a match in today's catalogue.
//   4. A genuinely irrelevant image — a solid-colour square generated here,
//      byte by byte, not fetched from anywhere — answers `no_match` rather than
//      a fabricated garment. Before Structured Outputs it came back as "men
//      blue denim jacket" and ran a real search.
//   5. The rate limiter trips: calls from this machine in a tight loop turn
//      into `rate_limited` within IP_LIMIT + 1 calls.
//
// REUSE, NOT REIMPLEMENTATION. `fetchSearch` (search_products RPC → embed-query
// warm-up on a cold query → hydrate → reapply ranking) is bundled straight out
// of the app with esbuild, together with the app's own Supabase client, the way
// ad-destination-check.mjs bundles adDestination.ts. `fetchSearch` is module-
// private in search.ts, so a load-time plugin appends `export { fetchSearch }`
// to the source in memory — the file on disk is not touched.
//
// THE FIXTURE is scripts/fixtures/polo-tshirt-listing.jpg: the exact bytes the
// live catalogue serves for the "Premium Cotton Polo T-Shirt" listing (500×650,
// ~38 KB). It is at most 1024px on its longest edge, so Search.tsx's
// compressForUpload() passes it through untouched — what this script sends is
// byte-for-byte what a browser sends for the same file.
//
// THE RATE-LIMIT LOOP SPENDS A REAL BUDGET. The per-IP bucket is keyed on the
// leftmost x-forwarded-for entry, and this deployment rebuilds that header at
// its edge: tested 2026-09-11 with a probe build, a forged single IP, a forged
// "a, b" pair, a forged non-IP token and a forged IPv6 value never reached the
// function in any position (see documentation/securityflags.md, 2026-09-11).
// So there is no throwaway bucket to use — the loop exhausts THIS MACHINE's
// real `img:ip:<addr>` bucket, and anyone else on the same address is
// throttled too until it is cleaned up. The loop runs as ANON so it does not
// also exhaust demo-buyer's `img:user:` bucket.
//
// CLEANUP. embed_query_rate_limit is RLS-on with no policies — no client role,
// admin included, can read or write it. So, the same way
// migrate-kyc-to-private-bucket.mjs does, this script reads
// SUPABASE_SERVICE_ROLE_KEY from the environment or this repo's .env:
//   * WITH the key: it snapshots the img:ip:/img:user: rows before the run.
//     Afterwards it DELETES every row the run created (a caller that did not
//     exist before, or whose window rolled over during the run) and RESETS any
//     row that already existed to its pre-run count, removing exactly this
//     run's increments — then confirms both with a fresh read. That is the
//     intended normal path.
//   * WITHOUT it: it prints the exact SQL to run (Supabase SQL editor or MCP).
// Either way the nightly `prune-embed-rate-limit` job removes any stale row
// within a day. The shared `img:global` counter is deliberately left alone: it
// is production state, and this run's ~13 increments against a 300/hour
// ceiling expire with its window.
//
// COST. ~(3 + IP_LIMIT) gpt-4o-mini vision calls at detail:"low" per run (the
// solid square is ~760 bytes), plus at most one embedding for a novel query.
//
//   node scripts/image-search-check.mjs
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/image-search-check.mjs
// ─────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

// Credentials exactly as migrate-kyc-to-private-bucket.mjs reads them: this
// repo's .env, with a process-environment override for the service key.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

const PASSWORD = "cosora123";
const FIXTURE = path.join(REPO_ROOT, "scripts/fixtures/polo-tshirt-listing.jpg");
// Mirrors UPLOAD_MAX_EDGE in Search.tsx.
const UPLOAD_MAX_EDGE = 1024;
// Mirrors image_search_rate_check's p_ip_limit default (migration 20260910190000).
const IP_LIMIT = 10;

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${ok || !detail ? "" : `\n          ${detail}`}`);
}

function jpegSize(buf) {
  for (let i = 2; i < buf.length - 8;) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

// A solid-colour RGB PNG, encoded by hand so the irrelevant-image case depends
// on nothing fetched from anywhere.
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function solidPng(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(Array(size).fill(row)))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Limiter-row bookkeeping (service role only) ──
const svc = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;
const LIMITER_ROWS = "caller.like.img:ip:*,caller.like.img:user:*";
async function limiterRows() {
  const { data, error } = await svc
    .from("embed_query_rate_limit").select("caller, window_start, count").or(LIMITER_ROWS);
  if (error) throw new Error(`reading embed_query_rate_limit: ${error.message}`);
  return new Map(data.map((r) => [r.caller, r]));
}

// ── Bundle the app's real search path ──
// The output goes under node_modules/.cache so Node resolves the external
// packages (@supabase/supabase-js, @tanstack/react-query) from this repo.
const outDir = path.join(REPO_ROOT, "node_modules/.cache/image-search-check");
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, `bundle-${Date.now().toString(36)}.mjs`);

const exposeFetchSearch = {
  name: "expose-fetchSearch",
  setup(b) {
    b.onLoad({ filter: /src[\\/]lib[\\/]queries[\\/]search\.ts$/ }, (args) => ({
      contents: `${readFileSync(args.path, "utf8")}\nexport { fetchSearch };\n`,
      loader: "ts",
    }));
  },
};

await build({
  stdin: {
    contents: [
      'export { supabase } from "@/lib/supabase";',
      'export { fetchSearch, SEARCH_MATCH_COUNT } from "@/lib/queries/search";',
    ].join("\n"),
    resolveDir: path.join(REPO_ROOT, "src"),
    loader: "ts",
  },
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  tsconfig: path.join(REPO_ROOT, "tsconfig.app.json"),
  define: {
    "import.meta.env": JSON.stringify({
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: ANON,
      MODE: "production", DEV: false, PROD: true,
    }),
  },
  plugins: [exposeFetchSearch],
  logLevel: "silent",
});

const { supabase, fetchSearch, SEARCH_MATCH_COUNT } = await import(pathToFileURL(outfile).href);
const anonDb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

// Fallback-path cleanup SQL matches rows whose window opened during this run;
// a minute of slack in case this clock runs ahead of the database's.
const runStartIso = new Date(Date.now() - 60_000).toISOString();
let buyerId = null;

console.log(`\ncleanup mode: ${svc ? "service role — deletes and count-confirms its own limiter rows" : "NO service key — will print cleanup SQL"}`);
const before = svc ? await limiterRows() : null;

try {
  // ── 0. Setup: a real buyer session, a real photo ──
  console.log("\n0. Setup");
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: "demo-buyer@cosora.dev", password: PASSWORD,
  });
  buyerId = auth?.user?.id ?? null;
  check("signed in as demo-buyer through the app's own Supabase client", !authErr && Boolean(auth?.session),
    authErr?.message ?? "no session");

  const photo = readFileSync(FIXTURE);
  const dims = jpegSize(photo);
  console.log(`          fixture: scripts/fixtures/polo-tshirt-listing.jpg — ${photo.length.toLocaleString("en-IN")} bytes, ${dims?.width}×${dims?.height}`);
  check(`fixture is within ${UPLOAD_MAX_EDGE}px, so the browser would send these exact bytes`,
    Boolean(dims) && Math.max(dims.width, dims.height) <= UPLOAD_MAX_EDGE,
    `dimensions ${JSON.stringify(dims)}`);
  const image = `data:image/jpeg;base64,${photo.toString("base64")}`;

  // ── 1. The input guard (no OpenAI spend) ──
  console.log("\n1. The function's input guard");
  const { error: emptyErr } = await supabase.functions.invoke("image-search", { body: {} });
  const emptyStatus = emptyErr?.context?.status;
  const emptyBody = emptyErr?.context ? await emptyErr.context.json().catch(() => null) : null;
  check("a request with no image is refused with 400 no_image",
    emptyStatus === 400 && emptyBody?.error === "no_image",
    `got status ${emptyStatus}, body ${JSON.stringify(emptyBody)}`);

  // ── 2. A real photo produces a real query ──
  console.log("\n2. A real product photo → a search query (live OpenAI call)");
  const started = Date.now();
  const { data, error } = await supabase.functions.invoke("image-search", {
    body: { image, mimeType: "image/jpeg" },
  });
  const ms = Date.now() - started;
  check("invoke returned without a transport error", !error, error?.message);
  check("the function is CONFIGURED — OPENAI_API_KEY is set", data?.error !== "not_configured",
    "got { error: \"not_configured\" } — the secret is missing on the project");
  check("the response carries no error at all", !data?.error,
    data?.error === "rate_limited"
      ? "got rate_limited BEFORE the loop — a previous run's img:ip/img:user rows were not cleaned up (see CLEANUP in this file's header), or wait 10 minutes"
      : `got ${JSON.stringify(data)}`);

  const query = typeof data?.query === "string" ? data.query : "";
  console.log(`          query: ${JSON.stringify(query)} (${ms} ms)`);
  check("the response has a non-empty `query` string", query.trim().length > 0, `got ${JSON.stringify(data)}`);

  const words = query.trim().split(/\s+/).filter(Boolean);
  check("the query is 3–6 words", words.length >= 3 && words.length <= 6, `${words.length} words`);
  check("the query is lowercase", query === query.toLowerCase(), JSON.stringify(query));
  check("the query has no punctuation (a hyphen inside a word, as in t-shirt, is allowed)",
    words.every((w) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w)), JSON.stringify(query));

  // ── 3. The query runs through the app's own search ──
  console.log("\n3. That query → fetchSearch (what /search/results runs)");
  if (query) {
    let result = null;
    let thrown = null;
    try {
      // useProductSearch trims before calling; so does this.
      result = await fetchSearch(query.trim(), SEARCH_MATCH_COUNT);
    } catch (e) {
      thrown = e;
    }
    check("fetchSearch resolved without throwing", !thrown, thrown?.message ?? String(thrown));
    check("it returned an array of rows (empty is a valid outcome)", Array.isArray(result?.rows),
      `got ${JSON.stringify(result)?.slice(0, 200)}`);
    check("embeddingUsed is a boolean the UI can report honestly", typeof result?.embeddingUsed === "boolean");
    if (Array.isArray(result?.rows)) {
      const top = result.rows.slice(0, 5).map((r) => r.name).join(" · ");
      console.log(`          ${result.rows.length} result(s), ${result.embeddingUsed ? "semantic + keyword" : "keyword match only"}${top ? ` — ${top}` : ""}`);
    }
  } else {
    check("a query was available to search with", false, "step 2 produced no query");
  }

  // ── 4. An irrelevant image is refused, not described ──
  console.log("\n4. A generated solid-colour square → no_match (live OpenAI call)");
  const square = solidPng(256, [37, 111, 239]);
  const squareUrl = `data:image/png;base64,${square.toString("base64")}`;
  console.log(`          image: 256×256 solid rgb(37,111,239) PNG, ${square.length} bytes, generated in-process`);
  const { data: sq, error: sqErr } = await supabase.functions.invoke("image-search", {
    body: { image: squareUrl, mimeType: "image/png" },
  });
  check("invoke returned without a transport error", !sqErr, sqErr?.message);
  check("the answer is no_match, and carries no fabricated query",
    sq?.error === "no_match" && sq?.query === undefined, `got ${JSON.stringify(sq)}`);

  // ── 5. The rate limiter trips ──
  console.log(`\n5. The per-IP limit (${IP_LIMIT} per 10 min) → rate_limited, as anon`);
  const trail = [];
  let trippedAt = 0;
  let transportErrors = 0;
  for (let i = 1; i <= IP_LIMIT + 1; i++) {
    const t = Date.now();
    const { data: r, error: rErr } = await anonDb.functions.invoke("image-search", {
      body: { image: squareUrl, mimeType: "image/png" },
    });
    if (rErr) transportErrors += 1;
    trail.push(`${i}:${rErr ? "transport-error" : r?.error ?? "query"}(${Date.now() - t}ms)`);
    if (r?.error === "rate_limited") { trippedAt = i; break; }
  }
  console.log(`          ${trail.join(" ")}`);
  check(`the response became rate_limited within ${IP_LIMIT + 1} calls`, trippedAt > 0,
    "never tripped — the limiter is not being consulted, or is failing open");
  check("rate_limited arrived as a 200 body, not a transport error", transportErrors === 0,
    `${transportErrors} transport error(s)`);
  check("every call before the trip was served normally (no_match), not refused",
    trail.slice(0, Math.max(trippedAt - 1, 0)).every((s) => s.includes(":no_match(")), trail.join(" "));
  // This machine's IP had already spent 2 calls in steps 2 and 4 (step 1
  // returns before the limiter). From a clean bucket the trip lands on call
  // IP_LIMIT - 2 + 1; anything earlier means other traffic shares this address.
  console.log(`          tripped on loop call ${trippedAt}; from a clean bucket that is call ${IP_LIMIT - 1}`);
} finally {
  await supabase.auth.signOut().catch(() => {});
  rmSync(outfile, { force: true });

  // ── Cleanup of the limiter rows this run touched ──
  console.log("\ncleanup");
  const userKey = buyerId ? `img:user:${buyerId}` : null;
  if (svc) {
    try {
      const after = await limiterRows();
      const created = [];
      const restored = [];
      for (const row of after.values()) {
        const prior = before.get(row.caller);
        if (!prior || prior.window_start !== row.window_start) created.push(row.caller);
        else if (row.count !== prior.count) restored.push(prior);
      }
      if (created.length) {
        const { error } = await svc.from("embed_query_rate_limit").delete().in("caller", created);
        if (error) throw new Error(`delete: ${error.message}`);
      }
      for (const prior of restored) {
        const { error } = await svc.from("embed_query_rate_limit")
          .update({ count: prior.count }).eq("caller", prior.caller).eq("window_start", prior.window_start);
        if (error) throw new Error(`restore ${prior.caller}: ${error.message}`);
      }
      console.log(`  deleted ${created.length} row(s) this run created: ${created.join(", ") || "none"}`);
      console.log(`  reset ${restored.length} pre-existing row(s) to their pre-run count: ${restored.map((r) => `${r.caller}=${r.count}`).join(", ") || "none"}`);

      // Confirm from a fresh read, not from the calls above.
      const { count: leftover, error: cErr } = created.length
        ? await svc.from("embed_query_rate_limit").select("caller", { count: "exact", head: true }).in("caller", created)
        : { count: 0, error: null };
      check("every limiter row this run created is gone (count query)", !cErr && leftover === 0,
        cErr?.message ?? `remaining ${leftover}`);
      const now = await limiterRows();
      check("every pre-existing limiter row is back to its pre-run count",
        restored.every((p) => !now.has(p.caller) || now.get(p.caller).count <= p.count),
        restored.map((p) => `${p.caller}: ${now.get(p.caller)?.count} vs ${p.count}`).join(", "));
    } catch (e) {
      check("limiter-row cleanup completed", false, e.message);
    }
  } else {
    console.log("  SUPABASE_SERVICE_ROLE_KEY is not set in the environment or this repo's .env, and");
    console.log("  embed_query_rate_limit has RLS on and no policies, so no client role can clear it.");
    console.log("  This machine's photo-search budget stays spent for 10 minutes unless you run, in the");
    console.log("  Supabase SQL editor:\n");
    console.log(`    delete from public.embed_query_rate_limit`);
    console.log(`    where caller = '${userKey}'`);
    console.log(`       or (caller like 'img:ip:%' and window_start >= '${runStartIso}');`);
    console.log(`    select count(*) from public.embed_query_rate_limit`);
    console.log(`    where caller = '${userKey}'`);
    console.log(`       or (caller like 'img:ip:%' and window_start >= '${runStartIso}');   -- expect 0\n`);
  }
}

console.log(failures === 0 ? "\nALL IMAGE-SEARCH CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
