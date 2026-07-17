-- ─────────────────────────────────────────────────────────────
-- Real, anonymized category benchmarks for the Advertise → "Competitor Ads"
-- page (which previously showed fully fabricated named competitors + stats).
--
-- Computed from actual data (live products, vendor_profiles, product_images,
-- advertisements) for the categories the vendor sells in. Aggregated across all
-- peers so no single competitor is identifiable — no names, no invented numbers.
-- Self/admin-guarded (a vendor sees only their own benchmark view).
-- ─────────────────────────────────────────────────────────────
create or replace function public.ad_category_benchmarks(v uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  vid           uuid := coalesce(v, auth.uid());
  vcats         uuid[];
  cats          jsonb;
  peers         uuid[];
  your_reviews  int := 0;
  peer_reviews  numeric := 0;
  your_photos   int := 0;
  peer_photos   numeric := 0;
  active_cnt    int := 0;
begin
  if vid is null then return null; end if;
  if not (vid = auth.uid() or public.is_admin()) then return null; end if;

  select array_agg(distinct category_id) into vcats
    from public.products where vendor_id = vid and category_id is not null;

  if vcats is null then
    return jsonb_build_object('has_data', false, 'categories', '[]'::jsonb);
  end if;

  -- Per-category aggregates over LIVE products (all vendors), anonymized.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into cats
  from (
    select c.id as category_id, c.name as category_name,
           count(p.id)::int as product_count,
           count(distinct p.vendor_id)::int as vendor_count,
           coalesce(round(avg(p.price_value)), 0)::int as avg_price,
           coalesce(round(avg(p.views_count)), 0)::int as avg_views,
           count(p.id) filter (where p.vendor_id = vid)::int as your_products
    from public.categories c
    join public.products p on p.category_id = c.id and p.status = 'live'
    where c.id = any(vcats)
    group by c.id, c.name
    order by product_count desc
  ) t;

  -- Peer vendors (exclude self) with live products in these categories.
  select array_agg(distinct vendor_id) into peers
    from public.products
   where category_id = any(vcats) and status = 'live' and vendor_id <> vid;

  select coalesce(reviews_count, 0) into your_reviews
    from public.vendor_profiles where id = vid;
  if peers is not null then
    select coalesce(round(avg(coalesce(reviews_count, 0)), 1), 0) into peer_reviews
      from public.vendor_profiles where id = any(peers);
  end if;

  select count(*) into your_photos
    from public.product_images pi
    join public.products p on p.id = pi.product_id
   where p.vendor_id = vid;
  if peers is not null then
    select coalesce(round(avg(cnt), 1), 0) into peer_photos from (
      select count(pi.id) as cnt
        from public.products p
        left join public.product_images pi on pi.product_id = p.id
       where p.vendor_id = any(peers)
       group by p.vendor_id
    ) x;
  end if;

  select count(*) into active_cnt
    from public.advertisements a
    join public.products p on p.id = a.product_id
   where a.status = 'active' and (a.ends_at is null or a.ends_at > now())
     and p.category_id = any(vcats);

  return jsonb_build_object(
    'has_data', true,
    'categories', cats,
    'reviews', jsonb_build_object('yours', your_reviews, 'peer_avg', peer_reviews),
    'photos', jsonb_build_object('yours', your_photos, 'peer_avg', peer_photos),
    'active_ads_in_categories', active_cnt,
    'peer_vendor_count', coalesce(array_length(peers, 1), 0)
  );
end;
$$;

grant execute on function public.ad_category_benchmarks(uuid) to anon, authenticated, service_role;
