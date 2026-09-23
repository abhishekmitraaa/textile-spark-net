-- Make the synthetic load-test accounts able to sign in (Master Prompt 12, Part D).
--
-- NOT a migration, deliberately: it repairs test-fixture rows, not schema, and
-- a fresh project has no loadtest-* users for it to touch. Kept in scripts/ as
-- the record of exactly what was run against production on 2026-09-23.
--
-- The 370 loadtest-*@cosora.test users were inserted directly into auth.users
-- with NULL in four columns that GoTrue scans into non-nullable Go strings.
-- The password grant therefore failed with HTTP 500 "Database error querying
-- schema" before the password was even compared — reproduced on four untouched
-- accounts immediately before this ran (scripts/loadtest-login-check.mjs).
-- A working account (demo-vendor, and loadtest-vendor-3 after its one-off
-- repair in Master Prompt 11) holds '' in all four.
--
-- The other four string token columns (email_change_token_current,
-- phone_change, phone_change_token, reauthentication_token) were checked and
-- are already '' on all 370, so they are not touched.
--
-- Scope is the email pattern and nothing else. coalesce() leaves any
-- non-NULL value exactly as it is, so re-running this is a no-op.

update auth.users
   set confirmation_token     = coalesce(confirmation_token, ''),
       recovery_token         = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change           = coalesce(email_change, '')
 where email like 'loadtest-%@cosora.test'
   and (confirmation_token is null or recovery_token is null
        or email_change_token_new is null or email_change is null);
