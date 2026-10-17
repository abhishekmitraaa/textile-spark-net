-- ─────────────────────────────────────────────────────────────────────────────
-- Recent demand everywhere, stored so it can't overflow (2026-10-17)
--
-- /code-review of 20261017180000 (10 findings):
--  1 Five more rankings still ordered on all-time enquiries_count / views_count (search, "You might also like",
--    For You, autocomplete, new brands), and so did two app sorts (Brand Picks, Search "Popularity").
--  2 listing_trend_score had SET search_path, so it couldn't be inlined: a function call per row in the trending
--    feed (budget: 150 ms over 100k listings).
--  6 With every score 0, trending fell back to newest-first while called popular.
--  7 Scores were weight × 2^(age / 7 days) in a double: overflow after ~19.6 years, nothing enforcing a rebase.
--  9 The epoch and half-life were written in several places. 10 product_trend.updated_at was written, never read.
--
-- Now:
--  * product_trend.log2_score = log2 of the decayed sum (each event adds weight × 2^(age in half-lives)), added with
--    log-sum-exp (demand_log_add). It grows by about 52 a year: no overflow, ever, and no rebase needed. Ordering by
--    it is the same as ordering by decayed demand. The column `score` (converted) and `updated_at` are gone.
--  * demand_age_halflives(at): the one place for the epoch (2026-10-17 IST) and the half-life (7 days).
--    demand_log_of(weight, at), demand_log_add(a, b): the arithmetic. listing_demand_now(product): a listing's demand
--    in today's units, for harnesses and anyone reading a number. add_listing_demand: the counters' one writer.
--  * Visitors may READ the scores of live listings (RLS), so the app's own sorts and SECURITY INVOKER functions can
--    use them; they say no more than the all-time views every card already shows. Writing stays function-only.
--  * All eight rankings join product_trend set-wise (no per-row call); listing_trend_score is dropped.
--  * Ties on no recent demand go to the best-rated, then the newest (trending, spotlight, featured, For You's
--    last tier), and the docs say "most in demand recently", not "most popular".
-- Bodies = production's of 2026-10-17; only the marked ranking parts change. md5(pg_get_functiondef) before:
--   feed_products 1dc45202, spotlight_listings 24dd5b92, admin.featured_candidates 3704d70a, new_brand_suggestions
--   2a83fcef, search_suggestions 9b2704d7, related_products c5a02355, for_you_products 6e94115c, match_products
--   e2ae54d2, add_listing_demand 25db20b2, listing_trend_score 5dc4d288. Re-check them before applying; keep their
--   pg_get_functiondef output as the rollback (with `score = power(2, log2_score)`, the 180000 grants and policy).
-- Order: apply this BEFORE the app that embeds product_trend (catalogue, Brand Picks): before it, clients can't read
-- the table and those requests fail. The app before it never reads product_trend, so applying first is safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- product_trend is locked (ACCESS EXCLUSIVE) from its first ALTER to commit; fail fast rather than queue every
-- view and feed call behind a long reader.
set local lock_timeout = '5s';

-- ── The arithmetic, in one place ─────────────────────────────────────────────
create or replace function public.demand_age_halflives(p_at timestamptz)
returns double precision
language sql
immutable
set search_path = ''
as $function$
  select extract(epoch from (p_at - timestamptz '2026-10-17 00:00:00+05:30')) / 604800.0;  -- 7-day half-life
$function$;

create or replace function public.demand_log_of(p_weight double precision, p_at timestamptz)
returns double precision
language sql
immutable
set search_path = ''
as $function$
  select case when p_weight > 0 then ln(p_weight) / ln(2.0) + public.demand_age_halflives(p_at) else '-infinity'::double precision end;
$function$;

-- log2(2^a + 2^b), without ever forming 2^a.
create or replace function public.demand_log_add(a double precision, b double precision)
returns double precision
language sql
immutable
set search_path = ''
as $function$
  select case
           when a is null or a = '-infinity'::double precision then b
           when b is null or b = '-infinity'::double precision then a
           -- Past 2^-1000 the smaller term adds nothing a double can hold, and power() would raise an underflow
           -- (a listing idle ~20 years could then never count again): keep the larger.
           when least(a, b) - greatest(a, b) < -1000 then greatest(a, b)
           else greatest(a, b) + ln(1 + power(2.0, least(a, b) - greatest(a, b))) / ln(2.0)
         end;
$function$;

-- ── The table: log2 of the decayed sum ───────────────────────────────────────
alter table public.product_trend add column if not exists log2_score double precision;
do $$
begin
  -- Only while `score` exists, so the migration can run again.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'product_trend' and column_name = 'score') then
    update public.product_trend set log2_score = ln(score) / ln(2.0) where score > 0;
  end if;
end $$;
delete from public.product_trend where log2_score is null;
alter table public.product_trend alter column log2_score set not null;
alter table public.product_trend drop column if exists score;
alter table public.product_trend drop column if exists updated_at;

-- Readable for live listings (writes stay with add_listing_demand).
drop policy if exists product_trend_read on public.product_trend;
create policy product_trend_read on public.product_trend for select to anon, authenticated
  using (exists (select 1 from public.products x where x.id = product_trend.product_id and x.status = 'live'));
grant select (product_id, log2_score) on public.product_trend to anon, authenticated;

create or replace function public.add_listing_demand(p uuid, p_weight double precision, p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p is null or not (p_weight > 0) then
    return;
  end if;
  insert into public.product_trend as t (product_id, log2_score)
  values (p, public.demand_log_of(p_weight, p_at))
  on conflict (product_id) do update
     set log2_score = public.demand_log_add(t.log2_score, excluded.log2_score);
end
$function$;

create or replace function public.listing_demand_now(p uuid)
returns double precision
language sql
stable
set search_path = ''
as $function$
  select coalesce((select case when t.log2_score - public.demand_age_halflives(now()) < -1000 then 0
                                else power(2.0, t.log2_score - public.demand_age_halflives(now())) end
                     from public.product_trend t where t.product_id = p), 0);
$function$;

revoke all on function public.add_listing_demand(uuid, double precision, timestamptz) from public, anon, authenticated;
grant execute on function public.demand_age_halflives(timestamptz), public.demand_log_of(double precision, timestamptz),
  public.demand_log_add(double precision, double precision), public.listing_demand_now(uuid) to anon, authenticated;

-- ── Every ranking reads recent demand, set-wise ─────────────────────────────────

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
           -- Recent demand (log2 of the decayed sum, 20261017190000), joined set-wise; only trending orders on it.
           case when v_sort = 'trending' then coalesce(tr.log2_score, '-infinity'::double precision) end as k_score,
           case when p.compare_at_price > p.price_value and p.compare_at_price > 0
                then (p.compare_at_price - p.price_value) / p.compare_at_price end as k_discount
      from public.products p
      join public.vendor_profiles v on v.id = p.vendor_id
      left join public.subscription_plans sp on sp.id = v.plan_id
      left join public.product_trend tr on tr.product_id = p.id
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
             -- No recent demand yet: best-rated first, then newest (not "popular" by default).
             case when v_sort = 'trending' then k.rating_avg end desc nulls last,
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
             case when v_sort = 'trending' then pg.rating_avg end desc nulls last,
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
      left join public.product_trend tr on tr.product_id = pr.id
     where pr.status = 'live' and pr.category_id = any (p_cats)
     order by pr.vendor_id, coalesce(tr.log2_score, '-infinity'::double precision) desc, pr.rating_avg desc nulls last, pr.created_at desc /* recent demand, 20261017190000 */
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
                   row_number() over (partition by pr.vendor_id order by coalesce(tr.log2_score, '-infinity'::double precision) desc, pr.rating_avg desc nulls last, pr.created_at desc) as rn, /* recent demand, 20261017190000 */
                   md5(pr.vendor_id::text || v_day || coalesce(p_session, '')) as turn
              from public.products pr
              left join public.product_trend tr on tr.product_id = pr.id
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

CREATE OR REPLACE FUNCTION public.new_brand_suggestions(p_limit integer DEFAULT 12)
 RETURNS TABLE(vendor_id uuid, brand_name text, city text, is_verified boolean, followers_count integer, logo_url text, live_count integer, top_products jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with me as materialized (
    select (select auth.uid()) as uid
  ),
  recent as (
    select p.id, p.vendor_id, p.created_at
      from public.products p
     where p.status = 'live'
     order by p.created_at desc
     limit 5000
  ),
  sellers as (
    select r.vendor_id, max(r.created_at) as last_pictured_at
      from recent r
     where exists (select 1 from public.product_images i where i.product_id = r.id)
     group by r.vendor_id
  ),
  picked as (
    select s.vendor_id, s.last_pictured_at
      from sellers s, me
     where s.vendor_id is distinct from me.uid
       and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.vendor_id = s.vendor_id)
     order by s.last_pictured_at desc, s.vendor_id
     limit least(greatest(coalesce(p_limit, 12), 1), 24)
  )
  select v.id, v.brand_name, v.city, v.is_verified, v.followers_count, v.logo_url,
         (select count(*)::int from public.products c where c.vendor_id = pk.vendor_id and c.status = 'live') as live_count,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price_value', t.price_value,
                                               'currency', t.currency, 'image', t.image) order by t.ord)
             from (select p.id, p.name, p.price_value, p.currency, img.url as image,
                          row_number() over (order by coalesce(tr.log2_score, '-infinity'::double precision) desc, p.created_at desc, p.id) as ord /* recent demand, 20261017190000 */
                     from public.products p
                     left join public.product_trend tr on tr.product_id = p.id
                     cross join lateral (select i.url from public.product_images i
                                          where i.product_id = p.id order by i.position, i.id limit 1) img
                    where p.vendor_id = pk.vendor_id and p.status = 'live'
                    order by ord
                    limit 2) t), '[]'::jsonb) as top_products
    from picked pk
    join public.vendor_profiles v on v.id = pk.vendor_id
   order by pk.last_pictured_at desc, pk.vendor_id
$function$;

CREATE OR REPLACE FUNCTION public.search_suggestions(q text, max_results integer DEFAULT 5)
 RETURNS TABLE(kind text, label text, ref_id uuid, count_hint integer, verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with n as (select public.normalise_search_query(q) as qn)
  -- Categories that actually contain live products. count_hint is the real
  -- number of listings a buyer will land on, not a fabricated search volume.
  (
    select 'category'::text, c.category_name, c.cid, c.n_products, null::boolean
    from (
      -- min() has no uuid variant; any representative id for the name will do.
      select p.category_name,
             (array_agg(p.category_id order by p.category_id))[1] as cid,
             count(*)::int as n_products
      from public.products p, n
      where p.status = 'live'
        and p.category_name is not null
        and n.qn is not null
        and p.category_name ilike '%' || n.qn || '%'
      group by p.category_name
    ) c
    order by c.n_products desc, c.category_name
    limit max_results
  )
  union all
  -- Individual live listings, most in demand recently first.
  (
    select 'product'::text, p.name, p.id, p.enquiries_count, null::boolean
    from public.products p
    cross join n
    left join public.product_trend tr on tr.product_id = p.id
    where p.status = 'live'
      and n.qn is not null
      and p.name ilike '%' || n.qn || '%'
    order by coalesce(tr.log2_score, '-infinity'::double precision) desc, p.name /* recent demand, 20261017190000 */
    limit max_results
  )
  union all
  -- Real vendor storefronts. count_hint is the real follower count.
  (
    select 'vendor'::text, v.brand_name, v.id, v.followers, v.is_verified
    from (
      select vp.id, vp.brand_name, vp.is_verified,
             (select count(*)::int from public.follows f where f.vendor_id = vp.id) as followers
      from public.vendor_profiles vp, n
      where n.qn is not null
        and vp.brand_name is not null
        and vp.brand_name ilike '%' || n.qn || '%'
    ) v
    order by v.followers desc, v.brand_name
    limit max_results
  );
$function$;

CREATE OR REPLACE FUNCTION public.related_products(p_id uuid, match_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, distance double precision, is_fallback boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with cur as (
    -- The anchor is looked up without a status filter: it is the reference
    -- point, never a result. Only the rows returned below are status-gated.
    select p.embedding, p.category_id from public.products p where p.id = p_id
  ),
  vec as (
    select p.id,
           (p.embedding <=> (select embedding from cur))::double precision as distance,
           false as is_fallback
    from public.products p
    left join public.product_trend tr on tr.product_id = p.id
    where p.status = 'live'
      and p.id <> p_id
      and p.embedding is not null
      and (select embedding from cur) is not null
    order by p.embedding <=> (select embedding from cur),
             coalesce(tr.log2_score, '-infinity'::double precision) desc, p.id
    limit match_count
  ),
  fb as (
    select p.id,
           null::double precision as distance,
           true as is_fallback
    from public.products p
    left join public.product_trend tr on tr.product_id = p.id
    where p.status = 'live'
      and p.id <> p_id
      and (select embedding from cur) is null
      and p.category_id is not null
      and p.category_id = (select category_id from cur)
    order by coalesce(tr.log2_score, '-infinity'::double precision) desc, p.rating_avg desc nulls last, p.created_at desc, p.id
    limit match_count
  )
  select * from vec
  union all
  select * from fb;
$function$;

CREATE OR REPLACE FUNCTION public.for_you_products(p_buyer_id uuid, match_count integer DEFAULT 20)
 RETURNS TABLE(id uuid, distance double precision, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_emb extensions.halfvec(1536);
  v_src text;
  -- Location soft boost (2026-09-23): subtracted from the distance for ORDERING
  -- only. See the header of migration for_you_location_soft_boost.
  c_city_boost  constant double precision := 0.05;
  c_state_boost constant double precision := 0.02;
  v_city  text;
  v_state text;
begin
  -- Same guard as match_vendor_rfqs: a buyer may only ask for their own feed.
  -- Without it any authenticated user could pass someone else's id and read
  -- their taste-ranked catalogue, which is their browsing history by proxy.
  -- auth.uid() is null for service_role, which is how the cron/worker path and
  -- direct SQL verification still work.
  if auth.uid() is not null and p_buyer_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_emb := public.buyer_taste_embedding(p_buyer_id);
  v_src := 'taste';

  if v_emb is null then
    v_emb := public.buyer_cold_start_embedding(p_buyer_id);
    v_src := 'cold_start';
  end if;

  -- The `exists` is not redundant with `v_emb is not null`. A taste vector is
  -- built from the buyer's history, which may point at products that are no
  -- longer live — so a non-null vector does not by itself guarantee there is
  -- anything rankable. Checking here, rather than after the fact, is what keeps
  -- the never-empty guarantee true without relying on FOUND/ROW_COUNT
  -- behaviour after RETURN QUERY.
  if v_emb is not null
     and exists (select 1 from public.products
                  where status = 'live' and embedding is not null) then

    select lower(nullif(trim(b.city), '')), lower(nullif(trim(b.state), ''))
      into v_city, v_state
      from public.buyer_profiles b
     where b.id = p_buyer_id;

    -- No location: the pre-boost query, verbatim. These buyers get exactly the
    -- old result by construction, not because a boost happens to be zero.
    if v_city is null and v_state is null then
      return query
        select p.id,
               (p.embedding <=> v_emb)::double precision,
               v_src
        from public.products p
        left join public.product_trend tr on tr.product_id = p.id
        where p.status = 'live'
          and p.embedding is not null
        -- Bare `<=>` first so products_embedding_idx stays usable; recent demand is a tiebreaker only.
        order by p.embedding <=> v_emb,
                 coalesce(tr.log2_score, '-infinity'::double precision) desc, p.id
        limit match_count;
      return;
    end if;

    -- With a location: the same candidates (the query above, as a CTE, with the
    -- index-served ORDER BY and the same LIMIT), re-sorted by distance minus the
    -- boost. It reorders inside the set and never adds or drops a row.
    return query
      with candidates as (
        select p.id,
               (p.embedding <=> v_emb)::double precision as dist,
               coalesce(tr.log2_score, '-infinity'::double precision) as demand,
               p.vendor_id,
               lower(nullif(trim(split_part(p.location, ',', 1)), '')) as loc_city,
               lower(nullif(trim(split_part(p.location, ',', 2)), '')) as loc_state
        from public.products p
        left join public.product_trend tr on tr.product_id = p.id
        where p.status = 'live'
          and p.embedding is not null
        order by p.embedding <=> v_emb,
                 coalesce(tr.log2_score, '-infinity'::double precision) desc, p.id
        limit match_count
      )
      select c.id, c.dist, v_src
      from candidates c
      left join public.vendor_profiles v on v.id = c.vendor_id
      order by c.dist - case
                 when v_city is not null
                      and coalesce(c.loc_city, lower(nullif(trim(v.city), ''))) = v_city
                   then c_city_boost
                 when v_state is not null
                      and coalesce(c.loc_state, lower(nullif(trim(v.state), ''))) = v_state
                   then c_state_boost
                 else 0
               end,
               c.demand desc, c.id;
    return;
  end if;

  -- Tier 3. Distance is NULL rather than a sentinel number: there is no vector,
  -- so there is no distance, and 0 would read as "perfect match".
  return query
    select p.id,
           null::double precision,
           'popularity'::text
    from public.products p
    left join public.product_trend tr on tr.product_id = p.id
    where p.status = 'live'
    order by coalesce(tr.log2_score, '-infinity'::double precision) desc, p.rating_avg desc nulls last, p.created_at desc, p.id
    limit match_count;
end $function$;

CREATE OR REPLACE FUNCTION public.match_products(query text, query_embedding halfvec DEFAULT NULL::halfvec, match_count integer DEFAULT 40, boost_weight double precision DEFAULT 0.05, max_distance double precision DEFAULT 0.80)
 RETURNS TABLE(id uuid, score double precision, fts_rank integer, vec_rank integer, boost_tier integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with params as (
    select
      nullif(trim(coalesce(query, '')), '')                  as qtext,
      greatest(coalesce(match_count, 40), 40)                as depth,
      60                                                     as rrf_k
  ),
  ts as (
    select websearch_to_tsquery('english', qtext) as tsq
    from params where qtext is not null
  ),
  fts_hits as (
    select s.id, row_number() over () as rank
    from (
      select p.id
      from public.products p
      cross join ts
      left join public.product_trend tr on tr.product_id = p.id
      -- status = 'live' is load-bearing: SECURITY DEFINER bypasses RLS, so this
      -- filter is the only thing keeping draft / under_review / rejected
      -- listings out of buyer search results.
      where p.status = 'live'
        and p.fts @@ ts.tsq
      order by ts_rank(p.fts, ts.tsq) desc, coalesce(tr.log2_score, '-infinity'::double precision) desc, p.id
      limit (select depth from params)
    ) s
  ),
  vec_hits as (
    select s.id, row_number() over () as rank
    from (
      select p.id
      from public.products p
      where p.status = 'live'
        and query_embedding is not null
        and p.embedding is not null
        -- The cutoff. Without it an unrelated query still returns the whole
        -- catalogue, because nearest-neighbour search always has a nearest.
        and (p.embedding <=> query_embedding) < max_distance
      order by p.embedding <=> query_embedding, p.id
      limit (select depth from params)
    ) s
  ),
  fused as (
    select
      coalesce(f.id, v.id) as id,
      coalesce(1.0 / ((select rrf_k from params) + f.rank), 0)
        + coalesce(1.0 / ((select rrf_k from params) + v.rank), 0) as rrf,
      f.rank as fts_rank,
      v.rank as vec_rank
    from fts_hits f
    full outer join vec_hits v on v.id = f.id
  )
  select
    fu.id,
    (fu.rrf * (1 + boost_weight * bt.tier))::double precision as score,
    fu.fts_rank::int,
    fu.vec_rank::int,
    bt.tier::int
  from fused fu
  join public.products p on p.id = fu.id
  left join public.product_trend tr on tr.product_id = p.id
  left join public.vendor_profiles vp on vp.id = p.vendor_id
  left join public.subscription_plans sp on sp.id = vp.plan_id
  cross join lateral (
    select case
      when vp.plan_expires_at is not null and vp.plan_expires_at > now()
      then coalesce((sp.limits ->> 'search_boost_tier')::int, 0)
      else 0
    end as tier
  ) bt
  order by score desc, coalesce(tr.log2_score, '-infinity'::double precision) desc, fu.id
  limit coalesce(match_count, 40);
$function$;

drop function if exists public.listing_trend_score(uuid);

-- Self-checks
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.feed_products(text,integer,integer,uuid[],text,uuid[],boolean,text,uuid[],integer,integer,uuid[])',
    'public.spotlight_listings(uuid,text,integer)', 'admin.featured_candidates(uuid[],text,text,text,uuid)',
    'public.new_brand_suggestions(integer)', 'public.search_suggestions(text,integer)', 'public.related_products(uuid,integer)',
    'public.for_you_products(uuid,integer)', 'public.match_products(text,halfvec,integer,double precision,double precision)'] loop
    -- Any all-time counter inside an ORDER BY / PARTITION BY (with or without a direction), up to its end.
    if pg_get_functiondef(f::regprocedure) ~* '\m(order|partition) by\M(?:(?!\mlimit\M|\mselect\M|\mfrom\M|\mwhere\M|;)[^\n]|\n)*?\m(enquiries_count|views_count|sold_count)\M' then
      raise exception 'self-check: % still orders on an all-time counter', f;
    end if;
    if pg_get_functiondef(f::regprocedure) !~ 'product_trend tr on tr.product_id' then
      raise exception 'self-check: % does not read recent demand', f;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'product_trend'
              and column_name in ('score', 'updated_at')) then
    raise exception 'self-check: old product_trend columns left';
  end if;
  if not has_column_privilege('anon', 'public.product_trend', 'log2_score', 'select')
     or exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['insert', 'update', 'delete', 'truncate']) pv
                 where has_table_privilege(r, 'public.product_trend', pv)) then
    raise exception 'self-check: product_trend grants are wrong';
  end if;
  -- SQL functions don't depend on what they call, so dropping listing_trend_score can't fail on a caller left behind.
  if exists (select 1 from pg_proc where prosrc ~ 'listing_trend_score') then
    raise exception 'self-check: a function still calls listing_trend_score';
  end if;
  if has_function_privilege('authenticated', 'public.add_listing_demand(uuid,double precision,timestamp with time zone)', 'execute') then
    raise exception 'self-check: clients can add demand';
  end if;
  -- Adding to a score ~20+ years older keeps the newer one (no underflow error).
  if public.demand_log_add(0, 2000) <> 2000 or public.demand_log_add(2000, 0) <> 2000 then
    raise exception 'self-check: demand addition underflows';
  end if;
  -- log-sum-exp keeps the sum: 3 + 5 = 8 in today's units.
  if abs(public.demand_log_add(public.demand_log_of(3, now()), public.demand_log_of(5, now())) - public.demand_log_of(8, now())) > 1e-9 then
    raise exception 'self-check: demand addition is wrong';
  end if;
end $$;
