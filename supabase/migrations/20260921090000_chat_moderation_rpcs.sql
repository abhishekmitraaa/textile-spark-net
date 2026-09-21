-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 4a: RPCs OVER THE CHAT-MODERATION AND
-- SUSPENSION TABLES, WHILE ALL FIVE ARE STILL IN public. ADDITIVE; NO
-- BEHAVIOUR CHANGE.
--
-- Spec: documentation/admin-separation-spec.md. Rolling context:
-- documentation/admin-separation-context.md.
--
-- Phase 4 moves keyword_blocklist, flag_patterns, chat_block_reasons,
-- conversation_reviews and account_suspensions behind the admin wall,
-- expand-then-contract:
--   4a (this file)  add SECURITY DEFINER RPCs over the tables where they are now
--   4b              switch the Cosora-Admin panel from direct queries to the RPCs
--   4c              ALTER TABLE … SET SCHEMA admin + repoint the message triggers
-- The panel keeps working through its current direct queries until 4b.
--
-- The writes that already go through RPCs are reused, not duplicated:
-- set_account_status (account_suspensions), resolve_conversation_review and
-- submit_report (conversation_reviews), regex_probe (reads no table).
--
-- The RPC set is exactly what the panel does directly today (Step 0, 2026-09-21):
--   ChatKeywords.tsx:46/57/73   keyword_blocklist  select (+adder) / insert / delete
--   ChatPatterns.tsx:55/95/120/131 flag_patterns   select (+adder) / insert / update active / delete
--   ChatReasons.tsx:59/79/94    chat_block_reasons select (+creator) / insert / update
--   lib/chat.ts:113             chat_block_reasons select active only
--   ChatReview.tsx:80           conversation_reviews by status, embedding
--                               flag_patterns, chat_block_reasons, messages, conversations
--   ChatThread.tsx:84           conversation_reviews by conversation, embedding
--                               flag_patterns, chat_block_reasons
--   AccountStatus.tsx:73        account_suspensions by profile, embedding chat_block_reasons
--   Accounts.tsx:94             account_suspensions active rows for a set of profiles
-- The panel never deletes a block reason (account_suspensions / conversation_reviews
-- reference them), so there is no delete RPC for it even though a policy exists.
--
-- THE CORRECTNESS RULE: each RPC admits exactly the callers the table's RLS
-- admits today — no wider, no narrower. The gate is checked inside the function
-- (it runs as postgres, so RLS no longer filters for it) and raises 42501.
-- Two policy expressions cover every table:
--   S  = is_admin() AND admin_role() = ANY ('{support,super_admin}')
--   SA = is_admin() AND admin_role() = 'super_admin'
--
--   admin_keyword_list / _add / _remove      = keyword_blocklist_select / _insert / _delete   S
--   admin_flag_pattern_list / _add / _update / _remove
--                                            = flag_patterns_select / _insert / _update / _delete  S
--   admin_block_reason_list                  = chat_block_reasons_select                      S
--   admin_block_reason_add / _update         = chat_block_reasons_insert / _update            SA
--   admin_conversation_review_list           = conversation_reviews_select                    S
--   admin_account_suspension_list            = account_suspensions_select                     S
--
-- Embedded rows. A PostgREST embed applies the embedded table's own SELECT
-- policy. Every embed the panel uses is visible to any S caller:
--   flag_patterns, chat_block_reasons   S
--   messages       is_conversation_member(conversation_id) OR S
--   conversations  auth.uid() IN (user_a, user_b) OR S
--   profiles       true
-- so, inside an S gate, a plain LEFT JOIN returns exactly what the embed does.
-- The profile names returned (adder, creator, suspended_by, reinstated_by) widen
-- nothing: profiles_select is USING (true).
--
-- Attribution columns (added_by, created_by) are not parameters: they are always
-- auth.uid(), as with admin_flag_add in 3a. The panel already sends its own id;
-- a forged attribution becomes impossible rather than merely unused.
--
-- The one intended difference from a direct query: a caller the policy excludes
-- gets 42501 from the RPC, where a direct SELECT/UPDATE/DELETE silently touched
-- 0 rows (an INSERT already raised 42501). Denied either way. Removing or
-- updating a row that does not exist returns 0 rows, as the direct call did, so
-- the panel's assertWrote() keeps reporting it.
--
-- Hardening, matching Phases 1–3: SECURITY DEFINER, owner postgres,
-- search_path = '' with every name schema-qualified, EXECUTE revoked from PUBLIC,
-- anon and service_role (Supabase's per-schema default ACL grants all three),
-- granted to authenticated only.
--
-- Additive: twelve new functions. No table, policy, trigger or existing function
-- is touched. Single transaction.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── keyword_blocklist ───────────────────────────────────────────────────────

create or replace function public.admin_keyword_list()
returns table (
  id              uuid,
  term            text,
  added_by        uuid,
  created_at      timestamptz,
  adder_full_name text,
  adder_email     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = keyword_blocklist_select (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading the keyword blocklist requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select k.id, k.term, k.added_by, k.created_at, pr.full_name, pr.email
      from public.keyword_blocklist k
      left join public.profiles pr on pr.id = k.added_by
     order by k.term, k.id;
end
$$;

create or replace function public.admin_keyword_add(p_term text)
returns table (
  id         uuid,
  term       text,
  added_by   uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = keyword_blocklist_insert WITH CHECK (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Adding to the keyword blocklist requires the support or super_admin role'
      using errcode = '42501';
  end if;

  insert into public.keyword_blocklist as k (term, added_by)
  values (p_term, auth.uid())
  returning k.id into v_id;

  return query
    select k.id, k.term, k.added_by, k.created_at
      from public.keyword_blocklist k
     where k.id = v_id;
end
$$;

create or replace function public.admin_keyword_remove(p_id uuid)
returns table (id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = keyword_blocklist_delete USING (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Removing from the keyword blocklist requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    delete from public.keyword_blocklist k where k.id = p_id returning k.id;
end
$$;

-- ── flag_patterns ───────────────────────────────────────────────────────────

create or replace function public.admin_flag_pattern_list()
returns table (
  id              uuid,
  pattern         text,
  label           text,
  active          boolean,
  added_by        uuid,
  created_at      timestamptz,
  adder_full_name text,
  adder_email     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = flag_patterns_select (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading the flag patterns requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select f.id, f.pattern, f.label, f.active, f.added_by, f.created_at, pr.full_name, pr.email
      from public.flag_patterns f
      left join public.profiles pr on pr.id = f.added_by
     order by f.active desc, f.label, f.id;
end
$$;

create or replace function public.admin_flag_pattern_add(
  p_pattern text,
  p_label   text,
  p_active  boolean default true
)
returns table (
  id         uuid,
  pattern    text,
  label      text,
  active     boolean,
  added_by   uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = flag_patterns_insert WITH CHECK (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Adding a flag pattern requires the support or super_admin role'
      using errcode = '42501';
  end if;

  -- flag_patterns_pattern_valid still refuses a malformed regex with Postgres's
  -- own message (the panel surfaces it verbatim), exactly as a direct insert.
  insert into public.flag_patterns as f (pattern, label, active, added_by)
  values (p_pattern, p_label, coalesce(p_active, true), auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.pattern, f.label, f.active, f.added_by, f.created_at
      from public.flag_patterns f
     where f.id = v_id;
end
$$;

create or replace function public.admin_flag_pattern_update(p_id uuid, p_active boolean)
returns table (id uuid, active boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = flag_patterns_update USING = WITH CHECK (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Changing a flag pattern requires the support or super_admin role'
      using errcode = '42501';
  end if;

  if p_active is null then
    raise exception 'p_active is required' using errcode = '22023';
  end if;

  return query
    update public.flag_patterns f set active = p_active where f.id = p_id
    returning f.id, f.active;
end
$$;

create or replace function public.admin_flag_pattern_remove(p_id uuid)
returns table (id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = flag_patterns_delete USING (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Deleting a flag pattern requires the support or super_admin role'
      using errcode = '42501';
  end if;

  -- A pattern referenced by a review still raises 23503 on the FK, as before.
  return query
    delete from public.flag_patterns f where f.id = p_id returning f.id;
end
$$;

-- ── chat_block_reasons ──────────────────────────────────────────────────────

-- p_active_only: true = the reason picker's list (lib/chat.ts); null/false = all.
create or replace function public.admin_block_reason_list(p_active_only boolean default false)
returns table (
  id                uuid,
  reason            text,
  active            boolean,
  created_by        uuid,
  created_at        timestamptz,
  creator_full_name text,
  creator_email     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = chat_block_reasons_select (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading the block reasons requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select c.id, c.reason, c.active, c.created_by, c.created_at, pr.full_name, pr.email
      from public.chat_block_reasons c
      left join public.profiles pr on pr.id = c.created_by
     where (not coalesce(p_active_only, false) or c.active)
     order by c.active desc, c.reason, c.id;
end
$$;

create or replace function public.admin_block_reason_add(p_reason text)
returns table (
  id         uuid,
  reason     text,
  active     boolean,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = chat_block_reasons_insert WITH CHECK (SA)
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Adding a block reason requires the super_admin role'
      using errcode = '42501';
  end if;

  insert into public.chat_block_reasons as c (reason, active, created_by)
  values (p_reason, true, auth.uid())
  returning c.id into v_id;

  return query
    select c.id, c.reason, c.active, c.created_by, c.created_at
      from public.chat_block_reasons c
     where c.id = v_id;
end
$$;

-- NULL for either argument leaves that column unchanged (the panel sends a
-- patch of { reason } or { active }).
create or replace function public.admin_block_reason_update(
  p_id     uuid,
  p_reason text    default null,
  p_active boolean default null
)
returns table (id uuid, reason text, active boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = chat_block_reasons_update USING = WITH CHECK (SA)
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Changing a block reason requires the super_admin role'
      using errcode = '42501';
  end if;

  return query
    update public.chat_block_reasons c
       set reason = coalesce(p_reason, c.reason),
           active = coalesce(p_active, c.active)
     where c.id = p_id
    returning c.id, c.reason, c.active;
end
$$;

-- ── conversation_reviews ────────────────────────────────────────────────────

-- Both panel call sites: the review queue by status (ChatReview) and one
-- thread's history (ChatThread). NULL filter = no filter. Order matches the
-- panel: newest decision first on a decided tab (reviewed_at desc, NULLs first
-- as PostgREST sorts), otherwise newest first.
create or replace function public.admin_conversation_review_list(
  p_status          text default null,
  p_conversation_id uuid default null
)
returns table (
  id                    uuid,
  conversation_id       uuid,
  flagged_message_id    uuid,
  matched_pattern_id    uuid,
  source                text,
  status                text,
  reason_id             uuid,
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  created_at            timestamptz,
  reported_reason       text,
  pattern_label         text,
  pattern_pattern       text,
  reason                text,
  flagged_body          text,
  flagged_kind          text,
  flagged_created_at    timestamptz,
  flagged_sender_id     uuid,
  conversation_status   text,
  conversation_user_a   uuid,
  conversation_user_b   uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = conversation_reviews_select (S). Every embed is visible to S (header).
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading conversation reviews requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select r.id, r.conversation_id, r.flagged_message_id, r.matched_pattern_id,
           r.source, r.status, r.reason_id, r.reviewed_by, r.reviewed_at,
           r.created_at, r.reported_reason,
           fp.label, fp.pattern, cbr.reason,
           m.body, m.kind::text, m.created_at, m.sender_id,
           cv.status::text, cv.user_a, cv.user_b
      from public.conversation_reviews r
      left join public.flag_patterns      fp  on fp.id  = r.matched_pattern_id
      left join public.chat_block_reasons cbr on cbr.id = r.reason_id
      left join public.messages           m   on m.id   = r.flagged_message_id
      left join public.conversations      cv  on cv.id  = r.conversation_id
     where (p_status          is null or r.status          = p_status)
       and (p_conversation_id is null or r.conversation_id = p_conversation_id)
     order by case when p_status is not null and p_status <> 'pending' then r.reviewed_at end desc,
              r.created_at desc, r.id desc;
end
$$;

-- ── account_suspensions ─────────────────────────────────────────────────────

-- AccountStatus (one profile, full history) and Accounts (open suspensions for
-- a page of profiles). NULL filter = no filter.
create or replace function public.admin_account_suspension_list(
  p_profile_ids uuid[]  default null,
  p_active      boolean default null
)
returns table (
  id                      uuid,
  profile_id              uuid,
  reason_id               uuid,
  source                  text,
  conversation_review_id  uuid,
  suspended_by            uuid,
  suspended_at            timestamptz,
  reinstated_by           uuid,
  reinstated_at           timestamptz,
  active                  boolean,
  reason                  text,
  suspended_by_full_name  text,
  suspended_by_email      text,
  reinstated_by_full_name text,
  reinstated_by_email     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  -- Gate = account_suspensions_select (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading the suspension ledger requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select s.id, s.profile_id, s.reason_id, s.source, s.conversation_review_id,
           s.suspended_by, s.suspended_at, s.reinstated_by, s.reinstated_at, s.active,
           cbr.reason, sb.full_name, sb.email, rb.full_name, rb.email
      from public.account_suspensions s
      left join public.chat_block_reasons cbr on cbr.id = s.reason_id
      left join public.profiles sb on sb.id = s.suspended_by
      left join public.profiles rb on rb.id = s.reinstated_by
     where (p_profile_ids is null or s.profile_id = any (p_profile_ids))
       and (p_active      is null or s.active     = p_active)
     order by s.suspended_at desc, s.id desc;
end
$$;

-- ── Comments, ownership, grants: authenticated only ─────────────────────────

comment on function public.admin_keyword_list()                         is 'Admin-schema separation 4a. keyword_blocklist read; gate = keyword_blocklist_select (support/super_admin). Raises 42501 otherwise.';
comment on function public.admin_keyword_add(text)                      is 'Admin-schema separation 4a. keyword_blocklist insert; gate = keyword_blocklist_insert (support/super_admin); added_by is always auth.uid(). Raises 42501 otherwise.';
comment on function public.admin_keyword_remove(uuid)                   is 'Admin-schema separation 4a. keyword_blocklist delete; gate = keyword_blocklist_delete (support/super_admin). Returns the deleted id, none if absent. Raises 42501 otherwise.';
comment on function public.admin_flag_pattern_list()                    is 'Admin-schema separation 4a. flag_patterns read; gate = flag_patterns_select (support/super_admin). Raises 42501 otherwise.';
comment on function public.admin_flag_pattern_add(text, text, boolean)  is 'Admin-schema separation 4a. flag_patterns insert; gate = flag_patterns_insert (support/super_admin); added_by is always auth.uid(). Raises 42501 otherwise.';
comment on function public.admin_flag_pattern_update(uuid, boolean)     is 'Admin-schema separation 4a. flag_patterns active toggle; gate = flag_patterns_update (support/super_admin). Returns the updated row, none if absent. Raises 42501 otherwise.';
comment on function public.admin_flag_pattern_remove(uuid)              is 'Admin-schema separation 4a. flag_patterns delete; gate = flag_patterns_delete (support/super_admin). Returns the deleted id, none if absent. Raises 42501 otherwise.';
comment on function public.admin_block_reason_list(boolean)             is 'Admin-schema separation 4a. chat_block_reasons read; gate = chat_block_reasons_select (support/super_admin). Raises 42501 otherwise.';
comment on function public.admin_block_reason_add(text)                 is 'Admin-schema separation 4a. chat_block_reasons insert; gate = chat_block_reasons_insert (super_admin); created_by is always auth.uid(). Raises 42501 otherwise.';
comment on function public.admin_block_reason_update(uuid, text, boolean) is 'Admin-schema separation 4a. chat_block_reasons update; gate = chat_block_reasons_update (super_admin). Returns the updated row, none if absent. Raises 42501 otherwise.';
comment on function public.admin_conversation_review_list(text, uuid)   is 'Admin-schema separation 4a. conversation_reviews read with the panel''s embeds flattened; gate = conversation_reviews_select (support/super_admin). Raises 42501 otherwise.';
comment on function public.admin_account_suspension_list(uuid[], boolean) is 'Admin-schema separation 4a. account_suspensions read with reason and actor names; gate = account_suspensions_select (support/super_admin). Raises 42501 otherwise.';

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_keyword_list()',
    'public.admin_keyword_add(text)',
    'public.admin_keyword_remove(uuid)',
    'public.admin_flag_pattern_list()',
    'public.admin_flag_pattern_add(text, text, boolean)',
    'public.admin_flag_pattern_update(uuid, boolean)',
    'public.admin_flag_pattern_remove(uuid)',
    'public.admin_block_reason_list(boolean)',
    'public.admin_block_reason_add(text)',
    'public.admin_block_reason_update(uuid, text, boolean)',
    'public.admin_conversation_review_list(text, uuid)',
    'public.admin_account_suspension_list(uuid[], boolean)'
  ] loop
    execute format('alter function %s owner to postgres', f);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;
