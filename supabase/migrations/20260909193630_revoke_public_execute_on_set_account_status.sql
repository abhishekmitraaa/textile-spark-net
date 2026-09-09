-- Second half of the moderation-verb lockdown started in the previous
-- migration. Applying the `from anon` revokes alone locked down four of the
-- five verbs and left set_account_status STILL anon-executable, because its
-- ACL is the mirror image of the other four:
--
--   reject_vendor_content:  postgres=X | anon=X | authenticated=X | service_role=X
--   set_account_status:    =X | postgres=X       | authenticated=X | service_role=X
--                          ^^ a leading `=X` with an EMPTY grantee is the PUBLIC grant
--
-- set_account_status has no `anon=X` of its own at all. It is exposed purely
-- through PUBLIC, which `anon` inherits — so `revoke ... from anon` was the
-- no-op there and `revoke ... from public` is the fix, exactly inverted from
-- reject_vendor_content.
--
-- Where each shape comes from, since both exist in this project:
--
--   * Named-role grants (anon=X) come from Supabase's platform default
--     privileges — ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON
--     FUNCTIONS TO anon, authenticated, service_role, registered in
--     pg_default_acl for both the postgres and supabase_admin grantors. Any
--     function born in `public` carries them from creation.
--
--   * The PUBLIC grant (=X) is Postgres' own default. While a function has
--     never been GRANTed anything its proacl is NULL, and the PUBLIC EXECUTE
--     is implicit and invisible. The first GRANT of any kind materialises the
--     whole ACL, PUBLIC entry included — so 20260801095820's innocuous
--     `grant execute ... to authenticated, service_role` is what wrote the
--     PUBLIC row that is being removed here. Nothing ever granted to PUBLIC
--     deliberately.
--
-- The practical rule, which is the thing worth remembering: these are two
-- independent grants and either one alone leaves a function callable. A
-- function is not locked down until BOTH are revoked and
-- has_function_privilege() has been asked to confirm it. Do not infer it from
-- the revoke statement having run without error — all three of this project's
-- earlier revoke attempts ran without error and changed nothing.
--
-- Belt-and-braces: revoke PUBLIC from all five, not just the one that needed
-- it. It is idempotent, and it makes the end state independent of which ACL
-- shape any given function happens to have been created with.

revoke execute on function public.set_account_status(uuid, account_status_type, uuid, text, uuid) from public;
revoke execute on function public.reject_vendor_content(text, uuid, text) from public;
revoke execute on function public.approve_vendor_content(text, uuid) from public;
revoke execute on function public.approve_vendor_content_bulk(uuid) from public;
revoke execute on function public.set_vendor_document_verified(uuid, boolean, text) from public;

-- Verified live after applying — all five:
--   has_function_privilege('anon', ..., 'EXECUTE')          = false
--   has_function_privilege('authenticated', ..., 'EXECUTE') = true
-- Project-wide anon-executable SECURITY DEFINER functions in `public`: 35 -> 30.
