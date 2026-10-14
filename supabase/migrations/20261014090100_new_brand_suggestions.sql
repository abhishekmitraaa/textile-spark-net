-- "Looking for New Brands?" is chosen by the database (2026-10-14).
--
-- Mitra: the carousel "is not showing products of all the vendors it's displaying". Two causes,
-- both in the browser: every seller account became a slide, with or without a live listing; and
-- the page downloaded EVERY seller and EVERY live listing to pick from, which PostgREST cuts at
-- 1,000 rows, so past that a seller (even one the buyer follows) silently disappeared. The local
-- stack, at 1,313 sellers, showed it.
--
--   public.new_brand_suggestions(p_limit default 12, at most 24)
--     Sellers with at least one live listing that has a picture, that the caller doesn't follow
--     and isn't, newest live listing first (active sellers surface, not only the most followed).
--     Each with its two most enquired-about live listings that have a picture, and its picture.
--     SECURITY INVOKER: products, pictures and follows are read under the caller's own RLS, so
--     it can return nothing a browser can't already read. Signed-out visitors get suggestions too.
--
--   Cost is bounded, not proportional to the catalogue: it walks only the newest 5,000 live
--   listings (products_live_recent_idx) to find sellers, then counts and picks listings for the
--   12 it returns (products_live_vendor_recent_idx). A seller with no live listing among the newest
--   5,000 isn't suggested; suggestions are newest-active-first anyway. Measured on the local stack
--   with 20,000 synthetic live listings from 1,000 sellers: see documentation/test.md (2026-10-14).
--
--   products_live_recent_idx          (created_at desc) where status = 'live'
--   products_live_vendor_recent_idx   (vendor_id, created_at desc) where status = 'live'
--
-- No DROP and no DELETE in this file.

create index if not exists products_live_recent_idx
  on public.products (created_at desc) where status = 'live';
create index if not exists products_live_vendor_recent_idx
  on public.products (vendor_id, created_at desc) where status = 'live';

create or replace function public.new_brand_suggestions(p_limit integer default 12)
returns table (
  vendor_id uuid,
  brand_name text,
  city text,
  is_verified boolean,
  followers_count integer,
  logo_url text,
  live_count integer,
  top_products jsonb)
language sql
stable
security invoker
set search_path = ''
as $function$
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
                          row_number() over (order by coalesce(p.enquiries_count, 0) desc, p.created_at desc, p.id) as ord
                     from public.products p
                     cross join lateral (select i.url from public.product_images i
                                          where i.product_id = p.id order by i.position, i.id limit 1) img
                    where p.vendor_id = pk.vendor_id and p.status = 'live'
                    order by ord
                    limit 2) t), '[]'::jsonb) as top_products
    from picked pk
    join public.vendor_profiles v on v.id = pk.vendor_id
   order by pk.last_pictured_at desc, pk.vendor_id
$function$;

revoke all on function public.new_brand_suggestions(integer) from public;
grant execute on function public.new_brand_suggestions(integer) to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if (select p.prosecdef from pg_proc p where p.oid = 'public.new_brand_suggestions(integer)'::regprocedure) then
    raise exception 'self-check: new_brand_suggestions must be SECURITY INVOKER (it relies on the caller''s RLS)';
  end if;
  if not has_function_privilege('anon', 'public.new_brand_suggestions(integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.new_brand_suggestions(integer)', 'EXECUTE') then
    raise exception 'self-check: new_brand_suggestions grants are wrong';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'public'
        and indexname in ('products_live_recent_idx', 'products_live_vendor_recent_idx')) <> 2 then
    raise exception 'self-check: an index of new_brand_suggestions is missing';
  end if;
  if (select count(*) from public.new_brand_suggestions(100)) > 24 then
    raise exception 'self-check: new_brand_suggestions returns more than 24 sellers';
  end if;
end
$check$;
