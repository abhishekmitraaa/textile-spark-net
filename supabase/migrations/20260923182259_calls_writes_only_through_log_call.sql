-- MPF-2: calls are written only through log_call().
--
-- Before this, a buyer wrote `calls` rows directly. calls_insert and calls_write
-- (FOR ALL) checked only buyer_id = auth.uid(), so every other column was the
-- client's to choose: any profile as vendor_id, any created_at, any direction in
-- the CHECK list, free-text product_context, even while suspended; and
-- calls_write let the buyer UPDATE or DELETE their rows afterwards. Vendor call
-- analytics (count, trend, "N today", top contexts) trust those rows.
--
-- Now clients hold no INSERT, UPDATE or DELETE on `calls`, the two write
-- policies are gone (so a grant added later by mistake still meets RLS with no
-- write policy), and log_call() is the one way in. It sets buyer_id, direction
-- and created_at itself, requires an active caller and a real vendor that isn't
-- the caller, cleans product_context, and rate-limits. SELECT is untouched:
-- calls_select stays as it is (MPF-1 is a separate flag).
--
-- The rate limit is the account-deletion idiom (20260923115839), adapted: a
-- per-caller advisory lock, a 60-second minimum interval, and a count cap.
--   * one logged call per caller per vendor per 60 seconds  -> 'rate_limited'
--     (a double tap or a redial inside a minute is one call)
--   * at most 5 logged calls per caller per vendor per 24 hours -> 'too_many_calls'
--   * at most 30 logged calls per caller per hour, any vendor  -> 'too_many_calls'
-- A limit returns a status, not an error: the dial has already happened in the
-- browser, and the only effect is that the tap isn't counted.

revoke insert, update, delete, truncate on public.calls from public, anon, authenticated;
drop policy if exists calls_insert on public.calls;
drop policy if exists calls_write on public.calls;

create or replace function public.log_call(p_vendor_id uuid, p_product_context text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_ctx  text;
  v_last timestamptz;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.account_is_active(v_me) then
    raise exception 'account_not_active' using errcode = '42501';
  end if;
  if p_vendor_id is null or not exists (select 1 from public.vendor_profiles v where v.id = p_vendor_id) then
    raise exception 'not_a_vendor' using errcode = '22023';
  end if;
  if p_vendor_id = v_me then
    raise exception 'cannot_call_self' using errcode = '22023';
  end if;

  -- One writer per caller at a time, so two taps can't both pass the limits.
  -- Same idiom as the plan caps (20260923082118) and account deletion.
  perform pg_advisory_xact_lock(hashtext('log_call:' || v_me::text));

  select max(c.created_at) into v_last
    from public.calls c
   where c.buyer_id = v_me and c.vendor_id = p_vendor_id;
  if v_last > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds', ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::int);
  end if;
  if (select count(*) from public.calls c
       where c.buyer_id = v_me and c.vendor_id = p_vendor_id
         and c.created_at > now() - interval '24 hours') >= 5
     or (select count(*) from public.calls c
          where c.buyer_id = v_me and c.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'too_many_calls');
  end if;

  -- Whitespace collapsed, trimmed, at most 200 characters; empty becomes null.
  v_ctx := nullif(btrim(left(regexp_replace(btrim(coalesce(p_product_context, '')), '\s+', ' ', 'g'), 200)), '');

  insert into public.calls (buyer_id, vendor_id, direction, product_context, created_at)
  values (v_me, p_vendor_id, 'outgoing', v_ctx, now())
  returning id into v_id;

  return jsonb_build_object('status', 'logged', 'id', v_id);
end;
$$;

comment on function public.log_call(uuid, text) is
  'The only write path to public.calls (MPF-2). Logs an outgoing call by auth.uid() to a vendor: active caller, real vendor, not self; server-set buyer_id, direction and created_at; product_context cleaned to 200 chars; rate-limited (60 s per vendor, 5 per vendor per day, 30 per hour). Returns {status: logged|rate_limited|too_many_calls}.';

revoke execute on function public.log_call(uuid, text) from public, anon;
grant execute on function public.log_call(uuid, text) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $$
declare
  r      text;
  v_priv text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(r, 'public.calls', v_priv) then
        raise exception 'self-check: % still holds % on calls', r, v_priv;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.calls', 'SELECT') then
    raise exception 'self-check: authenticated lost SELECT on calls';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calls'
              and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'self-check: a write policy is left on calls';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calls' and cmd = 'SELECT') then
    raise exception 'self-check: calls has no SELECT policy left';
  end if;
  if has_function_privilege('anon', 'public.log_call(uuid, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.log_call(uuid, text)', 'EXECUTE') then
    raise exception 'self-check: log_call EXECUTE grants are wrong';
  end if;
  if not (select f.prosecdef and f.proconfig = array['search_path=""'] from pg_proc f
           where f.oid = 'public.log_call(uuid, text)'::regprocedure) then
    raise exception 'self-check: log_call is not SECURITY DEFINER with an empty search_path';
  end if;
end;
$$;
