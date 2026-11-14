-- ─────────────────────────────────────────────────────────────────────────────
-- REAL SELLER HARNESS (buyer sign-up audit 2026-11-13, item 11c; plan task A3).
-- A buyer who once ticked "Seller" on Register has a bare vendor_profiles row and nothing else: account deletion and
-- Support must treat them as a buyer. Prints PASS/FAIL; one transaction, ROLLED BACK.
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/buyer-signup/real_seller.sql 2>&1 | grep -E "PASS|FAIL"
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

-- A buyer with a confirmed email (so deletion has a channel).
create function pg_temp.new_user(tag text) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data, is_sso_user, is_anonymous,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, tag || '-' || left(u::text, 8) || '@harness.test', now(), 'authenticated', 'authenticated',
          jsonb_build_object('full_name', 'Harness ' || tag, 'active_role', 'buyer'), false, false, now(), now(), '', '', '', '');
  return u;
end $$;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('bare'); b text;
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Ticked Seller Once');
  b := public.account_deletion_blocker(u);
  perform pg_temp.ok('a bare vendor_profiles row does not block deletion', b is null, coalesce(b, 'null'));
  perform pg_temp.ok('a bare vendor_profiles row is not a real seller', not admin.is_real_seller(u));
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('reg'); b text;
begin
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (u, 'Registered', true);
  b := public.account_deletion_blocker(u);
  perform pg_temp.ok('a registered seller blocks deletion (vendor)', b = 'vendor', coalesce(b, 'null'));
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('prod'); b text;
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Has a product');
  insert into public.products (vendor_id, name) values (u, 'Harness shirt');
  b := public.account_deletion_blocker(u);
  perform pg_temp.ok('an unregistered seller with a product blocks deletion (vendor)', b = 'vendor', coalesce(b, 'null'));
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('anon'); n int; st text;
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Ticked Seller Once');
  begin
    perform public.anonymize_account(u);
    st := 'ok';
  exception when others then st := sqlerrm;
  end;
  select count(*) into n from public.vendor_profiles where id = u;
  perform pg_temp.ok('anonymize_account removes a bare vendor row and completes',
    st = 'ok' and n = 0 and (select account_status from public.profiles where id = u) = 'deleted', st || ' rows=' || n);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('anonreg'); st text;
begin
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (u, 'Registered', true);
  begin
    perform public.anonymize_account(u);
    st := 'ok';
  exception when others then st := sqlerrm;
  end;
  perform pg_temp.ok('anonymize_account still refuses a real seller', st like '%seller%', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
begin
  perform pg_temp.ok('admin.is_real_seller is not callable by browsers',
    not has_function_privilege('anon', 'admin.is_real_seller(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'admin.is_real_seller(uuid)', 'EXECUTE'));
end $c$;
rollback to savepoint c;

rollback;
