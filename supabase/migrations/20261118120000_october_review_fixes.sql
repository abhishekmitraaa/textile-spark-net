-- The 2026-10-13 buyer-side code review: the three database fixes that never reached production.
--
-- They sat on branch fix/review-2026-10-13 (commit 0330b78) as migrations 20261013100000, 100100 and 100300, whose
-- numbers other files have since taken. A read-only comparison with production on 2026-11-18 showed production still
-- has the old enforce_conversation_status, submit_report and csp_report_ingest, so they are brought here unchanged.
-- (Item 5, the functions asking Auth for the caller, and the CSP endpoint's host check are in the same release; the
-- ad payment fix went out on 2026-11-16.)

-- ══ 1. A chat participant can't rewrite the conversation (was 20261013100000) ══
-- A chat participant could rewrite who is in the conversation (code review 2026-10-13).
--
-- conversations_update admits either participant, and every column is granted to
-- `authenticated`, so on a thread they belong to an account could PATCH user_a / user_b,
-- last_message, last_message_at and created_at. The WITH CHECK only asks that the caller is
-- still a member afterwards. So one side could swap the other for a third account (or for
-- nobody they chat with): the removed party stops seeing the thread and can no longer
-- report it, and an unrelated account gains a thread it never opened. The inbox preview
-- (last_message) could be forged the same way.
--
-- A row policy is not a column policy (documentation/claude.md). The only guard here,
-- enforce_conversation_status(), protected `status` alone. It now protects the whole row:
--   * INSERT by a signed-in account: status, last_message and both dates take their
--     defaults, whatever the browser sent.
--   * UPDATE by a signed-in account: id, user_a, user_b, created_at, last_message and
--     last_message_at cannot change. Status stays with support and super_admin, as before.
--
-- Nothing legitimate is refused: the app's only direct write is the find-or-create upsert
-- in src/lib/queries/chat.ts, which sets user_a / user_b to the values the row already
-- has. last_message is moved by bump_conversation() and status by the moderation
-- functions, all SECURITY DEFINER, so current_user is not 'authenticated' there.

create or replace function public.enforce_conversation_status()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'active';  -- a brand-new thread is never born locked
    new.last_message := null;
    new.last_message_at := now();
    new.created_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_a is distinct from old.user_a
     or new.user_b is distinct from old.user_b
     or new.created_at is distinct from old.created_at then
    raise exception 'A conversation''s participants cannot be changed'
      using errcode = '42501';
  end if;

  if new.last_message is distinct from old.last_message
     or new.last_message_at is distinct from old.last_message_at then
    raise exception 'A conversation''s last message is set by its messages only'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'Conversation status is set by moderation only'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- ══ 2. Reporting a chat is checked and limited (was 20261013100100) ══
-- Reporting a chat had no limits (code review 2026-10-13).
--
-- submit_report() locks the thread for both sides and files a pending review. Three gaps:
--   1. p_message_id was stored without checking it belongs to the conversation, so a
--      report could point moderators at a message from a different thread.
--   2. Every call filed another pending review and sent the other side another
--      "chat_locked" notice, even while a report on the same thread was still waiting.
--   3. Nothing recorded who reported, so nothing could limit how often one account does it.
--
-- Now:
--   1. A message id that isn't in the conversation is refused.
--   2. While a user report on the thread is pending, another report changes nothing: no
--      new row, no new notice. The thread is already locked and already in the queue.
--   3. The reporter is recorded (reported_by) and one account may file at most 10 reports
--      in 24 hours. The eleventh is refused with a message the app can show.
--
-- Not changed here: a report still locks the thread at once. That is the product rule from
-- 20260801095820 and a decision for Mitra, not for this fix.

alter table admin.conversation_reviews
  add column if not exists reported_by uuid references public.profiles(id) on delete set null;

comment on column admin.conversation_reviews.reported_by is
  'The participant who filed a user_report. Null for regex flags and for reports filed before 2026-10-13.';

create index if not exists conversation_reviews_reporter_idx
  on admin.conversation_reviews (reported_by, created_at desc)
  where reported_by is not null;

create or replace function public.submit_report(p_conversation_id uuid, p_message_id uuid, p_reported_reason text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me     uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_other  uuid;
begin
  if not coalesce(public.is_conversation_member(p_conversation_id), false) then
    raise exception 'not authorized to report this conversation';
  end if;

  if p_message_id is not null and not exists (
    select 1 from public.messages m
     where m.id = p_message_id and m.conversation_id = p_conversation_id
  ) then
    raise exception 'that message is not part of this conversation';
  end if;

  -- One thread at a time, so two reports of the same thread can't both pass the check below.
  perform 1 from public.conversations c where c.id = p_conversation_id for update;

  -- Already reported and waiting for a moderator: nothing more to do.
  if exists (
    select 1 from admin.conversation_reviews r
     where r.conversation_id = p_conversation_id
       and r.source = 'user_report' and r.status = 'pending'
  ) then
    return;
  end if;

  -- Counted under a lock per reporter (claude.md: a limit that counts rows is checked under a lock), so two reports
  -- of different chats at once can't both pass at 9 (commit security review, 2026-11-18).
  perform pg_advisory_xact_lock(hashtextextended('cosora.submit_report:' || v_me::text, 0));
  if (select count(*) from admin.conversation_reviews r
       where r.reported_by = v_me
         and r.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You have reported several chats today. Please try again tomorrow.'
      using errcode = 'P0001';
  end if;

  insert into admin.conversation_reviews
    (conversation_id, flagged_message_id, source, status, reported_reason, reported_by)
  values
    (p_conversation_id, p_message_id, 'user_report', 'pending', left(p_reported_reason, 2000), v_me);

  update public.conversations set status = 'under_review' where id = p_conversation_id
  returning user_a, user_b into v_user_a, v_user_b;

  v_other := case when v_user_a = v_me then v_user_b else v_user_a end;

  -- The notice must not say a report happened: in a two-person thread that
  -- identifies the reporter by elimination.
  perform public.notify(
    v_other, 'chat_locked', 'A conversation is under review',
    'Messages are paused in this chat while our team takes a look.',
    p_conversation_id
  );
end;
$function$;

revoke execute on function public.submit_report(uuid, uuid, text) from public, anon;
grant execute on function public.submit_report(uuid, uuid, text) to authenticated, service_role;

-- ══ 3. A full CSP report table makes room for new reports (was 20261013100300) ══
-- The CSP report table could be filled once and then went blind (code review 2026-10-13).
--
-- csp_report_ingest() is callable with the anon key, because browsers post reports without
-- credentials. It stopped taking new rows at 5,000 and from then on only counted up rows it
-- already had. 250 requests of 20 made-up reports reach 5,000, and after that a real, new
-- violation from www.cosora.in was dropped. The Report-Only rollout exists to find exactly
-- those.
--
-- The table stays bounded at 5,000 rows, but a full table now makes room: a new report
-- takes over the least useful row, the one seen fewest times and longest ago. A violation
-- real traffic keeps hitting has a high count and stays; a made-up one is seen once and is
-- the first to go. Filling the table no longer hides anything that happens afterwards.
--
-- The row is rewritten in place (no delete), so the size never moves.

create or replace function public.csp_report_ingest(p_reports jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r jsonb;
  v_directive text;
  v_blocked text;
  v_path text;
  v_source text;
  v_count bigint;
begin
  if p_reports is null or jsonb_typeof(p_reports) <> 'array' then
    return;
  end if;

  select count(*) into v_count from public.csp_violations;

  for r in select value from jsonb_array_elements(p_reports) limit 20 loop
    if jsonb_typeof(r) <> 'object' then continue; end if;

    v_directive := left(coalesce(nullif(btrim(r ->> 'directive'), ''), 'unknown'), 64);
    v_blocked   := left(coalesce(nullif(btrim(r ->> 'blocked'), ''), 'unknown'), 200);
    v_path      := left(coalesce(nullif(btrim(r ->> 'document_path'), ''), '/'), 200);
    v_source    := left(coalesce(btrim(r ->> 'source'), ''), 300);

    update public.csp_violations v
       set hits = v.hits + 1, last_seen = now()
     where v.directive = v_directive and v.blocked = v_blocked
       and v.document_path = v_path and v.source = v_source;
    if found then continue; end if;

    if v_count >= 5000 then
      -- Full: the new report takes over the row seen least and longest ago, always. The anon caller controls the hit
      -- counts, so they can't be trusted to protect rows: protecting rows seen twice let a flood of doubled made-up
      -- reports lock the table against every new one (commit security review, 2026-11-18). Always recycling means a
      -- new violation is always recorded; at worst a flood pushes out rarely seen rows.
      update public.csp_violations v
         set directive = v_directive, blocked = v_blocked,
             document_path = v_path, source = v_source,
             sample = left(nullif(r ->> 'sample', ''), 120),
             disposition = left(coalesce(nullif(r ->> 'disposition', ''), 'report'), 16),
             hits = 1, first_seen = now(), last_seen = now()
       where v.id = (
               select o.id from public.csp_violations o
                order by o.hits asc, o.last_seen asc
                limit 1
                for update skip locked
             );
    else
      insert into public.csp_violations as v
             (directive, blocked, document_path, source, sample, disposition)
      values (v_directive, v_blocked, v_path, v_source,
              left(nullif(r ->> 'sample', ''), 120),
              left(coalesce(nullif(r ->> 'disposition', ''), 'report'), 16))
      on conflict (directive, blocked, document_path, source) do update
         set hits = v.hits + 1,
             last_seen = now(),
             sample = coalesce(v.sample, excluded.sample);
      v_count := v_count + 1;
    end if;
  end loop;
end
$fn$;

-- Finding the row to recycle must not scan 5,000 rows on every new report.
create index if not exists csp_violations_least_seen_idx
  on public.csp_violations (hits, last_seen);

revoke execute on function public.csp_report_ingest(jsonb) from public;
grant execute on function public.csp_report_ingest(jsonb) to anon, authenticated;

do $check$
begin
  if position('user_a is distinct from old.user_a' in pg_get_functiondef('public.enforce_conversation_status()'::regprocedure)) = 0 then
    raise exception 'self-check: conversations participants are not guarded';
  end if;
  if position('reported_by' in pg_get_functiondef('public.submit_report(uuid, uuid, text)'::regprocedure)) = 0 then
    raise exception 'self-check: submit_report has no reporter limit';
  end if;
  if position('skip locked' in pg_get_functiondef('public.csp_report_ingest(jsonb)'::regprocedure)) = 0 then
    raise exception 'self-check: a full CSP table still drops new reports';
  end if;
end
$check$;
