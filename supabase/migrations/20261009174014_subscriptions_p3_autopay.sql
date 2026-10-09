-- Subscriptions P3: autopay with Razorpay Subscriptions (plan "build every vendor subscription
-- feature", 2026-10-08; Mitra: autopay is optional and pre-ticked).
--
-- HOW AUTOPAY WORKS HERE. A Razorpay subscription is created with a future start date and
-- an upfront amount (Razorpay "addon"):
--   * the upfront amount is the FIRST period's charge, priced by Cosora's own rule
--     (admin.subscription_quote: an upgrade's credit, then a discount code, then GST), and
--     is what the vendor pays in the authorisation payment (captured, not refunded);
--   * from the end of that first period Razorpay charges the plan's list price (with GST)
--     every cycle, and tells us (subscription.charged), which renews the plan through the
--     same fulfilment transaction as every other payment.
-- So a new purchase, an upgrade with credit, a downgrade and a discount code cost exactly
-- what they cost without autopay, and only the renewals are Razorpay's.
-- Turning autopay on for a plan already paid for creates a subscription that starts at the
-- current period's end with no upfront amount (Razorpay then takes a small authorisation
-- payment and refunds it).
--
-- UPI and e-mandate subscriptions can't be changed at Razorpay, so a plan change with
-- autopay on is a NEW Razorpay subscription; once it is authenticated the old one is
-- cancelled. A Razorpay subscription that can't be cancelled opens a billing incident
-- (autopay_cancel_failed): it could charge twice.
--
-- 1. admin.subscription_gateway_plans: the Razorpay plan for each plan, cycle, mode and
--    amount (Razorpay plans can't be edited; a price change is a new plan).
-- 2. public.subscription_mandates: one row per Razorpay subscription, its status as
--    Razorpay reports it, the payment method, the next charge.
-- 3. Service-role functions the autopay function and the webhook call; my_autopay() for
--    the vendor's page.
-- 4. vendor_subscriptions.auto_renew now means "autopay is on" and nothing else:
--    subscription_activate() stopped setting it on every purchase.
-- 5. The subscription_autopay switch (off): autopay is offered only to listed accounts.
--
-- Harness: scripts/subscriptions/p3_autopay.sql.

-- ── 0. Guard: the function patched here is the one that was read ────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.subscription_activate(uuid,text,text)'::regprocedure))
     <> '0e8ce87367ddc73aa275a2cfb43d3ca4' then
    raise exception 'public.subscription_activate changed since it was read; re-read it before patching';
  end if;
end
$guard$;

-- ── 1. The switch ───────────────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('subscription_autopay',
        'Autopay (Razorpay Subscriptions) at plan checkout and on /subscription (subscriptions P3). Off: every plan is paid for one period at a time.',
        false)
on conflict (key) do nothing;

-- ── 2. Razorpay plans ───────────────────────────────────────────────────────────────
create table admin.subscription_gateway_plans (
  id               uuid primary key default gen_random_uuid(),
  plan_id          text not null references public.subscription_plans (id),
  billing_cycle    text not null check (billing_cycle in ('monthly', 'yearly')),
  payment_mode     text not null check (payment_mode in ('live', 'test')),
  list_rupees      integer not null check (list_rupees > 0),
  amount_paise     bigint not null check (amount_paise > 0),
  razorpay_plan_id text not null unique,
  created_at       timestamptz not null default now(),
  unique (plan_id, billing_cycle, payment_mode, amount_paise)
);
alter table admin.subscription_gateway_plans enable row level security;
comment on table admin.subscription_gateway_plans is
  'The Razorpay plan (Plans API) autopay renewals are charged on, per Cosora plan, cycle, key mode and amount (list price with GST, in paise). Created by subscription-autopay the first time it is needed. A Razorpay plan can''t be edited, so a new price is a new row; existing autopays keep the amount they agreed to.';

-- ── 3. Autopay mandates ─────────────────────────────────────────────────────────────
create table public.subscription_mandates (
  id                       uuid primary key default gen_random_uuid(),
  vendor_id                uuid not null references public.vendor_profiles (id) on delete cascade,
  razorpay_subscription_id text not null unique,
  plan_id                  text not null references public.subscription_plans (id),
  billing_cycle            text not null check (billing_cycle in ('monthly', 'yearly')),
  payment_mode             text not null check (payment_mode in ('live', 'test')),
  list_rupees              integer not null check (list_rupees > 0),
  amount_paise             bigint not null check (amount_paise > 0),
  first_order_ref          text,
  status                   text not null default 'created'
                             check (status in ('created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired')),
  method                   text,
  start_at                 timestamptz not null,
  charge_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  ended_at                 timestamptz
);
create index subscription_mandates_vendor_idx on public.subscription_mandates (vendor_id, created_at desc);
create index subscription_mandates_plan_idx on public.subscription_mandates (plan_id);
alter table public.subscription_mandates enable row level security;
revoke all on public.subscription_mandates from public, anon, authenticated;
grant select on public.subscription_mandates to authenticated;
create policy subscription_mandates_select on public.subscription_mandates
  for select to authenticated
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));
comment on table public.subscription_mandates is
  'One row per Razorpay subscription (an autopay). status is Razorpay''s: created (checkout not finished), authenticated (set up; first renewal not charged yet), active, pending (a charge failed; Razorpay is retrying), halted (retries exhausted), cancelled, completed, expired. amount_paise is what each renewal charges. first_order_ref is the plan order its upfront amount paid for (null when autopay was turned on for a plan already paid). Written only by the autopay functions.';

alter table public.subscription_payment_orders add column if not exists autopay boolean not null default false;
comment on column public.subscription_payment_orders.autopay is
  'True for an order paid through a Razorpay subscription: its first (upfront) payment, whose order_id is the Razorpay subscription id, or a renewal (order_id subchg_<payment id>).';

-- ── 4. auto_renew means autopay ─────────────────────────────────────────────────────
-- It was set true by every purchase and read by nothing. No autopay existed before this
-- migration, so every row starts false; the mandate functions keep it from here.
update public.vendor_subscriptions set auto_renew = false where auto_renew;
alter table public.vendor_subscriptions alter column auto_renew set default false;
comment on column public.vendor_subscriptions.auto_renew is
  'Autopay is on: the vendor has a Razorpay subscription that is authenticated, active or retrying a charge (public.subscription_mandates). Kept by admin.autopay_sync(); nothing else writes it.';

create or replace function public.subscription_activate(p_vendor uuid, p_plan text, p_cycle text)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  q       jsonb;
  v_kind  text;
  v_start timestamptz;
  v_end   timestamptz;
  v_sub   uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_activate is for the payment functions only' using errcode = '42501';
  end if;
  -- One activation per seller at a time (verify-payment and the webhook can race).
  perform pg_advisory_xact_lock(hashtextextended('cosora.subscription:' || p_vendor::text, 0));

  q := admin.subscription_quote(p_vendor, p_plan, p_cycle, now());
  if not coalesce((q ->> 'ok')::boolean, false) then
    return q;
  end if;
  v_kind := q ->> 'kind';
  v_start := (q ->> 'period_start')::timestamptz;
  v_end := (q ->> 'period_end')::timestamptz;

  if v_kind in ('new', 'upgrade') then
    if v_kind = 'upgrade' then
      update public.subscription_invoices
         set superseded_at = now()
       where vendor_id = p_vendor and status = 'paid' and superseded_at is null
         and billing_period_end is not null and billing_period_end > now();
    end if;
    -- auto_renew is left alone: it means autopay (P3), which a purchase doesn't decide.
    insert into public.vendor_subscriptions as s
      (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew, updated_at)
    values (p_vendor, p_plan, p_cycle, 'active', v_start, v_end, false, now())
    on conflict (vendor_id) do update
       set plan_id = excluded.plan_id, billing_cycle = excluded.billing_cycle, status = 'active',
           current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
           updated_at = now(),
           scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null
    returning s.id into v_sub;
    update public.vendor_profiles set plan_id = p_plan, plan_expires_at = v_end where id = p_vendor;
  elsif v_kind = 'renewal' then
    update public.vendor_subscriptions
       set current_period_end = v_end, updated_at = now()
     where vendor_id = p_vendor
    returning id into v_sub;
    update public.vendor_profiles set plan_expires_at = v_end where id = p_vendor;
  else
    update public.vendor_subscriptions
       set scheduled_plan_id = p_plan, scheduled_billing_cycle = p_cycle, scheduled_from = v_start,
           current_period_end = v_end, updated_at = now()
     where vendor_id = p_vendor
    returning id into v_sub;
    update public.vendor_profiles set plan_expires_at = v_end where id = p_vendor;
  end if;

  -- A first purchase with autopay authenticates its mandate before this row exists, so
  -- the row is brought in line with the vendor's mandates once it does.
  perform admin.autopay_sync(p_vendor);

  return q || jsonb_build_object('subscription_id', v_sub);
end
$function$;
revoke all on function public.subscription_activate(uuid, text, text) from public, anon, authenticated;
grant execute on function public.subscription_activate(uuid, text, text) to service_role;

-- auto_renew follows the vendor's mandates.
create or replace function admin.autopay_sync(p_vendor uuid)
returns void
language sql volatile security definer set search_path = '' as $function$
  update public.vendor_subscriptions s
     set auto_renew = exists (select 1 from public.subscription_mandates m
                               where m.vendor_id = p_vendor and m.status in ('authenticated', 'active', 'pending'))
   where s.vendor_id = p_vendor
$function$;
revoke all on function admin.autopay_sync(uuid) from public, anon, authenticated;

-- ── 5. Templates for autopay trouble ────────────────────────────────────────────────
insert into admin.notification_templates (key, channel, locale, subject, body, cta_label, cta_path, transactional)
values
  ('autopay_payment_failed', 'email', 'en',
   'Your Cosora autopay payment didn''t go through',
   E'Hello {{name}},\n\nWe couldn''t collect {{amount}} for your {{plan_name}} plan. Your bank or UPI app declined it, or asked for an approval that wasn''t given.\n\nThe payment will be tried again automatically. To keep your plan, check that your payment method has enough balance and approve the request if your bank or UPI app asks.',
   'Open Subscription', '/subscription', true),
  ('autopay_stopped', 'email', 'en',
   'Autopay has stopped for your Cosora plan',
   E'Hello {{name}},\n\nSeveral attempts to collect {{amount}} for your {{plan_name}} plan failed, so autopay has been turned off. Nothing more will be charged automatically.\n\nYour plan runs until {{period_end}}. Renew it from your Subscription page before then to keep it.',
   'Renew now', '/subscription', true);

-- ── 6. Service-role functions ───────────────────────────────────────────────────────
create or replace function public.autopay_gateway_plan(p_plan text, p_cycle text, p_mode text, p_amount_paise bigint)
returns text
language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_gateway_plan is for the payment functions only' using errcode = '42501';
  end if;
  return (select g.razorpay_plan_id from admin.subscription_gateway_plans g
           where g.plan_id = p_plan and g.billing_cycle = p_cycle and g.payment_mode = p_mode and g.amount_paise = p_amount_paise);
end
$function$;

-- Two checkouts can create the same Razorpay plan at once: the first saved wins, and both use it.
create or replace function public.autopay_gateway_plan_save(
  p_plan text, p_cycle text, p_mode text, p_list_rupees integer, p_amount_paise bigint, p_razorpay_plan_id text)
returns text
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_gateway_plan_save is for the payment functions only' using errcode = '42501';
  end if;
  insert into admin.subscription_gateway_plans (plan_id, billing_cycle, payment_mode, list_rupees, amount_paise, razorpay_plan_id)
  values (p_plan, p_cycle, p_mode, p_list_rupees, p_amount_paise, p_razorpay_plan_id)
  on conflict (plan_id, billing_cycle, payment_mode, amount_paise) do nothing;
  return (select g.razorpay_plan_id from admin.subscription_gateway_plans g
           where g.plan_id = p_plan and g.billing_cycle = p_cycle and g.payment_mode = p_mode and g.amount_paise = p_amount_paise);
end
$function$;

create or replace function public.autopay_mandate_create(
  p_vendor uuid, p_sub_id text, p_plan text, p_cycle text, p_mode text, p_list_rupees integer,
  p_amount_paise bigint, p_first_order_ref text, p_start_at timestamptz)
returns uuid
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_mandate_create is for the payment functions only' using errcode = '42501';
  end if;
  insert into public.subscription_mandates
    (vendor_id, razorpay_subscription_id, plan_id, billing_cycle, payment_mode, list_rupees, amount_paise, first_order_ref, start_at, charge_at)
  values (p_vendor, p_sub_id, p_plan, p_cycle, p_mode, p_list_rupees, p_amount_paise, p_first_order_ref, p_start_at, p_start_at)
  returning id into v_id;
  return v_id;
end
$function$;

-- The vendor's autopay as it stands, for the payment functions: the one that is set up
-- (authenticated, active, retrying) or stopped for failed payments.
create or replace function public.autopay_vendor_open(p_vendor uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_vendor_open is for the payment functions only' using errcode = '42501';
  end if;
  return (select jsonb_build_object('sub_id', m.razorpay_subscription_id, 'status', m.status, 'plan_id', m.plan_id,
                                    'billing_cycle', m.billing_cycle, 'amount_paise', m.amount_paise)
            from public.subscription_mandates m
           where m.vendor_id = p_vendor and m.status in ('authenticated', 'active', 'pending')
           order by m.created_at desc limit 1);
end
$function$;

-- Razorpay says a subscription changed state (or the browser proved its authentication).
-- Statuses only move forward: a cancelled, completed or expired mandate stays so, and an
-- "authenticated" that arrives after "active" changes nothing. Answers the vendor, the
-- change, and the vendor's OTHER open mandates when this one has just been set up: the
-- caller cancels those at Razorpay, since the new one replaces them.
create or replace function public.autopay_mandate_event(
  p_sub_id text, p_status text, p_method text default null, p_charge_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  m          public.subscription_mandates;
  v_prev     text;
  v_new      text;
  v_replace  jsonb := '[]'::jsonb;
  v_name     text;
  v_plan     text;
  v_end      timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_mandate_event is for the payment functions only' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired') then
    raise exception 'unknown mandate status %', p_status using errcode = '22023';
  end if;
  select * into m from public.subscription_mandates where razorpay_subscription_id = p_sub_id for update;
  if not found then
    return jsonb_build_object('known', false);
  end if;
  v_prev := m.status;
  v_new := case
             when v_prev in ('cancelled', 'completed', 'expired') then v_prev
             when p_status = 'authenticated' and v_prev <> 'created' then v_prev
             else p_status
           end;

  update public.subscription_mandates
     set status = v_new,
         method = coalesce(p_method, method),
         charge_at = case when v_new in ('cancelled', 'completed', 'expired', 'halted') then null else coalesce(p_charge_at, charge_at) end,
         updated_at = now(),
         ended_at = case when v_new in ('cancelled', 'completed', 'expired') then coalesce(ended_at, now()) end
   where id = m.id;
  perform admin.autopay_sync(m.vendor_id);

  if v_new = v_prev then
    return jsonb_build_object('known', true, 'vendor_id', m.vendor_id, 'previous', v_prev, 'status', v_new, 'changed', false, 'replace', v_replace);
  end if;

  if v_prev = 'created' and v_new in ('authenticated', 'active') then
    select coalesce(jsonb_agg(o.razorpay_subscription_id), '[]'::jsonb) into v_replace
      from public.subscription_mandates o
     where o.vendor_id = m.vendor_id and o.id <> m.id and o.status in ('authenticated', 'active', 'pending', 'halted');
  end if;

  if v_new in ('pending', 'halted') then
    select coalesce(nullif(btrim(v.brand_name), ''), 'there') into v_name from public.vendor_profiles v where v.id = m.vendor_id;
    select p.name into v_plan from public.subscription_plans p where p.id = m.plan_id;
    select s.current_period_end into v_end from public.vendor_subscriptions s where s.vendor_id = m.vendor_id;
    if v_new = 'pending' then
      perform public.notify(m.vendor_id, 'autopay', 'Your autopay payment didn''t go through',
        'It will be tried again automatically. Check your payment method, and approve the request if your bank or UPI app asks.', null);
    else
      perform public.notify(m.vendor_id, 'autopay', 'Autopay has stopped for your plan',
        'Several payment attempts failed, so nothing more will be charged automatically. Renew from your Subscription page to keep your plan.', null);
    end if;
    -- One email per failed cycle (the day it began), however many retries Razorpay reports.
    perform public.notify_deliver(m.vendor_id,
      case v_new when 'pending' then 'autopay_payment_failed' else 'autopay_stopped' end,
      jsonb_build_object('name', v_name, 'plan_name', coalesce(v_plan, m.plan_id),
        'amount', E'₹' || btrim(to_char(m.amount_paise / 100.0, 'FM99,99,99,99,990.00')),
        'period_end', coalesce(to_char(v_end at time zone 'Asia/Kolkata', 'FMDD Mon YYYY'), 'the end of the period you paid for')),
      'autopay_' || v_new || ':' || m.razorpay_subscription_id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
      array['email']);
  end if;

  return jsonb_build_object('known', true, 'vendor_id', m.vendor_id, 'previous', v_prev, 'status', v_new, 'changed', true,
                            'first_order_ref', m.first_order_ref, 'replace', v_replace);
end
$function$;

-- Razorpay charged a subscription. Which of our orders is that payment for?
--   already   an order already carries this payment
--   first     the order its upfront amount paid for (not fulfilled yet)
--   renewal   a new renewal order, created here: subchg_<payment id>
-- A charge that isn't the amount the mandate agreed to opens an incident; the renewal still
-- goes ahead (the money was taken).
create or replace function public.autopay_charge(p_sub_id text, p_payment_ref text, p_amount_paise bigint)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  m       public.subscription_mandates;
  v_ref   text;
  v_first public.subscription_payment_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_charge is for the payment functions only' using errcode = '42501';
  end if;
  if p_payment_ref is null or btrim(p_payment_ref) = '' then
    raise exception 'a charge needs its payment id' using errcode = '22023';
  end if;
  select * into m from public.subscription_mandates where razorpay_subscription_id = p_sub_id for update;
  if not found then
    return jsonb_build_object('known', false);
  end if;

  select o.order_id into v_ref from public.subscription_payment_orders o
   where o.payment_ref = p_payment_ref or o.order_id = 'subchg_' || p_payment_ref
   limit 1;
  if v_ref is not null then
    return jsonb_build_object('known', true, 'kind', 'already', 'order_ref', v_ref);
  end if;

  if m.first_order_ref is not null then
    select * into v_first from public.subscription_payment_orders o where o.order_id = m.first_order_ref;
    if found and v_first.status = 'created' then
      return jsonb_build_object('known', true, 'kind', 'first', 'order_ref', m.first_order_ref);
    end if;
  end if;

  if p_amount_paise is distinct from m.amount_paise then
    perform admin.billing_incident_open('autopay_amount_mismatch', m.vendor_id, 'subchg_' || p_payment_ref, p_payment_ref,
      jsonb_build_object('subscription', p_sub_id, 'charged_paise', p_amount_paise, 'expected_paise', m.amount_paise, 'plan_id', m.plan_id));
  end if;
  insert into public.subscription_payment_orders
    (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees, autopay)
  values ('subchg_' || p_payment_ref, m.vendor_id, m.plan_id, m.billing_cycle, coalesce(p_amount_paise, m.amount_paise), 'created',
          m.payment_mode, m.list_rupees, 0, 'renewal', 0, true);
  return jsonb_build_object('known', true, 'kind', 'renewal', 'order_ref', 'subchg_' || p_payment_ref);
end
$function$;

-- An autopay problem a person must look at (the payment functions can't reach admin.*).
create or replace function public.autopay_incident(p_kind text, p_sub_id text, p_detail jsonb)
returns uuid
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_vendor uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'autopay_incident is for the payment functions only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('autopay_cancel_failed', 'autopay_amount_mismatch') then
    raise exception 'unknown autopay incident %', p_kind using errcode = '22023';
  end if;
  select m.vendor_id into v_vendor from public.subscription_mandates m where m.razorpay_subscription_id = p_sub_id;
  return admin.billing_incident_open(p_kind, v_vendor, p_sub_id, null, coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('subscription', p_sub_id));
end
$function$;

-- ── 7. The vendor's own view ────────────────────────────────────────────────────────
create or replace function public.my_autopay()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := auth.uid();
  m    public.subscription_mandates;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into m from public.subscription_mandates x
   where x.vendor_id = v_me and x.status in ('authenticated', 'active', 'pending', 'halted')
   order by (x.status = 'halted'), x.created_at desc
   limit 1;
  if not found then
    return jsonb_build_object('available', public.feature_on('subscription_autopay'), 'on', false);
  end if;
  return jsonb_build_object(
    'available', public.feature_on('subscription_autopay'),
    'on', m.status in ('authenticated', 'active', 'pending'),
    'status', m.status,
    'method', m.method,
    'plan_id', m.plan_id,
    'plan_name', (select p.name from public.subscription_plans p where p.id = m.plan_id),
    'billing_cycle', m.billing_cycle,
    'amount_paise', m.amount_paise,
    'next_charge_at', m.charge_at,
    'subscription_id', m.razorpay_subscription_id);
end
$function$;

-- ── 8. Grants ───────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.autopay_gateway_plan(text,text,text,bigint)',
    'public.autopay_gateway_plan_save(text,text,text,integer,bigint,text)',
    'public.autopay_mandate_create(uuid,text,text,text,text,integer,bigint,text,timestamptz)',
    'public.autopay_vendor_open(uuid)',
    'public.autopay_mandate_event(text,text,text,timestamptz)',
    'public.autopay_charge(text,text,bigint)',
    'public.autopay_incident(text,text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on function public.my_autopay() from public, anon;
  grant execute on function public.my_autopay() to authenticated;
end
$grants$;

-- ── 9. Self-check ───────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.autopay_gateway_plan(text,text,text,bigint)', 'public.autopay_gateway_plan_save(text,text,text,integer,bigint,text)',
    'public.autopay_mandate_create(uuid,text,text,text,text,integer,bigint,text,timestamptz)', 'public.autopay_vendor_open(uuid)',
    'public.autopay_mandate_event(text,text,text,timestamptz)', 'public.autopay_charge(text,text,bigint)',
    'public.autopay_incident(text,text,jsonb)', 'public.subscription_activate(uuid,text,text)', 'admin.autopay_sync(uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.subscription_mandates', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscription_mandates', 'UPDATE') then
    raise exception 'mandates are written only by the autopay functions';
  end if;
  if exists (select 1 from public.vendor_subscriptions where auto_renew) then
    raise exception 'no autopay exists yet, so auto_renew must start false everywhere';
  end if;
  if (select enabled from public.feature_flags where key = 'subscription_autopay') then
    raise exception 'subscription_autopay must start switched off';
  end if;
end
$check$;
