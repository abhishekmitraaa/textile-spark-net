-- ─────────────────────────────────────────────────────────────
-- Vendor subscription system — functions.
--
--  • get_vendor_plan(v)      the single read model the client hook uses:
--                            resolves the EFFECTIVE plan (falls back to Free on
--                            read when a paid period has lapsed — this is the
--                            "expire without renewal → Free" rule), with the
--                            plan's limits and LIVE usage (products + leads).
--  • next_invoice_number()   monotonic INV-YYYY-NNNNNN (edge functions call it).
--  • expire_subscriptions()  optional sweeper (a cron COULD call it); read-side
--                            fallback above is authoritative, so this is only
--                            housekeeping that flips stale rows to 'expired' and
--                            clears the denormalised cache on vendor_profiles.
-- ─────────────────────────────────────────────────────────────

create sequence if not exists public.subscription_invoice_seq;

create or replace function public.next_invoice_number()
returns text
language sql
volatile
security definer
set search_path to 'public'
as $$
  select 'INV-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.subscription_invoice_seq')::text, 6, '0');
$$;

-- Effective plan + limits + live usage for a vendor (defaults to the caller).
create or replace function public.get_vendor_plan(v uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  vid            uuid := coalesce(v, auth.uid());
  sub            public.vendor_subscriptions%rowtype;
  eff_plan_id    text := 'free';
  eff_status     text := 'free';
  plan           public.subscription_plans%rowtype;
  p_start        timestamptz;
  p_end          timestamptz;
  products_used  integer := 0;
  leads_used     integer := 0;
  verified_admin boolean := false;
  paid_active    boolean := false;
begin
  if vid is null then
    return null;
  end if;

  select * into sub from public.vendor_subscriptions where vendor_id = vid;
  if found and sub.status = 'active' and sub.current_period_end is not null
     and sub.current_period_end > now() then
    eff_plan_id := sub.plan_id;
    eff_status  := sub.status;
    paid_active := (sub.plan_id <> 'free');
  end if;

  select * into plan from public.subscription_plans where id = eff_plan_id;
  if not found then
    -- Free must always exist; guard anyway.
    select * into plan from public.subscription_plans where id = 'free';
  end if;

  if paid_active then
    p_start := sub.current_period_start;
    p_end   := sub.current_period_end;
  else
    p_start := date_trunc('month', now());
    p_end   := p_start + interval '1 month';
  end if;

  -- Live usage (source of truth — avoids drift vs. the snapshot table).
  select count(*) into products_used
    from public.products
   where vendor_id = vid and status in ('under_review','live');

  select count(distinct rfq_id) into leads_used
    from public.quotes
   where vendor_id = vid and created_at >= p_start;

  select coalesce(is_verified, false) into verified_admin
    from public.vendor_profiles where id = vid;

  return jsonb_build_object(
    'vendor_id',            vid,
    'effective_plan_id',    eff_plan_id,
    'status',               eff_status,
    'billing_cycle',        coalesce(sub.billing_cycle, 'monthly'),
    'auto_renew',           coalesce(sub.auto_renew, true),
    'current_period_start', p_start,
    'current_period_end',   p_end,
    'subscription_end',     sub.current_period_end,
    'is_invite_only',       plan.is_invite_only,
    'is_verified_admin',    verified_admin,
    'trust_seal',           (verified_admin or (paid_active and coalesce((plan.limits->>'has_verified_badge')::boolean, false))),
    'plan', jsonb_build_object(
              'id',            plan.id,
              'name',          plan.name,
              'monthly_price', plan.monthly_price,
              'yearly_price',  plan.yearly_price,
              'currency',      plan.currency,
              'is_invite_only',plan.is_invite_only,
              'sort_order',    plan.sort_order,
              'limits',        plan.limits,
              'display',       plan.display
            ),
    'limits', plan.limits,
    'usage', jsonb_build_object(
               'products_used', products_used,
               'leads_used',    leads_used,
               'period_start',  p_start,
               'period_end',    p_end
             )
  );
end;
$$;

grant execute on function public.get_vendor_plan(uuid) to anon, authenticated, service_role;
grant execute on function public.next_invoice_number() to service_role;

-- Optional housekeeping sweeper. Check-on-read (get_vendor_plan) already makes a
-- lapsed vendor behave as Free, so this only tidies stale rows/cache.
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  update public.vendor_subscriptions
     set status = 'expired', updated_at = now()
   where status = 'active'
     and current_period_end is not null
     and current_period_end < now();
  get diagnostics n = row_count;

  update public.vendor_profiles
     set plan_id = null, plan_expires_at = null
   where plan_expires_at is not null
     and plan_expires_at < now();

  return n;
end;
$$;

grant execute on function public.expire_subscriptions() to service_role;
