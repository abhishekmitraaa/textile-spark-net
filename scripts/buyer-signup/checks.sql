-- ─────────────────────────────────────────────────────────────────────────────
-- BUYER FIELD CHECKS HARNESS (buyer sign-up audit 2026-11-13, item 15; plan task A2).
-- Prints "PASS: <label>" / "FAIL: <label> <detail>"; one transaction, ROLLED BACK.
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/buyer-signup/checks.sql 2>&1 | grep -E "PASS|FAIL"
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
  insert into public.buyer_profiles (id) values (u) on conflict (id) do nothing;
  return u;
end $$;

create function pg_temp.claims(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- Runs one statement as the account and returns the constraint name it was refused under, or 'ok'.
create function pg_temp.try_as(u uuid, stmt text) returns text
language plpgsql as $$
declare c text;
begin
  perform pg_temp.claims(u);
  set local role authenticated;
  begin
    execute stmt;
    reset role;
    return 'ok';
  exception when others then
    get stacked diagnostics c = constraint_name;
    reset role;
    return coalesce(nullif(c, ''), sqlstate) || ' ' || sqlerrm;
  end;
end $$;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('f'); r text; tag text; stmt text; want text;
begin
  for tag, stmt, want in values
    ('121-character name',    'update public.buyer_profiles set display_name = repeat(''a'', 121) where id = $1', 'buyer_profiles_display_name_valid'),
    ('121-character company', 'update public.buyer_profiles set company = repeat(''c'', 121) where id = $1', 'buyer_profiles_company_valid'),
    ('pincode 01234',         'update public.buyer_profiles set postal_code = ''012345'' where id = $1', 'buyer_profiles_postal_code_valid'),
    ('pincode 1100',          'update public.buyer_profiles set postal_code = ''1100'' where id = $1', 'buyer_profiles_postal_code_valid'),
    ('bad GSTIN',             'update public.buyer_profiles set gstin = ''07ABCDE1234F1Z0'' where id = $1', 'buyer_profiles_gstin_valid'),
    ('bad PAN',               'update public.buyer_profiles set pan = ''ABCD1234'' where id = $1', 'buyer_profiles_pan_valid'),
    ('email without a dot',   'update public.profiles set email = ''a@b'' where id = $1', 'profiles_email_valid'),
    ('placeholder email',     'update public.profiles set email = ''p919911311001@phone.cosora.invalid'' where id = $1', 'profiles_email_valid')
  loop
    r := pg_temp.try_as(u, replace(stmt, '$1', quote_literal(u)));
    perform pg_temp.ok('refused: ' || tag, r like want || ' %', r);
  end loop;
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('v'); r text; g text; p text; d text; pc text; e text;
begin
  -- A valid GSTIN for PAN AAACC1206D (07 = Delhi): computed with gstin_is_valid's checksum.
  select s into g from (select '07AAACC1206D1Z' || c as s from unnest(string_to_array('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', null)) c) x
   where public.gstin_is_valid(s) limit 1;
  r := pg_temp.try_as(u, format(
    'update public.buyer_profiles set display_name = %L, company = %L, postal_code = %L, gstin = %L, pan = %L where id = %L',
    '  Asha Textiles ', 'Asha Pvt Ltd', '110001', lower(g), 'aaacc 1206d', u));
  select gstin, pan, display_name, postal_code into g, p, d, pc from public.buyer_profiles where id = u;
  perform pg_temp.ok('a valid row saves, trimmed and upper-cased', r = 'ok' and p = 'AAACC1206D' and g = upper(g) and d = 'Asha Textiles' and pc = '110001',
    format('%s gstin=%s pan=%s name=[%s]', r, g, p, d));
  r := pg_temp.try_as(u, format('update public.profiles set full_name = %L, email = %L where id = %L', 'Asha Rao', 'asha@example.com', u));
  select email into e from public.profiles where id = u;
  perform pg_temp.ok('a valid name and email save', r = 'ok' and e = 'asha@example.com', r);
  r := pg_temp.try_as(u, format('update public.profiles set email = null where id = %L', u));
  perform pg_temp.ok('an emptied email saves as null', r = 'ok', r);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('mm'); r text; g text;
begin
  select s into g from (select '07AAACC1206D1Z' || c as s from unnest(string_to_array('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', null)) c) x
   where public.gstin_is_valid(s) limit 1;
  r := pg_temp.try_as(u, format('update public.buyer_profiles set gstin = %L, pan = %L where id = %L', g, 'AAAPL1234C', u));
  perform pg_temp.ok('refused: GSTIN for another PAN', r like 'buyer_profiles_gstin_matches_pan %', r);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('uk'); r text;
begin
  r := pg_temp.try_as(u, format('update public.buyer_profiles set country = %L, country_code = %L, postal_code = %L where id = %L',
    'United Kingdom', 'GB', 'SW1A 1AA', u));
  perform pg_temp.ok('a UK postcode saves outside India', r = 'ok', r);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('legacy'); r text;
begin
  -- A value saved before the checks (as the server) stays until its owner changes it.
  update public.buyer_profiles set postal_code = '1100', pan = 'bad' where id = u;
  update public.profiles set email = 'p919911311001@phone.cosora.invalid' where id = u;
  r := pg_temp.try_as(u, format('update public.buyer_profiles set company = %L, postal_code = postal_code where id = %L', 'Kept Co', u));
  perform pg_temp.ok('an unchanged legacy value does not block another field', r = 'ok', r);
  r := pg_temp.try_as(u, format('update public.profiles set full_name = %L where id = %L', 'Kept Name', u));
  perform pg_temp.ok('an unchanged placeholder email does not block a name edit', r = 'ok', r);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := gen_random_uuid(); e text;
begin
  -- handle_new_user (a definer path) writes the dummy sign-in's placeholder email.
  insert into auth.users (id, email, aud, role, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, 'p91' || floor(random() * 1e9)::bigint || '@phone.cosora.invalid', 'authenticated', 'authenticated',
          '{"active_role":"buyer"}'::jsonb, false, false, now(), now(), '', '', '', '');
  select email into e from public.profiles where id = u;
  perform pg_temp.ok('the sign-in placeholder email still lands (definer path)', e like '%.invalid', coalesce(e, 'null'));
exception when others then perform pg_temp.ok('the sign-in placeholder email still lands (definer path)', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('blank'); r1 text; r2 text; d text; n text;
begin
  update public.buyer_profiles set display_name = 'Old' where id = u;
  r1 := pg_temp.try_as(u, format('update public.buyer_profiles set display_name = %L where id = %L', '   ', u));
  r2 := pg_temp.try_as(u, format('update public.profiles set full_name = %L where id = %L', '  ', u));
  select display_name into d from public.buyer_profiles where id = u;
  select full_name into n from public.profiles where id = u;
  perform pg_temp.ok('names of spaces only are saved as empty', r1 = 'ok' and r2 = 'ok' and d is null and n is null,
    format('%s %s name=%s full=%s', r1, r2, d, n));
end $c$;
rollback to savepoint c;

rollback;
