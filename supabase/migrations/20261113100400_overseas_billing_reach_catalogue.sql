-- Vendor registration, part 5 (Mitra, 2026-11-13):
--   1 The Free plan keeps one PDF catalogue on its store ("1 pdf upload should be allowed in the free plan").
--   2 A seller outside India is billed IGST: no Indian place of supply ("allow, bill as GST"). CA to confirm (ToDo).
--   3 Trade buyers (Exporter, Importer, Wholesaler, Distributor, Corporate) see approved international sellers a
--     little higher: trending's demand score +1.0 (as if their demand were doubled) after the paid-tier order, and
--     search's score ×1.10 after RRF and the paid boost. A signed-out visitor and any other buyer get byte-identical
--     results (scripts/onboarding/reach.sql holds the md5 baselines).
--   4 feed_products gains p_supplier ('india' | 'international') and returns vendor_country_code for the
--     "International supplier" label. Its parameter list changes, so the old signature is dropped in the same
--     transaction (an added parameter would overload it, and PostgREST would refuse the ambiguous call).
--
-- Pre-checks stop the file if a function it patches isn't the version it was written against.

do $pin$
declare
  v_pins text[][] := array[
    ['public.subscription_fulfil(text,text,text)', '7ebe424316529e351774ccffb352585a'],
    ['public.enforce_catalogue_plan()', '8b24c7e06f3a5f7f5b342d371eacabbc'],
    ['public.match_products(text,halfvec,integer,double precision,double precision)', 'bd36f29ba1aafb13ebf4401399f4ccb1'],
    ['public.feed_products(text,integer,integer,uuid[],text,uuid[],boolean,text,uuid[],integer,integer,uuid[])',
     'ba9a37d0bb41c8a6e2aee76d5f9cd914']];
  v_i int;
begin
  for v_i in 1 .. array_length(v_pins, 1) loop
    if md5(replace((select p.prosrc from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure), chr(13), '')) <> v_pins[v_i][2] then
      raise exception 'pre-check: % is not the version this migration was written against', v_pins[v_i][1];
    end if;
  end loop;
end
$pin$;

-- Replace exactly one occurrence of p_old in a function's definition, or stop.
create or replace function pg_temp.patch(p_fn text, p_old text, p_new text) returns void
language plpgsql as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn::regprocedure), chr(13), '');
begin
  if (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 then
    raise exception 'patch: % does not contain exactly one copy of: %', p_fn, left(p_old, 80);
  end if;
  execute replace(v_def, p_old, p_new);
end $$;

-- ── 1. Free: one catalogue ───────────────────────────────────────────────────
select pg_temp.patch('public.enforce_catalogue_plan()',
$old$  if not coalesce(allowed, false) then
    raise exception$old$,
$new$  if not coalesce(allowed, false) then
    -- A plan without automatic catalogues may keep limits.catalogues_max of them (Free: 1, Mitra 2026-11-13),
    -- counted under the seller's own lock.
    perform pg_advisory_xact_lock(hashtextextended('cosora.catalogue_cap:' || new.vendor_id::text, 0));
    if coalesce((select (sp.limits ->> 'catalogues_max')::int from public.subscription_plans sp where sp.id = eff_plan), 0)
       > (select count(*) from public.catalogues c
           where c.vendor_id = new.vendor_id and c.status::text in ('draft', 'under_review', 'live')
             and c.id is distinct from new.id) then
      return new;
    end if;
    if eff_plan = 'free' then
      raise exception 'The Free plan includes 1 PDF catalogue. Upgrade to Basic or above to add more.'
        using errcode = 'P0001';
    end if;
    raise exception$new$);

-- ── 2. Overseas sellers: IGST, no Indian place of supply ─────────────────────
select pg_temp.patch('public.subscription_fulfil(text,text,text)',
$old$         v.state_code, v.postal_code, v.gstin
    into vp$old$,
$new$         v.state_code, v.postal_code, v.gstin, v.country, v.country_code
    into vp$new$);
select pg_temp.patch('public.subscription_fulfil(text,text,text)',
$old$  v_supply := case when not v_has_entity or v_pos is null or v_pos = v_entity.state_code then 'intra' else 'inter' end;
$old$,
$new$  v_supply := case when not v_has_entity or v_pos is null or v_pos = v_entity.state_code then 'intra' else 'inter' end;
  -- A seller outside India (Mitra, 2026-11-13: bill as GST): no Indian place of supply, so IGST.
  if vp.country_code is not null and vp.country_code <> 'IN' then
    v_pos := null;
    v_supply := 'inter';
  end if;
$new$);
select pg_temp.patch('public.subscription_fulfil(text,text,text)',
$old$'postal_code', vp.postal_code, 'gstin', v_rec_gstin, 'email', vp.owner_email);$old$,
$new$'postal_code', vp.postal_code, 'gstin', v_rec_gstin, 'email', vp.owner_email,
    'country', vp.country, 'country_code', coalesce(vp.country_code, 'IN'));$new$);

-- ── 3. Who counts as a trade buyer ───────────────────────────────────────────
create or replace function admin.viewer_trade_buyer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select bp.business_type in ('Exporter', 'Importer', 'Wholesaler', 'Distributor', 'Corporate')
                     from public.buyer_profiles bp where bp.id = auth.uid()), false)
$function$;
revoke all on function admin.viewer_trade_buyer() from public, anon, authenticated;

select pg_temp.patch('public.match_products(text,halfvec,integer,double precision,double precision)',
$old$(fu.rrf * (1 + boost_weight * bt.tier))::double precision as score$old$,
$new$(fu.rrf * (1 + boost_weight * bt.tier)
     -- Trade buyers: approved international sellers ×1.10 (Mitra, 2026-11-13). Read once per query.
     * case when (select admin.viewer_trade_buyer()) and vp.onboarding_complete and vp.country_code <> 'IN'
            then 1.10 else 1 end)::double precision as score$new$);

-- ── 4. feed_products: the supplier filter, the country, the trending lift ────
drop function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[]);

create function public.feed_products(p_sort text default 'newest', p_limit integer default 24, p_offset integer default 0,
  p_category_ids uuid[] default null, p_gender text default null, p_vendor_ids uuid[] default null,
  p_on_sale boolean default false, p_query text default null, p_exclude_ids uuid[] default null,
  p_discount_above integer default null, p_discount_upto integer default null, p_ids uuid[] default null,
  p_supplier text default null)
returns table (id uuid, vendor_id uuid, name text, price_value numeric, currency text, compare_at_price numeric, moq text,
  fabric text, gsm text, fit_type text, gender text, rating_avg numeric, enquiries_count integer, sold_count integer,
  views_count integer, location text, category_id uuid, category_name text, images text[], created_at timestamptz,
  brand_name text, vendor_city text, is_verified boolean, plan_id text, plan_expires_at timestamptz,
  ad_verified_until timestamptz, boost integer, vendor_country_code text)
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
  -- Trade buyers lift approved international sellers on trending (Mitra, 2026-11-13); read once.
  v_trade  boolean := v_sort = 'trending' and admin.viewer_trade_buyer();
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

  return query
  with keyed as (
    -- Only what the sort needs, for every matching live listing.
    select p.id, p.created_at, p.price_value, p.rating_avg,
           case when v.plan_expires_at > now()
                then coalesce((sp.limits ->> 'search_boost_tier')::integer, 0) else 0 end as k_boost,
           -- Recent demand (log2 of the decayed sum, 20261017190000), joined set-wise; only trending orders on it.
           case when v_sort = 'trending' then coalesce(tr.log2_score, '-infinity'::double precision)
                  + case when v_trade and v.onboarding_complete and v.country_code <> 'IN' then 1.0 else 0 end end as k_score,
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
       -- As a subquery: an OR over the joined vendor's columns spoiled the top-N plan for every caller
       -- (newest went from ~190 ms to ~900 ms over 10,000 listings in scripts/feeds/harness.sql).
       and (p_supplier is null or p.vendor_id in (
             select s.id from public.vendor_profiles s
              where (p_supplier = 'india' and coalesce(s.country_code, 'IN') = 'IN')
                 or (p_supplier = 'international' and s.onboarding_complete and s.country_code <> 'IN')))
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
         pg.k_boost, v.country_code
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
revoke all on function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[], text)
  from public;
grant execute on function public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[], text)
  to anon, authenticated, service_role;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from pg_proc where proname = 'feed_products' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'self-check: feed_products must have exactly one signature';
  end if;
  if not has_function_privilege('anon', 'public.feed_products(text, integer, integer, uuid[], text, uuid[], boolean, text, uuid[], integer, integer, uuid[], text)', 'EXECUTE') then
    raise exception 'self-check: visitors must be able to read the feed';
  end if;
  if has_function_privilege('anon', 'admin.viewer_trade_buyer()', 'EXECUTE') then
    raise exception 'self-check: viewer_trade_buyer is internal';
  end if;
  -- The feed still lists live listings only.
  if exists (select 1 from public.feed_products('newest', 96, 0) f join public.products p on p.id = f.id where p.status <> 'live') then
    raise exception 'self-check: feed_products returned a listing that is not live';
  end if;
end
$check$;
