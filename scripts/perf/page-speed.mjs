#!/usr/bin/env node
/**
 * Page-speed sweep (speed plan 0.1, documentation/speed-build-plan-2026-11-27.md §1).
 *
 *   npm run perf                       production, public + buyer pages (scripts/perf/urls-public.json)
 *   npm run perf:local                 a local `vite preview` on :8191 (start it first), the same list
 *   node scripts/perf/page-speed.mjs --base http://localhost:8191 --urls scripts/perf/urls-seller.json \
 *        --auth <file> --out seller.json
 *
 * Options: --base <origin>  --urls <json list of paths>  --out <file>  --runs <n, default 3>
 *          --auth <json {key, value}>: a Supabase session written to localStorage before each load (seller pages;
 *          use a local-stack test vendor on a plan with the CRM, never a production account).
 *          --only <substring>: measure only the paths that contain it.
 *
 * Mobile = Lighthouse's mobile defaults (390×844 @3, 4× CPU, 150 ms RTT, 1.6 Mbps down / 750 kbps up): cold, `runs`
 * times, each in a new browser profile, then one warm reload in the last profile. Desktop = no throttling, cold, `runs`
 * times. Every figure reported is the median of the runs (single runs move 10–15 %). One throw-away load of the base
 * comes first, so the first page doesn't pay the new-connection cost alone.
 *
 * It writes nothing: analytics calls (log_*, increment_*, ad impressions…) and every non-GET request that isn't an RPC
 * are answered locally, and Clarity / Google Analytics are blocked.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.base || "https://www.cosora.in").replace(/\/$/, "");
const PATHS = JSON.parse(readFileSync(args.urls || "scripts/perf/urls-public.json", "utf8")).filter(
  (p) => !args.only || p.includes(args.only),
);
const OUT = args.out || `perf-${new Date().toISOString().slice(0, 10)}.json`;
const RUNS = Math.max(1, Number(args.runs || 3));
const AUTH = args.auth ? JSON.parse(readFileSync(args.auth, "utf8")) : null;

const PROFILES = {
  mobile: { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true, cpu: 4, net: { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 } },
  desktop: { viewport: { width: 1366, height: 900 }, dpr: 1, mobile: false, cpu: 1, net: null },
};
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

const OBSERVERS = `(() => {
  const m = window.__perf = { fcp: null, lcp: null, cls: 0, longTasks: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) m.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
})();`;

const ANALYTICS_RPC = /\/rest\/v1\/rpc\/(log_[a-z_]*|increment_[a-z_]*|ad_impressions?|ad_click|record_[a-z_]*|track_[a-z_]*)/;
const SUPABASE = /supabase\.co|127\.0\.0\.1:54321|localhost:54321/;

async function stub(page) {
  await page.route(/clarity\.ms|googletagmanager|google-analytics/, (r) => r.abort());
  await page.route(/\/rest\/v1\//, (route) => {
    const req = route.request();
    const u = req.url();
    if (!SUPABASE.test(u)) return route.continue();
    if (ANALYTICS_RPC.test(u)) return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    if (req.method() !== "GET" && req.method() !== "HEAD" && !u.includes("/rpc/"))
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    return route.continue();
  });
}

async function openContext(browser, prof) {
  const p = PROFILES[prof];
  const ctx = await browser.newContext({
    viewport: p.viewport, deviceScaleFactor: p.dpr, isMobile: p.mobile, hasTouch: p.mobile, userAgent: p.mobile ? MOBILE_UA : undefined,
  });
  if (AUTH) await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch {} }, [AUTH.key, AUTH.value]);
  await ctx.addInitScript(() => { try { localStorage.setItem("cosora_analytics_consent", "denied"); } catch {} });
  await ctx.addInitScript(OBSERVERS);
  const page = await ctx.newPage();
  await stub(page);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (p.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: p.net.latency, downloadThroughput: p.net.down, uploadThroughput: p.net.up });
  if (p.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  const state = { reqs: new Map(), last: Date.now(), t0: null };
  cdp.on("Network.requestWillBeSent", (e) => {
    if (state.t0 === null) state.t0 = e.timestamp;
    state.reqs.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, start: e.timestamp, end: null, bytes: 0, status: null, cached: false });
    state.last = Date.now();
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = state.reqs.get(e.requestId);
    if (r) { r.status = e.response.status; r.cached = r.cached || !!(e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache); }
    state.last = Date.now();
  });
  // A file Chrome serves from its memory cache raises this, not fromDiskCache (2026-11-27: the sweep reported 0 cached
  // on repeat visits while 68 of 74 requests came from memory).
  cdp.on("Network.requestServedFromCache", (e) => { const r = state.reqs.get(e.requestId); if (r) r.cached = true; });
  cdp.on("Network.loadingFinished", (e) => { const r = state.reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength; } state.last = Date.now(); });
  cdp.on("Network.loadingFailed", (e) => { const r = state.reqs.get(e.requestId); if (r) r.end = e.timestamp; state.last = Date.now(); });
  return { ctx, page, state };
}

async function load({ page, state }, url) {
  state.reqs = new Map(); state.t0 = null; state.last = Date.now();
  const started = Date.now();
  let navErr = null;
  try { await page.goto(url, { waitUntil: "load", timeout: 60000 }); } catch (e) { navErr = String(e.message).slice(0, 120); }
  // Settled: 2.5 s with no network activity, at most 40 s after the start.
  while (Date.now() - state.last < 2500 && Date.now() - started < 40000) await page.waitForTimeout(250);
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({
    perf: window.__perf, finalPath: location.pathname, domNodes: document.getElementsByTagName("*").length,
    oversized: [...document.images].filter((i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 0
      && i.naturalWidth > i.getBoundingClientRect().width * window.devicePixelRatio * 1.5).length,
    images: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
  }));
  const list = [...state.reqs.values()];
  const rel = (t) => (t === null || state.t0 === null ? 0 : Math.round((t - state.t0) * 1000));
  const sb = list.filter((r) => SUPABASE.test(r.url) && !/\/storage\/v1\//.test(r.url) && r.method !== "OPTIONS");
  const fcp = m.perf.fcp || 0;
  return {
    navErr, finalPath: m.finalPath,
    fcp: Math.round(m.perf.fcp || 0), lcp: Math.round(m.perf.lcp || m.perf.fcp || 0), cls: +m.perf.cls.toFixed(3),
    tbt: Math.round(m.perf.longTasks.filter(([s]) => s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0)),
    dataDone: sb.reduce((a, r) => Math.max(a, rel(r.end)), 0), networkDone: list.reduce((a, r) => Math.max(a, rel(r.end)), 0),
    requests: list.length, kb: Math.round(list.reduce((a, r) => a + r.bytes, 0) / 1024),
    scriptKb: Math.round(list.filter((r) => r.type === "Script").reduce((a, r) => a + r.bytes, 0) / 1024),
    imgKb: Math.round(list.filter((r) => r.type === "Image").reduce((a, r) => a + r.bytes, 0) / 1024),
    supabaseCalls: sb.length, cached: list.filter((r) => r.cached).length, revalidated: list.filter((r) => r.status === 304).length,
    images: m.images, oversizedImages: m.oversized, domNodes: m.domNodes,
  };
}

const median = (xs) => { const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
function summarise(runs) {
  const out = {};
  for (const k of Object.keys(runs[0])) out[k] = typeof runs[0][k] === "number" ? median(runs.map((r) => r[k])) : runs[runs.length - 1][k];
  return out;
}

const s = (ms) => (ms == null ? "–" : (ms / 1000).toFixed(1) + " s");

(async () => {
  const browser = await chromium.launch({ headless: true });
  { const w = await openContext(browser, "desktop"); await load(w, BASE + "/"); await w.ctx.close(); } // warm-up, discarded
  const results = [];
  for (const path of PATHS) {
    const url = BASE + path;
    const row = { path };
    for (const prof of ["mobile", "desktop"]) {
      const runs = [];
      let warm = null;
      for (let i = 0; i < RUNS; i++) {
        const w = await openContext(browser, prof);
        try {
          runs.push(await load(w, url));
          if (prof === "mobile" && i === RUNS - 1) warm = await load(w, url);
        } catch (e) { console.error("ERR", prof, path, String(e.message).slice(0, 160)); }
        await w.ctx.close();
      }
      row[prof] = runs.length ? { ...summarise(runs), runs: runs.map((r) => r.lcp) } : null;
      if (warm) row[prof].warm = { lcp: warm.lcp, kb: warm.kb, cached: warm.cached, revalidated: warm.revalidated };
    }
    results.push(row);
    const m = row.mobile || {}, d = row.desktop || {};
    console.log(`${path.padEnd(48)} mobile lcp ${s(m.lcp)} [${(m.runs || []).map((x) => (x / 1000).toFixed(1)).join(" ")}] fcp ${s(m.fcp)} tbt ${m.tbt} ms sb ${m.supabaseCalls} kb ${m.kb} | warm ${s(m.warm && m.warm.lcp)} cached ${m.warm ? m.warm.cached : "–"} | desktop ${s(d.lcp)}`);
    writeFileSync(OUT, JSON.stringify({ base: BASE, runs: RUNS, at: new Date().toISOString(), results }, null, 1));
  }
  await browser.close();
  console.log("\n| Page | Mobile LCP | FCP | TBT | Data done | Supabase calls | Script KB | Image KB | Warm LCP | Warm from cache | Desktop LCP |");
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of results) {
    const m = r.mobile || {}, d = r.desktop || {};
    console.log(`| \`${r.path}\` | ${s(m.lcp)} | ${s(m.fcp)} | ${m.tbt ?? "–"} ms | ${s(m.dataDone)} | ${m.supabaseCalls ?? "–"} | ${m.scriptKb ?? "–"} | ${m.imgKb ?? "–"} | ${s(m.warm && m.warm.lcp)} | ${m.warm ? m.warm.cached : "–"} | ${s(d.lcp)} |`);
  }
  const lcps = results.map((r) => r.mobile && r.mobile.lcp).filter(Boolean);
  console.log(`\n${results.length} pages, ${RUNS} runs each; median mobile LCP ${s(median(lcps))}. Saved to ${OUT}.`);
})();
