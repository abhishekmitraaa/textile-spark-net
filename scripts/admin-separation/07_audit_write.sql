-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 07 — the audit log still writes.
--
-- Drives approve_ad_campaign() on a pending_review campaign, in rolled-back
-- subtransactions:
--   A1 buyer (demo-buyer) approves            -> 42501, no log row
--   A2 the campaign's own vendor approves     -> 42501, no log row
--   A3 super_admin (demo-admin) approves      -> allowed; exactly one new log row
--      (decision=approved, reviewer = the admin, previous_status=pending_review)
-- Log rows are counted in whichever schema holds ad_review_log (admin after 3c),
-- as postgres, so the count does not depend on the caller's access.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p07$
declare
  sa uuid := '33333333-3333-3333-3333-333333333333';
  bu uuid := '11111111-1111-1111-1111-111111111111';
  t_log regclass := coalesce(to_regclass('admin.ad_review_log'), to_regclass('public.ad_review_log'));
  v_ad uuid; v_owner uuid; before bigint; after bigint; latest text; landed text; i int; who uuid;
  cases text[] := array['A1 buyer approves', 'A2 owning vendor approves', 'A3 super_admin approves'];
  out text;
begin
  select a.id, a.vendor_id into v_ad, v_owner from public.advertisements a where a.status = 'pending_review' order by a.id limit 1;
  if v_ad is null then raise exception 'P07 fixture missing: no pending_review campaign'; end if;
  execute format('select count(*) from %s where ad_id = %L', t_log, v_ad) into before;
  out := 'log table=' || t_log::text || ' campaign=' || left(v_ad::text, 8) || ' (owner ' || left(v_owner::text, 8) || ') log_rows_before=' || before || E'\n';

  for i in 1..3 loop
    begin
      who := case i when 1 then bu when 2 then v_owner else sa end;
      perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', who::text, true);
      set local role authenticated;
      execute format('select public.approve_ad_campaign(%L, %L)', v_ad, 'p07 harness');
      reset role;
      execute format('select count(*) from %s where ad_id = %L', t_log, v_ad) into after;
      execute format('select decision || '' reviewer_is_admin='' || (reviewer_id = %L)::text || '' '' || coalesce(previous_status, ''-'') || ''->'' || coalesce(new_status, ''-'')
                        from %s where ad_id = %L order by created_at desc, id desc limit 1', sa, t_log, v_ad) into latest;
      select c.relnamespace::regnamespace::text || '.' || c.relname into landed from pg_class c where c.oid = t_log;
      raise exception using errcode = 'P0099', message = 'ALLOWED log_rows_after=' || after || ' (+' || (after - before) || ') latest: ' || coalesce(latest, 'none') || ' in ' || landed;
    exception
      when sqlstate 'P0099' then out := out || cases[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || cases[i] || ': ' || sqlstate || ' ' || left(sqlerrm, 70) || E'\n';
    end;
  end loop;

  raise exception 'P07 AUDIT WRITE (rolled back) %', E'\n' || out;
end
$p07$
