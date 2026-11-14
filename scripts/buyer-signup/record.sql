-- ─────────────────────────────────────────────────────────────────────────────
-- BUYER SIGN-UP RECORD HARNESS (buyer sign-up audit 2026-11-13, items 1 and 5; plan tasks A1 and A1b).
-- Every case runs in its own savepoint and prints "PASS: <label>" or "FAIL: <label> <detail>". The whole file runs in
-- one transaction and ROLLS BACK: it never changes the database it runs against.
-- HOW TO RUN (local stack):
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/buyer-signup/record.sql 2>&1 | grep -E "PASS|FAIL"
-- The "onboarded is the server's" cases pass only once 20261114100600_profiles_signup_guard.sql is applied too.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

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

create function pg_temp.claims(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- ═══════════════ A1: the record ═══════════════
savepoint c;
do $c$
declare u uuid := pg_temp.new_user('terms'); n int; v text; o boolean; src text;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  perform public.accept_buyer_terms(public.buyer_terms_version());
  reset role;
  select onboarded, terms_version into o, v from public.profiles where id = u;
  select count(*), max(source) into n, src from public.terms_acceptances where profile_id = u;
  perform pg_temp.ok('accept_buyer_terms: onboarded, version stored, one signup row',
    o and v = '2026-11-v1' and n = 1 and src = 'signup', format('onboarded=%s version=%s rows=%s source=%s', o, v, n, src));
  perform pg_temp.claims(u);
  set local role authenticated;
  perform public.accept_buyer_terms('2026-11-v1');
  reset role;
  select count(*) into n from public.terms_acceptances where profile_id = u;
  select source into src from public.terms_acceptances where profile_id = u order by accepted_at desc, id desc limit 1;
  perform pg_temp.ok('a second acceptance adds a reaccept row', n = 2 and src = 'reaccept', format('rows=%s last=%s', n, src));
exception when others then perform pg_temp.ok('accept_buyer_terms records', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('stale'); st text;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    perform public.accept_buyer_terms('2020-01-v0');
    st := 'no error';
  exception when others then st := sqlerrm;
  end;
  reset role;
  perform pg_temp.ok('an old Terms version is refused (stale_terms)', st = 'stale_terms', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare st text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform public.accept_buyer_terms('2026-11-v1');
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('accept_buyer_terms without a caller is refused (42501)', st = '42501', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('gone'); st text;
begin
  update public.profiles set account_status = 'deleted' where id = u;
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    perform public.accept_buyer_terms('2026-11-v1');
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('a deleted account cannot accept (42501)', st = '42501', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
begin
  perform pg_temp.ok('anon cannot execute accept_buyer_terms',
    not has_function_privilege('anon', 'public.accept_buyer_terms(text)', 'EXECUTE'));
  perform pg_temp.ok('authenticated can execute accept_buyer_terms',
    has_function_privilege('authenticated', 'public.accept_buyer_terms(text)', 'EXECUTE'));
  perform pg_temp.ok('terms columns readable by authenticated, not anon',
    has_column_privilege('authenticated', 'public.profiles', 'terms_version', 'SELECT')
    and has_column_privilege('authenticated', 'public.profiles', 'terms_accepted_at', 'SELECT')
    and not has_column_privilege('anon', 'public.profiles', 'terms_version', 'SELECT'));
  perform pg_temp.ok('terms_acceptances: browsers read only, anon nothing',
    has_table_privilege('authenticated', 'public.terms_acceptances', 'SELECT')
    and not has_table_privilege('authenticated', 'public.terms_acceptances', 'INSERT')
    and not has_table_privilege('authenticated', 'public.terms_acceptances', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.terms_acceptances', 'DELETE')
    and not has_table_privilege('anon', 'public.terms_acceptances', 'SELECT'));
  perform pg_temp.ok('the buyer_signup_required switch exists and starts off',
    exists (select 1 from public.feature_flags where key = 'buyer_signup_required' and not enabled));
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare a uuid := pg_temp.new_user('own-a'); b uuid := pg_temp.new_user('own-b'); n int;
begin
  perform pg_temp.claims(a);
  set local role authenticated;
  perform public.accept_buyer_terms('2026-11-v1');
  reset role;
  perform pg_temp.claims(b);
  set local role authenticated;
  select count(*) into n from public.terms_acceptances where profile_id = a;
  reset role;
  perform pg_temp.ok('another account reads none of my acceptances', n = 0, 'rows=' || n);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('tv'); st text;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    update public.profiles set terms_version = '2026-11-v1', terms_accepted_at = now() where id = u;
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('a browser cannot write terms_version (42501)', st = '42501', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('role'); st text; r text;
begin
  insert into public.buyer_profiles (id) values (u) on conflict (id) do nothing;
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    update public.buyer_profiles set buyer_role = 'ceo' where id = u;
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  update public.buyer_profiles set buyer_role = 'designer' where id = u;
  reset role;
  select buyer_role into r from public.buyer_profiles where id = u;
  perform pg_temp.ok('buyer_role outside the six ids is refused (23514)', st = '23514', st);
  perform pg_temp.ok('buyer_role designer saves', r = 'designer', coalesce(r, 'null'));
exception when others then perform pg_temp.ok('buyer_role', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

-- ═══════════════ A1b: onboarded is the server's (20261114100600) ═══════════════
savepoint c;
do $c$
declare u uuid := pg_temp.new_user('ob'); st text; o boolean;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    update public.profiles set onboarded = true where id = u;
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  select onboarded into o from public.profiles where id = u;
  perform pg_temp.ok('A1b: a browser cannot set onboarded (42501)', st = '42501' and not o, st || ' onboarded=' || o);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('ok'); st text; n text;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  perform public.accept_buyer_terms('2026-11-v1');
  begin
    -- A form that sends the stored value back, and an unrelated edit, still save.
    update public.profiles set full_name = 'Renamed', onboarded = true where id = u;
    st := 'ok';
  exception when others then st := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  select full_name into n from public.profiles where id = u;
  perform pg_temp.ok('A1b: an unchanged onboarded and a name edit still save', st = 'ok' and n = 'Renamed', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('off'); st text;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  perform public.accept_buyer_terms('2026-11-v1');
  begin
    update public.profiles set onboarded = false where id = u;
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('A1b: a browser cannot clear onboarded either (42501)', st = '42501', st);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := gen_random_uuid(); o boolean; v text; st text;
begin
  -- A browser-made profiles row (profiles_insert) starts unfinished whatever it sends.
  insert into auth.users (id, email, aud, role, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, 'ins-' || left(u::text, 8) || '@harness.test', 'authenticated', 'authenticated', '{}'::jsonb, false, false,
          now(), now(), '', '', '', '');
  delete from public.profiles where id = u;
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    insert into public.profiles (id, full_name, onboarded, terms_version) values (u, 'Ins', true, '2026-11-v1');
    st := 'ok';
  exception when others then st := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  select onboarded, terms_version into o, v from public.profiles where id = u;
  perform pg_temp.ok('A1b: a browser insert starts unfinished', st = 'ok' and o = false and v is null,
    format('%s onboarded=%s version=%s', st, o, v));
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('srv'); o boolean;
begin
  -- Server code (not a browser) still sets it: the seller registration's definer path, an operator, a migration.
  update public.profiles set onboarded = true where id = u;
  select onboarded into o from public.profiles where id = u;
  perform pg_temp.ok('A1b: server code still sets onboarded', o);
end $c$;
rollback to savepoint c;

rollback;
