-- Seller Home audit SH-051 (2026-11-17): a seller's stored profile score is no longer readable by visitors or other
-- accounts. Every input to it is public and its weights ship in the app, so the points left over revealed private
-- facts: an email on file, two quotes sent, ten listings counting unpublished ones.
--
-- APPLY ONLY AFTER the app that no longer selects the column is live (claude.md: "Revoking a column that clients read
-- is ordered"). The seller's own pages compute the score from seller_home_summary(); the store screens and the data
-- export stopped selecting it in the same release. Ranking reads it inside SECURITY DEFINER functions, which this
-- doesn't touch.

revoke select (profile_score) on public.vendor_profiles from anon, authenticated;

do $check$
begin
  if has_column_privilege('anon', 'public.vendor_profiles', 'profile_score', 'select')
     or has_column_privilege('authenticated', 'public.vendor_profiles', 'profile_score', 'select') then
    raise exception 'SH-051 self-check: browsers can still read profile_score';
  end if;
  -- The rest of the public profile stays readable.
  if not has_column_privilege('anon', 'public.vendor_profiles', 'brand_name', 'select') then
    raise exception 'SH-051 self-check: the public profile lost its grant';
  end if;
end
$check$;
