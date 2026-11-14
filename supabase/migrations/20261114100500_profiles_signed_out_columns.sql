-- Signed-out visitors no longer read an account's status, sign-up state, side or join date (buyer sign-up audit
-- 2026-11-13, item 14a; plan task A5; D6).
--
-- APPLY ONLY AFTER both front ends that stop reading these columns signed out are live and their bundles checked
-- (claude.md: "Revoking a column that clients read is ordered"; MPF-19 broke cosora.in by revoking first).
--
-- Reader inventory (2026-11-14, buyer origin/main 450f3c5 + branch buyer-signup/fixes, Cosora-Admin 372007a,
-- cosora-blogs): the only signed-out reader was the contact gate on store and product pages (callGate, account_status),
-- which no longer reads anything for a visitor (branch buyer-signup/fixes). Every other reader is signed in:
-- AuthContext / lib/auth/profileRead (active_role, onboarded, terms_version), the data export, My Profile
-- (created_at), the signed-in contact gate, and Cosora-Admin (staff). No view reads them; the one policy that does
-- (messages_insert) only matters to a signed-in sender; no function a visitor may call reads them as the visitor.
--
-- Signed-in accounts keep reading them: rfqs, quotes and chats show other people's names, and the contact gate reads
-- the other party's status. Narrowing that is a separate decision (securityflags.md).

revoke select (account_status, onboarded, active_role, created_at, terms_version, terms_accepted_at)
  on public.profiles from anon;

do $check$
begin
  if has_column_privilege('anon', 'public.profiles', 'account_status', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'onboarded', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'active_role', 'SELECT')
     or has_column_privilege('anon', 'public.profiles', 'created_at', 'SELECT') then
    raise exception 'self-check: a visitor can still read a sign-up column of profiles';
  end if;
  if not has_column_privilege('anon', 'public.profiles', 'full_name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'account_status', 'SELECT') then
    raise exception 'self-check: the revoke took more than the four columns from visitors';
  end if;
end
$check$;
