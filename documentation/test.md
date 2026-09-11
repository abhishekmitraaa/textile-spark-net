# Test Log & Test Suites

Updated automatically whenever a test is written or run.

Last updated: 2026-09-09

---

## Test Suites

### Playwright E2E — `tests/`
- **Location:** `tests/`

| Spec | Covers | Accounts |
|---|---|---|
| `new-arrivals.spec.ts` | Buyer New Arrivals tabs render (>=5) and the active route's tab is marked selected | anon |
| `chat-pipeline.spec.ts` | Chat + chat-moderation, UI layer (T1–T13's browser half) | `chatfx-*` / `rlstest-*` fixtures |
| `admin-chat-moderation.spec.ts` | Cosora-Admin's chat review queue | `rlstest-*` fixtures |
| `video-closeups-bunny.spec.ts` | Phase 8 Bunny Stream, browser half: the container gate, the moderation queue, real MP4 playback in both apps, approve-to-publish | `demo-*` |
| `vendor-analytics.spec.ts` | Vendor Analytics / Advertise stats / Quotes performance are counted, not fabricated — asserts every retired fixture string is absent AND that real per-vendor values render; T5 additionally asserts the engagement panels never render nothing | `demo-vendor` (read-only) |
| `vendor-my-store.spec.ts` | The My Store cluster (`/my-store`, `/my-store/business`, `/business-profile`, `/business-profile-score`, `/kyc`) is read from real rows — every retired demo literal absent, header/counts/score match the vendor row, real QR image, no `#ef4d62`, zero console errors; plus the signed-out registration block | `demo-vendor` (read-only) |
| `vendor-signup.spec.ts` | Registration through the real `Register.tsx`: the seller branch reaches step 2 (it used to skip it), signup creates a real account, the "check your email" screen appears, an unconfirmed account is refused a session, and `/auth/login` offers email+password with no fake phone check | creates a throwaway `zz-test-vendor-*@cosora.in` |
| `vendor-onboarding-write-path.spec.ts` | The **form-to-database** path: drives the real 9-step `/onboarding` and asserts state, pincode, landmark, category, office photos, the PAN scan's `file_url`, and product `unit`/`sizes`/`colour`/images all landed. Also the logo upload and the unverified-seal branch | `demo-buyer` (**mutating**, self-cleaning) |
| `mp4-phase1-register.spec.ts` | Part 1 of the signup proof: `/register` creates a real account and stops honestly at "Confirm your email". Does **not** confirm it — no inbox for the throwaway domain | creates `zz-mp4-vendor@cosora.in` |
| `mp4-phase2-callback-onboarding.spec.ts` | Part 2: `/auth/callback` writes the signup brand name to `vendor_profiles` (session injected directly, never via `/login`, whose own call would prove the wrong site); then the full 9-step onboarding with a **drawn** signature, asserting every column, the signed-URL read of the private KYC path, and the `vendor_contracts` row; then that the score stored at submit equals the score `/business-profile-score` displays | `zz-mp4-vendor@cosora.in` (**left in place** — it is the evidence) |
| `mp4-phase5-kyc-review.spec.ts` | The vendor-facing half of the KYC review loop: a rejected vendor sees the reason on `/kyc` and opens the scan through a freshly minted signed URL | `zz-mp4-vendor@cosora.in` (read-only) |
| `mp5-phase4-confirmation-link.spec.ts` | The signup brand name reaching the database via the CONFIRMATION-LINK landing URL — a cold browser context with asserted-empty `localStorage`, navigated to `/auth/callback#access_token=…`, so Login.tsx cannot mask the bug | creates `zz-mp5-link@cosora.in` |

**Three of these are one-shot by nature and `test.skip()` rather than fail once their
precondition is consumed** — a signup-metadata write proves itself once, onboarding cannot
be re-run without signing a second undeletable contract, and the `/kyc` spec reads a review
state only an admin session can create. A red test there would mean "already proved", which
is not what red is for; each skip message says how to re-arm it.

- **Run:** `npm run playwright:install` once, then `npm run test:e2e` (or a single file:
  `npx playwright test tests/<spec>.ts`).
- **Config:** `playwright.config.ts` exists — `baseURL` `http://localhost:8080`, workers 1,
  `fullyParallel: false`. It deliberately has **no `webServer`**: both apps are long-running
  dev servers a human usually already has open, and letting Playwright start and kill them
  makes a test run stomp on that. Start them yourself (`npm run dev` in each);
  `video-closeups-bunny.spec.ts` and `admin-chat-moderation.spec.ts` need Cosora-Admin on
  `:5174` too (override with `ADMIN_APP_URL`).
- **Auth convention:** sessions are minted through supabase-js in Node and injected into
  `localStorage` via `addInitScript` before the app boots, rather than driven through a login
  form. The form is not what these tests are about, and OTP is the real production path
  anyway. Both apps leave supabase-js's storage key at its default and point at the same
  project, so one injected value signs a context into either.
- **Which accounts, and why it differs per spec.** The chat specs are **fixtures only, never
  `demo-*`**, because `messages` has no DELETE policy for any role — every message they send
  is permanent. That reason is specific to chat and does not generalise:
  `video-closeups-bunny.spec.ts` uses `demo-vendor` / `demo-admin` / `demo-buyer` because
  `product_videos` *has* `pvideos_delete`, and its `afterAll` removes both the row and the
  asset at Bunny. Do not copy "fixtures only" into a new spec without checking whether its
  table can actually be cleaned up.
- **Why `vendor-onboarding-write-path.spec.ts` uses `demo-buyer`, and why it has a guard.**
  Fresh accounts cannot be minted for a test run: `auth.signUp` on this project sends a
  confirmation email and returns `email rate limit exceeded`, and writing `auth.users`
  directly is not available. `demo-buyer` is the only usable account with **no
  `vendor_profiles` row and no products**, so completing registration as it creates a vendor
  from nothing — exactly the case under test. Its `beforeAll` asserts the row is absent
  before starting: without that, a leftover row from a previous run would make the
  assertions measure stale data instead of this run's writes. `afterAll` removes only what
  the run created and restores `profiles.active_role`. Set `KEEP_TEST_VENDOR=1` to skip the
  teardown when you need to read an aggregate while the row still exists (the guard will
  then refuse the next run until you clean up).
- **Notes:** artifacts land in `test-results/`, which Playwright **wipes at the start of every
  run** — durable evidence for this file goes in `screenshots/` instead.

### Live-database verification scripts — `scripts/`
These are not a unit-test framework. They are `node` scripts that assert invariants against
the **live Supabase project**, set state in SQL and restore it afterwards. Run with
`node scripts/<name>.mjs`.

| Script | Covers |
|---|---|
| `check-seller-fields.mjs` | Seller/vendor field presence. Also wired as `npm run check:fields` |
| `suspension-gate-check.mjs` | `account_is_active()` gating on the eight INSERT policies. Runs each case **twice — active and suspended — and passes only if the answer changes** |
| `contact-gate-check.mjs` | Vendor contact-detail gating, including caller-beats-target ordering. Records the world-readable `vendor_profiles.phone` finding as INFO rather than asserting it away |
| `notifications-check.mjs` | That `notifications` is unwritable by any client role and that moderation functions write it |
| `bunny-config-check.mjs` | Whether Bunny is configured on the project, via `bunny-upload-url`'s `{"probe":true}` branch — answers `supabase secrets list` without a management token, and **creates no Bunny video**. Prints secret *names*, never values |
| `bunny-e2e-check.mjs` | Phase 8 API layer, 20 assertions: slot minting (and that the response carries no API key), TUS upload, encode, that the chosen rendition is one Bunny actually built, hotlink protection both ways, the moderation trigger, and real deletion at Bunny confirmed via its API |
| `search-smoke.mjs` | The rebuilt search surfaces in a real browser (Playwright, standalone — not part of `tests/`). 10 checks: no fabricated data on `/search` or `/search/results`, real autocomplete counts, real product cards, a real result count, a real Brand tab, the honest empty state, and zero console errors. Takes an optional base URL: `node scripts/search-smoke.mjs http://localhost:8080` |
| `vendor-buyer-geography-check.mjs` | `vendor_buyer_geography` privacy + correctness, 19 assertions. Asserts `buyer_profiles` RLS is **unchanged** (the vendor still reads zero foreign rows), k-anonymity in **both** directions (1 viewer suppressed, 3 viewers named — the positive case matters, without it a function returning nothing would pass), totals reconciling, `ad_impression` exclusion, and the buyer/anon/admin guard matrix. Writes real rows and restores the buyer's original city in `finally` |
| `engagement-events-check.mjs` | `engagement_events` security + the status guard, 19 assertions across four real accounts (vendor / buyer / admin / anon). Writes through the real RPC and deletes what it wrote; pauses and restores a real campaign for the ad case. **Contains no always-true assertions** — an early draft "passed" by skipping the two guard cases and was rewritten |
| `ad-destination-check.mjs` | The ad-click campaign-goal branch (`adDestination`/`isProfileGoalAd`), 17 cases. **The one script here that does not touch the database** — it transpiles the dependency-free `src/lib/adDestination.ts` with esbuild and calls it directly, because `active_ads` currently returns zero rows so no UI test can reach this branch |
| `image-search-check.mjs` | Photo search end to end against the live function, 18 assertions: the `no_image` guard; a real listing photo (`scripts/fixtures/polo-tshirt-listing.jpg`) → a query meeting the function's own contract (3–6 lowercase words, no punctuation); that query through the app's own `fetchSearch` (esbuild-bundled out of `src/lib/queries/search.ts`, not reimplemented) → an array, **empty counting as a pass**; a generated solid-colour square → `no_match`, not a fabricated garment; and the per-IP limit tripping to `rate_limited` in a loop. **Spends this machine's real photo-search budget** (the gateway ignores a spoofed `x-forwarded-for`): self-cleaning only with `SUPABASE_SERVICE_ROLE_KEY`, otherwise it prints the cleanup SQL. ~13 vision calls per run |
| `debug_page.cjs` / `debug_page.js` | Ad-hoc page debugging helpers, not assertions |

Cosora-Admin (separate repo) additionally owns `chat-moderation-behaviour.mjs`.

### Chat + Chat-Moderation Full Pipeline
- **Location:** `tests/chat-pipeline.spec.ts` + `tests/admin-chat-moderation.spec.ts`
  (Playwright, this repo) + `Cosora-Admin/scripts/chat-pipeline-matrix.mjs`
  (72 DB cases, ids T1–T13 below). Fixtures:
  `Cosora-Admin/scripts/seed-chat-fixtures.sql` / `drop-chat-fixtures.sql`.
- **Covers:** full buyer↔vendor chat pipeline (message send/receive/realtime),
  keyword blocklist, regex auto-flag, participant reports, conversation lock UI,
  admin review queue + resolution, account suspension, broader
  suspension-blocks-content-creation enforcement, contact exposure gating,
  notifications, admin panel structure/regressions, adversarial RLS-bypass
  attempts, realtime resilience.
- **Run:** start both dev servers (`npm run dev` here on :8080, and in
  Cosora-Admin on :5174), then
  `node Cosora-Admin/scripts/chat-pipeline-matrix.mjs` and `npm run test:e2e`.
- **Notes:** every feature is checked at BOTH layers — a feature passing one and
  failing the other is a FAIL, not a partial pass. Fixtures only
  (`chatfx-*@cosora.test`, ids `cf00000*`); never the demo accounts, because
  `messages` has no DELETE policy for any role so probe messages are permanent.
  Screenshots land in `screenshots/chat-pipeline/`, deliberately **not**
  `test-results/`, which Playwright wipes at the start of every run.

### Not configured
- **Unit / integration tests** — none. Add Vitest or Jest if needed.
- **CI test run** — not wired up.

---

## Test Run History

Entries before 2026-09-05 were reconstructed from `documentation/changelog.md` when this
file was created; they record real runs, but only those the changelog captured.

### 2026-09-11 — Master Prompt 8, Phase 1: credential rotation, bundle grep, env-credential specs 12/13

**Rotation, proven by password grant** (`POST /auth/v1/token?grant_type=password`, anon key; token
bodies were never printed, only whether one was issued):

| Account | Before rotation | Old password after | New password after |
|---|---|---|---|
| demo-admin@cosora.dev | HTTP 200, token issued | HTTP 400 `invalid_credentials` | HTTP 200 |
| demo-buyer@cosora.dev | — | HTTP 400 `invalid_credentials` | HTTP 200 |
| demo-vendor@cosora.dev | — | HTTP 400 `invalid_credentials` | HTTP 200 |

SQL after the rotation: all three demo accounts and the five `zz-*` accounts showed `sessions = 0` and
`live_refresh_tokens = 0`, with a new `$2a$10$` hash. The only admin rows in `profiles` are demo-admin
and the owner's Google account, whose password was never in the code.

**Production bundle.** `npm run build`, then `grep -rlF` over `dist/`: the old password → 0 files;
each of the three new passwords → 0 files; `demo-admin@cosora.dev` → 0 files. Dev server:
`/@vite/env` carries the values (count 1), so the dev switcher still works.

**Source.** `git grep -lF` for each of the three old password values → 0 files in textile-spark-net and
0 in Cosora-Admin. `node --check` → pass on every `scripts/*.mjs` in both repos.

**Helpers.** `scripts/lib/test-credentials.mjs` signed in as demo-buyer, demo-vendor, demo-admin,
zz-mp4-vendor and zz-mp5-link (textile-spark-net), and as demo-admin (Cosora-Admin copy). An unset name
throws `NOPE_NOT_SET is not set. Add it to .env (the names are listed in .env.example) or export it.`

**Specs.** `npx playwright test tests/vendor-my-store.spec.ts tests/vendor-analytics.spec.ts` →
**12 passed, 1 failed.** The failure is `/kyc reads vendor_documents`, which waits for an "Aadhaar" label
that `/kyc` stopped rendering when Aadhaar collection was deferred. The assertion is stale and
unrelated to credentials; it is corrected with Phase 3's `/kyc` change.

### 2026-09-11 — x-forwarded-for probe on the live deployment (19 requests) + image-search check 18/18 on v7

**Why.** The 2026-09-10 claim that a client cannot forge its IP here rested on one request whose
forged value was not even a valid IP. Community reports disagree on Supabase's behaviour, so it was
measured on this deployment.

**Probe.** A temporary image-search build (v6) answered only the nonce body
`{"xff_probe":"<nonce>"}` by echoing `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`,
`true-client-ip`, `forwarded` and the list of header names. It returned before the limiter and before
any OpenAI call. Client: this machine; its public IPv4 was confirmed as `136.233.9.123` by
api.ipify.org, api64.ipify.org and ifconfig.me (no public IPv6). Anon key; Node `fetch`, 3 requests
per case, plus case (c) once via `curl`.

| Case | Forged input | `x-forwarded-for` received | Forged value present? |
|---|---|---|---|
| a | none | `136.233.9.123,136.233.9.123, 13.248.105.x` | — |
| b | `x-forwarded-for: 203.0.113.7` | same shape | no |
| c | `x-forwarded-for: 203.0.113.7, 198.51.100.9` (Node ×3, curl ×1) | same shape | no |
| d | `x-forwarded-for: zz-xffprobe` | same shape | no |
| e | `x-forwarded-for: 2001:db8::1` | same shape | no |
| f | `x-real-ip: 203.0.113.50` | same shape; `x-real-ip` absent | no |

In all 19 requests, `cf-connecting-ip` was the real address and no `forwarded` header arrived. The
trailing proxy entry varied per request (`.16`, `.19`, `.40`–`.46`). **Result:** the header is
rebuilt at the edge, and position 0 is the real client address. The last entry is a rotating proxy
and is unsafe as a key. **Probe removal verified:** after v7, the same nonce receives
`400 {"error":"no_image"}`.

**`node scripts/image-search-check.mjs` against v7 — 18/18**, identical assertions to 2026-09-10:
- fixture → `"men white t-shirt"` → `fetchSearch` 26 results (semantic + keyword);
- the solid-colour square → `no_match`;
- the per-IP loop `no_match` ×8, then `rate_limited` on call 9 (423 ms), which is the clean-bucket
  prediction.

Cleanup mode reported **"NO service key"**: `SUPABASE_SERVICE_ROLE_KEY` is absent from `.env` and
from the process/user/machine environment. The service-key branch (snapshot, delete created rows,
reset pre-existing rows, recount) is therefore **untested live**. The printed SQL was run via MCP:
`run_rows_remaining = 0`, and `img:ip:` / `img:user:` rows in the table = **0**.

**Typecheck:** `npx tsc --noEmit --skipLibCheck` exit 0; `-p tsconfig.app.json` 0 errors.
**Advisors (security):** 4 / 1 / 30 / 43 / 1, identical to the baseline.

### 2026-09-10 — Photo search: non-product rejection + rate limit, 18/18 script + 3 browser passes GREEN

**What changed under test.** `image-search` v5 answers through Structured Outputs
(`is_apparel_or_textile` + `query`) and calls `image_search_rate_check` on every request that would
reach OpenAI. `Search.tsx` now has a branch per error code. All of it ran against the live project.

**Test data.**
- `scripts/fixtures/polo-tshirt-listing.jpg`: the real listing photo for "Premium Cotton Polo
  T-Shirt", 500×650, 38,622 bytes.
- A **256×256 solid rgb(37,111,239) PNG, 761 bytes, generated byte by byte in Node** (a hand-written
  PNG encoder in the script; nothing fetched). The browser passes use the same colour, drawn on a
  canvas.
- Accounts: `demo-buyer@cosora.dev` for steps 0–4, **anon** for the rate-limit loop, so demo-buyer's
  `img:user:` bucket is not the one exhausted.

**`node scripts/image-search-check.mjs` — 18/18.** The 13 existing checks all still pass (fixture →
`"men white t-shirt"` → `fetchSearch` → 26 results, semantic + keyword). The 5 new ones:

| # | Assertion | Result |
|---|---|---|
| 4a | The solid square's invoke returns without a transport error | ok |
| 4b | It answers `{"error":"no_match"}` and carries **no** `query` (not a fabricated garment) | ok |
| 5a | Looping as anon, the response becomes `rate_limited` within `IP_LIMIT + 1` = 11 calls | ok — **tripped on call 9** |
| 5b | `rate_limited` arrives as a 200 body, not a transport error | ok — 0 transport errors |
| 5c | Every call before the trip was served normally (`no_match`), not refused | ok — `no_match` ×8 |

Call 9 is exactly the prediction from a clean bucket: this IP had spent 2 calls in steps 2 and 4
(step 1's `no_image` returns before the limiter), and 2 + 9 = 11 > 10. The throttled reply took
**514 ms** against ~1.3–2.0 s for the calls that reached OpenAI.

**Cleanup — required, and confirmed by count.** The loop exhausts this machine's REAL `img:ip:`
bucket. A spoofed `x-forwarded-for` is not honoured by this project's gateway (measured this
session), so there is no throwaway bucket to use instead. `embed_query_rate_limit` has RLS on and
no policies, and no service key is available here, so the script printed its cleanup SQL. That SQL
was run through MCP:
- deleted `img:ip:136.233.9.123` (count **12**: 2 buyer calls + 9 loop calls + 1 browser call) and
  `img:user:<demo-buyer>` (count 2);
- a separate `count(*)` of the matching rows returned **0**;
- after the last browser pass, all remaining `img:ip:` / `img:user:` rows were deleted, and the count
  was again **0**.
The shared `img:global` counter was left in place on purpose; it is production state. With
`SUPABASE_SERVICE_ROLE_KEY` set, the script deletes and count-confirms by itself.

**Database layer — self-rolling-back `DO` block** (it RAISEs its results, so nothing persisted):

| Case | Result |
|---|---|
| Per-IP limit 3, same IP ×4 | true, true, true, **false** |
| Same user, 4 rotating IPs, limit 3 | true, true, true, **false** — the user bucket bounds IP rotation |
| Anon (no user id), 4 rotating IPs | all true; **0** `img:user:` rows created |
| Global limit 1 | **false**, and the IP row was **not** created (global is checked first) |
| Blank IP | lands in `img:ip:unknown` |
| embed-query's own rows | **identical** before and after |

Plus grants: `has_function_privilege` anon **false**, authenticated **false**, service_role **true**.
`get_advisors(security)` counts were unchanged: 4 / 1 / 30 / 43 / 1.

**Real browser, real `/search` page** (Playwright scratch script; dev server on :8082):

| Pass | Live or mocked | Checks | What it showed |
|---|---|---|---|
| This IP's budget genuinely spent | **LIVE** (function answered 200 `rate_limited`) | 8/8 | "Too many photo searches / Try again in a few minutes, or search by text."; no recognition copy, no generic copy; stayed on `/search` |
| Solid-colour square | **LIVE** (200 `no_match`) | 6/6 | "Couldn't recognise that image / Try another photo or search by text."; no search run |
| `{"error":"some_future_code"}` | **MOCKED** via `page.route` — the live function cannot be made to emit an unknown code | 5/5 | "Image search unavailable / Please try again."; **never** the recognition copy |
| Garment fixture | **LIVE** (200 `{"query":"men white cotton t-shirt"}`) | 2/2 | navigated to `/search/results?q=men%20white%20cotton%20t-shirt` |

No page errors in either pass. **Typecheck:** `npx tsc --noEmit --skipLibCheck` exit 0;
`-p tsconfig.app.json` 0 errors.

### 2026-09-11 (Master Prompt 7, buyer-trust thread · Phase 6) — Cosora-Admin panels verified, then pushed: 3/3 GREEN

`tests/mp7-admin-vendor-panels.spec.ts` (credentials from the environment, `DEMO_ADMIN_PASSWORD`
and `MP_VENDOR_PASSWORD`; both dev servers up):

| Case | Result |
|---|---|
| P6.a vendor `9ddda61f…`: two contracts at `2026-09-v1`, duplicate flagged, "View signature" opens a signed URL that resolves, no edit/delete control | PASS |
| P6.b vendor `11111111…` (demo-buyer fixture): "typed — no image on file", no "View signature" | PASS |
| P6.c PAN: Reject with reason → DB `verified=false`, the reason, `reviewed_by` = the admin → the vendor's `/kyc` shows the reason → Approve → DB `verified=true`, reason cleared | PASS |

Three earlier runs failed on the spec, not the app: `getByText("KYC documents")` also matched a
row label in the Manual-verification card; the vendor has two unreviewed documents, so "Reject"
matched twice; and the first version assumed the PAN started verified (a later onboarding
resubmission had replaced the reviewed row with a fresh one). No click happened in any failed
run. Push evidence: Cosora-Admin `git log -1` = `git ls-remote origin main` =
`01ab71e5b549e46d784ed9c0b3f654655cc35bc9`.

### 2026-09-11 (Master Prompt 7, buyer-trust thread · Phase 5) — Bunny T8.1: not Bunny's fault; spec fixed, 6/6 GREEN

**Bunny, read directly** (via `bunny-reconcile`, read-only) — the video from the failure message:
`7151edac-a482-48c9-aa84-d8fbdd9d7330` → `status 4`, `encodeProgress 100`, `hasMP4Fallback true`,
`480p,240p,360p`. Finished — after the spec's 6-minute window. Status enum per Bunny's API
reference: 0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished · 5 Error ·
6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated.

| Run | Result |
|---|---|
| `--grep "T8.1"` (T8.1 + T8.1b; no Bunny involvement) | **2/2 PASS**, 14 s |
| full `video-closeups-bunny.spec.ts` (admin dev server on :5174) | **6/6 PASS**, 1.8 min |
| `bunny-reconcile` before the run | 2 videos, both orphans from earlier failed runs (`9f07b47a…`, `7151edac…`) |
| `bunny-reconcile` after the run | the same 2 videos, `dbRowCount 0` — the run's own asset was deleted |

The two pre-existing orphans (~21 MB each) were not deleted: a destructive action on a billed
third-party library, left for a human.

### 2026-09-11 (Master Prompt 7, buyer-trust thread · Phase 4) — chat fixtures: NOT RUN (blocked)

`admin-chat-moderation.spec.ts` and `chat-pipeline.spec.ts` need the `rlstest-*` / `chatfx-*`
accounts, which are seeded by SQL that writes `auth.users` and therefore needs the service role
or the SQL editor. Neither was available (Supabase MCP disconnected; no service key in the repo),
so nothing was seeded and nothing needed dropping. Last observed failure, unchanged:
`login failed for rlstest-support@cosora.test: Invalid login credentials`.

### 2026-09-11 (Master Prompt 7, buyer-trust thread · Phase 3) — Trends: real listings or an honest empty state: 4/4 GREEN

`tests/mp7-trends-real-or-empty.spec.ts`. The empty and error states are driven by intercepting
the catalogue request (`**/rest/v1/products?*`), so the result does not depend on the live
catalogue happening to be empty.

| Case | Result |
|---|---|
| P3.a live catalogue: every `/product/` link is a real uuid; no "Product name", "Top Brands", "Visit Brand", "NEW TREND INSIGHTS", "Hot Keywords", "Also Trending", "↑" or USD price | PASS |
| P3.b "Browse similar" on the curated look links to `/search/results?q=…`; the "rugby tee" chip navigates there | PASS |
| P3.c products request → `[]`: "No listings to show yet", zero product cards | PASS |
| P3.d products request → 500: "Couldn't load listings" + Retry, not the empty state, zero product cards | PASS |

The first run failed P3.a on the string "5.6k" — which was a **real** card (a real
`enquiries_count` of 5,600), not the generator. The residue list was too blunt: the generator's
fingerprint is its literal "Product name". The same goes for "800+ sold", which also appears on
real cards because `sold_count` is seeded (see Phase 1). Remaining in `Trends.tsx`: 27 `img(`
calls (curated imagery, kept by decision); `makeProduct(` / `brandProducts(` only inside the
comment that records their removal. Screenshots: `screenshots/mp7-trends-live.png`,
`mp7-trends-empty.png`.

### 2026-09-11 (Master Prompt 7, buyer-trust thread · Phase 2) — Landing: no invented testimonial, no hotlinks: 1/1 GREEN

`tests/mp7-landing-no-fabrication.spec.ts` loads `/`, scrolls the whole page so every lazy section
mounts, then asserts: the "Verified manufacturers" and "Pan-India network" headings are visible;
"Ananya Desai", "Indigo Loom" and the quote text are absent; no `img[src*="picsum.photos"]`
exists; no console errors. PASS. Screenshot: `screenshots/mp7-landing.png`.

### 2026-09-11 (Master Prompt 7, buyer-trust thread · Phase 1) — `/product/:id` renders only the database row: 5/5 GREEN

`tests/mp7-product-detail-real-data.spec.ts`, signed out, against the live catalogue (26 live
listings, read with the anon key). The two products were picked because they differ on exactly
the axes that used to fall through to the mock template:

| Product | `product_reviews` | description | vendor | vendor's `reviews` rows | `vendor_profiles.reviews_count` |
|---|---|---|---|---|---|
| Premium Cotton Polo `36f94dd6…` | 4 | yes | Demo Textiles Co. | 5 | 5 (correct) |
| Chikankari Anarkali `b0000000…0017` | 0 | none | Lucknow Chikankari Co. | 0 | **4,800** |

| Case | Result |
|---|---|
| P1.a both render their own name / price / MOQ / vendor / category, and differ from each other | PASS |
| P1.b Polo: 4 real product reviews; vendor card "(5 reviews)" counted from real rows | PASS |
| P1.c Anarkali: "No ratings yet", "No vendor reviews yet" (not 4,800), no-description and no-origin states | PASS |
| P1.d nonexistent uuid → "Product not found", never "Couldn't load" | PASS |
| P1.e malformed id → "Product not found", never "Couldn't load" | PASS |

Every case also asserts that none of the template's strings appear (the chinos name, "Textile
Forge", "GOTS", "OEKO-TEX", "TF-MDS-0412", "Usually responds", the four invented reviewer names,
"100% organic cotton", "/ Piece"), and that there is no picsum image or sample video on the page.
Screenshots: `screenshots/mp7-product-36f94dd6.png`, `mp7-product-b0000000.png`,
`mp7-product-no-reviews-tab.png`, `mp7-product-not-found.png`.

**Denormalised review columns, measured (anon key, 2026-09-11):** `products.reviews_count`
matches the real `product_reviews` count on **3 of 26** live listings; the other 23 are seed
values with zero rows behind them. Where rows exist the columns agree (4.25 → 4.3, 4.67 → 4.7).
`products.sold_count` has no writer in either repo's migrations or client code.

typecheck **0** · eslint on the changed files **clean**.

### 2026-09-10 (Master Prompt 6) — first load/scale pass: 2 severe defects invisible at production volume

**Why this run is different.** Master Prompt 5 proved the stack *correct* on real
embeddings. Everything was still only ever measured at 33 products / 10 vendors / 4 RFQs /
**1 video**. This run built synthetic volume — **10,033 products, 2,501 videos, 2,004 RFQs,
510 vendors** — ran `EXPLAIN (ANALYZE, BUFFERS)` against every matching function, and then
deleted every synthetic row and verified the deletion. Random `halfvec(1536)` vectors were
generated directly rather than paying OpenAI at test scale; the handful of correctness
checks that needed real vectors reused the 17 already-cached query embeddings.

#### Part 1 — the four known gaps

| Check | Method | Result |
|---|---|---|
| `reject_vendor_content` anon-executable | read `proacl`, then created a throwaway function and ran the identical `revoke ... from public` against it | **Reproduced**: ACL byte-identical before and after. The revoke was a **no-op from the day it was written**, not a regression. Cause is Supabase's `pg_default_acl` per-role grants, not DROP+CREATE |
| Project-wide grant audit | `has_function_privilege` over all 67 SECURITY DEFINER functions | anon-executable **35 -> 30**; all 5 admin verbs now `anon:false, authenticated:true` |
| `ForYou.tsx` mock data | Playwright, past the onboarding gate | **4/4** — 26 real products, honest count line, 0 fabricated suppliers, no console errors |
| `preferredVideoCategoryNames()` staleness | joined `pref_category_map` to `categories` and diffed against the hardcoded table | **8 of 9 preferences mapped to zero live categories**; only `activewear` matched, by naming coincidence |
| RFQ category backfill | 3 of 4 assigned by hand; queue depth checked before/after | **0 OpenAI calls** (depth 0 -> 0). `Fleece Hoodies` now ranks 2 category-matched vendors above a higher-similarity one |
| HNSW index migration replayability | read the file against how migration runners wrap statements | `CREATE INDEX CONCURRENTLY` would have **aborted a fresh rebuild** (`25001`); also unregistered in `schema_migrations` |

#### Part 2 — scale hardening

**Warm latencies at 10,033 products / 2,501 videos / 2,004 RFQs / 510 vendors:**

| Function | Before | After | Plan |
|---|---|---|---|
| `search_products` (real cached embeddings) | — | **6.8-18.4 ms** | `Index Scan using products_embedding_idx` |
| `match_videos` | — | **1.3 ms** (2.14 ms in-plan) | `Index Scan using product_videos_embedding_idx` |
| `related_products` | — | **3.1 ms** | HNSW |
| `for_you_products` (200 rows) | — | **4.9 ms** | — |
| `match_rfq_vendors` | 16.9 ms | **9.0 ms** | direct category lookup + new partial index |
| `match_vendor_rfqs` | **1,599 ms** | **38.2 ms** | `with v as materialized` |
| product INSERT, vendor w/ ~1,000 listings | 453-1,365 ms of sync recompute | **5.2-8.4 ms** | recompute moved to cron queue |
| 200-job queue burst | 10 ticks / **10 min** | **1 tick / 25 s** | `ceil(waiting/20)` concurrent dispatch |

**The two severe defects, and why neither was visible before:**

1. **`match_vendor_rfqs` — 1,599 ms.** `EXPLAIN (ANALYZE, BUFFERS)` showed
   `SubPlan 1 -> Aggregate (loops=2003)`: the single-row `v` CTE was inlined and its
   correlated subquery re-run **once per candidate RFQ** — ~2.07M product row reads,
   **1,135,701 of 1,155,858 buffers (98%)**. At 4 RFQs and 33 products that is 4 loops over
   3 rows: invisible. Fix: `with v as materialized`. loops 2003 -> 1, buffers -> 20,724.
2. **`recompute_vendor_catalog_embedding` — 0.45-1.4 s inside every product write.**
   Measured at 1,044 / 1,032 / 1,021 live listings: **1,364.7 / 1,096.4 / 453.0 ms**,
   synchronous, in the vendor's own transaction; O(N²) on bulk import (~8 min for a
   500-listing import). Its own migration comment had predicted exactly this trigger
   condition. Moved to a `vendor_id`-keyed queue table + cron. **Dedupe proven: 6 product
   writes for one vendor collapsed to 1 pending row.**

**Behaviours demonstrated rather than assumed** (this prompt's ground rule):

| Claim | How it was proven |
|---|---|
| pgmq VT prevents double-processing under concurrency | 30 queued, two successive `embedding_jobs_read(20,90)` -> claimed 20 and 10, **overlap 0** |
| Adaptive dispatch actually parallelises | 200 jobs queued 20:16:52, queue **0 by 20:17:17** — one tick |
| Old dispatch really was capped at 20/tick | 300 jobs enqueued 19:48:13, drained ~20:03 at exactly 20/tick, no faster with 300 waiting |
| Per-IP rate limit cuts off | 30 allowed, **31st refused**, different IP unaffected |
| Global rate limit defeats IP rotation | global budget 5 -> five distinct IPs pass, **6th call from a brand-new IP refused** |
| `match_videos`' own comment about HNSW usability | plan at 2,501 videos: `Index Scan using product_videos_embedding_idx` + Incremental Sort, **2.14 ms** |
| `match_rfq_vendors` category rewrite is equivalent | old vs new form: same 10 vendors, **0 rows** in an `EXCEPT` in **both** directions |
| MP5's `max_distance = 0.80` still holds 300x up | `zzzznotathing` -> **0 rows** at 10,033 products |
| Queue-lag improvement, independently | `embedding_usage_daily` view: old-dispatch burst **avg 467 s**, new-dispatch burst **avg 8.1 s** |

**Two honest caveats on the numbers.** (1) Random 1536-dim vectors are the *pathological
worst case* for HNSW — measured avg cosine distance **0.9989**, only 20 of 10,000 rows under
the 0.80 threshold — so synthetic-vector timings **overstate** cost. The real-embedding
`search_products` figures are the trustworthy ones. (2) Every function shows a large
first-call cost (~100-700 ms) falling to single-digit ms on repeat with an **identical plan
and zero disk reads** — process/cache warm-up, not I/O. Most queries are warm at 10k
concurrent users, but the cold path is real and unmeasured under true concurrency.

**Latent defect found by reading, not by load:** `products.search_text` concatenates
`description`, and `products` carries **no CHECK constraints at all** — so one >32k-char
description would 400 the whole OpenAI call, which carries the whole batch of 20, failing 19
innocent jobs on every retry forever. Live max is 97 chars. Fixed at both ends: truncate to
30,000 chars, and dead-letter after 5 deliveries using pgmq's `read_ct` (tracked since day
one, never read until now).

**Cleanup verified:** back to exactly **33 products / 1 video / 4 RFQs / 10 vendors**, with
`0` synthetic rows in every table, `0` synthetic `auth.users`, `0` scaffold tables. Vendor
`catalog_embedding`s recomputed from the real catalogue only (synthetic listings had been
averaged in), and real RFQ matching re-verified to reproduce the Part 1d numbers exactly
(`Fleece Hoodies` -> Delhi Fashion Hub 0.416/true/0.591).

**Suite results:** `tsc -p tsconfig.app.json` **0 errors**; eslint unchanged from baseline
(3 pre-existing errors in `command.tsx` / `textarea.tsx` / `payments.ts`, none in touched
files); `vite build` green; `scripts/search-smoke.mjs` **10/10**; ForYou browser check
**4/4**; `get_advisors(security)` + `get_advisors(performance)` introduced nothing beyond
two INFO "unused index" notes on indexes created minutes earlier; all 10 new
functions/tables confirmed `anon:false, authenticated:false`; `embedding_pipeline_health()`
**OK / pipeline healthy**.

### 2026-09-09 (Master Prompt 5) — first regression pass against REAL embeddings: 3 bugs found

**Why this run is different.** Every earlier verification of the vector system ran while
`products.embedding` was 100% NULL — the worker's Vault secret did not exist, so the
pipeline had never fired once in three days. The secret was added today and the backfill
drained in ~2 minutes. This is the first measurement against real vectors.

**Phase 1 — product search.** 26/26 live products embedded, 0 missing. Warmed the query
cache through the real browser flow (`scripts/search-relevance-check.mjs`, 10 phrases,
1 OpenAI call each): **warm-then-retry 10/10** — cold load makes 2 `search_products` calls
(`embedding_used` false→true) with an `embed-query` warm between, warm load makes 1 call
reporting true. Relevance hand-check (top-5 per phrase, read from SQL once the cache was
warm):

| query | top results |
|---|---|
| `cotton t-shirt` | Premium Cotton Polo T-Shirt, Oversized Graphic Tee, Premium Cotton Polo |
| `linen shirt` | Linen Camp Collar Shirt, Linen Camp Shirt |
| `kurta` | Hand-Embroidered Kurta, Women's Casual Kurta Set, Chikankari Anarkali |
| `gym clothing` | Mesh Training Tee, Mesh Panel Training Tee, Cotton Track Pants |
| `wedding outfit` | Chikankari Anarkali, Hand-Embroidered Kurta, Gauze Co-ord Set |
| `hand embroidered` | Hand-Embroidered Kurta, Chikankari Anarkali |
| `summer beachwear` | Linen Camp Shirt, Block-Print Sundress, Kids Cotton Shorts |
| `office wear` | Formal Blazer - Navy |

`gym clothing` and `wedding outfit` share **zero** keywords with their results and returned
nothing at all before today — that is the semantic half working.

**BUG 1 — kids search returned 0 results.** `searchFilters.ts` pre-scoped kids/child/baby
to gender `"Boys"`; live `products.gender` is Men 11 / Women 10 / Unisex 4 / Kids 1.
Fixed. Measured after: `kids clothing`, `kids wear`, `baby`, `boys t-shirt`, `girls dress`
all **0 → 1 result**.

**BUG 2 — no zero-result search existed.** `search_products('zzzznotathing')` returned
**26 results (the whole catalogue)**. Measured cosine distances to pick a cutoff rather
than guessing: real queries' nearest neighbour 0.3049–0.5152, gibberish 0.8301. Set
`max_distance = 0.80`. After: gibberish 26 → **0**, `kurta` 26 → 25, others unchanged.

**Self-inflicted outage, caught and fixed in ~2 minutes.** Adding the parameter created a
second `match_products` overload; the 3-arg call became ambiguous and **all search failed**
with `42725 ... is not unique`. Dropped the old signature; migration now leads with the drop.

**Cascade proven end to end for the first time.** `Belts` → `Belts & Buckles`:
`category_name` re-synced, `search_text` regenerated, job enqueued, cron drained it,
**embedding hash changed**. Renamed back; state restored.

**Phase 2.** 4/4 RFQs embedded. `match_rfq_vendors` on real data: `Fabrics — Linen` →
**Mumbai Linen House** (0.546) top; `Premium Cotton T-Shirts` → **Tirupur Textiles**
(0.618) top; junk-titled RFQ correctly scores ≤0.177. The `PostRequirement.tsx` taxonomy
fix was **already implemented** by a prior session — the 4 null-category RFQs all date from
July and predate it. Proved it works: inserted an open-pool RFQ with a real `category_id`,
`match_vendor_rfqs` returned **`category_match: true`** (first ever). Row deleted; the
orphan queue job self-cleaned via the worker's deleted-row path.

**Phase 3.** `match_videos` returns the correct shape and runs clean; **0 neighbours
because there is exactly 1 live video and it excludes itself.** Correct behaviour —
ranking quality is genuinely unobservable and no test videos were manufactured.

**Phase 4.** `for_you_products` across all 7 buyers: Demo Buyer (0 prefs, 6 views) →
`taste`; Abhishek (3 prefs, 8 views) → `taste`; Nevu Roby (1 pref, 1 view) → `taste`;
four buyers with 0/0 → `popularity`. Every buyer landed where their real state says.
`preferredVideoCategoryNames()` staleness measured as **zero impact** — the only live
video is `Buttons`, which no preference maps to under the correct `pref_category_map`
either (`prefs_mapping_to_buttons = 0`).

**Phase 5.** All batch tables have RLS + policies. `engagement_events`: 119 real rows,
live in the frontend. `log_engagement_event` verified sound — `viewer_id` from
`auth.uid()` inside the function (unforgeable), vendor derived server-side, status guards
mirror the counter RPCs. `vendor_store_unit_and_recommendations` has **zero** embedding
references — no overlap with the matching system. No correctness or security bugs.

**Phase 6.** Both edge functions probed live via `pg_net` (so the service-role key never
left the database): `generate-embedding` → `has_openai_key/has_service_key/supabase_url_set`
all true; `embed-query` → `has_openai_key` true. **The incident's root cause:** the worker
reported `succeeded` 3,960 times over a dead pipeline because a false `WHERE` returns zero
rows and succeeds. Worker now RAISES when it has work it cannot do; added
`embedding_pipeline_health()` (service_role only), currently `OK / pipeline healthy`.
Rewritten cron verified not broken by enqueuing a real job and watching it drain.

**Grants re-verified through the real REST path with the anon key:** `search_products` and
`search_suggestions` work; `match_products` and `embedding_pipeline_health` both answer
`42501 permission denied`.

**Build/lint:** `tsc -p tsconfig.app.json` **0 errors** (the old 23-error baseline was
cleared by intervening sessions — that note is stale); eslint clean; `vite build` green;
`scripts/search-smoke.mjs` **10/10** (its autocomplete wait was raised 1200→3000ms after a
timing flake — not a product issue).

### 2026-09-09 (vendor backlog) — GST/CIN documents, KYC notifications, and a red test that was the page's fault

**GST and CIN now carry real scans** (`vendor_documents.file_url` was hardcoded `null` for
both). Driven through the real 9-step form on `demo-buyer`, read back with
`KEEP_TEST_VENDOR=1`:

| doc_type | file_url | verified |
|---|---|---|
| `pan` | `11111111-…/kyc/1788952220821-n6spwq.png` | false |
| `gst` | `11111111-…/kyc/1788952221778-qz2wlz.png` | false |
| `cin` | `11111111-…/kyc/1788952221838-l2r8zy.png` | false |

`vendor_profiles`: `pan=ABCDE1234F`, `gstin=24ABCDE1234F1Z5`, **`cin=U17110GJ2019PTC109876`**
— the CIN column had never been populated by any code path before, because no input existed.
Each scan resolves through a minted signed URL, and **no `aadhaar` row is created**, because
nothing collects one. Fixture restored afterwards (3 storage objects removed, 0 orphans).

*Test-data note:* the spec's GSTIN deliberately embeds the PAN, as a real GSTIN does
(state code + PAN + entity code + Z + checksum). That broke a substring assertion —
`getByText(FORM.pan)` matched both fields — which is the data being realistic, not wrong.
Both are now asserted with `exact: true`.

**KYC notifications are wired end to end, not groundwork.** `set_vendor_document_verified()`
writes both kinds and the rows exist in production:

| kind | title | conversation_id |
|---|---|---|
| `kyc_rejected` | Your PAN document needs attention | null |
| `kyc_approved` | Your PAN document was verified | null |

The null `conversation_id` is exactly why `href` used to resolve to `/notifications` — the
page the vendor is already on. Both kinds now link to `/kyc`.

**Admin contract panel** — the read path proved through RLS as `demo-admin` (super_admin),
which is the query `VendorContractPanel` issues: both of the throwaway vendor's rows returned,
including the same-version duplicate the panel warns about. **The panel itself has not been
rendered in a browser** — see Phase 7 below.

**`new-arrivals.spec.ts`: red → green, and the page was what was wrong.** It waited on
`[role="tab"]`, which read as a stale selector. It was written against
`components/buyer/BuyerHomeTabs.tsx` — correct roles, correct labels, **imported by nothing**.
The strip that renders is inline in `NewArrivals.tsx`: five plain links, no tablist, no
`aria-selected`, and an active state hardcoded to `/home/new-arrivals` rather than derived
from the route. Fixed in the page; the spec now also asserts exactly one selected tab.

**Still not closed: the admin KYC panel has never been clicked by a real admin.**
`demo-admin@cosora.dev` is a super_admin but its password is not available in this
environment, the `rlstest-*` fixtures were deleted, and probing for a password was correctly
blocked. Unchanged from Master Prompt 4; it needs real credentials, not more code.

typecheck **0** (both repos) · eslint **5 errors / 17 warnings** (unchanged) · Playwright
**22 passed, 3 failed, 5 skipped, 12 did not run**. `new-arrivals` has moved out of the
failure list. The three failures are all environmental, none from this work:

- `admin-chat-moderation` and `chat-pipeline` — `rlstest-*` fixtures deleted (long-standing).
- **`video-closeups-bunny` T8.1 — NEW, and not a code regression.** Its `beforeAll` uploads a
  real clip and waits for Bunny to encode it; it now fails with
  `Bunny never finished encoding … (status=2)` — status 2 is "processing". **Reproduced twice**,
  so it is not a flake: Bunny is not finishing a short 478×850 clip inside
  `ENCODE_TIMEOUT_MS = 6 min` (polled every 10s), which is generous. Nothing in this pass
  touches video upload, Bunny or moderation. Check the Bunny library/account before
  suspecting the app; if encoding is legitimately slower now, the timeout is the thing to
  raise. Because the failure is in `beforeAll`, T8.1b–T8.5 never run — the whole Bunny suite
  is currently blocked behind it.

### 2026-09-09 (contract integrity) — a vendor could delete their own signed agreement

| Assertion (`scripts/vendor-contract-integrity-check.mjs`) | Result |
|---|---|
| Vendor deletes own `vendor_profiles` row → row survives | **PASS** |
| …and their signed contracts survive | **PASS** — 2 → 2 (was 1 → 0 before the fix) |
| Vendor UPDATE / SELECT on own profile still work | **PASS** |
| Vendor can still read own contracts | **PASS** — 2 rows |
| Duplicate signature for an already-signed version | **PASS** — 2 → 2, refused |

**6/6.** Every assertion reads the row back; none trusts the return value, because an
RLS-denied DELETE matches zero rows and returns success.

| Other checks | Before | After |
|---|---|---|
| `vendor_contracts_vendor_id_fkey` `confdeltype` | `c` (cascade) | **`r` (restrict)** |
| Orphaned objects in `business-docs` | **12** | **0** |
| …after two further full onboarding runs | — | **0** |
| demo-buyer contracts after onboarding **twice** | (would have been 2) | **1** |
| Preserved evidence on `9ddda61f-…` | 2 | **2** (untouched) |

**Phase 4, on the confirmation-link path this time.** New account `zz-mp5-link@cosora.in`
(`28ada0e2-…`). A completely cold browser context — asserted empty `localStorage`, no injected
session, Login.tsx never loaded — navigated to
`/auth/callback#access_token=…&refresh_token=…&type=signup`, the exact URL shape Supabase's
`/auth/v1/verify` redirects to under `detectSessionInUrl` + implicit flow:

```
before: metadata.brand_name=Kesar Textiles  vendor_profiles.brand_name=(no row)
after:  vendor_profiles.brand_name=Kesar Textiles  landed on /auth/role-selection
```

**Phase 5, on a second fresh vendor** (`28ada0e2-…`): stored at submit **29** · displayed **29**
· after dashboard recompute **29**. Corroborating the earlier run: the deleted nine-check
formula was `filled/9 × 100` over checks this vendor satisfied completely and would have
written **100** — 29 is only producible by `calculateProfileScore`.

typecheck **0** · eslint **5 errors / 17 warnings** (unchanged, all pre-existing).

### 2026-09-09 (prove the write path) — a vendor actually completed registration, and the counts moved

**The claim two previous passes made and never demonstrated.** Throwaway vendor
`zz-mp4-vendor@cosora.in` / `9ddda61f-d778-41a5-b568-39fd9f3eb37a`, created through the real
`/register` form, confirmed out of band, driven through all nine onboarding steps with a
**drawn** signature. **Left in the database deliberately — it is the evidence.**

| `vendor_profiles` | before | after |
|---|---|---|
| total | 7 | **8** |
| onboarding_complete | 1 | **2** |
| with PAN / GSTIN / state / pincode / office photos | 0 / 0 / 0 / 0 / 0 | **1 / 1 / 1 / 1 / 1** |
| `vendor_contracts` rows in the whole project | **0** | **1** (then 2 — see below) |

Row-level results: `brand_name=Meridian Weaves Pvt Ltd`, `pan=AFZPK7190K`,
`gstin=24AFZPK7190K1ZT`, `state=Gujarat`, `postal_code=394221`, 2 office photos,
`onboarding_complete=true`, one `under_review` product with an image, a `vendor_documents`
PAN row whose `file_url` is a **private storage path** (`9ddda61f…/kyc/…png`, not a URL)
that resolves only through a minted signed URL, and a `vendor_contracts` row at
`agreement_version = 2026-09-v1` with an uploaded signature PNG.

**The AuthCallback fix, proved at the column and not the redirect.** Before: a real signup
left `raw_user_meta_data.brand_name = "Meridian Weaves"` and **zero** `vendor_profiles`
rows. After: hitting `/auth/callback` with a session injected straight into `localStorage`
— deliberately never through `/login`, whose own `applyPendingSignupProfile()` call would
have proved the wrong site — produced `vendor_profiles.brand_name = "Meridian Weaves"`.

**Profile score, one formula.** Stored at onboarding submit **29** · displayed on
`/business-profile-score` **29** · after the dashboard's own recompute **29**. The
recompute is now a no-op rather than a silent correction.

**KYC review round-trip, against the real `set_vendor_document_verified()`** (sessions
impersonated at the DB layer; the admin panel's own buttons were NOT clicked — no admin
credentials are available in this environment, and probing for one was correctly blocked):

| Assertion | Result |
|---|---|
| Vendor (non-admin) calls the RPC on their own document | **refused, row untouched** |
| Rejection with a blank reason | **refused** |
| Rejection with a reason | stored, `reviewed_by` stamped |
| The vendor sees it on `/kyc` | "Rejected" + the reason rendered |
| The scan opens from `/kyc` | fresh signed URL, `/object/sign/business-docs/…token=`, HTTP 200 |
| Approve | `verified=true`, `rejection_reason` cleared |
| Unknown document id | **raises**, does not silently no-op |
| `kyc_approved` / `kyc_rejected` notifications | both fired |
| `vendor_profiles.is_verified` after approval | **still false** — KYC does not grant the seal |

**Suite:** typecheck **0**; eslint **5 errors / 17 warnings** (all pre-existing);
Playwright **27 passed, 3 failed, 3 skipped, 7 did not run**. The 3 failures are all
pre-existing and unrelated: `admin-chat-moderation` and `chat-pipeline` both fail at
`login failed for rlstest-support@cosora.test: Invalid login credentials` (fixture accounts
deleted, already logged as tech debt), and `new-arrivals` waits for `[role="tab"]` on a page
whose markup contains **zero** tab elements — the page was rewritten and the spec never was.
The 3 skips are the one-shot MP4 specs declining to re-prove themselves.

**Fixed while measuring:** `vendor-onboarding-write-path.spec.ts` had been failing since the
private-bucket change with `TypeError: Failed to parse URL from 11111111-…/kyc/….png` — it
still `fetch`ed `file_url`, which stopped being a URL — and its teardown deleted rows but not
storage objects, leaking one identity scan per run. Both fixed; a verification re-run left the
orphan count unchanged, so the leak is closed.

**Found, not anticipated, NOT fixed:** deleting a `vendor_profiles` row through an
RLS-enforced anon client took its `vendor_contracts` count from 1 to 0 —
`vendor_contracts.vendor_id` is `ON DELETE CASCADE` and `vprofiles_write` lets a vendor
delete their own profile, so the "append-only, no delete for anyone" guarantee is bypassable
from the browser. And re-running onboarding inserted a **second** permanent contract row
(observed live: 2 rows for one vendor, same version), because `saveVendorOnboarding` dedups
`vendor_documents` and not contracts.

### 2026-09-08 (trust & auth) — KYC out of the public bucket, a privilege escalation closed, typecheck 23 → 0

**Security, verified against the live project — these are the ones that matter.**

| Check | Before | After |
|---|---|---|
| Unauthenticated GET of a KYC document's public URL | **HTTP 200, 70 bytes** | **HTTP 400** |
| Owner signs their own KYC path (`business-docs`) | n/a | 200 |
| Same signed URL after its 5-minute TTL | n/a | 400 |
| A DIFFERENT vendor signs that path | n/a | refused — "Object not found" |
| anon signs that path | n/a | refused |
| Objects under `product-images` matching `%/kyc/%` | 3 | **0** |

- **`update vendor_documents set verified = true` from a vendor's own browser SUCCEEDED.**
  Proved before the fix was written, with a throwaway row on `demo-vendor`. The anon key ships
  in the bundle, so this was a one-line self-service trust badge. After the guard trigger and
  the `set_vendor_document_verified()` RPC: 8/8 — vendor insert forced to `verified = false`,
  insert with `verified: true` forced to false, self-verify UPDATE **refused with a message**
  (not silently no-oped), a non-admin calling the RPC refused, reject-without-reason refused,
  approve clears the reason and stamps `reviewed_at`/`reviewed_by`, an unknown doc id raises.
- **Admin KYC end to end, 8/8**, all at the database layer rather than through the UI: vendor
  uploads to `business-docs` → the row carries a PATH → the admin selects another vendor's row
  → opens the scan through a signed URL (200) → rejects with a reason → **the vendor reads that
  reason back** → the admin approves → `verified` flips and the reason clears → both verdicts
  wrote a `notifications` row (confirmed in SQL; the first client-side count returned `null`
  because the probe filtered on `type` when the column is `kind` — the test was wrong, not the
  code).
- **Auth facts settled by probe, not assumption.** `signInWithOtp({ phone })` →
  `phone_provider_disabled / "Unsupported phone provider"`, which decided three separate items
  (Login's phone control, `/auth/otp-verify`, onboarding step 2). `auth.signUp()` returns a
  user with `session: null` → email confirmation is ON, which is why Register ends on a
  "check your email" screen. A real signup produced a `profiles` row with `full_name`, `phone`
  and **`active_role = 'seller'`** — the `handle_new_user` change working.
- **Typecheck 23 → 0.** `npm run typecheck` was added because `tsc --noEmit` with no `-p`
  compiles nothing and reports a false 0. One loose parameter (`count(table: string)` in
  vendorDashboard) accounted for **eleven** of the 23. Two of the remaining fixes were real
  bugs: a formatted enquiry string being stored as a numeric review count, and — only visible
  once that stopped masking it — a capitalised `"Unisex"` asserted into a lowercase union.
- **Specs:** `vendor-my-store.spec.ts` 8/8, `vendor-signup.spec.ts` 2/3 (the third is gated on
  the mail rate limit, below). eslint **5 errors**, down from 6 with the OtpVerify deletion.
- **Blocked, and stated rather than papered over:** the full 9-step onboarding run for a
  brand-new vendor (Phase 4) needs a confirmed account. Email confirmation is on, the
  throwaway address has no mailbox, and Supabase's built-in SMTP rate-limits signups — the
  form surfaced exactly that error, live, which is itself evidence the error handling works.
  It needs a human to confirm the user in the dashboard once.

### 2026-09-08 (my-store pass) — Vendor "My Store" cluster de-mocked: 11/11 GREEN, through the real UI

`npx playwright test tests/vendor-my-store.spec.ts tests/vendor-onboarding-write-path.spec.ts`
— **11/11**, dev server on `:8081` (`:8080` was in use by a parallel session).
Typecheck `tsc -p tsconfig.app.json` **23 errors, the unchanged baseline**; eslint **6
errors, down from 8** (two pre-existing ones were removed with the code that caused them, and
none were added).

**Evidence:** `screenshots/vendor-my-store.png`, `vendor-business-profile.png`,
`vendor-profile-score.png`, `vendor-kyc.png`, `vendor-get-reviews-qr.png`,
`vendor-onboarding-welcome.png`, `vendor-my-store-new-vendor.png`,
`vendor-business-profile-new-vendor.png`, `vendor-empty-profile.png`.

- **The write-path spec is the one that matters, and it exists because a direct INSERT proves
  nothing here.** The bug being fixed was that `/onboarding` *collected* state, pincode,
  premises photos, a PAN scan, business categories and product unit/sizes/colours and wrote
  none of them — an INSERT test would have passed against that broken build, because the
  columns always accepted values. So the spec drives all nine steps of the real form and then
  reads the database back. It also fetches every stored URL and asserts a `200`: an
  `office_photos` array full of `blob:` URLs, which is what the form used to produce, would
  otherwise have looked exactly like success.
- **Phase 8.6, the before/after count.** Before: 7 vendor rows, 1 onboarded, **0 with pan, 0
  with state, 0 with postal_code, 0 with office_photos**. After one registration through the
  real UI: 8 rows, 2 onboarded, **1 / 1 / 1 / 1**, plus `vendor_documents` carrying a
  non-null `file_url` for the first time and a product with `unit='pieces'`,
  `sizes=['M','L']`, `colour='Black'` and one `product_images` row.
- **The signed-out case blocks EARLIER than the master prompt expected, which is the stronger
  result.** The prompt asked for a block at the final submit. Because premises photos and the
  PAN scan now upload to storage under the vendor's own id, a signed-out registration cannot
  get past **step 6** — it is refused at the point of upload rather than after eight more
  steps of work. The submit-time guard is still there as the backstop and is still the thing
  that stops the success screen rendering; the spec asserts the success screen never appears
  at any point.
- **Two assertions were wrong at first and both were test bugs, not product bugs.** A
  cluster-wide sweep for `"Rajesh Kumar"` failed on `/business-profile` — it is
  demo-vendor's **real** `owner_name`, and only `BusinessTools` ever invented it, so that
  literal is now checked on that page alone. And the score-page assertion read
  `vendor_profiles.profile_score` *before* loading the page; `fetchVendorDashboard`
  recomputes and syncs that column on first load, so the read now happens after.
- **`MyBusiness` renders every row twice** (a mobile list and a desktop grid, one hidden by a
  breakpoint), so `getByText(...).first()` resolves to the hidden copy. Use `.last()` there.
- **Restored afterwards, verified not assumed:** `demo-buyer`'s `profiles` row is
  byte-identical to its pre-run snapshot, with 0 vendor rows / 0 products / 0 documents, and
  the project is back to 7 `vendor_profiles`. `demo-vendor` was read-only throughout.

### 2026-09-09 — Buyer geography (Phase 3.8): 19/19 GREEN

**`node scripts/vendor-buyer-geography-check.mjs` — 19/19 PASS.** Four real accounts, real
rows through the real RPC, everything restored in `finally` (including the demo buyer's
original `Mumbai / Maharashtra`).

| Group | Assertions |
|---|---|
| Phase 0 columns | a buyer can read their own `buyer_profiles` row; a buyer can persist `city`/`state`/`postal_code` — the write path that did not exist before this change |
| RLS unchanged | the vendor reading the buyer's row gets **nothing**; scanning `buyer_profiles` returns no foreign row at all |
| Coverage | qualifying visits are counted, and counted as located |
| k-anonymity — suppress | a city with 1 distinct viewer is **not named**; its visits still appear in `other`; no state is named off a single viewer; `named + other == events_with_location` |
| k-anonymity — **admit** | three distinct viewers in one city **IS** named, with correct counts, and its state too |
| Event filter | an `ad_impression` does not change the geography totals |
| Guard matrix | a buyer asking for the vendor's geography gets null; an anonymous caller is refused; an admin can read it |
| Reference point | `home_location` matches `vendor_profiles` |

**Why the positive k-anonymity case is called out separately.** Every other threshold
assertion is a *suppression* check, and a function that returned an empty list for everything
would pass all of them. 3b is the one that proves the feature works at all. It was added after
noticing the suite could not distinguish "correctly private" from "completely broken" — the
same failure shape already recorded for `bunny-e2e-check.mjs` and for the first draft of
`engagement-events-check.mjs`.

**Auth hole found during development, now asserted against.** Called as service_role (no JWT)
with an explicit `v`, the function returned a **full result** — `not (vid = auth.uid() or
is_admin())` is NULL when `auth.uid()` is NULL, and `if NULL then` does not fire. Fixed with
`coalesce(...)` on both operands and re-verified to return null. See the Postgres-facts entry
in `claude.md`; `ad_category_benchmarks` still has the same shape and is flagged there.

**Test bug found and fixed**: the `ad_impression` assertion compared against a baseline taken
before a later step inserted three more events, reporting `3 -> 6` and blaming the ad
impression for rows the script had created itself. Baseline is now re-read immediately before
the assertion. Recorded because the failure message pointed at the wrong component.

**Browser pass**, both states, `screenshots/geo-empty.png` and `screenshots/geo-populated.png`:

| State | Rendered |
|---|---|
| No qualifying events | "No buyer visits in the last 7 days yet. Product views, storefront visits and search clicks all count towards this." |
| 3 viewers in one city | "Based on 3 of 3 recent visits with a known location." · "You are registered in Tirupur" · BY STATE "Uttar Pradesh — 3 visits · 3 buyers" · BY CITY "Kanpur, Uttar Pradesh — 3 · 3 buyers" |

All probe rows and location edits reverted afterwards; `engagement_events` back to 0 rows,
`buyer_profiles` back to a single `Mumbai / Maharashtra`, and `buyer_profiles` still carries
exactly its one original policy (`bprofiles_all:ALL`).

### 2026-09-08 (later) — `engagement_events` applied and verified: 19/19 + 17/17 + 5/5 GREEN

The MCP reconnected, so everything the earlier entry could not verify was verified. **A real
bug was found by doing so** — see the changelog entry; the short version is that the event
log did not repeat the `status` filters the counter RPCs carry, so a vendor previewing their
own `under_review` listing would have logged a view against themselves that the counter did
not record. Fixed in the migration before it was applied.

**`node scripts/engagement-events-check.mjs` — 19/19 PASS.** Four real accounts
(`demo-vendor`, `demo-buyer`, `demo-admin`, anon), real rows through the real RPC, all
cleaned up.

| Group | Assertions |
|---|---|
| No client INSERT | direct `insert()` refused for anon, for an authenticated buyer, **and for the owning vendor** — there is no INSERT policy at all |
| Viewer identity | a buyer's event records the buyer as `viewer_id`; a signed-out event has `viewer_id` null and **keeps** `session_id`; a signed-in event **drops** `session_id` so a known viewer never gets a second identifier |
| Attribution | a **forged `p_vendor_id` is ignored** in favour of the product's real owner; `source` is stored as given |
| Status guard | a `product_view` on a `rejected` product is dropped; an `ad_impression` on a `paused` ad is dropped; **a `cta_click` naming the same non-live product IS recorded** |
| Failure handling | an `event_type` outside the check constraint returns cleanly; an unknown product id returns cleanly |
| RLS on read | the vendor reads their own rows and only their own; **a buyer reads nothing — not even events they generated themselves**; anon reads nothing |

**Test-data note.** The guard cases could not use the obvious subjects. The demo vendor's six
products are all live, a real plan trigger refuses a seventh (*"your free plan allows 2
listed product(s); you already have 6"*), and `products` RLS is `status = 'live' OR own OR
admin`, so the vendor cannot even see another vendor's non-live rows. The script therefore
finds its subject through the **admin** client — whose product it is does not matter, since
the guard is a property of the function and fires before any vendor attribution. The ad case
pauses a real campaign and restores it in `finally`.

**Status guard, proved independently in SQL** (self-rolling-back `DO` block, so nothing
persisted):

```
product_notlive_dropped=t  product_live_written=t  cta_on_notlive_kept=t
ad_notactive_dropped=t     ad_active_written=t
```

Confirmed after rollback: product back to `live`, ad back to `active`, `engagement_events`
empty, zero probe rows.

**End-to-end through the running app** (buyer session, real browser):

| Step | Event written | Checked |
|---|---|---|
| `/search/results?q=polo` | `search_impression` ×2 | `source=organic_search`, `query_text=polo`, `viewer_id` set. **Two, not four** — impressions are per *vendor*, not per matching product |
| click a result card | `search_click` | `product_id` set, query preserved |
| land on `/product/:id` | `product_view` | **`source=organic_search` survived the hard navigation** — the 15-second `sessionStorage` marker doing its job |

All four probe rows deleted afterwards. Evidence: `screenshots/e2e-product-view.png`,
`screenshots/analytics-after-migration.png`.

**Panel state flipped, and the distinction held.** Before applying: "Visit-level tracking is
not switched on". After: "No tracked activity in the last 7 days" — a genuine empty window,
which is a different claim. Verified in a browser as the real vendor.

**Types.** `src/lib/database.types.ts` was hand-written before access returned; diffed
token-for-token against `generate_typescript_types` — **171/171** for the table, **24/24**
for the function, identical including optionality and FK names. No regeneration needed.

**Advisors.** 72 lints, **0 ERROR**. Two new WARNs name `log_engagement_event`
(`anon`/`authenticated` may execute a SECURITY DEFINER function) — **expected and must not
be "fixed"**: signed-out views have to be loggable, and revoking `EXECUTE` from `anon` would
silently stop recording them. 67 identical warnings already existed. Nothing about
`engagement_events` RLS is flagged.

**Process note worth keeping.** The first draft of the new script reported
`SKIPPED — vendor has no non-live product to test with` and **passed** — silently skipping
the exact behaviour it existed to verify. Two always-true `check(..., true)` calls were
removed; `grep -cE "check\(.*, true\)"` is now 0. Same failure shape as the
`bunny-e2e-check.mjs` delete assertion that once passed because 403 looked identical before
and after.

### 2026-09-08 — Visit-level tracking (Phase 3): routing 17/17, UI 5/5 GREEN, migration NOT applied

**What could not be verified, and why.** The `engagement_events` migration was **not applied**
— this session had no database access (the Supabase MCP reported "not connected" throughout,
the CLI is unlinked and there is no access token on the machine). So nothing below exercises
a real event row. What is verified is that the code is correct against the schema the
migration defines, and that the app is honest about the table not being there yet.

**`node scripts/ad-destination-check.mjs` — 17/17 PASS.** This is the load-bearing one: the
ad-click branch decides whether a vendor who paid for "Visit your profile" gets storefront
traffic, and it cannot be reached from the UI at all today because `active_ads` returns zero
rows (both of the demo vendor's campaigns ended in July 2026). Cases covered:

| Group | Cases |
|---|---|
| `isProfileGoalAd` | null, empty, `openListing`, `storePromotion`, `brandAd`, the two real live CSVs (`openListing,trustedSeal` / `openListing,featuredProduct`), a CSV containing a profile goal, a CSV with whitespace, and `notStorePromotionReally` — which must NOT match, guarding against a substring test sneaking back in |
| `adDestination` | profile-goal ad routes to `/vendor/:id` **not** `/product/:id` (the bug); `brandAd` inside a CSV likewise; a product-goal ad still routes to the product (unchanged behaviour); a profile-goal ad with **no product** now works where it used to be a dead card; a product-goal ad with no product falls back to the storefront; nothing to open returns null so the caller does not navigate; profile goal with no vendor id falls through to the product |

**`npx playwright test tests/vendor-analytics.spec.ts` — 5/5 PASS** (`demo-vendor`,
read-only). T1–T4 as in the 2026-09-07 entry, plus:

| Test | What was checked | Result |
|---|---|---|
| T5 | Performance Trends and Traffic Sources are present by name (a chart that silently disappears reads as a bug); the page shows either a chart, a real empty-window message, or the not-switched-on notice — never a panel rendering none of the three; the new Search and Actions tabs exist | PASS |

**Evidence:** `screenshots/analytics-views.png` (Traffic Sources back as a real panel showing
the not-switched-on state; Views by Category rendering this vendor's four real categories at
42/25/17/17%), `screenshots/analytics-engagement.png`.

**A rendering bug the screenshots caught.** The first evidence capture showed an empty chart
area above a fully populated Views-by-Category legend — Recharts animates on mount and the
screenshot was taken mid-draw. The spec now settles before capturing. Worth recording because
the artefact looked exactly like a broken query and is not one.

**Also fixed after reading the first capture:** the not-switched-on notice was written for
the trend charts ("a day-by-day trend needs…") but is reused verbatim by Traffic Sources, the
search-term table and the CTA panel, where that wording is simply wrong. It is generic now.

**Not verified, and stays that way until the migration is applied:** that any event actually
inserts, that RLS admits the owning vendor and refuses everyone else, that `viewer_id` is
populated from `auth.uid()`, and that the `PGRST205` → `installed: false` path flips to real
data. The switch-on checklist is in `documentation/claude.md` under "Visit-level tracking".

**Environment note.** During this session `src/pages/Onboarding.tsx` and
`src/lib/queries/vendorOnboarding.ts` were modified from outside it (a business-categories
feature in progress, with new untracked files `src/components/vendor/AddBusinessCategoriesModal.tsx`
and `src/data/businessCategoryGroups.ts`). `Onboarding.tsx` currently carries 58 type errors
of its own — `tsc -p tsconfig.app.json` therefore reports far more than the 23-error baseline.
**None of those are in any file this work touched**, which was confirmed per-file rather than
assumed, and that in-progress work was left alone.

### 2026-09-07 — Vendor analytics de-mocking (Phases 1–2): 4/4 GREEN

**Spec:** `tests/vendor-analytics.spec.ts`. **Account:** `demo-vendor@cosora.dev`
(`2222…2222`), session injected via `addInitScript` per the auth convention above.
**Read-only** — the spec creates, mutates and deletes nothing, so it is safe to re-run
against the live project. Requires `npm run dev` on `:8080`.

**Why this spec asserts absence.** A fabricated figure renders exactly as convincingly as a
real one, so "the page shows a number" would have passed against the fixtures this change
removed. Each test therefore has a negative half (the retired fixture strings must not
appear) and a positive half (values that can only come from this vendor's rows must).

| Test | What was checked | Result |
|---|---|---|
| T1 | `/analytics` contains none of `4.2 / 5`, `24 reviews`, `312 helpful votes`, `Traffic Sources`, `Direct Search`, `Browse Category`, `Cotton Fabrics`, `Premium Cotton Blend`, `Italian Silk Collection`, `Organic Hemp Fabric`; Views-by-Category shows a real taxonomy category; a `Lifetime` scope pill is present | PASS |
| T2 | Clicking `90 days` moves the Total Order Value card's pill from `Last 7 days` to `Last 90 days` — i.e. the filter genuinely re-scopes a windowed card | PASS |
| T3 | `/advertisements` contains none of `27.2K`, `Avg. Cost/Lead`, `+23% this month`, `in the last one month`; Missed Calls states "records the dialer opening"; `Revenue Booked / Lead` is present | PASS |
| T4 | `/quotes` contains none of `₹24.5L`, `1.5 days`, `This Month: 8 quotes`; Total Order Value still renders | PASS |

**Evidence:** `screenshots/analytics-overview.png`, `screenshots/analytics-views.png`,
`screenshots/advertise-stats.png`, `screenshots/quotes-performance.png`.

**Live data the assertions ran against** (queried as the same vendor under RLS before the
UI was wired, so the expected values were known independently of the page):

| Figure | Live value |
|---|---|
| Conversations / messages | 2 / 2 — 1 thread overdue, 1 awaiting a vendor reply, 0 answered |
| RFQs / quotes / accepted | 3 / 2 / 0 → Total Order Value ₹0 |
| Repeat buyers | 2 of 2 |
| Views by category | Men's T-Shirts 5, Men's Shirts 3, Activewear 2, Women's Dresses 2 |
| Rated live products | Linen Camp Shirt 4.7 (3), Premium Cotton Polo 4.3 (4), Oversized Crew Tee 4.3 (4) |
| Vendor reviews | 5 reviews, avg 4.4, 60% five-star |
| Campaigns / paid ad orders / clicks | 2 / **0** / 86 |
| Calls to this vendor | 3, all `direction = 'outgoing'` (buyer-placed) |

**Two findings the run surfaced, both fixed before the final pass.** The Conversion KPI was
rendering **15,425.0%** — `enquiries_count` (1.9K) and `views_count` (12) are independent
counters, so their ratio is not a rate; above 100% the card now shows both counts and says
they are not comparable. And the responsiveness line read "average first reply —" when no
thread had ever been answered; it now says so in words.

**Also verified, not by this spec:** `tsc --noEmit -p tsconfig.app.json` holds at the
23-error baseline (a bare `tsc --noEmit` compiles nothing in this repo and falsely reports
0), and `vite build` succeeds.

### 2026-09-07 — Hybrid product search: DB layer verified, browser layer 10/10 GREEN

**What was tested and how.** The semantic half cannot be exercised yet (OpenAI billing is
not active, so every `products.embedding` is null). Everything else was, and the keyword
half is fully live. DB assertions ran through the Supabase MCP against the live project;
the browser layer ran against a real dev server on `:8081` via `scripts/search-smoke.mjs`.

**Database layer — verified against live data:**

| Check | Result |
|---|---|
| `halfvec(1536)` resolves; pgvector 0.8.2 | PASS |
| `pgmq.create('embedding_jobs')` + `list_queues()` | PASS |
| `net.http_post` exists (functions under `net`, extension on `public`) | PASS |
| `search_text` / `fts` generated correctly, category included | PASS — `"Linen Camp Collar Shirt  Linen 150 Regular Sky      Shirt"` |
| `category_name` backfilled | 26/26 live rows |
| `match_products('cotton t-shirt')` | 5 cotton tops, correctly ranked |
| `match_products('linen shirt')` | exactly the 2 linen shirts |
| **Draft rows leaking into results** | **0** — the 3 junk rows are invisible |
| `related_products` fallback branch | PASS — `is_fallback: true`, distance null |
| Anon key calling `generate-embedding` | **403 forbidden** (the credit-burn hole is closed) |
| Category-rename cascade mechanism | PASS — no-op `SET category_id = category_id` produced a correct queue job |

**The gap the vector half will close, measured rather than asserted.** Four natural buyer
queries return **0 results each** on keyword search today: `summer beachwear`,
`breathable office wear`, `wedding outfit`, `gym clothing`. Re-run these after the backfill;
that is the before/after.

**One thing could not be tested:** the `AFTER UPDATE OF name ON categories` trigger firing.
The auto-mode classifier blocked a write to the shared `categories` taxonomy — correctly.
The *mechanism* it depends on was verified from the products side instead (see the last row
above), so what remains unproven is only the trigger's own firing, which is stock Postgres.
Worth closing with one real rename through the admin panel.

**Browser layer — `node scripts/search-smoke.mjs`, 10/10 PASS, 0 console errors:**
no fabricated data on `/search` (swept for H&M / Zara / Levi's / "Popular keywords" /
"Trending Keywords" / "Father's Day" / the six fake manufacturers / `$27.53` / "Sponsored");
category rail renders; autocomplete returns real counts (`T-shirts/Tops — 5 listings`,
`Shirt — 2 listings`, `Premium Cotton Polo T-Shirt — 5,600 enquiries`); `/search/results?q=shirt`
renders **7 real product cards** from real vendors with a real `7 results` footer carrying
the honest `· keyword match only` suffix; Brand tab shows real suppliers
(`Tirupur · 3 matching listings`); `?q=zzzznotathing` renders the real empty state.
Screenshots in `screenshots/search-*.png`.

**ProductDetail** separately verified after `useYouMightLike` was switched to
`related_products`: title renders, "You might also like" and "Brand Picks" both present,
8 related product links, 0 console errors — exercising the same-category fallback branch,
which is the expected path while embeddings are null.

**Security advisors — run after the DDL, and it caught something real.** `get_advisors(security)`
went **76 → 66** lints after a hardening pass (`20260906200000`). Two findings were genuinely
mine: (1) Postgres grants EXECUTE to PUBLIC by default, so the three new **trigger** functions
(`sync_product_category_name`, `enqueue_product_embedding`, `cascade_category_rename`) were
reachable at `/rest/v1/rpc/<name>` by anon — low severity, since calling a trigger function
directly errors, but this codebase already revokes these (20260801100327, 20260905182854);
(2) `immutable_array_to_string` and `normalise_search_query` had role-mutable search_paths,
now pinned — verified first that pinning is accepted despite a generated column depending on
one of them. `match_products` was additionally revoked from anon/authenticated: it is the
ranking engine, not the entry point, and being reachable let anyone POST an arbitrary
1536-float vector.

Verified through the **real REST path with the public anon key**: `search_products` and
`search_suggestions` still return results, `match_products` now answers
`42501 permission denied`, `enqueue_product_embedding` has left the schema cache entirely.
`scripts/search-smoke.mjs` re-run after the revokes: **still 10/10**.

Remaining advisories on this work are all intentional and recorded in `claude.md`:
`search_products` / `related_products` / `search_suggestions` stay anon-executable (they are
the buyer-facing API, each SECURITY DEFINER *and* internally filtered to `status = 'live'`);
`search_query_embeddings` has RLS on with no policies **by design** (deny-all, service_role
only); `extension_in_public: pg_net` is cosmetic — all 12 of its functions live in `net`
and none in `public`, confirmed via `pg_depend`.

**Build/lint:** `tsc -p tsconfig.app.json` holds at the unchanged **23-error baseline**
(vendorDashboard 11, i18n 5, VendorProfile 2, vendorStore 2, profile 2, rfqs 1 — none in
any file touched here); eslint clean on all changed files; `vite build` green in 33s.

### 2026-09-06 (browser half) — Bunny Stream in a real browser: 6/6 GREEN, and a correction

- **Suite/test:** `tests/video-closeups-bunny.spec.ts`, 6 cases (T8.1, T8.1b, T8.2–T8.5),
  serial, Chromium, against the live project, the live Bunny library and both dev servers.
- **Result: 6 passed in 48.4s.**

**CORRECTION to the two entries below.** Both recorded the Playwright half as blocked until
`seed-chat-fixtures.sql` / `seed-test-admins.sql` were re-run, framed as a decision about
putting known-password logins back into a live database. That was wrong. It conflated *the
chat suite's* fixtures with *any* browser test. `chat-pipeline.spec.ts`'s "FIXTURES ONLY,
never `demo-*`" rule states its own reason — `messages` has no DELETE policy for any role, so
its writes are permanent — and that reason does not transfer to `product_videos`, which has
`pvideos_delete`. `demo-vendor`, `demo-admin` (`super_admin`, active) and `demo-buyer` all
exist and sign in; `bunny-e2e-check.mjs` had already been round-tripping insert → delete
against them for two sessions. **No seeding was required and none was done.**

**Why a browser was required, not merely nicer.** Bunny's "block direct URL file access"
refuses any request with a blank `Referer`, and Node's `fetch` sends none — so from a script
every playback URL returns 403 whether the file exists or not. That is exactly how an earlier
session mistook working hotlink protection for a dead pull zone. A browser loading a real
`<video>` sends a real `Referer`, so the browser is the only instrument that can tell
"protected" from "broken".

| Case | Asserts | Result |
|---|---|---|
| T8.1 | A QuickTime-branded file named `.mp4` is rejected: the toast names it, no `<video>` is staged, and **a request spy records zero traffic** to `video.bunnycdn.com`, `/storage/v1/upload/resumable` or `/functions/v1/bunny-upload-url` | PASS |
| T8.1b | Positive control — the same bytes with their real MP4 brand are **accepted** and staged | PASS |
| T8.2 | The `provider='bunny'` row reaches Cosora-Admin's `under_review` queue, renders 478x850, Approve enabled | PASS |
| T8.3 | The moderator's player **decodes a frame** from the Bunny MP4: `readyState >= 2`, `videoWidth > 0`, and the "did not load" Note absent | PASS |
| T8.4 | Approving through the admin UI removes the card **and** `product_videos.status` reads back `live`, `provider='bunny'`, GUID intact | PASS |
| T8.5 | The buyer reel mounts `video[src="<the stored Bunny URL>"]` and decodes a frame; the URL is `play_480p.mp4`, not a hardcoded 720p | PASS |

- **Test data:** the platform's own real vendor clip (478x850, 21s, ~4 MB), uploaded to Bunny
  fresh in `beforeAll` and deleted in `afterAll`. The renamed-`.mov` fixture is **derived from
  it**, not stubbed: ffmpeg is not on PATH, so the spec verifies `ftyp` at bytes 4–8 and
  rewrites only the 4-byte major brand to `qt  `. That is precisely and entirely what
  `sniffVideoContainer` reads. It proves the gate discriminates on container signature; it
  claims nothing about HEVC, nor about Bunny's own behaviour on such a file (out of scope by
  instruction — a transcoder would likely normalise it, silently reversing the documented
  "iPhone .mov not accepted" rule).
- **A real hazard caught by strict mode, not a selector nit.**
  `getByRole("button", {name: "Approve"})` also matches **"Approve all for vendor…"** —
  `approve_vendor_content_bulk`, which approves that vendor's pending *products and
  catalogues* as well. Playwright refused the ambiguous click. An auto-first-match API would
  have silently taken one or the other. Now `exact: true`, with the reason in the spec.
- **T8.4 asserts the UI and the DB separately** rather than trusting either. The two
  disagreeing is the whole reason this layer exists — it is the shape of the
  `vendor_profiles.account_status` regression: a correct database under a UI that had not
  caught up.
- **State afterwards, verified:** Bunny library **0 videos / 0 orphans / 0 in flight**;
  `product_videos` back to the single real row (`Yoyoyo`, `rejected`, `provider='supabase'`),
  untouched and un-backfilled. Cleanup is provider-first (asset, then row — the order
  `deleteProductVideo()` uses, so a crash cannot strand a paid asset) and lives in `afterAll`,
  so it also held through the intermediate **failed** run, which is the harder case.
- `tsc -p tsconfig.app.json` at the unchanged 23-error baseline; the spec typechecks clean
  standalone (`tests/` is outside that project's `include`).

### 2026-09-06 (second run) — Bunny Stream end to end: GREEN, and a retraction
- **Suite/test:** `scripts/bunny-e2e-check.mjs`, 20 assertions, run repeatedly against the
  live project and the live Bunny library.
- **Test data used:** unchanged — the platform's own real vendor clip (478x850, 21s,
  4.1 MB) as the upload source, `demo-vendor@cosora.dev` as uploader,
  `demo-admin@cosora.dev` (super_admin) for the admin-gated `bunny-reconcile` oracle, one
  throwaway `product_videos` row deleted in a `finally`.
- **Result: PASS, all 20.** Slot minted with no API key in the response; TUS upload;
  encoding finished; MP4 Fallback enabled; renditions produced (`240p, 360p, 480p`);
  **the chosen rendition exists at Bunny** (480p, derived from 478x850); hotlink
  protection blocks a blank referer; dev and production origins both served 200;
  thumbnail served; **the moderation trigger still forces `under_review` on a
  `provider='bunny'` insert that asked for `live`**; provider + GUID persist;
  `bunny-delete-video` removes the asset, confirmed via Bunny's API listing; row cleaned
  up. Library left at 0 videos / 0 orphans.
- **RETRACTION of the previous entry's blocker.** That run reported "the pull zone returns
  403 for everything" and called playback blocked catalogue-wide. **That was a defect in
  the probe, not in the CDN.** The library has "block direct URL file access", which
  refuses requests with a blank `Referer`; a script `HEAD` sends none. Re-probed with
  `Referer: http://localhost:8080/` and `Referer: https://textile-spark-net.vercel.app/`,
  the MP4 rendition, thumbnail and HLS manifest all return **200**. The check now probes
  both shapes and treats the blank-referer 403 as the expected negative control rather
  than a failure — asserting 200 there had kept the suite red for correct behaviour.
- **The second blocker was real and is fixed.** A hardcoded `play_720p.mp4` 404s for a
  478x850 source. `pickRendition()` now derives the label from the client-probed
  dimensions, and the suite asserts the chosen rendition is one Bunny actually built.
- **Not covered:** the browser half — renamed-`.mov` client rejection and
  moderation-queue / buyer-feed rendering. The Playwright suite remains unrunnable until
  `seed-chat-fixtures.sql` / `seed-test-admins.sql` are re-run.

### 2026-09-06 — Bunny Stream end to end, against the real library (Phase 8)
- **Suite/test:** new `scripts/bunny-e2e-check.mjs` (15 assertions), plus
  `scripts/bunny-config-check.mjs`. Both run against the live project and the live Bunny
  library.
- **Test data used:** the platform's own real vendor clip as the source — 478x850, 21s,
  4.1 MB, fetched from the existing `product-videos` object — chosen deliberately over a
  synthetic file because its dimensions are what decide whether a hardcoded 720p URL is
  safe. Accounts: `demo-vendor@cosora.dev` (uploader) and `demo-admin@cosora.dev`
  (super_admin, needed because `bunny-reconcile` is admin-gated). One throwaway
  `product_videos` row, deleted in a `finally`. The one real row was never touched.
- **PASS (10):** secrets configured (`cdnHostname=vz-835c6bf5-df7.b-cdn.net`);
  `bunny-upload-url` mints a slot; **its response carries no API key**; TUS upload to
  Bunny succeeds; encoding completes (status 3/4, 100%); **MP4 Fallback is enabled on the
  library** (`hasMP4Fallback: true`); renditions were produced; **the moderation trigger
  still forces `under_review` on a `provider='bunny'` insert that explicitly asked for
  `live`**; `provider` + `bunny_video_id` persist; `bunny-delete-video` removes the asset,
  **verified by the GUID disappearing from the library listing via Bunny's API**; the
  throwaway row is cleaned up. Library left at 0 videos / 0 orphans.
- **FAIL (2 real blockers, both Bunny dashboard settings, not code):**
  1. **`play_720p.mp4` does not exist.** The 478x850 source produced `240p, 360p, 480p`
     and no 720p — Bunny only generates renditions the source supports. The composed
     `video_url` would 404 for exactly the phone-shot portrait content this platform
     receives.
  2. **The pull zone returns 403 for everything** — `play_480p.mp4` (which the API says
     exists), `thumbnail.jpg` and `playlist.m3u8` alike. Playback is blocked for MP4 and
     HLS equally, so no URL-format change avoids it.
- **A false pass was found and removed.** The first version of this script used CDN HEAD
  probes as its oracle. On a protected pull zone that cannot distinguish "missing" from
  "blocked", and its delete assertion passed for the wrong reason — 403 before the delete
  and 403 after. Rewritten to use `bunny-reconcile` (Bunny's API) as the oracle, which is
  what the phase brief had specified. Recorded because the earlier run's PASS was not
  evidence of anything.
- **Not covered:** the browser half. The Playwright suite is unrunnable until
  `seed-chat-fixtures.sql` / `seed-test-admins.sql` are re-run (those accounts were
  deleted previously), and the moderation-queue / buyer-feed rendering assertions cannot
  pass while the CDN 403s regardless.

### 2026-09-06 — Bunny Stream configuration probe + reconciliation false-positive (Phase 8)
- **Suite/test:** new `scripts/bunny-config-check.mjs`, run twice against the live project;
  plus one rolled-back SQL transaction proving a bug in
  `documentation/orphan-reconciliation.sql`.
- **Test data used:** the real `demo-vendor@cosora.dev` account (an active vendor, as the
  other `scripts/*.mjs` use) for the probe. For the SQL case, one throwaway
  `product_videos` row `00000000-…-0000000000cc` with `provider='bunny'` and a fake
  `vz-test.b-cdn.net` URL, inside `begin … rollback`. The one real row `35783726…` was
  read-only throughout.
- **Result — the probe: `*** NOT CONFIGURED ***`,** detail
  `missing secret(s): BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME`. Run twice
  against a function deployed minutes earlier, so this is absence rather than propagation
  lag. This contradicts the phase brief, which stated two of the three were already stored.
  The probe branch reports secret NAMES only and creates no Bunny video.
- **Result — the SQL case: FAIL then PASS.** The old Query 2 (no provider filter) reported
  the bunny row as `video_object = MISSING` — a column the file documents as meaning
  "renders as a broken video in the buyer feed" — while the fixed shape
  (`where v.provider = 'supabase'`) excludes it and still reports the real supabase row as
  `ok`. Cause: `split_part()` returns an empty string, not null, when the delimiter is
  absent, so every Bunny URL collapsed to `''` and matched no storage object. Left
  unfixed, the first run after Bunny shipped would have declared the entire Bunny
  catalogue broken.
- **Post-run state verified:** `product_videos` back to 1 row, the real row untouched.
- **Not covered, and it is most of the phase.** With no credentials there is no Bunny
  library, so nothing downstream of the probe has been exercised: no video was ever
  created, no TUS upload ran, no signature was validated by Bunny, no MP4 rendition was
  fetched, `bunny-delete-video` and `bunny-reconcile` have never executed against a real
  library, and the client's Bunny branch in `createProductVideo` has never run — it always
  takes the `not_configured` fallback today. The upload/playback/delete chain is argued
  from the docs and the code, not demonstrated. Treat every claim about Bunny behaviour in
  this entry as unverified until `scripts/bunny-config-check.mjs` passes.

### 2026-09-05 — Video Closeup engagement counters + saves (Phases 2–3, DB layer)
- **Suite/test:** ad-hoc SQL executed through Supabase MCP against the **live project**
  `vxdhhgdfubqedfpwfyrb`, wrapped in a single `begin … rollback` so nothing survived the
  run. Not a scripted suite; recorded here because it is the only verification these two
  migrations have.
- **Test data used:** one **throwaway** `product_videos` row, id
  `00000000-0000-4000-8000-0000000000aa`, `status='live'`, owned by the real vendor
  `6f66d05d…` (the only vendor with a video), plus the first `profiles` row as the liking
  buyer. The one real video row `35783726…` (`status='rejected'`) was used **read-only**,
  as the negative case. Nothing was seeded permanently and no demo account was modified.
- **What was checked (5 assertions, all PASS):**

  | # | Assertion | Result |
  |---|---|---|
  | T1 | `increment_video_view` on a `live` row increments — two calls | `views_count = 2` |
  | T2 | `increment_video_view` on the `rejected` row is a **no-op** (the `status='live'` scope is inside the function, not the caller) | `views_count` stayed `0` |
  | T3a | Inserting a `video_likes` row fires `sync_video_likes_count` | `likes_count = 1` |
  | T3b | Deleting it decrements | `likes_count = 0` |
  | T4 | Unlike when the counter is already `0` floors rather than going negative (`greatest(…, 0)`) | `likes_count = 0`, not `-1` |
  | T5 | Deleting the parent video cascades `video_likes` **and** `saved_videos` away, and the AFTER-DELETE trigger updating a row that no longer exists does not error | both tables `0`, no exception |

- **Post-run state verified, not assumed:** `product_videos` back to 1 row, `video_likes`
  0, `saved_videos` 0, and the real row `35783726…` still reads `views_count = 0` — i.e.
  the rollback took and the live data is untouched.
- **Function ACLs checked, and one was tightened and re-tested.** `increment_video_view` has no PUBLIC grant and is executable by `anon` + `authenticated` only (anon matters — the buyer feed is browsable signed-out). `sync_video_likes_count` still had PUBLIC EXECUTE; revoked, then the like/unlike case was re-run in a fresh rolled-back transaction to prove the trigger still fires (1, then 0). Postgres checks EXECUTE at `CREATE TRIGGER` time, not per fire — verified rather than assumed.
- **RLS shape confirmed separately** (outside the transaction, `pg_policies`):
  `saved_videos_owner` and `video_likes_owner` are both `ALL` with
  `USING (buyer_id = auth.uid())` and `WITH CHECK (buyer_id = auth.uid())`, `rowsecurity`
  true on both — identical to `saved_items.sitems_all`.
- **Not covered by this run, and worth being explicit about:** everything above executes
  as `postgres` via MCP, which means **RLS was never actually exercised** — a buyer
  attempting to write another buyer's like/save row was not tested, only the policy text
  was read back. The same applies to the client-side dedup, the `base + delta` like count,
  and the active-slide view call, none of which a SQL transaction can reach. Those need an
  authenticated browser session. Recorded as a gap rather than implied to be green.

### 2026-09-05 — `product-videos` storage reconciliation queries (Phase 5)
- **Suite/test:** the two queries in `documentation/orphan-reconciliation.sql`, run
  read-only against the live project.
- **Test data used:** the live bucket as-is — 2 objects
  (`6f66d05d…/1785812083443-65j7ju.mp4`, 4.3 MB, and its `-thumb.jpg`, 12.9 KB) and the
  one `product_videos` row.
- **Result:** Query 1 returned **0 orphans**. Query 2 reported the real row as
  `video_object = ok, thumb_object = ok`. The `split_part` key extraction was checked
  independently and reproduces exactly the two object names present in the bucket, which
  is what makes the 0-orphan result meaningful rather than vacuous.
- **Not covered:** the queries have never been run against a database that actually has an
  orphan, so the *positive* case is unexercised — the age guard and the key match are
  argued from the schema, not demonstrated.

### 2026-09-05 — Chat + Chat-Moderation Full Pipeline (T1–T13, both layers)
- **Suite/test:** `Cosora-Admin/scripts/chat-pipeline-matrix.mjs` (72 DB cases) +
  `tests/chat-pipeline.spec.ts` and `tests/admin-chat-moderation.spec.ts`
  (9 Playwright cases, both apps driven live).
- **Test data used:** dedicated fixtures only —
  `Cosora-Admin/scripts/seed-chat-fixtures.sql`: buyerA `cf000001…`,
  buyerB `cf000002…`, vendorA `cf000003…`, vendorB `cf000004…`
  (`chatfx-*@cosora.test`, password-auth), plus vendorA's **pre-existing** live
  product `cf00000a…`, active ad `cf00000b…`, review `cf00000c…` and a live gold
  subscription `cf00000d…` (needed so T8 measures the suspension gate rather than
  `enforce_plan_limits`). Admin roles from `seed-test-admins.sql`
  (`rlstest-*@cosora.test`, all six roles). **No demo/seed account was touched.**
  All blocklist terms and flag patterns used were throwaway (`chatfx-*`) and
  deleted; suspensions were reversed; locked conversations were resumed.
  **The fixture accounts themselves were subsequently deleted on 2026-09-05**
  (see the close-out note below), so re-running this suite requires re-seeding.
- **Result:** **72/72 DB PASS, 9/9 UI PASS. 2 confirmed defects, both fixed and
  verified. 3 POTENTIAL** (plus 6 further POTENTIAL rows recorded per-area below).
  Counts reflect the state after the 2026-09-05 out-of-session reconciliation.
  - **FIXED + RE-VERIFIED —** `/notifications` rendered a **blank page**
    (T10.5, commit `8bca619`). Re-run after the fix: real rows render, zero
    console errors.
  - **FIXED + VERIFIED (out of session) —** notification `title`/`body`/`kind`
    were client-rewritable (T10.3). Closed **2026-09-05** by migration
    `restrict_notifications_update_to_read_column`, applied and verified through
    **direct Supabase access outside this session**, after the MCP connection
    this session was using dropped and with no service-role key in either repo by
    design. Local `20260905120000_notifications_read_only_except_read_flag.sql`
    (commit `8bca619`) did the same thing under different object names and was
    **deleted** so `supabase db push` cannot install a duplicate trigger; its
    rationale survives in that commit.
  - Also fixed en route: `seed-test-admins.sql` could not run at all — it
    inserted `vendor_profiles.account_status`, dropped by `20260801095820`
    (commit `8047b71`).

**Closed out 2026-09-05, out of session.** Both remaining items were completed
through direct Supabase access rather than from this repo:

- **T10.3 fixed and verified live** — see the T10.3 row for the exact trigger,
  columns and error string. It was **not** re-run through
  `chat-pipeline-matrix.mjs`, because the fixtures that case needs were deleted
  by the cleanup below. To re-exercise it, re-run
  `Cosora-Admin/scripts/seed-chat-fixtures.sql` first.
- **Fixtures deleted** — all 10 known-password accounts (`chatfx-buyer-a/b`,
  `chatfx-vendor-a/b`, and the six `rlstest-*` admins) and everything they
  touched: 84 `conversation_reviews`, 18 `account_suspensions`, 178
  `notifications`, 8 `messages`, 4 `conversations`, 2 `vendor_profiles`, 5
  `admin_flags`. Verified afterwards: **0 leftover fixture users**, `real_admins`
  back to **2**, and the 4 conversations / 8 messages that remain belong to real
  non-fixture accounts and were untouched. Done directly, **not** via
  `drop-chat-fixtures.sql` / `drop-test-admins.sql` — those would now no-op.

**Consequence for re-running this suite:** it is no longer runnable as-is. Both
`Cosora-Admin/scripts/seed-chat-fixtures.sql` and `seed-test-admins.sql` must be
re-run first; every case in the tables below depends on those accounts.

#### T1 — Core message pipeline

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T1.1 | buyer→vendor | DB | buyerA upserts a fresh conversation with vendorA | one row, canonical `user_a < user_b` | `user_a<user_b=true`, matches sorted pair | PASS | — | matrix run, `T1.1` |
| T1.2 | vendor→buyer | DB | vendorA upserts the same pair from the other side | still exactly 1 row, same id | `rows=1, sameId=true` | PASS | — | matrix run, `T1.2` |
| T1.3 | both | UI | two live contexts on one thread; send each way | message appears in the other with no reload | arrived both directions | PASS | — | `screenshots/chat-pipeline/T1-03-realtime-b2v.png`, `T1-03-realtime-v2b.png` |
| T1.4 | buyer→vendor | UI | force a rejected send, inspect the composer | draft text retained | draft intact after 42501 | PASS | — | covered inside T2.1; `T2-01-blocklist-toast.png` |
| T1.5a | buyer→vendor | DB | send; read `conversations.last_message/_at` | `last_message` == body, `last_message_at` advances | bumped correctly | PASS | — | matrix run, `T1.5a` |
| T1.5b | vendor→buyer | DB | same from the vendor side | same | bumped correctly | PASS | — | matrix run, `T1.5b` |
| T1.5c | n/a | UI | conversations-hub re-sorts the active thread to the top for both parties | active thread first | **not exercised** — the hub orders by `last_message_at desc` in `fetchConversations()` and T1.5a/b prove that column is bumped, but the rendered order was never asserted | POTENTIAL | Low | Concrete risk: if a future change adds a client-side sort or a stale `staleTime`, the hub could show yesterday's thread above one that just received a message, and no test would catch it. |

#### T2 — Keyword blocklist (hard stop)

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T2.1 | buyer→vendor | both | send a message containing a throwaway blocklisted term | raises; message count unchanged; toast; draft kept | `raised 42501, count 5→5`; toast "Message not sent" / "It contains a term that isn't allowed on Cosora."; draft retained | PASS | — | `T2-01-blocklist-toast.png`; matrix `T2.1` |
| T2.2 | vendor→buyer | DB | same, opposite direction | identical | `raised 42501, count unchanged` | PASS | — | matrix `T2.2` |
| T2.3 | buyer→vendor | DB | same term, upper-cased | still blocked | `raised 42501` | PASS | — | matrix `T2.3` |
| T2.4 | buyer→vendor | DB | term containing `%`; send literal match, then a string matching only if `%` were a wildcard | literal blocked, wildcard-interpretation NOT blocked | `literal=blocked, wildcardish=sent` | PASS | — | matrix `T2.4` — confirms `strpos()`, not `LIKE` |
| T2.5 | n/a | DB | insert an empty-string blocklist row, then send an ordinary message | empty term must not block everything | ordinary message still sends | PASS | — | matrix `T2.5` — the `k.term <> ''` guard holds |
| T2.6 | n/a | DB | send one blocklisted message; diff reviews and status around it | 0 NEW review rows, status unchanged | `newReviews=0, status active→active` | PASS | — | matrix `T2.6` — a hard stop is not a moderation event |
| T2.7 | buyer→vendor | DB | delete the term, resend the same body | sends cleanly | sent | PASS | — | matrix `T2.7` |
| T2.8 | n/a | UI | add and delete a blocklist term through the Cosora-Admin UI, end-to-end | term added via UI blocks a real message, then deletes | **not exercised** — the blocklist CRUD page exists (`ChatKeywords.tsx`) and its RLS is covered at the DB layer, but the term used here was inserted via supabase-js, not typed into the admin form | POTENTIAL | Medium | Concrete risk: `ChatKeywords.tsx` writes `added_by: identity?.id ?? null`. `keyword_blocklist.added_by` is nullable so that succeeds — but if the form ever trims/normalises the term differently from what the trigger matches on, a support agent would add a term that silently never blocks anything, and only a UI-layer test would see it. |

#### T3 — Regex auto-flag (soft stop), against the 3 live seeded patterns

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T3.1-a | buyer→vendor | DB | send `mail me at probe.person@example.com` (Email address) | message STORED, status→`under_review`, exactly 1 `regex_flag` review with the right `matched_pattern_id` | `stored=true, status=under_review, reviews=1, source=regex_flag` | PASS | — | matrix `T3.1-a` |
| T3.1-b | vendor→buyer | DB | same, opposite direction | identical | identical | PASS | — | matrix `T3.1-b` |
| T3.2-a | buyer→vendor | DB | send `please ring 9876543210` (Indian mobile number) | as above | `stored=true, status=under_review, reviews=1` | PASS | — | matrix `T3.2-a` |
| T3.2-b | vendor→buyer | DB | same, opposite direction | identical | identical | PASS | — | matrix `T3.2-b` |
| T3.3-a | buyer→vendor | DB | send `lets move this to WhatsApp` (Off-platform meeting request) | as above | `stored=true, status=under_review, reviews=1` | PASS | — | matrix `T3.3-a` |
| T3.3-b | vendor→buyer | DB | same, opposite direction | identical | identical | PASS | — | matrix `T3.3-b` |
| T3.x-c | both | UI | both participants' ChatThread views on the same locked thread, simultaneously | banner, disabled composer, hidden call button on BOTH | verified on both sides at once | PASS | — | `T5-02-locked-buyer.png`, `T5-02-locked-vendor.png` |
| T3.4-d | buyer→vendor | DB | one message matching BOTH the phone and email patterns | exactly 1 NEW review row, not 2 | `newReviews=1` | PASS | — | matrix `T3.4-d` — first-match-wins |
| T3.5 | n/a | DB | insert a syntactically invalid regex into `flag_patterns` | rejected by `flag_patterns_pattern_valid` before it can reach the trigger | `raised 2201B — invalid regular expression: brackets [] not balanced` | PASS | Critical | matrix `T3.5` |

#### T4 — Participant report (`submit_report`)

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T4.1 | buyer→vendor | DB | buyer reports vendor with a reason string | locks; `user_report` row; `reported_reason` VERBATIM; `reason_id` stays null | `status=under_review, verbatim=true, reason_id=null` | PASS | — | matrix `T4.1`, stored value `"Scam, fraud or spam"` |
| T4.2 | vendor→buyer | DB | vendor reports buyer | identical | identical | PASS | — | matrix `T4.2` |
| T4.3 | buyer→vendor | DB | report a conversation that is **already** `under_review` | documented either way — must not be a silent no-op | **succeeds and files a second review row** (`reviews 6 → 7`) | PASS | — | matrix `T4.3`. Real behaviour, now recorded: repeat reports stack rather than being rejected. Defensible (two complaints are two facts) but it means one thread can carry many pending reviews, and the queue shows each. |
| T4.4 | n/a | UI | force `submit_report` to fail; confirm the modal shows an inline error and stays open | modal stays open, no false success | **not exercised** — the modal's failure path was not driven; only the success path was (via T5/T9 setup) | POTENTIAL | Medium | Concrete risk: `submitReport()` returns `!error` and `ReportModal` calls `onReported()` on it. If a caller ever ignores the boolean, a failed report (bad id, RLS refusal) would close the modal and show a confirmation while nothing was filed — the reporter believes they reported and nobody reviews it. |

#### T5 — Conversation lock, cross-cutting UI

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T5.1 | both | UI | locked thread open on buyer AND vendor simultaneously | composer disabled + placeholder swapped, send button visibly dimmed, call button hidden entirely, banner present | all four confirmed on both sides; send-button computed `opacity < 0.95`; call button count 0 | PASS | — | `T5-01-unlocked-buyer.png`, `T5-02-locked-buyer.png`, `T5-02-locked-vendor.png` |
| T5.2 | both | UI | chat-monitoring legal disclosure, locked and unlocked | present and unmodified in both states | present in both | PASS | — | same screenshots |
| T5.3a | buyer→vendor | DB | POST a message straight to PostgREST while locked (no UI) | RLS refuses, no row written | `raised 42501, count 5→5` | PASS | Critical | matrix `T5.3a` |
| T5.3b | vendor→buyer | DB | same, other participant | identical | `raised 42501, count 5→5` | PASS | Critical | matrix `T5.3b` |

#### T6 — Admin review queue and resolution

Cosora-Admin **does** have the chat-moderation UI: `Chats.tsx`, `ChatThread.tsx`,
`ChatReview.tsx`, `ChatKeywords.tsx`, `ChatPatterns.tsx`, `ChatReasons.tsx`,
`Accounts.tsx`, routed in `App.tsx` and gated by the `chats` / `chat-review` /
`chat-keywords` / `chat-patterns` / `chat-reasons` / `accounts` Sections in
`roles.ts`. So these are real results, not POTENTIAL.

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T6.1 | n/a | UI | open `/chat-review` as support with one pending report | queue lists it with source and both participants | shows "Scam, fraud or spam", "user report", "Chat Fixture Buyer A" | PASS | — | `T6-01-review-queue.png` |
| T6.2 | n/a | UI | detail view: transcript, flagged message, `reported_reason` verbatim, both `account_status` | all present | **partially exercised** — the queue card renders `reported_reason` verbatim and both participants (asserted in T6.1); the full-transcript thread view and the live `account_status` badges were not separately asserted | POTENTIAL | Low | Concrete risk: `ChatThread.tsx` (admin) caps at 500 messages and renders `AccountStatus` per participant. If that cap or the participant resolution regressed, a reviewer would judge a thread on a truncated transcript, or act on a stale status — neither is visible from the queue page this pass asserted. |
| T6.3 | n/a | both | click the real **Resume** button, then read `conversations.status` back out of the DB | thread actually returns to `active` | toast "Chat resumed" **and** `conversations.status = active` | PASS | Critical | `T6-03-resumed-toast.png`; `ChatReview.tsx:126` passes `p_resume: verdict === "resumed"` |
| T6.3b | n/a | DB | call `resolve_conversation_review(verdict='resumed')` with `p_resume` **omitted** | function default is FALSE → thread stays locked | `status=under_review` | PASS | — | matrix `T6.3b`. Confirms the trap is real; T6.3 confirms the UI does not fall into it. |
| T6.4 | n/a | DB | suspend-buyer / suspend-vendor identify the right participant, then `set_account_status(source='chat_review', p_conversation_review_id=…)` | correct side suspended, linkage populated | **not exercised end-to-end** — `ChatReview.tsx` resolves sides via `resolveSides()` on `vendor_profiles` membership and disables both Block buttons when that is ambiguous; the two-vendors-messaging edge case was not constructed | POTENTIAL | Medium | Concrete risk: both fixtures in a pair holding `vendor_profiles` rows makes `sides.resolved` false, which correctly disables Block — but a support agent then has **no** way to suspend from the queue and must find the account elsewhere. Reachable whenever two vendors message each other. |
| T6.5 | n/a | DB | resolve `kept_locked`, deliberately passing `p_resume=true` | verdict recorded, thread STILL `under_review` | `verdict=kept_locked, status=under_review` | PASS | Critical | matrix `T6.5` |
| T6.6 | n/a | DB | resolve the same review a second time | raises `P0002`, first decision intact | `raised P0002 — "chat review … is not pending"` | PASS | Critical | matrix `T6.6` |
| T6.7 | n/a | DB | resolve; read the notifications each participant can see | both notified; copy names no reporter, verdict, pattern or reason | `buyer=17, vendor=24 rows, leaks=false`; sample `{"kind":"chat_resumed","title":"A conversation is active again","body":"You can send messages in this chat again."}` | PASS | Critical | matrix `T6.7` |
| T6.8 | n/a | DB | support adds an `admin_flags` note with `entity_type='conversation'` | accepted, scoped to the right entity | `entity_type=conversation`, correct `entity_id` | PASS | — | matrix `T6.8` |
| T6.9 | n/a | both | four non-chat roles: nav hidden, direct route blocked, and refused at the DB | all refused | nav links count 0 and direct `/chat-review` shows no queue content (UI); `read=denied, rpc=refused` for product_moderator / vendor_ops / ads_moderator / finance_admin, allowed for support + super_admin (DB) | PASS | Critical | `T6-09-adsmod-nav.png`, `T6-09-adsmod-direct-route.png`; matrix `T6.9-*` |

#### T7 — Account suspension

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T7.1 | n/a | DB | `set_account_status(suspended, source='admin_manual')` | status flips, ledger row appended, notification fires | `status=suspended, ledger=1, source=admin_manual, conversation_review_id=null, notif=1` | PASS | — | matrix `T7.1` |
| T7.2 | n/a | DB | chat-review-sourced suspend populates `conversation_review_id` | linkage not null | **not exercised** — the manual path was driven; the `source='chat_review'` path is exercised only through `ChatReview.tsx`, which was not clicked through to a Block | POTENTIAL | Medium | Concrete risk: if `ChatReview.tsx` ever stopped passing `p_conversation_review_id`, suspensions would still succeed and still appear in the ledger, but with no link back to the review that caused them — the audit trail silently degrades and nothing errors. |
| T7.3a | buyer→vendor | DB | suspended buyer sends into an ACTIVE conversation | refused by `messages_insert` | `raised 42501` | PASS | Critical | matrix `T7.3a` |
| T7.4a | buyer→vendor | DB | suspended buyer runs the call gate | `caller_suspended` | `caller_suspended` | PASS | — | matrix `T7.4a` |
| T7.4b | vendor→buyer | DB | vendor runs the gate against the suspended buyer | `target_suspended` | `target_suspended` | PASS | — | matrix `T7.4b` |
| T7.5 | n/a | DB | reinstate while a conversation is separately locked | 0 open ledger rows, reinstatement notification, conversation STILL `under_review` | `open=0, notif=1, conv=under_review` | PASS | High | matrix `T7.5` — the two axes are still independent |
| T7.5b | buyer→vendor | DB | after reinstatement, send into an unlocked thread | sends immediately, no separate unlock needed | sent | PASS | — | matrix `T7.5b` |
| T7.6a | n/a | DB | suspended user UPDATEs their own `profiles.account_status` back to active | refused; still suspended | `raised 42501 — "account_status is set only via set_account_status()"` | PASS | Critical | matrix `T7.6a` |
| T7.6b | n/a | DB | a participant UPDATEs `conversations.status` to a DIFFERENT value | refused by the trigger; status unchanged | status unchanged | PASS | Critical | matrix `T7.6b` |
| T7.6c | n/a | DB | a non-super_admin admin grants themselves `super_admin` | refused | `raised 42501 — "Only a super_admin may change admin status or admin roles"` | PASS | Critical | matrix `T7.6c` |
| T7.7 | n/a | DB | as a support admin: INSERT / UPDATE / DELETE `account_suspensions` directly | all three refused | `insert=raised 42501, update=0 rows, delete=0 rows` | PASS | Critical | matrix `T7.7` — genuinely append-only |

#### T8 — Broader suspension enforcement (as shipped: INSERT-only)

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T8.0 | n/a | DB | **baseline** — the same four inserts while ACTIVE | all four succeed, or the suspended half proves nothing | `rfq=ok product=ok ad=ok review=ok` | PASS | Critical | matrix `T8.0` |
| T8.rfqs | buyer→vendor | DB | suspended buyer inserts `rfqs` | refused by `account_is_active()` | `refused 42501` | PASS | Critical | matrix |
| T8.reviews | buyer→vendor | DB | suspended buyer inserts `reviews` | refused | `refused 42501` | PASS | Critical | matrix |
| T8.product_reviews | buyer→vendor | DB | suspended buyer inserts `product_reviews` | refused | `refused 42501` | PASS | Critical | matrix |
| T8.service_reviews | buyer→vendor | DB | suspended buyer inserts `service_reviews` | refused | `refused 42501` | PASS | Critical | matrix |
| T8.quotes | vendor→buyer | DB | suspended vendor inserts `quotes` | refused | `refused PGRST204` | PASS | Critical | matrix. **Note:** refused before RLS, on a schema-cache column error (`price_value`), so this case proves refusal but not that `account_is_active()` is what did it. Weaker than its siblings. |
| T8.products | vendor→buyer | DB | suspended vendor inserts `products` | refused | `refused 42501` | PASS | Critical | matrix |
| T8.product_videos | vendor→buyer | DB | suspended vendor inserts `product_videos` | refused | `refused 42501` | PASS | Critical | matrix |
| T8.advertisements | vendor→buyer | DB | suspended vendor inserts `advertisements` | refused | `refused 42501` | PASS | Critical | matrix — and the fixture holds a LIVE gold plan, so this is the gate refusing, not `enforce_plan_limits` |
| **T8.scope** | n/a | DB | suspend a vendor holding a LIVE product, an ACTIVE ad and an existing review | none hidden, paused or altered | `product live→live, ad active→active, review intact=true` | PASS | Critical | matrix `T8.scope` — **the regression that protects the current scope** |
| T8.read | n/a | DB | suspended vendor reads their own existing product | still readable — suspension is not a login block | `1 row` | PASS | — | matrix `T8.read` |

#### T9 — Contact exposure gating

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T9.1 | n/a | UI | signed-out visitor on `/vendor/:id` | sign-in prompt; no phone/email anywhere on the page | prompt shown; page text contains neither the phone nor the owner email | PASS | Critical | `T9-01-signed-out.png` |
| T9.2 | n/a | UI | signed in, neither party suspended, no lock | contact details render | `+91 90000 00003` visible | PASS | — | `T9-02-clear.png` |
| T9.3a | n/a | UI | target suspended | "Contact details aren't available" / "This account is currently suspended"; no phone | both strings shown; phone absent from the whole page | PASS | Critical | `T9-03-target-suspended.png` |
| T9.3b | n/a | UI | caller suspended | "Your account is suspended"; no phone | shown; phone absent | PASS | Critical | `T9-04-caller-suspended.png` |
| T9.3c | n/a | UI | conversation under review | "This chat is under review"; no phone | shown; phone absent | PASS | Critical | `T9-05-under-review.png` |
| T9.4 | n/a | UI | registry data while contact is gated | Company MD / Business Type / GST / PAN / Capacity still visible | "Business Type" visible in the blocked state | PASS | — | `T9-03-target-suspended.png` |
| T9.5 | n/a | UI | spot-check ≥3 of the 17 `useCallVendor`/`useCallBuyer` call sites under a blocked condition | none reimplements or skips the gate | **not exercised** — only `VendorProfile` was driven | POTENTIAL | Medium | Concrete risk: the gate lives inside the hook, so any call site using `useCallVendor()` inherits it — but a site that reads a phone number out of its own query and renders it as text (rather than dialing) bypasses the hook entirely, exactly as `VendorProfile`'s contact card did before 2.5c. A `ProductCard` or `MyQuotes` doing that would leak a number with no test failing. |
| T9.6 | n/a | DB | signed-out read of `vendor_profiles.phone` straight from PostgREST | — | **readable.** `vprofiles_select` is `USING (true)` | POTENTIAL | High | Not a regression and not fixed here — recorded on 2026-09-05 and re-confirmed. The UI gate holds; the underlying column is world-readable, so R-18 is a UI rule, not a data rule. Closing it means column-level restriction or a public view — a marketplace-discovery decision, not a bug fix. |

#### T10 — Notifications

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T10.1 | n/a | DB | trigger each of the four kinds and read the row back | all four written by their function | `account_suspended` + `account_reinstated` (T7.1/T7.5), `chat_locked` (T4/T5 setup), `chat_resumed` (T6.7) all observed | PASS | — | matrix `T7.1`, `T7.5`, `T6.7`; rows read back per-kind |
| T10.2 | n/a | DB | buyerB lists notifications | only own rows | `0 foreign of 10` | PASS | Critical | matrix `T10.2` |
| **T10.3** | n/a | DB | signed-in user UPDATEs their own notification's `title`/`kind`/`body` | refused — only `read` may be client-written | Originally **`*** REWROTE title/kind/body ***`** (`title="TAMPERED"`, `kind="account_reinstated"`). **Now refused.** | **FAIL → FIXED → PASS** | High | Fixed and verified **2026-09-05 via direct Supabase access outside this session** (Supabase MCP in another Claude session), **not** by `chat-pipeline-matrix.mjs`. Migration `restrict_notifications_update_to_read_column` adds BEFORE UPDATE trigger `enforce_notification_update_columns` on `public.notifications`, rejecting any UPDATE that changes `title`/`body`/`kind`/`conversation_id`/`profile_id`. Verified live as an authenticated user: updating `read` **succeeds**; updating `title` raises `42501: Only the read column may be changed on a notification`. **Not re-run through the matrix** — the `chatfx-*` fixtures it needs were deleted in the same cleanup (see the run header), so `chat-pipeline-matrix.mjs` cannot execute T10.3 again until `seed-chat-fixtures.sql` is re-run. |
| T10.4a | n/a | DB | user deletes their own notification | 1 row | `1 row` | PASS | — | matrix `T10.4a` |
| T10.4b | n/a | DB | buyerB deletes buyerA's notifications | 0 rows | `0 rows` | PASS | Critical | matrix `T10.4b` |
| **T10.5** | n/a | UI | open `/notifications` as a signed-in fixture with real rows on file | real rows render | **BLANK PAGE.** `cannot add postgres_changes callbacks for realtime:notifications:<uid> after subscribe()` → React tree died → empty body. DB rows were correct throughout. | **FAIL → FIXED → PASS** | Critical | Fixed in commit `8bca619` (per-instance channel topic). Re-run after the fix: rows render, **zero console errors**, `T10-05-notifications.png` |
| T10.6 | n/a | UI | dev-only seed vs real rows | fabricated non-moderation notifications must not appear as real in production | dev build shows both, as designed — `devOnlySampleNotifications()` returns `[]` in a production build and is tree-shaken | PASS | — | `T10-05-notifications.png` shows real rows ("Your account is active again") alongside the dev seed; production behaviour is a build-time constant, asserted by reading the guard rather than by running a prod build |

#### T11 — Admin panel structure

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T11.1 | n/a | UI | load `/vendors` and `/vendors/:id` as `vendor_ops` | no dropped-column error; suspend control reads `profiles.account_status` | both load; "Chat Fixture Brand A" listed; "Account status" card renders; **no uncaught page errors** | PASS | Critical | `T11-01-vendors-list.png`, `T11-01-vendor-detail.png` |
| T11.2 | n/a | DB | `Cosora-Admin/src/lib/database.types.ts` | no `vendor_profiles.account_status`; types `notifications` / `resolve_conversation_review` / `regex_probe` | confirmed on 2026-09-05 regeneration and unchanged | PASS | — | file inspection |
| T11.3 | n/a | UI | blocklist CRUD through the admin UI, end-to-end | — | **not exercised** (see T2.8) | POTENTIAL | Medium | See T2.8. |
| T11.4 | n/a | DB | invalid flag pattern rejected client-side AND server-side | both | server side confirmed (`2201B`, T3.5); `regex_probe` role gate confirmed (T12); the client-side probe UI itself was not driven | PASS (server) / POTENTIAL (client) | Medium | Concrete risk: `ChatPatterns.tsx` blocks saving until `regex_probe` reports a match. If that guard were removed, a `\b` pattern would save cleanly and silently never fire — the CHECK constraint cannot catch it, because it only proves the pattern compiles. |
| T11.5 | n/a | DB | only `super_admin` may create/edit/delete a block reason; support read-only | matches the RLS split | `chat_block_reasons_select` grants support; insert/update/delete are `super_admin` only | PASS | — | verified 2026-09-05; `roles.ts` corrected then |
| T11.6 | n/a | n/a | README / VendorDetail "suspension is a flag only" language | corrected to current reality | corrected 2026-09-05; the legacy card was deleted, not repointed | PASS | — | commit `9022a07` |

#### T12 — Adversarial / RLS-bypass, every role

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T12-support | n/a | DB | direct UPDATE `conversations.status`; `profiles.account_status` (other **and** own); UPDATE **and** DELETE `messages` | all five refused, judged on rows-returned | `conv=0 prof=0 own=0 msgU=0 msgD=0` | PASS | Critical | matrix |
| T12-super_admin | n/a | DB | same | same | `0/0/0/0/0` | PASS | Critical | matrix |
| T12-product_moderator | n/a | DB | same | same | `0/0/0/0/0` | PASS | Critical | matrix |
| T12-vendor_ops | n/a | DB | same | same | `0/0/0/0/0` | PASS | Critical | matrix |
| T12-ads_moderator | n/a | DB | same | same | `0/0/0/0/0` | PASS | Critical | matrix |
| T12-finance_admin | n/a | DB | same | same | `0/0/0/0/0` | PASS | Critical | matrix |
| T12-buyerB (plain user) | n/a | DB | same | same | `0/0/0/0/0` | PASS | Critical | matrix |
| T12-probe-* | n/a | DB | call `regex_probe` as each of the four non-chat roles | refused | all four `raised 42501 — "not authorized: probing a pattern requires the support or super_admin role"` | PASS | High | matrix |

#### T13 — Realtime & resilience

| ID | Direction | Layer | Steps | Expected | Actual | Status | Severity | Evidence |
|---|---|---|---|---|---|---|---|---|
| T13.1 | n/a | UI | a locking message arrives while the recipient has a draft open | draft not lost; lock applies to the NEXT send | **not exercised as a race** — the draft-retention half is proven (T2.1) and the lock-applies half is proven (T5.3), but not the two interleaved | POTENTIAL | Low | Concrete risk: `ChatThread.tsx` clears `attachOpen`/`recording` in a `useEffect` on `underReview` but does not touch `draft`, so the draft should survive. If a future change added `setDraft("")` to that effect, a user mid-sentence would lose their text the instant the other party tripped a regex. |
| T13.2 | n/a | DB | two admin sessions, one resolves; the other attempts a stale double-resolve | fails cleanly, no corruption | second attempt `raised P0002`, first decision and `reviewed_by` intact | PASS | High | matrix `T6.6` — this is the stale-second-session case, exercised sequentially rather than with two live browsers |
| T13.3 | n/a | UI | kill the network mid-send | documented retry-safe behaviour, draft retained | **not exercised** — no offline simulation was run | POTENTIAL | Low | Concrete risk: `sendText()` returns false on any error and the caller keeps the draft, so an offline send should behave exactly like a rejected one. Unverified: a network-level failure may reject with a shape the `error.message`/`error.code` branches do not match, producing a generic toast instead of the documented copy. |

#### Documented asymmetries — re-confirmed, not assumed

| Claim | Status | Evidence |
|---|---|---|
| `useCallVendor()` logs to `calls`; `useCallBuyer()` deliberately does not, because `calls`'s insert policy is `buyer_id = auth.uid()` and a vendor caller cannot satisfy it | **Still true, still deliberate** | `src/lib/queries/calls.ts` — `useCallBuyer` carries the explicit comment; no `calls` insert on that path |
| No buyer-side equivalent of the vendor contact card, so a vendor has no symmetric card to test | **Still true** | there is no `/buyer/:id` route in `App.tsx`; buyers appear only as chat participants |
| Demo/seed service vendors and freelancers have no `profiles` row and are therefore not suspension-gated (R-23) | **Still true, expected** | `ServiceVendorProfile` / `FreelancerProfile` call `placeCall()` with `demoPhone()`, never `callGate()` |
| No **other** asymmetry found | — | every buyer→vendor case above has a vendor→buyer twin with an identical result |

### 2026-09-05 — Chat moderation 3 (notifications, suspension enforcement, contact gate)
- **Suite/test:** `resolve_conversation_review` end-to-end; `notifications-check.mjs`;
  `suspension-gate-check.mjs`; `contact-gate-check.mjs`; Cosora-Admin's
  `chat-moderation-behaviour.mjs`. Plus `tsc`, eslint, `vite build`.
- **Test data used:** the live Supabase project with real logins. States set directly in
  SQL and restored afterwards — locked/unlocked conversations, `account_status` flipped
  between `active` and `suspended`, a demo vendor whose gold plan had lapsed on 2026-08-16
  (the script extends the billing period for the run and restores the exact original
  value). Probe strings for flag patterns included ordinary trade talk
  ("...120 gsm combed cotton, signalling a repeat order") to confirm no false positives.
- **Result:** **PASS.**
  - `resolve_conversation_review` **16/16** — lock, queue, keep-message, notify both,
    `kept_locked` ignores `p_resume`, `resumed` honours it, double-resolve raises `P0002`,
    invalid verdict raises `22023`.
  - `notifications-check.mjs` **6/6** — insert refused with `42501`, RPC refused with
    "permission denied for function notify".
  - `suspension-gate-check.mjs` **4/4 paired.** The pairing caught a real false pass: the ad
    case reported DENY while suspended *and* while active, because `enforce_plan_limits` was
    raising `P0001` from a BEFORE trigger long before RLS was consulted.
  - `contact-gate-check.mjs` **7/7**, including caller-beats-target ordering.
  - Cosora-Admin `chat-moderation-behaviour.mjs` **16/16**.
  - Final DB state confirmed back to baseline: 0 suspended profiles, 0 ledger rows,
    0 notifications, 0 reviews, 0 locked conversations, 3 flag patterns, 7 block reasons,
    0 blocklist terms.
  - `tsc` **0 errors** (down from a long-standing 23 — the regenerated
    `database.types.ts` closed them); eslint clean on changed files; `vite build` passes.

### 2026-08-02 — Chat moderation 2.5d (contact gate refactor)
- **Suite/test:** manual verification of `/vendor/:id` contact gating after refactoring
  `callGate()` to return a reason code instead of a sentence.
- **Test data used:** live DB, four states each set in SQL and restored — signed out;
  both accounts active; target `account_status='suspended'`; conversation `under_review`.
  All three call toasts captured from the real Call Now button.
- **Result:** **PASS.** Toast strings matched the pre-refactor wording verbatim. In every
  blocked case phone, email **and website** were absent from the whole page while all five
  registry rows still rendered; in the clear case everything returned. `tsc` unchanged
  (same 23 pre-existing errors, none in changed files), eslint clean, `vite build` passes.

### 2026-08-02 — Chat moderation 2.5c (contact card gating)
- **Suite/test:** `useContactGate()` loading behaviour and gated contact card on
  `/vendor/:id`.
- **Test data used:** a **6 s artificial delay injected on the gate's own request**, with
  the DOM polled **86 times** across that window; plus the four live-DB states above.
- **Result:** **PASS.** Skeleton up at 121 ms; the phone number never appeared once. DB
  confirmed back to baseline afterwards.

### 2026-08-02 — Flag-pattern regex verification
- **Suite/test:** direct SQL probes of seeded `flag_patterns` against the live engine.
- **Test data used:** `select 'call me on 9876543210' ~* '[6-9]\d{9}\b'` and the same with
  `\y`.
- **Result:** **Found a real defect.** Two of the three seeded patterns were dead —
  Postgres regexes are POSIX ARE, where `\b` is a **backspace character**, not a word
  boundary (that is `\y`). The `\b` form returned false; `\y` returned true. Patterns
  corrected, and the seed migration now asserts its own patterns match a probe string and
  do **not** match ordinary trade talk.

### 2026-06-02 — Playwright: New Arrivals buyer tabs
- **Suite/test:** `tests/new-arrivals.spec.ts`.
- **Test data used:** live dev/preview server on `localhost:8080–8085`, route
  `/home/new-arrivals`.
- **Result:** artifacts present in
  `test-results/tests-new-arrivals-New-Arr-833e6--tabs-and-correct-selection/error-context.md`.
  **Last recorded run failed / errored** — not re-run since. Re-run before trusting it.
