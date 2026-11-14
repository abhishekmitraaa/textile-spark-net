-- ─────────────────────────────────────────────────────────────────────────────
-- SIGNED-OUT PROFILE COLUMNS (buyer sign-up audit 2026-11-13, item 14a; plan task A5; migration 20261114100500).
-- Prints PASS/FAIL; one transaction, ROLLED BACK.
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/buyer-signup/signed_out.sql 2>&1 | grep -E "PASS|FAIL"
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

savepoint c;
do $c$
declare st text; n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform account_status from public.profiles limit 1;
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('a visitor reading account_status is refused (42501)', st = '42501', st);

  set local role anon;
  begin
    select count(*) into n from (select id, full_name, avatar_url from public.profiles limit 5) x;
    st := 'ok';
  exception when others then st := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  perform pg_temp.ok('a visitor still reads names and pictures', st = 'ok', st);

  set local role anon;
  begin
    -- The public feed and a store page, as a visitor, still answer.
    perform count(*) from public.feed_products('newest', 12, 0);
    st := 'ok';
  exception when others then st := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  perform pg_temp.ok('the visitor feed still answers', st = 'ok', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid; st text;
begin
  select id into u from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
  begin
    perform account_status, onboarded, active_role, created_at from public.profiles limit 1;
    st := 'ok';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('a signed-in account still reads them', st = 'ok', st);
end $c$;
rollback to savepoint c;

rollback;
