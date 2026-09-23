-- INTERIM (MPF-3 follow-up, decided by Mitra 2026-09-23). Revert once the new
-- code is live on cosora.in and cosora-admin.vercel.app.
--
-- 20260923171821 revoked SELECT on profiles.email and profiles.phone from anon
-- and authenticated. The production bundles still run the old code, which
-- selects those columns directly as a signed-in user (the buyer app's profile
-- load, the admin Accounts and Chats searches and chat participants), so both
-- front ends broke. This grants the two columns back to authenticated ONLY:
-- signed out stays closed, so both MPF-3 proof requests still fail.
--
-- Until the revert, any signed-in user can still read other users' email and
-- phone. The revert is one statement, run after both deploys:
--   revoke select (email, phone) on public.profiles from authenticated;

grant select (email, phone) on public.profiles to authenticated;

do $$
begin
  if has_column_privilege('anon', 'public.profiles', 'email', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT')
     or has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'interim self-check: anon can read a contact column';
  end if;
  if not (has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT')
          and has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT')) then
    raise exception 'interim self-check: authenticated grant did not take';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    raise exception 'interim self-check: authenticated regained table-wide SELECT';
  end if;
end;
$$;
