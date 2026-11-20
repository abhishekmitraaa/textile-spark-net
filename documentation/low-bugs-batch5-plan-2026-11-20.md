# Low bugs, batch 5: the database items (2026-11-20)

Items: L-86–L-98, one line in ToDo.md. Branch `fix/low-batch5-2026-11-20` from batch 4 (`5f1a5f7`; Cosora-Admin from
`b09c52c`), in both repos. Two migrations, applied apart:

- `20261120140000_low_batch5.sql`: before the apps are deployed;
- `20261120140100_low_batch5_revoke.sql`: only after both apps are live and their bundles checked (MPF-19).

Batch 4 is built and held too. Still open from batch 3: L-63, L-64 (sign-in files, Mitra's word needed).

## Mitra's calls

- L-89 "Close it now": account status and a seller's settings get their own readers in this release, and the columns are
  withdrawn in the second migration.
- L-92 "Add a daily job and also give an option to the buyer to extend it": `rfq-deadline-close` (00:05 India time)
  closes an open requirement past its deadline and marks it `lapsed_at`; My Quotes shows "Deadline passed" with
  "Extend 7 days", and `extend_rfq_deadline()` reopens it.
- L-95 "Keep it": notifications stay in the realtime publication (the fallback while the hub channel is down).
- L-97, L-98 "Yes: new job + 2-day history": `daily-dedupe-prune` (03:23 UTC) keeps the daily dedupe tables 2 days;
  the scheduler's history keeps successful runs 2 days and failures 14.

## What changed

- L-86, L-94 (indexes): dropped `products_live_recent_idx` (covered by `products_live_created_id_idx`) and
  `products_trgm_idx` (no trigram search exists; 0 scans). `product_images (product_id, position, id)` replaces
  `(product_id)`. Featured impressions dedupe a signed-in viewer by `viewer_id` with an index. The other "unused"
  indexes are kept: most are foreign keys or serve pages with little traffic yet, and dropping them is guessing.
- L-87: dropped `admin.office_photos_before_20261113` (0 rows), `ad_frequency_capped()` and `ad_logging_throttled()`
  (nothing calls them).
- L-88: the retired interest ids' map rows (past their month), the stray `regional.language`, and self-follows (the
  "wrong" followers count was a seller following their own store, which the count rightly leaves out). A CHECK stops a
  new self-follow.
- L-89 (who can read an account's state):
  - `contact_check(other)` answers the screen's question ("caller_suspended", "target_unavailable", "ok"). It names the
    other's state only where the caller has a reason to reach them: a registered seller, a quote or a message between
    them, or staff. Anyone else gets "ok".
  - `my_account_status()` (the data export), `admin_account_statuses(ids)` (Cosora-Admin, at most 500 ids, admins
    only), `my_vendor_settings()` (Seller Settings, the data export).
  - `account_is_active()` and `account_not_deleted()` answered any id to anyone. Every policy and function passes the
    caller's own id (checked on production), so a browser asking about another account is now refused
    (`own_account_only`); jobs and the service role still may. `vendor_account_in_good_standing()`, the one caller
    passing another id, reads the status itself.
  - `messages_insert` checks the sender through `account_is_active()` instead of reading the column.
  - Seller owner names stay public (Mitra's rule of 2026-09-27).
- L-90: the saved tables get one policy per command with `account_not_deleted`; a seller's product document needs an
  active account.
- L-91: `messages`, `quotes` and `rfqs` policies read the caller's ids once (`my_conversation_ids()`, `my_rfq_ids()`,
  `my_quoted_rfq_ids()`), not a function call per row. Every account's access compared before and after on the local
  stack (11,397 users): identical.
- L-92: `rfqs.lapsed_at`, the job, a guard that undoes a browser's change to it, and Extend on My Quotes. The card
  leaves out a budget that wasn't given and shows "Lowest: —" until a quote arrives (it said "₹0 - ₹0" and "₹0").
- L-93: every SECURITY DEFINER function in public and admin with a search path gets `pg_temp` last. `active_ads` asks
  `ad_is_bumped` once per ad.
- L-96 (empty tables read on every view): the unused service-review reader is gone. Catalogues and product documents
  are real features read where they show; hero slides are read from the table only when the snapshot misses.
- Not changed: the registered seller without a contract signs on /kyc (the existing path); stalled sign-ups are
  people, and the sign-up gate is on.
- From the browser check: a failed Seller Settings read says so with Try again, and the switches wait for it (it
  showed the defaults, and a toggle saved them over the seller's choices).

## Checks

- tsc clean; i18n 8298/8298; eslint: no errors; build passes. Cosora-Admin `tsc` and build clean.
- `npm run rls:check`: 0 findings; `scripts/rls-policy-check.sql` on the local stack: 0 bare calls, no command decided
  by two policies; `scripts/todo-batch/search_ads.sql`: 12/12.
- Local stack, both migrations applied, through PostgREST as the browser:
  - direct reads of `account_status`, `notifications`, `regional` refused;
  - `account_is_active` / `account_not_deleted` answer for the caller and refuse another id (signed in and out);
  - `contact_check`: an unrelated suspended account reads "ok"; a message and a save still go in;
  - featured and spotlight listings answer as a browser;
  - data export as buyer and seller (settings included, status from `my_account_status()`); Seller Settings loads,
    saves, and with the read forced to fail shows Try again with the switches disabled;
  - My Quotes: a requirement seeded past its deadline, closed by the job, shows "Deadline passed"; Extend reopens it
    for 7 days (seed removed).
- Production, read only: the callers of the two status helpers match the local stack (only
  `vendor_account_in_good_standing` passes another id; no policy does).
- **Not done: the rolled-back rehearsal on production.** Auto mode refused it. Run it before applying (below).

## Code review (medium)

5 findings, all fixed: the two specs expecting the old suspended wording; test helpers and scripts reading the withdrawn
columns (`readOwnVendorRow`, chat-pipeline, profile-contact-privacy, both check scripts); the status helpers still
answering any id; `callGate` treating an unknown verdict as allowed; Seller Settings with no error state.

## Release (when Mitra says)

1. Rehearse `20261120140000` on production rolled back (replace `commit;` with a select and `rollback;`).
2. Apply `20261120140000` with the CLI.
3. Push main in both repos (after batch 4, which goes first: its migration `20261120130000`).
4. Check the live bundles call `contact_check`, `my_vendor_settings`, `admin_account_statuses` and read no
   `account_status` / `notifications` / `regional` columns.
5. Apply `20261120140100_low_batch5_revoke.sql`, then run `scripts/profile-contact-privacy-check.mjs` and
   `scripts/contact-gate-check.mjs` (read them first: they sign in to production).
6. Remove the L-86..L-98 line from ToDo.md.
