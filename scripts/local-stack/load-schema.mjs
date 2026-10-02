// Local stack, step 3: load the exported schema and reference data into the LOCAL database.
// Refuses any database that isn't on this machine. See README.md.
//
//   node scripts/local-stack/load-schema.mjs          schema, then data, then Vault secrets
//   node scripts/local-stack/load-schema.mjs --data   data only
//
// Statements run in the export's order; any that fail (an object that needs one created
// later) are retried until a pass makes no progress, and whatever still fails is printed.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.env.LOCAL_STACK_DIR ?? ".claude/tmp/localstack");
const TOOLS = resolve(process.env.LOCAL_STACK_TOOLS ?? ".claude/tmp/sb", "package.json");
const pg = createRequire(TOOLS)("pg");
const DB = process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):/.test(DB)) throw new Error("Refusing: not a local database.");
const SERVICE_KEY = process.env.LOCAL_SERVICE_ROLE_KEY;

// Functions that call out by URL are pointed at the local gateway, or nowhere.
const rewrite = (s) => s
  .replaceAll("https://vxdhhgdfubqedfpwfyrb.supabase.co", "http://supabase_kong_localstack:8000")
  .replaceAll("https://www.cosora.in/blogs/api/revalidate", "http://127.0.0.1:9/local-no-revalidate")
  // pgmq makes its own schema; naming it before it exists fails.
  .replace(/^create extension if not exists pgmq with schema pgmq;$/, "create extension if not exists pgmq;");

const rowsOf = (f) => JSON.parse(readFileSync(resolve(DIR, f), "utf8"))[0].rows;
const client = new pg.Client({ connectionString: DB });
await client.connect();
await client.query("set check_function_bodies = off; set client_min_messages = warning;");

if (!process.argv.includes("--data")) {
  const fnFiles = existsSync(resolve(DIR, "q2.json")) ? ["q2.json"] : ["q2a.json", "q2b.json"];
  const stmts = [...rowsOf("q1.json"), ...fnFiles.flatMap(rowsOf), ...rowsOf("q3.json")]
    .sort((a, b) => a.o - b.o).map((r) => ({ ...r, s: rewrite(r.s) }));
  let pending = stmts, pass = 0;
  const errors = new Map();
  while (pending.length) {
    pass++;
    const failed = [];
    for (const st of pending) {
      try { await client.query(st.s); errors.delete(st.o + st.k); }
      catch (e) { failed.push(st); errors.set(st.o + st.k, `${st.o} ${st.k}: ${e.message}`); }
    }
    console.log(`pass ${pass}: ${pending.length - failed.length} ok, ${failed.length} failed`);
    if (failed.length === pending.length) break;
    pending = failed;
  }
  for (const msg of errors.values()) console.log("  FAIL", msg.slice(0, 300));
}

// Reference data, with triggers and FK checks off (replica mode) and user links cleared.
const data = JSON.parse(readFileSync(resolve(DIR, "data-ref.json"), "utf8"))[0].data;
const scrub = {
  "public.support_settings": (r) => ({ ...r, test_profile_ids: [], updated_by: null }),
  "public.faqs": (r) => ({ ...r, created_by: null }),
  "public.site_theme": (r) => ({ ...r, updated_by: null }),
  "public.help_guides": (r) => ({ ...r, updated_by: null }),
};
await client.query("set session_replication_role = replica;");
for (const [table, rows] of Object.entries(data)) {
  if (!rows?.length) continue;
  const [schema, name] = table.split(".");
  const { rows: cols } = await client.query(
    `select attname from pg_attribute where attrelid = format('%I.%I', $1::text, $2::text)::regclass
       and attnum > 0 and not attisdropped and attgenerated = '' order by attnum`, [schema, name]);
  const list = cols.map((c) => `"${c.attname}"`).join(", ");
  try {
    const res = await client.query(
      `insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1) on conflict do nothing`,
      [JSON.stringify(rows.map(scrub[table] ?? ((r) => r)))]);
    console.log(`data ${table}: ${res.rowCount}/${rows.length}`);
  } catch (e) { console.log(`data ${table}: FAIL ${e.message}`); }
}
await client.query("set session_replication_role = origin;");

if (SERVICE_KEY) {
  for (const [name, value] of [["service_role_key", SERVICE_KEY], ["blog_revalidate_secret", "local-only"]]) {
    await client.query("select vault.create_secret($1, $2) where not exists (select 1 from vault.secrets where name = $2)", [value, name]);
  }
  console.log("vault: service_role_key, blog_revalidate_secret");
} else console.log("vault: skipped (set LOCAL_SERVICE_ROLE_KEY to the local service_role key)");
await client.end();
