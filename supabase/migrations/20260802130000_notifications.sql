-- ─────────────────────────────────────────────────────────────
-- notifications — the table behind /notifications and the header bell.
--
-- Until now that page was 100% mock: `src/lib/notificationsStore.ts` seeded 12
-- hardcoded rows into localStorage and no Supabase call was involved. Meanwhile
-- moderation was doing things TO people — locking their chat, suspending their
-- account — and telling them nothing outside the thread they happened to have
-- open.
--
-- Written ONLY by SECURITY DEFINER functions. There is deliberately no insert
-- policy for any client role: a notification is an assertion by the platform
-- about what the platform did, and a client that can forge one can forge
-- "Your account has been reinstated".
--
-- ── The non-disclosure rule, which is a schema-shaping constraint ──
--
-- Copy written into `title`/`body` is read by the buyer or vendor, NOT by an
-- admin. It must never reveal who reported whom, which pattern matched, or the
-- reviewer's reasoning. "This conversation is active again" — never "resumed
-- after a report about off-platform payment". That is the same rule the
-- buyer-side chat banner already follows, and the reason `reason_id` is
-- deliberately NOT a column here: there would be no safe way to render it.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  -- Un-CHECKed on purpose, matching conversation_reviews.reported_reason's
  -- reasoning: the client maps unknown kinds to a neutral icon, so adding a
  -- kind should not require a migration. The four moderation kinds today are
  -- 'account_suspended', 'account_reinstated', 'chat_locked', 'chat_resumed'.
  kind            text not null,
  title           text not null,
  body            text,
  -- Nulled rather than cascade-deleted: a "your chat was locked" notice is
  -- still true after the conversation is gone, it just stops being a link.
  conversation_id uuid references public.conversations(id) on delete set null,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);

-- The bell only ever asks "my unread, newest first".
create index if not exists notifications_inbox_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (profile_id) where not read;

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (profile_id = auth.uid());

-- Marking read is the only client write. Both USING and WITH CHECK are needed:
-- USING alone would let a recipient re-target a row's profile_id to someone
-- else on the way through.
drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update using (profile_id = auth.uid())
          with check (profile_id = auth.uid());

-- Dismiss. The page has always had an X on each card; without this it would
-- silently no-op (an RLS-denied DELETE matches zero rows and reports success).
drop policy if exists notifications_dismiss on public.notifications;
create policy notifications_dismiss on public.notifications
  for delete using (profile_id = auth.uid());

-- NO insert policy, for any role. See the header.


-- ── The single writer helper ────────────────────────────────────────────────
-- SECURITY DEFINER so the callers below (all themselves SECURITY DEFINER) can
-- write rows for a user who is not auth.uid() — which is the entire point: the
-- admin acts, the affected party is notified.
create or replace function public.notify(
  p_profile_id      uuid,
  p_kind            text,
  p_title           text,
  p_body            text default null,
  p_conversation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_profile_id is null then
    return;
  end if;
  insert into public.notifications (profile_id, kind, title, body, conversation_id)
  values (p_profile_id, p_kind, p_title, p_body, p_conversation_id);
end;
$$;

-- Callable only from inside other SECURITY DEFINER functions (which run as the
-- owner). No client role gets EXECUTE — otherwise the missing insert policy
-- would be trivially routed around.
revoke all on function public.notify(uuid, text, text, text, uuid) from public, anon, authenticated;


-- ── Realtime, so the bell moves without a reload ────────────────────────────
-- REPLICA IDENTITY stays DEFAULT for the same reason conversations' does
-- (20260801154739): postgres_changes filters and RLS-checks against the NEW
-- record, and FULL would write every column of every UPDATE to the WAL on a
-- Free-plan project for a payload.old nothing reads.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
