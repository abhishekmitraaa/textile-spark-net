# Low bugs, batch 2 of 6: listings, stores and browsing content (2026-11-20)

Items: L-09, L-18, L-21, L-24–L-37. Branch `fix/low-batch2-2026-11-20` from batch 1 (`f3d6130`). Migration
`20261120110000_low_batch2.sql`. Batch 1's plan lists the other batches.

## Mitra's decisions (2026-11-20)
- L-09 "MEGA SALE": "Build a real sale feature". No sale exists today (the Sale page lists listings with a
  compare-at price, 0 on production; Cosora-Admin's Discounts are codes for sellers' own purchases), so it is a new
  ToDo entry, "Build a Cosora-run sale feature", which replaces the 2026-10-14 heading entry. The heading stays until
  the feature exists.
- L-21: "Take them off live". The three running "[demo]" campaigns (the Kurta Set ad that showed a saree, and the
  Delhi Fashion Hub and Meridian Weaves Verification Certificates) go to `archived`, each previous status recorded in
  `admin.demo_ads_offline`. The two certificates had also set their sellers' `ad_verified_until` (a Trusted Seal
  source); that is recorded and cleared where it still equals the campaign's end. The demo certificate orders stay
  as the delivery board's history. The Buttons tile's picture is the bundled buttons photo; the road picture came
  from the demo data H-04 took off.
- L-34: "Keep the landing page as is". The figures stay; only Sign in stops showing to signed-in visitors.

## Decided without asking
- L-18: a bare-number MOQ gets the listing's unit ("2 pieces"); one that already says its unit, or a listing without
  one, shows as listed (`moqWithUnit()`, `src/lib/moq.ts`, and `public.moq_text()` in `feed_products()`: its three
  `p.moq` select items, patched by anchored text after normalising line endings). Units are read like
  `sellingUnit()` ("Pcs" → piece) and made plural for any count but 1. "1 product", not "1 products" (Brand Picks,
  the seller sidebar). Specs for bras and sneakers were batch 1's `<CardSpecs>` (only what the listing states).
- L-24: the three curated looks are titled and tagged for what their pictures show ("Wide-Leg Denim" showed mustard
  trousers; a plain white tee was "#Screen printing #Gray"); a tap searches a broader term of its own.
- L-25: a New Arrivals tile opens a browse of its categories (`NEW_ARRIVALS_TILE_CATEGORIES`, every name checked on
  production), headed with the tile's name, not a text search for the label. Only tiles: the Categories page's
  sub-category labels ("Bags") keep their text search. The database reads only the tile's categories and their
  children (`feed_products(p_category_ids)`), so an older category isn't lost past the browse's 960 rows. The tile's
  name pre-picks a gender only when it also opens a category without one ("Men's Jeans" includes "Jeans").
- L-26: already fixed by H-13 (service providers have no Chat).
- L-27: "Most Enquired" sorts on the enquiry count, not its "1.6k" label.
- L-28: "More from this seller" is recent demand, then newest; not the seeded rating (`ranking.md` 4.4).
- L-29: the browse catalogue asks `feed_products` for ids only.
- L-30: the save dialog no longer pre-fills "Cotton / Regular / Manufacturer".
- L-31: `callGate` answers `check_failed` when a read it needs fails ("Couldn't check right now"), never "allowed".
- L-32: saves made signed out are added to the account at sign-in (100 at a time, one by one on a refusal), each
  folder into the account's folder of the same name, also after a Retry; cleared from the device once every folder
  is on the account.
- L-33: the site-config snapshot is waited for 6 s (it was 3 s) before the five table reads.
- L-35: the store page reads catalogues and the contact gate with the resolved seller id, so a bad address sends no
  failing requests.
- L-36: `/go/post-rfq` signed out opens Post Requirement, which asks for sign-in first and comes back after it.
- L-37: the stale `ad_frequency_capped` comments in `ads.ts` and `engagement.ts` now say ads have no cap (checked:
  neither impression function calls it on production).

## Checked
- Local stack (browser, :8134): a tile opens a browse headed "Women's Apparel"; MOQ "2 pieces", "10 pieces", "10",
  "Not specified"; "1 product"; the curated look; signed out the landing page shows Sign in and `/go/post-rfq` lands on
  the form; signed in no Sign in and Get started opens New Arrivals; `/vendor/not-a-real-id` signed out and in, no
  failed request.
- Migration: applied to the local stack; rehearsed on production in a rolled-back transaction (3 campaigns, 2 seals,
  a feed MOQ of "100 pieces").
- tsc, i18n 8260/8260, lint (one error, `siteConfig.ts:118`, from 2026-09-29), build.

## Code review (medium, 10 findings, all fixed)
Tiles only (sub-category links were left with nothing); tile categories read by the database; the pending filter write
dropped on a new tile; Featured places and the ad category not taken from a tile's first category; guest folders
merged; merge after Retry; one 6 s site-config wait instead of 3 s + 10 s; curated looks search a term of their own;
MOQ units normalised and plural; "Join as a buyer" never opens Seller Home. Rehearsed on production again (rolled back).

## Release (when Mitra says)
Apply the migration with the CLI (not in the ledger), then push main; check the three campaigns are archived and the
two sellers carry no demo seal.
