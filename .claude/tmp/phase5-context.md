# Phase 5 context: retire profiles.is_admin / profiles.admin_role

Temporary workstream file. NOT committed (`.claude/tmp` is not gitignored in either repo, so
only ever `git add` explicit paths). A copy lives in both repos; keep them identical.

## Where we are
- **Current sub-phase: 5a (additive).** 5b and 5c each need an explicit external go.
- Repos: ca = Cosora-Admin, tsn = textile-spark-net. Supabase project `vxdhhgdfubqedfpwfyrb`.
- Base: ca main `7985301`, tsn main `ec2d9c6`.
- tsn has an unrelated, parked, UNTRACKED dir `supabase/functions/otp-dev-verify/` (the OTP
  test-mode bypass, blocked by the permission check and never deployed). It reads
  `profiles.is_admin`, so if it is ever resumed it must use `admin_status_of`. Never `git add` it.

## Step 0 (done 2026-09-22): confirmed inventory
- The code grep (case-insensitive, both repos, src + supabase/functions) found exactly R1–R7 from
  the prompt, plus the parked otp-dev-verify above. Everything else is helper calls, the enum,
  `admin_role_values`, comments, or generated types.
- DB functions reading the COLUMNS: exactly D1 `public.enforce_admin_grants()`, D2
  `admin.sync_from_profiles()`, D3 `public.record_embedding_pipeline_health()`. This was proven by
  stripping helper calls, the enum, `admin_users.admin_role` and comments from every body.
  `admin_role()` only matched because it reads `admin_users.admin_role`.
- No policy or view reads the columns. The column dependents are:
  - the constraint `profiles_admin_requires_role`;
  - the default on `is_admin`;
  - the trigger `trg_profiles_sync_admin_users`, declared
    `AFTER INSERT OR DELETE OR UPDATE OF is_admin, admin_role`. Its column list depends on the
    columns, so 5c must drop the trigger (step 3) before the columns (step 6), as the prompt
    orders.
- `trg_profiles_admin_grants` is `BEFORE INSERT OR UPDATE` with no column list.
- Data at 5a start: 3 profiles admins = 3 admin_users rows = 3 active, all super_admin.
- `auth.role()` reads `request.jwt.claim(s).role`. PostgREST sets it to `service_role` for the
  service key, and it is null for a direct postgres session.
- Migration convention: every Phase 1–4 separation migration lives in tsn only, registered in
  tsn `MIGRATIONS.md`. The prompt asks for a copy in both repos, so the canonical file goes in
  tsn with a byte-identical copy in ca `supabase/migrations/`.

## Design decisions for 5a
- **Shadow write-back.** The mirror only runs profiles → admin_users. If the new write RPCs
  wrote admin_users alone, then during 5a/5b:
  - an admin granted by admin-invite would look like a non-admin to the un-repointed readers
    (useAdminSession and Admins.tsx still read profiles in 5a), so they could not use the panel;
  - the 5c pre-flight would see `only_in_au > 0`.
  So admin_grant, admin_set_role and admin_revoke write admin_users (the truth) first, then
  mirror onto the profiles columns **only if the columns still exist**. That write uses dynamic
  SQL behind an information_schema check, so it becomes a no-op after 5c and none of the three
  functions need redefining in 5c. The mirror trigger then re-upserts the same values, which is
  harmless and never touches created_by.
- Authz for grant/set_role/revoke: `auth.role() = 'service_role'` OR an authenticated
  super_admin, otherwise 42501. EXECUTE goes to authenticated and service_role only.
- Last-super_admin guard in set_role, revoke, and grant (a grant downgrading an existing
  super_admin counts). It locks the active super_admin rows FOR UPDATE first. The escape hatch is
  direct SQL as postgres on admin.admin_users.
- `admin_status_of`: EXECUTE for service_role only, and it also refuses when
  `auth.role()` is anon or authenticated.
- admin-invite `grantAdmin`: `rpc/admin_grant`, then a separate `PATCH profiles {email}` to keep
  its email backfill. The email is not an admin column. The caller-authz read is untouched until
  5b.

## RPCs (5a)
1. `admin_whoami()` → (id, email, full_name, is_admin, role) for auth.uid(). Grant: authenticated.
2. `admin_list_admins()` → (id, email, full_name, admin_role), active admins. Gate: is_admin(). Grant: authenticated.
3. `admin_search_candidates(p_query text)` → (id, email, full_name). Non-admins by email ilike,
   at least 3 characters, limit 10. Gate: super_admin. Grant: authenticated.
4. `admin_set_role(p_user_id uuid, p_role admin_role_type)`. Grant: authenticated, service_role.
5. `admin_grant(p_user_id uuid, p_role admin_role_type)`. Grant: authenticated, service_role.
6. `admin_revoke(p_user_id uuid)`. Grant: authenticated, service_role.
7. `admin_status_of(p_user_id uuid)` → (is_admin, admin_role). Grant: service_role only.

## Running log
- 2026-09-22: Step 0 done (above).
- 2026-09-22 **5a DONE → HARD STOP (awaiting gate before 5b).**
  - Migration `20260922120000_admin_identity_rpcs.sql` is canonical in tsn, with a byte-identical copy in ca. Applied
    via apply_migration as live version **20260922120205**. md5 of file = md5 of applied statements = `682218c9…`.
  - has_function_privilege: anon false on all 8. authenticated true on whoami, list, search, set_role, grant and revoke;
    false on status_of and shadow. service_role true on set_role, grant, revoke and status_of; false on the rest.
  - Harness tsn `scripts/admin-separation/11_phase5a_identity_rpcs.sql`: 6 personas × 16 checks = **96/96**. The mutation
    run (revoke gate widened to any admin, guard removed) failed exactly the 8 predicted cells.
  - ca `admin-invite` `grantAdmin()` now does `PATCH profiles {email}` then `rpc/admin_grant`. Deployed **v5**; v4
    differed from the repo only in 3 comment prefixes. Caller authz still reads the profiles columns; 5b repoints it.
  - Live: buyer got 403; demo-admin promoted demo-vendor (branch 3, `promoted`, emailSent false); roster OK; revoke OK.
    REST refusals OK. The test admin_users row was deleted. Drift is 0 (3 = 3).
  - Types regenerated in both repos, +64 lines each (the 7 RPCs only). ca: typecheck 0, probe 1, build OK. tsn: tsc 0.
  - Docs: tsn changelog, MIGRATIONS.md row 19 (+ mirror note), both admin-separation-context.md files, ca CHANGELOG.
  - Branches: `admin-separation/phase-5a` in both repos, committed, NOT pushed.

- 2026-09-22 **5b DONE → HARD STOP (awaiting gate before 5c).** The gate was given by the user. A parallel session
  is active in tsn: it added `supabase/migrations/20260922200000_vendor_review_aggregates_single_writer.sql` (applied as
  `20260922153114`; helpers only, no column access) and `screenshots/mp9-before-new-arrivals.png`. NEVER stage those.
  - All R1–R7 are repointed. Branches `admin-separation/phase-5b` in both repos (from phase-5a), committed, NOT pushed.
  - Deployed: admin-invite v6, admin-refund-payment v4, bunny-delete-video v3, bunny-reconcile v3. Pre-deploy drift
    was comment-only.
  - Proofs: direct-column grep 0 in both repos; DB strict scan still shows only D1–D3 (plus 5a RPC output names).
    Browser panel run 16/16; tsn isAdmin true/false; edge authz 403/pass; non-admin panel shows "Not an admin account".
  - Pre-existing finding: BUNNY_API_KEY gets 401 at Bunny (logged in securityflags, Low).
  - 5c pre-flight currently: only_in_profiles 0, only_in_au 0, role_mismatch 0; prof_admins 3 = au_active 3.

- 2026-09-22 **pre-5c staging: A + B + C DONE → HARD STOP C (awaiting human merge + Vercel deploy).**
  - **A (ca tooling).** The full column-touching set in scripts/tests (A1): seed-test-admins.sql, drop-test-admins.sql,
    invite-tests-cleanup.sql, rls-matrix.mjs, rls-superadmin.mjs, chat-pipeline-matrix.mjs, invite-branches-test.mjs.
    Name-only (safe, unchanged): chat-moderation-behaviour.mjs (a comment), invite-tests.mjs and invite-send-test.mjs
    (only the edge-function `admin_role` request field). All seven repointed; commit ca `6022577`.
    - Proof against live, with the columns present, same fixtures: rls-matrix 60/60 → 60/60, rls-superadmin
      11/11 → 11/11, chat-pipeline 72/72 → 72/72 (0 cells differing); invite-tests 9/9; chat-moderation behaviour and
      matrix green.
    - NOT run live: invite-branches-test and invite-send-test (real emails; branch fixtures unseeded).
    - Fixed two pre-existing teardown gaps: drop-chat-fixtures misses `chatfx-% support note` flags;
      invite-tests-cleanup must run AFTER drop-test-admins.
    - Cleanup verified: 0 test users / profiles / admin_users rows; drift 0/0/0; moderation data back to baseline.
    - The seed ran with a local bcrypt hash (scratchpad bcryptjs), never the plaintext.
  - **B.** tsn rebased onto main `ed2e6c8`: 5a → `2dc86b9`, 5b → `bf102d5`. Keep-both in changelog.md and
    securityflags.md with 0 lines lost either way; code identical. The local backup ref
    `backup/phase-5b-pre-rebase` (NOT pushed) can be deleted after merge. ca was a fast-forward on `7985301`.
    Both repos: typecheck 0 (probe 1), build OK.
  - **C.** Both branches pushed. gh CLI not logged in, so no PR was opened by me; the bodies are in the scratchpad
    `phase5a/PR-*.md`, with compare links in the report.
    HEADs: ca `6022577`, tsn `bf102d5`.
  - **NEXT = Phase D, only after "prod is deployed":** Vercel commit == main HEAD for both; a live cosora-admin
    network capture (rpc/admin_whoami, 0 requests naming the columns on login / Admins / role change); live tsn
    (rpc/is_admin; the profiles select without is_admin; admin true / non-admin false). Then HARD STOP D. Do NOT
    start 5c.

- 2026-09-22 **5c DONE: columns DROPPED. HARD STOP 5c; the admin-db-separation build is complete, no new work.**
  - Main already held 5a+5b+tooling (ca `1132e8f`, tsn `1c596e5`). Branches `admin-separation/phase-5c` in both repos.
  - Step 0: only D1–D3 read the columns (plus the 5a RPC names and shadow's guarded string); no policies, views,
    indexes, generated columns, publications or rules; no other schema; the 10 other edge functions never referenced the
    columns in any git version. The live bundles (cosora.in, cosora-admin.vercel.app) are the 5b code.
  - Gate: 2/1/1, 3 = 3, 0/0/0, rlstest 0. The dry run (forced abort) passed, and the rollback was confirmed.
  - Applied `20260922180000_retire_profiles_admin_columns` → live **20260922171801**, md5 `974823ee…` (file = applied).
    Mirrored into ca.
  - After: A 0 rows. B types −6 lines each. C tsc 0 in both repos, probe 1 each. D rls-matrix 60/60, rls-superadmin 11/11,
    chat-pipeline 72/72, invite-tests 9/9, 0 cells differing vs Phase A. E production panel 16/16 (my toast check
    false-passed its final cleanup demote; I revoked by hand, and the API log confirms the product paths); non-admin refused;
    app flag true/false; edge 403/pass. F recipients 3 = active admins. Residue 0.
  - Not done (out of scope): tsn `scripts/admin-separation/01–11` still write the dropped columns (historical proofs).

- 2026-09-22 **FINAL FORM. The admin-db-separation build is complete and both repos are clean on main.**
  - Harness correction (tsn `58acc2b`): 02/04/05/08/10/11 promote personas by writing `admin.admin_users`;
    02's promotion + self-escalation cases call `admin_grant` / `admin_set_role` and its baseline is re-recorded
    (buyer/anon promote and anon self-escalate are now `->42501`, not `=0`); 11 dropped its shadow assertions;
    01 and 03 abort as HISTORICAL (they tested the columns/mirror themselves). Verified live: 11 96/96, 05 green,
    02 matches the post-4c baseline except the two predicted cells.
  - `AuthContext` comment corrected (tsn `332e2ad`).
  - Branches: all phase branches deleted locally in both repos; only `main` remains. Remote branches were left in
    place because the merged PRs reference them.
  - Untracked and deliberately kept: `.claude/tmp/` (these notes) and tsn `supabase/functions/otp-dev-verify/`
    (the parked OTP test-mode bypass; never deployed, and it would need `admin_status_of` if ever revived).
  - Heads: ca `4851180`, tsn `332e2ad`, both equal to origin/main. Typecheck 0 and build OK in both (probe 1 each).
  - Last verified DB state (17:30 UTC, before the Supabase connector dropped): columns/mirror/CHECK gone,
    3 active admins, 0 test residue, moderation data at baseline.

## 5c notes (historical)
- Run the pre-flight query first and require zeros.
- Order is load-bearing: rewrite D1 and D3, drop trg_profiles_sync_admin_users (it is `UPDATE OF is_admin,
  admin_role`), drop admin.sync_from_profiles, drop the CHECK, then drop both columns. The is_admin default goes with the column.
- admin.shadow_admin_columns becomes a no-op automatically (pg_attribute check). It can be dropped later or kept.
- TOOLING that breaks at the drop and must be repointed to admin.admin_users in 5c:
  - ca scripts: chat-moderation-behaviour.mjs, drop-test-admins.sql, invite-branches-test.mjs, invite-tests-cleanup.sql,
    rls-matrix.mjs, rls-superadmin.mjs, seed-test-admins.sql.
  - tsn harnesses: 01, 02, 03 (mirror, obsolete after the drop), 04, 05, 07, 08, 10, 11. Most promote personas with
    `update profiles set is_admin…`.
- After the drop: regenerate types in both repos, and typecheck both (the safety net).

## 5b checklist (done; kept for reference)
- R1 ca `src/hooks/useAdminSession.tsx`: `rpc('admin_whoami')`. No row → the non-admin identity from the session
  (same as today's "no profiles row"). Also fix the comment at ResetPassword.tsx:119.
- R2 ca `src/pages/Admins.tsx`: admin_list_admins / admin_search_candidates / admin_set_role / admin_grant /
  admin_revoke. The ProfileRow type drops is_admin; admin_role is never null now.
- R3 ca admin-invite: caller authz → `rpc/admin_status_of {p_user_id: callerId}` → `[0].is_admin && [0].admin_role`.
- R4 ca admin-refund-payment: same, keeping super_admin / finance_admin.
- R5 tsn AuthContext: drop is_admin from the select and the Profile type; `isAdmin` via `rpc('is_admin')`, not called
  synchronously inside onAuthStateChange.
- R6/R7 tsn bunny-delete-video, bunny-reconcile → admin_status_of; keep super_admin / product_moderator.
- Deploy all 4 edge functions after a pre-deploy drift check against the deployed versions.
