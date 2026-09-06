# Test Log & Test Suites

Updated automatically whenever a test is written or run.

Last updated: 2026-09-07

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
