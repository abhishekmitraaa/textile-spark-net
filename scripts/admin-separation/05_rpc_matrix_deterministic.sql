-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 05 — deterministic RPC matrix (Phase 3c+).
--
-- RPC-ONLY: every check goes through admin_flag_list / admin_flag_add /
-- admin_ad_review_log_list, never a table. So the same file runs identically
-- before and after admin_flags / ad_review_log move schemas. Fixture rows are
-- inserted into whichever schema holds the table (to_regclass, admin first).
--
-- DETERMINISTIC: the three seeded flags have fixed ids and fixed created_at, so
-- the row hashes are stable run to run (harness 04 used now(), so its hashes
-- differed per run and could not be compared across the move).
--
-- Personas: super_admin (demo-admin); support and ads_moderator (demo-buyer
-- promoted in-transaction by writing admin.admin_users); the vendor owning `ad`;
-- another non-admin vendor; buyer (demo-buyer); anon.
-- Checks:
--   c1 admin_flag_list('ad', ad)            c4 admin_flag_add('video', …) -> CHECK
--   c2 admin_flag_list(null, null, 25)      c5 admin_ad_review_log_list(ad)   (owner's ad)
--   c3 admin_flag_add('ad', ad, …) + listed c6 admin_ad_review_log_list(ad2)  (someone else's)
-- Result per cell: rows:md5 (reads), OK author_is_self=… listed=… (add), or ERR <sqlstate>.
--
-- EXPECTED across the Phase 3c move: identical output except ONE cell —
-- [owner-vendor] c5 goes from rows to ERR 42501 (Q-4: decision history is admin-only).
-- Assumes admin_flags holds no rows other than these fixtures (true at 3c: 0 rows).
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p05$
declare
  sa  uuid := '33333333-3333-3333-3333-333333333333';
  bu  uuid := '11111111-1111-1111-1111-111111111111';
  t_flags regclass := coalesce(to_regclass('admin.admin_flags'), to_regclass('public.admin_flags'));
  t_log   regclass := coalesce(to_regclass('admin.ad_review_log'), to_regclass('public.ad_review_log'));
  v_ad uuid; v_owner uuid; v_ad2 uuid; v_ad2_owner uuid; v_other uuid;
  personas text[] := array['super_admin', 'support(in-txn)', 'ads_moderator(in-txn)', 'owner-vendor', 'other-vendor', 'buyer', 'anon'];
  q text[];
  flag_cols text := 'id::text||''|''||entity_type||''|''||entity_id::text||''|''||note||''|''||author_id::text||''|''||created_at::text||''|''||coalesce(author_full_name,'''')||''|''||coalesce(author_email,'''')';
  log_cols  text := 'id::text||''|''||ad_id::text||''|''||coalesce(reviewer_id::text,'''')||''|''||decision||''|''||coalesce(reason_code,'''')||''|''||coalesce(note,'''')||''|''||coalesce(previous_status,'''')||''|''||coalesce(new_status,'''')||''|''||created_at::text';
  p text; who uuid; i int; r text; t text; n bigint; out text := '';
begin
  execute format('select l.ad_id, a.vendor_id from %s l join public.advertisements a on a.id = l.ad_id
                   group by l.ad_id, a.vendor_id order by count(*) desc, l.ad_id limit 1', t_log) into v_ad, v_owner;
  execute format('select l.ad_id, a.vendor_id from %s l join public.advertisements a on a.id = l.ad_id
                   where a.vendor_id is distinct from %L group by l.ad_id, a.vendor_id order by count(*) desc, l.ad_id limit 1', t_log, v_owner) into v_ad2, v_ad2_owner;
  select vp.id into v_other from public.vendor_profiles vp
   where vp.id <> v_owner and vp.id <> bu and vp.id is distinct from v_ad2_owner
     and not exists (select 1 from admin.admin_users u where u.id = vp.id and u.is_active)
   order by vp.id limit 1;
  if v_ad is null or v_ad2 is null or v_other is null then
    raise exception 'P05 fixture missing: ad=% ad2=% other_vendor=%', v_ad, v_ad2, v_other;
  end if;

  execute format('insert into %s (id, entity_type, entity_id, note, author_id, created_at) values
    (''00000000-0000-4000-8000-0000000f0001'', ''ad'',     %L, ''p05 fixture flag 1'', %L, ''2026-01-01 00:00:01+00''),
    (''00000000-0000-4000-8000-0000000f0002'', ''ad'',     %L, ''p05 fixture flag 2'', %L, ''2026-01-01 00:00:02+00''),
    (''00000000-0000-4000-8000-0000000f0003'', ''vendor'', %L, ''p05 fixture flag 3'', %L, ''2026-01-01 00:00:03+00'')',
    t_flags, v_ad, sa, v_ad, sa, v_owner, sa);

  q := array[
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_flag_list(''ad'', %L)', flag_cols, v_ad),
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_flag_list(null, null, 25)', flag_cols),
    null, null,
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_ad_review_log_list(%L)', log_cols, v_ad),
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_ad_review_log_list(%L)', log_cols, v_ad2)
  ];

  out := 'fixtures: ad=' || left(v_ad::text, 8) || ' owner=' || left(v_owner::text, 8) || ' ad2=' || left(v_ad2::text, 8)
      || ' ad2_owner=' || left(v_ad2_owner::text, 8) || ' other-vendor=' || left(v_other::text, 8) || E'\n';

  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 1..6 loop
      begin
        if p = 'support(in-txn)' then
          insert into admin.admin_users (id, admin_role, is_active) values (bu, 'support', true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        elsif p = 'ads_moderator(in-txn)' then
          insert into admin.admin_users (id, admin_role, is_active) values (bu, 'ads_moderator', true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        end if;
        who := case p when 'super_admin' then sa when 'owner-vendor' then v_owner
                      when 'other-vendor' then v_other when 'anon' then null else bu end;
        if who is null then
          perform set_config('request.jwt.claims', '', true);
          perform set_config('request.jwt.claim.sub', '', true);
          set local role anon;
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', who::text, true);
          set local role authenticated;
        end if;

        if i = 3 then
          execute format('select x.id::text||''|''||(x.author_id is not distinct from auth.uid())::text from public.admin_flag_add(''ad'', %L, ''p05 harness add'') x', v_ad) into t;
          execute format('select count(*) from public.admin_flag_list(''ad'', %L) where id = %L', v_ad, split_part(t, '|', 1)) into n;
          r := 'OK author_is_self=' || split_part(t, '|', 2) || ' listed=' || n;
        elsif i = 4 then
          execute format('select x.id::text from public.admin_flag_add(''video'', %L, ''p05 bad type'') x', v_ad) into t;
          r := 'OK';
        else
          execute q[i] into r;
        end if;
        raise exception using errcode = 'P0099', message = r;
      exception
        when sqlstate 'P0099' then out := out || ' | c' || i || '=' || sqlerrm;
        when others then out := out || ' | c' || i || '=ERR ' || sqlstate;
      end;
    end loop;
    out := out || E'\n';
  end loop;

  raise exception 'P05 RPC MATRIX (rolled back) tables: flags=% log=% %', t_flags, t_log, E'\n' || out;
end
$p05$
