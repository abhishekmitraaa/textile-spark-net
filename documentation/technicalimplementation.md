# Technical Implementation

Updated automatically whenever implementation details change (schema, APIs, libraries,
patterns, infra choices). This is the depth layer — `documentation/claude.md` holds only
the snapshot.

Last updated: 2026-09-07

---

## Stack

**Frontend**
- Vite + React 18 + TypeScript
- React Router v6 (all routes declared in `src/App.tsx`)
- shadcn-ui (Radix primitives) + Tailwind CSS v3 (`tailwind.config.ts`, `postcss.config.js`)
- TanStack React Query v5 for server state
- React Hook Form + Zod for forms and validation
- Framer Motion for the animation system
- `tus-js-client` for resumable video upload
- `recharts` for analytics charts, `sonner` for toasts, `embla-carousel-react` for carousels

**Backend**
- Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)
- Migrations in `supabase/migrations/`; edge functions in `supabase/functions/`
- Generated types in `src/lib/database.types.ts`

**Tooling / infra**
- ESLint (`eslint.config.js`), Playwright for E2E
- Vercel for hosting, Lovable.dev as a secondary sync target
- Dev server on `localhost:8080` (non-standard, set in `vite.config.ts`)
- TypeScript path alias `@/*` → `src/*` (tsconfig.json + vite.config.ts)

```sh
npm install          # Install dependencies
npm run dev          # Dev server on http://localhost:8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npm run test:e2e     # Playwright E2E (run npm run playwright:install first)
npm run check:fields # scripts/check-seller-fields.mjs
```

---

## Architecture


### Core Structure

- **`src/pages/`** – Page-level components corresponding to routes (Landing, Login, SellerHome, Products, etc.)
- **`src/components/`** – Reusable UI components organized by feature:
  - `buyer/` – Buyer-specific components (BuyerHomeTabs, BuyerProductCard, BuyerRouteShell)
  - `dashboard/` – Seller dashboard components (StatsCard, ProductCard, SellerQuickActionsGrid)
  - `layout/` – Shell layouts (DashboardLayout, DashboardSidebar, MobileBottomNav)
  - `ui/` – shadcn-ui primitives (accordion, alert, button, card, etc.)
  - `advertingments/`, `brand/`, `brands/`, `vendor brand profile/`, `vendorhome/` – Feature-specific components
- **`src/contexts/`** – React Context for app-wide state (UserRoleContext for role management)
- **`src/hooks/`** – Custom React hooks
- **`src/lib/`** – Utility functions
- **`src/data/`** – Constants and static data
- **`tests/`** – Playwright E2E test specs

### Multi-Role Architecture

The app supports distinct user roles (buyer, seller, vendor, freelancer, photographer) with role-based navigation and features:

- **User Role Management**: `UserRoleContext` provides role state across the app
- **BuyerRouteShell**: A wrapper component that renders buyer-specific routes with a consistent layout, description metadata, and related navigation links. Used for all buyer feature pages (search, trends, followings, profiles, etc.)
- **Role-Specific Routes**: Routes are defined directly in App.tsx with conditional components based on role logic

### Routing

All routes are defined in `App.tsx` using React Router v6. Routes include:

- **Auth Flow**: `/login`, `/auth/otp-verify`, `/auth/role-selection`, `/auth/sub-role`, `/auth/account-info`, `/auth/terms`, `/auth/welcome`
- **Seller Flow**: `/seller-home`, `/dashboard`, `/products`, `/uploads`, `/leads`, `/advertisements`, `/quotes`, `/upload-catalogue`, `/upload-video`, `/settings`
- **Buyer Flow**: `/browse`, `/home/new-arrivals`, `/home/for-you`, `/search`, `/product/:id`, `/chats`, `/saved`, `/requirement/*` (RFQ & quotes), `/profile/*`
- **Vendor/Freelancer**: `/services`, `/freelancers`, `/vendor/:id`
- **Fallback**: `*` maps to NotFound

The `buyerShellRoutes` array at the top of App.tsx defines all buyer feature pages that use the BuyerRouteShell wrapper.

### Forms & Validation

- **React Hook Form** for form management
- **Zod** for schema validation
- Input components via shadcn-ui

### Data Fetching & State

- **React Query** (TanStack Query) for server state and caching
- **QueryClientProvider** wraps the app for global query management
- **Buyer-side client stores** — Cross-page reactive state uses **module-level stores backed by `useSyncExternalStore` + `localStorage`** (no React context/provider). Each exposes a `useX()` hook plus mutation functions. Current stores: `src/lib/savedStore.ts` (wishlist folders/products + the global Save-to-folder modal state), `followingStore.ts` (followed brands), `preferencesStore.ts` (For You categories/locations), `profileStore.ts` (buyer profile/social/notifications/regional), `recentlyViewedStore.ts` (viewed products), `brandFollowStore.ts` (followed brand ids on the Search-Results **Brand tab** — a `Set<id>`, kept separate from `followingStore` because those search-surface brands have their own ids and shouldn't leak into the Following page). `src/lib/listingProducts.ts` holds the shared `ListingProduct` type + `img()`/`makeListingProduct()` helpers (kept JSX-free for fast-refresh).

### Buyer-Side Layout & Flows

- **BuyerShell** (`src/components/buyer/BuyerShell.tsx`) is the frame for buyer pages — BuyerTopBar + content + `MobileBottomNav` + ToTop. Buyer pages use this, **not** the vendor `DashboardLayout` (rendering DashboardLayout on buyer routes double-stacks the top bar). `MobileBottomNav` accepts an optional `autoHide` prop.
- **Wishlist flow** — every product card's bookmark calls `openSaveModal(product)` from `savedStore`; a single `<SaveToFolderModal />` is mounted globally in `App.tsx` inside `<BrowserRouter>`. Saved items feed `/saved` (My Saves) and `/saved/:collectionId`.
- **Create New Requirement** (`src/pages/PostRequirement.tsx`) — hub → category select → **schema-driven per-category form** (a `SCHEMAS` map keyed by category id renders category-relevant fields via a generic renderer) → coral success screen → `/requirement/my-quotes`.
- **New buyer routes**: `/search`, `/home/trends`, `/home/followings`, `/home/followings/view-all`, `/home/for-you`, `/saved`, `/saved/:collectionId`, `/recently-viewed`, `/profile/notifications`, `/profile/social-links`, `/profile/regional-settings`, `/profile/terms`, `/requirement/post-requirement`.

### Styling

- **Tailwind CSS** for utility-first styling
- **shadcn-ui** for pre-built accessible components
- Config: `tailwind.config.ts`, `postcss.config.js`
- **Vendor pages: Tailwind's breakpoints lie about available width.** `DashboardLayout` spends 256px on the sidebar plus 48px of `lg:p-6`, so at `xl` (1280px viewport) a vendor page only has ~976px of content, and at `2xl` (1536px) ~1232px. Anything that needs real room — a side rail, a 6-across stat strip — should be gated on arbitrary variants like `min-[1400px]:` / `min-[1700px]:` rather than `xl:`/`2xl:`. `/advertisements` uses this; do not "tidy" those back to named breakpoints without re-checking at 1280px.

### Path Aliases

TypeScript path alias `@/*` maps to `src/*` (configured in tsconfig.json and vite.config.ts).


---

## Data Model

Supabase Postgres. Generated types live in `src/lib/database.types.ts`; migrations in
`supabase/migrations/` (40 as of 2026-09-06). **The Cosora-Admin repo owns some migrations
against the same Supabase project** (`resolve_conversation_review`, `regex_probe`, the
`admin_flags` CHECK) — check both `supabase/migrations/` directories before assuming a
function is missing.

### Tables — by domain

| Domain | Tables |
|---|---|
| Identity & roles | `profiles`, `buyer_profiles`, `vendor_profiles` (+`recommended_product_ids` — the ordered, curated storefront strip; +`annual_turnover`, `capacity`), `vendor_documents` (+`rejection_reason`, `reviewed_at`, `reviewed_by`), `vendor_contracts` (append-only signed supplier agreements), `admin_role`, `admin_role_values` |
| Catalogue | `products` (+`unit` — the selling unit for `price_value`), `product_images`, `product_videos` (+`provider`/`bunny_video_id` — see Bunny Stream below), `catalogues`, `categories` |
| Sourcing | `rfqs`, `quotes`, `leads` (via rfq/quote joins), `recently_viewed` |
| Saves & follows | `saved_items`, `saved_folders`, `saved_folder_items`, `saved_videos`, `follows` |
| Video engagement | `video_likes` (per-buyer like rows; `product_videos.likes_count` is the denormalised counter kept in step by an AFTER trigger) |
| Chat | `conversations`, `messages`, `conversation_reviews`, `chat_block_reasons`, `flag_patterns`, `keyword_blocklist` |
| Reviews | `reviews` (vendor), `product_reviews`, `service_reviews` |
| Ads | `advertisements`, `active_ads` (view), `ad_orders`, `ad_category_benchmarks`, `vendor_ad_verifications` |
| Subscriptions | `subscription_plans`, `vendor_subscriptions`, `subscription_usage`, `subscription_invoices`, `subscription_payment_orders` |
| Moderation & safety | `admin_flags`, `account_suspensions`, `notifications` |
| Telemetry | `engagement_events` (visit-level event log — see below), `calls`, `ad_click`, `ad_impression` |

### Notable functions / RPCs

`approve_vendor_content`, `approve_vendor_content_bulk`, `reject_vendor_content`,
`resolve_conversation_review`, `submit_report`, `set_account_status`, `regex_probe`,
`notify`, `account_is_active`, `is_admin`, `is_conversation_member`, `owns_product`,
`owns_rfq`, `get_vendor_plan`, `expire_subscriptions`, `grant_ad_verification`,
`vendor_buyer_geography` (aggregate-only buyer geography; see below),
`increment_product_view`, `increment_product_enquiry`, `increment_video_view`,
`log_engagement_event` (the only write path into `engagement_events`),
`sync_video_likes_count` (trigger fn), `next_invoice_number`,
`reply_to_review`, `user_has_password`.

Enforcement pattern used throughout: **RLS decides who may touch a row; BEFORE triggers
decide which state transitions are legal.** Moderation RPCs are `SECURITY DEFINER` and
carry no `EXECUTE` grant to `PUBLIC`. See Known Constraints below for the invariants that
must not be undone.

### `engagement_events` — visit-level tracking (migration 20260907170000)

**Filename does not match the recorded version, and that is expected.** `apply_migration`
over MCP stamps its own timestamp: this file is `20260907170000_engagement_events.sql`
locally but `supabase_migrations.schema_migrations` records version `20260907191048`, name
`engagement_events`. The same is true of `20260907180000_vendor_store_unit_and_
recommendations.sql`, recorded as `20260907182703`. A future `supabase db push` will
therefore see both as unapplied and try to re-run them — harmless here, because this
migration is written to be idempotent throughout (`create table if not exists`,
`drop policy if exists` before each `create policy`, `create or replace function`,
`create index if not exists`). Keep it that way, or rename the file to the recorded version
before anyone links the CLI.

**Status: APPLIED 2026-09-08.** Live on the project, verified by
`scripts/engagement-events-check.mjs` (19/19) plus an end-to-end run through the app. The
`installed: false` path below is retained deliberately — it is what a fresh branch database
or a restored-from-before-this-date environment will hit, and it must keep saying "not
switched on" rather than "no data" there.

```
id uuid pk · event_type text check(product_view|profile_view|search_impression|
  search_click|ad_impression|ad_click|cta_click) · vendor_id uuid not null →vendor_profiles
  · product_id uuid →products · ad_id uuid →advertisements · viewer_id uuid →profiles
  (null = signed out) · session_id text · source text check(organic_search|category_browse|
  recommendation|ad|external|direct) · query_text text · cta_name text · created_at timestamptz
index (vendor_id, created_at desc) · (vendor_id, event_type, created_at desc)
```

**One table, seven event types — not four tables.** Every panel this feeds is "group this
vendor's events by `<dimension>` over `<window>`". Four tables would mean four near-identical
schemas, four RLS policies to keep in step, four `(vendor_id, created_at)` indexes and a
UNION in every query that spans them — and the queries do span them, because "ad-attributed
profile views" is an ad event and a profile event at once. The type-specific columns are all
nullable and cheap.

**RLS: SELECT-only, and there is deliberately no INSERT policy at all.** Writes go
exclusively through `log_engagement_event`, a `SECURITY DEFINER` function, mirroring
`increment_product_view`. `viewer_id` is taken from `auth.uid()` *inside* the function and is
never a parameter — a client that could name the viewer could forge every unique-visitor and
attribution figure on the page. The vendor is likewise derived server-side from the product
or ad wherever one is named. `SELECT` is `(vendor_id = auth.uid()) or is_admin()`; a buyer
cannot read the events they generated, so `viewer_id` never becomes a way to enumerate who
looked at what. The function swallows every error: this is fire-and-forget telemetry sitting
in front of a buyer's navigation.

**The counters are NOT replaced.** `products.views_count` and
`advertisements.impressions/clicks` still run exactly as before — the buyer feed sorts on
one and the campaigns table reads the others, and they carry history predating this table.
Each client call site now does both writes side by side, under the *same* dedup key where one
exists (ProductDetail's `cosora.viewed.<id>` session key), because two different dedup rules
would make the counter and the event log disagree about the same visit. This is deliberately
NOT done by editing `increment_product_view` / `ad_impression` / `ad_click`: their bodies are
not reproduced in this repo's migration history, and `create or replace`-ing a function from
a guess at its body is how a `status = 'live'` filter silently disappears from production.

**The status guard is why the write path is a function and not an INSERT policy.** The
counter RPCs are one line each and each carries a filter — `increment_product_view` only
counts a `status = 'live'` product, `ad_impression`/`ad_click` only an `status = 'active'`
ad. `log_engagement_event` repeats exactly those filters for the three event types that
mirror a counter, so the log and the counters can never tell different stories about one
visit. Without it a vendor previewing their own `under_review` listing would bump no
counter but would log a `product_view` against themselves, quietly poisoning their own
analytics with their own page refreshes. The guard is scoped to those three types only: a
`cta_click` that happens to name a non-live product is still a real button press and is
still recorded. Proved in a self-rolling-back `DO` block — see `documentation/test.md`.

**Three states, not two.** Before the migration is applied PostgREST answers `PGRST205`.
`useEngagementWindow` reports `installed: false` for exactly that code and rethrows anything
else, and the `EventPanel` component renders "not switched on" — distinct from the genuine
empty-window message. Collapsing them is how a broken page passes for an empty one.

**`source` is resolved by a short-lived marker, not by router state.** The value is known at
the *origin* (the search page knows the click was a search result) but needed at the
*destination* (ProductDetail logs the view). Threading it through would mean adding state to
every `<Link to="/product/...">` in the buyer app. Instead `markNavSource()` writes a
`sessionStorage` marker and `consumeNavSource()` reads-and-clears it with a **15-second TTL**
— without the TTL, a stale marker from a search ten minutes ago would relabel a later direct
visit as organic search, which is worse than the honest `'direct'` default.

**`session_id` is `sessionStorage`, deliberately not `localStorage`.** It is a fallback for
counting one anonymous browsing session as one visitor, not a durable identifier for a
person; it dies with the tab, and the server ignores it entirely once `auth.uid()` is
non-null. Unique visitors are `count(distinct coalesce(viewer_id, session_id))` and are shown
**alongside** total views, never instead of them, labelled as a lower bound.

### `vendor_buyer_geography` — buyer geography without exposing buyers (2026-09-09)

Signature `(v uuid default auth.uid(), p_days int default 30) returns jsonb`, STABLE
SECURITY DEFINER, `search_path = public` — deliberately the same shape as
`ad_category_benchmarks`, this project's established pattern for "let a vendor see an
aggregate over rows they cannot read individually".

**`buyer_profiles` RLS is UNCHANGED, and that is the design.** The vendor needs counts per
city and must never gain read access to buyer rows; widening that policy even to "buyers who
viewed my products" would hand every vendor a queryable list of their buyers' home cities
joined to names and companies. The join happens inside the function and only tallies come
back. `scripts/vendor-buyer-geography-check.mjs` asserts the vendor still reads zero foreign
`buyer_profiles` rows, so a future change that "fixes" the card by loosening a policy fails
the suite.

**k-anonymity: `min_viewers = 3`.** Any city or state backed by fewer than three *distinct*
`viewer_id`s is folded into an unnamed `other` bucket that still carries the counts, so totals
reconcile (`named + other == events_with_location`, asserted). States are aggregated
server-side rather than rolled up from the censored city list: a state with five viewers
spread over three small cities is safe to name even though none of its cities is, and rolling
up would discard that for no privacy gain.

**Only buyer-initiated events count** — `product_view`, `profile_view`, `search_click`.
`ad_impression` is excluded because an impression is the platform choosing to render
something, not a buyer expressing interest; counting it would let ad spend inflate a map
meant to answer "where is demand".

**Grants are tighter than the function it was modelled on**: `revoke ... from public, anon`
then `grant execute ... to authenticated`. An anonymous caller has no vendor identity to be
granted one. See the NULL-guard entry in `claude.md` for why the self/admin check also had to
`coalesce`.

**No map ships yet, and the reason is a dependency fact.** The spec assumed MapLibre GL JS was
already available "so no new dependency" — that is true of **Cosora-Admin, a separate repo**.
`maplibre-gl` is not in this project's `package.json` and is not installed. The card renders a
ranked state/city list plus the coverage line; `states` is already shaped for a choropleth, so
adding the map is additive. Adding the dependency needs a decision about ~800 KB on a bundle
already at 745 KB gzipped and a runtime tile-provider dependency.

### Storage buckets

- `product-images` — public; insert policy is uploader-scoped
  (`(storage.foldername(name))[1] = auth.uid()::text`). Review photos live here under
  `${buyerId}/reviews/…` — **not** a separate bucket.
- `product-videos` — holds both videos and their posters. MIME allowlist must keep
  `image/jpeg` + `image/webp`; `file_size_limit` 50 MB. Raising that cap has a
  dashboard-first ordering that cannot be skipped — see "Raising MAX_VIDEO_BYTES" in
  `claude.md`. Reconciling objects against rows: `documentation/orphan-reconciliation.sql`
  (read-only by design; the delete step is deliberately a human one).

### Video closeup engagement — why three different shapes

`product_videos` carries two counters and has two companion tables, and the differences
between them are deliberate rather than incidental:

- **`views_count`** — monotonic. A view happened and cannot un-happen, so `+1` forever is
  the correct semantic and a `SECURITY DEFINER` RPC (`increment_video_view(p uuid)`,
  scoped to `status='live'`) is enough. Exactly mirrors `increment_product_view`; a buyer
  owns no video row, so the write cannot be a client UPDATE. Dedup is the caller's
  responsibility — `recordVideoViewOnce` in `lib/queries/videoEngagement.ts` layers an
  in-memory `Set` under `sessionStorage`, because a reel slide re-activates and remounts
  in a way a product page never does.
- **`likes_count` + `video_likes`** — a like is a *toggle*, so it needs a row that can be
  deleted, not a number that only grows. The join table is the source of truth (and the
  only way to answer "did I already like this?"); the counter is a denormalisation the
  feed sorts and renders from, maintained by `sync_video_likes_count` (AFTER INSERT/DELETE,
  `SECURITY DEFINER`, floored at 0).
- **`saved_videos`** — same RLS shape as `saved_items` but deliberately outside
  `savedStore.ts`, because that store models folders-of-products and a saved video has no
  folder. Kept separate from the in-session `bookmarkedVideoIds` signal that
  `rankVideoCloseUps` reads: durable saves and this-session interest answer different
  questions.

### Bunny Stream — the first non-Supabase media provider (built, deployed, verified end to end)

The first time this codebase delivers media from somewhere other than Supabase Storage,
and the first time an edge function mints a signed upload URL. Both are new patterns, so
the reasoning matters more than the mechanics.

**Why a server hop at all.** Every other upload here goes browser→Supabase Storage
authorised by RLS on `storage.objects`. Bunny's TUS upload is authorised by
`SHA256(library_id + api_key + expiration + video_id)`, which cannot be computed in a
browser without shipping the key. Hence `bunny-upload-url` — the only thing in either repo
that holds `BUNNY_API_KEY`. The **Library ID is not and cannot be a secret**: Bunny
requires it as a plain `LibraryId` header on the client's own request.

**Three functions, all `verify_jwt = true` in `config.toml`** (load-bearing: each decodes
the JWT payload without verifying the signature, exactly as the payment functions do, which
is sound only because the platform validated it first):

| Function | Caller | Authorization |
|---|---|---|
| `bunny-upload-url` | vendor | must have a `vendor_profiles` row **and** `account_status='active'`; fails closed on lookup error. Also serves `{"probe":true}`, a config check that creates nothing. |
| `bunny-delete-video` | vendor or moderator | resolves the `product_videos` row by id and reads owner + GUID **from the row** — never from the request body |
| `bunny-reconcile` | `super_admin` / `product_moderator` | read-only two-way diff of the library against `bunny_video_id` |

**Why the delete function takes a row id, not a GUID.** `pvideos_select` is
`status='live' OR vendor_id=auth.uid() OR is_admin()`, so every live row's
`bunny_video_id` is readable by anon with the publishable key in the bundle. It is an
attacker-known value. Ownership must come from the row.

**Provider selection is a runtime fallback, not a build flag.** `createProductVideo` asks
`bunny-upload-url` for a slot; `not_configured` (a **200**, per the `razorpay-create-order`
convention) means Bunny was never set up and the original Supabase path runs unchanged.
Every other error throws. This is why the migration can ship dark — and why it is silent,
so `scripts/bunny-config-check.mjs` and the provider census in
`documentation/orphan-reconciliation.sql` exist to tell you which path is actually running.

**Two coupled constants.** `UPLOAD_WINDOW_SECONDS` (6h) bounds the whole upload, not its
start, because tus-js-client resends the auth headers on every PATCH and Bunny re-validates
per chunk. `bunny-reconcile`'s `ORPHAN_MIN_AGE_HOURS` (8h) must stay above it — that
inequality is what makes the age guard *provable* (an upload cannot outlive its signature)
rather than the estimate the storage-side reconciliation settles for.

**Verified end to end on 2026-09-06** by `scripts/bunny-e2e-check.mjs`, which uploads the
platform's own 478×850 vendor clip through the real chain — slot, TUS, encode, row insert,
delete — and asserts each step against Bunny's API. Two things it settled, both of which
had looked like blockers:

1. *Hotlink protection is on, and playback is fine.* The library blocks direct URL file
   access, so every playback URL 403s a blank-`Referer` request and returns 200 from
   `localhost:8080` and the production origin. A script `HEAD` looks exactly like a
   hotlink; a `<video>` element does not. Probing without a Referer once produced a
   false "catalogue-wide 403" report, so the check now probes both shapes and treats the
   blank-referer 403 as the *expected* negative control.
2. *The rendition is derived, not hardcoded.* Bunny only builds renditions the source
   supports: the 478×850 clip yielded 240p/360p/480p and no 720p. `pickRendition()` picks
   from the client-probed dimensions (shorter edge, small tolerance — 478 selects 480p,
   which Bunny really built), capped at 720p. The e2e check asserts the chosen rendition
   is one Bunny actually produced, which is what makes it a tested rule rather than a guess.

**The CDN is not a usable oracle for "does this file exist"**, both because of the referer
rule above and because a protected zone answers identically for present and absent files.
So the check asserts through `bunny-reconcile`, whose `library` block carries `status`,
`encodeProgress`, `availableResolutions`, `hasMP4Fallback` and `thumbnailFileName` per
video for exactly this purpose. Deploy order and the non-retroactive settings are in
`claude.md`.

**And the CDN is not a usable oracle for "does this file *play*" either — which is why
this provider is verified at two layers, not one.** The referer rule means Node can only
ever establish that Bunny's *API* reports a healthy asset; it structurally cannot decode
one. `tests/video-closeups-bunny.spec.ts` closes that gap in Chromium, which sends a real
`Referer`: it asserts `readyState >= 2` and `videoWidth > 0` on the stored MP4 in both the
Cosora-Admin moderation player and the buyer reel, drives an approval through the real
admin UI and reads the resulting `status` back from Postgres independently, and proves the
renamed-`.mov` rejection with a request spy rather than a toast — the brief's claim is
"rejected *before any upload attempt*", and only the spy tests that. The split follows the
boundary `chat-pipeline.spec.ts` already draws against `chat-pipeline-matrix.mjs`, for the
same reason: the failure worth catching is a correct database under a UI that has not
caught up.

None of these paths trips `enforce_product_videos_moderation` — it short-circuits on
`current_user <> 'authenticated'`, and a `SECURITY DEFINER` function owned by `postgres`
runs as `postgres`. It guards only `status` and `rejection_reason` regardless.

---

## Product search — hybrid FTS + vector (2026-09-07)

### Schema on `products`
| Column | Type | Maintained by |
|---|---|---|
| `category_name` | `text` | BEFORE `INSERT OR UPDATE OF category_id` trigger (`sync_product_category_name`, SECURITY DEFINER — `categories` has RLS) |
| `search_text` | `text` GENERATED STORED | Postgres, from own-row columns incl. `category_name` |
| `fts` | `tsvector` GENERATED STORED | Postgres — **inlines the whole expression**, because a generated column may not reference another generated column |
| `embedding` | `extensions.halfvec(1536)` | `generate-embedding` edge function via `set_product_embedding` |

Indexes: `products_fts_idx` (GIN on `fts`), `products_trgm_idx` (GIN trgm on `search_text`).
**HNSW (`halfvec_cosine_ops`) is deliberately NOT created yet** — it is built after the
backfill, per the standard "index a populated table" ordering. At 26 rows a sequential scan
is faster anyway; add it before the catalogue grows.

`halfvec` rather than `vector`: half-precision halves the index footprint at no measurable
recall cost for OpenAI embeddings. Requires pgvector ≥ 0.7 (project is on 0.8.2).

### Pipeline
`products` trigger → `pgmq` queue `embedding_jobs` → `pg_cron` (`embedding-worker`, every
minute, guarded so it fires **only** when a visible message exists **and** the Vault secret
is present) → `net.http_post` → `generate-embedding` → OpenAI `text-embedding-3-small`
(1536 dims, whole batch in one call) → `set_product_embedding` → `pgmq.archive`.

An OpenAI round-trip must never sit on the critical path of a vendor saving a listing, which
is why this is a queue and not an inline call. A message is archived **only after** the row
is written, so failure is the retry.

`pgmq` is not exposed to PostgREST (only `public` and `graphql_public` are), so the worker
reaches the queue through four SECURITY DEFINER wrappers — `embedding_jobs_read`,
`embedding_jobs_archive`, `embedding_jobs_set_vt`, `set_product_embedding` — rather than
widening the exposed schema list and putting the whole queue API on the wire for every key.

#### Throughput (rewritten 2026-09-10)
The cron dispatches `ceil(waiting / 20)` concurrent `net.http_post` calls per tick, capped
at 10. Before this it fired exactly one, which — with `BATCH = 20` per invocation — pinned
throughput at **20 jobs/minute regardless of backlog**, measured: 300 jobs drained at
exactly 20/tick, no faster with 300 waiting than with 20. That was 25 minutes before a
500-listing bulk import became searchable. It is now ~2.5 minutes; a 200-job burst drains
in **one tick / 25 seconds**.

This is safe because `pgmq.read()` sets the visibility timeout in the same statement that
returns the rows, so concurrent invocations get disjoint message sets — demonstrated on this
database (30 queued, two reads claimed 20 and 10, **overlap 0**). `VT_SECONDS = 90` exceeds
the 60-second tick, which is what makes it hold across ticks as well as within one.

The cap of 10 exists because these are real concurrent OpenAI calls; uncapped, a large
backlog converts a throughput problem into a rate-limit problem. Raise it only after
checking the account's actual rate limits.

#### Failure handling
A batch that OpenAI rejects leaves **every** message queued — that is what made the 3-day
billing outage self-healing. Added 2026-09-10: exponential backoff (90 s → 1 h, keyed on
`read_ct`) on 429/5xx so a rate-limited account is not hammered at a fixed cadence; a non-429
4xx deliberately does **not** back off, since waiting cannot fix a malformed request. Jobs
are dead-lettered to the pgmq archive after `MAX_ATTEMPTS = 5` deliveries, and input text is
truncated to 30,000 characters. Both guard the same latent failure: `search_text`
concatenates `products.description`, the table has **no length constraint**, and one
oversized row would 400 the whole batch of 20 — failing 19 innocent jobs on every retry,
permanently.

#### Vendor catalogue recompute — asynchronous since 2026-09-10
`recompute_vendor_catalog_embedding` used to run **inside** the product write trigger.
Measured at ~1,000 live listings it cost **0.45–1.4 s per write**, in the vendor's own
transaction, and was O(N²) across a bulk import. It now enqueues into
`vendor_catalog_recompute_queue` — a table keyed on `vendor_id`, so repeated writes for one
vendor collapse to a single pending row (that dedupe is why it is a table and not pgmq) —
drained by the `vendor-catalog-recompute` cron. Product writes are now **5–8 ms**.

The trade is that `catalog_embedding` is eventually consistent by up to one tick. That is
acceptable because it feeds **only** RFQ↔vendor matching; a vendor's own listings still
appear in buyer search immediately, via `products.embedding` on a different path.

#### Observability
- `embedding_pipeline_health()` — point-in-time verdict, service_role only.
- `embedding-health-log` cron (*/10) → `embedding_pipeline_health_log`, 90-day history, and
  notifies admins **on transition** into a bad state only.
- `embedding-health-alarm` cron (5-55/10) → RAISEs when unhealthy, so it surfaces in
  `cron.job_run_details`. Split from the logger because pg_cron runs each job in one
  transaction and a RAISE would roll back the log row it just wrote.
- `embedding_usage_daily` view — jobs/day/source, chars, a crude `est_usd` (~4 chars/token,
  for spotting a 10× jump, **not** an invoice) and avg/max queue lag. Needs no new logging:
  pgmq's archive already retains `enqueued_at` and `archived_at`.

#### Where the alert actually surfaces (2026-09-10)
Three places, in increasing order of how hard they are to miss:

1. **`cron.job_run_details`** — `embedding-health-alarm` RAISEs, so a bad state is a failed
   run. Requires someone to look.
2. **In-app notifications** — a transition into a non-OK state writes one `kind='system'`
   row per `profiles.is_admin`. These render in the BUYER/vendor app's `/notifications`
   (it filters no `kind` and falls back gracefully on unknown ones) and, since 2026-09-10,
   on **Cosora-Admin's System Health page**, which reads
   `admin_embedding_pipeline_health()` — a SECURITY DEFINER RPC gated on
   `super_admin`/`vendor_ops`. The log table itself stays service_role-only with RLS on and
   no policies; it is deliberately not widened to `authenticated` to make that page
   possible.
3. **An outbound webhook, opt-in.** `notify_embedding_alert_webhook()` POSTs via pg_net to
   the Vault secret `embedding_alert_webhook_url`, **CRITICAL only**. This project has no
   email sender, Slack app or webhook integration, so this is the cheapest path out of the
   app: it is completely inert while the secret does not exist (no call, no error), and an
   admin can point it at any URL that accepts a JSON POST — Slack incoming webhook, Discord,
   PagerDuty Events v2, an internal receiver — **without a redeploy**.

   WARN deliberately stays in-app. WARN is what a transient backlog produces, and paging on
   it is how an alert channel gets muted — the same reasoning behind notifying on the
   transition rather than on every 10-minute sample.

**Nobody is paged.** All three surfaces are pull, or push into a channel that must first be
configured. Closing that properly needs an on-call integration this project does not have.

`set_product_embedding` writes `embedding`, which is **not** in the enqueue trigger's column
list. That is load-bearing: without it every successful embedding would enqueue another one,
forever.

### RPCs
| Function | Used by | Notes |
|---|---|---|
| `match_products(query, query_embedding, match_count, boost_weight)` | `search_products` | RRF k=60 over two ≥40-deep lists; boost applied **after** fusion as `× (1 + 0.05 × tier)`, max 1.20 |
| `search_products(query, match_count)` | `useProductSearch` | Resolves the cached vector server-side; returns `embedding_used` so the UI can admit a keyword-only degrade |
| `related_products(p_id, match_count)` | `useYouMightLike` | Cosine NN with a same-category fallback; the two branches are mutually exclusive by construction |
| `search_suggestions(q, max_results)` | `useSearchSuggestions` | Keyword-only autocomplete over real categories / products / vendors |

All are `STABLE SECURITY DEFINER` with `set search_path = public, extensions` — pgvector's
`<=>` is unresolvable without `extensions` on the path. Because SECURITY DEFINER bypasses
RLS, the explicit `status = 'live'` filter inside each is the **only** thing keeping drafts
out of buyer results.

### Query-embedding cache
`search_query_embeddings (query_norm PK, embedding, hits, created_at, last_used_at)`, RLS on
with **no policies** — service_role / SECURITY DEFINER only. Warmed by the `embed-query` edge
function, read by `search_products`. The vector never crosses the wire to a browser.

### Edge functions
- **`generate-embedding`** — queue drainer. `verify_jwt = true` **plus** an in-handler
  `role = 'service_role'` check, because the anon key ships in the client bundle and
  `verify_jwt` alone accepts it. Anon → 403, verified.
- **`embed-query`** — buyer-facing cache warmer. Returns a status, never the vector.
  Deliberately a separate function so an auth mistake here cannot expose the drainer.
  Cost exposure documented in `claude.md`: one OpenAI call per *novel* query, no rate limit.

Both follow the project's `not_configured`-as-200 convention and carry a `{"probe":true}`
branch that reports configuration without spending a token.

---

## Key Modules

### Data access — `src/lib/queries/`
`adPerformance.ts`, `ads.ts`, `callAnalytics.ts`, `calls.ts`, `catalogues.ts`, `chat.ts`,
`follows.ts`, `forYou.ts`, `notifications.ts`, `payments.ts`, `products.ts`, `profile.ts`,
`reviews.ts`, `rfqs.ts`, `search.ts`, `subscriptions.ts`, `vendor.ts`,
`vendorAnalytics.ts`, `vendorDashboard.ts`, `vendorDocuments.ts`, `vendorOnboarding.ts`,
`vendorStore.ts`, `videoEngagement.ts`, `videos.ts`.

`search.ts` owns the search read model: `useSearchSuggestions` (debounced autocomplete),
`useProductSearch` (server-ranked results, hydrated through `fetchCatalogueByIds` so search
rows and browse rows share one mapping), and `useDebounced`. Facets are computed over the
returned result set (`SEARCH_MATCH_COUNT = 200`), not over the whole catalogue — a search
page's facet counts describe the results, which is what a buyer expects.

### Vendor store — the profile score is a contract, not a number (2026-09-08)

`calculateProfileScore()` in `vendorDashboard.ts` returns **`{ score, checks }`**, not a bare
integer. The thirteen weighted signals are evaluated once by `profileScoreSignals()`; the
score sums them and `checks` reports each one by key. Three surfaces read it and therefore
cannot disagree: the dashboard ring, the `/my-store` completion bar, and the
`/business-profile-score` checklist — whose tiles are keyed to those same signal names, so a
completed task renders a tick instead of the hardcoded "Missing" every tile used to carry.
`MyBusiness` derives its "N to add" badge from the same list.

**`DEFAULT_PROFILE_SCORE = 45` is a placeholder for a session with no vendor row, and must
never reach a signed-in vendor.** `useProfileScoreState()` enforces that: signed out returns
the placeholder, signed in but still loading returns `isLoading` so the caller renders a
skeleton, and a loaded vendor returns their real score. Returning the placeholder while
loading is what made a real vendor see 45% flash on every page load.

**Storefront presentation lives on the profile, not on the product.**
`vendor_profiles.recommended_product_ids uuid[]` holds the curated, **ordered** subset of live
products in the "Brand's Recommendations" strip. A `products.display_order` column could not
express "these four, in this order" without implying something about the other 200. The ids
are not FK-enforced — a deleted or unpublished product is filtered out on read rather than
cascading a storefront edit.

**Two writers, one picker.** `/onboarding` and `/business-profile` both write
`vendor_profiles.category`, so they share
`src/components/vendor/AddBusinessCategoriesModal.tsx` over
`src/data/businessCategoryGroups.ts`. Likewise `/reviews` and the Business Tools "Get
Reviews" tile share `src/components/vendor/ReviewLinkShare.tsx`, which generates a **real**
QR (the `qrcode` package) for `${origin}/vendor/:id` — the buyer-facing storefront where a
working review modal already lives. Both pages previously drew a lucide `<QrCode>` *icon* and
called it a QR code, and both shared a link to `/reviews`, which is the vendor's own
dashboard.

**KYC is read-only to the vendor and unverifiable by the app.** `vendorDocuments.ts` backs
`/kyc`; `vendor_documents.verified` is flipped by an admin and by nothing in this codebase, so
the only states are *not submitted*, *in review* and *verified*. Onboarding's PAN check is a
**format** check that says "Submitted for review" — it previously showed a green "Verified"
tick derived from a regex and a 1.2-second timer, which is the app vouching for a document
nobody had looked at. `saveVendorOnboarding` deletes and rewrites this vendor's rows for the
doc types it is about to insert, so a retried submit does not grow duplicates (there is no
unique constraint on `(vendor_id, doc_type)`).

**KYC documents are private, and the code makes that hard to undo (2026-09-08).** They were
in the PUBLIC `product-images` bucket, with `getPublicUrl()` stored in
`vendor_documents.file_url` — a PAN card fetchable by anyone with the URL, no auth at all
(confirmed live: an unauthenticated GET returned `200`). Now:

- `uploadKycDocument()` writes to the private **`business-docs`** bucket and returns a
  **storage path**, not a URL. `getPublicUrl()` on a private bucket returns a string that
  400s, which is worse than an error because it looks like it worked.
- The `${vendorId}/kyc/…` path shape is **required**, not cosmetic:
  `business_docs_owner_select` is `foldername(name)[1] = auth.uid() OR is_admin()`, so
  flattening the path breaks ownership.
- Reads go through `signedKycUrl()` (5-minute TTL), resolved **on demand for the one document
  being opened** — never eagerly for a list, because a signed URL is a bearer token.
- `assertKycBucket()` is called at the top of every function that touches a `/kyc/` path, so
  putting one back in a public bucket throws at the call site.
- `scripts/migrate-kyc-to-private-bucket.mjs` moved the three already-exposed objects
  (copy → verify → repoint the row → delete) and proves the negative afterwards.

**A vendor could mark their own KYC verified, and now cannot (2026-09-08).**
`vendor_documents_all` is a single `ALL` policy with `(vendor_id = auth.uid()) OR is_admin()`
on both USING and WITH CHECK, so `update vendor_documents set verified = true` from the
client worked — proved against the live project before it was fixed. The anon key ships in
the bundle, so this was a one-line self-service trust badge. The policy is unchanged (a
vendor must still read/insert/delete their own rows); a `before insert or update` trigger
(`vendor_documents_guard_review`) now refuses the four review columns to non-admins, and
`set_vendor_document_verified()` — SECURITY DEFINER, gated to support/super_admin like
`set_account_status()` — is the only way to set them. It requires a reason to reject,
clears the reason on approve, and notifies the vendor.

### Vendor analytics — three modules, one rule (2026-09-07)

`vendorAnalytics.ts`, `callAnalytics.ts` and `adPerformance.ts` are the read model behind
`/analytics`, the `/advertisements` stats strip and the `/quotes` metrics rail. They exist
because those three surfaces previously rendered fixtures, and the rule they enforce is
that **a figure is either counted from a real row or it is not shown**.

**The windowed/lifetime split is the load-bearing idea.** `WINDOW_DAYS`, `inWindow()` and
`inPriorWindow()` scope anything with a real per-row timestamp; `METRIC_SCOPE_NOTE` is the
sentence rendered beside anything backed only by a monotonic counter. Nothing may quietly
sit in between — see "A metric is windowed or it is lifetime" in `documentation/claude.md`.

| Hook / helper | Source rows | Windowed? |
|---|---|---|
| `useVendorOrderValue` → `orderValueSince()` | `quotes` (accepted) × `rfqs.quantity` | yes (`quotes.created_at`) |
| `useVendorResponsiveness` | `conversations` + `messages` | no — measured over all threads |
| `useLeadFunnelData` → `funnelForWindow()` | `rfqs`, `quotes` | yes |
| `useRepeatBuyers` | `calls` + `conversations` + directed `rfqs` | no |
| `useVendorProductRatings` | `products` (live) + `product_reviews` | no |
| `useVendorCalls` → `callAnalyticsForWindow()` | `calls` | yes (`calls.created_at`) |
| `useAdPerformance` → `revenueBookedSince()`, `campaignEconomics()` | `ad_orders` (paid) + `advertisements` | revenue yes; impressions/clicks no |

**Response time from three columns.** `messages` has `(conversation_id, sender_id,
created_at)` and no response-time field or `read_at`. Per conversation, the buyer's first
message and the vendor's first reply after it give one real first-reply delay. The headline
is a 24-hour threshold percentage rather than a mean, and a thread opened **more than** 24h
ago with no reply counts as a miss rather than as missing data; a thread opened inside the
last 24h is excluded from the percentage but still counted as awaiting a reply. "Awaiting"
keys off the thread's tail (is the newest message the buyer's?), not its head.

**Per-campaign ad revenue works around a missing foreign key.** `ad_orders` has no `ad_id`
and its `amount` is in **paise**; one order publishes one `advertisements` row per spec
item (`razorpay-verify-payment`'s `adRows()`). So each paid order's amount is divided
evenly across its `spec.items[].productId`, and each item claims the not-yet-claimed
campaign promoting that product whose `starts_at` is nearest the payment. Anything
unmatched is reported as `unattributed` so the per-campaign column always reconciles with
the vendor-wide total. Demo-published campaigns have no `ad_orders` row and book ₹0.

**`profileScoreSignals()` (in `vendorDashboard.ts`) is the single evaluation of the
fifteen profile-score signals.** `calculateProfileScore` sums that list rather than
re-testing the conditions, so the dashboard ring and the Analytics gap nudge cannot
disagree about which signals are met or what each is worth.

**The whole score pipeline is four named pieces in `vendorDashboard.ts`, and there must
never be a fifth (2026-09-09):**

| Piece | Role |
|---|---|
| `PROFILE_SCORE_COLUMNS` | the only `vendor_profiles` select list the score reads |
| `profileScoreInputFrom(row, counts)` | the only snake_case→camelCase mapping |
| `calculateProfileScore(input)` | the only formula (via `profileScoreSignals`) |
| `syncProfileScore(vendorId)` | the only writer of the column outside `fetchVendorDashboard` |

`saveVendorOnboarding()` used to carry a **second** formula — `computeProfileScore()`, nine
unweighted booleans over the in-memory payload versus fifteen weighted signals over the
rows. Same column, two authors, whichever ran last won: a vendor finished onboarding on one
number and watched it change on their first dashboard load with nothing to explain the
drop. That function is deleted; onboarding calls `syncProfileScore` instead.

Two rules come with it. **`syncProfileScore` runs LAST in any write flow** — it scores rows,
not intentions, so the step-8 product must already be inserted or `liveProduct`/`tenProducts`
score against a catalogue that does not exist yet. And it is **non-blocking at the onboarding
call site** (warns, does not throw), matching the `profiles` update beside it and the
dashboard's own write-back: the registration is fully persisted either way and the next
dashboard load recomputes the column regardless, so failing a completed submit over a derived
integer would be the worse outcome. Verified on a real vendor: stored at submit **29**,
displayed on `/business-profile-score` **29**, after the dashboard's recompute **29** — the
recompute is a no-op instead of a silent correction.

### Client stores — `src/lib/*Store.ts`
Module-level stores backed by `useSyncExternalStore` + `localStorage`, **not** React
context. Each exposes a `useX()` hook plus mutation functions: `savedStore`,
`followingStore`, `brandFollowStore`, `preferencesStore`, `profileStore`,
`recentlyViewedStore`, `notificationsStore`, `quotesStore`, `callStore`.

### Shared helpers
`src/lib/listingProducts.ts` (`ListingProduct` type + `img()` / `makeListingProduct()`,
kept JSX-free for fast refresh), `src/lib/plan.ts`, `src/lib/searchFilters.ts`,
`src/lib/categoryTaxonomy.ts`, `src/lib/i18n.ts`, `src/lib/supabase.ts`.

### Seed / mock data (still client-side)
`chatData.ts`, `freelancersData.ts`, `serviceVendorsData.ts`, `quotesData.ts`,
`buyerCategories.ts`. Service vendors, freelancers and photographers have **no `profiles`
row** — which is why `service_reviews.service_id` is `text` with no FK.

### Animation system


All vendor-side pages use a consistent **Framer Motion** animation system. The standard constants are defined at the top of each page file:

```tsx
import { motion, useReducedMotion } from "framer-motion";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number]; // strong ease-out
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };
const listContainer = { show: { transition: { staggerChildren: 0.055 } } };
const listItem = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } } };
```

Rules:
- `const reduced = useReducedMotion()` in every component; pass `variants={reduced ? {} : page}` to disable for accessibility
- `whileTap={{ scale: 0.97 }}` on every interactive button
- `whileHover={{ x: 3 }}` on ArrowRight directional icons
- Never use `transition: all` — always use explicit property transitions
- Page wraps in `<motion.div variants={page} initial="hidden" animate="show">`; sections use `variants={section}`; list items use `variants={listItem}` inside a `listContainer` parent


---

## Integrations

### Supabase
Postgres + Auth (OTP phone login, Google OAuth secondary) + Storage + Realtime +
Edge Functions. `conversations` and `messages` are in the `supabase_realtime`
publication. **The org is on the Free plan: 5 GB/month egress shared org-wide across
database, auth and storage.** Blowing it 402s the entire app. Most media constraints below
descend from this one fact.

### Edge Functions (`supabase/functions/`)
`image-search`, `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook`,
`subscription-create-order`, `subscription-verify-payment`, `subscription-webhook`.

### Payments — Razorpay


Full runbook: **`supabase/RAZORPAY.md`**. Read it before touching anything under
`supabase/functions/*razorpay*` or `*subscription*`.

Two independent flows — **ads** and **subscriptions** — share one Razorpay
account and one checkout helper, with three edge functions each
(`create-order` → `verify-payment` → `webhook`). There is **no Razorpay
Subscriptions API and no autopay**: every billing period is a discrete order the
vendor pays explicitly, which is why the subscription flow mirrors the ad flow.

Invariants that must survive any edit here:

- **Amounts are computed server-side, never accepted from the client** — from the
  placement price table (ads) or `subscription_plans` + 18% GST (subscriptions),
  at both create-order and verify time. The vendor id comes from the caller's JWT.
- **create-order must persist its intent row before the client opens Checkout.**
  Both fulfilment paths work by claiming that row; with no row a completed
  payment reports success and delivers nothing. Never let that insert go unchecked.
- **Only `not_configured` may fall back to the simulated checkout.** Any other
  create-order error must throw. Treating a real gateway failure as "not
  configured" publishes ads and activates plans for free.
- **Fulfilment is idempotent via a conditional `'created' → 'paid'` UPDATE**,
  shared by verify-payment and the webhook. Whichever lands first wins. Don't
  replace this with a read-then-write.
- **The two webhooks must keep `verify_jwt = false`** in `supabase/config.toml`;
  Razorpay authenticates by HMAC of the raw body, not a JWT. With the JWT gate on,
  every callback 401s before the handler runs and the backstop silently dies.
- **Both webhook URLs receive every `payment.captured`** for the account and
  no-op on order ids absent from their own intent table. Intended.

Secrets live only as Supabase function secrets (`RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) — never in `.env`, which is a
Vite frontend file and ships to the browser. The key **ID** is public; the key
**secret** and webhook secret must never enter the repo.

The configured account is **live mode** — checkouts move real money. Unsetting
`RAZORPAY_KEY_SECRET` reverts both flows to simulated checkout with no redeploy.

`ad_orders.status = 'refund_review'` marks a paid order that must not be
fulfilled (a Free-plan vendor who paid for ads). **Refunds are manual** — there
is no automated gateway refund call. Monitor that status.


### Video upload (TUS)
Resumable via `tus-js-client`, 6 MB chunks (Supabase rejects any other size), against the
direct `<ref>.storage.supabase.co` hostname. Import as `{ Upload }` — `{ tus }` typechecks
and fails at runtime.

### Deployment
**Primary — Vercel**: `https://textile-spark-net.vercel.app`, project
`abhishekmitraaas-projects/textile-spark-net`, team `abhishekmitraaas-projects`
(`team_m86fYQNTuPr5kMKkb6qWi32B`). Manual redeploy: `vercel --prod --yes` from the project
root (requires Vercel CLI login). GitHub auto-deploy is connected via `vercel git connect`
— pushing to `main` on `github.com/abhishekmitraaa/textile-spark-net` deploys to
production; other branches get preview deploys.

**Secondary — Lovable.dev**: syncs from the git repo automatically. Custom domains
configurable in Lovable project settings.

### Admin panel
Built, but in a **separate repo (`Cosora-Admin`)** against the same Supabase project.

---

## Testing Patterns

Established 2026-09-05, when the chat pipeline was first tested at both layers.
Follow these rather than reinventing them; each one exists because its absence
produced a wrong result.

### Two layers, and a mismatch is a FAIL

Every feature needs a **database** check (`supabase-js` against the real project,
real logins) *and* a **UI** check (Playwright driving the real app). A feature
passing one and failing the other is a failure, not a partial pass. `/notifications`
is the worked example: `notifications-check.mjs` passed 6/6, the rows were correct
in the table, the RLS was right — and the page rendered blank, because nobody had
opened it in a browser.

### Judging a write

Inherited from `Cosora-Admin/scripts/rls-matrix.mjs` and not negotiable:

- **Table UPDATE/DELETE → judge on ROWS RETURNED.** An RLS denial does not raise.
  The row is invisible, the statement matches zero rows, and PostgREST returns
  success. Append `.select()` and count.
- **INSERT and RPC → judge on the error.** A `WITH CHECK` violation and a
  `raise exception` both surface.
- **A `returns void` RPC returns no rows on SUCCESS**, so row-counting inverts it.
  `rls-superadmin.mjs` carries an `{ rpc: true }` flag on those cases.

### Fixtures

`Cosora-Admin/scripts/seed-chat-fixtures.sql` — buyerA/buyerB/vendorA/vendorB at
deterministic ids `cf00000*`, `chatfx-*@cosora.test`. Torn down by
`drop-chat-fixtures.sql`.

- **Never the demo accounts.** `messages` has no DELETE policy for any role, so
  every probe message is permanent; and a crashed run leaves a demo account
  suspended. Probe traffic goes in a throwaway pair or nowhere.
- **A fixture must not be matchable by the rules it tests.** The first version
  tagged rows `chatfx-${Date.now()}`; a 13-digit timestamp contains a 10-digit run
  starting 6-9, which is exactly what the seeded *Indian mobile number* pattern
  matches. Every regex probe was flagged by the phone pattern first. Tags are
  alphabetic now.
- **Seed the state a test needs to observe surviving.** The suspension-scope
  regression needs a live product, an active ad and a review that predate the
  suspension, and a **live paid subscription** — without the last one
  `enforce_plan_limits` raises `P0001` from a BEFORE trigger before RLS is
  consulted, and the advertisement case reports DENY whether or not the gate works.

### Assert deltas, not absolutes

`conversation_reviews`, `messages` and `account_suspensions` have **no client
DELETE policy**, deliberately. A test cannot clean them, so an absolute count
measures history rather than the test. Snapshot ids before the action and diff.

### Prove the negative has a positive

Any "X is blocked when suspended" case must also run **while active** and pass.
Otherwise a refusal for an unrelated reason — a missing column, a plan limit, a
lock left by an earlier run — reads as a working gate. Both halves, every time.

### Playwright

`playwright.config.ts` (added 2026-09-05; the repo had none, and
`tests/new-arrivals.spec.ts` probed ports 8080–8085 itself).

- **`fullyParallel: false`, `workers: 1`.** These specs flip moderation state on
  shared fixture rows against one live database; in parallel one spec's
  suspension lands mid-assertion in another.
- **No `webServer`.** Both apps are long-running dev servers a human usually has
  open (`:8080` here, `:5174` for Cosora-Admin); letting Playwright start and kill
  them makes a test run stomp on that.
- **Screenshots go to `screenshots/`, never `test-results/`.** Playwright wipes
  `test-results/` at the start of every run, so evidence written there is
  destroyed by the next spec file.
- **Auth is injected, not driven.** Sessions are minted with `supabase-js` in Node
  and written to `localStorage` under `sb-<project-ref>-auth-token` via
  `addInitScript` before the app boots. Production auth is OTP; driving the
  password form would be testing a dev affordance.
- **Assert what the user sees, not what the DOM says.** The locked-thread send
  button is checked on **computed opacity**, not `toBeDisabled()` — it regressed
  once via a Framer inline-opacity issue where the button was genuinely disabled
  while still looking enabled, and `toBeDisabled()` passes straight through that.
- **For an action with a server effect, read the server back.** The admin Resume
  button is asserted by re-reading `conversations.status` after the click. A UI
  that forgot `p_resume=true` would show the same success toast over a still-locked
  thread.

### Realtime channels are shared by topic

`supabase.channel(name)` **returns an existing channel** when one with that topic
is already open. Two components using the same hook therefore share it, and the
second `.on()` after the first `.subscribe()` throws *"cannot add
`postgres_changes` callbacks … after `subscribe()`"* — which escapes the effect and
kills the React tree. Give each hook instance its own topic suffix. React Query
already dedupes the data; the channel is only an invalidation signal.

## Known Constraints / Tech Debt

The list below is the accumulated set of invariants and known-broken things. **Items marked
as invariants must not be "tidied" away** — each one records a bug that already happened.

- **DO NOT RUN `supabase db push` against this project until the migration history is reconciled (2026-09-05).** This repo has never been linked — `npx supabase migration list` fails with `LegacyProjectNotLinkedError` — and every migration applied this week went in through **Supabase MCP `apply_migration`**, which records the remote history under the *name* passed to it with a fresh version timestamp, not under the local filename. So `20260802130000_notifications.sql` and its siblings are live, but a linked `db push` would not recognise them by version and would try to reapply them. One file has already been deleted for this reason: the local T10.3 fix duplicated the applied `restrict_notifications_update_to_read_column` under different object names, and pushing it would have installed a **second, redundant trigger** rather than replacing the live one. Reconciling means: link, `db pull`, then repair `supabase_migrations.schema_migrations`. It needs an access token and DB password, and has not been done.
- **Chat-pipeline test fixtures no longer exist (2026-09-05).** `Cosora-Admin/scripts/chat-pipeline-matrix.mjs` and both chat Playwright specs depend on the `chatfx-*` and `rlstest-*` accounts, which were deleted after the test pass (they were logins with a known password in a live database). Re-run `seed-chat-fixtures.sql` **and** `seed-test-admins.sql` before the suite will execute. The scripts are unchanged and still correct; only the rows are gone.
- **`20260905170000_approve_vendor_content_clears_rejection_reason.sql` is written but NOT applied (2026-09-05).** `approve_vendor_content()`/`approve_vendor_content_bulk()` currently `CREATE OR REPLACE`d only in this file — the Supabase MCP connection was down for the entire session that wrote it (every MCP tool call failed, same disconnect pattern as the T10.3 entry above), and neither repo holds a service-role key or a linked CLI project to apply DDL another way. Confirmed still-live behavior in the interim: approving a video/product does not clear a stale `rejection_reason`, reproduced against the live DB with a throwaway row. Do not assume this migration is active just because the file exists — the exact throwaway-row sequence in the 2026-09-05 changelog entry above is how to confirm it once it is.
- **`products.colour` is ONE text value, and every writer truncates to it (invariant, 2026-09-08).** The upload taxonomy exposes colour as a multiselect, as free text, and as a single select (`resolveColour()` in `Upload.tsx`), and onboarding's step-8 chips are multi-select — but the column is singular, so the first pick is what lands on the listing. **Both forms say so on screen** rather than accepting four colours and silently storing one. Do not "fix" this by adding a second `colours text[]` column: two colour columns with only one of them read is worse than the truncation. If plural colours are wanted, migrate the readers first.
- **`npx tsc --noEmit` with no `-p` compiles nothing here and reports 0 falsely (invariant).** Use `npm run typecheck` (= `tsc --noEmit -p tsconfig.app.json`). The 23-error baseline was cleared on 2026-09-08 and the project has typechecked at **0** since; a bare `tsc --noEmit` also reports 0, so the number alone does not tell you which command ran. eslint baseline is **5 errors / 17 warnings** as of 2026-09-09 (shadcn primitives ×2, `payments.ts` async promise executor, `tailwind.config.ts` `require()`, one `any` in `admin-chat-moderation.spec.ts`).
- **New accounts CAN be created for tests, with two caveats (revised 2026-09-09).** The 2026-09-08 note that this was impossible was too strong. `auth.signUp` through the real `/register` form works and provisions `profiles` correctly — `zz-mp4-vendor@cosora.in` was created that way. The caveats: (1) `.test` and `example.com` addresses are rejected as invalid, `@cosora.in` is accepted; (2) **Supabase's built-in SMTP rate-limits hard** — a few signups per hour and the next returns `email rate limit exceeded`, which is why `tests/vendor-signup.spec.ts` fails intermittently with no defect behind it and why real signups will be rejected in production until custom SMTP is configured. Email confirmation is ON and the throwaway domains have no inbox, so confirmation is done out of band with the direct-SQL equivalent of `admin.updateUserById({ email_confirm: true })` (`update auth.users set email_confirmed_at = now()`), via Supabase MCP — there is no service-role key in this environment. Known passwords: `demo-vendor`, `demo-buyer`, and `zz-mp4-vendor@cosora.in`.
- **`vendor_contracts` append-only, and the two things that make it true (invariant, FIXED 2026-09-09).** The table has select + insert policies and no update or delete for anyone, admins included — "an editable contract is not evidence". That was bypassable: `vendor_contracts.vendor_id` referenced `vendor_profiles(id)` **ON DELETE CASCADE** and `vprofiles_write` was one `ALL` policy including `id = auth.uid()`, so a vendor could delete their own profile row from the browser and take every signed contract with it (demonstrated — demo-buyer's contract count went 1 → 0 through an anon client). Both halves are now load-bearing and **neither may be relaxed alone**: the FK is `ON DELETE RESTRICT`, and DELETE on `vendor_profiles` is a separate admin-only policy (`vprofiles_delete`) split out of the old `FOR ALL`. RESTRICT alone still lets a vendor delete their profile; an admin-only policy alone still lets an admin erase contracts by cascade. Nothing in the product deletes a `vendor_profiles` row — a profile that should stop existing is deactivated via `set_account_status()`, the same way an order is not un-created. Re-verify with `node scripts/vendor-contract-integrity-check.mjs` (6/6), which reads the row back on every assertion because an RLS-denied DELETE matches zero rows and returns success.
- **One signature per `(vendor_id, agreement_version)` — enforced by a TRIGGER, not a unique constraint (invariant, FIXED 2026-09-09).** A retried onboarding submit used to insert a second permanent contract that nothing could remove. `trg_vendor_contracts_one_per_version` skips the duplicate insert, and `saveVendorOnboarding()` also checks first so the normal retry path never depends on the trigger firing. **Do not "tidy" this into `unique (vendor_id, agreement_version)`:** vendor `9ddda61f-…` deliberately retains two rows at `2026-09-v1` as the record of the bug, a unique constraint cannot be created over existing duplicates, and Postgres has no NOT VALID for unique constraints (only CHECK and FOREIGN KEY) — the alternatives were deleting the evidence or hardcoding a UUID into a partial index. The trigger **skips rather than raises** because a retried submit has already persisted everything else and the contract demonstrably exists; that is idempotency, not the silent-authorization-denial trap. A re-sign after `SUPPLIER_AGREEMENT_VERSION` changes is a different version and still inserts.
- **Storage is not covered by a row delete, and there is no cascade (invariant, FIXED 2026-09-09).** Re-submitting KYC rewrote the `vendor_documents` row and stranded the old identity scan in `business-docs`, referenced by nothing and indistinguishable afterwards from a real vendor's. `saveVendorOnboarding()` now reads the `file_url`s about to be replaced **before** the row delete and removes them **after** it succeeds — that order is deliberate, so a failed storage delete leaves a harmless orphan instead of a live row pointing at a missing file. Best-effort by design: a registration must not fail over tidying. `node scripts/purge-orphaned-kyc-objects.mjs` clears what already accumulated (12 → 0); it *computes* the orphan set rather than taking a hardcoded list, and deletes as each object's owner under RLS rather than with a service-role key. **The same rule applies to any test that uploads** — see the note on `vendor-onboarding-write-path.spec.ts` below.
- **`/onboarding` has no role gate, and that is intentional (2026-09-09).** `uploadKycDocument()` has exactly one call site (`Onboarding.tsx:224`) and the route carries no guard in `App.tsx` and no role check in the page, because "Buyer → Vendor requires completing full vendor onboarding first" — a buyer walking into `/onboarding` is the intended way to become a vendor, and finishing it sets `active_role = 'seller'`. This is why `11111111-…` (**demo-buyer@cosora.dev**, a live account) had KYC objects at all. **Residual gap:** a buyer who *abandons* onboarding after uploading a PAN leaves identity documents under an account with no `vendor_profiles` row and no vendor-side `/kyc` page to manage them.
- **CIN is collected, Aadhaar is not, and that split is deliberate (2026-09-09).** Both used to be dead state feeding a payload that could only carry null. CIN now has an optional input and its own upload; it is optional permanently until an entity-type field exists, because only MCA-registered companies and LLPs have one and nothing in the form distinguishes a proprietorship. **Aadhaar is not built and the step-1 checklist no longer asks for it** — retaining Aadhaar numbers/images is constrained by the Aadhaar Act 2016 / UIDAI rules outside an authorised KUA/AUA, and PAN already identifies the entity. The payload key, column and `doc_type` are retained so readers do not break. `saveVendorOnboarding()` no longer hardcodes `file_url: null` for gst/cin: all three types upload through one `makeKycUploadHandler` factory into the same private bucket and path shape, so a fourth type cannot drift.
- **`profiles_id_fkey` makes `handle_new_user`'s conflict path unreachable — and `information_schema` will not tell you that (2026-09-09).** The constraint is `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE`, so a `profiles` row cannot pre-exist its auth user and a deleted auth user takes its profile with it. A query against `information_schema.constraint_column_usage` filtered to `table_schema='public'` returns **nothing** for it, because the referenced table lives in the `auth` schema — that produced a wrong conclusion once. **Use `pg_constraint` for cross-schema foreign keys.** The handler's `on conflict do update` is defence in depth, not a live fix: it can only fill nulls, and only overwrites `active_role` when signup metadata explicitly named a whitelisted role. (`active_role` is `NOT NULL DEFAULT 'buyer'`, so "update it when null" is not a thing that can happen.)
- **`src/components/buyer/BuyerHomeTabs.tsx` is dead code and cost a test a false diagnosis (2026-09-09).** Nothing imports it. `tests/new-arrivals.spec.ts` was written against it and timed out on `[role="tab"]`, which looked like a stale selector; the real strip is inline in `NewArrivals.tsx` and had no tablist semantics and an active state **hardcoded** to `/home/new-arrivals` rather than derived from the route. The inline strip now carries `role="tablist"`/`role="tab"`/`aria-selected` and derives selection from `useLocation()`. The dead component is intentionally left in place for now — deleting it while another session was active in the repo was the riskier move — but it is a duplicate that will drift again.
- **Relaxed TypeScript Config**: `noImplicitAny` and `noUnusedLocals` are disabled; enforce stricter checks before production if needed.
- **Lovable Integration**: The project uses Lovable's `componentTagger` plugin in dev mode for component metadata.
- **Port**: Dev server runs on `localhost:8080` (non-standard, configured in vite.config.ts).
- **Current Phase**: Porting and correcting Vendor and Buyer UIs (from Next.js source to Vite/TSX). The admin panel **is** built — it is a separate repo (`Cosora-Admin`) against the same Supabase project, and it owns some of this project's migrations (`resolve_conversation_review`, `regex_probe`, the `admin_flags` CHECK). Check both `supabase/migrations/` directories before assuming a function is missing.
- **Bundle Size Warning**: JS bundle is ~1.9MB (522KB gzip). Not an error but worth code-splitting before scaling.
- **Video Closeup Terminology**: Product videos shown in the buyer feed are called **"Video Closeups"** — never "Reels". This is a deliberate brand/product naming decision.
- **Video Closeups — media rules (2026-07-31).** The whole feature is constrained by one fact: **the Supabase org is on the Free plan, so 5 GB/month egress is shared across database, auth AND storage, org-wide.** Blowing it 402s the entire app, not just video. Consequences that must not be undone:
  - **Uploads are capped at 50 MB / 60 s, enforced at BOTH the client and `storage.buckets.file_size_limit`.** 50 MB is the Free-plan ceiling — a bucket limit cannot exceed the project's global file size limit, and Free caps that at 50 MB. To reach 90 MB: upgrade to Pro, raise *Global file size limit* in Storage → Settings **first** (dashboard-only), then bump `MAX_VIDEO_BYTES` and the bucket.
  - **The bucket MIME allowlist must keep `image/jpeg` + `image/webp`.** Posters are written to the *same* `product-videos` bucket; a video-only allowlist makes the poster upload throw *after* the video object exists, so every upload half-succeeds with an orphan and no row.
  - **`video/quicktime` is deliberately excluded.** iPhone `.mov` is HEVC — plays on Safari, fails on Chrome/Android — and there is no transcoding step.
  - **Uploads are TUS-resumable** (`tus-js-client`, 6 MB chunks — Supabase rejects any other size — against the direct `<ref>.storage.supabase.co` hostname). Import it as `{ Upload }`; `{ tus }` typechecks and fails at runtime.
  - **The viewer must stay windowed.** `SLIDE_WINDOW` + preload-by-distance keeps at most 3 `<video>` elements in the DOM regardless of catalogue size. Don't reach for `react-window`/`react-virtuoso` — they fight scroll-snap and force the IntersectionObserver to re-observe. Don't add `ffmpeg.wasm`: threading needs COOP/COEP, which breaks third-party payment iframes, and **this project runs live-mode Razorpay Checkout**.
  - **No mock fallback in production.** `devOnlyVideoCloseUps()` returns `[]` outside dev. An empty catalogue is meant to render empty — rails omit themselves, `/video-closeups` shows an empty state. Do not "fix" that by seeding demo rows; if a populated demo state is ever wanted, write it as a tracked migration.
  - `product_videos.provider` (default `'supabase'`) is the exit ramp to Cloudflare/Bunny Stream. Suggested trigger points: >50 live videos, >2 GB/month storage egress, or the first vendor codec complaint.
- **Video Closeups — moderation invariants (2026-08-01, migrations `20260801085830`, `20260801100223`, `20260801100327`, `20260801102505`).** An adversarial audit found vendors could publish straight to the buyer feed. Things that must not be undone:
  - **`product_videos.status` defaults to `'under_review'`, and `trg_product_videos_moderation` is what actually enforces it.** The default used to be `'live'` — the only moderated table like that — so a vendor omitting the field published themselves. Do not "tidy" the default back, and do not assume RLS covers this: `pvideos_write` constrains `vendor_id` and says nothing about `status`, because *which transitions are legal* belongs in a BEFORE trigger. That is where `products` already puts it (`enforce_products_moderation`), and `product_videos` now mirrors it. The client sending `status:'under_review'` is convention, not a boundary.
  - **The trigger's `current_user <> 'authenticated'` early return is load-bearing.** It is how the `SECURITY DEFINER` moderation RPCs (owned by `postgres`) are still able to flip a row to `live`. Remove it and approve/reject stop working.
  - **`rejection_reason` is moderator-only, enforced by the same trigger** — nulled on insert for non-moderators, immutable on update. Without those clauses the column is vendor-writable (RLS lets them PATCH their own row), i.e. a vendor could erase the moderator's stated reason.
  - **Three moderation verbs, and the asymmetry between them is deliberate.** `approve_vendor_content(target_table, target_id)` and `reject_vendor_content(target_table, target_id, reason)` are **per item**; `approve_vendor_content_bulk(target uuid)` is the original vendor-wide function, renamed rather than recreated, and still flips every pending product + video + catalogue that vendor owns. **Approve is gated on `status='under_review'` and raises `P0002` on a draft or already-live row; reject may act from any status** so a live item can be taken down. Approving something already live is not a meaningful action and must not report success while doing nothing.
  - **No dynamic SQL in the moderation RPCs.** `target_table` is matched against a fixed list with a static `UPDATE` per branch; a text table name interpolated into `EXECUTE` inside a `SECURITY DEFINER` function is an injection vector. Unknown table → `22023`, nothing matched → `P0002`. All three verbs carry the same ACL (no `EXECUTE` to `PUBLIC`).
  - **`resumableUpload()` returns the object path; the caller must persist *that*, not the path it proposed.** tus fingerprints on `{name,type,size,lastModified,endpoint}` with **no `objectName`**, so a reload-and-resubmit resumes the previous session — bound server-side to the previous object — while a freshly minted path would be recorded. That combination produced a row whose `video_url` 404s plus a fully-uploaded orphan that `deleteProductVideo()` can never find. Path adoption is guarded on the folder prefix so a shared browser cannot resume into another vendor's folder.
  - **A failed duration probe must block submission.** `probeVideoFile()` returning null means the 60s cap was never checked; the only remaining limit is the 50MB byte cap, which at a low bitrate is many minutes of video. Also reset `probe` when a new file is picked — a stale probe means the previous file's duration is checked and persisted against the new upload.
  - **`VideoCloseUpsPage`'s `openList` snapshot exists to freeze reel order while the viewer is open** (bookmarking re-ranks, which would reshuffle slides mid-scroll). Keep the freeze, but it must re-arm when real rows supersede `devOnlyVideoCloseUps()` — that helper returns its samples synchronously while the query is pending, so a naive snapshot latches onto dev clips and never re-syncs. Production is unaffected (the helper returns `[]`), but in dev the reel otherwise shows fake clips even with real rows in the table, which makes hand-testing the feature actively misleading.
  - **`views_count` is currently dead data and is still the SQL sort key.** Nothing writes it (`increment_product_view` exists for products; there is no video equivalent), and `.limit(30)` is applied by `views_count desc` *before* client-side ranking — so every real upload sits at 0, the top-30 tiebreak is arbitrary, and a video ranked 31st can never surface. Likes and video saves are local component state and never reach `saved_items`/`saved_folder_items`, while *product* saves do. Known and deliberate; building real counters is a product decision, and the fix is a rate-limited `SECURITY DEFINER` RPC, never loosening `pvideos_write`.
- **Chat moderation — invariants (2026-08-01, migration `20260801095820`).** The chat pipeline is now moderated server-side. Things that must not be undone:
  - **`profiles.account_status` is the account-level suspension flag** (enum `account_status_type`). It replaced `vendor_profiles.account_status`, which was dropped — suspension has to be account-level because the same human toggles between buyer and vendor, so a vendor-table flag cannot stop them messaging as a buyer. `account_suspensions` is the audit ledger, **not** the live flag.
  - **`set_account_status()` is the ONLY writer of both.** `account_suspensions` deliberately has no INSERT/UPDATE/DELETE policy for any role, and a BEFORE trigger on `profiles` rejects direct `account_status` changes from `authenticated`. Do not "fix" that by adding a write policy — `profiles_update` allows `id = auth.uid()`, so a suspended user could otherwise self-reinstate.
  - **`conversations.status` is not participant-writable, for the same reason.** `conversations_update` allows either participant, so `enforce_conversation_status()` gates the column (participants blocked, support/super_admin allowed). A lock a participant can unlock is not a lock.
  - **Blocklist vs. flag are different mechanisms and must stay separate.** `check_message_blocklist()` is BEFORE INSERT and *raises* — no row, and nothing is flagged. `check_message_flag_patterns()` is AFTER INSERT and *keeps* the message (support needs to read it) while locking the thread. Both are `SECURITY DEFINER`, and for the blocklist that is load-bearing: `keyword_blocklist` is admin-only under RLS, so as SECURITY INVOKER it would read zero rows and silently never fire.
  - **`flag_patterns.pattern` is CHECK-validated** (`('' ~ pattern) is not null`). Without it one malformed regex raises on every message insert and takes chat down platform-wide.
  - **`messages_insert` requires conversation `status='active'` AND sender `account_status='active'`** on top of the ownership/membership check. This is the real gate; the Phase 2 UI disabling the composer is only cosmetic on top of it.
  - **`reported_reason` and `reason_id` are two different facts** (added `20260801154739`). `conversation_reviews.reported_reason` is free text — what the *reporter* claimed, straight from the Report modal. `reason_id` is the *admin's* verdict, an FK into the curated `chat_block_reasons`. Do not collapse them: the whole point is being able to see where a reporter and a reviewer disagreed. `reported_reason` is deliberately un-CHECKed — the seven `REPORT_REASONS` strings are UI copy, and constraining schema to UI copy makes a rewording into a migration.
  - **`submit_report()` is `(uuid, uuid, text DEFAULT NULL)` and must stay a single overload.** The third parameter was added by DROP-then-CREATE, not `CREATE OR REPLACE`: a defaulted extra parameter creates a *second* function, and the two-argument call site then fails with "function is not unique". If you ever extend it again, drop first.
  - **`conversations` is in the `supabase_realtime` publication** (alongside `messages`), so a lock/unlock reaches both parties live. Its **REPLICA IDENTITY is deliberately DEFAULT, not FULL** — `bump_conversation()` fires an UPDATE on every message sent, and FULL would write every column of every one of those to the WAL on a Free-plan project, for a `payload.old` nothing reads.
  - **A locked conversation CAN now be unlocked — that was not true before 2026-09-05.** Until `resolve_conversation_review()` shipped (Cosora-Admin migration `20260802120000`) there was no unlock path at all: `enforce_conversation_status()` permits support/super_admin to change the column, but `conversations_update`'s USING clause is participants-only, so an admin's UPDATE matched **zero rows and PostgREST returned success**. The panel would have reported a resumed chat that was still locked. The fix is a `SECURITY DEFINER` RPC, deliberately **not** a widened `conversations_update` — widening it lets an admin bypass the trigger's gating entirely, which is a bigger hole than a purpose-built function. Do not "simplify" it back into a policy.
  - **`resolve_conversation_review(p_review_id, p_verdict, p_reason_id, p_resume)` defaults `p_resume` to FALSE.** A verdict closes the review and leaves the thread locked unless the caller asks to reopen it; the admin UI asks, per case. `'kept_locked'` never resumes regardless of what is passed. Both settings are safe because `messages_insert` independently requires the **sender's** account to be active — reopening a thread cannot undo a suspension. The UPDATE is guarded by `and status = 'pending'`, so a double-click or a second admin gets `P0002` instead of overwriting the first decision and its `reviewed_by`.
  - **Flag patterns are POSIX ARE, so the word boundary is `\y`, NOT ``.** In Postgres `` is a **backspace character**. A `` pattern passes `flag_patterns_pattern_valid` (which only proves it COMPILES), saves without complaint, and then silently never matches anything. Two of the three seeded patterns were originally written with `` and were verified dead against the live DB before being corrected. `regex_probe(pattern, sample)` exists so the admin UI can test against the real engine — **never** `new RegExp()`, which is ECMA-262: it throws on one of these patterns and silently reads `\y` as a literal "y" in another. The seed migration `20260802130200` asserts its own patterns fire, and that they do not fire on ordinary trade talk.
  - **`keyword_blocklist` is deliberately EMPTY and must stay that way absent a human naming a term.** A blocklist hit is a hard stop with **zero review trail** — no message row, no lock, no queued review — so support cannot see what was blocked or that anything was. `chat_block_reasons` and `flag_patterns` are seeded (`20260802130200`); the blocklist is not.
  - **`notifications` is written ONLY by `SECURITY DEFINER` functions** (`20260802130000`). No insert policy exists for any role and `notify()` carries no EXECUTE grant for any role — both are load-bearing, since a client that can forge a row can forge *"Your account has been reinstated"*. Copy is read by buyers and vendors, never admins, so it must never name the reporter, the matched pattern, the verdict or the reason; `submit_report()`'s notice is deliberately **identical** to a pattern-triggered lock, because saying a report happened identifies the reporter by elimination in a two-person thread.
  - **`admin_flags.entity_type` is `text` but CHECK-constrained** (`20260802140000` widened it to include `'conversation'`). It is not free text; adding a value without widening the constraint fails 23514 on insert.
- **Suspension enforcement — scope (2026-09-05, migration `20260802150000`).** `account_is_active(uuid)` is ANDed onto the INSERT policies of `rfqs`, `quotes`, `products`, `product_videos`, `advertisements`, `reviews`, `product_reviews` and `service_reviews`. What that does and does not mean:
  - It stops a suspended account **creating** things. It does **not** hide content that is already live, does **not** stop a **running** ad campaign (`advertisements` is activated by an UPDATE after payment — `advertisements_insert` even requires `status <> 'active'` — so gating the INSERT cannot reach one that is already serving), and does **not** end an in-progress session.
  - **`product_videos` was split** from the single `pvideos_write` FOR ALL policy into `pvideos_insert` / `pvideos_update` / `pvideos_delete`, with the gate on INSERT only. Gating the FOR ALL policy would also have stopped a suspended vendor **deleting their own videos**, which is not content creation and should stay possible.
  - `account_is_active()` coalesces to **FALSE** for a missing profiles row. A content-creation gate fails closed.
  - Verified by `scripts/suspension-gate-check.mjs`, which runs each case **twice** — active and suspended — and passes only if the answer CHANGES. That pairing caught a real false pass: the demo vendor's subscription had lapsed, so `enforce_plan_limits` was refusing the ad insert with `P0001` from a BEFORE trigger long before RLS was consulted, and the suspended-only half looked like a working gate.
- **`vendor_profiles` is world-readable and that includes `phone` (known, 2026-09-05).** `vprofiles_select` is `USING (true)`. `VendorProfile`'s contact gating is a **UI** rule — it holds (a signed-out visitor sees a sign-in prompt, and the Website Address row is gated on the same resolved value) — but the anon key can read `vendor_profiles.phone` straight from PostgREST. Confirmed against the live project. Closing it means column-level restriction or a public view, which is a marketplace-discovery decision, not a bug fix. `scripts/contact-gate-check.mjs` records it as INFO so it cannot quietly change unnoticed.
- **Reviews — invariants (2026-08-01).** Four surfaces write reviews into three tables (`reviews`, `product_reviews`, `service_reviews`); `useMyReviews()` fans out to all three for `/profile/reviews`. Things that must not be undone:
  - **A review subject id must be the resolved entity id, never the route param.** `reviews.vendor_id` and `product_reviews.product_id` are real `uuid` FKs, but buyer-side vendor links carry **slugs** (`prezel`, `maison-lyra` — see `followingStore.ts`). `VendorProfile` submitting `id ?? "1"` was silently losing every review written from a mock vendor page with a `22P02` uuid cast error. Submit `vendor.id` / `row.id`, and **hide the Write-a-Review CTA when there is no real row** — an affordance whose insert can only fail is worse than no affordance.
  - **`service_reviews` is the exception: `service_id` is `text` with no FK**, because service vendors, freelancers and photographers are still client-side seed data. Read and write must use the *same* canonical seed id or the review writes to one key and is read from another.
  - **Review photos live in the `product-images` bucket under `${buyerId}/reviews/…`**, not a new bucket. That bucket's insert policy is uploader-scoped (`(storage.foldername(name))[1] = auth.uid()::text`), so a buyer may write under their own uid folder, and it is public so the photos read back on the product page — the same trick `rfqs.ts` uses. **Capped at 4 photos / 2 MB**: Free-plan egress is 5 GB/month shared org-wide and these are re-read on every product page view. Only `product_reviews` has a `photos` column.
  - **`undefined` photos means "leave stored photos alone"; `[]` means "clear them".** Build the payload by conditional spread — a `Record<string, unknown>` defeats Supabase's generated Insert/Update types.
  - **Never substitute a placeholder image for a missing review subject.** `products_select` RLS is `status='live' OR own OR admin`, so an unlisted product returns a null join; the page previously fell back to a random picsum photo, showing a real review beside an unrelated product. Render a neutral tile, say "no longer available", and drop the link.
  - **My Reviews must keep signed-out / loading / error / empty as four distinct states.** The query is `enabled: Boolean(user)`, so collapsing them makes a broken page look exactly like an empty one — which is how the write bug above went unnoticed.
- **App-wide React Query defaults (2026-07-31)**: `App.tsx` now sets `staleTime: 60_000`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`. It was a bare `new QueryClient()`, i.e. `staleTime: 0`, so every query in the app refetched on every mount and every tab focus. Individual queries override where they need to (`useVideoCloseUps` 5 min, `useMyVideos` 30 s).
- **Settings Page (vendor)**: `/settings` is the **vendor** Settings page (`VendorSettings.tsx`) — Business (→`/business-profile`), Notifications (email/push toggles), Language, Security (email/phone + Log Out), Help & Legal. Both seller "Settings" entry points (sidebar secondaryNav + the MyStore App-and-User-Setting menu row) point here. The **buyer** side still has no dedicated Settings page — buyer sidebar "Settings" links to `/profile` (known bug, out of scope until a buyer pass).
- **No Orders Page**: There is no `/orders` route. "Track Orders" maps to `/requirement/my-quotes`; "View Order Details" maps to `/chat`.
- **`accent` / `primary` tokens are the BUYER coral, not vendor blue**: in `src/index.css` both `--accent` and `--primary` are `352 85% 62%` (`#ef4d62`). So `bg-accent`, `bg-primary`, `text-accent`, and a default shadcn `<Button>` all render coral. On a **vendor** page that silently breaks the brand rule (vendor CTAs must be `#256fef`). Vendor pages therefore hardcode `bg-[#256fef]` / `text-[#256fef]` (hover `#1d5ed6`). If a vendor page looks pink, this is why. `/cosora-studio` was fixed this way on 2026-07-26.
- **Role context does not follow the signed-in account**: `UserRoleContext` initialises `role` to `"buyer"` and never seeds it from `profile.active_role`. Signing in as a vendor still starts the UI in buyer mode until the sidebar SWITCH MODE toggle is used, so role-aware links (e.g. `ChatThread`'s `goQuote`, the quote cards) resolve to the buyer target until then. Known papercut, deliberately not fixed (2026-07-27).
- **Shared page, two navs**: `/cosora-studio` is listed in **both** `buyerNavigation` and `sellerNavigation` in `DashboardSidebar.tsx`. It is styled vendor-blue, so in buyer mode the coral sidebar sits beside a blue page. Deliberate, not a regression.

- **`memory/` does not exist in this repo (found 2026-09-05).** The previous CLAUDE.md
  instructed every session to read `memory/MEMORY.md` and `memory/cosora_platform.md`; no
  such directory is present. That instruction has been dropped in favour of this
  `documentation/` system.
- **Unit/integration tests are not configured** — Playwright E2E only, with a single spec.

---

## Skills Installed

- **`design-taste-frontend`** — general frontend design taste skill for polished UI.
- **`emil-design-eng`** (`emilkowalski/skill`) — Emil Kowalski's philosophy on UI polish,
  micro-interactions, animation decisions, invisible details. Invoke with
  `/emil-design-eng`.
