/**
 * Sign in a batch of load-test accounts and write their access tokens for k6
 * (Master Prompt 12, Part F).
 *
 * Why this is not done inside k6: every sign-in from this machine comes from
 * ONE IP, and GoTrue rate-limits password grants per IP. Fifty VUs signing in
 * at t=0 would measure that limit, not the marketplace. So the accounts sign in
 * here first, one after another, and any 429 is waited out and reported. That
 * is a finding about auth from a single address, not about real users, who
 * arrive from many addresses.
 *
 * For each buyer it also resolves one existing ACTIVE conversation with a
 * load-test vendor, so the chat traffic stays inside the synthetic population
 * (all 220 such conversations are loadtest<->loadtest; 0 involve a real user).
 *
 * OUTPUT CONTAINS LIVE ACCESS TOKENS (1 h). It is written outside the repo by
 * default (the OS temp dir); never commit it.
 *
 * Run:  node scripts/load/mint-tokens.mjs [--buyers=40] [--vendors=20] [--out=<file>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credential } from "../lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = credential("LOADTEST_PASSWORD");
const OUT = arg("out", join(tmpdir(), "cosora-k6-tokens.json"));
const nBuyers = Number(arg("buyers", "40")), nVendors = Number(arg("vendors", "20"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { signIns: 0, rateLimited: 0, failed: 0, ms: [] };

async function signIn(email) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const t0 = performance.now();
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    stats.ms.push(performance.now() - t0);
    if (r.status === 200) { stats.signIns++; const j = await r.json(); return { id: j.user.id, token: j.access_token, exp: j.expires_at }; }
    if (r.status === 429) { stats.rateLimited++; console.log(`  429 on ${email}, waiting 60 s (attempt ${attempt})`); await sleep(60_000); continue; }
    stats.failed++; console.log(`  ${email}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); return null;
  }
  return null;
}
const rest = (path, token) => fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }).then((r) => r.json());

// Buyers who already have an active conversation with a load-test vendor, so a
// chat send never reaches a real user. Candidates are scanned in order.
const buyers = [];
for (let n = 1; n <= 250 && buyers.length < nBuyers; n++) {
  const email = `loadtest-buyer-${n}@cosora.test`;
  const s = await signIn(email);
  if (!s) continue;
  const convs = await rest(`conversations?select=id,user_a,user_b,status&status=eq.active&or=(user_a.eq.${s.id},user_b.eq.${s.id})&limit=1`, s.token);
  if (!Array.isArray(convs) || !convs.length) continue;           // no synthetic thread: skip this buyer
  buyers.push({ email, id: s.id, token: s.token, exp: s.exp, conv: convs[0].id });
}

// Vendors: half on a paid plan (their lead pool also runs the vector ranking
// RPC), half free (their quotes meet the 10-lead cap, which is a correct
// refusal and is counted as such, not as an error).
const vendorNums = [10, 100, 105, 110, 115, 120, 15, 20, 25, 30, 56, 57, 63, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19];
const vendors = [];
for (const n of vendorNums) {
  if (vendors.length >= nVendors) break;
  const email = `loadtest-vendor-${n}@cosora.test`;
  const s = await signIn(email);
  if (!s) continue;
  const plan = await fetch(`${URL_}/rest/v1/rpc/get_vendor_plan`, {
    method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ v: s.id }),
  }).then((r) => r.json());
  const convs = await rest(`conversations?select=id&status=eq.active&or=(user_a.eq.${s.id},user_b.eq.${s.id})&limit=1`, s.token);
  vendors.push({ email, id: s.id, token: s.token, exp: s.exp, plan: plan.effective_plan_id,
    paid: plan.effective_plan_id !== "free", conv: Array.isArray(convs) && convs[0] ? convs[0].id : null });
}

writeFileSync(OUT, JSON.stringify({ url: URL_, anon: ANON, minted_at: new Date().toISOString(), buyers, vendors }));
const ms = stats.ms.sort((a, b) => a - b);
console.log(`buyers ${buyers.length} (with a synthetic conversation), vendors ${vendors.length} (${vendors.filter((v) => v.paid).length} paid)`);
console.log(`sign-ins ${stats.signIns}, HTTP 429 ${stats.rateLimited}, failed ${stats.failed}; ` +
  `latency p50 ${Math.round(ms[Math.floor(ms.length / 2)])} ms, p95 ${Math.round(ms[Math.floor(ms.length * 0.95)])} ms`);
console.log(`tokens written to ${OUT} (expire ~1 h; not in the repo)`);
