-- Help & Support P6 check (2026-10-01): the confirmed-fraud record, the sweep (auto-close,
-- missed callback windows, what's due for deletion, the purge) and the receipt lookups.
--
-- One DO block, run as postgres (Supabase SQL editor, or MCP execute_sql). It changes rows
-- only inside its own transaction and ends with RAISE EXCEPTION, so nothing is kept. To
-- rehearse, paste 20261001140000_support_sweep_receipts_fraud_records.sql above it in the
-- same call.
--
-- 2026-10-01: the MCP tool refused to run the purge section (W8-W9) because it deletes
-- support rows, even inside a rolled-back transaction. Every other section ran there (in
-- four parts, 25/25). Run the whole block once in the SQL editor before the apply.
--
-- Fixtures, all rolled back and written directly (rollout isn't touched): requests from
-- demo-buyer (1111…), one with no requester (a deleted account), a fraud report about
-- demo-vendor (2222…) decided by demo-admin (3333…, super_admin).

do $t$
declare
  buyer   constant uuid := '11111111-1111-1111-1111-111111111111';
  vendor  constant uuid := '22222222-2222-2222-2222-222222222222';
  admin_u constant uuid := '33333333-3333-3333-3333-333333333333';
  results text[] := '{}';
  fails   int := 0;
  j       jsonb;
  r       record;
  v_fraud uuid; v_fraud_no text; v_live uuid; v_live_no text;
  v_old uuid; v_recent uuid; v_cb uuid; v_gone uuid; v_open_fraud uuid;
  v_fb uuid; v_fb_no text; v_chat_no text;
  v_n int; v_i int;
begin
  -- ── W1-W3 the confirmed-fraud record ─────────────────────────────────────
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status)
  values (buyer, 'buyer', 'fraud_report', 'trust_fraud', 'zz-p6 fraud report', 'new') returning id, ticket_no into v_live, v_live_no;
  insert into public.support_ticket_staff (ticket_id) values (v_live);
  insert into public.support_fraud_details (ticket_id, reported_name, reported_entity_type, reported_entity_id, amount_inr, incident_date)
  values (v_live, 'zz-p6 Seller', 'vendor', vendor, 5000, current_date - 3);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform public.admin_fraud_set_outcome(v_live, 'suspended', 'zz-p6 Took a 5,000 advance for 200 shirts and stopped replying.');
  execute 'reset role';
  select * into r from admin.fraud_findings where ticket_id = v_live;
  if r.subject_profile_id = vendor and r.subject_kind = 'vendor' and r.outcome = 'suspended'
     and r.what_happened like 'zz-p6 Took a 5,000 advance%' and r.amount_inr = 5000 and r.withdrawn_at is null
     and r.subject_name is not null and r.account_status is not null and r.decided_by = admin_u then
    results := results || format('W1 ok (subject %s, account %s)', r.subject_name, r.account_status);
  else fails := fails + 1; results := results || format('W1 FAIL %s', to_jsonb(r)); end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform public.admin_fraud_set_outcome(v_live, 'no_action', 'zz-p6 Second look: a delivery delay.');
  execute 'reset role';
  if (select withdrawn_at is not null from admin.fraud_findings where ticket_id = v_live) then results := results || 'W2a ok'::text;
  else fails := fails + 1; results := results || 'W2a FAIL not withdrawn'::text; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform public.admin_fraud_set_outcome(v_live, 'warned', 'zz-p6 Third look: warned.');
  select count(*) into v_n from public.admin_fraud_findings(50) f
   where f.ticket_no = v_live_no and f.outcome = 'warned' and f.withdrawn_at is null and f.what_happened = 'zz-p6 Third look: warned.';
  if v_n = 1 then results := results || 'W2b+W3a ok'::text;
  else fails := fails + 1; results := results || ('W2b+W3a FAIL ' || v_n); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_fraud_findings(10);
    fails := fails + 1; results := results || 'W3b FAIL a non-admin read the records'::text;
  exception when insufficient_privilege then results := results || 'W3b ok'::text;
  end;
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.admin_fraud_findings(10);
    fails := fails + 1; results := results || 'W3c FAIL anon'::text;
  exception when insufficient_privilege then results := results || 'W3c ok'::text;
  end;
  execute 'reset role';

  -- ── W4-W7 the sweep run ──────────────────────────────────────────────────
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status, resolved_at)
  values (buyer, 'buyer', 'chat', 'other', 'zz-p6 resolved 8 days ago', 'resolved', now() - interval '8 days') returning id into v_old;
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status, resolved_at)
  values (buyer, 'buyer', 'chat', 'other', 'zz-p6 resolved 2 days ago', 'resolved', now() - interval '2 days') returning id into v_recent;
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status)
  values (buyer, 'buyer', 'callback', 'other', 'zz-p6 callback yesterday', 'new') returning id into v_cb;
  insert into public.support_callbacks (ticket_id, phone, preferred_date, window_start, window_end)
  values (v_cb, '+919876543210', current_date - 1, '10:00', '11:00');
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status)
  values (null, 'buyer', 'chat', 'other', 'zz-p6 a deleted account''s chat', 'open') returning id into v_gone;
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status, created_at, resolved_at)
  values (buyer, 'buyer', 'fraud_report', 'trust_fraud', 'zz-p6 fraud report from last year', 'resolved', now() - interval '13 months', now() - interval '12 months')
  returning id, ticket_no into v_fraud, v_fraud_no;
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status, created_at)
  values (buyer, 'buyer', 'fraud_report', 'trust_fraud', 'zz-p6 a fraud report still in review', 'new', now() - interval '13 months') returning id into v_open_fraud;
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status)
  values (buyer, 'buyer', 'feedback', 'feedback_bug', 'zz-p6 feedback', 'new') returning id, ticket_no into v_fb, v_fb_no;
  insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status)
  values (buyer, 'buyer', 'chat', 'other', 'zz-p6 chat', 'open') returning ticket_no into v_chat_no;
  insert into public.support_ticket_staff (ticket_id) values (v_old), (v_recent), (v_cb), (v_gone), (v_fraud), (v_open_fraud), (v_fb);
  insert into public.support_messages (ticket_id, author_kind, visibility, kind, body)
  values (v_gone, 'requester', 'public', 'text', 'zz-p6 something personal'), (v_fraud, 'requester', 'public', 'text', 'zz-p6 what happened');
  insert into admin.fraud_findings (ticket_id, ticket_no, outcome, decided_at) values (v_fraud, v_fraud_no, 'warned', now() - interval '12 months');

  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  j := public.support_sweep_run(50);
  execute 'reset role';
  if (j ->> 'closed')::int >= 1 and (select status from public.support_tickets where id = v_old) = 'closed'
     and exists (select 1 from public.support_events where ticket_id = v_old and event = 'auto_closed' and actor_kind = 'system')
     and exists (select 1 from public.support_messages where ticket_id = v_old and event = 'closed' and visibility = 'public')
     and exists (select 1 from public.notifications where profile_id = buyer and kind = 'support_status' and title = 'Request closed' and created_at >= now() - interval '1 minute') then
    results := results || 'W4 ok'::text;
  else fails := fails + 1; results := results || ('W4 FAIL ' || j::text); end if;
  if (select status from public.support_tickets where id = v_recent) = 'resolved' then results := results || 'W5 ok'::text;
  else fails := fails + 1; results := results || 'W5 FAIL closed too early'::text; end if;
  if (j ->> 'callbacks_flagged')::int >= 1
     and exists (select 1 from public.support_messages where ticket_id = v_cb and event = 'callback_window_missed' and visibility = 'internal') then
    results := results || 'W6 ok'::text;
  else fails := fails + 1; results := results || 'W6 FAIL'::text; end if;
  select count(*) into v_n from jsonb_array_elements(j -> 'purge') e where (e ->> 'ticket_id')::uuid in (v_fraud, v_gone);
  if v_n = 2 and not exists (select 1 from jsonb_array_elements(j -> 'purge') e
                              where (e ->> 'ticket_id')::uuid in (v_open_fraud, v_recent, v_old, v_cb, v_fb, v_live)) then
    results := results || 'W7 ok'::text;
  else fails := fails + 1; results := results || ('W7 FAIL ' || (j -> 'purge')::text); end if;
  execute 'set local role service_role';
  j := public.support_sweep_run(50);
  execute 'reset role';
  if (select count(*) from public.support_events where ticket_id = v_cb and event = 'callback_window_missed') = 1
     and (j ->> 'closed')::int = 0 then
    results := results || 'W6b ok (a second run changes nothing)'::text;
  else fails := fails + 1; results := results || ('W6b FAIL ' || j::text); end if;

  -- ── W8-W9 the purge (run this section in the SQL editor: the MCP tool refuses it) ──
  execute 'set local role service_role';
  v_n := public.support_sweep_purge(array[v_fraud, v_gone, v_fb]);
  execute 'reset role';
  if v_n = 2
     and not exists (select 1 from public.support_tickets where id in (v_fraud, v_gone))
     and not exists (select 1 from public.support_messages where ticket_id in (v_fraud, v_gone))
     and exists (select 1 from public.support_tickets where id = v_fb)
     and (select count(*) from admin.support_purge_log where ticket_no = v_fraud_no and reason = 'fraud_report_one_year') = 1
     and exists (select 1 from admin.fraud_findings where ticket_no = v_fraud_no and ticket_id is null and report_purged_at is not null) then
    results := results || 'W8+W9 ok'::text;
  else fails := fails + 1; results := results || ('W8+W9 FAIL purged ' || v_n); end if;

  -- ── W10 receipt lookups ──────────────────────────────────────────────────
  execute 'set local role service_role';
  j := public.support_receipt_target(v_fb_no, buyer);
  if j ->> 'status' = 'ok' and j ->> 'email' is not null then results := results || 'W10a ok'::text;
  else fails := fails + 1; results := results || ('W10a ' || j::text); end if;
  if (public.support_receipt_target(v_fb_no, vendor) ->> 'status') = 'not_found' then results := results || 'W10b ok'::text;
  else fails := fails + 1; results := results || 'W10b FAIL another user'::text; end if;
  if (public.support_receipt_target(v_chat_no, buyer) ->> 'status') = 'not_found' then results := results || 'W10c ok'::text;
  else fails := fails + 1; results := results || 'W10c FAIL a chat got a receipt'::text; end if;
  for v_i in 1..3 loop perform public.support_receipt_record(v_fb, false, 'zz-p6 provider said no'); end loop;
  if (public.support_receipt_target(v_fb_no, buyer) ->> 'status') = 'send_failed' then results := results || 'W10e ok'::text;
  else fails := fails + 1; results := results || 'W10e FAIL'::text; end if;
  perform public.support_receipt_record(v_fb, true, null);
  if (public.support_receipt_target(v_fb_no, buyer) ->> 'status') = 'already_sent' then results := results || 'W10d ok'::text;
  else fails := fails + 1; results := results || 'W10d FAIL resend allowed'::text; end if;
  execute 'reset role';

  -- ── W11 nobody else can run the sweep or the receipt functions ───────────
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  begin
    perform public.support_sweep_run(1);
    fails := fails + 1; results := results || 'W11a FAIL'::text;
  exception when insufficient_privilege then results := results || 'W11a ok'::text;
  end;
  begin
    perform public.support_receipt_target(v_fb_no, buyer);
    fails := fails + 1; results := results || 'W11b FAIL'::text;
  exception when insufficient_privilege then results := results || 'W11b ok'::text;
  end;
  begin
    perform public.support_sweep_purge(array[v_fb]);
    fails := fails + 1; results := results || 'W11c FAIL'::text;
  exception when insufficient_privilege then results := results || 'W11c ok'::text;
  end;
  execute 'reset role';

  raise exception 'SUPPORT P6 CHECK: % failed. %', fails, array_to_string(results, ' | ');
end
$t$;
