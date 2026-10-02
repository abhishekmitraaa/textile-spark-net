-- Admin completion, Phase 10 (Mitra, 2026-09-29): discount codes on vendor purchases.
--
-- Cosora-Admin's Discounts page managed a dev-seed fixture. Only vendors pay Cosora (plans,
-- ads and the Verified Certificate; buyers never pay), so a code discounts one of three things:
--
--   vendor_plan   a subscription plan's price, before GST; GST is charged on what's left
--   ad_purchase   an ad order's campaign lines: every placement except the certificate
--   certificate   an ad order's Cosora Verified Certificate line (verifiedCertificate)
--
-- The two rules the fixture's header set out, now enforced here:
--   1. Uses are counted from the redemptions table, under a row lock on the code, so two
--      vendors racing for the last use can't both get it.
--   2. The discount is worked out here, from amounts the payment functions price themselves.
--      No browser ever sends a discount or an amount.
--
-- Tables, in the admin schema (PostgREST doesn't expose it):
--   admin.discount_codes         the codes
--   admin.discount_redemptions   one row per order that carried a code: reserved, then
--                                confirmed (paid) or released (the checkout never happened)
--   admin.discount_attempts      codes a vendor tried that don't exist, for the guessing limit
--
-- A reservation holds a use for 30 minutes and then lapses by itself: every count ignores a
-- lapsed one, so nothing has to sweep them. A payment that lands after that still confirms,
-- because the vendor was charged the discounted price.
--
-- For the payment edge functions (service role only):
--   discount_check     would this code apply, and for how much (a quote; takes no use)
--   discount_reserve   the same under the code's row lock, holding a use for one order
--   discount_confirm   the order was paid (idempotent: the verify call and the webhook both call it)
--   discount_release   the checkout failed before the vendor could pay
-- For Cosora-Admin (super_admin, finance_admin; roles.ts "discounts"):
--   admin_discount_codes, admin_discount_code_save, admin_discount_code_set_active,
--   admin_discount_redemptions
--
-- What each order and invoice discounted is stored with it, in the table's own unit:
--   subscription_payment_orders  list_rupees, discount_rupees, discount_code, discount_redemption_id
--   ad_orders                    discount_paise, discount_code, discount_redemption_id
--   subscription_invoices        discount_amount (rupees, like amount), discount_code
-- and the payments ledger shows it on each row.

-- ── 1. Codes, redemptions, attempts ─────────────────────────────────────────
create table if not exists admin.discount_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  kind             text not null,
  value            integer not null,
  applies_to       text not null,
  plan_ids         text[],
  max_uses         integer,
  per_vendor_limit integer not null default 1,
  valid_from       timestamptz not null default now(),
  valid_to         timestamptz,
  active           boolean not null default true,
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint discount_codes_code_key unique (code),
  -- Stored in upper case. What a vendor types is trimmed and upper-cased before matching.
  constraint discount_codes_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint discount_codes_kind_check check (kind in ('percent', 'flat')),
  -- A percentage is 1 to 100. A flat discount is whole rupees, like every Cosora price.
  constraint discount_codes_value_check check (
    (kind = 'percent' and value between 1 and 100) or (kind = 'flat' and value between 1 and 1000000)),
  constraint discount_codes_applies_to_check check (applies_to in ('vendor_plan', 'ad_purchase', 'certificate')),
  -- Plans narrow a plan code only. Null means every plan a vendor can buy themselves.
  constraint discount_codes_plan_ids_check check (
    plan_ids is null or (applies_to = 'vendor_plan' and cardinality(plan_ids) between 1 and 20)),
  -- Null means no cap. Zero would make the code unusable, which is what switching it off is for.
  constraint discount_codes_max_uses_check check (max_uses is null or max_uses between 1 and 1000000),
  constraint discount_codes_per_vendor_check check (per_vendor_limit between 1 and 1000),
  constraint discount_codes_window_check check (valid_to is null or valid_to > valid_from),
  constraint discount_codes_note_check check (note is null or char_length(note) between 1 and 200)
);

create table if not exists admin.discount_redemptions (
  id             uuid primary key default gen_random_uuid(),
  code_id        uuid not null references admin.discount_codes (id) on delete restrict,
  vendor_id      uuid not null references public.vendor_profiles (id) on delete cascade,
  order_kind     text not null,
  -- The Razorpay order id; free_<uuid> for an order the code took to ₹0 (no gateway call);
  -- demo_<uuid> when no gateway is configured.
  order_ref      text not null,
  status         text not null default 'reserved',
  eligible_paise bigint not null,
  discount_paise bigint not null,
  reserved_at    timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 minutes',
  confirmed_at   timestamptz,
  released_at    timestamptz,
  constraint discount_redemptions_order_key unique (order_kind, order_ref),
  constraint discount_redemptions_order_kind_check check (order_kind in ('subscription', 'ad')),
  constraint discount_redemptions_order_ref_check check (char_length(order_ref) between 1 and 100),
  constraint discount_redemptions_status_check check (status in ('reserved', 'confirmed', 'released')),
  constraint discount_redemptions_amounts_check check (discount_paise > 0 and discount_paise <= eligible_paise)
);
create index if not exists discount_redemptions_code_idx on admin.discount_redemptions (code_id, status);
create index if not exists discount_redemptions_vendor_idx on admin.discount_redemptions (vendor_id, code_id);

create table if not exists admin.discount_attempts (
  id        bigint generated always as identity primary key,
  vendor_id uuid not null,
  at        timestamptz not null default now()
);
create index if not exists discount_attempts_vendor_idx on admin.discount_attempts (vendor_id, at desc);

alter table admin.discount_codes enable row level security;
alter table admin.discount_redemptions enable row level security;
alter table admin.discount_attempts enable row level security;
revoke all on admin.discount_codes, admin.discount_redemptions, admin.discount_attempts
  from public, anon, authenticated;

-- The Admin Log records admin writes. The payment functions write as the service role,
-- which the audit function skips.
drop trigger if exists trg_admin_audit on admin.discount_codes;
create trigger trg_admin_audit after insert or update or delete on admin.discount_codes
  for each row execute function admin.audit_row_change('');
drop trigger if exists trg_admin_audit on admin.discount_redemptions;
create trigger trg_admin_audit after insert or update or delete on admin.discount_redemptions
  for each row execute function admin.audit_row_change('');

-- ── 2. What each order and invoice discounted ───────────────────────────────
-- subscription_payment_orders.amount is paise with GST included, so the plan's price and the
-- discount are kept beside it, in rupees: the invoice is written from them (base = list −
-- discount, GST on the base) instead of re-reading a plan price that may have changed since.
alter table public.subscription_payment_orders
  add column if not exists list_rupees integer,
  add column if not exists discount_rupees integer not null default 0,
  add column if not exists discount_code text,
  add column if not exists discount_redemption_id uuid;
alter table public.subscription_payment_orders
  drop constraint if exists subscription_payment_orders_discount_check;
alter table public.subscription_payment_orders
  add constraint subscription_payment_orders_discount_check check (
    (discount_rupees = 0 and discount_code is null and discount_redemption_id is null)
    or (discount_rupees > 0 and discount_code is not null and discount_redemption_id is not null
        and list_rupees is not null and discount_rupees <= list_rupees));

-- ad_orders.amount is what was charged, in paise; discount_paise is what the code took off.
alter table public.ad_orders
  add column if not exists discount_paise integer not null default 0,
  add column if not exists discount_code text,
  add column if not exists discount_redemption_id uuid;
alter table public.ad_orders
  drop constraint if exists ad_orders_discount_check;
alter table public.ad_orders
  add constraint ad_orders_discount_check check (
    (discount_paise = 0 and discount_code is null and discount_redemption_id is null)
    or (discount_paise > 0 and discount_code is not null and discount_redemption_id is not null));

-- On an invoice, amount stays the taxable value (after the discount) and gst_amount the GST
-- on it, so every existing reader keeps adding them up correctly. The list price is
-- amount + discount_amount.
alter table public.subscription_invoices
  add column if not exists discount_amount integer,
  add column if not exists discount_code text;
alter table public.subscription_invoices
  drop constraint if exists subscription_invoices_discount_check;
alter table public.subscription_invoices
  add constraint subscription_invoices_discount_check check (
    (discount_amount is null and discount_code is null)
    or (discount_amount > 0 and discount_code is not null));

-- ── 3. The arithmetic, and whether a code applies ───────────────────────────
-- Whole rupees: a percentage rounds to the nearest rupee, and no discount is ever more than
-- the amount it applies to.
create or replace function admin.discount_amount(p_kind text, p_value integer, p_eligible bigint)
returns bigint
language sql
immutable
set search_path = ''
as $function$
  select case
           when coalesce(p_eligible, 0) <= 0 then 0::bigint
           when p_kind = 'percent' then least(round(p_eligible * p_value / 100.0), p_eligible)::bigint
           when p_kind = 'flat' then least(p_value::bigint, p_eligible)
           else 0::bigint
         end
$function$;

-- Whether a code applies to one order, and what it takes off. The amounts are the order's
-- own, priced by the calling function: the plan price before GST, and the ad order split
-- into its certificate line and everything else. p_lock takes the code's row lock first,
-- which is what makes two reservations of the same code queue: the second one waits for
-- the first to commit, then counts it.
create or replace function admin.discount_evaluate(
  p_code               text,
  p_vendor             uuid,
  p_order_kind         text,
  p_plan_id            text,
  p_plan_rupees        bigint,
  p_ad_rupees          bigint,
  p_certificate_rupees bigint,
  p_lock               boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_row      admin.discount_codes;
  v_fails    bigint;
  v_eligible bigint;
  v_used     bigint;
  v_mine     bigint;
  v_discount bigint;
begin
  if p_order_kind is null or p_order_kind not in ('subscription', 'ad') then
    raise exception 'order kind must be subscription or ad' using errcode = '22023';
  end if;
  if p_vendor is null or not exists (select 1 from public.vendor_profiles v where v.id = p_vendor) then
    return jsonb_build_object('ok', false, 'reason', 'not_vendor');
  end if;

  -- Ten codes that don't exist in an hour, and the vendor can't try any code for the rest of
  -- that hour. Codes are short; this is what stops them being guessed.
  select count(*) into v_fails
    from admin.discount_attempts a
   where a.vendor_id = p_vendor and a.at > now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  if v_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    if p_lock then
      select * into v_row from admin.discount_codes c where c.code = v_code for update;
    else
      select * into v_row from admin.discount_codes c where c.code = v_code;
    end if;
  end if;
  if v_row.id is null then
    insert into admin.discount_attempts (vendor_id) values (p_vendor);
    delete from admin.discount_attempts a where a.vendor_id = p_vendor and a.at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if not v_row.active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v_row.valid_from > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_started');
  end if;
  if v_row.valid_to is not null and v_row.valid_to <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if (p_order_kind = 'subscription') <> (v_row.applies_to = 'vendor_plan') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_target', 'applies_to', v_row.applies_to);
  end if;
  if v_row.plan_ids is not null and (p_plan_id is null or not (p_plan_id = any (v_row.plan_ids))) then
    return jsonb_build_object('ok', false, 'reason', 'wrong_plan');
  end if;

  v_eligible := case v_row.applies_to
                  when 'vendor_plan' then p_plan_rupees
                  when 'ad_purchase' then p_ad_rupees
                  else p_certificate_rupees
                end;
  if coalesce(v_eligible, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_applicable', 'applies_to', v_row.applies_to);
  end if;

  -- A use is a confirmed redemption, or another vendor's reservation that hasn't lapsed. The
  -- vendor's own open reservation isn't counted: a new checkout replaces it.
  select count(*) filter (where r.status = 'confirmed'
                             or (r.status = 'reserved' and r.expires_at > now() and r.vendor_id <> p_vendor)),
         count(*) filter (where r.status = 'confirmed' and r.vendor_id = p_vendor)
    into v_used, v_mine
    from admin.discount_redemptions r
   where r.code_id = v_row.id;
  if v_row.max_uses is not null and v_used >= v_row.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;
  if v_mine >= v_row.per_vendor_limit then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  v_discount := admin.discount_amount(v_row.kind, v_row.value, v_eligible);
  if v_discount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_discount');
  end if;

  return jsonb_build_object(
    'ok', true, 'code_id', v_row.id, 'code', v_row.code, 'applies_to', v_row.applies_to,
    'kind', v_row.kind, 'value', v_row.value,
    'eligible_rupees', v_eligible, 'discount_rupees', v_discount);
end
$function$;

-- ── 4. For the payment functions (service role only) ────────────────────────
create or replace function public.discount_check(
  p_code               text,
  p_vendor             uuid,
  p_order_kind         text,
  p_plan_id            text   default null,
  p_plan_rupees        bigint default 0,
  p_ad_rupees          bigint default 0,
  p_certificate_rupees bigint default 0)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $function$
  select admin.discount_evaluate(p_code, p_vendor, p_order_kind, p_plan_id,
                                 p_plan_rupees, p_ad_rupees, p_certificate_rupees, false)
$function$;

create or replace function public.discount_reserve(
  p_code               text,
  p_vendor             uuid,
  p_order_kind         text,
  p_order_ref          text,
  p_expected_rupees    bigint default null,
  p_plan_id            text   default null,
  p_plan_rupees        bigint default 0,
  p_ad_rupees          bigint default 0,
  p_certificate_rupees bigint default 0)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_id     uuid;
begin
  if p_order_ref is null or char_length(btrim(p_order_ref)) not between 1 and 100 then
    raise exception 'an order reference is required' using errcode = '22023';
  end if;

  v_result := admin.discount_evaluate(p_code, p_vendor, p_order_kind, p_plan_id,
                                      p_plan_rupees, p_ad_rupees, p_certificate_rupees, true);
  if not (v_result ->> 'ok')::boolean then
    return v_result;
  end if;
  -- The order was priced from an earlier check. If the code changed since (an admin edited
  -- it), refuse: the vendor would be charged a price they weren't shown.
  if p_expected_rupees is not null and (v_result ->> 'discount_rupees')::bigint <> p_expected_rupees then
    return jsonb_build_object('ok', false, 'reason', 'changed');
  end if;

  -- One open checkout per vendor per code: this one replaces the vendor's unpaid ones. If a
  -- replaced order is paid anyway, discount_confirm still honours it.
  update admin.discount_redemptions r
     set status = 'released', released_at = now()
   where r.code_id = (v_result ->> 'code_id')::uuid
     and r.vendor_id = p_vendor
     and r.status = 'reserved';

  insert into admin.discount_redemptions (code_id, vendor_id, order_kind, order_ref, eligible_paise, discount_paise)
  values ((v_result ->> 'code_id')::uuid, p_vendor, p_order_kind, btrim(p_order_ref),
          (v_result ->> 'eligible_rupees')::bigint * 100, (v_result ->> 'discount_rupees')::bigint * 100)
  returning id into v_id;

  return v_result || jsonb_build_object('redemption_id', v_id);
end
$function$;

-- Paid. The vendor was charged the discounted price, so this succeeds for the order that
-- reserved the use even after the reservation lapsed or was replaced. Calling it again
-- changes nothing.
create or replace function public.discount_confirm(p_redemption uuid, p_order_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row admin.discount_redemptions;
begin
  update admin.discount_redemptions r
     set status = 'confirmed', confirmed_at = now()
   where r.id = p_redemption and r.order_ref = p_order_ref and r.status <> 'confirmed'
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from admin.discount_redemptions r
     where r.id = p_redemption and r.order_ref = p_order_ref;
    if v_row.id is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'redemption_id', v_row.id,
                            'discount_paise', v_row.discount_paise, 'confirmed_at', v_row.confirmed_at);
end
$function$;

-- Not paid: the checkout failed before the vendor could pay. Never undoes a confirmation.
create or replace function public.discount_release(p_redemption uuid, p_order_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  update admin.discount_redemptions r
     set status = 'released', released_at = now()
   where r.id = p_redemption and r.order_ref = p_order_ref and r.status = 'reserved';
  return jsonb_build_object('ok', found);
end
$function$;

-- ── 5. For Cosora-Admin (super_admin, finance_admin) ────────────────────────
create or replace function admin.discounts_can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'finance_admin']::public.admin_role_type[]), false)
$function$;

-- Every code, newest first, with its uses and the state that explains whether it works now.
-- "uses" are confirmed; "in_checkout" are reservations that haven't lapsed.
create or replace function public.admin_discount_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not admin.discounts_can_manage() then
    raise exception 'not authorized: discounts are for super admins and finance' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'code', c.code, 'kind', c.kind, 'value', c.value,
             'applies_to', c.applies_to, 'plan_ids', to_jsonb(c.plan_ids),
             'max_uses', c.max_uses, 'per_vendor_limit', c.per_vendor_limit,
             'valid_from', c.valid_from, 'valid_to', c.valid_to, 'active', c.active,
             'note', c.note, 'created_at', c.created_at, 'updated_at', c.updated_at,
             'uses', u.confirmed, 'in_checkout', u.in_checkout, 'vendors', u.vendors,
             'discount_paise', u.discount_paise, 'last_used_at', u.last_used_at,
             'state', case
                        when not c.active then 'inactive'
                        when c.valid_from > now() then 'scheduled'
                        when c.valid_to is not null and c.valid_to <= now() then 'expired'
                        when c.max_uses is not null and u.confirmed + u.in_checkout >= c.max_uses then 'exhausted'
                        else 'live'
                      end)
           order by c.created_at desc, c.id)
      from admin.discount_codes c
      cross join lateral (
        select count(*) filter (where r.status = 'confirmed') as confirmed,
               count(*) filter (where r.status = 'reserved' and r.expires_at > now()) as in_checkout,
               count(distinct r.vendor_id) filter (where r.status = 'confirmed') as vendors,
               coalesce(sum(r.discount_paise) filter (where r.status = 'confirmed'), 0) as discount_paise,
               max(r.confirmed_at) as last_used_at
          from admin.discount_redemptions r
         where r.code_id = c.id) u
  ), '[]'::jsonb);
end
$function$;

-- Create (p_id null) or edit a code; returns its id. Once a code has a confirmed use, what it
-- means is fixed: its text, its discount and what it applies to. Its dates, caps, note and
-- on/off can still change, but maximum uses can't go below the uses already made.
create or replace function public.admin_discount_code_save(
  p_id               uuid,
  p_code             text,
  p_kind             text,
  p_value            integer,
  p_applies_to       text,
  p_plan_ids         text[],
  p_max_uses         integer,
  p_per_vendor_limit integer,
  p_valid_from       timestamptz,
  p_valid_to         timestamptz,
  p_active           boolean,
  p_note             text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_old   admin.discount_codes;
  v_from  timestamptz;
  v_plans text[];
  v_bad   text;
  v_used  bigint := 0;
  v_id    uuid;
begin
  if not admin.discounts_can_manage() then
    raise exception 'not authorized: discounts are for super admins and finance' using errcode = '42501';
  end if;

  if p_id is not null then
    select * into v_old from admin.discount_codes c where c.id = p_id for update;
    if v_old.id is null then
      raise exception 'no such discount code' using errcode = 'P0002';
    end if;
    select count(*) into v_used from admin.discount_redemptions r where r.code_id = p_id and r.status = 'confirmed';
  end if;
  v_from := coalesce(p_valid_from, v_old.valid_from, now());

  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception 'A code is 3 to 32 letters, digits, dashes or underscores, and starts with a letter or digit.'
      using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('percent', 'flat') then
    raise exception 'Choose a percentage or a flat rupee discount.' using errcode = '22023';
  end if;
  if p_kind = 'percent' and (p_value is null or p_value not between 1 and 100) then
    raise exception 'A percentage is 1 to 100.' using errcode = '22023';
  end if;
  if p_kind = 'flat' and (p_value is null or p_value not between 1 and 1000000) then
    raise exception 'A flat discount is ₹1 to ₹10,00,000, in whole rupees.' using errcode = '22023';
  end if;
  if p_applies_to is null or p_applies_to not in ('vendor_plan', 'ad_purchase', 'certificate') then
    raise exception 'Choose what the code applies to.' using errcode = '22023';
  end if;

  -- Plans narrow a plan code only, and each has to be one a vendor can buy themselves.
  v_plans := array(select distinct btrim(p) from unnest(coalesce(p_plan_ids, '{}'::text[])) as p
                    where nullif(btrim(p), '') is not null order by 1);
  if cardinality(v_plans) = 0 then
    v_plans := null;
  elsif p_applies_to <> 'vendor_plan' then
    raise exception 'Only a plan code can be limited to particular plans.' using errcode = '22023';
  elsif cardinality(v_plans) > 20 then
    raise exception 'A code can name at most 20 plans.' using errcode = '22023';
  else
    select string_agg(p, ', ' order by p) into v_bad
      from unnest(v_plans) as p
     where not exists (select 1 from public.subscription_plans sp
                        where sp.id = p and not sp.is_invite_only
                          and (sp.monthly_price > 0 or sp.yearly_price > 0));
    if v_bad is not null then
      raise exception 'Not a plan vendors can buy themselves: %.', v_bad using errcode = '22023';
    end if;
  end if;

  if p_max_uses is not null and p_max_uses not between 1 and 1000000 then
    raise exception 'Maximum uses is at least 1. Leave it blank for no cap.' using errcode = '22023';
  end if;
  if p_per_vendor_limit is null or p_per_vendor_limit not between 1 and 1000 then
    raise exception 'Uses per vendor is 1 to 1,000.' using errcode = '22023';
  end if;
  if p_valid_to is not null and p_valid_to <= v_from then
    raise exception 'The end date has to be after the start date.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'The note is at most 200 characters.' using errcode = '22023';
  end if;

  if p_id is null then
    begin
      insert into admin.discount_codes
        (code, kind, value, applies_to, plan_ids, max_uses, per_vendor_limit,
         valid_from, valid_to, active, note, created_by)
      values
        (v_code, p_kind, p_value, p_applies_to, v_plans, p_max_uses, p_per_vendor_limit,
         v_from, p_valid_to, coalesce(p_active, true), v_note, auth.uid())
      returning id into v_id;
    exception when unique_violation then
      raise exception '% already exists. Codes stay unique, even after they end.', v_code using errcode = '23505';
    end;
    return v_id;
  end if;

  if v_used > 0 and (v_code <> v_old.code or p_kind <> v_old.kind or p_value <> v_old.value
                     or p_applies_to <> v_old.applies_to or v_plans is distinct from v_old.plan_ids) then
    raise exception '% has been used %, so its code, discount and what it applies to are fixed. Create a new code instead.',
      v_old.code, case when v_used = 1 then 'once' else v_used || ' times' end
      using errcode = '22023';
  end if;
  if p_max_uses is not null and p_max_uses < v_used then
    raise exception 'Maximum uses can''t be below the % already made.', v_used using errcode = '22023';
  end if;

  begin
    update admin.discount_codes c
       set code = v_code, kind = p_kind, value = p_value, applies_to = p_applies_to,
           plan_ids = v_plans, max_uses = p_max_uses, per_vendor_limit = p_per_vendor_limit,
           valid_from = v_from, valid_to = p_valid_to, active = coalesce(p_active, c.active),
           note = v_note, updated_at = now()
     where c.id = p_id;
  exception when unique_violation then
    raise exception '% already exists. Codes stay unique, even after they end.', v_code using errcode = '23505';
  end;
  return p_id;
end
$function$;

create or replace function public.admin_discount_code_set_active(p_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not admin.discounts_can_manage() then
    raise exception 'not authorized: discounts are for super admins and finance' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'say whether the code is on or off' using errcode = '22023';
  end if;
  update admin.discount_codes c set active = p_active, updated_at = now() where c.id = p_id;
  if not found then
    raise exception 'no such discount code' using errcode = 'P0002';
  end if;
end
$function$;

-- One code's redemptions, newest first. A reservation past its 30 minutes shows as 'lapsed'.
create or replace function public.admin_discount_redemptions(p_code_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not admin.discounts_can_manage() then
    raise exception 'not authorized: discounts are for super admins and finance' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'vendor_id', r.vendor_id, 'vendor_name', v.brand_name,
             'order_kind', r.order_kind, 'order_ref', r.order_ref,
             'status', case when r.status = 'reserved' and r.expires_at <= now() then 'lapsed' else r.status end,
             'eligible_paise', r.eligible_paise, 'discount_paise', r.discount_paise,
             'reserved_at', r.reserved_at, 'confirmed_at', r.confirmed_at, 'released_at', r.released_at)
           order by r.reserved_at desc, r.id)
      from (select x.* from admin.discount_redemptions x
             where x.code_id = p_code_id
             order by x.reserved_at desc, x.id
             limit least(greatest(coalesce(p_limit, 100), 1), 500)) r
      left join public.vendor_profiles v on v.id = r.vendor_id
  ), '[]'::jsonb);
end
$function$;

revoke all on function admin.discount_amount(text, integer, bigint) from public, anon, authenticated;
revoke all on function admin.discount_evaluate(text, uuid, text, text, bigint, bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function admin.discounts_can_manage() from public, anon, authenticated;
revoke all on function public.discount_check(text, uuid, text, text, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.discount_reserve(text, uuid, text, text, bigint, text, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.discount_confirm(uuid, text) from public, anon, authenticated;
revoke all on function public.discount_release(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_discount_codes() from public, anon, authenticated;
revoke all on function public.admin_discount_code_save(uuid, text, text, integer, text, text[], integer, integer, timestamptz, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function public.admin_discount_code_set_active(uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_discount_redemptions(uuid, integer) from public, anon, authenticated;
grant execute on function public.discount_check(text, uuid, text, text, bigint, bigint, bigint) to service_role;
grant execute on function public.discount_reserve(text, uuid, text, text, bigint, text, bigint, bigint, bigint) to service_role;
grant execute on function public.discount_confirm(uuid, text) to service_role;
grant execute on function public.discount_release(uuid, text) to service_role;
grant execute on function public.admin_discount_codes() to authenticated;
grant execute on function public.admin_discount_code_save(uuid, text, text, integer, text, text[], integer, integer, timestamptz, timestamptz, boolean, text) to authenticated;
grant execute on function public.admin_discount_code_set_active(uuid, boolean) to authenticated;
grant execute on function public.admin_discount_redemptions(uuid, integer) to authenticated;

-- ── 6. The payments ledger shows each row's discount ────────────────────────
-- Two columns added at the end (discount_paise, discount_code). One definition changed: an
-- invoice for ₹0 (a 100%-off code) counts as verified, since there was no money to verify.
create or replace view admin.payment_entries as
  -- A subscription invoice: the payment itself.
  select 'invoice:' || i.id::text                                  as entry_key,
         i.created_at                                               as occurred_at,
         'subscription'::text                                       as kind,
         i.status                                                   as status,
         i.vendor_id                                                as vendor_id,
         coalesce(i.invoice_number, i.id::text)                     as reference,
         coalesce(sp.name, i.plan_id) || ' plan · '
           || case when i.billing_period_end - i.billing_period_start >= interval '360 days'
                   then 'yearly' else 'monthly' end                 as detail,
         i.amount::bigint * 100                                     as net_paise,
         coalesce(i.gst_amount, 0)::bigint * 100                    as gst_paise,
         (i.amount + coalesce(i.gst_amount, 0))::bigint * 100       as total_paise,
         i.razorpay_payment_id                                      as gateway_ref,
         i.razorpay_payment_id is not null
           or i.amount + coalesce(i.gst_amount, 0) = 0              as verified,
         false                                                      as includes_certificate,
         'subscription_invoices'::text                              as source_table,
         i.id::text                                                 as source_id,
         coalesce(i.discount_amount, 0)::bigint * 100               as discount_paise,
         i.discount_code                                            as discount_code
    from public.subscription_invoices i
    left join public.subscription_plans sp on sp.id = i.plan_id
  union all
  -- A refund of that invoice, as a negative row of its own.
  select 'refund:' || i.id::text,
         coalesce(i.refunded_at, i.refund_requested_at, i.created_at),
         'refund',
         case i.refund_status when 'processed' then 'refunded' when 'failed' then 'failed' else 'pending' end,
         i.vendor_id,
         coalesce(i.invoice_number, i.id::text),
         'Refund of ' || coalesce(i.invoice_number, 'an invoice'),
         null::bigint,
         null::bigint,
         -coalesce(i.refunded_amount::bigint, (i.amount + coalesce(i.gst_amount, 0))::bigint * 100),
         i.razorpay_refund_id,
         i.razorpay_refund_id is not null,
         false,
         'subscription_invoices',
         i.id::text,
         null::bigint,
         null::text
    from public.subscription_invoices i
   where i.refund_status is not null
  union all
  -- A subscription checkout that didn't complete. A paid one is its invoice row above.
  select 'intent:' || o.order_id,
         o.created_at,
         'subscription',
         case when o.status = 'failed' then 'failed'
              when o.created_at > now() - interval '24 hours' then 'pending'
              else 'abandoned' end,
         o.vendor_id,
         o.order_id,
         coalesce(sp.name, o.plan_id) || ' plan · ' || o.billing_cycle || ' · checkout',
         null::bigint,
         null::bigint,
         o.amount::bigint,
         o.order_id,
         false,
         false,
         'subscription_payment_orders',
         o.order_id,
         o.discount_rupees::bigint * 100,
         o.discount_code
    from public.subscription_payment_orders o
    left join public.subscription_plans sp on sp.id = o.plan_id
   where o.status in ('created', 'failed')
  union all
  -- An ad or certificate purchase. An order of the certificate alone is 'certificate'; one
  -- that also buys ad placements is 'ad_purchase' with includes_certificate. The amount
  -- isn't split: the order doesn't store per-line prices.
  select 'ad:' || o.order_id,
         coalesce(o.paid_at, o.created_at),
         case when coalesce(o.spec -> 'placementIds', '[]'::jsonb) = '["verifiedCertificate"]'::jsonb
              then 'certificate' else 'ad_purchase' end,
         case o.status
              when 'paid' then 'paid'
              when 'refund_review' then 'review'
              when 'failed' then 'failed'
              else case when o.created_at > now() - interval '24 hours' then 'pending' else 'abandoned' end
         end,
         o.vendor_id,
         o.order_id,
         coalesce(nullif(btrim(o.spec ->> 'campaignLabel'), ''), 'Ad campaign') || ' · '
           || coalesce((select string_agg(p.value, ', ')
                          from jsonb_array_elements_text(coalesce(o.spec -> 'placementIds', '[]'::jsonb)) as p(value)),
                       'no placements'),
         null::bigint,
         null::bigint,
         o.amount::bigint,
         o.order_id,
         o.status in ('paid', 'refund_review'),
         coalesce(o.spec -> 'placementIds', '[]'::jsonb) ? 'verifiedCertificate',
         'ad_orders',
         o.order_id,
         o.discount_paise::bigint,
         o.discount_code
    from public.ad_orders o;

revoke all on admin.payment_entries from public, anon, authenticated;

-- The ledger's row type gains the two columns, so the function is replaced, not altered. One
-- transaction: no caller ever finds it missing.
drop function if exists public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, int);
create function public.admin_payments_ledger(
  p_kinds      text[]      default null,
  p_statuses   text[]      default null,
  p_from       timestamptz default null,
  p_to         timestamptz default null,
  p_vendor     uuid        default null,
  p_search     text        default null,
  p_cursor_at  timestamptz default null,
  p_cursor_key text        default null,
  p_limit      int         default 50)
returns table(entry_key text, occurred_at timestamptz, kind text, status text, vendor_id uuid,
              vendor_name text, vendor_city text, reference text, detail text, net_paise bigint,
              gst_paise bigint, total_paise bigint, gateway_ref text, verified boolean,
              includes_certificate boolean, source_table text, source_id text,
              discount_paise bigint, discount_code text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_limit   int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_search  text := nullif(btrim(p_search), '');
  v_like    text;
  v_vendors uuid[];
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]), false) then
    raise exception 'not authorized: payments are for super admins, finance and support' using errcode = '42501';
  end if;
  if (p_cursor_at is null) <> (p_cursor_key is null) then
    raise exception 'a cursor needs both occurred_at and entry_key' using errcode = '22023';
  end if;
  if v_search is not null then
    -- The search is literal text: % and _ match themselves.
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_vendors := array(select v.id from public.vendor_profiles v where v.brand_name ilike v_like limit 500);
  end if;

  return query
    select e.entry_key, e.occurred_at, e.kind, e.status, e.vendor_id, v.brand_name, v.city,
           e.reference, e.detail, e.net_paise, e.gst_paise, e.total_paise, e.gateway_ref,
           e.verified, e.includes_certificate, e.source_table, e.source_id,
           e.discount_paise, e.discount_code
      from admin.payment_entries e
      left join public.vendor_profiles v on v.id = e.vendor_id
     where (p_kinds is null or e.kind = any (p_kinds))
       and (p_statuses is null or e.status = any (p_statuses))
       and (p_from is null or e.occurred_at >= p_from)
       and (p_to is null or e.occurred_at < p_to)
       and (p_vendor is null or e.vendor_id = p_vendor)
       and (v_search is null
            or e.vendor_id = any (v_vendors)
            or e.reference ilike v_like
            or e.gateway_ref ilike v_like
            or e.discount_code ilike v_like)
       and (p_cursor_at is null or (e.occurred_at, e.entry_key) < (p_cursor_at, p_cursor_key))
     order by e.occurred_at desc, e.entry_key desc
     limit v_limit;
end
$function$;

create or replace function public.admin_payments_summary(
  p_kinds    text[]      default null,
  p_statuses text[]      default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_vendor   uuid        default null,
  p_search   text        default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_search  text := nullif(btrim(p_search), '');
  v_like    text;
  v_vendors uuid[];
  v_result  jsonb;
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]), false) then
    raise exception 'not authorized: payments are for super admins, finance and support' using errcode = '42501';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_vendors := array(select v.id from public.vendor_profiles v where v.brand_name ilike v_like limit 500);
  end if;

  -- Paid totals use admin_report_summary()'s definitions (paid invoices by created_at, paid
  -- ad orders by paid_at), so the two pages agree over the same window. Refunds are shown
  -- beside them, not netted into them. Discounts are what paid rows didn't charge.
  select jsonb_build_object(
           'generated_at',            now(),
           'entries',                 count(*),
           'paid',                    count(*) filter (where e.status = 'paid'),
           'pending',                 count(*) filter (where e.status = 'pending'),
           'abandoned',               count(*) filter (where e.status = 'abandoned'),
           'failed',                  count(*) filter (where e.status = 'failed'),
           'review',                  count(*) filter (where e.status = 'review'),
           'refunds',                 count(*) filter (where e.kind = 'refund'),
           'paid_paise',              coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund'), 0),
           'subscriptions_net_paise', coalesce(sum(e.net_paise) filter (where e.status = 'paid' and e.kind = 'subscription'), 0),
           'gst_paise',               coalesce(sum(e.gst_paise) filter (where e.status = 'paid' and e.kind = 'subscription'), 0),
           'ads_paise',               coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind in ('ad_purchase', 'certificate')), 0),
           'refunded_paise',          coalesce(-sum(e.total_paise) filter (where e.kind = 'refund' and e.status = 'refunded'), 0),
           'review_paise',            coalesce(sum(e.total_paise) filter (where e.status = 'review'), 0),
           'unverified_paise',        coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and not e.verified), 0),
           'unverified',              count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and not e.verified),
           'discounts_paise',         coalesce(sum(e.discount_paise) filter (where e.status = 'paid' and e.kind <> 'refund'), 0),
           'discounted',              count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and e.discount_paise > 0))
    into v_result
    from admin.payment_entries e
   where (p_kinds is null or e.kind = any (p_kinds))
     and (p_statuses is null or e.status = any (p_statuses))
     and (p_from is null or e.occurred_at >= p_from)
     and (p_to is null or e.occurred_at < p_to)
     and (p_vendor is null or e.vendor_id = p_vendor)
     and (v_search is null
          or e.vendor_id = any (v_vendors)
          or e.reference ilike v_like
          or e.gateway_ref ilike v_like
          or e.discount_code ilike v_like);
  return v_result;
end
$function$;

revoke all on function public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, int)
  from public, anon, authenticated;
revoke all on function public.admin_payments_summary(text[], text[], timestamptz, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, int)
  to authenticated;
grant execute on function public.admin_payments_summary(text[], text[], timestamptz, timestamptz, uuid, text)
  to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f          text;
  v_invoices bigint;
  v_ledger   bigint;
begin
  -- The arithmetic: 574.75 rounds up, 99.5 rounds up, 0.22 rounds to nothing, and a flat
  -- discount never exceeds its line.
  if admin.discount_amount('percent', 25, 2299) <> 575
     or admin.discount_amount('percent', 50, 199) <> 100
     or admin.discount_amount('percent', 100, 199) <> 199
     or admin.discount_amount('percent', 1, 22) <> 0
     or admin.discount_amount('flat', 500, 199) <> 199
     or admin.discount_amount('flat', 150, 199) <> 150
     or admin.discount_amount('flat', 500, 0) <> 0 then
    raise exception 'self-check: discount_amount() arithmetic is wrong';
  end if;

  -- The payment functions' RPCs: the service role only.
  foreach f in array array[
    'public.discount_check(text,uuid,text,text,bigint,bigint,bigint)',
    'public.discount_reserve(text,uuid,text,text,bigint,text,bigint,bigint,bigint)',
    'public.discount_confirm(uuid,text)',
    'public.discount_release(uuid,text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') then
      raise exception 'self-check: grants on % are wrong', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;

  -- The admin RPCs: signed-in callers (each checks the role itself), never anon.
  foreach f in array array[
    'public.admin_discount_codes()',
    'public.admin_discount_code_save(uuid,text,text,integer,text,text[],integer,integer,timestamptz,timestamptz,boolean,text)',
    'public.admin_discount_code_set_active(uuid,boolean)',
    'public.admin_discount_redemptions(uuid,integer)',
    'public.admin_payments_ledger(text[],text[],timestamptz,timestamptz,uuid,text,timestamptz,text,integer)',
    'public.admin_payments_summary(text[],text[],timestamptz,timestamptz,uuid,text)'] loop
    if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'self-check: grants on % are wrong', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;

  -- The helpers: no client role at all.
  foreach f in array array[
    'admin.discount_amount(text,integer,bigint)',
    'admin.discount_evaluate(text,uuid,text,text,bigint,bigint,bigint,boolean)',
    'admin.discounts_can_manage()'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'self-check: a client role can call %', f;
    end if;
  end loop;

  -- The tables: row security on, and nothing granted to a client role.
  foreach f in array array['admin.discount_codes', 'admin.discount_redemptions', 'admin.discount_attempts'] loop
    if has_table_privilege('anon', f, 'select') or has_table_privilege('authenticated', f, 'select')
       or has_table_privilege('authenticated', f, 'insert') or has_table_privilege('authenticated', f, 'update')
       or has_table_privilege('authenticated', f, 'delete') then
      raise exception 'self-check: a client role has privileges on %', f;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = f::regclass) then
      raise exception 'self-check: row security is off on %', f;
    end if;
  end loop;
  if (select count(*) from pg_trigger t
       where t.tgname = 'trg_admin_audit'
         and t.tgrelid in ('admin.discount_codes'::regclass, 'admin.discount_redemptions'::regclass)) <> 2 then
    raise exception 'self-check: the Admin Log triggers are missing';
  end if;

  -- The ledger: still one row per invoice, and no discount on any existing row.
  select count(*) into v_invoices from public.subscription_invoices;
  select count(*) into v_ledger from admin.payment_entries e where e.entry_key like 'invoice:%';
  if v_invoices <> v_ledger then
    raise exception 'self-check: % invoices but % invoice rows in the ledger', v_invoices, v_ledger;
  end if;
  if exists (select 1 from admin.payment_entries e where coalesce(e.discount_paise, 0) <> 0) then
    raise exception 'self-check: a ledger row shows a discount no order carries';
  end if;
end
$check$;
