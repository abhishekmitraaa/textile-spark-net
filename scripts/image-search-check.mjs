#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Photo search — photo → image-search → query → the app's own search path.
//
// WHY THIS SCRIPT EXISTS. The 2026-07-04 changelog entry verified that the
// `image-search` edge function was "deployed + reachable" — which, with no
// OPENAI_API_KEY set, meant it answered `{ error: "not_configured" }`. Nobody
// ever proved that a real photo produces a real query, or that the query then
// runs through catalogue search. For two months the photo buttons toasted
// "isn't set up yet" and nothing noticed. This is that missing check.
//
// It asserts three things against the LIVE project, as a real signed-in buyer:
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
// COST. One gpt-4o-mini vision call at detail:"low" per run, plus at most one
// embedding call if the returned query has never been searched before. Writes
// nothing to the database.
//
//   node scripts/image-search-check.mjs
// ─────────────────────────────────────────────────────────────

import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const PASSWORD = "cosora123";
const FIXTURE = "scripts/fixtures/polo-tshirt-listing.jpg";
// Mirrors UPLOAD_MAX_EDGE in Search.tsx.
const UPLOAD_MAX_EDGE = 1024;

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

// ── Bundle the app's real search path ──
// The output goes under node_modules/.cache so Node resolves the external
// packages (@supabase/supabase-js, @tanstack/react-query) from this repo.
const outDir = path.resolve("node_modules/.cache/image-search-check");
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
    resolveDir: path.resolve("src"),
    loader: "ts",
  },
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  tsconfig: "tsconfig.app.json",
  define: {
    "import.meta.env": JSON.stringify({
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
      MODE: "production", DEV: false, PROD: true,
    }),
  },
  plugins: [exposeFetchSearch],
  logLevel: "silent",
});

const { supabase, fetchSearch, SEARCH_MATCH_COUNT } = await import(pathToFileURL(outfile).href);

try {
  // ── 0. Setup: a real buyer session, a real photo ──
  console.log("\n0. Setup");
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: "demo-buyer@cosora.dev", password: PASSWORD,
  });
  check("signed in as demo-buyer through the app's own Supabase client", !authErr && Boolean(auth?.session),
    authErr?.message ?? "no session");

  const photo = readFileSync(FIXTURE);
  const dims = jpegSize(photo);
  console.log(`          fixture: ${FIXTURE} — ${photo.length.toLocaleString("en-IN")} bytes, ${dims?.width}×${dims?.height}`);
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
    `got ${JSON.stringify(data)}`);

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
} finally {
  await supabase.auth.signOut().catch(() => {});
  rmSync(outfile, { force: true });
}

console.log(failures === 0 ? "\nALL IMAGE-SEARCH CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
