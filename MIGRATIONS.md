# Migrations — read this before applying any

**Two repositories share one Supabase project.** `textile-spark-net` (buyer +
vendor app) and `Cosora-Admin` (admin panel) both hold a
`supabase/migrations/` directory, and both apply to the **same database**
(project `vxdhhgdfubqedfpwfyrb`).

Neither repo's migration set is self-contained. Applying one repo's migrations
on a fresh database without the other's, or applying them in repo order rather
than timestamp order, **will fail** — and on a database that already has data it
can fail halfway.

---

## The rule

> Merge both repos' `supabase/migrations/` directories into one list, sort by
> filename timestamp, and apply in that order.

The timestamps already encode the correct order. They interleave across repos on
purpose. There is no "apply admin first, then buyer" shortcut — the dependency
runs **both ways**.

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
  either repo, sorts between the old and new names.** Check both directories
  before renaming.

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
