-- Ranking on real demand (migration 20261017150000). Run on the local stack: docker exec -i supabase_db_localstack psql -U postgres -d postgres -tA < scripts/ranking/rank_real_demand.sql
-- Expected: RT enquired > RT viewed > RT seeded sold (an enquiry = 10 views; seeded sold_count counts for nothing). Rolls back.
begin;
-- A seller with three live listings: high seeded "sold", many enquiries, many views.
insert into auth.users (id, email) values ('99999999-0000-0000-0000-000000000001', 'rank-test@cosora.test');
insert into public.profiles (id, full_name, active_role, onboarded) values ('99999999-0000-0000-0000-000000000001', 'rank test', 'seller', true) on conflict (id) do nothing;
insert into public.vendor_profiles (id, brand_name, city, country, business_type, onboarding_complete) values ('99999999-0000-0000-0000-000000000001', 'Rank Test', 'Surat', 'India', 'Manufacturer', true) on conflict (id) do nothing;
insert into public.products (id, vendor_id, name, status, sold_count, enquiries_count, views_count) values
 ('99999999-0000-0000-0000-0000000000a1', '99999999-0000-0000-0000-000000000001', 'RT seeded sold', 'live', 900, 0, 0),
 ('99999999-0000-0000-0000-0000000000a2', '99999999-0000-0000-0000-000000000001', 'RT enquired', 'live', 0, 30, 10),
 ('99999999-0000-0000-0000-0000000000a3', '99999999-0000-0000-0000-000000000001', 'RT viewed', 'live', 0, 0, 200);
select string_agg(name, ' > ' order by ord) as trending from (
  select name, row_number() over () ord from public.feed_products('trending', 10, 0, null, null, array['99999999-0000-0000-0000-000000000001']::uuid[])) t;
rollback;
