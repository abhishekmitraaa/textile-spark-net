-- ─────────────────────────────────────────────────────────────────────────────
-- Real views instead of "X sold" (2026-10-17)
--
-- Mitra: "it shows x items sold, but we can't track sales: the transaction happens outside Cosora. It should be
-- x views, so the number is real and not fake." products.sold_count has no writer (seed data; a browser insert
-- is forced to 0 since 20261010060959), so every "N+ sold" on a card was invented.
--
-- 1. increment_product_view(p, p_viewer) counts a view at most once per listing, per viewer, per day:
--    product_view_daily (product, viewer key, day) is the ledger, and views_count only moves when the row is new.
--    It used to add 1 on every call, and anyone could call it, so a refresh loop could raise any number.
--    The viewer key is the signed-in account, else a random id the browser keeps (lib/viewerKey.ts); a call
--    without one (an older app still open) counts once per listing per day in all. Rows older than yesterday
--    are removed as the function goes (about one call in 500), not by a new scheduled job. Live listings only,
--    as before. The stray PUBLIC grant goes: anon and authenticated only.
-- 2. feed_products returns views_count too (a new output column, so it's dropped and created again in this
--    transaction: callers see the old function or the new one, never none). Body = production's of 2026-10-17
--    (md5 840a54b7...) with views_count added to the output; sorting is unchanged.
--
-- Ranking (search_products, match_products, spotlight_listings, feed "trending") still reads sold_count +
-- enquiries_count. Moving it to views is a ranking change of its own, not made here.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. One view per listing, per viewer, per day
create table if not exists public.product_view_daily (
  product_id uuid not null references public.products (id) on delete cascade,
  viewer_key text not null check (char_length(viewer_key) between 1 and 80),
  day        date not null default (now() at time zone 'Asia/Kolkata')::date,
  primary key (product_id, viewer_key, day)
);
alter table public.product_view_daily enable row level security;
-- No policies: nobody reads or writes it directly; increment_product_view (SECURITY DEFINER) does.
revoke all on public.product_view_daily from public, anon, authenticated;
create index if not exists product_view_daily_day_idx on public.product_view_daily (day);

drop function if exists public.increment_product_view(uuid);

create or replace function public.increment_product_view(p uuid, p_viewer text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if p is null then
    return;
  end if;
  if auth.uid() is not null then
    v_key := 'u:' || auth.uid()::text;
  elsif p_viewer ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := 'b:' || p_viewer;
  else
    v_key := 'unkeyed';
  end if;

  if not exists (select 1 from public.products x where x.id = p and x.status = 'live') then
    return;
  end if;

  insert into public.product_view_daily (product_id, viewer_key, day)
  values (p, v_key, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.products set views_count = views_count + 1 where id = p and status = 'live';
  end if;

  if random() < 0.002 then
    delete from public.product_view_daily d where d.day < v_day - 1;
  end if;
end
$function$;

revoke all on function public.increment_product_view(uuid, text) from public;
grant execute on function public.increment_product_view(uuid, text) to anon, authenticated;

-- 2. feed_products returns views_count
drop function if exists public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[]);

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
           coalesce(p.sold_count, 0) + coalesce(p.enquiries_count, 0) as k_score,
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

revoke all on function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[])
  from public;
grant execute on function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[])
  to anon, authenticated;

-- Self-checks
do $$
declare
  f regprocedure := 'public.increment_product_view(uuid, text)'::regprocedure;
  g regprocedure := 'public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[])'::regprocedure;
begin
  if to_regprocedure('public.increment_product_view(uuid)') is not null then
    raise exception 'self-check: the old one-argument increment_product_view is still there';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0) then
    raise exception 'self-check: increment_product_view still granted to PUBLIC';
  end if;
  if not has_function_privilege('anon', f, 'execute') or not has_function_privilege('anon', g, 'execute') then
    raise exception 'self-check: anon cannot call the view counter or the feed';
  end if;
  if not (select prosecdef from pg_proc where oid = f) or not (select prosecdef from pg_proc where oid = g) then
    raise exception 'self-check: lost SECURITY DEFINER';
  end if;
  if pg_get_function_result(g) !~ 'views_count integer' then
    raise exception 'self-check: feed_products does not return views_count';
  end if;
  if has_table_privilege('anon', 'public.product_view_daily', 'select') or has_table_privilege('authenticated', 'public.product_view_daily', 'insert') then
    raise exception 'self-check: product_view_daily is open to clients';
  end if;
  if not has_column_privilege('anon', 'public.products', 'views_count', 'select') then
    raise exception 'self-check: visitors cannot read views_count';
  end if;
end $$;
