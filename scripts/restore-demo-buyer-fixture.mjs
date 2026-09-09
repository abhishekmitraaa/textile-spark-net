/**
 * Restore demo-buyer@cosora.dev to the baseline that
 * tests/vendor-onboarding-write-path.spec.ts assumes and is supposed to restore
 * itself.
 *
 * That spec turns demo-buyer into a vendor to exercise registration from
 * scratch, then removes what it created in afterAll. When a test in the file
 * fails hard enough that the teardown does not complete, demo-buyer is left
 * looking like a seller with a vendor profile — and the spec's own beforeAll
 * guard ("this account must have no vendor_profiles row") then fails every
 * subsequent run, which reads as a broken write path rather than dirty state.
 *
 * Signs in as demo-buyer and deletes only demo-buyer's own rows, under RLS —
 * no service-role key, no cross-account reach.
 *
 * vendor_contracts is deliberately NOT touched: the table is append-only with
 * no delete policy for anyone, admins included, so a contract signed by a test
 * run cannot be removed by anything. That is a real product gap
 * (saveVendorOnboarding dedups vendor_documents but not contracts), not a
 * teardown oversight — this script reports how many are left.
 *
 *   node scripts/restore-demo-buyer-fixture.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const VENDOR_ID = "11111111-1111-1111-1111-111111111111";
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { error: loginErr } = await db.auth.signInWithPassword({
  email: "demo-buyer@cosora.dev",
  password: "cosora123",
});
if (loginErr) {
  console.error("login failed:", loginErr.message);
  process.exit(1);
}

// Read the storage paths BEFORE deleting the rows that name them. Read from the
// rows rather than listing the prefix, so this can only remove what a run of
// the spec actually wrote.
const { data: docRows } = await db.from("vendor_documents").select("file_url").eq("vendor_id", VENDOR_ID);
const kycPaths = (docRows ?? [])
  .map((d) => d.file_url)
  .filter((u) => !!u && !u.startsWith("http"));

const { data: products } = await db.from("products").select("id").eq("vendor_id", VENDOR_ID);
for (const p of products ?? []) await db.from("product_images").delete().eq("product_id", p.id);
await db.from("products").delete().eq("vendor_id", VENDOR_ID);
await db.from("vendor_documents").delete().eq("vendor_id", VENDOR_ID);
await db.from("vendor_profiles").delete().eq("id", VENDOR_ID);
await db.from("profiles").update({ active_role: "buyer" }).eq("id", VENDOR_ID);

if (kycPaths.length) {
  const { error } = await db.storage.from("business-docs").remove(kycPaths);
  console.log("storage objects removed:", kycPaths, error ? `ERROR ${error.message}` : "ok");
}

const [vp, docs, prods, prof, contracts] = await Promise.all([
  db.from("vendor_profiles").select("id", { count: "exact", head: true }).eq("id", VENDOR_ID),
  db.from("vendor_documents").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR_ID),
  db.from("products").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR_ID),
  db.from("profiles").select("active_role").eq("id", VENDOR_ID).maybeSingle(),
  db.from("vendor_contracts").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR_ID),
]);

console.log({
  vendor_profiles: vp.count,
  vendor_documents: docs.count,
  products: prods.count,
  active_role: prof.data?.active_role,
  vendor_contracts_left_undeletable: contracts.count,
});
