/**
 * Delete KYC objects in the private `business-docs` bucket that no database row
 * references.
 *
 * WHY THEY EXIST: `saveVendorOnboarding()` delete-then-inserts `vendor_documents`
 * rows on every re-submission, but storage is not covered by a row delete and
 * there is no cascade — so each re-submission stranded the previous identity
 * scan in the bucket, referenced by nothing and afterwards indistinguishable
 * from a real vendor's KYC. That leak is fixed at the source; this clears what
 * it already produced.
 *
 * SAFETY:
 *  - Orphans are COMPUTED, never hardcoded: an object is a candidate only if no
 *    `vendor_documents.file_url` AND no `vendor_contracts.signature_url`
 *    anywhere names it. A signature PNG is referenced by a contract and is
 *    therefore never a candidate.
 *  - Deletion runs as each object's OWNER under RLS
 *    (`business_docs_owner_delete` keys on `foldername(name)[1] = auth.uid()`),
 *    not with a service-role key. An owner whose password is not known here is
 *    reported and skipped rather than force-deleted.
 *  - Dry run by default. Pass --apply to delete.
 *
 *   node scripts/purge-orphaned-kyc-objects.mjs           # list only
 *   node scripts/purge-orphaned-kyc-objects.mjs --apply   # delete
 */
import { createClient } from "@supabase/supabase-js";
import { credential } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

/** Owners whose folders this script can clean, and the credentials to do it as them. */
const OWNERS = [
  { id: "11111111-1111-1111-1111-111111111111", email: "demo-buyer@cosora.dev", password: credential("DEMO_BUYER_PASSWORD") },
  { id: "9ddda61f-d778-41a5-b568-39fd9f3eb37a", email: "zz-mp4-vendor@cosora.in", password: credential("MP_VENDOR_PASSWORD") },
];

const anon = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

/**
 * Everything a row still points at. Read as each owner (vendor_documents and
 * vendor_contracts are both owner-scoped by RLS), then unioned — an object is
 * only an orphan if NO owner claims it.
 */
async function referencedPaths() {
  const referenced = new Set();
  for (const owner of OWNERS) {
    const db = anon();
    const { error } = await db.auth.signInWithPassword({ email: owner.email, password: owner.password });
    if (error) continue;
    const { data: docs } = await db.from("vendor_documents").select("file_url").eq("vendor_id", owner.id);
    for (const d of docs ?? []) if (d.file_url) referenced.add(d.file_url);
    const { data: contracts } = await db.from("vendor_contracts").select("signature_url").eq("vendor_id", owner.id);
    for (const c of contracts ?? []) if (c.signature_url) referenced.add(c.signature_url);
  }
  return referenced;
}

const referenced = await referencedPaths();
console.log(`referenced by a row: ${referenced.size}`);

let totalOrphans = 0;
let totalDeleted = 0;

for (const owner of OWNERS) {
  const db = anon();
  const { error: loginErr } = await db.auth.signInWithPassword({ email: owner.email, password: owner.password });
  if (loginErr) {
    console.log(`\n${owner.email}: SKIPPED — cannot sign in (${loginErr.message}). Its objects are left alone.`);
    continue;
  }

  const orphans = [];
  for (const prefix of ["kyc", "contract"]) {
    const { data: objects } = await db.storage.from("business-docs").list(`${owner.id}/${prefix}`);
    for (const o of objects ?? []) {
      const full = `${owner.id}/${prefix}/${o.name}`;
      if (!referenced.has(full)) orphans.push(full);
    }
  }

  console.log(`\n${owner.email} (${owner.id})`);
  if (orphans.length === 0) {
    console.log("  no orphans");
    continue;
  }
  for (const o of orphans) console.log(`  ORPHAN ${o}`);
  totalOrphans += orphans.length;

  if (!APPLY) {
    console.log(`  (dry run — pass --apply to delete these ${orphans.length})`);
    continue;
  }
  const { error } = await db.storage.from("business-docs").remove(orphans);
  if (error) {
    console.log(`  DELETE FAILED: ${error.message}`);
  } else {
    totalDeleted += orphans.length;
    console.log(`  deleted ${orphans.length}`);
  }
}

console.log(`\norphans found: ${totalOrphans}${APPLY ? `, deleted: ${totalDeleted}` : " (dry run)"}`);
