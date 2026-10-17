-- Ranking on recent demand (migrations 20261017150000, 20261017180000). Local stack only; rolls back.
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -tA < scripts/ranking/rank_real_demand.sql
-- One seller, four live listings, demand added through add_listing_demand (the counters' own writer):
--   RT seeded sold   900 seeded sales, no demand              → last (sold_count counts for nothing)
--   RT old buzz      8 signed-in views 21 days ago            → 8 / 2^3 = 1 point now
--   RT viewed        3 signed-in views today                  → 3 points
--   RT enquired      1 enquiry today                          → 10 points
-- Expected trending order: enquired > viewed > old buzz > seeded sold, then PASS.
begin;
insert into auth.users (id, email) values ('99999999-0000-0000-0000-000000000001', 'rank-test@cosora.test');
insert into public.profiles (id, full_name, active_role, onboarded) values ('99999999-0000-0000-0000-000000000001', 'rank test', 'seller', true) on conflict (id) do nothing;
insert into public.vendor_profiles (id, brand_name, city, country, business_type, onboarding_complete) values ('99999999-0000-0000-0000-000000000001', 'Rank Test', 'Surat', 'India', 'Manufacturer', true) on conflict (id) do nothing;
insert into public.products (id, vendor_id, name, status, sold_count, enquiries_count, views_count) values
 ('99999999-0000-0000-0000-0000000000a1', '99999999-0000-0000-0000-000000000001', 'RT seeded sold', 'live', 900, 0, 0),
 ('99999999-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-000000000001', 'RT enquired', 'live', 0, 1, 0),
 ('99999999-0000-0000-0000-0000000000a3', '99999999-0000-0000-0000-000000000001', 'RT viewed', 'live', 0, 0, 3),
 ('99999999-0000-0000-0000-0000000000a4', '99999999-0000-0000-0000-000000000001', 'RT old buzz', 'live', 0, 0, 500);
select public.add_listing_demand('99999999-0000-0000-0000-0000000000a2', public.listing_demand_weight('enquiry'));
select public.add_listing_demand('99999999-0000-0000-0000-0000000000a3', public.listing_demand_weight('view_signed_in')) from generate_series(1, 3);
select public.add_listing_demand('99999999-0000-0000-0000-0000000000a4', public.listing_demand_weight('view_signed_in'), now() - interval '21 days') from generate_series(1, 8);
create temp table got as
  select string_agg(f.name, ' > ' order by f.ord) as trending
    from public.feed_products('trending', 10, 0, null, null, array['99999999-0000-0000-0000-000000000001']::uuid[])
         with ordinality as f(id, vendor_id, name, price_value, currency, compare_at_price, moq, fabric, gsm, fit_type, gender,
                              rating_avg, enquiries_count, sold_count, views_count, location, category_id, category_name,
                              images, created_at, brand_name, vendor_city, is_verified, plan_id, plan_expires_at,
                              ad_verified_until, boost, ord);
select trending from got;
select case when trending = 'RT enquired > RT viewed > RT old buzz > RT seeded sold' then 'PASS' else 'FAIL' end from got;
rollback;
