/**
 * Master Prompt 5, Phase 1.3 — can a vendor still destroy their own signed
 * contract?
 *
 * Two changes are under test, and BOTH matter:
 *   1. vendor_contracts.vendor_id is ON DELETE RESTRICT (was CASCADE), so
 *      deleting a vendor with a contract fails loudly instead of silently
 *      taking the contract with it.
 *   2. vprofiles_delete is admin-only, so a client cannot reach that delete at
 *      all — nothing in the product ever deleted a vendor_profiles row.
 *
 * Every assertion reads the ROW BACK. A DELETE that RLS denies matches zero
 * rows and RETURNS SUCCESS — this repo has been bitten by that trap before, so
 * "no error" proves nothing here and is deliberately not asserted.
 *
 *   node scripts/vendor-contract-integrity-check.mjs
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

const VENDOR = { id: "9ddda61f-d778-41a5-b568-39fd9f3eb37a", email: "zz-mp4-vendor@cosora.in", password: "CosoraQA!2026" };
const BUYER = { id: "11111111-1111-1111-1111-111111111111", email: "demo-buyer@cosora.dev", password: "cosora123" };

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

async function sessionFor(who) {
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: who.email, password: who.password });
  if (error) throw new Error(`login failed for ${who.email}: ${error.message}`);
  return db;
}

console.log("\n1.3a  A vendor WITH a signed contract cannot delete their own profile");
{
  const db = await sessionFor(VENDOR);
  const { count: before } = await db
    .from("vendor_contracts").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR.id);

  // The attack: a vendor's own anon-key session deleting their profile row,
  // which under the old ON DELETE CASCADE took every contract with it.
  await db.from("vendor_profiles").delete().eq("id", VENDOR.id);

  const { data: row } = await db.from("vendor_profiles").select("id").eq("id", VENDOR.id).maybeSingle();
  const { count: after } = await db
    .from("vendor_contracts").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR.id);

  check(!!row, "the vendor_profiles row still exists after the delete attempt");
  check(before === after && after > 0, "the signed contracts survived", `${before} -> ${after}`);
}

console.log("\n1.3b  A vendor with NO contract also cannot delete their profile (policy, not just the FK)");
{
  const db = await sessionFor(BUYER);
  const { data: hadRow } = await db.from("vendor_profiles").select("id").eq("id", BUYER.id).maybeSingle();
  if (!hadRow) {
    console.log("  SKIP  demo-buyer has no vendor_profiles row right now (nothing to attempt)");
  } else {
    const { count: contracts } = await db
      .from("vendor_contracts").select("id", { count: "exact", head: true }).eq("vendor_id", BUYER.id);
    await db.from("vendor_profiles").delete().eq("id", BUYER.id);
    const { data: stillThere } = await db.from("vendor_profiles").select("id").eq("id", BUYER.id).maybeSingle();
    check(!!stillThere, "row survives even with no contract referencing it", `contracts=${contracts}`);
  }
}

console.log("\n1.3c  The vendor can still do everything they legitimately need to");
{
  const db = await sessionFor(VENDOR);
  const { error: upErr } = await db.from("vendor_profiles").update({ landmark: "Near Pandesara Bus Stand" }).eq("id", VENDOR.id);
  check(!upErr, "UPDATE on their own profile still works", upErr?.message ?? "");
  const { data: sel } = await db.from("vendor_profiles").select("brand_name").eq("id", VENDOR.id).maybeSingle();
  check(!!sel, "SELECT still works");
  const { data: contracts } = await db.from("vendor_contracts").select("id").eq("vendor_id", VENDOR.id);
  check((contracts ?? []).length > 0, "they can still read their own contracts", `${contracts?.length} rows`);
}

console.log("\n1.3d  A duplicate signature for the same agreement version is refused");
{
  const db = await sessionFor(VENDOR);
  const { count: before } = await db
    .from("vendor_contracts").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR.id);
  await db.from("vendor_contracts").insert({
    vendor_id: VENDOR.id, signed_name: "SCRIPT DUPLICATE ATTEMPT",
    signature_url: null, agreement_version: "2026-09-v1",
  });
  const { count: after } = await db
    .from("vendor_contracts").select("id", { count: "exact", head: true }).eq("vendor_id", VENDOR.id);
  check(before === after, "no new row for an already-signed version", `${before} -> ${after}`);
}

console.log(`\n${pass}/${pass + fail} passed${fail ? " — FAILURES ABOVE" : ""}\n`);
process.exit(fail ? 1 : 0);
