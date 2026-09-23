/**
 * Concurrent inserts against a plan cap with ONE slot left — real HTTP
 * (Master Prompt 12, Part E).
 *
 * enforce_product_cap() and enforce_lead_cap() both COUNT and then decide. Two
 * requests that count before either commits both see the free slot. The
 * 2026-09-16 probe could not show this: it ran its "concurrent" inserts one
 * after another inside a single SQL session. This fires N inserts as separate
 * HTTP requests, which PostgREST runs as N separate transactions on separate
 * connections. More than one acceptance in a round is the race.
 *
 * Each round:
 *   1. bring the vendor to cap - 1 (sequential [LOADTEST] fillers if below it;
 *      abort if already at or over the cap);
 *   2. open N connections with a cheap GET so TLS set-up does not spread the
 *      inserts apart, then fire N inserts at once;
 *   3. report accepted / refused, then delete what was accepted (as the vendor)
 *      so the next round starts at cap - 1 again.
 * A deleted product's queued embedding job is archived by generate-embedding
 * ("row is gone"), so the cleanup cannot wedge the queue.
 *
 *   --kind=product  a free vendor with 1 of 2 product slots used (loadtest-vendor-36)
 *   --kind=quote    a free vendor below 10 leads; quotes [LOADTEST] open RFQs only
 *
 * Run:  node scripts/cap-race-check.mjs --kind=product --vendor=loadtest-vendor-36 [--n=10] [--rounds=5]
 *       node scripts/cap-race-check.mjs --kind=quote   --vendor=loadtest-vendor-61 [--n=10] [--rounds=5]
 * Exit code 1 if any round accepted more than one insert.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { credential } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const KIND = arg("kind");
if (!["product", "quote"].includes(KIND)) throw new Error("--kind=product|quote");
const N = Number(arg("n", "10"));
const ROUNDS = Number(arg("rounds", "5"));
const TAG = "[LOADTEST] cap race probe (Master Prompt 12 Part E)";

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const email = `${arg("vendor")}@cosora.test`;
const { data: auth, error: authErr } = await db.auth.signInWithPassword({ email, password: credential("LOADTEST_PASSWORD") });
if (authErr) throw new Error(`sign-in failed for ${email}: ${authErr.message}`);
const me = auth.user.id;

async function usage() {
  const { data: plan, error } = await db.rpc("get_vendor_plan", { v: me });
  if (error) throw new Error(`get_vendor_plan: ${error.message}`);
  if (KIND === "quote") return { used: plan.usage.leads_used, cap: plan.limits.leads_per_month };
  const { count, error: cErr } = await db.from("products").select("id", { count: "exact", head: true })
    .eq("vendor_id", me).in("status", ["under_review", "live"]);
  if (cErr) throw new Error(`product count: ${cErr.message}`);
  return { used: count, cap: plan.limits.product_cap };
}
async function openRfqs(n) {
  const { data: mine } = await db.from("quotes").select("rfq_id").eq("vendor_id", me);
  const done = new Set((mine ?? []).map((q) => q.rfq_id));
  const { data, error } = await db.from("rfqs").select("id").is("vendor_id", null).eq("status", "active")
    .like("title", "[LOADTEST]%").order("created_at", { ascending: true }).limit(400);
  if (error) throw new Error(`rfq read: ${error.message}`);
  const ids = data.map((r) => r.id).filter((id) => !done.has(id)).slice(0, n);
  if (ids.length < n) throw new Error(`only ${ids.length} unquoted [LOADTEST] open RFQs, need ${n}`);
  return ids;
}
const insertOne = (i, round, rfqId) => KIND === "product"
  ? db.from("products").insert({ vendor_id: me, name: `${TAG} r${round}-${i}`, status: "under_review" }).select("id")
  : db.from("quotes").insert({ rfq_id: rfqId, vendor_id: me, price_per_unit: 1, comment: `${TAG} r${round}-${i}` }).select("id");
const remove = (ids) => db.from(KIND === "product" ? "products" : "quotes").delete().in("id", ids);

console.log(`${KIND} race: ${email} (${me}), ${N} concurrent inserts x ${ROUNDS} rounds`);
let raced = 0;
for (let round = 1; round <= ROUNDS; round++) {
  let { used, cap } = await usage();
  if (cap < 0) throw new Error("unlimited plan — nothing to race");
  if (used >= cap) throw new Error(`already at ${used}/${cap}; free a slot first`);
  while (used < cap - 1) {                       // fillers, kept (tagged, and counted)
    const [rfq] = KIND === "quote" ? await openRfqs(1) : [null];
    const { error } = await insertOne(`fill${used}`, round, rfq);
    if (error) throw new Error(`filler refused: ${error.message}`);
    ({ used, cap } = await usage());
  }
  const rfqIds = KIND === "quote" ? await openRfqs(N) : [];
  // Warm N keep-alive connections so the inserts leave together.
  await Promise.all(Array.from({ length: N }, () => db.from("subscription_plans").select("id").limit(1)));
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => insertOne(i, round, rfqIds[i])));
  const ms = Math.round(performance.now() - t0);
  const ok = results.filter((r) => !r.error).map((r) => r.data[0].id);
  const refusals = [...new Set(results.filter((r) => r.error).map((r) => `${r.error.code} ${r.error.message.slice(0, 60)}`))];
  const after = await usage();
  if (ok.length > 1) raced++;
  console.log(`round ${round}: start ${used}/${cap} -> accepted ${ok.length} of ${N} in ${ms} ms -> ${after.used}/${cap}` +
    `${ok.length > 1 ? "   <-- RACE: over the cap" : ""}${refusals.length ? `   refused: ${refusals.join(" | ")}` : ""}`);
  if (ok.length) {
    const { error } = await remove(ok);
    if (error) throw new Error(`cleanup failed: ${error.message}`);
  }
}
const end = await usage();
console.log(`\nrounds over the cap: ${raced} of ${ROUNDS}; vendor left at ${end.used}/${end.cap}`);
process.exitCode = raced ? 1 : 0;
await db.auth.signOut();
