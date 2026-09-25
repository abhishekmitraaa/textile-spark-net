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
`supabase/migrations/` (115 as of 2026-09-24, after the My Profile brief's Phase 16). **The Cosora-Admin repo owns some migrations
against the same Supabase project** (`resolve_conversation_review`, `regex_probe`, the
`admin_flags` CHECK) — check both `supabase/migrations/` directories before assuming a
function is missing.

**Neither repo, nor both together, can build this schema from scratch (measured 2026-09-23).**
Of 162 versions in `supabase_migrations.schema_migrations`, **45 have no file in either repo**,
including all 21 from 2026-07-04/05, which create `profiles`, `rfqs`, `quotes` and
`vendor_profiles`. Their SQL survives only in `schema_migrations.statements`. Separately,
most committed files are named by their authored timestamp while the live version differs
(`MIGRATIONS.md`: "Live version ≠ filename"), so a raw URL built from a live version 404s
even when the file is committed. From 2026-09-23 the lead-cap and subscription migrations
are named by their live version.

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

### Plan caps — the lead cap counts what the dashboard shows, and holds under concurrency (2026-09-16, 2026-09-23)

`get_vendor_plan()` is the source of truth for what a vendor is shown; the four BEFORE
triggers (`enforce_product_cap`, `enforce_lead_cap`, `enforce_catalogue_plan`,
`enforce_ad_location_scope`) enforce it and must agree with it. For leads they did not.

- **What counts.** A lead is a distinct **open-marketplace** RFQ (`rfqs.vendor_id is null`)
  the vendor quoted inside the window. The window is the subscription period for an active
  paid plan, otherwise the calendar month. A reply to a request **addressed to the vendor**
  (`rfqs.vendor_id = vendor`) is not counted, and, since Andy's decision of 2026-09-22, is
  never refused either. `enforce_lead_cap()` returns early for it before any cap lookup.
- **Why the counting and the target check are SECURITY DEFINER helpers.**
  `enforce_lead_cap()` is SECURITY INVOKER and must stay so. Its first line,
  `if current_user <> 'authenticated' then return new`, is how it tells a signed-in request
  from a migration or service_role, and inside a definer function `current_user` is the
  owner, so the cap would silently switch off. But running as the vendor, anything it reads
  from `rfqs` is filtered by `rfqs_select`, which shows a targeted RFQ to its vendor only
  while `status = 'active'`. So an in-trigger join or lookup gets **closed** RFQs wrong:
  - a count would drop quotes on RFQs closed since, handing the slot back (a cap bypass;
    shown 7 vs 8 in a purpose-built rolled-back scenario). This still matters after the
    closed-RFQ rule below, because the count covers quotes made before the RFQ closed;
  - a target lookup would read NULL (the vendor's own read of a closed RFQ returns 0 rows,
    shown over real HTTP). The closed-RFQ rule now refuses that quote before the lead cap
    runs, so this helper is defence in depth.
- **The helpers.** `lead_cap_used(p_vendor, p_since)` (migration `20260916181213`) and
  `rfq_targets_vendor(p_rfq, p_vendor)` (`20260923074903`). Both are
  `STABLE SECURITY DEFINER`, `search_path = public`, and raise `42501` unless `p_vendor` is
  the caller or an admin. `is distinct from` keeps that closed with no JWT. EXECUTE goes to
  `authenticated` + `service_role` only, because the trigger runs as the vendor and needs it;
  anon is revoked by name, not just PUBLIC. `rfq_targets_vendor` deliberately returns a
  boolean for the caller, not the RFQ's target vendor id: a definer function returning
  `rfqs.vendor_id` for any id would reveal to any signed-in user what `rfqs_select` hides.
- **A quote needs an RFQ open to that vendor** (`enforce_quote_rfq_open()`, trigger
  `trg_quotes_accepting_rfq`, BEFORE INSERT OR UPDATE OF `rfq_id, vendor_id`, migration
  `20260923081708`). The rule: `rfqs.status = 'active'`, and a request addressed to a vendor
  may only be quoted by that vendor.
  - It applies to every role. It is SECURITY DEFINER because it must read the RFQ whatever
    its visibility, and it has no `current_user` test for definer rights to break. EXECUTE is
    revoked from every client role; a trigger function fires without it.
  - BEFORE INSERT fires before ON CONFLICT is resolved, so `submitQuote()`'s upsert cannot
    revise a quote on a closed request. An UPDATE that keeps both ids (the buyer's accept or
    reject, the upsert's DO UPDATE) returns at once.
  - Name order (`trg_quotes_accepting_rfq` < `trg_quotes_lead_cap`) makes it fire first, so
    a closed request reports `P0001 This request is closed…`, not a cap hit. A request
    addressed to another vendor gets `42501`.
- **Concurrency: one cap check per vendor at a time** (migration `20260923082118`).
  `enforce_product_cap()` (after its "takes a slot" early return) and `enforce_lead_cap()`
  (after its INSERT-only early return) take `pg_advisory_xact_lock(hashtext(vendor_id::text))`
  before counting.
  - Without it, real concurrent HTTP inserts at one free slot got through 2–5 at a time:
    product cap over in 5 of 5 rounds (peak 6/2), lead cap in 4 of 5 (11/10). With it,
    exactly 1 of 10 and 1 of 20 in all 20 rounds, at the same latency (~0.3–1.0 s per batch of
    10–20).
  - Correct only because each plpgsql statement in a VOLATILE function takes a fresh snapshot
    under READ COMMITTED, which is PostgREST's default. The waiter's count therefore sees the
    row the holder committed.
  - The key is per vendor, so vendors never wait on each other. The two triggers share the
    key, so one vendor's product and quote writes queue behind each other for milliseconds.
    Nothing else in the database takes advisory locks.
  - `enforce_ad_location_scope()` and `enforce_catalogue_plan()` take no lock: each checks
    only the row being written and counts nothing, so there is no race to close. The
    migration's final block proves each function changed by exactly the lock lines (md5 of
    the new definition minus the block = md5 before).
- **Re-runnable live checks,** all real HTTP as `loadtest-*` accounts, writing only
  `[LOADTEST]` rows on `[LOADTEST]` RFQs. **Since the 2026-09-23 cleanup those accounts no
  longer exist, so none of these runs until a new load-test population is created:**
  - `scripts/lead-cap-repro.mjs`: count agreement.
  - `scripts/targeted-lead-cap-check.mjs`: the targeted exemption; its `--closed` step now
    expects "closed".
  - `scripts/quote-rfq-open-check.mjs`: closed, other-vendor and post-close revision, 6
    cases.
  - `scripts/cap-race-check.mjs`: N concurrent inserts at one free slot, for products or
    quotes. It cleans up after each round.
- **Lapsed subscriptions** are also marked lapsed in the raw columns by the
  `subscription-expiry-sweep` cron job (daily 03:29 UTC, `20260916180244`). The triggers
  never relied on it: each re-checks `status = 'active' and current_period_end > now()`.

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

#### Bunny's video status enum — read it from Bunny, not from a comment (2026-09-11)

Bunny's API reference defines `status` as 0 Created · 1 Uploaded · 2 Processing · 3 Transcoding ·
4 Finished · 5 Error · 6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated. Only **4** means
the renditions exist; `tests/video-closeups-bunny.spec.ts` used to treat 3 as finished. Anything
that waits on an encode should also fail fast on 5 or 6, and should create the DB row that owns
the asset *before* it waits, so a timeout never strands a paid video with nothing pointing at it.

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
- `embedding_pipeline_health()` — point-in-time verdict, service_role only. **Must stay cheap:
  both health crons call it.** Until 2026-09-23 its `worker_last_run` / `worker_last_failure`
  columns did `max(start_time) from cron.job_run_details … where jobname='embedding-worker'`,
  a full parallel seq scan of pg_cron's whole run history. That table is never pruned and has
  no `jobid` index; it is owned by `supabase_admin`, so `postgres` cannot add one.
  - The cost: 120 MB, 50,692 rows, 63% of the database. 1.26 s per read on an idle system,
    ~3 s per health call on average, and **64 s** once, during the 50-VU load test, when
    PostgREST's pool ran dry (Master Prompt 12 Part F).
  - The fix (migration `20260923093304`): the newest worker run is found by walking `runid`
    backwards (exact, 6 buffers). The newest failure is searched only among the latest 5,000
    cron runs (~1.4 days). The whole call now takes ~24 ms.
  - Rule for anything new that reads `cron.job_run_details`: `order by runid desc limit n`,
    never `max()` or `where jobid =` over the whole table.
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
   row per active admin (`admin.admin_users where is_active`, joined through `profiles` for the
   `notifications.profile_id` FK; since admin-schema separation Phase 5c, 2026-09-22, when
   `profiles.is_admin` was dropped). These render in the BUYER/vendor app's `/notifications`
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
  Cost exposure: one OpenAI call per *novel* query (a cached phrase costs nothing). **Rate limited
  since 2026-09-10** by `embed_query_rate_check()` (migration `20260910160000`): a fixed-window
  counter in `embed_query_rate_limit`, 30 novel queries per IP per 5 min and 10,000 globally per
  hour. It is metered ONLY on a cache miss, returns `{ ok: false, error: "rate_limited" }` at 200
  (search degrades to keyword-only), and fails OPEN if the limiter errors. Changelog: 2026-09-10
  (Master Prompt 6). The same table and pattern were then reused for `image-search` under `img:`
  keys — see "Photo search" below and the changelog entry "Photo search now refuses non-product
  images and is rate limited" (2026-09-10). *(This line previously said "no rate limit"; it went
  stale on 2026-09-10 and was corrected 2026-09-11.)*

Both follow the project's `not_configured`-as-200 convention and carry a `{"probe":true}`
branch that reports configuration without spending a token.

### Photo search — `image-search` (rate limit + Structured Outputs, 2026-09-10)

Photo → vision model → a short text query → the normal catalogue search (`/search/results?q=`).
The photo is never matched against product images; that design is deliberate and unchanged.
`verify_jwt = true`. The client downscales large photos to a 1024px longest edge before sending
(`compressForUpload()` in `src/pages/Search.tsx`, since the model runs at `detail:"low"`).

**Response contract** (all HTTP 200 except a malformed request):

| Body | Meaning | Search.tsx toast |
|---|---|---|
| `{ query }` | apparel/textile photo, described in 3–6 lowercase words | none — runs the search |
| `{ error: "no_match" }` | the model's verdict: not a product photo (or a safety refusal) | "Couldn't recognise that image" |
| `{ error: "rate_limited" }` | over an `image_search_rate_check` budget | "Too many photo searches" |
| `{ error: "not_configured" }` | `OPENAI_API_KEY` missing | "Image search isn't set up yet" |
| `{ error: "vision_failed" \| "request_failed" \| "bad_model_output", detail? }` | a service failure | "Image search unavailable" (the generic fallback) |
| 400 `{ error: "no_image" \| "bad_json" }` | malformed request; returns before the limiter | generic catch |

Every code has its own branch in `handleImageFile`. The fallback is the *generic* failure copy on
purpose: a new code added later must never borrow "couldn't recognise", which blames the photo.

**Structured Outputs.** The Chat Completions call sends
`response_format: { type: "json_schema", json_schema: { name: "image_search_result", strict: true,
schema: { is_apparel_or_textile: boolean, query: string | null }, both required,
additionalProperties: false } }`. The prompt tells the model to describe the item ONLY when the
photo clearly shows an apparel, fabric, trim, accessory or other textile/fashion product, and
otherwise return `false` / `null` — "do not guess". The function parses `message.content` as JSON;
`is_apparel_or_textile !== true` or an empty query → `no_match`; a `message.refusal` → `no_match`;
unparseable content → `bad_model_output`. `max_tokens` went from 40 to 80 because the JSON envelope
adds ~15 tokens and a truncated object cannot parse. Model unchanged (`gpt-4o-mini`,
`IMAGE_SEARCH_MODEL` overridable). Confirmed live on 2026-09-10: the API accepted the schema, a real
garment photo still returned `men white t-shirt`, and a generated solid-colour square returned
`no_match`, where the old prompt had produced "men blue denim jacket".

**Rate limit — `image_search_rate_check(p_ip, p_user_id default null, p_ip_limit default 10,
p_ip_window_secs default 600, p_global_limit default 300, p_global_window_secs default 3600)
returns boolean`** (migration file `20260910190000_image_search_rate_limit.sql`, recorded in the
database as version `20260910132753`). A structural copy of `embed_query_rate_check`: the same
fixed-window UPSERT (`on conflict (caller) do update`, window reset by a `case` on
`window_start < now() - make_interval(...)`), the same global-before-per-IP ordering, SECURITY
DEFINER with `search_path = public, extensions`, EXECUTE revoked from `public, anon, authenticated`
and granted only to `service_role` (checked: `has_function_privilege` false for anon/authenticated).
It **reuses `embed_query_rate_limit`** with new, namespaced keys, so the two budgets never collide
and embed-query's own keys and rows are untouched:

| Key | Budget | Notes |
|---|---|---|
| `img:global` | 300 / hour | Checked first. The one ceiling that bounds total spend however many IPs or accounts the calls come from |
| `img:ip:<addr>` | 10 / 10 min | Leftmost `x-forwarded-for`; empty → the shared `img:ip:unknown` bucket |
| `img:user:<uuid>` | 10 / 10 min (reuses `p_ip_limit`/`p_ip_window_secs`) | Only when the JWT has a `sub`. The only bucket a caller cannot spoof |

A call that fails an earlier bucket does not increment the later ones. Two differences from
embed-query, both deliberate:
- **Every call is metered.** embed-query meters only a cache MISS because a cache hit costs nothing;
  image-search has no cache, so the check runs on every request that would reach OpenAI (after the
  `no_image` / `not_configured` early returns, which cost nothing).
- **The user id comes from the JWT payload without re-verifying the signature.** `verify_jwt` has
  already rejected an invalid token before the handler runs; decoding `sub` is therefore safe.
  An anon-key token has no `sub`, so anon callers get the global + IP buckets only.

**Fail-open lives in the edge function, not the SQL.** Exactly as embed-query: the SQL function has
no exception handler, and the TypeScript `catch` around the RPC lets the request through. A limiter
outage costs a bounded amount of extra spend, not a feature outage.

**`x-forwarded-for` on this deployment — what was actually tested (2026-09-11).** The 2026-09-10
version of this paragraph rested on one anecdote. An anon call carrying a forged `zz-xffprobe-…`
was counted under the real address, but that value was not even a syntactically valid IP, so a
gateway that merely dropped malformed values would have produced the same result. Community reports
also disagree about whether Supabase appends the real IP after a forged prefix or replaces the header
outright. So it was measured directly.

- **Method.** A temporary build of `image-search` (v6) answered a one-off nonce by echoing its
  IP-related headers, before the limiter and before any OpenAI call. v7 removed it; the nonce now
  gets `400 no_image`. The client's public IPv4 was confirmed independently by three outside
  services (api.ipify.org, api64.ipify.org, ifconfig.me) as `136.233.9.123`. The machine has no
  public IPv6.
- **Cases**, 3 requests each through Node `fetch`, plus case (c) once through `curl`:

  | Case | Sent | `x-forwarded-for` that reached the function |
  |---|---|---|
  | a | no forged header | `136.233.9.123,136.233.9.123, 13.248.105.x` |
  | b | `x-forwarded-for: 203.0.113.7` | identical shape; `203.0.113.7` absent |
  | c | `x-forwarded-for: 203.0.113.7, 198.51.100.9` | identical shape; both forged values absent |
  | d | `x-forwarded-for: zz-xffprobe` (non-IP) | identical shape |
  | e | `x-forwarded-for: 2001:db8::1` (IPv6) | identical shape |
  | f | `x-real-ip: 203.0.113.50` only | identical shape; `x-real-ip` **not present at all** |

  `cf-connecting-ip` carried the real address in every request; no `forwarded` header arrived.
- **Conclusion for this deployment.** The header is rebuilt at the edge. **No forged value
  survived in any position**, so position 0 is always the caller's real address and
  `.split(",")[0]` is correct. The **last** entry was an upstream proxy address that changed from
  request to request (`13.248.105.16`–`.46`). The "take the last entry" hardening that is often
  recommended for `x-forwarded-for` would therefore have been a **bug here**: every caller would
  have been bucketed by a shared proxy address.
- **Limits of the claim.** One date, one IPv4 client, one route to the platform. This is observed
  behaviour, not a documented Supabase guarantee. Re-run the probe after any sign the proxy chain
  has changed.

`embed-query` parses the header identically but was not itself probed. That is an open item in
`documentation/securityflags.md` (2026-09-11), to be confirmed the next time that file is touched.

**Housekeeping** comes from the existing nightly `prune-embed-rate-limit` job, unchanged: it deletes
every row whose caller is not exactly `'global'` and whose window is a day old. That includes all
`img:*` rows; a stale `img:global` pruned this way is simply recreated on the next call.

**Known trade-off (same as embed-query):** the global bucket is shared, so a caller who burns 300
calls in an hour disables photo search for everyone until the window rolls. The alternative is an
unbounded bill. Raise `p_global_limit` in the edge function's RPC call if real traffic approaches it.

Verified by `node scripts/image-search-check.mjs` (see `documentation/test.md`, 2026-09-10).

---

## For You ranking — `for_you_products()` (location soft boost 2026-09-23)

`for_you_products(p_buyer_id, match_count)` returns `(id, distance, source)`. The app
(`forYou.ts`) calls it with `match_count = 200`, which is the whole live catalogue today (26
rows), and orders the already-fetched product pool by the returned rank. It never re-sorts
by `distance`.

- **Three tiers, in order:**
  - `taste`: `buyer_taste_embedding()`, built from the buyer's history.
  - `cold_start`: `buyer_cold_start_embedding()`, from `preferred_categories` through
    `pref_category_map`. Verified in Master Prompt 5 and deliberately left untouched.
  - `popularity`: `enquiries_count, views_count`, with `distance` NULL.
- **Ground rules:** SECURITY DEFINER, STABLE, `search_path = public, extensions`, the
  `auth.uid()` self-access guard (another buyer's feed is 42501), and EXECUTE for
  authenticated and service_role only (not anon). Migration `20260923133539` self-asserts
  all of them after its replace. The function makes no OpenAI calls; it only ranks
  embeddings that already exist.
- **Location soft boost** (migration `20260923133539_for_you_location_soft_boost`):
  - **Vector tiers only.** The sort key is `distance − boost`: 0.05 for a same-city
    product, 0.02 for a same-state one (the larger applies, not both). The returned
    `distance` stays raw.
  - **Same rows.** The candidates are the pre-boost query verbatim, as a CTE (the
    index-served `ORDER BY embedding <=> v_emb`, the same LIMIT). The boost only reorders
    inside it.
  - **No location takes a verbatim branch.** A buyer with neither city nor state runs the
    old query exactly, so an unchanged result holds by construction.
  - **An unmatched city is identical too.** With every boost 0, the order is the same keys
    in the same order. Verified byte-identical against a baseline.
  - **Where a product's location comes from:** `products.location` ("City[, State]": the
    city before the first comma, the state after it), falling back to
    `vendor_profiles.city` / `state`. This mirrors what `products.ts` displays. Matching is
    trim + lower-case equality, so "Navi Mumbai" does not match "Mumbai".
  - **The popularity tier is untouched.** It has no score, and ranking location first
    there would turn the boost into a hard sort.
- **Scale today:** 1 of 7 buyer profiles has a city (demo-buyer, Mumbai), so the boost is
  visible for that buyer only. Its four Mumbai products moved from ranks 8, 17, 18, 19 to
  5, 12, 15, 16; the top 4 (distance 0.20–0.24) held. See `test.md`, Phase 5.
- **Tuning:** the two constants sit at the top of the function body. Raising the city
  boost past about 0.1 would start lifting same-city products over clearly better matches;
  measure against a baseline before changing it.

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

**Replacing a rejected document (2026-09-11, Master Prompt 8).** That rewrite is now the
shared `replaceVendorDocuments(vendorId, docs)`, used by onboarding and by
`resubmitKycDocument(vendorId, docType, file)`, which is behind `/kyc`'s "Upload a
replacement" control on a rejected row. Order: read the superseded rows' `id, file_url`,
insert the new rows, delete the superseded ones **by id**, then `remove()` their
`business-docs` objects (best-effort, logged). Insert-first means a failed write can
never leave a vendor with no row, where the old delete-first order could. A resubmission
is always a new row because `vendor_documents_guard_review_columns()` forbids a vendor to
touch the review columns and resets them on INSERT. `resubmitKycDocument` removes its
own freshly uploaded object if the row write fails.

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

### Product detail — rendered from the row, never a template (2026-09-11)

`src/pages/ProductDetail.tsx` builds its view model with `toViewModel(row)` from
`fetchProductById` (`src/lib/queries/products.ts`) and nothing else. It used to spread the real
row over a hardcoded "Premium Cotton Chinos" object, so any field the row did not override —
certifications, response time, product code, reviews, rating breakdown, and the description,
media and specs whenever the vendor left them empty — rendered as fiction on real listings.

- **No field without a column.** Certifications, vendor response time, product code and sold
  count are not rendered, because none has a real source. `products.unit` is now selected and
  shown only when present; MOQ is shown as listed, with the unit appended only to a bare number.
- **Ratings come from rows.** The product rating is `product_reviews` (count, average and
  breakdown via `useProductReviews`); the vendor rating is `reviews` via `useVendorReviews`. The
  denormalised `products.rating_avg` / `reviews_count` and `vendor_profiles.rating_avg` /
  `reviews_count` are not read here: they are correct where real reviews exist but hold
  never-reset seed values elsewhere (23 of 26 live listings; one vendor claims 4,800 reviews with
  none). Every listing card elsewhere in the app still reads them — known, not fixed in this pass.
  **Update, Master Prompt 8 (2026-09-11):** the vendor half is now truthful. Migration
  `20260911120000_vendor_review_aggregates_truthful.sql` recomputed `vendor_profiles.rating_avg` /
  `reviews_count` from `reviews` (4,800 → 0 for that vendor), and `enforce_vendor_profile_admin_fields()`
  now refuses any signed-in write to them, so `sync_vendor_rating()` (AFTER INSERT/UPDATE/DELETE on
  `reviews`, SECURITY DEFINER) is their only writer. The product half is unchanged by decision: the
  cards still read the seeded `products` columns.
  **Update, Master Prompt 9 (2026-09-22):** the guard now covers every role, not just
  `authenticated`. Migration `20260922200000_vendor_review_aggregates_single_writer.sql`:
  on INSERT the trigger computes both columns from `reviews`; on UPDATE it raises `42501`
  unless the transaction-local setting `cosora.review_aggregate_sync = 'on'`.
  `sync_vendor_rating()` sets it around its own UPDATE and clears it immediately, so the
  permission cannot leak into the rest of the transaction; the rolled-back probe proved a
  later direct UPDATE in the same transaction is still refused. Reason: a load-test batch
  inserted as a privileged role on 2026-09-16 gave 118 vendors invented counts.
- **Four distinct states.** Loading (spinner), error (`ProductLoadError`, with Retry), not-found
  (`ProductNotFound`, identical for missing and RLS-blocked ids), and the product. A malformed id
  is caught by `UUID_RE` before any request, because PostgREST answers a non-uuid with an error
  (22P02) rather than zero rows — without the guard a bad link would read as a load failure.
- **Known dead affordances, left in place** (reported, not fixed): the vendor card's Follow toggle
  is local state only; "Add Fabric", "Download PDF", "Translate", the review "Helpful?" counter
  and the ⋮ menu do nothing.

### Trends — curated chrome, real cards (2026-09-11)

`src/pages/Trends.tsx` is two things on one page, and they obey different rules. The **chrome**
(category chips, featured images, curated looks, suggested searches) is hand-picked editorial
content: no trends job exists in this codebase, so nothing on the page may claim to be live,
trending or measured, and every piece of it links into a real `/search/results?q=…` rather than
to a product id. The **product cards** come only from `useLiveProducts()`, sorted by
`sortTrending`, with loading / error / empty / populated as four distinct states — there is no
generator and no fallback. The invented "Top Brands" section was removed rather than rewired,
because there is no per-trend brand data to wire it to. The curated imagery is still hotlinked
from picsum.photos and needs owned replacements.

### Client stores — `src/lib/*Store.ts`
Module-level stores backed by `useSyncExternalStore` + `localStorage`, **not** React
context. Each exposes a `useX()` hook plus mutation functions: `savedStore`,
`followingStore`, `brandFollowStore`, `preferencesStore`, `profileStore`,
`recentlyViewedStore`, `notificationsStore`, `quotesStore`, `callStore`.

**`followingStore` is the SIGNED-OUT fallback only** (2026-09-16). Signed in, `useFollowing()`
(`queries/follows.ts`) reads and writes the `follows` table and never consults this store. It
carries no seed: the seven invented brands it used to return for an empty list are gone, and
`load()` drops any row whose id is not a UUID (a real follow is keyed by `vendor_profiles.id`)
and rewrites storage. The empty-array check went with them — `Array.isArray(parsed) &&
parsed.length` treated "I unfollowed everything" as "nothing stored" and resurrected the seed,
so an intentionally empty list now stays empty. One consequence worth knowing: `followBrand()`
patches a row already in the list and cannot insert one, so with no seed a signed-out visitor
has nothing to patch — `useFollowing().follow()` therefore asks them to sign in instead of
calling it and appearing to work.

**The quote chat is not a second messaging system** (2026-09-16). `VendorChatModal`
(My Quotes) uses the same `useChatThread()` hook, the same `conversations` / `messages`
tables and the same find-or-create-by-user-pair behaviour as `/chats/:id`, keyed on the
quote's `vendor_id`. A message sent from either surface appears in the other because they are
one thread. Its previous two hardcoded messages — one written in the buyer's own voice — are
gone, along with an "Online now" badge that nothing in this project could support.

**Recently Viewed has two backings, and says which one is authoritative** (2026-09-10).
Signed in → the `recently_viewed` table: StoreSync calls `setRecentUser(uid)`, the store is
replaced with the DB rows (hydrated into cards via `fetchProductCardsByIds`, which reads
through RLS, so a withdrawn listing drops out instead of rendering as a dead link), and
nothing is written to localStorage while signed in. Signed out → localStorage only. The
store carries **no seed** — the six `rv1`..`rv6` products it used to return for an empty
history were removed — and three details keep it honest:

- `load()` drops any stored row whose id is not a UUID and rewrites storage. Every real view
  has one (ProductDetail records only after its DB row loads), so a non-UUID row is a
  leftover from the removed seed, which older builds *persisted*: `recordView()` prepends to
  `items`, and on a first visit `items` was the seed.
- `hydrateRecent()` throws on a query error instead of treating it as `[]` — a failed fetch
  is not an empty history.
- `useRecentlyViewedHydrating()` / `useRecentlyViewedOwner()` let the page render loading,
  empty and populated as three distinct states. "Owner" closes a one-render gap: StoreSync's
  effect runs after the page's first commit, so for one frame a signed-in user's store
  still holds the signed-out list.

Verified by `scripts/recently-viewed-check.mjs` against the real app and DB with a real
login — fresh browser, legacy seeded storage, signed-out view, and signed-in DB history,
including a 10 ms poll from first paint proving the empty state never flashes while the
history loads.

### Shared helpers
`src/lib/listingProducts.ts` (`ListingProduct` type + `img()` / `makeListingProduct()`,
kept JSX-free for fast refresh), `src/lib/plan.ts`, `src/lib/searchFilters.ts`,
`src/lib/categoryTaxonomy.ts`, `src/lib/i18n.ts`, `src/lib/supabase.ts`.

### Seed / mock data (still client-side)
`chatData.ts`, `freelancersData.ts`, `serviceVendorsData.ts`, `quotesData.ts`,
`buyerCategories.ts`. Service vendors, freelancers and photographers have **no `profiles`
row** — which is why `service_reviews.service_id` is `text` with no FK.

Still reaching production (both tracked in `sides.md` → Known gaps): `followingStore.ts`'s
`SEED` — seven invented brands, served to every signed-out visitor by `useFollowing()`'s
signed-out fallback — and `VendorChatModal.tsx`'s two scripted messages. By contrast
`notificationsStore.ts`'s `SEED` is safe: it returns `import.meta.env.DEV ? SEED : []`,
which Vite replaces statically, so it is tree-shaken out of production builds.

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

## Account deletion — emailed code, 14-day cooling-off, anonymize (2026-09-23)

Phase 2 of the My Profile brief. Migrations `20260923115507_account_status_deleted` and
`20260923115839_account_deletion_requests` (the second one's header lists every design
decision and each deviation from the brief). Phase 18 (MPF-6) added the WhatsApp channel:
`20260923213225_account_deletion_whatsapp_channel`.

**Flow.**
1. `/profile/help` → `DeleteAccountCard` → edge function `account-deletion` `{action:"request"}`.
   The function calls `issue_account_deletion_code(uid, channels)` as service_role, passing
   the channels it holds secrets for. It sends the code by email through Resend, or, for an
   account with no usable email and a confirmed phone, by WhatsApp through Meta's Cloud API
   (Phase 18). The database picks the channel.
2. The user types the code: `confirm_account_deletion(code)` → `cooling_off`,
   `scheduled_for = now() + 14 days`, plus an in-app notification. `/profile` shows a banner
   with Cancel.
3. `cancel_account_deletion()` works any time before the sweep.
4. pg_cron `account-deletion-sweep` runs daily at 03:41 UTC (Phase 16, 2026-09-24).
   - When there is work and the Vault secret exists, it posts to the
     `account-deletion-sweep` edge function, with the service-role key from Vault.
   - Per due request the function:
     1. reads the avatar objects and `avatar_url` (`account_deletion_sweep_list()`);
     2. anonymizes (`complete_account_deletion()`: lock, re-check, `anonymize_account()`,
        `completed`; it never raises);
     3. then deletes `avatars/<user id>/` through the Storage API, and reports through
        `record_account_storage_cleanup()`, which re-lists the folder itself.
   - The same job then runs `process_due_account_deletions(interval '1 day')` as a SQL
     backstop for anything the function missed.

**Data.**
- **`account_deletion_requests`:** status `pending_confirmation | cooling_off | cancelled |
  completed`. There is a partial unique index allowing one open request per user.
  - `channel` (`email` | `whatsapp`, Phase 18) is set when the request opens. Every code
    for it goes the same way. If that channel stops reaching the account, the next request
    closes it and opens a new one.
  - Also stored: `codes_sent`, `last_code_sent_at`, `code_expires_at` (not secret) and
    `last_error` (set by the sweep).
  - `storage_cleaned_at` and `storage_error` (Phase 16) record the avatar-file cleanup. A
    completed request with no `storage_cleaned_at` is retried on every run.
  - Clients hold SELECT only; the policy admits the owner and support/super_admin. There is
    no client INSERT, UPDATE or DELETE.
- **`account_deletion_otps`:** `sha256(request_id || ':' || code)`, `expires_at` (10 minutes)
  and `attempts` (max 5). RLS is on, there are no policies, and every client role
  (service_role included) has its privileges revoked.

**Rules worth knowing before touching it.**
- **The code goes to `auth.users`, never to `profiles`.** Users can edit `profiles.email`
  and `profiles.phone`, so a hijacked session could redirect the code there first.
  - `account_deletion_channels()` decides: a confirmed `auth.users.email` that is not a
    `.invalid` placeholder → `email`; otherwise a confirmed `auth.users.phone` → `whatsapp`
    (Phase 18). Email wins when both exist.
  - With neither, `account_deletion_blocker()` answers `no_contact` (it was `no_email`).
  - `issue_account_deletion_code()` answers `not_configured` with the channel, writing
    nothing, when the edge function can't deliver on it.
- **A wrong code returns a status and never raises.** A RAISE would roll back the attempt
  counter it had just incremented, and the lock would never trigger. The same reasoning
  explains why the sweep records failures in `last_error` and never raises: a pg_cron job
  is one transaction.
- **Every writer takes `pg_advisory_xact_lock(hashtext('account_deletion:'||uid))`**, the
  plan-cap idiom. So a double tap, or a cancel racing the sweep, is serialized. The sweep
  re-reads the row under the lock.
- **Refused:** accounts with a `vendor_profiles` row, admins (any `admin.admin_users` row),
  suspended accounts ("contact support"), and accounts with neither a usable email nor a
  confirmed phone (`no_contact`). `anonymize_account()` re-checks all three at sweep
  time.
- **Never delete the account's rows; delete only its private activity.** `rfqs`,
  `messages`, `conversations` and `calls` CASCADE from `profiles`, and the three review
  tables CASCADE from `auth.users`, so the account is never deleted.
  - Its private activity *is* deleted (Phase 16): saved items and folders, saved videos,
    follows it made, recently viewed, video likes and notifications.
  - `engagement_events` keep their row with `viewer_id` cleared.
  - `anonymize_account()` scrubs the rest:
  - **profiles:** name becomes "Deleted user"; email, phone and avatar are nulled; status
    becomes `'deleted'`.
  - **buyer_profiles:** every descriptive or identifying column is nulled, and `social` is
    set to `{}`.
  - **Review tables:** the `reviewer_name` / `reviewer_company` copies on the review rows are
    scrubbed.
  - **Auth:** sessions, refresh tokens, MFA factors, one-time tokens and identities are
    deleted. On `auth.users`, email and phone are nulled, metadata is set to `{}`, the
    password is blanked, and `banned_until` is set to now + 100 years.
  - GoTrue's four string token columns stay `''`. Setting them NULL would bring back the
    load-test 500.
  - An `'infinity'` ban was avoided: GoTrue is written in Go and may fail to read that
    timestamp.
- **`'deleted'` is terminal.**
  - `account_is_active()` is false for it, so every gated INSERT refuses it.
  - `enforce_admin_grants()` already stops a signed-in user from changing
    `account_status`.
  - `set_account_status()` now refuses `'deleted'` in both directions (42501). Before, its
    else branch would have revived a deleted account.
  - `guard_deleted_account()` (BEFORE UPDATE on `profiles`, BEFORE INSERT/UPDATE on
    `buyer_profiles`, signed-in callers only) stops a still-valid access token from writing
    a name back.
  - `account_not_deleted(auth.uid())` (Phase 16) closes the rest of that window.
    - It is on all 46 own-row write policies: WITH CHECK on UPDATE and FOR ALL, USING on
      DELETE, and the own-folder storage policies.
    - It refuses `'deleted'` only; suspension is `account_is_active()`'s job.
    - **A new own-row write policy must include it.**

**Edge function `account-deletion`** (`verify_jwt = true`; the manual JWT decode depends on
that).
- `{action:"status"}` → `{configured: {email, whatsapp}}`.
- `{action:"request"}` → `sent | not_configured | send_failed | <blocker reason>`. `sent`,
  `not_configured` and `send_failed` carry `channel`; `sent` carries the masked address or
  number as `to`.
- It always answers 200 for business outcomes, because `functions.invoke()` drops a non-2xx
  body.
- Secrets:
  - Email: `RESEND_API_KEY` is required. Until it is set, an email account's `request`
    answers `not_configured` and mints nothing.
  - WhatsApp (Phase 18): `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are
    required. The optional `WHATSAPP_TEMPLATE` (`account_deletion_code`),
    `WHATSAPP_TEMPLATE_LANG` (`en`) and `WHATSAPP_API_VERSION` (`v25.0`) name the approved
    copy-code **authentication** template and the Graph version. The code goes in the body
    and the button parameter. Meta fixes the text ("<code> is your verification code.").
    A 200 from Meta means accepted, not delivered.
  - `RESEND_FROM` is optional. The default `onboarding@resend.dev` only delivers to the
    Resend account owner's address, so real users need a verified sending domain.
- On a failed send, the function discards the code and lifts the 60-second resend cooldown.

**Edge function `account-deletion-sweep`** (`verify_jwt = true`, and the handler also
requires role `service_role`). It is posted to by pg_cron only, returns a summary
(`due`, `completed`, `storage_cleaned`, ...), and needs no secret beyond the platform's.

**Known limits (tracked in `myprofileflags.md`):**
- No email is sent until the key is set (MPF-4).
- A phone-only account's code goes over WhatsApp (Phase 18), which isn't set up yet
  (MPF-24).
- A stale access token can still **read** for up to its hour. Every write is refused
  (MPF-7, fixed 2026-09-24).
- Message text and GoTrue's audit log keep what they held, by design.

---

## Profile editing — two routes, one hook (2026-09-23)

`/profile/edit` (`ProfileEdit.tsx`: photo and personal) and `/profile/business-details`
(`ProfileBusinessDetails.tsx`) replaced the Edit Profile modal on `/profile`, which is
deleted. There is one form implementation: the shared parts are in
`components/buyer/ProfileEditKit.tsx`, and the state and save are in
`hooks/useEditableProfile.ts`.

- **Data layer:** `saveProfileFull()`, `profileChanges()` and `uploadAvatar()` in
  `lib/queries/profile.ts`.
- **Seed once, after the load.** The hook keeps `form` null until `useProfileFull` resolves,
  and the pages render no inputs until then. It never re-seeds, so a refetch can't wipe
  typing in progress.
- **A save sends only what changed** (MPF-9, Phase 14, 2026-09-24).
  - The hook seeds a `baseline` with the form, and re-baselines after each save.
  - `save()` passes `profileChanges(baseline, form)` to `saveProfileFull()`. That function
    writes only the columns for the fields it is given, and skips a table with nothing to
    write. `buyer_profiles` is upserted, and an upsert updates only the columns it is sent.
  - An emptied field is a change, stored as NULL. An untouched form sends nothing, and the
    pages say "No changes to save".
  - `country` has no default: "India" is the field's placeholder.
- **Photos.** A photo uploads immediately and applies on Save. The Google picture shows
  when none is stored, but it is in the baseline, so it is saved only if the buyer picks a
  photo. Both pages go back to `/profile` on save or cancel.
- **The sign-in step** (`applyPendingSignupProfile()`) applies a signup name once (MPF-9,
  MPF-20).
  - It writes the buyer's company (`saveProfileFull()` with just `{ businessName }`) or the
    vendor's brand, and only while none is saved.
  - It then clears `brand_name` from the auth metadata with
    `auth.updateUser({ data: { brand_name: null } })`. Supabase Auth removes a key set to
    null.
  - If the write fails, the metadata is kept for the next sign-in.
  - It used to pass a whole `EMPTY_PROFILE`-based object for a buyer, and write a vendor's
    signup brand, on every sign-in.
- **`?focus=city`** autofocuses City. The `/profile` "Add city" nudge links there.
- **Email is a plain field.** The modal's fake verify flow was dropped (MPF-10).

---

## Data & Export — client-side, owner-filtered (2026-09-23)

Phase 3 of the My Profile brief. `src/lib/queries/dataExport.ts` holds
`buildRfqHistoryCsv()`, `buildAllDataJson()` and `downloadFile()`. They are called from
`ProfileAccountPrefs.tsx` (`/profile/data-export`). There is no backend: no edge function,
no service role, no job queue. Revisit that only if one buyer's own rows grow large.

- **Owner filter on every query.** RLS here admits more than "mine": other buyers' open
  RFQs, every review, every profile, the vendor side, and admins. So:
  - `rfqs` are filtered by `buyer_id`, and `quotes` by `rfq_id` in those RFQs;
  - `conversations` by `or(user_a, user_b)`, and `messages` by `conversation_id` in those
    conversations;
  - `reviews` and `product_reviews` by `buyer_id`, and the two profile rows by `id`.
  - Phase 19 (MPF-8): `calls`, `saved_items`, `saved_folders` and `recently_viewed` by
    `buyer_id`; `follows` by `follower_id`; and `saved_folder_items`, which has no owner
    column, by `folder_id` in the buyer's own folders. For a buyer these tables' RLS is
    owner-only already. `follows_select` and `calls_select` also admit admins, and the spec
    proves the filters with demo-admin.

  Probe numbers are in `test.md`.
- **Complete reads.** `allPages()` pages by 1,000 (PostgREST's cap) and orders by
  `created_at, id`, so pages never overlap. `inChunks()` splits `in.(…)` lists into groups
  of 100 ids, to stay under URL limits.
- **CSV** (`cosora-rfq-history-YYYY-MM-DD.csv`):
  - One row per quote received; an RFQ with no quotes still gets one row. Seller brand names
    come from `vendor_profiles` (public).
  - RFC 4180 quoting, a UTF-8 BOM so Excel reads it correctly, and CRLF line endings.
  - Formula-injection guard: vendors write quote comments, so a string cell starting with
    `= + - @` (or a tab or CR) gets a leading `'`. Numbers are untouched.
- **JSON** (`cosora-data-export-YYYY-MM-DD.json`):
  - An `export` header (generated_at, account_id, `format_version` 2 since Phase 19,
    contents, the `links` note, the chat-scope note, counts), then one section per table.
  - Phase 19 added five sections:
    - `vendors_contacted`: chat counterparts with a `vendor_profiles` row, plus called and
      quoting vendors, deduplicated, as `{vendor_id, brand_name}`;
    - `vendors_messaged`: the vendors whose conversation has a message the buyer sent;
    - `saved`: `all_saves`, and `folders` with their items;
    - `recently_viewed` and `following`.
  - Product and vendor rows carry an absolute `link` on the exporting site (`/product/:id`,
    `/vendor/:id`). The link is null when the product isn't `live` or the vendor row is
    gone, the My Reviews rule.
  - `embedding` and `search_text` are left out of RFQs: they're the search index, not buyer
    data.
  - Each conversation gets `other_party_name` (a brand name only, never contact details).
- **Filenames** use the IST date. Blob URLs are revoked 1 second after the click; revoking
  in the same tick can cancel the download.
- **Scope:** the brief's tables, plus the Phase 19 sections. Not exported: video likes,
  saved videos, service reviews, notifications, deletion requests, and the call log itself.

---

## Display currency — converted for display, never for money (2026-09-24)

Phase 20 of the My Profile brief (MPF-11). A buyer's Regional Settings currency (₹ INR, $ USD,
€ EUR, £ GBP) converts the INR prices the buyer app shows. Nothing is priced, quoted, paid,
settled or invoiced in another currency.

- **Rates.**
  - `public.fx_rates` is one row, base INR: `rates` = units of each currency per rupee,
    `rates_date` = the day the source published them, `updated_at` = the last refresh.
    Everyone can read it, signed out too; no client role can write.
  - pg_cron `fx-rates-refresh` (16:30 UTC daily) posts to the edge function `fx-rates-refresh`
    with the Vault service-role key: `verify_jwt = true`, and the handler requires
    `service_role`.
  - The function reads Frankfurter's v1 endpoint (the ECB's euro reference rates; free, no
    key), falling back to v2 (multi-source).
  - It computes INR rates from the EUR ones, since asking for an INR base returns 5-decimal
    numbers. It rejects an INR-per-EUR outside 40–400 and keeps the old row on any failure.
  - Migration `20260924161525`.
- **Client.**
  - `src/lib/currency.ts`:
    - `currencyCodeOf("$ USD")` → "USD";
    - `formatCurrency(amount, code)`: INR is `formatINR`'s exact shape, and `formatINR` now
      calls it; other currencies show 2 decimals, en-US;
    - `formatInCurrency(amountInInr, code, rates)`;
    - `convertInrText(text, code, rates)`, which converts every "₹n" in text the app built.
  - `useFxRates(enabled)`: react-query `["fx_rates"]`, a 1-hour stale time, and disabled for an
    INR buyer.
  - `DisplayCurrencyContext`, mounted in `App.tsx`:
    - the code comes from `buyer_profiles.regional.currency` (signed in) or the device's
      Regional Settings (signed out);
    - `show(amountInInr, inrText, sourceCurrency?)`, `showText(inrText)`, and `showBoth(...)`
      ("≈ $5.20 (₹499)");
    - each returns `inrText` exactly unless a conversion is active (a non-INR code with rates
      loaded). That is what keeps an INR buyer's page byte-identical;
    - a price in another source currency is never converted.
  - `ConvertedPriceNote` renders only while converting. It's under `BuyerTopBar`, and on search
    results, the vendor profile and the quote screens.
  - `useCurrencySetting` is the drawer picker's read and write of the same field.
- **Not converted, on purpose:**
  - vendor pages and vendor billing (`formatINR`);
  - amounts a buyer types (RFQ budgets);
  - the invented New Arrivals hero and the static service-vendor rates, which are unmarked;
  - anything stored or sent.

## GST — one formula, ready for a buyer charge that doesn't exist yet (2026-09-24)

Phase 20, MPF-11 part B. `supabase/functions/_shared/gst.ts`:
`gstOn(baseRupees, rate = GST_RATE)` → `{ base, rate, gst, total }`.

- **The formula, as found in the three copies it replaced** (`subscription-create-order`,
  `-verify-payment`, `-webhook`):
  - 18% flat on the whole-rupee plan price;
  - `Math.round` to the rupee;
  - total = base + gst, and the Razorpay amount is total × 100 paise.
  - It has no per-category rate and no CGST/SGST vs IGST split. The vendor's GSTIN is only
    recorded.
- **All three functions import it now.** `node scripts/gst-check.mjs` proves the same results
  (every plan, ₹0–₹1,00,000, the x.5 edges) and fails if any function keeps its own copy.
- **Not redeployed,** because the deployed functions are older than the repo (MPF-25).
- **Nothing buyer-facing calls it.** Buyers pay Cosora nothing today: plans, ads and
  certificates are all vendor purchases. When a real buyer-facing paid feature exists:
  - its edge function imports `gstOn()`, passing its own rate if its service differs;
  - a tax figure the browser shows before payment needs a client mirror kept in step by a
    check script, as `src/lib/adPricing.ts` is by `scripts/ad-pricing-check.mjs`.

  Don't build or simulate a charge just to call it.

---

## FAQs — one table, admin RPCs, three surfaces (2026-09-23)

Phase 9 of the My Profile brief. FAQ content used to be hardcoded in two components
(`faqCategories` in `Help.tsx`, `FAQS` in `Subscription.tsx`). It's now rows in `public.faqs`:
clients read the table directly, and Cosora-Admin writes to it through RPCs. Migrations
`20260923144549_faqs_admin_editable.sql` and `20260923150408_faqs_hide_created_by_from_clients.sql`.

- **Why this shape.** The only earlier admin-content page, Cosora-Admin's `Content.tsx`, is
  dev-seed with no table. The working pattern for an admin-managed text list is
  `chat_block_reasons` + `admin_block_reason_*` + `ChatReasons.tsx`, and this copies it:
  - SECURITY DEFINER, `search_path = ''` and schema-qualified names;
  - `#variable_conflict use_column`;
  - a role gate that raises 42501;
  - EXECUTE revoked from everyone, then granted to `authenticated`.
- **Reads:** policy `faqs_select_active` (anon and authenticated, `using (active)`). Grants:
  - Supabase grants ALL on a new public table to anon, authenticated and service_role,
    each in its own right, so the migration revokes it from those three and `public`.
  - It then grants **column** SELECT back to anon and authenticated: every column except
    `created_by`. The first migration granted the whole table; `20260923150408` narrowed it.
    `created_by` names the admin who wrote a row, and profiles are readable signed out
    (MPF-3), so it would have let anyone identify the super admins.
  - A column grant makes `select=*` fail with 42501. `useFaqs()` names its columns, and
    any new reader must too.
  - No client role, and not service_role, can write.
  - The partial index `faqs_surface_order (surface, position, created_at) where active`
    matches the one query the apps make.
- **Writes and the list admit support and super_admin**, with one predicate:
  `admin_role() = any (array['support','super_admin'])`. Writes were super_admin only until
  Phase 22 (2026-09-24, migration `20260924170736`). Every other admin role, an inactive admin,
  a non-admin and anon get 42501.
  - `created_by` records who **added** a row. An edit sets only `updated_at`, and there is no
    history (MPF-26).
  - `admin_faq_add(surface, category, question, answer, position default null)`:
    - an unknown surface raises 22023;
    - text is trimmed, and a blank category is stored as null;
    - with no position, the row goes to the surface's `max(position) + 10`, taken under
      `pg_advisory_xact_lock(hashtext('faqs:' || surface))` so two concurrent adds can't
      take the same slot;
    - `created_by = auth.uid()`.
  - `admin_faq_update(id, category, question, answer, active)`:
    - a null argument keeps the column, and `''` clears the category;
    - a blank question or answer keeps the old text (the table's check constraints forbid
      blanks anyway);
    - sets `updated_at`.
  - `admin_faq_delete(id)` is a real delete. Nothing references an FAQ, unlike block
    reasons, which reviews point at. Deactivate is the reversible option, and the admin
    page offers both.
  - `admin_faq_reorder(id, position)`: under the same per-surface lock, the row already at
    `position` on that surface takes the moved row's old position, and the moved row takes
    `position`. It's a swap, so order stays unique without renumbering. The admin's
    up/down arrows pass the neighbour's position, within one category group on Buyer Help.
    An unknown id returns no row, which the admin's `assertWrote` reports.
- **Positions are spaced by 10,** and Buyer Help categories by 100 (10–30, 110–130, 210–230,
  310–330), so an admin can insert between two rows without renumbering.
- **Client:**
  - `useFaqs(surface)` (`src/lib/queries/faqs.ts`) filters `surface` and `active = true`
    explicitly rather than relying on RLS alone. It orders by `position, created_at, id`, so
    ties are stable.
  - `groupFaqs()` groups by `category_label` (null → "General") in first-appearance order,
    so each category sits at its lowest position.
  - `<FaqSection surface title description contact>` (`src/components/FaqSection.tsx`) is
    the drop-in for any page: a card with an accordion, plus an optional contact row (label,
    href, hint). It renders nothing when there are no rows and no contact. It's used on
    `/subscription`. A contact `href` that starts with `/` renders a React Router `Link`
    (in-app, no reload); anything else (`mailto:`, `https:`) is a plain link.
  - Buyer Help keeps its own accordion and search (the brief changed only the data source),
    with `groupFaqs()` feeding its old shape.
  - The vendor landing page `/seller` (`VendorLanding.tsx`) also keeps its own markup and
    reads `useFaqs("seller_registration")`. Its block carries
    `data-faq-surface="seller_registration"` for tests, like `FaqSection`'s card.
  - `FaqSection` and `/seller` render answers with `whitespace-pre-line`, so an answer written
    as lines (`•` bullets) keeps them. Buyer Help doesn't yet, because its answers are single
    paragraphs.
- **Freshness (since Phase 23):** query key `["faqs", surface]`, `staleTime` 10 min,
  `gcTime` 30 min. An admin edit reaches every new page load within ~47 s (see "FAQ read
  path" below). A tab already open keeps its list for up to 10 minutes. There's no realtime
  subscription: FAQ edits are rare, and an accordion rearranging under the reader would be
  worse than the lag.
- **Seed:** the 17 hardcoded rows moved over verbatim (12 buyer_help, 5 subscription). The
  text wasn't edited on the way, so the inaccuracies in MPF-14 moved with it.
- **Andy's content (2026-09-23)** went in through the `admin_faq_*` RPCs as demo-admin, not a
  migration, so it's admin-owned from day one:
  - 10 seller_registration rows (10–100);
  - 5 subscription rows (10–50);
  - the old subscription rows kept live at 120–140;
  - the two superseded rows deactivated at 210 and 240.

  Source and decisions: `documentation/seller-registration-and-subscription-faq-content.md`.
- **Seeded by migration since Phase 24 (2026-09-25):** `20260925075432_faqs_seed_seller_registration_and_subscription.sql`
  reproduces the rows above on a fresh database, generated from the live rows so the text is
  identical. On the live database it changed nothing. Every statement is conditional:
  - seeded rows are matched on question **and** their original answer, so an admin-edited
    row is left alone;
  - an insert is skipped when an active copy of the question is already on the surface.

  If an admin later edits one of these rows, the live text and the migration's text
  diverge; the migration is the starting state, not a mirror.
  The "Lowest billing plan?" answer hardcodes plan prices; it isn't derived from
  `subscription_plans`.
- **Cosora-Admin `src/pages/Faqs.tsx`** has:
  - a tab per surface, with counts;
  - an add form, where Category (with suggestions) appears on Buyer Help only and is
    required there;
  - per-category tables on Buyer Help, and a flat table elsewhere;
  - Edit (a modal), Deactivate/Reactivate, and Delete (with a confirm).
  - up/down arrows that swap with the previous or next row **of the same visibility** in
    its group. A live row steps past hidden ones, so every press changes the live page.

  Every mutation goes through `assertWrote`. `canWrite(role, "faqs")` admits the same two
  roles as the RPCs, so no role that can open the page sees the read-only banner today. The
  database gate is the real one: widen or narrow both together.

### FAQ read path — Storage CDN snapshots, table fallback (2026-09-24, Phase 23)

Phase 9 Q2: the FAQ read path at 10k concurrent users. Migration
`20260924174051_faq_snapshots_cdn_cache.sql`, edge function `faqs-snapshot`.

- **Why:** the table was never the limit (~30 indexed rows, a boolean RLS check). PostgREST
  is: ~10 pool connections for the whole app, and every FAQ page load spent a request on
  content that changes a few times a month. From India that request also takes ~325 ms (the
  database is in Sydney); a CDN hit takes ~100 ms.
- **Files:** public bucket `faq-snapshots` (JSON only, 64 KB limit, **no storage policy**, so
  no client writes). `buyer_help.json`, `seller_registration.json`, `subscription.json`:
  `{ version: 1, surface, generated_at, count, rows: [{ id, category_label, question,
  answer, position }] }`, rows in display order.
- **Writer: `faqs-snapshot`** (verify_jwt plus a service-role check, no imports):
  - reads the active rows with the **anon key**, so RLS and the column grant apply (no
    inactive rows, never `created_by`);
  - uploads all three with `x-upsert` and `cache-control: max-age=300`;
  - re-reads, and runs up to 3 passes if an edit landed mid-upload (409 `unsettled` after
    that; the next call rebuilds). 502 on any read or upload error.
- **Callers, with the Vault `service_role_key` through pg_net:**
  - `trg_faqs_snapshot`, AFTER INSERT/UPDATE/DELETE/TRUNCATE, FOR EACH STATEMENT, calls
    `faqs_queue_snapshot()` (definer, `search_path ''`, EXECUTE revoked).
    - One call per transaction: the transaction-local setting `cosora.faqs_snapshot_queued`
      survives the definer function's exit, because the function's SET clause only restores
      `search_path` (proved in the rehearsal: 3 writes → 1 call).
    - pg_net queues inside the transaction, so a rolled-back write sends nothing.
    - Never raises: a missing key or a pg_net error is a WARNING, and the admin's write goes
      through.
  - cron `faq-snapshots-refresh`, `17 * * * *`: a `do` block that **raises** if the key is
    missing (so `cron.job_run_details` shows it), else posts. Bounds a lost trigger call to
    an hour, and doubles as a re-invalidation.
- **Reader: `useFaqs()`** (`src/lib/queries/faqs.ts`):
  - `fetch(publicUrl, { cache: "no-cache" })` with a 3 s AbortController;
  - `parseFaqSnapshot()` needs version 1, the right surface, `count === rows.length`, and
    typed fields on every row;
  - anything else (network, non-200, bad JSON, wrong shape) → the unchanged table query.
  - `no-cache` because the CDN sends no `Age` header: a browser caching on its own could
    keep a copy for a full max-age after the edge's copy was already old. The CDN ignores
    client cache headers (HIT with `max-age=0`, `no-cache` or `Pragma`), so revalidating
    costs a CDN hit, never an origin or database read.
- **The CDN is Smart CDN here, whatever the docs say about Free.** Responses carry
  `x-smart-cdn: true`. Supabase documents Smart CDN (edge copy kept until the object
  changes, invalidated on overwrite, "up to 60 s") as Pro only, and this org is Free. Measured:
  - the edge keeps a copy well past max-age: HIT for over 6 minutes without a change;
  - an overwrite is at the origin in 2–3 s. Every request has it within ~47 s (three
    trials, 45.9–46.8 s); in between, about a third of requests still get the old copy;
  - so the window is the invalidation spreading, not max-age. `max-age=300` bounds browsers,
    and would bound the edge if Supabase ever turned Smart CDN off for this plan.
  - Measure it again with `node scripts/faq-cdn-propagation.mjs`.
- **Capacity measured** (`scripts/load/faq-read.k6.js`, one load machine, Mumbai edge):
  - CDN: 500 req/s at p95 256 ms with 0 failures. ~940 req/s at p95 1.7 s is where the load
    machine gave out: the edge answered all 50,384 requests it received with 200, as cache
    hits, in ~15 ms.
  - Table fallback: flat p95 ~360 ms from 25 to 150 req/s, 0 failures (not pushed further,
    because that pool serves the whole app).
  - 10k concurrent users each opening an FAQ page every 20 s is 500 req/s.
- **Egress:** a CDN hit is ~1.9 KB on the wire and counts against the Free plan's separate
  5 GB cached-egress quota, not the shared 5 GB uncached one. The load test used ~125 MB.
- **Tests:** `tests/faqs-snapshot.spec.ts` (snapshot path, six fallbacks, edit timing);
  `scripts/faq-snapshot-check.mjs` (consistency and write refusal). The Phase 9 spec's pages
  block the snapshot and read the table, because it checks each edit at once.
- **The migration's header** says an edit reaches visitors "within 5 minutes". That was
  written from the docs' Free-plan claim before the measurement. The file stays as applied;
  this section is the correction.

---

## Profile contact details — private columns, narrow readers (2026-09-23)

Phase 11 of the My Profile brief (MPF-3). `profiles.email` and `profiles.phone` aren't
client-selectable. The migrations are `20260923171821_profiles_contact_columns_private.sql`, the interim
`20260923174653_profiles_contact_columns_interim_authenticated.sql`, and
`20260923190354_profiles_contact_columns_revoke_interim.sql`, which ended it.

- **Grants.** `profiles_select` is still `USING (true)`: names, avatars, roles and
  `account_status` are read everywhere (chat, reviews, quotes, callGate). anon and
  authenticated have **column** SELECT on `id`, `full_name`, `avatar_url`, `active_role`,
  `onboarded`, `account_status` and `created_at`.
  - `select=*`, or a filter, `order` or `or=` on `email`/`phone`, fails with 42501. So does
    returning either column.
  - UPDATE is unchanged: `saveProfileFull()` and `saveAccountInfo()` still write the user's own
    email and phone.
  - A new `profiles` column isn't client-readable until it's granted on purpose. The
    migration's self-check fails if the column list changes.
  - **Interim, ended:** `20260923174653` granted the two columns back to authenticated until
    both front ends were deployed (MPF-19). `20260923190354` revoked it on 2026-09-24, after
    the live bundles were checked. No client role can read them now.
- **Readers.** Each is SECURITY DEFINER, with `search_path = ''` and EXECUTE for authenticated
  only:

  | Function | Returns | Gate | Used by |
  |---|---|---|---|
  | `my_contact_info()` | own `email`, `phone` | `auth.uid()`'s row only | `fetchMyContactInfo()` in `src/lib/queries/myContact.ts` → `AuthContext`, `fetchProfileFull()`, the data export |
  | `call_buyer_contact(p_buyer_id)` | the buyer's `phone`, `full_name` | the caller has quoted on one of the buyer's RFQs; neither account suspended; their chat not under review | `useCallBuyer()` |
  | `admin_profile_search(p_term, p_limit)` | id, name, email, status, role, created | any active admin | Cosora-Admin Accounts and Chats search |
  | `admin_profile_emails(p_ids)` | id, name, email | any active admin | Cosora-Admin chat participants and suspension-history actors |

- **`call_buyer_contact()` is callGate in the database.**
  - A refusal is a 42501 whose message is the reason, checked in this order: `not_signed_in`,
    `caller_suspended`, `no_rfq_relationship`, `target_suspended`, `under_review`.
  - The relationship check comes before anything about the buyer, so a stranger learns nothing
    more.
  - It ignores quote status on purpose, because a vendor can set their own (MPF-18).
  - `useCallBuyer()` maps the reason to callGate's copy and no longer calls `callGate()` itself.
  - `useCallVendor()` keeps the client gate, because a vendor's business phone
    (`vendor_profiles.phone`) is public by design.
- **`fetchProfileFull()` throws on a read error.** It used to return blanks, and
  `useEditableProfile` seeds its form from the first result, and while `saveProfileFull()`
  wrote every field (MPF-9, fixed 2026-09-24) a refused read could have been saved over real
  values. It still matters: blanks would show in place of real values.
- **Tests:**
  - `scripts/profile-contact-privacy-check.mjs`: every role, over HTTP;
  - `scripts/contact-gate-check.mjs`: the client and server gates in every state;
  - `tests/profile-contact-privacy.spec.ts`: the page sweep, Call Buyer and the admin.

---

## Calls — one write path, `log_call()` (2026-09-23)

Phase 12 of the My Profile brief (MPF-2). Migration
`20260923182259_calls_writes_only_through_log_call.sql`.

- **No client writes.** anon and authenticated have no INSERT, UPDATE, DELETE or TRUNCATE on
  `public.calls`, and `calls_insert` and `calls_write` are dropped. `calls_select` (buyer,
  vendor or admin) is unchanged.
- **`log_call(p_vendor_id, p_product_context default null)`** returns jsonb. It's SECURITY
  DEFINER, with `search_path = ''` and EXECUTE for authenticated only.
  - It refuses: `not_signed_in` and `account_not_active` (42501); `not_a_vendor` (no
    `vendor_profiles` row) and `cannot_call_self` (22023).
  - It sets `buyer_id = auth.uid()`, `direction = 'outgoing'` and `created_at = now()`. No
    client value reaches them.
  - `product_context`: whitespace collapsed, trimmed, at most 200 characters, empty → null.
  - Rate limit, after a per-caller `pg_advisory_xact_lock`:
    - `{status: 'rate_limited', retry_after_seconds}` within 60 s of the caller's last call to
      the same vendor;
    - `{status: 'too_many_calls'}` at 5 calls to one vendor in 24 h, or 30 in an hour.

    Otherwise it returns `{status: 'logged', id}`.
- **`useCallVendor()`** calls it fire-and-forget, after callGate and the phone lookup. The dial
  never waits on it, and the Calls query is invalidated only on `logged`.
- **Nothing logs vendor-initiated calls.** `useCallBuyer()` doesn't log, so `direction` is
  always `outgoing`. `callAnalytics.ts` maps it to the vendor's point of view.
- **Tests:** `scripts/suspension-gate-check.mjs` (active/suspended pair and direct-write
  refusals). The check leaves one tagged call per run, because no client can delete `calls`.

---

## Profile stats — owner-filtered counts (2026-09-24)

Phase 13 of the My Profile brief (MPF-1). No migration.

- **Each "my N" count on `/profile` filters on the owner column.** Calls is `useCallCount()`
  (`calls.buyer_id`); Quotes and Chats are `useProfileStats()`. The SELECT policies admit more
  than the user's own rows: `quotes_select` admits the vendor who sent a quote and every admin,
  `conversations_select` admits support and super_admin admins, and `calls_select` admits the
  vendor and admins.
- **Quotes** = quotes received on the user's own RFQs. `quotes` has no buyer column, so the
  count embeds the parent with an inner join and filters on it:
  `select("id, rfqs!inner(buyer_id)", { count: "exact", head: true }).eq("rfqs.buyer_id", userId)`.
  There is one FK (`quotes_rfq_id_fkey`), so the embed is unambiguous. It is the set My Quotes
  totals.
- **Chats** = ``.or(`user_a.eq.${userId},user_b.eq.${userId}`)``, the filter `useConversations()` uses for
  the `/chats` list.
- Both throw on a read error rather than rendering 0.
- **Tests:** `tests/profile-quotes-chats-stat.spec.ts`. demo-admin catches the bug, which
  demo-buyer can't. `tests/profile-calls-stat.spec.ts` covers Calls.

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

## Load testing — k6 against the live project (Master Prompt 12 Part F, 2026-09-23)

`scripts/load/`: `mint-tokens.mjs` → `marketplace.k6.js` → `analyze.mjs`. There is no
staging project (branching needs a paid plan), so it runs against production, inside the
synthetic population, with these rules. Each one exists because breaking it would touch a
real user, a real bill or the moderation system. **That population was deleted on
2026-09-23** (see "The load-test population" below). Re-running the harness needs a new one,
tagged the same way so the same cleanup script can remove it:

- **Sign in first, outside k6.** GoTrue rate-limits password grants per IP: 151 sign-ins in 4
  minutes from one address drew two 429s, each cleared by a 60 s wait. Fifty VUs signing in at
  t=0 would measure that limit, not the marketplace. Tokens (1 h) go to a file outside the
  repo.
- **Same calls as the app.** Every select is copied from `src/lib/queries/*`: New Arrivals,
  product detail, search + hydration, My Quotes, the vendor dashboard's plan / pool / quoted-ids
  / vector ranking / direct inbox, quote submit, RFQ post, chat history + send.
- **Writes stay synthetic.**
  - View counters only on `[LOADTEST]` listings, and no `engagement_events`, so no real
    vendor's analytics move.
  - Quotes only on `[LOADTEST]` RFQs. Chat only in the buyer's existing loadtest↔loadtest
    thread (0 of the 220 involve a real user).
  - Letters-only chat text: digits match the phone flag, `@` the email flag, and a flag locks
    the thread.
  - Searches only for terms with a cached embedding (no OpenAI call). New RFQs at 3% of buyer
    iterations, since each one is an embedding job.
- **Egress is metered** (5 GB/month, org-wide on the free plan). The New Arrivals query ships
  the whole live catalogue: 377 rows, 21 KB gzipped (149 KB raw). The vendor lead pool ships
  every open RFQ: 253 rows, 12.5 KB gzipped. One realistic 10→50-VU step run received
  36.8 MB.
- **Cap refusals are answers, not failures.** Each `P0001` lead-cap refusal is counted
  separately, and its "already quoted N" is checked against the vendor's dashboard number
  (the findings §2 regression).
- **Read the server side too.** The client error rate hides pool exhaustion (see claude.md:
  the gateway retries `504 PGRST003`). Sample `pg_stat_activity` during the run, then read
  `postgrest_logs` / `postgres_logs` / `edge_logs` for the window with `query_logs`, and
  split k6's own timings (`http_req_connecting` / `tls_handshaking` / `waiting`) to place a
  stall.

**Measured capacity on the current free-tier project (2026-09-23, from India to the project's
region, ~300 ms RTT floor).**
- **Realistic users (1–3 s think time):** throughput is linear to 50 VUs, at 7→15→22→30→38
  req/s with p95 0.65–1.1 s and 0 failures. That was after `20260923093304`; before it, the
  health check's 64 s scan emptied PostgREST's pool at 50 VUs.
- **No think time:** 66 req/s at 25 VUs, ~128 req/s steady at 50 VUs, p95 ~0.6 s. A burst of 50
  simultaneous requests queues up to 7 s behind PostgREST's pool of ~10 connections, with no
  PGRST003 at that size.
- **Connections:** peak 29 of 60 in total; PostgREST never exceeded ~11, whatever the load.
  The 60 ceiling (findings §1) is therefore not what limits 50 concurrent users. PostgREST's
  pool size and payload size are, in that order. Queries are cheap in the database (New Arrivals
  9.7 ms, search 20 ms, vendor plan 6.5 ms).
- **Payload scales with the catalogue, not the page.** New Arrivals sends every live product
  and the vendor lead pool every open RFQ. At 10k products a New Arrivals visit would be
  ~560 KB gzipped, and 5 GB of egress would cover ~9,000 visits a month. Pagination is the fix,
  and it is a UX decision, not done here.

## Testing Patterns

Established 2026-09-05, when the chat pipeline was first tested at both layers.
Follow these rather than reinventing them; each one exists because its absence
produced a wrong result.

### Test credentials come from the environment (2026-09-11, Master Prompt 8)

`scripts/lib/test-credentials.mjs` (Cosora-Admin has an identical copy) is the only
place a test reads a password. It checks `process.env` first, so CI can inject
repository secrets, then the gitignored `.env`. Names are in `.env.example`:
`DEMO_BUYER_PASSWORD`, `DEMO_VENDOR_PASSWORD`, `DEMO_ADMIN_PASSWORD`,
`MP_VENDOR_PASSWORD`, `MP5_LINK_PASSWORD`, `TEST_VENDOR_PASSWORD`, `FIXTURE_PASSWORD`.

| Caller | Use | Why |
|---|---|---|
| `scripts/*.mjs` | `credential(name)`, `demoAccount(role)`, `demoPasswordFor(email)` | Throws with the variable's name, rather than surfacing later as "Invalid login credentials" |
| `tests/*.spec.ts` | `optionalCredential(name)` / `hasCredentials(...)` + `test.skip(...)` | A throw while Playwright collects files aborts every spec, not just this one |
| The dev account switcher | `__DEMO_PASSWORDS__`, defined in `vite.config.ts` | Defined only for `command === "serve"`; `null` in every build |
| Fixture seed SQL (Cosora-Admin) | `current_setting('cosora.fixture_password')` + a guard `DO` block | The SQL editor cannot read `.env`; the guard aborts before any account is created if the setting is missing |

Every demo account now has its own password, so a script that signs in several of them
by address uses `demoPasswordFor(email)`, not one shared constant.

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

**The load-test population** — `loadtest-buyer-1..250` / `loadtest-vendor-1..120`
`@cosora.test`, one shared password read as `LOADTEST_PASSWORD` (`.env`, never source),
content tagged `[LOADTEST]`. Created 2026-09-16 outside both repos, and live in the
production catalogue until **2026-09-23, when `scripts/loadtest-cleanup.sql` deleted it.** None
of these accounts exists now. The notes below stay as the rules for any future population.

- **A user row inserted straight into `auth.users` must carry `''`, not NULL, in
  `confirmation_token`, `recovery_token`, `email_change_token_new` and `email_change`.**
  GoTrue scans them into non-nullable strings, so the password grant fails with
  **HTTP 500 "Database error querying schema"** before it ever checks the password. The
  row looks perfect in SQL and nobody can log in. All 370 were like this; repaired
  2026-09-23 by `scripts/loadtest-auth-token-repair.sql` and verified with
  `scripts/loadtest-login-check.mjs`. The other four token columns were already `''`.
- **A load-test vendor quotes `[LOADTEST]` RFQs only.** Open-marketplace RFQs include real
  buyers' requests, and a test quote would land in a real inbox.
- **Removal: `scripts/loadtest-cleanup.sql` (written 2026-09-23, run 2026-09-23).** It is not a
  migration and must stay out of `supabase/migrations/`.
  - **The run.** The committed file (md5 `7120cf99…` with LF endings, unchanged since
    `4c4a762`) was sent through MCP `execute_sql`, statements verbatim from `begin;` onward,
    with the header and some inline comments trimmed. It ran first as the dry run, then with
    only the mode set to `'commit'`. The dry run's report matched the expected population
    exactly. The commit run passed its own leftover and drift checks, and its final SELECT
    returned all zeros. The file on disk was never edited. To reuse it for a future
    population, use the same email pattern and `[LOADTEST]` tags. Apart from the mode line,
    only `cosora.loadtest_expected_users` then needs changing.
  - **Dry-run by default.** It deletes inside one transaction, verifies, then rolls back and
    reports. Change one line to `'commit'` to delete for real.
  - **Preflight refusals.** It pins the target to the exact email regex and a count of 370.
    It refuses if an admin, a Storage object, a Bunny video or a signed contract is involved,
    or if a real user's own content would be destroyed (a real vendor's quote on a synthetic
    RFQ, a mixed conversation, a real review).
  - **Post-checks.** Nothing synthetic may remain, and a before/after count of every table's
    real rows must be unchanged.
  - **The cascade was mapped from `pg_constraint` and the DELETE triggers, not assumed, and a
    single `delete from auth.users` is NOT safe:**
    - `trg_products_sync_vendor_catalog` inserts into `vendor_catalog_recompute_queue`
      (FK → `vendor_profiles`) on every product delete. Inside one cascade that can fire after
      the vendor row is gone, violate the FK and abort everything.
    - `messages.quote_id` / `messages.rfq_id` and `rfqs.product_id` are NO ACTION.
    - `engagement_events.viewer_id` is SET NULL, so synthetic views of real listings would
      survive, anonymised.
    - `vendor_contracts` is RESTRICT.
  - Hence the order: conversations → RFQs (quotes cascade) → leftover quotes → ads → products
    → synthetic viewers' events → `auth.users`.
  - Checked 2026-09-23: the population is closed. It has 0 links to real users' content and
    owns 0 Storage objects; every product and RFQ carries the tag.

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
- **`/onboarding` has no role gate, and that is intentional (2026-09-09).** `uploadKycDocument()` has exactly one call site (`Onboarding.tsx:224`) and the route carries no guard in `App.tsx` and no role check in the page, because "Buyer → Vendor requires completing full vendor onboarding first" — a buyer walking into `/onboarding` is the intended way to become a vendor, and finishing it sets `active_role = 'seller'`. This is why `11111111-…` (**demo-buyer@cosora.dev**, a live account) had KYC objects at all. **Residual gap — CLOSED 2026-09-11 (Master Prompt 8, Phase 4):** a buyer who *abandoned* onboarding after picking a PAN left identity documents under an account with no `vendor_profiles` row and no vendor-side `/kyc` page to manage them, because the scan uploaded on pick. Onboarding now holds the picked `File` objects in state and uploads them at submit (PAN always; GST/CIN only with their number); a failed submit calls `discardUnreferencedKycUploads()`, which removes only uploads no `vendor_documents` row references. A scheduled cleanup was rejected: it needs a service-role function (direct deletes on `storage.objects` are refused) and deletes identity documents on a timer. Proven by `vendor-onboarding-write-path.spec.ts`: 0 objects under `<id>/kyc` with three files attached, before submit.
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
- **Role context follows the signed-in account (fixed 2026-09-24, MPF-13).** Until then, `UserRoleContext` started every page load as `"buyer"`, so a vendor was in buyer mode until they used the switcher. Now:
  - `role` is seeded from `profiles.active_role` when the profile loads, once per account per page load. A switch after that stands until a reload. A role set before the profile arrived (OtpVerify at sign-in) is kept. Signing out goes back to buyer.
  - `vendorRegistered` is `vendor_profiles.onboarding_complete` (react-query `["vendor_registered", id]`). localStorage `cosora.vendorRegistered.<id>` is only a hint until the read returns, and is corrected to match it.
  - Onboarding's `setVendorRegistered(true)` updates the cached answer after its own write.
  - Tested by `tests/role-on-load.spec.ts`. Seller-role accounts without a completed registration go to `/onboarding` when switching back (MPF-22).
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
