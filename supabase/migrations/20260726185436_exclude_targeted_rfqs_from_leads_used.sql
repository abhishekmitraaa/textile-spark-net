-- Only open-marketplace replies consume the monthly lead allowance.
-- A Direct Quote Request is addressed to one vendor from a product page: its
-- inbox is intentionally not gated by the cap, so it must not silently spend a
-- lead slot either. Joining rfqs and keeping only `rfqs.vendor_id is null`
-- makes the counter agree with that. Everything else in the function is
-- unchanged.
create or replace function public.get_vendor_plan(v uuid default auth.uid())
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
  if not (vid = auth.uid() or public.is_admin()) then
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
    select * into plan from public.subscription_plans where id = 'free';
  end if;

  if paid_active then
    p_start := sub.current_period_start;
    p_end   := sub.current_period_end;
  else
    p_start := date_trunc('month', now());
    p_end   := p_start + interval '1 month';
  end if;

  select count(*) into products_used
    from public.products
   where vendor_id = vid and status in ('under_review','live');

  -- Open-marketplace replies only (rfqs.vendor_id is null). Targeted requests
  -- do not consume the cap.
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
$function$;
