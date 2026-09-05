-- ─────────────────────────────────────────────────────────────
-- Emit notifications from the moderation functions that already exist.
--
-- Each function below is re-created VERBATIM apart from the notify() calls, so
-- this migration can be read as a diff. Nothing about the moderation logic
-- itself changes.
--
-- Why notifications are written HERE and not from the client:
--   * `notifications` has no insert policy for any role, and notify() has no
--     EXECUTE grant for any role. These functions are SECURITY DEFINER, so they
--     run as the owner and are the only things that can reach it.
--   * The admin panel and the buyer/vendor app are two separate codebases. A
--     rule enforced in only one of them is not enforced.
--
-- Non-disclosure. The recipient is a buyer or a vendor, never an admin. No copy
-- below names the reporter, the matched pattern, the verdict, or the reason.
-- "This conversation is active again", not "resumed after a report about
-- off-platform payment". Same rule the ChatThread banner already follows; a
-- notification added here inherits it.
-- ─────────────────────────────────────────────────────────────


-- ── set_account_status() ────────────────────────────────────────────────────
-- + notify the affected account on both transitions.
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
as $BODY$
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

  -- Deliberately AFTER the `not found` check: no notification for a profile
  -- that does not exist. The reason is NOT included — reason_id is the admin's
  -- private verdict vocabulary, and `source` would leak that a chat review was
  -- behind it.
  if p_new_status = 'suspended' then
    perform public.notify(
      p_profile_id,
      'account_suspended',
      'Your account has been suspended',
      'You cannot send messages or place calls while your account is suspended. '
      || 'Contact support if you think this is a mistake.'
    );
  else
    perform public.notify(
      p_profile_id,
      'account_reinstated',
      'Your account is active again',
      'You can message and call as normal.'
    );
  end if;
end;
$BODY$;

grant execute on function public.set_account_status(uuid, public.account_status_type, uuid, text, uuid)
  to authenticated, service_role;


-- ── check_message_flag_patterns() ───────────────────────────────────────────
-- + notify BOTH participants after locking. Both, not just the sender: the lock
-- is on the thread, not on a role, and the other party's composer goes dead too
-- — they are entitled to know why. Mirrors the ChatThread banner, which is
-- already identical for both sides.
create or replace function public.check_message_flag_patterns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $BODY$
declare
  v_pattern_id uuid;
  v_user_a     uuid;
  v_user_b     uuid;
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
   where id = new.conversation_id
  returning user_a, user_b into v_user_a, v_user_b;

  insert into public.conversation_reviews
    (conversation_id, flagged_message_id, matched_pattern_id, source, status)
  values
    (new.conversation_id, new.id, v_pattern_id, 'regex_flag', 'pending');

  -- matched_pattern_id is NOT mentioned. Telling a sender which regex caught
  -- them is a map for evading it.
  perform public.notify(
    v_user_a, 'chat_locked', 'A conversation is under review',
    'Messages are paused in this chat while our team takes a look.',
    new.conversation_id
  );
  perform public.notify(
    v_user_b, 'chat_locked', 'A conversation is under review',
    'Messages are paused in this chat while our team takes a look.',
    new.conversation_id
  );

  return null;
end;
$BODY$;

drop trigger if exists trg_messages_flag_patterns on public.messages;
create trigger trg_messages_flag_patterns
  after insert on public.messages
  for each row execute function public.check_message_flag_patterns();


-- ── submit_report() ─────────────────────────────────────────────────────────
-- + notify the NON-reporting participant only. The reporter already knows; the
-- other party is the one whose chat just went quiet. The notice must not say a
-- report happened — in a two-person thread that identifies the reporter by
-- elimination — so it reads exactly like a pattern-triggered lock.
--
-- CREATE OR REPLACE, not DROP-then-CREATE: the signature is unchanged, and
-- 20260801154739 documents why a second overload here would break every call
-- site with "function is not unique".
create or replace function public.submit_report(
  p_conversation_id uuid,
  p_message_id      uuid,
  p_reported_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $BODY$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_other  uuid;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not authorized to report this conversation';
  end if;

  insert into public.conversation_reviews
    (conversation_id, flagged_message_id, source, status, reported_reason)
  values
    (p_conversation_id, p_message_id, 'user_report', 'pending', p_reported_reason);

  update public.conversations set status = 'under_review' where id = p_conversation_id
  returning user_a, user_b into v_user_a, v_user_b;

  v_other := case when v_user_a = auth.uid() then v_user_b else v_user_a end;

  perform public.notify(
    v_other, 'chat_locked', 'A conversation is under review',
    'Messages are paused in this chat while our team takes a look.',
    p_conversation_id
  );
end;
$BODY$;

grant execute on function public.submit_report(uuid, uuid, text) to authenticated, service_role;
