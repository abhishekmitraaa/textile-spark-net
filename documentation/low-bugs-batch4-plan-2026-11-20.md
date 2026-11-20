# Low bugs, batch 4: Seller Home, the careers page, sign-up leftovers, routes and docs (2026-11-20)

Items: L-68–L-85 and L-99–L-104 (24). Branch `fix/low-batch4-2026-11-20` from main `265fa1d` (batches 1–3 live), in
both repos (Cosora-Admin: the switch's label). Migration `20261120130000_low_batch4.sql`. Left for batch 5: the
database items L-86–L-98. Still open from batch 3: L-63, L-64 (sign-in files, Mitra's word needed).

## Mitra's call

- L-68 ("Work with us" → cosora.in/careers, a 404): "Make a careers page but keep it hidden for now, make the feature to
  be able to turned on from admin panel." `/careers` and the landing link sit behind the switch `careers_page`, off.
  Super admins turn it on in Cosora-Admin › Feature switches, for everyone or for listed accounts first. The page's copy
  is plain (what Cosora is, no open roles listed, write through Help); Mitra may want to change it before turning it on.

## What changed

- L-68: `public.careers_page_on()` (answers visitors too, like `featured_listings_on()`), `useCareersPageOn()`,
  `src/pages/Careers.tsx` (the 404 page while off), `/careers` in SHARED_PATHS and vercel.json.
- L-69: the pending-registration screen's "Go to seller home" replaces its entry, so Back doesn't show it again.
- L-70: `BuyerFrame` draws the buyer side from the first render (`<DisplaySide>`; BuyerTopBar reads it), so Back from
  the seller side no longer shows the seller's bottom bar for a moment.
- L-71: `/auth/callback` is masked from Clarity (route wrapper only; the page is unchanged).
- L-72: Seller Home's "under review" and "accepted" lines say "–" while loading.
- L-73: leads say "units" and "/unit" like /leads, and nothing for a quantity not given.
- L-74: a direct request without a photo shows the requested listing's picture (`seller_home_summary`).
- L-75: Top Products price with its unit.
- L-76: "View quote" opens the quote (`quote_id` in the summary; `/quotes?quote=<id>`; a quote no longer there says so).
- L-77: Getting started lists listings sent back (with a link to Cosora's reason), listings removed by moderation, and
  listings paused over the plan's limit.
- L-78: no "FREE" badge on Upload Catalogue.
- L-79: the alerts card names only the channels reaching this seller today (plan, live, the seller's own settings), and
  no longer says "in your categories" (leads are ranked by fit, not filtered by category).
- L-80, L-81: the phone sidebar knows it is a phone on the first render (no slide on load); closed, it is hidden and out
  of the tab order; the close button is labelled.
- L-82: /products' Upload buttons in the seller colour.
- L-83: Competitor Ads has an error state with Try again; the category average keeps its grouping (the server already
  rounds it, so there are no paise to keep).
- L-84: Getting started's place is held while Seller Home loads.
- L-85: `my_vendor_private()` is read once in the summary. The chat unread count's second read seen locally is the
  catch-up read after the fallback subscription joins, which runs only while the live-updates hub is off (on in
  production): left as is.
- L-99: `buyerShellRoutes` was already gone; the route script's comment updated.
- L-100: the sitemap lists /privacy and the active help guides (a failed guides read uses the short cache).
- L-101: /for-you and /service-vendors redirect to /home/for-you and /services (vercel.json permanent redirects, and in
  the app with the query kept); the seller header's buyer tabs link the real pages (Trends and Followings both opened
  For You). /chat, /post-requirement and /auth/login stay: they are closed to crawlers in robots.txt, and /auth/login
  is a sign-in page.
- L-102: `documentation/sitemap.md` regenerated from App.tsx (112 routes, by side, with the old notes kept).
- L-103: claude.md no longer names a Seller Home card as a reader of `NOTIFICATION_DELIVERY_LIVE`; the unused
  `useProfileScore()` is gone (`profileScoreInputFrom()` is used in its own file and stays).
- L-104: a back-dated changelog entry for the Journal proxy and `/go/post-rfq` (2026-09-29).

## Checks

- tsc clean; i18n 8298/8298; eslint on changed files: no errors; build passes (spa-routes in sync, 111 rewrites).
  Cosora-Admin `tsc`: clean.
- Migration: applied on the local stack; production's current `seller_home_summary` body diffed against the
  migration's: only the intended changes. Rehearsed on production in a rolled-back transaction.
- Browser, local stack (:8136): /careers is the 404 page with the switch off and the page with it on; the landing link
  follows the switch; /for-you lands on /home/for-you; Seller Home with seeded rows (removed afterwards): Getting
  started lists the rejected and paused listings, the direct request shows "50 units · ₹400–₹500/unit", Top Products
  "₹450.50 / piece", View quote opens the quote; at 390 px the closed sidebar is hidden, aria-hidden and untabbable.

## Code review (medium)

10 findings. Fixed: the alerts card's channels (plan, settings, available); removed listings counted apart from those
sent back; the guides' sitemap cache; Competitor Ads' grouping; View quote's missing-quote message; the alias redirects
keep the query; this plan and the changelog entry; the careers RPC noted in claude.md as a visitor-readable switch.
Checked: the function rewrite drops nothing production has (diffed). Accepted: /careers answers 200 with the 404 page
while the switch is off (a soft 404, `noindex`), so turning it on needs no deploy.

## Release (when Mitra says)

Apply the migration with the CLI, then push main in both repos. Check `careers_page` exists and is off, then remove the
released L- lines from ToDo.md (keep L-63, L-64 and L-86–L-98).
