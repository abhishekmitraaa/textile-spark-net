-- Seller Home fixes, Task 9: the live-update hub (SH-030, SH-031, SH-036).
--   hub_policy_own_topic_only   a signed-in account reads its own topic's events, never another account's
--   mark_all_read_one_event     marking 50 notifications read in one statement sends that account one event
--   message_reaches_both        one message sends one chat event to each person in the chat
--   switch_off_sends_nothing    an account the switch doesn't allow gets no events
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
begin
  select c.id, c.user_a, c.user_b into conv, a, b
    from public.conversations c where c.user_a <> c.user_b order by c.created_at desc limit 1;
  if conv is null then raise exception 'setup: no conversation to test with'; end if;
  update public.feature_flags set allow_profile_ids = allow_profile_ids || array[a, b] where key = 'live_updates_hub';
  if not found then raise exception 'setup: switch live_updates_hub is missing'; end if;

  -- message_reaches_both
  select count(*) into n_a from realtime.messages where topic = 'user:' || a and event = 'chat';
  select count(*) into n_b from realtime.messages where topic = 'user:' || b and event = 'chat';
  insert into public.messages (conversation_id, sender_id, kind, body) values (conv, b, 'text', 'hub check');
  if (select count(*) from realtime.messages where topic = 'user:' || a and event = 'chat') - n_a <> 1
     or (select count(*) from realtime.messages where topic = 'user:' || b and event = 'chat') - n_b <> 1 then
    raise exception 'message_reaches_both: a got %, b got %',
      (select count(*) from realtime.messages where topic = 'user:' || a and event = 'chat') - n_a,
      (select count(*) from realtime.messages where topic = 'user:' || b and event = 'chat') - n_b;
  end if;

  -- mark_all_read_one_event
  insert into public.notifications (profile_id, kind, title, body)
  select a, 'system', 'Hub check ' || g, null from generate_series(1, 50) g;
  select count(*) into n_a from realtime.messages where topic = 'user:' || a and event = 'notifications';
  update public.notifications set read = true where profile_id = a and not read;
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
  if (select count(*) from realtime.messages where topic = 'user:' || a) <> n_a then
    raise exception 'switch_off_sends_nothing: an event was sent with the switch off';
  end if;

  raise notice 'hub: 4 checks passed';
end;
$$;

rollback;
