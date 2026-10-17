-- ─────────────────────────────────────────────────────────────────────────────
-- Ranking on RECENT demand, fading (2026-10-17)
--
-- /code-review of 20261017150000–170000 found that ranking read all-time totals: views and enquiries counted
-- before today (when anyone could add to them freely) decided the order for ever, "trending" favoured old listings,
-- a script could add 100 signed-out views a day to a permanent score, and the formula was copied into three
-- functions. Mitra chose: rank on recent demand that fades, 7-day half-life, starting fresh; signed-out views weigh
-- a quarter; the "N views" on cards stays all-time.
--
-- product_trend (product_id, score): each counted enquiry or view adds weight × 2^((when − epoch) / 7 days), epoch
--   2026-10-17 00:00 IST. Every score carries the same growing factor, so comparing scores at any moment is the
--   same as comparing demand decayed to that moment, with no adding-up per query. (Doubles reach their limit
--   after about 19 years; rebase by dividing every score before then.) A separate table, not a products column:
--   a products update would send a live listing back to review (listing_edit_rereview) and meet the
--   server-columns guard. No client grants: only definer functions read or write it.
-- listing_demand_weight(kind): the one place the weights live (enquiry 10, signed-in view 1, signed-out 0.25).
-- add_listing_demand(product, weight, at): the one writer. listing_trend_score(product): the one reader.
-- increment_product_view: a repeat visitor (already counted today) returns before any lock; a signed-out call
--   checks the day's cap without the lock first; the occasional purge runs before the lock; the lock then guards
--   the recount and the insert as in 170000. Each counted view adds its weight.
-- increment_product_enquiry: each counted enquiry adds 10. Its signed-out return is for server roles only:
--   browsers without an account are refused by the grant (EXECUTE authenticated only).
-- feed_products (trending), spotlight_listings, admin.featured_candidates read listing_trend_score. Bodies =
--   production's of 2026-10-17 after 150000 (md5 62934301, 6139c259, 7e7b06a0), only that expression changed.
-- Seeded from today's ledgers (all of today's activity counted under the hardened counters).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.product_trend (
  product_id uuid primary key references public.products (id) on delete cascade,
  score      double precision not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.product_trend enable row level security;
revoke all on public.product_trend from public, anon, authenticated;

create or replace function public.listing_demand_weight(p_kind text)
returns double precision
language sql
immutable
set search_path = ''
as $function$
  select case p_kind
           when 'enquiry' then 10.0
           when 'view_signed_in' then 1.0
           when 'view_signed_out' then 0.25
           else 0.0
         end;
$function$;

create or replace function public.add_listing_demand(p uuid, p_weight double precision, p_at timestamptz default now())
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.product_trend as t (product_id, score, updated_at)
  values (p, p_weight * power(2.0, extract(epoch from (p_at - timestamptz '2026-10-17 00:00:00+05:30')) / 604800.0), now())
  on conflict (product_id) do update
     set score = t.score + excluded.score, updated_at = now();
$function$;

create or replace function public.listing_trend_score(p uuid)
returns double precision
language sql
stable
set search_path = ''
as $function$
  select coalesce((select t.score from public.product_trend t where t.product_id = p), 0);
$function$;

revoke all on function public.listing_demand_weight(text), public.add_listing_demand(uuid, double precision, timestamptz),
  public.listing_trend_score(uuid) from public, anon, authenticated;

-- ── The counters feed it ───────────────────────────────────────────────────────

create or replace function public.increment_product_view(p uuid, p_viewer text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if p is null then
    return;
  end if;
  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  elsif p_viewer ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := 'b:' || p_viewer;
  else
    v_key := 'unkeyed';
  end if;

  -- Already counted today: nothing to do, and no lock taken.
  if exists (select 1 from public.product_view_daily d where d.product_id = p and d.viewer_key = v_key and d.day = v_day) then
    return;
  end if;
  -- A live listing, not the caller's own.
  if not exists (select 1 from public.products x
                  where x.id = p and x.status = 'live' and (v_uid is null or x.vendor_id <> v_uid)) then
    return;
  end if;

  -- Old ledger days go now and then, before any lock is held.
  if random() < 0.002 then
    delete from public.product_view_daily d where d.day < v_day - 1;
  end if;

  -- Signed-out views: at most 100 per listing per day. A cheap look first; at the cap, no lock is taken. Below it,
  -- the per-listing lock makes the recount and the insert one caller at a time (parallel calls overshot it).
  if v_uid is null then
    if (select count(*) from public.product_view_daily d
         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('cosora.product_view_cap:' || p::text, 0));
    if (select count(*) from public.product_view_daily d
         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
  end if;

  insert into public.product_view_daily (product_id, viewer_key, day)
  values (p, v_key, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.products set views_count = views_count + 1 where id = p and status = 'live';
    perform public.add_listing_demand(p, public.listing_demand_weight(case when v_uid is null then 'view_signed_out' else 'view_signed_in' end));
  end if;
end
$function$;

create or replace function public.increment_product_enquiry(p uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid  uuid := auth.uid();
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  -- Browsers without an account never get here (EXECUTE is authenticated only); a server role has no account.
  if p is null or v_uid is null then
    return;
  end if;
  if not exists (select 1 from public.products x where x.id = p and x.status = 'live' and x.vendor_id <> v_uid) then
    return;
  end if;
  if random() < 0.002 then
    delete from public.product_enquiry_daily d where d.day < v_day - 1;
  end if;
  insert into public.product_enquiry_daily (product_id, profile_id, day) values (p, v_uid, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.products set enquiries_count = enquiries_count + 1 where id = p and status = 'live';
    perform public.add_listing_demand(p, public.listing_demand_weight('enquiry'));
  end if;
end
$function$;
revoke all on function public.increment_product_enquiry(uuid) from public, anon;
grant execute on function public.increment_product_enquiry(uuid) to authenticated;

-- ── Seed from today's ledgers ──────────────────────────────────────────────────
insert into public.product_trend (product_id, score)
select product_id, sum(w) from (
  select d.product_id,
         public.listing_demand_weight(case when d.viewer_key like 'u:%' then 'view_signed_in' else 'view_signed_out' end)
           * power(2.0, extract(epoch from (d.day::timestamp at time zone 'Asia/Kolkata' - timestamptz '2026-10-17 00:00:00+05:30')) / 604800.0) as w
    from public.product_view_daily d
  union all
  select e.product_id, public.listing_demand_weight('enquiry')
           * power(2.0, extract(epoch from (e.day::timestamp at time zone 'Asia/Kolkata' - timestamptz '2026-10-17 00:00:00+05:30')) / 604800.0)
    from public.product_enquiry_daily e
) s
where exists (select 1 from public.products x where x.id = s.product_id)
group by product_id
on conflict (product_id) do nothing;

-- ── Ranking reads the score ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.feed_products(p_sort text DEFAULT 'newest'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_category_ids uuid[] DEFAULT NULL::uuid[], p_gender text DEFAULT NULL::text, p_vendor_ids uuid[] DEFAULT NULL::uuid[], p_on_sale boolean DEFAULT false, p_query text DEFAULT NULL::text, p_exclude_ids uuid[] DEFAULT NULL::uuid[], p_discount_above integer DEFAULT NULL::integer, p_discount_upto integer DEFAULT NULL::integer, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, vendor_id uuid, name text, price_value numeric, currency text, compare_at_price numeric, moq text, fabric text, gsm text, fit_type text, gender text, rating_avg numeric, enquiries_count integer, sold_count integer, views_count integer, location text, category_id uuid, category_name text, images text[], created_at timestamp with time zone, brand_name text, vendor_city text, is_verified boolean, plan_id text, plan_expires_at timestamp with time zone, ad_verified_until timestamp with time zone, boost integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sort   text    := coalesce(nullif(btrim(p_sort), ''), 'newest');
  v_limit  integer := least(greatest(coalesce(p_limit, 24), 1), case when p_ids is null then 96 else 200 end);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 960);
  v_query  text    := nullif(btrim(coalesce(p_query, '')), '');
  v_like   text;
begin
  if v_sort not in ('newest', 'trending', 'discount', 'price_asc', 'price_desc', 'rating') then
    raise exception 'Unknown sort %', v_sort using errcode = '22023';
  end if;
  if coalesce(cardinality(p_vendor_ids), 0) > 500 or coalesce(cardinality(p_exclude_ids), 0) > 200
     or coalesce(cardinality(p_ids), 0) > 200
     or coalesce(cardinality(p_category_ids), 0) > 300 then
    raise exception 'Too many ids in one request' using errcode = '22023';
  end if;
  if v_query is not null then
    v_query := left(v_query, 60);
    v_like  := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with keyed as (
    -- Only what the sort needs, for every matching live listing.
    select p.id, p.created_at, p.price_value, p.rating_avg,
           case when v.plan_expires_at > now()
                then coalesce((sp.limits ->> 'search_boost_tier')::integer, 0) else 0 end as k_boost,
           -- Recent demand (20261017180000): only the trending sort reads it, so other sorts don't pay for it.
           case when v_sort = 'trending' then public.listing_trend_score(p.id) end as k_score,
           case when p.compare_at_price > p.price_value and p.compare_at_price > 0
                then (p.compare_at_price - p.price_value) / p.compare_at_price end as k_discount
      from public.products p
      join public.vendor_profiles v on v.id = p.vendor_id
      left join public.subscription_plans sp on sp.id = v.plan_id
     where p.status = 'live'
       and (p_category_ids is null or p.category_id = any (p_category_ids))
       and (p_vendor_ids is null or p.vendor_id = any (p_vendor_ids))
       and (p_exclude_ids is null or not (p.id = any (p_exclude_ids)))
       and (p_ids is null or p.id = any (p_ids))
       and (p_gender is null or lower(p.gender) = lower(p_gender))
       and (not coalesce(p_on_sale, false) and v_sort <> 'discount' and p_discount_above is null and p_discount_upto is null
            or p.compare_at_price > p.price_value)
       and (p_discount_above is null
            or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) > p_discount_above)
       and (p_discount_upto is null
            or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) <= p_discount_upto)
       and (v_like is null or p.name ilike v_like or v.brand_name ilike v_like)
  ),
  page as (
    -- ORDER BY ... LIMIT keeps only the top rows while it reads (a top-N sort), where a window
    -- function over every matching row would sort them all.
    select k.*
      from keyed k
     order by
             case when v_sort in ('newest', 'trending') then k.k_boost end desc nulls last,
             case when v_sort = 'trending' then k.k_score end desc nulls last,
             case when v_sort = 'discount' then k.k_discount end desc nulls last,
             case when v_sort = 'price_asc' then k.price_value end asc nulls last,
             case when v_sort = 'price_desc' then k.price_value end desc nulls last,
             case when v_sort = 'rating' then k.rating_avg end desc nulls last,
             k.created_at desc, k.id desc
     limit v_limit offset v_offset
  )
  -- The card, for this page's rows only.
  select p.id, p.vendor_id, p.name, p.price_value, p.currency, p.compare_at_price, p.moq, p.fabric, p.gsm,
         p.fit_type, p.gender, p.rating_avg, p.enquiries_count, p.sold_count, p.views_count, p.location, p.category_id,
         c.name,
         array(select i.url from public.product_images i where i.product_id = p.id order by i.position, i.id limit 2),
         p.created_at, v.brand_name, v.city, v.is_verified, v.plan_id, v.plan_expires_at, v.ad_verified_until,
         pg.k_boost
    from page pg
    join public.products p on p.id = pg.id
    join public.vendor_profiles v on v.id = p.vendor_id
    left join public.categories c on c.id = p.category_id
   order by
             case when v_sort in ('newest', 'trending') then pg.k_boost end desc nulls last,
             case when v_sort = 'trending' then pg.k_score end desc nulls last,
             case when v_sort = 'discount' then pg.k_discount end desc nulls last,
             case when v_sort = 'price_asc' then pg.price_value end asc nulls last,
             case when v_sort = 'price_desc' then pg.price_value end desc nulls last,
             case when v_sort = 'rating' then pg.rating_avg end desc nulls last,
             pg.created_at desc, pg.id desc;
end
$function$;

CREATE OR REPLACE FUNCTION admin.featured_candidates(p_cats uuid[], p_state text, p_day text, p_session text, p_viewer uuid)
 RETURNS TABLE(vendor_id uuid, product_id uuid, tier integer, nearby boolean, turn text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with eligible as (
    select v.id, v.state_code, v.served_states,
           case pl.limits ->> 'featured' when 'spotlight' then 3 when 'top5' then 2 when 'top10' then 1 else 0 end as tier
      from public.vendor_profiles v
      join public.subscription_plans pl on pl.id = v.plan_id
      join public.profiles pf on pf.id = v.id and pf.account_status = 'active'
     where v.plan_expires_at > now()
       and coalesce(pl.limits ->> 'featured', 'none') in ('spotlight', 'top5', 'top10')
       and v.id is distinct from p_viewer
  ), best as (
    select distinct on (pr.vendor_id) pr.vendor_id, pr.id as product_id
      from public.products pr
      join eligible e on e.id = pr.vendor_id
     where pr.status = 'live' and pr.category_id = any (p_cats)
     order by pr.vendor_id, public.listing_trend_score(pr.id) desc /* recent demand, 20261017180000 */, pr.created_at desc
  )
  select b.vendor_id, b.product_id, e.tier,
         e.tier >= 2 and p_state is not null
           and (e.state_code = p_state or p_state = any (coalesce(e.served_states, '{}'))),
         md5(b.vendor_id::text || p_day || coalesce(p_session, ''))
    from best b join eligible e on e.id = b.vendor_id
$function$;

CREATE OR REPLACE FUNCTION public.spotlight_listings(p_category uuid DEFAULT NULL::uuid, p_session text DEFAULT NULL::text, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me   uuid := auth.uid();
  v_day  text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_cats uuid[];
begin
  if not admin.feature_on_for('featured_listings', v_me) then
    return '[]'::jsonb;
  end if;
  if p_category is not null then
    v_cats := admin.category_subtree(p_category);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('product_id', x.id, 'vendor_id', x.vendor_id) order by x.rn, x.turn)
      from (select pr.id, pr.vendor_id,
                   row_number() over (partition by pr.vendor_id order by public.listing_trend_score(pr.id) desc /* recent demand, 20261017180000 */, pr.created_at desc) as rn,
                   md5(pr.vendor_id::text || v_day || coalesce(p_session, '')) as turn
              from public.products pr
              join public.vendor_profiles vp on vp.id = pr.vendor_id
              join public.subscription_plans p on p.id = vp.plan_id
             join public.profiles pf on pf.id = vp.id and pf.account_status = 'active'
             where pr.status = 'live'
               and p.limits ->> 'featured' = 'spotlight' and vp.plan_expires_at > now()
               and (v_cats is null or pr.category_id = any (v_cats))
               and pr.vendor_id is distinct from v_me
             order by rn, turn
             limit least(greatest(coalesce(p_limit, 8), 1), 12)) x), '[]'::jsonb);
end
$function$;

-- Self-checks
do $$
declare
  f text;
begin
  foreach f in array array['public.feed_products(text,integer,integer,uuid[],text,uuid[],boolean,text,uuid[],integer,integer,uuid[])',
                           'public.spotlight_listings(uuid,text,integer)', 'admin.featured_candidates(uuid[],text,text,text,uuid)'] loop
    if pg_get_functiondef(f::regprocedure) ~ 'sold_count \+|enquiries_count, 0\) \* 10|views_count, 0\)\) desc' then
      raise exception 'self-check: % still ranks on all-time totals', f;
    end if;
    if pg_get_functiondef(f::regprocedure) !~ 'listing_trend_score' then
      raise exception 'self-check: % does not read the trend score', f;
    end if;
  end loop;
  foreach f in array array['public.add_listing_demand(uuid,double precision,timestamp with time zone)',
                           'public.listing_trend_score(uuid)', 'public.listing_demand_weight(text)'] loop
    if has_function_privilege('anon', f::regprocedure, 'execute') or has_function_privilege('authenticated', f::regprocedure, 'execute') then
      raise exception 'self-check: % is callable by clients', f;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.product_trend', 'select') or has_table_privilege('authenticated', 'public.product_trend', 'select') then
    raise exception 'self-check: product_trend is readable by clients';
  end if;
  if has_function_privilege('anon', 'public.increment_product_enquiry(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.increment_product_view(uuid, text)', 'execute') then
    raise exception 'self-check: counter grants changed';
  end if;
  if pg_get_functiondef('public.increment_product_view(uuid,text)'::regprocedure) !~ 'add_listing_demand'
     or pg_get_functiondef('public.increment_product_enquiry(uuid)'::regprocedure) !~ 'add_listing_demand' then
    raise exception 'self-check: a counter does not feed the trend score';
  end if;
end $$;
