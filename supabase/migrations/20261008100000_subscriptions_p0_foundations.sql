-- Subscriptions P0: foundations and safety (plan "build every vendor subscription feature", 2026-10-08).
--
-- 1. GST state codes on india_states (the two-digit code that opens every GSTIN, and the
--    place of supply on an invoice), and gstin_is_valid() with the GSTIN checksum.
-- 2. ONE rule for the plan a vendor is on right now: admin.vendor_effective_plan(). A paid
--    downgrade counts from scheduled_from at read time, instead of waiting for the daily
--    sweep to rename it. vendor_cap_plan() (the product and catalogue caps) and
--    get_vendor_plan() read it; vendor_entitlements() is the new read model the tier
--    features will use.
-- 3. get_vendor_plan(): its guard was `if not (vid = auth.uid() or is_admin())`, which is
--    NULL with no session, so a signed-out caller got any vendor's plan, period end and
--    usage (securityflags S-1, verified 2026-10-07). Coalesced, and anon loses EXECUTE.
-- 4. Feature switches: public.feature_flags, read through feature_on() / my_feature_flags(),
--    written only by admin_feature_flag_set() (super_admin, with a reason, in the Admin Log).
--    Seeded: subscription_checkout, off. While it is off only its listed accounts can buy
--    or change a plan: Razorpay is in test mode and its published test cards would
--    otherwise give anyone a paid plan, its trust seal and its search boost (S-2).
-- 5. subscription_checkout_gate(): the payment functions ask it before anything is created.
--    It refuses an account that isn't a registered vendor, is suspended or deleted, or
--    isn't allowed by the switch.
-- 6. Least-privilege reads on subscription_payment_orders and subscription_usage (S-4): the
--    Subscriptions section's roles, as Phase 11 set for invoices and subscriptions.
-- 7. Cosora VIP is open to every vendor at its list price (Mitra, 2026-10-08).
-- 8. admin.billing_entity: Cosora's legal name, address, GSTIN, PAN and SAC code, for the
--    tax invoice (P1). Super admin and finance admin edit it through two RPCs.
--
-- Harness: scripts/subscriptions/p0_foundations.sql.

-- ── 0. Guards: the functions rewritten here are the ones that were read ──────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.get_vendor_plan(uuid)'::regprocedure))
     <> '6ab60073d455e14eb597caa13ed05ab1' then
    raise exception 'get_vendor_plan changed since it was read; re-read it before patching';
  end if;
  if md5((select prosrc from pg_proc where oid = 'public.vendor_cap_plan(uuid)'::regprocedure))
     <> 'a6386db242c43bdcfb94e4ca66a2ced4' then
    raise exception 'vendor_cap_plan changed since it was read; re-read it before patching';
  end if;
end
$guard$;

-- ── 1. GST state codes and the GSTIN check ──────────────────────────────────────────
alter table public.india_states add column if not exists gst_code text;
update public.india_states s
   set gst_code = m.gst
  from (values
    ('AN','35'),('AP','37'),('AR','12'),('AS','18'),('BR','10'),('CH','04'),('CT','22'),('DH','26'),
    ('DL','07'),('GA','30'),('GJ','24'),('HP','02'),('HR','06'),('JH','20'),('JK','01'),('KA','29'),
    ('KL','32'),('LA','38'),('LD','31'),('MH','27'),('ML','17'),('MN','14'),('MP','23'),('MZ','15'),
    ('NL','13'),('OR','21'),('PB','03'),('PY','34'),('RJ','08'),('SK','11'),('TG','36'),('TN','33'),
    ('TR','16'),('UP','09'),('UT','05'),('WB','19')) as m(code, gst)
 where s.code = m.code;
alter table public.india_states alter column gst_code set not null;
alter table public.india_states add constraint india_states_gst_code_check check (gst_code ~ '^[0-9]{2}$');
alter table public.india_states add constraint india_states_gst_code_key unique (gst_code);
comment on column public.india_states.gst_code is
  'The GST state code: the first two digits of a GSTIN registered in this state, and the place of supply on an invoice.';
grant select (gst_code) on public.india_states to anon, authenticated;

-- A GSTIN is 2 digits (the state), the PAN, an entity number, Z and a check character.
-- The check character is the GSTN mod-36 checksum over the first 14 characters
-- (src/lib/taxIds.ts mirrors it; scripts/tax-id-check.mjs keeps the two in step).
create or replace function public.gstin_is_valid(p_gstin text)
returns boolean
language plpgsql immutable set search_path = '' as $function$
declare
  chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  total int := 0;
  v int;
  p int;
  i int;
begin
  if p_gstin is null or p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    return false;
  end if;
  for i in 1..14 loop
    v := strpos(chars, substr(p_gstin, i, 1)) - 1;
    p := v * (case when i % 2 = 1 then 1 else 2 end);
    total := total + (p / 36) + (p % 36);
  end loop;
  return substr(chars, ((36 - (total % 36)) % 36) + 1, 1) = substr(p_gstin, 15, 1);
end
$function$;
revoke all on function public.gstin_is_valid(text) from public;
grant execute on function public.gstin_is_valid(text) to anon, authenticated, service_role;

-- ── 2. The plan a vendor is on right now ────────────────────────────────────────────
-- An active subscription whose period hasn't ended is the vendor's plan. A paid downgrade
-- (scheduled_*) takes over at scheduled_from. Anything else is Free.
create or replace function admin.vendor_effective_plan(p_vendor uuid, p_at timestamptz default now())
returns table (
  plan_id text, status text, billing_cycle text, period_start timestamptz, period_end timestamptz,
  scheduled_plan_id text, scheduled_billing_cycle text, scheduled_from timestamptz,
  auto_renew boolean, subscription_id uuid, raw_period_end timestamptz)
language sql stable set search_path = '' as $function$
  with s as (
    select vs.*,
           (vs.status = 'active' and vs.current_period_end is not null and vs.current_period_end > p_at) as live,
           (vs.scheduled_from is not null and vs.scheduled_from <= p_at) as switched
      from public.vendor_subscriptions vs
     where vs.vendor_id = p_vendor
  )
  select case when s.live then (case when s.switched then s.scheduled_plan_id else s.plan_id end) else 'free' end,
         case when s.live then 'active' else 'free' end,
         case when s.live and s.switched then s.scheduled_billing_cycle else s.billing_cycle end,
         case when s.live then (case when s.switched then s.scheduled_from else s.current_period_start end) end,
         case when s.live then s.current_period_end end,
         case when s.live and not s.switched then s.scheduled_plan_id end,
         case when s.live and not s.switched then s.scheduled_billing_cycle end,
         case when s.live and not s.switched then s.scheduled_from end,
         s.auto_renew, s.id, s.current_period_end
    from s
  union all
  select 'free', 'free', null, null, null, null, null, null, null, null, null
   where not exists (select 1 from s)
$function$;
revoke all on function admin.vendor_effective_plan(uuid, timestamptz) from public, anon, authenticated;
comment on function admin.vendor_effective_plan(uuid, timestamptz) is
  'The one rule for the plan a vendor is on at a moment: an active, unexpired subscription (a paid downgrade from its scheduled_from), else free. Read by vendor_cap_plan, get_vendor_plan and vendor_entitlements.';

create or replace function public.vendor_cap_plan(p_vendor uuid)
returns text
language plpgsql stable security definer set search_path = public as $function$
declare
  v_plan text;
begin
  if not (coalesce(p_vendor = auth.uid(), false) or coalesce(public.is_admin(), false)) then
    raise exception 'Only the vendor or an admin can read this plan.' using errcode = '42501';
  end if;
  select e.plan_id into v_plan from admin.vendor_effective_plan(p_vendor, now()) e;
  return coalesce(v_plan, 'free');
end;
$function$;

-- ── 3. get_vendor_plan(): same answer, same shape, no anonymous callers ─────────────
create or replace function public.get_vendor_plan(v uuid default auth.uid())
returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare
  vid            uuid := coalesce(v, auth.uid());
  e              record;
  plan           public.subscription_plans%rowtype;
  next_plan_name text;
  paid_active    boolean;
  p_start        timestamptz;
  p_end          timestamptz;
  products_used  integer := 0;
  leads_used     integer := 0;
  verified_admin boolean := false;
begin
  if vid is null then
    return null;
  end if;
  -- Coalesced: with no session auth.uid() is NULL and an uncoalesced test skips the guard.
  if not (coalesce(vid = auth.uid(), false) or coalesce(public.is_admin(), false)
          or coalesce(auth.role() = 'service_role', false)) then
    return null;
  end if;

  select * into e from admin.vendor_effective_plan(vid, now());
  paid_active := e.status = 'active' and e.plan_id <> 'free';

  select * into plan from public.subscription_plans where id = e.plan_id;
  if not found then
    select * into plan from public.subscription_plans where id = 'free';
  end if;
  if paid_active and e.scheduled_plan_id is not null then
    select name into next_plan_name from public.subscription_plans where id = e.scheduled_plan_id;
  end if;

  if paid_active then
    p_start := e.period_start;
    p_end   := e.period_end;
  else
    p_start := date_trunc('month', now());
    p_end   := p_start + interval '1 month';
  end if;

  select count(*) into products_used
    from public.products
   where vendor_id = vid and status in ('under_review', 'live');

  -- Open-marketplace replies only (rfqs.vendor_id is null).
  select count(distinct q.rfq_id) into leads_used
    from public.quotes q
    join public.rfqs r on r.id = q.rfq_id
   where q.vendor_id = vid
     and q.created_at >= p_start
     and r.vendor_id is null;

  select coalesce(is_verified, false) into verified_admin
    from public.vendor_profiles where id = vid;

  return jsonb_build_object(
    'vendor_id',            vid,
    'effective_plan_id',    plan.id,
    'status',               e.status,
    'billing_cycle',        coalesce(e.billing_cycle, 'monthly'),
    'auto_renew',           coalesce(e.auto_renew, true),
    'current_period_start', p_start,
    'current_period_end',   p_end,
    'subscription_end',     e.raw_period_end,
    'is_invite_only',       plan.is_invite_only,
    'is_verified_admin',    verified_admin,
    'trust_seal',           (verified_admin or (paid_active and coalesce((plan.limits->>'has_verified_badge')::boolean, false))),
    'plan', jsonb_build_object(
              'id',             plan.id,
              'name',           plan.name,
              'monthly_price',  plan.monthly_price,
              'yearly_price',   plan.yearly_price,
              'currency',       plan.currency,
              'is_invite_only', plan.is_invite_only,
              'sort_order',     plan.sort_order,
              'limits',         plan.limits,
              'display',        plan.display
            ),
    'limits', plan.limits,
    'usage', jsonb_build_object(
               'products_used', products_used,
               'leads_used',    leads_used,
               'period_start',  p_start,
               'period_end',    p_end
             ),
    'scheduled_plan_id',       case when paid_active then e.scheduled_plan_id end,
    'scheduled_plan_name',     next_plan_name,
    'scheduled_billing_cycle', case when paid_active then e.scheduled_billing_cycle end,
    'scheduled_from',          case when paid_active then e.scheduled_from end
  );
end;
$function$;
revoke all on function public.get_vendor_plan(uuid) from public, anon;
grant execute on function public.get_vendor_plan(uuid) to authenticated, service_role;

-- ── 4. vendor_entitlements(): what a vendor's plan gives them, in one place ─────────
-- The tier features read this (pages, policies, jobs). Later phases add keys; a key a
-- plan's limits don't set reads as its "off" value here.
create or replace function public.vendor_entitlements(p_vendor uuid default auth.uid())
returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare
  e        record;
  plan     public.subscription_plans%rowtype;
  v_verified boolean := false;
  v_ad_until timestamptz;
  paid     boolean;
  seal     text := 'none';
  lim      jsonb;
begin
  if p_vendor is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not (coalesce(p_vendor = auth.uid(), false) or coalesce(public.is_admin(), false)
          or coalesce(auth.role() = 'service_role', false)) then
    raise exception 'Only the vendor or an admin can read these entitlements.' using errcode = '42501';
  end if;

  select * into e from admin.vendor_effective_plan(p_vendor, now());
  select * into plan from public.subscription_plans where id = e.plan_id;
  if not found then
    select * into plan from public.subscription_plans where id = 'free';
  end if;
  lim  := coalesce(plan.limits, '{}'::jsonb);
  paid := e.status = 'active' and plan.id <> 'free';

  select coalesce(v.is_verified, false), v.ad_verified_until into v_verified, v_ad_until
    from public.vendor_profiles v where v.id = p_vendor;

  if paid and coalesce((lim->>'has_verified_badge')::boolean, false) then
    seal := case plan.id when 'vip' then 'vip' when 'gold' then 'gold' else 'verified' end;
  elsif coalesce(v_verified, false) or coalesce(v_ad_until > now(), false) then
    seal := 'verified';
  end if;

  return jsonb_build_object(
    'vendor_id',        p_vendor,
    'plan_id',          plan.id,
    'plan_name',        plan.name,
    'status',           e.status,
    'paid',             paid,
    'billing_cycle',    e.billing_cycle,
    'period_start',     e.period_start,
    'period_end',       e.period_end,
    'scheduled_plan_id', e.scheduled_plan_id,
    'scheduled_from',   e.scheduled_from,
    'limits',           lim,
    'features', jsonb_build_object(
      'product_cap',        coalesce((lim->>'product_cap')::int, 0),
      'ad_location_scope',  coalesce(lim->>'ad_location_scope', 'none'),
      'search_boost_tier',  coalesce((lim->>'search_boost_tier')::int, 0),
      'seal_tier',          seal,
      'crm',                paid and coalesce((lim->>'has_crm')::boolean, false),
      'realtime_alerts',    paid and coalesce((lim->>'has_realtime_alerts')::boolean, false),
      'account_manager',    paid and coalesce((lim->>'has_dedicated_am')::boolean, false),
      'auto_catalog',       coalesce((lim->>'has_auto_catalog')::boolean, false),
      'international',      paid and coalesce((lim->>'has_international')::boolean, false)
    )
  );
end;
$function$;
revoke all on function public.vendor_entitlements(uuid) from public, anon;
grant execute on function public.vendor_entitlements(uuid) to authenticated, service_role;

-- ── 5. Feature switches ─────────────────────────────────────────────────────────────
create table public.feature_flags (
  key               text primary key check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  description       text not null default '' check (char_length(description) <= 500),
  enabled           boolean not null default false,
  allow_profile_ids uuid[] not null default '{}' check (cardinality(allow_profile_ids) <= 200),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);
alter table public.feature_flags enable row level security;
-- No client privileges and no policy: everything goes through the functions below.
revoke all on public.feature_flags from public, anon, authenticated;
comment on table public.feature_flags is
  'Feature switches. A switch is on for everyone when enabled, else only for allow_profile_ids. Created by the migration that ships the code reading it; changed only through admin_feature_flag_set().';
create trigger trg_admin_audit after insert or update or delete on public.feature_flags
  for each row execute function admin.audit_row_change();

insert into public.feature_flags (key, description, enabled) values
  ('subscription_checkout',
   'Vendors can buy, renew and change plans. While off, only the listed accounts can (test mode).',
   false);

-- Is a switch on for the signed-in caller?
create or replace function public.feature_on(p_key text)
returns boolean
language sql stable security definer set search_path = '' as $function$
  select coalesce(
    (select f.enabled or coalesce((select auth.uid()) = any (f.allow_profile_ids), false)
       from public.feature_flags f where f.key = p_key),
    false)
$function$;
revoke all on function public.feature_on(text) from public, anon;
grant execute on function public.feature_on(text) to authenticated, service_role;

-- For the service role (payment functions, jobs): is a switch on for this account?
create or replace function public.feature_on_for(p_key text, p_profile uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'feature_on_for is for server functions only' using errcode = '42501';
  end if;
  return coalesce(
    (select f.enabled or coalesce(p_profile = any (f.allow_profile_ids), false)
       from public.feature_flags f where f.key = p_key),
    false);
end
$function$;
revoke all on function public.feature_on_for(text, uuid) from public, anon, authenticated;
grant execute on function public.feature_on_for(text, uuid) to service_role;

-- Every switch, as it applies to the caller (the app reads them in one call).
create or replace function public.my_feature_flags()
returns table (key text, enabled boolean)
language sql stable security definer set search_path = '' as $function$
  select f.key, f.enabled or coalesce((select auth.uid()) = any (f.allow_profile_ids), false)
    from public.feature_flags f
   order by f.key
$function$;
revoke all on function public.my_feature_flags() from public, anon;
grant execute on function public.my_feature_flags() to authenticated;

-- Cosora-Admin: the switches with the names of the accounts they're on for.
create or replace function public.admin_feature_flags()
returns table (key text, description text, enabled boolean, allow_profile_ids uuid[], allow_names text[],
               updated_at timestamptz, updated_by_name text)
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'manager'), false) then
    raise exception 'not authorized: feature switches are for super admins and managers' using errcode = '42501';
  end if;
  return query
    select f.key, f.description, f.enabled, f.allow_profile_ids,
           array(select coalesce(nullif(vp.brand_name, ''), nullif(p.full_name, ''), a.id::text)
                   from unnest(f.allow_profile_ids) with ordinality a(id, n)
                   left join public.profiles p on p.id = a.id
                   left join public.vendor_profiles vp on vp.id = a.id
                  order by a.n),
           f.updated_at, admin.audit_actor_name(f.updated_by)
      from public.feature_flags f
     order by f.key;
end
$function$;
revoke all on function public.admin_feature_flags() from public, anon;
grant execute on function public.admin_feature_flags() to authenticated;

create or replace function public.admin_feature_flag_set(
  p_key text, p_enabled boolean, p_allow_profile_ids uuid[], p_reason text)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_ids uuid[] := coalesce(p_allow_profile_ids, '{}');
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
    raise exception 'not authorized: only a super admin changes a feature switch' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'say why the switch is changing' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'at most 200 accounts on a switch' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) a(id) where not exists (select 1 from public.profiles p where p.id = a.id)) then
    raise exception 'every listed account must exist' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);
  update public.feature_flags
     set enabled = coalesce(p_enabled, false),
         allow_profile_ids = array(select distinct a.id from unnest(v_ids) a(id)),
         updated_at = now(), updated_by = auth.uid()
   where key = p_key;
  if not found then
    raise exception 'no feature switch %', p_key using errcode = 'P0002';
  end if;
  perform set_config('cosora.audit_reason', '', true);
end
$function$;
revoke all on function public.admin_feature_flag_set(text, boolean, uuid[], text) from public, anon;
grant execute on function public.admin_feature_flag_set(text, boolean, uuid[], text) to authenticated;

-- ── 6. Who may start a plan checkout ────────────────────────────────────────────────
create or replace function public.subscription_checkout_gate(p_vendor uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_checkout_gate is for the payment functions only' using errcode = '42501';
  end if;
  select p.account_status::text into v_status from public.profiles p where p.id = p_vendor;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_vendor');
  end if;
  if v_status = 'deleted' then
    return jsonb_build_object('ok', false, 'reason', 'deleted');
  end if;
  if v_status = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;
  if not exists (select 1 from public.vendor_profiles v where v.id = p_vendor and v.onboarding_complete) then
    return jsonb_build_object('ok', false, 'reason', 'not_vendor');
  end if;
  if not coalesce(
       (select f.enabled or p_vendor = any (f.allow_profile_ids) from public.feature_flags f where f.key = 'subscription_checkout'),
       false) then
    return jsonb_build_object('ok', false, 'reason', 'payments_not_open');
  end if;
  return jsonb_build_object('ok', true);
end
$function$;
revoke all on function public.subscription_checkout_gate(uuid) from public, anon, authenticated;
grant execute on function public.subscription_checkout_gate(uuid) to service_role;

-- ── 7. Least-privilege reads (S-4) ──────────────────────────────────────────────────
alter policy subscription_payment_orders_select on public.subscription_payment_orders
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));
alter policy subscription_usage_select on public.subscription_usage
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));

-- ── 8. Cosora VIP is open to every vendor ───────────────────────────────────────────
update public.subscription_plans set is_invite_only = false where id = 'vip';

-- ── 9. Cosora's own billing details, for the tax invoice ────────────────────────────
create table admin.billing_entity (
  id            boolean primary key default true check (id),
  legal_name    text not null check (char_length(btrim(legal_name)) between 2 and 200),
  trade_name    text check (trade_name is null or char_length(trade_name) <= 200),
  address_line1 text not null check (char_length(btrim(address_line1)) between 3 and 200),
  address_line2 text check (address_line2 is null or char_length(address_line2) <= 200),
  city          text not null check (char_length(btrim(city)) between 2 and 100),
  state_code    text not null references public.india_states (code),
  postal_code   text not null check (postal_code ~ '^[1-9][0-9]{5}$'),
  gstin         text not null check (public.gstin_is_valid(gstin)),
  pan           text not null check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  sac_code      text check (sac_code is null or sac_code ~ '^[0-9]{6}$'),
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z]{2,6}$'),
  email         text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text check (phone is null or phone ~ '^\+?[0-9 ]{8,16}$'),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  check (substr(gstin, 3, 10) = pan)
);
comment on table admin.billing_entity is
  'Cosora''s legal and tax identity, printed on every tax invoice (frozen onto the invoice when it is issued). One row. Edited by super_admin and finance_admin through admin_billing_entity_save().';
create trigger trg_admin_audit after insert or update or delete on admin.billing_entity
  for each row execute function admin.audit_row_change();

-- The GSTIN must be registered in the state given.
create or replace function admin.billing_entity_state_matches()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if substr(new.gstin, 1, 2) is distinct from (select s.gst_code from public.india_states s where s.code = new.state_code) then
    raise exception 'the GSTIN''s state code doesn''t match the state' using errcode = '23514';
  end if;
  return new;
end
$function$;
create trigger trg_billing_entity_state before insert or update on admin.billing_entity
  for each row execute function admin.billing_entity_state_matches();

create or replace function public.admin_billing_entity()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: billing details are for super admins and finance' using errcode = '42501';
  end if;
  return (select to_jsonb(b) || jsonb_build_object('updated_by_name', admin.audit_actor_name(b.updated_by))
            from admin.billing_entity b);
end
$function$;
revoke all on function public.admin_billing_entity() from public, anon;
grant execute on function public.admin_billing_entity() to authenticated;

create or replace function public.admin_billing_entity_save(p jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: billing details are for super admins and finance' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'say why the billing details are changing' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);
  insert into admin.billing_entity as b (id, legal_name, trade_name, address_line1, address_line2, city, state_code,
                                         postal_code, gstin, pan, sac_code, invoice_prefix, email, phone, updated_at, updated_by)
  values (true,
          btrim(p ->> 'legal_name'), nullif(btrim(p ->> 'trade_name'), ''), btrim(p ->> 'address_line1'),
          nullif(btrim(p ->> 'address_line2'), ''), btrim(p ->> 'city'), upper(btrim(p ->> 'state_code')),
          btrim(p ->> 'postal_code'), upper(btrim(p ->> 'gstin')), upper(btrim(p ->> 'pan')),
          nullif(btrim(p ->> 'sac_code'), ''), coalesce(nullif(upper(btrim(p ->> 'invoice_prefix')), ''), 'INV'),
          nullif(btrim(p ->> 'email'), ''), nullif(btrim(p ->> 'phone'), ''), now(), auth.uid())
  on conflict (id) do update
     set legal_name = excluded.legal_name, trade_name = excluded.trade_name,
         address_line1 = excluded.address_line1, address_line2 = excluded.address_line2,
         city = excluded.city, state_code = excluded.state_code, postal_code = excluded.postal_code,
         gstin = excluded.gstin, pan = excluded.pan, sac_code = excluded.sac_code,
         invoice_prefix = excluded.invoice_prefix, email = excluded.email, phone = excluded.phone,
         updated_at = now(), updated_by = auth.uid();
  perform set_config('cosora.audit_reason', '', true);
  return public.admin_billing_entity();
end
$function$;
revoke all on function public.admin_billing_entity_save(jsonb, text) from public, anon;
grant execute on function public.admin_billing_entity_save(jsonb, text) to authenticated;

-- ── 10. Self-check ──────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if exists (select 1 from public.india_states where gst_code is null) or (select count(*) from public.india_states) <> 36 then
    raise exception 'every state needs its GST code';
  end if;
  if not public.gstin_is_valid('27AAPFU0939F1ZV') or public.gstin_is_valid('27AAPFU0939F1ZX') then
    raise exception 'gstin_is_valid disagrees with the GSTN checksum';
  end if;
  if has_function_privilege('anon', 'public.get_vendor_plan(uuid)', 'EXECUTE') then
    raise exception 'get_vendor_plan must not be callable signed out';
  end if;
  foreach f in array array['public.vendor_entitlements(uuid)', 'public.feature_on(text)', 'public.my_feature_flags()',
                           'public.admin_feature_flags()', 'public.admin_feature_flag_set(text,boolean,uuid[],text)',
                           'public.admin_billing_entity()', 'public.admin_billing_entity_save(jsonb,text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must be for signed-in callers only', f;
    end if;
  end loop;
  foreach f in array array['public.feature_on_for(text,uuid)', 'public.subscription_checkout_gate(uuid)',
                           'admin.vendor_effective_plan(uuid,timestamptz)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.feature_flags', 'SELECT')
     or has_table_privilege('anon', 'public.feature_flags', 'SELECT') then
    raise exception 'feature_flags must be read through its functions';
  end if;
  if (select relrowsecurity from pg_class where oid = 'public.feature_flags'::regclass) is not true then
    raise exception 'feature_flags must have RLS on';
  end if;
  if (select is_invite_only from public.subscription_plans where id = 'vip') then
    raise exception 'VIP must be open';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('subscription_payment_orders', 'subscription_usage') and cmd = 'SELECT'
              and qual ~ 'is_admin' and qual !~ 'admin_role') then
    raise exception 'subscription_payment_orders and subscription_usage reads must name their admin roles';
  end if;
end
$check$;
