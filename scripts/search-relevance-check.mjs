// Master Prompt 5, Phase 1: the hand-check the original spec asked for and could
// never run, because products.embedding was 100% NULL until 2026-09-09.
//
// Drives the REAL /search/results flow in a browser so the whole chain is
// exercised: useProductSearch -> search_products (cache miss, keyword-only)
// -> embed-query edge function (one real OpenAI call) -> search_products again
// (cache hit, semantic). Raw SQL cannot do this — embed-query is an edge
// function and SQL can't invoke it, which is exactly why the cache had 0 rows.
//
// Each phrase is loaded TWICE:
//   pass 1 (cold) expects 2 search_products calls: embedding_used false -> true
//   pass 2 (warm) expects 1 search_products call:  embedding_used true, no OpenAI
//
// Usage: node scripts/search-relevance-check.mjs [baseUrl]
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "http://localhost:8090";
const PHRASES = [
  "cotton t-shirt", "linen shirt", "kurta", "denim jacket", "gym clothing",
  "wedding outfit", "summer beachwear", "office wear", "kids clothing", "hand embroidered",
];

const browser = await chromium.launch();
const rows = [];

for (const phrase of PHRASES) {
  const result = { phrase, cold: null, warm: null, top: [], errors: [] };

  for (const pass of ["cold", "warm"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
    const flags = [];
    page.on("pageerror", (e) => result.errors.push(String(e).slice(0, 120)));
    page.on("response", async (res) => {
      if (!res.url().includes("/rpc/search_products")) return;
      try {
        const body = await res.json();
        flags.push(Array.isArray(body) && body.length ? Boolean(body[0].embedding_used) : null);
      } catch { /* non-JSON / aborted */ }
    });

    await page.goto(`${BASE}/search/results?q=${encodeURIComponent(phrase)}`, { waitUntil: "networkidle" });
    // Warm-then-retry needs a beat: embed-query round-trips to OpenAI on a miss.
    await page.waitForTimeout(pass === "cold" ? 6000 : 3000);

    result[pass] = { calls: flags.length, embeddingUsed: flags };

    if (pass === "warm") {
      // Scrape the rendered cards rather than trusting the RPC payload.
      result.top = await page.$$eval('a[href^="/product/"]', (as) =>
        [...new Set(as.map((a) => {
          const card = a.closest("div");
          const t = card?.innerText?.split("\n").find((l) => l.includes("|")) || "";
          return t.split("|")[0].trim();
        }).filter(Boolean))].slice(0, 5));
      const body = await page.locator("body").innerText();
      result.count = (body.match(/(\d+)\s+results?/) || [])[1] ?? "0";
      result.keywordOnly = /keyword match only/i.test(body);
    }
    await page.close();
  }
  rows.push(result);
  const last = (a) => (a && a.length ? a[a.length - 1] : null);
  console.log(
    `\n"${result.phrase}"  ->  ${result.count} results` +
    `${result.keywordOnly ? "  [KEYWORD ONLY]" : "  [semantic]"}` +
    `\n   cold: ${result.cold.calls} call(s) ${JSON.stringify(result.cold.embeddingUsed)}` +
    `   warm: ${result.warm.calls} call(s) ${JSON.stringify(result.warm.embeddingUsed)}` +
    `   cacheHitOnWarm=${last(result.warm.embeddingUsed) === true}` +
    `\n   top5: ${result.top.join(" | ") || "(none)"}` +
    (result.errors.length ? `\n   ERRORS: ${result.errors.join(" ; ")}` : "")
  );
}

await browser.close();

console.log("\n================ SUMMARY ================");
const warmHits = rows.filter((r) => r.warm.embeddingUsed.at(-1) === true).length;
const semantic = rows.filter((r) => !r.keywordOnly).length;
const empty = rows.filter((r) => r.count === "0").length;
console.log(`phrases probed            : ${rows.length}`);
console.log(`semantic (not keyword-only): ${semantic}/${rows.length}`);
console.log(`cache hit on 2nd load     : ${warmHits}/${rows.length}`);
console.log(`zero-result phrases       : ${empty}`);
console.log(`pages with JS errors      : ${rows.filter((r) => r.errors.length).length}`);
