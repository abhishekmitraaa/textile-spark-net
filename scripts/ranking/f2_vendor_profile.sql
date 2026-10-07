-- ─────────────────────────────────────────────────────────────────────────────
-- RANKING HARNESS F2: states, the vendor's type and reach, capacity (2026-10-07).
-- documentation/ranking-foundations-design-2026-10-07.md, "F2".
-- Each case runs in its own rolled-back subtransaction. Every line prints PASS or FAIL.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/ranking/f2_vendor_profile.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $f2$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  labels text[] := array[
    '36 states and union territories', 'names, spellings and aliases map to codes',
    'a vendor''s state sets its code', 'an unknown state leaves the code empty', 'a code the writer sets wins',
    'a buyer''s state sets its code', 'known served states are kept', 'an unknown served state is refused',
    'a primary type outside the list is refused', 'a capability outside the list is refused',
    'business labels map to a type and capabilities',
    'the vendor writes and reads its own capacity', 'another vendor reads no capacity', 'anon reads no capacity',
    'an admin reads a vendor''s capacity', 'a capacity of 0 is refused', 'an unknown unit is refused',
    'a vendor can''t write another vendor''s capacity'];
  wants text[] := array[
    '36', 'GJ,GJ,OR,JK,PY,JK,TN,DL,-,-',
    'TN', '-', 'MH',
    'KA', 'GJ,MH', '23514',
    '23514', '23514',
    'manufacturer|export_ready,private_label;trader_wholesaler|;manufacturer|;service_provider|;-|',
    '5000|pieces', '0', '42501',
    '1', '23514', '23514',
    '42501'];
  got text; i int;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active) values (admn, 'super_admin', true)
        on conflict (id) do update set admin_role = 'super_admin', is_active = true;
      begin
        if i = 1 then
          select count(*)::text into got from public.india_states;
        elsif i = 2 then
          select string_agg(coalesce(public.state_code_for(x), '-'), ',' order by o) into got
            from unnest(array['Gujarat', ' gujarat ', 'Orissa', 'J&K', 'Pondicherry', 'Jammu & Kashmir', 'Tamilnadu',
                              'NCT of Delhi', 'Atlantis', '']) with ordinality as t(x, o);
        elsif i = 3 then
          update public.vendor_profiles set state = 'Tamil Nadu' where id = vendor;
          select coalesce(state_code, '-') into got from public.vendor_profiles where id = vendor;
        elsif i = 4 then
          update public.vendor_profiles set state = 'Tamil Nadu' where id = vendor;
          update public.vendor_profiles set state = 'Atlantis' where id = vendor;
          select coalesce(state_code, '-') into got from public.vendor_profiles where id = vendor;
        elsif i = 5 then
          update public.vendor_profiles set state = 'Gujarat', state_code = 'MH' where id = vendor;
          select coalesce(state_code, '-') into got from public.vendor_profiles where id = vendor;
        elsif i = 6 then
          insert into public.buyer_profiles (id, state) values (buyer, 'Karnataka')
            on conflict (id) do update set state = excluded.state;
          select coalesce(state_code, '-') into got from public.buyer_profiles where id = buyer;
        elsif i = 7 then
          update public.vendor_profiles set served_states = array['GJ', 'MH'] where id = vendor;
          select array_to_string(served_states, ',') into got from public.vendor_profiles where id = vendor;
        elsif i = 8 then
          update public.vendor_profiles set served_states = array['GJ', 'XX'] where id = vendor;
          got := 'accepted';
        elsif i = 9 then
          update public.vendor_profiles set primary_type = 'wizard' where id = vendor;
          got := 'accepted';
        elsif i = 10 then
          update public.vendor_profiles set capabilities = array['private_label', 'teleportation'] where id = vendor;
          got := 'accepted';
        elsif i = 11 then
          select string_agg(coalesce(t.primary_type, '-') || '|' || array_to_string(t.capabilities, ','), ';' order by c.o)
            into got
            from (values
                    (1, array['Private Label Manufacturer', 'Export House']::text[], null::text),
                    (2, array['Garment Wholesaler'], null),
                    (3, null, 'Manufacturer'),
                    (4, array['Sourcing Agent'], null),
                    (5, null, null)) as c(o, labels_in, business_type_in)
            cross join lateral public.vendor_type_from_labels(c.labels_in, c.business_type_in) t;
        elsif i = 12 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', vendor::text, true);
          set local role authenticated;
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit)
          values (vendor, 'apparel-home', 5000, 'pieces');
          select monthly_capacity::int || '|' || unit into got from public.vendor_capacity
           where vendor_id = vendor and category_root = 'apparel-home';
        elsif i between 13 and 15 then
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit)
          values (vendor, 'apparel-home', 5000, 'pieces');
          if i = 14 then
            perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
            perform set_config('request.jwt.claim.sub', '', true);
            set local role anon;
          else
            perform set_config('request.jwt.claims',
              json_build_object('sub', case when i = 13 then gen_random_uuid() else admn end, 'role', 'authenticated')::text, true);
            perform set_config('request.jwt.claim.sub', (case when i = 13 then gen_random_uuid() else admn end)::text, true);
            set local role authenticated;
          end if;
          select count(*)::text into got from public.vendor_capacity where vendor_id = vendor;
        elsif i = 16 then
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit)
          values (vendor, 'apparel-home', 0, 'pieces');
          got := 'accepted';
        elsif i = 17 then
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit)
          values (vendor, 'apparel-home', 10, 'bananas');
          got := 'accepted';
        elsif i = 18 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', vendor::text, true);
          set local role authenticated;
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit)
          values ((select id from public.vendor_profiles where id <> vendor limit 1), 'apparel-home', 10, 'pieces');
          got := 'accepted';
        end if;
      exception when others then
        got := sqlstate;
      end;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = wants[i] then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || wants[i] || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'F2 (rolled back)%', E'\n' || out;
end
$f2$;
