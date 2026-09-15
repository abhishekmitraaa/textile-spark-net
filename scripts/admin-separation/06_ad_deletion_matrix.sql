-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 06 — advertisement deletion matrix
-- (guard_ad_deletion across the Phase 3c move).
--
-- guard_ad_deletion() refuses a signed-in NON-ADMIN deleting a campaign that has
-- review history, and lets everything else through. In 3c it reads
-- admin.ad_review_log, so it becomes SECURITY DEFINER and its caller bypass moves
-- from `current_user <> 'authenticated'` to
-- `current_setting('role', true) is distinct from 'authenticated'`. This matrix
-- proves the behaviour is unchanged by that move, in both directions (the guard is
-- neither disabled nor over-blocking):
--
--   D1 owning vendor deletes a campaign WITH review history   -> 42501 (guard)
--   D2 owning vendor deletes a campaign with NO review history -> deleted
--   D3 super_admin deletes a reviewed campaign                -> deleted
--   D4 service_role deletes a reviewed campaign               -> deleted
--   D5 postgres (no role set) deletes a reviewed campaign     -> deleted
-- Each deletion runs in its own rolled-back subtransaction. For every deletion
-- that goes through, the campaign's review-log rows are re-counted afterwards to
-- show the ON DELETE CASCADE into the log still fires (across schemas after 3c).
-- The guard's source table and security mode are printed, so a 42501 can be told
-- apart from a "permission denied for schema admin" error by its message.
--
-- Expected output, identical before and after 3c apart from the `guard:` line:
--   D1 42501 This campaign has already been reviewed… | D2 DELETED | D3 DELETED log_rows_after=0 |
--   D4 DELETED log_rows_after=0 | D5 DELETED log_rows_after=0
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p06$
declare
  sa uuid := '33333333-3333-3333-3333-333333333333';
  t_log regclass := coalesce(to_regclass('admin.ad_review_log'), to_regclass('public.ad_review_log'));
  v_rev uuid; v_rev_owner uuid; v_norev uuid; v_norev_owner uuid;
  cases text[] := array['D1 owner deletes reviewed', 'D2 owner deletes never-reviewed', 'D3 super_admin deletes reviewed', 'D4 service_role deletes reviewed', 'D5 postgres deletes reviewed'];
  i int; n int; k bigint; target uuid; out text;
begin
  execute format('select a.id, a.vendor_id from public.advertisements a
                   where exists (select 1 from %s l where l.ad_id = a.id)
                     and not exists (select 1 from admin.admin_users u where u.id = a.vendor_id and u.is_active)
                   order by a.id limit 1', t_log) into v_rev, v_rev_owner;
  execute format('select a.id, a.vendor_id from public.advertisements a
                   where not exists (select 1 from %s l where l.ad_id = a.id)
                     and not exists (select 1 from admin.admin_users u where u.id = a.vendor_id and u.is_active)
                   order by a.id limit 1', t_log) into v_norev, v_norev_owner;
  if v_rev is null or v_norev is null then
    raise exception 'P06 fixture missing: reviewed=% never_reviewed=%', v_rev, v_norev;
  end if;

  out := 'guard: ' || (select case when prosecdef then 'SECURITY DEFINER' else 'INVOKER' end
                              || ' reads ' || coalesce(substring(prosrc from '(admin|public)\.ad_review_log'), '?') || '.ad_review_log'
                         from pg_proc where oid = 'public.guard_ad_deletion()'::regprocedure)
      || ' | log table=' || t_log::text
      || ' | reviewed=' || left(v_rev::text, 8) || ' (owner ' || left(v_rev_owner::text, 8) || ')'
      || ' never-reviewed=' || left(v_norev::text, 8) || ' (owner ' || left(v_norev_owner::text, 8) || ')' || E'\n';

  for i in 1..5 loop
    begin
      target := case when i = 2 then v_norev else v_rev end;
      if i in (1, 2) then
        perform set_config('request.jwt.claims', json_build_object('sub', case when i = 1 then v_rev_owner else v_norev_owner end, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', (case when i = 1 then v_rev_owner else v_norev_owner end)::text, true);
        set local role authenticated;
      elsif i = 3 then
        perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', sa::text, true);
        set local role authenticated;
      elsif i = 4 then
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
      end if;
      delete from public.advertisements where id = target;
      get diagnostics n = row_count;
      reset role;
      execute format('select count(*) from %s where ad_id = %L', t_log, target) into k;
      raise exception using errcode = 'P0099', message = 'DELETED rows=' || n || case when i <> 2 then ' log_rows_after=' || k else '' end;
    exception
      when sqlstate 'P0099' then out := out || cases[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || cases[i] || ': ' || sqlstate || ' ' || left(sqlerrm, 70) || E'\n';
    end;
  end loop;

  raise exception 'P06 DELETION MATRIX (rolled back) %', E'\n' || out;
end
$p06$
