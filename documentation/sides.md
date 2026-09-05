# The Three Sides of Cosora

Updated automatically whenever a side's scope, features, or flows change.

Last updated: 2026-09-05

Cosora is fundamentally a three-sided marketplace. **Key mechanic:** the same person can be
both a buyer and a vendor and toggles between the two experiences inside one unified web
app. The toggle appears **only** on the Vendor Dashboard Home and the Buyer Homepage.
Routes for each side are listed in `documentation/sitemap.md`.

---

## Buyer Side

**Primary colour:** Cosora red / coral `#EF4D62`.
**Shell:** `BuyerShell` — BuyerTopBar + content + `MobileBottomNav` + ToTop.

### Purpose
Give a sourcing buyer one place to discover suppliers, state what they need, and get
comparable quotes back — instead of chasing WhatsApp contacts, brokers and trade-fair
business cards.

### ICP
Fashion brands, wholesalers, retailers, designers, sourcing managers and buying houses —
the demand side of India's fashion and textile supply chain.

### Problems solved
- **Discovery is fragmented.** Finding a mill that can do 120 GSM combed cotton at your MOQ
  currently means personal networks and trade fairs.
- **Quotes are not comparable.** Prices arrive as WhatsApp text in inconsistent formats with
  no side-by-side view.
- **Trust is unverifiable.** No way to tell a real manufacturer from a broker or a scam.
- **Stating a requirement is slow.** A full spec sheet is a barrier; Quick RFQ exists
  precisely to remove it.

### Features
- **Discovery feeds** — New Arrivals, For You (preference-driven), Trends, Sale, Following,
  Categories, Recently Viewed.
- **Video Closeups** — a product video reel in the buyer feed. Never called "Reels".
  Windowed viewer, at most 3 `<video>` elements in the DOM. **Saves and likes are durable**
  (`saved_videos` / `video_likes`, hydrated on open) rather than session-local, and the
  active slide records a real view via `increment_video_view`, which is what makes the
  feed's existing `views_count` ordering mean anything. Ranking is seeded from the
  buyer's stored `preferred_categories` and then folded with this-session bookmarks.
- **Search** — text search plus filters and an image-search edge function.
- **RFQs** — **Quick RFQ** (image + quantity, designed for under 30 seconds) or a
  **detailed requirement** via a schema-driven, per-category form.
- **My Quotes** — receive quotes from multiple vendors, compare, accept/reject/negotiate.
  Also where "Track Orders" lands.
- **Saved collections** — wishlist folders, driven by a global Save-to-folder modal mounted
  once in `App.tsx`.
- **Following** — followed brands, plus a separate follow set for brands surfaced on the
  Search Results Brand tab (different id space, deliberately kept separate).
- **Chat** — in-app messaging with a vendor, opened with lead context (product, quantity,
  requirements) pre-loaded. Calls go out via the native phone dialer.
- **Reviews** — write and manage reviews across vendors, products and services
  (`/profile/reviews` fans out across all three tables).
- **Service vendors, freelancers and Cosora Studio** — printers and logistics firms, pattern
  makers / CLO 3D artists / trend researchers, and photographers.
- **Profile** — interest preferences, social links, regional settings, data export,
  notifications, help & support chat.

### User journey
1. Register (phone OTP) → select role → select sourcing interests.
2. Land on the discovery feed; browse, search, save, follow.
3. Post a requirement — Quick RFQ or the detailed per-category form.
4. Receive quotes from multiple vendors in My Quotes.
5. Compare, then negotiate in chat (with the monitoring disclosure visible).
6. Accept, and track through My Quotes.

### Known gaps
- No dedicated buyer Settings page — the sidebar "Settings" link points at `/profile`.
- Video Closeups: the **Share** button in the reel viewer is still inert, and the reel's
  `rating`/`reviews` fields are stored on `product_videos` rather than derived from the
  tagged product's real review data.
- Service vendors, freelancers and photographers are still client-side seed data with no
  `profiles` row, which is why `service_reviews.service_id` is `text` with no FK.

---

## Vendor Side

**Primary colour:** vendor blue `#256fef`. Note that `--accent` and `--primary` in
`src/index.css` are both the **buyer coral**, so vendor pages hardcode `#256fef`.
**Shell:** `DashboardLayout` — sidebar + header.

### Purpose
Give a manufacturer a storefront, a demand pipeline, and a visible reason to stay: leads,
quotes, ads, analytics, and a cumulative Total Order Value.

### ICP
Manufacturers, mills, fabric suppliers, service providers (printers, logistics companies)
and freelancers (pattern makers, CLO 3D designers, trend researchers). **Listing individual
professionals alongside factories is a deliberate differentiator** — no other Indian B2B
fashion marketplace does it, and it positions Cosora as a complete production ecosystem
rather than a supplier directory.

### Problems solved
- **Demand is opaque.** Vendors have no view of who is sourcing what, right now.
- **No credible way to signal quality.** TradeSEAL verification and Profile Score exist for
  this.
- **No marketing surface.** Ads with geographic and category targeting, plus competitor
  intelligence, replace word of mouth.
- **No record of what the platform is worth to them.** Total Order Value is the answer.

### Features
- **Onboarding** — multi-step: business details, documents, products, contract.
- **Catalogue** — products (fabric type, GSM, MOQ, sizes, customization, certifications),
  catalogues, and Video Closeups. **Everything goes through admin moderation before going
  live (24–48 h)** — products and videos both default to `under_review`. A **rejected
  Video Closeup now shows the moderator's reason** on its card in Upload Video, so a
  vendor can act on it instead of resubmitting blind. (A rejected *product* still does
  not — the vendor-facing product list has no equivalent surface yet.)
- **Leads** — buyer inquiries arriving in the dashboard.
- **Quote requests** — respond to RFQs; targeted RFQs are excluded from the leads-used count.
- **Advertisements** — paid campaigns with category and geographic targeting (including Pan
  India), placement pricing, benchmarks, and TradeSEAL verification purchase.
- **Competitor ads** — see what competitors in your category and city are advertising and at
  what budget. A deliberate retention and upsell mechanic.
- **Subscriptions** — Basic / Silver / Gold, determining lead volume, product listing caps
  and ad geography. Enforced by `enforce_plan_limits`. Invoices are first-class.
  **No Razorpay Subscriptions API and no autopay** — every billing period is a discrete
  order the vendor pays explicitly.
- **Analytics** — performance, and **Total Order Value** (e.g. ₹24.5 Lakhs), the platform's
  strongest retention metric.
- **My Store / Business Profile** — storefront, employees, business tools, Profile Score,
  social links, blogs.
- **Chat** — messaging with buyers, subject to the same moderation pipeline.
- **Settings** — Business, Notifications (email/push), Language, Security, Help & Legal.

### User journey
1. Register (phone OTP) → complete multi-step vendor onboarding.
2. Land on the vendor dashboard.
3. List products / catalogues / videos → they sit in `under_review` until admin approves.
4. Receive leads and quote requests; respond with quotes.
5. Run ad campaigns and buy TradeSEAL to raise visibility; watch competitor ads.
6. Negotiate in chat, win orders, watch Total Order Value grow.

### Constraints that shape the vendor UI
- Every vendor page must wrap in `DashboardLayout`.
- Tailwind's named breakpoints overstate available width here — the sidebar takes 256 px
  plus 48 px of padding, so gate wide layouts on `min-[1400px]:` / `min-[1700px]:`.
- A vendor page that looks pink is using a default shadcn `<Button>` or an `accent`/`primary`
  token; hardcode `#256fef` (hover `#1d5ed6`).

---

## Admin Side

**Built, but in a separate repo: `Cosora-Admin`**, running against the same Supabase
project. Older notes in this repo saying the admin side is "not designed, not built" are
stale. It owns some of this project's migrations (`resolve_conversation_review`,
`regex_probe`, the `admin_flags` CHECK), so check both `supabase/migrations/` directories
before assuming a function is missing.

### Purpose
Keep the marketplace trustworthy and monetised: verify who is real, moderate what gets
published, intervene when a conversation goes wrong, and run the commercial layer.

### Responsibilities & features

**Verification**
- Vendor verification and document review (`vendor_documents`, `vendor_profiles`).
- TradeSEAL badge granting (`grant_ad_verification`, `vendor_ad_verifications`).

**Moderation**
- **Content approval** — products, videos and catalogues arrive `under_review`.
  `approve_vendor_content(target_table, target_id)` and
  `reject_vendor_content(target_table, target_id, reason)` act **per item**;
  `approve_vendor_content_bulk(vendor)` flips everything pending for one vendor.
  Approve is gated on `status='under_review'`; reject may act from any status, so live
  content can be taken down.
- **Two moderation screens, one per table.** Products (`/products`) and Video Closeups
  (`/videos`) are siblings, gated to the same two roles, each with queue / live / rejected
  tabs and a required rejection reason. The video screen plays the clip in-panel — a
  moderator cannot judge a video from its poster frame — and flags a row whose `video_url`
  is null rather than letting it be approved into a broken player. Both write
  `status`/`rejection_reason` directly and let RLS plus the BEFORE trigger refuse it; the
  per-item RPCs above are equivalent and unused by the panel. Only the vendor-wide bulk
  button goes through an RPC, because it has no column to write.
- **Chat moderation** — pattern-based flagging locks a conversation and queues a review
  (the message is kept, so support can read it); a keyword blocklist hard-stops a message
  with no trail, which is why it is deliberately empty. Reviews are resolved via
  `resolve_conversation_review`, which can optionally reopen the thread.
- **Flag-pattern management** — patterns are POSIX ARE (word boundary is `\y`, not `\b`),
  tested against the real engine through `regex_probe` before they can be saved.
- **Reports** — buyers and vendors submit reports via `submit_report`; the admin's verdict
  (`reason_id`) is kept separate from what the reporter claimed (`reported_reason`) so
  disagreement is visible.

**Enforcement**
- **Account suspension** — `set_account_status()` is the only writer of
  `profiles.account_status` and the `account_suspensions` audit ledger. Suspension is
  account-level because the same human is both buyer and vendor. It blocks content
  *creation* only: live content stays up, running ad campaigns keep serving, sessions are
  not ended.
- `admin_flags` records flagged entities. `admin_flags_entity_type_check` currently allows
  `vendor`, `product`, `ad` and `conversation` only — **not `video`** — so the Video
  Closeups screen has no flag log until that constraint is widened.

**Monetisation**
- Subscription plans and pricing (`subscription_plans`), plan-limit enforcement, invoices.
- Ad placement pricing and category benchmarks (`ad_category_benchmarks`).
- **Refunds are manual** — `ad_orders.status = 'refund_review'` marks a paid order that must
  not be fulfilled. Monitor that status.

**Analytics & support**
- Platform-level analytics; ad impressions and clicks; call records.
- Support chat, fraud reports, app feedback.

### Rules the admin layer must respect
- **Notifications are written only by `SECURITY DEFINER` functions** — no insert policy for
  any role. Copy is read by buyers and vendors, never admins, so it must never name the
  reporter, the matched pattern, the verdict or the reason.
- **No dynamic SQL in the moderation RPCs** — `target_table` is matched against a fixed list
  with a static `UPDATE` per branch.
- An admin cannot bypass the status triggers by widening RLS; unlocking goes through the
  purpose-built RPC.

---

## Future direction (recorded, not built)

**Working-capital lending.** The data Cosora collects — order volume, capacity, reliability,
pricing, transaction history — is the foundation for a vendor financing product. The schema
is meant to support it from day one even though the product does not exist yet.
