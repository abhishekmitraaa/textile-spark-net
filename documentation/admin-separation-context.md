# Admin-schema separation: rolling context

> **TEMPORARY workstream file.** Fold into the permanent masterplan and delete this file when the
> separation is done. Keep it lean: newest entry on top, facts the next session needs, no history dumps.

**Workstream.** Cosora runs on ONE Supabase project (`vxdhhgdfubqedfpwfyrb`), shared by textile-spark-net
(buyer/vendor app) and Cosora-Admin (admin panel, prod at `cosora-admin.vercel.app`), both on the anon key.
Authorization is enforced in Postgres (RLS + BEFORE triggers gated by `is_admin()` / `admin_role()`). Admin identity,
audit, decisions and moderation config move into a dedicated `admin` Postgres schema **inside the same project**. It is
revoked from `anon`/`authenticated` and NOT exposed to PostgREST. Approvals stay atomic and DB-enforced.
Phases: 1 schema foundation ✅ → 2 identity flip ✅ → 3 `admin_flags` + `ad_review_log` behind the wall ✅ (3a RPCs · 3b panel ·
3c move) → 4 `chat_block_reasons`/`account_suspensions`/`keyword_blocklist`/`flag_patterns`/`conversation_reviews` with the
message-trigger repoint (4a RPCs ✅ · 4b panel ✅ · 4c move ✅ **pending Mitra's independent verification**) → 5 retire `profiles` as admin authority (5a identity RPCs ✅ · 5b repoint ✅ **HARD STOP, awaiting the gate** · 5c contract).

**Spec:** `documentation/admin-separation-spec.md` (FROZEN 2026-09-15; Q-17 closed, Q-12 decided, Q-4 decided, Q-15 closed, Q-13 partly closed).

---

## 2026-09-22: Phase 5b complete (every reader/writer repointed). HARD STOP: 5c needs the external gate.

- Direct column access is 0 in both repos (see changelog for the grep). DB: only D1–D3 read the columns.
- Edge functions on admin_status_of: admin-invite v6, admin-refund-payment v4, bunny-delete-video v3, bunny-reconcile v3.
  tsn AuthContext.isAdmin is from rpc('is_admin'). The panel is on admin_whoami and the 5a roster/write RPCs.
- 5c pre-flight right now: only_in_profiles 0, only_in_au 0, role_mismatch 0 (3 = 3).
- **5c must also repoint tooling:** 7 Cosora-Admin scripts plus 9 harnesses here still touch the profiles columns.
  `BUNNY_API_KEY` is rejected by Bunny (401): pre-existing, and logged in securityflags.

## 2026-09-22: Phase 5a complete (identity RPCs, additive). HARD STOP: 5b needs the external gate.

Working notes for Phase 5 live in `.claude/tmp/phase5-context.md` (both repos, uncommitted).
- Migration `20260922120000_admin_identity_rpcs` (live `20260922120205`, md5 `682218c9…`) adds 7 RPCs plus the private
  `admin.shadow_admin_columns`. The three write RPCs update `admin_users` first, then copy onto the profiles columns while
  those exist, so both paths agree through 5b.
- Harness `11` passed 96/96, and a mutation run failed exactly the 8 predicted cells. `admin-invite` v5 grants via
  `admin_grant`, and was verified live. Drift is 0, with 3 admins.
- **For 5c:** `trg_profiles_sync_admin_users` is `UPDATE OF is_admin, admin_role`, so it must be dropped before the
  columns (the prompt's step order already does this). The `is_admin` default goes with the column.

## 2026-09-22: Phase 4c complete (tables moved). HARD STOP: Phase 4 is complete only after Mitra's independent verification.

**Preconditions (Step 0):**
- **A.** Prod `cosora-admin.vercel.app` bundle `index--JJm6wRt.js`: 12 RPC names and 0 `.from(<five>)` (matcher positive control fires). A browser on every affected screen made 0 table requests.
- **B.** main holds 4a (`a15890e`, tsn) and 4b (`a0218a6`, Cosora-Admin).

**Step 0 (live):**
- Rows are 0/3/7/1/0.
- Exactly 17 bodies name the tables: 5 legacy SECDEF (`search_path=public`, all already `public.`-qualified) and the 12 4a RPCs.
- `regex_probe` reads none of them.
- Nothing else refers to the tables: no views, defaults, cron jobs, publications, other tables' policies, realtime subscriptions, app `src` or edge functions.

**Applied:** `20260921190000_move_chat_moderation_tables_to_admin` (live `20260921181400`); file == applied (`c22d7a9c…`).
- All five tables are `admin.*` with ACL `{postgres, service_role}`. RLS is on, and the 15 policies and 13 FKs are intact.
- No client USAGE on `admin`. REST gives 404 PGRST205, and 406 PGRST106 with `Accept-Profile: admin`.
- 17 bodies repointed by in-DB substitution, md5-guarded pre and post. Rollback is commented in the file.

**Verification:**
- V1: placement and REST as above; grants gone.
- V2/V3/V5: harness `09` 15/15 (messaging, reports, resolve, suspend/reinstate, refusals, SET NULL/CASCADE/23503). Mutation (both message triggers neutered) fails exactly M1 and M2.
- V4: harness `10` 0/140 changed vs 4a.
- `02`: new baseline (checks 1 and 4 on the RPCs).
- V6: advisors identical to post-4a.
- V7: types −249/repo, typecheck 0 (harness fires), both builds pass.
- V8:
  - `chat-moderation-behaviour` 17/17 and `contact-gate-check` 7/7, live.
  - `chat-moderation-matrix`: converted cases 22/22 with demo-admin + demo-buyer. The 2 buyer rows on public `conversations`/`messages` are correct participant access.
  - `chat-pipeline-matrix`: new helpers and T7.7 exercised (PGRST205 ×3).
  - `drop-chat-fixtures.sql` ran on `admin.*` cleanly.
  - The two tsn specs are type-checked (errors unchanged, none on changed lines).
  - No script reads the five over REST (T7.7's `.from(table)` is the intended negative test).
- Not run: the full `chat-pipeline-matrix`, `chat-moderation-matrix` and the two specs. They need seeded `rlstest-*`/`chatfx-*` logins in prod (not seeded, as in 3c).
- Every verification row was removed; live data is 0/3/7/1/0, the demo thread 4 messages, 42 notifications.

**Harnesses:**
- `08` is pre-move only.
- Post-move: `09` messaging+FK and `10` RPC matrix.
- Pitfall: `pg_get_functiondef` output depends on search_path, so pin it before md5-comparing.

**Found and fixed:** `chat-moderation-matrix.mjs` called `resolve_conversation_review` with `p_resolution`, not `p_verdict`. That was PGRST202 for every role, which the matrix scored as "passed auth".

**Carried state for Phase 5:**
- Admin identity writes still go through `public.profiles`, mirrored into `admin.admin_users`.
- The 5 legacy chat functions keep `search_path=public` (pinned, not `''`).
- Branches `admin-separation/phase-4c` exist in both repos and are not merged.

## 2026-09-21: Phase 4a complete (RPCs, additive). HARD STOP: wait for Mitra's independent go before 4b.

**Step 0 (live) matched the brief.** All five tables in `public`, rows 0/3/7/1/0 (kw/pat/reasons/reviews/susp). Policies as in the spec
(S = `is_admin() AND admin_role() IN (support, super_admin)`; SA = super_admin): every SELECT is S; kw/pattern writes S; reason
INSERT/UPDATE/DELETE SA; review UPDATE S + participant INSERT `conversation_reviews_insert_report`; suspensions SELECT only. No triggers on
the five tables. The six functions are all SECDEF, with `search_path=public` (not `''`), left untouched. **Correction:** `regex_probe` reads NO
table (it evaluates `~*` behind an S gate). The message triggers are `messages.trg_messages_blocklist` / `trg_messages_flag_patterns`.
Buyer app `src` + `supabase/functions`: no direct access. Direct readers are admin-persona tests/scripts only, including one **not in the spec
list**: `tests/admin-chat-moderation.spec.ts:78` (support reads `conversation_reviews`). It must switch before 4c.

**Applied:** `20260921090000_chat_moderation_rpcs` (live `20260921164254`); file == applied (`9802c415…`). 12 RPCs, each SECDEF, owner postgres,
`search_path ''`, EXECUTE authenticated only. Panel call site → RPC map for 4b:
- `ChatKeywords` :46/:57/:73 → `admin_keyword_list()` / `_add(p_term)` / `_remove(p_id)`
- `ChatPatterns` :55/:95/:120/:131 → `admin_flag_pattern_list()` / `_add(p_pattern, p_label, p_active=true)` / `_update(p_id, p_active)` / `_remove(p_id)`
  - `:82` keeps `regex_probe`
- `ChatReasons` :59/:79/:94 → `admin_block_reason_list()` / `_add(p_reason)` / `_update(p_id, p_reason?, p_active?)`
- `lib/chat.ts:113` → `admin_block_reason_list(true)`
- `ChatReview:80` → `admin_conversation_review_list(p_status)`; `ChatThread:84` → `admin_conversation_review_list(null, p_conversation_id)`
  - Embeds are flattened: `pattern_label`, `pattern_pattern`, `reason`, `flagged_*`, `conversation_*`.
- `AccountStatus:73` → `admin_account_suspension_list(array[id])`, adding the reason and actor names, so the separate profiles lookup can go.
- `Accounts:94` → `admin_account_suspension_list(ids, true)`
- Writes that stay as they are: `set_account_status`, `resolve_conversation_review`, `submit_report`.

Design choices:
- `added_by`/`created_by` are always `auth.uid()`, not a parameter.
- A remove or update of a missing id returns 0 rows, so `assertWrote` still fires.
- There is no reason-delete RPC, because the panel never deletes a reason.

**Verification:**
- V1 harness `08` (new): 7 personas × 20 checks, direct vs RPC, row md5 in returned order. **0 mismatches.**
  - Mutation run: widening suspensions to `is_admin()`, narrowing reasons to super_admin, and widening reason updates to support gave
    **exactly the 8 predicted MISMATCHes.** Everything rolled back.
- V2 every admitted persona gets identical rows including the joined names; the embeds' own RLS (messages, conversations: member OR S; profiles: true) is a superset of S.
- `02` matches its baseline.
- V3 advisors: `authenticated_security_definer` 64 → 77 = **+12 (4a) +1 `lead_cap_used`** (unrelated lead-cap commit `08a0550`). No other new finding.
- V4 tsn types +143 lines: 12 RPCs + `lead_cap_used`, which the lead-cap work never regenerated. Typecheck 0 (probe fires 1); build passes.
  - Cosora-Admin types are untouched; regenerate them in 4b.

**For 4b/4c:**
- The `lib/chat.ts:106` comment "Support may only read ACTIVE rows (RLS)" is stale: `chat_block_reasons_select` has no active filter. Fix it in 4b.
- 4c must also switch `tests/chat-pipeline.spec.ts`, `tests/admin-chat-moderation.spec.ts`, `scripts/contact-gate-check.mjs`,
  `cosora-admin/scripts/chat-moderation-behaviour.mjs:252` (→ `submit_report`) and `drop-chat-fixtures.sql` (→ `admin.*`).
- Harness `08` is a pre-move artifact after 4c.

## 2026-09-16: Phase 3c complete. HARD STOP: Phase 3 is complete only after Mitra's independent verification. Do not start Phase 4.

**Preconditions verified at Step 0.** (A) The production panel `cosora-admin.vercel.app` (found as the referer in the edge logs), bundle
`index-C7oovihn.js`: 2/1/1 RPC calls, 0 `.from("admin_flags"|"ad_review_log")`. (B) Cosora-Admin `origin/main` ⊇ `c322055`; this repo's
`origin/main` holds the 1/2/3a migrations, each equal to its applied statements (whitespace-insensitive md5).

**Applied:** `20260916090000_move_admin_flags_and_review_log_to_admin` (live `20260915192048`); file == applied (`616be0e8…`).
- **Placement:** `admin.admin_flags` (0 rows), `admin.ad_review_log` (27 rows). None in `public`. ACL `{postgres, service_role}`; no client
  table privilege; no client (or service_role) USAGE on `admin`. REST: 404 PGRST205 / 406 PGRST106 for anon and signed-in callers.
- **Repointed (7):** `ad_apply_decision`, `log_ad_submission`, `ad_review_metrics`, `admin_flag_add`, `admin_flag_list` (pure repoints, asserted
  by md5 in the migration), `admin_ad_review_log_list` (+ **Q-4 admin-only**), `guard_ad_deletion` (**SECDEF, search_path '', bypass
  `current_setting('role', true) is distinct from 'authenticated'`, EXECUTE revoked from PUBLIC/anon/authenticated**).
  New md5 prefixes: apply `99974f21`, log_sub `21c64609`, metrics `62962821`, flag_add `a627bdc3`, flag_list `6b087e20`, log_list `9a9cc381`, guard `0fec2476`.
- **Rollback:** fully commented in the migration (SET SCHEMA back, grants, guard back to invoker + `current_user`, vendor branch, 5 bodies = substitution back).

**Verification (V1–V8):**
- V1 placement/grants/REST as above; `admin` still not exposed (`public, graphql_public`).
- V2 harness `05` (deterministic, RPC-only) pre vs post: **1 of 42 cells changed — `[owner-vendor] c5 2:d896a7ad83 → ERR 42501`** (Q-4); all else identical.
- V3 harness `07` identical pre/post: buyer and owner 42501; super_admin +1 `approved` row in `admin.ad_review_log`. Also a real committed trigger write (fixture `submitted` row).
- V4 harness `06` identical pre/post: owner+reviewed **42501**; owner+never-reviewed **deleted**; super_admin, service_role and postgres **deleted**, `log_rows_after=0`.
- V5 FKs intact across schemas (author_id→profiles, ad_id→advertisements CASCADE, reviewer_id→profiles); cascade proven by V4.
- V6 advisors identical to post-3a (INFO 5, search_path 1 = old `ad_bump_window`, anon 32, authenticated 64); guard not flagged.
- V7 types −86 lines per repo (two table blocks); typecheck 0 (harness fires 1); both builds pass.
- V8 `ad-review-rls.mjs` **25/25** end to end on a labelled fixture; converted rls-matrix and T6.8 cases **14/14** over REST (demo accounts);
  `drop-test-admins.sql` and `drop-chat-fixtures.sql` ran with no schema error; `ad-demo-campaigns-cleanup.sql` changed statement validated
  as a SELECT (the file deletes live `[demo]` campaigns). **Not run:** the full `rls-matrix.mjs` / `chat-pipeline-matrix.mjs` suites, which need
  seeded `rlstest-*`/`chatfx-*` admin logins with a known password in prod. 0 PostgREST references to the moved tables remain.
- Production panel (`cosora-admin.vercel.app`, real browser, post-move): flag log with a UI add, Reports list and decision history all render;
  5 RPC calls 200, 0 direct table requests, no page errors (test note deleted).
- Regression: policies 125 (other 121 md5 unchanged), triggers 41 (`da376f6a…`), 142 non-repointed functions (`b4ea7012…`); harnesses `01` 0/0, `02`, `03` match.
- All verification rows removed; live data back to 0 flags / 27 log rows / 22 campaigns.

**Harnesses** (`scripts/admin-separation/`, one self-rolling-back statement each; run the file text via MCP `execute_sql`; report = P0001 text):
`01` parity · `02` role matrix (check 2 now the RPC) · `03` mirror · `04` pre-3c artifact, do not run · `05` RPC matrix · `06` deletion matrix · `07` audit write.
Fixtures: demo-admin `33333333-…`, demo-buyer `11111111-…`; reviewed ad `0b015f15…` (owner `a0000004…`); pending never-reviewed ad `d7936067…` (owner `a0000002…`).
Pitfalls: never probe an RPC as `count(*) from (select rpc()) s` (the planner skips the call); PowerShell mangles regex/`Remove-Item` in one command.

**Carried state for Phase 4:**
- Admin identity write path is still `public.profiles`, mirrored into `admin.admin_users`; `is_admin()`/`admin_role()` read `admin.admin_users`.
- Still in `public` with residual anon/authenticated grants (Q-13): `chat_block_reasons`, `account_suspensions`, `keyword_blocklist`, `flag_patterns`,
  `conversation_reviews`. Panel embeds `chat_block_reasons(...)` / `flag_patterns(...)` in `AccountStatus.tsx`, `ChatReview.tsx`, `ChatThread.tsx`.
  Message triggers `check_message_blocklist` / `check_message_flag_patterns` (SECDEF) write `conversation_reviews`.
- `record_embedding_pipeline_health()` still reads `profiles.is_admin` (deferred to Phase 5). Open: Q-2, Q-8, Q-13 (rest), Q-14, Q-16.
- Branches: textile-spark-net `admin-separation/phase-3c`, Cosora-Admin `admin-separation/phase-3c` (both committed locally, not pushed).
- Tooling: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` (tsn), `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` (admin), `npm.cmd run build`.

**NEXT STEP:** Mitra independently verifies Phase 3 (e.g. panel flag log / Reports / decision history on prod, a vendor ad deletion,
harnesses `05`–`07`). Phase 4 starts only after that go.
