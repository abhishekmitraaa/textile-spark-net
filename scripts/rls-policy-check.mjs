#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// RLS once-per-query check, on the migration FILES (2026-10-13).
//
// claude.md, "A policy checks the caller once per query": in a policy, write
//   (select auth.uid())   (select public.is_admin())   (select public.admin_role())
//   (select public.account_is_active((select auth.uid())))
// never the bare call, which runs once per row scanned; and give each command its own
// policy (a FOR ALL policy beside a SELECT policy makes every read evaluate both).
// Admin completion Phase 12 (20261002072403) took the performance advisor's
// auth_rls_initplan and multiple_permissive_policies from 53 and 50 to 0. This keeps
// them there: it reads every migration written after that pass and fails on a policy
// that breaks the pattern. It needs no database and no secrets, so CI runs it.
//
// What it reads: `create policy` and `alter policy` statements in
// supabase/migrations/*.sql whose version is after BASELINE. A policy created from a
// string (`execute format(...)`) is not seen here; scripts/rls-policy-check.sql checks
// the policies a database actually holds, and is the one to run after an apply.
//
// A justified exception is listed in ALLOW with its reason. Don't add one to make the
// check pass: helpers that take the row (owns_product(product_id)) are already fine.
//
//   node scripts/rls-policy-check.mjs            exit 1 on any finding
//   node scripts/rls-policy-check.mjs --all      also read migrations before BASELINE (report only)
// ─────────────────────────────────────────────────────────────
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const BASELINE = "20261002072403"; // admin completion Phase 12: everything up to here was rewritten or proved
const ALL = process.argv.includes("--all");

/** Once-per-query helpers: a call must sit directly inside `(select …)`. */
const HELPERS = ["auth.uid", "auth.role", "auth.jwt", "is_admin", "admin_role", "account_is_active", "account_not_deleted"];
const NAME = `(?:public\\.)?(?:${HELPERS.map((h) => h.replace(".", "\\.")).join("|")})`;
const WRAPPED = new RegExp(`\\(\\s*select\\s+${NAME}\\s*\\(`, "gi");
const BARE = new RegExp(`(?<![\\w.])${NAME}\\s*\\(`, "gi");

/** `<file>:<policy name>` → why it is allowed. */
const ALLOW = {};

/** Drop `-- …` comments, keeping string literals intact. */
function stripLineComments(sql) {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") inString = !inString;
    if (!inString && c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += c;
  }
  return out;
}

function policiesIn(sql) {
  const found = [];
  const re = /\b(create|alter)\s+policy\s+("?[\w ]+"?)\s+on\s+([\w."]+)([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql))) {
    found.push({ verb: m[1].toLowerCase(), name: m[2].replace(/"/g, ""), table: m[3], body: m[4], line: sql.slice(0, m.index).split("\n").length });
  }
  return found;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const findings = [];
let policies = 0;
let scanned = 0;

for (const file of files) {
  const version = file.slice(0, 14);
  const enforced = version > BASELINE;
  if (!enforced && !ALL) continue;
  scanned++;
  const sql = stripLineComments(readFileSync(join(DIR, file), "utf8"));
  for (const p of policiesIn(sql)) {
    policies++;
    const key = `${file}:${p.name}`;
    const problems = [];
    const bare = p.body.replace(WRAPPED, "(select WRAPPED(").match(BARE);
    if (bare) {
      const names = [...new Set(bare.map((b) => b.replace(/\s*\($/, "()")))];
      problems.push(`calls ${names.join(", ")} bare: write (select ${names[0]}) so it runs once per query`);
    }
    if (p.verb === "create" && /\bfor\s+all\b/i.test(p.body)) {
      problems.push("is FOR ALL: give each command its own policy, or every read evaluates it beside the SELECT policy");
    }
    if (problems.length === 0) continue;
    if (ALLOW[key]) {
      console.log(`  allowed  ${key}: ${ALLOW[key]}`);
      continue;
    }
    for (const what of problems) findings.push({ file, line: p.line, name: p.name, table: p.table, what, enforced });
  }
}

const failing = findings.filter((f) => f.enforced);
for (const f of findings) {
  console.log(`  ${f.enforced ? "FAIL" : "old "}  ${f.file}:${f.line}  policy ${f.name} on ${f.table} ${f.what}`);
}
console.log(`rls-policy-check: ${scanned} migration file(s) after ${ALL ? "the start" : BASELINE}, ${policies} policy statement(s), ${failing.length} finding(s)`);
if (failing.length > 0) {
  console.log("See documentation/claude.md, \"A policy checks the caller once per query\".");
  process.exit(1);
}
