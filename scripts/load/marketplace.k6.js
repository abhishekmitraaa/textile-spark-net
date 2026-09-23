/**
 * Cosora marketplace load — k6 step test (Master Prompt 12, Part F).
 *
 * Signed-in buyers and vendors from the synthetic population drive the SAME
 * PostgREST calls the app makes (selects copied from src/lib/queries/*), with
 * think time, at stepped concurrency: by default 10 -> 20 -> 30 -> 40 -> 50
 * VUs, 60 s each, 15 s apart, 70% buyers / 30% vendors. Every request is
 * tagged with an endpoint name and the scenario carries the VU level, so
 * scripts/load/analyze.mjs can say exactly at which level errors or slow
 * responses start.
 *
 * Ceiling: max_connections = 60 on the current free-tier plan (findings §1).
 * VUs are HTTP clients, not DB connections — PostgREST multiplexes them onto
 * its own fixed pool — but this stays at <= 50 VUs until that capacity
 * question is settled. Sample pg_stat_activity while it runs.
 *
 * What it deliberately does NOT do, so real users and real money are untouched:
 *   * product views/counters only on [LOADTEST] listings (never a real
 *     vendor's views_count); no engagement_events logging at all;
 *   * quotes only on [LOADTEST] RFQs; chat only in the buyer's existing
 *     load-test conversation (all 220 are loadtest<->loadtest);
 *   * searches only for terms that already have a cached embedding, so the
 *     app would not call embed-query / OpenAI for them;
 *   * new RFQs at ~3% of buyer iterations (each enqueues one embedding job);
 *   * chat text is letters only: no digits (phone pattern), no "@" (email
 *     pattern), no whatsapp/telegram/signal, nothing on the blocklist — a
 *     flagged message locks the thread.
 *
 * Cap refusals (P0001 "Monthly lead limit reached") are a correct answer for a
 * free vendor and are counted as `cap_refusals`, not as failures. Each one is
 * also checked against the vendor's own dashboard number — the findings §2
 * regression (the refusal must cite the leads_used the dashboard shows).
 *
 * Run (tokens from scripts/load/mint-tokens.mjs; they are secrets, keep them
 * out of the repo):
 *   k6 run -e TOKENS=<tokens.json> [-e LEVELS=10,20,30,40,50] [-e STEP=60] [-e THINK=1]
 *          --out csv=<results.csv> scripts/load/marketplace.k6.js
 * THINK=0 removes the pauses: same VU ceiling, maximum request rate.
 *   node scripts/load/analyze.mjs <results.csv>
 */
import http from "k6/http";
import { sleep, check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";

const T = JSON.parse(open(__ENV.TOKENS));
const BASE = `${T.url}/rest/v1`;
const LEVELS = (__ENV.LEVELS || "10,20,30,40,50").split(",").map(Number);
const STEP = Number(__ENV.STEP || 60);
const GAP = Number(__ENV.GAP || 15);
const pad = (n) => String(n).padStart(2, "0");

export const options = {
  scenarios: Object.fromEntries(LEVELS.map((vus, i) => [`vus_${pad(vus)}`, {
    executor: "constant-vus", vus, duration: `${STEP}s`, startTime: `${i * (STEP + GAP)}s`,
    gracefulStop: "20s", exec: "user",
  }])),
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  // No `url` tag: the endpoint name identifies the request, and full URLs
  // (in.(…) id lists) would bloat the CSV for nothing.
  systemTags: ["status", "method", "name", "scenario", "expected_response", "error", "error_code", "check"],
  // Always-passing thresholds: they only make k6 print the per-level submetrics.
  thresholds: Object.fromEntries(LEVELS.flatMap((v) => [
    [`http_req_duration{scenario:vus_${pad(v)}}`, ["p(95)<600000"]],
    [`http_req_failed{scenario:vus_${pad(v)}}`, ["rate<=1"]],
  ])),
  userAgent: "cosora-loadtest-k6/master-prompt-12",
};

const capRefusals = new Counter("cap_refusals");
const unexpectedRefusals = new Counter("unexpected_refusals");

// ── selects, copied from the app ────────────────────────────────────────────
const LIVE_SELECT = "id,vendor_id,name,price_value,currency,compare_at_price,moq,fabric,gsm,fit_type,gender,rating_avg,enquiries_count,sold_count,location,categories(name),product_images(url,position)"; // products.ts fetchLiveProducts
const VP_SELECT = "id,brand_name,is_verified,city,plan_expires_at,ad_verified_until,plan_id";
const DETAIL_SELECT = "id,vendor_id,name,description,price_value,currency,moq,unit,fabric,gsm,fit_type,gender,colour,sizes,pattern,occasion,neck_type,sleeve_type,collar_type,country_of_origin,waist_sizes,lengths,customization_available,location,category_id,rating_avg,reviews_count,sold_count,enquiries_count,categories(name),product_images(url,position)"; // fetchProductById
const DETAIL_VENDOR = "brand_name,is_verified,city,rating_avg,reviews_count,plan_expires_at,ad_verified_until";
const CATALOGUE_SELECT = "id,vendor_id,name,price_value,currency,moq,fabric,gsm,fit_type,gender,colour,location,rating_avg,sold_count,enquiries_count,sizes,pattern,occasion,neck_type,sleeve_type,collar_type,country_of_origin,waist_sizes,lengths,category_id,categories(name,parent_id),product_images(url,position)"; // search hydration
const RFQ_COLUMNS = "id,title,product_name,quantity,budget_min,budget_max,image,category_id,buyer_id,status,created_at,vendor_id,product_id,sizes_breakdown,colors,customization_requested,customization_notes,customization_images";
const MSG_SELECT = "id,sender_id,body,kind,created_at,rfq_id,quote_id";

// Terms with a cached query embedding (search_query_embeddings), so no OpenAI call.
const QUERIES = ["linen shirt", "kurta", "denim jacket", "gym clothing", "wedding outfit", "summer beachwear",
  "office wear", "kids clothing", "hand embroidered", "kids wear", "girls dress", "cotton t-shirt"];
const SAFE_LINES = ["Loadtest message please share the fabric swatch options",
  "Loadtest message what is the lead time for this order",
  "Loadtest message can you confirm the colour range",
  "Loadtest message thanks we will review the quote"];

const enc = encodeURIComponent;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// THINK scales the pause between pages: 1 = a person clicking (1-3 s), 0 = each
// VU as fast as responses allow (a throughput probe at the same VU ceiling).
const THINK = Number(__ENV.THINK ?? 1);
const think = () => { if (THINK > 0) sleep((1 + Math.random() * 2) * THINK); };
const body = (r) => { try { return r.json(); } catch (_) { return null; } };

function hdr(token, extra) {
  return Object.assign({
    apikey: T.anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate",
  }, extra || {});
}
function get(name, path, token) {
  return http.get(`${BASE}/${path}`, { headers: hdr(token), tags: { name }, timeout: "30s" });
}
function post(name, path, payload, token, opts) {
  const params = { headers: hdr(token, opts && opts.prefer ? { Prefer: opts.prefer } : null), tags: { name }, timeout: "30s" };
  if (opts && opts.expected) params.responseCallback = http.expectedStatuses(...opts.expected);
  return http.post(`${BASE}/${path}`, JSON.stringify(payload), params);
}

// One synthetic account per VU, never shared: 7 of every 10 VUs are buyers.
function account() {
  const id = exec.vu.idInTest - 1, r = id % 10, block = Math.floor(id / 10);
  return r < 7
    ? { role: "buyer", a: T.buyers[(block * 7 + r) % T.buyers.length] }
    : { role: "vendor", a: T.vendors[(block * 3 + (r - 7)) % T.vendors.length] };
}

let plansLoaded = false; // the app caches subscription_plans for the session

function buyer(b) {
  // New Arrivals: the whole live catalogue, then its vendors (fetchLiveProducts).
  const list = body(get("products_live", `products?select=${enc(LIVE_SELECT)}&status=eq.live&order=created_at.desc`, b.token)) || [];
  if (!plansLoaded) { get("subscription_plans", "subscription_plans?select=id,limits", b.token); plansLoaded = true; }
  const vids = [...new Set(list.map((p) => p.vendor_id))];
  if (vids.length) get("vendor_profiles_in", `vendor_profiles?select=${VP_SELECT}&id=in.(${vids.join(",")})`, b.token);
  think();

  const synthetic = list.filter((p) => typeof p.name === "string" && p.name.startsWith("[LOADTEST]"));
  if (synthetic.length && Math.random() < 0.6) {
    const p = pick(synthetic);
    get("product_detail", `products?select=${enc(DETAIL_SELECT)}&id=eq.${p.id}`, b.token);
    get("product_vendor", `vendor_profiles?select=${DETAIL_VENDOR}&id=eq.${p.vendor_id}`, b.token);
    post("increment_product_view", "rpc/increment_product_view", { p: p.id }, b.token);
    think();
  }

  if (Math.random() < 0.5) {
    const ranked = body(post("search_products", "rpc/search_products", { query: pick(QUERIES), match_count: 200 }, b.token)) || [];
    const ids = ranked.map((x) => x.id);
    if (ids.length) get("catalogue_by_ids", `products?select=${enc(CATALOGUE_SELECT)}&id=in.(${ids.join(",")})`, b.token);
    think();
  }

  if (Math.random() < 0.3) {
    const rfqs = body(get("buyer_rfqs", `rfqs?select=${RFQ_COLUMNS}&buyer_id=eq.${b.id}&order=created_at.desc`, b.token)) || [];
    if (rfqs.length) get("buyer_quotes", `quotes?select=*&rfq_id=in.(${rfqs.map((r) => r.id).join(",")})`, b.token);
    think();
  }

  if (Math.random() < 0.03) {
    post("rfq_create", "rfqs", {
      buyer_id: b.id, title: "[LOADTEST] k6 load run", product_name: "Cotton shirts", quantity: 100,
      description: "[LOADTEST] k6 load run (Master Prompt 12 Part F)", status: "active",
    }, b.token);
  }

  if (Math.random() < 0.2) {
    get("conversations_list", `conversations?select=id,user_a,user_b,last_message,last_message_at&or=(user_a.eq.${b.id},user_b.eq.${b.id})&order=last_message_at.desc`, b.token);
  }
  if (Math.random() < 0.1) {
    get("chat_history", `messages?select=${MSG_SELECT}&conversation_id=eq.${b.conv}&order=created_at.asc`, b.token);
    post("chat_send", "messages", { conversation_id: b.conv, sender_id: b.id, body: pick(SAFE_LINES), kind: "text" }, b.token);
  }
  think();
}

function vendor(v) {
  // Vendor dashboard: plan + usage, the open lead pool, what I already quoted.
  const plan = body(post("vendor_plan", "rpc/get_vendor_plan", { v: v.id }, v.token));
  const pool = body(get("rfq_pool", `rfqs?select=${RFQ_COLUMNS}&status=eq.active&vendor_id=is.null&order=created_at.desc`, v.token)) || [];
  const mine = body(get("my_quote_ids", `quotes?select=rfq_id&vendor_id=eq.${v.id}`, v.token)) || [];
  get("vendor_plan_expiry", `vendor_profiles?select=plan_expires_at&id=eq.${v.id}`, v.token);
  if (v.paid) post("match_vendor_rfqs", "rpc/match_vendor_rfqs", { p_vendor_id: v.id, match_count: 200 }, v.token);
  get("direct_requests", `rfqs?select=${RFQ_COLUMNS}&vendor_id=eq.${v.id}&status=eq.active&order=created_at.desc`, v.token);
  think();

  if (Math.random() < 0.25) {
    const done = new Set(mine.map((q) => q.rfq_id));
    const open = pool.filter((r) => typeof r.title === "string" && r.title.startsWith("[LOADTEST]") && !done.has(r.id));
    if (open.length) {
      const res = post("quote_submit", "quotes", {
        rfq_id: pick(open).id, vendor_id: v.id, price_per_unit: 199, price_inr: 199, moq: 100,
        lead_time: "14 days", comment: "[LOADTEST] k6 load run", status: "pending",
      }, v.token, { expected: [201, 400] });
      if (res.status === 400) {
        const e = body(res) || {};
        if (e.code === "P0001" && /lead limit/i.test(e.message || "")) {
          capRefusals.add(1);
          const cited = Number(((e.message || "").match(/already quoted (\d+)/) || [])[1]);
          check(e, { "cap refusal cites the dashboard's leads_used": () => plan && cited === plan.usage.leads_used });
        } else {
          unexpectedRefusals.add(1);
        }
      }
      think();
    }
  }

  if (Math.random() < 0.3) get("vendor_quotes", `quotes?select=*&vendor_id=eq.${v.id}&order=created_at.desc`, v.token);
  if (v.conv && Math.random() < 0.05) {
    get("chat_history", `messages?select=${MSG_SELECT}&conversation_id=eq.${v.conv}&order=created_at.asc`, v.token);
    post("chat_send", "messages", { conversation_id: v.conv, sender_id: v.id, body: pick(SAFE_LINES), kind: "text" }, v.token);
  }
  think();
}

export function user() {
  const { role, a } = account();
  if (role === "buyer") buyer(a); else vendor(a);
}
