-- ─────────────────────────────────────────────────────────────────────────────
-- Ranking on real demand, not on "sold" (2026-10-17)
--
-- The listing cards stopped showing "N+ sold" today (20261017110000): sales happen off Cosora and
-- products.sold_count has no writer, so every value is seed data. Three functions still ranked on it:
--   feed_products        the "trending" sort (k_score)
--   spotlight_listings   which listing of a seller is shown in its spotlight
--   admin.featured_candidates   which listing of a seller is put forward for featured places
-- Each now ranks on enquiries and views: enquiries_count * 10 + views_count (an enquiry is a buyer asking the
-- seller, a far stronger sign than a view; views are now counted once per listing, viewer and day).
-- Bodies = production's of 2026-10-17 (md5 feed_products 5f282d48…, admin.featured_candidates 8c376b06…, spotlight_listings 6afc29da…), only that
-- expression changed. CREATE OR REPLACE keeps their grants, owners and SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────

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
           -- 2026-10-17: real demand. sold_count had no writer (seed data); an enquiry counts as 10 views.
           coalesce(p.enquiries_count, 0) * 10 + coalesce(p.views_count, 0) as k_score,
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
     order by pr.vendor_id, (coalesce(pr.enquiries_count, 0) * 10 + coalesce(pr.views_count, 0)) desc /* 2026-10-17: real demand, not seeded sold_count */, pr.created_at desc
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
                   row_number() over (partition by pr.vendor_id order by (coalesce(pr.enquiries_count, 0) * 10 + coalesce(pr.views_count, 0)) desc /* 2026-10-17: real demand, not seeded sold_count */, pr.created_at desc) as rn,
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

do $$
begin
  if pg_get_functiondef('public.feed_products(text,integer,integer,uuid[],text,uuid[],boolean,text,uuid[],integer,integer,uuid[])'::regprocedure) ~ 'sold_count, 0\) \+'
     or pg_get_functiondef('public.spotlight_listings(uuid,text,integer)'::regprocedure) ~ 'sold_count \+'
     or pg_get_functiondef('admin.featured_candidates(uuid[],text,text,text,uuid)'::regprocedure) ~ 'sold_count \+' then
    raise exception 'self-check: something still ranks on sold_count';
  end if;
end $$;
