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
- **Seller Flow**: `/seller-home`, `/dashboard`, `/products`, `/uploads`, `/leads`, `/advertisements`, `/quotes`, `/upload-catalogue`, `/upload-video`
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

### Styling

- **Tailwind CSS** for utility-first styling
- **shadcn-ui** for pre-built accessible components
- Config: `tailwind.config.ts`, `postcss.config.js`

### Path Aliases

TypeScript path alias `@/*` maps to `src/*` (configured in tsconfig.json and vite.config.ts).

## Critical Business Constraints

These must always be true:

- **Chat Monitoring Disclosure** – The legal disclosure "We'll be monitoring the messages" (or similar) is **legally required** in all chat flows. Never remove or hide it.
- **Currency & Timezone** – Default to **INR** and **IST** for all Indian users.
- **Product Moderation** – All product listings go through admin moderation before going live (24–48 hours).
- **Role Toggle Placement** – The "Switch to Buyer/Seller" toggle appears **only** on Vendor Dashboard Home and Buyer Homepage.
- **Image Import Syntax** – All images must use ES module imports: `import img from "@/assets/image.png"` (never file path strings).
- **DashboardLayout** – Every page must wrap in `DashboardLayout` to preserve consistent navigation and headers.

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
- **No Settings Page**: There is no standalone `/settings` route. Sidebar "Settings" links to `/my-store` (seller) and `/profile` (buyer).
- **No Orders Page**: There is no `/orders` route. "Track Orders" maps to `/requirement/my-quotes`; "View Order Details" maps to `/chat`.

## Skills Installed

- **`design-taste-frontend`** — General frontend design taste skill for polished UI
- **`emil-design-eng`** (`emilkowalski/skill`) — Emil Kowalski's philosophy on UI polish, micro-interactions, animation decisions, and invisible details. Invoke with `/emil-design-eng`.

## Testing

- **E2E**: Playwright tests in `tests/` directory. Run `npm run test:e2e` after installing browsers with `npm run playwright:install`.
- **Unit/Integration**: Not currently configured; add Jest or Vitest if needed.

## Deployment

**Primary**: Deployed on **Vercel** at `https://textile-spark-net.vercel.app`
- Project: `abhishekmitraaas-projects/textile-spark-net`
- Team: `abhishekmitraaas-projects` (team_m86fYQNTuPr5kMKkb6qWi32B)
- To redeploy: `vercel --yes` from project root (requires Vercel CLI login)
- GitHub auto-deploy: not yet connected — push to GitHub does NOT auto-deploy; manual `vercel --yes` required

**Secondary**: Also synced via Lovable.dev. Push changes to the git repo and they sync automatically. Custom domains can be configured in Lovable project settings.

## Documentation & Knowledge Management

This project uses automatic documentation hooks configured in `.github/copilot-instructions.md`. Documentation updates happen automatically after each chat without prompting:

- **CLAUDE.md** is updated with architectural decisions, technical findings, and constraint changes
- **changelog.md** is updated with what was built, changed, or fixed (including commit hashes and file ranges)
- **memory/** directory stores project-specific knowledge:
  - `memory/MEMORY.md` — index of all memory files
  - `memory/cosora_platform.md` — business context, three-sided platform mechanics, domain terms
  - `memory/cosora_constraints.md` — critical business and legal constraints (chat disclosure, currency, moderation, etc.)

These three files (CLAUDE.md, changelog.md, memory/) are the sole source of truth for project context and state across sessions. Future sessions start by reading them — do not scan chat history.
