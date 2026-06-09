# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cosora** is a textile marketplace platform built with Lovable.dev. It's a multi-role application enabling buyers to browse, search, and request quotes, and sellers/vendors to manage listings, orders, and business profiles.

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
- **Seller Flow**: `/seller-home`, `/dashboard`, `/products`, `/uploads`, `/leads`, `/advertisements`, `/quotes`
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

## Known Issues & Notes

- **Merge Conflict in App.tsx**: Lines 51–55 and 409–413 contain unresolved git conflicts between MyBusiness/BusinessTools imports. Resolve by keeping or removing these routes as needed.
- **Relaxed TypeScript Config**: `noImplicitAny` and `noUnusedLocals` are disabled; enforce stricter checks before production if needed.
- **Lovable Integration**: The project uses Lovable's `componentTagger` plugin in dev mode for component metadata.
- **Port**: Dev server runs on `localhost:8080` (non-standard, configured in vite.config.ts).

## Testing

- **E2E**: Playwright tests in `tests/` directory. Run `npm run test:e2e` after installing browsers with `npm run playwright:install`.
- **Unit/Integration**: Not currently configured; add Jest or Vitest if needed.

## Deployment

This project is deployed via Lovable. Push changes to the git repo and they sync automatically. Custom domains can be configured in Lovable project settings.
