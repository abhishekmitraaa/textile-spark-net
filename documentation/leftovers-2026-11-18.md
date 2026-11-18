# The work left from the Seller Home review: plan and record (2026-11-18)

**Request (Mitra, 2026-11-18):** "finish all the unfinished work and ask me for the things which need my guidance and
take the decisions on your behalf for the things which are obvious."

**Branch:** `fix/leftovers-2026-11-18` (worktree `.worktrees/sh-low`). It is stacked on `seller-home/low-fixes`, which is
stacked on `ads/manual-types`, so the three go out together.

## Mitra's decisions (2026-11-18)

| Question | Answer |
|---|---|
| Trending search terms can be faked by invented guest sessions | **Signed-in only** |
| A scheduled job to count ad impressions in batches | **Build the job now** |
| Release the manual ad types, the message field and the 27 Low fixes | **Yes, release all** |

## What was left, and what happened to it

| # | Item | Outcome |
|---|---|---|
| 1 | Seller registration: approve 10 premises photos, "Abc" signs the agreement, review new registrations | **Needs people.** Not code; listed for Mitra. |
| 2 | CA's answer on GST for sellers outside India | **Needs the CA.** |
| 3 | Andy's FAQ "Lowest billing plan?" still says Free gives 2 listings | **Needs Andy** (his wording, published verbatim). |
| 4 | The 2026-10-13 review's five unreleased fixes | **Done.** A read-only comparison with production showed items 1, 2 and 4's database half were never applied there (the local copy had the branch applied, which hid it). Ported in `20261118120000`, item 3 in `20261118130000` (my call: a direct request's reference images are private), item 5 in nine functions. Two commit security reviews on the port were addressed. |
| 5 | The overseas harness's check 19 | **Done.** The check predated the 2026-10-17 rule that a buyer can't open a sent request or change an open one; it now asserts both are refused and that staff edits keep the VIP head start. 19/19. |
| 6 | Counting ad impressions in batches | **Done** (Mitra: build it). `20261118110000`: a queue and a job every minute. |
| 7 | Trending terms can be faked | **Done** (Mitra: signed-in only). `20261118100000`. |
| 8 | SH-110: production wasn't compared | **Done, read-only.** Production has nothing the repo doesn't. Every function that differs is explained: this session's unreleased work (7), the October fixes (3), an unreleased product-moderation branch applied to the local copy only (4), and the local copy's snapshot triggers, which point at itself on purpose (4). |
| 9 | SH-111: edge functions weren't run | **Done for what can run here.** The payment functions run in the local edge runtime with a stand-in Razorpay (paid ad orders, the seal, manual ads, the message field); `bunny-upload-url` runs and falls back to Storage. Bunny itself and the notification sender need their real keys. |
| 10 | SH-112: no 10,000-user load test | **Needs Mitra.** A laptop's Docker says nothing about production capacity, and loading production needs his say-so (and the free plan's 60 connections are the known ceiling: ToDo "Plan the Supabase upgrade"). |
| 11 | SH-113: video upload and ad payment end to end | **Done.** A seller uploads a real 2-second clip (`tests/fixtures/clip-2s.webm`, made with Playwright's own ffmpeg) and it waits for review; ad payment was already covered. |

## Calls I made (obvious fixes)

- Item 3 of the October review: private reference images. Only the buyer, the one seller and staff need them, and a
  tech pack or an unreleased design is what gets attached. Requirement photos stay public: every seller is meant to see them.
- Item 5: every function that acts for a signed-in user asks Supabase Auth who the caller is, not only the payment ones.
  None was exploitable as it stood (each sits behind `verify_jwt`), but a signed-out or banned account's token kept
  working until it expired.
- The CSP endpoint keeps only reports about cosora.in and this project's own Vercel hosts. When its table is full, a
  new report always replaces the row seen least and longest ago: the hit counts are the anonymous caller's to inflate,
  so they can't protect a row (the second security review).
- Trending: "signed-in" leaves out registered sellers and staff, as Seller Analytics' term floor does.

## Tests

- `scripts/leftovers/trending_signed_in.sql` 3/3; `scripts/subscriptions/p7_overseas.sql` 19/19.
- `tests/local/review-fixes.spec.ts` 9/9: conversations, reports (a forced race at the limit), CSP (a flood), reference
  images.
- `tests/local/seller-home-low-b.spec.ts`: impressions through the fold; the seller sees a signed reference image; the
  video upload.
- The nine functions: a forged token refused locally; the paid paths 3/3 through them.

## Release order (Mitra: "Yes, release all"; each production step still checked as it goes)

1. Migrations `20261117120000`, `130000`, `140000`, `20261118100000`, `110000`, `120000` (each self-checks).
2. Deploy `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook`, `discount-quote`, `account-deletion`,
   `bunny-delete-video`, `bunny-reconcile`, `bunny-upload-url`, `image-search`, `support-attachment-verify`,
   `support-receipt`.
3. Push Cosora-Admin main (`ads/manual-types`) and buyer main (this branch); check the live bundles once.
4. Only then `20261118130000` (its path guard refuses the old app's public URLs) and `20261117130100` (it takes
   `profile_score` away from the old app).
