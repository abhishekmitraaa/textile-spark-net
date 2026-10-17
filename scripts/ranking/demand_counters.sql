-- The demand counters can't be pumped (migration 20261017160000). Local stack only; rolls back.
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -tA < scripts/ranking/demand_counters.sql
-- Expected: enquiries 1, anon_enquiry 0, own_enquiry 0, own_view 0, anon_views 100, signed_in_view +1, and the recent-demand
-- score (in today's units): 10 after the enquiry, 35 after the 100 signed-out views (0.25 each), 35 after the seller's own,
-- 36 after a signed-in view (20261017180000). Then PASS.
begin;
insert into auth.users (id, email) values ('99999999-0000-0000-0000-0000000000b1', 'dc-seller@cosora.test'), ('99999999-0000-0000-0000-0000000000b2', 'dc-buyer@cosora.test');
insert into public.profiles (id, full_name, active_role, onboarded) values ('99999999-0000-0000-0000-0000000000b1', 'dc seller', 'seller', true), ('99999999-0000-0000-0000-0000000000b2', 'dc buyer', 'buyer', true) on conflict (id) do nothing;
insert into public.vendor_profiles (id, brand_name, city, country, business_type, onboarding_complete) values ('99999999-0000-0000-0000-0000000000b1', 'DC', 'Surat', 'India', 'Manufacturer', true) on conflict (id) do nothing;
insert into public.products (id, vendor_id, name, status) values ('99999999-0000-0000-0000-0000000000c1', '99999999-0000-0000-0000-0000000000b1', 'DC listing', 'live');
create temp table r (k text, v text);
grant all on r to anon, authenticated;
-- a buyer enquires five times: one counts
set local role authenticated; set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-0000000000b2","role":"authenticated"}';
select public.increment_product_enquiry('99999999-0000-0000-0000-0000000000c1') from generate_series(1,5);
reset role;
insert into r select 'enquiries', enquiries_count::text from public.products where id = '99999999-0000-0000-0000-0000000000c1';
insert into r select 't1_trend_enquiry', round(public.listing_demand_now('99999999-0000-0000-0000-0000000000c1')::numeric, 2)::text;
-- signed out: refused outright
set local role anon; set local request.jwt.claims = '{"role":"anon"}';
do $$ begin perform public.increment_product_enquiry('99999999-0000-0000-0000-0000000000c1'); insert into r values ('anon_enquiry', 'allowed'); exception when insufficient_privilege then insert into r values ('anon_enquiry', '0'); end $$;
-- 150 made-up browser keys: 100 count
select public.increment_product_view('99999999-0000-0000-0000-0000000000c1', gen_random_uuid()::text) from generate_series(1,150);
reset role;
insert into r select 'anon_views', views_count::text from public.products where id = '99999999-0000-0000-0000-0000000000c1';
insert into r select 't2_trend_anon', round(public.listing_demand_now('99999999-0000-0000-0000-0000000000c1')::numeric, 2)::text;
-- the seller's own enquiry and view don't count
set local role authenticated; set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-0000000000b1","role":"authenticated"}';
select public.increment_product_enquiry('99999999-0000-0000-0000-0000000000c1');
select public.increment_product_view('99999999-0000-0000-0000-0000000000c1', null);
reset role;
insert into r select 'own_enquiry', (enquiries_count - 1)::text from public.products where id = '99999999-0000-0000-0000-0000000000c1';
insert into r select 'own_view', (views_count - 100)::text from public.products where id = '99999999-0000-0000-0000-0000000000c1';
insert into r select 't3_trend_own', round(public.listing_demand_now('99999999-0000-0000-0000-0000000000c1')::numeric, 2)::text;
-- a signed-in buyer still counts after the anonymous cap
set local role authenticated; set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-0000000000b2","role":"authenticated"}';
select public.increment_product_view('99999999-0000-0000-0000-0000000000c1', null);
reset role;
insert into r select 'signed_in_view', '+' || (views_count - 100)::text from public.products where id = '99999999-0000-0000-0000-0000000000c1';
insert into r select 't4_trend_signed_in', round(public.listing_demand_now('99999999-0000-0000-0000-0000000000c1')::numeric, 2)::text;
select k || ' ' || v from r;
select case when (select string_agg(v, ',' order by k) from r) = '0,100,1,0,0,+1,10.00,35.00,35.00,36.00' then 'PASS' else 'FAIL' end;
rollback;
