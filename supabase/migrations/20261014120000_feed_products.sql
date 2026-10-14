-- Buyer feeds are pages from the database (Mitra, 2026-10-14: "start the homepage fix").
--
-- New Arrivals, For You, Trends, Sale, Following and Search each downloaded EVERY live listing
-- (useLiveProducts) and every seller behind them, then filtered, sorted and paged in the browser.
-- Three silent failures as the catalogue grows: PostgREST stops at 1,000 rows, so older listings
-- vanish from every feed and filter; the sellers were read with one `in(id, …)` whose URL grows
-- with each seller and whose error was ignored, so brand names and paid boosts go blank; and
-- every visitor downloads the whole catalogue on every visit.
--
--   public.feed_products(p_sort, p_limit, p_offset, p_category_ids, p_gender, p_vendor_ids,
--                        p_on_sale, p_query, p_exclude_ids, p_discount_above, p_discount_upto, p_ids)
--     One page of live listings as cards: the listing, its category name, its first two
--     pictures, and its seller's name, city, seal parts and search boost. Sorts:
--       newest      paid tier first, then newest (what the feeds did in the browser)
--       trending    paid tier first, then sold + enquiries (the real counts; the browser parsed "5.6k")
--       discount    on-sale listings, deepest cut first
--       price_asc / price_desc / rating
--     Every sort ends on created_at desc, id desc, so pages are stable. Filters are all optional.
--     p_discount_above / p_discount_upto: Sale's tiers, in whole percent rounded as the page shows
--     them (above is exclusive, upto inclusive); either one means on sale.
--     p_ids: only these listings (For You's ranked ids), at most 200, and then up to 200 a page.
--     Bounds: at most 96 a page, an offset of at most 960 (40 pages of 24), 500 seller ids,
--     200 excluded ids, 60 characters of text.
--   public.live_category_counts(p_limit)
--     The categories with the most live listings, and how many (Search's category rail).
--
-- feed_products is SECURITY DEFINER, like for_you_products: as an invoker it paid the row policies
-- of products, vendor_profiles, categories and subscription_plans on every live listing before
-- sorting (915 ms for a page of 100,000 as a visitor, against 36 ms without the policies). It
-- applies the one rule those policies give a visitor itself, status = 'live', and returns only
-- columns every client may read (none of vendor_profiles' private eight). It sorts a narrow row
-- (id and the sort keys) and reads the card's columns for the page only. live_category_counts is
-- SECURITY DEFINER for the same reason (it counts every live listing) and returns only a
-- category's id, name and number of live listings.
-- The boost is admin.vendor_effective_plan()'s cache, as the browser computed it:
-- vendor_profiles.plan_id while plan_expires_at is in the future, its limits.search_boost_tier.
--
-- No DROP and no DELETE in this file.

create index if not exists products_live_created_id_idx
  on public.products (created_at desc, id desc) where status = 'live';

create or replace function public.feed_products(
  p_sort         text    default 'newest',
  p_limit        integer default 24,
  p_offset       integer default 0,
  p_category_ids uuid[]  default null,
  p_gender       text    default null,
  p_vendor_ids   uuid[]  default null,
  p_on_sale      boolean default false,
  p_query        text    default null,
  p_exclude_ids  uuid[]  default null,
  p_discount_above integer default null,
  p_discount_upto  integer default null,
  p_ids            uuid[]  default null)
returns table (
  id                uuid,
  vendor_id         uuid,
  name              text,
  price_value       numeric,
  currency          text,
  compare_at_price  numeric,
  moq               text,
  fabric            text,
  gsm               text,
  fit_type          text,
  gender            text,
  rating_avg        numeric,
  enquiries_count   integer,
  sold_count        integer,
  location          text,
  category_id       uuid,
  category_name     text,
  images            text[],
  created_at        timestamptz,
  brand_name        text,
  vendor_city       text,
  is_verified       boolean,
  plan_id           text,
  plan_expires_at   timestamptz,
  ad_verified_until timestamptz,
  boost             integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    -- ORDER BY … LIMIT keeps only the top rows while it reads (a top-N sort), where a window
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
         p.fit_type, p.gender, p.rating_avg, p.enquiries_count, p.sold_count, p.location, p.category_id,
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

create or replace function public.live_category_counts(p_limit integer default 8)
returns table (category_id uuid, category_name text, live_count integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id, c.name, count(*)::integer
    from public.products p
    join public.categories c on c.id = p.category_id
   where p.status = 'live'
   group by c.id, c.name
   order by count(*) desc, c.name, c.id
   limit least(greatest(coalesce(p_limit, 8), 1), 50)
$function$;

revoke all on function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[]),
  public.live_category_counts(integer) from public, anon, authenticated;
grant execute on function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[]),
  public.live_category_counts(integer) to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.feed_products(text,integer,integer,uuid[],text,uuid[],boolean,text,uuid[],integer,integer,uuid[])'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.live_category_counts(integer)'::regprocedure) then
    raise exception 'self-check: feed_products and live_category_counts must be SECURITY DEFINER';
  end if;
  -- A definer reader must never return a listing that isn't live, nor a private seller column.
  if exists (select 1 from public.feed_products('newest', 48) f join public.products p on p.id = f.id where p.status <> 'live') then
    raise exception 'self-check: feed_products returned a listing that is not live';
  end if;
  foreach f in array array['feed_products(text,integer,integer,uuid[],text,uuid[],boolean,text,uuid[],integer,integer,uuid[])', 'live_category_counts(integer)'] loop
    if not has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') then
      raise exception 'self-check: % grants are wrong', f;
    end if;
  end loop;
  if (select count(*) from public.feed_products('newest', 1000)) > 96 then
    raise exception 'self-check: feed_products returns more than 96 rows';
  end if;
  if (select count(*) from public.feed_products('discount', 48)) <> (select count(*) from public.feed_products('discount', 48, 0, null, null, null, true)) then
    raise exception 'self-check: discount must mean on sale';
  end if;
end
$check$;
