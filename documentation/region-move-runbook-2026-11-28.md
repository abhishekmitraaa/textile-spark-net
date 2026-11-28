# Region move: Sydney → Mumbai (speed plan D-2), 2026-11-28

Mitra's choice (2026-11-28): **prepare the move on the Free plan**, rehearse it on a new Mumbai project, and change
nothing on the live site until a maintenance window is agreed. Plan: `speed-build-plan-2026-11-27.md` §6 (D-2) and §7.

| | Today | After the move |
|---|---|---|
| Project | `vxdhhgdfubqedfpwfyrb` "Cosora", `ap-southeast-2` (Sydney) | `muactehisspwdejvwflr` "cosora-mumbai", `ap-south-1` (Mumbai), created 2026-11-28 for the rehearsal |
| Plan | Free (org `rraqjnqharhtasrvoxtw`) | Free; the org then has 2 active projects (its limit) plus the paused "hybrid-flow" |
| Postgres | 17.6 | 17 (new projects get the current minor) |

The Mumbai project's database password is in `.claude/tmp/region-move/mumbai.env` (git-ignored, this machine only).
The dumps in `.claude/tmp/region-move/` hold real account data: never commit, upload or share them; delete them after
the move.

## 1. Inventory (read from production, 2026-11-28)

- **Database:** 85 MB; 114 sign-in accounts; extensions `pg_cron`, `pg_net`, `pg_stat_statements`, `pg_trgm`,
  `pgcrypto`, `pgmq`, `supabase_vault`, `uuid-ossp`, `vector`.
- **Storage:** 14 buckets, 700 files, 104 MB. Public: avatars, catalogues, faq-snapshots, product-files,
  product-images, product-thumbs, product-videos, site-config, site-content. Private: business-docs,
  chat-attachments, invoices, rfq-attachments, support-attachments.
- **Stored addresses with the old project ref** (rewritten to the new ref, host part only):
  `product_images.url` 293, `vendor_premises_photos.url` 10, `blog_posts.body` 2, `rfq_submissions.image` 2 and
  `.images` 2, `product_videos.video_url` 1 and `.thumbnail_url` 1, `admin.storage_origin.origin` 1.
  (`auth.sessions.user_agent` also matches; sessions don't carry over.)
- **Functions with the ref written in:** `public.faqs_queue_snapshot`, `public.site_config_queue_snapshot`,
  `admin.product_photo_paths`, `admin.queue_product_photo_removal`, `admin.queue_product_thumb_url`,
  `admin.queue_product_thumbs`.
- **Scheduled jobs:** 27 in `cron.job`; 7 call an edge function at the old address: account-deletion-sweep,
  billing-reconcile, embedding-worker, faq-snapshots-refresh, fx-rates-refresh, notification-dispatch (and the
  function bodies above).
- **Vault:** `service_role_key` (becomes the new project's key) and `blog_revalidate_secret` (shared with the blog's
  Vercel project: set a new value in both).
- **Edge functions:** 29. Secrets Mitra sets (values can't be read back, so they are entered again in the new
  project): `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`, `BUNNY_LIBRARY_ID`, `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. The `SUPABASE_*` ones are the platform's own.
- **Outside Supabase:** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the three Vercel projects (buyer, admin,
  blogs) and the repos' GitHub variables (CI); `vercel.json` CSP (`img-src`, `media-src`, `connect-src`) in the buyer
  app and the admin app; the Razorpay webhook URLs (`razorpay-webhook`, `subscription-webhook`); Google sign-in's
  redirect URL; Bunny's settings if they name the project.
- **Code that names the project:** the buyer app's `vercel.json` CSP (one host; the admin app's CSP uses
  `*.supabase.co`), `cosora-blogs/next.config.mjs` (`images.remotePatterns` hostname), and maintenance scripts under
  `scripts/` (not on any page). Everything else reads `VITE_SUPABASE_URL`.

## 2. Rehearsal (2026-11-28, production read only, the Mumbai copy written)

All steps ran from this machine with the Supabase CLI (temporary login role for production, no password) and
`psql` in Docker (`postgres:17`) against the Mumbai session pooler `aws-1-ap-south-1.pooler.supabase.com:5432`.
Scripts are in `.claude/tmp/region-move/` (git-ignored); the ones to keep are copied into `scripts/region-move/`.

| Step | What | Result |
|---|---|---|
| Dump | `supabase db dump --linked`: `--role-only`, schema, `--data-only --use-copy`, `supabase_migrations` (schema + data) | 16 MB; ~15 min |
| Restore | one transaction: roles (minus the `supabase_admin` line, platform-owned), schema, `select pgmq.create('embedding_jobs')`, `session_replication_role = replica`, data (minus the platform's internal storage tables: lifecycle, analytics, vectors, multipart) | ~6 min. Two dropped connections on the first tries: retry |
| Post-restore | `post-restore.sql` (below) | see the next table |
| History | `supabase_migrations` schema + data | 267 migrations |
| Storage | `copy-storage.mjs`: each object downloaded from production with the service key, uploaded to the same bucket and path, same type and cache | 700 / 700 files, 104.1 MB, 0 failures; byte totals equal |
| Addresses | `rewrite-ref.sql` (old → new ref, triggers off, self-checking): 8 columns and 6 functions | 0 left naming the old project |
| Jobs | `cron-apply.sql`: vault `service_role_key` (new project's), `blog_revalidate_secret`, the 27 jobs from production with the ref replaced | 27 jobs, **left switched off** in the rehearsal so the copy sends nothing |
| Edge functions | `supabase functions deploy --project-ref <new>` from this repo (27) and from Cosora-Admin (3) | 30 / 30 active; `razorpay-webhook` and `subscription-webhook` without JWT check, as in production |

**What a plain dump gets wrong, and `post-restore.sql` fixes** (each found by comparing the copy with production):

1. **Too many rights.** A new project's default privileges give `anon` and `authenticated` everything on new tables
   (TRUNCATE included, which ignores row security), and `pg_dump` only adds grants. The copy had 1,232 extra table
   rights and 6,033 extra column rights. Fix: revoke everything from `anon`, `authenticated` and `service_role` on
   the `public` and `admin` tables, sequences and functions, reset the default privileges, then replay production's
   2,281 grant / revoke / default-privilege lines from the dump.
2. **Two functions' grants missing from the dump** (`halfvec_scale`, `match_products` with a `halfvec` argument):
   set explicitly to production's (service role only).
3. **The 45 `storage.objects` policies**, from a `--schema storage` dump.
4. **The sign-up trigger** `on_auth_user_created` on `auth.users`, from a `--schema auth` dump.
5. **The live-updates channel rule** `hub_user_topic` on `realtime.messages`, from a `--schema realtime` dump.

**Checked equal to production after the fixes** (fingerprints of the sorted lists): 204 tables, 779 function bodies,
every right on every table, sequence and function (owner excluded; 1,186 and 1,101), column rights (171), row
security (177 tables), 235 policies, 264 triggers, indexes, views, default privileges, the 6 Realtime tables, the 10
extensions, 114 accounts, 700 files, 267 migrations. Row counts differ only where production kept working after the
dump (today's view ledgers, recomputed trends); the real move dumps during a write freeze.

**Speed from this machine (India):** one data read 0.80 s from Sydney, 0.19 s from Mumbai (new connection each).

## 3. What the move gains now (measured 2026-11-28)

The same build of the app, pointed once at Sydney and once at the Mumbai copy, both served from this machine (India),
phone CPU (4×), the app's files already in the browser cache, the real network, median of 5 (a local test script, `.superpowers/
region-compare2.mjs`):

| Page (signed out) | Sydney | Mumbai |
|---|---:|---:|
| Home feed, first products shown | 2.5 s | 2.4 s |
| Product page, title shown | 1.3 s | 1.8 s (noise) |
| Store page | 2.0 s | 1.8 s |
| Search results | 4.3 s | **2.8 s** |

One search call (`search_products`, same 60 results): ~0.40 s from Sydney, ~0.10 s from Mumbai.

**Since the plan's estimate (2026-11-27) the gain has shrunk.** Phases 1–4.5 made a page's data start at once and in
parallel, and signed-out reads come from Vercel's edge cache in Mumbai, so the distance to Sydney is paid about once
per page instead of three or four times. What still pays it on every call: search, everything signed in (no edge
cache: every seller page, chats, quotes, the profile), and every write (posting a requirement, a message, an
upload). Each such call is ~0.3 s faster from Mumbai; a signed-in page that makes them in two or three rounds gains
~0.5–1 s (estimate: signed-in pages weren't measured, because signing in to production from a test would create an
account there).

On a cold first visit over a slow phone network the difference disappears into the time it takes to download the
app (~8–9 s either way in the throttled test); only search was ~1 s faster.

## 4. Cut-over (not done; needs Mitra's go-ahead and a window)

Before the window:

1. Mitra: pick a 1–2 hour window; announce it (the banner below).
2. Delete the rehearsal project (`cosora-mumbai`) and create the real one in `ap-south-1`, or reuse it after a full
   reset. A fresh project is simpler: the free plan allows two active projects, and production is one of them.
3. Mitra: in the new project's dashboard, enter the 7 function secrets (§1), copy the Auth settings (site URL and
   redirect URLs, Google provider client id and secret, email templates, rate limits, OTP and session settings), and
   set `OTP_DEV_BYPASS` exactly as production has it (unset today: the dummy sign-in code is on).

In the window (about 45 minutes of work, mostly waiting):

4. Banner on (maintenance), then stop writes on production: revoke insert/update/delete from `anon` and
   `authenticated` on `public` (reads keep working), and switch production's 27 jobs off.
5. Dump (§2), restore, `python scripts/region-move/build-post-restore.py <dir>` → run `post-restore.sql`, migration
   history, `copy-storage.mjs`, `rewrite-ref.sql` (`-v old=vxdhhgdfubqedfpwfyrb -v new=<new ref>`).
6. Compare with production (the fingerprint queries in §2 must all match; row counts must match exactly now).
7. Generate the job script from production with the new ref, run `cron-apply.sql` with `-v active=true`; deploy the
   30 edge functions.
8. Switch the apps: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Vercel (buyer, admin, blogs) and the GitHub
   variables (CI); the buyer `vercel.json` CSP host; `cosora-blogs/next.config.mjs` image host; a new
   `blog_revalidate_secret` in both the vault and the blog's Vercel project. Redeploy all three.
9. Mitra: point the two Razorpay webhooks at the new project's functions and Google sign-in's redirect at the new
   project.
10. Smoke test: sign in (mobile + OTP, unchanged), browse, a product, a store, search, an enquiry, a chat message, a
    seller upload, the admin panel, a demo payment. Then banner off.

Afterwards: **everyone is signed out once** (new keys); production stays read-only for 14 days as the fallback, then
is paused; delete the dumps in `.claude/tmp/region-move/`.

Rolling back inside the window: switch the Vercel variables back and give production its writes back; nothing on
production was changed except the revoked writes and the switched-off jobs.

## 5. The rehearsal project now

`cosora-mumbai` holds **a full copy of production's data, including people's accounts and documents** (taken
2026-11-28). Its jobs are off and it has none of the function secrets, so it sends nothing and takes no payments; its
keys are on this machine only. If the move isn't going ahead soon, delete it (Supabase dashboard → project settings),
and delete `.claude/tmp/region-move/`: a free project left idle is paused after a week, but the copy stays until
deleted.
