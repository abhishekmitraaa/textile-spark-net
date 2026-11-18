# High-priority buyer bugs (H-01 to H-13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 13 High bugs from the 2026-11-18 buyer review without changing how anyone signs in.

**Architecture:** Front-end fixes in the buyer app (routes, Back controls, sign-in-first prompts, honest cards), one
data migration that takes the demo catalogue off live, a precomputed feed ranking kept by a one-minute job, and
server-made thumbnails written to a bucket only the server can write.

**Tech Stack:** React 18 + Vite + React Router 6.30, TanStack Query, Supabase (Postgres 15, pg_cron, Storage, Deno
edge functions).

**Spec:** `documentation/ToDo.md` → "Buyer-side review 2026-11-18" (H-01 … H-13), and Mitra's answers below.

**Branch:** `fix/high-bugs-2026-11-18` (worktree `.worktrees/high-bugs`, off main `2b02358`). Nothing is pushed,
applied or deployed without Mitra's go (a push to main deploys production).

## Mitra's decisions (2026-11-18)

| Bug | Question | Answer |
|---|---|---|
| H-04 | Demo catalogue on production | **Take all 26 seed listings and the test video off live** (re-confirmed after the correction that only 1 real listing stays) |
| H-11 | Feed at 10,000 users | **Precomputed feed + a one-minute job** (new job approved) |
| H-12 | Thumbnails | **Make thumbnails at upload** (code-only, no plan upgrade) |
| H-13 | Service Vendors / Freelancers | **Keep the pages, remove the fakes** |

## Decisions taken without asking (obvious fixes)

- H-01: no padding. The last row of "Today's New In" may be short.
- H-02: the four scaffold addresses redirect to the real pages (`/requirement`, `/requirement/quick-rfq`,
  `/requirement/post-requirement/form` → `/requirement/post-requirement`; `…/success` → `/requirement/my-quotes`);
  `buyerShellRoutes` and `BuyerRouteShell.tsx` are deleted (the three duplicate entries go with them).
- H-03 / H-07: ask for sign-in **before** the form starts (nothing typed can be lost), with a Sign in action. Sign-in
  itself is not changed or re-routed.
- H-05: never invent card fields; re-read the real cards for the ids in the list, signed in or not.
- H-06: every sign-up step shows a small "Help · Sign out" pill.
- H-08–H-10: `useStepBack` decides by React Router's history index (`history.state.idx > 0`), not the location key;
  every on-screen Back that called `navigate(-1)` (or tested `history.length`) uses it, with the side's home as the
  fallback.
- H-12 thumbnails are made by the server, not the browser: a seller-written thumbnail would not be covered by
  moderation (the seller could swap it after approval). The server writes 480 px JPEGs into a public bucket
  `product-thumbs` that only the service role can write, keyed by the photo's storage path; cards ask for the
  thumbnail and fall back to the full photo. Made when a listing goes live (and backfilled for existing live photos).
  Cards also lazy-load and load the hover photo only on hover.
- H-13: remove Call Now and Chat (no real account behind them), invented ratings / review counts / review cards and
  the review form on the seed profiles; label every profile "Sample profile"; drop both lists from `api/sitemap.ts`.

## Global Constraints

- Sign-in (mobile + OTP, dummy OTP) is not changed, added to or re-routed.
- Every new rendered string has entries in `src/i18n/hi.json` and `src/i18n/gu.json` (`npm run i18n:check` passes).
- Typecheck with `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json`; `npm run build` (includes `routes:sync`).
- On-screen Back is `useStepBack(fallback)`, never `navigate(-1)`.
- `feed_products` keeps `status = 'live'`, public columns only, the same parameters and return type, and the same
  order for every sort (proved by the harness against the current body, md5 `bf708e1d625db4ef8d4660b4ee2b471b`).
- A migration that replaces a production function checks the body it replaces first (md5, CRLF stripped).
- New public tables: no grants to anon/authenticated unless a reader needs them; `admin` schema for internal tables.
- Data changes on production are reversible and recorded (`admin.demo_catalogue_offline`).

## Review Focus

- A seller whose listing is approved sees it in New Arrivals at once (not a minute later) — the trigger keeps
  `admin.feed_rank` current for status changes; the job only refreshes scores.
- A listing taken down disappears at once — `feed_products` still joins `products` with `status = 'live'`.
- A buyer opening `/terms` from a new tab and tapping Back stays on Cosora (lands on the side's home).
- A redirected address (`/profile/help/chat` → `/help`) then Back stays on Cosora.
- A photo with no thumbnail yet (new listing, failed render) still shows (fallback to the full photo).

---

### Task 1: Back that never leaves the site (H-08, H-09, H-10)

**Files:** Modify `src/hooks/useStepBack.ts`; create `src/hooks/useHomePath.ts`; modify `src/pages/Search.tsx:330`,
`SearchResults.tsx:935`, `VendorProfile.tsx:316,360,381`, `RecentlyViewed.tsx:192`, `FollowingViewAll.tsx:103`,
`TermsConditions.tsx:18`, `PrivacyPolicy.tsx:146`, `VideoCloseUpsPage.tsx:102,108`, `Grievance.tsx:23`, `Kyc.tsx:484`,
`Help.tsx:80`. Test: `scripts/high-bugs/step-back-check.mjs`.

**Interfaces:** Produces `useHomePath(): "/seller-home" | "/home/new-arrivals"` (seller side → Seller Home).

- [ ] `useStepBack`: go back when `(window.history.state?.idx ?? 0) > 0`, else `navigate(fallback, { replace: true })`.
- [ ] Each listed Back uses `useStepBack(<fallback>)`: Search → `/home/new-arrivals`, SearchResults → `/search`,
  VendorProfile → `/home/new-arrivals`, RecentlyViewed → `/home/new-arrivals`, FollowingViewAll → `/home/followings`,
  VideoCloseUps → `/home/new-arrivals`, Terms / Privacy / Grievance / Help → `useHomePath()`, Kyc → `/seller-home`.
- [ ] Verify in the browser: each page opened directly, then its Back, stays on the site; `/profile/help/chat` → Back
  stays on the site; Back after arriving from Home returns to Home.

### Task 2: Scaffold routes and fill cards (H-02, H-01)

**Files:** Modify `src/App.tsx:144-215,348-361`; delete `src/components/buyer/BuyerRouteShell.tsx`; modify
`src/pages/NewArrivals.tsx:444-457`; `vercel.json` via `npm run routes:sync`.

- [ ] Replace `buyerShellRoutes` with four `<Route … element={<Navigate replace to=…/>}/>` (targets above).
- [ ] `displayProducts` is `products` (no clones).
- [ ] Verify: the four addresses land on the real pages; no `-fill` id in the DOM; `npm run build` passes.

### Task 3: Sign in before the long forms (H-03, H-07)

**Files:** Modify `src/pages/PostRequirement.tsx:273-276,564`; `src/pages/Onboarding.tsx:175,1077`.

- [ ] PostRequirement: "Create New Requirement" and Submit, signed out, show `toast.error("Sign in to post a
  requirement", { action: { label: "Sign in", onClick: () => navigate("/login") } })` and stay; the dev-switcher text
  is gone.
- [ ] Onboarding: signed out (auth loaded, no user) renders a "Sign in to register your business" screen with
  "Create an account" (`/register`) and "Sign in" (`/login`) before step 1.
- [ ] Verify signed out in the browser; i18n entries added.

### Task 4: A way out of sign-up (H-06)

**Files:** Modify `src/components/auth/SignupStep.tsx`.

- [ ] When the step is shown (decision "open"), render a fixed top-right pill: "Help" (`/help`) and "Sign out"
  (`signOut()`, then `navigate("/login", { replace: true })`).
- [ ] Verify on the local stack with a new account: Sign out works from role selection; Help opens.

### Task 5: Recently Viewed shows only real data (H-05)

**Files:** Modify `src/lib/recentlyViewedStore.ts:2,127-197`, `src/pages/RecentlyViewed.tsx:105-109`,
`src/pages/ProductDetail.tsx:458`.

- [ ] `normalize()` falls back to a blank (no rating, reviews 0, empty fabric / GSM / fit, unisex) instead of
  `makeListingProduct`; ProductDetail passes the fields it has.
- [ ] Export `refreshRecentCards()`: re-reads `fetchProductCardsByIds` for the listed ids (keeping `viewedAt`, dropping
  listings that are no longer live); the page calls it on mount when signed out.
- [ ] The card shows the star row only when `rating > 0`.

### Task 6: Seed providers without fakes (H-13)

**Files:** Modify `src/pages/ServiceVendors.tsx`, `Freelancers.tsx`, `ServiceVendorProfile.tsx`,
`FreelancerProfile.tsx`, `api/sitemap.ts`.

- [ ] Remove Call Now / Chat / Save / Write a review and every rating, review count and invented review card; each
  card and profile carries a "Sample profile" label and a line that providers are coming soon.
- [ ] `api/sitemap.ts` no longer lists `/services` or `/freelancers`.

### Task 7: Lighter product cards (H-12, browser half)

**Files:** Create `src/lib/thumbs.ts`; modify the card image markup in `NewArrivals.tsx`, `ListingProductCard.tsx`,
`Sale.tsx`, `Trends.tsx`, `BuyerProductCard.tsx`.

**Interfaces:** Produces `thumbUrl(fullUrl: string): string | null` (null for non-Storage URLs) and
`<CardPhoto src alt />` (thumbnail first, full photo on error, `loading="lazy"`, `decoding="async"`).

- [ ] Primary photo through `<CardPhoto>`; the hover photo mounts only after the first hover.

### Task 8: Thumbnails made by the server (H-12, server half)

**Files:** Create `supabase/functions/product-thumbs/index.ts`, migration `20261118150000_product_thumbs.sql`,
`scripts/high-bugs/thumbs-backfill.mjs`.

- [ ] Bucket `product-thumbs` (public, image/jpeg, 1 MB; no insert/update/delete policy for browser roles).
- [ ] Edge function (service role only): for each given `product_images` path, read the photo, resize to 480 px
  long side (ImageScript), write `product-thumbs/<same path>.jpg`.
- [ ] A listing turning live queues its photos (`pg_net` from `trg_products_thumbs`, same Vault pattern as
  `site_config_queue_snapshot`); the backfill script sends every live listing's photos once.

### Task 9: Demo catalogue off live (H-04)

**Files:** Create migration `20261118140000_demo_catalogue_offline.sql`.

- [ ] `admin.demo_catalogue_offline(kind, id, previous_status, taken_at)` records each row first.
- [ ] Live listings of unregistered seed sellers (the five `a000000N-…` sellers and `22222222-…`) and the test video
  `35783726-…` go to `draft`; self-check: 0 live listings left from those sellers, the record holds 26 + 1 rows.
- [ ] A restore statement is written in the migration's header comment.

### Task 10: Precomputed feed (H-11)

**Files:** Create migration `20261118160000_feed_rank.sql`; modify `scripts/feeds/harness.sql`.

**Interfaces:** `admin.feed_rank(product_id pk, k_boost int, k_score double precision, rating_avg numeric,
k_discount numeric, price_value numeric, created_at timestamptz, intl boolean)`; `admin.feed_rank_refresh()`;
`trg_products_feed_rank` (status / price / compare-at / rating / created changes upsert or delete one row);
job `feed-rank-refresh` every minute.

- [ ] Index `(k_boost desc, created_at desc, product_id desc)` and `(k_boost desc, k_score desc nulls last,
  rating_avg desc nulls last, created_at desc, product_id desc)`.
- [ ] `feed_products` (same signature) reads `admin.feed_rank` joined to live `products`; `newest` and `trending`
  without a trade lift take a static ORDER BY that the indexes serve; every other case keeps the CASE order.
- [ ] Harness: for every sort and filter combination, the new function returns the same ids in the same order as
  the current body over the 10,000-listing fixture; timing for newest and trending recorded.

### Task 11: Docs, checks, review

- [ ] `documentation/changelog.md`, `claude.md` (useStepBack rule, feed_rank rule, thumbnails rule, sample profiles),
  `ranking.md` (feed order source), `ToDo.md` (remove fixed lines once live), `sitemap.md` (scaffold rows).
- [ ] `tsc`, `npm run i18n:check`, `npm run rls:check`, `npm run build`, eslint on touched files; `graphify update .`.
- [ ] Commit per task; then ask Mitra before applying migrations, deploying the function or pushing.
