/**
 * One-off: move every KYC document out of the PUBLIC `product-images` bucket
 * and into the PRIVATE `business-docs` bucket, then delete the public copy.
 *
 * This is a storage migration, not a schema one, which is why it lives here and
 * not in supabase/migrations/. Storage objects are rows in `storage.objects`
 * but the bytes are not, and copying them needs a download/upload round trip.
 *
 * WHY IT EXISTS: `uploadKycDocument()` used to write PAN cards to the public
 * bucket and store `getPublicUrl()` in `vendor_documents.file_url`. Anyone with
 * the URL — no session, no RLS — could fetch an identity document. The code path
 * is fixed; this moves what the old path already wrote.
 *
 * SAFETY: copy → verify → repoint the row → delete. The delete only happens
 * after the copy is confirmed present in the private bucket, so a failure
 * halfway leaves the object readable rather than lost. Re-runnable: an object
 * already in business-docs is skipped, and the public copy is still removed.
 *
 * Requires a session that owns the objects, or the service role. Storage RLS on
 * `product-images` is owner-scoped (`foldername(name)[1] = auth.uid()`), so
 * running as a vendor moves only that vendor's own documents — which is the
 * correct blast radius for a per-vendor run, and the reason the summary prints
 * what it could not see.
 *
 *   node scripts/migrate-kyc-to-private-bucket.mjs            # dry run
 *   node scripts/migrate-kyc-to-private-bucket.mjs --apply    # do it
 *
 * Credentials: SUPABASE_SERVICE_ROLE_KEY for a full sweep, or
 * KYC_MIGRATE_EMAIL / KYC_MIGRATE_PASSWORD to run as one vendor.
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

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.VITE_SUPABASE_ANON_KEY;

const PUBLIC_BUCKET = "product-images";
const PRIVATE_BUCKET = "business-docs";
const APPLY = process.argv.includes("--apply");

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

async function makeClient() {
  if (SERVICE_KEY) {
    console.log("auth: service role (full sweep)\n");
    return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  }
  const email = process.env.KYC_MIGRATE_EMAIL;
  const password = process.env.KYC_MIGRATE_PASSWORD;
  if (!email || !password) {
    console.error(
      "No credentials. Set SUPABASE_SERVICE_ROLE_KEY for a full sweep, or\n" +
      "KYC_MIGRATE_EMAIL + KYC_MIGRATE_PASSWORD to migrate one vendor's documents.",
    );
    process.exit(2);
  }
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) { console.error(`sign-in failed: ${error.message}`); process.exit(2); }
  console.log(`auth: ${email} (owner-scoped — sees only this account's objects)\n`);
  return db;
}

/**
 * Storage `list()` is per-prefix, not recursive, so walk it. KYC objects live at
 * `<vendorId>/kyc/<file>`; anything else in the bucket is left alone.
 */
async function findKycObjects(db) {
  const found = [];
  const { data: top, error } = await db.storage.from(PUBLIC_BUCKET).list("", { limit: 1000 });
  if (error) { console.error(`list failed: ${error.message}`); process.exit(2); }
  for (const entry of top ?? []) {
    if (entry.id !== null) continue; // a file at the root, not a vendor folder
    const { data: kyc } = await db.storage.from(PUBLIC_BUCKET).list(`${entry.name}/kyc`, { limit: 1000 });
    for (const f of kyc ?? []) {
      if (f.id === null) continue;
      found.push(`${entry.name}/kyc/${f.name}`);
    }
  }
  return found;
}

async function main() {
  console.log(`KYC storage migration — ${PUBLIC_BUCKET} → ${PRIVATE_BUCKET}`);
  console.log(APPLY ? "MODE: apply\n" : "MODE: dry run (pass --apply to make changes)\n");

  const db = await makeClient();
  const objects = await findKycObjects(db);

  console.log(`Found ${objects.length} KYC object(s) in the public bucket:`);
  for (const o of objects) console.log(`  - ${o}`);
  console.log("");

  if (objects.length === 0) {
    console.log("Nothing to move. The public bucket holds no KYC documents.");
    return;
  }

  for (const key of objects) {
    console.log(`· ${key}`);

    // 1. Read the bytes out of the public bucket.
    const { data: blob, error: dlErr } = await db.storage.from(PUBLIC_BUCKET).download(key);
    if (dlErr || !blob) { check(`download ${key}`, false, dlErr?.message); continue; }

    if (!APPLY) {
      check(`would copy → ${PRIVATE_BUCKET}/${key}`, true, `${blob.size} bytes`);
      check(`would delete ${PUBLIC_BUCKET}/${key}`, true);
      continue;
    }

    // 2. Write into the private bucket at the SAME path. The
    //    `<vendorId>/...` prefix is what business_docs_owner_select keys on,
    //    so preserving it is what keeps the object readable by its owner.
    const buf = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await db.storage
      .from(PRIVATE_BUCKET)
      .upload(key, buf, { upsert: true, contentType: blob.type || "application/octet-stream" });
    if (upErr) { check(`copy ${key}`, false, upErr.message); continue; }

    // 3. Confirm it is really there before removing the only other copy.
    const { data: signed, error: signErr } = await db.storage
      .from(PRIVATE_BUCKET).createSignedUrl(key, 60);
    if (signErr || !signed?.signedUrl) { check(`verify copy ${key}`, false, signErr?.message); continue; }
    const head = await fetch(signed.signedUrl, { method: "GET" });
    if (!head.ok) { check(`verify copy ${key}`, false, `signed URL returned ${head.status}`); continue; }
    check(`copied and verified ${key}`, true);

    // 4. Repoint any row that referenced the old public URL.
    const publicUrl = db.storage.from(PUBLIC_BUCKET).getPublicUrl(key).data.publicUrl;
    const { data: repointed, error: rowErr } = await db
      .from("vendor_documents")
      .update({ file_url: key })
      .eq("file_url", publicUrl)
      .select("id");
    if (rowErr) check(`repoint vendor_documents for ${key}`, false, rowErr.message);
    else if ((repointed ?? []).length > 0) check(`repointed ${repointed.length} vendor_documents row(s)`, true);
    else console.log(`       (no vendor_documents row references this object — orphan)`);

    // 5. Remove the public copy. This is the whole point: copying without
    //    deleting leaves the document exposed.
    const { error: rmErr } = await db.storage.from(PUBLIC_BUCKET).remove([key]);
    check(`deleted ${PUBLIC_BUCKET}/${key}`, !rmErr, rmErr?.message);
  }

  // 6. Prove the negative.
  if (APPLY) {
    const remaining = await findKycObjects(db);
    check("no KYC objects remain in the public bucket", remaining.length === 0,
      remaining.length ? `still present: ${remaining.join(", ")}` : "");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
