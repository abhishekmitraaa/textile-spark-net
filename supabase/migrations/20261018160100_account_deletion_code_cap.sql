-- Account-deletion codes are capped per ACCOUNT, not per request (2026-10-18 buyer audit; Mitra: "fix all the
-- first-fix problems").
--
-- The limits in issue_account_deletion_code() (60 s between codes, 5 codes) read only the open request. But
-- cancel_account_deletion() also cancels a request still waiting for its code, and the next request opened a
-- fresh row with codes_sent = 0 and no cooldown. So request -> cancel -> request sent one more email or
-- WhatsApp message to the account's contact each round, without end, and gave 5 more guesses each time.
--
-- Now both limits count every request of the account touched in the last 24 hours, cancelled ones included:
-- at most 5 codes a day, and 60 seconds between any two. The statuses are the ones the app already shows
-- (rate_limited with retry_after_seconds; too_many_codes, "Try again tomorrow").
--
-- Only the two checks are new; the rest of the body is 20260923213225's, unchanged. Same signature, so
-- create or replace keeps the grants. No DROP and no new DELETE (the stale-request cleanup below was already
-- there).

create or replace function public.issue_account_deletion_code(p_user uuid, p_channels text[])
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
  v_day_codes integer;
  v_last_sent timestamptz;
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

  -- Per account, across requests (cancelled ones too): 60 seconds between codes, 5 a day.
  select coalesce(sum(r.codes_sent), 0)::integer, max(r.last_code_sent_at)
    into v_day_codes, v_last_sent
    from public.account_deletion_requests r
   where r.user_id = p_user
     and (r.requested_at > now() - interval '24 hours' or r.last_code_sent_at > now() - interval '24 hours');
  if v_last_sent > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds',
      ceil(extract(epoch from (v_last_sent + interval '60 seconds' - now())))::int);
  end if;
  if v_day_codes >= 5 then
    return jsonb_build_object('status', 'too_many_codes');
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

-- Self-check: the grants survived and the account-wide check is in the body.
do $check$
begin
  if has_function_privilege('anon', 'public.issue_account_deletion_code(uuid, text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.issue_account_deletion_code(uuid, text[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.issue_account_deletion_code(uuid, text[])', 'EXECUTE') then
    raise exception 'self-check: issue_account_deletion_code grants changed';
  end if;
  if position('v_day_codes' in (select prosrc from pg_proc
                                  where oid = 'public.issue_account_deletion_code(uuid, text[])'::regprocedure)) = 0 then
    raise exception 'self-check: the account-wide code limit is missing';
  end if;
end
$check$;
