// Shared helpers for the full test of 2026-10-10: journey.mjs (buying and using each paid plan), attacks.mjs,
// ad-attacks.mjs and server-value-attacks.mjs (what an account could try), own-row-columns*.mjs (which columns of its
// own rows a browser can change). LOCAL STACK ONLY: every request goes to 127.0.0.1 and payments go to the mock
// Razorpay on :8787 through the side edge runtime on :8097. Run: LOCAL_STACK_ENV=<local-stack-env.json> node <file>.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

export const env = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV, "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API)) throw new Error("not local");
export const SIDE = process.env.SIDE_URL ?? "http://localhost:8097";
export const KEY_SECRET = "local_mock_secret";
export const HOOK_SECRET = "local_mock_hook";
export const TAG = Date.now().toString(36);

export const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_localstack", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
  { input: q, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

export const STARTED = sql("select now()");

export const tally = { pass: 0, fail: 0, holds: 0, gap: 0, note: 0 };
export const findings = [];
const short = (x) => (typeof x === "string" ? x : JSON.stringify(x) ?? "").slice(0, 260);
export function check(name, ok, extra = "") {
  ok ? tally.pass++ : tally.fail++;
  if (!ok) findings.push({ kind: "FAIL", name, extra: short(extra) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra ? `  ← ${short(extra)}` : ""}`);
}
// An attack: `blocked` true means the system held.
export function attack(name, blocked, evidence = "") {
  blocked ? tally.holds++ : tally.gap++;
  if (!blocked) findings.push({ kind: "GAP", name, extra: short(evidence) });
  console.log(`${blocked ? "HOLDS" : "GAP  "} ${name}${evidence ? `  [${short(evidence)}]` : ""}`);
}
export function note(name, evidence = "") {
  tally.note++;
  findings.push({ kind: "NOTE", name, extra: short(evidence) });
  console.log(`NOTE  ${name}${evidence ? `  [${short(evidence)}]` : ""}`);
}
export const section = (t) => console.log(`\n=== ${t}`);

export const svc = { apikey: env.SERVICE, authorization: `Bearer ${env.SERVICE}`, "content-type": "application/json" };
export const anon = { apikey: env.ANON, authorization: `Bearer ${env.ANON}`, "content-type": "application/json" };
export const asUser = (t) => ({ apikey: env.ANON, authorization: `Bearer ${t}`, "content-type": "application/json" });

export async function token(email) {
  const r = await fetch(`${env.API}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: env.ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: env.PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}
export const emailOf = (k) => env.accounts.find((a) => a.key === k).email;
export const idOf = (k) => env.accounts.find((a) => a.key === k).id;

export async function fn(name, headers, body, base = SIDE) {
  const r = await fetch(`${base}/${name}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { j = text.slice(0, 200); }
  return { status: r.status, body: j };
}
export async function rpc(name, headers, args = {}) {
  const r = await fetch(`${env.API}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch { j = text.slice(0, 200); }
  return { status: r.status, ok: r.ok, body: j };
}
export async function rest(method, path, headers, body, prefer = "return=representation") {
  const r = await fetch(`${env.API}/rest/v1/${path}`, { method, headers: { ...headers, prefer }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = text.slice(0, 200); }
  return { status: r.status, ok: r.ok, body: j, rows: Array.isArray(j) ? j.length : 0 };
}

export const SWITCHES = sql("select string_agg(key, ',' order by key) from public.feature_flags").split(",");
export function list(ids, keys = SWITCHES) {
  sql(`update public.feature_flags set allow_profile_ids = array(select distinct unnest(coalesce(allow_profile_ids, '{}') || '{${ids.join(",")}}'::uuid[]))
        where key in (${keys.map((k) => `'${k}'`).join(",")});`);
}
export const made = [];
export async function mkUser(label, role = "seller") {
  const email = `ft-${label}-${TAG}@cosora.test`;
  const cu = await fetch(`${env.API}/auth/v1/admin/users`, {
    method: "POST", headers: svc,
    body: JSON.stringify({ email, password: env.PASSWORD, email_confirm: true, user_metadata: { active_role: role, full_name: `FT ${label}` } }),
  });
  const id = (await cu.json()).id;
  if (!id) throw new Error(`could not create ${email}`);
  made.push(id);
  sql(`update public.profiles set onboarded = true where id = '${id}';`);
  return { id, email, label };
}
// A registered seller in Gujarat. onSwitches: which feature switches list them (default all).
export async function seller(label, { onSwitches = SWITCHES } = {}) {
  const u = await mkUser(label, "seller");
  sql(`insert into public.vendor_profiles (id, brand_name, owner_name, city, state, state_code, country, business_type, onboarding_complete, owner_email, address_line, postal_code)
       values ('${u.id}', 'FT ${label} ${TAG}', 'Owner ${label}', 'Surat', 'Gujarat', 'GJ', 'India', 'Manufacturer', true, 'owner-${label}-${TAG}@example.com', '12 Ring Road', '395002');`);
  if (onSwitches.length) list([u.id], onSwitches);
  u.token = await token(u.email);
  u.h = asUser(u.token);
  return u;
}
export async function buyer(label, { country = null, countryCode = null, state = "Maharashtra", stateCode = "MH", onSwitches = [] } = {}) {
  const u = await mkUser(label, "buyer");
  sql(`insert into public.buyer_profiles (id, city, state, state_code, country, country_code)
       values ('${u.id}', 'Mumbai', ${countryCode && countryCode !== "IN" ? "null, null" : `'${state}', '${stateCode}'`}, ${country ? `'${country}'` : "null"}, ${countryCode ? `'${countryCode}'` : "null"})
       on conflict (id) do update set country = excluded.country, country_code = excluded.country_code;`);
  if (onSwitches.length) list([u.id], onSwitches);
  u.token = await token(u.email);
  u.h = asUser(u.token);
  return u;
}
export async function staff(label, role) {
  const u = await mkUser(label, "buyer");
  sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${u.id}', '${role}', true);`);
  u.token = await token(u.email);
  u.h = asUser(u.token);
  return u;
}

export const sign = (orderId, paymentId) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
let payN = 0;
// The real one-off path: create-order (a mock Razorpay order) → verify-payment with Razorpay's signature → fulfil.
export async function buy(v, planId, billingCycle = "monthly", extra = {}) {
  const order = await fn("subscription-create-order", v.h, { planId, billingCycle, ...extra });
  if (!order.body?.orderId) return { order, verify: null };
  const paymentId = `pay_ft_${TAG}_${++payN}`;
  const triple = { orderId: order.body.orderId, paymentId, signature: sign(order.body.orderId, paymentId) };
  const verify = order.body.free
    ? await fn("subscription-verify-payment", v.h, { orderId: order.body.orderId, free: true })
    : await fn("subscription-verify-payment", v.h, triple);
  return { order, verify, triple };
}
export const planRow = (vid) => sql(`select coalesce((select plan_id || '|' || status || '|' || coalesce(scheduled_plan_id, '-') from public.vendor_subscriptions where vendor_id = '${vid}'), 'none')`);
export function cleanup() {
  if (!made.length) return;
  // The alerts this run's requirements sent to the stack's own sellers: scripts/subscriptions/p6_lead_alerts.sql
  // counts those tables whole, and fails on what a run leaves behind.
  sql(`delete from public.notifications n where n.kind = 'lead_match' and n.created_at >= '${STARTED}'
         and n.profile_id in (select a.vendor_id from admin.lead_alerts a join public.rfqs r on r.id = a.rfq_id where r.buyer_id = any ('{${made.join(",")}}'::uuid[]));
       delete from admin.notification_outbox o where o.profile_id = any ('{${made.join(",")}}'::uuid[])
          or exists (select 1 from public.rfqs r where r.buyer_id = any ('{${made.join(",")}}'::uuid[]) and o.dedupe_key like '%' || r.id::text || '%');
       delete from admin.lead_alerts a where a.rfq_id in (select r.id from public.rfqs r where r.buyer_id = any ('{${made.join(",")}}'::uuid[]));`);
  sql(`update public.feature_flags set allow_profile_ids = array(select x from unnest(coalesce(allow_profile_ids, '{}')) x where x <> all ('{${made.join(",")}}'::uuid[]));
       update public.rfqs set status = 'closed' where buyer_id = any ('{${made.join(",")}}'::uuid[]) and status::text = 'active';
       update public.products set status = 'draft' where vendor_id = any ('{${made.join(",")}}'::uuid[]) and status::text in ('live', 'under_review', 'paused');
       update public.vendor_subscriptions set status = 'expired', current_period_end = now() - interval '30 days' where vendor_id = any ('{${made.join(",")}}'::uuid[]) and status = 'active';
       update public.vendor_profiles set plan_id = null, plan_expires_at = null where id = any ('{${made.join(",")}}'::uuid[]);`);
}
export function summary(title) {
  console.log(`\n${title}: ${tally.pass} passed, ${tally.fail} failed; attacks: ${tally.holds} held, ${tally.gap} gaps; ${tally.note} notes`);
  for (const f of findings) console.log(`  ${f.kind}: ${f.name}${f.extra ? `  [${f.extra}]` : ""}`);
}
