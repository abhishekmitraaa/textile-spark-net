-- Phase 3.3 (continued) — a page can have MORE THAN ONE category context.
--
-- active_ads() took a single `filter_category uuid`, which is right for the
-- product page (one product, one category) and wrong for For You, where the
-- context is the buyer's stored preferences — a SET of categories, each of
-- which maps to several categories.id values (PrefCategoryMap). Passing only
-- the first would have been quietly wrong: a buyer who picked three interests
-- would have been targeted on one of them, with nothing saying so.
--
-- `filter_category` is kept so existing single-category call sites (ProductDetail,
-- Trends) are untouched. The two are UNIONed, not intersected: they are both
-- "context the viewer is in", and an ad matching any of it matches.
--
-- Every function whose signature changes is DROPPED first. `create or replace`
-- with a changed parameter type overloads rather than replaces, and the call
-- then resolves to neither (42725).

drop function if exists public.active_ads(integer, uuid, text[]);
drop function if exists public.is_ad_eligible(public.advertisements, uuid, text);
drop function if exists public.ad_targeting_matches(public.advertisements, uuid, text);

create or replace function public.ad_targeting_matches(
  a public.advertisements, p_categories uuid[], p_city text
) returns boolean language sql stable set search_path to 'public'
as $$
  select
    -- CATEGORY. An ad with no target_categories is untargeted and matches any
    -- context. A targeted ad matches when its list overlaps the viewer's
    -- context. No context at all (null/empty) cannot exclude anything.
    (
      p_categories is null
      or cardinality(p_categories) = 0
      or a.target_categories is null
      or jsonb_typeof(a.target_categories) <> 'array'
      or jsonb_array_length(a.target_categories) = 0
      or exists (
        select 1 from unnest(p_categories) pc
        where a.target_categories ? pc::text
      )
    )
    and
    -- CITY. Fails CLOSED, deliberately: "target Mumbai" cannot honestly be
    -- honoured for a viewer whose city is unknown. Untargeted ads unaffected.
    (
      a.target_cities is null
      or jsonb_typeof(a.target_cities) <> 'array'
      or jsonb_array_length(a.target_cities) = 0
      or (p_city is not null and a.target_cities ? p_city)
    );
$$;

create or replace function public.is_ad_eligible(
  a public.advertisements, p_categories uuid[] default null, p_city text default null
) returns boolean language sql stable set search_path to 'public'
as $$
  select a.status = 'active'
     and (a.starts_at is null or a.starts_at <= now())
     and (a.ends_at   is null or a.ends_at   >  now())
     and public.vendor_account_in_good_standing(a.vendor_id)
     and public.ad_targeting_matches(a, p_categories, p_city);
$$;

create or replace function public.active_ads(
  max_count         integer  default 12,
  filter_category   uuid     default null,
  filter_placements text[]   default null,
  filter_categories uuid[]   default null
)
returns table(ad_id uuid, product_id uuid, title text, placement text,
              product_name text, price_value numeric, currency text,
              image_url text, vendor_id uuid, vendor_name text, category_name text)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi
                                 where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name,
         c.name
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  left join public.categories c on c.id = p.category_id
  where public.is_ad_eligible(
          a,
          -- UNION of both context parameters, nulls stripped. array_remove
          -- matters: array[null]::uuid[] has cardinality 1, so without it a
          -- call passing neither parameter would look like "context exists,
          -- and nothing matches it" and serve zero ads.
          nullif(array_remove(
            coalesce(filter_categories, array[]::uuid[]) || filter_category,
            null), array[]::uuid[]),
          public.ad_viewer_city())
    and (
      filter_placements is null
      or exists (
        select 1 from unnest(filter_placements) fp
        where (',' || replace(coalesce(a.placement, ''), ' ', '') || ',')
              like ('%,' || fp || ',%')
      )
    )
  order by a.created_at desc, a.id desc
  limit greatest(1, max_count);
$$;

revoke all on function public.active_ads(integer, uuid, text[], uuid[]) from public;
grant execute on function public.active_ads(integer, uuid, text[], uuid[])
  to anon, authenticated, service_role;
