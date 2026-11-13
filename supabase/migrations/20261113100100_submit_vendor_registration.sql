-- Vendor registration, part 2: one submit that writes everything or nothing (onboarding audit fixes #1 #5 and
-- the data fixes #6 #7 #10 #11 #12 #13 #17; Mitra, 2026-11-13).
--
-- submit_vendor_registration(submission, payload) replaces the browser's chain of writes. In ONE transaction,
-- under the seller's own advisory lock, it checks every field and file and writes the profile, the documents,
-- the first product and its photos, the premises photos, a catalogue, the signed Supplier Agreement, the
-- WhatsApp opt-in, the account's role and the submission record. The registered flag goes on LAST, and only
-- for a seller in India: an overseas seller waits for staff approval (admin_vendor_registration_decide).
-- The same submission id twice returns the first answer, so a retry can never write a second product.
--
-- sign_supplier_agreement() lets a seller who was registered without an agreement on file sign one.
--
-- The app sends files it has ALREADY uploaded: private ones (business-docs, `<uid>/kyc/…`, `<uid>/contract/…`) as
-- paths, public ones (product-images `<uid>/…`, catalogues `<uid>/…`) as public URLs. Each must exist and be the
-- caller's. Refusals are SQLSTATE 22023 with one key as the message (src/lib/errorMessage.ts maps them).

-- ── Overseas document types ──────────────────────────────────────────────────
alter table public.vendor_documents drop constraint if exists vendor_documents_doc_type_check;
alter table public.vendor_documents add constraint vendor_documents_doc_type_check
  check (doc_type = any (array['pan', 'gst', 'cin', 'aadhaar', 'business_image', 'business_registration', 'catalog',
                               'tax_id', 'owner_id']));

alter table public.vendor_documents drop constraint if exists vendor_documents_detail_check;
alter table public.vendor_documents add constraint vendor_documents_detail_check
  check (
    jsonb_typeof(detail) = 'object'
    and (doc_type <> 'business_registration'
         or coalesce(detail ->> 'kind', '') in ('udyam', 'incorporation', 'shop_establishment', 'partnership', 'other',
                                               'foreign_registration'))
    and (doc_type <> 'aadhaar' or coalesce(detail ->> 'masked', '') = 'true')
    and (doc_type <> 'owner_id' or coalesce(detail ->> 'kind', '') in ('passport', 'national_id'))
    and (doc_type not in ('business_registration', 'aadhaar', 'catalog', 'tax_id', 'owner_id') or file_url is not null)
  );

-- ── Helpers (closed to browsers) ─────────────────────────────────────────────
create or replace function admin.reg_fail(p_key text)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  raise exception '%', p_key using errcode = '22023';
end
$function$;

-- Trimmed text, inner runs of space collapsed; NULL when empty.
create or replace function admin.reg_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '')
$function$;

-- A private file the caller uploaded: `<uid>/kyc/<name>` or `<uid>/contract/<name>` in business-docs, existing.
create or replace function admin.reg_private_file_ok(p_uid uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_path is not null
     and p_path ~ ('^' || p_uid::text || '/(kyc|contract)/[A-Za-z0-9._-]{1,120}$')
     and p_path !~ '\.\.'
     and exists (select 1 from storage.objects o where o.bucket_id = 'business-docs' and o.name = p_path)
$function$;

-- A public file the caller uploaded: this project's plain public URL in the bucket, under `<uid>/`, existing.
create or replace function admin.reg_public_file_ok(p_uid uuid, p_bucket text, p_url text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  -- Cosora's own Storage, not just its path (review #1), the caller's folder, and the object exists.
  return public.own_storage_object(p_url, p_bucket, p_uid);
end
$function$;

revoke all on function admin.reg_fail(text) from public, anon, authenticated;
revoke all on function admin.reg_text(text) from public, anon, authenticated;
revoke all on function admin.reg_private_file_ok(uuid, text) from public, anon, authenticated;
revoke all on function admin.reg_public_file_ok(uuid, text, text) from public, anon, authenticated;

-- ── The submit ───────────────────────────────────────────────────────────────
create or replace function public.submit_vendor_registration(p_submission uuid, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  c_agreement constant text := '2026-09-v1';  -- SUPPLIER_AGREEMENT_VERSION (src/lib/supplierAgreement.ts)
  v_uid      uuid := auth.uid();
  v_prev     record;
  v_country  text;
  v_india    boolean;
  v_name     text;
  v_phone    text;
  v_wa       text;
  v_web      text;
  v_addr     jsonb;
  v_owner    jsonb;
  v_docs     jsonb;
  v_email    text;
  v_owner_nm text;
  v_city     text;
  v_area     text;
  v_state    text;
  v_postal   text;
  v_type     text;
  v_type_lbl text;
  v_caps     text[];
  v_cats     text[];
  v_photos   text[];
  v_pan      text;
  v_gstin    text;
  v_cin      text;
  v_kind     text;
  v_regno    text;
  v_prod     jsonb;
  v_price    numeric;
  v_moq      bigint;
  v_imgs     text[];
  v_cat      jsonb;
  v_pdf      jsonb;
  v_contract jsonb;
  v_sign     text;
  v_plan     text;
  v_limit    integer;
  v_used     integer;
  v_product  uuid;
  v_status   text;
  v_result   jsonb;
  v_prev_product   uuid;
  v_prev_catalogue uuid;
  v_catalogue      uuid;
  v_old_public     jsonb := '[]'::jsonb;
  v_old_files text[];
  v_doc_types text[];
  x          jsonb;
  i          integer;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not coalesce(public.account_is_active(v_uid), false) then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if p_submission is null or p is null or jsonb_typeof(p) <> 'object' then
    perform admin.reg_fail('invalid_payload');
  end if;
  if octet_length(p::text) > 65536 then
    perform admin.reg_fail('payload_too_large');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cosora.vendor_registration:' || v_uid::text, 0));

  -- The same submit again: the first answer, nothing written twice.
  select r.vendor_id, r.status, r.result into v_prev from public.vendor_registrations r where r.id = p_submission;
  if found then
    if v_prev.vendor_id is distinct from v_uid then
      raise exception 'not your submission' using errcode = '42501';
    end if;
    -- Sent back since: this submission is closed, and the form starts a new one (review #7).
    if v_prev.status = 'rejected' then
      raise exception 'submission_closed' using errcode = 'P0001';
    end if;
    return v_prev.result;
  end if;
  if exists (select 1 from public.vendor_profiles v where v.id = v_uid and v.onboarding_complete) then
    raise exception 'already_registered' using errcode = 'P0001';
  end if;
  if (select r.status from public.vendor_registrations r where r.vendor_id = v_uid order by r.created_at desc limit 1)
     = 'pending_review' then
    raise exception 'awaiting_approval' using errcode = 'P0001';
  end if;

  -- A seller sent back resubmits: the first product and catalogue they sent last time, never approved, are
  -- replaced by this submit's, and don't count against the plan's limits (review #4).
  select (r.result ->> 'product_id')::uuid, (r.result ->> 'catalogue_id')::uuid into v_prev_product, v_prev_catalogue
    from public.vendor_registrations r where r.vendor_id = v_uid order by r.created_at desc limit 1;
  if v_prev_product is not null
     and not exists (select 1 from public.products pr where pr.id = v_prev_product and pr.vendor_id = v_uid and pr.status::text <> 'live') then
    v_prev_product := null;
  end if;
  if v_prev_catalogue is not null
     and not exists (select 1 from public.catalogues ca where ca.id = v_prev_catalogue and ca.vendor_id = v_uid and ca.status::text <> 'live') then
    v_prev_catalogue := null;
  end if;

  -- ── Who and where ──
  v_country := upper(admin.reg_text(p ->> 'country_code'));
  if v_country is null or not exists (select 1 from public.countries c where c.code = v_country) then
    perform admin.reg_fail('invalid_country');
  end if;
  v_india := v_country = 'IN';
  if not v_india and not admin.feature_on_for('overseas_seller_registration', v_uid) then
    perform admin.reg_fail('invalid_country');
  end if;

  v_name := admin.reg_text(p ->> 'business_name');
  if v_name is null or char_length(v_name) not between 2 and 120 then
    perform admin.reg_fail('invalid_business_name');
  end if;

  v_phone := p ->> 'business_phone';
  if v_phone is null
     or (v_india and v_phone !~ '^\+91[0-9]{10}$')
     or (not v_india and (v_phone !~ '^\+[1-9][0-9]{7,14}$' or v_phone ~ '^\+91')) then
    perform admin.reg_fail('invalid_phone');
  end if;
  v_wa := nullif(p ->> 'whatsapp', '');
  if v_wa is not null and v_wa !~ '^\+[1-9][0-9]{7,14}$' then
    perform admin.reg_fail('invalid_whatsapp');
  end if;
  v_web := admin.reg_text(p ->> 'website');
  if v_web is not null and (char_length(v_web) > 200
       or v_web !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?(/[^[:space:]]*)?$') then
    perform admin.reg_fail('invalid_website');
  end if;

  v_owner := coalesce(p -> 'owner', '{}'::jsonb);
  v_owner_nm := admin.reg_text(v_owner ->> 'name');
  if v_owner_nm is null or char_length(v_owner_nm) not between 2 and 120 then
    perform admin.reg_fail('invalid_owner_name');
  end if;
  v_email := lower(admin.reg_text(v_owner ->> 'email'));
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:].]{2,}$' then
    perform admin.reg_fail('invalid_email');
  end if;

  v_addr := coalesce(p -> 'address', '{}'::jsonb);
  v_area := admin.reg_text(v_addr ->> 'area');
  if v_area is null or char_length(v_area) > 120 or char_length(coalesce(admin.reg_text(v_addr ->> 'line'), '')) > 120
     or char_length(coalesce(admin.reg_text(v_addr ->> 'landmark'), '')) > 120 then
    perform admin.reg_fail('invalid_address');
  end if;
  v_city := admin.reg_text(v_addr ->> 'city');
  if v_city is null or char_length(v_city) not between 2 and 80 then
    perform admin.reg_fail('invalid_city');
  end if;
  v_state := admin.reg_text(v_addr ->> 'state');
  v_postal := admin.reg_text(v_addr ->> 'postal_code');
  if v_india then
    if public.state_code_for(v_state) is null then
      perform admin.reg_fail('invalid_state');
    end if;
    v_state := (select s.name from public.india_states s where s.code = public.state_code_for(v_state));
    if v_postal is null or v_postal !~ '^[1-9][0-9]{5}$' then
      perform admin.reg_fail('invalid_postal_code');
    end if;
  else
    if char_length(coalesce(v_state, '')) > 80 then
      perform admin.reg_fail('invalid_state');
    end if;
    if v_postal is null or v_postal !~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$' then
      perform admin.reg_fail('invalid_postal_code');
    end if;
  end if;

  -- ── What the business is (Ranking F2's type and capabilities) ──
  v_type := p ->> 'primary_type';
  v_type_lbl := case v_type
    when 'manufacturer' then 'Manufacturer' when 'trader_wholesaler' then 'Trader / Wholesaler'
    when 'retailer' then 'Retailer' when 'job_worker' then 'Job worker'
    when 'service_provider' then 'Service provider' when 'freelancer' then 'Freelancer' end;
  if v_type_lbl is null then
    perform admin.reg_fail('invalid_primary_type');
  end if;
  if jsonb_typeof(coalesce(p -> 'capabilities', '[]'::jsonb)) <> 'array' then
    perform admin.reg_fail('invalid_capability');
  end if;
  select coalesce(array_agg(distinct c), '{}') into v_caps from jsonb_array_elements_text(coalesce(p -> 'capabilities', '[]'::jsonb)) c;
  if exists (select 1 from unnest(v_caps) c
              where c not in ('private_label', 'made_to_order', 'export_ready', 'sampling', 'sustainable')) then
    perform admin.reg_fail('invalid_capability');
  end if;
  if jsonb_typeof(coalesce(p -> 'categories', 'null'::jsonb)) <> 'array' then
    perform admin.reg_fail('invalid_categories');
  end if;
  select coalesce(array_agg(distinct admin.reg_text(c)) filter (where admin.reg_text(c) is not null), '{}')
    into v_cats from jsonb_array_elements_text(p -> 'categories') c;
  if cardinality(v_cats) not between 1 and 20 or exists (select 1 from unnest(v_cats) c where char_length(c) > 80) then
    perform admin.reg_fail('invalid_categories');
  end if;

  -- ── Premises photos: at least one, at most 12, each the caller's own upload ──
  if jsonb_typeof(coalesce(p -> 'premises_photos', 'null'::jsonb)) <> 'array' then
    perform admin.reg_fail('missing_premises_photo');
  end if;
  select coalesce(array_agg(u order by o), '{}') into v_photos
    from jsonb_array_elements_text(p -> 'premises_photos') with ordinality as t(u, o);
  if cardinality(v_photos) = 0 then
    perform admin.reg_fail('missing_premises_photo');
  end if;
  if cardinality(v_photos) + (select count(*) from public.vendor_premises_photos ph
                                 where ph.vendor_id = v_uid and ph.status = 'live') > 12 then
    perform admin.reg_fail('premises_photo_limit');
  end if;
  if exists (select 1 from unnest(v_photos) u where not admin.reg_public_file_ok(v_uid, 'product-images', u)) then
    perform admin.reg_fail('invalid_file');
  end if;

  -- ── Documents: India's set or the overseas set ──
  v_docs := coalesce(p -> 'documents', '{}'::jsonb);
  if v_india then
    if jsonb_typeof(v_docs -> 'tax_id') = 'object' or jsonb_typeof(v_docs -> 'owner_id') = 'object' then
      perform admin.reg_fail('invalid_registration');
    end if;
    if jsonb_typeof(v_docs -> 'pan') <> 'object' or jsonb_typeof(v_docs -> 'registration') <> 'object'
       or jsonb_typeof(v_docs -> 'aadhaar') is distinct from 'object' then
      perform admin.reg_fail('missing_document');
    end if;
    v_pan := upper(replace(coalesce(v_docs #>> '{pan,number}', ''), ' ', ''));
    if not coalesce(public.pan_is_valid(v_pan), false)
       or char_length(coalesce(admin.reg_text(v_docs #>> '{pan,holder_name}'), '')) not between 3 and 120
       or char_length(coalesce(admin.reg_text(v_docs #>> '{pan,address}'), '')) not between 5 and 300 then
      perform admin.reg_fail('invalid_pan');
    end if;
    if not admin.reg_private_file_ok(v_uid, v_docs #>> '{pan,path}') then
      perform admin.reg_fail('invalid_file');
    end if;
    if jsonb_typeof(v_docs -> 'gst') = 'object' then
      v_gstin := upper(replace(coalesce(v_docs #>> '{gst,number}', ''), ' ', ''));
      if not coalesce(public.gstin_is_valid(v_gstin), false) then
        perform admin.reg_fail('invalid_gstin');
      end if;
      if substr(v_gstin, 3, 10) <> v_pan then
        perform admin.reg_fail('gstin_pan_mismatch');
      end if;
      if not admin.reg_private_file_ok(v_uid, v_docs #>> '{gst,path}') then
        perform admin.reg_fail('invalid_file');
      end if;
    end if;
    v_kind := v_docs #>> '{registration,kind}';
    v_regno := upper(admin.reg_text(v_docs #>> '{registration,number}'));
    if coalesce(v_kind, '') not in ('udyam', 'incorporation', 'shop_establishment', 'partnership', 'other')
       or (v_kind = 'udyam' and coalesce(v_regno, '') !~ '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$')
       or (v_kind = 'incorporation'
           and coalesce(v_regno, '') !~ '^([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}|[A-Z]{3}-[0-9]{4})$')
       or char_length(coalesce(v_regno, '')) > 60 then
      perform admin.reg_fail('invalid_registration');
    end if;
    if v_kind = 'incorporation' then
      v_cin := v_regno;
    end if;
    if not admin.reg_private_file_ok(v_uid, v_docs #>> '{registration,path}')
       or not admin.reg_private_file_ok(v_uid, v_docs #>> '{aadhaar,path}') then
      perform admin.reg_fail('invalid_file');
    end if;
  else
    if jsonb_typeof(v_docs -> 'pan') = 'object' or jsonb_typeof(v_docs -> 'gst') = 'object'
       or jsonb_typeof(v_docs -> 'aadhaar') = 'object' then
      perform admin.reg_fail('invalid_registration');
    end if;
    if jsonb_typeof(v_docs -> 'registration') is distinct from 'object'
       or jsonb_typeof(v_docs -> 'owner_id') is distinct from 'object' then
      perform admin.reg_fail('missing_document');
    end if;
    v_kind := v_docs #>> '{registration,kind}';
    v_regno := upper(admin.reg_text(v_docs #>> '{registration,number}'));
    if v_kind is distinct from 'foreign_registration' or v_regno is null or char_length(v_regno) > 60
       or coalesce(v_docs #>> '{owner_id,kind}', '') not in ('passport', 'national_id')
       or (jsonb_typeof(v_docs -> 'tax_id') = 'object'
           and char_length(coalesce(admin.reg_text(v_docs #>> '{tax_id,number}'), '')) not between 2 and 40) then
      perform admin.reg_fail('invalid_registration');
    end if;
    if not admin.reg_private_file_ok(v_uid, v_docs #>> '{registration,path}')
       or not admin.reg_private_file_ok(v_uid, v_docs #>> '{owner_id,path}')
       or (jsonb_typeof(v_docs -> 'tax_id') = 'object' and not admin.reg_private_file_ok(v_uid, v_docs #>> '{tax_id,path}')) then
      perform admin.reg_fail('invalid_file');
    end if;
  end if;

  -- Catalogue files (staff reference) and the one PDF for the store.
  v_cat := coalesce(v_docs -> 'catalogue', '[]'::jsonb);
  if jsonb_typeof(v_cat) <> 'array' or jsonb_array_length(v_cat) > 5 then
    perform admin.reg_fail('invalid_file');
  end if;
  for x in select value from jsonb_array_elements(v_cat) loop
    if not admin.reg_private_file_ok(v_uid, x ->> 'path')
       or char_length(coalesce(x ->> 'name', '')) not between 1 and 200 or char_length(coalesce(x ->> 'mime', '')) > 120 then
      perform admin.reg_fail('invalid_file');
    end if;
  end loop;
  v_pdf := v_docs -> 'catalogue_pdf';
  if jsonb_typeof(v_pdf) = 'object' then
    if not admin.reg_public_file_ok(v_uid, 'catalogues', v_pdf ->> 'url')
       or (v_pdf ->> 'url') !~* '\.pdf$'
       or char_length(coalesce(admin.reg_text(v_pdf ->> 'title'), '')) not between 1 and 120 then
      perform admin.reg_fail('invalid_file');
    end if;
  else
    v_pdf := null;
  end if;

  -- ── The first product (or a catalogue in its place) ──
  v_prod := p -> 'product';
  if jsonb_typeof(v_prod) = 'object' then
    if char_length(coalesce(admin.reg_text(v_prod ->> 'name'), '')) not between 2 and 140
       or jsonb_typeof(v_prod -> 'price') is distinct from 'number'
       or (v_prod ->> 'moq' is not null and jsonb_typeof(v_prod -> 'moq') <> 'number')
       or coalesce(v_prod ->> 'unit', 'pieces') not in ('pieces', 'kg', 'meters', 'sets', 'pairs')
       or char_length(coalesce(v_prod ->> 'fabric', '')) > 60 or char_length(coalesce(v_prod ->> 'gsm', '')) > 20
       or char_length(coalesce(v_prod ->> 'colour', '')) > 40
       or jsonb_typeof(coalesce(v_prod -> 'sizes', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v_prod -> 'sizes', '[]'::jsonb)) > 40
       or jsonb_typeof(coalesce(v_prod -> 'images', 'null'::jsonb)) <> 'array' then
      perform admin.reg_fail('invalid_product');
    end if;
    v_price := (v_prod ->> 'price')::numeric;
    if v_price <= 0 or v_price > 10000000 then
      perform admin.reg_fail('invalid_product');
    end if;
    if v_prod ->> 'moq' is not null then
      -- Checked as a number before it is stored as one (a huge value overflowed the cast: review #9).
      if (v_prod ->> 'moq')::numeric not between 1 and 10000000
         or (v_prod ->> 'moq')::numeric <> trunc((v_prod ->> 'moq')::numeric) then
        perform admin.reg_fail('invalid_product');
      end if;
      v_moq := (v_prod ->> 'moq')::numeric;
    end if;
    if v_prod ->> 'category_id' is not null
       and not exists (select 1 from public.categories c where c.id::text = v_prod ->> 'category_id') then
      perform admin.reg_fail('invalid_product');
    end if;
    select coalesce(array_agg(u order by o), '{}') into v_imgs
      from jsonb_array_elements_text(v_prod -> 'images') with ordinality as t(u, o);
    if cardinality(v_imgs) not between 1 and 6 then
      perform admin.reg_fail('invalid_product');
    end if;
    if exists (select 1 from unnest(v_imgs) u where not admin.reg_public_file_ok(v_uid, 'product-images', u)) then
      perform admin.reg_fail('invalid_file');
    end if;
  else
    v_prod := null;
  end if;
  if v_prod is null and jsonb_array_length(v_cat) = 0 and v_pdf is null then
    perform admin.reg_fail('missing_document');
  end if;

  -- ── The Supplier Agreement ──
  v_contract := coalesce(p -> 'contract', '{}'::jsonb);
  v_sign := admin.reg_text(v_contract ->> 'signed_name');
  if v_sign is null or char_length(v_sign) not between 2 and 120
     or v_contract ->> 'agreement_version' is distinct from c_agreement
     or (v_contract ->> 'signature_path' is not null and not admin.reg_private_file_ok(v_uid, v_contract ->> 'signature_path')) then
    perform admin.reg_fail('invalid_contract');
  end if;

  -- ── Limits: the plan's listing cap and catalogue allowance, under the cap trigger's lock ──
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  v_plan := public.vendor_cap_plan(v_uid);
  if v_prod is not null then
    select coalesce((sp.limits ->> 'product_cap')::int, -1) into v_limit from public.subscription_plans sp where sp.id = v_plan;
    select count(*) into v_used from public.products pr
     where pr.vendor_id = v_uid and pr.status::text in ('under_review', 'live') and pr.id is distinct from v_prev_product;
    if coalesce(v_limit, -1) >= 0 and v_used >= v_limit then
      perform admin.reg_fail('too_many_products');
    end if;
  end if;
  if v_pdf is not null then
    perform pg_advisory_xact_lock(hashtextextended('cosora.catalogue_cap:' || v_uid::text, 0));
    select coalesce((sp.limits ->> 'catalogues_max')::int, -1) into v_limit from public.subscription_plans sp where sp.id = v_plan;
    select count(*) into v_used from public.catalogues ca
     where ca.vendor_id = v_uid and ca.status::text in ('draft', 'under_review', 'live') and ca.id is distinct from v_prev_catalogue;
    if coalesce(v_limit, -1) >= 0 and v_used >= v_limit then
      perform admin.reg_fail('catalogue_limit');
    end if;
  end if;

  -- ═════ Writes. Nothing above wrote anything. ═════
  insert into public.vendor_profiles as v
    (id, brand_name, phone, whatsapp, website, address_line, area, city, state, postal_code, landmark,
     owner_name, owner_email, country, country_code, pan, gstin, cin, category, primary_type, business_type, capabilities)
  values
    (v_uid, v_name, v_phone, v_wa, v_web, admin.reg_text(v_addr ->> 'line'), v_area, v_city, v_state, v_postal,
     admin.reg_text(v_addr ->> 'landmark'), v_owner_nm, v_email,
     (select c.name from public.countries c where c.code = v_country), v_country,
     case when v_india then v_pan end, case when v_india then v_gstin end, v_cin, v_cats, v_type, v_type_lbl, v_caps)
  on conflict (id) do update set
    brand_name = excluded.brand_name, phone = excluded.phone, whatsapp = excluded.whatsapp, website = excluded.website,
    address_line = excluded.address_line, area = excluded.area, city = excluded.city, state = excluded.state,
    postal_code = excluded.postal_code, landmark = excluded.landmark, owner_name = excluded.owner_name,
    owner_email = excluded.owner_email, country = excluded.country, country_code = excluded.country_code,
    pan = excluded.pan, gstin = excluded.gstin, cin = excluded.cin, category = excluded.category,
    primary_type = excluded.primary_type, business_type = excluded.business_type, capabilities = excluded.capabilities;

  -- Documents: this submit's set replaces the seller's earlier rows of the same types. The old files are
  -- returned so the app removes them (a row delete never removes a storage object).
  v_doc_types := case when v_india then array['pan', 'gst', 'business_registration', 'aadhaar', 'catalog']
                      else array['business_registration', 'tax_id', 'owner_id', 'catalog'] end;
  select coalesce(array_agg(d.file_url) filter (where d.file_url is not null and d.file_url !~ '^https?://'), '{}')
    into v_old_files
    from public.vendor_documents d where d.vendor_id = v_uid and d.doc_type = any (v_doc_types);
  delete from public.vendor_documents d where d.vendor_id = v_uid and d.doc_type = any (v_doc_types);

  if v_india then
    insert into public.vendor_documents (vendor_id, doc_type, file_url, detail) values
      (v_uid, 'pan', v_docs #>> '{pan,path}',
       jsonb_build_object('holder_name', admin.reg_text(v_docs #>> '{pan,holder_name}'),
                          'address', admin.reg_text(v_docs #>> '{pan,address}'))),
      (v_uid, 'business_registration', v_docs #>> '{registration,path}',
       jsonb_strip_nulls(jsonb_build_object('kind', v_kind, 'number', v_regno))),
      (v_uid, 'aadhaar', v_docs #>> '{aadhaar,path}', jsonb_build_object('masked', true, 'consent_at', now()));
    if v_gstin is not null then
      insert into public.vendor_documents (vendor_id, doc_type, file_url, detail)
      values (v_uid, 'gst', v_docs #>> '{gst,path}', jsonb_build_object('number', v_gstin));
    end if;
  else
    insert into public.vendor_documents (vendor_id, doc_type, file_url, detail) values
      (v_uid, 'business_registration', v_docs #>> '{registration,path}',
       jsonb_build_object('kind', 'foreign_registration', 'number', v_regno, 'country', v_country)),
      (v_uid, 'owner_id', v_docs #>> '{owner_id,path}',
       jsonb_build_object('kind', v_docs #>> '{owner_id,kind}', 'country', v_country));
    if jsonb_typeof(v_docs -> 'tax_id') = 'object' then
      insert into public.vendor_documents (vendor_id, doc_type, file_url, detail)
      values (v_uid, 'tax_id', v_docs #>> '{tax_id,path}',
              jsonb_build_object('number', upper(admin.reg_text(v_docs #>> '{tax_id,number}')), 'country', v_country));
    end if;
  end if;
  for x in select value from jsonb_array_elements(v_cat) loop
    insert into public.vendor_documents (vendor_id, doc_type, file_url, detail)
    values (v_uid, 'catalog', x ->> 'path', jsonb_build_object('name', left(x ->> 'name', 200), 'mime', left(coalesce(x ->> 'mime', ''), 120)));
  end loop;

  -- Premises photos: this submit's set replaces any that were never approved; their files go back to the browser
  -- to remove (the rows first, so the files are no longer in use).
  with gone as (
    delete from public.vendor_premises_photos ph where ph.vendor_id = v_uid and ph.status <> 'live' returning ph.url)
  select v_old_public || coalesce(jsonb_agg(jsonb_build_object('bucket', 'product-images',
           'path', substring(g.url from '/storage/v1/object/public/product-images/(.*)$'))), '[]'::jsonb)
    into v_old_public from gone g;
  -- The first product and catalogue a sent-back submission left in review (review #4).
  if v_prev_product is not null then
    select v_old_public || coalesce(jsonb_agg(jsonb_build_object('bucket', 'product-images',
             'path', substring(pi.url from '/storage/v1/object/public/product-images/(.*)$'))), '[]'::jsonb)
      into v_old_public from public.product_images pi where pi.product_id = v_prev_product;
    delete from public.products pr where pr.id = v_prev_product;
  end if;
  if v_prev_catalogue is not null then
    select v_old_public || coalesce(jsonb_agg(jsonb_build_object('bucket', 'catalogues',
             'path', substring(ca.file_url from '/storage/v1/object/public/catalogues/(.*)$'))), '[]'::jsonb)
      into v_old_public from public.catalogues ca where ca.id = v_prev_catalogue;
    delete from public.catalogues ca where ca.id = v_prev_catalogue;
  end if;
  for i in 1 .. cardinality(v_photos) loop
    insert into public.vendor_premises_photos (vendor_id, url, position, status) values (v_uid, v_photos[i], i - 1, 'under_review');
  end loop;

  if v_prod is not null then
    insert into public.products (vendor_id, name, price_value, currency, category_id, moq, unit, fabric, gsm, sizes, colour, status)
    values (v_uid, admin.reg_text(v_prod ->> 'name'), v_price, '₹', (v_prod ->> 'category_id')::uuid,
            case when v_moq is not null then v_moq::text end, coalesce(v_prod ->> 'unit', 'pieces'),
            admin.reg_text(v_prod ->> 'fabric'), admin.reg_text(v_prod ->> 'gsm'),
            nullif(array(select admin.reg_text(s) from jsonb_array_elements_text(coalesce(v_prod -> 'sizes', '[]'::jsonb)) s
                          where admin.reg_text(s) is not null), '{}'),
            admin.reg_text(v_prod ->> 'colour'), 'under_review')
    returning id into v_product;
    for i in 1 .. cardinality(v_imgs) loop
      insert into public.product_images (product_id, url, position) values (v_product, v_imgs[i], i - 1);
    end loop;
  end if;

  if v_pdf is not null then
    insert into public.catalogues (vendor_id, title, file_url, status)
    values (v_uid, admin.reg_text(v_pdf ->> 'title'), v_pdf ->> 'url', 'under_review')
    returning id into v_catalogue;
  end if;

  if not exists (select 1 from public.vendor_contracts vc where vc.vendor_id = v_uid and vc.agreement_version = c_agreement) then
    insert into public.vendor_contracts (vendor_id, signed_name, signature_url, agreement_version)
    values (v_uid, v_sign, v_contract ->> 'signature_path', c_agreement);
  end if;

  if jsonb_typeof(p -> 'whatsapp_updates') = 'boolean' and (p ->> 'whatsapp_updates')::boolean then
    perform public.set_contact_consent('whatsapp', true, 'onboarding');
  end if;

  update public.profiles pr set active_role = 'seller', onboarded = true where pr.id = v_uid;

  v_status := case when v_india then 'registered' else 'pending_review' end;
  -- The files handed back to remove are only those nothing points at any more: a resubmission may send the same
  -- file again, and removing it would break the new row.
  v_result := jsonb_build_object('status', v_status, 'submission_id', p_submission,
    'superseded_files', (select coalesce(jsonb_agg(o.f), '[]'::jsonb) from unnest(v_old_files) as o(f)
                          where not exists (select 1 from public.vendor_documents d where d.vendor_id = v_uid and d.file_url = o.f)
                            and o.f is distinct from v_contract ->> 'signature_path'),
    'superseded_public', (select coalesce(jsonb_agg(sp.f), '[]'::jsonb)
                            from jsonb_array_elements(v_old_public) as sp(f)
                           where sp.f ->> 'path' is not null
                             and not public.storage_object_in_use(sp.f ->> 'bucket', sp.f ->> 'path')
                             and not public.premises_photo_file_in_use(sp.f ->> 'bucket', sp.f ->> 'path')),
    'product_id', v_product, 'catalogue_id', v_catalogue);
  insert into public.vendor_registrations (id, vendor_id, country_code, status, result)
  values (p_submission, v_uid, v_country, v_status, v_result);

  -- Last: the flag that makes this a registered seller (an overseas seller gets it on approval).
  if v_india then
    update public.vendor_profiles v set onboarding_complete = true where v.id = v_uid;
  end if;
  return v_result;
end
$function$;
revoke all on function public.submit_vendor_registration(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_vendor_registration(uuid, jsonb) to authenticated;

-- ── A registered seller with no agreement on file signs one ──────────────────
create or replace function public.sign_supplier_agreement(p_signed_name text, p_signature_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  c_agreement constant text := '2026-09-v1';  -- SUPPLIER_AGREEMENT_VERSION
  v_uid  uuid := auth.uid();
  v_name text := admin.reg_text(p_signed_name);
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendor_profiles v where v.id = v_uid) then
    raise exception 'not a seller' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 120
     or (p_signature_path is not null and not admin.reg_private_file_ok(v_uid, p_signature_path)) then
    perform admin.reg_fail('invalid_contract');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cosora.vendor_registration:' || v_uid::text, 0));
  if not exists (select 1 from public.vendor_contracts vc where vc.vendor_id = v_uid and vc.agreement_version = c_agreement) then
    insert into public.vendor_contracts (vendor_id, signed_name, signature_url, agreement_version)
    values (v_uid, v_name, p_signature_path, c_agreement);
  end if;
end
$function$;
revoke all on function public.sign_supplier_agreement(text, text) from public, anon, authenticated;
grant execute on function public.sign_supplier_agreement(text, text) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('anon', 'public.submit_vendor_registration(uuid, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.sign_supplier_agreement(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'admin.reg_private_file_ok(uuid, text)', 'EXECUTE') then
    raise exception 'self-check: registration functions are open to the wrong roles';
  end if;
  if not has_function_privilege('authenticated', 'public.submit_vendor_registration(uuid, jsonb)', 'EXECUTE') then
    raise exception 'self-check: signed-in sellers must be able to submit';
  end if;
end
$check$;
