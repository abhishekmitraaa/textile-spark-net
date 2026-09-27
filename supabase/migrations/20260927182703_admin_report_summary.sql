-- Admin completion, Phase 3c (Mitra, 2026-09-27): Reports is computed in the database.
--
-- Cosora-Admin's Reports page used to pull six whole tables into the browser and
-- aggregate them there: vendor_profiles, products, categories, subscription_invoices,
-- ad_orders and subscription_plans, none with a limit. That grows with the catalogue
-- and the vendor base, and would silently truncate at PostgREST's row cap.
-- admin_report_summary(from, to) returns one small JSON document instead:
--   * vendor count; products by status; products per category;
--   * revenue by IST day, in paise. Subscriptions net of GST, GST separately (GST
--     collected is owed to the government, not revenue), ads, and the part with no
--     gateway payment id (demo-mode activations, not money received);
--   * the same as totals, plus the paid ad-order count;
--   * vendors on a plan, by search boost tier (at most 100).
-- The optional window applies to the revenue figures only. Any active admin may call
-- it, matching the page's audience.

create or replace function public.admin_report_summary(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;

  with
  prod as (
    select p.status::text as status, count(*)::int as n
      from public.products p
     group by 1),
  cats as (
    select coalesce(c.name, 'Uncategorised') as name, count(*)::int as n
      from public.products p
      left join public.categories c on c.id = p.category_id
     group by 1),
  inv as (
    select (i.created_at at time zone 'Asia/Kolkata')::date as day,
           sum(i.amount)::bigint * 100                   as net,
           sum(coalesce(i.gst_amount, 0))::bigint * 100  as gst,
           sum(case when i.razorpay_payment_id is null
                    then i.amount + coalesce(i.gst_amount, 0) else 0 end)::bigint * 100 as unverified
      from public.subscription_invoices i
     where i.status = 'paid'
       and (p_from is null or i.created_at >= p_from)
       and (p_to is null or i.created_at < p_to)
     group by 1),
  ads as (
    select (coalesce(o.paid_at, o.created_at) at time zone 'Asia/Kolkata')::date as day,
           sum(o.amount)::bigint as paise,
           count(*)::int         as n
      from public.ad_orders o
     where o.status = 'paid'
       and (p_from is null or coalesce(o.paid_at, o.created_at) >= p_from)
       and (p_to is null or coalesce(o.paid_at, o.created_at) < p_to)
     group by 1),
  days as (
    select coalesce(inv.day, ads.day)   as day,
           coalesce(inv.net, 0)         as net,
           coalesce(inv.gst, 0)         as gst,
           coalesce(inv.unverified, 0)  as unverified,
           coalesce(ads.paise, 0)       as ads
      from inv full join ads on ads.day = inv.day),
  plans as (
    select v.id,
           coalesce(v.brand_name, 'Unnamed vendor')                   as brand,
           coalesce(sp.name, v.plan_id)                               as plan,
           coalesce((sp.limits ->> 'search_boost_tier')::int, 0)      as boost,
           coalesce(v.plan_expires_at > now(), false)                 as active
      from public.vendor_profiles v
      left join public.subscription_plans sp on sp.id = v.plan_id
     where v.plan_id is not null
     order by 4 desc, 2
     limit 100)
  select jsonb_build_object(
    'generated_at', now(),
    'vendors', (select count(*) from public.vendor_profiles),
    'products_by_status', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', n) order by n desc, status) from prod), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc, name) from cats), '[]'::jsonb),
    'revenue_by_day', coalesce((select jsonb_agg(jsonb_build_object(
        'day', day, 'subscriptions_net_paise', net, 'gst_paise', gst, 'ads_paise', ads, 'unverified_paise', unverified)
        order by day) from days), '[]'::jsonb),
    'totals', jsonb_build_object(
        'subscriptions_net_paise', coalesce((select sum(net) from inv), 0),
        'gst_paise',               coalesce((select sum(gst) from inv), 0),
        'ads_paise',               coalesce((select sum(paise) from ads), 0),
        'ad_orders',               coalesce((select sum(n) from ads), 0),
        'unverified_paise',        coalesce((select sum(unverified) from inv), 0)),
    'vendors_on_plans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'brand', brand, 'plan', plan, 'boost', boost, 'active', active)
        order by boost desc, brand) from plans), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

revoke all on function public.admin_report_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_report_summary(timestamptz, timestamptz) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('anon', 'public.admin_report_summary(timestamptz, timestamptz)', 'EXECUTE') then
    raise exception 'self-check: anon can execute admin_report_summary()';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_report_summary(timestamptz, timestamptz)', 'EXECUTE') then
    raise exception 'self-check: authenticated cannot execute admin_report_summary()';
  end if;
end
$check$;
