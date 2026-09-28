-- Admin completion, Phase 4a, part 2 (Mitra, 2026-09-28): what the buyer app needs before
-- Phase 4b makes a vendor's phone and WhatsApp private.
--
-- 1. Two public flags, has_phone and has_whatsapp, generated from the private columns. The
--    vendor page offers "Show phone number" and the WhatsApp button only when there is a
--    number behind them, without reading the number. They say only that a number exists.
-- 2. call_vendor_contact(): the reveal ledger keeps each caller's last day only.
--    - A vendor already revealed in the last day is served again without touching the
--      ledger, so reopening it no longer moves it into the current hour's count.
--    - Every call first deletes that caller's rows older than a day, so the table stays
--      bounded without a scheduled job.
--    The rules are unchanged: 30 different vendors an hour, 100 a day, per account.

-- ── Pre-check ────────────────────────────────────────────────────────────────
do $pre$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.call_vendor_contact(uuid)'::regprocedure)
     is distinct from '12874ca34bdd27b0ee92ddc125c8a6a1' then
    raise exception 'pre-check: public.call_vendor_contact() has changed since it was read';
  end if;
end
$pre$;

-- ── 1 ─────────────────────────────────────────────────────────────────────────
alter table public.vendor_profiles
  add column if not exists has_phone boolean
    generated always as (nullif(btrim(phone), '') is not null) stored,
  add column if not exists has_whatsapp boolean
    generated always as (nullif(btrim(whatsapp), '') is not null) stored;

comment on column public.vendor_profiles.has_phone is
  'Public: the vendor has a business phone on file. The number is private; a signed-in buyer gets it from call_vendor_contact().';
comment on column public.vendor_profiles.has_whatsapp is
  'Public: the vendor has a WhatsApp number on file. The number is private; a signed-in buyer gets it from call_vendor_contact().';

-- ── 2 ─────────────────────────────────────────────────────────────────────────
create or replace function public.call_vendor_contact(p_vendor_id uuid)
returns table(phone text, whatsapp text, brand_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_me     uuid := auth.uid();
  v_seen   boolean;
  v_hour   int;
  v_day    int;
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_me and p.account_status = 'suspended') then
    raise exception 'caller_suspended' using errcode = '42501';
  end if;
  if p_vendor_id is null or not exists (select 1 from public.vendor_profiles v where v.id = p_vendor_id) then
    raise exception 'not_a_vendor' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_vendor_id and p.account_status = 'suspended') then
    raise exception 'target_suspended' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.conversations c
     where c.user_a = least(v_me, p_vendor_id)
       and c.user_b = greatest(v_me, p_vendor_id)
       and c.status = 'under_review') then
    raise exception 'under_review' using errcode = '42501';
  end if;

  -- The rate limit counts DIFFERENT vendors. One lock per caller serialises their
  -- concurrent requests, so parallel calls can't all read the same count.
  if v_me <> p_vendor_id then
    perform pg_advisory_xact_lock(hashtext('vendor_contact:' || v_me::text));
    -- Each caller's ledger holds their last day only: older rows no longer count.
    delete from admin.vendor_contact_reveals r
     where r.caller_id = v_me and r.revealed_at <= now() - interval '1 day';
    select exists (select 1 from admin.vendor_contact_reveals r
                    where r.caller_id = v_me and r.vendor_id = p_vendor_id)
      into v_seen;
    -- A vendor revealed in the last day is served again without counting or moving.
    if not v_seen then
      select count(*) filter (where r.revealed_at > now() - interval '1 hour'),
             count(*)
        into v_hour, v_day
        from admin.vendor_contact_reveals r
       where r.caller_id = v_me;
      if v_hour >= 30 or v_day >= 100 then
        raise exception 'rate_limited' using errcode = '42501';
      end if;
      insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
      values (v_me, p_vendor_id, now());
    end if;
  end if;

  return query
    select v.phone, v.whatsapp, v.brand_name
      from public.vendor_profiles v
     where v.id = p_vendor_id;
end;
$function$;

revoke all on function public.call_vendor_contact(uuid) from public, anon, authenticated;
grant execute on function public.call_vendor_contact(uuid) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from pg_attribute a
       where a.attrelid = 'public.vendor_profiles'::regclass
         and a.attname in ('has_phone', 'has_whatsapp') and a.attgenerated = 's' and not a.attisdropped) <> 2 then
    raise exception 'self-check: has_phone and has_whatsapp are not both stored generated columns';
  end if;
  if exists (select 1 from public.vendor_profiles v
              where v.has_phone is distinct from (nullif(btrim(v.phone), '') is not null)
                 or v.has_whatsapp is distinct from (nullif(btrim(v.whatsapp), '') is not null)) then
    raise exception 'self-check: a has_phone or has_whatsapp value disagrees with its number';
  end if;
  if has_function_privilege('anon', 'public.call_vendor_contact(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.call_vendor_contact(uuid)', 'EXECUTE') then
    raise exception 'self-check: call_vendor_contact() grants are wrong';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.call_vendor_contact(uuid)'::regprocedure) then
    raise exception 'self-check: call_vendor_contact() is not SECURITY DEFINER';
  end if;
  if (select p.prosrc from pg_proc p where p.oid = 'public.call_vendor_contact(uuid)'::regprocedure)
     !~ 'revealed_at <= now\(\) - interval ''1 day''' then
    raise exception 'self-check: call_vendor_contact() does not prune the caller''s ledger';
  end if;
end
$check$;
