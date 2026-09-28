-- Admin completion, Phase 4b (Mitra, 2026-09-28): a vendor's PAN, owner email, phone,
-- WhatsApp and street address stop being client-readable.
--
-- Applied only after the code that needs it was live in production, the MPF-19 order:
--   - Phase 4a in both apps (textile-spark-net main 1df03e1, Cosora-Admin main f80e656),
--     with every live JS chunk scanned: no vendor_profiles select of a private column
--     or of `*` left;
--   - writeOwnVendorRow() (textile-spark-net main 93ed707). A rehearsal of this migration
--     showed that INSERT ... ON CONFLICT DO UPDATE SET col = EXCLUDED.col needs SELECT on
--     col, so the app's old upserts would have been refused.
-- The readers are my_vendor_private(), call_vendor_contact() and admin_vendor_private()
-- (20260927184250, 20260927185902). Verified with scripts/admin-completion/08.
--
-- What changes for anon and authenticated on public.vendor_profiles:
--   - Table-wide SELECT is replaced by column SELECT on every column except the eight
--     private ones and the two catalog-embedding columns, which no client reads (1,536
--     numbers a vendor). So `select *`, and any filter, order or return of those
--     columns, fails with 42501.
--   - anon loses INSERT, UPDATE and DELETE. Nothing writes this table signed out, and RLS
--     already refused it; now the grant does too.
--   - authenticated keeps INSERT, UPDATE and DELETE (RLS decides): a vendor still saves
--     their own private fields through writeOwnVendorRow() (an UPDATE, or an insert-only
--     upsert), which needs no SELECT on them.
-- A new column is not client-readable until a migration grants it; the self-check below
-- fails if the column list changes.

-- ── The grants ───────────────────────────────────────────────────────────────
revoke select on public.vendor_profiles from anon, authenticated;
revoke insert, update, delete on public.vendor_profiles from anon;

grant select (
  id, brand_name, about, city, state, country, business_type, is_verified, followers_count,
  rating_avg, reviews_count, created_at, website, logo_url, banner_url, owner_name, gstin, cin,
  profile_score, onboarding_complete, plan_id, plan_expires_at, ad_verified_until,
  notifications, regional, category, office_photos, year_established, employee_count, social,
  recommended_product_ids, annual_turnover, capacity, has_phone, has_whatsapp
) on public.vendor_profiles to anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  v_public  text[] := array[
    'id', 'brand_name', 'about', 'city', 'state', 'country', 'business_type', 'is_verified',
    'followers_count', 'rating_avg', 'reviews_count', 'created_at', 'website', 'logo_url',
    'banner_url', 'owner_name', 'gstin', 'cin', 'profile_score', 'onboarding_complete', 'plan_id',
    'plan_expires_at', 'ad_verified_until', 'notifications', 'regional', 'category',
    'office_photos', 'year_established', 'employee_count', 'social', 'recommended_product_ids',
    'annual_turnover', 'capacity', 'has_phone', 'has_whatsapp'];
  v_hidden  text[] := array[
    'pan', 'owner_email', 'phone', 'whatsapp', 'address_line', 'area', 'landmark', 'postal_code',
    'catalog_embedding', 'catalog_embedding_updated_at'];
  v_actual  text[];
  r         text;
  c         text;
begin
  select array_agg(a.attname::text order by a.attname) into v_actual
    from pg_attribute a
   where a.attrelid = 'public.vendor_profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_actual is distinct from (select array_agg(x order by x) from unnest(v_public || v_hidden) x) then
    raise exception 'self-check: vendor_profiles columns changed; decide the new column''s grant (have %)', v_actual;
  end if;

  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.vendor_profiles', 'SELECT') then
      raise exception 'self-check: % still holds table-wide SELECT on vendor_profiles', r;
    end if;
    foreach c in array v_public loop
      if not has_column_privilege(r, 'public.vendor_profiles', c, 'SELECT') then
        raise exception 'self-check: % cannot read vendor_profiles.%', r, c;
      end if;
    end loop;
    foreach c in array v_hidden loop
      if has_column_privilege(r, 'public.vendor_profiles', c, 'SELECT') then
        raise exception 'self-check: % can still read vendor_profiles.%', r, c;
      end if;
    end loop;
  end loop;

  if has_table_privilege('anon', 'public.vendor_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.vendor_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.vendor_profiles', 'DELETE') then
    raise exception 'self-check: anon can still write vendor_profiles';
  end if;
  if not (has_table_privilege('authenticated', 'public.vendor_profiles', 'INSERT')
          and has_table_privilege('authenticated', 'public.vendor_profiles', 'UPDATE')) then
    raise exception 'self-check: authenticated lost INSERT or UPDATE on vendor_profiles (vendors save their own row)';
  end if;
  if not has_table_privilege('service_role', 'public.vendor_profiles', 'SELECT') then
    raise exception 'self-check: service_role lost SELECT on vendor_profiles';
  end if;
end
$check$;
