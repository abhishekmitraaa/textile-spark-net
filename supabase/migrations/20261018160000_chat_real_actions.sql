-- The chat's attachments and menu actions become real (Mitra, 2026-10-18: "fix all the first-fix problems",
-- "Build everything" for the chat menu). Found by the 2026-10-18 buyer audit:
--
--   * Photos, documents and voice notes were never uploaded: the thread sent a placeholder text ("📷 Photo")
--     with kind image/file/audio, and the other side saw an empty bubble.
--   * Block, Delete chat, Star, Archive, Mark as Read and Share contact only showed a success toast. A
--     "blocked" seller could keep writing; a "deleted" chat came back on the next load.
--
-- Now:
--   messages.attachment_*            a message of kind image / file / audio carries a file in the private
--                                    `chat-attachments` bucket at {conversation}/{sender}/{uuid}.{ext}. The
--                                    type and size are read from Storage by the guard below, never trusted
--                                    from the browser.
--   storage `chat-attachments`       private, 10 MB, photos / PDF / voice notes. Only the two people in the
--                                    chat (and support / super admins, for reviews) can read a file; only a
--                                    participant of an active, unblocked chat can upload, into their own folder.
--   public.chat_blocks               who blocked whom. A block stops messages both ways until it is lifted.
--                                    Lifting sets unblocked_at (no DELETE anywhere in this file).
--   public.conversation_member_state each person's own view of a chat: starred, archived, and "deleted for me"
--                                    (cleared_at: the list hides the chat until a newer message, the thread
--                                    hides what came before). Messages themselves are never removed: chats
--                                    are monitored, and a review needs the record.
--   share_chat_contact()             sends a contact card. The number is NOT in the message: the chat's flag
--                                    patterns lock any message holding a mobile number (off-platform rule), so
--                                    the card carries no number and chat_contact_number() reveals the sender's
--                                    sign-in number to the other participant only, never while the chat is
--                                    under review or blocked.
--   guard_message_insert()           BEFORE INSERT on messages: blocks, contact cards only through the RPC,
--                                    attachments must exist in this chat's folder and match their kind.
--
-- No DROP of a table or function and no DELETE anywhere in this file.

-- ── 1. Message attachment columns ────────────────────────────────────────────
alter table public.messages add column if not exists attachment_path    text;
alter table public.messages add column if not exists attachment_name    text;
alter table public.messages add column if not exists attachment_mime    text;
alter table public.messages add column if not exists attachment_bytes   integer;
alter table public.messages add column if not exists attachment_seconds integer;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_attachment_name_len') then
    alter table public.messages add constraint messages_attachment_name_len
      check (attachment_name is null or char_length(attachment_name) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_attachment_seconds_range') then
    alter table public.messages add constraint messages_attachment_seconds_range
      check (attachment_seconds is null or attachment_seconds between 0 and 600);
  end if;
end
$c$;

-- ── 2. Blocks ────────────────────────────────────────────────────────────────
create table if not exists public.chat_blocks (
  blocker_id   uuid not null references auth.users (id) on delete cascade,
  blocked_id   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unblocked_at timestamptz,
  primary key (blocker_id, blocked_id),
  constraint chat_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists chat_blocks_blocked_idx on public.chat_blocks (blocked_id) where unblocked_at is null;

alter table public.chat_blocks enable row level security;
drop policy if exists chat_blocks_own_select on public.chat_blocks;
create policy chat_blocks_own_select on public.chat_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));
revoke all on public.chat_blocks from anon, authenticated;
grant select on public.chat_blocks to authenticated;

-- True when either of the two has an active block on the other.
create or replace function public.chat_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.chat_blocks b
                  where b.unblocked_at is null
                    and ((b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)));
$function$;

-- ── 3. Each person's view of a chat ──────────────────────────────────────────
create table if not exists public.conversation_member_state (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  starred_at      timestamptz,
  archived_at     timestamptz,
  cleared_at      timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_member_state_user_idx on public.conversation_member_state (user_id);

alter table public.conversation_member_state enable row level security;
drop policy if exists conversation_member_state_own_select on public.conversation_member_state;
create policy conversation_member_state_own_select on public.conversation_member_state
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.conversation_member_state from anon, authenticated;
grant select on public.conversation_member_state to authenticated;

-- ── 4. Attachments bucket ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
              'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- {conversation uuid}/{sender uuid}/{uuid}.{ext}
create or replace function public.chat_attachment_path_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf|webm|ogg|m4a|mp3|aac|wav)$', false);
$function$;

-- Upload: into your own folder of a chat you're in, while it is active, your account is active and
-- neither of you has blocked the other.
create or replace function public.chat_attachment_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_me   uuid := auth.uid();
  v_conv public.conversations%rowtype;
begin
  if v_me is null or not public.chat_attachment_path_ok(p_name) then
    return false;
  end if;
  if split_part(p_name, '/', 2) <> v_me::text then
    return false;
  end if;
  select * into v_conv from public.conversations c where c.id = split_part(p_name, '/', 1)::uuid;
  if not found or v_me not in (v_conv.user_a, v_conv.user_b) or v_conv.status <> 'active' then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_me and p.account_status = 'active') then
    return false;
  end if;
  return not public.chat_blocked_between(v_conv.user_a, v_conv.user_b);
end
$function$;

-- Read: the two participants, and support / super admins (chat reviews).
create or replace function public.chat_attachment_read_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.chat_attachment_path_ok(p_name) then
    return false;
  end if;
  if exists (select 1 from public.conversations c
              where c.id = split_part(p_name, '/', 1)::uuid and v_me in (c.user_a, c.user_b)) then
    return true;
  end if;
  return coalesce(public.admin_role()::text in ('super_admin', 'support'), false);
end
$function$;

revoke all on function public.chat_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.chat_attachment_path_ok(text) from public, anon, authenticated;
revoke all on function public.chat_attachment_upload_allowed(text) from public, anon, authenticated;
revoke all on function public.chat_attachment_read_allowed(text) from public, anon, authenticated;
grant execute on function public.chat_attachment_path_ok(text) to authenticated;
grant execute on function public.chat_attachment_upload_allowed(text) to authenticated;
grant execute on function public.chat_attachment_read_allowed(text) to authenticated;

drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and (select public.chat_attachment_upload_allowed(name)));
drop policy if exists chat_attachments_read on storage.objects;
create policy chat_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and (select public.chat_attachment_read_allowed(name)));
-- No update or delete policy: a sent file stays as it was sent.

-- ── 5. The message guard ─────────────────────────────────────────────────────
create or replace function public.guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_conv  public.conversations%rowtype;
  v_other uuid;
  v_mime  text;
  v_size  bigint;
begin
  select * into v_conv from public.conversations c where c.id = new.conversation_id;
  if not found then
    return new;  -- the foreign key reports it
  end if;
  v_other := case when v_conv.user_a = new.sender_id then v_conv.user_b else v_conv.user_a end;

  if public.chat_blocked_between(new.sender_id, v_other) then
    raise exception 'chat blocked: messages between these two accounts are blocked' using errcode = '42501';
  end if;

  -- A contact card is written only by share_chat_contact(), which reads the number itself.
  if new.kind = 'contact' and coalesce(current_setting('cosora.chat_contact_share', true), '') <> 'on' then
    raise exception 'contact cards are sent with share_chat_contact()' using errcode = '42501';
  end if;

  if new.kind in ('image', 'file', 'audio') then
    if new.attachment_path is null
       or not public.chat_attachment_path_ok(new.attachment_path)
       or split_part(new.attachment_path, '/', 1) <> new.conversation_id::text
       or split_part(new.attachment_path, '/', 2) <> new.sender_id::text then
      raise exception 'attachment missing or not in this chat' using errcode = '22023';
    end if;
    select o.metadata ->> 'mimetype', nullif(o.metadata ->> 'size', '')::bigint
      into v_mime, v_size
      from storage.objects o
     where o.bucket_id = 'chat-attachments' and o.name = new.attachment_path;
    if not found then
      raise exception 'attachment not uploaded' using errcode = '22023';
    end if;
    if (new.kind = 'image' and coalesce(v_mime, '') not like 'image/%')
       or (new.kind = 'audio' and coalesce(v_mime, '') not like 'audio/%')
       or (new.kind = 'file' and coalesce(v_mime, '') <> 'application/pdf') then
      raise exception 'attachment type does not match the message' using errcode = '22023';
    end if;
    new.attachment_mime  := v_mime;
    new.attachment_bytes := least(coalesce(v_size, 0), 2147483647)::integer;
  elsif new.attachment_path is not null then
    raise exception 'only photo, document and voice messages carry a file' using errcode = '22023';
  else
    new.attachment_mime := null;
    new.attachment_bytes := null;
    new.attachment_seconds := null;
  end if;
  return new;
end
$function$;
revoke all on function public.guard_message_insert() from public, anon, authenticated;

drop trigger if exists trg_messages_guard on public.messages;
create trigger trg_messages_guard before insert on public.messages
  for each row execute function public.guard_message_insert();

-- ── 6. RPCs ──────────────────────────────────────────────────────────────────
-- Star, archive, or delete-for-me a chat. NULL leaves a flag as it is.
create or replace function public.chat_set_state(
  p_conversation_id uuid,
  p_starred  boolean default null,
  p_archived boolean default null,
  p_clear    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_me  uuid := auth.uid();
  v_row public.conversation_member_state%rowtype;
begin
  if v_me is null or not exists (select 1 from public.conversations c
                                  where c.id = p_conversation_id and v_me in (c.user_a, c.user_b)) then
    raise exception 'not a participant in that chat' using errcode = '42501';
  end if;

  insert into public.conversation_member_state as s (conversation_id, user_id, starred_at, archived_at, cleared_at)
  values (p_conversation_id, v_me,
          case when coalesce(p_starred, false) then now() end,
          case when coalesce(p_archived, false) then now() end,
          case when coalesce(p_clear, false) then now() end)
  on conflict (conversation_id, user_id) do update
     set starred_at  = case when p_starred is null then s.starred_at
                            when p_starred then coalesce(s.starred_at, now()) end,
         archived_at = case when p_archived is null then s.archived_at
                            when p_archived then coalesce(s.archived_at, now()) end,
         cleared_at  = case when coalesce(p_clear, false) then now() else s.cleared_at end,
         updated_at  = now()
  returning * into v_row;

  -- Deleting a chat for yourself leaves nothing unread in it.
  if coalesce(p_clear, false) then
    perform public.mark_conversation_read(p_conversation_id);
  end if;

  return jsonb_build_object('starred', v_row.starred_at is not null,
                            'archived', v_row.archived_at is not null,
                            'cleared_at', v_row.cleared_at);
end
$function$;

-- Block or unblock the other person in a chat you share.
create or replace function public.chat_set_block(p_other uuid, p_block boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or p_other is null or p_other = v_me then
    raise exception 'pick someone else to block' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conversations c
                  where c.user_a = least(v_me, p_other) and c.user_b = greatest(v_me, p_other)) then
    raise exception 'you can block only someone you have a chat with' using errcode = '42501';
  end if;

  if p_block then
    insert into public.chat_blocks as b (blocker_id, blocked_id)
    values (v_me, p_other)
    on conflict (blocker_id, blocked_id) do update
       set created_at = case when b.unblocked_at is null then b.created_at else now() end,
           unblocked_at = null;
  else
    update public.chat_blocks
       set unblocked_at = now()
     where blocker_id = v_me and blocked_id = p_other and unblocked_at is null;
  end if;

  return public.chat_block_state(p_other);
end
$function$;

-- For the thread: did I block them, did they block me.
create or replace function public.chat_block_state(p_other uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'blocked_by_me', coalesce(auth.uid() is not null and exists (
       select 1 from public.chat_blocks b
        where b.blocker_id = auth.uid() and b.blocked_id = p_other and b.unblocked_at is null), false),
    'blocked_me', coalesce(auth.uid() is not null and exists (
       select 1 from public.chat_blocks b
        where b.blocker_id = p_other and b.blocked_id = auth.uid() and b.unblocked_at is null), false));
$function$;

-- Send your contact card into a chat. The number stays in auth.users; see chat_contact_number().
create or replace function public.share_chat_contact(p_conversation_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_me    uuid := auth.uid();
  v_conv  public.conversations%rowtype;
  v_phone text;
  v_id    uuid;
begin
  if v_me is null then
    raise exception 'sign in to share your contact' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation_id;
  if not found or v_me not in (v_conv.user_a, v_conv.user_b) then
    raise exception 'not a participant in that chat' using errcode = '42501';
  end if;
  if v_conv.status <> 'active' then
    raise exception 'sending is paused while this chat is reviewed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_me and p.account_status = 'active') then
    raise exception 'your account cannot send messages' using errcode = '42501';
  end if;
  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_me;
  if v_phone is null then
    raise exception 'no sign-in number on this account' using errcode = 'P0002';
  end if;

  perform set_config('cosora.chat_contact_share', 'on', true);
  insert into public.messages (conversation_id, sender_id, body, kind)
  values (p_conversation_id, v_me, 'Shared their contact', 'contact')
  returning id into v_id;
  perform set_config('cosora.chat_contact_share', '', true);
  return v_id;
end
$function$;

-- The number behind a contact card: for the people in that chat, while it is active and unblocked.
create or replace function public.chat_contact_number(p_message_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_me      uuid := auth.uid();
  v_sender  uuid;
  v_conv_id uuid;
  v_conv    public.conversations%rowtype;
  v_phone   text;
begin
  if v_me is null then
    raise exception 'sign in to see this contact' using errcode = '42501';
  end if;
  select m.sender_id, m.conversation_id into v_sender, v_conv_id
    from public.messages m
   where m.id = p_message_id and m.kind = 'contact';
  if v_sender is not null then
    select * into v_conv from public.conversations c where c.id = v_conv_id;
  end if;
  if v_sender is null or v_me not in (v_conv.user_a, v_conv.user_b) then
    raise exception 'not a contact card in your chats' using errcode = '42501';
  end if;
  if v_conv.status <> 'active' then
    raise exception 'contacts are hidden while this chat is reviewed' using errcode = '42501';
  end if;
  if public.chat_blocked_between(v_conv.user_a, v_conv.user_b) then
    raise exception 'chat blocked' using errcode = '42501';
  end if;
  select nullif(btrim(u.phone), '') into v_phone from auth.users u where u.id = v_sender;
  if v_phone is null then
    return null;
  end if;
  return case when left(v_phone, 1) = '+' then v_phone else '+' || v_phone end;
end
$function$;

revoke all on function public.chat_set_state(uuid, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.chat_set_block(uuid, boolean) from public, anon, authenticated;
revoke all on function public.chat_block_state(uuid) from public, anon, authenticated;
revoke all on function public.share_chat_contact(uuid) from public, anon, authenticated;
revoke all on function public.chat_contact_number(uuid) from public, anon, authenticated;
grant execute on function public.chat_set_state(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.chat_set_block(uuid, boolean) to authenticated;
grant execute on function public.chat_block_state(uuid) to authenticated;
grant execute on function public.share_chat_contact(uuid) to authenticated;
grant execute on function public.chat_contact_number(uuid) to authenticated;

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  f text;
  t text;
begin
  foreach t in array array['chat_blocks', 'conversation_member_state'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'self-check: RLS is off on %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'self-check: client grants on % are wrong', t;
    end if;
  end loop;
  foreach f in array array['chat_set_state(uuid,boolean,boolean,boolean)', 'chat_set_block(uuid,boolean)',
                           'chat_block_state(uuid)', 'share_chat_contact(uuid)', 'chat_contact_number(uuid)',
                           'chat_attachment_upload_allowed(text)', 'chat_attachment_read_allowed(text)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = ('public.' || f)::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  foreach f in array array['chat_blocked_between(uuid,uuid)', 'guard_message_insert()'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'self-check: % must not be callable by clients', f;
    end if;
  end loop;
  if (select public from storage.buckets where id = 'chat-attachments') is distinct from false then
    raise exception 'self-check: chat-attachments must be private';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_messages_guard'
                  and tgrelid = 'public.messages'::regclass and not tgisinternal) then
    raise exception 'self-check: trg_messages_guard missing';
  end if;
end
$check$;
