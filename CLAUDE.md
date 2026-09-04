# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Initialization

**At the start of every session, read these files in order:**
1. This file (CLAUDE.md) — architecture and constraints
2. `changelog.md` — what was built, changed, or fixed
3. `memory/MEMORY.md` — index of project-specific memories

These are the sole source of truth for project context. Do not rely on chat history.

## Project Overview

**Cosora** is a B2B sourcing marketplace for India's fashion and textile industry. It connects **Vendors** (manufacturers, mills, suppliers, freelancers), **Buyers** (brands, retailers, designers, sourcing managers), and **Admin** (Cosora ops team). It digitizes India's fragmented fashion supply chain, enabling vendors to list products and run ads, while buyers post requirements (RFQs) and receive quotes from multiple suppliers.

The app is built with Lovable.dev and operates as a single unified web app where users toggle between Vendor and Buyer roles.

**Tech Stack**: Vite + React 18 + TypeScript + shadcn-ui + Tailwind CSS + React Router v6 + React Query + Playwright E2E

## Development Setup

```sh
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:8080
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # Run ESLint
npm run test:e2e     # Run Playwright E2E tests (requires npm run playwright:install first)
```

## Three-Sided Platform Architecture

Cosora is fundamentally a **three-sided marketplace**:

1. **Vendor Side** (Blue #256fef): Manufacturers, mills, suppliers, service providers, freelancers list products/services, receive leads, run ads, manage quotes, track analytics and Total Order Value (strongest retention metric).

2. **Buyer Side** (Red #EF4D62): Brands, retailers, designers, sourcing managers discover products, post RFQs (Quick or detailed), receive quotes from multiple vendors, compare, negotiate via in-app chat.

3. **Admin Side** (Not yet built): Cosora ops team verifies vendors, moderates listings, handles fraud, manages content. No UI designed or built yet.

**Key mechanic**: Same user can toggle between Vendor and Buyer roles via a single unified app. Role toggle appears only on Vendor Dashboard Home and Buyer Homepage.

## Project Architecture

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

## Critical Business Constraints

These must always be true:

- **Chat Monitoring Disclosure** – The legal disclosure "We'll be monitoring the messages" (or similar) is **legally required** in all chat flows. Never remove or hide it.
- **Currency & Timezone** – Default to **INR** and **IST** for all Indian users.
- **Product Moderation** – All product listings go through admin moderation before going live (24–48 hours).
- **Role Toggle Placement** – The "Switch to Buyer/Seller" toggle appears **only** on Vendor Dashboard Home and Buyer Homepage.
- **Image Import Syntax** – All images must use ES module imports: `import img from "@/assets/image.png"` (never file path strings).
- **DashboardLayout** – Every **vendor** page must wrap in `DashboardLayout` to preserve consistent navigation and headers. **Buyer** pages use `BuyerShell` instead (see Buyer-Side Layout & Flows) — do not put DashboardLayout on buyer routes.

## Domain Terms

Key business concepts used throughout the app:

| Term | Meaning |
|---|---|
| **RFQ** | Request for Quotation — a buyer's sourcing requirement post |
| **Quick RFQ** | Simplified RFQ (image + quantity), designed for <30 seconds |
| **Lead** | A buyer inquiry arriving in vendor dashboard |
| **MOQ** | Minimum Order Quantity |
| **GSM** | Fabric weight (grams per square metre) |
| **TradeSEAL** | Cosora's paid vendor verification badge |
| **Profile Score** | Vendor's profile completeness % — higher = better visibility |
| **Total Order Value** | Cumulative orders won through Cosora — strongest vendor retention metric |

## Animation System

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

## Known Issues & Notes

- **Relaxed TypeScript Config**: `noImplicitAny` and `noUnusedLocals` are disabled; enforce stricter checks before production if needed.
- **Lovable Integration**: The project uses Lovable's `componentTagger` plugin in dev mode for component metadata.
- **Port**: Dev server runs on `localhost:8080` (non-standard, configured in vite.config.ts).
- **Current Phase**: Porting and correcting Vendor and Buyer UIs (from Next.js source to Vite/TSX). Admin panel not yet designed or built.
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

## Skills Installed

- **`design-taste-frontend`** — General frontend design taste skill for polished UI
- **`emil-design-eng`** (`emilkowalski/skill`) — Emil Kowalski's philosophy on UI polish, micro-interactions, animation decisions, and invisible details. Invoke with `/emil-design-eng`.

## Payments (Razorpay)

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

## Testing

- **E2E**: Playwright tests in `tests/` directory. Run `npm run test:e2e` after installing browsers with `npm run playwright:install`.
- **Unit/Integration**: Not currently configured; add Jest or Vitest if needed.

## Deployment

**Primary**: Deployed on **Vercel** at `https://textile-spark-net.vercel.app`
- Project: `abhishekmitraaas-projects/textile-spark-net`
- Team: `abhishekmitraaas-projects` (team_m86fYQNTuPr5kMKkb6qWi32B)
- To redeploy manually: `vercel --prod --yes` from project root (requires Vercel CLI login)
- GitHub auto-deploy: **connected** (via `vercel git connect`). Pushing to `main` on `github.com/abhishekmitraaa/textile-spark-net` auto-deploys to production; other branches get preview deploys.

**Secondary**: Also synced via Lovable.dev. Push changes to the git repo and they sync automatically. Custom domains can be configured in Lovable project settings.

## Documentation & Knowledge Management

These three files (CLAUDE.md, changelog.md, memory/) are the sole source of truth for project context and state across sessions. Future sessions start by reading them — do not scan chat history.

- **CLAUDE.md** — architectural decisions, technical findings, constraint changes
- **changelog.md** — what was built, changed, or fixed (with file paths / ranges)
- **memory/** — project-specific knowledge:
  - `memory/MEMORY.md` — index of all memory files
  - `memory/cosora_platform.md` — business context, three-sided platform mechanics, domain terms
  - `memory/cosora_constraints.md` — critical business and legal constraints (chat disclosure, currency, moderation, etc.)

**How updates actually happen (real mechanism, `.claude/settings.json`):**

- **`PreCompact` hook (agent)** — the only thing that *writes* these docs. It runs a review-and-update agent **before every compaction — automatic or manual `/compact`** (the `matcher` is `""` = all; it was previously `"manual"`-only, so it never fired on auto-compaction). This is the automation, and it's tied to the compaction boundary, **not** literally "after each chat."
- **`UserPromptSubmit` hook (command)** — read-only: injects CLAUDE.md + changelog.md + memory/MEMORY.md into context on every prompt. Never writes.
- **`Stop` hook (command)** — posts a reminder only; it does not update anything.
- `.github/copilot-instructions.md` is prose for GitHub Copilot; Claude Code does **not** execute it. Do not treat it as the hook source.

**What this means for you (the assistant):** the `PreCompact` agent is a safety net, not a guarantee. A short session that never compacts won't trigger it, and agent hooks can fail to fire. So when you complete a meaningful chunk of work, **update these docs yourself before ending the session** — do not assume a hook already did it.
