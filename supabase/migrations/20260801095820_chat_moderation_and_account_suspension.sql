-- ─────────────────────────────────────────────────────────────
-- Chat moderation: admin visibility, keyword blocklist, regex auto-flagging,
-- and a unified account-suspension system.
--
-- Four independent mechanisms, deliberately kept separate:
--
--   * keyword_blocklist  — a HARD stop. BEFORE INSERT on messages raises, no row
--                          is written, nothing is flagged. Not a moderation
--                          event; the sender simply cannot say that word.
--   * flag_patterns      — a SOFT stop. AFTER INSERT on messages: the message IS
--                          stored, the conversation locks (status='under_review')
--                          and a conversation_reviews row queues it for a human.
--   * submit_report()    — the same lock, initiated by a participant.
--   * account_suspensions — the outcome ledger. profiles.account_status is the
--                          live flag; account_suspensions is the audit log of how
--                          it got there. Only set_account_status() writes either.
--
-- vendor_profiles.account_status (added 20260717130000, never read by any code)
-- is replaced by profiles.account_status. Suspension is an ACCOUNT-level fact —
-- the same human toggles between buyer and vendor, so a vendor-table flag cannot
-- stop them messaging as a buyer.
-- ─────────────────────────────────────────────────────────────


-- Part 1 — account status moves from vendor_profiles to profiles -----------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'account_status_type' and n.nspname = 'public'
  ) then
    create type public.account_status_type as enum ('active', 'suspended');
  end if;
end $$;

alter table public.profiles
  add column if not exists account_status public.account_status_type not null default 'active';

-- No backfill. Live check before writing this migration: all 7 rows in
-- vendor_profiles held 'active', i.e. the column default — there is no
-- suspension state to preserve, and nothing outside database.types.ts ever read
-- the column.

-- enforce_vendor_profile_admin_fields() references new.account_status, so it has
-- to stop doing that BEFORE the column disappears, or every vendor_profiles
-- write starts failing at runtime. Verification is the only admin field left.
create or replace function public.enforce_vendor_profile_admin_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
      new.is_verified := false;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.is_verified is distinct from old.is_verified
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Changing vendor verification requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

alter table public.vendor_profiles
  drop column if exists account_status;

-- profiles_update allows `id = auth.uid()`, so without this a suspended user
-- could PATCH their own account_status back to 'active' and keep messaging.
-- Same column-level-gate-via-trigger pattern as the rest of this file's
-- neighbours: RLS cannot see WHICH column changed. set_account_status() is
-- SECURITY DEFINER (runs as postgres), so it bypasses the current_user guard —
-- which makes that RPC the only way in for a client.
create or replace function public.enforce_admin_grants()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() = 'super_admin') then
      new.is_admin       := false;
      new.admin_role     := null;
      new.account_status := 'active';
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.admin_role is distinct from old.admin_role
      or new.is_admin is distinct from old.is_admin)
     and not (public.is_admin() and public.admin_role() = 'super_admin') then
    raise exception 'Only a super_admin may change admin status or admin roles'
      using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'account_status is set only via set_account_status()'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


-- Part 2 — moderation reference tables -------------------------------------

-- The canned reasons a support agent picks from when locking or suspending.
create table if not exists public.chat_block_reasons (
  id         uuid primary key default gen_random_uuid(),
  reason     text not null,
  active     boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.chat_block_reasons enable row level security;

drop policy if exists chat_block_reasons_select on public.chat_block_reasons;
create policy chat_block_reasons_select on public.chat_block_reasons
  for select using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists chat_block_reasons_insert on public.chat_block_reasons;
create policy chat_block_reasons_insert on public.chat_block_reasons
  for insert with check (public.is_admin() and public.admin_role() = 'super_admin');

drop policy if exists chat_block_reasons_update on public.chat_block_reasons;
create policy chat_block_reasons_update on public.chat_block_reasons
  for update using (public.is_admin() and public.admin_role() = 'super_admin')
          with check (public.is_admin() and public.admin_role() = 'super_admin');

drop policy if exists chat_block_reasons_delete on public.chat_block_reasons;
create policy chat_block_reasons_delete on public.chat_block_reasons
  for delete using (public.is_admin() and public.admin_role() = 'super_admin');


-- Hard blocklist. Deleting a term is how you deactivate it — there is no
-- `active` column here (unlike flag_patterns), so the trigger matches every row.
create table if not exists public.keyword_blocklist (
  id         uuid primary key default gen_random_uuid(),
  term       text not null,
  added_by   uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.keyword_blocklist enable row level security;

drop policy if exists keyword_blocklist_select on public.keyword_blocklist;
create policy keyword_blocklist_select on public.keyword_blocklist
  for select using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists keyword_blocklist_insert on public.keyword_blocklist;
create policy keyword_blocklist_insert on public.keyword_blocklist
  for insert with check (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists keyword_blocklist_delete on public.keyword_blocklist;
create policy keyword_blocklist_delete on public.keyword_blocklist
  for delete using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));


-- Regex auto-flagging rules.
create table if not exists public.flag_patterns (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null,
  label      text not null,
  active     boolean not null default true,
  added_by   uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- A malformed regex would otherwise raise inside check_message_flag_patterns()
  -- on EVERY message insert — one typo in the admin panel takes chat down
  -- platform-wide. `~` is immutable, so this is a legal CHECK, and it fails the
  -- bad write instead of the messages.
  constraint flag_patterns_pattern_valid check (('' ~ pattern) is not null)
);

alter table public.flag_patterns enable row level security;

drop policy if exists flag_patterns_select on public.flag_patterns;
create policy flag_patterns_select on public.flag_patterns
  for select using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists flag_patterns_insert on public.flag_patterns;
create policy flag_patterns_insert on public.flag_patterns
  for insert with check (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists flag_patterns_update on public.flag_patterns;
create policy flag_patterns_update on public.flag_patterns
  for update using (public.is_admin() and public.admin_role() in ('support', 'super_admin'))
          with check (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists flag_patterns_delete on public.flag_patterns;
create policy flag_patterns_delete on public.flag_patterns
  for delete using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));


-- Part 3 — conversation lock + review queue --------------------------------

alter table public.conversations
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_status_chk') then
    alter table public.conversations
      add constraint conversations_status_chk check (status in ('active', 'under_review'));
  end if;
end $$;

create table if not exists public.conversation_reviews (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations(id) on delete cascade,
  flagged_message_id uuid references public.messages(id) on delete set null,
  matched_pattern_id uuid references public.flag_patterns(id),
  source             text not null check (source in ('regex_flag', 'user_report')),
  status             text not null default 'pending'
                       check (status in ('pending', 'resumed', 'buyer_blocked', 'vendor_blocked', 'kept_locked')),
  reason_id          uuid references public.chat_block_reasons(id),
  reviewed_by        uuid references public.profiles(id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists conversation_reviews_conversation_idx
  on public.conversation_reviews (conversation_id);
create index if not exists conversation_reviews_pending_idx
  on public.conversation_reviews (created_at desc) where status = 'pending';

alter table public.conversation_reviews enable row level security;

drop policy if exists conversation_reviews_select on public.conversation_reviews;
create policy conversation_reviews_select on public.conversation_reviews
  for select using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

drop policy if exists conversation_reviews_update on public.conversation_reviews;
create policy conversation_reviews_update on public.conversation_reviews
  for update using (public.is_admin() and public.admin_role() in ('support', 'super_admin'))
          with check (public.is_admin() and public.admin_role() in ('support', 'super_admin'));

-- Self-service reports only. There is deliberately NO insert policy for
-- source='regex_flag': check_message_flag_patterns() is SECURITY DEFINER and
-- bypasses RLS entirely, so granting one would only widen the surface.
drop policy if exists conversation_reviews_insert_report on public.conversation_reviews;
create policy conversation_reviews_insert_report on public.conversation_reviews
  for insert with check (
    public.is_conversation_member(conversation_id) and source = 'user_report'
  );


-- conversations_update lets either participant update their own row, so without
-- this a flagged user could just PATCH status back to 'active' and un-lock the
-- thread they were locked out of. Participants blocked; support/super_admin
-- allowed (the admin panel resumes threads this way); SECURITY DEFINER callers
-- — check_message_flag_patterns(), submit_report() — bypass via current_user.
create or replace function public.enforce_conversation_status()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'active';  -- a brand-new thread is never born locked
    return new;
  end if;

  if new.status is distinct from old.status
     and not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'Conversation status is set by moderation only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_conversations_status on public.conversations;
create trigger trg_conversations_status
  before insert or update on public.conversations
  for each row execute function public.enforce_conversation_status();


-- Part 4 — the audit ledger ------------------------------------------------

create table if not exists public.account_suspensions (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null references public.profiles(id) on delete cascade,
  reason_id              uuid references public.chat_block_reasons(id),
  source                 text not null check (source in ('chat_review', 'admin_manual')),
  conversation_review_id uuid,  -- fk added below; conversation_reviews exists by now
  suspended_by           uuid references public.profiles(id),
  suspended_at           timestamptz not null default now(),
  reinstated_by          uuid references public.profiles(id),
  reinstated_at          timestamptz,
  active                 boolean not null default true
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'account_suspensions_conversation_review_id_fkey') then
    alter table public.account_suspensions
      add constraint account_suspensions_conversation_review_id_fkey
      foreign key (conversation_review_id) references public.conversation_reviews(id) on delete set null;
  end if;
end $$;

create index if not exists account_suspensions_open_idx
  on public.account_suspensions (profile_id) where active;

alter table public.account_suspensions enable row level security;

-- Read-only for admins. No INSERT/UPDATE/DELETE policy for ANY role, on purpose:
-- the ledger is written exclusively by set_account_status() below, which is
-- SECURITY DEFINER and therefore not subject to these policies. A ledger a
-- client can write to is not a ledger.
drop policy if exists account_suspensions_select on public.account_suspensions;
create policy account_suspensions_select on public.account_suspensions
  for select using (public.is_admin() and public.admin_role() in ('support', 'super_admin'));


-- Part 5 — admin action + self-service RPCs --------------------------------

-- The ONLY writer of profiles.account_status and account_suspensions.
create or replace function public.set_account_status(
  p_profile_id             uuid,
  p_new_status             public.account_status_type,
  p_reason_id              uuid,
  p_source                 text,
  p_conversation_review_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: changing account status requires the support or super_admin role';
  end if;

  if p_new_status = 'suspended' then
    insert into public.account_suspensions
      (profile_id, reason_id, source, conversation_review_id, suspended_by)
    values
      (p_profile_id, p_reason_id, p_source, p_conversation_review_id, auth.uid());

    update public.profiles set account_status = 'suspended' where id = p_profile_id;
  else
    -- Close every still-open suspension for this account, not just the newest —
    -- two overlapping suspensions must not leave a stale `active` row behind.
    update public.account_suspensions
       set reinstated_by = auth.uid(),
           reinstated_at = now(),
           active        = false
     where profile_id = p_profile_id
       and active;

    update public.profiles set account_status = 'active' where id = p_profile_id;
  end if;

  if not found then
    raise exception 'profile % not found', p_profile_id;
  end if;
end;
$$;

grant execute on function public.set_account_status(uuid, public.account_status_type, uuid, text, uuid)
  to authenticated, service_role;


-- Participant-initiated report. Locks the thread immediately; a human decides
-- afterwards whether to resume it.
create or replace function public.submit_report(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not authorized to report this conversation';
  end if;

  insert into public.conversation_reviews (conversation_id, flagged_message_id, source, status)
  values (p_conversation_id, p_message_id, 'user_report', 'pending');

  update public.conversations set status = 'under_review' where id = p_conversation_id;
end;
$$;

grant execute on function public.submit_report(uuid, uuid) to authenticated, service_role;


-- Part 6 — message triggers ------------------------------------------------

-- SECURITY DEFINER is REQUIRED, not stylistic: keyword_blocklist is admin-only
-- under RLS, so a sender's own trigger would read zero rows and the blocklist
-- would silently never fire.
--
-- strpos() rather than ILIKE on purpose — a term containing % or _ would be a
-- LIKE wildcard and match far more than the admin intended.
create or replace function public.check_message_blocklist()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.body is null or new.body = '' then
    return new;
  end if;

  if exists (
    select 1 from public.keyword_blocklist k
     where k.term <> ''
       and strpos(lower(new.body), lower(k.term)) > 0
  ) then
    raise exception 'message blocked: contains a restricted term'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_blocklist on public.messages;
create trigger trg_messages_blocklist
  before insert on public.messages
  for each row execute function public.check_message_blocklist();


-- SECURITY DEFINER so it can write conversation_reviews and flip
-- conversations.status regardless of the sender's own permissions — the sender
-- has neither. Fires AFTER insert: the offending message is KEPT (support needs
-- to read it), unlike the blocklist which rejects outright.
create or replace function public.check_message_flag_patterns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pattern_id uuid;
begin
  if new.body is null or new.body = '' then
    return null;
  end if;

  -- One review row per message. Which of several matching patterns wins does
  -- not matter — the outcome (locked, queued) is identical either way.
  select f.id
    into v_pattern_id
    from public.flag_patterns f
   where f.active
     and new.body ~* f.pattern
   limit 1;

  if v_pattern_id is null then
    return null;
  end if;

  update public.conversations
     set status = 'under_review'
   where id = new.conversation_id;

  insert into public.conversation_reviews
    (conversation_id, flagged_message_id, matched_pattern_id, source, status)
  values
    (new.conversation_id, new.id, v_pattern_id, 'regex_flag', 'pending');

  return null;
end;
$$;

drop trigger if exists trg_messages_flag_patterns on public.messages;
create trigger trg_messages_flag_patterns
  after insert on public.messages
  for each row execute function public.check_message_flag_patterns();


-- Part 7 — RLS: admin visibility + send gating -----------------------------

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (
    auth.uid() = user_a
    or auth.uid() = user_b
    or (public.is_admin() and public.admin_role() in ('support', 'super_admin'))
  );

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_conversation_member(conversation_id)
    or (public.is_admin() and public.admin_role() in ('support', 'super_admin'))
  );

-- The send gate. Both new conjuncts are server-side truth: a locked thread and a
-- suspended sender are unsendable even if the client UI is bypassed entirely.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and (select c.status from public.conversations c where c.id = conversation_id) = 'active'
    and (select p.account_status from public.profiles p where p.id = auth.uid()) = 'active'
  );
