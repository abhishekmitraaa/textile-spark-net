# Cosora-Admin review — Medium batch 3 (AR-M42 to AR-M46), 2026-11-22

Branch `fix/admin-review-medium3-2026-11-22` (both repos, on top of batches 1 and 2). Migration
`20261122130000_admin_review_medium3.sql`. Released with batches 1 and 2 on 2026-11-22 (Mitra: "release all").

| Item | Where | Fix |
|---|---|---|
| M42 | `admin.video_live_requirements` (trigger), `approve_vendor_videos_bulk`, Videos | A video goes live only with a file and within 60 s; the bulk approve leaves the rest in the queue; Approve is disabled with the reason |
| M43 | Subscriptions (fallback list, Invoices) | Keyset on (created_at, id) |
| M44 | `admin.live_activity_compute`, `admin.live_activity_cache`, `admin_live_activity` | One computation per window serves every admin for 30 s |
| M45 | Cosora-Admin `vercel.json`, `public/robots.txt`, `index.html` | Content-Security-Policy, X-Robots-Tag / robots meta noindex, robots.txt Disallow, HSTS, COOP. The session stays in localStorage (Supabase's client; the policy is the mitigation) |
| M46 | `admin_feature_flag_set(…, p_expected_updated_at)`, Feature switches | A save over a stale view is refused and the switch refreshed |

Tests: database harness 3/3; every route on a production build served with the policy: 0 violations, 0 crashes;
batch 1 (15) and batch 2 (13) browser checks on that build all pass.
