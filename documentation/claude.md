# Cosora — Project Memory (read this first, every session)

Last updated: 2026-09-07

## What Cosora Is

Cosora is a **three-sided B2B sourcing marketplace for India's fashion and textile
industry**, connecting **Buyers** (brands, retailers, designers, wholesalers, sourcing
managers and buying houses), **Vendors** (manufacturers, mills, fabric suppliers, service
providers such as printers and logistics firms, and freelancers like pattern makers and
CLO 3D artists), and an **Admin** layer (Cosora's own ops team). It replaces a fragmented
offline sourcing process — WhatsApp threads, brokers, trade fairs and personal contacts —
with a single trust-and-discovery platform where deals are initiated, negotiated and
tracked: vendors list products and run ads, buyers post RFQs and receive comparable quotes
from multiple suppliers, and admin verifies, moderates and monetises the whole thing. Think
of it as the infrastructure layer between a fabric mill in Surat and a fashion brand in
Delhi. It runs as one unified web app in which the same person can toggle between the
Vendor and Buyer experience.

## Business Rules — Predefined

Rules decided before or outside of Claude Code sessions.

### Legal & compliance
- **Chat monitoring disclosure** — "We'll be monitoring the messages" (or similar) is
  **legally required** in all chat flows. Never remove or hide it.
- **Product moderation** — all product listings go through admin moderation before going
  live (24–48 hours).

### Locale
- **Currency & timezone** — default to **INR** and **IST** for all Indian users.

### Product / UX rules
- **Role toggle placement** — the "Switch to Buyer/Seller" toggle appears **only** on the
  Vendor Dashboard Home and the Buyer Homepage. Nowhere else.
- **Authentication is OTP-only** — phone number + one-time password, no passwords. Google
  OAuth is a secondary option. A vendor-first user lands on the vendor dashboard after
  login; a buyer-first user lands on the buyer homepage. Vendor → Buyer is a direct toggle;
  **Buyer → Vendor requires completing full vendor onboarding first.**
- **"Video Closeups", never "Reels"** — product videos in the buyer feed are called Video
  Closeups. Deliberate brand/product naming decision.
- **Audio-first matters** — many Indian manufacturers are more comfortable speaking than
  typing. Audio messages in chat and voice-to-text in the RFQ form are critical for the
  real user base, not nice-to-haves.
- **Subscription tiers (Basic / Silver / Gold)** determine vendor lead volume, product
  listing caps, and geographic ad reach.

### Brand colours
| Usage | Hex |
|---|---|
| Vendor primary CTA, links, blue states | `#256fef` |
| Buyer primary CTA, alerts, Switch-to-Buyer banner | `#EF4D62` |
| Success, verified, accepted states | `#14ae5c` |
| Borders, inactive, placeholder | `#d0d4dc` |
| Body text, headings | `#363636` |

### Engineering conventions treated as product rules
- **Image imports must use ES module syntax** — `import img from "@/assets/image.png"`,
  never a file-path string.
- **Layout wrappers are role-specific** — every **vendor** page wraps in `DashboardLayout`;
  every **buyer** page uses `BuyerShell`. Putting `DashboardLayout` on a buyer route
  double-stacks the top bar.

## Business Rules — Discovered/Decided During Development

Rules that emerged while building. Append here the moment one is settled — never leave one
undocumented. Deep technical rationale for each lives in
`documentation/technicalimplementation.md`.

- **The admin side exists and is built — in a separate repo.** `Cosora-Admin` runs against
  the same Supabase project and owns some of this project's migrations. Older notes
  claiming "admin is not designed or built" are stale.
- **Vendors must never be able to publish straight to the buyer feed.** Products *and*
  videos default to `under_review`; the transition to `live` is enforced by a BEFORE
  trigger, not by client convention and not by RLS alone.
- **Moderation must be reviewable.** A hard blocklist stop leaves no trail, so
  `keyword_blocklist` is deliberately **empty** and stays that way until a human names a
  term; pattern flags keep the message and lock the thread instead, so support can read it.
- **Moderation notices never identify the reporter, the matched pattern, the verdict or the
  reason.** A report notice is deliberately identical to a pattern-triggered lock — in a
  two-person thread, saying "a report happened" names the reporter by elimination.
- **A lock must be unlockable.** Locked conversations can be resumed only via the
  `resolve_conversation_review` RPC; a verdict defaults to leaving the thread locked and the
  reviewer opts in to reopening.
- **Suspension blocks content *creation*, not existing content.** A suspended account cannot
  create RFQs, quotes, products, videos, ads or reviews — but live content stays up, a
  running ad campaign keeps serving, and an in-progress session is not ended. A suspended
  vendor can still delete their own videos.
- **Suspension is account-level, not vendor-level** — the same human toggles between buyer
  and vendor, so a vendor-table flag could not stop them messaging as a buyer.
- **Media is rationed by the Supabase Free plan.** 5 GB/month egress is shared org-wide
  across database, auth and storage; exceeding it 402s the whole app. Video uploads are
  capped at 50 MB / 60 s, review photos at 4 photos / 2 MB.
- **iPhone `.mov` is deliberately not accepted** (HEVC plays on Safari, fails on
  Chrome/Android, and there is no transcoding step). A renamed `.mov` is now caught
  client-side by a magic-byte check on the ISO-BMFF major brand (`qt  ` = QuickTime) —
  a stopgap for the accidental case, not a security control; HEVC inside a genuine MP4
  container still passes and needs a real transcoder to reject.
- **Raising the video size cap has a dashboard-first ordering that cannot be skipped.**
  See "Raising MAX_VIDEO_BYTES" below. A bucket's `file_size_limit` can never exceed the
  project's global limit, so bumping the bucket or the client constant before raising the
  global limit in the dashboard silently does nothing.
- **No mock data in production.** Dev-only helpers return `[]` in a production build; an
  empty catalogue is meant to render empty. Do not seed demo rows to "fix" an empty state.
- **A view is monotonic; a like is a toggle. They are modelled differently on purpose.**
  Views go through a SECURITY DEFINER `increment_video_view(uuid)` scoped to
  `status='live'` (mirroring `increment_product_view`) — a buyer owns no video row, so the
  +1 cannot be a client UPDATE. Likes get a per-buyer join table (`video_likes`) with
  `product_videos.likes_count` maintained by an AFTER trigger, because a counter-only RPC
  gives no way to undo a like and no source of truth for *who* liked. Same reasoning made
  `saved_videos` a table rather than a column.
- **Durably saved ≠ interested this session.** `saved_videos` is what the buyer chose to
  keep; the in-session `bookmarkedVideoIds` set is what caught their eye in the last few
  minutes, and only the second one feeds `rankVideoCloseUps`. Hydrating stored saves into
  the ranking signal would let a save from six weeks ago reshuffle today's reel.
- **A rejection reason must reach the vendor.** `reject_vendor_content` stores it and the
  BEFORE trigger protects it, but it is only meaningful read together with
  `status = 'rejected'` — a resubmitted row keeps the old note until an approve clears it
  (`approve_vendor_content` nulls it as of 20260905172020). Every surface that renders it,
  vendor- or admin-side, gates on the status as well as the column.
- **The Bunny API key is the only credential in this codebase that a server must
  hold on the client's behalf.** Bunny's TUS upload is authorised by
  `SHA256(library_id + api_key + expiration + video_id)`, which cannot be computed in
  a browser without shipping the key, so `bunny-upload-url` is the first signed-URL
  edge function here — every other upload goes browser→Supabase Storage under RLS.
  The **Library ID is not a secret and cannot be one**: Bunny requires it as a plain
  `LibraryId` header on the client's own request and it appears in every playback URL.
- **An unconfigured provider must fall back, not fail.** `bunny-upload-url` returns
  `not_configured` as a **200** (the razorpay-create-order convention) and
  `createProductVideo` then takes the original Supabase Storage path. That keeps
  uploads working before Bunny is wired up — but it is SILENT, so
  `node scripts/bunny-config-check.mjs` and the provider census in
  `documentation/orphan-reconciliation.sql` are how you tell whether the migration
  actually happened.
- **Video placeholders ship in the bundle, never hotlinked.** The reel's poster is on the
  critical path of every card and is what the `<video>` paints under before the first
  frame decodes; a third-party image host there is a DNS lookup and an availability
  dependency on a surface whose whole premise is staying fast.
- **A review's subject id must be the resolved entity id, never the route param** — buyer
  side vendor links carry slugs. And where no real row exists, the Write-a-Review CTA is
  hidden rather than shown and left to fail.
- **Signed-out / loading / error / empty must stay four distinct states** on any surface
  that reads from Supabase. Collapsing them is how a broken page passes for an empty one.
- **Vendor contact details are gated by the same rule as calling** — one resolution, many
  consumers, and a skeleton (never real rows) while the gate resolves. **Known open
  decision:** `vendor_profiles` is world-readable including `phone`, so the gate is a UI
  rule only. Closing it is a marketplace-discovery decision, not a bug fix.
- **There is no `/orders` route.** "Track Orders" maps to `/requirement/my-quotes`; "View
  Order Details" maps to `/chat`.
- **Payment amounts are computed server-side, never accepted from the client**, and the
  Razorpay account is in **live mode** — checkouts move real money. Refunds are manual.
- **Total Order Value is the retention metric.** The cumulative figure of orders won through
  Cosora is the single strongest reason a vendor stays.
- **The schema must stay compatible with a future working-capital lending product.** Order
  volume, capacity, reliability, pricing and transaction history are being collected with
  that in mind even though the product does not exist yet.
- **Known papercut, deliberately unfixed:** `UserRoleContext` initialises to `"buyer"` and
  never seeds from `profile.active_role`, so signing in as a vendor still starts in buyer
  mode until the sidebar SWITCH MODE toggle is used.
- **Search ranking happens in ONE place: `match_products`.** Keyword rank and vector rank
  are fused with RRF (k = 60, the paper's constant, deliberately untuned), and the vendor's
  paid `search_boost_tier` is applied as a multiplication **after** fusion — bounded at
  1 + 4×0.05 = 1.20, so it can reorder near-neighbours but cannot lift an irrelevant listing
  over a relevant one. Never reintroduce a client-side sort over search results: the browser
  cannot see relevance, so any re-sort silently discards the ranking it was given. (The
  browse feed still sorts by boost — that is a different surface with nothing to rank
  against.)
- **No fabricated data on the search surfaces, ever again.** Search.tsx and SearchResults.tsx
  previously shipped invented search volumes, **real trademarked brands (H&M, Zara, Levi's)
  that are not vendors here**, invented follower counts, a "Popular keywords" list stamped
  with today's date implying a trending job that did not exist, a "Sponsored" rail of fake
  listings priced in USD, and a 15-item picsum product pool rendered whenever the catalogue
  was empty. All removed. Every number on those pages is now counted from a real row, and an
  empty catalogue renders empty (see "No mock data in production").
- **A degraded search must admit it.** When a query has no cached embedding the results are
  keyword-only, and the footer says `· keyword match only`. Loading / empty / results stay
  three distinct states — a failed fetch used to render eight placeholder products and pass
  for a populated catalogue.
- **Query embeddings never reach the browser.** `search_products` resolves the cached vector
  server-side; the client sends text and gets ids back. Shipping 1536 floats each way for a
  value the browser cannot use was the shape this replaced.
- **The embedding pipeline is a queue, and failure is the retry.** `generate-embedding`
  archives a pgmq message ONLY after the row is written; anything else leaves it queued for
  the next `pg_cron` tick. That is what lets the backfill be enqueued before OpenAI billing
  exists and drain by itself afterwards. Do not "fix" a stuck queue by archiving messages.
- **`generate-embedding` is service_role-only and `embed-query` is the public one, on
  purpose.** The queue drainer checks `role = 'service_role'` inside the handler on top of
  `verify_jwt` (the anon key gets 403 — verified), because the anon key ships in the bundle
  and would otherwise let anyone burn OpenAI credits. They are separate functions so an auth
  mistake on the buyer-facing path cannot expose the drainer.

### Postgres facts that are not guessable (all cost a failed migration to learn)

- **A generated column cannot reference another generated column.** `fts` therefore inlines
  the whole `search_text` expression rather than reading the column. They cannot drift —
  both derive from the same own-row columns — but the duplication is deliberate, not an
  oversight to "clean up".
- **`array_to_string` is STABLE, not IMMUTABLE**, so it cannot appear in a generated column.
  `public.immutable_array_to_string(text[], text)` is the narrow wrapper that makes
  `pattern`/`occasion` indexable. Do not widen it to other element types.
- **A generated column cannot run a subquery**, which is the entire reason `category_name`
  is denormalised onto `products` (synced by a BEFORE `UPDATE OF category_id` trigger).
  Category is the best-populated field on the table and the single most valuable search
  signal — a query for `t-shirt` matches "Ribbed Tank Top" only through its category.
- **`UPDATE ... OF <col>` fires on the columns NAMED as a target, not on the ones whose
  values changed.** That is what makes the category-rename cascade
  (`UPDATE products SET category_id = category_id`) work; it looks like a no-op and is not.
  Verified against this database.
- **`pg_net` registers against the `public` schema but its FUNCTIONS live under `net`.** The
  cron poller calls `net.http_post`. The extension namespace and the callable namespace are
  not the same thing here. This is also why `get_advisors` reports
  `extension_in_public: pg_net` and why that warning is **left alone**: all 12 of its
  functions are in `net` and **zero** are in `public` (verified via `pg_depend`), so nothing
  is actually exposed. `ALTER EXTENSION pg_net SET SCHEMA` would try to relocate objects out
  of a schema the extension creates for itself, and the only thing it would buy is silencing
  a cosmetic lint on the surface that carries the embedding cron.
- **A SECURITY DEFINER function pinned to `search_path = public` cannot resolve pgvector's
  `<=>` operator at all.** Every function touching embeddings needs
  `set search_path = public, extensions`.
- **Postgres grants EXECUTE to PUBLIC by default.** `grant ... to service_role` alone does
  not restrict anything; the matching `revoke all ... from public, anon, authenticated` is
  the part that does the work.

## Product semantic search — what is left to switch it on

Everything is built, applied and deployed. Search **works today** as keyword-only and says
so in the UI. Two steps turn on the semantic half, and neither can be done from a migration.

1. **Store the service-role key in Vault.** Run once in the dashboard SQL editor — never in
   a migration, so the key never enters git or a chat transcript:
   ```sql
   select vault.create_secret('<the project service_role key>', 'service_role_key',
     'Lets pg_cron authenticate to edge functions');
   ```
   The `embedding-worker` cron job is already scheduled and guarded on this secret existing,
   so it is inert until the row appears and starts working by itself afterwards. The anon key
   will **not** do: `generate-embedding` rejects anything that is not `role = 'service_role'`.
2. **Enable billing on the OpenAI account.** `OPENAI_API_KEY` is already set as an edge
   function secret. Verify with the probe branch, which spends no tokens and touches no
   queue: `POST /functions/v1/generate-embedding {"probe":true}` (service-role auth) →
   `has_openai_key`, `has_service_key`, `supabase_url_set`.
3. **Then enqueue the backfill** (26 live rows, drains in one cron tick):
   ```sql
   select pgmq.send('embedding_jobs', jsonb_build_object(
     'table','products','id',id,'text',search_text))
   from public.products
   where status = 'live' and embedding is null and length(trim(search_text)) > 0;
   ```
4. **Verify:** `select count(*) from products where status='live' and embedding is null`
   should reach 0, and the four queries that return nothing today — `summer beachwear`,
   `breathable office wear`, `wedding outfit`, `gym clothing` — should start returning
   sensible neighbours. Do that check by hand; at this catalogue size it is five minutes and
   it is the only thing that actually tells you the embeddings are good.

**Watch the spend.** `embed-query` is callable by any holder of the public anon key and
costs one OpenAI call per *novel* query (repeat queries are served from
`search_query_embeddings` and cost nothing). ~$0.00002 each, length-capped, **not** rate
limited. If the marketplace is ever scraped, that is the line item to look at.

## Raising MAX_VIDEO_BYTES (the 90 MB / Pro-plan step)

Written down now so it is not a judgement call under pressure later. The order matters
and the first step is the one that cannot be automated.

1. **Upgrade the Supabase org to Pro.** Free caps the project's global file size limit at
   50 MB, which is where today's `MAX_VIDEO_BYTES` comes from.
2. **Raise Storage → Settings → Global file size limit in the dashboard. FIRST.**
   This cannot be done via a migration, via the Storage API, or via MCP — it is a project
   setting, not schema, and there is no SQL for it. Set it to the new ceiling (90 MB).
3. **Then** bump the two places that mirror it, together, in the same change:
   - `MAX_VIDEO_BYTES` in `src/lib/queries/videos.ts` (the client gate), and
   - the `product-videos` bucket's `file_size_limit` (the server-side gate, so bypassing
     the client gains nothing).

**Skipping step 2, or doing it after step 3, silently accomplishes nothing.** A bucket's
`file_size_limit` can never exceed the project's global limit — set the bucket to 90 MB
while the project is still at 50 MB and uploads keep failing at 50 MB with an error that
points at the bucket, which is the wrong place to look. The client constant would then be
advertising a ceiling the platform will not honour, so a vendor picks an 80 MB file, waits
through a long resumable upload on a phone connection, and gets rejected at the end.

Egress, not just size, is the real constraint — see "Media is rationed by the Supabase
Free plan" above. Raising the cap raises what a single view costs.

## Bunny Stream — the deploy checklist (order matters, twice)

Two settings here are **not retroactive**, which is the same shape of trap as the
storage-limit ordering above: doing them late looks like it worked and is not.

1. **Enable MP4 Fallback in the Bunny library's Encoding tab — BEFORE the first
   upload.** `bunny-upload-url` hands the client a `play_<res>p.mp4` playback URL
   because the reel viewer plays a plain `<video src>`, which cannot decode an HLS
   manifest outside Safari. Bunny only generates those MP4 renditions for videos
   uploaded *while the setting is on*. Turn it on afterwards and every already-uploaded
   video 404s forever — the fix is a re-encode or a re-upload, per video.
   **Verified done on 2026-09-06** (`hasMP4Fallback: true` on a real upload).
1b. **Hotlink protection is ON, and that is fine — do not "fix" it.** The library
   has "block direct URL file access", so every playback URL returns **403 to a
   request with a blank `Referer`** and **200 to one from `localhost:8080` or
   `textile-spark-net.vercel.app`**. A browser playing the reel always sends a
   Referer; `curl -I` and a script `HEAD` never do. Verified 2026-09-06 both ways.
   Anything that probes these URLs must send a Referer or it will report a
   catalogue-wide outage that does not exist — which is exactly what happened
   before `scripts/bunny-e2e-check.mjs` learned to probe both shapes. If new
   origins are added (a custom domain), they must be added to Bunny's referrer
   allowlist or playback stops there.
1c. **The rendition is derived, never hardcoded.** `pickRendition()` in
   `bunny-upload-url` chooses from the source dimensions the client already probed,
   because Bunny only builds renditions the source supports. Verified 2026-09-06
   with the platform's own vendor clip (478×850 portrait phone video): Bunny
   produced **240p, 360p and 480p and no 720p**, and the function correctly chose
   480p. A hardcoded `play_720p.mp4` would have 404'd for exactly the content this
   marketplace receives. A ≥720p source still gets 720p; 1080p is deliberately not
   on the ladder (9:16 phone reel, and Bunny egress is billed).
2. **Set all three edge-function secrets**, none of which may ever reach the client:
   ```
   npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb "BUNNY_API_KEY=..."
   npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb "BUNNY_LIBRARY_ID=..."
   npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb "BUNNY_CDN_HOSTNAME=vz-....b-cdn.net"
   ```
   `BUNNY_CDN_HOSTNAME` is the library's CDN hostname from the Bunny dashboard. It is
   **not** a secret (it is in every playback URL) but it lives with the others so the
   edge function can compose complete URLs and the client needs no constant at all —
   which is what lets the delivery domain change later without a client release.
3. **Deploy the three functions**, all with `verify_jwt = true` (declared in
   `supabase/config.toml`; the manual JWT decode inside each is only sound because of it):
   `bunny-upload-url`, `bunny-delete-video`, `bunny-reconcile`.
4. **Verify:** `node scripts/bunny-config-check.mjs`. It signs in as a real vendor and
   calls the function's `{"probe":true}` branch, which reports the configuration verdict
   **without creating a Bunny video** — the only other way to check leaves a stray empty
   video in the library every time. It prints secret *names*, never values.
5. **Then** run `node scripts/bunny-e2e-check.mjs`. It uploads the real 478×850 vendor
   clip through the whole chain — slot, TUS, encode, row insert, delete — and asserts
   each step against **Bunny's API**, not the CDN. That distinction is load-bearing: a
   protected pull zone answers 403 for a file that exists and for one that does not, so
   a CDN probe cannot tell "encoded fine" from "never encoded", and an earlier version
   of this script passed its delete assertion for exactly that wrong reason (403 before,
   403 after). The script leaves nothing behind — it deletes its own Bunny video through
   the real delete path and removes its throwaway row in a `finally`.
6. **Finally, with both dev servers up, run
   `npx playwright test tests/video-closeups-bunny.spec.ts`.** Step 5 cannot answer the
   only question a buyer has — does the reel *play* — because from Node every playback
   URL is a 403 (see 1b). A browser sends a `Referer`, so this spec is the instrument
   that measures playback: it asserts `readyState >= 2` (a frame actually decoded) on the
   stored Bunny MP4 in **both** the moderator's player and the buyer reel, plus the
   renamed-`.mov` rejection with a request spy proving nothing was uploaded. It uses the
   `demo-*` accounts and cleans up asset-then-row in `afterAll`.

Nothing about moderation changes: the row still inserts as `under_review` and the same
BEFORE trigger still enforces it, whatever the provider — asserted at both layers
(`bunny-e2e-check.mjs` step 5 against an insert that explicitly asks for `live`, and
`video-closeups-bunny.spec.ts` T8.2/T8.4 through the real moderation UI).

## Domain Terms

| Term | Meaning |
|---|---|
| **RFQ** | Request for Quotation — a buyer's sourcing requirement post |
| **Quick RFQ** | Simplified RFQ (image + quantity), designed for <30 seconds |
| **Lead** | A buyer inquiry arriving in the vendor dashboard |
| **MOQ** | Minimum Order Quantity |
| **GSM** | Fabric weight (grams per square metre) |
| **TradeSEAL** | Cosora's paid vendor verification badge, purchased via the ad system |
| **Pan India** | Nationwide ad targeting across all of India |
| **UPI AutoPay** | Subscription payment method via India's UPI system |
| **Profile Score** | Vendor's profile completeness % — higher = better visibility |
| **Total Order Value** | Cumulative orders won through Cosora — strongest vendor retention metric |
| **Video Closeup** | A product video in the buyer feed. Never called a "Reel" |

## Architecture Snapshot

- **Repo**: `textile-spark-net` (`github.com/abhishekmitraaa/textile-spark-net`), built with
  Lovable.dev, ported from the Next.js source `cosorawork/client-cosora-vendor-frontend`.
- **Stack**: Vite + React 18 + TypeScript + shadcn-ui + Tailwind + React Router v6 +
  React Query + Framer Motion, on **Supabase** (Postgres/Auth/Storage/Edge Functions/
  Realtime), with **Razorpay** payments, deployed to **Vercel**.
- **Key folders**: `src/pages/` (route components), `src/components/` (`buyer/`,
  `dashboard/`, `layout/`, `ui/`, feature folders), `src/contexts/`, `src/hooks/`,
  `src/lib/` (`queries/` for Supabase access, `*Store.ts` for
  `useSyncExternalStore`-backed client state), `src/data/`, `supabase/migrations/`,
  `supabase/functions/`, `tests/` (Playwright), `scripts/` (verification scripts).
- **Routing**: every route is declared in `src/App.tsx`; `buyerShellRoutes` at the top of
  that file defines the buyer pages that use the `BuyerRouteShell` wrapper.
- **Dev server**: `localhost:8080` (non-standard). Path alias `@/*` → `src/*`.
- **Admin panel**: separate repo `Cosora-Admin`, same Supabase project.

Depth — schema, invariants, integrations, tech debt — lives in
`documentation/technicalimplementation.md`. Keep this snapshot current, not exhaustive.

## Pointers

- Full dated history: `documentation/changelog.md`
- Test data & results: `documentation/test.md`
- Technical depth: `documentation/technicalimplementation.md`
- Routes/pages: `documentation/sitemap.md`
- Buyer/Vendor/Admin feature detail: `documentation/sides.md`
- Razorpay runbook: `supabase/RAZORPAY.md`

## Documentation Protocol — follow every session, unprompted

1. At the start of a session, read ONLY this file for baseline context. Do not read the
   other `documentation/*.md` files unless the task at hand needs them.
2. The moment you decide, confirm, or discover a business rule or platform-level fact,
   add it to the sections above immediately — do not wait to be asked.
3. Before ending ANY turn in which you changed code, a decision, or a business rule —
   with no exceptions and without being asked:
     a. Append a dated entry to `documentation/changelog.md` (what changed, why, files touched).
     b. Update this file if the change affects business rules, architecture, or
        platform-level facts.
4. Whenever you write or run a test, update `documentation/test.md` with the test data
   used, what was checked, and the result.
5. Whenever you touch implementation details (schema, APIs, libraries, patterns,
   infra choices), update `documentation/technicalimplementation.md`.
6. Whenever a route/page/sub-page is added, renamed, or removed, update
   `documentation/sitemap.md`.
7. Whenever buyer-side, vendor-side, or admin-side features or flows change, update
   the matching section of `documentation/sides.md`.
8. Treat updating these files as PART OF finishing a task, not a separate step you
   might skip. A task is not done until its docs reflect it.

### How the automation actually works (`.claude/settings.json`)

- **`PreCompact` hook (agent)** — the only thing that *writes* these docs. It runs a
  review-and-update agent **before every compaction**, automatic or manual `/compact`.
  Tied to the compaction boundary, **not** literally "after each chat".
- **`UserPromptSubmit` hook (command)** — read-only; injects `documentation/claude.md`
  into context on every prompt (baseline only, per step 1 above — the 348 KB changelog is
  deliberately NOT injected). Never writes. It runs `powershell -NoProfile`, **not** `pwsh`:
  PowerShell 7 is not installed on this machine, so the pre-existing `pwsh` invocation was
  failing silently and no context was ever injected. It also needs `-Encoding UTF8` on
  `Get-Content`, or PS 5.1 reads the file as ANSI and mangles every em dash.
- **`Stop` hook (command)** — posts a reminder only; it does not update anything.
- `.github/copilot-instructions.md` is prose for GitHub Copilot; Claude Code does **not**
  execute it. Do not treat it as the hook source.

**What this means for you (the assistant):** the `PreCompact` agent is a safety net, not a
guarantee. A short session that never compacts won't trigger it, and agent hooks can fail to
fire. So the protocol above is yours to execute — do not assume a hook already did it.
