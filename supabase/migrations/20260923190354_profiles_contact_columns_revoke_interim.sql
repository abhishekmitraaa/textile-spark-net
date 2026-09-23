-- MPF-19: end the interim grant from 20260923174653 (MPF-3 follow-up).
--
-- 20260923171821 made profiles.email and profiles.phone unreadable by clients;
-- 20260923174653 re-granted them to authenticated because the production
-- bundles still selected them. Both front ends now run the new code
-- (textile-spark-net main d1ff52a, Cosora-Admin main 106f84c, deployed
-- 2026-09-24): www.cosora.in's bundle calls my_contact_info() and
-- call_buyer_contact(), cosora-admin.vercel.app's calls admin_profile_search()
-- and admin_profile_emails(), and neither selects the columns any more.
-- No invoker-rights function or view reads them, and every edge function that
-- reads profiles uses the service role.
--
-- After this, clients read contact details only through those four SECURITY
-- DEFINER functions. UPDATE is unchanged: users still edit their own email and
-- phone.

revoke select (email, phone) on public.profiles from authenticated;

do $$
declare
  r text;
  c text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach c in array array['email', 'phone'] loop
      if has_column_privilege(r, 'public.profiles', c, 'SELECT') then
        raise exception 'self-check: % can still select profiles.%', r, c;
      end if;
    end loop;
    if has_table_privilege(r, 'public.profiles', 'SELECT') then
      raise exception 'self-check: % holds table-wide SELECT on profiles', r;
    end if;
    foreach c in array array['id', 'full_name', 'avatar_url', 'active_role', 'onboarded', 'account_status', 'created_at'] loop
      if not has_column_privilege(r, 'public.profiles', c, 'SELECT') then
        raise exception 'self-check: % lost SELECT on profiles.%', r, c;
      end if;
    end loop;
  end loop;
  if not (has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
          and has_column_privilege('authenticated', 'public.profiles', 'phone', 'UPDATE')) then
    raise exception 'self-check: authenticated lost UPDATE on its contact columns';
  end if;
  if not (has_function_privilege('authenticated', 'public.my_contact_info()', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.call_buyer_contact(uuid)', 'EXECUTE')) then
    raise exception 'self-check: the contact functions are not executable by authenticated';
  end if;
end;
$$;
