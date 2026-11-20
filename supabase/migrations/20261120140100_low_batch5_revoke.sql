-- Low bugs, batch 5, step 2 (review L-89; Mitra, 2026-11-20: "Close it now").
--
-- APPLY ONLY AFTER both apps from this batch are live (buyer and Cosora-Admin) and their live bundles are checked
-- (MPF-19: Phase 11 revoked a column first and broke cosora.in and the admin panel). The apps read these through
-- contact_check(), my_account_status(), admin_account_statuses() and my_vendor_settings() (20261120140000).
--
--   profiles.account_status: no signed-in account reads another's status any more.
--   vendor_profiles.notifications / regional: a seller's own settings, which anyone could read.

begin;

revoke select (account_status) on public.profiles from authenticated, anon;
revoke select (notifications, regional) on public.vendor_profiles from authenticated, anon;

do $check$
begin
  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_status'
                and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')) then
    raise exception 'low_batch5_revoke: account_status still readable';
  end if;
  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'vendor_profiles' and column_name in ('notifications', 'regional')
                and privilege_type = 'SELECT' and grantee in ('anon', 'authenticated')) then
    raise exception 'low_batch5_revoke: seller settings still readable';
  end if;
end
$check$;

commit;
