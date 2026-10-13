-- Ads join semantic search (2026-10-13; ToDo "Decide whether ads should join the
-- semantic-search embedding pipeline", Advertising v3 Phase 11).
--
-- Until now a sponsored card on the search results page was chosen by set membership: the
-- page resolved the search to one category by name, and active_ads() served campaigns
-- targeting that category. An ad for jeans could not answer "denim trousers" unless both
-- happened to resolve to the same taxonomy row.
--
-- An ad promotes a product, and every live product already has an embedding (the same
-- halfvec(1536) match_products() ranks organic results on). So an ad needs no embedding of
-- its own, no new queue and no new OpenAI call: search_ads() compares the search's cached
-- query embedding with the promoted product's embedding.
--
--   semantic   the product is within max_distance of the query. These come first, nearest
--              first. The campaign's category targeting is not asked: the vendor targeted a
--              category to reach searches like this one.
--   category   everything active_ads() would have served for the page's category context.
--              These fill what is left, in active_ads()'s own order.
--
-- What does not change:
--   * who may be shown an ad at all: is_ad_eligible() decides status, dates, the vendor's
--     standing and WHERE the viewer is (state, country, city). Semantic matching never
--     widens location targeting;
--   * a search with no cached embedding (keyword-only search, or OpenAI unavailable) gets
--     exactly active_ads()'s rows in exactly its order. The self-check below proves it;
--   * no bid, no price in the ranking. Distance decides, then the 72-hour bump, then recency;
--   * the query embedding never leaves the database, as with search_products().
--
-- max_distance is 0.60, tighter than organic search's 0.80. Measured on this catalogue
-- (2026-09-09): a real query's nearest listings sit at 0.30 to 0.52 and gibberish at 0.83.
-- A paid card that is only loosely related is worse than the category fallback, so the paid
-- cutoff sits just above the relevant band. Re-measure both as the catalogue grows.

create or replace function public.search_ads(
  query             text,
  max_count         integer default 12,
  filter_placements text[]  default null,
  filter_categories uuid[]  default null,
  max_distance      double precision default 0.60
)
returns table (
  ad_id uuid, product_id uuid, title text, placement text, product_name text,
  price_value numeric, currency text, image_url text, vendor_id uuid, vendor_name text,
  category_name text, is_bumped boolean, matched_by text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with cached as materialized (
    -- One row or none. MATERIALIZED so the vector is read once, not once per ad.
    select e.embedding
      from public.search_query_embeddings e
     where e.query_norm = public.normalise_search_query(query)
  ), candidates as (
    select a.id as ad_id, a.product_id, a.title, a.placement, a.created_at,
           p.name as product_name, p.price_value, p.currency,
           coalesce(a.image_url, (select url from public.product_images pi
                                   where pi.product_id = p.id order by position limit 1)) as image_url,
           a.vendor_id, vp.brand_name as vendor_name, c.name as category_name,
           public.ad_is_bumped(a) as is_bumped,
           -- Null when the search has no embedding or the product has none: then only the
           -- category rule can admit the ad.
           (p.embedding <=> (select embedding from cached)) as distance,
           public.ad_targeting_matches(
             a, nullif(coalesce(filter_categories, array[]::uuid[]), array[]::uuid[]),
             v.city, v.state_code, v.country_code) as category_ok
      from public.advertisements a
      join public.products p on p.id = a.product_id and p.status = 'live'
      left join public.vendor_profiles vp on vp.id = a.vendor_id
      left join public.categories c on c.id = p.category_id
      -- Where the viewer is, read once: no row for a signed-out viewer or one with no buyer profile.
      left join (select * from public.ad_viewer_location()) v on true
     -- Status, dates, the vendor's standing and the viewer's location. No category context
     -- here: the two rules below decide relevance.
     where public.is_ad_eligible(a, null::uuid[], v.city, v.state_code, v.country_code)
       and (
         filter_placements is null
         or exists (
           select 1 from unnest(filter_placements) fp
            where (',' || replace(coalesce(a.placement, ''), ' ', '') || ',')
                  like ('%,' || fp || ',%')
         )
       )
  ), matched as (
    select cd.*,
           case when cd.distance is not null and cd.distance <= max_distance then 'semantic'
                when cd.category_ok then 'category'
           end as matched_by
      from candidates cd
  )
  select m.ad_id, m.product_id, m.title, m.placement, m.product_name, m.price_value, m.currency,
         m.image_url, m.vendor_id, m.vendor_name, m.category_name, m.is_bumped, m.matched_by
    from matched m
   where m.matched_by is not null
   order by (m.matched_by = 'semantic') desc,
            case when m.matched_by = 'semantic' then m.distance end asc,
            m.is_bumped desc, m.created_at desc, m.ad_id desc
   limit greatest(1, max_count);
$function$;

comment on function public.search_ads(text, integer, text[], uuid[], double precision) is
  'Sponsored cards for a search. Campaigns whose promoted product is within max_distance of the search''s cached query embedding come first (matched_by semantic), then what active_ads() would serve for the category context (matched_by category). Eligibility and location targeting are is_ad_eligible()''s. With no cached embedding it returns active_ads()''s rows in its order.';

-- The same callers as active_ads(): the rails render for signed-out visitors too.
revoke all on function public.search_ads(text, integer, text[], uuid[], double precision) from public;
grant execute on function public.search_ads(text, integer, text[], uuid[], double precision)
  to anon, authenticated, service_role;

-- Self-check: with a query nobody has searched (so no cached embedding), search_ads() is
-- active_ads(), row for row and in order, for every placement filter in use.
do $check$
declare
  probe constant text := 'self-check ' || gen_random_uuid()::text;
  f text[];
  a text;
  b text;
begin
  if has_function_privilege('anon', 'public.search_ads(text, integer, text[], uuid[], double precision)', 'EXECUTE') is not true then
    raise exception 'self-check: signed-out visitors can''t call search_ads()';
  end if;
  foreach f slice 1 in array array[array['searchListing', 'featuredProduct'], array['openListing', 'brandAd']]::text[][] loop
    select coalesce(string_agg(x.ad_id::text, ',' order by x.n), '') into a
      from (select s.ad_id, row_number() over () as n
              from public.search_ads(probe, 50, f, null) s) x;
    select coalesce(string_agg(x.ad_id::text, ',' order by x.n), '') into b
      from (select s.ad_id, row_number() over () as n
              from public.active_ads(50, null, f, null) s) x;
    if a is distinct from b then
      raise exception 'self-check: with no query embedding search_ads() must equal active_ads() (placements %)', f;
    end if;
  end loop;
end
$check$;
