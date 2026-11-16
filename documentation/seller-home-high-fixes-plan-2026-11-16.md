# Seller Home High-Priority Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine High items of `documentation/seller-home-audit-2026-11-15.md` that the A–C work left open:
SH-068, SH-071, SH-075, SH-076, SH-086, SH-088, SH-089, SH-090, SH-100.

**Architecture:** Four database changes (quote terms need an open request; set-based lead ranking; a paid ad order
fulfilled in one transaction; ad days that start at approval and are kept while paused), two edge functions sharing one
publish path, and app work on five seller pages plus one admin card. Everything joins the unreleased
`seller-home/fixes` branch, so it ships in the same release.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, Supabase (Postgres triggers and functions, Deno edge
functions), Playwright local specs and SQL harnesses against the Docker local stack.

**Spec:** `documentation/seller-home-audit-2026-11-15.md` (what each SH number is) and the decisions below.

## Decisions

**Mitra's (2026-11-16):**
- SH-071: remove the "Who can view this catalogue?" question. Every approved catalogue is shown to all buyers.
- SH-088: paid days start when Cosora approves the campaign. Pausing gives the paused time back on resume, for a
  seller's pause and for Cosora's. Trusted Seal and Verified Certificate keep running while paused (the badge stays on
  the profile), so they get no extra days.
- SH-090: bring only the ad payment fix from the unreleased `fix/review-2026-10-13` (commit `0330b78`). Its five other
  fixes stay out; a ToDo entry records them.

**Calls made in this plan:**
- One branch, one release: work continues on `seller-home/fixes`.
- SH-089: after "Changes needed" a seller edits what the database already allows (`enforce_ads_moderation`): the
  title, the picture and the targeting. Slots, dates and the listing stay as paid for.
- SH-088: a campaign paused before its start date gets back only the time that overlapped its run. A paused campaign
  that holds its days never expires by itself.
- SH-068: a PNG cover is converted to JPEG in the browser (`src/lib/shrinkImage.ts`), so the picker's promise holds.
- SH-076: results must not change. The new ranking returns the same rows, scores and order as today's.
- SH-100: the chat header shows only real data. No rating, location or request line unless one exists.

**Non-goals:** the audit's Medium and Low items; refunds for rejected campaigns; the other five October fixes; the
sign-in flow. **Anti-goal:** any change to which requirements, quotes or campaigns an account can read.

## Global Constraints

- Buyer app: worktree `.worktrees/seller-home-fixes`, branch `seller-home/fixes` (head `11c3ba0` when this plan
  starts). Admin app: a new worktree `cosora-admin/.worktrees/seller-home-high`, branch `seller-home/high-fixes` from
  admin `main`. Never push, merge, deploy a function or touch production without Mitra's yes.
- Migrations: `supabase/migrations/2026111611xxxx_<name>.sql`, applied to the local stack only
  (`docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -`), each ending in a
  self-check `do $$ … $$` block that raises on failure. No `delete from` inside a function body and no `drop function`
  (the Supabase MCP refuses both; keep the files CLI- and MCP-safe).
- New definer functions: `security definer`, `set search_path = ''`, `revoke all … from public, anon, authenticated`
  unless a browser must call them.
- Every new UI string gets entries in `src/i18n/hi.json` and `src/i18n/gu.json` (`npm run i18n:check`); database text
  shown in the app goes in `src/i18n/external-strings.json` first. Prices through `priceText()`.
- Four states on every surface that reads Supabase: signed out, loading, error, empty.
- Checks before a task is done: `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json`; `npm run i18n:check`;
  `node scripts/theme-codemod.mjs --check` (25 findings on main are known); `npm run build` at the end.
- Local specs: `LOCAL_STACK_ENV=../../.claude/tmp/local-stack-env.json LOCAL_BUYER_URL=http://localhost:8097
  LOCAL_ADMIN_URL=http://localhost:5185 npx playwright test -c playwright.local.config.ts <spec>`. New browser tests go
  in `tests/local/seller-home-high.spec.ts`; SQL checks in `scripts/seller-home/high_fixes.sql` (one `do` block per
  check, each raising on failure, the file wrapped in `begin; … rollback;`).
- Commits end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A campaign paused and resumed many times: its end date grows by the paused time only, never more.
2. The browser's verify call and Razorpay's webhook publishing the same order at once: campaigns exist once.
3. A seller revising a quote on an open request still works and returns it to "pending"; a buyer can still accept,
   shortlist or reject a quote after the request closed.
4. Lead ranking for a seller with no live listings, no catalogue embedding, or requirements with no category or
   answers: same rows and scores as before.
5. A cover file that can't be decoded (a corrupt PNG): a clear message, and no video or picture left in storage.

---

### Task 1: The Advertise slideshow no longer traps Back (SH-086)

**Files:** Modify `src/pages/AdvertisementSlideshow.tsx:42,49`. Test: `tests/local/seller-home-high.spec.ts`.

- [ ] **Step 1: failing test** `"Back from Advertise skips the slideshow"`: a registered seller opens `/seller-home`,
  goes to `/advertisement-slideshow` by an in-app link, clicks Skip, waits for `/advertisements`, presses Back;
  expect the URL to end `/seller-home`.
- [ ] **Step 2:** run it. Expected: FAIL, URL ends `/advertisement-slideshow`.
- [ ] **Step 3:** both calls become `navigate("/advertisements", { replace: true })`.
- [ ] **Step 4:** run it. Expected: PASS. **Step 5:** commit.

### Task 2: A PNG cover works and a failed upload leaves nothing behind (SH-068)

**Files:** Modify `src/lib/queries/videos.ts` (`createProductVideo`), `src/pages/UploadVideo.tsx:765` (hint text).
Test: `tests/local/seller-home-high.spec.ts`.

**Interfaces:** Consumes `shrinkImage` from `src/lib/shrinkImage.ts` (read its signature first).

- [ ] **Step 1: failing tests.** `"a PNG cover is stored as a JPEG"`: upload a clip with a PNG cover on
  `/upload-video`; expect a `product_videos` row whose `thumbnail_url` ends `-thumb.jpg` and no error toast.
  `"a refused video row leaves no files"`: route the `product_videos` insert to answer 400; expect an error message
  and `select count(*) from storage.objects where bucket_id = 'product-videos' and name like '<vendor>/%'` = 0.
- [ ] **Step 2:** run. Expected: both FAIL (the PNG is refused by the bucket; two objects remain).
- [ ] **Step 3:** in `createProductVideo` (storage path) convert the cover with `shrinkImage` to `image/jpeg` and name
  it `…-thumb.jpg`; wrap the cover upload and the row insert so any failure removes the objects this call uploaded
  (`storage.from(VIDEO_BUCKET).remove([...])`) before rethrowing; a cover that can't be decoded throws
  `"That picture couldn't be read. Choose a JPG, PNG or WebP."`. For the Bunny path, a refused row calls the existing
  delete path for the new Bunny video if one exists in this file. Hint text: `JPG, PNG or WebP · 9:16 ratio preferred`.
- [ ] **Step 4:** run. Expected: PASS. Add Review Focus 5 as `"a corrupt cover is refused cleanly"`. **Step 5:** commit.

### Task 3: The catalogue form stops asking who can view (SH-071)

**Files:** Modify `src/pages/UploadCatalogue.tsx` (state `visibility`, the "Who can view this catalogue?" block, the
per-card visibility chip and its `CatalogueFile.visibility` field, now-unused icon imports).

- [ ] **Step 1: failing test** `"the catalogue form has no visibility question"`: on `/upload-catalogue` expect no
  text "Who can view this catalogue?" and, with one catalogue seeded for the seller, no "All Buyers" chip on its card.
- [ ] **Step 2:** run. Expected: FAIL. **Step 3:** remove them. **Step 4:** PASS, typecheck clean. **Step 5:** commit.

### Task 4: The chat header shows only real data (SH-100)

**Files:** Modify `src/lib/chatData.ts` (`getOrCreateConversation`), `src/pages/ChatThread.tsx` (header, request
banner). Read how the thread loads the other party (`otherName`) and reuse that query for the avatar.

- [ ] **Step 1: failing test** `"a chat header invents nothing"`: a seller opens a real conversation with a buyer
  (seeded in SQL, buyer named `Hdr Buyer`); the header shows `Hdr Buyer`; the page has no text matching `4.6`,
  `RFQ-NEW`, `New enquiry`; initials are `HB`.
- [ ] **Step 2:** run. Expected: FAIL on `4.6`.
- [ ] **Step 3:** the synthesized conversation carries no rating, reviews, location, request or canned message
  (`rating: null`, `reviews: 0`, `location: ""`, `rfqId: ""`, `rfqProduct: ""`, `verified: false`, `messages: []`);
  the header renders the star only when `reviews > 0`, the location only when present, initials from the shown name,
  the real avatar when the profile has one, and the request banner only when the conversation has a real request.
  "Online/Offline" is shown only if presence is real; otherwise it is removed.
- [ ] **Step 4:** PASS; chat specs still pass (`tests/local` files matching `chat`). **Step 5:** commit.

### Task 5: A quote's terms can't change once the request is closed (SH-075)

**Files:** Create `supabase/migrations/20261116110000_quote_terms_need_open_request.sql`. Test:
`scripts/seller-home/high_fixes.sql`.

- [ ] **Step 1: failing checks** (each as the seller, `set local role authenticated` with the seller's claims):
  `quote_terms_closed`: `update quotes set price_per_unit = 1` on an accepted quote whose request is `closed` raises
  `P0001`; `quote_terms_expired`: same on a request past `expires_at`; `quote_terms_open`: on an active request the
  update succeeds and the status becomes `pending`; `quote_status_after_close`: the buyer's
  `update quotes set status = 'accepted'` on a closed request still succeeds. Also a request removed by Cosora
  (read `admin_lead_remove` for how removal is stored) refuses like a closed one.
- [ ] **Step 2:** run. Expected: `quote_terms_closed` FAILS (the update goes through).
- [ ] **Step 3:** `trg_quotes_accepting_rfq` becomes `before insert or update` (no column list);
  `enforce_quote_rfq_open()` returns early on UPDATE only when
  `(to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at')`. Self-check: the trigger
  fires on every update.
- [ ] **Step 4:** all checks pass; `node scripts/quote-rfq-open-check.mjs` and `scripts/quote-status-roles-check.mjs`
  if they run against the local stack. **Step 5:** commit.

### Task 6: Lead ranking is set-based (SH-076)

**Files:** Create `supabase/migrations/20261116110100_lead_ranking_set_based.sql`,
`scripts/seller-home/lead_ranking_equivalence.sql`.

**Interfaces:** Produces `admin.rfq_fit_set(p_vendor uuid, p_rfqs uuid[]) returns table (rfq_id uuid, attr_part
double precision, loc_part double precision, scale_part double precision)`, `language sql stable security definer
set search_path = ''`, not executable by browser roles. `admin.rfq_fit(uuid, uuid)` stays (other callers).
`match_vendor_rfqs(uuid, integer)` keeps its signature and output.

- [ ] **Step 1: failing harness.** `lead_ranking_equivalence.sql` keeps today's `match_vendor_rfqs` body as
  `pg_temp.match_vendor_rfqs_old`, then for every row of `vendor_profiles`: (a) `admin.rfq_fit_set` equals
  `admin.rfq_fit` for every open requirement (three parts, exact); (b) `match_vendor_rfqs` equals the old function row
  for row, in order. Then, in the same rolled-back transaction, 5,000 generated open requirements: one call per
  sample seller, printing old and new times and raising if the new call takes over 250 ms.
- [ ] **Step 2:** run. Expected: FAIL, `admin.rfq_fit_set` does not exist.
- [ ] **Step 3:** write `rfq_fit_set` as one query: the seller's capabilities, capacity rows and per-`match_key` value
  sets read once (CTEs); location history by lateral lookup per requirement; the answers joined to
  `attribute_definitions` in one pass. `match_vendor_rfqs` calls it once for the pool and replaces
  `chat_blocked_between()` per row with one anti-join on `chat_blocks`. Same rounding, same tie-break
  (`score desc, similarity desc nulls last, rfq_id`).
- [ ] **Step 4:** harness passes; `scripts/ranking/fit_match.sql` and `scripts/rfq-leads/r2_same_leads.sql` pass;
  record the measured times in `documentation/test.md`. **Step 5:** commit.

### Task 7: A paid ad order always gets its campaigns, or says so (SH-090)

**Files:** Create `supabase/migrations/20261116110200_ad_order_fulfil.sql` (the content of `0330b78`'s
`20261013100400_ad_order_fulfil.sql`), `supabase/functions/_shared/adPublish.ts` (from `0330b78`). Modify
`supabase/functions/razorpay-verify-payment/index.ts` and `razorpay-webhook/index.ts` (both call
`publishOrder` from `_shared/adPublish.ts`; the webhook answers 503 when the result says `retry`),
`src/lib/queries/payments.ts` (result gains `retry`, `blocked`, `already`), `src/pages/Advertisements.tsx` (messages),
`scripts/discount-flow-check.mjs` (the ad cases from `0330b78`). Port only the ad-order parts: not `verifiedUserId`.

**Interfaces:** `publishOrder(url, key, orderId): Promise<PublishResult>` with `{ ok, count, retry?, already?,
blocked?, refundFlagged?, requested?, allowed? }`.

- [ ] **Step 1: failing checks.** In `high_fixes.sql`, `ad_order_all_or_nothing`: `ad_order_fulfil` with one valid and
  one invalid campaign row raises and leaves the order `created` with no campaigns; with valid rows it returns
  `claimed = true`, the order is `paid`, and a second call returns `claimed = false`. In `discount-flow-check.mjs`,
  the ported cases: a failed campaign insert leaves the order `created` and answers `retry`; the two paths racing
  publish once.
- [ ] **Step 2:** run. Expected: the flow-check cases FAIL on today's functions (order left `paid`, no campaigns).
- [ ] **Step 3:** port. Messages: retry → "Payment received, but your ads are not set up yet" / "Please contact
  support with this payment ID: <id>"; blocked → "Payment received, but your plan cannot run these ads" / "The order
  has been sent for a refund review."; success → "Payment received. Your ads are waiting for Cosora's review." (the
  old "your ads are live" was untrue: every campaign lands in review); "You were not charged" only for a bad
  signature or a failure before payment.
- [ ] **Step 4:** checks pass; typecheck; i18n. **Step 5:** commit.

### Task 8: Ad days start at approval and are kept while paused (SH-088)

**Files:** Create `supabase/migrations/20261116110300_ad_days_start_at_approval.sql`. Modify
`src/lib/campaignRunState.ts`, `src/lib/queries/ads.ts` (row gains `pausedAt`, `placement` if missing),
`src/pages/Advertisements.tsx` (FAQ line on pausing). Admin: `src/components/AdReviewQueue.tsx`.

**Interfaces:** column `advertisements.paused_at timestamptz`. A campaign "holds its days" when it is paused,
`paused_at` is set and `cardinality(public.ad_seal_sources(placement)) = 0`.

- [ ] **Step 1: failing checks** in `high_fixes.sql`: `ad_approve_late`: a 3-day campaign paid 5 days ago in
  `pending_review` is approved → `active`, `starts_at ≈ now()`, `ends_at ≈ now() + 3 days`, and a seal campaign's
  grant expires at the new `ends_at`; `ad_pause_gives_back`: a live campaign paused 2 days ago resumes with `ends_at`
  2 days later and `paused_at` null; `ad_pause_seal`: a Trusted Seal campaign resumes with `ends_at` unchanged;
  `ad_pause_before_start`: a scheduled campaign paused and resumed before its start keeps its `ends_at`;
  `ad_sweep_keeps_paused`: `sweep_ad_schedules()` leaves a paused product campaign past `ends_at` alone and expires a
  paused seal campaign; `ad_resume_twice`: pause/resume three times adds exactly the paused time (Review Focus 1).
- [ ] **Step 2:** run. Expected: `ad_approve_late` FAILS ("has already ended").
- [ ] **Step 3:** migration: add `paused_at`; `approve_ad_campaign` moves the window to start now when
  `starts_at <= now()` (same length), re-reads the row, then decides the status and grants seals to the new end;
  `ad_apply_decision` sets `paused_at = coalesce(paused_at, now())` on a paused status and clears it otherwise;
  `resume_ad_campaign` first adds `greatest(interval '0', now() - greatest(paused_at, starts_at))` to `ends_at` when
  the campaign holds its days, then decides the status; `sweep_ad_schedules` expires paused campaigns only when they
  don't hold their days; backfill `paused_at` for campaigns paused today from `admin.ad_review_log` (else `now()`).
- [ ] **Step 4: failing spec** `"campaign cards tell the truth about days"`: a `pending_review` card reads "Your 3
  days start when it is approved."; a paused product card reads "Its remaining days are kept until you resume."; a
  paused campaign past `ends_at` is not "Finished". Then `runStateOf`: review states say how many days start at
  approval; paused states come before the finished check and say whether days are kept (seal: "The seal's days keep
  running while it is paused."). FAQ answer on pausing gains "A paused ad keeps its remaining days. Trusted Seal and
  Verified Certificate keep running."
- [ ] **Step 5:** admin `AdReviewQueue`: a `pending_review` card shows "Runs for N days from approval" instead of
  Starts/Ends, no "already ended" badge, and Approve is not disabled by the old end date. Admin typecheck and build.
- [ ] **Step 6:** all checks and specs pass. Commit in both repos.

### Task 9: "Changes needed" leads to Edit and resubmit (SH-089)

**Files:** Create `src/components/vendor/EditCampaignDialog.tsx`. Modify `src/lib/queries/ads.ts`
(`saveAndResubmitCampaign`), `src/pages/Advertisements.tsx` (`MyCampaigns`: the button for
`rs.action === "edit_and_resubmit"`).

**Interfaces:** `saveAndResubmitCampaign(id: string, changes: { title: string; imageUrl: string | null;
targetCategories: string[] | null; targetCities: string[] | null; targetStates: string[]; targetCountries: string[] }):
Promise<void>`: updates the row with `.select("id")` (zero rows is an error), then calls `resubmit_ad_campaign`.

- [ ] **Step 1: failing spec** `"a seller edits and resubmits a campaign"`: a campaign in `changes_requested` with
  reason `poor_creative Use a clearer photo` shows "Edit and resubmit"; the dialog shows Cosora's note; changing the
  title and choosing another of the listing's pictures, then "Resubmit for review", leaves the row `pending_review`
  with the new title and picture, a `resubmitted` row in `admin.ad_review_log`, and the card says "Waiting for
  review". A second spec: clearing the title disables the button.
- [ ] **Step 2:** run. Expected: FAIL, no "Edit and resubmit" button.
- [ ] **Step 3:** build the dialog: Cosora's note; Title (required, 120 characters); Picture (the promoted listing's
  pictures; the current one preselected; a vendor-level campaign has none); Targeting with the booking form's pickers
  where they can be reused, limited to the plan's reach (`trg_ads_location_scope` is the backstop and its message is
  shown). Errors stay in the dialog; success closes it and refetches the campaigns.
- [ ] **Step 4:** PASS; typecheck; i18n. **Step 5:** commit.

### Task 10: Docs, the ToDo entry and the full checks

**Files:** `documentation/claude.md` (rules: ad days start at approval; pause keeps days except seals; one publish
path for paid orders; quote terms need an open request; lead ranking is set-based; chat header shows real data only;
catalogues have no visibility choice), `documentation/changelog.md`, `documentation/technicalimplementation.md`,
`documentation/test.md`, `documentation/sides.md` (if a page's behaviour changed), `documentation/ToDo.md` (new entry:
"Bring the five unreleased October review fixes up to date", naming branch `fix/review-2026-10-13`, commit `0330b78`
and the five fixes; release notes: three functions to deploy for SH-090), admin `documentation` if it has a changelog.

- [ ] **Step 1:** write the docs. **Step 2:** `npm run i18n:check`, typecheck, theme check, `npm run rls:check`,
  `npm run build`; admin build. **Step 3:** run `tests/local/seller-home-high.spec.ts`,
  `tests/local/seller-home-fixes.spec.ts` and every local spec touching ads, quotes, leads, chat, catalogues and
  videos; all SQL harnesses in `scripts/seller-home/`. **Step 4:** commit.
