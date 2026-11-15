# Seller Home audit, 2026-11-15

Every gap and bug found in a review of the vendor Seller Home (`/seller-home`), the screens a new seller sees right
after registering, and every feature the home links to. Nothing here is fixed yet. Items are numbered SH-001 to
SH-113; the chat summary and `todo.md` use the same numbers.

## Scope and method

- **Code:** buyer/seller app `main` at `4c5a845`; Cosora-Admin `main` at `c8b519c`.
- **Database:** the local Docker copy of production's schema (`supabase_db_localstack`). A function from every
  migration since 2026-11-01 (through `20261115120000`) was confirmed present; function bodies were not diffed against
  production. Writes used to probe a rule ran inside transactions that were rolled back.
- **Code and database review:** one reviewer per feature group (shell and notifications; profile score and profile
  tiles; products, videos and catalogues; leads, quotes and analytics; advertising and banners; messages, reviews,
  help and studio). Each read the code, migrations, policies, triggers and grants, and ran read-only SQL.
- **Browser:** Playwright against Vite on the local stack, 390 × 844 and 1440 × 900. Three throwaway sellers were
  registered through the real 9-step form, used, then deleted with all their rows and files. The seeded demo seller
  (`2222…`) was used for chats and notifications. Screenshots: `cosora testing/.playwright-mcp/home-review/`.
- **The full record** of what was audited and the output of every test and check is in the appendices at the end:
  [A. What was audited](#appendix-a-what-was-audited), [B. Browser test output](#appendix-b-browser-test-output),
  [C. Database check output](#appendix-c-database-check-output), [D. Reviewer output](#appendix-d-reviewer-output),
  [E. Screenshots](#appendix-e-screenshots), [F. Clean-up](#appendix-f-clean-up).

**Verification marks**

| Mark | Meaning |
|---|---|
| ✔ seen | Reproduced in the browser |
| ✔ checked | The SQL or code check was re-run during the review |
| reviewer | Found by a reviewer with the file/SQL evidence quoted; not re-run |
| [T] | Already listed in `todo.md` → "Seller Home audit (2026-11-15)" |

**Severity:** High = data loss, money, privacy, a broken core flow, or won't hold at 10,000 concurrent users.
Medium = a feature misleads or fails for a real case. Low = polish, wording, edge cases.

**Count:** 113 items, 15 High. SH-110 to SH-113 are parts of the review that could not be done, not defects.

**Claims withdrawn during the review** (kept here so nobody chases them): "two Business Profile Score links don't
scroll" (they do, about 3 s after load); "Pay & Publish fails silently" (the "Checkout failed" toast had expired
before the check).

---

## A. Right after registration

### SH-001 · Medium · ✔ seen · [T] — No next steps after registering
- **Problem:** The welcome screen ("The Good Times Start Now. Welcome to Cosora") has no button or hint and doesn't
  move on by itself (still there after 4 s). Seller Home then greets a first-time seller with "Welcome back!". Nothing
  says the documents (3–5 days), the first product and the premises photo are under review. No notification is
  written at registration (0 rows), and neither the home nor the menu links to `/kyc`.
- **Where:** `src/pages/Onboarding.tsx` (welcome screen, `role="button"` on the whole screen); `src/pages/SellerHome.tsx:98-99`;
  `submit_vendor_registration()` writes no notification.
- **Fix:** A welcome screen with a "Go to Seller Home" button and a "What happens next" list; a first-visit card on the
  home with the review states and a link to `/kyc`; a `notify()` at registration.

### SH-002 · Medium · [T] — The registration banner is hidden in production
- **Problem:** `RegistrationBanner` shows only while `seller_registration_required` is on for the account. The switch
  is off, so a seller registered without a signed agreement ("Abc" in `todo.md`) or with a rejected registration sees
  no prompt anywhere on the home.
- **Where:** `src/components/vendor/RegistrationBanner.tsx:15`; `canPublish()` in `src/lib/queries/sellerRegistration.ts:44-47`
  returns true whenever the switch is off.
- **Fix:** Show the unsigned-agreement and rejected states whatever the switch says; only the "can't publish" wording
  depends on it.

### SH-003 · Low · ✔ seen · [T] — Forward walks into old registration steps
- **Problem:** After registering, Seller Home replaces the guard entry but the 12 step entries stay ahead in history
  (`history.length` 13 at index 0). The browser's Forward re-enters them.
- **Where:** `src/pages/Onboarding.tsx` step history (`StepEntry`).
- **Fix:** Accept as is, or replace forward entries when registration completes.

---

## B. Seller Home page

### SH-004 · High · ✔ seen · [T] — Back after switching to Buyer shows a broken page
- **Problem:** Seller Home → Buyer → Back renders the seller dashboard inside the buyer menu, buyer header search
  ("Search for items or brands…") and the buyer bell with its fixed red dot.
- **Where:** `src/hooks/useSwitchRole.ts:31-33` changes the role and pushes; `DashboardHeader`/`DashboardSidebar` render
  by role, not by route. Screenshot `08-back-after-switch.png`.
- **Fix:** Derive the shell's side from the route (seller routes always render the seller shell), or `replace` on
  switch.

### SH-005 · High · ✔ seen · [T] — Seller Home is buyer coral, not vendor blue
- **Problem:** "INCREASE SCORE", the score ring, "Send a quote", "View Leads", the active menu item and the bottom bar
  are all coral. The Competitor card uses a buyer gradient, and `/competitor-ads` hard-codes `#f75f71`.
- **Where:** `src/index.css:26,97` (`--accent: 352 85% 62%`); `sides.md:487` ("vendor pages hardcode `#256fef`").
- **Fix:** A vendor accent token applied under `.vendor-shell`, then replace `accent` classes on vendor pages.

### SH-006 · High · ✔ checked · [T] — Seller Home won't hold up at 10,000 concurrent users
- **Problem:** One load makes 23 API calls; `fetchVendorDashboard()` runs in three sequential rounds. To show three
  items each, it downloads every open requirement (plus all the seller's quotes and 200 ranked rows), every own
  product with images, and every chat. Past 1,000 rows PostgREST cuts lists silently. The `rfqs_select` policy calls
  `blocked_with_me(buyer_id)` per row (SECURITY DEFINER with a `search_path`, never inlined): 120 open requirements
  cost 12 ms without it and 22 ms with it, growing with every requirement, for the count and again for the list.
- **Where:** `src/pages/SellerHome.tsx:51-54`; `src/lib/queries/vendorDashboard.ts:276-338`;
  `src/lib/queries/rfqs.ts:514-573` (`fetchOpenRfqs`); `fetchMyProducts` in `products.ts`; `fetchConversations` in
  `chat.ts`; policy `rfqs_select`.
- **Rule:** claude.md "A list the browser filters is never every row"; "Keep functions with a `set` clause out of
  per-row policy tests".
- **Fix:** One `seller_home_summary()` returning the counts and the top three of each list; an inline, set-based
  block check in the policy.

### SH-007 · Medium · ✔ seen · [T] — Anyone can open Seller Home
- **Problem:** Signed out, it shows "Welcome back! Here's an overview of your business", an invented 45% score and
  "0 Open Leads". Buyer-only accounts get a seller dashboard with no prompt to register.
- **Where:** `src/App.tsx:270` (no guard); `DEFAULT_PROFILE_SCORE = 45` in `vendorDashboard.ts:352`.
- **Fix:** Signed out → sign-in prompt; no seller row → "Become a seller" card; never a placeholder score.

### SH-008 · Medium · ✔ seen · [T] — The score ring shows 0% on every load
- **Problem:** The ring reads 0% for about 200 ms, then the real value.
- **Where:** `src/components/dashboard/BusinessProfileScore.tsx:13` uses `useProfileScore()` and ignores `isLoading`.
- **Fix:** Use `useProfileScoreState()` and render a skeleton while loading.

### SH-009 · Medium · ✔ seen · [T] — The promo banner is broken visually
- **Problem:** The overlay text repeats the headline baked into the image, which is itself cropped ("et Prime
  Placement"); `scale(0.85)` leaves a grey frame. It rotates every 3.5 s with no pause or controls (WCAG 2.2.2) and
  ignores reduced motion. The hidden slide's link stays in the tab order.
- **Where:** `src/pages/SellerHome.tsx:74-77, 103-179`.
- **Fix:** Use admin banners (see SH-087) or clean images without baked text; add pause, indicators and
  `prefers-reduced-motion`; `inert` on the hidden slide.

### SH-010 · Medium · [T] — "Boost Your Profile" carries an invented claim
- **Problem:** "Add 3 more products to increase your visibility by 40%" has no data behind it, "3" is fixed whatever
  the seller has, and the lower-case "advertise" button opens `/advertisements`, not `/upload`.
- **Where:** `src/pages/SellerHome.tsx:419-428`. Rule: no invented claims (2026-11-14).
- **Fix:** Honest copy from the seller's real gap (the next missing score signal) and a matching link.

### SH-011 · Medium · [T] — Free sellers are asked for what their plan forbids
- **Problem:** The Free plan allows 2 products (`subscription_plans.limits.product_cap`), but the score asks for
  "List 10 products" (10 points) and the home card for "3 more products". A Free seller can't pass 90%.
- **Where:** `PROFILE_SCORE_WEIGHTS.tenProducts` in `vendorDashboard.ts`; `vendor_profile_score_of()`.
- **Fix:** Make the signal plan-aware ("fill your plan's listings") in both the JS and SQL formula, or reword it.

### SH-012 · Medium · [T] — The alerts card contradicts Lead alerts
- **Problem:** The card says "Email and push alerts aren't live yet", but lead alerts are a live plan feature with
  `/lead-alerts`.
- **Where:** `src/pages/SellerHome.tsx:235-259`; `NOTIFICATION_DELIVERY_LIVE = false` in `src/lib/notificationDelivery.ts`.
- **Fix:** Read `my_lead_alerts().live_channels` and entitlements; link entitled sellers to `/lead-alerts`.

### SH-013 · Medium · [T] — "Competitor's Advertisements" is mislabelled
- **Problem:** The card promises "See what your competitors are doing"; it opens "Category Benchmarks", which shows no
  ads.
- **Where:** `src/pages/SellerHome.tsx:494-498`; `src/pages/CompetitorAds.tsx:71`.
- **Fix:** Rename the card "Category benchmarks".

### SH-014 · Medium · reviewer — The home ignores requests sent straight to the seller
- **Problem:** "Open Leads" and "Recent Leads" count only the open marketplace (`vendor_id is null`). A seller with
  three direct requests sees "0 Open Leads" and "No open buyer requirements right now", while `/leads` counts them.
- **Where:** `vendorDashboard.ts:292`; `SellerHome.tsx:53` (`useOpenRfqs` only); `src/pages/Leads.tsx:30-31`.
- **Fix:** Add direct requests to the count and show them first.

### SH-015 · Medium · ✔ seen — Counts go stale after a quote or an upload
- **Problem:** After sending a quote and pressing Back, Recent Leads marks the lead "Quoted" but "Your Quotes" stays 0
  until a reload. The score ring and the "Send 2 quotes" / listing signals lag up to 60 s after a quote or an upload.
- **Where:** `src/components/vendor/OpenRfqLeads.tsx:129-130` and `DirectQuoteRequests.tsx:53` invalidate only
  `["rfqs"]`/`["crm"]`; `src/pages/Upload.tsx:525,591` only `["products"]`.
- **Fix:** Also invalidate `["vendor_dashboard"]`, `["quotes","mine"]` and the lead funnel.

### SH-016 · Medium · reviewer — A failed count shows as zero
- **Problem:** `count()` drops the error and returns `n ?? 0`, so a failed read shows "0 Live Products / 0 Open Leads /
  0 Your Quotes".
- **Where:** `vendorDashboard.ts:241-247`. Rule: signed-out / loading / error / empty are four distinct states.
- **Fix:** Throw on error and render an error state with Retry.

### SH-017 · Low · ✔ seen · [T] — Home prices are rounded
- **Problem:** Top Performing Products shows ₹800 for ₹799.50 and ₹0 when a listing has no price.
- **Where:** `fetchMyProducts` (`String(Math.round(Number(p.price_value)))`) in `products.ts`; `SellerHome.tsx:282`.
  Rule: "Prices keep their paise" (`priceText()`).
- **Fix:** Keep the numeric price and render it with `priceText()`; "Price on request" when empty.

### SH-018 · Low · ✔ seen · [T] — "Recent Leads" aren't recent, and broken pictures spill
- **Problem:** The list is ordered by fit score, not date. A failed lead picture shows its alt text over the card.
- **Where:** `rfqs.ts:572` (sort by score); `SellerHome.tsx:366-367` (no `onError` fallback).
- **Fix:** Rename "Best-fit leads" or sort by date; fall back to the placeholder icon on error.

### SH-019 · Low · ✔ seen — Lead taps don't open the lead
- **Problem:** Tapping a Recent Lead, "Send a quote" or "View quote" opens the general `/leads` list; the seller must
  find the lead again among all of them.
- **Where:** `SellerHome.tsx:361, 393`; `Leads.tsx` reads no URL parameter.
- **Fix:** `/leads?rfq=<id>` that scrolls to and opens the lead's quote form.

### SH-020 · Low · [T] — Analysis subtitles mislead
- **Problem:** Every subtitle is green (`up: true` fixed), including "1 under review" and "0 accepted". "Inquiries" is a
  lifetime counter with no "Lifetime" label.
- **Where:** `SellerHome.tsx:67-72`. Rule: a metric is windowed or lifetime, and the UI says which.
- **Fix:** Neutral colour; a "Lifetime" label on Inquiries.

### SH-021 · Low · [T] — User-written text can be machine-translated
- **Problem:** Lead titles, buyer names, last messages and product names on the home lack `data-no-translate`.
- **Where:** `SellerHome.tsx` lead, message and product rows.
- **Fix:** Add `data-no-translate` to each.

### SH-022 · Low · [T] — Buttons inside links
- **Problem:** Ten `<Link><motion.button>` nests: invalid HTML and two keyboard stops per action.
- **Where:** `SellerHome.tsx` (View All, View Leads, Advertise Now, advertise, View Competitor Ads…).
- **Fix:** Style the `Link` itself as the button.

### SH-023 · Low · [T] — The Buyer/Seller switch is everywhere, twice
- **Problem:** The switch is in the header and the sidebar on every seller page.
- **Where:** `DashboardHeader.tsx:75-77`; `DashboardSidebar.tsx:218-224`. Rule: the toggle appears only on the Vendor
  Dashboard Home and the Buyer Homepage.
- **Fix:** Render it only on `/seller-home` (one place).

### SH-024 · Low · [T] — Duplicated and stale tiles
- **Problem:** "Upload Catalogue" appears twice (tile with "FREE" and a full-width card). "Add Website" and "Add Email"
  stay after they're filled. "Browse Quotes — Find new business opportunities" opens the seller's own Quotation
  Requests; new opportunities are on `/leads`.
- **Where:** `src/components/dashboard/SellerQuickActionsGrid.tsx:44-52, 144-158`; `SellerHome.tsx:312`.
- **Fix:** One catalogue entry; hide filled tasks using the score checks; point "Browse" at `/leads`.

### SH-025 · Low · [T] — Empty gaps on a laptop
- **Problem:** The right column leaves large empty areas beside the taller left panels.
- **Where:** `SellerHome.tsx` 12-column grid.

### SH-026 · Low · reviewer — Recent Messages shows archived chats and no unread state
- **Problem:** The home takes the first three conversations with no archived filter (the `/chat` "All" view hides
  archived ones), and every row has `unread: 0`.
- **Where:** `SellerHome.tsx:64`; `src/lib/queries/chat.ts:694`.
- **Fix:** Filter archived; read `useChatUnread()` for markers.

### SH-027 · Low · [T] — Values computed and never shown
- **Problem:** `VendorDashboard.followers` and `videos` are fetched on every load and never rendered.
- **Where:** `vendorDashboard.ts`.

---

## C. Header, menu and bottom bar

### SH-028 · Medium · ✔ seen · [T] — Header search is broken
- **Problem:** On a phone the search icon has no handler. On a laptop "Search products, leads…" opens the buyer
  marketplace `/search`, not the seller's own products or leads.
- **Where:** `src/components/layout/DashboardHeader.tsx:95-97` (no `onClick`), `80-90`.
- **Fix:** A seller search over own products, leads and chats, or remove it.

### SH-029 · Medium · ✔ seen · [T] — The phone menu hides Sign Out
- **Problem:** At 390 px the sidebar's Sign Out and plan chip ("Free · 1/2 products used") sit under the bottom bar
  (both `z-50`); a tap hits the bar.
- **Where:** `DashboardSidebar.tsx` (`h-screen`, `z-50`); `MobileBottomNav.tsx:90` (`z-50`).
- **Fix:** Raise the sidebar above the bar, or pad its bottom by `--bottom-nav-h`.

### SH-030 · High · reviewer — Live subscriptions don't scale
- **Problem:** Every signed-in tab opens a per-user `notifications` subscription and two `conversations`
  subscriptions, and tears them down and reopens them on every page change (the layout is inside each page). Realtime
  checks each change against every subscriber, so at 10,000 tabs each chat message is checked about 20,000 times.
- **Where:** `src/lib/queries/notifications.ts:110-134`; `src/lib/queries/chatUnread.ts:55-68`; `DashboardLayout` rendered
  per page; `realtime.apply_rls`.
- **Fix:** Per-user Broadcast from the database (`realtime.broadcast_changes`) and a shell mounted once.

### SH-031 · Medium · reviewer — Badges reload on every navigation
- **Problem:** `useNotifications` sets `staleTime: 0` and re-reads a 100-row list for the bell count; `useChatUnread`
  forces `chat_unread_counts` on each subscribe. About 1,300 requests/s at 10,000 sellers navigating every 15 s.
- **Where:** `notifications.ts:75-83, 151-154`; `chatUnread.ts:64`.
- **Fix:** A count-only RPC with a normal `staleTime`; refresh on realtime events only.

### SH-032 · Medium · reviewer — A failed plan check looks like "not on your plan"
- **Problem:** `TierGate` computes `allowed = Boolean(data?.features?.[feature])`; when `vendor_entitlements` errors it
  redirects to `/subscription#plans`. A Gold seller's `/crm` silently becomes the plans page under load.
- **Where:** `src/components/TierGate.tsx:51-72`.
- **Fix:** Distinguish error from "not entitled"; show Retry.

### SH-033 · Low · reviewer — The Chats badge counts archived chats
- **Problem:** `chat_unread_counts()` has no archived filter, so the badge counts unread messages in chats "All" hides.
- **Fix:** Exclude archived chats in the function.

---

## D. Notifications

### SH-034 · Medium · ✔ checked — Common seller notices lead nowhere
- **Problem:** These kinds have no `KIND_META` entry, so "View" falls back to `/notifications` (pushed onto
  itself; Back needs two presses): `product_/video_/catalogue_ approved|rejected`, `product_removed`,
  `product_flagged`, `product_reinstated`, `premises_photo_rejected`, `registration_approved|rejected`,
  `ad_<decision>`, `certificate_<to>`, `billing_incident`. Locally: `billing_incident` 177, `product_approved` 50,
  `premises_photo_rejected` 35, `catalogue_rejected` 34, `registration_*` 37.
- **Where:** `src/lib/notificationsStore.ts:271-319, 359`.
- **Fix:** Add each kind with its destination (the listing, `/kyc`, the campaign, `/my-payments`…).

### SH-035 · Medium · reviewer — Three tabs can never fill
- **Problem:** Every kind is grouped "updates", and nothing writes quote, message or payment notices, so
  "Requirements", "Quotes & Leads", "Payments" and the "N new requirements match your domains" spotlight are always
  empty. The page promises lead notices, but `lead_match` is written only when the plan's channels include `app`
  (Free `[]`, Basic `["digest"]`).
- **Where:** `src/pages/Notifications.tsx:75-81, 307, 324-345, 410-413`; `admin.lead_alert_fanout`. Rules: "A filter
  control that silently does nothing…"; "A page never promises a channel that isn't running."
- **Fix:** Group kinds correctly; hide empty tabs; plan-aware copy.

### SH-036 · Medium · reviewer — "Read all" sets off a reload storm
- **Problem:** One UPDATE of N rows sends N realtime events; each calls `invalidateQueries` with no debounce (twice on
  `/notifications`), and earlier GETs aren't aborted: about 389–778 GETs for one tap on a busy account.
- **Where:** `notifications.ts:122-127`.
- **Fix:** Debounce invalidation; optimistic update after "Read all".

### SH-037 · Low · reviewer — Unread stops at 100
- **Problem:** The count is taken over the newest 100 rows with no paging; "Read all" clears notices the seller never
  saw (389 unread showed as 100 locally).
- **Where:** `notifications.ts:54, 151-154`.

### SH-038 · Low · reviewer — Signed out, the page loads forever
- **Problem:** No guard on the route; with `enabled: false` the query stays pending and three skeletons pulse forever.
- **Where:** `Notifications.tsx:236, 388`; `App.tsx:287`.

### SH-039 · Low · reviewer — Untranslated notice titles
- **Problem:** "Your listing is live", "Your listing wasn't approved", "Your video is live", "Cosora removed your
  listing", "Your plan has ended", "Your refund is on its way", "Your autopay payment didn't go through" are missing
  from `external-strings.json` and the catalogues. `lead_match` titles (buyer text) lack `data-no-translate`.
- **Where:** `src/i18n/external-strings.json`; `Notifications.tsx:191-198`.

### SH-040 · Low · ✔ checked — A live guard with no migration file
- **Problem:** `trg_notifications_update_columns` / `enforce_notification_update_columns()` is live in the database but
  in no file in any repo; `securityflags.md` (lines 31, 175, 183) and `ToDo.md` (line 61) still list "notifications
  UPDATE allows any column" as open.
- **Rule:** every migration is a committed file named by its live version.
- **Fix:** Export it into a migration file and close the flags.

---

## E. Business Profile Score and profile tiles

### SH-041 · Medium · reviewer — The contact sheet can wipe private contact data
- **Problem:** The sheet seeds all 11 fields from a profile read whose error is never checked and saves the whole
  form; empty strings become NULL. If `my_vendor_private` fails, saving an email blanks the phone, WhatsApp, owner name
  and address.
- **Where:** `src/pages/BusinessProfile.tsx:250-263, 359, 604-619, 1822`; `src/lib/queries/vendorStore.ts:139-143, 287-296`.
  Rule: "A form save sends only the fields the user changed."
- **Fix:** Diff against what loaded; block the sheet while the read failed.

### SH-042 · Medium · reviewer — Sellers outside India can't save contact details
- **Problem:** The sheet requires an Indian state (`stateCodeFor(form.state)`), but overseas registration stores a
  typed region. Their phone, email, website and address can't be saved here (22 score points out of reach).
- **Where:** `BusinessProfile.tsx:258-261`; `Onboarding.tsx:1981-1986`.
- **Fix:** Free-text region for sellers whose country isn't India.

### SH-043 · Medium · reviewer — Contact fields skip registration's checks
- **Problem:** Registration validates phone (country length), website (https) and email; the sheet writes the same
  columns raw. Website "x" earns 7 points and becomes a buyer link to `https://x`; phone "call me" earns 8.
- **Where:** `src/lib/registrationValidation.ts:161-167` vs `BusinessProfile.tsx:277-280`.
- **Fix:** Reuse the registration validators, and add DB checks.

### SH-044 · Medium · ✔ checked — Social links are scored but shown to no one
- **Problem:** `vendor_profiles.social` is read only by the score and the data export; no buyer or admin page shows
  it, yet it is worth 6 points of a ranking input. The page starts empty and Save is enabled before the row loads,
  so an early save writes `{}`. Any address is accepted in any box (an Instagram link was stored under Facebook).
- **Where:** `src/pages/AddSocialLinks.tsx:253, 297-305, 360, 383`; no reader in `VendorProfile.tsx`.
- **Fix:** Show the links on the store; disable Save until loaded; validate the domain per platform.

### SH-045 · Medium · reviewer — A failed read shows a real low score
- **Problem:** When the profile read fails, the score is computed from the counts only and shown as real ("Poor 24%",
  every tile "Missing"), inviting the seller to re-enter data (and trigger SH-041).
- **Where:** `vendorDashboard.ts:304-310, 386-388`.

### SH-046 · Medium · [T] — Things waiting for review count as missing
- **Problem:** A premises photo under review shows "Missing" (the score counts approved photos only), with no
  "waiting for review" state. The "Complete product details" tile actually means "get a listing approved".
- **Where:** `BusinessProfileScorePage.tsx:42`; `vendor_profiles.office_photos` (approved cache).
- **Fix:** A "Waiting for review" badge; rename the tile.

### SH-047 · Low · reviewer — An API edit of a live listing doesn't rescore
- **Problem:** `listing_edit_rereview` sets `status := 'under_review'` in a BEFORE trigger, but
  `trg_products_vendor_score` fires only `AFTER UPDATE OF status, vendor_id`, so an edit that doesn't name `status`
  leaves the stored score stale. The app's edit sends `status`, so only direct API edits hit this.
- **Fix:** Fire the rescore on any update that changes status.

### SH-048 · Low · reviewer — JS and SQL scores disagree on odd input
- **Problem:** JS `trim()`/`.length` vs SQL `btrim(… ' \t\r\n')`/`char_length`: website U+00A0 scores 7 in SQL, 0 in JS;
  six emoji in About score 8 in JS, 0 in SQL. The page shows the JS number; ranking uses SQL.
- **Fix:** Show the stored `profile_score`, or align the trimming.

### SH-049 · Low · reviewer — "State Production Capacity" lands on the wrong field
- **Problem:** The tile opens Detailed information, where "Monthly Capacity" saves to `vendor_capacity`; the score reads
  `vendor_profiles.capacity` (the bands lower down). The tile stays "Missing".
- **Where:** `BusinessProfile.tsx:715-726`.

### SH-050 · Low · reviewer — About Us needs more than 10 characters, silently
- **Problem:** "We knit." saves with a success toast and the tile stays "Missing".
- **Where:** `vendorDashboard.ts:127`; SQL `char_length > 10`.

### SH-051 · Low · reviewer — The score leaks private facts to anyone
- **Problem:** `anon` can read `profile_score`; every other input is public and the weights ship in the bundle, so the
  remaining points reveal an email on file, ≥ 2 quotes sent, or ≥ 10 listings including unpublished ones.

### SH-052 · Low · ✔ seen · [T] — The score page's back arrow leaves the app
- **Problem:** `navigate(-1)` goes to `about:blank` when the page was opened from a link or a new tab.
- **Where:** `src/pages/BusinessProfileScorePage.tsx:160`. Same on `/upload-video` and `/upload-catalogue` (SH-070).
- **Fix:** Go back only when there is in-app history; otherwise go to `/seller-home`.

### SH-053 · Low · ✔ checked — Custom sheets aren't dialogs
- **Problem:** The employees, year and turnover sheets are plain `div`s: no `role="dialog"`, no focus trap, no Escape,
  and an unlabelled back-arrow button.
- **Where:** `BusinessProfile.tsx:121-160, 306` (`NumberOfEmployeesModal`, `RangePickerModal`, `YearEstablishedModal`).
- **Fix:** Use the shared `Dialog`/`Sheet` primitives.

---

## F. Products and Upload

### SH-054 · Medium · ✔ seen — Required fields aren't enforced
- **Problem:** Bag Type, Material, MOQ, Lead Time and Location are starred as required but block neither Continue nor
  Publish. Country of Origin, also starred, is checked only at Publish, after all five steps.
- **Where:** `src/pages/Upload.tsx:421-433` (the only required-field check).
- **Fix:** Validate each step's required fields before Continue.

### SH-055 · Medium · ✔ checked — A blank MOQ is saved as "2"
- **Problem:** A new listing with MOQ left empty stores `moq = '2'`; buyers see a minimum the seller never set.
- **Where:** `Upload.tsx:555` (`|| "2"`). Same invention was fixed for onboarding on 2026-11-13.
- **Fix:** Store NULL; display "Not specified".

### SH-056 · Medium · reviewer — PDFs on a live listing skip review
- **Problem:** `product_documents` has only `trg_product_documents_cap`; inserting a PDF on a live listing leaves it live
  with no edit record. Buyers download it from the product page.
- **Rule:** an edit to approved content goes back to review, enforced in the database.
- **Fix:** Add the re-review trigger to `product_documents`.

### SH-057 · Medium · reviewer — Any staff role can change live listing photos
- **Problem:** `pimages_insert/update/delete` (and `pdocs_delete`) admit `owns_product(product_id) OR is_admin()`;
  `product_images_rereview` exits when the writer isn't the seller. A support account added a photo to a live
  listing; it stayed live.
- **Rule:** a write policy's admin arm names its roles.
- **Fix:** Name the roles (product moderator, super admin) and record the change.

### SH-058 · Medium · reviewer — A failed photo upload leaves a broken listing
- **Problem:** The product row is inserted (`under_review`, using a plan slot) before the photos upload; on failure
  nothing is rolled back and the filled form invites a second Publish (a duplicate). BMP, TIFF and SVG pass the
  browser's `image/*` check and are refused by the bucket.
- **Where:** `Upload.tsx:239, 546-586, 599-600`.
- **Fix:** Upload first, insert once; delete the row on failure; restrict to JPEG/PNG/WebP.

### SH-059 · Medium · reviewer — Publishing at the limit discards the form
- **Problem:** At the plan limit, Publish navigates to `/subscription` without saving, although the banner says "You
  can still save drafts". Back returns to an empty step 1.
- **Where:** `Upload.tsx:436-441, 699`.
- **Fix:** Save a draft first, or block Publish with the explanation.

### SH-060 · Medium · reviewer — Back or refresh loses the whole upload
- **Problem:** The five steps are page state with no history entries and no leave guard; the phone's Back exits
  `/upload` and a refresh restarts at Category.
- **Where:** `Upload.tsx:114, 311-323`. The registration form solved this (claude.md, "steps are browser history
  entries").

### SH-061 · Medium · reviewer — Listing photos are stored full size
- **Problem:** Up to 6 × 10 MB originals are uploaded and served to buyers, while every other upload is shrunk to
  1600 px. Egress is capped at 5 GB/month on the current plan.
- **Where:** `Upload.tsx:329-337` vs `src/lib/queries/vendorOnboarding.ts:353` (`shrinkImage`).

### SH-062 · Medium · reviewer — A load error looks like an empty catalogue
- **Problem:** `/products` ignores the query error and shows "No products yet / Your catalog is empty"; a seller with
  listings may upload again and hit the limit.
- **Where:** `src/pages/Products.tsx:354, 642-652`.

### SH-063 · Low · ✔ checked — Upload dropdowns are unlabelled
- **Problem:** Each dropdown's `<Label htmlFor={field.id}>` points at an id the `SelectTrigger` doesn't carry, so screen
  readers can't name it and tapping the label does nothing.
- **Where:** `src/components/upload/DynamicFormFields.tsx:101-106`.
- **Fix:** `<SelectTrigger id={field.id}>`.

### SH-064 · Low · ✔ seen — Products rounds prices
- **Problem:** "₹451 / pieces" for ₹450.75; the unit mixes "pieces" and "Piece".
- **Where:** `fetchMyProducts` in `products.ts`.

### SH-065 · Low · reviewer — The category filter does nothing
- **Problem:** `categoryFilter` is never applied and its options are hard-coded; "Fabrics" still lists apparel.
- **Where:** `Products.tsx:376-380, 553-556`.

### SH-066 · Low · reviewer — "Duplicate" copies only part of a listing
- **Problem:** 12 columns are copied: no photos, sizes, attributes, unit or customization.
- **Where:** `products.ts:724-735`.

### SH-067 · Low · reviewer — The 3-PDF limit can be exceeded
- **Problem:** `product_documents_cap()` counts without a lock; parallel uploads can pass it.
- **Rule:** any count-then-decide trigger takes the advisory lock.

---

## G. Video Closeup

### SH-068 · High · ✔ checked — PNG covers always fail and leave the video behind
- **Problem:** The cover picker accepts and advertises PNG ("JPG or PNG"), but the `product-videos` bucket allows only
  `video/mp4, video/webm, image/jpeg, image/webp`. `createProductVideo` uploads the clip first and throws on the cover
  with no cleanup, so every retry strands up to 50 MB; a refused row insert also leaves the files.
- **Where:** `src/pages/UploadVideo.tsx:765, 773`; `src/lib/queries/videos.ts:555-568, 590-606`; migration
  `20260730205449`.
- **Fix:** Accept JPEG/WebP only (or convert PNG in the browser); remove uploaded objects on any failure.

### SH-069 · Low · ✔ seen — "Video Closeups get 5× more reach"
- **Problem:** An invented figure on the upload page.
- **Where:** `UploadVideo.tsx:541`. Rule: no invented claims (2026-11-14).

### SH-070 · Low · reviewer — One-tap delete and a back arrow that leaves the app
- **Problem:** Videos delete with no confirmation (`UploadVideo.tsx:222`); the back arrow is `navigate(-1)`
  (`UploadVideo.tsx:522`).

---

## H. Upload Catalogue

### SH-071 · High · ✔ checked — "Who can view" is never saved
- **Problem:** The All / Verified Only / Private choice is page state only; `createCatalogue` gets title, description
  and file, and the `catalogues` table has no visibility column. Every card shows "All Buyers". A "Private" price
  list is shown to every buyer once approved.
- **Where:** `src/pages/UploadCatalogue.tsx:211, 222, 293-297, 480-517`; `src/lib/queries/catalogues.ts:148-155`.
- **Fix:** Add a `visibility` column, enforce it in the read policy, and send it on insert; until then remove the
  control.

### SH-072 · Medium · reviewer — Deleted catalogues stay downloadable
- **Problem:** `deleteCatalogue` deletes only the row (no zero-row check) and the `catalogues` bucket is public, so the
  PDF stays reachable by its link. `createCatalogue` uploads before the insert and never removes the file on error;
  while the list is still loading the client limit check doesn't block. (In the browser test the limit was checked
  client-side and no file was left.)
- **Where:** `catalogues.ts:135-162`; `UploadCatalogue.tsx:203`.

### SH-073 · Medium · ✔ seen — The form stays usable at the Free limit
- **Problem:** A Free seller with one catalogue can fill the form; Upload then shows the limit toast and jumps to
  `/subscription`, discarding the file and title.
- **Where:** `UploadCatalogue.tsx:275-281`.
- **Fix:** Disable the form with the explanation and an Upgrade link.

### SH-074 · Low · ✔ seen — Invented and fixed figures
- **Problem:** "Vendors with catalogues get 3× more inquiries on average" is invented; live cards show fixed "0 views ·
  0 downloads"; `page_count` and `cover_url` are read by both apps but never written. Delete has no confirmation; the
  back arrow is `navigate(-1)`.
- **Where:** `UploadCatalogue.tsx:123, 155-163, 223-224, 332, 356`.

---

## I. Leads, quotes and Analytics

### SH-075 · High · ✔ checked — Quotes can be changed after the request closes
- **Problem:** A seller can update a quote's terms on a closed, expired or removed request. A local accepted ₹250 quote
  became ₹1.00 and went back to "pending" (rolled back). A seller can un-win an order (Total Order Value drops) or
  push new text to a buyer after Cosora removed the request.
- **Where:** `trg_quotes_accepting_rfq` fires only on `UPDATE OF rfq_id, vendor_id`; `enforce_quote_rfq_open` returns
  early otherwise. Rule: "closed RFQs should not receive any quotes… covers re-submitting an existing quote".
- **Fix:** Fire the check on any update of the quote's terms.

### SH-076 · High · reviewer — Lead ranking runs per row before the limit
- **Problem:** `match_vendor_rfqs` scores every open requirement with the plpgsql `admin.rfq_fit()` (6+ queries, plus a
  scan of the seller's live listings per answer) and `chat_blocked_between()` before `LIMIT 200`. About 0.16 ms per row
  → about 0.8 s of database time per call at 5,000 requirements, on every Seller Home, `/leads`, `/quotes` and
  `/overseas-leads` load.
- **Rule:** "Anything on every page view must be set-based."
- **Fix:** Pre-filter set-based, score only the candidates, or cache fit per seller.

### SH-077 · Medium · ✔ checked — Sellers can see which named buyers viewed them
- **Problem:** The `engagement_events` SELECT policy (`vendor_id = auth.uid()`) and its grants give sellers raw
  `viewer_id`, `session_id` and `query_text`; joining `profiles.full_name` (readable by anyone) names the viewer and
  shows what they searched.
- **Rule:** `vendor_buyer_geography` folds fewer than 3 viewers so no buyer can be identified.
- **Fix:** Revoke the identifying columns from sellers; serve aggregates through a definer function.

### SH-078 · Medium · reviewer — The Analytics funnel counts expired requests
- **Problem:** "Buyer requirements you could quote on" filters `status = 'active'` with no deadline: 249 counted, 128
  past deadline, 120 quotable.
- **Where:** `src/lib/queries/vendorAnalytics.ts:341`.

### SH-079 · Medium · reviewer — Loading and errors look empty on Leads and Quotes
- **Problem:** `/leads` shows "No open buyer requirements right now" on error and nothing while loading; `/quotes` shows
  "No quotes submitted yet" and zero stats while loading, on error and signed out; `/analytics` has no signed-out
  state.
- **Where:** `Leads.tsx:83`; `Quotes.tsx:388`.

### SH-080 · Medium · reviewer — Analytics reads every message ever
- **Problem:** `fetchVendorResponsiveness` reads every message of every chat in one request (cut at 1,000, so response
  time is wrong), with every conversation id in one `.in()` GET; `fetchMySubmittedQuotes` does the same with buyer ids
  and ignores the error.
- **Where:** `vendorAnalytics.ts:218-222`; `rfqs.ts:639`. Rules: never read a whole history; don't put long id lists
  in a GET.

### SH-081 · Low · reviewer — Quote prices aren't checked
- **Problem:** No CHECK on `quotes.price_per_unit`; the forms test only `if (!price)`, so −5 is accepted. The price
  fields use `inputMode="numeric"`, so phones offer no decimal point.
- **Where:** `OpenRfqLeads.tsx:118`; `DirectQuoteRequests.tsx:42`.

### SH-082 · Low · reviewer — Quotes can't be viewed or revised
- **Problem:** "View quote" and "View RFQ" (`Quotes.tsx:386`, `window.scrollTo`) don't open anything; there is no screen
  to revise a quote, though shortlisted quotes say "Continue Chat" to negotiate.

### SH-083 · Low · reviewer — "Repeat Buyers" counts one request as a repeat
- **Problem:** A direct request writes the request and opens a conversation; both count as touches.
- **Where:** `vendorAnalytics.ts:399-419`; `rfqs.ts:385-420`.

### SH-084 · Low · reviewer — Lead alert history ignores blocks
- **Problem:** `my_lead_alerts` returns titles of requirements whose buyer has since blocked the seller.
- **Rule:** a block stops the seller's view of the buyer's requirements.

### SH-085 · Low · reviewer — Raw prices
- **Problem:** `Quotes.tsx` (`₹ {q.pricePerUnit}`) and `SellerHome.tsx:387` (lead budget) print raw numbers, not
  `priceText()`.

---

## J. Advertising

### SH-086 · High · ✔ seen · [T] — The Advertise slideshow traps Back
- **Problem:** `/advertisement-slideshow` pushes `/advertisements` from its timer and from Skip, so Back lands on the
  slideshow, which moves forward again about 10 s later. Reached from the banner's "Advertise Now" and the "Advertise"
  tile.
- **Where:** `src/pages/AdvertisementSlideshow.tsx:42, 49`.
- **Fix:** `navigate("/advertisements", { replace: true })`.

### SH-087 · High · ✔ checked · [T] — `site_banners` is abandoned
- **Problem:** Super admins still edit vendor banners in Cosora-Admin › Content, but `VendorDashboardBanners` is mounted
  nowhere since `/dashboard` became a redirect (2026-11-14). `siteConfig.ts:229-235` still downloads the banners on
  every visit; Seller Home shows two hard-coded images instead.
- **Where:** `src/components/dashboard/VendorDashboardBanners.tsx`; `src/lib/siteConfig.ts`; Cosora-Admin
  `src/lib/siteContent.ts`.
- **Fix:** Mount it on Seller Home in place of SH-009's banner, or retire the admin page, table and snapshot.

### SH-088 · High · ✔ checked — Paid ad days run out during review
- **Problem:** `startsAt = now` and `endsAt = now + days` are set when the order is published; dates are frozen while
  `pending_review`. `approve_ad_campaign` refuses once expired, `sweep_ad_schedules` never expires
  `pending_review`/`changes_requested`, and `runStateOf` checks review first. A 3-day campaign paid on Friday and
  reviewed on Monday can never run, the money is kept (no `refund_review`), and the card says "waiting for review"
  forever. Pausing doesn't extend `ends_at` ("Pay only for what you use" is untrue).
- **Where:** `supabase/functions/_shared/adPricing.ts:188-189`; `approve_ad_campaign`; `sweep_ad_schedules`.
- **Fix:** Start the clock at approval; flag expired-before-review orders for refund.

### SH-089 · High · ✔ checked — "Changes needed" is a dead end
- **Problem:** `resubmitMyCampaign()` (`resubmit_ad_campaign`) has no caller; no screen edits a campaign;
  `MyCampaigns` offers pause/resume only. A campaign in `changes_requested` sits until its paid days are gone.
- **Where:** `src/lib/queries/ads.ts:180`; `Advertisements.tsx:1477`; admin `AdReviewQueue.tsx:194`.

### SH-090 · High · reviewer — "You were not charged" after a charge
- **Problem:** `razorpay-verify-payment` (and the webhook) mark the order `created → paid` before inserting campaigns.
  If the insert fails or the plan check now refuses, it returns `ok: false`: the order stays `paid` with no campaigns
  and no flag, no retry can claim it, and the page says "You were not charged. Please try again."
- **Where:** `supabase/functions/razorpay-verify-payment/index.ts:139-160`; `razorpay-webhook:75-101`;
  `Advertisements.tsx:1168-1169`.
- **Fix:** Insert and claim in one transaction (as `subscription_fulfil` does), or open a billing incident.

### SH-091 · Medium · reviewer — A second tap buys the campaign again
- **Problem:** After payment the form keeps its selections and Pay re-enables; `razorpay-create-order` creates a new
  order on every call.
- **Where:** `Advertisements.tsx:1175, 1533, 1621`.

### SH-092 · Medium · reviewer — "Your ads are live" when they aren't
- **Problem:** The demo and live paths say the ads are live and showing to buyers; every insert lands in
  `pending_review` (`guard_ad_activation`).
- **Where:** `Advertisements.tsx:1112-1113, 1165-1166`.

### SH-093 · Medium · reviewer — The seal and the certificate can't be bought
- **Problem:** Every paid plan has `has_verified_badge = true`, so `toggleAdType` refuses Trusted Seal (₹44) and Verified
  Certificate (₹199) as "included"; Free is refused for any ad (`no_ads_on_plan`). No plan creates a
  `certificate_orders` row, so no certificate is ever delivered, and the "Get verified" chip leads to a dead end.
- **Where:** `Advertisements.tsx:420`; `admin.ad_reach`.

### SH-094 · Medium · reviewer — The goal picker adds ad types that show nowhere
- **Problem:** "Visit your website" selects `websiteBanner` (slot deferred) and `googleProduct` (unplaced); "Message you"
  selects `directBroadcast` (unplaced): about ₹4,440 for one product over 30 days.
- **Where:** `GOAL_PLACEMENTS` in `Advertisements.tsx:99-104`; `src/lib/adSlots.ts:86`.

### SH-095 · Medium · ✔ seen (part) — Ads on listings that can't run, or aren't yours
- **Problem:** The product picker lists every status (seen: a listing under review offered); nothing on the server
  checks the product's status or owner. A rolled-back service insert of seller X's ad on seller Y's product
  succeeded; `active_ads` serves only live products, so such a campaign shows "Live" and never serves.
- **Where:** `useMyProducts` (`products.ts:637`); `_shared/adPricing.ts`.

### SH-096 · Medium · reviewer — The registration switch won't stop ads
- **Problem:** `admin.require_registered_seller` acts only when `current_user = 'authenticated'`; ads are inserted by
  the service role and no edge function calls `seller_registered`. `todo.md` says turning the switch on stops ads.
- **Fix:** Call `seller_registered()` in `razorpay-create-order` / publish.

### SH-097 · Medium · reviewer — `/old-advertisements` mislabels campaigns
- **Problem:** Rejected, suspended, admin-paused, changes-requested and approved-scheduled campaigns are filed as "In
  review", each with a Play button that fails ("only a paused campaign can be resumed").
- **Where:** `src/pages/OldAdvertisements.tsx:44, 82, 149`.

### SH-098 · Medium · reviewer — Ad serving doesn't scale
- **Problem:** `advertisements` has no index on status or end date; `active_ads` seq-scans every campaign ever sold with
  a per-row `is_ad_eligible` (not inlinable), on 7 buyer pages. Each impression updates the same newest ~12 rows
  (`impressions + 1`) plus two counts and an insert.
- **Where:** `src/lib/queries/ads.ts:444-446`.
- **Fix:** A partial index on live campaigns; batch impression counting.

### SH-099 · Low · reviewer — Smaller ad problems
- **Problem:** `ad_impression` never writes the events its cap counts (40 signed-out calls raised impressions by 40);
  delete (X) fails on every paid campaign (`log_ad_submission` + `guard_ad_deletion`); signed out or while loading the
  page says "Your current (Free) plan can't run ad campaigns" (`App.tsx:288`, no guard); "No subscriptions"
  (`:367`) and "Automatically finds and updates audiences" (`:710`) aren't true; the FAQ says ads can be stopped;
  the "Date Range" button (`:677`) does nothing.

---

## K. Messages

### SH-100 · High · ✔ seen — Every chat header shows an invented rating
- **Problem:** The thread header shows "★ 4.6 (0) · India · RFQ-NEW · New enquiry" for a real buyer, with initials
  taken from the account id; the real avatar is never shown.
- **Where:** `getOrCreateConversation` in `src/lib/chatData.ts:130-139`; `src/pages/ChatThread.tsx:276, 278, 314-315`.
  Rule: "A surface with no real reviews shows none"; "No mock data in production".

### SH-101 · Medium · ✔ seen — Signed out, the inbox is fake
- **Problem:** `/chat` signed out shows three seeded conversations with fake unread counts and avatars hot-linked from
  Unsplash; not limited to development.
- **Where:** `FALLBACK_CONVOS` in `src/pages/Chat.tsx:22, 94`; `chatData.ts:45`; no guard on `/chat`.

### SH-102 · Medium · ✔ seen — The back arrows loop
- **Problem:** The thread's ← pushes `/chat`; `/chat`'s ← does `navigate(-1)`, back to the thread. From Seller Home →
  a message → ← → ← lands on the thread again. "Delete chat" pushes the inbox, so the phone's Back reopens the deleted
  thread and recreates its row.
- **Where:** `ChatThread.tsx:254, 671`; `Chat.tsx:128-131`.

### SH-103 · Medium · reviewer — The seller's Call button can't reach the buyer
- **Problem:** The thread calls `useCallVendor` → `call_vendor_contact`, which raises `not_a_vendor` for a buyer: "Calling
  is unavailable — This account isn't a seller on Cosora." `useCallBuyer`/`call_buyer_contact` exists.
- **Where:** `ChatThread.tsx:287`; `src/lib/queries/calls.ts:262`.

### SH-104 · Medium · reviewer — A bad thread id fails silently
- **Problem:** For a nonexistent id, your own id or a non-uuid, the thread looks normal and Send does nothing (no
  toast). The "conversation no longer exists" screen can never show; `/chats/stylecraft-apparels` shows a seeded fake
  seller.
- **Where:** `ChatThread.tsx:54, 136`; `chat.ts:261, 277, 460`.

### SH-105 · Medium · reviewer — Opening a thread rewrites the conversation
- **Problem:** `upsertConversation` uses `ON CONFLICT DO UPDATE`, so every open writes a new row version, fires realtime
  to both people (two `chat_unread_counts` calls) and, on first open, creates an empty conversation in the other
  person's list (79 of 82 local conversations have no message).
- **Where:** `chat.ts:159-165`; `chatUnread.ts:60-61`.
- **Fix:** Read first; create on the first message.

### SH-106 · Medium · reviewer — The Calls tab never shows buyers' calls
- **Problem:** `fetchCalls` filters `buyer_id = me`, so a seller sees only calls they placed as a buyer.
- **Where:** `calls.ts:477`. Rule: vendor surfaces show a buyer's outgoing call as the vendor's inbound one.

### SH-107 · Low · reviewer — Smaller chat problems
- **Problem:** "View Buyer Profile" opens `/vendor/<buyerId>` → "Seller not found" (`ChatThread.tsx:208, 224`); names
  come from one `.in()` GET with every id and fall back to "User" past about 400 chats (`chat.ts:674-675`); names and
  previews in `/chat` and the thread header lack `data-no-translate` (`Chat.tsx:363, 368`; `ChatThread.tsx:272`).

---

## L. Reviews, Help and Photo Studio

### SH-108 · Low · reviewer — Reviews read whole tables in the browser
- **Problem:** `fetchVendorReviews` / `fetchVendorProductReviews` read every row and compute the average and breakdown
  in the browser (wrong past 1,000). Replies have no length limit in the reply functions or a CHECK. Sharing calls
  `navigator.share` directly instead of `<ShareSheet>`.
- **Where:** `src/lib/queries/reviews.ts:62-83, 180-202`; `ReviewLinkShare.tsx:57-66`.

### SH-109 · Low · ✔ seen — No page heading on Reviews and Help
- **Problem:** `/reviews` and `/help` have no `h1`.

---

## M. What this review did not cover

### SH-110 — Production was not compared
Everything was checked on the local copy. Some production changes were made in the SQL editor and are in no file
(SH-040 shows such drift exists), so production may differ. A read-only diff of tables, functions and policies needs
access to production.

### SH-111 — Edge functions were not run
The payment functions (`razorpay-create-order` returns 404 on the local stack), the Bunny upload URL and the
notification sender were not executed; the payment findings come from reading their code.

### SH-112 — No 10,000-user load test
The scale findings come from query timings and reading the code. `scripts/load/marketplace.k6.js` was not run.

### SH-113 — Two features were not completed end to end
Video Closeup upload (no encoder here; the browser recorder gave an empty file) and ad payment (SH-111). Photo Studio
has only mailto links, so nothing to save.

---

## What works (checked)

- Every Seller Home link lands on the right page and Back returns home with the scroll kept.
- Registration writes the profile, three documents, the first product (price with paise), the premises photo, the
  contract and the registration in one transaction; role and registered flag are set.
- Upload publishes a listing under review and the plan limit is explained before the form; editing a live listing
  sends it back to review; deleting a product removes its files.
- About Us, website, private email and social links save to the right columns and the stored score equals
  `vendor_profile_score_of()`.
- Quotes: closed, expired, own and not-entitled overseas requests are refused on insert; a double tap saves one quote.
- Catalogue Free limit is enforced in the database; review replies, chat replies, "Read all", feedback tickets and sign
  out all work.
- The chat monitoring notice is on every chat surface; chat database rules (membership, blocks, flags, status) hold.
- Help with the support rollout Off gives phone, email, fraud reports and feedback; Photo Studio is an honest "Coming
  soon".

---

## Appendix A. What was audited

### A1. Documents and context read

| Source | How it was used |
|---|---|
| `documentation/claude.md` | Read directly (project rules); reviewers searched the rest for their features |
| `cosora.md`, `todo.md` | Read in full |
| `documentation/sides.md` (Vendor section) | Vendor colour rule, vendor UI constraints |
| `documentation/securityflags.md`, `documentation/ToDo.md` | Searched for every feature in scope (open flags, known bugs) |
| `documentation/ranking.md` | Lead and seller ranking rules (Fit, Standing) |
| `documentation/advertising-v3-session-report.md` | Ad placement and payment design |
| `documentation/help-feature-plan.md` | Help & Support decisions (D-xx) |
| `documentation/technicalimplementation.md`, `test.md`, `sitemap.md` | Searched for Seller Home, role-on-load and lead rules |
| Knowledge graph (`graphify-out/graph.json`) | Queried before reading code ("vendor dashboard home screen…", "SellerHome page seller-home route…", "after seller registration submit: welcome popup, nudge, banner…"); each reviewer queried for its own group |
| Earlier audits | `subscription-session/SESSION-CONTEXT.md` (vendor onboarding audit 2026-11-13, buyer onboarding audit 2026-11-14) |

The 1.1 MB `changelog.md` was not read line by line.

### A2. Screens and features

| Area | Routes | Main code |
|---|---|---|
| Registration hand-off | `/onboarding` (welcome screen), `/seller-home` | `Onboarding.tsx`, `RegisteredVendorGate.tsx`, `RegistrationBanner.tsx`, `sellerRegistration.ts` |
| Seller Home | `/seller-home` | `SellerHome.tsx`, `BusinessProfileScore.tsx`, `SellerQuickActionsGrid.tsx`, `vendorDashboard.ts` |
| Shell | every seller page | `DashboardLayout.tsx`, `DashboardHeader.tsx`, `DashboardSidebar.tsx`, `MobileBottomNav.tsx`, `RoleSwitcher.tsx`, `useSwitchRole.ts`, `UserRoleContext.tsx`, `TierGate.tsx` |
| Notifications | `/notifications` | `Notifications.tsx`, `notifications.ts`, `notificationsStore.ts` |
| Profile score and tiles | `/business-profile-score`, `/business-profile?focus=…`, `/add-social-links` | `BusinessProfileScorePage.tsx`, `BusinessProfile.tsx`, `AddSocialLinks.tsx`, `vendorStore.ts` |
| Products | `/upload`, `/upload?id=`, `/products` | `Upload.tsx`, `DynamicFormFields.tsx`, `Products.tsx`, `products.ts` |
| Video Closeup | `/upload-video` | `UploadVideo.tsx`, `videos.ts` |
| Catalogues | `/upload-catalogue` | `UploadCatalogue.tsx`, `catalogues.ts` |
| Leads and quotes | `/leads`, `/quotes`, `/analytics` | `Leads.tsx`, `OpenRfqLeads.tsx`, `DirectQuoteRequests.tsx`, `Quotes.tsx`, `Analytics.tsx`, `rfqs.ts`, `vendorAnalytics.ts` |
| Advertising | `/advertisement-slideshow`, `/advertisements`, `/competitor-ads`, `/old-advertisements` | `AdvertisementSlideshow.tsx`, `Advertisements.tsx`, `CompetitorAds.tsx`, `OldAdvertisements.tsx`, `ads.ts`, `payments.ts`, `adSlots.ts`, `VendorDashboardBanners.tsx`, `siteConfig.ts`; Cosora-Admin `siteContent.ts` |
| Messages | `/chat`, `/chats/:id` | `Chat.tsx`, `ChatThread.tsx`, `chat.ts`, `chatUnread.ts`, `chatData.ts`, `calls.ts` |
| Reviews, Help, Studio | `/reviews`, `/help` (+ `/help/*`, `/feedback`), `/cosora-studio` | `Reviews.tsx`, `reviews.ts`, `ReviewLinkShare.tsx`, `Help.tsx`, `AppFeedback.tsx`, `CosoraStudio.tsx` |

### A3. Database objects

| Feature | Tables | Functions, triggers, policies |
|---|---|---|
| Registration | `vendor_profiles`, `vendor_registrations`, `vendor_documents`, `vendor_contracts`, `vendor_premises_photos`, `contact_consent` | `submit_vendor_registration`, `my_seller_registration`, `seller_registered`, `trg_vendor_profiles_registration_guard`, `trg_0_registered_seller`, `trg_hold_until_registered` |
| Home counts and lists | `products`, `product_images`, `product_videos`, `rfqs`, `quotes`, `conversations`, `conversation_member_state` | `rfqs_select`, `blocked_with_me`, `my_overseas_tier`, `vendor_quoted_rfq`, `match_vendor_rfqs`, `admin.rfq_fit`, `my_vendor_private` |
| Profile score | `vendor_profiles`, `reviews`, `vendor_capacity` | `vendor_profile_score_of`, `trg_vendor_profiles_zz_profile_score`, `admin.vendor_score_refresh`, `trg_products_vendor_score`, `sync_vendor_rating` |
| Plans | `subscription_plans`, `vendor_subscriptions`, `feature_flags` | `get_vendor_plan`, `vendor_entitlements`, `admin.vendor_effective_plan`, `enforce_product_cap`, `enforce_catalogue_plan` |
| Products | `products`, `product_images`, `product_documents` | `enforce_products_moderation`, `admin.listing_edit_rereview`, `product_images_rereview`, `product_documents_cap`, `pimages_*` / `pdocs_*` policies, `increment_product_enquiry` |
| Video and catalogues | `product_videos`, `catalogues`; buckets `product-videos`, `catalogues` | bucket MIME lists, catalogue review, `enforce_catalogue_plan` |
| Leads and quotes | `rfqs`, `rfq_submissions`, `quotes`, `engagement_events` | `enforce_quote_rfq_open` / `trg_quotes_accepting_rfq`, `trg_quotes_update_roles`, `enforce_lead_cap`, `my_quoted_rfqs`, `admin.lead_alert_fanout`, `my_lead_alerts`, `vendor_buyer_geography` |
| Advertising | `advertisements`, `ad_orders`, `site_banners`, `certificate_orders` | `active_ads`, `is_ad_eligible`, `ad_impression`, `ad_click`, `approve_ad_campaign`, `resubmit_ad_campaign`, `sweep_ad_schedules`, `guard_ad_activation`, `guard_ad_deletion`, `admin.ad_reach`, `ad_category_benchmarks`; edge functions `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook` (read, not run) |
| Messages | `conversations`, `messages`, `conversation_reads`, `conversation_member_state`, `calls` | `chat_unread_counts`, `mark_conversation_read`, `guard_message_insert`, `chat_blocked_between`, `chat_block_state`, `call_vendor_contact`, `call_buyer_contact` |
| Notifications | `notifications` | `notify`, `trg_notifications_update_columns`, the realtime publication |
| Reviews and help | `reviews`, `product_reviews`, `support_tickets` | `reply_to_review`, `reply_to_product_review`, `guard_review_write` |

### A4. Back-button and navigation checks

Every Seller Home link followed by Back; Seller → Buyer switch then Back; the Advertise slideshow then Back twice;
`/business-profile-score` opened from a link then its back arrow; chat thread arrows; sign out then Back; history
after registration (Forward).

---

## Appendix B. Browser test output

All runs: Vite dev of `main` on `http://localhost:8097` against the local stack (`VITE_SUPABASE_URL=http://127.0.0.1:54321`),
Chromium through Playwright. No console errors apart from React Router's two v7 future-flag warnings unless noted.

### B1. Registration and the welcome screen (3 sellers)
- The 9-step form submitted in each run; the welcome screen read "The Good Times Start Now. Welcome to Cosora".
- `stillWelcomeAfter4s: true`: it doesn't move on by itself; a tap anywhere opens `/seller-home`.
- After the tap: URL `/seller-home`, `history.length` 13, `history.state.idx` 0.

### B2. Seller Home first load (fresh seller, 390 × 844)
23 requests to the local API on load:
```
POST rpc/get_vendor_plan                 POST rpc/vendor_entitlements
GET  notifications (limit 100)           GET  vendor_profiles (brand_name, city)
HEAD products (all)                      HEAD products (live)
HEAD products (under_review)             HEAD product_videos
HEAD rfqs (active, open, not expired, not own)
HEAD quotes (all)                        HEAD quotes (accepted)
POST rpc/chat_unread_counts              GET  products (full list with images)
GET  rfqs (full open list)               GET  conversations
GET  conversation_member_state           GET  products (enquiries_count, all rows)
GET  vendor_profiles (score columns)     POST rpc/my_vendor_private
GET  quotes (rfq_id, all)                POST rpc/chat_unread_counts (again)
POST rpc/match_vendor_rfqs               GET  storage (a lead picture)
```
Page text: "Dashboard · Welcome back! Here's an overview of your business"; score ring 22%; Analysis "Live Products 0 ·
1 under review", "Open Leads 120", "Inquiries 0", "Your Quotes 0 · 0 accepted".

Score ring sampled every 60 ms on a reload: `0%, 0%, 0%, 22%, 22%, 22%, 22%, 22%`.

### B3. Every home link, then Back (fresh seller, 390 × 844)

| Clicked | Landed on | Page heading | Back returned to | Scroll before → after |
|---|---|---|---|---|
| Bell | `/notifications` | Notifications (count includes 4 development-only samples) | `/seller-home` | 0 → 0 |
| INCREASE SCORE | `/business-profile-score` | Business Profile Score | `/seller-home` | 0 → 0 |
| Business Profile | `/business-profile` | (store name) | `/seller-home` | 0 → 0 |
| Advertise | `/advertisement-slideshow` | — | `/seller-home` | 0 → 0 |
| Add Products | `/upload` | Upload Product | `/seller-home` | 0 → 0 |
| Reviews | `/reviews` | (none) | `/seller-home` | 0 → 0 |
| My Quotes | `/quotes` | Quotation Requests | `/seller-home` | 0 → 0 |
| Add Website | `/business-profile?focus=contact-details` | (store name) | `/seller-home` | 0 → 0 |
| Add Social Links | `/add-social-links` | Social Links | `/seller-home` | 0 → 0 |
| Upload Catalogue (tile) | `/upload-catalogue` | Upload Catalogue | `/seller-home` | 0 → 0 |
| Help/Connect | `/help` | (none) | `/seller-home` | 70 → 443 |
| Photo Studio | `/cosora-studio` | Cosora Studio | `/seller-home` | 443 → 443 |
| Add Email | `/business-profile?focus=contact-details` | (store name) | `/seller-home` | 443 → 443 |
| Video Closeup | `/upload-video` | Upload Video Closeup | `/seller-home` | 443 → 443 |
| Upload Catalogue (card) | `/upload-catalogue` | Upload Catalogue | `/seller-home` | 443 → 443 |
| Analysis › View All | `/analytics` | Analytics | `/seller-home` | 934 → 934 |
| View Leads | `/leads` | Leads | `/seller-home` | 934 → 934 |
| Add a product | `/upload` | Upload Product | `/seller-home` | 934 → 934 |
| Top products › View All | `/products` | Products | `/seller-home` | 934 → 934 |
| Add New Product | `/upload` | Upload Product | `/seller-home` | 956 → 1345 |
| Browse Quotes | `/quotes` | Quotation Requests | `/seller-home` | 1345 → 1345 |
| Recent Leads › View All | `/leads` | Leads | `/seller-home` | 1345 → 1345 |
| A Recent Lead card | `/leads` (not the lead) | Leads | `/seller-home` | 1345 → 1345 |
| Send a quote | `/leads` (not the lead) | Leads | `/seller-home` | 1345 → 1345 |
| Boost › advertise | `/advertisement-slideshow` | — | `/seller-home` | 0 → 0 |
| View All Messages | `/chat` | Messages | `/seller-home` | 2126 → 2126 |
| View Competitor Ads | `/competitor-ads` | Category Benchmarks | `/seller-home` | 2126 → 2126 |
| Bottom bar | `/seller-home`, `/products`, `/upload`, `/chat`, `/my-store` | Home, Products, Upload, Chats, My Store | `/seller-home` | — |

No page errors on any of them.

### B4. Back-button tests
- **Seller → Buyer → Back:** URL `/seller-home`; sidebar "SWITCH MODE · Buyer (active) · BUYER MENU · New Arrivals · For
  You…"; header "Buyer / Seller" with the buyer search placeholder (screenshot 08).
- **Advertise slideshow:** `/advertisement-slideshow` → (10 s) `/advertisements`; Back → `/advertisement-slideshow`;
  11 s later → `/advertisements`; Back → `/advertisement-slideshow`.
- **Profile score page opened from a link:** back arrow → `about:blank`.
- **Chat thread arrows (demo seller):** thread ← → `/chat`; ← → `/chats/1111…`; ← → `/chat`.
- **Sign out (1440 × 900):** → `/`; Back → `/seller-home` showing the signed-out dashboard; 0 auth keys left in storage.

### B5. Header and phone menu
- Phone search icon tapped: URL stayed `/seller-home`.
- Laptop search box clicked: `/search` (the buyer marketplace: "Home, here's what's live", other sellers' listings).
- Phone menu: the Sign Out button sits at y 797 (34 px tall); the bottom bar starts at y 771; the element at the
  button's centre is the bottom bar, and the click timed out.

### B6. Signed-out pages
- `/seller-home`: "Dashboard · Welcome back! Here's an overview of your business … 45% … Live Products 0 · 0 under
  review · Open Leads 0 …".
- `/chat`: "Messages · 3 Conversations · 1 online · StyleCraft Apparels … Premium Fabrics Co … Urban Threads"; avatars
  from `images.unsplash.com`.

### B7. Business Profile Score deep links

| Link | From the score page (after 2.2 s) | Direct load (after 2.2 s) |
|---|---|---|
| `contact-details` | in view | scrolled to 326, in view |
| `about-us` | in view | scrolled to 90, in view |
| `business-category` | sheet "Add Business Categories" open | sheet open |
| `office-pictures` | not yet in view | scrolled to 2047, in view |
| `year-established`, `employees`, `turnover` | sheet open (a plain `div`, not a dialog) | sheet open |
| `detailed-information` | not yet in view | scrolled to 1340, in view |

Re-sampled every 700 ms from the score page: `office-pictures` scrolled at about 2.8–3.5 s (y 0 → 2242) and
`detailed-information` likewise (y 449 → 1552). They work, late.

### B8. Plan limits (fresh seller with 2 listings)
- Home: "Live Products 0 · 2 under review"; menu "2/2 products used".
- `/upload`: "You've used all 2 product listings on your current plan. You can still save drafts — upgrade to publish
  more. Upgrade →".
- `/upload-catalogue`: "… Vendors with catalogues get 3× more inquiries on average. Your Free plan includes 1 PDF
  catalogue. Paid plans add as many as you like."
- `/products`: "Second Review Shirt ₹ 300 / Piece … Review Cotton Kurta ₹ 451 / pieces … 60% Score · Under review".

### B9. Sending a quote
- The quote form on `/leads` is inline: "Price / unit (₹)", "MOQ", "Lead time (e.g. 20 days)", "Comment (optional)".
- Home before: "Your Quotes 0"; first lead "New · Send a quote".
- Filled 250.50 / 50 / 20 days and double-clicked Send: "Quote submitted — The buyer will see it in My Quotes."
- Back: `/seller-home`, "Your Quotes 0", first lead "Quoted · View quote". After a reload: "Your Quotes 1".
- Database: 1 quote, price 250.50, MOQ 50, lead time "20 days"; the stored profile score stayed 22.

### B10. Messages and notifications (demo seller `2222…`)
- Home Recent Messages: "Local Buyer · probe… · 27d", "Extra One · not yours · 33d", "Second Buyer · Start the
  conversation · 33d". Bell: "Notifications, 100 unread" (109 rows).
- Thread `/chats/1111…`: "11 · Local Buyer · Offline · 4.6 (0) · RFQ-NEW · New enquiry · This chat is under review…
  · For your safety, Cosora will be monitoring the messages in this chat."
- `/notifications`: "Notifications 104 … 2 new requirements match your domains" (the 4 extra and the spotlight are
  development-only samples).

### B11. Using every feature end to end (seller `home-c`)

| Feature | Steps | Output |
|---|---|---|
| Upload a listing | Add Products tile → Fashion Accessories → Continue → Bags → Details → Images → Pricing → Publish | First two tries refused at Publish: "Add a country of origin before publishing — It's required on every listing. Or use Save as Draft…". Details' Continue needed only the name. With Country of Origin picked: "Product submitted for review — It becomes visible to buyers once approved (24–48h)." → `/products`; home "2 under review"; menu "2/2 products used" |
| Details fields shown | — | Product Name*, Category, SKU, Description, Bag Type*, Material*, Dimensions, Closure Type, No. of Compartments, Available Colors, Minimum Order Quantity*, Lead Time*, Location / Origin*, Country of Origin*, Customization Available?, Certifications |
| Edit a live listing | Top Performing row "E2E Canvas Tote · 0 inquiries · ₹800 · 0 views" → `/upload?id=…` → price 849.25 → Save Changes | "Product updated — Resubmitted for review (24–48h)." → `/products` |
| About Us | Sheet → text → Save | "About Us updated" |
| Website and email | Contact sheet → website, email → Save | "Contact details updated" |
| Score | Home after the two saves, then after social links | 29 → 37 → 43 (live listing back to review −7; About +8; website +7; social +6) |
| Social links | Fields: Facebook, X, LinkedIn, YouTube, Instagram, Website; an Instagram link typed in the first box → Save Social Links | "Social links saved" |
| Catalogue | Upload a PDF, then a second | First: "Catalogue uploaded! It'll go live after review (24–48 hours)." listed "Under Review · All Buyers". Second: "The Free plan includes 1 PDF catalogue — Upgrade to Basic or above to add more." then `/subscription` |
| Review reply | `/reviews` ("Your current rating is GOOD 4/5 · Reviewed by 1 Users") → Reply | "Reply posted successfully!" |
| Notifications | Bell "2 unread" → Read all | Bell cleared |
| Feedback | `/feedback` → text → Send feedback | "Thanks. The team reads every note. We've recorded it as CS-001051." |
| Analytics | `/analytics` | "Every figure here is counted from your real rows… Total Views Lifetime 0 · Inquiries Lifetime 0 · Conversion — no views recorded yet · Active Products 0 · 2 not live · Total Order Value…" |
| Chat reply | Home Recent Messages "Local Buyer · Hello, can you make 500 canvas totes?" → thread → "Message" box → Enter | Message shown; the home row then read "Yes, we can make 500 totes in 20 days. · now" |
| Unread badge | A new buyer message | Bottom bar "1 Chats" (`chat_unread_counts` = 1); the home row shows no unread marker |
| Video Closeup | Browser-recorded WebM | The input accepts `video/mp4,video/webm`; the recorder produced 111 bytes; Publish → "Add a caption for your video closeup". The page says "Video Closeups get 5× more reach". Not completed |
| Advertising | Silver plan granted locally; `/advertisements` | Product picker lists "E2E Canvas Tote ₹849" and "Registration Kurta ₹451" (under review); "Pay & Publish · ₹154" → `404 /functions/v1/razorpay-create-order` (not served locally). Not completed |
| Sign out | Laptop menu | See B4 |

---

## Appendix C. Database check output

Local stack, `psql` as `postgres`. "As seller" means `set local role authenticated` with that seller's JWT claims,
inside a transaction that was rolled back.

### C1. Local data and switches
- `vendor_profiles` 5,784 rows (5,626 onboarded); open requirements 120; products 1,772; `site_banners` 0.
- Every feature switch is off on the local stack (16, including `seller_registration_required`,
  `overseas_seller_registration`, `lead_alerts`, `crm` and `subscription_checkout`).
- Plan limits: Free 2 products / 1 catalogue; Basic 10 / unlimited; Silver 19 / unlimited; Gold 200 / unlimited;
  VIP unlimited.

### C2. A seller right after registration
```
profiles                active_role seller, onboarded true
vendor_profiles         onboarding_complete true, profile_score 22 (= vendor_profile_score_of 22),
                        category {"Garment Manufacturer"}, business_type Manufacturer, primary_type manufacturer,
                        office_photos 0 (the photo waits for review)
vendor_registrations    registered
products                under_review, price 450.75
vendor_premises_photos  under_review
vendor_documents        pan / business_registration / aadhaar, verified false
notifications           0 rows
vendor_contracts        1
```

### C3. Query cost as a seller (120 open requirements)
```
count of open requirements            Index Scan rfqs_open_expires_idx, 120 rows, 16.4 ms
full open-requirement list            Index Scan rfqs_open_expires_idx, 120 rows, 12.5 ms
match_vendor_rfqs(seller, 200)        121 rows, 26.0 ms
count without / with blocked_with_me  11.7 ms / 21.8 ms
```
`rfqs_select` (SELECT):
```
((status = 'active') AND ((vendor_id IS NULL AND (NOT overseas OR (SELECT my_overseas_tier()) = 'vip'
  OR ((SELECT my_overseas_tier()) = 'gold' AND (overseas_vip_until IS NULL OR now() >= overseas_vip_until))
  OR vendor_quoted_rfq(id))) OR vendor_id = (SELECT auth.uid()))
  AND NOT blocked_with_me(buyer_id))
OR buyer_id = (SELECT auth.uid()) OR (SELECT is_admin())
```
`blocked_with_me`, `vendor_quoted_rfq` and `my_overseas_tier` are STABLE, SECURITY DEFINER, `search_path=""`, so
Postgres never inlines them.

Indexes present: `rfqs_open_expires_idx`, `rfqs_open_marketplace_idx`, `rfqs_vendor_id_status_idx`, `rfqs_buyer_idx`,
`quotes_vendor_idx`, `quotes_rfq_id_vendor_id_key`, `products_vendor_idx`, `products_live_vendor_recent_idx`,
`conversations_user_a_user_b_key`, `conversations_user_b_idx`, `notifications_inbox_idx`, `notifications_unread_idx`.

### C4. Rules probed with rolled-back writes
- **Quote on a closed request (SH-075):** before `closed | accepted | 250.00`; as its seller
  `update quotes set price_per_unit = 1.00 …` returned `1.00 | pending`, `UPDATE 1`.
- **Who viewed me (SH-077):** as seller `ce886e12…`, `engagement_events` joined to `profiles` returned
  `product_view | has_name true` for 3 rows.
- **Server-owned columns:** the owner's UPDATE of `products.enquiries_count` was ignored (reviewer).

### C5. Structure checks
- `catalogues` columns: `id, vendor_id, title, description, cover_url, file_url, page_count, status, created_at,
  rejection_reason` — no visibility (SH-071).
- Bucket `product-videos` allows `{video/mp4, video/webm, image/jpeg, image/webp}`, while `UploadVideo.tsx:773` accepts
  `image/jpeg,image/png,image/webp` (SH-068). Bucket `catalogues` is public.
- `KIND_META` keys: account_suspended, support_reply, support_status, support_callback, support_receipt,
  account_reinstated, chat_locked, chat_resumed, kyc_approved, kyc_rejected, review_removed, subscription_changed,
  subscription_canceled, refund_requested, refund_processed, autopay, plan_expiring, plan_lapsed, listings_paused,
  listings_resumed, lead_match, rfq_review, crm_follow_up, account_manager_message, account_manager_note.
  Most frequent kinds locally: support_receipt 381, billing_incident 177, plan_lapsed 147, listings_paused 147,
  support_status 101, support_callback 98, subscription_changed 66, refund_requested 57, support_reply 52,
  product_approved 50 (SH-034).
- `trg_notifications_update_columns`: 1 trigger live; no file contains `enforce_notification_update_columns` (SH-040).
- `resubmitMyCampaign` (`ads.ts:180`) has no caller; `Advertisements.tsx` never mentions `changes_requested`;
  `sweep_ad_schedules` doesn't handle `pending_review` (SH-089, SH-088).
- `VendorDashboardBanners` is imported nowhere (SH-087).
- No buyer-facing reader of `vendor_profiles.social` in `VendorProfile.tsx` or the buyer components (SH-044).
- `vendor_profile_score_of()` has the same 15 signals and weights as `PROFILE_SCORE_WEIGHTS`.

### C6. After the end-to-end run (seller `home-c`)
```
products       E2E Canvas Tote | under_review | 799.50 | country India | moq "2" | location (empty) | attributes {} | 1 image
storage        3 objects in product-images for the seller
after edit     under_review | 849.25
profile        about "We knit cotton fabrics and make tote bag…" | website https://e2e-review.example
               | social {"facebook": ["https://instagram.com/e2ereview"]} | profile_score 43 = vendor_profile_score_of 43
private        owner_email sales@e2e-review.example
catalogues     1 row "E2E Catalogue One" under_review; 1 file (the refused second left none)
reviews        reply_body "Thank you for the kind words.", replied_at set
notifications  2 of 3 read (the third arrived after "Read all")
```

### C7. The local copy is current
A function from each migration since 2026-11-01 exists locally: `20261105100000` (`enforce_product_cap`),
`20261113100000`–`100900` (`sync_vendor_country_code`, `reg_fail`, `require_registered_seller`, `require_admin_role`,
`viewer_trade_buyer`, `vendor_profiles_registration_guard`), `20261114100000`–`110000` (`buyer_terms_version`,
`buyer_profiles_field_checks`, `is_real_seller`, `admin_email_verified`, `profiles_signup_owned`,
`overseas_lead_count`), `20261115110000` (`top_vendors`), `20261115120000` (`increment_product_view`). Presence only;
bodies were not diffed.

---

## Appendix D. Reviewer output

Six read-only reviewers, one per feature group. Each was told to query the knowledge graph first, cite file:line or
SQL for every finding, and skip anything already in `todo.md`. Their findings are SH-030 to SH-109 above. What each
confirmed works:

- **Shell and notifications:** the store name reads the seller's own row (5-minute cache); plan-gated menu items use
  the same keys as each page's gate; the plan chip comes from `get_vendor_plan` (coalesced guard); sign out awaits and
  reports failure; `canPublish()` mirrors `seller_registered()`; notifications are owner-only for read, update and
  delete, `notify()` is service-role only, every kind in `KIND_META` has a real writer, and the inbox uses
  `notifications_inbox_idx` (8.9 ms over 390 rows); `chat_unread_counts` is owner-scoped.
- **Profile score and tiles:** one formula, and the trigger replaces any client value; 0 of 5,785 stored scores are
  stale; reviews, approved premises photos, product insert/delete/status and quote insert/delete all rescore; all
  eight `?focus=` targets exist; saves go through `writeOwnVendorRow`; private columns are read through
  `my_vendor_private`; saves invalidate `["vendor_dashboard"]`.
- **Products, videos and catalogues:** the product limit holds under its lock and is explained before the form; edits
  of live listings go back to review and the UI says so; product delete removes its files; video delete removes the
  Storage file, the Bunny video and the row; the Free catalogue limit is enforced under a lock; server-owned column
  guards hold; the registration gate is on all three tables; storage writes stay in the owner's folder.
- **Leads, quotes and Analytics:** Inquiries are real (`increment_product_enquiry`, once per account, listing and
  day); home counts equal the lists under 1,000 rows; closed, past-deadline, own, other sellers' and not-entitled
  overseas requests are refused on insert; double submits are harmless; Total Order Value has one source; lead alert
  fan-out applies age, blocks, overseas rules and standing; `vendor_buyer_geography` keeps its 3-viewer floor.
- **Advertising:** prices and discounts are computed on the server; payment never approves an ad; plan reach is held on
  the server; RLS and the counter and status triggers hold; pause/resume is offered only where allowed; rejection
  reasons show as labels; `/my-payments` converts paise correctly; the seal shown matches `trustSealFromParts`;
  `ad_click` counts once per viewer per day; `ad_category_benchmarks` returns only anonymous totals to the seller.
- **Messages, reviews, help, studio:** the monitoring notice is on every chat surface; message insert checks
  membership, an active chat and an active account; block, flag and status triggers hold; realtime per open thread
  reaches only the two people; reviews keep four states, and reply functions check the owner and blocks; Help with the
  rollout Off gives phone, email, fraud reports, feedback and My requests; Photo Studio stores nothing.

---

## Appendix E. Screenshots

All in `cosora testing/.playwright-mcp/home-review/`.

| File | Shows |
|---|---|
| `01-welcome.png` | The welcome screen after registering (no button) |
| `02-home-loading.png` | Seller Home on a phone during load |
| `03-home-mobile.png` | Seller Home on a phone, full page (coral accents, banner, cards) |
| `04-sidebar-mobile.png` | The phone menu, with Sign Out under the bottom bar |
| `05-home-desktop.png` | Seller Home on a laptop (duplicated banner headline, empty gaps) |
| `06-seller-search.png` | The header search opening the buyer marketplace |
| `07-signed-out-home.png` | Seller Home signed out (45%, "Welcome back!") |
| `08-back-after-switch.png` | The seller dashboard inside the buyer shell after Back |
| `10-upload-at-cap.png` | Upload at the Free limit |
| `11-upload-catalogue.png` | Upload Catalogue for a Free seller |
| `12-products.png` | Products with rounded prices |
| `13-quote-form.png` | The inline quote form on Leads |
| `14-thread.png` | The chat header with the invented rating |
| `15-notifications.png` | Notifications for the demo seller |
| `16-focus-office-pictures.png`, `16-focus-detailed-information.png` | Score deep links after they scrolled |
| `17-signed-out-chat.png` | The fake signed-out inbox |
| `20-after-upload.png` | Upload refused for Country of Origin |
| `21-catalogue.png` | The catalogue page after the limit |
| `22-analytics.png` | Analytics for a new seller |
| `23-ad-checkout.png` | The ad builder before checkout |

---

## Appendix F. Clean-up

- The three test sellers (`home-a`, `home-b`, `home-c`) were deleted with their profiles, registrations, contracts,
  products, quotes, catalogues, reviews, conversations and messages, subscription, notifications and support ticket;
  the checks returned 0 rows and 0 storage objects left for each.
- The product added by SQL to reach the Free limit, the seeded buyer chat, review and notices, and the local Silver
  plan went with the seller that owned them.
- The dev server was stopped, and the test scripts (which held local sessions or a local password) were deleted. Only
  the screenshots remain.
- Nothing was written to production, and nothing was committed or pushed.
