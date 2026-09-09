-- Close the moderation-verb grant hole, and record WHY the previous attempt
-- silently did nothing.
--
-- ── The finding ────────────────────────────────────────────────────────────
-- Migration 20260801100327 ran `revoke execute on function
-- public.reject_vendor_content(...) from public;` and was believed to have
-- hardened it. It did not. The function is executable by `anon` today, and it
-- has been the whole time — this was never a regression, it was a no-op from
-- the moment it was written.
--
-- The cause is NOT drop-and-recreate wiping grants (the usual suspect). No
-- migration in this project ever dropped and recreated these functions;
-- 20260801102505 explicitly used ALTER FUNCTION ... RENAME precisely to
-- preserve the OID and ACL. The cause is a Supabase platform default:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
--
-- ...is registered in pg_default_acl for BOTH the `postgres` and
-- `supabase_admin` grantors. So every function created in `public` is born
-- carrying EXPLICIT per-role grants:
--
--   postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- `REVOKE ... FROM public` only strips the PUBLIC pseudo-role's implicit
-- grant. On stock Postgres that is the whole story and the revoke works. On
-- Supabase the PUBLIC grant is not what is exposing the function — the three
-- named role grants are — and revoking PUBLIC leaves the ACL byte-identical.
--
-- Demonstrated directly, not inferred: creating a throwaway function in
-- `public` and running the same revoke against it produced exactly the ACL
-- above, unchanged before and after.
--
-- Three migrations in this project used the ineffective form, covering three
-- functions; all three are fixed below. Every other search/embedding function
-- hardened in 20260906200000 already used the correct `from anon, authenticated`
-- form and is genuinely locked down.
--
-- ── What is and is not revoked ─────────────────────────────────────────────
-- `anon` only. Admins sign in — they are `authenticated`, not `anon` — so
-- revoking `authenticated` would break the admin panel outright. The real gate
-- has always been the internal guard each of these carries:
--
--   if not (public.is_admin() and public.admin_role() in (...)) then raise ...
--
-- which is why this was missing defence-in-depth rather than an exploitable
-- hole. Removing `anon` means an unauthenticated caller is refused by the
-- privilege system before the function body runs at all, instead of relying
-- solely on that guard being correct in every future edit.
--
-- The two KYC/account verbs are included: they were never covered by a
-- hardening migration, but they are the same class of admin-only verb with the
-- same internal guard, and leaving them anon-callable while fixing their three
-- siblings would be arbitrary.

-- These revokes alone locked down four of the five. set_account_status needed
-- a second, inverted fix — see the migration immediately after this one, which
-- is where the PUBLIC-vs-named-role distinction is written up in full.

revoke execute on function public.reject_vendor_content(text, uuid, text) from anon;
revoke execute on function public.approve_vendor_content(text, uuid) from anon;
revoke execute on function public.approve_vendor_content_bulk(uuid) from anon;
revoke execute on function public.set_account_status(uuid, account_status_type, uuid, text, uuid) from anon;
revoke execute on function public.set_vendor_document_verified(uuid, boolean, text) from anon;
