# The Three Sides of Cosora

Updated automatically whenever a side's scope, features, or flows change.

Last updated: 2026-09-22

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
- **Search** — **hybrid keyword + semantic search, ranked server-side** by `search_products`
  → `match_products`: full-text and vector results fused with RRF, then weighted by the
  vendor's paid `search_boost_tier` so relevance and paid boost trade off in one place
  instead of two layers. Plus context-aware filters (faceted over the returned result set),
  voice search, and an image-search edge function. Autocomplete suggests real categories with
  live-listing counts, real listings with enquiry counts, and real vendor storefronts with
  real follower counts. The Brand tab is grouped out of the ranked results, so it can never
  disagree with the Product tab. When a query has no cached embedding the results are
  keyword-only and the footer says so. *(The semantic half is **live** — billing was enabled
  2026-09-09 and every listing carries a real embedding. A query with no match now returns
  zero results rather than the whole catalogue; `embed-query` is rate limited on cache
  misses only.)*
- **RFQs** — **Quick RFQ** (image + quantity, designed for under 30 seconds) or a
  **detailed requirement** via a schema-driven, per-category form.
- **My Quotes** — receive quotes from multiple vendors, compare, accept/reject/negotiate.
  Also where "Track Orders" lands.
- **Saved collections** — wishlist folders, driven by a global Save-to-folder modal mounted
  once in `App.tsx`.
- **Following** — followed brands, plus a separate follow set for brands surfaced on the
  Search Results Brand tab (different id space, deliberately kept separate).
- **Chat** — in-app messaging with a vendor, opened with lead context (product, quantity,
  requirements) pre-loaded. Calls go out via the native phone dialer. Each call is recorded
  by the server (`log_call()`, 2026-09-23): a repeat tap within a minute counts once, and a
  suspended account's calls aren't recorded.
- **Reviews** — write and manage reviews across vendors, products and services
  (`/profile/reviews` fans out across all three tables).
- **Service vendors, freelancers and Cosora Studio** — printers and logistics firms, pattern
  makers / CLO 3D artists / trend researchers, and photographers.
- **Profile** — interest preferences, social links, regional settings, data export,
  notifications, help & support chat. The **Calls** stat counts the buyer's own calls
  (2026-09-23; it was a hardcoded "0"). The **Quotes** and **Chats** stats count the buyer's
  own too: quotes received on their requests, and their conversations (2026-09-24; anyone who
  also sells or is an admin used to see other people's counted in).
- **Settings** (`/profile/settings`, 2026-09-23): the buyer's account and security page.
  - It shows the sign-in number and account email, has Log Out, and notes that sign-in is
    mobile + OTP, so there's no password.
  - It also links to download your data and to Help & Legal, and has the Delete account
    entry.
  - Identity and business details stay on My Profile.
  - The buyer sidebar's "Settings" now opens it; it used to open `/profile`. `/profile` has
    an "Account & Security" row that opens it too.
  - A vendor who refreshes the page starts in buyer mode and sees the buyer sidebar
    (MPF-13, pre-existing).
- **Notification settings are honest** (2026-09-23). The email and push switches are saved,
  but Cosora sends no email or push notifications yet, and nothing notifies a buyer about new
  quotes, messages or RFQ updates, not even in the app. The page says so up front. The
  switches are kept for when delivery launches. Vendor Settings still implies live delivery
  (MPF-12).
- **Regional Settings is honest about currency and timezone** (2026-09-23). Both are saved,
  but nothing uses them yet: every price shows in ₹ INR, and times aren't converted. Pick
  anything else and the page says so, the way an untranslated language already did.
  Multi-currency pricing is a separate, larger feature that isn't built. The menu drawer
  still has an unconnected currency picker (MPF-11).
- **For You nudges nearby sellers up** (2026-09-23). If the buyer has set a city (or a
  state) on their profile, products from that place rank a little higher in For You. It's a
  gentle reorder of the same products, never a filter, and a clearly better match still
  wins. A buyer with no city sees exactly the feed they saw before. Today only one buyer
  (demo-buyer, Mumbai) has a city set, so for everyone else nothing has changed. The
  `/profile` "Add city" nudge is what turns it on.
- **Edit profile** (`/profile/edit`, photo and personal details) and **Business details**
  (`/profile/business-details`) became real pages on 2026-09-23, replacing the Edit Profile
  modal. They can be linked and survive a refresh. Email is a plain field; the old fake
  "Verify" was removed.
- **Data & Export** (`/profile/data-export`, 2026-09-23). Both buttons used to only show a
  toast; now they download real files:
  - **Export RFQ History** is a CSV of the buyer's RFQs, with one row per quote received.
  - **Export All Data** is a JSON file of the profile, business details, RFQs, quotes
    received, conversations with their messages, and reviews written.
  - The page says up front that chats include the seller's messages. Both are built in the
    browser from the buyer's own rows only.
- **Delete my account** (`/profile/help`, 2026-09-23):
  - The buyer confirms with a 6-digit code emailed to the email address on their account.
    Sign-in itself is not involved: it stays mobile number + OTP only.
  - The account is deleted 14 days later, and a banner on `/profile` offers Cancel until
    then.
  - "Deleted" means anonymized: name, email, phone, photo and business details are removed,
    and the person can no longer sign in. Their requests, quotes, chats and reviews stay
    with the sellers, shown as "Deleted user".
  - Sellers, admins and suspended accounts are sent to support instead.
- **Help FAQs are managed by the Cosora team** (2026-09-23). The questions on Help & Support
  come from the admin panel, so they can be corrected without an app release. Several
  current answers describe things Cosora doesn't do yet (escrow, order tracking, team
  accounts, shipping addresses, SMS alerts, a refund policy) and need a content review
  (MPF-14).

### User journey
1. Sign in or register with **mobile number + OTP**, the primary path again since 2026-09-22
   (branch `auth/restore-mobile-otp`). Enter the number, then the code on `/auth/otp-verify`,
   then select role → select sourcing interests. "Create an account" uses the same mobile + OTP
   path, and the company name typed there is written to the buyer profile once the code screen
   has a session. **SMS delivery is not live yet.** The in-house OTP API is not integrated and
   Supabase has no SMS provider, so the code screen says plainly that no code was sent. Until
   then, buyers get in with **Continue with Google** or browse with **Explore as Guest**. Email
   + password is no longer a user-facing sign-in.
2. Land on the discovery feed; browse, search, save, follow.
3. Post a requirement — Quick RFQ or the detailed per-category form.
4. Receive quotes from multiple vendors in My Quotes.
5. Compare, then negotiate in chat (with the monitoring disclosure visible).
6. Accept, and track through My Quotes.

### Known gaps
- **Delete my account can't send its code yet.** The flow is built and verified end to end,
  but the email step needs `RESEND_API_KEY`, which isn't set. Until then the dialog says
  honestly that deletion isn't available online and points to support. With Resend's shared
  sender, mail reaches only the Resend account owner, so a verified domain is needed before
  real buyers can use it. Phone-only accounts will have no email to receive a code (see
  `myprofileflags.md`).
- **The live catalogue is small: 26 listings, all real.** Until 2026-09-23, 351 of the 377
  live products were "[LOADTEST] …" listings from 120 "[LOADTEST] Vendor Co N" vendors (40
  marked verified), created 2026-09-16 by the Master Prompt 11 thread. On 2026-09-23
  `scripts/loadtest-cleanup.sql` deleted them together with all 370 load-test accounts, which
  had been able to sign in with one shared password since that morning, and everything those
  accounts owned. Buyers now see only real listings, and there are 10 vendor profiles in
  total. That is the honest state, not a regression.
- **Mobile + OTP sign-in cannot complete yet.** The flow is restored and honest, but no code
  can be delivered until the in-house OTP API is wired into `src/lib/auth/otp.ts`. Google and
  guest browsing are the working routes, and email-only accounts can only get in through Google
  with the same email. See claude.md, "Mobile number + OTP login".
- **Listing cards everywhere still show seeded ratings and sales.** Cards on New Arrivals,
  Search, For You and Trends read `products.rating_avg` and `sold_count`; on 23 of 26 live
  listings the rating has no reviews behind it, and `sold_count` has no writer (there is no
  orders table). The product page stopped using them on 2026-09-11; the cards have not.
- No dedicated buyer Settings page — the sidebar "Settings" link points at `/profile`.
- Video Closeups: the **Share** button in the reel viewer is still inert, and the reel's
  `rating`/`reviews` fields are stored on `product_videos` rather than derived from the
  tagged product's real review data.
- Service vendors, freelancers and photographers are still client-side seed data with no
  `profiles` row, which is why `service_reviews.service_id` is `text` with no FK.
- **A buyer cannot delete their own chat message, and neither can an admin.** `messages` has
  no DELETE policy at all, so a PostgREST delete returns success with zero rows removed for
  every role. Sensible as an audit default for a moderated chat, but it means anything written
  to a thread — including a test message — can only be removed with service_role. Found while
  verifying the quote chat on 2026-09-16; two clearly-labelled test rows are still in the demo
  buyer's thread for that reason.
- **A vendor's public page invents what the vendor left blank.** On `/vendor/:id`, an empty
  owner name, phone, email, website, address, GSTIN or PAN is replaced by a hardcoded demo
  value ("Mr. K.S. Tomar", a Gwalior address, a GSTIN that is no one's), and so are the
  About text and banner. Logged in `securityflags.md`; left for a later round on Mitra's
  decision (Master Prompt 8).

### Fixed 2026-09-24 (My Profile brief)
- **Other users' email and phone are private, signed in or out.** Signed out since 2026-09-23
  (MPF-3). The signed-in grant that kept the old live code working was revoked once the new
  code was live on `cosora.in` and the admin panel (MPF-19).

### Fixed 2026-09-16 (Master Prompt 9)
- **Following no longer invents brands.** `followingStore.ts` served seven fabricated brands
  ("prezel", "Maison Lyra", "LUNE" selling a "Mickey Mouse Chuck" for "$8.36", …) — four of
  them pre-marked as already followed — to every signed-out visitor, across the Following
  feed, Following → View all, the vendor follow chip and the new-brands carousel. Their ids
  were not vendor ids, so every tile linked to a `/vendor/:id` with no vendor behind it. The
  seed is gone, an empty history renders the real empty state that was already written, and
  rows whose id is not a UUID are dropped from storage on load. The specific
  unfollow-everyone bug is fixed too: `load()` treated an empty array as missing, so
  unfollowing all seven brought all seven back — an intentionally empty list now stays empty.
  Signed-in buyers were never affected (DB-backed via `follows`) and still aren't.
- **The quote chat is a real conversation.** `VendorChatModal.tsx` reset to two hardcoded
  messages on every open — one of them attributed to the buyer, words they never typed — and
  anything typed into it was component state that vanished on close. It now uses the same
  `conversations` / `messages` tables and the same `useChatThread()` hook as `/chats/:id`, so
  the quote chat and the main chat are one thread rather than two systems. Loading, empty and
  populated are three distinct states, a message survives close → reopen, and the fabricated
  "Online now" badge is gone (nothing in this project tracks presence).

### Fixed 2026-09-11 (Master Prompt 8)
- **Vendor profile pages render again.** Every `/vendor/:id` was blank on the live site
  (a TypeError on `vendor.capacity` before the profile loaded), since 2026-09-09.
- **Vendor ratings are real.** Four seeded vendors claimed 147–4,800 reviews with none in
  `reviews`; all now show their true count, "No reviews yet" when it is zero, and no vendor
  can set its own number.

### Fixed 2026-09-11 (Master Prompt 7, buyer-trust thread)
- **Product pages show the product.** `/product/:id` used to layer each real listing over a
  hardcoded demo product, so every live listing claimed GOTS and OEKO-TEX certification, a
  4-hour vendor response time and the same product code, and any listing without reviews
  showed four invented named reviewers. Every value on the page now comes from that product's
  own row; missing details say "not specified"; ratings are counted from real reviews (a vendor
  whose profile claimed 4,800 reviews with none now shows "No vendor reviews yet"); and a
  missing product and a failed load are different screens.
- **Trends shows real listings or says there are none.** It used to fill an empty catalogue
  with generated cards named "Product name", list "Top Brands" that do not exist (tapping one
  showed the same three real products attributed to that fake brand), put USD prices on curated
  images, and show invented search-growth figures. The page is now labelled "Curated trend
  picks", every look and suggested search opens a real search, and the feed is either the real
  catalogue or an honest empty state.

### Fixed 2026-09-10 (Master Prompt 8)
- **Recently Viewed shows real history or an honest empty state.** It used to fill any empty
  history with six invented products (`rv1`..`rv6`) whose cards, Chat and CALL NOW buttons
  all pointed at products and vendors that do not exist — seen by every first-time visitor
  and every signed-out session. Worse, a signed-out buyer's first real product view saved all
  six fakes into the browser alongside it, so they outlived any fix that only stopped showing
  them on an empty browser. Now an empty history is empty; browsers that already stored the
  fakes have them dropped on the next load; and signed-in buyers see their database-backed
  history with a loading state while it fetches — never a false "No recently viewed
  products". A product that has since been withdrawn is left out rather than shown as a dead
  link.

### Fixed 2026-09-10 (Master Prompt 7)
- **The For You ad strip is real inventory or nothing.** "Related To Recent Views" was four
  invented products whose taps went to `/product/rv1`..`rv4` — routes that have never
  existed — under an "AD" label, so it was both a dead end and a misrepresentation of paid
  inventory nobody had bought. It now reads the same `active_ads` RPC as `SponsoredRail`,
  routes through the shared `adDestination()` so a "Visit your profile" campaign opens the
  storefront it paid for, and logs real `ad_impression`/`ad_click`. **There is no live ad
  inventory today** (all three campaigns expired July 2026), so the block is not rendered at
  all — not as a placeholder, and not as an empty cell that would leave a blank band.
- **The For You feed showed only 8 of 26 products, for everyone.** Infinite scroll never
  attached its observer for anyone who completed onboarding in-session: the onboarding gate
  is an early return, so the scroll sentinel was not in the DOM when the effect ran, and
  nothing in its dependencies changed when the feed later mounted. "Scroll for more" never
  loaded more. Fixed; the full catalogue now pages in.

### Fixed 2026-09-10 (Master Prompt 6)
- **For You no longer fabricates a catalogue.** `PRODUCT_POOL` — 48 invented products with
  fake manufacturers and invented enquiry counts — rendered whenever the catalogue was
  loading **or empty**, and `!live.length` is indistinguishable from a *failed fetch*, so an
  outage showed buyers a full page of plausible fake suppliers they could tap through to
  dead routes. Loading / empty / populated are now three distinct states, and the empty
  state distinguishes an empty catalogue ("No listings yet" → post a requirement) from an
  over-narrow filter ("No matches found" → reset preferences).
- **Reel personalisation actually works now.** Preference-based ranking in Video Closeups
  and New Arrivals resolved buyer preferences against hardcoded pre-taxonomy category names;
  measured, **8 of the 9 preferences matched zero live categories**, so the feature was
  silently inert for everyone except buyers interested in Activewear. It now resolves
  through `pref_category_map`, the same source the For You ordering already used.

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
- **Onboarding** — 9 steps: business details, address, owner, business category, premises
  photos, PAN + GSTIN, first product, and the supplier agreement with a signature. Completing
  it writes `vendor_profiles`, `vendor_documents`, the product and its images, and a
  `vendor_contracts` row in one call, so "onboarded with no contract on file" is unreachable.
  PAN, GST and CIN each have a number field **and** a document upload into the private
  `business-docs` bucket; GST and CIN are optional (not every vendor is registered for GST,
  and only MCA-registered companies and LLPs have a CIN). **Aadhaar is deliberately not
  collected** — see the Aadhaar rule in `claude.md`. Scans are attached during onboarding
  and uploaded only when the registration is submitted, so abandoning it stores nothing.
  A **rejected** document can be replaced on `/kyc` (2026-09-11): the new scan goes back
  into the admin's queue as "awaiting review", and the rejected one is removed. Adding a
  document type the vendor never submitted still goes through support.
- **Catalogue** — products (fabric type, GSM, MOQ, sizes, customization, certifications),
  catalogues, and Video Closeups. **Everything goes through admin moderation before going
  live (24–48 h)** — products and videos both default to `under_review`. A **rejected
  Video Closeup now shows the moderator's reason** on its card in Upload Video, so a
  vendor can act on it instead of resubmitting blind. (A rejected *product* still does
  not — the vendor-facing product list has no equivalent surface yet.)
- **Leads** — buyer inquiries arriving in the dashboard.
- **Quote requests** — respond to RFQs. The plan's lead cap applies to **open-marketplace
  RFQs only**: the dashboard's "leads used" and the cap check count exactly the same quotes
  (fixed 2026-09-16; before, the check also counted replies to direct requests, so a vendor
  shown 7/10 was refused as having "already quoted 171"). A quote on a request **addressed
  directly to the vendor** is never counted and never refused by the cap, even at 10/10
  (Andy's decision, fixed 2026-09-23). **A closed request accepts no quotes**, new or
  revised, and a request addressed to one vendor cannot be quoted by another (2026-09-23).
  The vendor sees "This request is closed and is no longer accepting quotes." (Until
  2026-09-23 every such refusal, the lead-cap one included, reached the vendor as
  "[object Object]"; error toasts across both sides now show the server's reason.) Caps now hold
  exactly under simultaneous submissions: before 2026-09-23, several quotes or listings sent
  at once could all take the last free slot.
  **Call Buyer**, on an accepted quote, gets the buyer's number from the database, and only
  when the vendor has quoted on one of that buyer's requests, neither account is suspended
  and their chat isn't under review. Otherwise the vendor is told why (2026-09-23, MPF-3).
  Before that, a buyer's phone was readable by anyone.
- **Advertisements** — paid campaigns with category and geographic targeting (including Pan
  India), placement pricing, benchmarks, and TradeSEAL verification purchase.
- **Competitor ads** — see what competitors in your category and city are advertising and at
  what budget. A deliberate retention and upsell mechanic.
- **Subscriptions** — Basic / Silver / Gold, determining lead volume, product listing caps
  and ad geography. Enforced by `enforce_plan_limits`. Invoices are first-class.
  **No Razorpay Subscriptions API and no autopay** — every billing period is a discrete
  order the vendor pays explicitly.
  The Subscription page's FAQ is admin-editable (2026-09-23) and ends in a **Contact us**
  button that opens the Help page, as Andy asked. That's the buyer help page: its email
  link (hello@cosora.in) is the only real support channel a vendor has, and its chat sends
  canned replies (MPF-15). Some of Andy's plan answers promise what billing doesn't do yet:
  proration, limit notifications and a 7-day refund (MPF-16, MPF-17).
- **Seller FAQ on the landing page** (`/seller`, 2026-09-23): Andy's 10 registration
  questions, editable from the admin panel. They're published verbatim, though some don't
  match the product: Aadhaar isn't collected, there are no email or WhatsApp lead alerts,
  and there's no pay-per-lead yet (MPF-16).
- **Analytics** — every figure counted from the vendor's own rows; no chart fixtures remain.
  Lifetime KPIs (views, inquiries, active products); **Total Order Value**, the platform's
  strongest retention metric, computed from accepted quotes × RFQ quantity and shared with
  the Quotes page so the two can never disagree; quote acceptance rate; a **lead-to-order
  funnel** (requirements → quotes sent → accepted → order value); **buyer responsiveness**
  ("X% of buyer messages get a first reply within 24 hours", with the threads currently
  waiting on a reply as a tappable action list); **call analytics** (inbound vs outbound,
  trend, and what buyers call about, from the `calls` table, which only the server writes
  since 2026-09-23, so buyers can't forge, backdate or erase them); **repeat buyers**; a real
  **views-by-category** split; **best/worst-rated live product**; a **you vs category
  average** tile reusing the `ad_category_benchmarks` RPC; a **profile-score gap nudge**
  driven by the same weights as the dashboard ring; and **per-campaign revenue booked ÷
  leads**. Every card declares whether it is windowed by the 7/30/90/365-day filter or is a
  lifetime counter that cannot be — see "A metric is windowed or it is lifetime" in
  `documentation/claude.md`. **Where your buyers are** (2026-09-09) — a ranked state/city breakdown of buyer demand from
  `vendor_buyer_geography`, with the vendor's own registered city marked distinctly, an always-on
  coverage line ("Based on N of M recent visits with a known location"), and places backed by
  fewer than 3 distinct buyers collapsed into an unnamed group so no individual buyer is
  identifiable. Backed by `engagement_events` (**live since 2026-09-08**): **Performance Trends**
  and daily views from real per-event timestamps, a real **Traffic Sources** breakdown,
  **unique visitors** shown alongside total views, **search terms that found you**
  (impressions → clicks → click rate, this vendor's own impressions only — never a
  platform-wide rank claim), **ad-attributed profile visits reported separately from
  ad-attributed product visits**, and a **button performance** panel that folds Call Now in
  with every other tracked CTA. Each of those panels states plainly when tracking is not
  switched on, rather than rendering an empty chart.
- **My Store / Business Profile** — storefront (logo, banner, premises photos, categories,
  featured products, catalogues, videos, listings), business tools, Profile Score, KYC
  status, social links, blogs. Every figure on these pages is read from the vendor's own
  rows; an empty vendor renders empty states, never demo content.
- **Chat** — messaging with buyers, subject to the same moderation pipeline.
- **Settings** — Business, Notifications (email/push), Language, Security, Help & Legal.

### User journey
1. Register with **mobile number + OTP** (restored 2026-09-22). On "Create an account", choose
   Seller, enter name, brand and mobile number, then Send Code, then enter the code on
   `/auth/otp-verify`. Signup metadata (role, name, phone, brand) rides on the OTP request.
   `handle_new_user()` applies the role, and `applyPendingSignupProfile()` writes the brand to
   `vendor_profiles` once the code screen has a session; the vendor then goes to `/onboarding`.
   **Delivery is not live yet**, so the code screen says no code was sent; vendors get in with
   Google meanwhile. The email + password signup and its "check your email" screen are
   removed. `/auth/callback` still finishes Google sign-ins and any old confirmation links.
2. Complete the 9-step vendor onboarding, ending on the supplier agreement and a signature.
3. Land on the vendor dashboard.
4. List products / catalogues / videos → they sit in `under_review` until admin approves.
5. Receive leads and quote requests; respond with quotes.
6. Run ad campaigns and buy TradeSEAL to raise visibility; watch competitor ads.
7. Negotiate in chat, win orders, watch Total Order Value grow.

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

**Content**
- **FAQs** (`/faqs`, 2026-09-23): the first real admin-editable content. It covers the
  buyer Help, vendor Subscription and seller landing (`/seller`) FAQs. super_admin
  edits them and support reads them, and changes show on the site with no release.
- Site content (banners and theme) is still a dev-seed mock with no table.

### Rules the admin layer must respect
- **Notifications are written only by `SECURITY DEFINER` functions** — no insert policy for
  any role. Copy is read by buyers and vendors, never admins, so it must never name the
  reporter, the matched pattern, the verdict or the reason.
- **No dynamic SQL in the moderation RPCs** — `target_table` is matched against a fixed list
  with a static `UPDATE` per branch.
- An admin cannot bypass the status triggers by widening RLS; unlocking goes through the
  purpose-built RPC.
- **Emails and phones come through `admin_profile_search()` and `admin_profile_emails()`**,
  never a `profiles` select: the columns aren't client-selectable (MPF-3). Any active admin
  can call them, the same access as before.

---

## Future direction (recorded, not built)

**Working-capital lending.** The data Cosora collects — order volume, capacity, reliability,
pricing, transaction history — is the foundation for a vendor financing product. The schema
is meant to support it from day one even though the product does not exist yet.
