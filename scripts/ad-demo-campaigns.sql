-- Demo ad campaigns — one per placed ad type, so every Phase 5 slot has
-- inventory to render and the placement plan can be seen working end to end.
--
-- WHAT IS AND IS NOT FABRICATED HERE.
--   * The PRODUCTS are real rows from `products` (status = 'live'), with real
--     names, prices, categories and images. Nothing invented.
--   * The VENDORS are real `vendor_profiles` rows.
--   * The CAMPAIGNS are seeded: no money changed hands and there is no
--     `ad_orders` row. That is the only fictional part, and it is why every
--     title carries a `[demo]` suffix — which the vendor dashboard and the
--     admin panel both display.
--
-- They are NOT inserted directly as 'active'. Each one goes through the real
-- pipeline exactly as a paid campaign does:
--   1. inserted as service_role requesting status='active', which
--      guard_ad_activation redirects to 'pending_review' on INSERT;
--   2. approved through approve_ad_campaign() acting as demo-admin, which
--      writes the ad_review_log row, notifies the vendor, and grants any trust
--      seal the campaign's placements carry.
-- So the seed also exercises the review path rather than going around it.
--
-- Two campaigns are deliberately left in non-live states so the admin queue and
-- the scheduled state are demonstrable: one stays `pending_review`, one is
-- approved with a future start date and lands on `scheduled`.
--
-- Website Banner and Mobile Banner are intentionally absent: that slot has no
-- banner creative model yet (there is no banner table), so a campaign for them
-- would render as an ordinary card and misrepresent the product. See ToDo.md.
--
-- Remove everything this creates with scripts/ad-demo-campaigns-cleanup.sql.

begin;

-- Insert with NO jwt claims set, so public.is_admin() is false and
-- guard_ad_activation redirects each row to 'pending_review' — the same path a
-- real payment takes.
select set_config('request.jwt.claims', null, true);

insert into public.advertisements
  (vendor_id, product_id, title, image_url, daily_budget, placement, status,
   starts_at, ends_at, target_categories, target_cities)
select
  p.vendor_id, p.id, p.name || ' — ' || s.label || ' [demo]',
  (select url from public.product_images pi where pi.product_id = p.id order by position limit 1),
  s.budget, s.placement, 'active',
  now() + s.starts_offset, now() + s.ends_offset,
  s.target_categories, null
from (values
  -- product name                  | placement                          | label                      | budget | starts            | ends               | target
  ('Premium Cotton Polo',            'openListing',                       'Open Listing',               22,  interval '-1 day',  interval '30 days', null::jsonb),
  ('Oversized Graphic Tee',          'openListing,featuredProduct',       'Open Listing + Featured',    77,  interval '-1 day',  interval '30 days', null::jsonb),
  ('Floral Wrap Midi Dress',         'featuredProduct',                   'Featured Product',           55,  interval '-1 day',  interval '30 days', null::jsonb),
  -- Targeted at the real "Jeans" taxonomy row, which is what the Trends
  -- "Denim" chip resolves to. Demonstrates category targeting actually biting.
  ('Slim Fit Stretch Jeans',         'featuredProduct',                   'Featured Product',           55,  interval '-1 day',  interval '30 days',
     (select jsonb_build_array(id::text) from public.categories where name = 'Jeans' limit 1)),
  ('Quilted Puffer Jacket',          'wholesalerPick',                    'Wholesaler Pick',            59,  interval '-1 day',  interval '30 days', null),
  ('Chikankari Anarkali',            'storePromotion',                    'Store Promotion',            99,  interval '-1 day',  interval '30 days', null),
  ('Canvas Sneakers',                'brandAd',                           'Brand Ad',                   69,  interval '-1 day',  interval '30 days', null),
  ('Gauze Co-ord Set',               'storePromotion,brandAd',            'Store Promotion + Brand',   168,  interval '-1 day',  interval '30 days', null),
  -- Carries a trust seal, granted by approve_ad_campaign() and NOT by payment.
  ('Linen Camp Shirt',               'openListing,trustedSeal',           'Open Listing + Seal',        66,  interval '-1 day',  interval '30 days', null),
  ('Ribbed Tank Top',                'openListing',                       'Open Listing',               22,  interval '-1 day',  interval '30 days',
     (select jsonb_build_array(id::text) from public.categories where name = 'T-shirts/Tops' limit 1)),
  -- Approved but starts in five days -> lands on 'scheduled', must not deliver.
  ('Cotton Track Pants',             'openListing',                       'Open Listing',               22,  interval '5 days',  interval '35 days', null),
  -- Left in the review queue on purpose, so the admin Review tab is not empty.
  ('Women''s Casual Kurta Set',      'openListing,featuredProduct',       'Open Listing + Featured',    77,  interval '-1 day',  interval '30 days', null),
  -- Every ad type Cosora sells that has NO buyer-side placement, on one
  -- campaign. It will be approved and will render NOWHERE. That is the point:
  -- it makes the build-or-retire gap concrete instead of theoretical.
  ('Leather Belt',
     'searchListing,directBroadcast,webMobileCombo,fbInsta,googleProduct,socialCombo,verifiedCertificate',
     'Unplaced types', 495, interval '-1 day', interval '30 days', null)
) as s(product_name, placement, label, budget, starts_offset, ends_offset, target_categories)
join lateral (
  select id, name, vendor_id from public.products
   where name = s.product_name and status = 'live' limit 1
) p on true;

-- Approve everything except the one campaign that stays in the queue.
-- Acting as demo-admin (super_admin) so approve_ad_campaign()'s own
-- authorization check is exercised rather than bypassed.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text,
  true);

do $$
declare r record;
begin
  for r in
    select id from public.advertisements
     where title like '%[demo]'
       and status = 'pending_review'
       and title not like 'Women''s Casual Kurta Set%'
     order by created_at
  loop
    perform public.approve_ad_campaign(r.id, 'Seeded demo campaign, approved through the real review RPC.');
  end loop;
end $$;

select set_config('request.jwt.claims', null, true);

commit;

-- What landed, and where each will render.
select a.title, a.status, a.placement,
       (a.target_categories is not null) as targeted,
       exists (select 1 from public.active_ads(100) where ad_id = a.id) as serves_now
from public.advertisements a
where a.title like '%[demo]'
order by a.status, a.title;
