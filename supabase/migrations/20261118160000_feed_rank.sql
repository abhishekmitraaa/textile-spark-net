-- The buyer feeds read a precomputed ranking (Mitra, 2026-11-18: "Precomputed feed + job"; buyer review H-11).
--
-- feed_products() used to work out every live listing's sort keys on every call: the seller's paid tier (vendor_profiles
-- + subscription_plans), recent demand (product_trend) and the rest, then sort them all. ~190 ms per call over 10,000
-- listings (scripts/feeds/harness.sql), 3–4 calls per Home view, on a 60-connection database.
--
-- Now:
--   * admin.feed_rank holds those keys, one row per live listing, with indexes in the exact order of the two busy
--     sorts (newest, trending).
--   * trg_products_feed_rank keeps a listing's row in step with its own changes (going live, coming down, rating,
--     date), so an approved listing is in the feed at once and a removed one is gone at once.
--   * trg_vendor_profiles_feed_rank re-keys a seller's rows when the plan or the registration changes.
--   * The job feed-rank-refresh (every minute) re-reads what changes without a write to products: recent demand, a plan
--     running out, a plan's tier changing. The order can lag those by up to a minute.
--   * feed_products() keeps its parameters, columns and order. `newest` and `trending` (without the trade-buyer lift,
--     a text search or a fixed id list) read the index in order and stop at the page; every other case keeps the CASE
--     ordering, over the precomputed keys. `status = 'live'` is still read from products itself, and every card column
--     still comes from products / vendor_profiles / categories.
--   * scripts/high-bugs/feed_rank_harness.sql proves the new function returns the same ids in the same order as the
--     body it replaces, for every sort and filter, over 100,000 listings.

begin;

-- Replace only the body this was written against (production's, read 2026-11-18; CRs stripped).
do $guard$
declare v_md5 text;
begin
  select md5(replace(pg_get_functiondef(p.oid), chr(13), '')) into v_md5
    from pg_proc p where p.proname = 'feed_products' and p.pronamespace = 'public'::regnamespace;
  if v_md5 is distinct from 'bf708e1d625db4ef8d4660b4ee2b471b' then
    raise exception 'feed_products is not the body this migration replaces (md5 %)', v_md5;
  end if;
end
$guard$;

-- ── 1. The ranking table ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists admin.feed_rank (
  product_id   uuid primary key references public.products(id) on delete cascade,
  vendor_id    uuid not null,
  k_boost      integer not null,             -- the paid tier while the plan runs, else 0
  k_trend      double precision not null,    -- recent demand, log2 (product_trend), '-infinity' with none
  rating_avg   numeric,
  created_at   timestamptz,
  intl         boolean not null,             -- a registered seller outside India (the trade-buyer lift, 2026-11-13)
  refreshed_at timestamptz not null default now()
);
create index if not exists feed_rank_newest_idx
  on admin.feed_rank (k_boost desc, created_at desc, product_id desc);
create index if not exists feed_rank_trending_idx
  on admin.feed_rank (k_boost desc, k_trend desc, rating_avg desc nulls last, created_at desc, product_id desc);
create index if not exists feed_rank_vendor_idx on admin.feed_rank (vendor_id);
revoke all on admin.feed_rank from public, anon, authenticated;
comment on table admin.feed_rank is
  'Sort keys of every live listing for feed_products() (review H-11). Kept by trg_products_feed_rank, '
  'trg_vendor_profiles_feed_rank and the job feed-rank-refresh. Never a client''s to read.';

-- ── 2. Refresh: all rows (the job), or one listing's / one seller's (the triggers) ───────────────────────────────────
create or replace function admin.feed_rank_refresh(p_product_ids uuid[] default null, p_vendor_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_changed integer;
begin
  insert into admin.feed_rank as fr (product_id, vendor_id, k_boost, k_trend, rating_avg, created_at, intl, refreshed_at)
  select p.id, p.vendor_id,
         case when v.plan_expires_at > now()
              then coalesce((sp.limits ->> 'search_boost_tier')::integer, 0) else 0 end,
         coalesce(tr.log2_score, '-infinity'::double precision),
         p.rating_avg, p.created_at,
         coalesce(v.onboarding_complete and v.country_code <> 'IN', false),
         now()
    from public.products p
    join public.vendor_profiles v on v.id = p.vendor_id
    left join public.subscription_plans sp on sp.id = v.plan_id
    left join public.product_trend tr on tr.product_id = p.id
   where p.status = 'live'
     and (p_product_ids is null or p.id = any (p_product_ids))
     and (p_vendor_ids is null or p.vendor_id = any (p_vendor_ids))
  on conflict (product_id) do update
     set vendor_id = excluded.vendor_id, k_boost = excluded.k_boost, k_trend = excluded.k_trend,
         rating_avg = excluded.rating_avg, created_at = excluded.created_at, intl = excluded.intl,
         refreshed_at = excluded.refreshed_at
   where (fr.vendor_id, fr.k_boost, fr.k_trend, fr.rating_avg, fr.created_at, fr.intl)
         is distinct from (excluded.vendor_id, excluded.k_boost, excluded.k_trend, excluded.rating_avg,
                           excluded.created_at, excluded.intl);
  get diagnostics v_changed = row_count;

  -- Listings that aren't live any more (a WHERE on every DELETE: PostgREST sessions load safeupdate).
  delete from admin.feed_rank fr
   where (p_product_ids is null or fr.product_id = any (p_product_ids))
     and (p_vendor_ids is null or fr.vendor_id = any (p_vendor_ids))
     and not exists (select 1 from public.products p where p.id = fr.product_id and p.status = 'live');
  return v_changed;
end
$function$;
revoke all on function admin.feed_rank_refresh(uuid[], uuid[]) from public, anon, authenticated;

-- ── 3. Triggers: a listing's own changes, and a seller's plan or registration ───────────────────────────────────────
-- They must never fail the write that fires them: on an error the row waits for the next minute's refresh.
create or replace function admin.trg_feed_rank_products()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    perform admin.feed_rank_refresh(array[new.id], null);
  exception when others then
    raise warning 'feed_rank: listing % waits for the next refresh (%)', new.id, sqlerrm;
  end;
  return null;
end
$function$;
revoke all on function admin.trg_feed_rank_products() from public, anon, authenticated;

drop trigger if exists trg_products_feed_rank on public.products;
create trigger trg_products_feed_rank
  after insert or update of status, rating_avg, created_at, vendor_id on public.products
  for each row execute function admin.trg_feed_rank_products();

create or replace function admin.trg_feed_rank_vendor()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (new.plan_id, new.plan_expires_at, new.onboarding_complete, new.country_code)
     is distinct from (old.plan_id, old.plan_expires_at, old.onboarding_complete, old.country_code) then
    begin
      perform admin.feed_rank_refresh(null, array[new.id]);
    exception when others then
      raise warning 'feed_rank: seller % waits for the next refresh (%)', new.id, sqlerrm;
    end;
  end if;
  return null;
end
$function$;
revoke all on function admin.trg_feed_rank_vendor() from public, anon, authenticated;

drop trigger if exists trg_vendor_profiles_feed_rank on public.vendor_profiles;
create trigger trg_vendor_profiles_feed_rank
  after update of plan_id, plan_expires_at, onboarding_complete, country_code on public.vendor_profiles
  for each row execute function admin.trg_feed_rank_vendor();

-- ── 4. feed_products over the precomputed keys ──────────────────────────────────────────────────────────────────────
create or replace function public.feed_products(p_sort text DEFAULT 'newest'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_category_ids uuid[] DEFAULT NULL::uuid[], p_gender text DEFAULT NULL::text, p_vendor_ids uuid[] DEFAULT NULL::uuid[], p_on_sale boolean DEFAULT false, p_query text DEFAULT NULL::text, p_exclude_ids uuid[] DEFAULT NULL::uuid[], p_discount_above integer DEFAULT NULL::integer, p_discount_upto integer DEFAULT NULL::integer, p_ids uuid[] DEFAULT NULL::uuid[], p_supplier text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, vendor_id uuid, name text, price_value numeric, currency text, compare_at_price numeric, moq text, fabric text, gsm text, fit_type text, gender text, rating_avg numeric, enquiries_count integer, sold_count integer, views_count integer, location text, category_id uuid, category_name text, images text[], created_at timestamp with time zone, brand_name text, vendor_city text, is_verified boolean, plan_id text, plan_expires_at timestamp with time zone, ad_verified_until timestamp with time zone, boost integer, vendor_country_code text)
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
  -- Trade buyers lift approved international sellers on trending (Mitra, 2026-11-13); read once.
  v_trade  boolean := v_sort = 'trending' and admin.viewer_trade_buyer();
  -- Sale filters that apply on every path (they read only the listing).
  v_sale   boolean := coalesce(p_on_sale, false) or v_sort = 'discount' or p_discount_above is not null or p_discount_upto is not null;
begin
  if v_sort not in ('newest', 'trending', 'discount', 'price_asc', 'price_desc', 'rating') then
    raise exception 'Unknown sort %', v_sort using errcode = '22023';
  end if;
  if p_supplier is not null and p_supplier not in ('india', 'international') then
    raise exception 'Unknown supplier location %', p_supplier using errcode = '22023';
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

  -- ── Fast path: newest. The index (k_boost, created_at, product_id) is read in order and stops at the page. ──
  if v_sort = 'newest' and v_like is null and p_ids is null then
    return query
    with page as (
      select fr.product_id as pid, fr.k_boost, fr.created_at as k_created
        from admin.feed_rank fr
        join public.products p on p.id = fr.product_id
       where p.status = 'live'
         and (p_category_ids is null or p.category_id = any (p_category_ids))
         and (p_vendor_ids is null or fr.vendor_id = any (p_vendor_ids))
         and (p_exclude_ids is null or not (p.id = any (p_exclude_ids)))
         and (p_gender is null or lower(p.gender) = lower(p_gender))
         and (p_supplier is null or p.vendor_id in (
               select s.id from public.vendor_profiles s
                where (p_supplier = 'india' and coalesce(s.country_code, 'IN') = 'IN')
                   or (p_supplier = 'international' and s.onboarding_complete and s.country_code <> 'IN')))
         and (not v_sale or p.compare_at_price > p.price_value)
         and (p_discount_above is null
              or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) > p_discount_above)
         and (p_discount_upto is null
              or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) <= p_discount_upto)
       order by fr.k_boost desc, fr.created_at desc, fr.product_id desc
       limit v_limit offset v_offset
    )
    select p.id, p.vendor_id, p.name, p.price_value, p.currency, p.compare_at_price, p.moq, p.fabric, p.gsm,
           p.fit_type, p.gender, p.rating_avg, p.enquiries_count, p.sold_count, p.views_count, p.location, p.category_id,
           c.name,
           array(select i.url from public.product_images i where i.product_id = p.id order by i.position, i.id limit 2),
           p.created_at, v.brand_name, v.city, v.is_verified, v.plan_id, v.plan_expires_at, v.ad_verified_until,
           pg.k_boost, case when v.onboarding_complete then v.country_code end
      from page pg
      join public.products p on p.id = pg.pid
      join public.vendor_profiles v on v.id = p.vendor_id
      left join public.categories c on c.id = p.category_id
     order by pg.k_boost desc, pg.k_created desc, pg.pid desc;
    return;
  end if;

  -- ── Fast path: trending for everyone but trade buyers (whose lift is per viewer). Same idea, its own index. ──
  if v_sort = 'trending' and not v_trade and v_like is null and p_ids is null then
    return query
    with page as (
      select fr.product_id as pid, fr.k_boost, fr.k_trend, fr.rating_avg as k_rating, fr.created_at as k_created
        from admin.feed_rank fr
        join public.products p on p.id = fr.product_id
       where p.status = 'live'
         and (p_category_ids is null or p.category_id = any (p_category_ids))
         and (p_vendor_ids is null or fr.vendor_id = any (p_vendor_ids))
         and (p_exclude_ids is null or not (p.id = any (p_exclude_ids)))
         and (p_gender is null or lower(p.gender) = lower(p_gender))
         and (p_supplier is null or p.vendor_id in (
               select s.id from public.vendor_profiles s
                where (p_supplier = 'india' and coalesce(s.country_code, 'IN') = 'IN')
                   or (p_supplier = 'international' and s.onboarding_complete and s.country_code <> 'IN')))
         and (not v_sale or p.compare_at_price > p.price_value)
         and (p_discount_above is null
              or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) > p_discount_above)
         and (p_discount_upto is null
              or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) <= p_discount_upto)
       order by fr.k_boost desc, fr.k_trend desc, fr.rating_avg desc nulls last, fr.created_at desc, fr.product_id desc
       limit v_limit offset v_offset
    )
    select p.id, p.vendor_id, p.name, p.price_value, p.currency, p.compare_at_price, p.moq, p.fabric, p.gsm,
           p.fit_type, p.gender, p.rating_avg, p.enquiries_count, p.sold_count, p.views_count, p.location, p.category_id,
           c.name,
           array(select i.url from public.product_images i where i.product_id = p.id order by i.position, i.id limit 2),
           p.created_at, v.brand_name, v.city, v.is_verified, v.plan_id, v.plan_expires_at, v.ad_verified_until,
           pg.k_boost, case when v.onboarding_complete then v.country_code end
      from page pg
      join public.products p on p.id = pg.pid
      join public.vendor_profiles v on v.id = p.vendor_id
      left join public.categories c on c.id = p.category_id
     order by pg.k_boost desc, pg.k_trend desc, pg.k_rating desc nulls last, pg.k_created desc, pg.pid desc;
    return;
  end if;

  -- ── Every other case: the same CASE ordering as before, over the precomputed keys. ──
  return query
  with keyed as (
    select p.id, p.created_at, p.price_value, p.rating_avg, fr.k_boost,
           case when v_sort = 'trending' then fr.k_trend + case when v_trade and fr.intl then 1.0 else 0 end end as k_score,
           case when p.compare_at_price > p.price_value and p.compare_at_price > 0
                then (p.compare_at_price - p.price_value) / p.compare_at_price end as k_discount
      from admin.feed_rank fr
      join public.products p on p.id = fr.product_id
     where p.status = 'live'
       and (p_category_ids is null or p.category_id = any (p_category_ids))
       and (p_vendor_ids is null or p.vendor_id = any (p_vendor_ids))
       and (p_exclude_ids is null or not (p.id = any (p_exclude_ids)))
       and (p_ids is null or p.id = any (p_ids))
       and (p_gender is null or lower(p.gender) = lower(p_gender))
       and (p_supplier is null or p.vendor_id in (
             select s.id from public.vendor_profiles s
              where (p_supplier = 'india' and coalesce(s.country_code, 'IN') = 'IN')
                 or (p_supplier = 'international' and s.onboarding_complete and s.country_code <> 'IN')))
       and (not v_sale or p.compare_at_price > p.price_value)
       and (p_discount_above is null
            or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) > p_discount_above)
       and (p_discount_upto is null
            or round((p.compare_at_price - p.price_value) / nullif(p.compare_at_price, 0) * 100) <= p_discount_upto)
       and (v_like is null or p.name ilike v_like
            or exists (select 1 from public.vendor_profiles bv where bv.id = p.vendor_id and bv.brand_name ilike v_like))
  ),
  page as (
    select k.*
      from keyed k
     order by
             case when v_sort in ('newest', 'trending') then k.k_boost end desc nulls last,
             case when v_sort = 'trending' then k.k_score end desc nulls last,
             -- No recent demand yet: best-rated first, then newest (not "popular" by default).
             case when v_sort = 'trending' then k.rating_avg end desc nulls last,
             case when v_sort = 'discount' then k.k_discount end desc nulls last,
             case when v_sort = 'price_asc' then k.price_value end asc nulls last,
             case when v_sort = 'price_desc' then k.price_value end desc nulls last,
             case when v_sort = 'rating' then k.rating_avg end desc nulls last,
             k.created_at desc, k.id desc
     limit v_limit offset v_offset
  )
  select p.id, p.vendor_id, p.name, p.price_value, p.currency, p.compare_at_price, p.moq, p.fabric, p.gsm,
         p.fit_type, p.gender, p.rating_avg, p.enquiries_count, p.sold_count, p.views_count, p.location, p.category_id,
         c.name,
         array(select i.url from public.product_images i where i.product_id = p.id order by i.position, i.id limit 2),
         p.created_at, v.brand_name, v.city, v.is_verified, v.plan_id, v.plan_expires_at, v.ad_verified_until,
         pg.k_boost, case when v.onboarding_complete then v.country_code end
    from page pg
    join public.products p on p.id = pg.id
    join public.vendor_profiles v on v.id = p.vendor_id
    left join public.categories c on c.id = p.category_id
   order by
             case when v_sort in ('newest', 'trending') then pg.k_boost end desc nulls last,
             case when v_sort = 'trending' then pg.k_score end desc nulls last,
             case when v_sort = 'trending' then pg.rating_avg end desc nulls last,
             case when v_sort = 'discount' then pg.k_discount end desc nulls last,
             case when v_sort = 'price_asc' then pg.price_value end asc nulls last,
             case when v_sort = 'price_desc' then pg.price_value end desc nulls last,
             case when v_sort = 'rating' then pg.rating_avg end desc nulls last,
             pg.created_at desc, pg.id desc;
end
$function$;

-- ── 5. Fill it, schedule the refresh, check ─────────────────────────────────────────────────────────────────────────
select admin.feed_rank_refresh();

select cron.schedule('feed-rank-refresh', '* * * * *', 'select admin.feed_rank_refresh()');

do $check$
declare
  v_live    integer;
  v_ranked  integer;
  v_missing integer;
begin
  select count(*) into v_live from public.products where status = 'live';
  select count(*) into v_ranked from admin.feed_rank;
  select count(*) into v_missing
    from public.products p where p.status = 'live' and not exists (select 1 from admin.feed_rank fr where fr.product_id = p.id);
  if v_missing <> 0 or v_ranked <> v_live then
    raise exception 'feed_rank self-check failed: % live, % ranked, % live listings missing', v_live, v_ranked, v_missing;
  end if;
  raise notice 'feed_rank: % live listings ranked', v_ranked;
end
$check$;

commit;
