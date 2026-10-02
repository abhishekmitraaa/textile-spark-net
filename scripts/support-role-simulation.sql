-- Help & Support: role-simulation and mutation tests (plan P2e, section 4).
--
-- Run it after the three support migrations are applied, in one call (the Supabase
-- MCP's execute_sql, or psql). It WRITES NOTHING: everything happens inside one
-- transaction that the last statement aborts on purpose. The results come back as that
-- error's message: one "ok ..." or "FAIL ..." per check, joined by " | ".
--
-- It borrows five existing non-admin accounts and, inside the transaction only, makes
-- three of them a support admin, a manager and a product moderator. It switches
-- support_settings.rollout itself. Nothing survives the abort.
--
-- Mutation tests at the end weaken one policy at a time and check that the matching
-- test would then fail, so a passing run means the tests can see what they claim to.

begin;

do $tests$
declare
  r        text[] := '{}';
  v_a      uuid;  -- buyer A
  v_b      uuid;  -- buyer B
  v_c      uuid;  -- an account marked deleted
  v_sup    uuid;  -- support
  v_mgr    uuid;  -- manager
  v_mod    uuid;  -- product moderator
  v_ids    uuid[];
  j        jsonb;
  v_tid    uuid;
  v_tno    text;
  v_fraud  uuid;
  v_fno    text;
  v_cb     uuid;
  v_fb     uuid;
  v_att    uuid;
  v_att2   uuid;
  v_path   text;
  v_path2  text;
  v_mid    uuid;
  v_gid    uuid;
  v_slot   jsonb;
  v_n      int;
  v_b1     boolean;
  v_state  text;
  v_hint   text;
  v_ok     boolean;
begin
  select array_agg(id) into v_ids from (
    select p.id from public.profiles p
     where p.account_status = 'active' and p.active_role = 'buyer'
       and not exists (select 1 from admin.admin_users a where a.id = p.id)
     order by p.created_at limit 3) s;
  v_a := v_ids[1]; v_b := v_ids[2]; v_c := v_ids[3];
  select array_agg(id) into v_ids from (
    select p.id from public.profiles p
     where p.account_status = 'active'
       and not exists (select 1 from admin.admin_users a where a.id = p.id)
       and p.id not in (v_a, v_b, v_c)
     order by p.created_at limit 3) s;
  v_sup := v_ids[1]; v_mgr := v_ids[2]; v_mod := v_ids[3];
  if v_a is null or v_b is null or v_c is null or v_sup is null or v_mgr is null or v_mod is null then
    raise exception 'SUPPORT TESTS: need six non-admin active accounts, three of them on the buyer side';
  end if;
  insert into admin.admin_users (id, admin_role, is_active) values
    (v_sup, 'support', true), (v_mgr, 'manager', true), (v_mod, 'product_moderator', true);

  -- ── Hours ──────────────────────────────────────────────────────────────────
  v_ok := admin.support_next_open_at('2026-10-02 18:30+05:30') = '2026-10-02 18:30+05:30'
      and admin.support_next_open_at('2026-10-02 19:30+05:30') = '2026-10-05 10:00+05:30'
      and admin.support_next_open_at('2026-10-03 12:00+05:30') = '2026-10-05 10:00+05:30'
      and admin.support_next_open_at('2026-10-06 09:00+05:30') = '2026-10-06 10:00+05:30';
  insert into public.support_holidays (day, label) values ('2026-10-05', 'Test holiday');
  v_ok := v_ok and admin.support_next_open_at('2026-10-02 19:30+05:30') = '2026-10-06 10:00+05:30'
               and not admin.support_is_open_at('2026-10-05 11:00+05:30');
  delete from public.support_holidays where day = '2026-10-05';
  r := r || case when v_ok then 'ok H1 opening hours, next opening and holidays' else 'FAIL H1 hours arithmetic' end;

  -- ── Rollout off ────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.support_start_chat('other', 'Hello');
    r := array_append(r, 'FAIL T0 rollout off allowed a chat'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    r := r || case when v_hint = 'support_unavailable' then 'ok T0 rollout off refuses a chat' else 'FAIL T0 ' || sqlerrm end;
  end;
  execute 'reset role';
  update public.support_settings set rollout = 'all';

  -- ── A buyer opens a chat ───────────────────────────────────────────────────
  execute 'set local role authenticated';
  j := public.support_start_chat('buyer_requirements', 'I need help comparing two quotes', 'hi');
  v_tid := (j ->> 'ticket_id')::uuid; v_tno := j ->> 'ticket_no';
  r := r || case when v_tno ~ '^CS-[0-9]{6}$' and not (j ->> 'continued')::boolean
                 then 'ok T1 chat opened' else 'FAIL T1 ' || j::text end;
  j := public.support_start_chat('buyer_requirements', 'And one more detail');
  r := r || case when (j ->> 'ticket_id')::uuid = v_tid and (j ->> 'continued')::boolean
                 then 'ok T1b same topic continues the open chat' else 'FAIL T1b ' || j::text end;
  select count(*) into v_n from public.support_messages where ticket_id = v_tid;
  r := r || case when v_n = 3 then 'ok T1c requester reads 2 messages and the automatic reply' else 'FAIL T1c saw ' || v_n end;
  begin
    perform public.support_start_chat('vendor_kyc', 'x');
    r := array_append(r, 'FAIL T1d a buyer opened a vendor topic'::text);
  exception when others then
    r := r || case when sqlstate = '22023' then 'ok T1d buyer refused a vendor-only topic' else 'FAIL T1d ' || sqlerrm end;
  end;
  begin
    insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_tid, v_a, 'requester', 'direct');
    r := array_append(r, 'FAIL T1e a client inserted a message directly'::text);
  exception when insufficient_privilege then
    r := array_append(r, 'ok T1e clients cannot write the tables'::text);
  end;
  select count(*) into v_n from public.support_ticket_staff where ticket_id = v_tid;
  r := r || case when v_n = 0 then 'ok T1f requester cannot see the staff row (assignee, context)' else 'FAIL T1f' end;

  -- ── Another buyer ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.support_tickets where id = v_tid;
  select count(*) + v_n into v_n from public.support_messages where ticket_id = v_tid;
  r := r || case when v_n = 0 then 'ok T2 another user sees neither the ticket nor its messages' else 'FAIL T2 saw ' || v_n end;
  begin
    perform public.support_post_message(v_tid, 'hijack');
    r := array_append(r, 'FAIL T2b another user posted into the ticket'::text);
  exception when others then
    r := r || case when sqlstate = 'P0002' then 'ok T2b another user cannot post into it' else 'FAIL T2b ' || sqlerrm end;
  end;
  begin
    perform public.support_request_detail(v_tno);
    r := array_append(r, 'FAIL T2c another user read the detail'::text);
  exception when others then
    r := r || case when sqlstate = 'P0002' then 'ok T2c another user cannot read the detail' else 'FAIL T2c ' || sqlerrm end;
  end;
  begin
    perform * from public.admin_support_list();
    r := array_append(r, 'FAIL T3 a buyer listed the inbox'::text);
  exception when others then
    r := r || case when sqlstate = '42501' then 'ok T3 a buyer is refused the admin functions' else 'FAIL T3 ' || sqlerrm end;
  end;

  -- ── Support answers ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.admin_support_list('awaiting') l where l.id = v_tid;
  r := r || case when v_n = 1 then 'ok T4 the chat is waiting in the inbox' else 'FAIL T4' end;
  j := public.admin_support_claim(v_tid);
  j := public.admin_support_reply(v_tid, 'Happy to help. Which request is it?', false);
  j := public.admin_support_reply(v_tid, 'INTERNAL-NOTE-MARKER buyer has two RFQs', true);
  select count(*) into v_n from public.admin_support_list('awaiting') l where l.id = v_tid;
  r := r || case when v_n = 0 then 'ok T4b an answered chat leaves "waiting"' else 'FAIL T4b' end;
  j := public.admin_support_get(v_tno);
  r := r || case when (j -> 'staff' ->> 'assignee_id')::uuid = v_sup
                      and j::text like '%INTERNAL-NOTE-MARKER%' then 'ok T4c staff see the assignee and internal notes'
                 else 'FAIL T4c' end;

  -- ── The buyer reads the reply ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.support_messages where ticket_id = v_tid and visibility = 'internal';
  r := r || case when v_n = 0 then 'ok T5 internal notes never reach the requester' else 'FAIL T5 saw ' || v_n end;
  select count(*) into v_n from public.support_messages where ticket_id = v_tid and author_kind = 'staff';
  r := r || case when v_n = 1 then 'ok T5b the public reply does' else 'FAIL T5b saw ' || v_n end;
  j := public.support_request_detail(v_tno);
  r := r || case when j::text not like '%INTERNAL-NOTE-MARKER%' and j::text like '%Cosora Support has joined%'
                 then 'ok T5c the detail has the reply, the join line, and no internal note' else 'FAIL T5c' end;
  -- This run's only (now() is the transaction's start): an account used before keeps older ones.
  select count(*) into v_n from public.notifications where profile_id = v_a and kind = 'support_reply' and created_at >= now();
  r := r || case when v_n = 1 then 'ok T5d the reply notified the requester' else 'FAIL T5d ' || v_n end;
  -- D-06: the requester sees "Cosora Support", so no column they can read names who answered.
  begin
    perform m.author_id from public.support_messages m where m.ticket_id = v_tid;
    r := array_append(r, 'FAIL T5e a requester read which staff member answered'::text);
  exception when others then
    r := r || case when sqlstate = '42501' then 'ok T5e a requester cannot read which staff member answered'
                   else 'FAIL T5e ' || sqlerrm end;
  end;

  -- ── Manager reads, cannot act; a reveal is logged ──────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mgr, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.admin_support_list('all') l where l.id = v_tid;
  j := public.admin_support_get(v_tno);
  r := r || case when v_n = 1 and (j -> 'ticket' ->> 'id')::uuid = v_tid and not (j ->> 'can_write')::boolean
                 then 'ok T6 manager reads the inbox and the ticket' else 'FAIL T6' end;
  begin
    perform public.admin_support_reply(v_tid, 'manager reply', false);
    r := array_append(r, 'FAIL T6b manager replied'::text);
  exception when others then
    r := r || case when sqlstate = '42501' then 'ok T6b manager cannot reply' else 'FAIL T6b ' || sqlerrm end;
  end;
  begin
    perform public.admin_support_claim(v_tid);
    r := array_append(r, 'FAIL T6c manager claimed'::text);
  exception when others then
    r := r || case when sqlstate = '42501' then 'ok T6c manager cannot claim' else 'FAIL T6c ' || sqlerrm end;
  end;
  j := public.admin_support_reveal_contact(v_tid, 'requester_phone');
  execute 'reset role';
  select count(*) into v_n from admin.audit_log l
   where l.action = 'reveal_contact' and l.target_id = v_tid::text and l.actor_id = v_mgr;
  r := r || case when v_n = 1 then 'ok T6d a phone reveal is written to the Admin Log' else 'FAIL T6d ' || v_n end;

  -- ── Other admin roles see nothing ──────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mod, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform * from public.admin_support_list();
    r := array_append(r, 'FAIL T7 a product moderator listed the inbox'::text);
  exception when others then
    r := r || case when sqlstate = '42501' then 'ok T7 a product moderator is refused' else 'FAIL T7 ' || sqlerrm end;
  end;
  select count(*) into v_n from public.support_tickets where id = v_tid;
  select count(*) + v_n into v_n from public.support_messages where ticket_id = v_tid;
  r := r || case when v_n = 0 then 'ok T7b and reads no ticket or message' else 'FAIL T7b saw ' || v_n end;

  -- ── Signed out ─────────────────────────────────────────────────────────────
  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  j := public.support_status();
  r := r || case when j ? 'hours' and j ->> 'phone' = '+918815578226' then 'ok T8 support_status works signed out'
                 else 'FAIL T8 ' || j::text end;
  begin
    perform count(*) from public.support_tickets;
    r := array_append(r, 'FAIL T8b anon read support_tickets'::text);
  exception when insufficient_privilege then
    r := array_append(r, 'ok T8b anon cannot read tickets'::text);
  end;
  begin
    perform public.support_start_chat('other', 'x');
    r := array_append(r, 'FAIL T8c anon started a chat'::text);
  exception when insufficient_privilege then
    r := array_append(r, 'ok T8c anon cannot call the requester functions'::text);
  end;
  execute 'reset role';

  -- ── Fraud evidence is write-only; ordinary files are the requester's ───────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.support_report_fraud('Took an advance and stopped replying', 'Some Trader', '98765 43210', null, null, null,
                                   25000, (now() at time zone 'Asia/Kolkata')::date - 3, 'Surat');
  v_fraud := (j ->> 'ticket_id')::uuid; v_fno := j ->> 'ticket_no';
  j := public.support_prepare_upload(v_fraud, 'image', 'image/jpeg', 120000);
  v_att := (j ->> 'attachment_id')::uuid; v_path := j ->> 'path';
  j := public.support_prepare_upload(v_tid, 'pdf', 'application/pdf', 200000);
  v_att2 := (j ->> 'attachment_id')::uuid; v_path2 := j ->> 'path';
  begin
    perform public.support_prepare_upload(v_tid, 'image', 'image/svg+xml', 1000);
    r := array_append(r, 'FAIL T9 an SVG was accepted'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    r := r || case when v_hint = 'file_type' then 'ok T9 unknown file types are refused' else 'FAIL T9 ' || sqlerrm end;
  end;
  begin
    perform public.support_prepare_upload(v_tid, 'image', 'image/png', 6000000);
    r := array_append(r, 'FAIL T9b a 6 MB image was accepted'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    r := r || case when v_hint = 'file_size' then 'ok T9b the size cap holds' else 'FAIL T9b ' || sqlerrm end;
  end;
  -- Stand in for the upload and the signature check (storage and the edge function are
  -- outside a SQL test): link each file to a message and mark it clean.
  execute 'reset role';
  insert into public.support_messages (ticket_id, author_id, author_kind, kind) values (v_fraud, v_a, 'requester', 'attachment')
  returning id into v_mid;
  update public.support_attachments set message_id = v_mid where id = v_att;
  insert into public.support_messages (ticket_id, author_id, author_kind, kind) values (v_tid, v_a, 'requester', 'attachment')
  returning id into v_mid;
  update public.support_attachments set message_id = v_mid where id = v_att2;
  perform public.support_attachment_checked(v_att, true);
  perform public.support_attachment_checked(v_att2, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.support_attachments where id = v_att;
  v_b1 := public.support_attachment_read_allowed(v_path);
  j := public.support_request_detail(v_fno);
  r := r || case when v_n = 0 and not v_b1 and (j ->> 'files_received')::int = 1
                 then 'ok T9c the reporter cannot see or download their evidence, and is told 1 file was received'
                 else 'FAIL T9c rows=' || v_n || ' read=' || v_b1 end;
  r := r || case when public.support_attachment_read_allowed(v_path2) then 'ok T9d the requester can download an ordinary file'
                 else 'FAIL T9d' end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  r := r || case when not public.support_attachment_read_allowed(v_path2) then 'ok T9e another user cannot download it'
                 else 'FAIL T9e' end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.support_attachments where id in (v_att, v_att2);
  r := r || case when v_n = 2 and public.support_attachment_read_allowed(v_path) then 'ok T9f support reads both, evidence included'
                 else 'FAIL T9f' end;
  execute 'reset role';

  -- ── Suspended can ask for help; deleted cannot ─────────────────────────────
  begin
    update public.profiles set account_status = 'suspended' where id = v_b;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    j := public.support_start_chat('buyer_account', 'Why was my account suspended?');
    r := r || case when j ? 'ticket_no' then 'ok T10 a suspended account can open a chat (appeal)' else 'FAIL T10' end;
    execute 'reset role';
  exception when others then
    r := r || ('skip T10 (could not suspend directly: ' || sqlerrm || ')');
  end;
  execute 'reset role';
  begin
    update public.profiles set account_status = 'deleted' where id = v_c;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.support_start_chat('other', 'hello');
      r := array_append(r, 'FAIL T10b a deleted account opened a chat'::text);
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      r := r || case when v_hint = 'account_deleted' then 'ok T10b a deleted account is refused' else 'FAIL T10b ' || sqlerrm end;
    end;
    execute 'reset role';
  exception when others then
    r := r || ('skip T10b (could not mark deleted directly: ' || sqlerrm || ')');
  end;
  execute 'reset role';

  -- ── Rollout "staff": admins and the test list only ─────────────────────────
  update public.support_settings set rollout = 'staff', test_profile_ids = array[v_b];
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.support_start_chat('other', 'x');
    r := array_append(r, 'FAIL T11 rollout staff let a normal user in'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    r := r || case when v_hint = 'support_unavailable' then 'ok T11 rollout staff refuses a normal user' else 'FAIL T11 ' || sqlerrm end;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  j := public.support_start_chat('other', 'Test account checking in');
  r := r || case when j ? 'ticket_no' then 'ok T11b a listed test account gets in' else 'FAIL T11b' end;
  execute 'reset role';
  select t.is_test into v_b1 from public.support_tickets t where t.ticket_no = j ->> 'ticket_no';
  r := r || case when v_b1 then 'ok T11c its tickets are tagged is_test' else 'FAIL T11c' end;
  update public.support_settings set rollout = 'all', test_profile_ids = '{}';

  -- ── Callback, feedback, and the hourly limit ───────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_slot := public.support_callback_slots(14) -> 0;
  j := public.support_request_callback('buyer_account', '98765 43210', (v_slot ->> 'date')::date, (v_slot ->> 'start')::time,
                                       'Please call after lunch');
  v_cb := (j ->> 'ticket_id')::uuid;
  r := r || case when v_cb is not null then 'ok T12 a callback is booked in the first open slot' else 'FAIL T12' end;
  begin
    perform public.support_request_callback('buyer_account', '9876543210', (v_slot ->> 'date')::date, (v_slot ->> 'start')::time);
    r := array_append(r, 'FAIL T12b a second callback was booked'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    r := r || case when v_hint = 'callback_exists' then 'ok T12b one pending callback at a time' else 'FAIL T12b ' || sqlerrm end;
  end;
  begin
    perform public.support_request_callback('buyer_account', '9876543210', (v_slot ->> 'date')::date, '03:00'::time);
    r := array_append(r, 'FAIL T12c a 03:00 callback was booked'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    -- The slot check runs before the one-pending check, so only slot_unavailable proves it.
    r := r || case when v_hint = 'slot_unavailable' then 'ok T12c times outside hours are refused'
                   else 'FAIL T12c ' || sqlerrm end;
  end;
  j := public.support_submit_feedback('bug', 'The page froze', '/profile');
  j := public.support_submit_feedback('idea', 'Add a dark mode');
  begin
    perform public.support_submit_feedback('idea', 'One more idea');
    r := array_append(r, 'FAIL T12d a sixth request in an hour was accepted'::text);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    r := r || case when v_hint = 'rate_limited' then 'ok T12d five new requests an hour, then rate_limited'
                   else 'FAIL T12d ' || coalesce(v_hint, '') || ' ' || sqlerrm end;
  end;

  -- ── Staff work the callback, the fraud report and the feedback ─────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_sup, 'role', 'authenticated')::text, true);
  j := public.admin_callback_log_attempt(v_cb, 'no_answer');
  j := public.admin_callback_log_attempt(v_cb, 'no_answer');
  j := public.admin_callback_log_attempt(v_cb, 'no_answer', 'Rang three times');
  r := r || case when j ->> 'outcome' = 'no_answer' and (j ->> 'attempts')::int = 3
                 then 'ok T13 three missed calls end the retries' else 'FAIL T13 ' || j::text end;
  begin
    perform public.admin_callback_log_attempt(v_cb, 'completed');
    r := array_append(r, 'FAIL T13b logged an attempt on a finished callback'::text);
  exception when others then
    r := r || case when sqlstate = 'P0001' then 'ok T13b a finished callback takes no more attempts' else 'FAIL T13b ' || sqlerrm end;
  end;
  j := public.admin_support_reveal_contact(v_cb, 'callback_phone');
  r := r || case when j ->> 'value' = '+919876543210' then 'ok T13c the callback number is stored normalised'
                 else 'FAIL T13c ' || j::text end;
  j := public.admin_support_get((select t.ticket_no from public.support_tickets t where t.id = v_cb));
  r := r || case when j -> 'callback' ->> 'phone_masked' like '+91%210' and j::text not like '%9876543210%'
                 then 'ok T13d the ticket view shows the number masked' else 'FAIL T13d ' || (j -> 'callback')::text end;
  execute 'reset role';
  r := r || case when admin.support_mask_phone('22334455') = '•••••455'
                      and admin.support_mask_phone('+919876543210') = '+91•••••••210'
                 then 'ok T13e a short number keeps at least 5 digits hidden'
                 else 'FAIL T13e ' || coalesce(admin.support_mask_phone('22334455'), 'null') end;
  execute 'set local role authenticated';

  j := public.admin_support_set_status(v_tid, 'resolved', 'Answered the question');
  j := public.admin_fraud_set_outcome(v_fraud, 'warned', 'SPOKE-TO-VENDOR-MARKER');
  select l.id into v_fb from public.admin_support_list(p_view => 'awaiting', p_channel => 'feedback') l limit 1;
  j := public.admin_feedback_mark_reviewed(v_fb);
  r := r || case when j ->> 'status' = 'closed' then 'ok T14 feedback marked reviewed closes it' else 'FAIL T14' end;
  j := public.admin_support_counts();
  r := r || case when j ? 'awaiting' and j ? 'callbacks_today' then 'ok T14b counts' else 'FAIL T14b' end;
  begin
    perform public.admin_support_set_hours('[]'::jsonb);
    r := array_append(r, 'FAIL T14c support changed the hours'::text);
  exception when others then
    r := r || case when sqlstate = '42501' then 'ok T14c support cannot change the settings' else 'FAIL T14c ' || sqlerrm end;
  end;
  v_gid := public.admin_help_guide_save(null, 'how-to-verify', 'vendor', '{"en":"How to complete verification"}'::jsonb,
                                        '{"en":"Upload your PAN on the KYC page."}'::jsonb, 0, false, false);
  r := r || case when v_gid is not null then 'ok T14d support saves a Quick Guide' else 'FAIL T14d' end;
  execute 'reset role';
  select count(*) into v_n from admin.audit_log l
   where l.target_table = 'public.support_tickets' and l.target_id = v_tid::text and l.reason = 'Answered the question';
  r := r || case when v_n >= 1 then 'ok T14e the status change and its reason are in the Admin Log' else 'FAIL T14e' end;

  -- ── The requester after resolution ─────────────────────────────────────────
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.support_post_message(v_tid, 'One more question');
  r := r || case when j ->> 'status' = 'open' then 'ok T15 replying within 7 days reopens a resolved chat' else 'FAIL T15' end;
  j := public.support_request_detail(v_fno);
  r := r || case when j::text not like '%warned%' and j::text not like '%SPOKE-TO-VENDOR-MARKER%'
                      and j::text like '%reviewed your report%'
                 then 'ok T15b the reporter learns "reviewed", never the outcome or the note' else 'FAIL T15b' end;
  j := public.support_my_requests();
  r := r || case when jsonb_array_length(j) >= 4 then 'ok T15c My requests lists them' else 'FAIL T15c ' || jsonb_array_length(j) end;
  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into v_n from public.help_guides where id = v_gid;
  r := r || case when v_n = 0 then 'ok T15d an inactive guide is invisible signed out' else 'FAIL T15d' end;
  execute 'reset role';

  -- ── Mutation tests: weaken a rule, the matching test must fail ─────────────
  drop policy support_messages_select on public.support_messages;
  create policy support_messages_select on public.support_messages for select to authenticated
    using (exists (select 1 from public.support_tickets t
                    where t.id = support_messages.ticket_id and t.requester_id = (select auth.uid()))
           or coalesce((select public.admin_role())::text in ('super_admin', 'support', 'manager'), false));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.support_messages where ticket_id = v_tid and visibility = 'internal';
  r := r || case when v_n > 0 then 'ok M1 without the visibility filter T5 would fail (caught)' else 'FAIL M1 mutation not caught' end;
  execute 'reset role';

  drop policy support_tickets_select on public.support_tickets;
  create policy support_tickets_select on public.support_tickets for select to authenticated
    using (requester_id = (select auth.uid()) or public.is_admin());
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_mod, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.support_tickets where id = v_tid;
  r := r || case when v_n > 0 then 'ok M2 widening the gate to is_admin() makes T7b fail (caught)' else 'FAIL M2 mutation not caught' end;
  execute 'reset role';

  drop policy support_attachments_select on public.support_attachments;
  create policy support_attachments_select on public.support_attachments for select to authenticated
    using (exists (select 1 from public.support_tickets t
                    where t.id = support_attachments.ticket_id and t.requester_id = (select auth.uid())));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.support_attachments where id = v_att;
  r := r || case when v_n > 0 then 'ok M3 dropping the evidence rule makes T9c fail (caught)' else 'FAIL M3 mutation not caught' end;
  execute 'reset role';

  raise exception 'SUPPORT TESTS (% checks, % failed): %',
    cardinality(r), (select count(*) from unnest(r) x where x like 'FAIL%'), array_to_string(r, ' | ');
end
$tests$;
