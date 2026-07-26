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
