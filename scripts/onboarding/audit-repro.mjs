// The onboarding audit's reproductions (2026-11-13), against the LOCAL stack only. Each prints PASS or FAIL.
//   V2  a browser marks its own account registered:            expect 42501
//   V2b a browser writes its own storefront photos:            expect 42501
//   V3  an unregistered account adds a listing (switch on):    expect "Finish your seller registration first"
//   V3b ... with the switch off for it:                         expect the insert to go through (into review)
//   V1  a submit that fails at the contract leaves nothing:     expect no registration, no flag, no product
// Usage: LOCAL_STACK_ENV=<path to local-stack-env.json> node scripts/onboarding/audit-repro.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const env = JSON.parse(readFileSync(process.env.LOCAL_STACK_ENV, "utf8"));
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API)) throw new Error(`not the local stack: ${env.API}`);
const service = createClient(env.API, env.SERVICE, { auth: { persistSession: false } });
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_localstack", "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-c", q]).toString().trim();

let failed = 0;
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}${cond ? "" : ` ${detail}`}`);
  if (!cond) failed++;
};

async function account(prefix) {
  const email = `${prefix}-${Date.now().toString(36)}@cosora.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: env.PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(env.API, env.ANON, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password: env.PASSWORD });
  if (s.error) throw s.error;
  return { id: data.user.id, client };
}

// V2: self-registration through the API.
{
  const a = await account("repro-v2");
  const ins = await a.client.from("vendor_profiles").insert({ id: a.id, brand_name: "Repro V2", onboarding_complete: true }, { returning: "minimal" });
  ok("V2 insert with onboarding_complete=true is refused", ins.error?.code === "42501", JSON.stringify(ins.error));
  sql(`insert into public.vendor_profiles (id, brand_name) values ('${a.id}', 'Repro V2') on conflict do nothing;`);
  const upd = await a.client.from("vendor_profiles").update({ onboarding_complete: true }, { returning: "minimal" }).eq("id", a.id);
  ok("V2 update to onboarding_complete=true is refused", upd.error?.code === "42501", JSON.stringify(upd.error));
  const pics = await a.client.from("vendor_profiles").update({ office_photos: ["https://example.com/x.jpg"] }, { returning: "minimal" }).eq("id", a.id);
  ok("V2b a browser's office_photos write is refused", pics.error?.code === "42501", JSON.stringify(pics.error));
  ok("V2 the flag is still false", sql(`select onboarding_complete from public.vendor_profiles where id = '${a.id}';`) === "f");
}

// V3: publishing without a registration.
{
  const a = await account("repro-v3");
  sql(`insert into public.vendor_profiles (id, brand_name) values ('${a.id}', 'Repro V3');
       update public.feature_flags set allow_profile_ids = array_append(allow_profile_ids, '${a.id}') where key = 'seller_registration_required';`);
  try {
    const on = await a.client.from("products").insert({ vendor_id: a.id, name: "Repro listing" }, { returning: "minimal" });
    ok("V3 listing refused while the switch is on", on.error?.message === "Finish your seller registration first" && on.error?.hint === "registration_required", JSON.stringify(on.error));
  } finally {
    sql(`update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, '${a.id}') where key = 'seller_registration_required';`);
  }
  const off = await a.client.from("products").insert({ vendor_id: a.id, name: "Repro listing" }, { returning: "minimal" });
  ok("V3b with the switch off, the listing goes to review as before", !off.error && sql(`select status from public.products where vendor_id = '${a.id}';`) === "under_review", JSON.stringify(off.error));
  sql(`delete from public.products where vendor_id = '${a.id}';`);
}

// V1: a submit refused at the contract (an empty signed name) writes nothing at all.
{
  const a = await account("repro-v1");
  const { error } = await a.client.rpc("submit_vendor_registration", {
    p_submission: crypto.randomUUID(),
    p: { country_code: "IN", business_name: "Repro V1", contract: { signed_name: "", agreement_version: "2026-09-v1" } },
  });
  ok("V1 an incomplete submit is refused", Boolean(error), "no error");
  ok("V1 nothing was written", sql(`select (select count(*) from public.vendor_registrations where vendor_id = '${a.id}')
    + (select count(*) from public.vendor_profiles where id = '${a.id}') + (select count(*) from public.products where vendor_id = '${a.id}')
    + (select count(*) from public.vendor_contracts where vendor_id = '${a.id}');`) === "0");
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
