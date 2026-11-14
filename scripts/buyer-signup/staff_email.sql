-- ─────────────────────────────────────────────────────────────────────────────
-- STAFF SEE WHETHER AN EMAIL IS VERIFIED (buyer sign-up audit 2026-11-13, item 14b; plan task A6).
-- Prints PASS/FAIL; one transaction, ROLLED BACK.
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/buyer-signup/staff_email.sql 2>&1 | grep -E "PASS|FAIL"
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

create function pg_temp.new_user(tag text, email text, confirmed boolean) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data, is_sso_user, is_anonymous,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, coalesce(email, tag || '-' || left(u::text, 8) || '@harness.test'), case when confirmed then now() end,
          'authenticated', 'authenticated', jsonb_build_object('full_name', 'Harness ' || tag, 'active_role', 'buyer'),
          false, false, now(), now(), '', '', '', '');
  return u;
end $$;

create function pg_temp.as_user(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

savepoint c;
do $c$
declare
  staff uuid := pg_temp.new_user('staff', null, true);
  mod uuid := pg_temp.new_user('mod', null, true);
  typed uuid := pg_temp.new_user('typed', 'p919900000001@phone.cosora.invalid', false);
  google uuid := pg_temp.new_user('google', 'asha.google@example.com', true);
  placeholder uuid := pg_temp.new_user('ph', 'p919900000002@phone.cosora.invalid', false);
  r record; v_typed boolean; v_google boolean; v_ph boolean; st text; t text; rq jsonb; tid uuid;
begin
  insert into admin.admin_users (id, admin_role) values (staff, 'support'), (mod, 'product_moderator');
  -- The buyer typed an address on Account Info that no one has confirmed.
  update public.profiles set email = 'asha.typed@example.com' where id = typed;
  perform pg_temp.as_user(staff);
  set local role authenticated;
  for r in select * from public.admin_email_verified(array[typed, google, placeholder]) loop
    if r.id = typed then v_typed := r.email_verified; end if;
    if r.id = google then v_google := r.email_verified; end if;
    if r.id = placeholder then v_ph := r.email_verified; end if;
  end loop;
  reset role;
  perform pg_temp.ok('a typed email no one confirmed is not verified', v_typed is false, coalesce(v_typed::text, 'null'));
  perform pg_temp.ok('a confirmed Google email is verified', v_google is true, coalesce(v_google::text, 'null'));
  perform pg_temp.ok('a sign-in placeholder has no email to verify (null)', v_ph is null, coalesce(v_ph::text, 'null'));

  perform pg_temp.as_user(mod);
  set local role authenticated;
  begin
    perform * from public.admin_email_verified(array[typed]);
    st := 'no error';
  exception when others then st := sqlstate;
  end;
  reset role;
  perform pg_temp.ok('a product moderator is refused (42501)', st = '42501', st);
  perform pg_temp.ok('anon cannot execute admin_email_verified',
    not has_function_privilege('anon', 'public.admin_email_verified(uuid[])', 'EXECUTE'));

  -- The requester on a support request carries the same answer, and has_store follows the real-seller rule.
  insert into public.vendor_profiles (id, brand_name) values (typed, 'Ticked Seller Once');
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject)
  values (typed, 'buyer', 'feedback', (select code from public.support_categories limit 1), 'Harness')
  returning ticket_no into t;
  perform pg_temp.as_user(staff);
  set local role authenticated;
  rq := public.admin_support_get(t) -> 'requester';
  reset role;
  perform pg_temp.ok('admin_support_get: requester.email_verified false for a typed email',
    rq ? 'email_verified' and (rq ->> 'email_verified')::boolean is false, coalesce(rq::text, 'null'));
  perform pg_temp.ok('admin_support_get: a bare seller row is not a store', (rq ->> 'has_store')::boolean is false,
    coalesce(rq ->> 'has_store', 'null'));
exception when others then perform pg_temp.ok('staff email harness', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

rollback;
