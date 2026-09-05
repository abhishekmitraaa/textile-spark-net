# Technical Implementation

Updated automatically whenever implementation details change (schema, APIs, libraries,
patterns, infra choices). This is the depth layer — `documentation/claude.md` holds only
the snapshot.

Last updated: 2026-09-05

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
`supabase/migrations/` (36 as of 2026-09-05). **The Cosora-Admin repo owns some migrations
against the same Supabase project** (`resolve_conversation_review`, `regex_probe`, the
`admin_flags` CHECK) — check both `supabase/migrations/` directories before assuming a
function is missing.

### Tables — by domain

| Domain | Tables |
|---|---|
| Identity & roles | `profiles`, `buyer_profiles`, `vendor_profiles`, `vendor_documents`, `admin_role`, `admin_role_values` |
| Catalogue | `products`, `product_images`, `product_videos`, `catalogues`, `categories` |
| Sourcing | `rfqs`, `quotes`, `leads` (via rfq/quote joins), `recently_viewed` |
| Saves & follows | `saved_items`, `saved_folders`, `saved_folder_items`, `follows` |
| Chat | `conversations`, `messages`, `conversation_reviews`, `chat_block_reasons`, `flag_patterns`, `keyword_blocklist` |
| Reviews | `reviews` (vendor), `product_reviews`, `service_reviews` |
| Ads | `advertisements`, `active_ads` (view), `ad_orders`, `ad_category_benchmarks`, `vendor_ad_verifications` |
| Subscriptions | `subscription_plans`, `vendor_subscriptions`, `subscription_usage`, `subscription_invoices`, `subscription_payment_orders` |
| Moderation & safety | `admin_flags`, `account_suspensions`, `notifications` |
| Telemetry | `calls`, `ad_click`, `ad_impression` |

### Notable functions / RPCs

`approve_vendor_content`, `approve_vendor_content_bulk`, `reject_vendor_content`,
`resolve_conversation_review`, `submit_report`, `set_account_status`, `regex_probe`,
`notify`, `account_is_active`, `is_admin`, `is_conversation_member`, `owns_product`,
`owns_rfq`, `get_vendor_plan`, `expire_subscriptions`, `grant_ad_verification`,
`increment_product_view`, `increment_product_enquiry`, `next_invoice_number`,
`reply_to_review`, `user_has_password`.

Enforcement pattern used throughout: **RLS decides who may touch a row; BEFORE triggers
decide which state transitions are legal.** Moderation RPCs are `SECURITY DEFINER` and
carry no `EXECUTE` grant to `PUBLIC`. See Known Constraints below for the invariants that
must not be undone.

### Storage buckets

- `product-images` — public; insert policy is uploader-scoped
  (`(storage.foldername(name))[1] = auth.uid()::text`). Review photos live here under
  `${buyerId}/reviews/…` — **not** a separate bucket.
- `product-videos` — holds both videos and their posters. MIME allowlist must keep
  `image/jpeg` + `image/webp`; `file_size_limit` 50 MB.

---

## Key Modules

### Data access — `src/lib/queries/`
`ads.ts`, `calls.ts`, `catalogues.ts`, `chat.ts`, `follows.ts`, `notifications.ts`,
`payments.ts`, `products.ts`, `profile.ts`, `reviews.ts`, `rfqs.ts`, `subscriptions.ts`,
`vendor.ts`, `vendorDashboard.ts`, `vendorOnboarding.ts`, `vendorStore.ts`, `videos.ts`.

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
