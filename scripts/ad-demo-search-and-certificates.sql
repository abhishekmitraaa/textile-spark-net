-- Demo inventory for the two surfaces added on 2026-09-13:
--   1. `searchListing` campaigns, so /search and /search/results have enough
--      inventory to show the slot REPEATING rather than appearing once.
--   2. `verifiedCertificate` purchases, so certificate_orders has rows for both
--      the admin fulfilment screen and the vendor's My Payments tracking.
--
-- Same rules as ad-demo-campaigns.sql, which this extends:
--   * PRODUCTS and VENDORS are real rows. Nothing invented.
--   * CAMPAIGNS are seeded — no money changed hands, no ad_orders row — which
--     is why every title carries `[demo]`.
--   * They go through the REAL pipeline: inserted requesting 'active',
--     redirected to 'pending_review' by guard_ad_activation, then approved
--     through approve_ad_campaign() acting as demo-admin.
--
-- The certificate orders are NOT inserted by hand. They are created by
-- trg_create_certificate_order firing on the campaign insert, which is the same
-- path a real purchase takes — so this seed also proves the trigger works.
--
-- Remove everything with scripts/ad-demo-campaigns-cleanup.sql.

begin;

select set_config('request.jwt.claims', null, true);

-- ── 1. Search inventory ─────────────────────────────────────────────────────
-- Four more campaigns carrying `searchListing`. With the one already in
-- ad-demo-campaigns.sql this gives the search slots enough rows that the second
-- and third blocks are non-empty, which is the only way to SEE that the blocks
-- are disjoint: block 2 shows different campaigns from block 1, never a repeat.
insert into public.advertisements
  (vendor_id, product_id, title, image_url, daily_budget, placement, status,
   starts_at, ends_at, target_categories, target_cities)
select
  p.vendor_id, p.id, p.name || ' — ' || s.label || ' [demo]',
  (select url from public.product_images pi where pi.product_id = p.id order by position limit 1),
  s.budget, s.placement, 'active',
  now() - interval '1 day', now() + interval '30 days',
  s.target_categories, null
from (values
  ('Oversized Crew Tee',        'searchListing',                  'Search Listing',            35, null::jsonb),
  ('Wide-Leg Trouser',          'searchListing,openListing',      'Search + Open Listing',     57, null),
  ('Formal Blazer - Navy',      'searchListing,featuredProduct',  'Search + Featured',         90, null),
  -- Targeted, so a search whose results sit mostly in Jeans serves this one and
  -- a search for anything else does not.
  ('Slim Fit Jeans',            'searchListing',                  'Search Listing',            35,
     (select jsonb_build_array(id::text) from public.categories where name = 'Jeans' limit 1))
) as s(product_name, placement, label, budget, target_categories)
join lateral (
  select id, name, vendor_id from public.products
   where name = s.product_name and status = 'live' limit 1
) p on true;

-- ── 2. Certificate purchases ────────────────────────────────────────────────
--
-- product_id is NULL on purpose: the verification certificate is about the
-- VENDOR, not a product. It is the one placement in the price list that has
-- nothing to do with a listing, which is also why it has no buyer-side slot.
--
-- Two vendors, chosen to show both outcomes honestly:
--   * one WITH a postable address  -> can be printed, dispatched and delivered
--   * one WITHOUT one              -> the dispatch guard refuses it, and both
--                                     the admin card and the vendor's tracking
--                                     page say why
-- That second case is not a contrived edge: only 2 of 10 vendor_profiles rows
-- currently carry both an address line and a postcode. See ToDo.md.
insert into public.advertisements
  (vendor_id, product_id, title, image_url, daily_budget, placement, status, starts_at, ends_at)
select vp.id, null, coalesce(vp.brand_name, 'Vendor') || ' — Verification Certificate [demo]',
       null, 199, 'verifiedCertificate', 'active',
       now() - interval '1 day', now() + interval '365 days'
  from public.vendor_profiles vp
 where vp.id in (
   -- the postable one
   (select id from public.vendor_profiles
     where coalesce(btrim(address_line),'') <> '' and coalesce(btrim(postal_code),'') <> ''
     order by brand_name limit 1),
   -- one that is not postable, but does trade
   (select v2.id from public.vendor_profiles v2
     where coalesce(btrim(v2.address_line),'') = '' or coalesce(btrim(v2.postal_code),'') = ''
       and exists (select 1 from public.products p where p.vendor_id = v2.id and p.status = 'live')
     order by v2.brand_name limit 1)
 );

-- ── 3. Approve, through the real RPC ────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text,
  true);

do $$
declare r record;
begin
  for r in
    select id from public.advertisements
     where title like '%[demo]' and status = 'pending_review'
       and title not like 'Women''s Casual Kurta Set%'
     order by created_at
  loop
    perform public.approve_ad_campaign(r.id, 'Seeded demo campaign, approved through the real review RPC.');
  end loop;
end $$;

-- ── 4. Walk ONE certificate down the pipeline ───────────────────────────────
-- So the admin screen's Printed / Dispatched tabs and the vendor's tracking
-- timeline are not all sitting on step one. Only the postable order can move
-- past 'printed' — certificate_dispatch() refuses an order with no address, and
-- that refusal is the behaviour worth demonstrating, not worth working around.
do $$
declare c record;
begin
  for c in
    select co.id,
           coalesce(btrim(co.address_line),'') <> '' and coalesce(btrim(co.postal_code),'') <> '' as postable
      from public.certificate_orders co
      join public.advertisements a on a.id = co.ad_id
     where a.title like '%[demo]' and co.status = 'processing'
     order by co.reference
  loop
    perform public.certificate_mark_printed(c.id);
    if c.postable then
      perform public.certificate_dispatch(c.id, 'Blue Dart', 'DEMO77219048362');
    end if;
  end loop;
end $$;

select set_config('request.jwt.claims', null, true);

commit;

-- What landed.
select 'campaigns' as kind, a.title, a.status, a.placement,
       exists (select 1 from public.active_ads(100) where ad_id = a.id)::text as serves_now
  from public.advertisements a
 where a.title like '%[demo]' and a.placement like '%searchListing%'
union all
select 'certificate', co.reference, co.status,
       coalesce(co.vendor_name, '(no brand name)'),
       coalesce(nullif(btrim(co.address_line), ''), '*** no address — dispatch blocked ***')
  from public.certificate_orders co
  join public.advertisements a on a.id = co.ad_id
 where a.title like '%[demo]'
order by 1, 2;
