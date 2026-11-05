-- ─────────────────────────────────────────────────────────────────────────────
-- HARNESS: a requirement past its deadline is neither counted, announced nor alerted (2026-11-05).
-- ToDo "Apply the requirement deadline everywhere leads are counted or announced" (2026-11-01).
-- Each case runs in its own rolled-back subtransaction. Every line prints PASS or FAIL.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/todo-open/deadline.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $dl$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  labels text[] := array[
    'overseas_lead_count: an open overseas lead counts, one past its deadline doesn''t',
    'my_lead_alerts: an alert for a requirement past its deadline isn''t open',
    'lead_digest_run: a requirement past its deadline isn''t caught up',
    'lead_digest_run: an alert for a requirement past its deadline isn''t in the digest',
    'lead_digest_run: (control) an alert for an open requirement is',
    'Leads: a requirement past its deadline is "expired", not overdue; a quoted one too',
    'Leads: staff can filter by expired, the summary counts it and the detail has the deadline'];
  wants text[] := array['1|0', 'true|false', 'skipped', 'digested 0', 'digested 1',
    'expired|false|expired', 'listed|1|deadline'];
  got text; i int; n0 int; n1 int; n2 int;
  out text := '';
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  admn uuid := '33333333-3333-3333-3333-333333333333';
  j jsonb;
begin
  for i in 1..array_length(labels, 1) loop
    begin
      got := null;
      begin
        if i = 1 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          select (public.overseas_lead_count() ->> 'open')::int into n0;
          set local session_replication_role = replica;
          insert into public.rfqs (id, buyer_id, title, status, overseas, expires_at)
            values (r1, buyer, 'DL open', 'active', true, now() + interval '1 day');
          select (public.overseas_lead_count() ->> 'open')::int into n1;
          insert into public.rfqs (id, buyer_id, title, status, overseas, expires_at)
            values (r2, buyer, 'DL expired', 'active', true, now() - interval '1 hour');
          select (public.overseas_lead_count() ->> 'open')::int into n2;
          got := (n1 - n0) || '|' || (n2 - n1);
        elsif i = 2 then
          set local session_replication_role = replica;
          insert into public.rfqs (id, buyer_id, title, status, expires_at) values
            (r1, buyer, 'DL open', 'active', now() + interval '1 day'),
            (r2, buyer, 'DL expired', 'active', now() - interval '1 hour');
          insert into admin.lead_alerts (vendor_id, rfq_id, plan_id, created_at) values (vendor, r1, 'free', now()), (vendor, r2, 'free', now());
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          select public.my_lead_alerts(100) into j;
          select (select (a ->> 'open') from jsonb_array_elements(j -> 'alerts') a where (a ->> 'rfq_id')::uuid = r1)
                 || '|' || (select (a ->> 'open') from jsonb_array_elements(j -> 'alerts') a where (a ->> 'rfq_id')::uuid = r2)
            into got;
        elsif i = 3 then
          set local session_replication_role = replica;
          insert into public.rfqs (id, buyer_id, title, status, expires_at, created_at)
            values (r2, buyer, 'DL expired', 'active', now() - interval '1 minute', now() - interval '1 hour');
          set local session_replication_role = origin;
          perform public.lead_digest_run();
          got := case when exists (select 1 from admin.lead_alert_runs x where x.rfq_id = r2) then 'caught up' else 'skipped' end;
        elsif i in (4, 5) then
          set local session_replication_role = replica;
          insert into public.rfqs (id, buyer_id, title, status, expires_at)
            values (r2, buyer, 'DL lead', 'active', case when i = 4 then now() - interval '1 hour' else now() + interval '1 day' end);
          -- A held alert goes into the next digest on any plan.
          insert into admin.lead_alerts (vendor_id, rfq_id, plan_id, created_at, held) values (vendor, r2, 'free', now(), 'rate_limit');
          update public.feature_flags set enabled = true where key in ('lead_alerts', 'notification_delivery');
          delete from admin.notification_outbox where template_key = 'lead_digest' and profile_id = vendor;
          set local session_replication_role = origin;
          -- Only this vendor's undigested alerts count; anything else waiting is cleared first.
          update admin.lead_alerts set digest_at = now() where digest_at is null and rfq_id <> r2;
          select count(*) into n0 from admin.notification_outbox o where o.template_key = 'lead_digest';
          perform public.lead_digest_run();
          select count(*) into n1 from admin.notification_outbox o where o.template_key = 'lead_digest';
          got := 'digested ' || (n1 - n0);
        elsif i = 6 then
          set local session_replication_role = replica;
          insert into public.rfqs (id, buyer_id, title, status, expires_at, created_at) values
            (r1, buyer, 'DL expired', 'active', now() - interval '1 hour', now() - interval '8 days'),
            (r2, buyer, 'DL expired quoted', 'active', now() - interval '1 hour', now() - interval '8 days');
          insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr, status) values (r2, vendor, 10, 10, 'pending');
          select l.stage || '|' || l.overdue into got from admin.lead_rows l where l.id = r1;
          select got || '|' || l.stage into got from admin.lead_rows l where l.id = r2;
        elsif i = 7 then
          set local session_replication_role = replica;
          insert into public.rfqs (id, buyer_id, title, status, expires_at, created_at)
            values (r1, buyer, 'DL expired', 'active', now() - interval '1 hour', now() - interval '8 days');
          insert into admin.admin_users (id, admin_role, is_active) values (admn, 'super_admin', true)
            on conflict (id) do update set admin_role = 'super_admin', is_active = true;
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          got := case when exists (select 1 from public.admin_leads_list(p_stage => 'expired', p_limit => 500) x where x.id = r1)
                      then 'listed' else 'missing' end;
          select got || '|' || least((public.admin_leads_summary(30) -> 'window' ->> 'expired')::int, 1)
                     || '|' || case when public.admin_lead_detail(r1) ? 'expires_at' then 'deadline' else 'no deadline' end
            into got;
        end if;
      exception when others then
        got := sqlstate || ' ' || sqlerrm;
      end;
      out := out || case when got is not distinct from wants[i] then 'PASS ' else 'FAIL ' end
                 || labels[i] || case when got is distinct from wants[i] then format(' (got %s, want %s)', got, wants[i]) else '' end || E'\n';
      raise exception 'rollback-case';
    exception when others then
      if sqlerrm <> 'rollback-case' then
        out := out || 'FAIL ' || labels[i] || ' (setup: ' || sqlerrm || ')' || E'\n';
      end if;
    end;
  end loop;
  raise notice E'\n%', out;
end
$dl$;
