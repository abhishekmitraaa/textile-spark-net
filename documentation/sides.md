# The Three Sides of Cosora

Updated automatically whenever a side's scope, features, or flows change.

Last updated: 2026-09-22

Cosora is fundamentally a three-sided marketplace. **Key mechanic:** the same person can be
both a buyer and a vendor and toggles between the two experiences inside one unified web
app. The toggle appears **only** on the Vendor Dashboard Home and the Buyer Homepage.
Routes for each side are listed in `documentation/sitemap.md`.

---

## Buyer Side

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
  - A page load starts on the side the account is on, so a vendor who refreshes stays on
    the seller side (fixed 2026-09-24, MPF-13). A buyer who has registered as a vendor goes
    straight to the seller side on any device.
- **Notification settings are honest** (2026-09-23). The email and push switches are saved,
  but Cosora sends no email or push notifications yet, and nothing notifies a buyer about new
  quotes, messages or RFQ updates, not even in the app. The page says so up front. The
  switches are kept for when delivery launches. Vendor Settings still implies live delivery
  (MPF-12).
- **A buyer can see prices in USD, EUR or GBP** (2026-09-24). Regional Settings' currency, or
  the same picker in the menu drawer, converts displayed prices at the day's ECB rate:
  product cards, product pages, quotes and budgets.
  - It's display only: each converted figure is marked "≈", quotes keep the ₹ price beside
    it, and a note says vendors quote and are paid in ₹ INR.
  - Cosora's plans, GST invoices, payments and anything the buyer types stay in ₹ INR.
  - Timezone is still saved but not used, and the page says so.
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
  A save writes only what the buyer changed (2026-09-24). A job-title save used to turn an
  empty country into "India", and now a cleared field saves as empty.
- **Data & Export** (`/profile/data-export`, 2026-09-23). Both buttons used to only show a
  toast; now they download real files:
  - **Export RFQ History** is a CSV of the buyer's RFQs, with one row per quote received.
  - **Export All Data** is a JSON file of the profile, business details, RFQs, quotes
    received, conversations with their messages, and reviews written. Since 2026-09-24 it
    also holds the vendors the buyer contacted and messaged, their saved items and folders,
    recently viewed products and followed vendors, each with a link to its page.
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
  - Since 2026-09-24 the photo files themselves are deleted from storage. So are their
    saved items, follows, recently viewed, video likes and notifications. A session
    still open elsewhere can't change anything afterwards.
  - Sellers, admins and suspended accounts are sent to support instead.
- **Help & Support** (P3, 2026-10-01; works once rollout includes the person, call and email always):
  - chat with "Cosora Support", with photos, PDFs and voice notes;
  - book a callback in support hours;
  - report fraud in the app, with evidence only Cosora can open;
  - send app feedback;
  - follow everything in **My requests** (`/help/requests`), with in-app notifications on replies;
  - "Contact support" in KYC, payments, ads, calls, chats, account deletion and the suspension notice opens a chat about that item.
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
  but neither delivery channel is set up:
  - email needs `RESEND_API_KEY` and a verified sending domain (Resend's shared sender reaches
    only the Resend account owner);
  - WhatsApp, which phone-only accounts use (Phase 18), needs a Meta Business account and an
    approved template (MPF-24).

  Until then the dialog says honestly that deletion isn't available online, names the
  channel, and points to support.
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
- **A vendor's public page still shows placeholder content in four places:** the category
  tiles, the office pictures (stock photos, though vendors can now upload their own), the
  catalogues and the "Sells" chips are the same for every vendor (`ToDo.md`). The identity,
  contact and business details were fixed on 2026-09-28 (below).

### Changed 2026-10-02 (Help & Support follow-ups)
- **Report this seller** (a seller's page, three-dot menu) and **Report this listing** (a product page, beside Share) open the fraud report about it. A Cosora store or listing link typed into the report counts the same.
- Support dates (opening times, callbacks, My requests) are in the reader's language.

**Primary colour:** Cosora red / coral `#EF4D62`.
**Shell:** `BuyerShell` — BuyerTopBar + content + `MobileBottomNav` + ToTop.

### Changed 2026-09-29 (reviews)
- **My Reviews shows the seller's reply** under each store and product review, and so does the product page.
- **A seller can't review their own store or products.** The Write-a-Review button is hidden there, and the database refuses it.
- A refused edit or delete now says why, instead of reporting success or a generic error.

### Changed 2026-09-29 (admin completion, Phase 9: theme)
- **The site's brand colours and fonts can be changed by Cosora's team** without a release. Today they
  look exactly as before.

### Changed 2026-09-28 (admin completion, Phase 8: analytics)
- **The Terms page says what is recorded.** A new "Analytics and session replay" section says
  which products, storefronts and searches are viewed is recorded, linked to the account when
  signed in.
- **Microsoft Clarity can record visits**, once its project id is set (not yet). Sign-in,
  chats, onboarding and KYC, the profile, requirements and quotes, billing and every pop-up are
  hidden from recordings, and so is anything typed. The Terms page then also describes
  recordings and cookies.

### Fixed 2026-09-28 (admin completion, Phase 4a: vendor contact details)
- **A vendor's page no longer invents anything.** An empty owner, phone, email, website,
  address, GSTIN, PAN, About text, banner, employee count, founding year, member-since or
  turnover used to be filled with a demo value that belonged to no one. Empty now reads "Not
  provided", and the real values come from the vendor's row. An unknown seller shows "Seller not
  found" instead of a made-up one, and loading shows a skeleton.
- **A vendor's phone number is shown when the buyer asks for it.** Signed in, the contact card
  has **Show phone number**; Call Now and WhatsApp reveal it the same way. Signed out, all three
  ask the buyer to sign in. One account can open up to 30 sellers' numbers an hour and 100 a day;
  reopening a seller already opened that day is free. Past the limit, the buyer is told to try
  later or use chat.
- **The vendor's email, PAN and street address are no longer shown to buyers.** The card shows
  the owner, the city, state and country, and the website. CIN shows when the vendor has one.
  Since Phase 4b the database itself refuses them to anyone else, signed in or not.

### Fixed 2026-09-27 (sign-in)
- **Mobile sign-in works again, in test mode.** No SMS is sent yet, so the code screen says so,
  and any 6 digits sign in. This is a sign-in bypass on purpose until SMS delivery exists
  (`securityflags.md`).
- **Google sign-in on cosora.in** still returns people to the vercel.app site until cosora.in is
  added to Supabase's redirect URLs (`ToDo.md`).
### Fixed 2026-09-26 (language)
- **Hindi and Gujarati cover the whole buyer side**, not just the navigation: pages, forms,
  filters, empty states, toasts, FAQs, notifications, plan details, categories and dates.
  What people type and vendors' product names stay as entered.
- **The language follows the buyer's account.** Picked on the sign-in screen or in Regional
  Settings, it is saved and applied at the next sign-in on any device.

### Fixed 2026-09-25 (flag-fix pass)
- **A buyer's decision on a quote is theirs alone** (MPF-18). Only the buyer who posted the
  request can shortlist, accept or reject; the vendor can't mark its own quote accepted, and
  can't raise the price of an accepted quote without it going back to the buyer. The buyer
  can no longer edit a vendor's price either.
- **Switching sides needs a completed seller registration both ways** (MPF-22): a seller
  who hasn't finished onboarding is sent to `/onboarding` from Switch to Buyer.
- **`/profile`'s Notifications row says "Not live yet"** instead of "On" (MPF-12).

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
- **Quote requests** — respond to RFQs. **No plan caps leads since 2026-10-03 (RFQ/leads
  R2): every plan gets the same ranked feed.** What follows describes the cap while it
  existed. The plan's lead cap applied to **open-marketplace
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
  A plan is paid for one period at a time, or renewed automatically by **autopay** (Razorpay
  Subscriptions; subscriptions P3, built 2026-10-08, not live), which the seller can turn off at any time.
  The Subscription page's FAQ is admin-editable (2026-09-23) and ends in a **Contact us**
  button that opens the Help page, as Andy asked. That's the buyer help page: its email
  link (hello@cosora.in) and phone line (+91 88155 78226) are the real support channels a vendor
  has; since Help & Support P1 (2026-10-01) it has no canned chat, and it tells sellers its
  answers are written for buyers (MPF-15). Some of Andy's plan answers promise what billing doesn't do yet:
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
   It is applied once, and only if no brand is saved, so a brand renamed later is never
   overwritten at sign-in (2026-09-24).
   **Delivery is not live yet**, so the code screen says no code was sent; vendors get in with
   Google meanwhile. The email + password signup and its "check your email" screen are
   removed. `/auth/callback` still finishes Google sign-ins and any old confirmation links.
2. Complete the 9-step vendor onboarding, ending on the supplier agreement and a signature.
3. Land on the vendor dashboard.
4. List products / catalogues / videos → they sit in `under_review` until admin approves.
5. Receive leads and quote requests; respond with quotes.
6. Run ad campaigns and buy TradeSEAL to raise visibility; watch competitor ads.
7. Negotiate in chat, win orders, watch Total Order Value grow.

### Changed 2026-10-09 (subscriptions P5; built, not live)
- **Ads reach states.** On the ad page a seller chooses the states an ad should reach: one on Basic, up to four on
  Silver, any on Gold and VIP (none chosen means all of India). On Basic and Silver it starts on the seller's own
  state. VIP can also choose countries outside India.
- **A buyer known to be in another state doesn't see the ad.** A signed-out buyer, or one whose state Cosora
  doesn't know, still does.
- **Refused before payment:** an ad that reaches more than the plan allows is refused, with the reason, before
  anything is charged.
- For accounts on the ad reach switch; others keep the city choices as before.

### Changed 2026-10-08 (subscriptions P4; built, not live)
- **Reminders before a plan ends:** 7, 4, 2 and 1 days before, and on the day, in the bell and by email (the
  "Plan expiry reminders" switch in Settings stops the email only). With autopay on, one notice two days before the charge.
- **7 grace days after it ends:** the plan keeps working in full. /subscription says the plan has ended and the day
  to renew by, with a Renew button. Renewing then continues from the day the last period ended.
- **After the grace days** the account is on Free, and **listings over the limit are paused**: hidden from buyers,
  nothing deleted. The same happens when a paid downgrade starts.
- **Products page:** paused listings carry a "Paused" tag and filter; a notice says how many are paused, or that a
  smaller limit is coming, with **Choose which stay live** (before the change) or **Choose which are live** (after).
  Left alone, the most viewed stay.
- **Choosing a plan again** brings paused listings back as they were. One saved while it was paused goes through
  review first.
- **Checkout** says so before a payment that would pause listings.
- For accounts on the plan lifecycle switch.

### Changed 2026-10-08 (subscriptions P3; built, not live)
- **Autopay at checkout:** "Renew automatically (autopay)" is ticked by default and says what the plan will renew at,
  and from when. Unticked, the plan is paid for one period, as before.
- **An Autopay card on /subscription:** on (with the next charge and the payment method), a renewal payment that
  failed and is being retried, stopped after failed payments, or off. A seller turns it on for the plan they've
  already paid for, changes the payment method, or turns it off (asked to confirm; the plan runs to the end of the
  period paid for).
- **While autopay is on**, a plan change keeps it on, on the new plan.
- For accounts on the autopay switch.

### Changed 2026-10-08 (subscriptions P2; built, not live)
- **Settings → Notifications** shows a seller where Cosora reaches them (the email invoices go to, masked) and a
  **WhatsApp alerts** switch, their opt-in, for accounts on the notification switch. Without a WhatsApp or phone
  number it says to add one.
- **A plan invoice is emailed** when it is issued, with a link to it (not for demo checkouts).

### Changed 2026-10-08 (subscriptions P1; built, not live)
- **A plan invoice says what it is:** a tax invoice (with CGST + SGST or IGST, place of supply and SAC) once Cosora's
  GST details are set, a payment receipt before that, or a test or demo document that took no money. It shows the
  details as they were when it was issued and never changes; a refund issues a credit note.
- **Download PDF** on the invoice page.
- **If the payment went through but the page couldn't finish**, the seller is told the payment was received and the
  plan will update shortly (or that the billing team has been alerted), not that it failed.

### Changed 2026-10-08 (subscriptions P0; built, not live)
- **Plan purchases can be closed while payments are tested.** /subscription then says "Plan purchases open soon"
  and offers no checkout; listed test accounts can buy as usual.
- **Cosora VIP is open to every seller** at its list price; it used to be invite-only.
- **GSTIN and PAN are checked before they are saved** on /subscription (a GSTIN's last character is a checksum).

### Changed 2026-10-02 (FAQ input; built, not live)
- **Registration asks for the Seller Registration FAQ's documents:** the PAN card, the GST certificate when registered for GST, a business registration (Udyam/MSME, incorporation certificate, shop licence or partnership deed), the owner's masked Aadhaar with consent, and a catalogue or a first product. The documents step can't be skipped.
- **`/kyc`** shows all five; a seller registered earlier adds what's missing on its row.
- **Plans:** an upgrade starts now, less what's left of the current plan; a lower plan is paid now and starts when the current period ends ("Switching to Silver on …"); renewing adds a period from the end. Buttons say Upgrade, Switch or Renew.
- **7-day money-back guarantee:** for a first plan, the seller asks for a full refund on `/subscription` within 7 days of the first payment (shown only when money went through Razorpay).

### Changed 2026-10-01 (Help & Support P5; built, not live)
- **Seller Help:** `/help` shows sellers their own questions: KYC, leads, listings and videos, advertising, plans and billing, account and suspension. Each is in Hindi and Gujarati, edited in Cosora-Admin `/faqs`.
- **Quick Guide:** "How to Complete Verification".

### Constraints that shape the vendor UI
- Every vendor page must wrap in `DashboardLayout`.
- Tailwind's named breakpoints overstate available width here — the sidebar takes 256 px
  plus 48 px of padding, so gate wide layouts on `min-[1400px]:` / `min-[1700px]:`.
- A vendor page that looks pink is using a default shadcn `<Button>` or an `accent`/`primary`
  token; hardcode `#256fef` (hover `#1d5ed6`).

---

### Changed 2026-09-29 (admin completion, Phase 10: discount codes)
- **A vendor can enter a discount code** when buying a plan, an ad campaign or the Verified Certificate.
  The server checks it and shows the new price before anything is charged; the invoice and the ad receipt
  show the discount.
- **Choosing a plan now opens a checkout** with the price, the code field, GST (18%) and the total,
  before payment.

### Changed 2026-09-29 (reviews)
- **`/reviews` has Store reviews and Product reviews tabs.** Reviews left on any of the vendor's listings (whatever its status) show with the product's name and photo and the buyer's photos. The vendor can reply once to each, as with store reviews. The buyer sees the reply on My Reviews and on the product page.
- With no reviews, the rating reads "–" and "No reviews yet", not "0/5 POOR". Loading, a failed read and an empty list look different.
- The Report button is gone: it did nothing (ToDo).

### Changed 2026-09-29 (admin completion, Phase 9: dashboard banners)
- **The banner on the vendor dashboard is managed by Cosora's team**: several can rotate, each with
  its own dates, and it's in the vendor blue. The old hardcoded one claimed "3x more inquiries",
  which nothing measured; the seeded banner leaves it out.

### Fixed 2026-09-28 (admin completion, Phase 4a: private business details)
- **Your PAN, business email, phone, WhatsApp and street address are private.** Buyers no
  longer see your email, PAN or street address. A signed-in buyer sees your phone or WhatsApp
  when they ask for it, within a per-buyer limit. Your GSTIN, CIN, owner name, city and website
  stay public.
- **Your own screens are unchanged:** My Store, Business Profile, KYC, the profile score,
  invoices and receipts still show all of it to you.
- **Your public page shows what you entered, or "Not provided".** It used to fill your empty
  fields with someone else's demo details.

### Fixed 2026-09-27 (sign-in)
- **Seller signup and sign-in by mobile number work again, in test mode.** No SMS is sent yet,
  so the code screen says so, and any 6 digits sign in. This is a sign-in bypass on purpose
  until SMS delivery exists (`securityflags.md`).
- **Google sign-in on cosora.in** still returns people to the vercel.app site until cosora.in is
  added to Supabase's redirect URLs (`ToDo.md`).
### Fixed 2026-09-26 (language)
- **Hindi and Gujarati cover the whole vendor side**: dashboard, uploads, product forms and
  their category fields, leads, quotes, analytics, ads, subscription and payments. The Supplier
  Agreement clauses stay in English (they are signed by version).
- **The language follows the vendor's account.** Vendor Settings no longer puts English back on
  open; the choice made there or in My Store is saved and applied at sign-in on any device.

### Fixed 2026-09-25 (flag-fix pass)
- **Vendor Settings is honest about notifications** (MPF-12): the same "aren't live yet"
  note and "saved for when it launches" subtitles as the buyer page. The switches still
  save. The seller home's "Set Alerts" card, which only opened Leads, says new RFQs
  appear on Leads and alerts aren't live yet.
- **Switch to Buyer needs a completed registration** (MPF-22, Mitra: onboarding collects
  everything the buyer side needs). A seller-role account that hasn't finished onboarding
  goes to `/onboarding` with a note, and stays a seller.
- **A quote's terms are the vendor's, its status the buyer's** (MPF-18). Revising the terms
  of a shortlisted, accepted or rejected quote puts it back to pending.

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
  A third status, `deleted`, is set only by `anonymize_account()` when a buyer's "Delete my
  account" cooling-off ends. It is final. The admin shows it as a grey "deleted" and
  offers no Suspend or Reinstate for it (2026-09-24; it used to show "active").
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
- **Support requests** (Help & Support, live in the admin 2026-10-01; rollout Off): support chats,
  callback requests, fraud reports and app feedback, answered in Cosora-Admin's Support
  section. Until the buyer screens (P3) ship and rollout opens, fraud reports and feedback still
  aren't collected from users (`securityflags.md`).

**Content**
- **FAQs** (`/faqs`, 2026-09-23): the first real admin-editable content. It covers the
  buyer Help, vendor Subscription and seller landing (`/seller`) FAQs. Support and
  super_admin edit them (support since 2026-09-24), and changes show on the site within
  about a minute, with no release. The site reads them from a CDN snapshot that every edit
  rebuilds, with the table as the fallback (2026-09-24).
- Site content (banners and theme) is still a dev-seed mock with no table.

### Added 2026-09-25 (flag-fix pass)
- **Admin Log** (`/admin-log`, MPF-26): every change an admin makes (who, role, what,
  before → after, IST date and time), every sign-in and sign-out, and the invite and refund
  edge functions' actions. Filters by admin, area, action and date. Written by the database,
  append-only.
- **Manager role:** reads the Admin Log (with super_admin), and sees no moderation or
  commerce section. Since Help & Support (2026-09-30) it also reads every support request,
  read-only, and each phone number it reveals is in the Admin Log.
- **System Health → Analytics events refused** (MPF-23): events `log_engagement_event()`
  couldn't record, per hour, with the error and the last event type and source.

### Added 2026-09-26
- **Managers manage the team** on the Admins page: they add teammates (invite by email, or
  grant an existing account), change their role and remove them, in the five team roles:
  Product moderator, Vendor ops, Ads moderator, Finance admin and Support. Super admins,
  other managers and a manager's own access stay with a super admin. Each change is in the
  Admin Log as the manager's.

### Added 2026-09-27 (admin completion, Phases 1–3)
- **Every admin write is checked by role in the database** (Phase 1), not only hidden in the
  panel.
- **Scheduled jobs are back**, and System Health lists each job's last run (Phase 2).
- **Chat review: Block is one step.** It suspends the participant and closes the review
  together, or does neither.
- **Video Closeups: "Approve all videos for vendor"** approves that vendor's pending videos only.
- **Ads:** Pause and Reject pick a reason from the same list as the review queue, plus an
  optional note. Request changes needs a note.
- **Subscriptions:**
  - Changing a plan or canceling asks for a reason, keeps the vendor's trust seal and boost in
    step, and notifies the vendor.
  - Both lists load 50 at a time.
- **Reports:**
  - Computed in the database.
  - Revenue net of GST, with GST shown separately.
  - Demo-mode income (no gateway payment) is flagged.
  - A revenue window: all time, 30 days, 90 days or 12 months.
- **Admin Log:** shows the reason an admin gave, where one was required.
- **Geography:** "Delhi NCR", "NCR" and "Greater Noida" are placed on the map.

### Added 2026-10-09 (subscriptions P5; built, not live)
- **Ads → review queue:** each campaign shows the states it reaches (or "All of India") and any countries outside
  India, beside the older target cities.
- **Feature switches** now lists five, with "Ad reach by state".

### Added 2026-10-08 (subscriptions P4; built, not live)
- **Products:** a **Paused (plan limit)** tab, for looking only: a paused listing has no Approve (its plan resumes
  it), and can still be rejected.
- **Subscriptions list:** an active plan whose period is over is marked as in its grace days.
- **Feature switches** now lists four, with "Reminders, grace days and paused listings".
- **Reports:** "paused" appears in Products by status.

### Added 2026-10-08 (subscriptions P3; built, not live)
- **Subscriptions list:** an **Autopay** column (it was "Auto-renew", which every purchase set to yes).
- **Feature switches** now lists three: Plan checkout, Email, WhatsApp and SMS delivery, and Autopay.
- **Billing incidents** can also say an old autopay couldn't be cancelled at Razorpay, or an autopay charge wasn't
  the plan's amount.

### Added 2026-10-08 (subscriptions P2; built, not live)
- **System Health → Notification delivery:** email, WhatsApp and SMS per channel: whether the provider is configured,
  what is due, retrying or being sent, and the last day's sent, failed and skipped, with recent failures in the
  provider's own words. Super admins can **send a test** to their own address (five an hour).

### Added 2026-10-08 (subscriptions P1; built, not live)
- **Billing incidents** on Subscriptions: a payment whose plan didn't activate, a receipt issued without Cosora's GST
  details, a disputed payment. Super and finance admins are told (bell) and resolve each with a note that goes to
  the Admin Log; support can read them.
- **Invoices list:** each invoice's document type (tax invoice, receipt, test, demo), its exact total, and a **PDF**
  button.

### Added 2026-10-08 (subscriptions P0; built, not live)
- **Feature switches** (`/feature-flags`): turn a new feature on for listed test accounts, then for everyone, with a
  reason recorded in the Admin Log. Super admins change them; managers read.
- **Billing details** (`/billing-details`): Cosora's legal name, registered address, GSTIN, PAN and SAC code for the
  tax invoice. Super admins and finance admins edit them.

### Added 2026-10-01 (staff registration; built, not live)
- **Register a staff member** (Admins page, super admin and manager; a manager registers into the team roles only): name, personal email, mobile number and role. The panel generates the employee ID (`EMP-0001`) and the work email the person signs in with, and sends a temporary password to their personal email, or shows it once while email isn't set up. The person chooses their own password at first sign-in.
- **Staff directory:** everyone registered, with "New temporary password" for someone locked out. The Admin Log records both.
- The ID and email formats are interim (`ToDo.md`).

### Added 2026-10-02 (FAQ input; built, not live)
- **Subscriptions:** a "7-day money-back guarantee" panel lists each request with its payments; refund each through Razorpay, then "Close and end the plan". A paid downgrade shows under the current period.
- **KYC panel:** names the business registration (with its kind and number), the masked Aadhaar and each catalogue file.

### Added 2026-09-30, live 2026-10-01 (Help & Support P4; rollout Off, so no requests arrive yet)
- **Support section** in Cosora-Admin, for super_admin and the Support role, with the
  Manager role read-only (D-08):
  - **Inbox** (`/support`): every request, oldest waiting first, with views (waiting on us,
    open, mine, unassigned, resolved, closed) and filters by channel, topic, side and
    language. Test accounts' requests carry a “test” tag, and
    unticking “Include test requests” hides them. Live updates.
  - **One request** (`/support/:ticketNo`): the thread with photos, voice notes and PDFs
    (PDFs download, never open in the panel); a reply or an internal note, with files;
    take, assign, resolve, reopen and close with a reason; the requester's account and
    status; what the database gathered when the request was opened (plan, KYC, the chat or
    requirement it's about); the history of every change.
  - **Phone numbers are masked.** Reveal shows the full number and writes an Admin Log row.
  - **Callbacks, Fraud reports, App feedback:** the same list, per channel. A call attempt
    is recorded as completed, no answer (three tries), wrong number or cancelled. A fraud
    report takes an outcome (no action, warned, suspended, escalated to legal) that the
    reporter never sees, and the reporter never sees their own evidence either.
  - **Support settings** (`/support/settings`, super_admin changes, the others read): who
    can reach support (Off, Staff testing with up to 20 test accounts, Everyone), hours,
    holidays, the phone and email Help shows, and which topics are on. Subscription and billing
    (`vendor_billing`) stays off until the manual refund process is written (D-11).
- **Quick Guides** tab on `/faqs`: the Help page's step-by-step guides in English, Hindi
  and Gujarati, for support and super_admin.
- **The requester always sees "Cosora Support"**, never the staff member's name (D-06).

### Added 2026-09-29 (admin completion, Phase 10)
- **Discounts is real.** It used to edit sample data.
  - Codes for a subscription plan (optionally only some plans), an ad campaign's lines, or the Verified
    Certificate; a percentage or a flat amount; a cap, a limit per vendor, dates, on/off and a note.
  - Each code's state (live, scheduled, expired, used up, off), its paid uses, the checkouts holding one,
    and every order that carried it.
  - Once a code has been used, its text, discount and target can't change.
- **Payments:** each row shows what a discount code took off, and a search matches a code.

### Added 2026-09-29 (admin completion, Phase 9)
- **Site content is real.** It used to edit sample data.
  - **Vendor dashboard banners:** add, edit, reorder, turn on and off, schedule and delete; an optional
    image (JPEG, PNG or WebP, up to 2 MB); a button that goes to a page on Cosora.
  - **Theme:** the buyer site's five colours and two fonts, with live contrast checks; a theme below
    the floors can't be saved. "Revert to saved" and "Cosora defaults".
  - Changes reach the site in about a minute. Super admins only; every change is in the Admin Log.

### Added 2026-09-28 (admin completion, Phase 8)
- **Live Activity** shows the buyer site now, from Cosora's own event log. It used to be only a
  link to Microsoft Clarity.
  - Visitors in the last 5 minutes and over a chosen window (15 minutes to 24 hours), signed in
    and guest.
  - Events per minute for the last hour, and events by type.
  - The most-viewed products, the busiest sellers, and searches made by at least 3 different
    visitors.
  - It refreshes every 30 seconds while open. Every admin role sees it.
- The Clarity links (recordings, heatmaps) appear once the Clarity project id is set.

### Added 2026-09-28 (admin completion, Phase 7)
- **Leads**, a new read-only page under Insight: every buyer request (RFQ) and its stage.
  (Since RFQ/leads R3, super admins and product moderators can also remove a lead, with a
  reason the buyer reads, or flag it; a removed request has its own stage.)
  - Stages: new, unanswered, overdue after 48 hours without a quote, quoted, won, closed. A
    direct request is marked.
  - The numbers: what's waiting for a first quote, the median time to a first quote, and the
    share answered within 24 hours.
  - Filter by stage, age and audience, and search. Each row links to the buyer in Accounts
    and to the vendor.
  - For super admins, vendor ops, product moderators and support.

### Added 2026-09-28 (admin completion, Phase 6)
- **Customers is real.** It used to show sample data. Every account (staff aside) appears with:
  - its segments: new, active, high value, at risk, dormant, never transacted;
  - lifetime spend, activity and when it was last seen;
  - the team's tags.

  Filters, search, sort and "Load more" run in the database. The data refreshes when the
  page opens, at most every 10 minutes. Super admins and support manage tags, and each change
  is in the Admin Log.

### Added 2026-09-28 (admin completion, Phase 5)
- **Payments is a real ledger.** It used to show sample data. Every subscription payment,
  refund, unfinished checkout and ad or certificate order is one row.
  - Filters, search and "Load more" run in the database.
  - The totals describe exactly the rows the filters select and agree with Reports.
  - Demo-mode payments with no gateway id are flagged.
  - The Latest strip refreshes every 30 seconds while the tab is open.

### Added 2026-09-28 (admin completion, Phase 4a)
- **Vendor detail** reads a vendor's PAN, email, phone, WhatsApp and street address through
  `admin_vendor_private()` (super admin, vendor ops, support, finance), and now shows WhatsApp
  too. Any other role sees a note that the fields are private.

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
