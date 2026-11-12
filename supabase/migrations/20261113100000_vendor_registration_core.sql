-- Vendor registration, part 1: the state a registration is in, who is exempt, the two switches, the Free plan's
-- one catalogue, and premises photos that wait for review (Mitra, 2026-11-13; onboarding audit fixes 1–20).
--
--   vendor_profiles.country_code   the seller's country (public.countries), kept in step with `country`
--   vendor_registrations           one row per registration submit: pending_review (overseas), registered, rejected
--   admin.registration_exempt      Cosora's own demo sellers, which count as registered (Mitra D2)
--   seller_registration_required   switch: publishing needs a registered seller (enforced in 20261113100200)
--   overseas_seller_registration   switch: sellers outside India may register
--   limits.catalogues_max          Free 1 PDF catalogue on the store, paid plans unlimited (Mitra, 2026-11-13)
--   vendor_premises_photos         a seller's premises photos; buyers see only approved ones, cached in
--                                  vendor_profiles.office_photos so the storefront needs no extra query
--   seller_registered(vendor)      the one rule for "may this seller publish"
--   my_seller_registration()       what the app shows the seller about their own registration

-- ── 1. The seller's country, as a code ───────────────────────────────────────
alter table public.vendor_profiles
  add column if not exists country_code text references public.countries (code);

create or replace function admin.sync_vendor_country_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- The writer's code wins; otherwise the code follows the country name (sync_state_code's rule).
  if tg_op = 'INSERT' then
    if new.country_code is null then
      new.country_code := coalesce(public.country_code_for(new.country), case when new.country is null then 'IN' end);
    end if;
  elsif new.country is distinct from old.country and new.country_code is not distinct from old.country_code then
    new.country_code := public.country_code_for(new.country);
  end if;
  return new;
end
$function$;
revoke all on function admin.sync_vendor_country_code() from public, anon, authenticated;

create trigger trg_vendor_profiles_country_code
  before insert or update of country, country_code on public.vendor_profiles
  for each row execute function admin.sync_vendor_country_code();

update public.vendor_profiles
   set country_code = coalesce(public.country_code_for(country), 'IN')
 where country_code is null and (country is null or country ilike 'india' or public.country_code_for(country) is not null);

grant select (country_code) on public.vendor_profiles to anon, authenticated;

-- ── 2. Registration submissions ──────────────────────────────────────────────
create table public.vendor_registrations (
  id           uuid primary key,
  vendor_id    uuid not null references public.profiles (id) on delete cascade,
  country_code text not null references public.countries (code),
  status       text not null check (status in ('pending_review', 'registered', 'rejected')),
  reason       text check (reason is null or char_length(reason) <= 1000),
  result       jsonb not null default '{}'::jsonb,
  decided_by   uuid,
  decided_at   timestamptz,
  created_at   timestamptz not null default clock_timestamp()
);
comment on table public.vendor_registrations is
  'One row per seller registration submit (submit_vendor_registration). Written only by definer functions.';

create index vendor_registrations_vendor_idx on public.vendor_registrations (vendor_id, created_at desc);
create index vendor_registrations_pending_idx on public.vendor_registrations (created_at, id) where status = 'pending_review';

alter table public.vendor_registrations enable row level security;
revoke all on public.vendor_registrations from anon, authenticated;
grant select on public.vendor_registrations to authenticated;

create policy vendor_registrations_select on public.vendor_registrations
  for select to authenticated
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'vendor_ops', 'support']::public.admin_role_type[])));

create trigger trg_admin_audit
  after insert or update or delete on public.vendor_registrations
  for each row execute function admin.audit_row_change('vendor_id');

-- ── 3. Exempt sellers (Mitra D2): Cosora's own demo sellers ──────────────────
create table admin.registration_exempt (
  vendor_id  uuid primary key references public.profiles (id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now()
);
revoke all on admin.registration_exempt from public, anon, authenticated;

insert into admin.registration_exempt (vendor_id, reason)
select id, 'Cosora demo seller (cosora.dev): counts as registered (Mitra, 2026-11-13)'
  from public.profiles
 where id in ('22222222-2222-2222-2222-222222222222', 'a0000001-0000-0000-0000-000000000001',
              'a0000002-0000-0000-0000-000000000002', 'a0000003-0000-0000-0000-000000000003',
              'a0000004-0000-0000-0000-000000000004', 'a0000005-0000-0000-0000-000000000005')
on conflict (vendor_id) do nothing;

-- ── 4. Switches (created off; Mitra turns them on) ───────────────────────────
insert into public.feature_flags (key, description, enabled) values
  ('seller_registration_required',
   'Only registered sellers (registration submitted with a signed Supplier Agreement) can add listings, videos, catalogues, ads and quotes.',
   false),
  ('overseas_seller_registration',
   'Sellers outside India can register with their own country''s documents; staff approve each registration.',
   false)
on conflict (key) do nothing;

-- ── 5. Free plan: one PDF catalogue (Mitra, 2026-11-13) ──────────────────────
update public.subscription_plans
   set limits = limits || jsonb_build_object('catalogues_max', case when id = 'free' then 1 else -1 end)
 where id is not null;
update public.subscription_plans
   set display = display || jsonb_build_object('catalog', '1 PDF catalogue; add products one by one')
 where id = 'free';

-- ── 6. Premises photos, reviewed before buyers see them (Mitra D3) ───────────
create table public.vendor_premises_photos (
  id               uuid primary key default gen_random_uuid(),
  vendor_id        uuid not null references public.vendor_profiles (id) on delete cascade,
  url              text not null check (url ~ '^https?://[A-Za-z0-9.:-]+/storage/v1/object/public/product-images/'
                                        and public.storage_url_plain(url, 'product-images')),
  position         integer not null default 0 check (position between 0 and 100),
  status           public.product_status not null default 'under_review'
                     check (status in ('under_review', 'live', 'rejected')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at       timestamptz not null default clock_timestamp(),
  reviewed_at      timestamptz,
  reviewed_by      uuid
);
create index vendor_premises_photos_vendor_idx on public.vendor_premises_photos (vendor_id, status, position);
create index vendor_premises_photos_queue_idx on public.vendor_premises_photos (created_at, id) where status = 'under_review';

alter table public.vendor_premises_photos enable row level security;
revoke all on public.vendor_premises_photos from anon, authenticated;
grant select on public.vendor_premises_photos to anon, authenticated;
grant insert (vendor_id, url, position), delete on public.vendor_premises_photos to authenticated;

create policy vendor_premises_photos_select on public.vendor_premises_photos
  for select to anon, authenticated
  using (status = 'live'
         or vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'product_moderator', 'support']::public.admin_role_type[])));
create policy vendor_premises_photos_insert on public.vendor_premises_photos
  for insert to authenticated
  with check (vendor_id = (select auth.uid())
              and (select public.account_is_active((select auth.uid())))
              and (select public.account_not_deleted((select auth.uid()))));
create policy vendor_premises_photos_delete on public.vendor_premises_photos
  for delete to authenticated
  using (vendor_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

-- A browser's new photo starts unreviewed, under the seller's own folder, at most 12 per seller.
create or replace function admin.vendor_premises_photos_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_path text;
begin
  perform pg_advisory_xact_lock(hashtextextended('cosora.premises_photos:' || new.vendor_id::text, 0));
  if (select count(*) from public.vendor_premises_photos p where p.vendor_id = new.vendor_id and p.status <> 'rejected') >= 12 then
    raise exception 'premises_photo_limit' using errcode = '22023', hint = 'A store shows up to 12 premises photos.';
  end if;
  if current_user = 'authenticated' then
    v_path := substring(new.url from '/storage/v1/object/public/product-images/(.*)$');
    if v_path is null or split_part(v_path, '/', 1) <> new.vendor_id::text then
      raise exception 'invalid_file' using errcode = '22023';
    end if;
    new.status := 'under_review';
    new.rejection_reason := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.created_at := clock_timestamp();
  end if;
  return new;
end
$function$;
revoke all on function admin.vendor_premises_photos_guard() from public, anon, authenticated;

create trigger trg_vendor_premises_photos_guard
  before insert on public.vendor_premises_photos
  for each row execute function admin.vendor_premises_photos_guard();

-- The storefront reads approved photos from one column: kept here, never by a browser.
create or replace function admin.vendor_premises_photos_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vendor uuid := coalesce(new.vendor_id, old.vendor_id);
begin
  update public.vendor_profiles v
     set office_photos = coalesce((select array_agg(p.url order by p.position, p.created_at)
                                     from public.vendor_premises_photos p
                                    where p.vendor_id = v_vendor and p.status = 'live'), '{}'::text[])
   where v.id = v_vendor;
  return null;
end
$function$;
revoke all on function admin.vendor_premises_photos_cache() from public, anon, authenticated;

create trigger trg_vendor_premises_photos_cache
  after insert or update or delete on public.vendor_premises_photos
  for each row execute function admin.vendor_premises_photos_cache();

create trigger trg_admin_audit
  after insert or update or delete on public.vendor_premises_photos
  for each row execute function admin.audit_row_change('vendor_id');

-- Photos sellers saved before review existed have never been shown to buyers: they wait for review now.
insert into public.vendor_premises_photos (vendor_id, url, position, status)
select v.id, u.url, (u.ord - 1)::int, 'under_review'
  from public.vendor_profiles v
 cross join lateral unnest(v.office_photos) with ordinality as u(url, ord)
 where u.url ~ '^https?://[A-Za-z0-9.:-]+/storage/v1/object/public/product-images/'
   and public.storage_url_plain(u.url, 'product-images')
   and u.ord <= 12;
update public.vendor_profiles set office_photos = '{}'::text[] where cardinality(office_photos) > 0;

-- ── 7. The rule for "may this seller publish" ────────────────────────────────
create or replace function public.seller_registered(p_vendor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select not admin.feature_on_for('seller_registration_required', p_vendor)
      or exists (select 1 from admin.registration_exempt e where e.vendor_id = p_vendor)
      or exists (select 1 from public.vendor_profiles v
                  where v.id = p_vendor and v.onboarding_complete
                    and exists (select 1 from public.vendor_contracts c where c.vendor_id = v.id))
$function$;
revoke all on function public.seller_registered(uuid) from public, anon, authenticated;
grant execute on function public.seller_registered(uuid) to authenticated, service_role;

-- ── 8. What the seller sees about their own registration ─────────────────────
create or replace function public.my_seller_registration()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid := auth.uid();
  v_flag     boolean;
  v_country  text;
  v_exempt   boolean;
  v_contract boolean;
  v_latest   record;
  v_status   text;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select v.onboarding_complete, v.country_code into v_flag, v_country from public.vendor_profiles v where v.id = v_uid;
  v_exempt   := exists (select 1 from admin.registration_exempt e where e.vendor_id = v_uid);
  v_contract := exists (select 1 from public.vendor_contracts c where c.vendor_id = v_uid);
  select r.id, r.status, r.reason, r.country_code into v_latest
    from public.vendor_registrations r where r.vendor_id = v_uid order by r.created_at desc limit 1;
  v_status := case
    when v_exempt then 'exempt'
    when coalesce(v_flag, false) then 'registered'
    when v_latest.status = 'pending_review' then 'pending'
    when v_latest.status = 'rejected' then 'rejected'
    else 'none' end;
  return jsonb_build_object(
    'status', v_status,
    'reason', case when v_status = 'rejected' then v_latest.reason end,
    'contract_signed', v_contract,
    'country_code', coalesce(v_country, v_latest.country_code),
    'gate_on', admin.feature_on_for('seller_registration_required', v_uid),
    'latest_submission', v_latest.id);
end
$function$;
revoke all on function public.my_seller_registration() from public, anon, authenticated;
grant execute on function public.my_seller_registration() to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if not has_column_privilege('anon', 'public.vendor_profiles', 'country_code', 'SELECT') then
    raise exception 'self-check: anon cannot read vendor_profiles.country_code';
  end if;
  if has_table_privilege('anon', 'public.vendor_registrations', 'SELECT')
     or has_table_privilege('authenticated', 'public.vendor_registrations', 'INSERT')
     or has_table_privilege('authenticated', 'public.vendor_registrations', 'UPDATE') then
    raise exception 'self-check: vendor_registrations is writable or anon-readable';
  end if;
  if has_column_privilege('authenticated', 'public.vendor_premises_photos', 'status', 'INSERT')
     or has_table_privilege('authenticated', 'public.vendor_premises_photos', 'UPDATE') then
    raise exception 'self-check: a browser can set a premises photo''s review state';
  end if;
  if has_function_privilege('anon', 'public.seller_registered(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_seller_registration()', 'EXECUTE') then
    raise exception 'self-check: anon can execute the registration functions';
  end if;
  if (select count(*) from public.feature_flags
       where key in ('seller_registration_required', 'overseas_seller_registration') and not enabled) <> 2 then
    raise exception 'self-check: the registration switches must exist and start off';
  end if;
  if exists (select 1 from public.subscription_plans where not (limits ? 'catalogues_max')) then
    raise exception 'self-check: a plan has no catalogues_max';
  end if;
end
$check$;
