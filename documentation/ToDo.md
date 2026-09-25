# ToDo
Tasks Andy wants to come back to later. Entries are added only when explicitly asked
for during a session (e.g. "add this to the todo", "note this for later", "todo: ...",
"remind me to...") — but once asked, the full entry below is written automatically,
with no need to dictate format, context, or reference each time.

## Open

### <short task title> — added YYYY-MM-DD
- Task: plain description of what needs to be done
- Context: why this came up, what it depends on or relates to, and any detail needed
  to pick this up cold later without re-reading the original conversation
- Reference: which session/conversation this came from — the date, roughly what was
  being worked on at the time, and the prompt or exchange that triggered it
- Priority: (only if stated or obviously implied — otherwise omit)
- Status: Open

### Configure the embedding_alert_webhook_url Vault secret — added 2026-09-10
- Task: configure the `embedding_alert_webhook_url` Vault secret so CRITICAL pipeline alerts
  reach a human outside the app.
- Context: `notify_embedding_alert_webhook()` (added in MP7, wired into
  `record_embedding_pipeline_health()`) already POSTs a CRITICAL-only alert to whatever URL
  this secret holds, and fails safe (no-ops) when it's missing — which it currently is,
  confirmed live. Needs a human to pick a destination (Slack/Discord/PagerDuty/internal
  webhook) and run `select vault.create_secret('<url>', 'embedding_alert_webhook_url', '...')`
  in the Supabase SQL Editor. No code or redeploy required once that's done. Until it exists,
  a CRITICAL failure (like the original 3-day silent outage) is only visible to someone who
  opens the app or checks Supabase's cron logs.
- Reference: Master Prompt 8 (2026-09-10), Part 2 — logged for a human rather than decided in
  code. Reformatted into this file's own template by Master Prompt 9 (2026-09-16); wording
  otherwise unchanged.
- Priority: High
- Status: Open
- [ ] Route applyPendingSignupProfile failures to the same alert channel as the embedding webhook, once that channel exists — Added: 2026-09-11 — Context: `applyPendingSignupProfile()` (`src/lib/queries/signupProfile.ts`) moves a new user's brand name / business details from auth metadata into `vendor_profiles` / `profiles` on every sign-in path (Register, Login, AuthCallback). It is non-blocking by design and its failure path only reaches `console.error` (with user id and role), so a persistent failure would silently lose every new vendor's brand name with no operator-visible signal. Deliberately NOT given its own alerting in Master Prompt 8, Phase 7: the project already has one "must not go unnoticed" precedent — `notify_embedding_alert_webhook()` / `record_embedding_pipeline_health()` and the `embedding_alert_webhook_url` Vault secret (entry above). When that destination is configured, have this failure path report through the same channel (e.g. a small RPC that records the failure and calls the same notifier) rather than inventing a second one. Reference: Master Prompt 8 (2026-09-11), Phase 7 item 3.
- [ ] Decide which of the five controls removed from the product page should come back as real features — Added: 2026-09-11 — Context: Master Prompt 8, Phase 6 removed them from `/product/:id` because none did anything: "Add Fabric" and "Download PDF" (spec sheet) had no onClick; "Translate" (description) had no onClick; the review "Helpful?" thumbs tally was component state written nowhere; the review ⋮ menu had no onClick. Each needs a spec before it returns: Helpful needs a `review_helpful_votes` table + RLS + write path (additive schema); ⋮ would most plausibly be "Report review", which needs a moderation path for product reviews; Download PDF needs a real spec-sheet generator; Translate needs a translation provider; "Add Fabric" has no defined meaning yet. Reference: Master Prompt 8 (2026-09-11), Mitra chose "remove all five" over wiring or building them in a bug-fix pass.

- [ ] Build a real trends data source for /home/trends — Added: 2026-09-11 — Context: The Trends page's category chips, featured images, curated looks and suggested searches are hand-picked editorial content; there is no trends job, no Google Trends integration and no search-volume log feeding it. Master Prompt 7 (buyer-trust thread, Phase 3) relabelled the page "Curated trend picks" and removed everything that posed as measured data (invented "↑ 800%" search-growth figures, a "Top Brands" list of invented names, USD prices). A real pipeline needs a source — the closest existing one is `engagement_events` rows with `event_type = 'search_impression'` and `query_text`, or an external trends API — plus a scheduled job and a table the page reads; only then should "trending" copy come back. The curated images are also still hotlinked from picsum.photos and need owned replacements. — Reference: 2026-09-11, Master Prompt 7 Phase 3.3, which asked for this to be logged as a future feature rather than built.

- [ ] Create the test-credential secrets in GitHub so the E2E workflow can sign in — Added: 2026-09-11 — Priority: High — Context: Master Prompt 8, Phase 1 moved every test password out of source. `.github/workflows/e2e.yml` now maps seven repository secrets into the Playwright step: `DEMO_BUYER_PASSWORD`, `DEMO_VENDOR_PASSWORD`, `DEMO_ADMIN_PASSWORD`, `MP_VENDOR_PASSWORD`, `MP5_LINK_PASSWORD`, `TEST_VENDOR_PASSWORD`, `FIXTURE_PASSWORD`. None exists yet, so every spec that needs a login skips in CI. The values are in the local gitignored `.env` (never paste them anywhere else). Second half of the same gap: the specs also read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from `.env` with `readFileSync`, which CI does not have, so they need those as secrets too, and the specs need to read `process.env` first, as `scripts/lib/test-credentials.mjs` already does. Reference: Master Prompt 8 (2026-09-11), Phase 1 step 4.
- [ ] Stop the public vendor profile inventing a vendor's missing identity and contact details — Added: 2026-09-11 — Priority: High — Context: on `/vendor/:id`, every field a REAL vendor left empty falls back to a hardcoded demo value. Owner / Company MD becomes "Mr. K.S. Tomar"; phone becomes "+91 90110 60851"; email and website become caramel.in addresses; the address becomes a Gwalior street address; GSTIN becomes "07AABCS1077Q1ZV" and PAN becomes "ABNCS1077Q"; the About paragraph and banner are stock too. A buyer can call that number or trust that GSTIN. Code: `src/pages/VendorProfile.tsx` — `detailRows`, `detailRowsResolved`, `contactRows`, `contactAddress`, `aboutText`, `websiteValue`, `bannerSrc`. Fix shape: render "Not provided" or omit the row, as `/product/:id` already does. Logged in `securityflags.md` (Open, Medium). Reference: Master Prompt 8 (2026-09-11), found during Phase 2; Mitra chose "only log it" for this round.
- [ ] Decide what listing cards show instead of the seeded product ratings, review counts and "sold" numbers — Added: 2026-09-11 — Context: `products.rating_avg` / `reviews_count` / `sold_count` have no real source. `reviews` has no `product_id`, there is no orders table, and nothing writes `sold_count`. Yet New Arrivals, Search, For You and Trends cards read them through `src/lib/queries/products.ts` (`soldCount`, `soldCountNum`, `sold`, `popularity`). Example seeds: Hand-Embroidered Kurta 480 reviews / 2,100 sold, with no real reviews behind them. The product page already stopped using them (Master Prompt 7). Options: remove them from the cards, or build per-product reviews and order tracking as real features. Related: vendors can also write these three columns on their own products (`products_update` has no column guard). Guard them once they are computed from something real. Logged in `securityflags.md` (Open, Low). Reference: Master Prompt 8 (2026-09-11), Phase 2; Mitra chose "keep for now". The vendor-level counts WERE fixed then.
- [ ] Revisit the landing page's unbacked claims — only when Mitra asks — Added: 2026-09-11 — Context: `src/pages/Landing.tsx` still says "Every supplier is vetted" (KYC review exists, universal vetting does not) and "See who is viewing, enquiring, and ordering, in real time" (analytics are periodic, and there is no ordering feature). It also shows "₹500Cr+ sourced through Cosora" and a stats band reading "50K+ Products listed / 10K+ Verified brands / 5K+ Manufacturers / 28 States covered" against 26 live products and about 10 vendors. Mitra said "keep it as it is, dont change the landing/hearopage", so do NOT edit it on your own; raise it with him. Reference: Master Prompt 8 (2026-09-11), Phase 5, skipped on Mitra's instruction.
- [ ] Make vendor-onboarding-write-path.spec.ts clean up its product-images uploads — Added: 2026-09-11 — Context: each run of the spec uploads office photos, an onboarding product image and a store logo into the PUBLIC `product-images` bucket under demo-buyer (`11111111-…/office/`, `/onboarding-product/`, `/store/`). Its teardown removes the `business-docs` KYC objects but never these, so each run strands 4–5 objects referenced by nothing. The 14 left by Master Prompt 8's runs were removed by hand as demo-buyer. Fix: record those paths as they upload (the way `uploadedKycPaths` already works) and `remove()` them in `cleanup()`. One run in that session also lost its signed-in session at step 6 and did not reproduce in two reruns; watch for it. Reference: Master Prompt 8 (2026-09-11), Phase 3 regression runs.
- [ ] Configure a custom SMTP provider for Supabase Auth — Added: 2026-09-11 — Context: Supabase's built-in email sender rate-limits hard, and signup confirmation emails fail in bursts; the signup spec failed intermittently for that reason alone during Master Prompt 6. This is a Supabase dashboard setting (Authentication → Emails → SMTP: Resend, SES, Postmark, …), not a code change. Reference: raised in the Master Prompt 7 bug review; restated as a non-engineering item in Master Prompt 8.
- [ ] Get the supplier agreement legally reviewed — Added: 2026-09-11 — Priority: High — Context: real vendors sign the agreement during onboarding, and each signature is recorded against version `2026-09-v1` (`src/lib/supplierAgreement.ts`: `SUPPLIER_AGREEMENT_CLAUSES`, `SUPPLIER_AGREEMENT_VERSION`; rows in `vendor_contracts`). The text has never been reviewed by a lawyer. A revised text needs a new version string so existing signatures stay tied to the text they signed. A legal task for Mitra, not code. Reference: Master Prompt 8 (2026-09-11), "not engineering tasks" list.
- [ ] Confirm and delete the two orphaned Bunny Stream videos — Added: 2026-09-11 — Context: before Master Prompt 7 fixed `tests/video-closeups-bunny.spec.ts`, a slow encode could leak a paid video, because the DB row was inserted only after the encode wait. The read-only `bunny-reconcile` edge function reported two such videos, roughly 21 MB each, in the billed library, with no `product_videos` row pointing at them. Someone with Bunny dashboard access should re-run the reconcile, confirm the two are still orphaned, and delete them. Mitra's call. Reference: Master Prompt 7, Phase 5; restated in Master Prompt 8.
- [ ] Decide whether to restore the rlstest-* / chatfx-* fixtures so the chat specs can run — Added: 2026-09-11 — Context: `tests/chat-pipeline.spec.ts` and `tests/admin-chat-moderation.spec.ts` (and Cosora-Admin's `rls-matrix`, `chat-moderation-matrix`, `chat-pipeline-matrix`, `invite-*` scripts) sign in as `rlstest-*` / `chatfx-*` accounts, which do not exist today. Restoring them means seeding known-password logins in the live database, including a super_admin. They are seeded through Cosora-Admin's `scripts/seed-test-admins.sql` / `seed-chat-fixtures.sql` in the SQL editor, then run, then dropped with `drop-test-admins.sql` as the last step of the same session. Since Master Prompt 8 the seeds take the password from `select set_config('cosora.fixture_password', '<FIXTURE_PASSWORD from .env>', false);`, run first in the same SQL-editor run, and refuse to create anything without it. Reference: Master Prompt 7, Phase 4 (commit `f1533b5`); Master Prompt 8 left the trade-off to Mitra.
- [ ] Prove the Bunny slow-encode path in the spec when a real slow encode happens — Added: 2026-09-11 — Context: Master Prompt 7 fixed the video spec so the `product_videos` row is inserted before the encode wait, making cleanup possible even when Bunny outlasts the timeout. In the only run since, the encode finished quickly, so the "encode exceeds the timeout → afterAll still deletes the video" path has never actually executed. There is no safe way to force a slow encode just to test it. If a future run times out on encode, check afterward with `bunny-reconcile` that it left no orphan. Reference: Master Prompt 7, Phase 5; Master Prompt 8 "known gap".

- [ ] Integrate Cosora's own messaging service (separate repo) as the messaging provider — Added: 2026-09-12 — Priority: High — Context: Master Prompt "Advertising System v3" Phase 7 asked for buyer→vendor ad contact and admin→vendor campaign-decision notifications over the WhatsApp Business Cloud API. That needs a Meta Business account with a verified WABA, a BSP relationship, and Meta-approved templates per notification type — none of which exist for this project. Mitra's answer: he is building his own messaging software with its own API, in a separate repo, to be consumed here. So `src/lib/messaging.ts` was built as a SEAM, not a stub: `MessagingProvider` is the contract (`kind`, `label`, `canReach`, `open`), `messaging()` selects the provider, and every call site goes through it knowing nothing about which one answered. Today the only provider is `clickToChatProvider` — a REAL per-vendor `wa.me` link built from `vendor_profiles.whatsapp`, which replaced the platform-wide hardcoded `wa.me/918821826465`. It is click-to-chat, not an API: it opens WhatsApp on the buyer's own device and cannot deliver server-side, use templates, or notify anyone not looking at their phone. To integrate: implement `MessagingProvider` against the new service and return it from `messaging()` behind whatever capability check it exposes — no call site changes. Admin→vendor decision notifications currently go through the existing in-app `notify()` from inside `ad_apply_decision()`; route those through the same service when it lands. Reference: Advertising System v3 (2026-09-12), Phase 7; Mitra chose "make a mixture and add this to ToDo.md". **UPDATE 2026-09-24 (My Profile Phase 18):** account-deletion codes for phone-only accounts now have a direct Meta Cloud API send path in the `account-deletion` edge function. It is dormant until `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set and a template is approved (`myprofileflags-fixed.md` MPF-6, and the MPF-24 entry below). Built at Mitra's choice when Phase 18 stopped on the missing Meta setup. When this service lands, decide whether deletion codes move to it: the change is `sendWhatsApp()` in that function.
- [ ] Build-or-retire decision on the ad types sold with no placement — Added: 2026-09-12, updated 2026-09-13 — Priority: High — **UPDATE 2026-09-13, two of the seven are resolved, five remain:** `searchListing` is now PLACED — Mitra's decision put it on the page the buyer reaches from the Search button (`searchSponsored`, in the scrolled feed) and on the results page (`searchResultsSponsored`), so it delivers for the first time. `verifiedCertificate` was never a placement question at all: it is a printed certificate that gets couriered, so it moved to `FULFILMENT_AD_TYPES` and is now fulfilled through `certificate_orders` instead of waiting for a slot. **Still unplaced and still needing a decision: `directBroadcast`, `webMobileCombo`, `fbInsta`, `googleProduct`, `socialCombo`.** Original context follows. — Context: of the 15 vendor-purchasable ad types, 7 rendered nowhere and 1 (`trustedSeal`) is the product-card badge. The reasons are in `src/lib/adSlots.ts` (`UNPLACED_AD_TYPES`), and `scripts/ad-slot-map-check.mjs` fails if any type is neither placed nor given a stated reason. Each needs a decision: `searchListing` (₹35/day) — a real `SearchResults.tsx` DOES exist, so the blocker is a product decision about sponsored search results, not a missing surface; `directBroadcast` (₹15/msg) — blocked on the messaging service above; `webMobileCombo` (₹129) — a bundle of two types that already share one banner slot, so it would render the same banner twice; `fbInsta` / `googleProduct` / `socialCombo` — off-platform, no honest on-platform slot; `verifiedCertificate` (₹199) — renders the identical badge to `trustedSeal` (₹44) and needs a distinct visual before it can claim to be a different product. Until decided, vendors can buy all seven and receive nothing on-platform. Reference: Advertising System v3 (2026-09-12), Phase 5; the prompt explicitly said to flag rather than invent slots.
- [ ] Decide whether to collect buyer city, or stop selling city targeting — Added: 2026-09-12 — Priority: High — Context: `target_cities` is sold, stored and now ENFORCED (`ad_targeting_matches` in migration 20260912120300), and it fails closed — a viewer whose city Cosora does not know will not see a city-targeted campaign, because "target Mumbai" cannot honestly be honoured for someone whose city is unknown. But only 1 of 7 `buyer_profiles` rows has a city (it is "mumbai"), and anonymous viewers have none at all, so a vendor buying city targeting today reaches almost nobody. Before this change the column was decorative — stored, billed for, never read — which was worse. Two honest options: collect city from buyers (it is already a first-party field written at onboarding, so this is a prompt/UX change, not new tracking), or remove city targeting from the ad wizard and stop charging for it. Do not leave it half-enforced. Reference: Advertising System v3 (2026-09-12), Phase 3.5, which said "don't leave it silently decorative either way".
- [ ] Design the New Arrivals top banner slot, or retire websiteBanner/mobileBanner — Added: 2026-09-12 — Context: the placement plan gives New Arrivals a 1216x130 top banner above the category chips for `websiteBanner` (₹89/day) + `mobileBanner` (₹99/day), and said it "reuses the admin's existing unused banner-management table". No such table exists — nothing in the database matches `%banner%`, confirmed live. The slot is defined in `AD_SLOTS.newArrivalsBanner` and is wired to the same eligibility-gated pipeline as every other rail, but it renders as a standard sponsored card rather than a full-width banner creative, because there is no banner asset model (dimensions, click-through URL, separate creative upload) to render. Needs either a real banner creative model (additive table + vendor upload path + a banner component) or these two ad types moved to the unplaced list. Reference: Advertising System v3 (2026-09-12), Phase 5 drift.
- [ ] Clarify the "TrustedSEAL (upsell)" slide in the Following discovery carousel — Added: 2026-09-12, updated 2026-09-13 — Context: the paid-slide interleave itself is now BUILT (2026-09-13) to the mockup's spec — one Store Promotion / Brand Ad slide mixed into `NewBrandsCarousel` at 1-in-4, labelled with an "AD" chip and "Sponsored · Paid placement". What remains unbuilt is the third item the mockup lists for that slot, "TrustedSEAL (upsell)": it reads as a VENDOR-facing upsell ("buy a trust seal") and this is a buyer-facing discovery carousel, so it is unclear whether it means a slide advertising the seal to vendors, or simply that a seal-bearing sponsored brand shows its badge. The latter already happens via the existing product-card badge. Needs one sentence of intent before anything is built. Reference: Advertising System v3, Phase 5; artifact 780772d6.
- [ ] Add an ad_id foreign key to ad_orders so per-campaign revenue is real — Added: 2026-09-12 — Context: `ad_orders` records the payment (`order_id`, `vendor_id`, `spec` jsonb, `amount` in paise) but has no column pointing at the `advertisements` row(s) it paid for — one order can create several campaigns, one per product in the spec. So per-campaign revenue can only be approximated by matching a vendor's orders to their campaigns by time and spec. Any revenue figure shown per campaign must be labelled an approximation until this exists. Also worth knowing: `ad_orders` currently has ZERO rows, because the payment path falls back to demo mode (`if (!keySecret)` in `razorpay-verify-payment`) which publishes from the client-supplied spec with no order record at all. Reference: Advertising System v3 (2026-09-12), Phase 0 and Phase 8.2.
- [ ] Consider simplifying the vendor ad-creation wizard, and gating new vendors on KYC — Added: 2026-09-12 — Context: raised by the prompt as a product recommendation, explicitly NOT built. Etsy's self-serve flow (Shop Manager → Marketing → Ads → set a budget → listings auto-enroll with an opt-out → per-listing strategy unlocked at higher spend) is materially leaner than Cosora's current "choose ad types → choose products → choose duration → choose targeting → choose goals" wizard in `src/pages/Advertisements.tsx`. Etsy also gates new sellers behind a 15-day shop-age wait before ads can start. The Cosora equivalent would be its own KYC/verification status rather than an age timer — `vendor_profiles.is_verified` and the `vendor_documents` review flow already exist, and a paid campaign from a brand-new unverified vendor is exactly the case the new review queue will spend the most time on. Note a plan gate already exists and is enforced (`enforce_ad_location_scope` refuses ad creation outright on the free plan), so this would be a second, trust-based gate. Reference: Advertising System v3 (2026-09-12), Phase 5a — "note it as an open recommendation rather than building it unasked".
- [ ] Build Wholesaler Pick's 72-hour bump, or stop selling it as one — Added: 2026-09-13 — Priority: High — Context: `wholesalerPick` (₹59 flat) is sold as "'Wholesaler Pick' section, 72h bump" and now has a real slot (`AD_SLOTS.trendsSponsored`, alongside `featuredProduct`), but the BUMP does not exist. `active_ads()` orders by `created_at desc, a.id desc` for every eligible campaign equally, so a Wholesaler Pick campaign surfaces exactly like any other and decays the same way. The placement mockup (artifact 780772d6) calls this out directly: "The middle card is a Wholesaler Pick campaign mid-'72-hour bump' — the one placement here needing a small re-surface job rather than just a new slot." Shape: a bump is a flat-rate product feature, not an auction, so it does not conflict with the "no bid-based ranking" ground rule — most likely an ORDER BY term that floats a `wholesalerPick` campaign for 72h from `starts_at`, keeping a total-order tiebreaker so the double-counted-impression pagination bug cannot come back. Until built, vendors pay ₹59 for a behaviour the platform does not perform. Reference: Advertising System v3 (2026-09-12) placed it; the gap was found on 2026-09-13 comparing the build against the mockup artifact.
- [ ] Decide whether a vendor can badge an ad "on sale" on the Sale page — Added: 2026-09-13 — Context: open question raised by the placement mockup (artifact 780772d6) on the Sale "Sponsored deals" slot: "Sale wasn't in the original 4-page plan (New Arrivals / Trends / For You / Following) — added here for consistency, same Sponsored-rail pattern. Worth a call on whether vendors should be able to badge an ad 'on sale' too." The slot is built (`AD_SLOTS.saleSponsored`, Open Listing + Featured Product) and renders identically to every other sponsored rail. A discount badge would need a real discount source on the campaign or its promoted product — `filterSale` in `src/lib/queries/products.ts` already derives sale status from product data, so the honest version reads that rather than letting a vendor assert a discount in their ad copy. Reference: found 2026-09-13 comparing the build against the mockup artifact.
- [ ] Decide what the New Arrivals hero carousel should actually show — Added: 2026-09-13 — Priority: High — Context: `src/components/buyer/EverydayFashionHero.tsx` renders eight entirely invented products at the top of `/home/new-arrivals` — Unsplash photography, vendor ids `"v1"`..`"v8"` matching no `vendor_profiles` row, and hand-written prices/MOQs. Every slide links to `/product/ef-1`..`/product/ef-8`, routes that have never existed, so **every tap is a dead end** — the identical failure Master Prompt 7 fixed in the For You `RECENT_VIEW_ADS` rail. Slide one additionally carried `sponsored: true`, printing a "sponsored" chip on a fabricated product; that flag and its render block were REMOVED on 2026-09-13 because a fake paid placement is squarely an advertising defect. The remaining seven-plus-one fabricated slides are a product decision about the page hero, not an ads decision, so they were left in place — the same treatment Mitra chose for the Landing page copy. Options: wire it to real live products (`useLiveProducts()` already powers the grid below it), make it a real paid placement served by `active_ads()` (it is prime inventory — a full-bleed hero above the fold), or remove it. Until then the first thing a buyer sees on New Arrivals is eight products that do not exist. Reference: found 2026-09-13 while adding the Sponsored disclosure to every ad placement.
- [ ] Replace or remove the hardcoded signed-out brand SEED on Following — Added: 2026-09-13 — Priority: Medium — Context: `src/lib/followingStore.ts` holds a `SEED` array of invented brands ("LUNE" in "Busan, KR", "Okra Mills", picsum logos, USD prices like "$8.36") that is served to every SIGNED-OUT visitor on `/home/followings` — `useFollowing()` returns `localBrands` when there is no user, and the real `fetchBrands()` (vendor_profiles + follows + live products) only runs when signed in. So a logged-out buyer browses a brand-discovery carousel of businesses that do not exist, and every "Follow" writes to localStorage. One of those seeds carried `isAd: true`, which made the carousel print an "AD" chip on it — a fabricated PAID placement, removed 2026-09-13. The rest of the SEED is still there. Options: render the real vendor list for signed-out visitors too (vendor_profiles is already readable anonymously — `active_ads()` and the buyer feed both work signed-out), or render the signed-out empty state. Related to the same "no mock data" rule that removed `RECENT_VIEW_ADS`. Reference: found 2026-09-13 while building the Following paid-slide interleave.
- [ ] Trends chips: four of six resolve to no category at all — Added: 2026-09-13 — Context: `useResolvedCategoryId` maps a Trends chip to a real `categories` row so the sponsored rail can be category-targeted (Phase 3.3). Checked live: only `Denim → "Jeans"` and `Short-sleeved T-shirt → "T-shirts/Tops"` resolve. `Long Dress → "Maxi Dress"`, `Pleats → "Pleated Dress"`, `Cargo → "Cargo Pants"` and `Knitwear → "Knit Sets"` match nothing, so those four chips give the rail NO category context and it falls back to serving untargeted campaigns. That is the correct failure mode (no context ≠ match nothing) but it means category targeting is inert on two thirds of the page. Fix is editorial, not code: point each chip's `featured.sub` at a real taxonomy name, or accept that these chips are untargetable. Note also that targeting does not walk the category tree — a campaign targeting the parent "Jeans" does not match a context of the child "Men's Jeans", and vice versa; worth deciding whether it should. Reference: found 2026-09-13 seeding demo campaigns.
- [ ] Decide whether ads should join the semantic-search embedding pipeline — Added: 2026-09-12 — Context: `products`, `rfqs` and `product_videos` each have a `halfvec(1536)` embedding fed by the trigger → pgmq → pg_cron → Edge Function → OpenAI pipeline. `advertisements` does not. Adding one would let a search query match an ad semantically even when its category tag is a level off — the same thing `match_products()` already gives organic results. This was Phase 11 of the v3 prompt and was SKIPPED, correctly: it is only relevant once the `searchListing` build-or-retire decision above lands in favour of building a real sponsored-search placement. Do not build the embedding before that decision. Reference: Advertising System v3 (2026-09-12), Phase 11. — **UPDATE 2026-09-13:** that decision landed in favour of building it (`searchSponsored` + `searchResultsSponsored` slots now exist), so this is live again. The results-page slot currently takes its category context from the dominant category of the matched products plus the raw query string, resolved by name against the taxonomy — a semantic embedding would replace that heuristic with a real match.

- [ ] Collect a delivery address before selling a physical certificate — Added: 2026-09-13 — Priority: High — Context: `verifiedCertificate` (₹199) is now confirmed as a printed certificate that gets couriered (Mitra, 2026-09-13), and `certificate_orders` snapshots the vendor's address at purchase. But only **2 of 10** `vendor_profiles` rows carry both an `address_line` and a `postal_code`, and the one that does has zero live products — so in practice every vendor who can actually trade has nothing to put on a label. `certificate_dispatch()` refuses to mark such an order dispatched (a parcel marked sent with no address is a parcel nobody can trace), the admin card explains why, and the vendor's My Payments page says an address was missing when they ordered. Demonstrable live: demo order `CERT-2609-003` (Delhi Fashion Hub) is stuck at `printed` for exactly this reason while `CERT-2609-004` (Meridian Weaves) dispatched normally. Two honest fixes: require a delivery address in the ad wizard before the certificate can be added to the order, or let the vendor supply one against an existing order. Do not leave it sellable-but-undeliverable. Same shape as the city-targeting gap above. Reference: 2026-09-13, certificate fulfilment build.
- [ ] Decide how vendor-level ad products should be priced — Added: 2026-09-13 — Priority: High — Context: `verifiedCertificate` (₹199) and `trustedSeal` (₹44) are about the VENDOR, not a product, but `computeAmountRupees()` in `razorpay-create-order` multiplies every placement by the number of products in the spec — so buying a certificate alongside three products charges 3 × ₹199 and `adRows()` creates three `advertisements` rows. The certificate trigger then creates three fulfilment orders, i.e. three identical parcels for one vendor. Nothing auto-merges them, deliberately: the fix is a refund decision and belongs to a person. The admin Certificates screen now shows a caution when one vendor has more than one open order so it is visible rather than silently shipped. Fix shape: price vendor-level placements once per order regardless of item count, in all three of `razorpay-create-order`, `razorpay-verify-payment` and `razorpay-webhook` (the price table is duplicated across all three). Reference: 2026-09-13, found while building certificate fulfilment.
- [ ] Give advertising purchases GST treatment and an invoice series — Added: 2026-09-13 — Context: subscriptions produce a real tax invoice — `subscription_invoices` carries `invoice_number`, `gst_amount`, `gst_number` and a billing period, and `/subscription/invoice/:id` prints it. Advertising produces none of that: `ad_orders` stores only the Razorpay order id, the spec and one gross amount, with GST never broken out anywhere in the ad purchase path. So `/my-payments/receipt/:orderId` deliberately prints "PAYMENT RECEIPT", shows no GST line, and says in its footer that it is not a tax invoice — a vendor may well need one for input credit. Building it means deciding whether ad prices are GST-inclusive or exclusive, adding the GST split at order creation, and giving ad purchases their own invoice number series. Also note the unit trap documented in `src/lib/queries/vendorPayments.ts`: `ad_orders.amount` and `subscription_payment_orders.amount` are in **paise**, `subscription_invoices.amount` is in **rupees**. Reference: 2026-09-13, My Payments build.
- [ ] Create the `delivery_team` admin role — Added: 2026-09-13 — Context: certificate fulfilment is day-to-day dispatch work, not moderation. `certificate_fulfiller()` currently admits `super_admin` and `finance_admin`, and `cosora-admin/src/lib/roles.ts` mirrors that exactly. The intended list has always been `["super_admin", "finance_admin", "delivery_team"]`, but `delivery_team` does not exist in the `admin_role_type` enum, so naming it would imply a role nobody can hold. Add the enum value, then update `certificate_fulfiller()`, `SECTION_READ.certificates` and `SECTION_WRITE.certificates` in the SAME change — the roles file is UX only and the database is the authority, so they must not drift. Reference: 2026-09-13, certificate fulfilment build.
- [ ] Decide what the New Arrivals "we recommend" section should show — Added: 2026-09-13 — Context: it renders `products.slice(0, 4)` — the first four rows of the live catalogue, which the organic feed above already shows — and until 2026-09-13 it carried an "AD" chip at the right of its heading. Nobody had paid for those four cards, so the chip was a false paid-placement disclosure in the direction nobody checks for: it told the buyer a ranking was bought when it was not. The chip is removed; the duplication is not, because what the section SHOULD show is a product decision. Options: drop it, make it a real personalised ranking (the For You page already has `match_products`-backed ranking to borrow), or make it a fourth sponsored block. Reference: 2026-09-13, found while adding repeating ad blocks.
- [ ] Check the duplicate "Meridian Weaves Pvt Ltd" vendor_profiles rows — Added: 2026-09-13 — Priority: Low — Context: two `vendor_profiles` rows share the brand name "Meridian Weaves Pvt Ltd", the same city (Surat) and the same postcode (394221), and both have zero live products. Noticed while looking for a vendor with a postable address for the certificate demo. Probably a duplicate signup rather than two real businesses; worth confirming before either is used in anything customer-facing. Reference: 2026-09-13.

- [ ] Clean up the 2026-09-16 load-test population (owned by the Master Prompt 11 thread) — Added: 2026-09-22 — Priority: High — Context: 370 `loadtest-*@cosora.test` accounts (250 buyers, 120 sellers) are live, with 120 "[LOADTEST] Vendor Co N" vendor profiles (40 `is_verified = true`) and 351 "[LOADTEST] …" live products. That is 351 of the 377 live products buyers see. Master Prompt 11's commit `08a0550` used `loadtest-vendor-3` and says "The other 369 are left for Part 3" and that its quote "is covered by the synthetic-data cleanup script", but no such script is in either repository and the data is still there six days later. Precedent: the 2026-09-10 scale run deleted every synthetic row and `auth.users` entry and verified 0 by count. Master Prompt 9 corrected only their review numbers (all 0 now) and, on Mitra's decision, left the deletion to that thread. Logged in `securityflags.md` (Open). Reference: Master Prompt 9 (buyer-trust thread), 2026-09-22.
- [ ] Find out where the buyer app is deployed now — Added: 2026-09-22 — Context: `https://textile-spark-net.vercel.app/` returned Vercel's `404 DEPLOYMENT_NOT_FOUND` on 2026-09-22 (it served the app through 2026-09-11). Either the project was renamed or moved, or production is down. Master Prompt 9's browser check ran against a local dev server for that reason. Reference: Master Prompt 9 (buyer-trust thread), 2026-09-22.

### Fix the Bunny Stream API key — added 2026-09-23
- Task: get a working `BUNNY_API_KEY` configured so the Bunny video path (upload, delete,
  reconcile) actually works again.
- Context: found while verifying `bunny-reconcile` and `bunny-delete-video` post-drop during
  admin-schema separation Phase 5b/5c. As a real super_admin, both functions pass their own
  authorization check and then fail: `bunny-reconcile` gets `401 "Authentication has been
  denied for this request."` straight from `video.bunnycdn.com`, so it cannot list the library,
  and any Bunny-provider delete would fail the same way. Unrelated to the admin-schema
  separation work — the key itself is wrong or has been rotated/revoked at Bunny's end. Not
  chased further because it needs dashboard/Bunny-account access this session doesn't have.
  Today 0 `product_videos` rows use the `bunny` provider, so nothing is actively broken for a
  real user yet, but the path cannot be exercised or trusted until the key works. Logged Low in
  `securityflags.md` (2026-09-22 entry, "BUNNY_API_KEY is rejected by Bunny Stream").
- Reference: 2026-09-22/23 session, admin-schema separation Phase 5 (5b live-smoke and 5c
  post-drop verification of the four admin-gated edge functions).
- Priority: Low (nothing user-facing broken today; blocks trusting the Bunny path before it's used)
- Status: Open

### Wire up mobile OTP delivery (or finish the dev-mode bypass safely) — added 2026-09-23
- Task: get real SMS delivery working for mobile-number sign-in, OR, if a dev/test bypass is
  wanted in the meantime, finish `supabase/functions/otp-dev-verify` properly and deploy it.
- Context: `auth/restore-mobile-otp` (2026-09-22) put mobile number + OTP back as the primary
  sign-in, but this Supabase project has no SMS provider, so `sendOtp()` in
  `src/lib/auth/otp.ts` always gets `phone_provider_disabled` and the UI honestly says "no code
  was sent" — nobody can actually complete phone sign-in today. Google and Explore-as-Guest are
  the only working entry points meanwhile.
  A separate attempt at a "dev bypass" edge function, `supabase/functions/otp-dev-verify/index.ts`,
  exists UNTRACKED in the repo (never committed, never deployed) — it was blocked by the
  permission system as a security-weakening change, because as written it would let anyone sign
  in as any phone number with any code. It is not safe to deploy as-is.
  If it's ever picked back up: it currently reads `profiles.is_admin` in one spot to refuse
  minting an admin session — that column was DROPPED in admin-schema separation Phase 5c
  (2026-09-22), so that check must be rewritten to call the `admin_status_of(uuid)` RPC
  (service_role only, reads `admin.admin_users`) instead, or it will simply error.
  Options to actually solve delivery: (a) configure a real SMS provider (Twilio/MSG91/etc.) in
  Supabase Auth so `signInWithOtp` works for real, or (b) scope a dev-only bypass down to a
  fixed allowlist of test numbers with a fixed code, gated so it can never run against
  production, and get that reviewed/approved before deploying.
- Reference: 2026-09-22/23 session — `auth/restore-mobile-otp` (mobile OTP restore) and the
  admin-schema separation Phase 5 work (which is what surfaced the stale `is_admin` reference
  in the untracked bypass function).
- Priority: Medium (blocks real phone sign-in; Google/guest cover the gap for now)
- Status: Open

### Finish the Phase 9 FAQ content (seller registration, subscription, buyer Help accuracy) — added 2026-09-23
- Task: bring the admin-editable FAQs' wording in line with the product.
- Context: Phase 9 of the My Profile brief made FAQs admin-editable (`public.faqs`,
  `admin_faq_*`, Cosora-Admin `/faqs`).
  - **Done 2026-09-23:**
    - Andy's content is live: Seller Registration on `/seller`, and Subscription with
      "Contact us" → `/help`;
    - "Lowest billing plan?" is written;
    - verification is quoted as 3–5 days across the app.
  - **Done 2026-09-24 (Phase 22):** support writes FAQs as well as super_admin (the RPC
    gates and `roles.ts`, together). Edits keep no history: MPF-26.
  - **Done 2026-09-25 (Phase 24):** the content is seeded by migration
    (`20260925075432_faqs_seed_seller_registration_and_subscription.sql`), and the Subscription "Contact us" writes to
    hello@cosora.in (Mitra's choice over Andy's `/help`).
  - **Left:**
    - Andy to review the answers published verbatim that don't match the product (MPF-16);
    - align the Terms page with the 7-day money-back guarantee, and make refunds workable
      (MPF-17);
    - a content pass over the buyer Help answers (MPF-14; its own entry below, since Phase 25);
    - keep the "Lowest billing plan?" prices in step with `subscription_plans`.

  Full context: the MPF-14, MPF-16 and MPF-17 entries below (moved here from
  `myprofileflags.md` on 2026-09-25), and `documentation/myprofileflags-fixed.md`, "Phase 9 decisions".
- Reference: My Profile brief, Phase 9 (2026-09-23).
- Priority: Medium (live pages carry claims the product doesn't back)
- Status: Open (content loaded; accuracy and permissions pending)

### Set up Resend so account-deletion codes can go out by email (MPF-4) — added 2026-09-25
- Task: owner setup, no code change. (1) Create a Resend account and add its API key as the
  edge-function secret `RESEND_API_KEY`. (2) Verify a sending domain in Resend and set
  `RESEND_FROM` to an address on it. Then check that a real code arrives.
- Context:
  - **What's broken.** A buyer deletes their account from `/profile/help` (the Delete account
    card). A 6-digit code goes to the account's auth email (`auth.users.email`), and entering
    it starts a 14-day cooling-off, after which the account is anonymized. The
    `account-deletion` edge function (deployed v2) sends that email through Resend, and no
    Resend key is set. So the function answers `not_configured` and creates no request, and
    the dialog tells the buyer that deletion isn't available online yet and to write to
    hello@cosora.in.
  - **It's setup, not a code gap.** The send path is built. Everything after the email was
    tested end to end with a throwaway buyer, with the code issued through SQL in place of
    the email: code entry, a wrong code, the `/profile` banner, cancel, the daily sweep and
    anonymization. The one thing that has never run is a real email arriving.
  - **The two steps:**
    1. Create the Resend account and add `RESEND_API_KEY` in the Supabase dashboard → Edge
       Functions → Secrets. It takes effect without a redeploy.
    2. Verify a domain in Resend (for example `cosora.in`) and set `RESEND_FROM` to an
       address on it (for example `Cosora <no-reply@cosora.in>`). Without this, the function
       uses Resend's shared `onboarding@resend.dev` sender, which delivers only to the Resend
       account owner's own address, so every other buyer gets `send_failed`.
  - **Check it worked.** `{"action":"status"}` on `account-deletion` should report
    `configured.email: true` (it names no secret value). Then sign in as a buyer whose
    confirmed email you can read, request a code, check it arrives, and enter it. The
    request should read `cooling_off`. Cancel it afterwards.
  - **Who it reaches.** Email serves accounts with a confirmed auth email. Accounts created
    through mobile-OTP sign-in have none. Their code goes by WhatsApp, which has its own
    setup (MPF-24, and the messaging-service entry above). Either way the code only
    confirms a deletion: it never signs anyone in, and sign-in stays mobile number + OTP.
  - **Not the same as** "Configure a custom SMTP provider for Supabase Auth" (above). That is
    an Auth setting, and this is a secret on one edge function. One Resend account can serve
    both, but setting one doesn't set the other.
- Reference: My Profile brief, Phase 25 (2026-09-25). That docs-only phase asked for MPF-4,
  MPF-10, MPF-14 and MPF-15 to be logged here and left as they are for now, not fixed. The flag
  itself was found in Phase 2 (2026-09-23), when account deletion was built.
  Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: High for the feature (MPF-4's severity). Until it's done, no buyer can delete an
  email-based account online.
- Status: Open

### Decide whether to build real verification for the profile email (MPF-10) — added 2026-09-25
- Task: nothing checks that the email on a buyer's profile (`profiles.email`) belongs to them.
  Decide whether that matters. If it does, build contact verification: send a code to that
  address, record the result in a new column, and only then show a "Verified" badge.
- Context:
  - **What was there.** The old profile modal's "Verify" toasted "Verification code sent" but
    sent nothing. It accepted any 4+ digit code as "Email verified", and showed "Verified" for
    any stored email. Phase 4 (2026-09-23) removed it rather than move it to `/profile/edit`,
    which now shows the email as a plain field. The removal was correct: this project doesn't
    show a status nobody earned. So this is a missing feature, not a bug.
  - **What's left in the code.** `emailVerified` in `src/lib/queries/profile.ts` is still
    `Boolean(contact.email)`, which only means "has an email", and no page renders it. There
    is no `email_verified` column. Don't render `emailVerified` as a badge until real
    verification exists.
  - **Fix shape:**
    - Send the code through the Resend path that `account-deletion` uses. MPF-4's Resend
      setup (the entry above) comes first.
    - Do it server-side, in an edge function or a definer function. `profiles.email` isn't
      client-selectable (the app reads it through `my_contact_info()`), and the server should
      verify the address it has stored, not one the client sends.
    - Store the result in a new column. `profiles` has column-level grants, so the migration
      needs `grant select (<column>)` before the page can read it.
    - Show the badge from that column only.
  - **Contact verification only, unrelated to sign-in.** Sign-in stays mobile number + OTP
    only, with a dummy OTP for now (Mitra, 2026-09-23). This work must not add, change or
    re-route a sign-in method, and a verified email must never become a way to sign in.
    Account-deletion codes go to `auth.users.email`, which is a different field.
- Reference: My Profile brief, Phase 25 (2026-09-25). That docs-only phase asked for MPF-4,
  MPF-10, MPF-14 and MPF-15 to be logged here and left as they are for now, not fixed. The flag
  itself came from Phase 4 (2026-09-23), when the fake "Verify" was removed from the profile
  editor.
  Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: Low (MPF-10's severity): a missing feature, and nothing false is shown today.
- Status: Open

### Fix the buyer Help FAQ answers that describe features Cosora doesn't have (MPF-14) — added 2026-09-25
- Task: in Cosora-Admin `/faqs` (Buyer Help), rewrite or switch off the 7 answers listed
  below. They describe escrow, order tracking, buyer protection, shipping addresses, team
  accounts and SMS/push notifications, none of which exist. This is a content edit, with no
  code change and no deploy.
- Context:
  - **Where.** `public.faqs`, surface `buyer_help`, shown on `/help` and `/profile/help`
    (12 active questions in 4 topics). Seeded by `20260923144549_faqs_admin_editable.sql`,
    which moved the old hardcoded `Help.tsx` text over verbatim, without vetting it.
  - **The 7 questions.** All are still live and active (checked 2026-09-25). Each question is
    followed by what its answer claims and what is actually true:
    1. "How do I track my order status?" Claims orders can be tracked under "Active Orders",
       with notifications at each stage. There is no orders feature, and no quote, message or RFQ event notifies
       anyone.
    2. "What payment methods are accepted?" Claims escrow for larger orders. Cosora has no
       escrow.
    3. "Is my payment secure?" Claims escrow, with payment released after the buyer confirms.
       Same: no escrow.
    4. "Can I get a refund if there's an issue with my order?" Claims a buyer-protection
       policy with claims within 7 days. There is no such policy and no buyer refund flow.
    5. "How do I update my business profile?" Mentions shipping addresses, which don't exist.
       Editing is on `/profile/edit` and `/profile/business-details`.
    6. "Can I have multiple team members on one account?" Claims "Settings > Team
       Management" with permission levels. There is one login per account.
    7. "How do I change my notification settings?" Claims email, SMS or push. The switches
       are saved, and nothing is sent.

    Each claim was checked by searching `src/` and `supabase/migrations/`, and the only
    match was the seed itself.
  - **How to fix it.** Since Phase 9 (2026-09-23), FAQs are edited in the admin. A
    super_admin signs in to Cosora-Admin, opens `/faqs`, and edits or switches off each row.
    Support can do the same once the Phase 22 admin build is deployed; until then the live
    panel shows support a read-only view. Changes reach the page within about a minute of
    saving, with no deploy. Then check `/help` signed out.
  - **Watch for.**
    - `tests/faqs-admin-editable.spec.ts` asserts "12 questions across 4 topics", so update
      it if rows are switched off.
    - Edits keep no history (MPF-26). Copy the old text first if it might be needed.
    - The wording is Mitra's or Andy's call.
  - **Related.**
    - "Finish the Phase 9 FAQ content" (above) lists this as one of its leftovers. This
      entry is that item in full.
    - MPF-16 and MPF-17 are Andy's Seller Registration and Subscription answers, published
      verbatim by decision. They are separate, so don't fold them in.
- Reference: My Profile brief, Phase 25 (2026-09-25). That docs-only phase asked for MPF-4,
  MPF-10, MPF-14 and MPF-15 to be logged here and left as they are for now, not fixed. The flag
  itself came from Phase 9 (2026-09-23), which moved the Help text into the table and read
  it row by row.
  Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: Medium (MPF-14's severity): buyers are told about escrow and refunds that don't
  exist.
- Status: Open

### Give vendors a real support destination, and stop the canned chats posing as live support (MPF-15) — added 2026-09-25
- Task: two separate pieces of work.
  1. **A decision, then the build.** Decide where a vendor who asks for help should land:
     either a real vendor Help page (a new `seller_help` FAQ surface), or honest copy on
     `/help` for vendors. Then build the one chosen.
  2. **Simpler, and independent of the decision.** Label the canned support chats as not
     staffed, or remove them. This applies on the buyer side too.
- Context:
  - **Where vendors land.** Vendor Settings → "Help Center" (`src/pages/VendorSettings.tsx`)
    and the seller sidebar's "Help & Support" (`src/components/layout/DashboardSidebar.tsx`)
    both open `/help`. That is the buyer Help page (`Help.tsx`, also served at
    `/profile/help`). A vendor gets buyer FAQs about posting RFQs, comparing quotes and paying
    vendors, plus a Delete account card that sends vendors to support.
  - **The chats are canned.** Neither one sends anything anywhere: no Supabase call, no API.
    Both present an invented agent, "Abdul, Cosora support executive".
    - On `/help` and `/profile/help`, "Contact Us · Chat with us" and "Start Live Chat" open
      `ChatModal` in `Help.tsx`. It shows a greeting and, after each message, a 2-second
      "typing" indicator, then never replies.
    - `/profile/help/chat` (`SupportChat.tsx`, opened from `/profile`'s "Chat with Us")
      replies on a timer with one of three stock lines from its `CANNED` array.
  - **The only real channel is email to hello@cosora.in.** It appears as Help's "Email
    Support", on `VendorLanding.tsx` and `About.tsx`, and, since Phase 24, as the Subscription
    FAQ's "Contact us" (`mailto:hello@cosora.in?subject=Subscription%20question`). That last
    one is in the code only: the live site still opens `/help` until the buyer app is
    deployed. Help also
    has a Call button (a `tel:` link in `Help.tsx`). Whether anyone answers that number wasn't
    checked.
  - **Option (a): a vendor Help page.** FAQs live in `public.faqs` and render with
    `<FaqSection surface="…">`, so the page itself is small. But the surface names are listed
    in several places, and `seller_help` has to be added to all of them:
    - the `faqs_surface_check` constraint and `admin_faq_add()`'s own surface check (a
      migration);
    - `SURFACES` in `supabase/functions/faqs-snapshot/index.ts` (redeploy it);
    - `FaqSurface` in `src/lib/queries/faqs.ts`;
    - `Surface` and the surface list in Cosora-Admin `src/pages/Faqs.tsx`;
    - `SURFACES` in `scripts/faq-snapshot-check.mjs`.

    Then point the two vendor links at the new page, and write its content.
  - **Option (b): honest copy.** When a vendor opens `/help`, say that it is buyer help and
    give hello@cosora.in as the way to reach support.
  - **The chat fix, whichever option is chosen.** Either say plainly that nobody answers the
    chats and give the email address, or remove both chats and the buttons that open them. Any
    chat that stays must show the chat-monitoring disclosure, which is legally required in
    every chat flow (`claude.md`). `SupportChat` shows it (`CHAT_MONITORING_NOTICE`), but
    `ChatModal` in `Help.tsx` doesn't, so it needs adding if that chat stays. A real support
    chat would be a feature of its own.
- Reference: My Profile brief, Phase 25 (2026-09-25). That docs-only phase asked for MPF-4,
  MPF-10, MPF-14 and MPF-15 to be logged here and left as they are for now, not fixed. The flag
  itself came from Phase 9 (2026-09-23), which checked where a vendor's "Contact us" should
  go. The correction found on 2026-09-25: there are two canned chats, `ChatModal` in `Help.tsx`
  (never replies, and has no chat-monitoring disclosure) and `SupportChat` at
  `/profile/help/chat` (canned replies).
  Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: Medium (MPF-15's severity)
- Status: Open (waiting on the decision; the chat fix doesn't need it)

### Decide whether Andy's Seller Registration and Subscription FAQ answers change, or the product catches up (MPF-16) — added 2026-09-25
- Task: decide, for each of Andy's answers that doesn't match the product, whether Andy rewords it
  in Cosora-Admin `/faqs` (no deploy) or the product changes to match it. Each row in the
  detail below is independent.
- Context: Andy's content is published verbatim on `/seller` and `/subscription` by Mitra's decision
  (2026-09-23), so nobody should "fix" the wording quietly: it is Andy's call.
- Detail, as the flag recorded it ("Andy's Seller Registration and Subscription FAQs promise things the product doesn't do"):


  - **Where:** `public.faqs`, surfaces `seller_registration` (shown on `/seller`) and
    `subscription` (shown on `/subscription`). Loaded 2026-09-23 from Andy's content
    (`documentation/seller-registration-and-subscription-faq-content.md`).
  - **Decision:** Mitra chose to publish the answers **verbatim** (2026-09-23), rather than as
    corrected versions, and to log each mismatch here. Each claim was checked against the code
    and the live data before publishing:

    | Answer (surface) | Claim | Reality (checked 2026-09-23) |
    |---|---|---|
    | Can I upgrade or downgrade my plan anytime? (subscription) | "the difference will be prorated" | No proration anywhere. `activateSubscription()` in `subscription-verify-payment` charges the plan's full price and starts a fresh period at the moment of payment |
    | same | "Downgrades will take effect from your next billing cycle" | A lower plan is bought like any other: it starts immediately and replaces the current one. The page enables every plan except the current one and Free |
    | What happens when I reach my lead limit? (subscription) | "You'll receive notifications as you approach your limit" | Nothing sends a notification about the limit. `/leads` shows "N/cap leads used", and quoting at the cap is refused with an upgrade prompt |
    | How are leads managed on Cosora? (seller) | Notified "via dashboard, email, or WhatsApp" | No email or WhatsApp is sent, and no in-app notification fires for new RFQs (Phase 7). Leads appear on `/leads` |
    | What documents are required to register? (seller) | GST, PAN, business registration (or MSME/Udyam), Aadhaar, product catalog | Onboarding requires only PAN; GST and CIN are optional. KYC collects PAN, GST and CIN (`COLLECTED_DOC_TYPES` in `Kyc.tsx`). Aadhaar is deliberately not collected, and there's no MSME/Udyam document type. Catalogues have their own upload page (`UploadCatalogue.tsx`) |
    | I don't have a GST number… (seller) | Marked "Unverified Seller", which "may affect visibility and lead access" | There's no such label. Searching the SQL and the app found no ranking or lead-access gate on `is_verified`. GST is optional at registration |
    | Is there any cost to register? (seller) | "Basic registration is free… pay for Premium listings, Pay-per-lead access, Featured vendor badges" | Registration is free (the **Free** plan), but "Basic" is the name of a ₹699/month plan on the Subscription page. Pay-per-lead doesn't exist; Andy's own lead answer calls it future |

  - **Holds up:**
    - what Cosora is, and who can register;
    - buyers call or chat;
    - verification time (now 3–5 days across the app);
    - no shipping through Cosora;
    - the annual discount: yearly is 10× monthly, about 16.7%, so "up to 17%" and "2 months
      free" are right;
    - editing listings, though the answer doesn't mention that an edit sends a live listing
      back to review, hidden from buyers until re-approved.
  - **Fix shape:** Andy edits the wording in Cosora-Admin `/faqs` (no deploy), or the product
    catches up. Each row is independent.

- Reference: found in Phase 9's content load (2026-09-23). Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: Medium (vendors are told about proration, alerts and documents that don't match)
- Status: Open

### Resolve the Subscription FAQ's 7-day money-back promise against the Terms, and make a refund possible (MPF-17) — added 2026-09-25
- Task: make the public 7-day money-back promise on `/subscription` true: state it in the Terms,
  and give support a way to refund (Razorpay keys for `admin-refund-payment`, or a written
  manual process).
- Context: The promise was published as written by Mitra's decision (2026-09-23). The Terms still
  say fees are non-refundable, and no refund can run today.
- Detail, as the flag recorded it ("The Subscription FAQ promises a 7-day money-back guarantee that the Terms contradict"):


  - **Where:** the `public.faqs` subscription row "Is there a refund policy?", on
    `/subscription`: "We offer a 7-day money-back guarantee for first-time subscribers."
  - **Conflicts:**
    - `TermsConditions.tsx` says "Fees are non-refundable unless stated otherwise."
    - No refund can run today. Cosora-Admin's `admin-refund-payment` exists, but its README
      records that refunds can't execute on this project because the Razorpay keys aren't set.
    - Nothing tracks "first-time subscriber" or the 7-day window.
  - **Decision:** Mitra chose to publish it as written (2026-09-23).
  - **Risk:** it's a public financial promise. A vendor who asks for a refund needs manual
    handling outside the app, and the Terms say the opposite.
  - **Fix shape:**
    - update the Terms to state the guarantee, so "unless stated otherwise" is explicit in the
      Terms themselves;
    - then either set the Razorpay keys so `admin-refund-payment` works, or define the manual
      process support follows.

- Reference: found in Phase 9's content load (2026-09-23). Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: Medium (a public financial promise the Terms contradict)
- Status: Open

### Never deploy otp-dev-verify as it is; harden it or delete it once SMS works (MPF-21) — added 2026-09-25
- Task: keep `supabase/functions/otp-dev-verify/` undeployed and uncommitted. Before it is ever
  used anywhere, make the changes listed below; better, delete it once real SMS delivery
  works.
- Context: It is a sign-in bypass, parked on purpose. Sign-in stays mobile number + OTP only, with a
  dummy OTP for now (Mitra, 2026-09-23), so this is not being changed. Related: "Wire up
  mobile OTP delivery (or finish the dev-mode bypass safely)" above.
- Detail, as the flag recorded it ("`otp-dev-verify` is a sign-in bypass, and it is on by default"):


  - **Also logged in:** `securityflags.md` (Open Flags, 2026-09-24).
  - **Where:** `supabase/functions/otp-dev-verify/index.ts`. Never deployed: it was not among
    the project's 16 deployed edge functions on 2026-09-24, or its 18 on 2026-09-26
    (`list_edge_functions`). Tracked in `ToDo.md`, "Wire up mobile OTP delivery".
  - **Committed on a branch (found 2026-09-26):** it was meant to stay untracked, but commit
    `85f4f6a` ("index.ts", 2026-09-25 14:56 IST) added it, with `.claude/tmp/phase5-context.md`,
    to `my-profile/phase-14`, which is pushed. The flag-fix commit removed both again
    (`git rm --cached`; the local copies stay) before the branch merged to `main` on
    2026-09-26, so `main`'s files have neither. Both stay in the history, and the repo is
    public. Neither holds a secret value: the function reads its keys from the environment.
  - **What:** a stand-in for SMS delivery. It accepts any 6 digits for any phone number, creates
    the account with the service-role key when the number is new, and hands back a session.
    - `const ENABLED = true`: it is on unless `OTP_DEV_BYPASS=off` is set. Deploying it without
      that secret switches the bypass on.
    - CORS is `*`, and there is no allowlist, secret header or environment check.
    - It still reads `profiles.is_admin` to refuse admin numbers. That column was dropped on
      2026-09-22, so the check would now error.
  - **How it came up:** the automated security review flagged it as a critical authentication
    bypass on 2026-09-24. It was already known as unsafe to deploy (ToDo), but it had no flag.
  - **Why not fixed:** it is sign-in code, and sign-in stays as it is (Mitra). Its only
    protection is staying undeployed.
  - **Fix, before it is ever deployed anywhere:**
    - off by default, requiring an explicit `OTP_DEV_BYPASS=on`;
    - refuse the production project ref;
    - a hardcoded allowlist of dev numbers;
    - a shared-secret header only the dev harness knows;
    - CORS limited to the dev app's origin;
    - rewrite the admin check to use `admin_status_of()`.

    Better: delete it once real SMS delivery works.

- Reference: found in the automated security review in Phase 17 (2026-09-24). Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: Critical if deployed; nil today (not deployed, never committed)
- Status: Open

### Set up Meta WhatsApp so account-deletion codes reach phone-only accounts (MPF-24) — added 2026-09-25
- Task: owner setup, no code change: a Meta Business account with a verified WhatsApp sender, an
  approved AUTHENTICATION template, and the two secrets below. Then check a real code
  arrives.
- Context: Accounts made through mobile-OTP sign-in have no email, so their deletion code goes by
  WhatsApp (Phase 18). The send is built and dormant. The email channel has its own setup
  (MPF-4, above). Whether deletion codes later move to the in-house messaging service is in
  the messaging-service entry above.
- Detail, as the flag recorded it ("WhatsApp deletion codes can't go out yet"):


  - **Where:** the edge function `account-deletion` (v2), and its secrets
    `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (both required), plus optional
    `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` and `WHATSAPP_API_VERSION`.
  - **State on 2026-09-24:** `{action:"status"}` returns
    `{"configured":{"email":false,"whatsapp":false}}`. A phone-only account's request answers
    `not_configured` for WhatsApp and mints nothing (verified live: 0 request rows).
  - **Why it is a setup dependency, not code:**
    - WhatsApp doesn't allow free-form messages from a business, so the code has to go out as
      a Meta-approved template, and approval can take 1–2 business days.
    - The repo recorded on 2026-09-12 that this project has none of it: no Meta Business
      account, no verified sender, no templates (`src/lib/messaging.ts`, `ToDo.md`). Mitra's
      stated direction then was an in-house messaging service rather than Meta's API.
    - Phase 18 stopped on that, and the decision was to build the Meta branch now and leave it
      dormant.
  - **Setup steps, all for the owner:**
    1. A Meta Business account with a WhatsApp Business account and a verified sender number.
    2. An **AUTHENTICATION**-category template with a **copy-code** button:
       - named `account_deletion_code` in English (`en`), or set `WHATSAPP_TEMPLATE` /
         `WHATSAPP_TEMPLATE_LANG` to match;
       - with the security recommendation on (`add_security_recommendation`) and a 10-minute
         expiry (`code_expiration_minutes: 10`).

       Meta fixes the body text as "<code> is your verification code." It can't say
       "deletion" (see securityflags, 2026-09-24).
    3. A system-user access token with `whatsapp_business_messaging` permission, set as
       `WHATSAPP_ACCESS_TOKEN`.
    4. The sender's **phone number id** (not the number) as `WHATSAPP_PHONE_NUMBER_ID`.

    Secrets are set in Supabase → Edge Functions → Secrets, and take effect without a redeploy.
  - **What "sent" means:** Meta accepted the message, not that it was delivered. A number
    that isn't on WhatsApp is reported only later, through a webhook this project doesn't
    have.
    - So the user sees "We've sent a code to your WhatsApp number", and it never arrives.
    - "Send a new code" goes the same way. The way out is support.
    - A delivery webhook would fix that, if it matters.
  - **Cost:** Meta charges per authentication message. Each request allows 5 codes, 60 s apart,
    and only to the account's own number.
  - **Verify by:**
    1. With the secrets set, sign in as a phone-only account whose WhatsApp you can read.
    2. Request a code, check it arrives, and enter it.
    3. Check the request reads `cooling_off` with `channel = 'whatsapp'`, then cancel it.

- Reference: found in Phase 18 (2026-09-24). Moved here from `myprofileflags.md` on 2026-09-25 (Mitra: "leave it alone, shift it to todo.md"); this entry is now the flag's record.
- Priority: High for phone-only accounts once real sign-ups start; nil today
- Status: Open

## Completed
(move finished items here, keep the same entry, add "Completed: YYYY-MM-DD" and, if
known, a one-line note on how/where it was done — don't delete history)

### Deploy the MPF-3 code, then revoke the interim signed-in grant — added 2026-09-23
- Task: deploy the Phase 11 code to `cosora.in` and `cosora-admin.vercel.app`, then run
  `revoke select (email, phone) on public.profiles from authenticated;` as a migration.
- Context:
  - MPF-3's fix (`20260923171821`) made `profiles.email` and `profiles.phone` unreadable by
    clients, but the live bundles still select them directly, so both front ends broke.
  - `20260923174653` re-granted them to signed-in users only, so production works and signed
    out stays closed. Until the revoke, any signed-in account can read everyone's email and
    phone.
  - Before revoking, confirm that each live bundle calls `my_contact_info` /
    `admin_profile_search` and no longer contains the old selects.
  - After the revoke, `node scripts/profile-contact-privacy-check.mjs` must show 24/24. Its 4
    signed-in checks fail while the grant stands.
  - Detail: `myprofileflags-fixed.md` → MPF-19.
  - The same deploy restores call logging on `cosora.in`. Since MPF-2's fix
    (`20260923182259`), the live bundle's direct insert into `calls` is refused. It still
    dials, but those calls aren't recorded until the new code, which uses `log_call()`, is
    live.
  - The same deploy fixes the Quotes and Chats stats on `cosora.in`'s `/profile` (MPF-1,
    Phase 13, 2026-09-24). Until then they over-count for anyone who also sells or is an
    admin.
- Reference: My Profile brief, Phase 11 (MPF-3), 2026-09-23. When the outage was found, Mitra
  chose "Re-open to signed-in only". The call-logging note was added in Phase 12 (MPF-2).
- Priority: High
- Status: Completed
- Completed: 2026-09-24 — merged and pushed on Mitra's "push and merge to main":
  textile-spark-net `main` `d1ff52a` and Cosora-Admin `main` `106f84c`. Both deployed, and
  the live bundles were checked. Then, with Mitra's go-ahead,
  `20260923190354_profiles_contact_columns_revoke_interim.sql` revoked the grant. The privacy
  check shows 24/24, and the live smoke passed. Call logging and the Quotes and Chats stats
  went live with the same deploy.

### Remove the synthetic load-test population with scripts/loadtest-cleanup.sql — added 2026-09-23
- Task: once testing on the synthetic accounts is finished, run `scripts/loadtest-cleanup.sql`
  against production to delete the 370 `loadtest-*@cosora.test` accounts and everything they
  own. Run it first as-is (dry run), check its report, then run it again in commit mode.
- Context:
  - **Why it matters.**
    - These accounts are live production logins that all share one password (open Medium
      flag in `securityflags.md`).
    - They own most of the buyer catalogue: 351 of the 377 live listings are
      "[LOADTEST] …", against 26 real ones (577 synthetic products in all statuses).
    - They own 120 "[LOADTEST] Vendor Co N" vendors and nearly all of the vendor lead pool.
  - **What it deletes** (live counts 2026-09-23): 370 users and identities, 170 sessions, 120
    vendor profiles, 577 products, 572 RFQs, 1,082 quotes, 221 conversations with 1,321
    messages, 24 ads with 18 review-log rows, 24 subscriptions and 184 engagement events. The
    dry run prints the current numbers.
  - **How to run.** As postgres: the Supabase SQL editor, psql or MCP `execute_sql`.
    1. Run the file unchanged. Its 'dry-run' mode deletes inside a transaction, verifies,
       rolls everything back and ends with an error listing what it would delete. Nothing
       changes.
    2. To delete for real, change `'dry-run'` to `'commit'` in step 0 and run it again. The
       final SELECT must return all zeros.
    - If the population size was changed on purpose, update `cosora.loadtest_expected_users`
      (370). Otherwise the preflight refuses.
  - **Safety built in.**
    - It refuses before touching a row if an admin, Storage objects, a Bunny video or a
      signed contract is involved, or if any real user's own content would be destroyed.
    - It deletes children first, because a one-line `delete from auth.users` aborts on the
      product → recompute-queue FK and the NO ACTION links.
    - It then checks that nothing synthetic remains and that the real rows in 15 tables are
      unchanged.
    - Validated live on 2026-09-23 without executing any delete: the preflight passed and
      all 7 DELETEs plan.
  - **Side effects to expect.**
    - The catalogue shrinks to the ~26 real listings.
    - Every check that signs in as a loadtest account stops working until a new fixture set
      exists: `scripts/load/*` (k6), `tests/mp12-sourcing-loop.spec.ts`,
      `scripts/targeted-lead-cap-check.mjs`, `scripts/quote-rfq-open-check.mjs`,
      `scripts/cap-race-check.mjs` and `scripts/loadtest-login-check.mjs`.
    - `LOADTEST_PASSWORD` in `.env` becomes unused.
  - **If the cleanup is delayed,** rotate the shared password first.
  - **Afterwards:** close the two load-test flags in `securityflags.md`, update the
    load-test gap in `sides.md`, and add changelog / test.md entries.
- Reference: 2026-09-23 session, Master Prompt 12 Part G (cleanup script written; commit
  `4c4a762`, live validation `a5bf067`), then the request "add the cleanup task in the
  todo.md".
- Priority: High (while it waits, 370 production logins share one password)
- Status: Completed
- Completed: 2026-09-23 — run through MCP `execute_sql` from a Phase 0 ground-truth pass: the
  dry run's report matched the counts above exactly, then the commit run deleted them and the
  final SELECT returned all zeros. Real rows unchanged (20 accounts, 26 live listings). The
  "Afterwards" docs are done; see the 2026-09-23 changelog entry "load-test population
  deleted".
