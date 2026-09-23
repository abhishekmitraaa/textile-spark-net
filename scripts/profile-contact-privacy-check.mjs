/**
 * MPF-3: profiles.email and profiles.phone are private.
 *
 * Migration 20260923171821 replaced table-wide SELECT on public.profiles with a
 * column grant that leaves out email and phone, for anon AND authenticated.
 * Before it, the public anon key alone listed every user's: 20 emails and 7
 * phones, counted with no session.
 *
 * This checks the database layer over real HTTP, as each role:
 *
 *   signed out   both MPF-3 proof requests, and every other way to reach the two
 *                columns (select, *, filter, order, or=), are refused 42501 with
 *                no rows and no count. The app's own signed-out read of the other
 *                columns still works. The four new functions refuse.
 *   demo-buyer   cannot read another user's email or phone, or filter on them;
 *                my_contact_info() returns one row, their own; the admin
 *                functions refuse; call_buyer_contact() refuses a vendor they
 *                have no RFQ with.
 *   demo-vendor  call_buyer_contact(demo-buyer) returns a phone, because it has
 *                quoted on their RFQ; a buyer it has never quoted is refused
 *                no_rfq_relationship.
 *   demo-admin   admin_profile_search() and admin_profile_emails() return emails.
 *
 * INTERIM: migration 20260923174653 grants the two columns back to signed-in
 * users until the new code is live in production (see MPF-19 in
 * documentation/myprofileflags.md). While it stands, the four "buyer cannot
 * read / filter" checks FAIL, by design; every other check must pass. After
 * `revoke select (email, phone) on public.profiles from authenticated;` all pass.
 *
 * READ-ONLY: nothing is written. It prints verdicts and codes, never an email or
 * a phone. call_buyer_contact()'s suspension and locked-chat refusals need state
 * changes, so they are checked in scripts/contact-gate-check.mjs, next to
 * callGate's.
 *
 * Run: node scripts/profile-contact-privacy-check.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { demoAccount } from "./lib/test-credentials.mjs";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

const BUYER_ID = "11111111-1111-1111-1111-111111111111";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";
/** Every profiles column a client may read. email and phone are the two left out. */
const READABLE = "id,full_name,avatar_url,active_role,onboarded,account_status,created_at";

const results = [];
let failures = 0;
function check(name, pass, detail = "") {
  if (!pass) failures++;
  results.push({ check: name, verdict: pass ? "PASS" : "*** FAIL ***", detail: String(detail).slice(0, 80) });
}

async function signIn(role) {
  const { email, password } = demoAccount(role);
  const db = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed for ${role}: ${error.message}`);
  return { db, id: data.user.id };
}

// ── Signed out, raw HTTP: exactly what anyone holding the public key can send ──
const anonHeaders = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const REFUSED = [
  ["MPF-3 proof: count of non-null emails", "select=id&email=not.is.null"],
  ["MPF-3 proof: count of non-null phones", "select=id&phone=not.is.null"],
  ["select=email", "select=email"],
  ["select=phone", "select=phone"],
  ["select=*", "select=*"],
  ["order by email", "select=id&order=email"],
  ["or= on email and phone", "select=id&or=(email.ilike.*a*,phone.ilike.*9*)"],
];
for (const [name, query] of REFUSED) {
  const r = await fetch(`${URL_}/rest/v1/profiles?${query}`, {
    headers: { ...anonHeaders, Prefer: "count=exact", Range: "0-0" },
  });
  const body = await r.json().catch(() => null);
  const refused = !r.ok && body?.code === "42501" && !Array.isArray(body) && r.headers.get("content-range") === null;
  check(`anon ${name}`, refused, `HTTP ${r.status} ${body?.code ?? ""} content-range=${r.headers.get("content-range")}`);
}
{
  const r = await fetch(`${URL_}/rest/v1/profiles?select=${READABLE}&limit=1`, { headers: anonHeaders });
  const body = await r.json().catch(() => null);
  check("anon still reads the other columns", r.status === 200 && Array.isArray(body) && body.length === 1, `HTTP ${r.status}`);
}
for (const [fn, args] of [
  ["my_contact_info", {}],
  ["call_buyer_contact", { p_buyer_id: BUYER_ID }],
  ["admin_profile_search", { p_term: "demo" }],
  ["admin_profile_emails", { p_ids: [BUYER_ID] }],
]) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...anonHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await r.json().catch(() => null);
  check(`anon cannot call ${fn}()`, !r.ok && !Array.isArray(body), `HTTP ${r.status} ${body?.code ?? ""}`);
}

// ── demo-buyer ──
const buyer = await signIn("buyer");
for (const col of ["email", "phone"]) {
  const { data, error } = await buyer.db.from("profiles").select(col).eq("id", VENDOR_ID);
  check(`buyer cannot read another user's ${col}`, error?.code === "42501" && !data, error?.code ?? "no error");
  const f = await buyer.db.from("profiles").select("id").not(col, "is", null);
  check(`buyer cannot filter on ${col}`, f.error?.code === "42501", f.error?.code ?? "no error");
}
{
  const { data, error } = await buyer.db.rpc("my_contact_info");
  check("buyer my_contact_info() returns their own row only",
    !error && Array.isArray(data) && data.length === 1 && Boolean(data[0].email) && "phone" in data[0],
    error?.message ?? `rows=${data?.length}`);
}
for (const [fn, args] of [["admin_profile_search", { p_term: "demo" }], ["admin_profile_emails", { p_ids: [VENDOR_ID] }]]) {
  const { error } = await buyer.db.rpc(fn, args);
  check(`buyer refused ${fn}()`, error?.code === "42501", error?.code ?? "no error");
}
{
  const { error } = await buyer.db.rpc("call_buyer_contact", { p_buyer_id: VENDOR_ID });
  check("buyer call_buyer_contact(vendor, no RFQ between them) refused", error?.message === "no_rfq_relationship", error?.message ?? "allowed");
}

// ── demo-vendor ──
const vendor = await signIn("vendor");
{
  const { data, error } = await vendor.db.rpc("call_buyer_contact", { p_buyer_id: BUYER_ID });
  check("vendor call_buyer_contact(buyer it quoted) returns the phone",
    !error && Array.isArray(data) && data.length === 1 && Boolean(data[0].phone),
    error?.message ?? `rows=${data?.length}`);
}
{
  // A buyer this vendor has never quoted: any visible RFQ owner outside the
  // set of buyers behind the vendor's own quotes.
  const { data: myQuotes } = await vendor.db.from("quotes").select("rfq_id").eq("vendor_id", vendor.id);
  const quotedRfqs = (myQuotes ?? []).map((q) => q.rfq_id);
  const { data: quotedOwners } = quotedRfqs.length
    ? await vendor.db.from("rfqs").select("buyer_id").in("id", quotedRfqs)
    : { data: [] };
  const exclude = new Set([vendor.id, ...(quotedOwners ?? []).map((r) => r.buyer_id)]);
  const { data: visible } = await vendor.db.from("rfqs").select("buyer_id").limit(200);
  const stranger = (visible ?? []).map((r) => r.buyer_id).find((id) => id && !exclude.has(id));
  if (!stranger) {
    results.push({ check: "vendor call_buyer_contact(buyer it never quoted)", verdict: "SKIP", detail: "no such buyer visible" });
  } else {
    const { data, error } = await vendor.db.rpc("call_buyer_contact", { p_buyer_id: stranger });
    check("vendor call_buyer_contact(buyer it never quoted) refused",
      error?.message === "no_rfq_relationship" && !data, error?.message ?? "allowed");
  }
}

// ── demo-admin ──
const admin = await signIn("admin");
{
  const { data, error } = await admin.db.rpc("admin_profile_search", { p_term: "demo", p_limit: 50 });
  check("admin admin_profile_search('demo') returns emails",
    !error && (data ?? []).length > 0 && data.every((r) => "email" in r) && data.some((r) => r.email),
    error?.message ?? `rows=${data?.length}`);
  const e = await admin.db.rpc("admin_profile_emails", { p_ids: [BUYER_ID, VENDOR_ID] });
  check("admin admin_profile_emails([buyer, vendor]) returns 2 emails",
    !e.error && (e.data ?? []).filter((r) => r.email).length === 2, e.error?.message ?? `rows=${e.data?.length}`);
}

await Promise.all([buyer.db.auth.signOut(), vendor.db.auth.signOut(), admin.db.auth.signOut()]);

console.table(results);
console.log(failures === 0 ? "\nPASS - email and phone are private; every legitimate reader still works." : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
