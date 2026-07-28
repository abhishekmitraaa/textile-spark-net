-- `order by a.created_at desc` alone is not a total order: advertisements
-- created in the same statement share an identical created_at (two of the
-- pre-existing seed rows already tie at 2026-07-05 07:33:15.879125+00). With
-- ties, Postgres may return them in a different order per call, so two
-- queries with different max_count can return overlapping windows.
--
-- The buyer home serves SponsoredRail from the first N rows and Brand Picks
-- from the rows after N, so a non-deterministic order made the same ad appear
-- in both rails and double-count its impression. Adding a.id as a tiebreaker
-- makes the ordering total and the split reliable.
--
-- Only the ORDER BY changes; columns, joins and filters are identical to
-- 20260727185837_add_category_name_to_active_ads.
create or replace function public.active_ads(max_count integer default 12, filter_category uuid default null::uuid)
returns table(
  ad_id uuid, product_id uuid, title text, placement text,
  product_name text, price_value numeric, currency text,
  image_url text, vendor_id uuid, vendor_name text,
  category_name text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name,
         c.name
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  left join public.categories c on c.id = p.category_id
  where a.status = 'active'
    and (a.ends_at is null or a.ends_at > now())
    and (
      filter_category is null
      or a.target_categories is null
      or jsonb_array_length(a.target_categories) = 0
      or a.target_categories ? filter_category::text
    )
  order by a.created_at desc, a.id desc
  limit greatest(1, max_count);
$function$;
