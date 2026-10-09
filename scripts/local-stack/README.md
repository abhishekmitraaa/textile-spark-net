# Local stack: a copy of Cosora's database on this machine

The Help & Support launch gate (plan P7) runs its browser specs, its load test and the sweep
end to end against a local Supabase stack, never production. These scripts build that stack
from production's catalog. They read production; they write only to the local stack.

`supabase db reset` can't do this from `supabase/migrations/`: the first 22 migrations
(2026-07-04/05, the base schema and seed catalogue) were applied before the repo kept
migration files, and some later ones were applied from elsewhere. With the database
password, `supabase db dump` would be the normal route; without it, `catalog-export.sql`
reads the same objects from `pg_catalog`.

## Needs
- Docker Desktop, running.
- The Supabase CLI and the `pg` client in a scratch folder (git-ignored):
  `npm i --prefix .claude/tmp/sb pg@8 @supabase/cli-windows-x64` (on Windows the npm
  `supabase` package can miss its binary; this installs it directly).
- About 3 GB of images on the first `start` (the Postgres image alone is 1.25 GB).

## Steps (from the repo root)
1. **Export** (read-only). Run the four queries in `catalog-export.sql` against production
   (Supabase SQL editor, or the MCP `execute_sql` tool) and save the results.
2. **Extract** each to `.claude/tmp/localstack/{q1,q2,q3,data-ref}.json`:
   `node scripts/local-stack/extract-json.mjs <saved-result> .claude/tmp/localstack/q1.json`
3. **Start** a local project in `.claude/tmp/localstack` (once: `supabase init`; set
   `[db] major_version = 17`, and switch off studio, local_smtp, analytics, `db.migrations`
   and `db.seed`), then `supabase start -x studio,postgres-meta,imgproxy,mailpit,logflare,vector,supavisor`.
4. **Load**: `LOCAL_SERVICE_ROLE_KEY=<local service_role key> node scripts/local-stack/load-schema.mjs`.
   Functions that call URLs are repointed at the local gateway (or nowhere, for the blog's
   revalidate hook). Every statement should load; anything left is printed.
5. **Pending migrations**: apply the files not yet in production, in order, with
   `docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/<file>.sql`.
6. **Accounts**: `LOAD_USERS=60 node scripts/local-stack/bootstrap.mjs`. It writes
   `.claude/tmp/local-stack-env.json` (local keys, accounts, one local-only password).
7. **Functions**: `node scripts/local-stack/copy-functions.mjs` (served by `supabase start`).
   `supabase start` only serves the functions that were in the folder when it started: a function added later
   answers 404 until the stack restarts. On a stack other sessions share, run a second edge runtime instead, with
   the stack's container environment and `SUPABASE_INTERNAL_FUNCTIONS_CONFIG` extended by the new function, on
   another port, and point the spec at it (`LOCAL_INVOICE_RENDER_URL` in `subscriptions-p1.spec.ts`).
   Give that runtime a persistent Deno cache (`-v <name>:/root/.cache/deno`): a function with `npm:` imports
   (`invoice-render`'s pdf-lib) downloads them on its first request, and without the cache a later run needs the
   internet again. For delivery tests, `RESEND_API_URL` and `WHATSAPP_API_URL` can point the adapters at a local mock.
   The first request to such a function downloads its packages and can outlast the worker's time limit; if the
   function then stops answering after its first request timed out, delete `dep_analysis_cache_v2*` and
   `node_analysis_cache_v2*` from the cache volume and restart that runtime. `RAZORPAY_API_URL` points the autopay
   calls at a mock Razorpay (`LOCAL_SIDE_FUNCTIONS_URL` in `subscriptions-p3.spec.ts`). The local stack's own config
   puts the JWT gate on `subscription-webhook` (production deploys it without), so a local webhook call carries the
   anon key.
8. **Apps**, on their own ports so a normal dev server isn't disturbed:
   - buyer: `VITE_SUPABASE_URL=<local API> VITE_SUPABASE_ANON_KEY=<local anon> npx vite --port 8090 --strictPort`
   - Cosora-Admin: the same, `--port 5184`.

## What runs against it
| | Command |
|---|---|
| Browser specs (11) | `npx playwright test -c playwright.local.config.ts` (refuses a non-local stack, and checks both dev servers point at it) |
| SQL suites | `docker exec -i supabase_db_localstack psql -U postgres -At < scripts/<suite>.sql` for `support-role-simulation`, `staff-registry-check`, `faqs-p5-check`, `support-sweep-check`. The role simulation expects rollout Off at the start: `update public.support_settings set rollout = 'off', test_profile_ids = '{}'` first |
| The sweep, end to end | `node scripts/local-stack/sweep-e2e.mjs` (the function, Storage deletes, then the scheduled job firing every 20 s, then removed) |
| Load | `scripts/load/support.k6.js` through the `grafana/k6` image (see its header) |

## Checking the copy matches
Compare counts and digests of functions, policies and grants in both databases: the
fingerprint queries in the 2026-10-01 run in `documentation/test.md` matched on everything
except the three functions repointed at local URLs.

The local database is disposable: `supabase stop --no-backup` in `.claude/tmp/localstack`
throws it away.

## The plan lifecycle (subscriptions P4)

The local stack has no scheduled jobs, so the daily plan job is run by hand:

    docker exec -i supabase_db_localstack psql -U postgres -c "select public.expire_subscriptions()"

Apply `20261008150000` (the status "paused") on its own before `20261008150100`: Postgres won't use a new enum value
in the transaction that adds it. `scripts/subscriptions/p4_lifecycle.sql` needs both.

## The ad payment functions (subscriptions P5)

`razorpay-create-order`, `razorpay-verify-payment` and `razorpay-webhook` weren't in the stack's folder when it was
started, so they are served by a second edge runtime, started with the stack's own environment and no Razorpay keys
(checkouts then take the demo path). `copy-functions.mjs` copies them in; `subscriptions-p5.spec.ts` reaches the
runtime through `LOCAL_AD_FUNCTIONS_URL` (for example `http://localhost:8098`).
