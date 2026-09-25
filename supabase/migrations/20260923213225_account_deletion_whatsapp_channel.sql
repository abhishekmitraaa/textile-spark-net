-- MPF-6 (Phase 18 of the My Profile brief, 2026-09-24): a phone-only account can
-- delete itself, with the code sent over WhatsApp instead of email.
--
-- Sign-in is mobile number + OTP only (Mitra, 2026-09-23), and Supabase phone
-- sign-up leaves auth.users.email empty. account_deletion_blocker() refused any
-- account without a confirmed email ('no_email'), so once real sign-ups start,
-- every one of them would have been sent to support. 0 live accounts are
-- phone-only today (no auth.users row has a phone at all).
--
-- What changes:
--   * account_deletion_requests.channel: 'email' or 'whatsapp', set once when a
--     request is opened. Every code for that request goes to the same place.
--   * account_deletion_channels(): where an account can be reached, best first.
--     A confirmed email that is not a '.invalid' placeholder → 'email' (the rule
--     the blocker used before); a confirmed auth.users.phone → 'whatsapp'.
--   * account_deletion_blocker(): 'no_email' becomes 'no_contact', and only fires
--     when the account has neither.
--   * issue_account_deletion_code(p_user, p_channels): the edge function passes
--     the channels it holds secrets for. If the account's channel is not among
--     them, the answer is 'not_configured' with that channel, before anything is
--     written, as the function's own not-configured check did for email: a code
--     that cannot be delivered must not exist. The account's email address or
--     phone number comes back as 'destination' (the old 'email' key).
--
-- An email-bearing account is decided exactly as before: email wins whenever it
-- is usable, so none of today's 20 real accounts changes channel.

-- ── The channel a request was opened on ────────────────────────────────────
alter table public.account_deletion_requests
  add column channel text not null default 'email'
  constraint account_deletion_requests_channel_check check (channel in ('email', 'whatsapp'));

comment on column public.account_deletion_requests.channel is
  'Where this request''s codes are sent: email, or WhatsApp for an account with no usable email and a confirmed phone (MPF-6). Set when the request is opened.';

-- ── Where an account can be reached ────────────────────────────────────────
create or replace function public.account_deletion_channels(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_remove(array[
              case when u.email is not null and u.email not like '%.invalid' and u.email_confirmed_at is not null
                   then 'email' end,
              case when coalesce(u.phone, '') <> '' and u.phone_confirmed_at is not null
                   then 'whatsapp' end
            ], null)
       from auth.users u
      where u.id = p_user),
    '{}');
$$;

comment on function public.account_deletion_channels(uuid) is
  'The channels a deletion code can reach this account on, best first: email (confirmed, not a .invalid placeholder), then whatsapp (confirmed auth.users.phone). Empty when neither. Server-side only (MPF-6).';

revoke all on function public.account_deletion_channels(uuid) from public, anon, authenticated, service_role;

-- ── 'no_email' becomes 'no_contact' ────────────────────────────────────────
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
    when cardinality(public.account_deletion_channels(x.uid)) = 0             then 'no_contact'
    else null
  end
  from (select p_user as uid) x
  left join public.profiles p on p.id = x.uid;
$$;

-- ── Minting a code, on the request's channel ───────────────────────────────
-- The old one-argument version goes: only the account-deletion edge function
-- calls this, and it is redeployed with this migration.
drop function public.issue_account_deletion_code(uuid);

create function public.issue_account_deletion_code(p_user uuid, p_channels text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text;
  v_usable  text[];
  v_req     public.account_deletion_requests%rowtype;
  v_have    boolean;
  v_stale   boolean;
  v_channel text;
  v_to      text;
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

  v_usable := public.account_deletion_channels(p_user);

  select * into v_req
    from public.account_deletion_requests
   where user_id = p_user and status in ('pending_confirmation', 'cooling_off')
     for update;
  v_have := found;

  if v_have and v_req.status = 'cooling_off' then
    return jsonb_build_object('status', 'already_scheduled', 'scheduled_for', v_req.scheduled_for);
  end if;

  -- A request nobody confirmed within a day is stale: close it and start over. So
  -- is one whose channel no longer reaches the account (the email was removed or
  -- unconfirmed, say): its codes would go somewhere the account can't read.
  v_stale := v_have and (v_req.requested_at < now() - interval '24 hours'
                         or not (v_req.channel = any(v_usable)));
  v_channel := case when v_have and not v_stale then v_req.channel else v_usable[1] end;

  if v_channel is null then
    return jsonb_build_object('status', 'no_contact');
  end if;
  -- Checked before anything is written: a code that cannot be delivered must not exist.
  if not (v_channel = any(coalesce(p_channels, '{}'))) then
    return jsonb_build_object('status', 'not_configured', 'channel', v_channel);
  end if;

  if v_stale then
    update public.account_deletion_requests
       set status = 'cancelled', cancelled_at = now(), code_expires_at = null
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
    insert into public.account_deletion_requests (user_id, channel)
    values (p_user, v_channel)
    returning * into v_req;
  end if;

  select case v_channel when 'whatsapp' then u.phone else u.email end
    into v_to
    from auth.users u
   where u.id = p_user;

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
    'channel', v_channel,
    'destination', v_to,
    'expires_at', v_expires);
end;
$$;

comment on function public.issue_account_deletion_code(uuid, text[]) is
  'Mints a deletion code for p_user on the request''s channel, if that channel is in p_channels (the ones the account-deletion edge function can deliver on); otherwise not_configured, with nothing written. service_role only (MPF-6).';

revoke all on function public.issue_account_deletion_code(uuid, text[]) from public, anon, authenticated;
grant execute on function public.issue_account_deletion_code(uuid, text[]) to service_role;

-- ── Self-check ─────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.issue_account_deletion_code(uuid)') is not null then
    raise exception 'self-check: the one-argument issue_account_deletion_code is still there';
  end if;
  if has_function_privilege('anon', 'public.issue_account_deletion_code(uuid, text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.issue_account_deletion_code(uuid, text[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.issue_account_deletion_code(uuid, text[])', 'EXECUTE') then
    raise exception 'self-check: issue_account_deletion_code must be service_role only';
  end if;
  if has_function_privilege('anon', 'public.account_deletion_channels(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.account_deletion_channels(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.account_deletion_channels(uuid)', 'EXECUTE') then
    raise exception 'self-check: account_deletion_channels must not be callable by an API role';
  end if;
  if exists (select 1 from public.account_deletion_requests where channel <> 'email') then
    raise exception 'self-check: existing requests must all be email';
  end if;
  -- Every account the old rule accepted (a confirmed email that is not a
  -- placeholder) is still decided on email, and no other account is.
  if exists (
    select 1
      from auth.users u
     where (u.email is not null and u.email not like '%.invalid' and u.email_confirmed_at is not null)
           is distinct from coalesce((public.account_deletion_channels(u.id))[1] = 'email', false)
  ) then
    raise exception 'self-check: an account''s email eligibility changed';
  end if;
end;
$$;
