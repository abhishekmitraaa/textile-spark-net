# Admin-schema separation: rolling context

> **TEMPORARY workstream file.** Fold into the permanent masterplan and delete this file when the
> separation is done. Keep it lean: newest entry on top, facts the next session needs, no history dumps.

**Workstream.** Cosora runs on ONE Supabase project (`vxdhhgdfubqedfpwfyrb`), shared by textile-spark-net
(buyer/vendor app) and Cosora-Admin (admin panel), both on the anon key. Authorization is enforced in
Postgres (RLS + BEFORE triggers gated by `is_admin()` / `admin_role()`). We are moving admin identity, audit,
decisions and moderation config into a dedicated `admin` Postgres schema **inside the same project** (no second
project). It is revoked from `anon`/`authenticated` and NOT added to PostgREST's exposed schemas. Approvals stay
atomic and DB-enforced.
Phases: 1 schema foundation ✅ → 2 identity flip ✅ → 3 `admin_flags` + `ad_review_log` behind the wall
(3a RPCs ✅ · **3b panel onto RPCs — GATED** · 3c `SET SCHEMA admin`) → later: `chat_block_reasons`/`account_suspensions`,
then `keyword_blocklist`/`flag_patterns`/`conversation_reviews` with the message-trigger repoint → retire `profiles` as admin authority.

**Spec:** `documentation/admin-separation-spec.md` (FROZEN 2026-09-15; Q-17 closed, Q-12 decided, **Q-4 reopened in 3a**).

---

## 2026-09-15: Phase 3c requested, NOT started. Two blockers found in Step 0. DB unchanged.

No migration was written or applied and no script was edited. The only DB activity was read-only inspection plus one
self-rolling-back probe; afterwards `guard_ad_deletion` md5 is `0810623a…` (invoker, unchanged), both tables are in `public`,
`ad_review_log` has 27 rows, and the latest migration is still `20260915172340`.

**Blocker 1: 3b is not deployed (protocol STOP).** This file recorded 3b as "committed", not "deployed". After `git fetch`:
Cosora-Admin `origin` has **no** `admin-separation/phase-3b` branch, `c322055` is **not** in `origin/main`, and `origin/main`'s
panel still queries the tables directly (`FlagLog.tsx` 2, `Reports.tsx` 1, `AdReviewQueue.tsx` 1, 0 RPC calls). If production
builds from `origin/main`, moving the tables breaks the live flag log, Reports list, add-note and decision history.
Needed: push + merge 3b, deploy, and confirm the **production bundle** calls `admin_flag_list`/`admin_flag_add`/`admin_ad_review_log_list`.

**Blocker 2: `guard_ad_deletion` precondition fails (Q-15).** Its decision is caller-scoped:
`if current_user <> 'authenticated' then return old; end if; if public.is_admin() then return old; end if;` then the
`OLD.id` history check. Under SECURITY DEFINER `current_user` is always `postgres`, so a literal conversion disables the guard.
Rolled-back probe, deleting reviewed ad `0b015f15…` (owner `a0000004…`, non-admin):
- CURRENT invoker: owner **42501 refused**; super_admin, service_role and postgres deleted.
- LITERAL SECDEF, same body: owner **DELETED (guard off)**; others deleted.
- CANDIDATE SECDEF with bypass `coalesce(current_setting('role', true), 'none') <> 'authenticated'`: owner **42501 refused**;
  super_admin deleted (inside: `postgres/role=authenticated`), service_role deleted (`role=service_role`), postgres deleted (`role=none`).
- The cascade path (admin deletes a vendor profile) was inconclusive in all three variants: an unrelated FK 23503 on
  `vendor_catalog_recompute_queue` stops it first. No function deletes advertisements; the only cascade into `advertisements`
  is `vendor_id → profiles ON DELETE CASCADE`, and `profiles_delete` is admin-only, so `is_admin()` returns early there in every variant.
Needs a decision: candidate SECDEF (keeps the brief's SECDEF + V6) or invoker trigger + a SECDEF helper (exact `current_user` semantics).

**Step 0 inventory (for when 3c resumes):**
- Cosora-Admin `src/` (branch `admin-separation/phase-3b`): 0 direct queries; only comments, generated types and the 4 RPC calls.
- Non-panel direct references. In Cosora-Admin (the five): `scripts/ad-review-rls.mjs:161-182` (INSERT/DELETE deny + SELECT),
  `scripts/rls-matrix.mjs:159-190` (insert + forgery), `scripts/chat-pipeline-matrix.mjs:585-596` (support insert + delete),
  `scripts/drop-chat-fixtures.sql:40`, `scripts/drop-test-admins.sql:5`. **Also in textile-spark-net (not in the brief):**
  `scripts/ad-demo-campaigns-cleanup.sql:56` (`public.ad_review_log`, breaks), `scripts/admin-separation/02_role_matrix.sql:59`
  (`sel ad_review_log owner|A` as authenticated, becomes an error after the move), `04_phase3a_rpc_parity.sql` (direct half is valid pre-move only, by design).
- Buyer/vendor app: no read of either table in `src/`, `supabase/functions/` or `tests/`. Only generated types mention them.
- Functions referencing the tables: exactly the 7 in the brief. No views. FKs out of `advertisements`: `vendor_id → profiles CASCADE`,
  `product_id → products SET NULL`, `ad_order_id → ad_orders SET NULL`, `moderated_by → profiles`.
- Table ACLs still grant anon/authenticated (admin_flags `arwdDxtm`, ad_review_log `rDxtm`): revoke in 3c (Q-13).
- Verification plan for V2: a new RPC-only matrix `05` with **fixed** fixture timestamps (the 3a harness seeds with `now()`, so its
  flag md5s differ per run), resolving tables via `to_regclass('admin.…')` or `public.…`. Run it before and after the move, expecting exactly one
  changed cell (owner-vendor c5 rows → 42501). Swap `02` check 2 to the RPC so `02` stays comparable across the move.

**NEXT STEP:** Mitra: (1) deploy 3b and confirm the production bundle, (2) decide the `guard_ad_deletion` approach.
Then re-run 3c from Step 0.

## 2026-09-15: Phase 3b complete (in Cosora-Admin). HARD STOP: 3c needs Mitra's explicit, independent go.

Mitra's go for 3b was given. The panel is off the tables: `FlagLog.tsx` (read + add), `Reports.tsx` (newest 25) and
`AdReviewQueue.tsx` (decision history) now call `admin_flag_list` / `admin_flag_add` / `admin_ad_review_log_list`.
In a real browser there were 0 direct `/rest/v1/admin_flags|ad_review_log` requests and the render data was byte-identical before and after.
No DB change. Branch `admin-separation/phase-3b` in Cosora-Admin (committed). Details:
`cosora-admin/documentation/admin-separation-context.md` and its `CHANGELOG.md`. Cosora-Admin scripts that still hit the
tables directly (RLS tests, fixture cleanup) are listed there and move with 3c. **3c (the irreversible `SET SCHEMA`) is gated.**

## 2026-09-15: Phase 3a complete. HARD STOP: 3b needs Mitra's explicit, independent go.

**Do not start 3b because checks are green.** The gate exists for an external check before the panel is rewired.

**Applied:** `20260915170000_admin_flags_and_review_log_rpcs` (live `20260915172340`). Additive, no behaviour change.

**New RPCs** (all SECDEF, owner postgres, `search_path=''`, ACL `{postgres, authenticated}`, no anon/service_role):
- `admin_flag_list(p_entity_type text = null, p_entity_id uuid = null, p_limit int = null)` → `id, entity_type, entity_id, note, author_id, created_at, author_full_name, author_email`, newest first. Gate `is_admin()`. md5 `c39368b3…`
- `admin_flag_add(p_entity_type text, p_entity_id uuid, p_note text)` → the new row; `author_id` is always `auth.uid()`. Gate `is_admin()`; CHECKs still give 23514. md5 `172495f5…`
- `admin_ad_review_log_list(p_ad_id uuid)` → all 9 log columns, newest first. Gate **`is_admin()` OR the caller owns the ad** (exact copy of `ad_review_log_select`; see Q-4). md5 `8dd3ad99…`

**Step 0 inventory (for 3b/3c):**
- **Panel call sites to switch in 3b:** `cosora-admin/src/components/FlagLog.tsx:47-52` (read by entity, embed author) → `admin_flag_list(type, id)`; `FlagLog.tsx:61-66` (insert) → `admin_flag_add` (drop the client `author_id`); `src/pages/Reports.tsx:201-205` (newest 25) → `admin_flag_list(null, null, 25)`; `src/components/AdReviewQueue.tsx:488-492` → `admin_ad_review_log_list(adId)`. The embed shape `author:{full_name,email}` becomes flat `author_full_name`/`author_email`, and denial becomes a 42501 error instead of an empty list. Cosora-Admin needs its own `database.types.ts` regenerated.
- **DB writers of `ad_review_log`:** `ad_apply_decision()` (called by approve/reject/request_changes/suspend/pause_by_admin/pause_by_vendor/resume/resubmit/archive and `sweep_ad_schedules`), `log_ad_submission()` trigger. **Readers:** `ad_review_metrics()`, `guard_ad_deletion()` (INVOKER, so it must become SECDEF in 3c, Q-15). **`admin_flags`:** no DB reader or writer. No views, rules or other policies reference either table.
- **Scripts that touch them directly (update by 3c):** cosora-admin `scripts/ad-review-rls.mjs:161-182`, `chat-pipeline-matrix.mjs:585-596`, `rls-matrix.mjs:159-190`, `drop-chat-fixtures.sql:40`, `drop-test-admins.sql:5`; textile-spark-net `scripts/ad-demo-campaigns-cleanup.sql:56`. Buyer app `src/` reads neither table.
- Both tables still grant anon/authenticated SELECT and TRUNCATE (admin_flags full DML). Revoke in 3c (Q-13).

**Verification results:**
- **V1/V3 parity:** harness `04`, 7 personas × 6 checks, **0 mismatches**. Admins SAME with identical row hashes; owning vendor SAME on own-ad log; everyone else DENIED-BOTH (direct 0 rows, RPC 42501) or SAME-42501 on writes. **Mutation test:** an admin-only log RPC plus an ungated flag list gave **7 MISMATCH** in a rolled-back transaction; real bodies confirmed intact.
- **V2:** `admin_flag_add` returns the row with `author_is_self=true persisted=1` for all three admin personas.
- **Regression:** harness `02` byte-identical to its header baseline. Policies 125 (`ada2b51e…`) and triggers 41 (`da376f6a…`) unchanged; the 146 pre-existing public/storage/admin functions hash `8266d734…` (unchanged); both tables' ACL, columns and rows (27 / 0) unchanged.
- **V4 advisors:** no search_path finding, no anon finding. **`authenticated_security_definer_function_executable` 61 → 64** (one per RPC), inherent to SECDEF + authenticated EXECUTE and shared by all existing admin RPCs. Flagged for Mitra, not silently accepted.
- **V5:** `database.types.ts` +38 lines (signatures only); typecheck 0 (harness fires 1); build passes. `MIGRATIONS.md` has an admin-separation section.

**Harnesses (committed):** `scripts/admin-separation/01_accessor_parity.sql`, `02_role_matrix.sql`, `03_mirror.sql`,
`04_phase3a_rpc_parity.sql`. Each is one self-rolling-back statement; run the file text as-is via MCP `execute_sql`,
and the report arrives as the P0001 error text. Baselines are in the file headers. Fixtures: demo-admin `33333333-…`, demo-buyer `11111111-…`.

**Carried state:** write path for admin identity is still `public.profiles`, mirrored into `admin.admin_users`; `is_admin()`/`admin_role()` read
`admin.admin_users`. `record_embedding_pipeline_health()` still reads `profiles.is_admin` (deferred). Tooling:
`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json`, `npm.cmd run build`; the injected-error probe config is scratchpad-only.
Open: Q-2, Q-4 (vendor read of own decision history), Q-8, Q-13, Q-14, Q-15, Q-16.

**NEXT STEP (only after Mitra's explicit go):** Phase 3b - switch the four Cosora-Admin call sites above onto the RPCs,
regenerate Cosora-Admin types, and verify the panel in a browser. Re-run harness `04` (must stay 0 mismatches) and `02`.
