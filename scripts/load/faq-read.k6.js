/**
 * FAQ read path — k6 step test (Phase 23 of the My Profile brief, 2026-09-24;
 * Phase 9 Q2: "robust at 10k concurrent users"). A sibling of marketplace.k6.js.
 *
 * Two modes, both anonymous, read-only, and writing no analytics:
 *   MODE=cdn    GET faq-snapshots/<surface>.json from the Storage CDN, the way
 *               useFaqs() does since Phase 23 (gzip, and `Cache-Control: max-age=0`,
 *               which is what the browser sends for fetch(..., { cache: "no-cache" })).
 *   MODE=table  GET /rest/v1/faqs?..., the query useFaqs() made on every page load
 *               before Phase 23 and still makes as its fallback.
 * Surfaces are weighted by where visitors land: buyer_help 50%, seller_registration
 * 30%, subscription 20%.
 *
 * Load is an ARRIVAL RATE (requests per second), stepped: one constant-arrival-rate
 * scenario per level, STEP seconds each, GAP seconds apart, so the summary gives
 * each level its own latency, throughput, error and dropped-iteration numbers.
 * `dropped_iterations` > 0 means k6 couldn't start requests fast enough: the load
 * generator (this machine or its network), not the server, is the limit.
 *
 * Defaults, and what they cost (Free plan: 5 GB/month cached + 5 GB uncached egress):
 *   cdn:   RATES=250,500,1000,2000 STEP=20 → 75,000 requests × ~1.9 KB ≈ 140 MB cached
 *   table: RATES=25,50,100,150     STEP=20 →  6,500 requests × ~2 KB   ≈  13 MB uncached
 * The table mode hits production PostgREST (a ~10-connection pool), so it aborts as
 * soon as p95 passes 2 s or more than 1% of requests fail. The CDN mode aborts over
 * 5% failures.
 *
 * Run (the anon key is public, but keep it out of the command history):
 *   k6 run -e URL=$VITE_SUPABASE_URL -e ANON=$VITE_SUPABASE_ANON_KEY -e MODE=cdn \
 *          [-e RATES=...] [-e STEP=20] [-e GAP=5] [-e OUT=summary.json] scripts/load/faq-read.k6.js
 */
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const MODE = __ENV.MODE || "cdn";
if (!["cdn", "table"].includes(MODE)) throw new Error(`MODE must be cdn or table, not ${MODE}`);
const URL_BASE = __ENV.URL;
if (!URL_BASE) throw new Error("set -e URL=<project URL>");
if (MODE === "table" && !__ENV.ANON) throw new Error("MODE=table needs -e ANON=<anon key>");
const RATES = (__ENV.RATES || (MODE === "cdn" ? "250,500,1000,2000" : "25,50,100,150")).split(",").map(Number);
const STEP = Number(__ENV.STEP || 20);
const GAP = Number(__ENV.GAP || 5);
const pad = (n) => String(n).padStart(4, "0");
const name = (rate) => `rate_${pad(rate)}`;

const WEIGHTED = [
  ...Array(5).fill("buyer_help"),
  ...Array(3).fill("seller_registration"),
  ...Array(2).fill("subscription"),
];

const cdnStatus = new Counter("cdn_cache_status");

const thresholds = {};
for (const r of RATES) {
  // Always-true thresholds, so the summary breaks each metric out per level.
  thresholds[`http_req_duration{scenario:${name(r)}}`] = ["max>=0"];
  thresholds[`http_reqs{scenario:${name(r)}}`] = ["count>=0"];
  thresholds[`http_req_failed{scenario:${name(r)}}`] = ["rate>=0"];
  thresholds[`dropped_iterations{scenario:${name(r)}}`] = ["count>=0"];
  thresholds[`cdn_cache_status{scenario:${name(r)},status:HIT}`] = ["count>=0"];
}
if (MODE === "table") {
  thresholds.http_req_duration = [{ threshold: "p(95)<2000", abortOnFail: true, delayAbortEval: "5s" }];
  thresholds.http_req_failed = [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "5s" }];
} else {
  thresholds.http_req_failed = [{ threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "5s" }];
}

export const options = {
  scenarios: Object.fromEntries(RATES.map((rate, i) => [name(rate), {
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    duration: `${STEP}s`,
    startTime: `${i * (STEP + GAP)}s`,
    preAllocatedVUs: Math.max(20, Math.ceil(rate * 0.3)),
    maxVUs: Math.max(100, rate * 2),
    gracefulStop: "10s",
  }])),
  thresholds,
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  discardResponseBodies: false,
};

export default function () {
  const surface = WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)];
  let res;
  if (MODE === "cdn") {
    res = http.get(`${URL_BASE}/storage/v1/object/public/faq-snapshots/${surface}.json`, {
      headers: { "Accept-Encoding": "gzip", "Cache-Control": "max-age=0" },
      tags: { endpoint: `snapshot_${surface}` },
    });
    cdnStatus.add(1, { status: res.headers["Cf-Cache-Status"] || "none" });
  } else {
    res = http.get(
      `${URL_BASE}/rest/v1/faqs?select=id,category_label,question,answer,position` +
        `&surface=eq.${surface}&active=eq.true&order=position.asc,created_at.asc,id.asc`,
      {
        headers: { apikey: __ENV.ANON, Authorization: `Bearer ${__ENV.ANON}`, "Accept-Encoding": "gzip" },
        tags: { endpoint: `table_${surface}` },
      },
    );
  }
  check(res, {
    "200": (r) => r.status === 200,
    "has FAQs": (r) => {
      try {
        const body = JSON.parse(r.body);
        return (MODE === "cdn" ? body.rows : body).length > 0;
      } catch {
        return false;
      }
    },
  });
}

/** One row per level: what was asked, what was served, how fast, and the CDN hit ratio. */
export function handleSummary(data) {
  const m = data.metrics;
  const val = (key, stat) => m[key]?.values?.[stat];
  const rows = RATES.map((r) => {
    const s = name(r);
    const reqs = val(`http_reqs{scenario:${s}}`, "count") ?? 0;
    const hits = val(`cdn_cache_status{scenario:${s},status:HIT}`, "count") ?? 0;
    const d = (stat) => Math.round(val(`http_req_duration{scenario:${s}}`, stat) ?? NaN);
    return {
      level: `${r} req/s`,
      requests: reqs,
      achieved_rps: +(reqs / STEP).toFixed(1),
      failed_pct: +((val(`http_req_failed{scenario:${s}}`, "rate") ?? 0) * 100).toFixed(2),
      dropped: val(`dropped_iterations{scenario:${s}}`, "count") ?? 0,
      p50_ms: d("med"), p95_ms: d("p(95)"), p99_ms: d("p(99)"), max_ms: d("max"),
      ...(MODE === "cdn" ? { cdn_hit_pct: reqs ? +((hits / reqs) * 100).toFixed(2) : 0 } : {}),
    };
  });
  const out = {
    mode: MODE, step_s: STEP, levels: rows,
    total_requests: val("http_reqs", "count"),
    data_received_mb: +((val("data_received", "count") ?? 0) / 1e6).toFixed(1),
    checks_passed_pct: +((val("checks", "rate") ?? 0) * 100).toFixed(2),
  };
  const text = [
    `FAQ read path, MODE=${MODE}, ${STEP} s per level`,
    ...rows.map((r) => JSON.stringify(r)),
    `total ${out.total_requests} requests, ${out.data_received_mb} MB received, checks ${out.checks_passed_pct}% passed`,
  ].join("\n");
  return { stdout: text + "\n", ...(__ENV.OUT ? { [__ENV.OUT]: JSON.stringify(out, null, 2) } : {}) };
}
