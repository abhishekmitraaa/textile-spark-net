#!/usr/bin/env node
/**
 * Trending searches through PostgREST, on the LOCAL stack only (migration 20261018120000_search_trends).
 *
 * A psql harness can't see what PostgREST adds: its sessions load safeupdate, which refuses an UPDATE or
 * DELETE without a WHERE even inside a definer function (claude.md, 2026-10-08), and the grants are
 * judged per role as the API presents them. So every new RPC is called once here, as a visitor, a buyer,
 * a manager and support.
 *
 *   LOCAL_STACK_ENV=.claude/tmp/local-stack-env.json LOCAL_JWT_SECRET=<GOTRUE_JWT_SECRET of the local stack> \
 *     node scripts/search-trends/rest-check.mjs
 *
 * It refuses any API that isn't 127.0.0.1/localhost. Tokens are signed with the local stack's secret for
 * existing local accounts (no sign-in). It hides and unhides one made-up term, then deletes that row and
 * the runs it caused (docker exec into the local database).
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const env = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV ?? ".claude/tmp/local-stack-env.json", "utf8"));
const API = env.API;
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) throw new Error(`refusing a non-local API: ${API}`);
const SECRET = process.env.LOCAL_JWT_SECRET;
if (!SECRET) throw new Error("set LOCAL_JWT_SECRET to the local stack's JWT secret");

const ACCOUNTS = {
  buyer: "11111111-1111-1111-1111-111111111111",
  manager: "bae52e9d-7390-4e58-a92c-5756553c2c8e",
  support: "b71bf451-a5f9-4ab5-8196-f9ff3bb2122e",
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(sub) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp: now + 600 });
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function rpc(name, args, who) {
  const bearer = who ? token(ACCOUNTS[who]) : env.ANON;
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.ANON, authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

let failed = 0;
const check = (id, cond, msg, detail) => {
  if (cond) console.log(`ok   ${id}  ${msg}`);
  else { failed++; console.log(`FAIL ${id}  ${msg}  ${JSON.stringify(detail).slice(0, 300)}`); }
};
const refused = (r) => r.status === 401 || r.status === 403 || r.body?.code === "42501";

const TERM = `zz harness ${Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)])}`;
const sql = (q) => execFileSync("docker", ["exec", "supabase_db_localstack", "psql", "-U", "postgres", "-tAc", q], { encoding: "utf8" }).trim();
const firstRun = Number(sql("select coalesce(max(id), 0) + 1 from admin.search_trend_runs"));

let r = await rpc("trending_searches", {}, null);
check("R1", r.status === 200 && r.body?.version === 1 && typeof r.body.shown === "boolean", "a visitor reads trending_searches()", r);
r = await rpc("search_trending_on", {}, null);
check("R2", r.status === 200 && typeof r.body === "boolean", "a visitor reads search_trending_on()", r);
r = await rpc("admin_search_trends", {}, null);
check("R3", refused(r), "a visitor can't read the admin list", r);
r = await rpc("admin_search_trends", {}, "buyer");
check("R4", refused(r), "a buyer can't read the admin list", r);
r = await rpc("admin_search_trend_hide", { p_term: TERM, p_reason: "rest check" }, "buyer");
check("R5", refused(r), "a buyer can't hide", r);
r = await rpc("admin_search_trends", {}, "manager");
check("R6", r.status === 200 && Array.isArray(r.body?.terms) && Array.isArray(r.body?.hidden), "a manager reads the admin list", r);
r = await rpc("admin_search_trend_hide", { p_term: TERM, p_reason: "rest check" }, "manager");
check("R7", refused(r), "a manager can't hide", r);
r = await rpc("admin_search_trend_hide", { p_term: `  ${TERM.toUpperCase()} `, p_reason: "rest check: hide" }, "support");
check("R8", r.status === 200 && Number.isInteger(r.body), "support hides a term through the API (insert, recompute)", r);
r = await rpc("admin_search_trends", {}, "support");
check("R9", r.status === 200 && r.body.hidden.some((h) => h.term === TERM && h.hidden), "the hidden term is listed, normalised", r.body?.hidden);
r = await rpc("admin_search_trend_unhide", { p_term: TERM, p_reason: "rest check: unhide" }, "support");
check("R10", r.status === 200 && Number.isInteger(r.body), "support unhides through the API (UPDATE … WHERE passes safeupdate)", r);
r = await rpc("admin_search_trend_unhide", { p_term: TERM, p_reason: "rest check: again" }, "support");
check("R11", r.status >= 400 && r.body?.code === "P0002", "unhiding twice is refused with its own code", r);
r = await rpc("admin_search_trend_hide", { p_term: TERM, p_reason: "x" }, "support");
check("R12", r.status >= 400 && r.body?.code === "22023", "a hide without a reason is refused", r);

sql(`delete from admin.search_trend_hidden where term_norm = '${TERM}'`);
sql(`delete from admin.search_trend_runs where id >= ${firstRun}`);
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
