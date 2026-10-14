-- Unread chat messages (Mitra, 2026-10-14: "fix the chat icon, it should show number of unopened messages").
--
-- The bottom bar's Chats badge was a hardcoded 3 for everyone, and the chat list showed every thread as
-- read: nothing recorded what anyone had opened. Now:
--
--   public.conversation_reads   one row per person per chat: they've read it up to `read_at`.
--                               Written only by mark_conversation_read(); each person reads their own rows.
--   mark_conversation_read(id)  a participant opening the chat (and each message arriving while it's open)
--                               marks it read up to the newest message they can see from the other person.
--   chat_unread_counts()        for the caller: each chat with unread messages from the other person, and how
--                               many (counted up to 100 a chat; the badge shows 99+ long before that).
--
-- LIVE: bump_conversation() updates the conversation on every message, and `conversations` is in the realtime
-- publication, so the app re-reads the counts when a row of the caller's changes (filtered by user_a / user_b).
--
-- EXISTING CHATS start read: nothing recorded what was opened before, and showing every old message as new
-- would be wrong for most of them. Messages from now on count.
--
-- No DROP of a table or function and no DELETE anywhere in this file.

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  read_at         timestamptz not null,
  primary key (conversation_id, user_id)
);

alter table public.conversation_reads enable row level security;

drop policy if exists conversation_reads_own_select on public.conversation_reads;
create policy conversation_reads_own_select on public.conversation_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.conversation_reads from anon, authenticated;
grant select on public.conversation_reads to authenticated;

-- "my chats" reads conversations by user_b as well as user_a; (user_a, user_b) already covers user_a.
create index if not exists conversations_user_b_idx on public.conversations (user_b);

-- ── Existing chats start read ────────────────────────────────────────────────
insert into public.conversation_reads (conversation_id, user_id, read_at)
select c.id, u.uid, now()
  from public.conversations c
  cross join lateral (values (c.user_a), (c.user_b)) as u (uid)
 where u.uid is not null
   and exists (select 1 from auth.users au where au.id = u.uid)
on conflict (conversation_id, user_id) do nothing;

-- ── Mark a chat read ─────────────────────────────────────────────────────────
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_me     uuid := auth.uid();
  v_latest timestamptz;
begin
  if v_me is null or not exists (select 1 from public.conversations c
                                  where c.id = p_conversation_id and v_me in (c.user_a, c.user_b)) then
    raise exception 'not a participant in that chat' using errcode = '42501';
  end if;

  -- Read up to the newest message from the other person that exists now, not "now": a message still
  -- being written when the chat was opened stays unread.
  select max(m.created_at) into v_latest
    from public.messages m
   where m.conversation_id = p_conversation_id and m.sender_id is distinct from v_me;
  if v_latest is null then
    return;  -- nothing from them yet: nothing to mark
  end if;

  insert into public.conversation_reads as r (conversation_id, user_id, read_at)
  values (p_conversation_id, v_me, v_latest)
  on conflict (conversation_id, user_id) do update
     set read_at = excluded.read_at
   where r.read_at < excluded.read_at;
end
$function$;

-- ── Unread counts for the caller ─────────────────────────────────────────────
create or replace function public.chat_unread_counts()
returns table (conversation_id uuid, other_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $function$
  with mine as (
    select c.id, case when c.user_a = auth.uid() then c.user_b else c.user_a end as other_id,
           coalesce(r.read_at, '-infinity'::timestamptz) as read_at
      from public.conversations c
      left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
     where auth.uid() is not null
       and (c.user_a = auth.uid() or c.user_b = auth.uid())
       -- cheap first cut: nothing has happened since it was read
       and c.last_message_at > coalesce(r.read_at, '-infinity'::timestamptz)
  )
  select x.id, x.other_id, x.n
    from (
      select mine.id, mine.other_id,
             (select count(*)::integer from (
                select 1 from public.messages m
                 where m.conversation_id = mine.id
                   and m.created_at > mine.read_at
                   and m.sender_id is distinct from auth.uid()
                 limit 100) l) as n
        from mine
    ) x
   where x.n > 0;
$function$;

revoke all on function public.mark_conversation_read(uuid), public.chat_unread_counts() from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid), public.chat_unread_counts() to authenticated;

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.conversation_reads'::regclass) then
    raise exception 'self-check: RLS is off on conversation_reads';
  end if;
  if has_table_privilege('anon', 'public.conversation_reads', 'SELECT')
     or has_table_privilege('authenticated', 'public.conversation_reads', 'INSERT')
     or has_table_privilege('authenticated', 'public.conversation_reads', 'UPDATE')
     or has_table_privilege('authenticated', 'public.conversation_reads', 'DELETE') then
    raise exception 'self-check: client grants on conversation_reads are wrong';
  end if;
  foreach f in array array['mark_conversation_read(uuid)', 'chat_unread_counts()'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = ('public.' || f)::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  if (select count(*) from public.conversations c where not exists (
        select 1 from public.conversation_reads r where r.conversation_id = c.id and r.user_id = c.user_a)
        and exists (select 1 from auth.users au where au.id = c.user_a)) > 0 then
    raise exception 'self-check: an existing chat was not marked read';
  end if;
end
$check$;
