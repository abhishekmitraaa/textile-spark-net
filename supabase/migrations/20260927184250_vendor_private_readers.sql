-- Admin completion, Phase 4a (Mitra, 2026-09-28): readers for the vendor fields that are
-- about to become private.
--
-- Mitra's decision (2026-09-27): a vendor's PAN, owner email, phone, WhatsApp and street
-- address (address_line, area, landmark, postal_code) become private. Only the vendor
-- and admins read them. Buyers reach phone and WhatsApp through a gated function.
-- GSTIN, CIN, owner name, city, state and country stay public.
--
-- This migration only ADDS the readers. The revoke is a later migration, applied
-- after both apps run code that no longer selects these columns (the MPF-19 lesson:
-- revoking first broke cosora.in and the admin panel).
--
--   my_vendor_private()          the caller's own eight fields (their dashboard, store,
--                                invoices, onboarding).
--   call_vendor_contact(vendor)  phone, WhatsApp and brand name for a signed-in buyer,
--                                under the callGate rules call_buyer_contact() already
--                                applies. Refuses with 42501 and the reason:
--                                not_signed_in, caller_suspended, not_a_vendor,
--                                target_suspended, under_review.
--                                Also rate-limited, so a signed-in account can't harvest
--                                every vendor's number: at most 30 different vendors an
--                                hour and 100 a day. Opening a vendor already revealed in
--                                the window doesn't count again ('rate_limited').
--   admin_vendor_private(ids)    the eight fields for admins (super_admin, vendor_ops,
--                                support, finance_admin), at most 200 ids a call.

-- ── Reveal ledger for the rate limit (admin schema: no client can read or write it) ──
create table if not exists admin.vendor_contact_reveals (
  caller_id   uuid not null,
  vendor_id   uuid not null,
  revealed_at timestamptz not null default now(),
  primary key (caller_id, vendor_id)
);
create index if not exists vendor_contact_reveals_caller_time_idx
  on admin.vendor_contact_reveals (caller_id, revealed_at desc);
alter table admin.vendor_contact_reveals enable row level security;

-- ── The vendor's own private fields ──────────────────────────────────────────
create or replace function public.my_vendor_private()
returns table(pan text, owner_email text, phone text, whatsapp text,
              address_line text, area text, landmark text, postal_code text)
language sql
stable
security definer
set search_path = ''
as $function$
  select v.pan, v.owner_email, v.phone, v.whatsapp, v.address_line, v.area, v.landmark, v.postal_code
    from public.vendor_profiles v
   where v.id = auth.uid();
$function$;

-- ── A buyer reaching a vendor ────────────────────────────────────────────────
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
    select exists (select 1 from admin.vendor_contact_reveals r
                    where r.caller_id = v_me and r.vendor_id = p_vendor_id
                      and r.revealed_at > now() - interval '1 day')
      into v_seen;
    if not v_seen then
      select count(*) filter (where r.revealed_at > now() - interval '1 hour'),
             count(*)
        into v_hour, v_day
        from admin.vendor_contact_reveals r
       where r.caller_id = v_me and r.revealed_at > now() - interval '1 day';
      if v_hour >= 30 or v_day >= 100 then
        raise exception 'rate_limited' using errcode = '42501';
      end if;
    end if;
    insert into admin.vendor_contact_reveals (caller_id, vendor_id, revealed_at)
    values (v_me, p_vendor_id, now())
    on conflict (caller_id, vendor_id) do update set revealed_at = excluded.revealed_at;
  end if;

  return query
    select v.phone, v.whatsapp, v.brand_name
      from public.vendor_profiles v
     where v.id = p_vendor_id;
end;
$function$;

-- ── Admins ───────────────────────────────────────────────────────────────────
create or replace function public.admin_vendor_private(p_ids uuid[])
returns table(id uuid, pan text, owner_email text, phone text, whatsapp text,
              address_line text, area text, landmark text, postal_code text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'vendor_ops', 'support', 'finance_admin']::public.admin_role_type[]), false) then
    raise exception 'not authorized: vendor contact and tax details are for super admins, vendor ops, support and finance'
      using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 200 then
    raise exception 'at most 200 vendors per call' using errcode = '22023';
  end if;
  return query
    select v.id, v.pan, v.owner_email, v.phone, v.whatsapp, v.address_line, v.area, v.landmark, v.postal_code
      from public.vendor_profiles v
     where v.id = any (p_ids);
end
$function$;

revoke all on function public.my_vendor_private() from public, anon, authenticated;
revoke all on function public.call_vendor_contact(uuid) from public, anon, authenticated;
revoke all on function public.admin_vendor_private(uuid[]) from public, anon, authenticated;
grant execute on function public.my_vendor_private() to authenticated;
grant execute on function public.call_vendor_contact(uuid) to authenticated;
grant execute on function public.admin_vendor_private(uuid[]) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array['public.my_vendor_private()', 'public.call_vendor_contact(uuid)', 'public.admin_vendor_private(uuid[])'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: authenticated cannot execute %', f;
    end if;
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'admin.vendor_contact_reveals', 'SELECT')
     or has_table_privilege('anon', 'admin.vendor_contact_reveals', 'SELECT') then
    raise exception 'self-check: a client role can read admin.vendor_contact_reveals';
  end if;
end
$check$;
