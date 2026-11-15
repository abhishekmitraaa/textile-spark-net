-- Seller Home fixes, Task 9: the live-update hub (SH-030, SH-031, SH-036).
--   hub_policy_own_topic_only   a signed-in account reads its own topic's events, never another account's
--   mark_all_read_one_event     marking 50 notifications read in one statement sends that account one event
--   message_reaches_both        one message sends one chat event to each person in the chat
--   switch_off_sends_nothing    an account the switch doesn't allow gets no events
--   fanout_one_subtransaction   100 notices written one statement at a time (a lead alert fan-out) cost the
--                               transaction at most one subtransaction and send 100 events at commit
-- Runs in one transaction and rolls back.
--
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < scripts/seller-home/hub.sql

begin;

do $$
declare
  conv uuid;
  a uuid;
  b uuid;
  n_a int;
  n_b int;
  seen int;
  fan uuid;
  subx int;
  subx_before int;
  overflowed boolean;
begin
  select c.id, c.user_a, c.user_b into conv, a, b
    from public.conversations c where c.user_a <> c.user_b order by c.created_at desc limit 1;
  if conv is null then raise exception 'setup: no conversation to test with'; end if;
  update public.feature_flags set allow_profile_ids = allow_profile_ids || array[a, b] where key = 'live_updates_hub';
  if not found then raise exception 'setup: switch live_updates_hub is missing'; end if;
  -- Events go out at commit. A check sends what is queued so far by switching to immediate (which runs the deferred
  -- senders, as commit would) and back.

  -- message_reaches_both
  select count(*) into n_a from realtime.messages where topic = 'user:' || a and event = 'chat';
  select count(*) into n_b from realtime.messages where topic = 'user:' || b and event = 'chat';
  insert into public.messages (conversation_id, sender_id, kind, body) values (conv, b, 'text', 'hub check');
  execute 'set constraints all immediate'; execute 'set constraints all deferred';  -- what commit does
  if (select count(*) from realtime.messages where topic = 'user:' || a and event = 'chat') - n_a <> 1
     or (select count(*) from realtime.messages where topic = 'user:' || b and event = 'chat') - n_b <> 1 then
    raise exception 'message_reaches_both: a got %, b got %',
      (select count(*) from realtime.messages where topic = 'user:' || a and event = 'chat') - n_a,
      (select count(*) from realtime.messages where topic = 'user:' || b and event = 'chat') - n_b;
  end if;

  -- mark_all_read_one_event
  insert into public.notifications (profile_id, kind, title, body)
  select a, 'system', 'Hub check ' || g, null from generate_series(1, 50) g;
  execute 'set constraints all immediate'; execute 'set constraints all deferred';  -- what commit does
  select count(*) into n_a from realtime.messages where topic = 'user:' || a and event = 'notifications';
  update public.notifications set read = true where profile_id = a and not read;
  execute 'set constraints all immediate'; execute 'set constraints all deferred';  -- what commit does
  if (select count(*) from realtime.messages where topic = 'user:' || a and event = 'notifications') - n_a <> 1 then
    raise exception 'mark_all_read_one_event: % events for one statement',
      (select count(*) from realtime.messages where topic = 'user:' || a and event = 'notifications') - n_a;
  end if;

  -- hub_policy_own_topic_only (as account a, through the policy)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_config('realtime.topic', 'user:' || b::text, true);
  select count(*) into seen from realtime.messages;
  if seen <> 0 then raise exception 'hub_policy_own_topic_only: a read % of b''s events', seen; end if;
  perform set_config('realtime.topic', 'user:' || a::text, true);
  select count(*) into seen from realtime.messages;
  if seen = 0 then raise exception 'hub_policy_own_topic_only: a can''t read its own events'; end if;
  if exists (select 1 from realtime.messages where topic <> 'user:' || a::text) then
    raise exception 'hub_policy_own_topic_only: a reads another topic';
  end if;
  execute 'reset role';
  perform set_config('realtime.topic', '', true);

  -- switch_off_sends_nothing
  update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, a) where key = 'live_updates_hub';
  select count(*) into n_a from realtime.messages where topic = 'user:' || a;
  insert into public.notifications (profile_id, kind, title) values (a, 'system', 'Hub check, switch off');
  execute 'set constraints all immediate'; execute 'set constraints all deferred';  -- what commit does
  if (select count(*) from realtime.messages where topic = 'user:' || a) <> n_a then
    raise exception 'switch_off_sends_nothing: an event was sent with the switch off';
  end if;

  -- fanout_one_subtransaction: admin.lead_alert_fanout() calls notify() once per matched seller. Past 64
  -- subtransactions in one transaction Postgres overflows its subxid cache and every snapshot pays for it.
  update public.feature_flags set allow_profile_ids = allow_profile_ids || array(
    select p.id from public.profiles p order by p.id limit 100) where key = 'live_updates_hub';
  select count(*) into n_a from realtime.messages where event = 'notifications';
  perform pg_stat_clear_snapshot();
  select s.subxact_count into subx_before
    from pg_stat_get_backend_idset() b(id), lateral pg_stat_get_backend_subxact(b.id) s
   where pg_stat_get_backend_pid(b.id) = pg_backend_pid();
  execute 'set constraints all deferred';  -- as in a real transaction: send at commit
  for fan in select p.id from public.profiles p order by p.id limit 100 loop
    perform public.notify(fan, 'lead_match', 'Hub fan-out check', null);
  end loop;
  execute 'set constraints all immediate';  -- what commit does: run the deferred senders now
  perform pg_stat_clear_snapshot();
  select s.subxact_count, s.subxact_overflowed into subx, overflowed
    from pg_stat_get_backend_idset() b(id), lateral pg_stat_get_backend_subxact(b.id) s
   where pg_stat_get_backend_pid(b.id) = pg_backend_pid();
  if overflowed or subx - subx_before > 1 then
    raise exception 'fanout_one_subtransaction: % subtransactions (overflowed %) for one fan-out', subx - subx_before, overflowed;
  end if;
  if (select count(*) from realtime.messages where event = 'notifications') - n_a <> 100 then
    raise exception 'fanout_one_subtransaction: % events for 100 people',
      (select count(*) from realtime.messages where event = 'notifications') - n_a;
  end if;

  raise notice 'hub: 5 checks passed';
end;
$$;

rollback;
