# Cosora — Vendor ↔ Buyer Connections & Supabase Readiness Report

> Deep-dive audit of how the **vendor side** and **buyer side** are (and are not) connected today, and exactly what a Supabase backend needs to wire them together so that *"what a vendor uploads is what a buyer sees."*
>
> **Scope:** analysis + recommendations only. Nothing in this document has been implemented. Date: 2026-07-01.

---

## 1. Executive Summary

**Today the app is 100% front-end with no backend, no database, and no authentication.** Both the vendor and buyer experiences are visually complete, but they are **data-disconnected**: every "connection" between the two sides is *simulated* using **separate hardcoded mock datasets on each side**. A product a vendor "uploads," an RFQ a buyer "posts," a quote a vendor "sends," a review a buyer "writes" — none of it persists, and none of it crosses from one side to the other.

Concretely:
- **No Supabase client in the codebase.** There is no `@supabase/supabase-js` dependency, no `createClient`, no `VITE_SUPABASE_*` env vars, and no network calls to any backend. (A Supabase MCP connection is available to the tooling, but the app itself is not wired to any project.)
- **No real auth.** `Login`, `OtpVerify`, `RoleSelection` are UI-only. Role is a local toggle in `UserRoleContext` (`buyer | seller`), defaulting to `buyer`, not persisted.
- **State that "persists"** does so only in the **buyer's own browser** via `localStorage` (wishlist, following, recently-viewed, preferences, quote statuses). It never reaches a vendor.
- **Vendor "uploads"** (products, catalogues, videos, ads, profile edits) are **local component state or hardcoded arrays** — they are never saved and never surface on the buyer side.

**Bottom line:** the *UI contract* for the two-sided marketplace exists everywhere; the *data contract* exists nowhere. Supabase needs to become the single shared source of truth that both sides read from and write to.

---

## 2. Current Data Layer Inventory

### 2.1 Buyer reactive stores (module-level + `useSyncExternalStore` + `localStorage`)
| Store | File | Persists to | Scope |
|---|---|---|---|
| Wishlist / Saved folders | `src/lib/savedStore.ts` | `localStorage: cosora.saved.v1` | Buyer browser only |
| Followed brands | `src/lib/followingStore.ts` | localStorage | Buyer browser only |
| For You preferences | `src/lib/preferencesStore.ts` | localStorage | Buyer browser only |
| Buyer profile | `src/lib/profileStore.ts` | localStorage | Buyer browser only |
| Recently viewed | `src/lib/recentlyViewedStore.ts` | `localStorage: cosora.recentlyViewed.v1` | Buyer browser only |
| Quote statuses | `src/lib/quotesStore.ts` | `localStorage: cosora.quotes.v1` | Buyer browser only |

### 2.2 Mock data sources (static, in-repo)
| Source | File | Used by |
|---|---|---|
| New Arrivals sample | `src/lib/api.ts` (`getNewArrivals`) | Buyer feed (in-memory, 140ms fake latency) |
| Listing product factory | `src/lib/listingProducts.ts` | Buyer cards / seeds |
| Quotes + RFQs | `src/lib/quotesData.ts` | Buyer `MyQuotes` only |
| Video Close-Ups | `src/data/videoCloseUps.ts` | Buyer feeds + viewer (has `vendorId` refs) |
| Seller categories taxonomy | `src/data/sellerCategories.ts` | Both sides (reference) |
| Vendor blogs | `src/data/vendorBlogs.ts` | Vendor blog pages |
| Vendor fixtures (quote summary, onboarding) | `src/hooks/useVendorData.ts` | Vendor dashboard (React Query + fixtures) |

### 2.3 Per-page hardcoded arrays (not shared, not persisted)
Nearly every page defines its **own** local arrays: `NewArrivals` (`BASE_PRODUCTS`), `Trends`, `Sale` (`BASE_SALE`), `Search`, `ProductDetail` (`PRODUCTS`), `VendorProfile` (CARAMEL demo), `Products` (vendor `PRODUCTS` via `useState`), `Leads`, `Quotes` (vendor), `Chat`, `Reviews`, `Advertisements`, `BusinessProfile` (vendor demo). **These datasets do not share an ID namespace** (see §5.1).

---

## 3. The Core Connections (Vendor produces → Buyer consumes)

Status legend: 🔴 **Disconnected** (separate mock data each side) · 🟡 **Partial** (shared static file, but no write path) · 🔵 **Buyer-only / one-sided** (no vendor counterpart yet) · ⚪ **Missing** (neither side).

### A. Products & Listings — 🔴 Disconnected
- **Vendor creates:** `Upload.tsx`, `UploadCatalogue.tsx`, `Products.tsx` (edit/delete/duplicate on a local `useState(PRODUCTS)` array; deletes are toast-only).
- **Buyer sees:** `NewArrivals`, `Trends`, `Sale`, `Search`, `BrowseProducts`, `ProductDetail`, `VendorProfile` products, `api.getNewArrivals`.
- **Reality:** Vendor product uploads go nowhere; buyer feeds render unrelated hardcoded arrays. A product's `id` on the buyer side (`p1`, `na-1`, `s1`, `vp-1`…) has **no relationship** to any vendor product.
- **Needs:** `products` table (owned by `vendor_id`), image storage, moderation status, and every buyer feed querying it.

### B. Product Videos ("Video Close-Ups") — 🟡 Partial
- **Vendor creates:** `UploadVideo.tsx` (local form; "Video Closeup" terminology, never "Reels").
- **Buyer sees:** `VideoCloseUpsViewer`, `NewArrivals` video row, `VendorProfile` videos, `/video-closeups`.
- **Reality:** Both reference the **shared** `src/data/videoCloseUps.ts` (which even carries `vendorId` values `v5`–`v11`), so the *read model is shared* — but the vendor upload flow does **not write** to it. Closest thing to a real connection in the app.
- **Needs:** `product_videos` table + video storage bucket; upload writes, feeds read.

### C. Catalogues (PDF) — 🔴 Disconnected
- **Vendor creates:** `UploadCatalogue.tsx` (PDF upload, visibility, 24–48h moderation notice — all local).
- **Buyer sees:** intended in `ProductDetail` / `VendorProfile` / quote "Documents" (currently the quote `Specifications.pdf` is a mock `#` link in `quotesData.ts`).
- **Needs:** `catalogues` table + PDF storage bucket + visibility rules (all buyers / verified only / private).

### D. Vendor / Business Profile — 🔴 Disconnected
- **Vendor edits:** `BusinessProfile.tsx` (blue, editable) — demo brand "Caramel Fashion", Surat.
- **Buyer sees:** `VendorProfile.tsx` (coral, view-only) — **separate** demo "CARAMEL", Gwalior, with its own About/Contact/Capacity/Sells.
- **Reality:** Two independent hardcoded profiles. Editing the vendor profile changes nothing on the buyer's `VendorProfile`. Follower count, "All Items", ratings, categories are all static per side.
- **Needs:** one `vendor_profiles` table; the vendor page writes, the buyer page reads the same row by `vendor_id`.

### E. Advertisements / Sponsored placements — 🔴 Disconnected
- **Vendor creates:** `Advertisements.tsx`, `AdvertisementSlideshow.tsx`, `OldAdvertisements.tsx`, `CompetitorAds.tsx`.
- **Buyer sees:** "Brand Picks — sponsored", "we recommend … AD", "Recommended Premium Brands — AD" (NewArrivals), Sale hero, "sponsored" hero slide in `EverydayFashionHero`.
- **Needs:** `ad_campaigns` table (vendor, budget, placement, product/target, active window) + a buyer-side ad-serving query; ties into Subscription billing.

### F. RFQ ↔ Leads ↔ Quotes — 🔴 Disconnected (⚠️ this is the marketplace's core loop)
This is the most important and most broken chain:
1. **Buyer posts RFQ** — `PostRequirement.tsx` `submit()` only does `setStep("success")`. **The RFQ is never saved.**
2. **Vendor receives Lead** — `Leads.tsx` shows a hardcoded list of leads; actions are toast-only. Not derived from any buyer RFQ.
3. **Vendor sends Quote** — `Quotes.tsx` (vendor `SellerQuotesView`) is fully mock; no write path.
4. **Buyer sees Quotes Received** — `MyQuotes.tsx` reads `quotesData.ts`/`quotesStore.ts`, a **different** mock set. Accept/Shortlist/Reject persist only to the buyer's `localStorage` and never notify the vendor.
- **Reality:** all four steps are independent islands. A buyer accepting a quote does not reach the vendor; a vendor's quote never reaches a buyer.
- **Needs:** `rfqs`, `rfq_items`, `quotes` tables with a real state machine (pending → shortlisted → accepted/rejected), plus notifications. This is the #1 priority for a functioning marketplace.

### G. Chat / Messaging — 🔴 Disconnected
- `Chat.tsx` (both roles) and the `VendorChatModal` in quotes are mock conversations. "Call Now" everywhere routes to `/chats/:vendorId` but no thread persists.
- **Legal constraint (CLAUDE.md):** the chat-monitoring disclosure is mandatory and must remain in any real chat.
- **Needs:** `conversations` + `messages` tables, ideally Supabase **Realtime** for live delivery; a `buyer↔vendor` thread keyed by both user ids (+ optional product/quote context).

### H. Reviews & Ratings — 🔴 Disconnected
- **Buyer writes:** `VendorProfile` `WriteReviewModal` (toast only), `ProductDetail` review section (mock), quote flow.
- **Vendor sees / displayed:** `Reviews.tsx` (vendor, mock), rating breakdown on `VendorProfile` & `ProductDetail` (static 4.5 / 90-5-0-0-15).
- **Needs:** `reviews` table (buyer_id, vendor_id or product_id, rating, text); aggregates feed the breakdowns and the "Top Rated" quote badge.

### I. Following / Followers — 🔵 Buyer-only
- **Buyer:** `followingStore.ts` + `Following.tsx`/`FollowingViewAll.tsx`; `VendorProfile` Follow/Unfollow is **local state only** (not even wired to `followingStore`).
- **Vendor:** the "7,333 Followers" figure is static and never reflects real follows.
- **Needs:** `follows` (buyer_id, vendor_id) join table; vendor follower count = `count(*)`; buyer Following feed = products from followed vendors.

### J. Wishlist / Saved — 🔵 Buyer-only (needs per-user persistence)
- `savedStore.ts` folders + products in `localStorage`. Works well, but is device-bound and anonymous. No vendor visibility (though "saves" could feed vendor analytics).
- **Needs:** `saved_folders` + `saved_items` tables keyed by `buyer_id`.

### K. Recently Viewed — 🔵 Buyer-only
- `recentlyViewedStore.ts` in `localStorage`; `ProductDetail` calls `recordView()`. Device-bound.
- **Needs (optional):** `product_views` table (also powers vendor analytics + "For You").

### L. Preferences / For You — 🔵 Buyer-only
- `preferencesStore.ts` (categories/locations). Drives the For You feed locally.
- **Needs:** `buyer_preferences` row per user; feed becomes a server query.

### M. Buyer Profile — 🔵 Buyer-only
- `profileStore.ts` (profile/social/notifications/regional). Local only.
- **Needs:** `buyer_profiles` table keyed to the auth user.

### N. Analytics / Leads / Total Order Value — 🔵 Vendor-only (derived, all mock)
- `Analytics.tsx`, `useVendorData.ts` fixtures, `SellerHome` stats, `BusinessProfileScorePage`. "Total Order Value" is the stated key retention metric but is fabricated.
- **Needs:** derived from real `product_views`, `leads`, `quotes`, `orders` once those exist.

### O. Orders — ⚪ Missing
- No `/orders` route by design (CLAUDE.md); "Track Orders" → `/requirement/my-quotes`, "View Order Details" → `/chat`. "Total Order Value" has no backing.
- **Needs (future):** `orders` table once an accepted quote can convert to an order.

### P. Auth / Users / Roles / Verification — ⚪ Missing (foundational)
- `Login`/`OtpVerify`/`RoleSelection`/`SubRole`/`AccountInfo` are UI-only; `UserRoleContext` is a local toggle.
- **TrustSEAL** (`src/assets/Trustedseal.png`) is rendered from a static `verified` boolean on mock products — not a real verification state.
- **Needs:** Supabase Auth (phone OTP fits the existing UX) + `users`/`profiles` with a `role` and `vendor.is_verified` (TrustSEAL) flag. **Everything else depends on this** — RLS, ownership, and "who sees what" all key off the authenticated user.

### Q. Categories / Taxonomy — 🟢 Shared reference (OK as seed)
- `sellerCategories.ts` + category lists in `PostRequirement`/feeds. Fine to seed into a `categories` table; low priority.

### R. Subscriptions / Ads billing — 🔵 Vendor-only
- `Subscription.tsx` (plans), `TradeSEAL` paid badge. Mock.
- **Needs:** `subscriptions` table; gates TrustSEAL + ad placements.

---

## 4. Proposed Supabase Schema (for planning — not implemented)

### 4.1 Tables (core)
```
profiles            (id → auth.users, role: buyer|seller|admin, full_name, phone, email, avatar_url, created_at)
vendor_profiles     (id → profiles.id, brand_name, about, city, country, address, business_type,
                     company_md, employees, year_established, member_since, annual_turnover, gst, pan,
                     website, capacity[]  , is_verified (TrustSEAL), followers_count, created_at)
buyer_profiles      (id → profiles.id, display_name, social{}, notifications{}, regional{})
categories          (id, name, group, parent_id)
vendor_categories   (vendor_id, category_id)               -- "Brand's Categories" / "Sells"
products            (id, vendor_id, name, description, price, price_value, currency, moq, fabric, gsm,
                     fit_type, gender, category_id, status: draft|under_review|live|rejected,
                     rating_avg, reviews_count, sold_count, enquiries_count, created_at)
product_images      (id, product_id, url, position)        -- Supabase Storage bucket: product-images
product_videos      (id, product_id, vendor_id, url, thumbnail_url, caption, duration)  -- bucket: product-videos
catalogues          (id, vendor_id, name, pdf_url, visibility: all|verified|private)    -- bucket: catalogues
ad_campaigns        (id, vendor_id, product_id, placement, budget, starts_at, ends_at, status)
rfqs                (id, buyer_id, category_id, title, description, quantity, budget_min, budget_max,
                     status: active|closed, deadline_at, created_at)
rfq_items / rfq_fields (id, rfq_id, key, value)            -- per-category schema fields from PostRequirement
quotes              (id, rfq_id, vendor_id, price_per_unit, currency, price_inr, moq, lead_time,
                     sampling_cost, sample_timeline, fabric, comment, payment_terms,
                     status: pending|shortlisted|accepted|rejected, submitted_at)
quote_attachments   (id, quote_id, type: image|video|doc, url)
leads               (id, vendor_id, buyer_id, source: rfq|enquiry|call, rfq_id?, product_id?, status)
conversations       (id, buyer_id, vendor_id, product_id?, quote_id?, last_message_at)
messages            (id, conversation_id, sender_id, body, created_at)   -- Realtime
reviews             (id, buyer_id, vendor_id?, product_id?, rating, body, created_at)
follows             (buyer_id, vendor_id, created_at)                    -- PK(buyer_id, vendor_id)
saved_folders       (id, buyer_id, name)
saved_items         (folder_id, product_id)
product_views       (id, buyer_id, product_id, viewed_at)               -- recently viewed + analytics
buyer_preferences   (buyer_id, categories[], locations[], completed_onboarding)
subscriptions       (id, vendor_id, plan, status, current_period_end)
orders (future)     (id, buyer_id, vendor_id, quote_id, amount, status)
```

### 4.2 Storage buckets
`product-images`, `product-videos`, `catalogues`, `avatars`, `quote-attachments`. (Note the CLAUDE.md rule about ES-module image imports applies to *bundled* assets; user-uploaded media should be public/ signed Storage URLs, not imports.)

### 4.3 Cross-cutting rules
- **RLS everywhere**, keyed to `auth.uid()` and `profiles.role`. Vendors write only their own `products/quotes/ads`; buyers write only their own `rfqs/reviews/saves/follows`; both read the shared catalog subject to `status='live'` and catalogue visibility.
- **Moderation:** `products.status` gate (`under_review` → `live`) implements the documented 24–48h review; buyer feeds filter `status='live'`.
- **Realtime** on `messages` (chat) and optionally `quotes`/`leads` (live "new quote" badges).
- **Currency:** keep the existing per-vendor `currency` + INR-normalized field pattern (already used in `quotesData.ts`) at the DB level for correct cross-currency ranking.

---

## 5. Cross-Cutting Gaps & Risks

### 5.1 ID namespace mismatch (blocker)
Buyer product IDs (`p1`, `na-1`, `s1`, `vp-1`, `rec-1`, `sp1`…), vendor product IDs (in `Products.tsx`), video `vendorId`s (`v5`–`v11`), and quote `vendorId`s (`textile-masters`, `global-garments`…) are **all invented independently**. There is no shared key, so nothing can be joined today. A single `products.id` / `vendor_profiles.id` space (UUIDs) is prerequisite to every connection above.

### 5.2 No write paths from vendor "create" screens
Every vendor upload/edit screen ends in local state or a toast. They need real `insert/update` calls before any buyer can see the result.

### 5.3 RFQ loop is entirely severed
`PostRequirement.submit()` discards the RFQ. Until it writes an `rfqs` row (and fans out to `leads`), the vendor `Leads` list and buyer `MyQuotes` can never reflect real activity. Highest-value fix.

### 5.4 Auth is the foundation
Without Supabase Auth + `profiles.role`, there is no "owner" for products/quotes and no RLS — so nothing can be safely shared. Must come first.

### 5.5 Analytics/Total Order Value are fabricated
The stated key retention metric has no backing data; it should be derived once views/leads/quotes/orders exist.

### 5.6 File uploads are simulated
Images use Unsplash/picsum URLs; PDFs/videos are placeholders. Real uploads require Storage buckets + signed URLs + size/type validation (the UIs already collect files locally).

---

## 6. Recommended Phasing (when you decide to implement)

**P0 — Foundation**
1. Add `@supabase/supabase-js` + client + `VITE_SUPABASE_URL/ANON_KEY`.
2. Supabase Auth (phone OTP to match existing screens) + `profiles` with `role`; make `UserRoleContext` read the authed role.
3. `products` + `product_images` + Storage; vendor `Upload`/`Products` write; buyer feeds (`NewArrivals`, `Trends`, `Sale`, `Search`, `ProductDetail`, `VendorProfile`) read `status='live'`. **Establishes the "upload = see" contract and a shared ID space.**

**P1 — Marketplace loop**
4. `rfqs` + `quotes` + `leads`: `PostRequirement` writes; vendor `Leads`/`Quotes` read+respond; buyer `MyQuotes` reads real quotes; status machine + notifications.
5. `vendor_profiles`: unify vendor `BusinessProfile` (write) and buyer `VendorProfile` (read).
6. `follows` + `reviews`: wire follow counts and rating breakdowns to real data.

**P2 — Engagement & growth**
7. `conversations`/`messages` with Realtime (keep the monitoring disclosure).
8. Move buyer stores (saved, recently-viewed, preferences, profile) to per-user tables (keep localStorage as offline cache).
9. `product_videos`, `catalogues`, `ad_campaigns`, `subscriptions`, analytics/TOV, then `orders`.

---

## 7. Quick Reference — Connection Status Matrix

| Domain | Vendor screen(s) | Buyer screen(s) | Status | Priority |
|---|---|---|---|---|
| Products | Upload, Products, UploadCatalogue | NewArrivals, Trends, Sale, Search, ProductDetail, VendorProfile | 🔴 | P0 |
| Product videos | UploadVideo | VideoCloseUps, NewArrivals, VendorProfile | 🟡 | P2 |
| Catalogues | UploadCatalogue | ProductDetail, VendorProfile, quote docs | 🔴 | P2 |
| Vendor profile | BusinessProfile | VendorProfile | 🔴 | P1 |
| Advertisements | Advertisements, CompetitorAds | Brand Picks / AD blocks, Sale hero | 🔴 | P2 |
| RFQ ↔ Leads ↔ Quotes | Leads, Quotes | PostRequirement, MyQuotes | 🔴 | **P1 (core)** |
| Chat | Chat | Chat, VendorChatModal | 🔴 | P2 |
| Reviews | Reviews | VendorProfile, ProductDetail | 🔴 | P1 |
| Following | (followers count) | Following, VendorProfile | 🔵 | P1 |
| Wishlist | — | Saved, all product cards | 🔵 | P2 |
| Recently viewed | (analytics) | RecentlyViewed | 🔵 | P2 |
| Preferences/For You | — | ForYou | 🔵 | P2 |
| Buyer profile | — | Profile | 🔵 | P2 |
| Analytics / TOV | Analytics, SellerHome | — | 🔵 | P2 |
| Orders | — | — | ⚪ | future |
| Auth / roles / TrustSEAL | Login, RoleSelection | Login | ⚪ | **P0 (foundation)** |
| Categories | sellerCategories | feeds, PostRequirement | 🟢 | seed |
| Subscriptions | Subscription | — | 🔵 | P2 |

---

*Report generated from a static code audit of `src/`. No database changes were made. When you're ready to implement, P0 → P1 → P2 above is the recommended order, with Auth + Products first because every other connection depends on a shared, owned, authenticated data model.*
