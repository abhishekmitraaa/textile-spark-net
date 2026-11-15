-- Live-update hub (seller home fixes, Task 9; SH-030, SH-031, SH-036).
--
-- Before: every signed-in tab opened a notifications subscription and two conversations subscriptions (postgres
-- changes), tore them down and reopened them on every page change, and Realtime checked each change against every
-- subscriber. "Read all" on N notifications sent N events, each one re-reading the inbox.
--
-- Now: one private Broadcast topic per account, `user:<profile id>`. The database sends a small event there when that
-- account's notifications or chats change, once per statement and person (so "Read all" is one event), and the app
-- listens on one channel for the whole session and re-reads only the count it shows. Events carry no content: they
-- say "look again", and the reads go through the tables' own policies as before.
--
-- Behind the switch `live_updates_hub` (off): nothing is sent for an account it doesn't allow, and the app keeps its
-- postgres_changes subscriptions for those accounts.

-- 1. The switch, off.
insert into public.feature_flags (key, description, enabled)
values ('live_updates_hub',
        'Notification and chat badges update through one private Broadcast channel per account (user:<id>), sent by '
        'database triggers, instead of per-page table subscriptions (seller home fixes T9).',
        false)
on conflict (key) do nothing;

-- 2. Who may listen: an account joins its own topic only, and reads only that topic's rows. Clients never send on it (no insert policy): every event
-- comes from the triggers below.
drop policy if exists hub_user_topic on realtime.messages;
create policy hub_user_topic on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'user:' || (select auth.uid())::text
    -- and only that topic's rows, so the policy never reads wider than the channel being joined
    and realtime.messages.topic = (select realtime.topic())
  );

-- 3. Sending. Definer: the write that fires it is usually someone else's (a buyer's message reaches the seller's
-- topic), and realtime.send runs with the caller's rights and swallows a refusal. Never fails the write.
create or replace function admin.hub_send(p_profiles uuid[], p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f record;
  v uuid;
begin
  select ff.enabled, ff.allow_profile_ids into f from public.feature_flags ff where ff.key = 'live_updates_hub';
  if not found then
    return;
  end if;
  for v in
    select distinct u from unnest(p_profiles) u
     where u is not null and (f.enabled or u = any (f.allow_profile_ids))
  loop
    perform realtime.send('{}'::jsonb, p_event, 'user:' || v::text, true);
  end loop;
  -- realtime.send sets realtime.topic for the rest of the transaction; leave it as it was found.
  perform set_config('realtime.topic', '', true);
exception when others then
  raise warning 'hub_send: %', sqlerrm;
end;
$$;

revoke all on function admin.hub_send(uuid[], text) from public, anon, authenticated;

-- 4. What sends. Statement-level triggers with transition tables: one event per person per statement, however many
-- rows changed. (A transition table needs one trigger per operation.)
create or replace function admin.hub_notifications_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform admin.hub_send(array(select distinct o.profile_id from old_rows o), 'notifications');
  else
    perform admin.hub_send(array(select distinct n.profile_id from new_rows n), 'notifications');
  end if;
  return null;
end;
$$;

create or replace function admin.hub_messages_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform admin.hub_send(array(
    select c.user_a from new_rows m join public.conversations c on c.id = m.conversation_id
    union
    select c.user_b from new_rows m join public.conversations c on c.id = m.conversation_id), 'chat');
  return null;
end;
$$;

-- A read line, an archive or a clear changes that person's unread counts (chat_unread_counts skips archived chats).
create or replace function admin.hub_chat_member_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform admin.hub_send(array(select distinct n.user_id from new_rows n), 'chat');
  return null;
end;
$$;

-- A chat locked for review or reopened changes what both people see.
create or replace function admin.hub_conversations_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform admin.hub_send(array(
    select n.user_a from new_rows n join old_rows o on o.id = n.id where n.status is distinct from o.status
    union
    select n.user_b from new_rows n join old_rows o on o.id = n.id where n.status is distinct from o.status), 'chat');
  return null;
end;
$$;

revoke all on function admin.hub_notifications_changed() from public, anon, authenticated;
revoke all on function admin.hub_messages_inserted() from public, anon, authenticated;
revoke all on function admin.hub_chat_member_changed() from public, anon, authenticated;
revoke all on function admin.hub_conversations_status() from public, anon, authenticated;

drop trigger if exists trg_notifications_hub_ins on public.notifications;
create trigger trg_notifications_hub_ins after insert on public.notifications
  referencing new table as new_rows for each statement execute function admin.hub_notifications_changed();
drop trigger if exists trg_notifications_hub_upd on public.notifications;
create trigger trg_notifications_hub_upd after update on public.notifications
  referencing new table as new_rows for each statement execute function admin.hub_notifications_changed();
drop trigger if exists trg_notifications_hub_del on public.notifications;
create trigger trg_notifications_hub_del after delete on public.notifications
  referencing old table as old_rows for each statement execute function admin.hub_notifications_changed();

drop trigger if exists trg_messages_hub on public.messages;
create trigger trg_messages_hub after insert on public.messages
  referencing new table as new_rows for each statement execute function admin.hub_messages_inserted();

drop trigger if exists trg_conversation_reads_hub_ins on public.conversation_reads;
create trigger trg_conversation_reads_hub_ins after insert on public.conversation_reads
  referencing new table as new_rows for each statement execute function admin.hub_chat_member_changed();
drop trigger if exists trg_conversation_reads_hub_upd on public.conversation_reads;
create trigger trg_conversation_reads_hub_upd after update on public.conversation_reads
  referencing new table as new_rows for each statement execute function admin.hub_chat_member_changed();
drop trigger if exists trg_conversation_member_state_hub_ins on public.conversation_member_state;
create trigger trg_conversation_member_state_hub_ins after insert on public.conversation_member_state
  referencing new table as new_rows for each statement execute function admin.hub_chat_member_changed();
drop trigger if exists trg_conversation_member_state_hub_upd on public.conversation_member_state;
create trigger trg_conversation_member_state_hub_upd after update on public.conversation_member_state
  referencing new table as new_rows for each statement execute function admin.hub_chat_member_changed();

drop trigger if exists trg_conversations_hub_status on public.conversations;
create trigger trg_conversations_hub_status after update on public.conversations
  referencing new table as new_rows old table as old_rows for each statement execute function admin.hub_conversations_status();

-- 5. Self-check.
do $$
begin
  if (select enabled from public.feature_flags where key = 'live_updates_hub') is distinct from false then
    raise exception 'live_updates_hub must ship off';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'realtime.messages'::regclass and polname = 'hub_user_topic'
                   and polcmd = 'r') then
    raise exception 'hub_user_topic must be a select policy';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'admin' and p.proname like 'hub\_%' and not p.prosecdef) then
    raise exception 'every admin.hub_* function must be security definer';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'admin' and p.proname like 'hub\_%'
                and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))) then
    raise exception 'admin.hub_* functions must not be callable by browser roles';
  end if;
end;
$$;
