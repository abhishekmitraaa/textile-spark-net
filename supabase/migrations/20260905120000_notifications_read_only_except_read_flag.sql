-- ─────────────────────────────────────────────────────────────
-- notifications: a recipient may mark one read. Nothing else.
--
-- THE HOLE THIS CLOSES (found by scripts/chat-pipeline-matrix.mjs, case T10.3):
--
--   notifications_mark_read is
--     for update using (profile_id = auth.uid()) with check (profile_id = auth.uid())
--
--   which correctly stops you touching SOMEONE ELSE's row — and says nothing
--   about WHICH COLUMN you may change on your own. So a signed-in user could
--   PATCH their own notification's title, body and kind. Verified against the
--   live project with a real login: the row came back reading
--   `title = "TAMPERED", kind = "account_reinstated"`.
--
--   Why that matters beyond tidiness: these rows are the platform speaking. The
--   whole reason `notifications` has no INSERT policy for any role, and why
--   notify() carries no EXECUTE grant, is that a client able to author one could
--   manufacture "Your account has been reinstated". Leaving UPDATE
--   unconstrained handed back exactly that capability through the side door —
--   suspend-notice in, reinstatement-notice out, same row.
--
-- RLS cannot express this. A policy sees rows, not columns; "which column may
-- change" is a BEFORE trigger's job. That is the same division of labour this
-- schema already uses for products.status (enforce_products_moderation),
-- profiles.is_admin/admin_role/account_status (enforce_admin_grants), and
-- conversations.status (enforce_conversation_status) — and the reason each of
-- those is a trigger rather than a policy.
--
-- The `current_user <> 'authenticated'` early return is load-bearing, exactly as
-- it is in its three siblings: notify() is SECURITY DEFINER and runs as the
-- owner, and the service role has to stay able to correct data. Remove it and
-- the platform can no longer write its own notifications.
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_notification_updates()
returns trigger
language plpgsql
set search_path to 'public'
as $BODY$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- `read` is the one column a recipient owns. Everything else is the
  -- platform's assertion about what the platform did.
  if new.id              is distinct from old.id
     or new.profile_id      is distinct from old.profile_id
     or new.kind            is distinct from old.kind
     or new.title           is distinct from old.title
     or new.body            is distinct from old.body
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at      is distinct from old.created_at then
    raise exception 'only the read flag may be changed on a notification'
      using errcode = '42501';
  end if;

  return new;
end;
$BODY$;

drop trigger if exists trg_notifications_read_only on public.notifications;
create trigger trg_notifications_read_only
  before update on public.notifications
  for each row execute function public.enforce_notification_updates();
