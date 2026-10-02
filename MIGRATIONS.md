# Migrations — read this before applying any

**Three repositories share one Supabase project.** `textile-spark-net` (buyer +
vendor app), `Cosora-Admin` (admin panel) and `cosora-blogs` (the Journal at
`/blogs`) each hold a `supabase/migrations/` directory, and all three apply to
the **same database** (project `vxdhhgdfubqedfpwfyrb`).

No repo's migration set is self-contained. Applying one repo's migrations on a
fresh database without the others', or applying them in repo order rather than
timestamp order, **will fail** — and on a database that already has data it can
fail halfway. The dependency crosses every boundary: `cosora-blogs` creates
`blog_posts`, which `textile-spark-net`'s blog CMS migrations then alter.

## Which repo owns which migrations

**Each migration file lives in exactly one repo.** The only exception is the two
Phase 5 admin-identity files below, mirrored on request with an explicit "count
once" note. A file present in two repos gets applied twice by the rule below.

| repo | owns | where new migrations go |
|---|---|---|
| `textile-spark-net` | **The canonical home.** Buyer and vendor schema; every `admin_*` RPC since admin completion Phase 1 (FAQs, cron status, reviews, payments, customers, leads, live activity, site content, discounts); the blog CMS (`20260929114553`–`20260929123402`); the blog triggers, read time and reserved slugs; CSP violation reports. | **Here, by default.** Put a migration anywhere else only for a stated reason. |
| `Cosora-Admin` | The admin panel's own early schema, `20260717140000` to `20260914090000` (admin panel, moderation, ad review, fraud signals, certificates), plus the two Phase 5 mirrors of textile-spark-net files. | Nothing new since Phase 5. |
| `cosora-blogs` | The two migrations that created the Journal's tables: `20260929014507_create_blog_tables`, `20260929014529_blog_tables_revoke_client_writes`. | Nothing new. Blog schema changes go to textile-spark-net. |

---

## The rule

> Merge all three repos' `supabase/migrations/` directories into one list, sort
> by filename timestamp, and apply in that order.

The timestamps already encode the correct order. They interleave across repos on
purpose. There is no "apply admin first, then buyer" shortcut — the dependency
runs **every way**.

> **Measured 2026-09-23: even merged, the two directories cannot build the schema
> from an empty database.** Of the 162 versions in
> `supabase_migrations.schema_migrations`, 45 have no file in either repo under any
> timestamp. That includes all 21 from 2026-07-04/05, which create `profiles`,
> `rfqs`, `quotes` and `vendor_profiles`; `grep` finds no `create table` for any
> of them in either repo. Their SQL exists only in
> `schema_migrations.statements` on the live project. The rule above orders what
> IS committed. It is not a from-scratch rebuild.

## Standing rule for new migrations (Master Prompt 12, 2026-09-23)

- **Every migration lands as a committed file.** Applying it live through the MCP is
  not enough on its own.
- **Name the file by the version the database recorded.** `apply_migration` stamps
  its own UTC version, so apply, read the version back from `list_migrations` (or
  `schema_migrations`), and then name the file `<that version>_<name>.sql`. The
  repo name and the live history then agree, and
  `https://raw.githubusercontent.com/abhishekmitraaa/textile-spark-net/main/supabase/migrations/<version>_<name>.sql`
  resolves for anyone checking. The file's statements must equal what was applied:
  compare whitespace-insensitive md5s of the file and of
  `array_to_string(statements, E'\n')`.
- **Renaming an older file to its live version is safe only if no other file, in
  any of the three repos, sorts between the old and new names.** Check all three
  directories before renaming.

| file (= live version) | what it does |
|---|---|
| `20260916180244_schedule_subscription_expiry_sweep.sql` | Daily 03:29 UTC `cron.schedule` of `expire_subscriptions()`. Committed as `20260916171000_…`, renamed 2026-09-23 |
| `20260916181213_lead_cap_counts_open_marketplace_only.sql` | `lead_cap_used()` plus `enforce_lead_cap()` counting open-marketplace quotes only. Committed as `20260916181100_…`, renamed 2026-09-23 |
| `20260923074903_targeted_quotes_exempt_from_lead_cap.sql` | `rfq_targets_vendor()` plus the targeted early return in `enforce_lead_cap()`. Self-asserts its grants and invoker rights |
| `20260923081708_quotes_only_on_rfqs_open_to_the_vendor.sql` | Definer trigger `trg_quotes_accepting_rfq`: a quote needs an active RFQ, addressed to nobody or to that vendor. Self-asserts EXECUTE revoked and that it fires before `trg_quotes_lead_cap` |
| `20260923082118_plan_cap_triggers_serialize_per_vendor.sql` | Per-vendor `pg_advisory_xact_lock` in `enforce_product_cap()` and `enforce_lead_cap()`. Self-asserts that each function changed by exactly the lock lines (md5 before = md5 after minus the block) |
| `20260923093304_embedding_health_reads_recent_cron_runs_only.sql` | `embedding_pipeline_health()` reads `cron.job_run_details` by `runid desc limit`, not a full scan (64 s under load → ~24 ms). Self-asserts the exact `worker_last_run` equals the old full-scan answer |
| `20260923094728_embedding_health_missing_excludes_queued_rows.sql` | Its "missing embedding" counts skip rows whose job is still queued: no WARN (and admin notification) for a request posted a minute ago. Self-proves it with a rolled-back RFQ, queued vs unqueued |
| `20260923115507_account_status_deleted.sql` | Adds `'deleted'` to `account_status_type`. A migration of its own, because a transaction cannot use an enum value that it added itself. Whitespace-insensitive md5 `d10931d0…` = live |
| `20260923115839_account_deletion_requests.sql` | "Delete my account": `account_deletion_requests` and the private `account_deletion_otps`, the issue/confirm/cancel functions, `anonymize_account()`, the daily `account-deletion-sweep` (03:41 UTC), a guard so a deleted account's identity rows stay scrubbed, and `set_account_status()` refusing `'deleted'` both ways. Self-asserts that it patched the exact `set_account_status()` read in Phase 0 (md5) and changed it by the guard block only, plus every grant, RLS flag and the cron job. md5 `ac6abac4…` = live |
| `20260923133539_for_you_location_soft_boost.sql` | `for_you_products()`: a small same-city (0.05) and same-state (0.02) ordering boost on the vector tiers. It keeps the same rows, and a buyer with no location runs a verbatim branch of the old query. Self-asserts the pre-patch md5 (`93714de1…`), then SECURITY DEFINER, STABLE, `search_path = public, extensions`, grants and the `auth.uid()` guard. md5 `4c2abda7…` = live |
| `20260923144549_faqs_admin_editable.sql` | `public.faqs`: anon and authenticated read active rows, and no client writes. `admin_faq_list/add/update/delete/reorder` (definer, `search_path = ''`, EXECUTE for authenticated only; list admits support + super_admin, writes super_admin). Seeded verbatim with the 17 FAQs that were hardcoded in `Help.tsx` and `Subscription.tsx`. Self-asserts RLS, the grants, each function's definer + search_path + EXECUTE, and the seed counts. md5 `0493a662…` = live |
| `20260923150408_faqs_hide_created_by_from_clients.sql` | Narrows clients' table-wide SELECT on `faqs` to every column except `created_by`, which would name the admin who wrote a row (profiles are readable signed out). Self-asserts `created_by` is unreadable, the filtered and ordered columns still readable, and no write grant, for anon and authenticated |
| `20260923171821_profiles_contact_columns_private.sql` | MPF-3: anon and authenticated lose table SELECT on `profiles` and get column SELECT on everything except `email` and `phone`. Adds `my_contact_info()`, `call_buyer_contact(uuid)` (callGate's rules plus the RFQ relationship, in the database) and the admin-gated `admin_profile_search(text, int)` / `admin_profile_emails(uuid[])`. Self-asserts the column list, both roles' grants, the kept UPDATE, and EXECUTE for authenticated only. **Needs the Phase 11 front-end code:** old code that selects the two columns is refused |
| `20260923174653_profiles_contact_columns_interim_authenticated.sql` | **Interim:** grants `email` and `phone` back to authenticated only, because the live front ends still ran the old code. Self-asserts that anon stays closed. Revert after both deploys with `revoke select (email, phone) on public.profiles from authenticated;` (MPF-19). Reverted by `20260923190354` on 2026-09-24 |
| `20260923182259_calls_writes_only_through_log_call.sql` | MPF-2: anon and authenticated lose INSERT/UPDATE/DELETE/TRUNCATE on `calls`, and `calls_insert` and `calls_write` are dropped (reads unchanged). Adds `log_call(uuid, text)`: an active caller, a vendor target that isn't the caller, server-set `buyer_id`, `direction` and `created_at`, the context cleaned to 200 characters, and a rate limit (60 s per vendor, 5 per vendor per day, 30 per hour). Self-asserts the grants, no write policy left, a SELECT policy kept, EXECUTE for authenticated only, and definer with an empty search_path |
| `20260923190354_profiles_contact_columns_revoke_interim.sql` | MPF-19: revokes the interim `email`/`phone` SELECT from authenticated, once both front ends ran the new code (checked in the live bundles, 2026-09-24). Self-asserts that neither anon nor authenticated can select the two columns, that the other 7 columns stay readable and UPDATE is kept, and that `my_contact_info()` and `call_buyer_contact()` are executable |
| `20260923200739_account_deletion_sweep_edge_function_and_private_rows.sql` | MPF-7 parts 1 and 2. `anonymize_account()` also deletes the account's saved items and folders, saved videos, follows, recently viewed, video likes and notifications, and clears `engagement_events.viewer_id`. Adds `complete_account_deletion()`, `account_deletion_sweep_list()` and `record_account_storage_cleanup()` (service_role only), `storage_cleaned_at` / `storage_error` on the request, and `process_due_account_deletions(p_min_overdue)` (dropped and recreated). The cron job posts to the `account-deletion-sweep` edge function, with a 1-day SQL backstop. Self-asserts grants, the job's command and the folder-items cascade |
| `20260923201559_deleted_accounts_cannot_write.sql` | MPF-7 part 3. `account_not_deleted(uuid)` (false only for `'deleted'`, or a missing row), added to all 46 own-row write policies: WITH CHECK on public UPDATE/FOR ALL, USING on public DELETE, and storage own-folder INSERT/UPDATE/DELETE. Generated from the live policy text. Self-asserts that none is left ungated and the count is 46 |
| `20260923213225_account_deletion_whatsapp_channel.sql` | MPF-6. `account_deletion_requests.channel` (`email`/`whatsapp`, set when a request opens); `account_deletion_channels(uuid)` (a usable email first, then a confirmed `auth.users.phone`; no API role may call it); the blocker's `no_email` becomes `no_contact`; `issue_account_deletion_code(uuid)` is replaced by `(uuid, text[])`, which takes the channels the edge function can deliver on and answers `not_configured` with the channel before writing anything. Deploy the `account-deletion` edge function (v2) with it. Self-asserts the old signature is gone, the grants, and that every account the old rule accepted on email still gets email first. Whitespace-insensitive md5 `3ca8de95…` = live |
| `20260924161525_fx_rates_cache_and_daily_refresh.sql` | MPF-11. `public.fx_rates` (one row, INR base only: `rates` jsonb, `rates_date`, `source`, `updated_at`), public SELECT and no client writes, plus pg_cron `fx-rates-refresh` daily at 16:30 UTC, which posts to the `fx-rates-refresh` edge function with the Vault service-role key (inert without the secret). Deploy that function with it. Self-asserts the job, the grants and the INR-only check. Whitespace-insensitive md5 `aff62040…` = live |
| `20260924170736_faqs_support_can_write.sql` | Phase 22 (Phase 9 Q3). `admin_faq_add`, `_update`, `_delete` and `_reorder` admit support as well as super_admin: `admin_faq_list`'s predicate, character for character, and a 42501 message naming both roles. Nothing else in the four bodies changes; `admin_faq_list` isn't touched. Restates the four grants (authenticated only), updates the table comment, and re-runs the 20260923144549 self-check against the new gate. Applied 2026-09-24; the file matches the live statements (whitespace-insensitive md5). Pairs with Cosora-Admin's `SECTION_WRITE.faqs` |
| `20260924174051_faq_snapshots_cdn_cache.sql` | Phase 23 (Phase 9 Q2). Public bucket `faq-snapshots` (JSON only, 64 KB, no client write policy); `faqs_queue_snapshot()` (definer, `search_path ''`, EXECUTE revoked) and statement trigger `trg_faqs_snapshot` on `public.faqs`, one best-effort pg_net call per transaction to the `faqs-snapshot` edge function; cron `faq-snapshots-refresh` (`17 * * * *`, raises if the Vault key is missing); self-check. Needs `faqs-snapshot` deployed first. Its header says an edit reaches visitors "within 5 minutes"; measured, Storage runs as Smart CDN here and it is ~47 s (`technicalimplementation.md`, "FAQ read path"). Applied 2026-09-24; the file matches the live statements (whitespace-insensitive md5) |
| `20260925075432_faqs_seed_seller_registration_and_subscription.sql` | Phase 24 (Phase 9 Q4). Andy's Seller Registration (10) and Subscription (5) FAQs, which went live through the admin RPCs on 2026-09-23. It moves the five `subscription` rows `20260923144549` seeded to 120–140 (active) and 210/240 (off), matching on question and original answer, then inserts Andy's 15 wherever no active copy exists. Conditional throughout: on the live database it changed nothing, and on a fresh one it produces the live state. Both were rehearsed and rolled back. Self-check: 10 / 8 active, 10 in all, each question once, and the order. Needs `20260923144549` first. Applied 2026-09-25; the file matches the live statements (whitespace-insensitive md5) |
| `20260925172634_cron_jobs_raise_without_vault_key.sql` | Flag-fix pass (MPF-27). `fx-rates-refresh` becomes a DO block that raises when the Vault `service_role_key` is missing; a new job `account-deletion-sweep-alarm` (03:43 UTC) raises when it is missing, leaving `account-deletion-sweep` and its SQL fallback as they were. Self-check. |
| `20260925173024_quotes_status_and_terms_by_role.sql` | Flag-fix pass (MPF-18). `enforce_quote_update_roles()` (invoker) and `trg_quotes_update_roles` BEFORE UPDATE on `quotes`: the RFQ owner changes only `status`; the vendor changes terms and may only reset status to pending, and revised terms reset a decided quote to pending; only an admin changes id / rfq_id / vendor_id / created_at. Self-check. |
| `20260925173423_engagement_event_failures_recorded.sql` | Flag-fix pass (MPF-23). `admin.engagement_event_failures` (per hour, error code, constraint; RLS, no grants), `log_engagement_event()` recording non-FK failures instead of swallowing them (signature and grants unchanged), `admin_engagement_event_failures()` (super_admin, vendor_ops). Self-check. |
| `20260925173658_admin_role_manager.sql` | Flag-fix pass (MPF-26, part 1). `alter type admin_role_type add value 'manager'`, alone because a new enum value can't be used in the transaction that adds it. |
| `20260925174031_admin_audit_log.sql` | Flag-fix pass (MPF-26, part 2). `admin.audit_log` (append-only: no grants, RLS, a trigger refusing UPDATE/DELETE); `admin.audit_row_change()` attached as `trg_admin_audit` to the 17 tables the admin panel writes and `profiles.account_status`; `admin_audit_session()`, `admin_audit_record()` (service_role), `admin_audit_log_list()` and `admin_audit_log_actors()` (super_admin, manager). Self-check. |
| `20260925201948_admin_audit_log_guard_search_path.sql` | Flag-fix pass (MPF-26, part 3). Pins `search_path = ''` on `admin.audit_log_append_only()`, which the security advisor flagged. Self-check. |
| `20260925210601_admin_manager_assigns_team_roles.sql` | Managers assign teammates' roles (Mitra, 2026-09-26). `admin.is_team_role()` names the five team roles. `admin_set_role`, `admin_grant`, `admin_revoke` and `admin_search_candidates` admit a manager for teammates in team roles only: never Super admin or Manager, never a super admin, another manager or the caller. Self-check. |
| `20260926082046_unschedule_all_cron_jobs.sql` | Mitra, 2026-09-26: "remove all the scheduled tasks". Calls `cron.unschedule()` on every job (twelve that day) and raises if any remains. What stopped, and which migrations define each job: `documentation/ToDo.md`, "Restore the scheduled jobs". |
| `20260927145549_admin_write_role_separation.sql` | Admin completion, Phase 1a. RLS admin arms name their roles: `subscription_plans` → super_admin and finance_admin (with `trg_admin_audit`); `quotes` update/delete → super_admin; `product_videos` and `catalogues` → super_admin and product_moderator. The admin arm is dropped from the `advertisements` write policies (review RPCs only). `vendor_documents` and `buyer_profiles` become own-row ALL plus an admin SELECT policy (`buyer_profiles`: super_admin and support). `profiles` delete → super_admin, insert own row only, update → super_admin and support. `engagement_events_admin` is dropped. Self-checks that no touched write policy admits every admin. Rehearsed with `scripts/admin-completion/01_write_matrix.sql`. md5 `bdab0118…` = live |
| `20260927150304_moderation_and_campaign_guards.sql` | Admin completion, Phase 1b. A non-owner admin changes only `status`/`rejection_reason` on products and videos, and a move to `rejected` needs a reason (triggers and `reject_vendor_content()`). `plan_id`/`plan_expires_at` → super_admin and finance_admin; `ad_verified_until` → super_admin. `guard_ad_deletion()` loses its admin bypass. `impressions`/`clicks` move only through the ad server, and a client insert starts them at 0. md5-guards the six bodies it replaces; self-checks security mode, search_path and triggers. Harness `02`. md5 `f2f9b096…` = live |
| `20260927150657_admin_rpc_guards.sql` | Admin completion, Phase 1c. `set_account_status()` refuses your own account, and refuses another admin's unless you're super_admin. `request_ad_changes()` needs a note. `admin.flag_pattern_breadth_problem()` (no client grant) is called by `admin_flag_pattern_add`/`_update`: it refuses a pattern that matches '' or 2+ of 12 ordinary messages, and caps length at 200. `certificate_dispatch()` checks the role first. `admin_list_admins()` → super_admin and manager. `ad_bump_window()` gets a search_path. md5-guarded; harness `03`. md5 `69ae2c55…` = live |
| `20260927150904_revoke_unused_table_privileges.sql` | Admin completion, Phase 1d. Revokes TRUNCATE, TRIGGER and REFERENCES on every public table from anon and authenticated (TRUNCATE bypasses RLS), plus the matching default privilege for tables postgres creates. Self-checks all 45 tables and that the CRUD grants PostgREST needs are kept. md5 `dbf21015…` = live |
| `20260927153142_restore_essential_cron_jobs.sql` | Admin completion, Phase 2 (Mitra's choice: restore the essentials + prune). Re-creates `account-deletion-sweep`, `account-deletion-sweep-alarm`, `subscription-expiry-sweep`, `ads-schedule-sweep`, `faq-snapshots-refresh`, `embedding-health-log` and the raising `fx-rates-refresh` verbatim from their latest migrations. Adds `cron-history-prune` (03:11 UTC, run history older than 14 days) and runs the first prune (16,975 rows). Self-checks exactly 8 active jobs, their schedules and commands. md5 `28ae5c1e…` = live |
| `20260927154047_admin_cron_status.sql` | Admin completion, Phase 2b. `admin_cron_status()` (super_admin, vendor_ops; definer, `search_path ''`, EXECUTE authenticated only): each job's schedule, last run and 24-hour run and failure counts. It reads `cron.job_run_details` only through the runid primary key. md5 `9d0fd047…` = live |
| `20260927182120_admin_review_rpcs.sql` | Admin completion, Phase 3a. `block_account_from_review()` (support, super_admin): locks the review, checks the participant and an active block reason, then calls `set_account_status()` and `resolve_conversation_review()` in one transaction. `approve_vendor_videos_bulk()` approves a vendor's pending videos only and returns the count. `admin.ad_reason_codes` holds the 8 codes, read by `admin_ad_reason_codes()`. `pause_ad_campaign_by_admin` is dropped and recreated with an optional note (grants restored, no overload). Reject, suspend and pause tell the vendor the code's label when there's no note. md5-guarded; harness `05`. md5 `7da4a57b…` = live |
| `20260927182524_audit_reason_and_subscription_rpcs.sql` | Admin completion, Phase 3b. `admin.audit_log.reason`, filled by `audit_row_change()` from the transaction-local `cosora.audit_reason`. `admin_audit_log_list()` is dropped and recreated to return it (grants restored). `admin_subscription_change_plan()` and `admin_subscription_cancel()` (super_admin, finance_admin; reason required) change `vendor_subscriptions` and the cached `vendor_profiles.plan_id`/`plan_expires_at` together and notify the vendor. md5-guarded; harness `06`. md5 `864bcfb5…` = live |
| `20260927182703_admin_report_summary.sql` | Admin completion, Phase 3c. `admin_report_summary(from, to)` (any active admin) returns Reports as one JSON document, in paise. Subscriptions net of GST, GST separately, ads, the part with no gateway payment id, vendors on plans. It replaces six unbounded client-side selects. md5 `a12451e6…` = live |
| `20260927183901_after_panel_deploy_drop_bulk_and_enforce_reason_codes.sql` | Admin completion, Phase 3d. Applied only after the Phase 3 panel was live (bundle checked for the new calls). Drops `approve_vendor_content_bulk(uuid)`, with no caller left in either repo or any function body. `ad_apply_decision()` refuses an unlisted reason code on an ADMIN decision (reviewer set); a vendor's own pause keeps free text. Rehearsed: an unknown code 22023, a listed code rejected, a vendor pause ok. md5 `ef906d8f…` = live |
| `20260927184250_vendor_private_readers.sql` | Admin completion, Phase 4a (Mitra's decision: a vendor's PAN, owner email, phone, WhatsApp and street address become private). Adds readers only; nothing is revoked. `my_vendor_private()` (the caller's own eight fields), `call_vendor_contact(vendor)` (phone, WhatsApp and brand for a signed-in buyer under callGate's three rules; 42501 with the reason code; at most 30 different vendors an hour and 100 a day per account) and `admin_vendor_private(ids)` (super_admin, vendor_ops, support, finance_admin; at most 200 ids). The ledger `admin.vendor_contact_reveals` has no client grants. EXECUTE to authenticated only. md5 `c18e53b8…` = live |
| `20260927185902_vendor_contact_channels.sql` | Admin completion, Phase 4a, part 2. Public generated columns `vendor_profiles.has_phone` / `has_whatsapp` (a number is on file; the number stays private), so the vendor page offers "Show phone number" and WhatsApp without reading a number. `call_vendor_contact()` keeps each caller's last day in the ledger only: a vendor already revealed today is served without counting or moving, and each call deletes that caller's rows older than a day (bounded without a job). Rehearsed with `scripts/admin-completion/07_vendor_contact.sql`, 25/25 as expected. md5 `2dc0680c…` = live |
| `20260928042152_vendor_private_columns_revoke.sql` | Admin completion, Phase 4b. Applied only after Phase 4a and `writeOwnVendorRow()` were live, with every live JS chunk scanned. For anon and authenticated, table SELECT on `vendor_profiles` becomes column SELECT on everything except `pan`, `owner_email`, `phone`, `whatsapp`, `address_line`, `area`, `landmark`, `postal_code` and the two `catalog_embedding` columns. anon also loses INSERT/UPDATE/DELETE. The self-check fails if the column list changes. The first rehearsal found the app's `ON CONFLICT DO UPDATE` upserts would be refused (they need SELECT on the columns they copy from EXCLUDED); fixed in code first. `scripts/admin-completion/08` 18/18 rehearsed and live; signed-out HTTP: `phone`, `*`, a `pan` filter and a private embed 401/42501, public columns 200. md5 `1902264b…` = live |
| `20260928043917_payments_ledger.sql` | Admin completion, Phase 5. The payments ledger in the database: `admin.payment_entries` (a view; one row per money movement in paise: paid invoices, refunds as negative rows, unfinished subscription checkouts, ad and certificate orders; one status vocabulary), `admin_payments_ledger()` (filters, literal search, keyset paging on `(occurred_at, entry_key)`, at most 200 rows) and `admin_payments_summary()` (Reports' definitions), for super_admin, finance_admin and support. `subscription_invoices.refund_requested_at`, stamped by `trg_subscription_invoices_refund_requested` when a refund is claimed. Five indexes for newest-first reads. Harness `scripts/admin-completion/09_payments_ledger.sql` 19/19, rehearsed and live; totals equal `admin_report_summary()`. md5 `1e4a72de…` = live |
| `20260928070410_customers.sql` | Admin completion, Phase 6. `admin.customer_summary` (a materialized view: one row per account that isn't deleted or active staff; joined and last-active times, interactions, lifetime spend in paise), `admin.customer_rows` (the six segments computed at read time), `admin.customer_tags` / `admin.profile_tags` (with `trg_admin_audit`), `admin_customer_refresh()` (concurrent, at most once every 10 minutes, no scheduled job), `admin_customer_list()`, `admin_customer_segment_counts()` and the tag RPCs. Read: super_admin, support, finance_admin; tags: super_admin, support. Harness `scripts/admin-completion/10_customers.sql` 21/21, rehearsed and live; spend equals the payments ledger. md5 `c0faa6cf…` = live |
| `20260928071643_leads_pipeline.sql` | Admin completion, Phase 7. Leads, the RFQ pipeline (read-only): `admin.lead_rows` (one row per RFQ with its stage: new, unanswered, quoted, won or closed; overdue from 48 hours without a quote; direct when addressed to one vendor; quote count and first-quote time), `admin_leads_list()` (stage, age, category, audience, literal search, keyset paging), `admin_leads_summary(days)` (the open pipeline now; RFQs, won, closed, median time to a first quote and the share answered within 24 hours over a window) and `admin_lead_detail()`, for super_admin, vendor_ops, product_moderator and support. Index `rfqs (created_at desc, id desc)`. Harness `scripts/admin-completion/11_leads.sql` 16/16, rehearsed and live. md5 `309bb8fa…` = live |
| `20260928145827_admin_live_activity.sql` | Admin completion, Phase 8. Live Activity, native: `admin_live_activity(minutes)` (any active admin; EXECUTE to authenticated only) reads `engagement_events` and returns visitors active in the last 5 minutes and over a window of 5 minutes to 24 hours (signed in and guest), events per minute for the last hour, events by type, the top 5 products and sellers, and searches made by at least 3 different visitors (the privacy floor). Index `engagement_events (created_at desc)`. Harness `scripts/admin-completion/12_live_activity.sql` 13/13, rehearsed and live; 2–10 ms a call. md5 `cc6dd1b3…` = live |
| `20260928195051_site_content.sql` | Admin completion, Phase 9 (Mitra: vendor-dashboard banners only, and a live theme). `public.site_banners` (placement `vendor_dashboard` only; headline 1–80, supporting line up to 160, button label up to 30 and only with a destination; the destination a path on Cosora, `^/[^/\\]` with no spaces or quotes; the image `banners/<uuid>.<jpg|png|webp>` in the `site-content` bucket; a schedule that starts before it ends) and `public.site_theme` (one row: five `#rrggbb` colours, a heading and a body font from `admin.site_theme_fonts()`, and contrast floors in the table: text at least 4.5:1 on white, white at least 3:1 on each accent). Anyone reads the theme and the active banners that haven't ended, through column grants without the author columns; writes only through `admin_site_banners` / `_banner_save` / `_banner_delete` / `_banner_reorder` / `admin_site_theme_get` / `_theme_save`, super_admin only. Both tables carry `trg_admin_audit`. Buckets `site-content` (public, 2 MB, JPEG/PNG/WebP, super admins write `banners/` only) and `site-config` (public, 64 KB, JSON, no client policy). Statement triggers queue the `site-config-snapshot` edge function (v1), which writes `site-config/site.json`; `faq-snapshots-refresh` rebuilds it hourly too (its command changed, its schedule didn't). Seeded with today's theme and PromoBanner's copy without its "3x more inquiries". Harness `scripts/admin-completion/13_site_content.sql` 15/15, rehearsed and live. md5 `60ac0202…` = live |
| `20260929080502_discount_codes.sql` | Admin completion, Phase 10 (Mitra: discounts on vendor purchases only, plans first). `admin.discount_codes` (upper-case code, `percent` 1–100 or `flat` ₹1–₹10,00,000, target `vendor_plan` / `ad_purchase` / `certificate`, optional plans for a plan code, a cap, a per-vendor limit, dates, on/off, a note), `admin.discount_redemptions` (one per order: reserved for 30 minutes, then confirmed or released; unique per order) and `admin.discount_attempts` (unknown codes, for a limit of ten an hour per vendor). Service-role RPCs `discount_check` / `discount_reserve` (under the code's row lock) / `discount_confirm` / `discount_release`; super_admin and finance_admin RPCs `admin_discount_codes` / `_code_save` (text, discount and target fixed after a confirmed use; cap never below the uses) / `_code_set_active` / `_redemptions`. Discount columns on `subscription_payment_orders` (`list_rupees`, `discount_rupees`), `ad_orders` (`discount_paise`) and `subscription_invoices` (`discount_amount`), each with its code and a consistency CHECK. `admin.payment_entries` and `admin_payments_ledger` gain `discount_paise` / `discount_code` (the ledger function replaced in one transaction); a ₹0 invoice counts as verified. Harness `scripts/admin-completion/14_discounts.sql` 19/19, rehearsed and live; real-concurrency check `scripts/discount-race-check.sql`. md5 `a694b60d…` = live |
| `20260929084703_discount_code_save_defaults.sql` | Admin completion, Phase 10 follow-up. Every parameter of `admin_discount_code_save()` defaults to null, so Cosora-Admin leaves out what's empty instead of casting a null into a typed argument (as `admin_site_banner_save` does). Same body; replaced in place, so the grants stay. Rehearsed with a named-argument create and edit; harness 14 re-run live, unchanged. md5 `464931b4…` = live |
| `20260929114553_blog_cms_schema.sql` | Blog CMS, part 1. `blog_posts` gains `blocks jsonb` (an ordered array of content blocks; array order is render order), `thumbnail` / `thumbnail_alt` (card art, distinct from the hero), `tags text[]`, `canonical_url` and `noindex`. `blog_categories` gains `sort_order`, `description`, `seo_title`, `seo_description` and `updated_at`, because category pages are indexable URLs with their own meta. New single-row `public.blog_settings` for the landing hero, anon-readable with no write grant; a dedicated table rather than a `site_banners` placement, because anon has no grant on `site_banners` at all and reusing it would have exposed every vendor-dashboard banner. `trg_admin_audit` added to all three tables. Deliberately no `created_by` / `updated_by` on `blog_posts`: anon holds a table-wide SELECT grant there, so those columns would publish admin user ids. Committed as `20260929120000_…`, renamed 2026-09-30 to the recorded version. Comment-insensitive md5 `07371cf0…` = live. |
| `20260929114918_blog_cms_rpcs.sql` | Blog CMS, part 2. Fixes a live bug first: the public policy required `status = 'published'`, but nothing ever flipped a `scheduled` row, so a scheduled post stayed invisible forever. The policy now exposes `published` or `scheduled` once `published_at` has passed, which makes scheduling self-executing with no cron. Adds `admin_blog_post_list/get/save/delete/set_status/reorder`, `admin_blog_category_list/save/delete/reorder` and `admin_blog_settings_get/save`, all SECURITY DEFINER on `admin.require_content_admin()`, plus `blog_slugify`, `blog_assert_slug` (rejects the router-reserved `category`, `page`, `api`) and `blog_read_time`. EXECUTE revoked from `public, anon`, granted to `authenticated`. Committed as `20260929120100_…`, renamed 2026-09-30 to the recorded version. The file used `$$` where the applied statement used `$fn$` and `$grants$`; aligned 2026-09-30. Comment-insensitive md5 `51bef467…` = live. |
| `20260929115220_blog_storage_and_block_validation.sql` | Blog CMS, part 3. Four additive `blog_media_admin_*` policies on `storage.objects` for `blog/<uuid>.<jpg\|jpeg\|png\|webp>` in the `site-content` bucket: the four existing `site_content_admin_*` policies are pinned to `^banners/`, so a blog image upload was denied outright. Adds `public.blog_blocks_valid(jsonb)` and a CHECK on `blog_posts.blocks`: known block types only, every image carries non-empty alt text, headings are level 2 or 3, and at most one FAQ block per post, because two `FAQPage` entities on one URL is a structured-data error. GIN index on `blocks`. Committed as `20260929120200_…`, renamed 2026-09-30 to the recorded version. The file lacked the four `drop policy if exists` lines the applied statement had (so it could not be re-run) and used `$$` for the constraint block; aligned 2026-09-30. Comment-insensitive md5 `296c730f…` = live. |
| `20260929123402_blog_cms_rpc_defaults.sql` | Blog CMS, part 4. Gives every optional RPC parameter a default, matching `admin_site_banner_save`, so the generated TypeScript marks them optional and the client omits rather than passing null. Committed as `20260929120300_…`, renamed 2026-09-30 to the recorded version. Comment-insensitive md5 `d69784e9…` = live. |
| `20260929185324_blog_reserve_about_slug.sql` | Adds `about` to the router-reserved slug list in `blog_assert_slug`. The About page moved out of the buyer app into the Journal app as a real static route at `/blogs/about`, and Next resolves a static segment ahead of the `[slug]` catch-all, so a post saved with that slug would have been shadowed and unreachable. Checked before writing: no `blog_posts` row uses it. Committed as `20260929140000_…` but **not applied** until 2026-09-29 18:53 UTC, through `apply_migration`; renamed to that version. Also revokes EXECUTE from `anon`, which could call it until then. Byte-identical to live (md5 `de24168b…`). Its comment still cites `20260929120100`, now `20260929114918`; left as is to keep the file byte-identical. |
| `20260929150000_blog_revalidate_webhook.sql` | Purges the Journal's ISR cache when a post changes. `trg_blog_posts_revalidate` POSTs to `https://www.cosora.in/blogs/api/revalidate` via `net.http_post`. Uses pg_net directly, not `supabase_functions.http_request`: that schema does not exist on this project, so the wrapper the dashboard's Database Webhooks UI writes is unavailable. Verified first that no such trigger existed, so published posts really were waiting out the full hour. **The secret is not in the file** — all three repos are public, so it reads Vault secret `blog_revalidate_secret`, set once outside version control and matching `REVALIDATE_SECRET` in the cosora-blogs Vercel project. Draft-to-draft edits return early. Every failure is a `raise warning`, never an error: a cache purge must not be able to fail an editor's save. Deliberately not deduplicated per transaction, unlike `faqs_queue_snapshot` — `admin_blog_post_save` clears `is_featured` on another row in the same transaction, and collapsing the two would purge that row's slug instead of the one actually saved. Applied out of band with `execute_sql` on 2026-09-29, so it had no history row; recorded 2026-09-30 the way `supabase migration repair --status applied` does, inserting the row without re-running it. Byte-identical to the recorded statement (md5 `b9ec376e…`). |
| `20260929185739_blog_read_time_counts_all_text.sql` | Fixes the read-time calculator. `blog_read_time()` read only top-level `html`, `text`, `question` and `answer` keys, missing list items, table cells, captions and every FAQ (stored as `items[].q`/`items[].a`): 254 of 382 words on the GSM article, so an admin save would have stored "1 min read". Word extraction now mirrors the blog's `blocksToText`/`markdownWordCount` exactly (verified: 382, 220 and 203 words, the blog's own counts); 200 wpm and rounding were already right. A BEFORE trigger `trg_blog_posts_read_time` derives it on every write, from blocks or else the legacy Markdown body, so direct SQL edits cannot leave it stale. Backfill corrected three hand-typed seed values (7, 4, 3 min) to 2, 1, 1. Byte-identical to live (md5 `205908be…`). |
| `20260929192501_blog_categories_revalidate.sql` | `trg_blog_categories_revalidate`: category changes purge the Journal's ISR cache too, same Vault secret and never-fail guarantees as the posts trigger. The endpoint purges the root layout for `table = blog_categories`, because category names appear on every page. Needed the cosora-blogs endpoint deployed first. Verified: a category update produced a 200 `/ (layout)` purge. Byte-identical to live (md5 `ec272f8a…`). |
| `20260929193321_csp_violation_reports.sql` | `public.csp_violations` (RLS on, no grants, no personal data) and `csp_report_ingest(jsonb)`, callable by anon because browsers post reports without credentials: at most 20 reports per call, every field truncated, and past 5,000 distinct rows only existing rows count up. Fed by `api/csp-report.ts` while the full CSP runs as `Content-Security-Policy-Report-Only`. Read it with `select directive, blocked, document_path, source, hits, last_seen from public.csp_violations order by hits desc;`. Byte-identical to live (md5 `b2589e8b…`). |
| `20260929221659_blog_authors.sql` | Journal authors (E-E-A-T). `public.authors`: one row per byline, `entity_type` person or organization, check constraints holding each type to the fields its JSON-LD uses, a canonical-LinkedIn check, anon SELECT only. Seeds exactly the four supplied rows (`cosora`, `anandita-mitra`, `ishani-banerjee`, `abhishek-mitra`); no bio for the three people, and `role` is the title alone (`CEO`), rendered as "CEO, Cosora". Adds `blog_posts.author_id` (nullable, `on delete restrict`), points the three existing posts at `cosora` with `trg_blog_posts_updated_at` disabled for the statement so their `updated_at` does not move, reserves the slug `authors`, adds `trg_authors_revalidate` and `trg_admin_audit`, and recreates `admin_blog_post_save` (new `p_author_id`) and `admin_blog_post_get` (returns `author_id`). Expand step: `blog_posts.author` and `p_author` stay so an admin tab loaded before it keeps saving. Nothing reads either since cosora-blogs `079f415` and Cosora-Admin `0f550cd`. The contract step its header names (`blog_authors_drop_free_text`: recreate the save RPC without `p_author`, drop the column) is written but **not applied**, pending sign-off, and so is deliberately not in this folder. Applied through `apply_migration`; byte-identical to live (md5 `078e0bbe…`). |
| `20260930212818_support_schema.sql` | Help & Support P2a and P2d (`documentation/help-feature-plan.md`). The support tables: `support_categories` (topics, labels in en/hi/gu), `support_hours` (Mon–Fri 10:00–19:00 IST), `support_holidays`, `support_settings` (one row; `rollout` off / staff / all, **off**), `support_tickets` (the case record, `CS-000001`), `support_ticket_staff` (assignee, context, outcomes; staff only), `support_messages` (append-only; internal notes never reach the requester), `support_attachments`, `support_callbacks`, `support_fraud_details`, `support_events` and `help_guides`. The gates `admin.support_can_read()` (super_admin, support, manager) and `admin.support_can_write()` (super_admin, support). Clients get SELECT only, narrowed by RLS and column grants (no `author_id` / `uploader_id`). The private bucket `support-attachments`, the two tables in `supabase_realtime`, `support_notify()`, and `trg_admin_audit` on tickets and the config tables, never on messages. Self-check. Applied 2026-10-01 with Mitra's approval; md5 `8a53ec11…` = live |
| `20260930213143_support_requester_rpcs.sql` | Help & Support P2b. What buyers and vendors call: `support_status()` (anon too), `support_start_chat`, `support_post_message`, `support_prepare_upload`, `support_end_chat`, `support_reopen` (7 days), `support_mark_read`, `support_callback_slots`, `support_request_callback`, `support_report_fraud`, `support_submit_feedback`, `support_my_requests`, `support_request_detail`, and the service-role `support_attachment_checked`. Definer, empty search_path, one overload each, EXECUTE for authenticated. Refuses signed-out, deleted and not-rolled-out callers, never suspended ones (they appeal here). Errors carry a HINT the app words. Rate limits. A message carries only files the signature check passed. md5 `98c5dc2d…` = live |
| `20260930213451_support_admin_rpcs.sql` | Help & Support P2c. What Cosora-Admin's Support section calls: the inbox (`admin_support_list`, `admin_support_counts`, over the view `admin.support_ticket_rows`, which defines "waiting on us" per channel), `admin_support_get`, claim, reassign, reply or internal note, staff uploads, status, the logged phone reveal (masked until then), the callback, fraud and feedback outcomes, the settings setters (super_admin) and `admin_help_guide_*`. Manager reads, and every manager write raises 42501. Role simulation `scripts/support-role-simulation.sql` 61/61 live. md5 `037cad12…` = live |
| `20261001113143_support_fk_indexes.sql` | Indexes on the four support foreign keys the advisor listed: `support_messages (author_id, created_at)` and `support_attachments (uploader_id, created_at)`, which `admin.support_rate_check()` reads on every send, plus `support_ticket_staff (reviewed_by)` and `support_tickets (category)`. Self-check: every support foreign key has a leading index. Applied 2026-10-01; md5 `8d883e93…` = live |
| `20261001113147_revoke_trigger_function_execute.sql` | The 2026-09-30 security flag, reviewed: EXECUTE revoked from public, anon and authenticated on the 11 trigger and event-trigger functions in `public` that kept it. A trigger fires without an EXECUTE check, so nothing changes; rehearsed with a buyer's video like firing `sync_video_likes_count`. Self-check: no definer trigger function in `public` is executable by a client role, and service_role keeps it. The other 23 functions are reviewed in `securityflags.md`. Applied 2026-10-01; md5 `e068b3e6…` = live |
| `20261002064904_admin_least_privilege_reads.sql` | Admin completion, Phase 11. The read policies on `vendor_documents`, `vendor_contracts`, `subscription_invoices`, `vendor_subscriptions`, `ad_orders`, `certificate_orders` and `engagement_events` admit only the admin roles whose Cosora-Admin section reads them, instead of every admin; vendors keep their own rows. `enforce_product_cap` / `enforce_catalogue_plan` read the plan through a new definer helper, `vendor_cap_plan(uuid)`, so a moderator's re-approval still gets the vendor's real cap. Self-check: no read policy on the seven admits a bare `is_admin()`; the helper's definer flag, path and grants; the triggers INVOKER. Harness `scripts/admin-completion/15_admin_reads.sql` |
| `20261002100000_registration_documents.sql` | **Not applied** (FAQ input, 2026-10-02). `vendor_documents` gains the `business_registration` and `catalog` types and a `detail jsonb` (a registration's kind and number, a masked Aadhaar's consent, a file's name); `vendor_documents_detail_check` requires a file and refuses an Aadhaar row not marked masked. Placeholder name: rename to the recorded version when applied |
| `20261002100100_plan_changes_and_refund_guarantee.sql` | **Not applied.** `admin.subscription_quote` (new, renewal, upgrade with credit, downgrade from the next period), `subscription_change_preview`, `subscription_quote_for`, `subscription_activate`; `vendor_subscriptions.scheduled_*`, intent and invoice `change_kind`/`credit_rupees`, `subscription_invoices.superseded_at`; `expire_subscriptions()` switches a paid downgrade and `get_vendor_plan()` reports it (both md5-guarded); the 7-day guarantee: `refund_guarantee_requests` and its four functions |
| `20261002100200_help_content_documents_plans.sql` | **Not applied.** Seller Help's documents answer, "Can I change my plan?", "Can I get a refund?", and the two Quick Guides, in English, Hindi and Gujarati; each change only replaces P5's text |

---

## The dependencies, named

These are not hypothetical. Each was verified by reading the migration bodies.

### Buyer depends on admin

`ad_review_log` is **created** by:

```
Cosora-Admin/supabase/migrations/20260912120000_ad_campaign_state_model.sql
```

and **altered** by:

```
textile-spark-net/supabase/migrations/20260912120200_ad_eligibility_targeting_and_sweep.sql
  line 18:  alter table public.ad_review_log drop constraint if exists ad_review_log_decision_check;
  line 19:  alter table public.ad_review_log
  line 20:    add constraint ad_review_log_decision_check check (decision = any (array[...
```

Run the buyer migration first on a fresh database and it errors: the table does
not exist yet.

### Admin depends on buyer

`is_ad_eligible`, `ad_targeting_matches`, `ad_viewer_city`,
`vendor_account_in_good_standing` and `ad_frequency_capped` are **created** by:

```
textile-spark-net/supabase/migrations/20260912120200_ad_eligibility_targeting_and_sweep.sql
textile-spark-net/supabase/migrations/20260912120300_ad_multi_category_context.sql
```

and are **revoked from client roles** by:

```
Cosora-Admin/supabase/migrations/20260913120000_ad_review_hardening.sql
  lines 180-186:  the revoke loop names all five by signature
```

Run the admin hardening migration before the buyer ones and the revoke loop
fails on functions that do not exist — leaving those helpers callable by `anon`,
which is the exact hole that migration exists to close.

### Certificate fulfilment (admin-only, but it triggers on a buyer-owned table)

```
Cosora-Admin/supabase/migrations/20260913130000_certificate_orders.sql
```

creates `certificate_orders` **and** an `AFTER INSERT` trigger on
`public.advertisements` — a table the buyer repo's migrations also modify. The
trigger is created by the admin repo; the table it fires on is written to by the
buyer repo's payment path. Nothing breaks today, but a future buyer-repo
migration that recreates `advertisements` would silently drop that trigger.

---

## Correct combined order for the advertising work

```
 1  Cosora-Admin      20260912120000_ad_campaign_state_model.sql
 2  Cosora-Admin      20260912120100_ad_review_rpcs.sql
 3  textile-spark-net 20260912120200_ad_eligibility_targeting_and_sweep.sql
 4  textile-spark-net 20260912120300_ad_multi_category_context.sql
 5  Cosora-Admin      20260912120400_ad_fraud_signals_and_review_metrics.sql
 6  Cosora-Admin      20260912120500_grant_seals_on_approval_not_payment.sql
 7  Cosora-Admin      20260913120000_ad_review_hardening.sql
 8  Cosora-Admin      20260913130000_certificate_orders.sql
 9  Cosora-Admin      20260913130100_certificate_orders_revoke_default_grants.sql
10  Cosora-Admin      20260914090000_certificate_one_open_order_per_vendor.sql
11  textile-spark-net 20260914100000_wholesaler_pick_72h_bump.sql
```

Sorting all filenames from both directories by timestamp reproduces exactly this
list. That is the whole procedure.

---

## Admin-schema separation (all in textile-spark-net)

Moves admin identity, audit and moderation data into a locked-down `admin`
Postgres schema in the same project. Spec: `documentation/admin-separation-spec.md`.
Rolling state: `documentation/admin-separation-context.md`.

```
    repo              file                                                    live version
12  textile-spark-net 20260915090000_admin_schema_foundation.sql              20260914193629
13  textile-spark-net 20260915140000_harden_admin_grants_q17.sql              20260915164541
14  textile-spark-net 20260915150000_flip_admin_identity_to_admin_users.sql   20260915165030
15  textile-spark-net 20260915170000_admin_flags_and_review_log_rpcs.sql      20260915172340
16  textile-spark-net 20260916090000_move_admin_flags_and_review_log_to_admin.sql 20260915192048
17  textile-spark-net 20260921090000_chat_moderation_rpcs.sql                20260921164254
18  textile-spark-net 20260921190000_move_chat_moderation_tables_to_admin.sql 20260921181400
19  textile-spark-net 20260922120000_admin_identity_rpcs.sql                20260922120205
20  textile-spark-net 20260922180000_retire_profiles_admin_columns.sql      20260922171801
```

- **`…20260922180000` (Phase 5c) is IRREVERSIBLE.** It drops `profiles.is_admin` / `profiles.admin_role`,
  the mirror trigger `trg_profiles_sync_admin_users` + `admin.sync_from_profiles()`, and the
  `profiles_admin_requires_role` CHECK. It rewrites `enforce_admin_grants()` (account_status guard only)
  and changes the recipients of `record_embedding_pipeline_health()` to `admin.admin_users`.
  - Pre-guards: md5 of both functions vs Step 0, zero drift, no unexpected column dependents.
  - Post-assertions: the health body equals the old body with only the recipient block swapped;
    security properties are unchanged.
  - A dry run (forced abort) passed first. The committed file equals the applied statements
    (md5 `974823ee…`). It is mirrored byte-identically into Cosora-Admin; that copy is one
    migration applied once, and must never be applied again.
  - There is no rollback. Disaster recovery only: re-add the columns as nullable and backfill
    from `admin.admin_users`.

- **`…20260922120000` (Phase 5a) is additive.** It adds 7 SECURITY DEFINER RPCs over `admin.admin_users`:
  `admin_whoami`, `admin_list_admins`, `admin_search_candidates`, `admin_set_role`, `admin_grant`, `admin_revoke`
  and `admin_status_of`, plus the private `admin.shadow_admin_columns`. The latter is a TRANSITIONAL write-back onto
  `profiles.is_admin/admin_role` that becomes a no-op once 5c drops the columns. The committed file equals the applied
  statements (md5 `682218c9…`). Harness: `scripts/admin-separation/11_phase5a_identity_rpcs.sql`.
  **Mirrored copy:** at the Phase 5 prompt's request, a byte-identical copy is also in Cosora-Admin
  `supabase/migrations/`. It is ONE migration, applied once. A timestamp sort of both directories lists it twice,
  so count it once. Never apply the Cosora-Admin copy separately.

- **`…20260921190000` (Phase 4c) moves the five chat-moderation / suspension tables into `admin`.**
  The tables are `keyword_blocklist`, `flag_patterns`, `chat_block_reasons`, `conversation_reviews` and `account_suspensions`.
  From then on any script, seed or cleanup that names them must say `admin.<table>` and run as postgres. No client role can reach them over REST, and neither can service_role.
  The migration repoints 17 function bodies (the 5 legacy SECURITY DEFINER functions and the 12 4a RPCs) with a pure
  `public.<t>` → `admin.<t>` substitution applied in-database. Each body is md5-guarded both ways against the definitions inspected at Step 0.
  The committed file equals what was applied (whitespace-insensitive md5 `c22d7a9c…`).
  Rollback is commented in the file. Harness `08` is pre-move only; post-move, run `09` (messaging/moderation/FK) and `10` (RPC matrix).
- **`…20260921090000` (Phase 4a) is additive.** It adds 12 SECURITY DEFINER RPCs over
  `keyword_blocklist`, `flag_patterns`, `chat_block_reasons`, `conversation_reviews` and
  `account_suspensions`, which are still in `public`. Each gate reproduces the table's current
  RLS. Nothing calls them until 4b switches the panel. The committed file equals what was applied
  (whitespace-insensitive md5 `9802c415…`). Its parity harness,
  `scripts/admin-separation/08_phase4a_rpc_parity.sql`, is valid only until 4c moves the tables.

- **`…090000` (Phase 3c) moves `admin_flags` and `ad_review_log` into `admin`.** From then on any
  script, seed or cleanup that names them must say `admin.admin_flags` / `admin.ad_review_log`
  and run as postgres / service role; client roles cannot reach them at all. It also makes
  `guard_ad_deletion()` SECURITY DEFINER, with its caller bypass keyed on
  `current_setting('role', true)`. Do not revert that line to `current_user`: inside a definer
  function `current_user` is always postgres, and the guard would silently stop guarding.
- **The committed 3c file equals what was applied** (whitespace-insensitive md5 of the file
  and of `supabase_migrations.schema_migrations.statements`: `616be0e8…`).

- **Order within the set matters and the timestamps encode it.** 2b (`…150000`)
  reads `admin.admin_users`, created by `…090000`; 3a (`…170000`) calls
  `public.is_admin()`, which 2b repointed.
- **Buyer depends on admin, again:** `…170000` wraps `public.admin_flags`
  (created by Cosora-Admin `20260717140000_admin_panel_schema.sql`) and
  `public.ad_review_log` (created by Cosora-Admin
  `20260912120000_ad_campaign_state_model.sql`). Apply those first, which
  timestamp order already does.
- **Live version ≠ filename.** Applied through the Supabase MCP, which stamps its
  own UTC version. `supabase_migrations.schema_migrations` records the live
  column above; the filename timestamps are the ordering authority.
- **Verification artifacts live in `scripts/admin-separation/`.** Each file is one
  self-rolling-back SQL statement (run as postgres, e.g. MCP `execute_sql`). After any later
  admin-separation migration, re-run `01` (accessor parity), `02` (role matrix), `03`
  (mirror), `05` (deterministic RPC matrix), `06` (ad deletion matrix) and `07` (audit
  write); `05`–`07` resolve the tables in whichever schema holds them. `04` is a
  pre-Phase-3c artifact and no longer runs.

---

## Two more things that bite

**1. `create or replace function` cannot change a return type, and a changed
signature creates a silent OVERLOAD rather than a replacement.** This project
has already lost `match_products` to it once (error 42725 — a call that resolves
to neither overload). Any migration that changes a function's arguments or its
`returns table(...)` shape must `drop function` the old signature explicitly
first. `20260914100000_wholesaler_pick_72h_bump.sql` does this for `active_ads`.

**2. `DROP FUNCTION` takes the grants with it.** After recreating a function that
clients call, re-grant it. `active_ads` in particular must keep `EXECUTE` for
`anon` — signed-out buyers are served ads, and losing that grant empties every ad
rail on the site with no error anywhere.

---

## Edge functions are a separate deployment, and they drift

Migrations and edge functions are not deployed together. On 2026-09-14 the
deployed `razorpay-create-order` was found to be **older than the committed
source** — it was missing an `intent_failed` guard that had been in the repo for
months, so a failed `ad_orders` insert would have let the client open Checkout
anyway and charge a vendor for a campaign that could never be fulfilled.

After any change under `supabase/functions/`, deploy it and then re-read the
deployed source to confirm. A committed fix that was never deployed protects
nobody.

Shared code for edge functions lives in `supabase/functions/_shared/` and is
imported as `../_shared/<file>.ts`. When deploying through the Supabase
Management API rather than the CLI, that file must be included in the upload
alongside `index.ts`, using the literal path `../_shared/<file>.ts`.
