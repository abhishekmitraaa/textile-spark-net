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
