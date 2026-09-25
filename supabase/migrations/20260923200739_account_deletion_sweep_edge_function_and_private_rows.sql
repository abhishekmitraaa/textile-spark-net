-- MPF-7, parts 1 and 2 (Phase 16 of the My Profile brief, 2026-09-24).
--
-- 1. Avatar files. anonymize_account() nulls avatar_url, but SQL cannot delete a
--    Storage object. The daily sweep now posts to the `account-deletion-sweep`
--    edge function (the embedding-worker shape: pg_cron -> pg_net -> function,
--    service-role key from Vault). Per due request the function reads the
--    account's avatar objects and avatar_url, anonymizes through
--    complete_account_deletion(), and only then deletes `avatars/<user id>/` through
--    the Storage API, recording the result with record_account_storage_cleanup().
--    - Files go AFTER the anonymization: anonymize_account() can refuse, and a
--      refused deletion must not cost the person their photo.
--    - A Storage failure never blocks the anonymization. It is recorded
--      (storage_error), and every run retries completed requests whose files
--      are not confirmed gone (storage_cleaned_at is null).
--    - The cron job keeps a SQL backstop: anything due for more than a day (the
--      function did not run, or failed) is anonymized by
--      process_due_account_deletions(), so the 14-day promise never waits on the
--      edge function. Its files go on the function's next run.
--
-- 2. Private activity rows. anonymize_account() now deletes the account's own
--    saved items, saved folders (saved_folder_items CASCADE from saved_folders:
--    read from pg_constraint), saved videos, follows made by the account, recently
--    viewed, video likes and notifications. Every FK into profiles, buyer_profiles
--    and auth.users was listed first:
--    - Kept, shared with another party: rfqs, quotes, conversations, messages,
--      calls, reviews, product_reviews, service_reviews.
--    - Kept, records about the account: account_deletion_requests,
--      admin.account_suspensions.
--    - engagement_events: vendors' analytics count these, so the rows stay and
--      only viewer_id is cleared, which is what the FK's own ON DELETE SET NULL
--      would do.
--    - Vendor-side and admin tables: a deleted account is never a vendor or an
--      admin (anonymize_account() refuses both).
--    - embed_query_rate_limit.caller (no FK) is pruned daily by its own job.
--    Deleting video likes fires sync_video_likes_count, which lowers each video's
--    count; deleting follows lowers the vendor's follower count. Both are right:
--    the person no longer likes or follows anything.

alter table public.account_deletion_requests
  add column storage_cleaned_at timestamptz,
  add column storage_error      text;

comment on column public.account_deletion_requests.storage_cleaned_at is
  'When the account-deletion-sweep function confirmed avatars/<user id>/ empty. NULL on a completed request means the next run retries.';
comment on column public.account_deletion_requests.storage_error is
  'The last avatar-cleanup failure, kept until a run confirms the folder empty.';

-- ── anonymize_account(): as before, plus the private activity rows ───────────
create or replace function public.anonymize_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.account_status_type;
begin
  select account_status into v_status from public.profiles where id = p_user for update;
  if not found then
    raise exception 'profile % not found', p_user;
  end if;
  if v_status = 'deleted' then
    return;  -- already done; the sweep may retry a row
  end if;
  -- The same refusals as account_deletion_blocker(), re-checked here: any of them
  -- could have become true during the 14 days.
  if v_status <> 'active' then
    raise exception 'account % is %: deletion waits for support', p_user, v_status;
  end if;
  if exists (select 1 from admin.admin_users where id = p_user) then
    raise exception 'account % is an admin: not deleted', p_user;
  end if;
  if exists (select 1 from public.vendor_profiles where id = p_user) then
    raise exception 'account % has a vendor profile: not deleted', p_user;
  end if;

  -- The shared identity row. Counterparties see "Deleted user" on the RFQs, quotes,
  -- chats and reviews that stay.
  update public.profiles
     set full_name = 'Deleted user',
         email = null,
         phone = null,
         avatar_url = null,
         account_status = 'deleted'
   where id = p_user;

  update public.buyer_profiles
     set display_name = null, company = null, city = null, job_title = null,
         department = null, business_type = null, website = null, industry = null,
         street = null, business_city = null, state = null, postal_code = null,
         country = null, gstin = null, pan = null,
         social = '{}'::jsonb, preferred_categories = '{}'
   where id = p_user;

  -- Copies of the name on the review rows themselves.
  update public.reviews         set reviewer_name = 'Deleted user', reviewer_company = null where buyer_id = p_user;
  update public.product_reviews set reviewer_name = 'Deleted user' where buyer_id = p_user;
  update public.service_reviews set reviewer_name = 'Deleted user' where buyer_id = p_user;

  -- Private activity: this person's own rows, which are no one else's history
  -- (MPF-7). saved_folder_items go with their folders (ON DELETE CASCADE).
  delete from public.saved_items     where buyer_id    = p_user;
  delete from public.saved_folders   where buyer_id    = p_user;
  delete from public.saved_videos    where buyer_id    = p_user;
  delete from public.follows         where follower_id = p_user;
  delete from public.recently_viewed where buyer_id    = p_user;
  delete from public.video_likes     where buyer_id    = p_user;
  delete from public.notifications   where profile_id  = p_user;
  -- Vendors' analytics keep the events; only the link to the person goes.
  update public.engagement_events set viewer_id = null where viewer_id = p_user;

  -- The login. Sessions alone are not enough: with the email and identities left,
  -- the user signs straight back in to this row. The four GoTrue string columns
  -- are left as '' (never NULL: GoTrue answers 500 on NULL there). The ban is a
  -- finite 100 years, GoTrue's own idiom for "permanent": an 'infinity'
  -- timestamp risks GoTrue (Go) failing to read the row, which would break the
  -- admin user listing too, not just this account.
  delete from auth.sessions        where user_id = p_user;
  delete from auth.refresh_tokens  where user_id = p_user::text;
  delete from auth.mfa_factors     where user_id = p_user;
  delete from auth.one_time_tokens where user_id = p_user;
  delete from auth.identities      where user_id = p_user;
  update auth.users
     set email = null,
         phone = null,
         encrypted_password = '',
         email_change = '',
         email_change_token_new = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '100 years'
   where id = p_user;
end;
$$;

-- ── One request: the per-row step of the sweep ───────────────────────────────
-- Never raises: a refusal or error is recorded in last_error and the request
-- stays 'cooling_off' for the next run. Returns 'completed', 'not_due' (cancelled,
-- already done, or not yet due), 'not_found', or 'failed: <reason>'.
create or replace function public.complete_account_deletion(p_request uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.account_deletion_requests where id = p_request;
  if not found then
    return 'not_found';
  end if;
  begin
    perform pg_advisory_xact_lock(hashtext('account_deletion:' || v_user::text));
    -- Re-read under the lock: a cancel may have landed since the caller's list.
    perform 1
       from public.account_deletion_requests
      where id = p_request and status = 'cooling_off' and scheduled_for <= now()
        for update;
    if not found then
      return 'not_due';
    end if;
    perform public.anonymize_account(v_user);
    update public.account_deletion_requests
       set status = 'completed', completed_at = now(), last_error = null
     where id = p_request;
    return 'completed';
  exception when others then
    update public.account_deletion_requests
       set last_error = left(sqlerrm, 500)
     where id = p_request;
    return 'failed: ' || left(sqlerrm, 200);
  end;
end;
$$;

-- ── The SQL sweep, now the backstop ──────────────────────────────────────────
-- Never raises (a pg_cron job is one transaction, so a RAISE would roll back
-- every account already done in the run). p_min_overdue lets the cron job take
-- only what the edge function should already have done.
drop function public.process_due_account_deletions();
create function public.process_due_account_deletions(p_min_overdue interval default interval '0 seconds')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id
      from public.account_deletion_requests
     where status = 'cooling_off' and scheduled_for <= now() - p_min_overdue
     order by scheduled_for
  loop
    if public.complete_account_deletion(r.id) = 'completed' then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ── The edge function's work list ────────────────────────────────────────────
-- 'due': cooling-off ended; read BEFORE anonymizing, so avatar_url is still there.
-- 'storage': anonymized, but its avatar folder not yet confirmed empty.
-- avatar_paths: object names in the avatars bucket under `<user id>/`.
create or replace function public.account_deletion_sweep_list()
returns table (request_id uuid, user_id uuid, phase text, avatar_url text, avatar_paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         r.user_id,
         case when r.status = 'cooling_off' then 'due' else 'storage' end,
         p.avatar_url,
         coalesce((select array_agg(o.name order by o.name)
                     from storage.objects o
                    where o.bucket_id = 'avatars' and o.name like r.user_id::text || '/%'), '{}')
    from public.account_deletion_requests r
    left join public.profiles p on p.id = r.user_id
   where (r.status = 'cooling_off' and r.scheduled_for <= now())
      or (r.status = 'completed' and r.storage_cleaned_at is null)
   order by r.scheduled_for;
$$;

-- ── The edge function reports its Storage result ─────────────────────────────
-- The database re-lists the folder itself: 'cleaned' only when no object is left,
-- whatever the caller says. Otherwise 'pending', and the error is kept.
create or replace function public.record_account_storage_cleanup(p_request uuid, p_error text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_left integer;
begin
  select user_id into v_user
    from public.account_deletion_requests
   where id = p_request and status = 'completed';
  if not found then
    return 'not_completed';
  end if;
  select count(*) into v_left
    from storage.objects
   where bucket_id = 'avatars' and name like v_user::text || '/%';
  if p_error is null and v_left = 0 then
    update public.account_deletion_requests
       set storage_cleaned_at = now(), storage_error = null
     where id = p_request;
    return 'cleaned';
  end if;
  update public.account_deletion_requests
     set storage_error = left(coalesce(p_error, v_left || ' avatar object(s) remain'), 500)
   where id = p_request;
  return 'pending';
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke all on function public.anonymize_account(uuid)                    from public, anon, authenticated, service_role;
revoke all on function public.complete_account_deletion(uuid)            from public, anon, authenticated, service_role;
revoke all on function public.process_due_account_deletions(interval)    from public, anon, authenticated, service_role;
revoke all on function public.account_deletion_sweep_list()              from public, anon, authenticated, service_role;
revoke all on function public.record_account_storage_cleanup(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.complete_account_deletion(uuid)            to service_role;
grant execute on function public.account_deletion_sweep_list()              to service_role;
grant execute on function public.record_account_storage_cleanup(uuid, text) to service_role;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- Same time as before (03:41 UTC). 1: the function, only when there is work and
-- the Vault secret exists (a missing secret leaves this inert, never failing).
-- 2: the SQL backstop for anything overdue by a day.
select cron.unschedule('account-deletion-sweep')
 where exists (select 1 from cron.job where jobname = 'account-deletion-sweep');
select cron.schedule(
  'account-deletion-sweep',
  '41 3 * * *',
  $job$
  select net.http_post(
    url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/account-deletion-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'service_role_key')
    and exists (select 1 from public.account_deletion_requests
                 where (status = 'cooling_off' and scheduled_for <= now())
                    or (status = 'completed' and storage_cleaned_at is null));
  select public.process_due_account_deletions(interval '1 day');
  $job$
);

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array['public.complete_account_deletion(uuid)', 'public.account_deletion_sweep_list()',
                           'public.record_account_storage_cleanup(uuid, text)'] loop
    if not has_function_privilege('service_role', f, 'EXECUTE')
       or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: % must be service_role only', f;
    end if;
  end loop;
  foreach f in array array['public.anonymize_account(uuid)', 'public.process_due_account_deletions(interval)'] loop
    if has_function_privilege('service_role', f, 'EXECUTE')
       or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: % must be postgres only', f;
    end if;
  end loop;
  if not exists (select 1 from cron.job where jobname = 'account-deletion-sweep'
                  and command like '%/functions/v1/account-deletion-sweep%'
                  and command like '%process_due_account_deletions(interval ''1 day'')%') then
    raise exception 'self-check: the account-deletion-sweep job is not the new command';
  end if;
  if (select count(*) from cron.job where jobname = 'account-deletion-sweep') <> 1 then
    raise exception 'self-check: expected exactly one account-deletion-sweep job';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.saved_folder_items'::regclass
                  and confrelid = 'public.saved_folders'::regclass and confdeltype = 'c') then
    raise exception 'self-check: saved_folder_items no longer cascades from saved_folders';
  end if;
end;
$$;
