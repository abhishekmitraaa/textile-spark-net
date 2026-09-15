# Admin-schema separation: rolling context

> **TEMPORARY workstream file.** Fold into the permanent masterplan and delete this file when the
> separation is done. Keep it lean: newest entry on top, facts the next session needs, no history dumps.

**Workstream.** Cosora runs on ONE Supabase project (`vxdhhgdfubqedfpwfyrb`), shared by textile-spark-net
(buyer/vendor app) and Cosora-Admin (admin panel), both on the anon key. Authorization is enforced in
Postgres (RLS + BEFORE triggers gated by `is_admin()` / `admin_role()`). We are moving admin identity, audit,
decisions and moderation config into a dedicated `admin` Postgres schema **inside the same project** (no second
project). It is revoked from `anon`/`authenticated` and NOT added to PostgREST's exposed schemas. Approvals stay
atomic and DB-enforced.
Phases: 1 schema foundation ✅ → 2 identity flip ✅ → 3 `admin_flags`/`ad_review_log`/`chat_block_reasons`/
`account_suspensions` move + RPC wraps + Cosora-Admin panel → 4 `keyword_blocklist`/`flag_patterns`/`conversation_reviews`
move with the message-trigger repoint → 5 retire `profiles` as admin authority.

**Spec:** `documentation/admin-separation-spec.md` (FROZEN 2026-09-15; Q-17 closed and Q-12 decided in Phase 2).

---

## 2026-09-15: Phase 2 complete.

**Applied:** `20260915140000_harden_admin_grants_q17` (live `20260915164541`) then
`20260915150000_flip_admin_identity_to_admin_users` (live `20260915165030`). Repo filenames and live versions differ, as before.

- **Q-17 closed:** `enforce_admin_grants()` guards are `not coalesce(is_admin() and admin_role() = 'super_admin', false)` in both branches, plus `profiles_admin_requires_role CHECK (not is_admin or admin_role is not null)`.
- **`admin.admin_users` is now the source of truth.** The mirror `trg_profiles_sync_admin_users` → `admin.sync_from_profiles()` is live. `public.is_admin()`/`admin_role()` are flipped to `admin.admin_users where is_active`.

**B1–B7 results:**
- **B1 parity:** 18 profiles, `is_admin` mismatches **0**, `admin_role` mismatches **0**; byte-identical to the pre-flight snapshot.
- **B2 no leftover:** both accessors reference `admin.admin_users`, not `profiles`; ACL byte-identical (`=X, postgres, anon, authenticated, service_role`); SQL, STABLE, SECDEF, owner postgres, `search_path=''`.
- **B3 role matrix:** H2 (4 personas × 8 checks) byte-identical to pre-flight. H1 (Phase 1 harness) changed only super_admin's role-less toggle, `rows=1` → `23514`, which is the Q-17 fix.
- **B4 mirror** (rolled back): promote → active `support` row, `is_admin()` true · role change → `ads_moderator`, `ad_moderator()` true · demote → `is_active=false`, `is_admin()` false · support self-escalation still 42501.
- **B5 counts:** policies **125** (md5 `ada2b51e…` unchanged) · triggers **41** (original 40 md5 `e39b5052…` unchanged).
- **B6 advisors:** counts identical to the post-Phase-1 capture; the mirror is not flagged (SECDEF, `search_path=''`, ACL postgres only).
- **B7 build:** types identical before and after with no drift (file unchanged); typecheck 0 (harness fires 1); build passes. Anon `GET /rpc/is_admin` → `200 false`; `admin` still not exposed.

**Live-DB state for next phase:**
- **Write path is still `public.profiles`** (Admins.tsx `:99/:115/:135`, `admin-invite`), mirrored into `admin.admin_users` in the same transaction. Do not write `admin_users` directly until the write path moves.
- **`public.is_admin()`/`admin_role()` read `admin.admin_users`.** New fingerprints: is_admin `2e2212c6…`, admin_role `4e7025d1…`, enforce_admin_grants `449affdf…`, sync_from_profiles `4958f659…`. Down path (prior bodies) is commented in the 2b file.
- Demote keeps the row (`is_active=false`, role retained). `admin.is_admin(uuid)`/`role_of(uuid)` still exist (EXECUTE authenticated, inert).
- **Still reading profiles admin columns directly:** `record_embedding_pipeline_health()` (deferred; correct while profiles is mirrored), plus 4 edge functions via service role (`admin-invite`, `admin-refund-payment`, `bunny-reconcile`, `bunny-delete-video`), `useAdminSession.tsx`, `Admins.tsx`, `AuthContext.tsx:67`. All stay accurate via the mirror; they move in Phase 5.
- **Phase 3 hazards (spec C7):** `guard_ad_deletion()` is INVOKER and reads `ad_review_log` (make it SECDEF, Q-15). Panel embeds `chat_block_reasons(...)` break when that table leaves `public`. `conversation_reviews` moves in Phase 4, not 3.
- **Test harnesses:** PARITY loop, H2 matrix and B4 mirror block. They are self-rolling-back DO blocks that report via `raise exception`: set `request.jwt.claims`/`request.jwt.claim.sub`, `set local role`, run each check in its own `begin … exception` subtransaction. The SQL is not committed anywhere; the changelog entry describes the checks. Rebuild from that, or ask for the bodies to be saved as a script. Fixtures: demo-admin `33333333-…` (super_admin), demo-buyer `11111111-…`, category `002afffc-…`, chat_block_reason `4c163844-…`. Avoid `count(*) from (select rpc()) s`: the planner skips the call.
- Tooling: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`; `npm.cmd run build`; injected-error probe config lives in the scratchpad, so recreate one if it's gone.
- Open, non-blocking: Q-2, Q-8, Q-13 (anon TRUNCATE/DML grants on C6 tables), Q-14 (`submit_report` anon EXECUTE), Q-15, Q-16.
- Not done (outside the allowed writes): recording Phase 1–2 migrations in both `MIGRATIONS.md`.

**NEXT STEP:** Phase 3 - relocate the admin-native tables (`admin_flags`, `ad_review_log`, `chat_block_reasons`,
`account_suspensions`) behind SECURITY DEFINER RPCs and update the Cosora-Admin panel (spec "Phase plan → Phase 3").
