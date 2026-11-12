-- ─────────────────────────────────────────────────────────────────────────────
-- REGISTRATION HARNESS (vendor registration fixes, 2026-11-13).
-- Every case runs in its own savepoint (no case sees another's writes) and prints "PASS: <label>" or "FAIL: <label> <detail>". The whole file runs in one
-- transaction and ROLLS BACK: it never changes the database it runs against.
-- HOW TO RUN (local stack):
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/onboarding/registration.sql 2>&1 | grep -E "PASS|FAIL"
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

-- A throwaway account (its profiles row comes from on_auth_user_created).
create function pg_temp.new_user(tag text) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, tag || '-' || left(u::text, 8) || '@harness.test', 'authenticated', 'authenticated',
          jsonb_build_object('full_name', 'Harness ' || tag, 'active_role', 'buyer'), false, false, now(), now(), '', '', '', '');
  return u;
end $$;

-- Claims for a signed-in caller; the DO block then runs `set local role authenticated`.
create function pg_temp.claims(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- ═════════════════════════════ Task 1: state, exemptions, switches, read model ═════════════
savepoint c;
do $c$
begin
  perform pg_temp.ok('country_code backfilled IN for India rows',
    (select count(*) from public.vendor_profiles where (country ilike 'india' or country is null) and country_code is distinct from 'IN') = 0);
exception when others then perform pg_temp.ok('country_code backfilled IN for India rows', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare a uuid := pg_temp.new_user('reg-a'); b uuid := pg_temp.new_user('reg-b'); n int;
begin
  insert into public.vendor_registrations (id, vendor_id, country_code, status) values (gen_random_uuid(), a, 'IN', 'registered');
  begin
    perform pg_temp.claims(b);
    set local role authenticated;
    select count(*) into n from public.vendor_registrations where vendor_id = a;
    reset role;
    perform pg_temp.ok('vendor_registrations unreadable by another seller (0 rows)', n = 0, 'rows=' || n);
  exception when others then
    perform pg_temp.ok('vendor_registrations unreadable by another seller (0 rows)', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform pg_temp.claims(a);
    set local role authenticated;
    select count(*) into n from public.vendor_registrations where vendor_id = a;
    reset role;
    perform pg_temp.ok('vendor_registrations readable by its seller', n = 1, 'rows=' || n);
  exception when others then
    perform pg_temp.ok('vendor_registrations readable by its seller', false, sqlstate || ' ' || sqlerrm);
  end;
exception when others then perform pg_temp.ok('vendor_registrations fixtures', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare n int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    select count(*) into n from public.vendor_registrations;
    reset role;
    perform pg_temp.ok('anon cannot read vendor_registrations', false, 'read ' || n || ' rows');
  exception when others then
    perform pg_temp.ok('anon cannot read vendor_registrations', sqlstate = '42501', sqlstate);
  end;
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('reg-off');
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Harness Off');
  update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key = 'seller_registration_required';
  perform pg_temp.ok('seller_registered true when switch off', public.seller_registered(u));
exception when others then perform pg_temp.ok('seller_registered true when switch off', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('reg-on'); w uuid := pg_temp.new_user('reg-nocontract');
begin
  update public.feature_flags set enabled = true where key = 'seller_registration_required';
  insert into public.vendor_profiles (id, brand_name) values (u, 'Harness Unregistered');
  perform pg_temp.ok('seller_registered false for unregistered seller with switch on', not public.seller_registered(u));
  perform pg_temp.ok('seller_registered true for exempt 22222222-… with switch on',
    public.seller_registered('22222222-2222-2222-2222-222222222222'));
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (w, 'Harness No Contract', true);
  perform pg_temp.ok('seller_registered false for flag-true seller without contract, switch on', not public.seller_registered(w));
  insert into public.vendor_contracts (vendor_id, signed_name, agreement_version) values (w, 'Harness', '2026-09-v1');
  perform pg_temp.ok('seller_registered true for flag-true seller with contract, switch on', public.seller_registered(w));
exception when others then perform pg_temp.ok('seller_registered with switch on', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare r jsonb; u uuid := pg_temp.new_user('reg-none');
begin
  begin
    perform pg_temp.claims('22222222-2222-2222-2222-222222222222');
    set local role authenticated;
    r := public.my_seller_registration();
    reset role;
    perform pg_temp.ok('my_seller_registration returns exempt for 22222222-…', r ->> 'status' = 'exempt', coalesce(r::text, 'null'));
  exception when others then perform pg_temp.ok('my_seller_registration returns exempt for 22222222-…', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform pg_temp.claims(u);
    set local role authenticated;
    r := public.my_seller_registration();
    reset role;
    perform pg_temp.ok('my_seller_registration returns none for a new account', r ->> 'status' = 'none', coalesce(r::text, 'null'));
  exception when others then perform pg_temp.ok('my_seller_registration returns none for a new account', false, sqlstate || ' ' || sqlerrm);
  end;
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
begin
  perform pg_temp.ok('anon has no EXECUTE on seller_registered',
    not has_function_privilege('anon', 'public.seller_registered(uuid)', 'EXECUTE'));
  perform pg_temp.ok('anon has no EXECUTE on my_seller_registration',
    not has_function_privilege('anon', 'public.my_seller_registration()', 'EXECUTE'));
exception when others then perform pg_temp.ok('function grants', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
begin
  perform pg_temp.ok('switches exist and start off',
    (select count(*) from public.feature_flags
      where key in ('seller_registration_required', 'overseas_seller_registration') and not enabled) = 2);
  perform pg_temp.ok('free plan allows 1 catalogue, paid unlimited',
    (select (limits ->> 'catalogues_max')::int from public.subscription_plans where id = 'free') = 1
    and (select (limits ->> 'catalogues_max')::int from public.subscription_plans where id = 'basic') = -1);
exception when others then perform pg_temp.ok('switches and catalogue limits', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

-- @@TASK2@@

rollback;
