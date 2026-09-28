-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 08: vendor_profiles after the Phase 4b revoke
-- (2026-09-28). Each case runs in its own rolled-back subtransaction.
--
--   anon: public columns                     -> ok
--   anon: phone / select * / filter on pan   -> 42501
--   anon: count(*)                           -> ok
--   anon: INSERT                             -> 42501 (no grant)
--   buyer: owner_email / catalog_embedding   -> 42501
--   buyer: products joined to their vendor   -> ok (the PostgREST embed shape)
--   buyer: call_vendor_contact()             -> the number (definer, unaffected)
--   vendor: my_vendor_private()              -> own row
--   vendor: PATCH-shaped update of the private fields, RETURNING 1        -> 1 row
--   vendor: the upsert the app used until Phase 4b (INSERT ... ON CONFLICT (id)
--           DO UPDATE of the private fields from EXCLUDED)                 -> 42501
--   super_admin: is_verified toggle, RETURNING id (Vendor detail's write)  -> 1 row
--   super_admin: admin_vendor_private()      -> the row
--   vendor: the old updating upsert (ON CONFLICT DO UPDATE SET pan = EXCLUDED.pan)
--           -> 42501: it needs SELECT on pan. This is why every client write goes
--           through writeOwnVendorRow() (lib/queries/vendorStore.ts) since Phase 4b.
--   vendor: insert-only upsert (ON CONFLICT DO NOTHING) of an existing row,
--           RETURNING id                    -> 0 rows, no error
--   a buyer's first vendor save: insert-only upsert with the private fields
--           -> 1 row (onboarding's first write)
--
-- HOW TO RUN: execute this whole file as ONE statement, after the revoke (or
-- appended to it in a rehearsal). It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h08$
declare
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  labels text[] := array[
    'anon: public columns', 'anon: phone', 'anon: select *', 'anon: filter on pan', 'anon: count(*)',
    'anon: insert', 'buyer: owner_email', 'buyer: catalog_embedding', 'buyer: products joined to vendor',
    'buyer: call_vendor_contact', 'vendor: my_vendor_private', 'vendor: patch-shaped update',
    'vendor: upsert-shaped insert', 'super_admin: is_verified toggle', 'super_admin: admin_vendor_private',
    'vendor: old updating upsert', 'vendor: insert-only upsert, existing row', 'buyer: first vendor save'];
  i int; n int; t text; out text := '';
  who uuid;
begin
  for i in 1..array_length(labels, 1) loop
    begin
      if i between 14 and 15 then
        insert into admin.admin_users (id, admin_role, is_active) values (pr, 'super_admin', true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      end if;
      who := case when i between 7 and 10 or i = 18 then buyer when i between 11 and 13 or i in (16, 17) then vendor
                  when i in (14, 15) then pr else null end;
      if who is null then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', who::text, true);
        set local role authenticated;
      end if;

      if i = 1 then
        select count(*) into n from (select v.id, v.brand_name, v.city, v.gstin, v.has_phone, v.has_whatsapp from public.vendor_profiles v) x;
        raise exception using errcode = 'P0099', message = format('%s rows', n);
      elsif i = 2 then
        select count(v.phone) into n from public.vendor_profiles v;
      elsif i = 3 then
        execute 'select count(*) from (select * from public.vendor_profiles) x' into n;
      elsif i = 4 then
        select count(*) into n from public.vendor_profiles v where v.pan is not null;
      elsif i = 5 then
        select count(*) into n from public.vendor_profiles;
        raise exception using errcode = 'P0099', message = format('%s rows', n);
      elsif i = 6 then
        insert into public.vendor_profiles (id, brand_name) values (gen_random_uuid(), 'H08 anon insert');
      elsif i = 7 then
        select count(v.owner_email) into n from public.vendor_profiles v;
      elsif i = 8 then
        select count(v.catalog_embedding) into n from public.vendor_profiles v;
      elsif i = 9 then
        select count(*) into n from public.products p join public.vendor_profiles v on v.id = p.vendor_id where p.status = 'live';
        raise exception using errcode = 'P0099', message = format('%s live products with their vendor', n);
      elsif i = 10 then
        select count(*) filter (where x.phone is not null) into n from public.call_vendor_contact(vendor) x;
        raise exception using errcode = 'P0099', message = format('number served: %s', n = 1);
      elsif i = 11 then
        select count(*) into n from public.my_vendor_private() x where x.phone is not null;
        raise exception using errcode = 'P0099', message = format('own rows with a phone: %s', n);
      elsif i = 12 then
        with u as (
          update public.vendor_profiles
             set pan = 'ABCDE1234F', phone = '+91 90000 00099', whatsapp = '+91 90000 00099',
                 owner_email = 'h08@cosora.test', address_line = 'H08 line', area = 'H08 area',
                 landmark = 'H08 landmark', postal_code = '395002'
           where id = vendor
          returning 1)
        select count(*) into n from u;
        raise exception using errcode = 'P0099', message = format('%s row updated', n);
      elsif i = 13 then
        with u as (
          insert into public.vendor_profiles (id, brand_name, phone, whatsapp, owner_email, pan, address_line, area, landmark, postal_code)
          values (vendor, (select brand_name from public.vendor_profiles where id = vendor), '+91 90000 00098', '+91 90000 00098',
                  'h08b@cosora.test', 'ABCDE1234G', 'H08b line', 'H08b area', 'H08b landmark', '395003')
          on conflict (id) do update
             set brand_name = excluded.brand_name, phone = excluded.phone, whatsapp = excluded.whatsapp,
                 owner_email = excluded.owner_email, pan = excluded.pan, address_line = excluded.address_line,
                 area = excluded.area, landmark = excluded.landmark, postal_code = excluded.postal_code
          returning 1)
        select count(*) into n from u;
        reset role;
        select v.pan into t from public.vendor_profiles v where v.id = vendor;
        raise exception using errcode = 'P0099', message = format('%s row upserted, pan now %s', n, t);
      elsif i = 14 then
        with u as (
          update public.vendor_profiles set is_verified = not is_verified where id = vendor returning id)
        select count(*) into n from u;
        raise exception using errcode = 'P0099', message = format('%s row updated', n);
      elsif i = 15 then
        select count(*) into n from public.admin_vendor_private(array[vendor]) x where x.pan is not null or x.phone is not null;
        raise exception using errcode = 'P0099', message = format('%s row with private fields', n);
      elsif i = 16 then
        insert into public.vendor_profiles (id, pan) values (vendor, 'ABCDE1234H')
        on conflict (id) do update set pan = excluded.pan;
      elsif i = 17 then
        with u as (
          insert into public.vendor_profiles (id, phone, pan) values (vendor, '+91 90000 00097', 'ABCDE1234J')
          on conflict (id) do nothing
          returning id)
        select count(*) into n from u;
        raise exception using errcode = 'P0099', message = format('%s row inserted (existing row untouched)', n);
      elsif i = 18 then
        with u as (
          insert into public.vendor_profiles (id, brand_name, phone, whatsapp, owner_email, pan, address_line, postal_code, onboarding_complete)
          values (buyer, 'H08 first save', '+91 90000 00096', '+91 90000 00096', 'h08c@cosora.test', 'ABCDE1234K', 'H08c line', '395004', true)
          on conflict (id) do nothing
          returning id)
        select count(*) into n from u;
        raise exception using errcode = 'P0099', message = format('%s row created', n);
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 90) || E'\n';
    end;
  end loop;
  raise exception 'H08 (rolled back)%', E'\n' || out;
end
$h08$;
