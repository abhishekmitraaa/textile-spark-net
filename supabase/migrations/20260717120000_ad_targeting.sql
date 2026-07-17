-- ─────────────────────────────────────────────────────────────
-- Make ad targeting real (was fully decorative).
--
-- Vendor-side selection is now persisted on the campaign row:
--   target_categories jsonb  – array of categories.id (text) the ad targets
--   target_cities     jsonb  – array of city keys (plan-scope-limited)
-- (Gender targeting is dropped — no buyer-side gender signal exists, so it
--  would have been decorative; we don't ship fake targeting knobs.)
--
-- Buyer-side, category is the one dimension with a real signal today: a viewed
-- product's category. active_ads() gains an optional category filter — untargeted
-- ads (no target_categories) still show everywhere; category-targeted ads only
-- surface where that category is the context. Location has no buyer geo-signal
-- yet, so target_cities is recorded + plan-limited but not used to filter
-- delivery (stated honestly in the app + summary).
-- ─────────────────────────────────────────────────────────────

alter table public.advertisements
  add column if not exists target_categories jsonb,
  add column if not exists target_cities     jsonb;

-- Rebuild active_ads with an optional category filter. Same return shape.
drop function if exists public.active_ads(integer);
create or replace function public.active_ads(max_count integer default 12, filter_category uuid default null)
returns table(ad_id uuid, product_id uuid, title text, placement text, product_name text,
              price_value numeric, currency text, image_url text, vendor_id uuid, vendor_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  where a.status = 'active'
    and (a.ends_at is null or a.ends_at > now())
    -- No filter → all active ads. With a category filter, show untargeted ads
    -- (they run everywhere) plus ads explicitly targeting that category.
    and (
      filter_category is null
      or a.target_categories is null
      or jsonb_array_length(a.target_categories) = 0
      or a.target_categories ? filter_category::text
    )
  order by a.created_at desc
  limit greatest(1, max_count);
$$;

grant execute on function public.active_ads(integer, uuid) to anon, authenticated, service_role;
