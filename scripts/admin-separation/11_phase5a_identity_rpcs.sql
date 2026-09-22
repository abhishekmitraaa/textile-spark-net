-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 11 — Phase 5a identity RPCs.
--
-- 6 personas × 16 checks over admin_whoami, admin_list_admins,
-- admin_search_candidates, admin_set_role, admin_grant, admin_revoke and
-- admin_status_of. Each cell runs in its own subtransaction and compares against
-- an explicit expectation:
--   super_admin        demo-admin (33333333-…), a real super_admin
--   support, vendor_ops  demo-buyer promoted in-transaction
--   user               demo-buyer, not an admin
--   anon               no JWT
--   service_role       claims role=service_role, as the edge functions call
-- The grant check also asserts created_by is the caller (null for service_role).
-- The target of the grant/role/revoke checks is demo-vendor (22222222-…), a non-admin.
-- Phase 5c (2026-09-22) dropped profiles.is_admin/admin_role, so the shadow-write
-- assertions this harness carried at 5a are gone with them: admin.admin_users is the
-- only state left to check, and personas are promoted by writing it directly.
-- c9–c12 first reduce the active super_admins to demo-admin alone, to exercise
-- the last-super_admin guard.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits. The
-- result is the text of the final exception. Expected: failed=0.
-- ─────────────────────────────────────────────────────────────────────────────
do $p11$
declare
  sa  uuid := '33333333-3333-3333-3333-333333333333';
  bu  uuid := '11111111-1111-1111-1111-111111111111';
  tg  uuid := '22222222-2222-2222-2222-222222222222';
  missing uuid := '5a000000-0000-0000-0000-0000000000ff';
  sa2 uuid;
  n_demo int;
  personas text[] := array['super_admin', 'support(in-txn)', 'vendor_ops(in-txn)', 'user', 'anon', 'service_role'];
  checks text[] := array[
    'c1 whoami', 'c2 list_admins', 'c3 search demo', 'c4 search <3 chars',
    'c5 grant target support', 'c6 set_role target', 'c7 revoke target', 'c8 revoke other super (3 active)',
    'c9 revoke sole super', 'c10 downgrade sole super', 'c11 grant-downgrade sole super', 'c12 grant sole super as super',
    'c13 status_of super', 'c14 status_of target', 'c15 grant missing user', 'c16 set_role non-admin'];
  q text[];
  p text; who uuid; i int; r text; expected text; out text := ''; failed int := 0;
  role_of_p text; is_sa boolean; is_svc boolean; is_adm boolean;
begin
  select id into sa2 from admin.admin_users where admin_role = 'super_admin' and is_active and id <> sa order by id limit 1;
  if sa2 is null or not exists (select 1 from admin.admin_users where id = sa and admin_role = 'super_admin' and is_active)
     or exists (select 1 from admin.admin_users where id in (bu, tg) and is_active) then
    raise exception 'P11 fixture precondition failed (need demo-admin + one more active super_admin; demo-buyer/vendor non-admin)';
  end if;
  select least(count(*), 10) into n_demo from public.profiles p
   where p.email ilike '%demo%' and not exists (select 1 from admin.admin_users au where au.id = p.id and au.is_active);

  -- Each query returns one text. The grant check appends created_by (read back as postgres, see below).
  q := array[
    'select coalesce(string_agg(row(id = auth.uid(), is_admin, role)::text, '';''), ''0 rows'') from public.admin_whoami()',
    'select ''rows='' || count(*) from public.admin_list_admins()',
    'select ''rows='' || count(*) from public.admin_search_candidates(''demo'')',
    'select ''rows='' || count(*) from public.admin_search_candidates(''de'')',
    format('select row(admin_role, is_active)::text from public.admin_grant(%L, ''support'')', tg),
    format('select row(admin_role, is_active)::text from public.admin_set_role(%L, ''ads_moderator'')', tg),
    format('select row(admin_role, is_active)::text from public.admin_revoke(%L)', tg),
    format('select row(admin_role, is_active)::text from public.admin_revoke(%L)', sa2),
    format('select row(admin_role, is_active)::text from public.admin_revoke(%L)', sa),
    format('select row(admin_role, is_active)::text from public.admin_set_role(%L, ''support'')', sa),
    format('select row(admin_role, is_active)::text from public.admin_grant(%L, ''support'')', sa),
    format('select row(admin_role, is_active)::text from public.admin_grant(%L, ''super_admin'')', sa),
    format('select row(is_admin, admin_role)::text from public.admin_status_of(%L)', sa),
    format('select row(is_admin, admin_role)::text from public.admin_status_of(%L)', tg),
    format('select row(admin_role, is_active)::text from public.admin_grant(%L, ''support'')', missing),
    format('select row(admin_role, is_active)::text from public.admin_set_role(%L, ''support'')', tg)
  ];

  foreach p in array personas loop
    out := out || '[' || p || ']';
    role_of_p := split_part(p, '(', 1);
    is_sa  := p = 'super_admin';
    is_svc := p = 'service_role';
    is_adm := p like '%(in-txn)' or is_sa;
    who := case when p in ('anon', 'service_role') then null when is_sa then sa else bu end;

    for i in 1..array_length(checks, 1) loop
      expected := case i
        when 1 then case when is_sa then '(t,t,super_admin)'
                         when is_adm then format('(t,t,%s)', role_of_p)
                         when p = 'user' then '(t,f,)'
                         else 'ERR 42501' end
        when 2 then case when is_sa then 'rows=3' when is_adm then 'rows=4' else 'ERR 42501' end
        when 3 then case when is_sa then 'rows=' || n_demo else 'ERR 42501' end
        when 4 then case when is_sa then 'rows=0' else 'ERR 42501' end
        when 5 then case when is_sa then '(support,t)|cb=' || sa
                         when is_svc then '(support,t)|cb=null' else 'ERR 42501' end
        when 6 then case when is_sa or is_svc then '(ads_moderator,t)' else 'ERR 42501' end
        when 7 then case when is_sa or is_svc then '(support,f)' else 'ERR 42501' end
        when 8 then case when is_sa or is_svc then '(super_admin,f)' else 'ERR 42501' end
        when 9 then 'ERR 42501'
        when 10 then 'ERR 42501'
        when 11 then 'ERR 42501'
        when 12 then case when is_sa or is_svc then '(super_admin,t)' else 'ERR 42501' end
        when 13 then case when is_svc then '(t,super_admin)' else 'ERR 42501' end
        when 14 then case when is_svc then '(f,)' else 'ERR 42501' end
        when 15 then case when is_sa or is_svc then 'ERR P0002' else 'ERR 42501' end
        when 16 then case when is_sa or is_svc then 'ERR P0002' else 'ERR 42501' end
      end;

      begin
        -- Setup, as postgres.
        if p like '%(in-txn)' then
          insert into admin.admin_users (id, admin_role, is_active) values (bu, role_of_p::public.admin_role_type, true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        end if;
        if i in (6, 7) then  -- target is an active support admin
          insert into admin.admin_users (id, admin_role, is_active) values (tg, 'support', true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        end if;
        if i between 9 and 12 then  -- demo-admin becomes the only active super_admin
          update admin.admin_users set is_active = false where admin_role = 'super_admin' and id <> sa;
        end if;

        -- Become the persona.
        if p = 'anon' then
          perform set_config('request.jwt.claims', '', true);
          perform set_config('request.jwt.claim.sub', '', true);
          perform set_config('request.jwt.claim.role', '', true);
          set local role anon;
        elsif is_svc then
          perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
          perform set_config('request.jwt.claim.sub', '', true);
          perform set_config('request.jwt.claim.role', '', true);
          set local role service_role;
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', who::text, true);
          perform set_config('request.jwt.claim.role', '', true);
          set local role authenticated;
        end if;

        begin
          execute q[i] into r;
          -- Read created_by back as postgres INSIDE this block: the P0097 below
          -- rolls the write back, so afterwards there is nothing left to see.
          reset role;
          if i = 5 then
            r := r || '|cb=' || coalesce((select created_by::text from admin.admin_users where id = tg), 'null');
          end if;
          raise exception using errcode = 'P0097', message = coalesce(r, '(null)');
        exception
          when sqlstate 'P0097' then r := sqlerrm;
          when others then r := 'ERR ' || sqlstate;
        end;
        reset role;

        if r is distinct from expected then
          failed := failed + 1;
          out := out || E'\n  FAIL ' || rpad(checks[i], 34) || ' expected=' || expected || ' got=' || r;
        end if;
        raise exception using errcode = 'P0099';
      exception
        when sqlstate 'P0099' then null;
        when others then
          out := out || E'\n  ' || checks[i] || ': HARNESS ERROR ' || sqlstate || ' ' || sqlerrm;
          failed := failed + 1;
      end;
    end loop;
    out := out || ' ' || array_length(checks, 1) || ' checks' || E'\n';
  end loop;

  raise exception 'P11 PHASE 5a IDENTITY RPCs (rolled back) failed=% of % (n_demo=%)%',
    failed, array_length(personas, 1) * array_length(checks, 1), n_demo, E'\n' || out;
end
$p11$;
