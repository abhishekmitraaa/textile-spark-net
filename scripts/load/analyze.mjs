/**
 * Summarise a k6 CSV run of scripts/load/marketplace.k6.js by VU level and
 * endpoint (Master Prompt 12, Part F): requests, failures (by HTTP status,
 * where 0 means a client-side timeout or connection error), p50/p95/p99/max
 * latency, and wire bytes received. The per-level rows are what answers "at
 * what concurrency do errors or timeouts start".
 *
 * Run:  node scripts/load/analyze.mjs <results.csv> [--step=60] [--endpoints]
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/load/analyze.mjs <results.csv> [--step=60] [--endpoints]");
const STEP = Number(process.argv.find((a) => a.startsWith("--step="))?.split("=")[1] ?? 60);
const SHOW_ENDPOINTS = process.argv.includes("--endpoints");

const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
const lvl = new Map();   // scenario -> { d:[], fail, status:{}, bytes }
const ep = new Map();    // scenario|name -> { d:[], fail, status:{} }
const custom = {};       // metric -> scenario -> sum
const checks = {};       // check name -> { pass, fail }
let cols = null;

// k6 writes RFC 4180 CSV: a field with a comma or quote (an error message, say)
// is quoted, so a plain split(",") would shift every later column.
function parseCsv(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  if (!cols) { cols = Object.fromEntries(parseCsv(line).map((c, i) => [c, i])); continue; }
  const f = parseCsv(line);
  const metric = f[cols.metric_name];
  const value = Number(f[cols.metric_value]);
  const scenario = f[cols.scenario];
  if (!scenario) continue;
  if (!lvl.has(scenario)) lvl.set(scenario, { d: [], fail: 0, status: {}, bytes: 0 });
  const L = lvl.get(scenario);
  if (metric === "http_req_duration") {
    const name = f[cols.name], status = f[cols.status], failed = f[cols.expected_response] === "false";
    const k = `${scenario}|${name}`;
    if (!ep.has(k)) ep.set(k, { d: [], fail: 0, status: {} });
    const E = ep.get(k);
    for (const X of [L, E]) {
      X.d.push(value);
      if (failed) { X.fail++; X.status[status] = (X.status[status] || 0) + 1; }
    }
  } else if (metric === "data_received") {
    L.bytes += value;
  } else if (metric === "checks") {
    const c = (checks[f[cols.check]] ??= { pass: 0, fail: 0 });
    value ? c.pass++ : c.fail++;
  } else if (metric === "cap_refusals" || metric === "unexpected_refusals") {
    (custom[metric] ??= {})[scenario] = ((custom[metric] ??= {})[scenario] || 0) + value;
  }
}

const row = (label, X, secs) => {
  const d = X.d.sort((a, b) => a - b);
  const st = Object.entries(X.status).map(([s, n]) => `${s === "0" ? "timeout/conn" : s}:${n}`).join(" ");
  return `${label.padEnd(26)} ${String(d.length).padStart(6)} ${secs ? (d.length / secs).toFixed(1).padStart(6) : "      "} ` +
    `${String(X.fail).padStart(5)} ${(d.length ? (100 * X.fail / d.length).toFixed(2) : "0.00").padStart(6)}% ` +
    `${Math.round(q(d, 0.5)).toString().padStart(6)} ${Math.round(q(d, 0.95)).toString().padStart(6)} ` +
    `${Math.round(q(d, 0.99)).toString().padStart(6)} ${Math.round(d[d.length - 1] || 0).toString().padStart(6)}  ${st}`;
};
const head = `${"".padEnd(26)} ${"reqs".padStart(6)} ${"req/s".padStart(6)} ${"fail".padStart(5)} ${"fail%".padStart(7)} ${"p50ms".padStart(6)} ${"p95ms".padStart(6)} ${"p99ms".padStart(6)} ${"maxms".padStart(6)}  failures by status`;

console.log("BY VU LEVEL");
console.log(head);
const levels = [...lvl.keys()].sort();
for (const s of levels) console.log(row(s, lvl.get(s), STEP));
let totalBytes = 0;
for (const s of levels) totalBytes += lvl.get(s).bytes;
console.log(`\nwire bytes received (all levels): ${(totalBytes / 1e6).toFixed(1)} MB`);
for (const [m, per] of Object.entries(custom)) console.log(`${m}: ${levels.map((s) => `${s}=${per[s] || 0}`).join("  ")}`);
for (const [c, r] of Object.entries(checks)) console.log(`check "${c}": ${r.pass} passed, ${r.fail} failed`);

if (SHOW_ENDPOINTS) {
  for (const s of levels) {
    console.log(`\n${s} BY ENDPOINT`);
    console.log(head);
    [...ep.keys()].filter((k) => k.startsWith(`${s}|`)).sort()
      .forEach((k) => console.log(row(k.split("|")[1], ep.get(k), STEP)));
  }
}
