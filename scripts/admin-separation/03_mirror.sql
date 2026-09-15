-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 03 — profiles → admin.admin_users mirror.
--
-- As super_admin (authenticated, the panel's own profiles UPDATEs), each case in
-- its own rolled-back subtransaction: promote, role change, demote, and a
-- support admin's self-escalation. Valid from Phase 2b until the write path
-- moves off profiles (Phase 5).
--
-- Baseline (2026-09-15, after Phase 2b):
-- B4.1 promote (is_admin=true, admin_role=support) rows=1 -> admin_users row: role=support is_active=true | public.is_admin() for demo-buyer=true admin_role()=support
-- B4.2 role change support->ads_moderator rows=1 -> admin_users row: role=ads_moderator is_active=true | public.is_admin()=true admin_role()=ads_moderator | ad_moderator() as demo-buyer=true
-- B4.3 demote (is_admin=false, admin_role=null) rows=1 -> admin_users row: role=support is_active=false | public.is_admin()=false admin_role()=null
-- B4.4 support self-escalates to super_admin -> 42501 Only a super_admin may change admin status or admin roles
-- after all rollbacks: admin_users row for demo-buyer=NONE, profiles.is_admin=false, admin_users rows=3
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $b4$
declare
  sa uuid := '33333333-3333-3333-3333-333333333333';
  bu uuid := '11111111-1111-1111-1111-111111111111';
  n int; out text := ''; r record;
begin
  -- B4.1 promote demo-buyer to support
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', sa::text, true);
    set local role authenticated;
    update public.profiles set is_admin = true, admin_role = 'support' where id = bu;
    get diagnostics n = row_count;
    reset role;
    select * into r from admin.admin_users where id = bu;
    perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', bu::text, true);
    out := out || 'B4.1 promote (is_admin=true, admin_role=support) rows=' || n
               || ' -> admin_users row: ' || coalesce('role=' || r.admin_role || ' is_active=' || r.is_active, 'NONE')
               || ' | public.is_admin() for demo-buyer=' || public.is_admin() || ' admin_role()=' || coalesce(public.admin_role()::text, 'null') || E'\n';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
    when others then out := out || 'B4.1 -> ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;
  -- B4.2 promote then change role to ads_moderator
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', sa::text, true);
    set local role authenticated;
    update public.profiles set is_admin = true, admin_role = 'support' where id = bu;
    update public.profiles set admin_role = 'ads_moderator' where id = bu;
    get diagnostics n = row_count;
    reset role;
    select * into r from admin.admin_users where id = bu;
    perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', bu::text, true);
    out := out || 'B4.2 role change support->ads_moderator rows=' || n
               || ' -> admin_users row: ' || coalesce('role=' || r.admin_role || ' is_active=' || r.is_active, 'NONE')
               || ' | public.is_admin()=' || public.is_admin() || ' admin_role()=' || coalesce(public.admin_role()::text, 'null')
               || ' | ad_moderator() as demo-buyer=' || public.ad_moderator() || E'\n';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
    when others then out := out || 'B4.2 -> ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;
  -- B4.3 promote then demote (the panel demote: is_admin=false, admin_role=null)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', sa::text, true);
    set local role authenticated;
    update public.profiles set is_admin = true, admin_role = 'support' where id = bu;
    update public.profiles set is_admin = false, admin_role = null where id = bu;
    get diagnostics n = row_count;
    reset role;
    select * into r from admin.admin_users where id = bu;
    perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', bu::text, true);
    out := out || 'B4.3 demote (is_admin=false, admin_role=null) rows=' || n
               || ' -> admin_users row: ' || coalesce('role=' || r.admin_role || ' is_active=' || r.is_active, 'NONE')
               || ' | public.is_admin()=' || public.is_admin() || ' admin_role()=' || coalesce(public.admin_role()::text, 'null') || E'\n';
    raise exception using errcode = 'P0099';
  exception when sqlstate 'P0099' then null;
    when others then out := out || 'B4.3 -> ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;
  -- B4.4 non-super_admin cannot promote (guard still refuses, nothing mirrored)
  begin
    update public.profiles set is_admin = true, admin_role = 'support' where id = bu;  -- postgres: make demo-buyer a support admin
    perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', bu::text, true);
    set local role authenticated;
    update public.profiles set admin_role = 'super_admin' where id = bu;
    raise exception using errcode = 'P0099', message = 'ALLOWED';
  exception when sqlstate 'P0099' then out := out || 'B4.4 support self-escalates to super_admin -> ALLOWED' || E'\n';
    when others then out := out || 'B4.4 support self-escalates to super_admin -> ' || sqlstate || ' ' || sqlerrm || E'\n';
  end;
  select * into r from admin.admin_users where id = bu;
  out := out || 'after all rollbacks: admin_users row for demo-buyer=' || coalesce('role=' || r.admin_role, 'NONE') || ', profiles.is_admin=' || (select is_admin from public.profiles where id = bu) || ', admin_users rows=' || (select count(*) from admin.admin_users);
  raise exception 'B4 (rolled back)%', E'\n' || out;
end
$b4$
