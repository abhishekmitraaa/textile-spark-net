-- Account deletion, part 2 of 2 (Phase 2 of the My Profile brief, 2026-09-23):
-- request -> emailed 6-digit code -> 14-day cooling-off -> daily anonymization.
-- Part 1 (the migration before this) added the 'deleted' account status.
--
-- ── The flow ─────────────────────────────────────────────────────────────────
-- 1. /profile/help "Delete my account" calls the `account-deletion` edge
--    function. It calls issue_account_deletion_code() as service_role, which
--    opens (or reuses) a 'pending_confirmation' request and returns a fresh code,
--    and the function emails the code through Resend. The code never reaches the
--    browser any other way.
-- 2. The user types the code: confirm_account_deletion() -> 'cooling_off',
--    scheduled_for = now() + 14 days. /profile shows a banner with a Cancel button.
-- 3. cancel_account_deletion() -> 'cancelled' at any point before the sweep.
-- 4. pg_cron `account-deletion-sweep` (daily 03:41 UTC) runs
--    process_due_account_deletions(): anonymize_account() on each due request,
--    then 'completed'.
--
-- ── Where this deviates from the brief (each deviation approved) ────────────
-- * Every state change goes through a SECURITY DEFINER function, and clients hold
--   SELECT only. With a client INSERT/UPDATE policy, a stolen session could write
--   status = 'cooling_off' with a past scheduled_for and skip both the emailed code
--   and the 14 days.
-- * The code goes to auth.users.email (confirmed, and changeable only through
--   GoTrue's own verified flow), never to profiles.email, which the user can edit:
--   a hijacker could otherwise point it at themselves first. The code is stored
--   only as sha256(request id || ':' || code), in a table no client role can read.
--   It lasts 10 minutes and allows 5 attempts, with at most one send per 60 s and
--   5 per request.
-- * Anonymization is anonymize_account(), run by cron as postgres, and not
--   set_account_status(). That function requires is_admin(), which keys on
--   auth.uid() and is false under cron, and its non-'suspended' branch sets
--   'active', which would have revived a deleted account. It is patched below to
--   refuse 'deleted' in both directions instead.
-- * Rows are scrubbed, never deleted. rfqs, messages, both sides of conversations,
--   calls, follows and saved items CASCADE from profiles, and reviews /
--   product_reviews / service_reviews CASCADE from auth.users (read from
--   pg_constraint before writing this, the way the 2026-09-09 vendor_contracts
--   cascade was investigated). Deleting either row would erase other people's
--   history: the quotes on the buyer's RFQs, the vendor's side of every chat, and
--   the vendor's reviews.
-- * Revoking sessions does not close an account: with the email and identities
--   left, the user signs straight back in with Google or email. anonymize_account()
--   also removes the login email, phone and identities, and bans the auth user.
-- * Vendors, admins and suspended accounts cannot request deletion here ("contact
--   support"). A vendor's signed contracts are append-only records and its
--   catalogue is part of buyers' history. An admin's id is referenced by
--   moderation logs. A suspended account is under review.
-- * reviews.reviewer_name / reviewer_company, product_reviews.reviewer_name and
--   service_reviews.reviewer_name are copies of the buyer's name kept on the
--   review rows, so they are scrubbed too. The brief listed profiles and
--   buyer_profiles only.
--
-- ── Not done here, logged in documentation/myprofileflags.md ─────────────────
-- An access token issued before the sweep stays valid for up to its 1-hour
-- lifetime (INSERTs are already refused through account_is_active(); the two
-- identity rows are guarded below). Avatar files stay in Storage, where SQL
-- cannot delete them. A phone-only account has no email to receive a code.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table public.account_deletion_requests (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles(id) on delete cascade,
  status            text        not null default 'pending_confirmation'
                    check (status in ('pending_confirmation', 'cooling_off', 'cancelled', 'completed')),
  requested_at      timestamptz not null default now(),
  confirmed_at      timestamptz,
  scheduled_for     timestamptz,
  cancelled_at      timestamptz,
  completed_at      timestamptz,
  codes_sent        integer     not null default 0,
  last_code_sent_at timestamptz,
  code_expires_at   timestamptz,
  last_error        text,
  constraint account_deletion_requests_cooling_off_is_scheduled
    check (status <> 'cooling_off' or (confirmed_at is not null and scheduled_for is not null)),
  constraint account_deletion_requests_cancelled_has_time
    check (status <> 'cancelled' or cancelled_at is not null),
  constraint account_deletion_requests_completed_has_time
    check (status <> 'completed' or completed_at is not null)
);

comment on table public.account_deletion_requests is
  'One row per "Delete my account" request. Written only by the account-deletion functions; clients hold SELECT on their own rows.';

-- At most one open request per account.
create unique index account_deletion_requests_one_open
  on public.account_deletion_requests (user_id)
  where status in ('pending_confirmation', 'cooling_off');

-- The daily sweep's scan.
create index account_deletion_requests_due
  on public.account_deletion_requests (scheduled_for)
  where status = 'cooling_off';

create table public.account_deletion_otps (
  request_id uuid        primary key references public.account_deletion_requests(id) on delete cascade,
  code_hash  text        not null,
  expires_at timestamptz not null,
  attempts   integer     not null default 0,
  sent_at    timestamptz not null default now()
);

comment on table public.account_deletion_otps is
  'The live code for a pending account-deletion request, as sha256(request id || '':'' || code). No client role, service_role included, can read or write it.';

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_otps enable row level security;

create policy account_deletion_requests_select on public.account_deletion_requests
  for select to authenticated
  using (user_id = auth.uid() or (public.is_admin() and public.admin_role() in ('support', 'super_admin')));

-- Supabase grants ALL on every new public table to anon, authenticated and
-- service_role, and each role holds it in its own right, so revoking PUBLIC alone
-- changes nothing (the certificate_orders lesson, 2026-09-13).
revoke all on public.account_deletion_requests from public, anon, authenticated, service_role;
revoke all on public.account_deletion_otps     from public, anon, authenticated, service_role;
grant select on public.account_deletion_requests to authenticated;

-- ── Who may delete ───────────────────────────────────────────────────────────
-- NULL = eligible. Otherwise the reason, which the UI turns into a sentence.
create or replace function public.account_deletion_blocker(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is null                                                         then 'not_found'
    when p.account_status = 'deleted'                                         then 'deleted'
    when exists (select 1 from admin.admin_users a where a.id = x.uid)        then 'admin'
    when exists (select 1 from public.vendor_profiles v where v.id = x.uid)   then 'vendor'
    when p.account_status <> 'active'                                         then 'suspended'
    when u.email is null or u.email like '%.invalid' or u.email_confirmed_at is null
                                                                              then 'no_email'
    else null
  end
  from (select p_user as uid) x
  left join public.profiles p on p.id = x.uid
  left join auth.users u on u.id = x.uid;
$$;

-- ── Step 1: open the request and mint a code (edge function only) ────────────
create or replace function public.issue_account_deletion_code(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text;
  v_req     public.account_deletion_requests%rowtype;
  v_have    boolean;
  v_email   text;
  v_code    text;
  v_expires timestamptz := now() + interval '10 minutes';
begin
  -- One writer per account at a time: two taps must not open two requests or leave
  -- two live codes. Same idiom as the plan caps (20260923082118).
  perform pg_advisory_xact_lock(hashtext('account_deletion:' || p_user::text));

  v_reason := public.account_deletion_blocker(p_user);
  if v_reason is not null then
    return jsonb_build_object('status', v_reason);
  end if;

  select * into v_req
    from public.account_deletion_requests
   where user_id = p_user and status in ('pending_confirmation', 'cooling_off')
     for update;
  v_have := found;

  if v_have and v_req.status = 'cooling_off' then
    return jsonb_build_object('status', 'already_scheduled', 'scheduled_for', v_req.scheduled_for);
  end if;

  -- A request nobody confirmed within a day is stale: close it and start over.
  if v_have and v_req.requested_at < now() - interval '24 hours' then
    update public.account_deletion_requests
       set status = 'cancelled', cancelled_at = now()
     where id = v_req.id;
    delete from public.account_deletion_otps where request_id = v_req.id;
    v_have := false;
  end if;

  if v_have then
    if v_req.last_code_sent_at > now() - interval '60 seconds' then
      return jsonb_build_object(
        'status', 'rate_limited',
        'retry_after_seconds',
        ceil(extract(epoch from (v_req.last_code_sent_at + interval '60 seconds' - now())))::int);
    end if;
    if v_req.codes_sent >= 5 then
      return jsonb_build_object('status', 'too_many_codes');
    end if;
  else
    insert into public.account_deletion_requests (user_id)
    values (p_user)
    returning * into v_req;
  end if;

  select u.email into v_email from auth.users u where u.id = p_user;

  -- 4 random bytes as an unsigned integer, mod 10^6 (bias < 0.03%).
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  insert into public.account_deletion_otps (request_id, code_hash, expires_at)
  values (v_req.id, encode(extensions.digest(v_req.id::text || ':' || v_code, 'sha256'), 'hex'), v_expires)
  on conflict (request_id) do update
    set code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempts   = 0,
        sent_at    = now();

  update public.account_deletion_requests
     set codes_sent = codes_sent + 1,
         last_code_sent_at = now(),
         code_expires_at = v_expires
   where id = v_req.id;

  return jsonb_build_object(
    'status', 'ok',
    'request_id', v_req.id,
    'code', v_code,
    'email', v_email,
    'expires_at', v_expires);
end;
$$;

-- The email did not go out: kill the code and lift the cooldown so the user can
-- retry at once. (codes_sent keeps counting, so retries stay bounded.)
create or replace function public.discard_account_deletion_code(p_request uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.account_deletion_otps where request_id = p_request;
  update public.account_deletion_requests
     set last_code_sent_at = null, code_expires_at = null
   where id = p_request;
$$;

-- ── Step 2: confirm with the code (signed-in user) ───────────────────────────
-- Returns a status instead of raising on a wrong code: a RAISE would roll back the
-- attempt counter it just incremented, and the 5-attempt limit would never bite.
create or replace function public.confirm_account_deletion(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_req    public.account_deletion_requests%rowtype;
  v_otp    public.account_deletion_otps%rowtype;
  v_reason text;
  v_when   timestamptz;
begin
  if v_user is null then
    raise exception 'sign in to confirm account deletion' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('account_deletion:' || v_user::text));

  select * into v_req
    from public.account_deletion_requests
   where user_id = v_user and status = 'pending_confirmation'
     for update;
  if not found then
    return jsonb_build_object('status', 'no_request');
  end if;

  v_reason := public.account_deletion_blocker(v_user);
  if v_reason is not null then
    return jsonb_build_object('status', v_reason);
  end if;

  select * into v_otp from public.account_deletion_otps where request_id = v_req.id for update;
  if not found then
    return jsonb_build_object('status', 'no_code');
  end if;
  if v_otp.attempts >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  if v_otp.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if coalesce(p_code, '') !~ '^[0-9]{6}$'
     or encode(extensions.digest(v_req.id::text || ':' || p_code, 'sha256'), 'hex') <> v_otp.code_hash then
    update public.account_deletion_otps set attempts = attempts + 1 where request_id = v_req.id;
    return jsonb_build_object(
      'status', case when v_otp.attempts + 1 >= 5 then 'locked' else 'invalid' end,
      'attempts_left', greatest(0, 5 - (v_otp.attempts + 1)));
  end if;

  v_when := now() + interval '14 days';
  update public.account_deletion_requests
     set status = 'cooling_off',
         confirmed_at = now(),
         scheduled_for = v_when,
         code_expires_at = null
   where id = v_req.id;
  delete from public.account_deletion_otps where request_id = v_req.id;

  perform public.notify(
    v_user,
    'account_deletion_scheduled',
    'Your account is scheduled for deletion',
    'It will be deleted on ' || to_char(v_when at time zone 'Asia/Kolkata', 'FMDD Mon YYYY')
      || '. You can cancel any time before then from your profile.');

  return jsonb_build_object('status', 'scheduled', 'scheduled_for', v_when);
end;
$$;

-- ── Step 3: cancel (signed-in user) ──────────────────────────────────────────
create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_req  public.account_deletion_requests%rowtype;
begin
  if v_user is null then
    raise exception 'sign in to cancel account deletion' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('account_deletion:' || v_user::text));

  select * into v_req
    from public.account_deletion_requests
   where user_id = v_user and status in ('pending_confirmation', 'cooling_off')
     for update;
  if not found then
    return jsonb_build_object('status', 'no_request');
  end if;

  update public.account_deletion_requests
     set status = 'cancelled', cancelled_at = now(), code_expires_at = null
   where id = v_req.id;
  delete from public.account_deletion_otps where request_id = v_req.id;

  if v_req.status = 'cooling_off' then
    perform public.notify(v_user, 'account_deletion_cancelled',
      'Account deletion cancelled', 'Your account will not be deleted.');
  end if;

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ── Step 4: anonymize (postgres only) ────────────────────────────────────────
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

-- ── The daily sweep ──────────────────────────────────────────────────────────
-- Never raises. A pg_cron job runs in one transaction, so a RAISE would roll back
-- every account already done in this run. A failure is recorded on its own row in
-- last_error and retried the next day.
create or replace function public.process_due_account_deletions()
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
    select id, user_id
      from public.account_deletion_requests
     where status = 'cooling_off' and scheduled_for <= now()
     order by scheduled_for
  loop
    begin
      perform pg_advisory_xact_lock(hashtext('account_deletion:' || r.user_id::text));
      -- Re-read under the lock: a cancel may have landed since the loop's query.
      perform 1
         from public.account_deletion_requests
        where id = r.id and status = 'cooling_off' and scheduled_for <= now()
          for update;
      if found then
        perform public.anonymize_account(r.user_id);
        update public.account_deletion_requests
           set status = 'completed', completed_at = now(), last_error = null
         where id = r.id;
        n := n + 1;
      end if;
    exception when others then
      update public.account_deletion_requests
         set last_error = left(sqlerrm, 500)
       where id = r.id;
    end;
  end loop;
  return n;
end;
$$;

-- ── A deleted account's identity rows stay scrubbed ──────────────────────────
-- An access token issued before the sweep lives up to an hour. INSERTs are already
-- refused through account_is_active(); this stops that token (or an admin) writing
-- a name back into profiles or buyer_profiles. Signed-in callers only, the same
-- test as enforce_admin_grants(); anonymize_account() runs as postgres.
create or replace function public.guard_deleted_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if exists (select 1 from public.profiles p where p.id = new.id and p.account_status = 'deleted') then
    raise exception 'this account has been deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_guard_deleted
  before update on public.profiles
  for each row execute function public.guard_deleted_account();

create trigger trg_buyer_profiles_guard_deleted
  before insert or update on public.buyer_profiles
  for each row execute function public.guard_deleted_account();

-- ── set_account_status(): refuse 'deleted' both ways ─────────────────────────
-- Proves it is patching the definition read in Phase 0, then proves (after) that
-- the only change is the guard block.
do $pre$
begin
  if md5(pg_get_functiondef('public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)'::regprocedure))
     <> 'e8d440512a7ce9dc0d3ce00f7c26888c' then
    raise exception 'set_account_status() changed since it was read; re-read it before patching';
  end if;
end
$pre$;

create temp table _set_account_status_before on commit drop as
  select prosrc from pg_proc
   where oid = 'public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)'::regprocedure;

CREATE OR REPLACE FUNCTION public.set_account_status(p_profile_id uuid, p_new_status account_status_type, p_reason_id uuid, p_source text, p_conversation_review_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: changing account status requires the support or super_admin role';
  end if;

  -- 'deleted' is terminal and has one writer, anonymize_account() (account
  -- deletion, 2026-09-23). Without this, the else branch below would set a
  -- deleted account back to 'active'.
  if p_new_status = 'deleted'
     or exists (select 1 from public.profiles where id = p_profile_id and account_status = 'deleted') then
    raise exception 'account % is deleted, or this call would delete it: only the account-deletion flow sets that status', p_profile_id
      using errcode = '42501';
  end if;

  if p_new_status = 'suspended' then
    insert into admin.account_suspensions
      (profile_id, reason_id, source, conversation_review_id, suspended_by)
    values
      (p_profile_id, p_reason_id, p_source, p_conversation_review_id, auth.uid());

    update public.profiles set account_status = 'suspended' where id = p_profile_id;
  else
    update admin.account_suspensions
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
$function$;

do $post$
declare
  v_block constant text := $blk$  -- 'deleted' is terminal and has one writer, anonymize_account() (account
  -- deletion, 2026-09-23). Without this, the else branch below would set a
  -- deleted account back to 'active'.
  if p_new_status = 'deleted'
     or exists (select 1 from public.profiles where id = p_profile_id and account_status = 'deleted') then
    raise exception 'account % is deleted, or this call would delete it: only the account-deletion flow sets that status', p_profile_id
      using errcode = '42501';
  end if;

$blk$;
  v_now text;
begin
  select prosrc into v_now from pg_proc
   where oid = 'public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)'::regprocedure;
  if position(v_block in v_now) = 0 then
    raise exception 'set_account_status(): guard block not found in the new body';
  end if;
  if replace(v_now, v_block, '') <> (select prosrc from _set_account_status_before) then
    raise exception 'set_account_status(): the new body differs from the old by more than the guard block';
  end if;
end
$post$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- New functions get EXECUTE for anon, authenticated and service_role by default.
revoke all on function public.account_deletion_blocker(uuid)      from public, anon, authenticated, service_role;
revoke all on function public.issue_account_deletion_code(uuid)   from public, anon, authenticated, service_role;
revoke all on function public.discard_account_deletion_code(uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_account_deletion(text)      from public, anon, authenticated, service_role;
revoke all on function public.cancel_account_deletion()           from public, anon, authenticated, service_role;
revoke all on function public.anonymize_account(uuid)             from public, anon, authenticated, service_role;
revoke all on function public.process_due_account_deletions()     from public, anon, authenticated, service_role;
revoke all on function public.guard_deleted_account()             from public, anon, authenticated, service_role;

grant execute on function public.issue_account_deletion_code(uuid)   to service_role;
grant execute on function public.discard_account_deletion_code(uuid) to service_role;
grant execute on function public.confirm_account_deletion(text)      to authenticated;
grant execute on function public.cancel_account_deletion()           to authenticated;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- Daily, like the other housekeeping jobs (03:17, 03:23, 03:29 UTC), off the
-- :00/:30 marks. 03:41 UTC is 09:11 IST. A request scheduled for a date is done
-- on the first run at or after that moment. Re-runnable guard, as in
-- 20260916180244.
select cron.unschedule('account-deletion-sweep')
 where exists (select 1 from cron.job where jobname = 'account-deletion-sweep');
select cron.schedule('account-deletion-sweep', '41 3 * * *', $cron$ select public.process_due_account_deletions(); $cron$);

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
begin
  -- Clients read their own request and nothing else. The code table is closed to all.
  if not has_table_privilege('authenticated', 'public.account_deletion_requests', 'SELECT')
     or has_table_privilege('authenticated', 'public.account_deletion_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.account_deletion_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.account_deletion_requests', 'DELETE')
     or has_table_privilege('anon',          'public.account_deletion_requests', 'SELECT') then
    raise exception 'account_deletion_requests grants are wrong';
  end if;
  if has_table_privilege('anon',          'public.account_deletion_otps', 'SELECT')
     or has_table_privilege('authenticated', 'public.account_deletion_otps', 'SELECT')
     or has_table_privilege('service_role',  'public.account_deletion_otps', 'SELECT') then
    raise exception 'account_deletion_otps is readable by a client role';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.account_deletion_otps'::regclass) then
    raise exception 'RLS is off on an account-deletion table';
  end if;

  -- Who may call what.
  if has_function_privilege('authenticated', 'public.issue_account_deletion_code(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.issue_account_deletion_code(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.confirm_account_deletion(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.confirm_account_deletion(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.cancel_account_deletion()', 'EXECUTE')
     or has_function_privilege('anon', 'public.cancel_account_deletion()', 'EXECUTE') then
    raise exception 'account-deletion RPC grants are wrong';
  end if;
  if has_function_privilege('authenticated', 'public.anonymize_account(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.anonymize_account(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.anonymize_account(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.process_due_account_deletions()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.process_due_account_deletions()', 'EXECUTE') then
    raise exception 'anonymize_account / process_due_account_deletions are callable by a client role';
  end if;

  if not exists (select 1 from cron.job where jobname = 'account-deletion-sweep' and schedule = '41 3 * * *') then
    raise exception 'account-deletion-sweep is not scheduled';
  end if;
end
$check$;
