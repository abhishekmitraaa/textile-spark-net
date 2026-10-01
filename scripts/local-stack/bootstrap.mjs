// Local stack, step 4: create the test accounts and roles on the LOCAL stack, and write the
// file tests/local/stack.ts reads (.claude/tmp/local-stack-env.json). See README.md.
//
//   LOAD_USERS=60 node scripts/local-stack/bootstrap.mjs
//
// Local only: the keys come from `supabase status` in the local project folder, and the
// script refuses an API that isn't on this machine. The password below exists only here.
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const DIR = resolve(process.env.LOCAL_STACK_DIR ?? ".claude/tmp/localstack");
const TOOLS = resolve(process.env.LOCAL_STACK_TOOLS ?? ".claude/tmp/sb");
const pg = createRequire(resolve(TOOLS, "package.json"))("pg");
const bundledCli = resolve(TOOLS, "node_modules/@supabase/cli-windows-x64/bin/supabase.exe");
const CLI = process.env.LOCAL_SUPABASE_CLI ?? (existsSync(bundledCli) ? bundledCli : "supabase");

const statusEnv = Object.fromEntries(
  execFileSync(CLI, ["status", "-o", "env"], { cwd: DIR, encoding: "utf8" })
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const API = statusEnv.API_URL;
const ANON = statusEnv.ANON_KEY;
const SERVICE = statusEnv.SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API ?? "")) throw new Error("Refusing: not a local stack.");

const PASSWORD = "Local-only-pass-1";
// The SQL check scripts name demo-buyer, demo-vendor and demo-admin by their fixed ids; the
// role simulation also needs six non-admin accounts, three of them buyers.
const accounts = [
  { key: "buyer", id: "11111111-1111-1111-1111-111111111111", email: "local-buyer@cosora.test", name: "Local Buyer", role: "buyer", phone: "+919000000001" },
  { key: "vendor", id: "22222222-2222-2222-2222-222222222222", email: "local-vendor@cosora.test", name: "Local Vendor", role: "seller", phone: "+919000000003" },
  { key: "admin", id: "33333333-3333-3333-3333-333333333333", email: "local-admin@cosora.test", name: "Local Super Admin", role: "buyer", admin: "super_admin" },
  { key: "buyer2", email: "local-buyer2@cosora.test", name: "Second Buyer", role: "buyer", phone: "+919000000002" },
  { key: "extra1", email: "local-extra1@cosora.test", name: "Extra One", role: "buyer" },
  { key: "extra2", email: "local-extra2@cosora.test", name: "Extra Two", role: "buyer" },
  { key: "extra3", email: "local-extra3@cosora.test", name: "Extra Three", role: "buyer" },
  { key: "support", email: "local-support@cosora.test", name: "Local Support", role: "buyer", admin: "support" },
  { key: "manager", email: "local-manager@cosora.test", name: "Local Manager", role: "buyer", admin: "manager" },
  { key: "moderator", email: "local-moderator@cosora.test", name: "Local Moderator", role: "buyer", admin: "product_moderator" },
];
// Load users for scripts/load/support.k6.js.
const LOAD_USERS = Number(process.env.LOAD_USERS || 0);
for (let i = 1; i <= LOAD_USERS; i++) {
  const n = String(i).padStart(3, "0");
  accounts.push({ key: `load${n}`, email: `local-load-${n}@cosora.test`, name: `Load ${n}`, role: "buyer", load: true });
}

const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const ids = {};
let existing = null;
for (const a of accounts) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...admin, "Content-Type": "application/json" },
    body: JSON.stringify({ ...(a.id ? { id: a.id } : {}), email: a.email, password: PASSWORD, email_confirm: true,
      user_metadata: { active_role: a.role, full_name: a.name, phone: a.phone } }),
  });
  const body = await res.json();
  if (res.ok) { ids[a.key] = body.id; continue; }
  if (!/already/i.test(JSON.stringify(body))) throw new Error(`${a.email}: ${JSON.stringify(body)}`);
  existing ??= (await (await fetch(`${API}/auth/v1/admin/users?per_page=1000`, { headers: admin })).json()).users;
  ids[a.key] = existing.find((u) => u.email === a.email).id;
}

const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
await db.query("update public.profiles set onboarded = true where id = any($1::uuid[])", [Object.values(ids)]);
for (const a of accounts.filter((x) => x.admin)) {
  await db.query(
    `insert into admin.admin_users (id, admin_role, is_active, created_at) values ($1, $2::public.admin_role_type, true, now())
     on conflict (id) do update set admin_role = excluded.admin_role, is_active = true`, [ids[a.key], a.admin]);
}
await db.query(
  `insert into public.vendor_profiles (id, brand_name, city, country, business_type, onboarding_complete)
   values ($1, 'Local Textiles', 'Surat', 'India', 'Manufacturer', true) on conflict (id) do nothing`, [ids.vendor]);
// Staff testing: the buyer, the vendor and the load users are on the test list; buyer2 is
// an ordinary account. (The role simulation sets rollout itself, from 'off'.)
const loadIds = accounts.filter((a) => a.load).map((a) => ids[a.key]);
await db.query("update public.support_settings set rollout = 'staff', test_profile_ids = $1::uuid[]", [[ids.buyer, ids.vendor, ...loadIds]]);
await db.end();

const out = resolve(".claude/tmp/local-stack-env.json");
writeFileSync(out, JSON.stringify({ API, ANON, SERVICE, PASSWORD, ids, accounts: accounts.filter((a) => !a.load) }, null, 1));
console.log(`${accounts.length} accounts -> ${out}`);
