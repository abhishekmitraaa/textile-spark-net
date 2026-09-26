#!/usr/bin/env node
// ─────────────────────────────────────────────────
// "What may a manager do to the admin team?" (Mitra, 2026-09-26)
//
// Migration 20260925210601 lets a manager add, change and remove teammates in the
// five team roles (product_moderator, vendor_ops, ads_moderator, finance_admin,
// support), through admin_set_role / admin_grant / admin_revoke /
// admin_search_candidates and the admin-invite edge function (v8). A manager
// never grants Super admin or Manager, and never changes a super admin, another
// manager or themselves. Over real HTTP, with real sign-ins, this checks:
//   manager    the allowed changes work, every other one is refused (42501 from
//              the RPCs, 403 from admin-invite, before anything is created);
//   support    is refused all of it;
//   super admin still invites (admin-invite now grants with the caller's token);
//   the Admin Log has the manager's changes, and an invite's grant, as the
//   manager's.
//
// ACCOUNTS: demo-admin, and the run-only fixtures rlstest-manager,
// rlstest-manager2, rlstest-support and rlstest-teamadd (FIXTURE_PASSWORD;
// created for the run, then dropped with scripts/drop-test-admins.sql's
// admin-user deletes).
// MUTATING, SELF-RESTORING: the fixtures' roles are changed and put back, and
// rlstest-teamadd ends with no admin access. No email is sent: every invite goes
// to an account that has a password, or is refused before anything is created.
// The Admin Log rows it produces are permanent by design.
//   FIXTURE_PASSWORD=... node scripts/manager-team-roles-check.mjs
// ─────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { credential, demoPasswordFor } from "./lib/test-credentials.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const ADMIN = "demo-admin@cosora.dev";
const MANAGER = "rlstest-manager@cosora.test";
const MANAGER2 = "rlstest-manager2@cosora.test";
const SUPPORT = "rlstest-support@cosora.test";
const TEAMADD = "rlstest-teamadd@cosora.test";
const NOBODY = "rlstest-noexist@cosora.test"; // must never be created

async function signIn(email) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const password = email === ADMIN ? demoPasswordFor(email) : credential("FIXTURE_PASSWORD");
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${email}: ${error.message}`);
  return { db, uid: data.user.id, token: data.session.access_token };
}

const admin = await signIn(ADMIN);
const mgr = await signIn(MANAGER);
const sup = await signIn(SUPPORT);
const mgr2Id = (await signIn(MANAGER2)).uid;
const teamaddId = (await signIn(TEAMADD)).uid;

let failures = 0;
const rows = [];
function record(caller, attempt, result, ok, want) {
  if (!ok) failures++;
  rows.push({ caller, attempt, result, verdict: ok ? "PASS" : `*** FAIL (want ${want}) ***` });
}
async function rpc(who, label, fn, args, want) {
  const { data, error } = await who.db.rpc(fn, args);
  const got = error ? error.code : `ok (${Array.isArray(data) ? data.length : 1})`;
  const ok = want === "refused" ? error?.code === "42501" : !error;
  record(who === mgr ? "manager" : who === sup ? "support" : "super admin", label, got, ok, want);
  return data;
}
async function invite(who, label, email, role, want) {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/admin-invite`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, authorization: `Bearer ${who.token}`, "content-type": "application/json" },
    body: JSON.stringify({ email, admin_role: role }),
  });
  const body = await r.json().catch(() => ({}));
  const got = `${r.status} ${body.outcome ?? body.error ?? ""}`.trim();
  const ok = want === "refused" ? r.status === 403 : r.status === 200 && body.outcome === want && body.emailSent === false;
  record(who === mgr ? "manager" : who === sup ? "support" : "super admin", `invite: ${label}`, got, ok, want);
}
const roleOf = async (id) => ((await admin.db.rpc("admin_list_admins")).data ?? []).find((a) => a.id === id)?.admin_role ?? "not an admin";

const since = (await mgr.db.rpc("admin_audit_log_list", { p_limit: 1 })).data?.[0]?.id ?? 0;

// ── The RPCs, as the manager ──
await rpc(mgr, "list admins", "admin_list_admins", {}, "ok");
await rpc(mgr, "teammate support -> vendor_ops", "admin_set_role", { p_user_id: sup.uid, p_role: "vendor_ops" }, "ok");
await rpc(mgr, "teammate -> manager", "admin_set_role", { p_user_id: sup.uid, p_role: "manager" }, "refused");
await rpc(mgr, "teammate -> super_admin", "admin_set_role", { p_user_id: sup.uid, p_role: "super_admin" }, "refused");
await rpc(mgr, "super admin -> support", "admin_set_role", { p_user_id: admin.uid, p_role: "support" }, "refused");
await rpc(mgr, "another manager -> support", "admin_set_role", { p_user_id: mgr2Id, p_role: "support" }, "refused");
await rpc(mgr, "own role -> support", "admin_set_role", { p_user_id: mgr.uid, p_role: "support" }, "refused");
await rpc(mgr, "remove the super admin", "admin_revoke", { p_user_id: admin.uid }, "refused");
await rpc(mgr, "remove another manager", "admin_revoke", { p_user_id: mgr2Id }, "refused");
await rpc(mgr, "remove self", "admin_revoke", { p_user_id: mgr.uid }, "refused");
const found = await rpc(mgr, "search accounts to add", "admin_search_candidates", { p_query: "rlstest-teamadd" }, "ok");
record("manager", "search finds the account", `${(found ?? []).length} row(s)`, (found ?? []).some((c) => c.id === teamaddId), "1 row");
await rpc(mgr, "add an account as finance_admin", "admin_grant", { p_user_id: teamaddId, p_role: "finance_admin" }, "ok");
await rpc(mgr, "make that teammate a manager", "admin_grant", { p_user_id: teamaddId, p_role: "manager" }, "refused");
await rpc(mgr, "make that teammate a super admin", "admin_grant", { p_user_id: teamaddId, p_role: "super_admin" }, "refused");
await rpc(mgr, "remove that teammate", "admin_revoke", { p_user_id: teamaddId }, "ok");
await rpc(mgr, "teammate back to support", "admin_set_role", { p_user_id: sup.uid, p_role: "support" }, "ok");

// ── The RPCs, as support ──
await rpc(sup, "change a role", "admin_set_role", { p_user_id: sup.uid, p_role: "vendor_ops" }, "refused");
await rpc(sup, "add an account", "admin_grant", { p_user_id: teamaddId, p_role: "support" }, "refused");
await rpc(sup, "search accounts", "admin_search_candidates", { p_query: "rlstest" }, "refused");

// ── admin-invite ──
await invite(mgr, "a new account as super_admin", NOBODY, "super_admin", "refused");
await invite(mgr, "a new account as manager", NOBODY, "manager", "refused");
await invite(mgr, "the super admin as support", ADMIN, "support", "refused");
await invite(mgr, "another manager as support", MANAGER2, "support", "refused");
await invite(mgr, "self as support", MANAGER, "support", "refused");
await invite(mgr, "an existing account as ads_moderator", TEAMADD, "ads_moderator", "promoted");
record("-", "that account is now", await roleOf(teamaddId), (await roleOf(teamaddId)) === "ads_moderator", "ads_moderator");
await rpc(mgr, "remove it again", "admin_revoke", { p_user_id: teamaddId }, "ok");
await invite(sup, "an existing account as support", TEAMADD, "support", "refused");
await invite(admin, "an existing account as product_moderator", TEAMADD, "product_moderator", "promoted");
record("-", "that account is now", await roleOf(teamaddId), (await roleOf(teamaddId)) === "product_moderator", "product_moderator");
await rpc(admin, "remove it again", "admin_revoke", { p_user_id: teamaddId }, "ok");

// ── The Admin Log ──
const { data: log } = await mgr.db.rpc("admin_audit_log_list", { p_limit: 100 });
const mine = (log ?? []).filter((r) => r.id > since && r.actor_id === mgr.uid).reverse();
const summary = mine.map((r) => `${r.action} ${r.target_table}${r.target_table === "admin.admin_users" && r.changes?.admin_role ? ` ${r.changes.admin_role.from ?? "-"}->${r.changes.admin_role.to ?? "-"}` : ""}`);
const wantLog = 7; // set_role, grant, revoke, set_role, the invite's grant + its invite record, revoke
record("-", "manager's Admin Log rows", `${mine.length}: ${summary.join("; ")}`,
  mine.length === wantLog && mine.every((r) => r.actor_role === "manager"), `${wantLog}, all as manager`);
const inviteGrant = mine.find((r) => r.target_id === teamaddId && r.action !== "invite" && r.changes?.admin_role?.to === "ads_moderator");
record("-", "the invite's grant is logged as the manager's", inviteGrant ? `${inviteGrant.action} ${inviteGrant.source ?? ""}` : "none", Boolean(inviteGrant), "a row");

// ── Ends as it started ──
const endSup = await roleOf(sup.uid);
const endAdd = await roleOf(teamaddId);
const endAdmin = await roleOf(admin.uid);
const restored = endSup === "support" && endAdd === "not an admin" && endAdmin === "super_admin";
record("-", "fixtures and demo-admin as they started", `support: ${endSup}; teamadd: ${endAdd}; demo-admin: ${endAdmin}`, restored, "support / not an admin / super_admin");

console.table(rows);
console.log(failures === 0 ? "\nMANAGER TEAM ROLES AS EXPECTED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
