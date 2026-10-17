#!/bin/bash
# The signed-out view cap holds under parallel calls (migration 20261017170000). Local stack only.
# 90 views already logged, then 30 simultaneous signed-out calls: expect exactly 100 (102 before the fix).
P=99999999-0000-0000-0000-0000000000d1; V=99999999-0000-0000-0000-0000000000d0
q() { docker exec supabase_db_localstack psql -U postgres -d postgres -tAc "$1"; }
q "insert into auth.users (id, email) values ('$V', 'race@cosora.test') on conflict do nothing;
   insert into public.profiles (id, full_name, active_role, onboarded) values ('$V','race','seller',true) on conflict (id) do nothing;
   insert into public.vendor_profiles (id, brand_name, city, country, business_type, onboarding_complete) values ('$V','Race','Surat','India','Manufacturer',true) on conflict (id) do nothing;
   delete from public.product_view_daily where product_id = '$P'; delete from public.products where id = '$P';
   insert into public.products (id, vendor_id, name, status) values ('$P','$V','race','live');
   insert into public.product_view_daily (product_id, viewer_key, day) select '$P', 'b:' || gen_random_uuid(), (now() at time zone 'Asia/Kolkata')::date from generate_series(1,90);" >/dev/null
for i in $(seq 1 30); do
  docker exec supabase_db_localstack psql -U postgres -d postgres -tAc "set role anon; set request.jwt.claims = '{\"role\":\"anon\"}'; select public.increment_product_view('$P', gen_random_uuid()::text);" >/dev/null &
done
wait
echo "signed-out views logged today: $(q "select count(*) from public.product_view_daily where product_id = '$P' and viewer_key like 'b:%'") (cap 100)"
# Leave nothing behind: other harnesses pick "any spare profile".
q "delete from public.product_view_daily where product_id = '$P'; delete from public.product_trend where product_id = '$P';
   delete from public.products where id = '$P'; delete from public.vendor_profiles where id = '$V';
   delete from public.profiles where id = '$V'; delete from auth.users where id = '$V';" >/dev/null
echo "left behind: $(q "select count(*) from auth.users where id = '$V'") account(s), $(q "select count(*) from public.products where id = '$P'") listing(s)"
