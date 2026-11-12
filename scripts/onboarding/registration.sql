-- ─────────────────────────────────────────────────────────────────────────────
-- REGISTRATION HARNESS (vendor registration fixes, 2026-11-13).
-- Every case runs in its own savepoint (no case sees another's writes) and prints "PASS: <label>" or "FAIL: <label> <detail>". The whole file runs in one
-- transaction and ROLLS BACK: it never changes the database it runs against.
-- HOW TO RUN (local stack):
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -q < scripts/onboarding/registration.sql 2>&1 | grep -E "PASS|FAIL"
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

-- A throwaway account (its profiles row comes from on_auth_user_created).
create function pg_temp.new_user(tag text) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, tag || '-' || left(u::text, 8) || '@harness.test', 'authenticated', 'authenticated',
          jsonb_build_object('full_name', 'Harness ' || tag, 'active_role', 'buyer'), false, false, now(), now(), '', '', '', '');
  return u;
end $$;

-- Claims for a signed-in caller; the DO block then runs `set local role authenticated`.
create function pg_temp.claims(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- ═════════════════════════════ Task 1: state, exemptions, switches, read model ═════════════
savepoint c;
do $c$
begin
  perform pg_temp.ok('country_code backfilled IN for India rows',
    (select count(*) from public.vendor_profiles where (country ilike 'india' or country is null) and country_code is distinct from 'IN') = 0);
exception when others then perform pg_temp.ok('country_code backfilled IN for India rows', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare a uuid := pg_temp.new_user('reg-a'); b uuid := pg_temp.new_user('reg-b'); n int;
begin
  insert into public.vendor_registrations (id, vendor_id, country_code, status) values (gen_random_uuid(), a, 'IN', 'registered');
  begin
    perform pg_temp.claims(b);
    set local role authenticated;
    select count(*) into n from public.vendor_registrations where vendor_id = a;
    reset role;
    perform pg_temp.ok('vendor_registrations unreadable by another seller (0 rows)', n = 0, 'rows=' || n);
  exception when others then
    perform pg_temp.ok('vendor_registrations unreadable by another seller (0 rows)', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform pg_temp.claims(a);
    set local role authenticated;
    select count(*) into n from public.vendor_registrations where vendor_id = a;
    reset role;
    perform pg_temp.ok('vendor_registrations readable by its seller', n = 1, 'rows=' || n);
  exception when others then
    perform pg_temp.ok('vendor_registrations readable by its seller', false, sqlstate || ' ' || sqlerrm);
  end;
exception when others then perform pg_temp.ok('vendor_registrations fixtures', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare n int;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    select count(*) into n from public.vendor_registrations;
    reset role;
    perform pg_temp.ok('anon cannot read vendor_registrations', false, 'read ' || n || ' rows');
  exception when others then
    perform pg_temp.ok('anon cannot read vendor_registrations', sqlstate = '42501', sqlstate);
  end;
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('reg-off');
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Harness Off');
  update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key = 'seller_registration_required';
  perform pg_temp.ok('seller_registered true when switch off', public.seller_registered(u));
exception when others then perform pg_temp.ok('seller_registered true when switch off', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('reg-on'); w uuid := pg_temp.new_user('reg-nocontract');
begin
  update public.feature_flags set enabled = true where key = 'seller_registration_required';
  insert into public.vendor_profiles (id, brand_name) values (u, 'Harness Unregistered');
  perform pg_temp.ok('seller_registered false for unregistered seller with switch on', not public.seller_registered(u));
  perform pg_temp.ok('seller_registered true for exempt 22222222-… with switch on',
    public.seller_registered('22222222-2222-2222-2222-222222222222'));
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (w, 'Harness No Contract', true);
  perform pg_temp.ok('seller_registered false for flag-true seller without contract, switch on', not public.seller_registered(w));
  insert into public.vendor_contracts (vendor_id, signed_name, agreement_version) values (w, 'Harness', '2026-09-v1');
  perform pg_temp.ok('seller_registered true for flag-true seller with contract, switch on', public.seller_registered(w));
exception when others then perform pg_temp.ok('seller_registered with switch on', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare r jsonb; u uuid := pg_temp.new_user('reg-none');
begin
  begin
    perform pg_temp.claims('22222222-2222-2222-2222-222222222222');
    set local role authenticated;
    r := public.my_seller_registration();
    reset role;
    perform pg_temp.ok('my_seller_registration returns exempt for 22222222-…', r ->> 'status' = 'exempt', coalesce(r::text, 'null'));
  exception when others then perform pg_temp.ok('my_seller_registration returns exempt for 22222222-…', false, sqlstate || ' ' || sqlerrm);
  end;
  begin
    perform pg_temp.claims(u);
    set local role authenticated;
    r := public.my_seller_registration();
    reset role;
    perform pg_temp.ok('my_seller_registration returns none for a new account', r ->> 'status' = 'none', coalesce(r::text, 'null'));
  exception when others then perform pg_temp.ok('my_seller_registration returns none for a new account', false, sqlstate || ' ' || sqlerrm);
  end;
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
begin
  perform pg_temp.ok('anon has no EXECUTE on seller_registered',
    not has_function_privilege('anon', 'public.seller_registered(uuid)', 'EXECUTE'));
  perform pg_temp.ok('anon has no EXECUTE on my_seller_registration',
    not has_function_privilege('anon', 'public.my_seller_registration()', 'EXECUTE'));
exception when others then perform pg_temp.ok('function grants', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
begin
  perform pg_temp.ok('switches exist and start off',
    (select count(*) from public.feature_flags
      where key in ('seller_registration_required', 'overseas_seller_registration') and not enabled) = 2);
  perform pg_temp.ok('free plan allows 1 catalogue, paid unlimited',
    (select (limits ->> 'catalogues_max')::int from public.subscription_plans where id = 'free') = 1
    and (select (limits ->> 'catalogues_max')::int from public.subscription_plans where id = 'basic') = -1);
exception when others then perform pg_temp.ok('switches and catalogue limits', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

-- ═════════════════════════════ Task 2: one all-or-nothing submit ═══════════════════════════════
-- A storage object the payload can point at (the RPC checks storage.objects).
create function pg_temp.obj(bucket text, path text) returns void
language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata) values (bucket, path, '{}'::jsonb)
  on conflict do nothing;
end $$;

create function pg_temp.pub(path text) returns text
language sql as $$ select 'http://127.0.0.1:54321/storage/v1/object/public/product-images/' || path $$;

create function pg_temp.india_payload(u uuid) returns jsonb
language plpgsql as $$
begin
  perform pg_temp.obj('business-docs', u || '/kyc/pan.png');
  perform pg_temp.obj('business-docs', u || '/kyc/reg.pdf');
  perform pg_temp.obj('business-docs', u || '/kyc/aadhaar.png');
  perform pg_temp.obj('business-docs', u || '/kyc/cat.pdf');
  perform pg_temp.obj('business-docs', u || '/contract/sig.png');
  perform pg_temp.obj('product-images', u || '/office/o1.jpg');
  perform pg_temp.obj('product-images', u || '/onboarding-product/p1.jpg');
  return jsonb_build_object(
    'business_name', 'Harness Mills', 'country_code', 'IN',
    'business_phone', '+912612345678', 'whatsapp', '+919876543210', 'website', 'https://harness.example',
    'whatsapp_updates', false,
    'address', jsonb_build_object('line', '12', 'area', 'Udhna', 'city', 'Surat', 'state', 'Gujarat',
                                  'postal_code', '394210', 'landmark', null),
    'owner', jsonb_build_object('name', 'Harness Owner', 'email', 'owner@harness.example'),
    'primary_type', 'manufacturer', 'capabilities', jsonb_build_array('private_label'),
    'categories', jsonb_build_array('Garment Manufacturer'),
    'premises_photos', jsonb_build_array(pg_temp.pub(u || '/office/o1.jpg')),
    'documents', jsonb_build_object(
      'pan', jsonb_build_object('number', 'ABCPE1234F', 'holder_name', 'Harness Owner', 'address', '12 Udhna, Surat',
                                'path', u || '/kyc/pan.png'),
      'gst', null,
      'registration', jsonb_build_object('kind', 'shop_establishment', 'number', null, 'path', u || '/kyc/reg.pdf'),
      'aadhaar', jsonb_build_object('path', u || '/kyc/aadhaar.png'),
      'catalogue', jsonb_build_array(),
      'catalogue_pdf', null),
    'product', jsonb_build_object('name', 'Harness Kurta', 'price', 450, 'unit', 'pieces', 'moq', 50,
                                  'category_id', null, 'fabric', 'Cotton', 'gsm', null,
                                  'sizes', jsonb_build_array('M'), 'colour', 'Blue',
                                  'images', jsonb_build_array(pg_temp.pub(u || '/onboarding-product/p1.jpg'))),
    'contract', jsonb_build_object('signed_name', 'Harness Owner', 'signature_path', u || '/contract/sig.png',
                                   'agreement_version', '2026-09-v1'));
end $$;

create function pg_temp.overseas_payload(u uuid) returns jsonb
language plpgsql as $$
declare p jsonb := pg_temp.india_payload(u);
begin
  perform pg_temp.obj('business-docs', u || '/kyc/licence.pdf');
  perform pg_temp.obj('business-docs', u || '/kyc/trn.pdf');
  perform pg_temp.obj('business-docs', u || '/kyc/passport.png');
  return p || jsonb_build_object(
    'country_code', 'AE', 'business_phone', '+971501234567', 'whatsapp', '+971501234567',
    'address', jsonb_build_object('line', 'Office 4', 'area', 'Al Quoz', 'city', 'Dubai', 'state', 'Dubai',
                                  'postal_code', '00000', 'landmark', null),
    'documents', jsonb_build_object(
      'registration', jsonb_build_object('kind', 'foreign_registration', 'number', 'TL-12345', 'path', u || '/kyc/licence.pdf'),
      'tax_id', jsonb_build_object('number', '100123456700003', 'path', u || '/kyc/trn.pdf'),
      'owner_id', jsonb_build_object('kind', 'passport', 'path', u || '/kyc/passport.png'),
      'catalogue', jsonb_build_array(), 'catalogue_pdf', null));
end $$;

-- Submit as the account; returns the status, or "ERR <sqlstate> <message>".
create function pg_temp.submit(u uuid, sid uuid, payload jsonb) returns text
language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.claims(u);
  begin
    set local role authenticated;
    r := public.submit_vendor_registration(sid, payload);
    reset role;
    return coalesce(r ->> 'status', 'null');
  exception when others then
    return 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-ok'); r text; d text; v record;
begin
  r := pg_temp.submit(u, gen_random_uuid(), pg_temp.india_payload(u));
  select onboarding_complete, phone, whatsapp, business_type, primary_type, country_code into v from public.vendor_profiles where id = u;
  select string_agg(doc_type, ',' order by doc_type) into d from public.vendor_documents where vendor_id = u;
  perform pg_temp.ok('valid India payload → registered, flag true',
    r = 'registered' and v.onboarding_complete, r);
  perform pg_temp.ok('one contract written', (select count(*) from public.vendor_contracts where vendor_id = u) = 1);
  perform pg_temp.ok('docs pan/gst-less/business_registration/aadhaar', d = 'aadhaar,business_registration,pan', d);
  perform pg_temp.ok('pan detail has holder_name and address',
    (select detail ->> 'holder_name' = 'Harness Owner' and detail ->> 'address' = '12 Udhna, Surat'
       from public.vendor_documents where vendor_id = u and doc_type = 'pan'));
  perform pg_temp.ok('phone = business number, whatsapp = mobile',
    v.phone = '+912612345678' and v.whatsapp = '+919876543210', v.phone || ' / ' || v.whatsapp);
  perform pg_temp.ok('primary_type manufacturer → business_type Manufacturer',
    v.primary_type = 'manufacturer' and v.business_type = 'Manufacturer', v.business_type);
  perform pg_temp.ok('country_code IN', v.country_code = 'IN', v.country_code);
  perform pg_temp.ok('product under_review with its image, moq 50',
    (select count(*) from public.products p join public.product_images i on i.product_id = p.id
      where p.vendor_id = u and p.status = 'under_review' and p.moq = '50') = 1);
  perform pg_temp.ok('premises photo waits for review',
    (select count(*) from public.vendor_premises_photos where vendor_id = u and status = 'under_review') = 1);
  perform pg_temp.ok('profiles.active_role seller, onboarded',
    (select active_role::text = 'seller' and onboarded from public.profiles where id = u));
  perform pg_temp.ok('vendor_registrations row registered',
    (select count(*) from public.vendor_registrations where vendor_id = u and status = 'registered') = 1);
exception when others then perform pg_temp.ok('valid India payload', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-idem'); s uuid := gen_random_uuid(); p jsonb; r1 text; r2 text; r3 text;
begin
  p := pg_temp.india_payload(u);
  r1 := pg_temp.submit(u, s, p);
  r2 := pg_temp.submit(u, s, p);
  perform pg_temp.ok('same submission id twice → same result, 1 product, 1 contract',
    r1 = 'registered' and r2 = 'registered'
    and (select count(*) from public.products where vendor_id = u) = 1
    and (select count(*) from public.vendor_contracts where vendor_id = u) = 1, r1 || ' / ' || r2);
  r3 := pg_temp.submit(u, gen_random_uuid(), p);
  perform pg_temp.ok('second submission after registered → already_registered', r3 like 'ERR P0001 already_registered%', r3);
exception when others then perform pg_temp.ok('idempotency', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-atomic'); p jsonb; r text;
begin
  p := pg_temp.india_payload(u);
  p := jsonb_set(p, '{contract,agreement_version}', '"1999-01-v0"');
  r := pg_temp.submit(u, gen_random_uuid(), p);
  perform pg_temp.ok('failure on the contract step → nothing written',
    r like 'ERR 22023 invalid_contract%'
    and not exists (select 1 from public.vendor_documents where vendor_id = u)
    and not exists (select 1 from public.products where vendor_id = u)
    and not exists (select 1 from public.vendor_profiles where id = u and onboarding_complete)
    and not exists (select 1 from public.vendor_registrations where vendor_id = u), r);
exception when others then perform pg_temp.ok('atomicity', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-val'); p jsonb; r text;
begin
  p := pg_temp.india_payload(u);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{owner,email}', '"a"'));
  perform pg_temp.ok('invalid email "a" → invalid_email', r like 'ERR 22023 invalid_email%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{website}', '"not a url"'));
  perform pg_temp.ok('website "not a url" → invalid_website', r like 'ERR 22023 invalid_website%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{address,state}', '"Gujarat State"'));
  perform pg_temp.ok('state "Gujarat State" → invalid_state', r like 'ERR 22023 invalid_state%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{address,city}', '"  "'));
  perform pg_temp.ok('blank city → invalid_city', r like 'ERR 22023 invalid_city%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{business_phone}', '"9198765"'));
  perform pg_temp.ok('phone 9198765 → invalid_phone', r like 'ERR 22023 invalid_phone%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{product,price}', '-50'));
  perform pg_temp.ok('price -50 → invalid_product', r like 'ERR 22023 invalid_product%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{product,images}', '[]'));
  perform pg_temp.ok('product without images → invalid_product', r like 'ERR 22023 invalid_product%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{capabilities}', '["abc"]'));
  perform pg_temp.ok('capability "abc" → invalid_capability', r like 'ERR 22023 invalid_capability%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{documents,pan,number}', '"ABCDE12345"'));
  perform pg_temp.ok('bad PAN → invalid_pan', r like 'ERR 22023 invalid_pan%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{documents,pan,path}', to_jsonb(gen_random_uuid() || '/kyc/pan.png')));
  perform pg_temp.ok('path of another user → invalid_file', r like 'ERR 22023 invalid_file%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{documents,pan,path}', to_jsonb(u || '/kyc/missing.png')));
  perform pg_temp.ok('path not in storage.objects → invalid_file', r like 'ERR 22023 invalid_file%', r);
  r := pg_temp.submit(u, gen_random_uuid(), p || jsonb_build_object('padding', repeat('x', 70000)));
  perform pg_temp.ok('payload over 64 KB → payload_too_large', r like 'ERR 22023 payload_too_large%', r);
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(p, '{documents,aadhaar}', 'null'));
  perform pg_temp.ok('India without masked Aadhaar → missing_document', r like 'ERR 22023 missing_document%', r);
exception when others then perform pg_temp.ok('validation', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-moq'); p jsonb; r text;
begin
  p := jsonb_set(pg_temp.india_payload(u), '{product,moq}', 'null');
  r := pg_temp.submit(u, gen_random_uuid(), p);
  perform pg_temp.ok('moq blank stored as NULL (no "2")',
    r = 'registered' and (select moq is null from public.products where vendor_id = u), r);
exception when others then perform pg_temp.ok('moq blank', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-os'); r text; d text;
begin
  update public.feature_flags set enabled = false where key = 'overseas_seller_registration';
  r := pg_temp.submit(u, gen_random_uuid(), pg_temp.overseas_payload(u));
  perform pg_temp.ok('overseas with switch off → invalid_country', r like 'ERR 22023 invalid_country%', r);
  update public.feature_flags set enabled = true where key = 'overseas_seller_registration';
  r := pg_temp.submit(u, gen_random_uuid(),
         pg_temp.overseas_payload(u) || jsonb_build_object('documents',
           pg_temp.overseas_payload(u) -> 'documents' || jsonb_build_object('pan', pg_temp.india_payload(u) #> '{documents,pan}')));
  perform pg_temp.ok('overseas payload with PAN keys → invalid_registration', r like 'ERR 22023 invalid_registration%', r);
  r := pg_temp.submit(u, gen_random_uuid(), pg_temp.overseas_payload(u));
  select string_agg(doc_type, ',' order by doc_type) into d from public.vendor_documents where vendor_id = u;
  perform pg_temp.ok('overseas valid → pending_review, flag false',
    r = 'pending_review' and not (select onboarding_complete from public.vendor_profiles where id = u), r);
  perform pg_temp.ok('overseas docs business_registration/owner_id/tax_id',
    d = 'business_registration,owner_id,tax_id', d);
  perform pg_temp.ok('overseas country_code AE', (select country_code from public.vendor_profiles where id = u) = 'AE');
  r := pg_temp.submit(u, gen_random_uuid(), pg_temp.overseas_payload(u));
  perform pg_temp.ok('second submit while pending → awaiting_approval', r like 'ERR P0001 awaiting_approval%', r);
exception when others then perform pg_temp.ok('overseas', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-wa'); r text;
begin
  r := pg_temp.submit(u, gen_random_uuid(), jsonb_set(pg_temp.india_payload(u), '{whatsapp_updates}', 'true'));
  perform pg_temp.ok('whatsapp_updates true → consent row, source onboarding',
    (select opted_in and source = 'onboarding' from public.contact_consent where profile_id = u and channel = 'whatsapp'), r);
exception when others then perform pg_temp.ok('whatsapp consent', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-cat'); p jsonb; r text;
begin
  perform pg_temp.obj('catalogues', u || '/onboarding.pdf');
  p := jsonb_set(pg_temp.india_payload(u), '{documents,catalogue_pdf}',
         jsonb_build_object('url', 'http://127.0.0.1:54321/storage/v1/object/public/catalogues/' || u || '/onboarding.pdf',
                            'title', 'Our range'));
  r := pg_temp.submit(u, gen_random_uuid(), p);
  perform pg_temp.ok('catalogue_pdf on Free → one catalogues row under_review',
    (select count(*) from public.catalogues where vendor_id = u and status = 'under_review') = 1, r);
exception when others then perform pg_temp.ok('catalogue pdf', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t2-sign'); n int;
begin
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (u, 'Harness Legacy', true);
  perform pg_temp.obj('business-docs', u || '/contract/legacy.png');
  perform pg_temp.claims(u);
  begin
    set local role authenticated;
    perform public.sign_supplier_agreement('Legacy Owner', u || '/contract/legacy.png');
    perform public.sign_supplier_agreement('Legacy Owner', null);
    reset role;
  exception when others then
    perform pg_temp.ok('sign_supplier_agreement adds one contract once', false, sqlstate || ' ' || sqlerrm);
  end;
  select count(*) into n from public.vendor_contracts where vendor_id = u;
  perform pg_temp.ok('sign_supplier_agreement adds one contract once', n = 1, 'contracts=' || n);
exception when others then perform pg_temp.ok('sign agreement', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare r text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    perform public.submit_vendor_registration(gen_random_uuid(), '{}'::jsonb);
    reset role;
    r := 'accepted';
  exception when others then r := sqlstate;
  end;
  perform pg_temp.ok('anon cannot submit a registration', r = '42501', r);
end $c$;
rollback to savepoint c;

-- ═════════════════════════════ Task 3: the flag and the photo cache are server-owned ══════════
-- Run one statement as the account; returns 'ok' or the SQLSTATE.
create function pg_temp.as_seller(u uuid, stmt text) returns text
language plpgsql as $$
begin
  perform pg_temp.claims(u);
  begin
    set local role authenticated;
    execute stmt;
    reset role;
    return 'ok';
  exception when others then
    return sqlstate;
  end;
end $$;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t3-ins'); r text;
begin
  r := pg_temp.as_seller(u, format('insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (%L, %L, true)', u, 'Bypass Co'));
  perform pg_temp.ok('browser insert onboarding_complete=true → 42501 (the audit''s bypass POST)', r = '42501', r);
  r := pg_temp.as_seller(u, format('insert into public.vendor_profiles (id, brand_name, office_photos) values (%L, %L, %L)',
                                   u, 'Photo Co', array[pg_temp.pub(u || '/office/x.jpg')]));
  perform pg_temp.ok('browser insert with office_photos → 42501', r = '42501', r);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t3-upd'); r text;
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Plain Co');
  r := pg_temp.as_seller(u, format('update public.vendor_profiles set onboarding_complete = true where id = %L', u));
  perform pg_temp.ok('browser update onboarding_complete → 42501', r = '42501', r);
  r := pg_temp.as_seller(u, format('update public.vendor_profiles set office_photos = %L where id = %L',
                                   array[pg_temp.pub(u || '/office/x.jpg')], u));
  perform pg_temp.ok('browser update office_photos → 42501', r = '42501', r);
  r := pg_temp.as_seller(u, format('update public.vendor_profiles set brand_name = %L where id = %L', 'Renamed Co', u));
  perform pg_temp.ok('browser update brand_name still works',
    r = 'ok' and (select brand_name from public.vendor_profiles where id = u) = 'Renamed Co', r);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare u uuid := pg_temp.new_user('t3-rpc'); r text;
begin
  r := pg_temp.submit(u, gen_random_uuid(), pg_temp.india_payload(u));
  perform pg_temp.ok('submit RPC still sets the flag',
    r = 'registered' and (select onboarding_complete from public.vendor_profiles where id = u), r);
end $c$;
rollback to savepoint c;

-- @@TASK4@@

rollback;
