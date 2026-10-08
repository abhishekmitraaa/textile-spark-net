-- Subscriptions P4, part 2 of 2: reminders, the grace period, and listings over the plan's
-- limit (plan "build every vendor subscription feature", 2026-10-08; Mitra: reminders 7, 4,
-- 2, 1 and 0 days before the end, then 7 days' grace; over the limit the vendor picks which
-- listings stay live, else the most viewed stay). Needs 20261008150000 (the status "paused").
--
-- WHAT CHANGES FOR A VENDOR, once the subscription_lifecycle switch is on for them:
--   * Before the end. Without autopay: a reminder 7, 4, 2 and 1 days before the plan ends
--     and on the day (bell, and email unless they turned "Plan expiry reminders" off). With
--     autopay: one bell notice two days before the charge.
--   * After the end. The plan stays in force for grace_days (7) more days: limits, seal,
--     search position. Paying for the same plan in those days is a renewal from the day the
--     last period ended, so the grace days are never free. Paying for another plan starts now.
--   * When the grace days are over the plan lapses to Free.
--   * Whenever a plan gets smaller (lapse, a paid downgrade starting, an admin's cancel or
--     change), listings over the new limit are PAUSED: first kept are the vendor's own picks,
--     then the most viewed. Paused listings are hidden from buyers and untouched. When the
--     plan allows them again they come back as they were (to review only if edited meanwhile).
--     Buying a plan never pauses anything.
-- Switch off (the default): no grace days, no reminders, nothing is paused. A plan lapses at
-- its end exactly as before this migration.
--
-- 1. admin.feature_on_for(): the switch test for database code that isn't the service role
--    (a scheduled job, a trigger in an admin's request). notify_deliver() now uses it.
-- 2. grace_days, admin.grace_interval(vendor); admin.vendor_effective_plan() reports the
--    status 'grace'; get_vendor_plan() and vendor_entitlements() carry it and grace_until.
-- 3. products.paused_at / paused_from and the trigger that keeps them honest;
--    admin.apply_product_cap(); the trigger on vendor_subscriptions that runs it.
-- 4. vendor_keep_products(), vendor_set_live_products(), my_product_cap(): the vendor's side.
-- 5. expire_subscriptions(): the same daily job (no new job), now also reminders, grace
--    notices and the lapse. vendor_profiles.plan_expires_at (seal, search position) now runs
--    to the end of the grace days.
-- 6. Ad targeting reads the plan in force (so it sees the grace days too).
--
-- Harness: scripts/subscriptions/p4_lifecycle.sql.

-- ── 0. Guard: the functions patched here are the ones that were read ────────────────
do $guard$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.expire_subscriptions()',                          '0c352a299658166c08de2979aef48246'),
      ('admin.vendor_effective_plan(uuid,timestamptz)',          '0827b88a5d6d59fb0f2e0450cbf5061f'),
      ('public.get_vendor_plan(uuid)',                           'fcad5c8f3b0e299f308e998d5b30c07a'),
      ('public.vendor_entitlements(uuid)',                       'e391ebeb1eb8130d4c92d670a1351477'),
      ('admin.subscription_quote(uuid,text,text,timestamptz)',   'd04d4a563006a3d0daa550974107b6cf'),
      ('public.subscription_activate(uuid,text,text)',           '3b5013a2737a740f5290cebc87b31ed8'),
      ('public.enforce_ad_location_scope()',                     'c3171991134575f06aaaced83d613dc1'),
      ('public.notify_deliver(uuid,text,jsonb,text,text[])',     'c771242998921a6c779c4fdb5c87ef32')
    ) as t(fn, want)
  loop
    if md5((select prosrc from pg_proc where oid = r.fn::regprocedure)) <> r.want then
      raise exception '% changed since it was read; re-read it before patching', r.fn;
    end if;
  end loop;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'product_status' and e.enumlabel = 'paused') then
    raise exception 'apply 20261008150000 (the product status "paused") first';
  end if;
end
$guard$;

-- ── 1. The switch, and a switch test for database code ──────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('subscription_lifecycle',
        'Plan lifecycle (subscriptions P4): renewal reminders, the grace days after a plan ends, and pausing listings over the plan''s limit. Off: a plan lapses at its end, nobody is reminded and nothing is paused.',
        false)
on conflict (key) do nothing;

-- public.feature_on_for() answers the service role only, so it can't be asked by the daily
-- job (no role claim) or by a trigger running inside an admin's request. Database code asks
-- this one: schema admin isn't reachable from a browser.
create or replace function admin.feature_on_for(p_key text, p_profile uuid)
returns boolean
language sql stable set search_path = '' as $function$
  select coalesce(
    (select f.enabled or coalesce(p_profile = any (f.allow_profile_ids), false)
       from public.feature_flags f where f.key = p_key),
    false)
$function$;

-- notify_deliver() is unchanged but for that one call (P2 wrote it with the service-role test).
do $patch$
declare
  v_def text := pg_get_functiondef('public.notify_deliver(uuid,text,jsonb,text,text[])'::regprocedure);
  v_old text := 'public.feature_on_for(''notification_delivery'', p_profile)';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'notify_deliver no longer calls public.feature_on_for as expected';
  end if;
  execute replace(v_def, v_old, 'admin.feature_on_for(''notification_delivery'', p_profile)');
  if position(v_old in pg_get_functiondef('public.notify_deliver(uuid,text,jsonb,text,text[])'::regprocedure)) > 0 then
    raise exception 'notify_deliver was not patched';
  end if;
end
$patch$;

-- ── 2. The grace days ───────────────────────────────────────────────────────────────
alter table admin.billing_settings
  add column grace_days integer not null default 7 check (grace_days between 0 and 28);
comment on column admin.billing_settings.grace_days is
  'Days a paid plan stays in force after its period ends, for vendors the subscription_lifecycle switch is on for (subscriptions P4). 28 at most, so the grace days never outlast a month''s renewal.';

create or replace function admin.grace_interval(p_vendor uuid)
returns interval
language sql stable set search_path = '' as $function$
  select case when admin.feature_on_for('subscription_lifecycle', p_vendor)
              then make_interval(days => coalesce((select s.grace_days from admin.billing_settings s), 7))
              else interval '0' end
$function$;

-- The plan in force at a moment. Now also 'grace': the period is over, the grace days
-- aren't. period_end stays the end of what was paid for; the grace days end at
-- raw_period_end + admin.grace_interval(vendor).
create or replace function admin.vendor_effective_plan(p_vendor uuid, p_at timestamp with time zone default now())
returns table(plan_id text, status text, billing_cycle text, period_start timestamp with time zone, period_end timestamp with time zone, scheduled_plan_id text, scheduled_billing_cycle text, scheduled_from timestamp with time zone, auto_renew boolean, subscription_id uuid, raw_period_end timestamp with time zone)
language sql stable set search_path = '' as $function$
  with s as (
    select vs.*,
           (vs.status = 'active' and vs.current_period_end is not null
              and vs.current_period_end + admin.grace_interval(p_vendor) > p_at) as live,
           (vs.current_period_end is not null and vs.current_period_end <= p_at) as ended,
           (vs.scheduled_from is not null and vs.scheduled_from <= p_at) as switched
      from public.vendor_subscriptions vs
     where vs.vendor_id = p_vendor
  )
  select case when s.live then (case when s.switched then s.scheduled_plan_id else s.plan_id end) else 'free' end,
         case when not s.live then 'free' when s.ended then 'grace' else 'active' end,
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

create or replace function public.get_vendor_plan(v uuid default auth.uid())
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  vid            uuid := coalesce(v, auth.uid());
  e              record;
  plan           public.subscription_plans%rowtype;
  next_plan_name text;
  paid_active    boolean;
  p_start        timestamptz;
  p_end          timestamptz;
  products_used  integer := 0;
  products_paused integer := 0;
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
  -- In the grace days the plan is still the vendor's (P4).
  paid_active := e.status in ('active', 'grace') and e.plan_id <> 'free';

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

  select count(*) filter (where status in ('under_review', 'live')),
         count(*) filter (where status::text = 'paused')
    into products_used, products_paused
    from public.products
   where vendor_id = vid;

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
    'auto_renew',           coalesce(e.auto_renew, false),
    'current_period_start', p_start,
    'current_period_end',   p_end,
    'subscription_end',     e.raw_period_end,
    'grace_until',          case when e.status = 'grace' then e.raw_period_end + admin.grace_interval(vid) end,
    'grace_days',           (extract(epoch from admin.grace_interval(vid)) / 86400)::int,
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
               'products_used',   products_used,
               'products_paused', products_paused,
               'leads_used',      leads_used,
               'period_start',    p_start,
               'period_end',      p_end
             ),
    'scheduled_plan_id',       case when paid_active then e.scheduled_plan_id end,
    'scheduled_plan_name',     next_plan_name,
    'scheduled_billing_cycle', case when paid_active then e.scheduled_billing_cycle end,
    'scheduled_from',          case when paid_active then e.scheduled_from end
  );
end;
$function$;

create or replace function public.vendor_entitlements(p_vendor uuid default auth.uid())
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
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
  -- In the grace days the plan is still the vendor's (P4).
  paid := e.status in ('active', 'grace') and plan.id <> 'free';

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
    'grace_until',      case when e.status = 'grace' then e.raw_period_end + admin.grace_interval(p_vendor) end,
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

-- ── 3. What a purchase costs, in the grace days ─────────────────────────────────────
create or replace function admin.subscription_quote(p_vendor uuid, p_plan text, p_cycle text, p_at timestamp with time zone default now())
returns jsonb
language plpgsql stable set search_path = '' as $function$
declare
  v_plan     public.subscription_plans;
  v_cur      public.vendor_subscriptions;
  v_cur_plan public.subscription_plans;
  v_list     integer;
  v_step     interval;
  v_active   boolean := false;
  v_grace    boolean := false;
  v_kind     text;
  v_start    timestamptz;
  v_end      timestamptz;
  v_credit   numeric := 0;
  v_live     boolean := (select s.live_since is not null from admin.billing_settings s);
begin
  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('ok', false, 'reason', 'bad_cycle');
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_plan'); end if;
  if v_plan.id = 'free' then return jsonb_build_object('ok', false, 'reason', 'bad_plan'); end if;
  if v_plan.is_invite_only then return jsonb_build_object('ok', false, 'reason', 'invite_only'); end if;
  v_list := case p_cycle when 'yearly' then v_plan.yearly_price else v_plan.monthly_price end;
  if coalesce(v_list, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'zero_amount'); end if;
  v_step := case p_cycle when 'yearly' then interval '1 year' else interval '1 month' end;

  select * into v_cur from public.vendor_subscriptions where vendor_id = p_vendor;
  v_active := found and v_cur.status = 'active' and v_cur.plan_id <> 'free'
              and v_cur.current_period_end is not null and v_cur.current_period_end > p_at;
  -- The grace days (P4): the period is over, the plan is still in force.
  v_grace := found and not v_active and v_cur.status = 'active' and v_cur.plan_id <> 'free'
             and v_cur.current_period_end is not null
             and v_cur.current_period_end + admin.grace_interval(p_vendor) > p_at;

  if v_grace and p_plan = v_cur.plan_id and p_cycle = v_cur.billing_cycle and v_cur.scheduled_plan_id is null then
    -- The same plan again, paid late: a renewal from the day the last period ended, so
    -- the grace days aren't free days.
    v_kind := 'renewal';
    v_start := v_cur.current_period_end;
    v_end := v_cur.current_period_end + v_step;
  elsif not v_active then
    v_kind := 'new';
    v_start := p_at;
    v_end := p_at + v_step;
  else
    select * into v_cur_plan from public.subscription_plans where id = v_cur.plan_id;
    if p_plan = v_cur.plan_id and p_cycle = v_cur.billing_cycle then
      v_kind := 'renewal';
    elsif (v_plan.sort_order > v_cur_plan.sort_order and not (v_cur.billing_cycle = 'yearly' and p_cycle = 'monthly'))
       or (p_plan = v_cur.plan_id and v_cur.billing_cycle = 'monthly' and p_cycle = 'yearly') then
      v_kind := 'upgrade';
    else
      v_kind := 'downgrade';
    end if;

    if v_kind in ('renewal', 'downgrade') and v_cur.scheduled_plan_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'already_scheduled', 'kind', v_kind,
        'scheduled_plan_id', v_cur.scheduled_plan_id, 'scheduled_from', v_cur.scheduled_from);
    end if;

    if v_kind = 'upgrade' then
      v_start := p_at;
      v_end := p_at + v_step;
      -- The unused share of every paid, uncredited, unrefunded invoice whose period isn't
      -- over. Once live payments have begun, only live invoices count: a demo or test-mode
      -- invoice took no real money and must not become real-money credit (S-7).
      select coalesce(sum(
               i.amount::numeric
               * extract(epoch from (i.billing_period_end - greatest(p_at, i.billing_period_start)))
               / nullif(extract(epoch from (i.billing_period_end - i.billing_period_start)), 0)), 0)
        into v_credit
        from public.subscription_invoices i
       where i.vendor_id = p_vendor
         and i.status = 'paid'
         and i.superseded_at is null
         and i.razorpay_refund_id is null
         and coalesce(i.refund_status, '') not in ('pending', 'processed')
         and i.amount > 0
         and i.billing_period_start is not null
         and i.billing_period_end > p_at
         and (not coalesce(v_live, false) or i.payment_mode = 'live');
    else
      v_start := v_cur.current_period_end;
      v_end := v_cur.current_period_end + v_step;
    end if;
  end if;

  -- A credit never pays out: beyond the new plan's price it is not carried.
  v_credit := least(floor(v_credit), v_list);
  return jsonb_build_object(
    'ok', true, 'kind', v_kind, 'plan_id', p_plan, 'plan_name', v_plan.name, 'billing_cycle', p_cycle,
    'list_rupees', v_list, 'credit_rupees', v_credit::integer, 'charge_rupees', v_list - v_credit::integer,
    'period_start', v_start, 'period_end', v_end, 'starts_now', v_start <= p_at, 'in_grace', v_grace,
    'current_plan_id', case when v_active or v_grace then v_cur.plan_id end,
    'current_billing_cycle', case when v_active or v_grace then v_cur.billing_cycle end,
    'current_period_end', case when v_active or v_grace then v_cur.current_period_end end);
end
$function$;

-- The seal and search position (vendor_profiles.plan_expires_at) run to the end of the
-- grace days, like the rest of the plan.
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
    update public.vendor_profiles set plan_id = p_plan, plan_expires_at = v_end + admin.grace_interval(p_vendor) where id = p_vendor;
  elsif v_kind = 'renewal' then
    update public.vendor_subscriptions
       set current_period_end = v_end, updated_at = now()
     where vendor_id = p_vendor
    returning id into v_sub;
    update public.vendor_profiles set plan_id = p_plan, plan_expires_at = v_end + admin.grace_interval(p_vendor) where id = p_vendor;
  else
    update public.vendor_subscriptions
       set scheduled_plan_id = p_plan, scheduled_billing_cycle = p_cycle, scheduled_from = v_start,
           current_period_end = v_end, updated_at = now()
     where vendor_id = p_vendor
    returning id into v_sub;
    update public.vendor_profiles set plan_expires_at = v_end + admin.grace_interval(p_vendor) where id = p_vendor;
  end if;

  -- A first purchase with autopay authenticates its mandate before this row exists, so
  -- the row is brought in line with the vendor's mandates once it does.
  perform admin.autopay_sync(p_vendor);

  return q || jsonb_build_object('subscription_id', v_sub);
end
$function$;

-- ── 4. Paused listings ──────────────────────────────────────────────────────────────
alter table public.products
  add column paused_at timestamptz,
  add column paused_from text check (paused_from in ('live', 'under_review'));
alter table public.products
  add constraint products_paused_check
  check ((status::text = 'paused') = (paused_at is not null) and (status::text = 'paused') = (paused_from is not null));
comment on column public.products.paused_at is
  'When the listing was paused for being over the vendor''s plan limit (status ''paused''); null otherwise. Set and cleared by admin.apply_product_cap() and vendor_set_live_products(), never from a browser.';
comment on column public.products.paused_from is
  'The status the listing returns to when it is resumed: ''live'' (as it was), or ''under_review'' (it was in review, or the vendor edited it while paused).';

alter table public.vendor_subscriptions
  add column keep_product_ids uuid[] check (keep_product_ids is null or cardinality(keep_product_ids) <= 500);
comment on column public.vendor_subscriptions.keep_product_ids is
  'The listings the vendor wants kept live when the plan next gets smaller, most wanted first (vendor_keep_products()). Used once by admin.apply_product_cap(), then cleared. Null: the most viewed stay.';

-- Browsers never write the pause columns; a save while paused sends the listing to review
-- when it comes back (as saving a published listing does: its row may be unchanged and its
-- photos new); whoever changes the status, the columns follow it.
create or replace function public.products_pause_guard()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.paused_at := null;
      new.paused_from := null;
    else
      if (new.paused_at, new.paused_from) is distinct from (old.paused_at, old.paused_from) then
        raise exception 'Listings are paused and resumed by your plan. Use "Choose which stay live" on your Products page.'
          using errcode = '42501';
      end if;
      if old.status::text = 'paused' and new.status::text = 'paused' then
        new.paused_from := 'under_review';
      end if;
    end if;
  end if;

  if new.status::text <> 'paused' then
    new.paused_at := null;
    new.paused_from := null;
  else
    new.paused_at := coalesce(new.paused_at, now());
    if new.paused_from is null then
      new.paused_from := case when tg_op = 'UPDATE' and old.status::text = 'live' then 'live' else 'under_review' end;
    end if;
  end if;
  return new;
end
$function$;
create trigger trg_products_pause_guard before insert or update on public.products
  for each row execute function public.products_pause_guard();

-- Brings a vendor's listings in line with the plan in force. Over the limit (and
-- p_pause): the vendor's picks stay first, then live before in-review, then the most
-- viewed; the rest are paused. Under it: paused listings come back, picks first.
create or replace function admin.apply_product_cap(p_vendor uuid, p_pause boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_plan    text;
  v_name    text;
  v_cap     integer;
  v_keep    uuid[];
  v_active  integer;
  v_paused  integer := 0;
  v_resumed integer := 0;
  v_room    integer;
begin
  if p_vendor is null then
    return jsonb_build_object('paused', 0, 'resumed', 0);
  end if;
  -- The cap trigger's lock: no listing is added while the limit is being applied.
  perform pg_advisory_xact_lock(hashtext(p_vendor::text));

  select e.plan_id into v_plan from admin.vendor_effective_plan(p_vendor, now()) e;
  select p.name, coalesce((p.limits ->> 'product_cap')::int, -1) into v_name, v_cap
    from public.subscription_plans p where p.id = coalesce(v_plan, 'free');
  v_cap := coalesce(v_cap, -1);
  select coalesce(s.keep_product_ids, '{}') into v_keep from public.vendor_subscriptions s where s.vendor_id = p_vendor;
  v_keep := coalesce(v_keep, '{}');

  select count(*) into v_active from public.products p
   where p.vendor_id = p_vendor and p.status::text in ('live', 'under_review');

  if coalesce(p_pause, true) and admin.feature_on_for('subscription_lifecycle', p_vendor)
     and v_cap >= 0 and v_active > v_cap then
    with ranked as (
      select p.id, p.status::text as was,
             row_number() over (order by array_position(v_keep, p.id) nulls last,
                                         (p.status::text = 'live') desc, p.views_count desc nulls last,
                                         p.created_at, p.id) as rn
        from public.products p
       where p.vendor_id = p_vendor and p.status::text in ('live', 'under_review')
    )
    update public.products p
       set status = 'paused'::public.product_status, paused_at = now(), paused_from = r.was
      from ranked r
     where p.id = r.id and r.rn > v_cap;
    get diagnostics v_paused = row_count;
  elsif v_cap < 0 or v_active < v_cap then
    v_room := case when v_cap < 0 then null else v_cap - v_active end;
    with ranked as (
      select p.id, p.paused_from,
             row_number() over (order by array_position(v_keep, p.id) nulls last,
                                         (p.paused_from = 'live') desc, p.views_count desc nulls last,
                                         p.paused_at, p.id) as rn
        from public.products p
       where p.vendor_id = p_vendor and p.status::text = 'paused'
    )
    update public.products p
       set status = r.paused_from::public.product_status, paused_at = null, paused_from = null
      from ranked r
     where p.id = r.id and (v_room is null or r.rn <= v_room);
    get diagnostics v_resumed = row_count;
  end if;

  if v_paused > 0 then
    -- The picks were for this change; the next one starts from the most viewed again.
    update public.vendor_subscriptions set keep_product_ids = null
     where vendor_id = p_vendor and keep_product_ids is not null;
    perform public.notify(p_vendor, 'listings_paused',
      case when v_paused = 1 then '1 listing is paused' else v_paused || ' listings are paused' end,
      'Your ' || coalesce(v_name, 'Free') || ' plan allows ' || v_cap || case when v_cap = 1 then ' listing' else ' listings' end
        || '. The rest are hidden from buyers, not deleted. Choose which stay live from Products, or upgrade to bring them all back.', null);
    perform public.notify_deliver(p_vendor, 'listings_paused',
      jsonb_build_object(
        'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = p_vendor),
        'plan_name', coalesce(v_name, 'Free'),
        'paused', case when v_paused = 1 then '1 listing is' else v_paused || ' listings are' end,
        'allowed', v_cap || case when v_cap = 1 then ' listing' else ' listings' end),
      'listings_paused:' || p_vendor || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
      array['email']);
  elsif v_resumed > 0 then
    perform public.notify(p_vendor, 'listings_resumed',
      case when v_resumed = 1 then '1 paused listing is back' else v_resumed || ' paused listings are back' end,
      'Your ' || coalesce(v_name, 'Free') || ' plan has room for them. Listings you edited while they were paused go through review first.', null);
  end if;

  return jsonb_build_object('plan_id', coalesce(v_plan, 'free'), 'cap', v_cap, 'paused', v_paused, 'resumed', v_resumed);
end
$function$;

-- Every change to a vendor's subscription row runs the limit: pausing only when the plan
-- got smaller (it stopped, or moved to a plan that allows fewer), resuming otherwise. One
-- place, so an admin's cancel or plan change is covered like the daily job and a purchase.
create or replace function admin.subscription_cap_sync()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_pause boolean := false;
  v_old   integer;
  v_new   integer;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'active' and new.status <> 'active' then
      v_pause := true;
    elsif old.status = 'active' and new.status = 'active' and new.plan_id is distinct from old.plan_id then
      select coalesce((p.limits ->> 'product_cap')::int, -1) into v_old from public.subscription_plans p where p.id = old.plan_id;
      select coalesce((p.limits ->> 'product_cap')::int, -1) into v_new from public.subscription_plans p where p.id = new.plan_id;
      v_pause := coalesce(v_new, -1) >= 0 and (coalesce(v_old, -1) < 0 or v_new < v_old);
    end if;
  end if;
  perform admin.apply_product_cap(new.vendor_id, v_pause);
  return null;
end
$function$;
create trigger trg_vendor_subscriptions_cap after insert or update of plan_id, status, current_period_end
  on public.vendor_subscriptions
  for each row execute function admin.subscription_cap_sync();

-- ── 5. The vendor's side ────────────────────────────────────────────────────────────
-- Which listings to keep when the plan next gets smaller, most wanted first.
create or replace function public.vendor_keep_products(p_ids uuid[])
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_me  uuid := auth.uid();
  v_ids uuid[];
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select coalesce(array_agg(d.x order by d.ord), '{}') into v_ids
    from (select distinct on (t.x) t.x, t.ord
            from unnest(coalesce(p_ids, '{}')) with ordinality as t(x, ord)
           where t.x is not null
           order by t.x, t.ord) d;
  if cardinality(v_ids) > 500 then
    raise exception 'Choose 500 listings or fewer.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from public.products p
                                 where p.id = x and p.vendor_id = v_me and p.status::text in ('live', 'under_review', 'paused'))) then
    raise exception 'Choose from your own published, in-review or paused listings.' using errcode = '22023';
  end if;
  update public.vendor_subscriptions set keep_product_ids = nullif(v_ids, '{}') where vendor_id = v_me;
  if not found then
    raise exception 'There is no plan change coming to choose listings for.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('kept', cardinality(v_ids));
end
$function$;

-- Which listings are live now: the ones named are published (or back in review), the
-- vendor's other published and in-review listings are paused. Within the plan's limit.
create or replace function public.vendor_set_live_products(p_ids uuid[])
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_me      uuid := auth.uid();
  v_ids     uuid[];
  v_plan    text;
  v_name    text;
  v_cap     integer;
  v_paused  integer := 0;
  v_resumed integer := 0;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendor_profiles v where v.id = v_me) then
    raise exception 'Only a vendor can choose which listings are live.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ids, '{}')) x where x is not null;
  if cardinality(v_ids) > 1000 then
    raise exception 'Choose 1,000 listings or fewer at a time.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_me::text));

  if exists (select 1 from unnest(v_ids) x
              where not exists (select 1 from public.products p
                                 where p.id = x and p.vendor_id = v_me and p.status::text in ('live', 'under_review', 'paused'))) then
    raise exception 'Choose from your own published, in-review or paused listings.' using errcode = '22023';
  end if;

  select e.plan_id into v_plan from admin.vendor_effective_plan(v_me, now()) e;
  select p.name, coalesce((p.limits ->> 'product_cap')::int, -1) into v_name, v_cap
    from public.subscription_plans p where p.id = coalesce(v_plan, 'free');
  v_cap := coalesce(v_cap, -1);
  if v_cap >= 0 and cardinality(v_ids) > v_cap then
    raise exception 'Your % plan allows % listing(s); you chose %. Choose fewer, or upgrade your plan.',
      coalesce(v_name, 'Free'), v_cap, cardinality(v_ids) using errcode = 'P0001';
  end if;

  update public.products p
     set status = 'paused'::public.product_status, paused_at = now(), paused_from = p.status::text
   where p.vendor_id = v_me and p.status::text in ('live', 'under_review') and p.id <> all (v_ids);
  get diagnostics v_paused = row_count;
  update public.products p
     set status = p.paused_from::public.product_status, paused_at = null, paused_from = null
   where p.vendor_id = v_me and p.status::text = 'paused' and p.id = any (v_ids);
  get diagnostics v_resumed = row_count;
  update public.vendor_subscriptions set keep_product_ids = null where vendor_id = v_me and keep_product_ids is not null;

  return jsonb_build_object('cap', v_cap, 'live', cardinality(v_ids), 'paused', v_paused, 'resumed', v_resumed);
end
$function$;

-- What the Products page shows: the limit now, what is used and paused, and the smaller
-- limit that is coming (a paid downgrade, or the plan's end without autopay) when the
-- vendor has more listings than it allows.
create or replace function public.my_product_cap()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me     uuid := auth.uid();
  e        record;
  v_name   text;
  v_cap    integer;
  v_active integer;
  v_paused integer;
  v_keep   uuid[];
  v_on     boolean;
  v_grace  interval;
  n_plan   text;
  n_name   text;
  n_cap    integer;
  n_at     timestamptz;
  n_reason text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_on := admin.feature_on_for('subscription_lifecycle', v_me);
  v_grace := admin.grace_interval(v_me);
  select * into e from admin.vendor_effective_plan(v_me, now());
  select p.name, coalesce((p.limits ->> 'product_cap')::int, -1) into v_name, v_cap
    from public.subscription_plans p where p.id = e.plan_id;
  v_cap := coalesce(v_cap, -1);
  select count(*) filter (where p.status::text in ('live', 'under_review')),
         count(*) filter (where p.status::text = 'paused')
    into v_active, v_paused
    from public.products p where p.vendor_id = v_me;
  select s.keep_product_ids into v_keep from public.vendor_subscriptions s where s.vendor_id = v_me;

  if v_on and e.status in ('active', 'grace') and e.plan_id <> 'free' then
    if e.scheduled_plan_id is not null then
      n_plan := e.scheduled_plan_id; n_at := e.scheduled_from; n_reason := 'downgrade';
    elsif not coalesce(e.auto_renew, false) and e.raw_period_end <= now() + interval '7 days' then
      n_plan := 'free'; n_at := e.raw_period_end + v_grace; n_reason := 'plan_end';
    end if;
    if n_plan is not null then
      select p.name, coalesce((p.limits ->> 'product_cap')::int, -1) into n_name, n_cap
        from public.subscription_plans p where p.id = n_plan;
      if coalesce(n_cap, -1) < 0 or v_active <= n_cap then
        n_plan := null;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'available', v_on,
    'plan_id', e.plan_id, 'plan_name', v_name, 'cap', v_cap,
    'active', v_active, 'paused', v_paused,
    'keep_ids', coalesce(to_jsonb(v_keep), '[]'::jsonb),
    'next', case when n_plan is not null then jsonb_build_object(
              'reason', n_reason, 'plan_id', n_plan, 'plan_name', n_name, 'cap', n_cap, 'at', n_at) end);
end
$function$;

-- ── 6. Reminders sent, once each ────────────────────────────────────────────────────
create table admin.subscription_reminder_log (
  vendor_id  uuid not null references public.vendor_profiles (id) on delete cascade,
  period_end timestamptz not null,
  kind       text not null check (kind in ('d7', 'd4', 'd2', 'd1', 'd0', 'autopay_d2', 'grace', 'lapsed')),
  sent_at    timestamptz not null default now(),
  primary key (vendor_id, period_end, kind)
);
alter table admin.subscription_reminder_log enable row level security;
comment on table admin.subscription_reminder_log is
  'One row per reminder sent for a plan period (expire_subscriptions): d7, d4, d2, d1, d0 before the end, autopay_d2, the grace notice, the lapse. The primary key is what stops a second send; a renewal moves the period end, so the next period starts clean.';

insert into admin.notification_templates (key, channel, locale, subject, body, cta_label, cta_path, transactional, email_switch)
values
  ('plan_expiring', 'email', 'en',
   'Your Cosora {{plan_name}} plan ends {{when}}',
   E'Hello {{name}},\n\nYour {{plan_name}} plan ends {{when}}, on {{period_end}}.\n\nRenew it to keep your listings, your seal and your place in search. {{after}}',
   'Renew now', '/subscription', false, 'emailPlanExpiry'),
  ('plan_grace', 'email', 'en',
   'Your Cosora {{plan_name}} plan has ended: renew by {{grace_until}}',
   E'Hello {{name}},\n\nYour {{plan_name}} plan ended on {{period_end}}. Nothing has changed on your account yet: you have until {{grace_until}} to renew.\n\nAfter that your account moves to the Free plan, and listings over its limit are paused.',
   'Renew now', '/subscription', false, 'emailPlanExpiry'),
  ('plan_lapsed', 'email', 'en',
   'Your Cosora {{plan_name}} plan has ended',
   E'Hello {{name}},\n\nYour {{plan_name}} plan ended on {{period_end}} and wasn''t renewed, so your account is now on the Free plan.\n\nYour listings and enquiries are safe. Listings over the Free plan''s limit are paused, not deleted, and come back when you choose a plan again.',
   'Choose a plan', '/subscription', true, null),
  ('listings_paused', 'email', 'en',
   'Some of your Cosora listings are paused',
   E'Hello {{name}},\n\nYour {{plan_name}} plan allows {{allowed}}, so {{paused}} paused. Paused listings are hidden from buyers. Nothing is deleted.\n\nYou can choose which listings stay live from your Products page, or upgrade to bring them all back.',
   'Choose listings', '/products', true, null);
-- Autopay stopped (P3), version 2, without a date: with the grace days the plan's end is no
-- longer the day it stops, and the grace notice above gives the day to renew by.
insert into admin.notification_templates (key, channel, locale, version, subject, body, cta_label, cta_path, transactional)
values ('autopay_stopped', 'email', 'en', 2,
   'Autopay has stopped for your Cosora plan',
   E'Hello {{name}},\n\nSeveral attempts to collect {{amount}} for your {{plan_name}} plan failed, so autopay has been turned off. Nothing more will be charged automatically.\n\nRenew from your Subscription page to keep your plan.',
   'Renew now', '/subscription', true);
-- The WhatsApp reminder waits for Meta to approve a template of this name and these
-- parameters ({{1}} name, {{2}} plan, {{3}} when, {{4}} end date): inactive until then.
insert into admin.notification_templates (key, channel, locale, body, wa_template, wa_language, wa_params, transactional, email_switch, active)
values ('plan_expiring', 'whatsapp', 'en',
        'Hello {{name}}, your Cosora {{plan_name}} plan ends {{when}}, on {{period_end}}. Renew it from your Subscription page to keep your listings live.',
        'plan_renewal_reminder', 'en', array['name', 'plan_name', 'when', 'period_end'], false, null, false);

-- ── 7. The daily job ────────────────────────────────────────────────────────────────
-- Same job, same time (subscription-expiry-sweep, 08:59 IST). In order: paid downgrades
-- whose day has come; reminders before the end; the grace notice; the lapse; then the
-- seal-and-search dates. Pausing and resuming follow from the row changes (section 4).
-- Safe to run more than once a day: every notice is sent once per period.
create or replace function public.expire_subscriptions()
returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  n        integer := 0;
  r        record;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_bucket integer;
  v_when   text;
  v_end    text;
  v_until  text;
  v_days   integer;
  v_sent   integer;
begin
  -- Paid downgrades whose day has come (Subscription FAQ: "from your next billing
  -- cycle"). The period end already covers them, so this only renames the plan.
  for r in
    update public.vendor_subscriptions s
       set plan_id = s.scheduled_plan_id, billing_cycle = s.scheduled_billing_cycle,
           current_period_start = s.scheduled_from,
           scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null,
           updated_at = now()
     where s.status = 'active' and s.scheduled_from is not null and s.scheduled_from <= now()
    returning s.vendor_id, s.plan_id, s.current_period_end
  loop
    update public.vendor_profiles
       set plan_id = r.plan_id, plan_expires_at = r.current_period_end + admin.grace_interval(r.vendor_id)
     where id = r.vendor_id;
    perform public.notify(r.vendor_id, 'subscription_changed', 'Your plan has changed',
      'The plan you paid for is now active.', null);
  end loop;

  -- Before the end. Without autopay: 7, 4, 2 and 1 days before, and on the day. A day the
  -- job missed is made up by the next run (the nearest reminder not yet sent, with the
  -- real number of days). With autopay: one notice two days before the charge.
  for r in
    select s.vendor_id, s.current_period_end, s.auto_renew, p.name as plan_name,
           coalesce(nullif(btrim(v.brand_name), ''), 'there') as vendor_name,
           ((s.current_period_end at time zone 'Asia/Kolkata')::date - v_today) as days_left,
           admin.grace_interval(s.vendor_id) as grace
      from public.vendor_subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
      join public.vendor_profiles v on v.id = s.vendor_id
     where s.status = 'active' and s.plan_id <> 'free'
       and s.current_period_end > now() and s.current_period_end <= now() + interval '8 days'
       and admin.feature_on_for('subscription_lifecycle', s.vendor_id)
  loop
    v_days := greatest(r.days_left, 0);
    v_end := to_char(r.current_period_end at time zone 'Asia/Kolkata', 'FMDD Mon YYYY');
    if r.auto_renew then
      if v_days > 2 then continue; end if;
      insert into admin.subscription_reminder_log (vendor_id, period_end, kind)
      values (r.vendor_id, r.current_period_end, 'autopay_d2') on conflict do nothing;
      get diagnostics v_sent = row_count;
      if v_sent = 1 then
        perform public.notify(r.vendor_id, 'autopay', 'Your ' || r.plan_name || ' plan renews on ' || v_end,
          'Autopay is on, so the payment is collected automatically. You don''t need to do anything.', null);
      end if;
      continue;
    end if;
    if v_days > 7 then continue; end if;
    v_bucket := case when v_days = 0 then 0 when v_days = 1 then 1 when v_days = 2 then 2 when v_days <= 4 then 4 else 7 end;
    insert into admin.subscription_reminder_log (vendor_id, period_end, kind)
    values (r.vendor_id, r.current_period_end, 'd' || v_bucket) on conflict do nothing;
    get diagnostics v_sent = row_count;
    if v_sent = 0 then continue; end if;
    v_when := case v_days when 0 then 'today' when 1 then 'tomorrow' else 'in ' || v_days || ' days' end;
    v_until := to_char((r.current_period_end + r.grace) at time zone 'Asia/Kolkata', 'FMDD Mon YYYY');
    perform public.notify(r.vendor_id, 'plan_expiring', 'Your ' || r.plan_name || ' plan ends ' || v_when,
      'Renew by ' || v_end || ' to keep your listings, your seal and your place in search.', null);
    perform public.notify_deliver(r.vendor_id, 'plan_expiring',
      jsonb_build_object('name', r.vendor_name, 'plan_name', r.plan_name, 'when', v_when, 'period_end', v_end,
        'after', case when r.grace > interval '0'
                      then 'If it isn''t renewed by ' || v_until || ', your account moves to the Free plan and listings over its limit are paused.'
                      else 'If it isn''t renewed, your account moves to the Free plan.' end),
      'plan_expiring:' || r.vendor_id || ':' || extract(epoch from r.current_period_end)::bigint || ':d' || v_bucket,
      array['email', 'whatsapp']);
  end loop;

  -- The period is over and the grace days have begun: say by when to renew. With autopay
  -- on Razorpay is still collecting (and its own notices go out), so nothing is said here
  -- until autopay stops.
  for r in
    select s.vendor_id, s.current_period_end, p.name as plan_name,
           coalesce(nullif(btrim(v.brand_name), ''), 'there') as vendor_name,
           admin.grace_interval(s.vendor_id) as grace
      from public.vendor_subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
      join public.vendor_profiles v on v.id = s.vendor_id
     where s.status = 'active' and s.plan_id <> 'free' and not s.auto_renew
       and s.current_period_end <= now()
       and s.current_period_end + admin.grace_interval(s.vendor_id) > now()
  loop
    insert into admin.subscription_reminder_log (vendor_id, period_end, kind)
    values (r.vendor_id, r.current_period_end, 'grace') on conflict do nothing;
    get diagnostics v_sent = row_count;
    if v_sent = 0 then continue; end if;
    v_end := to_char(r.current_period_end at time zone 'Asia/Kolkata', 'FMDD Mon YYYY');
    v_until := to_char((r.current_period_end + r.grace) at time zone 'Asia/Kolkata', 'FMDD Mon YYYY');
    perform public.notify(r.vendor_id, 'plan_expiring', 'Your ' || r.plan_name || ' plan has ended: renew by ' || v_until,
      'Nothing has changed yet. After ' || v_until || ' your account moves to the Free plan and listings over its limit are paused.', null);
    perform public.notify_deliver(r.vendor_id, 'plan_grace',
      jsonb_build_object('name', r.vendor_name, 'plan_name', r.plan_name, 'period_end', v_end, 'grace_until', v_until),
      'plan_grace:' || r.vendor_id || ':' || extract(epoch from r.current_period_end)::bigint,
      array['email']);
  end loop;

  -- The lapse: the period and its grace days are over. The row's change pauses listings
  -- over the Free limit (trg_vendor_subscriptions_cap).
  for r in
    update public.vendor_subscriptions s
       set status = 'expired', updated_at = now()
     where s.status = 'active'
       and s.current_period_end is not null
       and s.current_period_end < now()
       and s.current_period_end + admin.grace_interval(s.vendor_id) <= now()
    returning s.vendor_id, s.plan_id, s.current_period_end
  loop
    n := n + 1;
    -- The seal and search position end with the plan, whatever date they carried.
    update public.vendor_profiles set plan_id = null, plan_expires_at = null
     where id = r.vendor_id and (plan_id is not null or plan_expires_at is not null);
    if r.plan_id = 'free' or not admin.feature_on_for('subscription_lifecycle', r.vendor_id) then
      continue;
    end if;
    insert into admin.subscription_reminder_log (vendor_id, period_end, kind)
    values (r.vendor_id, r.current_period_end, 'lapsed') on conflict do nothing;
    get diagnostics v_sent = row_count;
    if v_sent = 0 then continue; end if;
    perform public.notify(r.vendor_id, 'plan_lapsed', 'Your plan has ended',
      'Your account is on the Free plan now. Choose a plan again to bring back everything it gave you.', null);
    perform public.notify_deliver(r.vendor_id, 'plan_lapsed',
      jsonb_build_object(
        'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = r.vendor_id),
        'plan_name', (select p.name from public.subscription_plans p where p.id = r.plan_id),
        'period_end', to_char(r.current_period_end at time zone 'Asia/Kolkata', 'FMDD Mon YYYY')),
      'plan_lapsed:' || r.vendor_id || ':' || extract(epoch from r.current_period_end)::bigint,
      array['email']);
  end loop;

  -- The seal and search position follow the plan to the end of its grace days (an admin's
  -- plan change writes the period's end; this brings it in line).
  update public.vendor_profiles v
     set plan_id = x.plan_id, plan_expires_at = x.until
    from (select s.vendor_id, s.plan_id, s.current_period_end + admin.grace_interval(s.vendor_id) as until
            from public.vendor_subscriptions s
           where s.status = 'active' and s.plan_id <> 'free' and s.current_period_end is not null) x
   where v.id = x.vendor_id
     and (v.plan_id is distinct from x.plan_id or v.plan_expires_at is distinct from x.until);

  update public.vendor_profiles
     set plan_id = null, plan_expires_at = null
   where plan_expires_at is not null
     and plan_expires_at < now();

  return n;
end;
$function$;

-- ── 8. Ad targeting reads the plan in force ─────────────────────────────────────────
-- It read vendor_subscriptions itself (so it missed the grace days and a paid downgrade
-- that has started). Everything below the plan lookup is unchanged; P5 rewrites the
-- targeting rule.
create or replace function public.enforce_ad_location_scope()
returns trigger
language plpgsql set search_path to 'public' as $function$
declare
  eff_plan   text := 'free';
  scope      text;
  allowance  integer;
  new_n      integer;
  old_n      integer;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- With definer rights, like the product cap: the plan in force, grace days included.
  eff_plan := public.vendor_cap_plan(new.vendor_id);

  select limits->>'ad_location_scope'
    into scope
    from public.subscription_plans
   where id = eff_plan;
  scope := coalesce(scope, 'none');

  allowance := case scope
                 when 'none'    then 0
                 when 'state_1' then 1
                 when 'state_4' then 4
                 else null
               end;

  new_n := coalesce(jsonb_array_length(
             case when jsonb_typeof(new.target_cities) = 'array'
                  then new.target_cities else '[]'::jsonb end), 0);

  if tg_op = 'INSERT' then
    if scope = 'none' then
      raise exception
        'Advertising is a paid feature: your % plan cannot create ad campaigns. Upgrade to a paid plan.',
        eff_plan
        using errcode = 'P0001';
    end if;
    if allowance is not null and new_n > allowance then
      raise exception
        'Ad targeting exceeds your plan: % (%) allows up to % target location(s); this ad targets %.',
        eff_plan, scope, allowance, new_n
        using errcode = 'P0001';
    end if;
  else
    old_n := coalesce(jsonb_array_length(
               case when jsonb_typeof(old.target_cities) = 'array'
                    then old.target_cities else '[]'::jsonb end), 0);
    if allowance is not null and new_n > allowance and new_n > old_n then
      raise exception
        'Ad targeting exceeds your plan: % (%) allows up to % target location(s); this ad targets %.',
        eff_plan, scope, allowance, new_n
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$function$;

-- ── 9. Grants ───────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'admin.feature_on_for(text,uuid)', 'admin.grace_interval(uuid)',
    'admin.apply_product_cap(uuid,boolean)', 'admin.subscription_cap_sync()',
    'public.products_pause_guard()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.products_pause_guard() to service_role;
  foreach f in array array[
    'public.vendor_keep_products(uuid[])', 'public.vendor_set_live_products(uuid[])', 'public.my_product_cap()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ── 10. Self-check ──────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'admin.feature_on_for(text,uuid)', 'admin.grace_interval(uuid)', 'admin.apply_product_cap(uuid,boolean)',
    'admin.subscription_cap_sync()', 'admin.vendor_effective_plan(uuid,timestamptz)',
    'admin.subscription_quote(uuid,text,text,timestamptz)', 'public.expire_subscriptions()',
    'public.subscription_activate(uuid,text,text)', 'public.notify_deliver(uuid,text,jsonb,text,text[])'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  foreach f in array array['public.vendor_keep_products(uuid[])', 'public.vendor_set_live_products(uuid[])', 'public.my_product_cap()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% is for signed-in vendors', f;
    end if;
  end loop;
  if position('admin.feature_on_for' in (select prosrc from pg_proc
        where oid = 'public.notify_deliver(uuid,text,jsonb,text,text[])'::regprocedure)) = 0 then
    raise exception 'notify_deliver was not patched';
  end if;
  if exists (select 1 from public.products where status::text = 'paused') then
    raise exception 'nothing is paused before the switch is first turned on';
  end if;
  if (select enabled from public.feature_flags where key = 'subscription_lifecycle') then
    raise exception 'subscription_lifecycle must start switched off';
  end if;
end
$check$;
