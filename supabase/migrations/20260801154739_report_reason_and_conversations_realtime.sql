-- ─────────────────────────────────────────────────────────────
-- Two follow-ups to 20260801095820 (chat moderation).
--
--  1. The reporter's stated reason was being thrown away. The Report modal
--     asks "Why are you reporting this?" and then submit_report() took only
--     (conversation_id, message_id) — support saw a pending review with no
--     idea what the user actually complained about.
--
--  2. `conversations` was not in the realtime publication, so a lock or an
--     unlock never reached either party. The client had to infer it by
--     re-reading the row whenever a message arrived, which cannot see an
--     admin resuming a thread at all (no message accompanies that).
--
-- reported_reason is free text ON PURPOSE. The seven strings in
-- REPORT_REASONS are UI copy — product will reword them — and a CHECK
-- constraint against UI copy turns a wording change into a migration. It is
-- also deliberately NOT conversation_reviews.reason_id: that column is the
-- admin's curated verdict from chat_block_reasons, chosen while reviewing.
-- These are two different facts (what the user claimed vs. what an admin
-- concluded) and collapsing them would lose the disagreement between them.
-- ─────────────────────────────────────────────────────────────


-- Part 1 — capture what the reporter said -----------------------------------

alter table public.conversation_reviews
  add column if not exists reported_reason text;

comment on column public.conversation_reviews.reported_reason is
  'Free-text reason the reporting participant selected in the Report modal. '
  'Null for source=''regex_flag'' (no human picked anything). Distinct from '
  'reason_id, which is the admin''s curated verdict from chat_block_reasons.';


-- Part 2 — submit_report() carries it through --------------------------------

-- The old two-arg function must be DROPPED, not replaced: adding a third
-- parameter with a DEFAULT creates an OVERLOAD, and then the existing
-- two-argument call site becomes ambiguous ("function is not unique") and
-- every report in the app starts failing. Dropping also drops its grants,
-- so EXECUTE is re-granted below.
drop function if exists public.submit_report(uuid, uuid);

create or replace function public.submit_report(
  p_conversation_id uuid,
  p_message_id      uuid,
  p_reported_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not authorized to report this conversation';
  end if;

  insert into public.conversation_reviews
    (conversation_id, flagged_message_id, source, status, reported_reason)
  values
    (p_conversation_id, p_message_id, 'user_report', 'pending', p_reported_reason);

  update public.conversations set status = 'under_review' where id = p_conversation_id;
end;
$$;

grant execute on function public.submit_report(uuid, uuid, text) to authenticated, service_role;


-- Part 3 — push the lock instead of polling for it ---------------------------

-- `messages` was already published; this adds the row whose `status` column is
-- the lock itself, so both parties (and a resumed thread) update live.
--
-- REPLICA IDENTITY is deliberately left at DEFAULT (primary key). Realtime
-- filters and RLS-checks postgres_changes UPDATEs against the NEW record,
-- which is all this needs — `id` and `status` are both there. REPLICA
-- IDENTITY FULL would write every column of every conversations UPDATE to the
-- WAL, and bump_conversation() fires one on every single message sent. On a
-- Free-plan project that is a meaningful cost for a payload nothing reads.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
