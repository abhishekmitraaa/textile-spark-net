# Admin-schema separation — Phase 0 spec

> **STATUS: FROZEN (2026-09-15).** Every DB fact below was read from the LIVE database
> (`vxdhhgdfubqedfpwfyrb`) through the Supabase MCP `execute_sql`, using read-only single-statement SELECTs
> against `pg_proc`, `pg_policies`, `pg_trigger`/`information_schema.triggers`, `pg_constraint`,
> `information_schema.columns`/`role_table_grants`/`column_privileges`, `pg_default_acl` and `public.profiles`.
> F11 was verified with a live PostgREST probe. Nothing was written to the database.
> Earlier drafts (2026-09-14/15) were blocked because the MCP was unavailable; their LEADS are now replaced by live facts.
> Corrections to the draft are marked **(corrected)**.

Project: `vxdhhgdfubqedfpwfyrb` (one project, shared by textile-spark-net and Cosora-Admin, anon key only).
Goal: admin identity, audit, decisions and moderation config live in an `admin` Postgres schema. That schema
is revoked from `anon`/`authenticated` and not exposed to PostgREST. Approvals stay atomic and DB-enforced.

Notation used in policy and trigger clauses:
`uid` = `auth.uid()`. `A` = `is_admin()`. `R{x,y}` = `is_admin() AND admin_role() = ANY (ARRAY['x'::admin_role_type, 'y'::admin_role_type])`.
`R{x}` = `is_admin() AND admin_role() = 'x'::admin_role_type`. Roles: `sa` super_admin, `pm` product_moderator,
`vo` vendor_ops, `am` ads_moderator, `fa` finance_admin, `su` support.

---

## A. Admin identity

### A1. Accessors (live `pg_get_functiondef`)

**No `(uuid)` variants exist.** There is exactly one `public.is_admin()` and one `public.admin_role()`, and there is no `admin` schema yet.

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$function$

CREATE OR REPLACE FUNCTION public.admin_role()
 RETURNS admin_role_type LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select admin_role from public.profiles where id = auth.uid();
$function$
```

Both are owned by `postgres`, SECURITY DEFINER, `search_path=public`, and EXECUTE-able by **anon, authenticated and service_role**.
**Semantic note:** `admin_role()` returns the role even when `is_admin = false`. Every policy and gate pairs it with
`is_admin() AND …`, so today's behaviour depends on both columns agreeing. They agree on all rows (A3).

Derived role helpers (all call the accessors; none reads `profiles`):

| Function | Body gate | secdef | anon / auth EXECUTE |
|---|---|---|---|
| `ad_moderator()` | `coalesce(is_admin() and admin_role() in ('super_admin','ads_moderator'), false)` | yes | no / no |
| `certificate_fulfiller()` | `coalesce(is_admin() and admin_role() in ('super_admin','finance_admin'), false)` | yes | no / no |
| `admin_role_values()` | `array(select unnest(enum_range(null::public.admin_role_type))::text)` (no gate) | yes | no / **yes** |

Functions gating on the accessors (live, `prosrc` scan). All are SECURITY DEFINER with `search_path=public` unless noted:

| Function | Clause | anon / auth |
|---|---|---|
| `ad_category_benchmarks(v uuid)` | `if not (vid = auth.uid() or public.is_admin()) then return null` | yes / yes |
| `get_vendor_plan(v uuid)` | `if not (vid = auth.uid() or public.is_admin()) then` | yes / yes |
| `vendor_buyer_geography(v uuid, p_days int)` | `coalesce(vid = auth.uid(), false) or coalesce(public.is_admin(), false)` | no / yes |
| `admin_embedding_pipeline_health(p_limit int)` (search_path public, extensions) | `R{sa,vo}` | no / yes |
| `approve_vendor_content(text, uuid)`, `approve_vendor_content_bulk(uuid)`, `reject_vendor_content(text, uuid, text)` | `R{sa,pm}` | no / yes |
| `regex_probe(text, text)`, `resolve_conversation_review(uuid, text, uuid, boolean)`, `set_account_status(uuid, account_status_type, uuid, text, uuid)`, `set_vendor_document_verified(uuid, boolean, text)` | `R{su,sa}` | no / yes |
| via `ad_moderator()`: `approve_ad_campaign`, `reject_ad_campaign`, `request_ad_changes`, `suspend_ad_campaign`, `pause_ad_campaign_by_admin`, `resume_ad_campaign`, `resubmit_ad_campaign`, `archive_ad_campaign`, `ad_review_metrics`, `ad_fraud_signals` | `ad_moderator()` | no / yes |
| via `certificate_fulfiller()`: `certificate_apply(…)` | `certificate_fulfiller()` | no / no |

**Functions reading `profiles.is_admin` / `profiles.admin_role` directly (not through an accessor). Only these two:**
1. `enforce_admin_grants()`, the `profiles` BEFORE trigger (B5). It guards writes to the columns themselves. It is not a reader of identity for authorization.
2. `record_embedding_pipeline_health()` (SECURITY DEFINER, cron, no client EXECUTE). It notifies admins with
   `from public.profiles p where p.is_admin;`, so it is **REPOINT in Phase 2**.

### A2. Column type

| Column | Type | Nullable | Default |
|---|---|---|---|
| `public.profiles.is_admin` | `bool` | NOT NULL | `false` |
| `public.profiles.admin_role` | USER-DEFINED **`public.admin_role_type`** (enum) | NULL | — |

Enum **`public.admin_role_type`** values, in order: `super_admin, product_moderator, vendor_ops, ads_moderator, finance_admin, support`.
It is used by exactly one column (`profiles.admin_role`) and is the return type of `admin_role()`.
Column grants: **anon and authenticated hold INSERT/SELECT/UPDATE/REFERENCES on both columns**. The only write guard is the
`enforce_admin_grants()` trigger (B5), which runs its checks only when `current_user = 'authenticated'`.

### A3. Seed set (live)

18 profiles total. **3 with `is_admin = true`; 0 with a null `admin_role`; 0 with a role but `is_admin = false`.**

| id | email (profiles = auth.users) | admin_role | account_status |
|---|---|---|---|
| `6f66d05d-df40-4019-ac65-4f1599579810` | abhishekmitra.work1@gmail.com | super_admin | active |
| `fad830b7-52c7-4ee6-83fc-be2e5168acc3` | cosora.work@gmail.com | super_admin | active |
| `33333333-3333-3333-3333-333333333333` | demo-admin@cosora.dev | super_admin | active |

All three exist in `auth.users`. **(corrected)** The changelog lead "2 admins" was stale.
Note: demo-admin, whose password is shared in `.env` files, is a real `super_admin` and will be seeded into `admin.admin_users`.

### Seed SELECT for `admin.admin_users` (exact)

```sql
select p.id, p.admin_role
from public.profiles p
where p.is_admin = true;
```

Phase 1 insert form (idempotent):

```sql
insert into admin.admin_users (id, admin_role)
select id, admin_role from public.profiles
where is_admin = true and admin_role is not null
on conflict (id) do nothing;
```

Expected today: **3 rows inserted, 0 excluded.** Null-role rule (kept for re-runs): `admin_users.admin_role` is NOT NULL, so an
`is_admin = true and admin_role is null` row is **not** seeded and no role is invented. The migration must `raise notice` the
excluded ids, and the report lists them for a manual decision. Such a row today gets `is_admin()` = true but fails every `R{…}` gate.
It therefore holds `A`-only access (e.g. `products_select`, `vendor_documents_all`, `profiles_update`), which it would lose after the Phase 2 repoint.

---

## B. Where admin identity is used

### B4. RLS policies (live `pg_policies`): the Phase 2 regression contract

**70 policies on 37 tables** (36 `public` + `storage.objects`). All are PERMISSIVE, roles `{public}`.
30 are role-gated (`R{…}`), 40 are `A` only. **0 inline `profiles.is_admin`/`admin_role`**: every one goes through the accessors,
so a body-only repoint of the accessors is transparent to all of them. No policy calls `ad_moderator()`/`certificate_fulfiller()`.
Because anon evaluates several of these (e.g. `products_select`), **anon EXECUTE on `is_admin()`/`admin_role()` is required and must be kept.**

| Table | Policy (cmd): USING / WITH CHECK |
|---|---|
| storage.objects | `business_docs_owner_select` (SELECT): `bucket_id='business-docs' AND ((storage.foldername(name))[1] = uid::text OR A)` |
| account_suspensions | `account_suspensions_select` (SELECT): `R{su,sa}` |
| ad_orders | `ad_orders_select_own` (SELECT): `vendor_id=uid OR A` |
| ad_review_log | `ad_review_log_select` (SELECT): `EXISTS (SELECT 1 FROM advertisements a WHERE a.id = ad_review_log.ad_id AND a.vendor_id = uid) OR A` |
| admin_flags | `admin_flags_delete` (DELETE): `R{sa}` · `admin_flags_insert` (INSERT) WC: `A AND author_id=uid` · `admin_flags_select` (SELECT): `A` |
| advertisements | `advertisements_delete` (DELETE): `vendor_id=uid OR R{sa,am}` · `advertisements_insert` (INSERT) WC: `account_is_active(uid) AND ((vendor_id=uid AND status<>'active') OR R{sa,am})` · `advertisements_select` (SELECT): `vendor_id=uid OR A` · `advertisements_update` (UPDATE) USING=WC: `vendor_id=uid OR R{sa,am}` |
| buyer_profiles | `bprofiles_all` (ALL) USING=WC: `id=uid OR A` |
| calls | `calls_select` (SELECT): `buyer_id=uid OR vendor_id=uid OR A` |
| catalogues | `catalogues_select` (SELECT): `status='live' OR vendor_id=uid OR A` · `catalogues_write` (ALL) USING=WC: `vendor_id=uid OR A` |
| categories | `categories_write` (ALL) USING=WC: `A` |
| certificate_orders | `certificate_orders_read` (SELECT): `COALESCE(vendor_id=uid, false) OR COALESCE(A, false)` |
| chat_block_reasons | `_delete` (DELETE): `R{sa}` · `_insert` (INSERT) WC: `R{sa}` · `_select` (SELECT): `R{su,sa}` · `_update` (UPDATE) USING=WC: `R{sa}` |
| conversation_reviews | `_select` (SELECT): `R{su,sa}` · `_update` (UPDATE) USING=WC: `R{su,sa}` (plus non-admin `_insert_report`, see C6) |
| conversations | `conversations_select` (SELECT): `uid=user_a OR uid=user_b OR R{su,sa}` |
| engagement_events | `engagement_events_admin` (ALL) USING=WC: `A` · `engagement_events_select` (SELECT): `vendor_id=uid OR A` |
| flag_patterns | `_delete` (DELETE), `_insert` (INSERT, WC), `_select` (SELECT), `_update` (UPDATE, USING=WC): all `R{su,sa}` |
| follows | `follows_select` (SELECT): `follower_id=uid OR A` |
| keyword_blocklist | `_delete` (DELETE), `_insert` (INSERT, WC), `_select` (SELECT): all `R{su,sa}` (no UPDATE policy) |
| messages | `messages_select` (SELECT): `is_conversation_member(conversation_id) OR R{su,sa}` |
| product_images | `pimages_select` (SELECT): `EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND (p.status='live' OR p.vendor_id=uid OR A))` · `pimages_write` (ALL) USING=WC: `owns_product(product_id) OR A` |
| product_reviews | `product_reviews_delete_own` (DELETE): `buyer_id=uid OR A` |
| product_videos | `pvideos_delete` (DELETE): `vendor_id=uid OR A` · `pvideos_insert` (INSERT) WC: `account_is_active(uid) AND (vendor_id=uid OR A)` · `pvideos_select` (SELECT): `status='live' OR vendor_id=uid OR A` · `pvideos_update` (UPDATE) USING=WC: `vendor_id=uid OR A` |
| products | `products_delete` (DELETE): `vendor_id=uid OR R{sa,pm}` · `products_insert` (INSERT) WC: `account_is_active(uid) AND (vendor_id=uid OR R{sa,pm})` · `products_select` (SELECT): `status='live' OR vendor_id=uid OR A` · `products_update` (UPDATE) USING=WC: `vendor_id=uid OR R{sa,pm}` |
| profiles | `profiles_delete` (DELETE): `A` · `profiles_insert` (INSERT) WC: `id=uid OR A` · `profiles_update` (UPDATE) USING: `id=uid OR A` (no WC) |
| quotes | `quotes_delete` (DELETE): `vendor_id=uid OR A` · `quotes_select` (SELECT): `vendor_id=uid OR A OR owns_rfq(rfq_id)` · `quotes_update` (UPDATE) USING=WC: `vendor_id=uid OR owns_rfq(rfq_id) OR A` |
| reviews | `reviews_delete_own` (DELETE): `buyer_id=uid OR A` |
| rfqs | `rfqs_delete` (DELETE): `buyer_id=uid OR R{sa,pm}` · `rfqs_select` (SELECT): `(status='active' AND (vendor_id IS NULL OR vendor_id=uid)) OR buyer_id=uid OR A` · `rfqs_update` (UPDATE) USING=WC: `buyer_id=uid OR R{sa,pm}` |
| service_reviews | `service_reviews_delete_own` (DELETE): `buyer_id=uid OR A` |
| subscription_invoices | `subscription_invoices_admin` (ALL) USING=WC: `R{sa,fa}` · `subscription_invoices_select` (SELECT): `vendor_id=uid OR A` |
| subscription_payment_orders | `subscription_payment_orders_select` (SELECT): `vendor_id=uid OR A` |
| subscription_plans | `subscription_plans_admin` (ALL) USING=WC: `A` |
| subscription_usage | `subscription_usage_select` (SELECT): `vendor_id=uid OR A` |
| vendor_ad_verifications | `vendor_ad_verifications_select` (SELECT): `vendor_id=uid OR A` |
| vendor_contracts | `vendor_contracts_select` (SELECT): `vendor_id=uid OR A` |
| vendor_documents | `vendor_documents_all` (ALL) USING=WC: `vendor_id=uid OR A` |
| vendor_profiles | `vprofiles_delete` (DELETE): `R{sa,vo}` · `vprofiles_insert` (INSERT) WC: `id=uid OR R{sa,vo}` · `vprofiles_update` (UPDATE) USING=WC: `id=uid OR R{sa,vo}` |
| vendor_subscriptions | `vendor_subscriptions_admin` (ALL) USING=WC: `R{sa,fa}` · `vendor_subscriptions_select` (SELECT): `vendor_id=uid OR A` |

### B5. Triggers gating on admin role (live)

"INVOKER" means the trigger function is not SECURITY DEFINER. It runs as the caller, which is safe because the accessors it calls are SECURITY DEFINER.

| Table | Trigger (timing/event) | Function (security) | Admin clause (verbatim) |
|---|---|---|---|
| products | `trg_products_moderation` BEFORE INSERT OR UPDATE | `enforce_products_moderation()` (INVOKER) | `not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'))`, used 4× (`if not …` / `elsif not …` / `and not …`) |
| product_videos | `trg_product_videos_moderation` BEFORE INSERT OR UPDATE | `enforce_product_videos_moderation()` (INVOKER) | same `('super_admin', 'product_moderator')` clause, 4× |
| advertisements | `trg_ads_moderation` BEFORE INSERT OR UPDATE | `enforce_ads_moderation()` (INVOKER) | `not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'))`, 3× |
| advertisements | `trg_guard_ad_activation` BEFORE UPDATE + `trg_guard_ad_activation_insert` BEFORE INSERT | `guard_ad_activation()` (SECDEF) | `if new.status = 'active' and not coalesce(public.is_admin(), false) then` · `if not coalesce(public.is_admin(), false) then` |
| advertisements | `trg_guard_ad_deletion` BEFORE DELETE | `guard_ad_deletion()` (**INVOKER**) | `if current_user <> 'authenticated' then return old; end if;` · `if public.is_admin() then return old; end if;` · `if exists (select 1 from public.ad_review_log where ad_id = old.id) then raise … 42501` |
| advertisements | `trg_ad_log_submission` AFTER INSERT | `log_ad_submission()` (SECDEF) | no gate; `insert into public.ad_review_log (…) values (new.id, null, 'submitted', null, 'pending_review')` when `new.status = 'pending_review'` |
| vendor_profiles | `trg_vendor_profiles_admin_fields` BEFORE INSERT OR UPDATE | `enforce_vendor_profile_admin_fields()` (INVOKER) | `not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'))`, 4× (post-09-14 body) |
| vendor_documents | `vendor_documents_guard_review` BEFORE INSERT OR UPDATE | `vendor_documents_guard_review_columns()` (SECDEF) | `if public.is_admin() then` |
| profiles | `trg_profiles_admin_grants` BEFORE INSERT OR UPDATE | `enforce_admin_grants()` (INVOKER) | `if current_user <> 'authenticated' then return new;` · INSERT: `if not (public.is_admin() and public.admin_role() = 'super_admin') then new.is_admin := false; new.admin_role := null; new.account_status := 'active';` · UPDATE: `if (new.admin_role is distinct from old.admin_role or new.is_admin is distinct from old.is_admin) and not (public.is_admin() and public.admin_role() = 'super_admin') then raise … 'Only a super_admin may change admin status or admin roles' 42501` |
| conversations | `trg_conversations_status` BEFORE INSERT OR UPDATE | `enforce_conversation_status()` (INVOKER) | `and not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then` |
| messages | `trg_messages_blocklist` BEFORE INSERT · `trg_messages_flag_patterns` AFTER INSERT · `on_message_insert` AFTER INSERT | `check_message_blocklist()` / `check_message_flag_patterns()` / `bump_conversation()` (all SECDEF) | **no admin gate**; they read the moderation config (D8) |

Existing live matrices to reuse for the Phase 2 regression check: Cosora-Admin `scripts/rls-matrix.mjs`, `rls-superadmin.mjs`,
`ad-review-rls.mjs` (26 checks), `chat-moderation-matrix.mjs`, `chat-pipeline-matrix.mjs`; textile-spark-net
`scripts/suspension-gate-check.mjs`, `contact-gate-check.mjs`.

---

## C. Admin-owned tables

### C6. Live inventory

All 7 are owned by `postgres`, with RLS enabled (not forced) and **no triggers on any of them**. Grants are listed per client role. `service_role` has full DML on all 7.

| Table | Rows | Columns | FKs out | FKs in | Checks | Policies | anon & authenticated grants |
|---|---|---|---|---|---|---|---|
| `admin_flags` | 0 | `id uuid NN =gen_random_uuid()`, `entity_type text NN`, `entity_id uuid NN`, `note text NN`, `author_id uuid NN`, `created_at timestamptz NN =now()` | `author_id → profiles(id)` | — | `entity_type ∈ (vendor, product, ad, conversation)`; `length(btrim(note)) > 0` | select `A`; insert WC `A AND author_id=uid`; delete `R{sa}` | ALL incl. **TRUNCATE** |
| `ad_review_log` | 27 | `id uuid NN`, `ad_id uuid NN`, `reviewer_id uuid`, `decision text NN`, `reason_code text`, `note text`, `previous_status text`, `new_status text`, `created_at timestamptz NN =clock_timestamp()` | `ad_id → advertisements(id) ON DELETE CASCADE`; `reviewer_id → profiles(id)` | — | `decision ∈ (submitted, approved, rejected, changes_requested, resubmitted, paused, resumed, suspended, expired, archived, promoted)` | select: **owner** (`EXISTS advertisements … vendor_id=uid`) `OR A` | SELECT, REFERENCES, TRIGGER, **TRUNCATE** (no INSERT/UPDATE/DELETE) |
| `chat_block_reasons` | 7 | `id uuid NN`, `reason text NN`, `active bool NN =true`, `created_by uuid NN`, `created_at timestamptz NN` | `created_by → profiles(id)` | `conversation_reviews.reason_id`; `account_suspensions.reason_id` | — | select `R{su,sa}`; insert/update/delete `R{sa}` | ALL incl. TRUNCATE |
| `keyword_blocklist` | 0 | `id uuid NN`, `term text NN`, `added_by uuid`, `created_at timestamptz NN` | `added_by → profiles(id)` | — | — | select/insert/delete `R{su,sa}` | ALL incl. TRUNCATE |
| `flag_patterns` | 3 | `id uuid NN`, `pattern text NN`, `label text NN`, `active bool NN =true`, `added_by uuid`, `created_at timestamptz NN` | `added_by → profiles(id)` | `conversation_reviews.matched_pattern_id` | `flag_patterns_pattern_valid: (''::text ~ pattern) IS NOT NULL` | select/insert/update/delete `R{su,sa}` | ALL incl. TRUNCATE |
| `conversation_reviews` | 0 | `id uuid NN`, `conversation_id uuid NN`, `flagged_message_id uuid`, `matched_pattern_id uuid`, `source text NN`, `status text NN ='pending'`, `reason_id uuid`, `reviewed_by uuid`, `reviewed_at timestamptz`, `created_at timestamptz NN`, `reported_reason text` | `conversation_id → conversations ON DELETE CASCADE`; `flagged_message_id → messages ON DELETE SET NULL`; `matched_pattern_id → flag_patterns`; `reason_id → chat_block_reasons`; `reviewed_by → profiles` | `account_suspensions.conversation_review_id` | `source ∈ (regex_flag, user_report)`; `status ∈ (pending, resumed, buyer_blocked, vendor_blocked, kept_locked)` | select/update `R{su,sa}`; **`conversation_reviews_insert_report` (INSERT) WC `is_conversation_member(conversation_id) AND source = 'user_report'`** (non-admin) | ALL incl. TRUNCATE |
| `account_suspensions` | 0 | `id uuid NN`, `profile_id uuid NN`, `reason_id uuid`, `source text NN`, `conversation_review_id uuid`, `suspended_by uuid`, `suspended_at timestamptz NN`, `reinstated_by uuid`, `reinstated_at timestamptz`, `active bool NN =true` | `conversation_review_id → conversation_reviews ON DELETE SET NULL`; `profile_id → profiles ON DELETE CASCADE`; `reason_id → chat_block_reasons`; `suspended_by → profiles`; `reinstated_by → profiles` | — | `source ∈ (chat_review, admin_manual)` | select `R{su,sa}` only | ALL incl. TRUNCATE |

Functions touching the 7 tables (live, `prosrc` scan). This is the repoint list:

| Function | Tables | secdef | anon / auth |
|---|---|---|---|
| `ad_apply_decision(…)` (internal; called by the 9 ad review RPCs + sweep) | ad_review_log | yes | no / no |
| `ad_review_metrics(int)` | ad_review_log | yes | no / yes |
| `log_ad_submission()` trigger | ad_review_log | yes | — |
| `guard_ad_deletion()` trigger | ad_review_log | **NO** | — |
| `set_account_status(…)` | account_suspensions | yes | no / yes |
| `check_message_blocklist()` trigger | keyword_blocklist | yes | — |
| `check_message_flag_patterns()` trigger | flag_patterns, **conversation_reviews (INSERT)** | yes | — |
| `submit_report(uuid, uuid, text)` | conversation_reviews | yes | **yes** / yes |
| `resolve_conversation_review(…)` | conversation_reviews | yes | no / yes |
| `regex_probe(text, text)` | flag_patterns (in a comment only; no table access) | yes | no / yes |

**(corrected)** `account_is_active()` / `vendor_account_in_good_standing()` do **not** reference `account_suspensions` (Q-9 closed).
No function references `admin_flags` or `chat_block_reasons`.

### C7. Classification (frozen)

Mechanism for every MOVE: `ALTER TABLE public.x SET SCHEMA admin`. Data, indexes, constraints, RLS policies and grants travel with
the table, and **FKs bind by OID, so no FK has to be dropped or re-created on either side**. The RI cascade actions
(`ON DELETE CASCADE/SET NULL`) run as the table owner, so a buyer deleting a conversation or a vendor deleting an ad still cascades
into `admin.*`. What breaks is text: function bodies naming `public.x`, PostgREST `.from()`/embeds, and scripts.

| Table | Class | Phase | FKs that must change (and why) | Must also change |
|---|---|---|---|---|
| `admin_flags` | MOVE + RPC-WRAP | 3 | None. The out-FK to `public.profiles` stays valid cross-schema. | `FlagLog.tsx:48` read / `:61` insert, `Reports.tsx:202` read. Both embed `author:profiles!admin_flags_author_id_fkey`, so the RPC must return author name/email. Revoke anon/authenticated grants (incl. TRUNCATE). |
| `ad_review_log` | MOVE + RPC-WRAP + REPOINT | 3 | None. `ad_id → advertisements ON DELETE CASCADE` keeps working (it is guarded by `trg_guard_ad_deletion`). | Repoint `ad_apply_decision`, `ad_review_metrics`, `log_ad_submission`; **`guard_ad_deletion()` must become SECURITY DEFINER** (or call a SECDEF helper), otherwise every vendor ad DELETE raises 42501 once the table is in `admin`. Its `current_user <> 'authenticated'` check must be rewritten (inside SECDEF `current_user` is postgres; use `auth.role()`/`session_user` semantics or pass the check through a helper). `AdReviewQueue.tsx:489` → RPC. The owner-read policy branch is unused by app code (verified); it is dropped by design (Q-4). `scripts/ad-review-rls.mjs:161-176`, `ad-demo-campaigns-cleanup.sql:56` updated. |
| `chat_block_reasons` | MOVE + RPC-WRAP | 3 | None. The in-FKs from `conversation_reviews` (still public until Phase 4) and `account_suspensions` stay valid cross-schema. | `lib/chat.ts:113`, `ChatReasons.tsx:59/79/94` → RPCs. **The embeds `reason:chat_block_reasons(reason)` in `AccountStatus.tsx:76`, `ChatReview.tsx:85` and `ChatThread.tsx:87` break the moment this table leaves the exposed schema**, so those three reads must be RPC-wrapped in 3a, even though `conversation_reviews` itself moves in Phase 4. |
| `account_suspensions` | MOVE + RPC-WRAP + REPOINT | 3 | None. | Repoint `set_account_status`. `AccountStatus.tsx:73`, `Accounts.tsx:94` → RPCs. |
| `keyword_blocklist` | MOVE + RPC-WRAP + REPOINT | **4 only** | None. | Repoint `check_message_blocklist()` (already SECDEF, `search_path=public`) in the same migration. `ChatKeywords.tsx:46/57/73` → RPCs; `tests/chat-pipeline.spec.ts:215,242`. |
| `flag_patterns` | MOVE + RPC-WRAP + REPOINT | **4 only** | None. The in-FK from `conversation_reviews.matched_pattern_id` becomes same-schema (moved in the same migration). | Repoint `check_message_flag_patterns()` (already SECDEF). `ChatPatterns.tsx:55/95/120/131` → RPCs. `regex_probe` has no table access; unchanged. |
| `conversation_reviews` | MOVE + RPC-WRAP + REPOINT | **4** (decision, see below) | None. | Its automated writer is the **message trigger** `check_message_flag_patterns()` (`insert into public.conversation_reviews`), so moving it in Phase 3 would break the message trigger before the Phase 4 trigger repoint. Repoint `submit_report`, `resolve_conversation_review`, `check_message_flag_patterns` together in Phase 4. `ChatReview.tsx:80`, `ChatThread.tsx:84` → RPCs (done in 3a, see `chat_block_reasons`). The participant INSERT policy `conversation_reviews_insert_report` is not used by app code (the buyer app uses `rpc('submit_report')`). Its only direct caller is the test `cosora-admin/scripts/chat-moderation-behaviour.mjs:252`, which must switch to `submit_report`. The policy is dropped by design. |

**Nothing in C6 STAYS in `public`.**

### Full object table (MOVE / STAYS / REPOINT / RPC-WRAP / NEW / RETIRE)

| Object | Class | Phase | Basis |
|---|---|---|---|
| schema `admin` | NEW | 1 | Revoked from `public, anon, authenticated`; **not** added to exposed schemas. |
| `admin.admin_users (id uuid pk → auth.users on delete cascade, admin_role public.admin_role_type not null, is_active bool not null default true, created_at, created_by, note)` | NEW | 1 | RLS enabled, no policies. Seeded with 3 rows. |
| `admin.is_admin(uid uuid)`, `admin.role_of(uid uuid)` | NEW (parallel, unused) | 1 | SECDEF, owner postgres, pinned `search_path`. Parity proof only. |
| enum `public.admin_role_type` | **STAYS** | — | Used by `profiles.admin_role`, `public.admin_role()`, both repos' types and `roles.ts`. `admin.admin_users` references it. |
| `public.is_admin()`, `public.admin_role()` | REPOINT (body only) | 2 | Name, signature, SECDEF, `search_path`, owner and **anon/authenticated EXECUTE unchanged**. The body calls `admin.is_admin(auth.uid())` / `admin.role_of(auth.uid())`. All 70 policies (B4) and the 9 admin-gated trigger functions (B5) inherit it. |
| `ad_moderator()`, `certificate_fulfiller()`, `admin_role_values()`, the A1 gated RPCs, the B5 INVOKER triggers | unchanged (transparent) | 2 verify | They call the accessors only. |
| `record_embedding_pipeline_health()` | REPOINT (`where p.is_admin` → join `admin.admin_users` where `is_active`) | 2 | Only non-trigger direct reader. |
| sync `public.profiles → admin.admin_users` (AFTER INSERT/UPDATE OF `is_admin, admin_role`, SECDEF) | NEW (temporary) | **2** (same migration as the repoint) → retired 5 | `Admins.tsx:99/115/135` and `admin-invite` still write `profiles` until Phase 5. Without the sync, promote/demote/role change stop taking effect once the accessors read `admin_users`. |
| `enforce_admin_grants()` / `trg_profiles_admin_grants` | STAYS until 5, then REPOINT/remove admin-column clause | 5 | Still guards the `profiles` columns that remain the write path until Phase 5. |
| `admin_flags`, `ad_review_log`, `chat_block_reasons`, `account_suspensions` | MOVE + RPC-WRAP | 3 | C7. |
| `guard_ad_deletion()` | REPOINT + make SECURITY DEFINER | 3 | C7. |
| `ad_apply_decision`, `ad_review_metrics`, `log_ad_submission`, `set_account_status` | STAYS public, body REPOINT | 3 | C7. |
| `keyword_blocklist`, `flag_patterns`, `conversation_reviews` | MOVE + RPC-WRAP | 4 | C7. |
| `check_message_blocklist`, `check_message_flag_patterns`, `submit_report`, `resolve_conversation_review` | STAYS public, body REPOINT | 4 | C7, D8. |
| `profiles.is_admin`, `profiles.admin_role` | RETIRE as authority | 5 | Q-2. |
| Edge fns reading `profiles?select=is_admin,admin_role` with service role: Cosora-Admin `admin-invite` (also **writes**), `admin-refund-payment`; textile-spark-net `bunny-reconcile/index.ts:119-124`, `bunny-delete-video/index.ts:115-121` | REPOINT to a service-role-only RPC | 5 | PostgREST cannot reach `admin.*` even as service_role while `admin` is unexposed. |
| Cosora-Admin `useAdminSession.tsx:48-52`, `Admins.tsx:70-139` | RPC-WRAP (`my_admin_identity()`, admin list, grant/revoke/set-role) | 5 | E9. |
| textile-spark-net `AuthContext.tsx:67` `is_admin` select | remove | 5 | No consumer (E10). |
| `database.types.ts` (both repos), `roles.ts` header, both `MIGRATIONS.md` | regenerate / update | 1–5 | — |

---

## D. Moderation config read sites (live, verbatim)

| Config table | Read by | Trigger | SECURITY DEFINER | Relevant lines |
|---|---|---|---|---|
| `keyword_blocklist` | `public.check_message_blocklist()` | `trg_messages_blocklist` BEFORE INSERT ON `messages` | **yes**, owner postgres, `SET search_path TO 'public'` | `if exists ( select 1 from public.keyword_blocklist k where k.term <> '' and strpos(lower(new.body), lower(k.term)) > 0 ) then raise exception 'message blocked: contains a restricted term' using errcode = '42501';` |
| `flag_patterns` | `public.check_message_flag_patterns()` | `trg_messages_flag_patterns` AFTER INSERT ON `messages` | **yes**, owner postgres, `SET search_path TO 'public'` | `select f.id into v_pattern_id from public.flag_patterns f where f.active and new.body ~* f.pattern limit 1;` then `update public.conversations set status = 'under_review' …` and `insert into public.conversation_reviews (conversation_id, flagged_message_id, matched_pattern_id, source, status) values (new.conversation_id, new.id, v_pattern_id, 'regex_flag', 'pending');` then `perform public.notify(…)` ×2 |

Both are SECURITY DEFINER owned by `postgres`, so they can read a revoked `admin` schema after Phase 4.
Their bodies use schema-qualified `public.` names, so the Phase 4 repoint is a text rewrite to `admin.` (keep `search_path` pinned).

---

## E. Repo usage (VERIFIED, repo; re-checked 2026-09-15)

### E9. Cosora-Admin

**Session establishment.** `src/lib/supabase.ts` is an anon-key client (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`, `flowType: "implicit"`), with no service-role key.
Login is `signInWithPassword` (`src/pages/Login.tsx:21`). Invite/recovery lands on `/reset-password` via the URL hash
(`ResetPassword.tsx:56-64`, re-reads identity at `:119`). `useAdminSession.tsx` calls `getSession()` and `onAuthStateChange`, then on every auth transition selects
`id, email, full_name, is_admin, admin_role` from `profiles` for the signed-in user (`:48-52`, mapped `:72-73`). `Guard.tsx` `RequireAdmin` blocks
unless `identity.isAdmin`. `RequireSection` uses `roles.ts` `canSee(role)`, where a null role fails closed (`roles.ts:220`). All of this is UX only; the DB is the gate.

**Direct reads/writes of C6 tables** (each needs an RPC once moved):
- `admin_flags`: `components/FlagLog.tsx:48` select (embed author), `:61` insert; `pages/Reports.tsx:202` select (embed author).
- `ad_review_log`: `components/AdReviewQueue.tsx:489` select.
- `chat_block_reasons`: `lib/chat.ts:113` select; `pages/ChatReasons.tsx:59` select, `:79` insert, `:94` update; embedded from `AccountStatus.tsx:76`, `ChatReview.tsx:85`, `ChatThread.tsx:87`.
- `keyword_blocklist`: `pages/ChatKeywords.tsx:46` select, `:57` insert, `:73` delete.
- `flag_patterns`: `pages/ChatPatterns.tsx:55` select, `:95` insert, `:120` update, `:131` delete; embedded from `ChatReview.tsx:84`, `ChatThread.tsx:87`.
- `conversation_reviews`: `pages/ChatReview.tsx:80` select, `pages/ChatThread.tsx:84` select.
- `account_suspensions`: `components/AccountStatus.tsx:73` select, `pages/Accounts.tsx:94` select.

**Admin identity writes:** `pages/Admins.tsx:71-88` (list admins / non-admins), `:99` (`update admin_role`), `:115` (promote `is_admin=true, admin_role`), `:135` (demote `is_admin=false, admin_role=null`), `:157` invoke `admin-invite`.

**RPCs used** (stay public; bodies may need repoint): `set_account_status`, `resolve_conversation_review`, the ad review RPCs, `ad_review_metrics`, `regex_probe`, `set_vendor_document_verified`, `approve_vendor_content_bulk`, `certificate_*`, `admin_embedding_pipeline_health`. Edge functions: `admin-invite`, `admin-refund-payment`.

**Scripts touching C6 / admin identity:** `ad-review-rls.mjs` (direct `ad_review_log` insert/delete/select), `chat-moderation-behaviour.mjs:252` (direct participant INSERT into `conversation_reviews`), `rls-superadmin.mjs`, `rls-matrix.mjs`, `invite-*.mjs`, `chat-pipeline-matrix.mjs`, `chat-moderation-matrix.mjs`.

### E10. textile-spark-net (buyer/vendor app)

- `src/contexts/AuthContext.tsx:67` selects `is_admin`, exposed as `isAdmin` (`:137`). **No component reads `isAdmin`.** This is the only admin-identity read in app code.
- **No `src/` code reads or writes any C6 table.** The buyer path into C6 is `rpc("submit_report")` (`src/lib/queries/chat.ts:80`).
- Other `is_admin` mentions in `src/` are comments (`vendorDocuments.ts:116`, `vendorOnboarding.ts:314`).
- Edge functions (service role): `bunny-reconcile/index.ts:119-124`, `bunny-delete-video/index.ts:115-121` read `is_admin,admin_role` (`super_admin`/`product_moderator`).
- Tests/scripts: `tests/chat-pipeline.spec.ts:88,215,242`, `tests/admin-chat-moderation.spec.ts:78`, `scripts/contact-gate-check.mjs:115-125`, `scripts/suspension-gate-check.mjs`, `scripts/ad-demo-campaigns*.sql` (`public.ad_review_log`).

---

## F. Supabase config

| # | Item | Result |
|---|---|---|
| F11 | API exposed schemas | **`public, graphql_public`** (VERIFIED live 2026-09-15, re-checked the same day: `GET /rest/v1/profiles` with `Accept-Profile: admin` → `406 PGRST106`, hint *"Only the following schemas are exposed: public, graphql_public"*). `storage` is not in the list. `authenticator.rolconfig` has no `pgrst.db_schemas` (`session_preload_libraries=supautils, safeupdate`, `statement_timeout=8s`, `lock_timeout=8s`). **Phase 1 must NOT add `admin`.** Post-check: the same probe must still return that list. |

Phase 1 grant design facts (live `pg_default_acl`):
- Default grants to `anon/authenticated/service_role` are registered **per schema** (`public`, `storage`, `graphql`, `graphql_public`) for grantors `postgres` and `supabase_admin`. **There is no global (`<global>`) default ACL.** A new `admin` schema created by `postgres` therefore gets **no** automatic table/sequence/function grants to client roles.
- Postgres's built-in default still gives **EXECUTE on new functions to PUBLIC**. `admin.*` functions must `revoke execute … from public` explicitly (anon/authenticated inherit PUBLIC). Without schema `usage` they are unreachable anyway, but revoke for defence in depth.
- `create schema admin` by postgres grants no `usage` to anyone. `revoke all on schema admin from public, anon, authenticated` is still run so the intent is explicit and survives a later mistaken grant.
- **An EXECUTE grant on `admin.*` to `authenticated` is inert while `authenticated` lacks `usage` on `admin`.** So Phase 1 parity must be proven as `postgres`, and Phase 2 policies keep calling `public.is_admin()`/`public.admin_role()` (SECDEF), never `admin.*` directly.

---

## Phase plan (FROZEN, ordered)

**Phase 1: admin schema foundation** (textile-spark-net migration, e.g. `20260915090000_admin_schema_foundation.sql`; additive; zero behaviour change)
- `create schema if not exists admin`; `revoke all on schema admin from public, anon, authenticated`; `revoke all on all tables in schema admin from public, anon, authenticated`; `alter default privileges in schema admin revoke all on tables from public, anon, authenticated` (+ `on functions`).
- `admin.admin_users` as in the object table, referencing **`public.admin_role_type`** (no new enum). RLS enabled, no policies.
- Seed with the insert form above. **Expect 3 rows, 0 excluded.**
- `admin.role_of(uid uuid) returns public.admin_role_type` = `select admin_role from admin.admin_users where id = uid and is_active`; `admin.is_admin(uid uuid) returns boolean` = `exists(…)`. SECDEF, owner postgres, `set search_path = ''` or `admin, public`; `revoke execute … from public`; `grant execute … to authenticated` (inert, per F).
- **Do not** touch `public.is_admin()`/`admin_role()`, any policy, any trigger, any existing table. No sync trigger yet.
- Verify: V1 `set role authenticated; select … from admin.admin_users` → 42501; exposed-schemas probe unchanged. V2 `count(profiles where is_admin and admin_role is not null)` = `count(admin.admin_users)` = 3 and `admin.role_of(p.id) is distinct from p.admin_role` = 0. V3 accessor bodies byte-identical to A1. V4 regenerate `src/lib/database.types.ts`, `npm run typecheck` (baseline 0; probe with an injected error), `npm run build`.

**Phase 2: accessor repoint** (one migration)
- Re-sync `admin.admin_users` from `profiles` (it may have drifted since Phase 1). Add the temporary SECDEF sync trigger on `public.profiles` (promote → upsert `is_active=true`; role change → update; demote → Q-12).
- Rewrite **bodies only** of `public.is_admin()` → `coalesce(admin.is_admin(auth.uid()), false)` and `public.admin_role()` → `admin.role_of(auth.uid())`. Keep SECDEF, `search_path`, owner, and anon/authenticated/service_role EXECUTE.
- Repoint `record_embedding_pipeline_health()`.
- Verify: all 70 B4 policies and the 9 admin-gated B5 trigger functions (`enforce_products_moderation`, `enforce_product_videos_moderation`, `enforce_ads_moderation`, `guard_ad_activation`, `guard_ad_deletion`, `enforce_vendor_profile_admin_fields`, `vendor_documents_guard_review_columns`, `enforce_admin_grants`, `enforce_conversation_status`) give identical allow/deny for buyer, vendor, each admin role, and anon (scripts listed in B5); promote/demote/role change in `Admins.tsx` still take effect; `enforce_admin_grants` still refuses a non-super_admin.

**Phase 3: audit and decision tables → `admin`** (textile-spark-net migrations + Cosora-Admin release)
- 3a (tables still public): public SECDEF RPC wrappers gated inside by the accessors (anon EXECUTE revoked) for every E9 read/write on `admin_flags`, `ad_review_log`, `chat_block_reasons`, `account_suspensions`, **and the `ChatReview.tsx`/`ChatThread.tsx` `conversation_reviews` reads** (they embed `chat_block_reasons`). Return the embedded author/reason/pattern fields. Switch the panel; verify.
- 3b: `alter table … set schema admin` for `admin_flags`, `ad_review_log`, `chat_block_reasons`, `account_suspensions`. In the same migration, repoint `ad_apply_decision`, `ad_review_metrics`, `log_ad_submission`, `set_account_status`, and **convert `guard_ad_deletion()` to SECURITY DEFINER**, preserving the service-role bypass and the admin bypass. `revoke all` on the four tables from `anon, authenticated` (incl. TRUNCATE) and verify with `has_table_privilege`.
- Update `ad-review-rls.mjs`, `ad-demo-campaigns-cleanup.sql`. Verify: `ad-review-rls.mjs`, a vendor deleting a draft ad (allowed) and a reviewed ad (refused 42501), the vendor paid-ad INSERT path (writes the log), `suspension-gate-check`, panel pages.

**Phase 4: moderation config + message-trigger repoint** (one migration)
- RPC-wrap `ChatKeywords`/`ChatPatterns` CRUD (3a pattern) and ship the panel first.
- `set schema admin` for `keyword_blocklist`, `flag_patterns`, `conversation_reviews`. In the same migration, rewrite `check_message_blocklist()`, `check_message_flag_patterns()`, `submit_report()`, `resolve_conversation_review()` to `admin.*` (all already SECDEF, keep `search_path` pinned). Revoke client grants.
- Update `tests/chat-pipeline.spec.ts`, `chat-moderation-behaviour.mjs:252` (→ `submit_report`), `contact-gate-check.mjs`.
- Verify: a buyer message containing a blocked term is refused 42501; a pattern match locks the conversation, writes the review and notifies both parties; buyer report works; `chat-pipeline-matrix`, `chat-moderation-matrix`, `contact-gate-check`.

**Phase 5: retire `profiles` as admin authority**
- RPCs `my_admin_identity()`, admin list, grant/revoke/set-role (super_admin-gated, last-super-admin guard in SQL), and a service-role-only `admin_role_of(uuid)` for edge functions.
- Repoint `useAdminSession`, `Admins.tsx`, `admin-invite`, `admin-refund-payment`, `bunny-reconcile`, `bunny-delete-video`; drop `is_admin` from `AuthContext` select.
- Remove the Phase 2 sync trigger and the admin-column clause of `enforce_admin_grants()`; drop or freeze `profiles.is_admin/admin_role` (Q-2).
- Regenerate types in both repos; update `roles.ts` header and both `MIGRATIONS.md`; fold this workstream into the masterplan and delete `admin-separation-context.md`.

---

## OPEN QUESTIONS

Closed by the live run: Q-0 (MCP), Q-1 (enum `public.admin_role_type`, 3 admins, 0 null-role), Q-3 (no null-role rows today; the rule is kept for re-runs),
Q-4 (non-admin policies exist on `ad_review_log` SELECT and `conversation_reviews` INSERT, neither used by app code, both dropped by design on move),
Q-5 **(corrected)**: `cosora-admin/supabase/migrations/` does exist locally (15 files, latest `20260914090000`). The admin-schema migrations go in textile-spark-net as briefed for Phase 1; record each in both `MIGRATIONS.md`.
Q-6 (enum STAYS in public), Q-7 (both accessors are SECDEF with pinned `search_path`), Q-9 (the two helpers do not read `account_suspensions`),
Q-10 (CHECK constraints carry unchanged via SET SCHEMA; intended), Q-11 (anon EXECUTE on the accessors is required and kept).

Still open (none blocks Phase 1):
- **Q-2:** After Phase 5, drop `profiles.is_admin/admin_role` or keep them as a frozen read-only mirror?
- **Q-8:** Edge functions: service-role-only `public.admin_role_of(uuid)` RPC (proposed), or another route?
- **Q-12:** On demote, should the sync trigger (Phase 2) and the Phase 5 RPC **delete** the `admin.admin_users` row or set `is_active = false` (keeps history and `created_by`)? The accessors treat both the same.
- **Q-13 (existing security observation, out of scope):** anon/authenticated hold **TRUNCATE** (and full DML on 6 of 7) on every C6 table. TRUNCATE bypasses RLS. It is not reachable over PostgREST, so it is latent, but should these grants be revoked **now** (a small standalone hardening migration) rather than waiting for Phases 3–4? The same pattern likely applies to other public tables (the default ACL grants `arwdDxtm` to anon on `public`).
- **Q-14 (existing observation):** `submit_report(uuid, uuid, text)` is EXECUTE-able by **anon**. Confirm its body refuses a null `auth.uid()` before Phase 4 repoints it. The body was not read in Phase 0.
- **Q-15:** `guard_ad_deletion()` → SECURITY DEFINER in Phase 3 changes the meaning of its `current_user <> 'authenticated'` bypass (inside SECDEF `current_user` is `postgres`). Choose the replacement check (e.g. `auth.role() = 'authenticated'` or `coalesce(auth.uid(), null) is not null`) and cover service_role/cron/cascade paths in the Phase 3 matrix.
- **Q-17 — CLOSED in Phase 2a (`20260915140000_harden_admin_grants_q17`):** null-safe `coalesce` guard in both branches of `enforce_admin_grants()` plus `profiles_admin_requires_role CHECK (not is_admin or admin_role is not null)`, each layer proven independently live. Original note:
- **Q-4 — REOPENED in Phase 3a (needs a decision before 3c):** the Phase 3 correctness rule ("reproduce the table's current RLS exactly") overrides the Phase 0 plan to drop `ad_review_log_select`'s owner branch. `admin_ad_review_log_list(p_ad_id)` therefore admits the campaign's owning vendor as well as admins. Nothing in the vendor app calls it. Decide explicitly whether vendors keep read access to their campaign's decision history once the table is in `admin`. If not, narrow the RPC in its own migration and update harness `04`.
- **Q-12 — DECIDED in Phase 2b:** demote sets `admin.admin_users.is_active = false` (row and role kept); deleting a profile deletes the row.
- **Phase 2 deviation from the object table:** `record_embedding_pipeline_health()` was NOT repointed. It still reads `profiles.is_admin`, which stays accurate while profiles is the mirrored write target. Repoint it when the write path moves off profiles (Phase 3–5).
- (Q-17 original, added Phase 1, 2026-09-15; latent, 0 rows at the time): trigger guards fail **open** for an `is_admin = true` profile with a NULL `admin_role`. `not (public.is_admin() and public.admin_role() in (…))` is NULL, so `IF` skips the raise. This was observed live in a rolled-back probe: a promoted-but-roleless demo-buyer could toggle its own `is_admin` past `enforce_admin_grants()`. Policies fail closed for the same row. The Phase 2 repoint removes the state: `admin.admin_users.admin_role` is NOT NULL, so `is_admin()` true implies a non-null role. Until then, neither `Admins.tsx` nor `admin-invite` should ever write `is_admin = true` without a role. Also add a `profiles` CHECK (`not is_admin or admin_role is not null`) in Phase 2?
- **Q-16:** `enforce_admin_grants()` only enforces when `current_user = 'authenticated'`, and anon holds column UPDATE on `is_admin/admin_role`. Anon has no `profiles` row matching `id = auth.uid()` (null), so `profiles_update` blocks it today. Keep this in the Phase 2 matrix (anon PATCH `is_admin` → 0 rows) since the sync trigger will make `profiles` writes consequential.

---

## Appendix A: queries used (read-only, single statements, via MCP `execute_sql`)

Kept so any fact above can be re-derived. Run each as one call.

**Q1 accessors + helpers:** `select json_agg(json_build_object('fn', …, 'secdef', p.prosecdef, 'config', p.proconfig, 'owner', pg_get_userbyid(p.proowner), 'exec_anon', has_function_privilege('anon', p.oid, 'execute'), 'exec_auth', …, 'def', pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and p.proname in ('is_admin','admin_role','admin_role_values','ad_moderator','certificate_fulfiller')`

**Q2 functions referencing identity/config (lines):** `… where p.prosrc ~* 'is_admin|admin_role|keyword_blocklist|flag_patterns'`, returning `json_agg(trim(l))` over `unnest(string_to_array(p.prosrc, E'\n')) l where l ~* …`; plus `… p.prosrc ~* 'ad_moderator\(|certificate_fulfiller\('` for indirect gates.

**Q3 columns/enum/schemas:** `information_schema.columns` where `column_name in ('is_admin','admin_role')`; `pg_type t where t.typtype='e' and t.typname ilike '%admin%'` with `pg_enum`; `pg_namespace`; `pg_roles.rolconfig` for `authenticator`; `pg_views`/`pg_matviews` definitions (none reference admin objects); `information_schema.column_privileges` for `profiles`.

**Q4 seed set:** `select json_build_object('total_profiles', (select count(*) from public.profiles), 'is_admin_true', …, 'is_admin_true_null_role', …, 'role_set_but_not_admin', …, 'rows', (select json_agg(…) from public.profiles p left join auth.users u on u.id=p.id where p.is_admin = true or p.admin_role is not null))`

**Q5 policies:** `select json_agg(json_build_object('t',schemaname||'.'||tablename,'p',policyname,'cmd',cmd,'roles',roles,'perm',permissive,'qual',qual,'wc',with_check)) from pg_policies where coalesce(qual,'')||' '||coalesce(with_check,'') ~* 'is_admin|admin_role|ad_moderator|certificate_fulfiller'`; counts via `count(*) filter (…)`.

**Q6 triggers:** `pg_trigger t join pg_class c … join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and cn.nspname='public'` with `pg_get_triggerdef(t.oid)`, `p.prosecdef`, and regex flags; bodies via `json_object_agg(p.proname, pg_get_functiondef(p.oid))`.

**Q7 the seven tables:** rows via `query_to_xml(format('select count(*) as c from public.%I', t.name), …)`; columns `information_schema.columns`; FKs/checks `pg_constraint` (`contype in ('f','c','u')`, both `conrelid` and `confrelid`); `pg_policies`; `information_schema.triggers`; `information_schema.role_table_grants`.

**Q8 functions touching the seven tables:** `… where p.prosrc ~* 'admin_flags|ad_review_log|chat_block_reasons|keyword_blocklist|flag_patterns|conversation_reviews|account_suspensions'`.

**Q9 default privileges:** `select json_agg(json_build_object('grantor', pg_get_userbyid(defaclrole), 'schema', coalesce(defaclnamespace::regnamespace::text,'<global>'), 'objtype', defaclobjtype, 'acl', defaclacl::text)) from pg_default_acl`

**F11 probe (no MCP needed):** `GET https://vxdhhgdfubqedfpwfyrb.supabase.co/rest/v1/profiles?select=id&limit=0` with `apikey`/`Authorization` = anon key and `Accept-Profile: admin` → expect `406 PGRST106 … public, graphql_public`.
