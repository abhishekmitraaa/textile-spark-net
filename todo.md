# Cosora — Deferred / Follow-Up Items

Durable record of everything explicitly **deferred rather than built**, so it
does not get lost the way the previous "still open" ledger nearly did.

Last reviewed: 2026-11-15 (Seller Home audit added).
Longer-form engineering notes live in `documentation/ToDo.md`; this file is the
short list of things someone has to *decide*.

---

## High priority

- **Seller registration go-live steps (added 2026-11-13, after the registration release).** The new registration is
  live with both of its switches off. In order:
  - Review the 10 office photos from 5 existing sellers in Cosora-Admin › Premises photos. The migration moved them
    into the review queue, and they won't show on those stores until approved.
  - Have "Abc" sign the agreement on `/kyc`. That seller is registered but has never signed the Supplier Agreement.
  - Turn on `seller_registration_required` in Cosora-Admin › Feature switches. From then on, sellers who haven't
    finished registering can't add listings, videos, catalogues, ads or quotes.
  - Leave `overseas_seller_registration` off until the CA confirms GST on plans sold to sellers outside India.

- **Real Razorpay payments.** `RAZORPAY_KEY_SECRET` is unset. Every ad and
  subscription payment currently runs through the demo-mode fallback path in
  `razorpay-verify-payment`, including anything that looks like a real
  transaction. Confirmed 2026-09-14: `ad_orders` and
  `subscription_payment_orders` both hold **0 rows** in production, which means
  no purchase has ever been recorded through the real path. This is running in
  production today. Decide on payment go-live, then set the secret and verify
  with one real transaction before trusting any revenue number from this system.
  - Related, and only reachable once this is on: `RAZORPAY_WEBHOOK_SECRET` is
    also unset, so `razorpay-webhook` returns `not_configured` and never runs.
    That is the only reason the seal-grant hole removed on 2026-09-14 never
    fired in production.

- **GST / invoicing for ad purchases.** No invoicing exists. Subscriptions
  produce a real tax invoice (`subscription_invoices` carries `invoice_number`,
  `gst_amount`, `gst_number`); advertising produces none, so
  `/my-payments/receipt/:orderId` prints "PAYMENT RECEIPT" and says in its
  footer that it is not a tax invoice. Blocked on the Razorpay item above —
  build invoicing on a live payment path, not a simulated one.

- **5 unplaced ad types still purchasable with no delivery mechanism:**
  Direct Broadcast, Web & Mobile Combo, Facebook & Instagram Ad, Google Product
  Ad, Social Media Combo. Vendors can buy these today; nothing delivers on the
  purchase. Needs either a build-out or a decision to stop selling them.
  Reasons each is unplaced are in `src/lib/adSlots.ts` (`UNPLACED_AD_TYPES`),
  and `scripts/ad-slot-map-check.mjs` fails if any type is neither placed nor
  given a stated reason.

- **Certificates are sellable to every vendor but deliverable to almost none.**
  Only **2 of 10** `vendor_profiles` rows carry both an address line and a
  postcode, and the one that does has zero live products.
  `certificate_dispatch()` correctly refuses to mark a parcel dispatched with no
  address, so nothing ships blind — but nothing stops the sale. Either require a
  delivery address before the certificate can be added to an order, or let the
  vendor supply one against an existing order. Demonstrable live: demo order
  `CERT-2609-003` is stuck at `printed` for exactly this reason.

## Seller Home audit (2026-11-15) — open, nothing fixed yet

Read-only review of `/seller-home` and what it links to, on main `4c5a845`, tested in a browser against the local
stack with a seller registered through the real form. "Seen" = reproduced in the browser; "code" = found by reading
the code. Screenshots: `cosora testing/.playwright-mcp/home-review/`. The full list with context (113 items, SH-001
to SH-113, including the ones below) is `documentation/seller-home-audit-2026-11-15.md`.

### High
- **Back after switching to Buyer shows a broken page (seen).** Seller Home → Buyer → Back renders the seller
  dashboard inside the buyer menu, buyer header search and buyer bell. `useSwitchRole()` changes the side but the
  page you go back to doesn't change it back (`src/hooks/useSwitchRole.ts`).
- **"Advertise" traps the Back button (seen).** `/advertisement-slideshow` pushes `/advertisements` (its timer and
  Skip both use `navigate()` without `replace`), so Back lands on the slideshow, which moves forward again ~10 s
  later. Reached from the banner's "Advertise Now" and the "Advertise" tile (`src/pages/AdvertisementSlideshow.tsx`).
- **`site_banners` is an abandoned table (code).** Super admins still edit vendor banners in Cosora-Admin › Content,
  but `VendorDashboardBanners` is mounted nowhere since `/dashboard` became a redirect (2026-11-14). Seller Home shows
  two hardcoded images instead (`homebanner1.jpg`, `homebanner2.jpg`). Either mount it on Seller Home or retire the
  admin page, the table and its snapshot.
- **Seller Home is buyer coral, not vendor blue (seen).** `--accent` is the buyer colour, and the home uses it for
  "INCREASE SCORE", the score ring, "Send a quote", "View Leads", the active menu item and the bottom bar. `sides.md`
  says vendor pages use `#256fef`. The Competitor card and `/competitor-ads` also use buyer colours (and hex `#f75f71`).
- **Seller Home won't hold up at 10,000 concurrent users (measured).**
  - One load makes 23 API calls; `fetchVendorDashboard()` runs in three sequential rounds.
  - To show 3 rows each it downloads every open requirement (plus all the seller's quotes and `match_vendor_rfqs`
    200 rows), every own product with images, and every chat. Past 1,000 open requirements the list is cut off
    silently (breaks "a list the browser filters is never every row").
  - The `rfqs_select` policy calls `blocked_with_me(buyer_id)` per row; it is SECURITY DEFINER with a `search_path`,
    so it is never inlined. 120 open requirements: 12 ms count, 22 ms with the call; it grows with every requirement
    and runs for the count, again for the list, and again on Leads.
  - Fix: one `seller_home_summary()` function that returns the counts and the top 3 of each list, and an inline
    (set-based) block check in the policy.

### Medium
- **Profile score and "Boost Your Profile" ask Free sellers for what the plan forbids (code).** Free allows 2
  products (`subscription_plans.limits.product_cap`), but the score asks for "List 10 products" (10 points) and the
  card for "Add 3 more products". A Free seller can't pass 90%. Make the signals plan-aware or reword them.
- **"Boost Your Profile" carries an invented claim.** "Increase your visibility by 40%" breaks the 2026-11-14 rule;
  its button says "advertise" in lower case and opens `/advertisements`, not `/upload`.
- **Nothing tells a new seller what happens next (seen).** The welcome screen has no button or hint and doesn't move
  on; the home then says "Welcome back!" to a first-time seller; nothing mentions that documents (3–5 days), the first
  product and the premises photo are under review; no notification is written at registration; no link to `/kyc` from
  the home or the menu.
- **The registration banner is hidden in production (code).** `RegistrationBanner` shows only while
  `seller_registration_required` is on (off today), so a seller with an unsigned agreement ("Abc" above) or a rejected
  registration gets no prompt on the home.
- **Header search is broken (seen).** The phone's search icon has no handler. On a laptop, "Search products,
  leads…" opens the buyer marketplace `/search`, not the seller's own products or leads.
- **Phone menu hides Sign Out (seen).** In the sidebar at 390 px, Sign Out and the plan chip sit under the bottom bar
  (both `z-50`) and a tap hits the bar.
- **Anyone can open Seller Home (seen).** Signed out it shows "Welcome back! Here's an overview of your business", an
  invented 45% score (`DEFAULT_PROFILE_SCORE`) and "0 Open Leads". Buyer-only accounts get a seller dashboard with no
  prompt to register.
- **The score ring shows 0% for ~200 ms on every load (seen):** `BusinessProfileScore` ignores `isLoading`.
- **Uploads waiting for review count as missing.** A premises photo under review shows "Missing", with no "waiting for
  review" state; the "Complete product details" tile really means "get a listing approved".
- **The alerts card contradicts Lead alerts.** It says "Email and push alerts aren't live yet"
  (`NOTIFICATION_DELIVERY_LIVE = false`), but lead alerts are a live plan feature with `/lead-alerts`. Read
  `my_lead_alerts().live_channels` / entitlements and link there.
- **"Competitor's Advertisements" is mislabelled.** The card promises competitors' ads; it opens Category Benchmarks.
- **The promo banner is broken visually (seen).** The text on top repeats the headline already in the image (cropped
  "et Prime Placement"); `scale(0.85)` leaves a grey frame; it rotates every 3.5 s with no pause control (WCAG 2.2.2)
  and ignores reduced motion.

### Low
- Top Performing Products rounds prices (`Math.round` in `fetchMyProducts`: ₹450.75 shows ₹451) and shows ₹0 with
  no price; use `priceText()`.
- "Recent Leads" are ordered by fit, not date; a failed lead picture spills its alt text over the card (seen).
- Analysis subtitles are always green (`up: true`), even "1 under review" and "0 accepted"; "Inquiries" is a lifetime
  counter with no "Lifetime" label.
- Lead titles, buyer names, last messages and product names on the home lack `data-no-translate`.
- 10 buttons sit inside links (`<Link><motion.button>`): invalid HTML, two keyboard stops per item.
- The Buyer/Seller switch is on every seller page, twice (header and menu); `claude.md` puts it only on the two homes.
- "Upload Catalogue" appears twice; "Add Website" / "Add Email" stay after they're filled; "Browse Quotes — Find new
  business opportunities" opens your own Quotation Requests (new opportunities are on `/leads`).
- `/business-profile-score`'s back arrow (`navigate(-1)`) leaves the app when the page was opened from a link (seen).
- After registering, Forward walks into 12 leftover registration history entries.
- Large empty gaps in the right column on a laptop.
- `VendorDashboard.followers` and `videos` are computed and never shown.

## Medium priority

- **Retire the old buyer interest ids, on or after 2026-11-12** (Interest Preference v2). `pref_category_map` still
  holds rows for `tshirts, shirts, coords, dresses, bottomwear, activewear`, for a browser tab still running the
  pre-2026-10-11 app (it filters its own feed with them). Saved rows can't tell you when that's over: since
  `20261012040000_interest_preferences_v2_followups` the database translates old ids on every write
  (`interest_ids_translate()`), so no row ever holds one. The app is replaced on the next page load, so wait a month
  from the release (2026-10-11), then delete those map rows in a migration. Keep `interest_ids_translate()` and
  `LEGACY_INTEREST_IDS` (the second covers signed-out picks saved in a browser); both cost nothing.

- **Confirm the rights to the interest photos.** The 13 in `src/assets/Buyer/Preference/` came from Mitra with no
  source recorded; one shows a real brand's label (hobbytime.etsy.com) and one a child. claude.md says an image the
  project doesn't own is replaced, not kept. The 4 from Unsplash are recorded in `src/assets/interests/README.md`.


- **City targeting reaches almost nobody.** Only 1 of the buyer profiles has a
  city set, and `ad_targeting_matches()` fails closed by design (a viewer whose
  city is unknown is not shown a city-targeted ad). A soft, dismissible nudge
  was added to the buyer profile page on 2026-09-14; if uptake stays low,
  decide whether to keep selling city targeting at all.

---

## Low priority / blocked

- **Decide how the knowledge graph stays current** (added 2026-11-05). `graphify-out/` in the `cosora testing` folder
  goes stale with every merge: nothing reruns `graphify update .`, because that folder isn't a git repo and so can't
  carry a commit hook. Choose between running it by hand after each release (code is free; changed docs cost tokens),
  a commit hook in each of the three repos that runs it at the workspace root, or a scheduled run. Also decide whether
  the 295 screenshots go in: each needs its own subagent, roughly 300 runs, so they were left out.

- **Two skill folders are broken links** (found 2026-11-05). `cosora lovable/.claude/skills/design-taste-frontend` and
  this repo's `.claude/skills/emil-design-eng` still point at `Desktop/cosora lovable/...`, where the project lived
  before it moved into `cosora testing`; git prints "could not open directory" on every `git status` and graphify
  can't read them. Both skills are still there in the `.agents/skills/` folders the links meant. Repoint the links
  (one `mklink /D` each) or delete them.

- **WhatsApp Business Cloud API.** Requires a Meta Business account and a BSP
  relationship, neither of which exists. Current state: click-to-chat
  (`wa.me`) only, through the `MessagingProvider` seam in `src/lib/messaging.ts`
  — a real per-vendor link, honestly labelled, not an API integration. Mitra is
  building a separate messaging service; implement `MessagingProvider` against
  it and return it from `messaging()`, and no call site needs to change.

- **Design spec file missing.** The v4 brief referenced
  `claude/buyer-ad-placement-design-spec.md` for the "Bumped ↑" tag convention.
  That file does not exist in either repo, so the bump indicator was implemented
  as a small "Bumped" chip on the ad card. Trivial to restyle once the spec
  exists.

