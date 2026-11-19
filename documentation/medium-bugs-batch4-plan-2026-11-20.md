# Medium bugs, batch 4 of 4: speed and database (2026-11-20)

Items: M-21, M-22, M-23, M-24, M-25, M-31, M-32, M-33, M-34, M-35, M-36, M-37, M-68, M-69, M-75. Branch
`fix/medium-batch4-2026-11-20` from batch 3 (`1ea3006`), so it carries batch 3 too. Migration
`20261120100000_medium_batch4.sql`.

## Mitra's decisions (2026-11-19)
- M-37 "Hide deleted only": a deleted account's live listings go to draft; suspension leaves live content up (the
  standing rule). Ads already stop for both (`vendor_account_in_good_standing`).
- M-35 "Add the job": views are queued and added up every minute (`product-views-fold`), like ad impressions.
- M-75 names "Leave as is": every account's name stays readable (logged in `securityflags.md`).

## Decided without asking
- M-21: Video Close-Ups says "Couldn't load video close-ups" with Try again on a failed read.
- M-22: the reel's order is `video_closeups_feed()`: the tagged live listing's recent demand plus the video's own
  posting as one weight-10 event, on the recent-demand scale (`ranking.md` 4.7). It was the 30 most viewed ever,
  re-ranked on `product_videos.rating`, which nothing writes.
- M-23: the store page reads the newest 200 live listings (Gold's cap) with the count, says "Showing the newest 200 of N"
  for a bigger VIP store, and a failed read of listings or videos is the page's failed state.
- M-24/M-25: a listing's review count, average and breakdown come from `product_review_summary()`, reviews 100 at a
  time; the product page reads the seller's numbers from `vendor_review_stats()` instead of 100 reviews.
- M-31: Home's hero and "Looking for these?" share one trending slice (8): one request instead of two.
- M-32: `top_vendors()` and `new_brand_suggestions()` join `admin.vendor_standing` once (same results, checked row for
  row against the old functions over 6,548 sellers locally).
- M-33: an ad's impression counts when half the card is on screen (`useAdImpressions()`), once per mount, and the ids
  go in one `ad_impressions()` call a second later (each campaign once per call).
- M-34: 86 pages load as their own files (`lazyPage()`); the common buyer pages are fetched when the browser is idle.
  The first script went from 907 kB to 380 kB gzipped. Sign-in pages, Landing, New Arrivals and Not Found stay in it.
- M-36: nothing to build: no service or freelancer page shows reviews since H-13.
- M-68: a chat event re-reads Seller Home's three chats only (`seller_home_chats()`), not the whole summary.
- M-69: /leads is the best 200 by Fit over the whole pool (`match_vendor_rfqs`), equal Fit newest first, "Show more"
  for the next 200, and the count is the same set Seller Home counts. The Overseas page lists overseas requirements
  newest first.
- M-75: a browser may set a logo, banner, premises photo or avatar only to this project's public Storage
  (`admin.image_urls_check`); 5 missing foreign-key indexes added. Left: `messages.sender_id` cascades (anonymisation
  never deletes an account) and seeded `rating_avg` (offline products only).

## Code review of batch 3 (run on this branch, fixed here)
Buyer links follow the seller's platform rules on save, on the buyer card and in `chat_buyer_social()` (and never a
messaging service as a "Website"); My Quotes reads quotes and covers to the end; an open chat re-reads messages only
when its last message moved; Seller Home keeps its data and "in review" steps on a failed refresh; one sampling rule;
the Privacy Policy's support number comes from `SUPPORT_PHONE_LABEL`.

## Code review of batch 4
Fixed: the views fold is one statement (rows deleted are the rows counted); the Seller Home patch reads the stored
body with LF line endings (production's has CRLF: it would have stopped the migration); `ad_impressions()` counts a
campaign once per call; the picture check fails closed without a storage origin; /leads ties and "Show more"; the
Overseas list; buyer Facebook/YouTube handles; only changed link boxes are checked. Not changed: engagement events
are still one per ad (analytics, rate-limited; batching needs a new function: ToDo); listings drafted at deletion
aren't marked (deletion is final).

## Checked on the local stack
24 database checks through PostgREST (views queue and fold, batched impressions, picture rules, deletion drafting);
reel order and its self-check with live videos in a rolled-back transaction; the summary patch on a CRLF body; Seller
Home's summary identical for 15 sellers before and after; Home makes one trending request; impressions only on
screen, batched; /leads and Seller Home both 174; no page errors; build, typecheck, i18n, lint.

## Release
Apply `20261119110100`, `20261119120000` and `20261120100000` with the CLI, merge batches 3 and 4, check live.
