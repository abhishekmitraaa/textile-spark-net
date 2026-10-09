-- Subscriptions P12: admin tooling and KPIs (plan "build every vendor subscription feature",
-- 2026-10-09).
--
-- 1. PRICES WITH HISTORY. public.subscription_plan_prices keeps every price a plan has had and
--    a change waiting for its day. A change takes effect now, or on a chosen date at the
--    morning billing run (public.expire_subscriptions(), cron 'subscription-expiry-sweep',
--    08:59 IST), which copies it into subscription_plans.monthly_price / yearly_price.
--    Every reader keeps reading those two columns (checkout, autopay, discount quotes, the
--    plans page), so what a vendor sees and what they are charged always agree.
--    - An order already created keeps its price (list_rupees is frozen on the order).
--    - An autopay mandate keeps its price (list_rupees and amount on the mandate): Razorpay
--      charges a mandate its own amount. The next autopay checkout at the new price makes a
--      new Razorpay plan (subscription-autopay looks the plan up by amount).
-- 2. COMPLIMENTARY PLANS. admin_subscription_grant(vendor, plan, until, reason): a paid plan
--    at no charge until a date (a promotion, a goodwill extension). No invoice: no money
--    moved. Refused while the vendor has a paid period running or autopay set up, so it never
--    replaces what someone paid for. Kept in public.subscription_grants. A plan paid OUTSIDE
--    Razorpay (a bank transfer) needs a GST tax invoice and is a separate step.
-- 3. WORKLISTS AND KPIs for the Subscriptions page: admin_subscription_worklist(...) and
--    admin_subscription_kpis(), set-based, for the roles that read subscriptions.
--
-- Prices and grants: super_admin and finance_admin (as admin_subscription_change_plan).
-- Reading: super_admin, finance_admin and support (as subscription_invoices).
-- Harness: scripts/subscriptions/p12_admin_tooling.sql.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.expire_subscriptions()'::regprocedure))
     <> '1d5bfaf0a3be18576645dbe4e77b25d6' then
    raise exception 'expire_subscriptions changed since it was read; re-read it before patching';
  end if;
end
$guard$;

-- ── 1. Price history ───────────────────────────────────────────────────────────────
create table public.subscription_plan_prices (
  id               uuid primary key default gen_random_uuid(),
  plan_id          text not null references public.subscription_plans (id) on delete cascade,
  monthly_price    integer not null check (monthly_price between 0 and 1000000),
  yearly_price     integer not null check (yearly_price between 0 and 12000000),
  effective_from   timestamptz not null,
  status           text not null default 'scheduled' check (status in ('scheduled', 'applied', 'canceled')),
  applied_at       timestamptz,
  previous_monthly integer,
  previous_yearly  integer,
  reason           text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  canceled_at      timestamptz,
  canceled_by      uuid,
  constraint subscription_plan_prices_applied_check check ((status = 'applied') = (applied_at is not null)),
  constraint subscription_plan_prices_canceled_check check ((status = 'canceled') = (canceled_at is not null))
);
-- One change waits per plan; a new one replaces it.
create unique index subscription_plan_prices_one_waiting on public.subscription_plan_prices (plan_id) where status = 'scheduled';
create index subscription_plan_prices_plan on public.subscription_plan_prices (plan_id, created_at desc);
create index subscription_plan_prices_due on public.subscription_plan_prices (effective_from) where status = 'scheduled';
alter table public.subscription_plan_prices enable row level security;
create policy subscription_plan_prices_select on public.subscription_plan_prices for select using (
  (select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]));
revoke all on public.subscription_plan_prices from anon, authenticated;
grant select on public.subscription_plan_prices to authenticated;
create trigger trg_admin_audit after insert or update or delete on public.subscription_plan_prices
  for each row execute function admin.audit_row_change('');
comment on table public.subscription_plan_prices is
  'Every price a plan has had, and the change waiting for its day (subscriptions P12). Applied into subscription_plans by admin.apply_due_plan_prices(), from admin_plan_price_set() or the morning billing run.';

-- Where the history starts: each plan's price today.
insert into public.subscription_plan_prices (plan_id, monthly_price, yearly_price, effective_from, status, applied_at, reason)
select p.id, p.monthly_price, p.yearly_price, p.created_at, 'applied', now(), 'The price when price history began (subscriptions P12)'
  from public.subscription_plans p;

-- ── 2. Applying what is due ────────────────────────────────────────────────────────
-- The plan row is locked before the change row, in the same order as admin_plan_price_set.
create or replace function admin.apply_due_plan_prices()
returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  r  record;
  pl public.subscription_plans;
  n  integer := 0;
begin
  for r in
    select pp.id, pp.plan_id, pp.monthly_price, pp.yearly_price
      from public.subscription_plan_prices pp
     where pp.status = 'scheduled' and pp.effective_from <= now()
     order by pp.effective_from, pp.created_at
  loop
    select * into pl from public.subscription_plans where id = r.plan_id for update;
    update public.subscription_plan_prices
       set status = 'applied', applied_at = now(), previous_monthly = pl.monthly_price, previous_yearly = pl.yearly_price
     where id = r.id and status = 'scheduled';
    if found then
      update public.subscription_plans
         set monthly_price = r.monthly_price, yearly_price = r.yearly_price
       where id = r.plan_id;
      n := n + 1;
    end if;
  end loop;
  return n;
end
$function$;
revoke all on function admin.apply_due_plan_prices() from public, anon, authenticated;

-- ── 3. Setting and cancelling a price ──────────────────────────────────────────────
-- p_effective: null or today (IST) = now; a later date = that day's morning billing run.
create or replace function public.admin_plan_price_set(p_plan text, p_monthly integer, p_yearly integer,
                                                      p_effective date default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_plan     public.subscription_plans;
  v_today    date := (now() at time zone 'Asia/Kolkata')::date;
  v_now      boolean;
  v_from     timestamptz;
  v_id       uuid;
  v_replaced uuid;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: plan prices are set by the super_admin or finance_admin role' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'say why the price is changing (3 to 500 characters)' using errcode = '22023';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan for update;
  if not found then
    raise exception 'unknown plan %', p_plan using errcode = '22023';
  end if;
  if v_plan.id = 'free' then
    raise exception 'Free has no price' using errcode = '22023';
  end if;
  if p_monthly is null or p_yearly is null or p_monthly < 1 or p_yearly < 1 then
    raise exception 'a paid plan''s monthly and yearly prices are at least ₹1' using errcode = '22023';
  end if;
  if p_monthly > 1000000 or p_yearly > 12000000 then
    raise exception 'that price is above the limit (₹10,00,000 a month, ₹1,20,00,000 a year)' using errcode = '22023';
  end if;
  if p_yearly > p_monthly * 12 then
    raise exception 'the yearly price can''t be more than 12 months at the monthly price (₹%)', p_monthly * 12 using errcode = '22023';
  end if;
  if p_effective is not null and p_effective > v_today + 365 then
    raise exception 'a price change can be scheduled up to a year ahead' using errcode = '22023';
  end if;
  v_now := p_effective is null or p_effective <= v_today;
  if p_monthly = v_plan.monthly_price and p_yearly = v_plan.yearly_price then
    raise exception 'those are % plan''s prices now; to drop a waiting change, cancel it', v_plan.name using errcode = 'P0001';
  end if;
  v_from := case when v_now then now() else p_effective::timestamp at time zone 'Asia/Kolkata' end;

  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);
  update public.subscription_plan_prices
     set status = 'canceled', canceled_at = now(), canceled_by = auth.uid()
   where plan_id = v_plan.id and status = 'scheduled'
  returning id into v_replaced;
  insert into public.subscription_plan_prices (plan_id, monthly_price, yearly_price, effective_from, reason, created_by)
  values (v_plan.id, p_monthly, p_yearly, v_from, btrim(p_reason), auth.uid())
  returning id into v_id;
  if v_now then
    perform admin.apply_due_plan_prices();
  end if;
  perform set_config('cosora.audit_reason', '', true);

  return jsonb_build_object('id', v_id, 'status', case when v_now then 'applied' else 'scheduled' end,
                            'effective_from', v_from, 'replaced', v_replaced);
end
$function$;

create or replace function public.admin_plan_price_cancel(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_plan text;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: plan prices are set by the super_admin or finance_admin role' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'say why the change is cancelled (3 to 500 characters)' using errcode = '22023';
  end if;
  select pp.plan_id into v_plan from public.subscription_plan_prices pp where pp.id = p_id;
  if v_plan is null then
    raise exception 'no such price change' using errcode = 'P0002';
  end if;
  perform 1 from public.subscription_plans where id = v_plan for update;
  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);
  update public.subscription_plan_prices
     set status = 'canceled', canceled_at = now(), canceled_by = auth.uid()
   where id = p_id and status = 'scheduled';
  if not found then
    raise exception 'that change isn''t waiting any more (it was applied or cancelled)' using errcode = 'P0001';
  end if;
  perform set_config('cosora.audit_reason', '', true);
end
$function$;

-- ── 4. The morning run applies changes whose day has come ──────────────────────────
-- A failure here must not stop the run (reminders, grace, lapses); a change left waiting
-- past its day shows as overdue on the admin's Plan prices panel.
do $patch$
declare
  v_def text := pg_get_functiondef('public.expire_subscriptions()'::regprocedure);
  v_old text := $q$begin
  -- Paid downgrades whose day has come$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'expire_subscriptions no longer starts where this patch expects';
  end if;
  execute replace(v_def, v_old, $q$begin
  -- Plan prices whose day has come (subscriptions P12). Their own failure doesn't stop the run.
  begin
    perform admin.apply_due_plan_prices();
  exception when others then
    raise warning 'plan prices not applied: %', sqlerrm;
  end;

  -- Paid downgrades whose day has come$q$);
end
$patch$;

-- ── 5. Complimentary plans ─────────────────────────────────────────────────────────
create table public.subscription_grants (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendor_profiles (id) on delete cascade,
  subscription_id uuid references public.vendor_subscriptions (id) on delete set null,
  plan_id         text not null references public.subscription_plans (id),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text not null check (char_length(btrim(reason)) between 3 and 500),
  granted_by      uuid,
  created_at      timestamptz not null default now(),
  constraint subscription_grants_period_check check (ends_at > starts_at)
);
create index subscription_grants_vendor on public.subscription_grants (vendor_id, created_at desc);
create index subscription_grants_subscription on public.subscription_grants (subscription_id);
alter table public.subscription_grants enable row level security;
create policy subscription_grants_select on public.subscription_grants for select using (
  (select public.is_admin()) and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]));
revoke all on public.subscription_grants from anon, authenticated;
grant select on public.subscription_grants to authenticated;
create trigger trg_admin_audit after insert or update or delete on public.subscription_grants
  for each row execute function admin.audit_row_change('vendor_id');
comment on table public.subscription_grants is
  'Complimentary plans given by an admin (subscriptions P12): no charge, no invoice. A subscription is "granted" while its plan and period end are still the grant''s.';

-- p_until: the last day (IST) the plan runs; it ends at midnight after it.
create or replace function public.admin_subscription_grant(p_vendor uuid, p_plan text, p_until date, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_plan    public.subscription_plans;
  v_sub     public.vendor_subscriptions;
  v_status  text;
  v_brand   text;
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_end     timestamptz;
  v_sub_id  uuid;
  v_grant   uuid;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: complimentary plans are given by the super_admin or finance_admin role' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'say why this plan is complimentary (3 to 500 characters)' using errcode = '22023';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan;
  if not found or v_plan.id = 'free' then
    raise exception 'choose a paid plan' using errcode = '22023';
  end if;
  if p_until is null or p_until <= v_today or p_until > v_today + 730 then
    raise exception 'the last day is between tomorrow and two years from today' using errcode = '22023';
  end if;
  select v.brand_name, p.account_status::text into v_brand, v_status
    from public.vendor_profiles v join public.profiles p on p.id = v.id
   where v.id = p_vendor;
  if not found then
    raise exception 'no such vendor' using errcode = 'P0002';
  end if;
  if v_status is distinct from 'active' then
    raise exception 'this vendor''s account is %, not active', v_status using errcode = 'P0001';
  end if;

  -- subscription_activate's per-vendor lock: a payment landing now waits for this, or this
  -- for it (and then sees the paid period). The cap trigger's lock comes after, as there.
  perform pg_advisory_xact_lock(hashtextextended('cosora.subscription:' || p_vendor::text, 0));
  select * into v_sub from public.vendor_subscriptions where vendor_id = p_vendor for update;
  if exists (select 1 from public.subscription_mandates m
              where m.vendor_id = p_vendor and m.ended_at is null
                and m.status in ('authenticated', 'active', 'pending', 'halted')) then
    raise exception 'this vendor has autopay set up; a complimentary plan would clash with its next charge. Ask them to turn autopay off first'
      using errcode = 'P0001';
  end if;
  if v_sub.id is not null and v_sub.status = 'active' and v_sub.plan_id <> 'free' and v_sub.current_period_end > now()
     and not exists (select 1 from public.subscription_grants g
                      where g.subscription_id = v_sub.id and g.plan_id = v_sub.plan_id and g.ends_at = v_sub.current_period_end) then
    raise exception 'they have % until %, paid for. Change their plan instead (same end date), or give this from the day it ends',
      (select p.name from public.subscription_plans p where p.id = v_sub.plan_id),
      to_char(v_sub.current_period_end at time zone 'Asia/Kolkata', 'FMDD Mon YYYY')
      using errcode = 'P0001';
  end if;

  v_end := (p_until + 1)::timestamp at time zone 'Asia/Kolkata';
  perform set_config('cosora.audit_reason', 'Complimentary plan: ' || left(btrim(p_reason), 470), true);
  insert into public.vendor_subscriptions as s
    (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew, updated_at)
  values (p_vendor, v_plan.id, 'monthly', 'active', now(), v_end, false, now())
  on conflict (vendor_id) do update
    set plan_id = excluded.plan_id, billing_cycle = 'monthly', status = 'active',
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
        auto_renew = false, scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null,
        keep_product_ids = null, updated_at = now()
  returning s.id into v_sub_id;
  update public.vendor_profiles
     set plan_id = v_plan.id, plan_expires_at = v_end + admin.grace_interval(p_vendor)
   where id = p_vendor;
  insert into public.subscription_grants (vendor_id, subscription_id, plan_id, starts_at, ends_at, reason, granted_by)
  values (p_vendor, v_sub_id, v_plan.id, now(), v_end, btrim(p_reason), auth.uid())
  returning id into v_grant;
  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(p_vendor, 'subscription_changed', 'You have a complimentary plan',
    format('Cosora gave you the %s plan until %s, at no charge.', v_plan.name, to_char(p_until, 'FMDD Mon YYYY')), null);
  return jsonb_build_object('ok', true, 'grant_id', v_grant, 'subscription_id', v_sub_id, 'ends_at', v_end,
                            'vendor', v_brand, 'plan', v_plan.name);
end
$function$;

-- ── 6. Worklists ───────────────────────────────────────────────────────────────────
-- p_view: all (newest first) | expiring (ends within p_days, soonest first) | grace (period
-- over, plan still in force) | autopay_trouble (a mandate pending or halted, or a payment that
-- failed within p_days, newest trouble first; a vendor whose first payment failed has no
-- subscription yet and is listed too) | granted | downgrade (one is scheduled) | lapsed (a
-- paid plan ended within p_days, newest first). One row per vendor. Next page: pass the last
-- row's sort_at and vendor_id.
create or replace function public.admin_subscription_worklist(
  p_view text default 'all', p_days integer default 7, p_plan text default null, p_search text default null,
  p_after_at timestamptz default null, p_after_vendor uuid default null, p_limit integer default 50)
returns table (
  id uuid, vendor_id uuid, brand_name text, city text, plan_id text, billing_cycle text, status text,
  current_period_start timestamptz, current_period_end timestamptz, auto_renew boolean,
  scheduled_plan_id text, scheduled_from timestamptz, created_at timestamptz, sort_at timestamptz,
  grace_until timestamptz, mandate_status text, granted boolean, last_failed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
declare
  v_view  text := coalesce(p_view, 'all');
  v_days  integer := least(greatest(coalesce(p_days, 7), 1), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_q     text := lower(nullif(btrim(coalesce(p_search, '')), ''));
  v_desc  boolean := coalesce(p_view, 'all') in ('all', 'lapsed', 'autopay_trouble');
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 365));
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin', 'support'), false) then
    raise exception 'not authorized: subscriptions are read by the super_admin, finance_admin or support role' using errcode = '42501';
  end if;
  if v_view not in ('all', 'expiring', 'grace', 'autopay_trouble', 'granted', 'downgrade', 'lapsed') then
    raise exception 'unknown list %', p_view using errcode = '22023';
  end if;
  if v_q is not null and char_length(v_q) > 100 then
    raise exception 'search for up to 100 characters' using errcode = '22023';
  end if;

  return query
  with picked as (
    select s.id, v.id as vendor_id, v.brand_name, v.city, s.plan_id, s.billing_cycle, s.status,
           s.current_period_start, s.current_period_end, s.auto_renew, s.scheduled_plan_id, s.scheduled_from,
           s.created_at,
           case v_view
             when 'all' then s.created_at
             when 'lapsed' then s.updated_at
             when 'autopay_trouble' then greatest(
               (select max(o.created_at) from public.subscription_payment_orders o
                 where o.vendor_id = v.id and o.status = 'failed' and o.created_at > v_since),
               (select max(mm.updated_at) from public.subscription_mandates mm
                 where mm.vendor_id = v.id and mm.ended_at is null and mm.status in ('pending', 'halted')))
             else s.current_period_end
           end as k
      from public.vendor_profiles v
      left join public.vendor_subscriptions s on s.vendor_id = v.id
     where (p_plan is null or s.plan_id = p_plan)
       and (v_q is null or position(v_q in lower(coalesce(v.brand_name, ''))) > 0)
       and case v_view
             when 'autopay_trouble' then
               exists (select 1 from public.subscription_mandates mm
                        where mm.vendor_id = v.id and mm.ended_at is null and mm.status in ('pending', 'halted'))
               or exists (select 1 from public.subscription_payment_orders o
                           where o.vendor_id = v.id and o.status = 'failed' and o.created_at > v_since)
             when 'all' then s.id is not null
             when 'expiring' then s.status = 'active' and s.current_period_end > now()
                                  and s.current_period_end <= now() + make_interval(days => v_days)
             when 'grace' then s.status = 'active' and s.plan_id <> 'free' and s.current_period_end <= now()
             when 'downgrade' then s.scheduled_plan_id is not null
             when 'lapsed' then s.status in ('expired', 'canceled') and s.plan_id <> 'free' and s.updated_at > v_since
             else s.status = 'active' and exists (
                    select 1 from public.subscription_grants g
                     where g.subscription_id = s.id and g.plan_id = s.plan_id and g.ends_at = s.current_period_end)
           end
  ), page as (
    select * from picked p
     where p_after_at is null
        or (v_desc and (p.k, p.vendor_id) < (p_after_at, coalesce(p_after_vendor, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
        or (not v_desc and (p.k, p.vendor_id) > (p_after_at, coalesce(p_after_vendor, '00000000-0000-0000-0000-000000000000'::uuid)))
     order by case when v_desc then p.k end desc, case when v_desc then p.vendor_id end desc,
              case when not v_desc then p.k end asc, case when not v_desc then p.vendor_id end asc
     limit v_limit
  )
  select pg.id, pg.vendor_id, pg.brand_name, pg.city, pg.plan_id, pg.billing_cycle, pg.status,
         pg.current_period_start, pg.current_period_end, pg.auto_renew, pg.scheduled_plan_id, pg.scheduled_from,
         pg.created_at, pg.k,
         case when pg.status = 'active' and pg.plan_id <> 'free' and pg.current_period_end <= now()
              then pg.current_period_end + admin.grace_interval(pg.vendor_id) end,
         (select mm.status from public.subscription_mandates mm
           where mm.vendor_id = pg.vendor_id and mm.ended_at is null order by mm.created_at desc limit 1),
         coalesce(pg.id is not null and exists (
           select 1 from public.subscription_grants g
            where g.subscription_id = pg.id and g.plan_id = pg.plan_id and g.ends_at = pg.current_period_end), false),
         (select max(o.created_at) from public.subscription_payment_orders o
           where o.vendor_id = pg.vendor_id and o.status = 'failed' and o.created_at > now() - interval '30 days')
    from page pg
   order by case when v_desc then pg.k end desc, case when v_desc then pg.vendor_id end desc,
            case when not v_desc then pg.k end asc, case when not v_desc then pg.vendor_id end asc;
end
$function$;

-- ── 7. KPIs ────────────────────────────────────────────────────────────────────────
-- Recurring revenue (ex-GST, a month's worth): each running paid plan at what its renewal
-- charges, by money mode. Autopay: the mandate's own price. Without autopay: today's list
-- price for its cycle, if its latest invoice moved money (live or test). Complimentary plans,
-- demo payments and plans with no invoice add nothing. Churn: paid plans that ended in the
-- last 30 days over those plus the ones running.
create or replace function public.admin_subscription_kpis()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v jsonb;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin', 'support'), false) then
    raise exception 'not authorized: subscriptions are read by the super_admin, finance_admin or support role' using errcode = '42501';
  end if;

  with subs as (
    select s.id, s.vendor_id, s.plan_id, s.billing_cycle, s.status, s.current_period_end, s.auto_renew, s.updated_at,
           s.status = 'active' and s.plan_id <> 'free' as in_force,
           s.status = 'active' and s.plan_id <> 'free' and s.current_period_end > now() as running,
           s.status = 'active' and s.plan_id <> 'free' and s.current_period_end <= now() as in_grace,
           exists (select 1 from public.subscription_grants g
                    where g.subscription_id = s.id and g.plan_id = s.plan_id and g.ends_at = s.current_period_end) as granted
      from public.vendor_subscriptions s
  ), money as (
    select s.id,
           coalesce(m.payment_mode, i.payment_mode) as mode,
           case when m.list_rupees is not null
                then case m.billing_cycle when 'yearly' then m.list_rupees / 12.0 else m.list_rupees end
                else case s.billing_cycle when 'yearly' then p.yearly_price / 12.0 else p.monthly_price end
           end as monthly
      from subs s
      join public.subscription_plans p on p.id = s.plan_id
      left join lateral (select mm.payment_mode, mm.list_rupees, mm.billing_cycle from public.subscription_mandates mm
                          where mm.vendor_id = s.vendor_id and mm.ended_at is null and mm.status in ('authenticated', 'active', 'pending')
                          order by mm.created_at desc limit 1) m on true
      left join lateral (select ii.payment_mode from public.subscription_invoices ii
                          where ii.vendor_id = s.vendor_id and ii.status = 'paid'
                          order by ii.created_at desc limit 1) i on true
     where s.in_force and not s.granted
  ), outbox as (
    select o.channel, o.status, count(*) as n
      from admin.notification_outbox o
     where o.created_at > now() - interval '7 days'
     group by o.channel, o.status
  )
  select jsonb_build_object(
    'as_of', now(),
    'running', (select count(*) from subs where running),
    'in_grace', (select count(*) from subs where in_grace),
    'by_plan', coalesce((select jsonb_object_agg(plan_id, n) from (select plan_id, count(*) as n from subs where in_force group by plan_id) x), '{}'::jsonb),
    'granted', (select count(*) from subs where in_force and granted),
    'expiring_7d', (select count(*) from subs where running and current_period_end <= now() + interval '7 days'),
    'expiring_7d_manual', (select count(*) from subs where running and not auto_renew and current_period_end <= now() + interval '7 days'),
    'expiring_30d', (select count(*) from subs where running and current_period_end <= now() + interval '30 days'),
    'autopay_on', (select count(*) from subs where running and auto_renew),
    'mrr_live', (select round(coalesce(sum(monthly), 0)) from money where mode = 'live'),
    'mrr_test', (select round(coalesce(sum(monthly), 0)) from money where mode = 'test'),
    'billed', (select count(*) from money where mode in ('live', 'test')),
    'lapsed_30d', (select count(*) from subs where status in ('expired', 'canceled') and plan_id <> 'free'
                                               and updated_at > now() - interval '30 days'),
    'mandates_pending', (select count(*) from public.subscription_mandates where ended_at is null and status = 'pending'),
    'mandates_halted', (select count(*) from public.subscription_mandates where ended_at is null and status = 'halted'),
    'failed_payments_7d', (select count(*) from public.subscription_payment_orders
                            where status = 'failed' and created_at > now() - interval '7 days'),
    'open_incidents', (select count(*) from admin.billing_incidents where resolved_at is null),
    'delivery_7d', coalesce((select jsonb_object_agg(channel, by_status) from (
                      select channel, jsonb_object_agg(status, n) as by_status from outbox group by channel) d), '{}'::jsonb)
  ) into v;
  return v;
end
$function$;

-- ── 8. Grants ──────────────────────────────────────────────────────────────────────
revoke all on function public.admin_plan_price_set(text, integer, integer, date, text) from public, anon;
revoke all on function public.admin_plan_price_cancel(uuid, text) from public, anon;
revoke all on function public.admin_subscription_grant(uuid, text, date, text) from public, anon;
revoke all on function public.admin_subscription_worklist(text, integer, text, text, timestamptz, uuid, integer) from public, anon;
revoke all on function public.admin_subscription_kpis() from public, anon;
grant execute on function public.admin_plan_price_set(text, integer, integer, date, text) to authenticated;
grant execute on function public.admin_plan_price_cancel(uuid, text) to authenticated;
grant execute on function public.admin_subscription_grant(uuid, text, date, text) to authenticated;
grant execute on function public.admin_subscription_worklist(text, integer, text, text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.admin_subscription_kpis() to authenticated;

-- ── 9. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  if exists (select 1 from public.subscription_plans p
              where not exists (select 1 from public.subscription_plan_prices pp
                                 where pp.plan_id = p.id and pp.status = 'applied'
                                   and pp.monthly_price = p.monthly_price and pp.yearly_price = p.yearly_price)) then
    raise exception 'every plan''s price today must be in its history';
  end if;
  if position('apply_due_plan_prices' in (select prosrc from pg_proc where oid = 'public.expire_subscriptions()'::regprocedure)) = 0 then
    raise exception 'the morning run must apply due prices';
  end if;
  if has_function_privilege('anon', 'public.admin_subscription_kpis()', 'execute')
     or has_function_privilege('anon', 'public.admin_subscription_grant(uuid,text,date,text)', 'execute')
     or has_function_privilege('authenticated', 'admin.apply_due_plan_prices()', 'execute') then
    raise exception 'grants are wrong';
  end if;
end
$check$;
