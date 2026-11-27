# Speed build plan: buyer and seller app (2026-11-27)

Mitra, 2026-11-27: "make the entire performance of the main app faster … faster loading time and low latency with
the images not taking extra time. check the load time of all the pages used the sitemap.xml and then run tests and
then create an entire build document with a complete plan to increase the speed and reduce the load time and latency."

This document has three parts: what was measured and how (§1–§2), why the app is slow (§3), and the build plan in
phases with acceptance checks (§4–§8). Every number here was measured on 2026-11-27 against production `main`
(8d19b19, bundle `index-B6boMfCE.js`) unless it says otherwise. Nothing was changed in code, the database or Vercel
while measuring.

---

## 0. Summary

On a mid-range Android phone on 4G in India, a first visit to the buyer home feed takes **15 s** before its main
picture shows (LCP); product pages take 6–7 s, search results 14 s, and even a text page like Terms takes 4 s. On a
laptop the same pages take 1.5–6.5 s. Google's "good" mark is 2.5 s.

Seven causes account for nearly all of it, roughly in order of size:

1. **The database is in Sydney (`ap-southeast-2`); the users are in India.** Every Supabase call from India costs
   ~0.4 s on an open connection and ~1.3 s on a new one, while the database itself answers in 7–37 ms. A page makes
   3–40 such calls. (§3.1)
2. **Listing photos are full-size originals.** Only **4 of 423** listing photos have the 480 px thumbnail the cards
   ask for, so every card first waits 1.2–1.7 s for a thumbnail that doesn't exist (404 from Sydney), then downloads
   the original (avg 168 KB, up to 2.5 MB) to show it at ~170 px. 69 % of all images on the measured pages were more
   than 1.5× larger than needed. The thumbnail trigger only fires when a listing *changes* to live, so listings
   created live (all 280 samples) never got one. (§3.2)
3. **Nothing is cached between visits.** Vercel serves the fingerprinted `/assets/*` files with
   `Cache-Control: public, max-age=0, must-revalidate`, so a returning visitor re-fetches all ~110 files: 0 of 114
   came from the browser cache on a reload. (§3.3)
4. **The first script is 1.29 MB (393 KB compressed)** and carries code most visits never run: the seller category
   table (109 KB), framer-motion (115 KB), the tap-to-open modals, and the Login, Register and OTP pages. (§3.4)
   **56 % of it is third-party library ("vendor") code** (211 of 377 KB gzip), and it all sits in that one file, so each
   of the near-daily deploys makes every returning visitor download the unchanged libraries again. (§3.9)
5. **The page warm-up downloads ~100 extra script files on every first visit.** That is about 250 KB of other pages'
   code, fetched while the current page's own photos and data are still loading on a slow connection. (§3.5)
6. **Too many round trips, made late.** Data calls start only after the JS has booted (~3.8 s on the phone), arrive
   in waves (the product page has three waves of 15 calls), are sometimes duplicated, and search results send one
   analytics call per card (27 on one page). Every signed-in page load, buyer or seller, first repeats the same 15
   account calls in three waves before the page's own data. (§3.6, §2.2)
7. **Heavy rendering on phones.** Search results build 5,696 DOM nodes and block the main thread for 4.4 s; the home
   feed 2.3 s; a seller storefront 1.9 s. (§3.7)

The plan (§4) fixes these in seven phases. The first three need no new services or decisions and should take the
home feed on a phone from 15 s to roughly 5–6 s (estimate). The region decision (D-2) and the page-level data calls
then take it to roughly 2.5–3.5 s (estimate). Every phase has a measurable acceptance check, run with the same script
used for this baseline.

---

## 1. How it was measured

**Pages.** All 20 URLs in the live `https://www.cosora.in/sitemap.xml`, plus 13 public buyer pages the sitemap
doesn't list (home tabs, search, search results, services, freelancers, two product pages, a seller storefront,
recently viewed, login). Signed-in seller pages aren't reachable without signing in on production, so 18 of them were
measured against the local stack (see below).

**Tool.** A Playwright script driving real Chromium (`scratchpad/perf/measure.cjs` for this run; Phase 0 commits it
as `scripts/perf/page-speed.mjs`). For each page:

| Profile | Device | CPU | Network | Runs |
|---|---|---|---|---|
| **Mobile** | 390×844 @3×, Android UA, touch | 4× slowdown | 150 ms RTT, 1.6 Mbps down, 750 kbps up (Lighthouse's mobile default) | cold (new browser profile), then warm (reload in the same profile) |
| **Desktop** | 1366×900 | none | none (this machine's connection, India) | cold |

Recorded per run: FCP, LCP (and which element), CLS, Total Blocking Time (long tasks after FCP), every request
(type, bytes, cache status, `Cache-Control`), every Supabase call (start, duration, size), and every image on the page
(natural vs displayed size, `loading`, above or below the fold).

**Nothing written to production.** View, impression and engagement RPCs (`log_*`, `increment_*`, `ad_impressions`)
and every table insert were answered by the script and never reached Supabase; Microsoft Clarity was blocked. The
pages therefore did slightly *less* network work than a real visitor.

**Seller pages.** The production bundle was rebuilt from `main` against the local Supabase stack, served with
`vite preview`, and signed in as the local test vendor. The same mobile throttling applies (150 ms simulated RTT), but
the database is on this machine, so these numbers **understate** production by the Sydney round trip (~0.25–0.4 s
per wave of calls). They are good for comparing request counts, script weight and CPU cost.

**Other checks.** `curl` timings of the HTML, Supabase REST, Auth and Storage from this machine (India; Cloudflare
edge `BOM`/Mumbai); a source-map breakdown of the entry chunk; read-only SQL on production for Storage objects,
thumbnail coverage and triggers; the Supabase performance advisor.

**Caveats.** Lab numbers from one machine, not field data from real users (Phase 0 adds field data). The very first
runs of `/`, `/seller` and `/blogs/about` overlapped with other tests on the same connection; `/` and `/seller` were
re-measured alone, as were `/blogs/about` and the home feed, and the re-measured numbers are used.

---

## 2. Results (baseline, 2026-11-27)

### 2.1 Public and buyer pages (production)

Mobile = phone profile, first visit. "Data done" = when the last Supabase call finished. "Warm LCP" = same phone,
second visit. Transfer includes the page warm-up's extra scripts (§3.5).

| Page | Mobile FCP | Mobile LCP | Mobile TBT | Data done | Requests | Transfer | Images | Supabase calls | Warm LCP | Desktop LCP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | 4.2 s | 6.3 s | 8 ms | – | 116 | 0.97 MB | 2 / 176 KB | 0 | 4.5 s | 1.6 s |
| `/blogs/about` ¹ | 2.8 s | 2.8 s | 175 ms | – | 21 | 0.36 MB | 1 / 5 KB | 0 | 1.4 s | 1.3 s |
| `/seller` | 5.1 s | 5.2 s | 1259 ms | 5.3 s | 141 | 2.13 MB | 5 / 302 KB | 1 | 3.8 s | 2.1 s |
| `/categories` | 4.6 s | 8.0 s | 158 ms | – | 123 | 1.14 MB | 13 / 422 KB | 0 | 5.7 s | 2.2 s |
| `/cosora-studio` | 3.9 s | 6.2 s | 3 ms | – | 113 | 0.90 MB | 2 / 177 KB | 0 | 4.8 s | 1.9 s |
| `/video-closeups` | 4.0 s | 5.4 s | 12 ms | 5.3 s | 115 | 0.73 MB | 0 / 0 KB | 2 | 4.4 s | 3.5 s |
| `/help` | 4.6 s | 5.0 s | 178 ms | 5.6 s | 124 | 0.76 MB | 0 / 0 KB | 2 | 3.7 s | 2.2 s |
| `/terms` | 4.2 s | 4.2 s | 0 ms | – | 114 | 0.74 MB | 0 / 0 KB | 0 | 3.2 s | 1.5 s |
| `/privacy` | 5.1 s | 5.1 s | 394 ms | – | 114 | 0.74 MB | 0 / 0 KB | 0 | 3.1 s | 1.3 s |
| `/refund-policy` | 4.7 s | 4.7 s | 27 ms | – | 113 | 0.73 MB | 0 / 0 KB | 0 | 3.0 s | 1.6 s |
| `/contact` | 3.9 s | 3.9 s | 0 ms | – | 113 | 0.73 MB | 0 / 0 KB | 0 | 3.0 s | 1.9 s |
| `/grievance` | 5.1 s | 5.1 s | 0 ms | – | 114 | 0.73 MB | 0 / 0 KB | 0 | 3.1 s | 2.0 s |
| `/help/guides/complete-verification` | 3.9 s | 4.5 s | 0 ms | 4.4 s | 115 | 0.74 MB | 0 / 0 KB | 1 | 3.6 s | 2.6 s |
| `/blogs` | 2.1 s | 4.3 s | 173 ms | 5.0 s | 23 | 0.40 MB | 4 / 52 KB | 3 | 1.5 s | 1.2 s |
| `/blogs/category/community` | 2.0 s | 2.0 s | 162 ms | 2.0 s | 20 | 0.36 MB | 2 / 20 KB | 1 | 1.1 s | 1.1 s |
| `/blogs/category/company` | 2.2 s | 2.2 s | 280 ms | 2.0 s | 20 | 0.36 MB | 2 / 20 KB | 1 | 1.1 s | 1.0 s |
| `/blogs/authors/cosora` | 2.3 s | 2.3 s | 303 ms | 2.3 s | 23 | 0.34 MB | 4 / 52 KB | 3 | 1.4 s | 1.0 s |
| `/blogs/gsm-explained-fabric-weight` | 2.0 s | 2.1 s | 383 ms | 1.8 s | 25 | 0.38 MB | 2 / 20 KB | 1 | 1.7 s | 1.4 s |
| `/blogs/rfq-that-gets-comparable-quotes` | 2.0 s | 2.1 s | 234 ms | 1.9 s | 26 | 0.50 MB | 3 / 140 KB | 1 | 1.7 s | 1.0 s |
| `/blogs/every-manufacturer-now-verified` | 2.3 s | 2.4 s | 400 ms | 1.9 s | 26 | 0.47 MB | 3 / 110 KB | 1 | 1.7 s | 0.9 s |
| `/home/new-arrivals` (buyer home) | 4.0 s | **15.1 s** | 2284 ms | 7.0 s | 171 | 3.21 MB | 35 / 2433 KB | 11 | **13.1 s** | 4.4 s |
| `/home/trends` | 4.2 s | 4.9 s | 860 ms | 7.3 s | 142 | 1.59 MB | 18 / 770 KB | 5 | 4.8 s | 1.9 s |
| `/home/sale` | 5.4 s | 5.8 s | 56 ms | 6.3 s | 119 | 0.83 MB | 1 / 65 KB | 3 | 3.4 s | 1.8 s |
| `/home/for-you` | 4.4 s | 4.7 s | 93 ms | 5.4 s | 119 | 0.84 MB | 1 / 65 KB | 3 | 3.2 s | 2.2 s |
| `/search` | 4.9 s | 9.1 s | 1515 ms | 6.8 s | 140 | 1.55 MB | 21 / 812 KB | 4 | 6.2 s | 2.7 s |
| `/search/results?q=shirt` | 3.7 s | **14.1 s** | **4374 ms** | 11.0 s | 213 | 1.94 MB | 21 / 1019 KB | **40** | 11.1 s | 6.5 s |
| `/services` | 3.9 s | 5.1 s | 264 ms | – | 124 | 1.17 MB | 9 / 387 KB | 0 | 4.1 s | 3.1 s |
| `/freelancers` | 4.1 s | 4.1 s | 84 ms | – | 123 | 0.92 MB | 9 / 128 KB | 0 | 4.1 s | 1.5 s |
| `/product/ffe46099…` | 4.0 s | 6.6 s | 676 ms | 7.5 s | 144 | 0.98 MB | 2 / 89 KB | 15 | 4.8 s | 3.6 s |
| `/product/fd983490…` | 3.7 s | 5.7 s | 446 ms | 5.9 s | 154 | 1.12 MB | 12 / 240 KB | 15 | 4.7 s | 3.3 s |
| `/vendor/04d9d594…` (storefront) | 4.4 s | 7.2 s | 1872 ms | 7.0 s | 141 | 1.75 MB | 15 / 978 KB | 7 | 6.7 s | 2.9 s |
| `/recently-viewed` | 3.7 s | 3.9 s | 20 ms | – | 112 | 0.80 MB | 1 / 65 KB | 0 | 3.6 s | 1.6 s |
| `/login` | 3.5 s | 4.2 s | 0 ms | – | 110 | 0.76 MB | 1 / 65 KB | 0 | 3.5 s | 1.2 s |

¹ `/blogs/about` re-measured alone (the first run, 28 s, overlapped with other tests on the connection). The Journal
(`cosora-blogs`, proxied under `/blogs`) is a separate app and in good shape compared with the marketplace: 2.0–2.8 s
on the phone.

The home feed was also re-measured alone to confirm it: mobile LCP 13.8 s (warm 11.8 s), TBT 1.0 s, 36 images /
2.4 MB, desktop LCP 4.7 s. The 13.8–15.1 s range is real.

**What the table shows.**
- Even pages with **no data at all** (Terms, Privacy, Contact, Login) take 3.5–5 s to paint on a phone. That is the
  cost of the app shell alone: render-blocking fonts, a 393 KB first script on a 1.6 Mbps link, and parsing it on a
  slow CPU. (§3.3–§3.5)
- A **second visit is barely faster** (Terms 4.2 → 3.2 s, home 15.1 → 13.1 s), because nothing is cached. (§3.3)
- Pages that show **listing photos** are the slowest by far (home 15 s, search results 14 s, search 9 s,
  storefront 7 s). (§3.2)
- Pages with **many Supabase calls** finish their data late (search results 40 calls, 11 s; product 15 calls,
  6–7.5 s). (§3.1, §3.6)

### 2.2 Signed-in seller pages (local stack; production adds the Sydney round trip)

Signed in as the local test vendor, production build of `main` against the local Supabase stack. The phone profile's
150 ms simulated round trip applies, the Sydney distance doesn't, so add roughly 0.25–0.4 s per wave of calls (two to
four waves per page) for production. Desktop numbers here have no network delay at all.

| Page | Mobile FCP | Mobile LCP | Mobile TBT | Data done | Requests | Transfer | Images | Supabase calls | Warm LCP | Desktop LCP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/seller-home` | 4.3 s | 5.0 s | 1050 ms | 6.0 s | 154 | 0.87 MB | 3 / 102 KB | 20 | 4.7 s | 1.3 s |
| `/my-store` | 5.0 s | 5.7 s | 400 ms | 5.3 s | 157 | 0.84 MB | 2 / 99 KB | 21 | 4.3 s | 0.9 s |
| `/products` | 5.2 s | 6.0 s | 100 ms | 5.4 s | 153 | 0.84 MB | 2 / 99 KB | 20 | 4.7 s | 0.9 s |
| `/upload` | 4.3 s | 5.0 s | 505 ms | 9.0 s | 157 | 1.38 MB | 2 / 99 KB | 20 | 5.0 s | 1.3 s |
| `/leads` | 4.1 s | 4.6 s | 264 ms | 5.7 s | 167 | 0.88 MB | 3 / 102 KB | 25 | 4.0 s | 1.4 s |
| `/analytics` | 6.1 s | 6.6 s | 353 ms | 6.9 s | 192 | 1.03 MB | 2 / 99 KB | 36 | 4.8 s | 1.3 s |
| `/advertisements` | 5.1 s | 5.9 s | 1106 ms | 6.4 s | 191 | 1.20 MB | 7 / 367 KB | 30 | 4.6 s | 1.6 s |
| `/subscription` | 4.4 s | 4.7 s | 517 ms | 4.7 s | 175 | 0.97 MB | 2 / 99 KB | 25 | 4.2 s | 1.9 s |
| `/my-payments` | 3.9 s | 3.9 s | 184 ms | 4.3 s | 157 | 0.84 MB | 1 / 50 KB | 21 | 3.4 s | 1.3 s |
| `/business-profile` | 4.1 s | 5.0 s | 469 ms | 4.7 s | 170 | 0.86 MB | 2 / 99 KB | 28 | 5.1 s | 1.0 s |
| `/chat` | 4.1 s | 4.2 s | 91 ms | 4.9 s | 158 | 0.79 MB | 1 / 50 KB | 24 | 4.1 s | 0.8 s |
| `/notifications` | 4.4 s | 6.5 s | 1217 ms | 5.5 s | 154 | 0.92 MB | 2 / 99 KB | 19 | 5.1 s | 1.6 s |
| `/settings` | 4.7 s | 5.2 s | 343 ms | 5.1 s | 163 | 0.84 MB | 2 / 99 KB | 23 | 4.1 s | 1.9 s |
| `/crm` ² | 4.3 s | 7.1 s | 1403 ms | 7.2 s | 179 | 0.98 MB | 3 / 149 KB | 27 | 5.4 s | 1.3 s |
| `/profile` | 4.1 s | 4.5 s | 91 ms | 4.5 s | 157 | 0.79 MB | 2 / 65 KB | 23 | 3.7 s | 1.0 s |
| `/kyc` | 4.5 s | 5.4 s | 331 ms | 5.0 s | 163 | 0.81 MB | 1 / 50 KB | 23 | 4.1 s | 1.6 s |
| `/quotes` | 4.0 s | 4.5 s | 419 ms | 5.4 s | 173 | 0.93 MB | 3 / 102 KB | 27 | 4.0 s | 1.5 s |
| `/business-profile-score` | 4.2 s | 5.1 s | 377 ms | 4.8 s | 151 | 0.84 MB | 2 / 99 KB | 19 | 3.7 s | 1.4 s |

² The local test vendor's plan doesn't include the CRM, so `<TierGate>` sends it on to `/subscription`. This row is the
gate check plus the Subscription page loading after it: a seller without the CRM who taps it waits ~7 s to be shown
the plans. The CRM page itself wasn't measured; Phase 5 re-measures it with a Silver-or-higher test vendor.

**What the seller table shows.**
- Every seller page makes **19–36 Supabase calls**, and **15 of them are the same on every page**: `profiles`,
  `my_contact_info`, `is_admin`, `saved_folders`, `saved_items`, `recently_viewed`, `buyer_profiles` (twice),
  `my_feature_flags`, `vendor_profiles` (three times), `products`, `get_vendor_plan`, `vendor_entitlements`,
  `notifications` (a read and a count) and `chat_unread_counts` (twice). On Seller Home they arrive in three waves
  (starting 3.1 s, 3.7 s and 4.4 s) before the page's own `seller_home_summary`. The buyer-side stores (saves,
  recently viewed) are read on seller pages too. On production each wave is a Sydney round trip. (Phase 5.2)
- 150–190 requests and ~0.85 MB per first visit, almost all of it the shared shell, the warm-up and fonts (§3.3–§3.5).
- Main-thread blocking over 1 s on Notifications (1.2 s), Advertisements (1.1 s) and Seller Home (1.05 s), and on the
  `/crm` → `/subscription` redirect (1.4 s; 2.1 s in the second run).
- Analytics (36 calls, 192 requests) and Upload (data done at 9.0 s) are the heaviest seller pages.

### 2.3 Second sweep (repeat run, same day)

Both sweeps were run again later on 2026-11-27, unchanged: same script, same profiles, production still on bundle
`index-B6boMfCE.js` (main 8d19b19). Purpose: to check that the baseline is repeatable before plans are built on it.

| | Run 1 median mobile LCP | Run 2 median mobile LCP | Median change per page | Pages within ±15 % |
|---|---:|---:|---:|---:|
| Public and buyer pages (33, production) | 4.9 s | 4.7 s | 14 % | 18 of 33 |
| Seller pages (18, local stack) | 5.1 s | 4.8 s | 10 % | 14 of 18 |

Run 2, the pages that matter most (mobile LCP, run 1 → run 2):

| Page | Mobile LCP | Mobile TBT (run 2) | Data done (run 2) | Supabase calls | Warm LCP (run 2) | Desktop LCP |
|---|---:|---:|---:|---:|---:|---:|
| Buyer home `/home/new-arrivals` | 13.8 → 10.5 s | 1549 ms | 5.8 s | 11 | 10.0 s | 4.7 → 5.0 s |
| `/search/results?q=shirt` | 14.1 → 14.5 s | 2564 ms | 11.8 s | 40 | 4.2 s | 6.5 → 7.1 s |
| `/search` | 9.1 → 8.7 s | 874 ms | 6.2 s | 4 | 5.8 s | 2.7 → 4.0 s |
| Product `ffe46099…` | 6.6 → 7.5 s | 517 ms | 8.4 s | 15 | 4.7 s | 3.6 → 4.1 s |
| Product `fd983490…` | 5.7 → 6.2 s | 700 ms | 6.8 s | 15 | 4.8 s | 3.3 → 2.9 s |
| Storefront `/vendor/04d9d594…` | 7.2 → 7.0 s | 433 ms | 5.7 s | 7 | 6.8 s | 2.9 s → not recorded ³ |
| `/categories` | 8.0 → 6.8 s | 65 ms | – | 0 | 6.2 s | 2.2 → 3.4 s |
| `/` (Landing) ⁴ | 6.3 → 5.3 s | 37 ms | – | 0 | 4.8 s | 1.6 → 2.8 s |
| `/seller` | 5.2 → 4.0 s | 1689 ms | 4.8 s | 1 | 4.0 s | 2.1 → 2.6 s |
| Text pages (Terms, Privacy, Refund, Contact, Grievance, Login) | 3.9–5.1 → 4.4–4.7 s | 0–133 ms | – | 0 | 3.0–3.6 s | 1.2–2.0 → 2.1–2.3 s |
| Journal (`/blogs…`, 8 pages) | 2.0–4.3 → 2.1–2.9 s | 93–481 ms | 2.1–3.1 s | 1–3 | 1.1–2.1 s | 0.9–1.4 → 1.0–2.0 s |
| Seller Home | 5.0 → 5.7 s | 795 ms | 4.9 s | 19 | 4.8 s | 1.3 → 1.7 s |
| Seller `/chat` | 4.2 → 6.8 s | 421 ms | 6.4 s | 24 | 4.8 s | 0.8 → 0.9 s |
| Seller `/notifications` | 6.5 → 5.1 s | 1291 ms | 4.4 s | 19 | 5.1 s | 1.6 → 1.4 s |

³ The page painted at 2.1 s but the browser reported no LCP entry on that run.
⁴ In both sweeps `/` is the first page loaded, on a brand-new connection: run 2's first load had 3.1 s to first byte
and LCP 9.2 s. Re-measured on its own it was 5.3 s, the figure used here. A real first-time visitor pays some of that
cold-connection cost too, which is what Phase 1.3 (`preconnect`) and the edge cache address.

**What the second run confirms.**
- The baseline holds: medians moved by 0.2–0.3 s, and every finding in §3 reproduced. Only 2 of 201 listing photos
  shown were thumbnails (run 1: 2 of 217); 284 of 423 images (67 %) were more than 1.5× oversized (run 1: 69 %); and
  repeat visits were served **0 of 3,383** requests from the browser cache.
- Single pages move by 10–15 % from run to run on the throttled phone profile (more on the unthrottled desktop
  profile, which uses this machine's real connection: desktop was 0.3–1 s slower across the board in run 2). So Phase 0's
  `npm run perf` should run each page **3 times and report the median**, and a phase's acceptance check should be
  read against that median, not a single run.
- The worst pages are the same in both runs: home feed (10.5–15.1 s), search results (14.1–14.5 s), search
  (8.7–9.1 s), product (5.7–7.5 s), storefront (7.0–7.2 s).

---

## 3. Why it is slow (findings with evidence)

### 3.1 The database is in Sydney

- `get_project`: region **`ap-southeast-2` (Sydney)**. Users are in India; requests enter Cloudflare at `BOM`
  (Mumbai), then travel to Sydney and back.
- Response headers show the database is fast: `x-envoy-upstream-service-time: 7` ms for a one-row read,
  `37` ms for `feed_products`.
- From this machine (India): a new connection's first Supabase call takes **1.3–1.6 s** (`categories?limit=1`,
  `/auth/v1/health`, `feature_flags`); on an open connection each call still takes **~0.4 s**.
- Under the phone profile, the home feed's 11 calls each took **2.0–2.6 s** in parallel.
- Storage is in Sydney too: a listing photo already in Cloudflare's cache (`CF-Cache-Status: HIT`) still took
  0.45–1.5 s to first byte; a miss goes to Sydney.
- Auth, Realtime and the edge functions (`product-thumbs`, `image-search`, payments) all run in Sydney as well.

This one fact multiplies every other problem: each round trip, each image fallback and each sequential wave of calls
costs ~0.4–1.3 s instead of ~0.05 s.

### 3.2 Listing photos: the thumbnails don't exist, so every card downloads the original

- `storage.objects`: `product-images` holds **423 photos (69.5 MB, avg 168 KB, max 2.5 MB)**;
  `product-thumbs` holds **4**.
- `<CardPhotos>` (`src/components/buyer/CardPhotos.tsx`) asks for `product-thumbs/<path>.jpg` first and falls back to
  the original on error. The missing thumbnail answers **400 after 1.2–1.7 s** (`CF-Cache-Status: BYPASS`, so every
  visitor pays it, every time), and only then does the original start downloading.
- Why so few thumbnails: `trg_products_thumbs` is `AFTER UPDATE OF status … WHEN new.status = 'live' AND old.status
  IS DISTINCT FROM new.status`. A listing **inserted** as live (all 280 sample listings, 2026-11-24) or a photo
  **added or replaced** on a live listing never queues one. There is no backfill.
- Examples from the home feed on the phone: a 1193×1200 photo of **644 KB** shown at 173×173 px; 274 KB, 270 KB and
  191 KB photos shown at ~170 px. Across all measured pages, **309 of 446 images (69 %)** were more than 1.5× larger
  than their displayed size × screen density; only 2 of 217 listing photos shown were thumbnails.
- The home feed's LCP element is a listing photo, and every `<CardImg>` is `loading="lazy"`, including the first
  row on screen, so the browser deliberately starts the most important image late.
- No `<img>` in the app has `srcset`/`sizes` or `fetchpriority`; 2 of 124 have `width`/`height`.
- Originals are stored with `Cache-Control: max-age=3600` (1 hour), although every upload path is unique
  (`<vendor>/<timestamp>-<random>.jpg`) and could be cached for a year.
- **Bundled images:** `dist/assets` ships 204 JPG/PNG files (7.7 MB). Examples: category tiles are 480×480 JPEGs
  (23–46 KB each) shown at 77×77 px; the Cosora logo is a 65 KB PNG shown at 116 px on every page;
  `Trustedseal.png` is 152 KB; category hero JPEGs are 100–194 KB.

### 3.3 Nothing is cached between visits

- Every `/assets/*` response (fingerprinted, so it never changes) carries
  `Cache-Control: public, max-age=0, must-revalidate`. `vercel.json` sets no caching header for `/assets/`.
- On a reload in the same browser, **0 of 114 requests** were served from the browser cache, and the transfer was
  the same as the first visit (Terms: 752 KB vs 755 KB; home: 2.5 MB vs 3.2 MB, the difference being images).
- There is no saved query cache (`persistQueryClient` isn't used), so a returning visitor also waits for every data
  call again.

### 3.4 The first script is too big

`index-*.js` is 1.29 MB (386 KB gzip, 393 KB brotli). Source-map breakdown of what is in it:

| In the entry chunk | KB (minified) | Needed for the first paint? |
|---|---:|---|
| react-dom | 128 | yes |
| `src/lib/queries/*` (all query modules) | 125 | only the current page's |
| `src/data/sellerCategories.ts` | 109 | no: seller forms and filters (pulled in by `lib/queries/products.ts` and `lib/searchFilters.ts`) |
| `@supabase/auth-js` | 97 | yes |
| framer-motion + motion-dom | 113 | no: a few modals, the hero and rails |
| `@supabase/realtime-js` + phoenix | 56 | no, but it can't be split off: `supabase-js` imports it statically (§3.9) |
| `src/components/buyer/*` (eager ones) | 56 | partly |
| `@tanstack/query-core` | 35 | yes |
| sonner | 32 | no (toasts) |
| lucide-react (icons used) | 29 | partly |
| `@supabase/storage-js` | 22 | no |
| Eager pages: Landing 18, NewArrivals 16, Register 10, Login 7, OtpVerify 7 | 58 | only the one being opened |
| `src/data/countries.ts` 17, `sizeCharts.ts` 8, `categoryTileImages` 10, `categoryPicture` 9 | 44 | no |
| VideoCloseUpsViewer 12, QuickRfqModal 8, ShareSheet 7, SaveToFolderModal 4, CallNumberModal | ~35 | no (opened on tap) |

Other script weight:
- `index.html` loads **six Google font families** (Barlow Condensed, Dancing Script, DM Sans, Open Sans, Playfair
  Display, Roboto) in one **render-blocking** stylesheet from two extra origins; pages then download 79–172 KB of font
  files. Tailwind's `font-sans` is DM Sans, but the live site theme (Cosora-Admin › Site theme) sets the body to
  **Open Sans with Roboto** (checked on production 2026-11-27: those are the faces that load; DM Sans loads on none
  of the measured pages). The other families appear in 1–4 files each.
- `index.css` is 181 KB (28 KB gzip), one file for every page.
- The Hindi and Gujarati catalogues are **562 KB and 558 KB** (245 KB gzip each), and `main.tsx` holds the first
  paint up to 3 s for them.
- Seller `Analytics` is a 460 KB chunk (122 KB gzip; recharts); `Onboarding` 117 KB.

### 3.5 The page warm-up competes with the page being opened

`scheduleWarmPages()` (`src/lib/lazyPage.ts`) starts 2 s after `load` and imports 16 pages marked `warm: true`
(SellerHome, ProductDetail, ForYou, Profile, Chat, ChatThread, Categories, PostRequirement, MyQuotes, Sale,
SearchResults, VendorProfile, Trends, Following, SavedCollections, Search) with all their dependencies, for every
visitor and role. On a phone that means ~100 extra script requests and ~250 KB on Terms (114 requests, 640 KB of
script for a text page), fetched while the page's own photos and data are still loading. It skips only `saveData` and
2G. `import()` also parses and runs each module, which costs CPU on a slow phone.

### 3.6 Too many round trips, and they start late

- **Late start.** On the phone, the first Supabase call starts at **~3.7–3.9 s**, after the HTML, the 393 KB
  script, the fonts and the React boot. There is no `preconnect` to the Supabase host, so the ~1 s TLS handshake to
  Sydney also waits until then.
- **Waves.** The product page makes 15 calls in three sequential waves (start 3.9 s → 5.3 s → 6.5 s): product,
  sample ids and `attribute_definitions`, then ads, videos, documents, reviews, review summary, seller stats,
  related; then plans and more products. Each wave costs a Sydney round trip.
- **Duplicates on the home feed:** `feed_products` ×2, `active_ads` ×2, `pref_category_map` ×2 (two rails and two
  query keys asking separately), plus `top_vendors`, `sample_vendor_ids`, `featured_listings_on`,
  `video_closeups_feed` and `spotlight_listings`: 11 calls for one screen.
- **Per-card analytics:** search results send **27 `log_engagement_event` calls** (one per card shown), plus 2
  `search_ads`, 2 `products`, 2 `vendor_profiles`: 40 calls in total.
- **Whole tables:** the product page and search results download all of `attribute_definitions` (**96 KB**, 1.4–2.8 s
  on the phone) to show one category's attributes.
- **No GET RPCs:** all 116 `supabase.rpc(…)` calls are `POST`, so none can be cached by a CDN or routed to a read
  replica.
- **No prefetch:** nothing is fetched on link hover or touch, so every tap starts from zero.

### 3.7 Heavy rendering on phones

Total Blocking Time on the phone profile: search results **4.4 s** (5,696 DOM nodes, 36 long tasks), home feed
**2.3 s** (23 long tasks), storefront **1.9 s**, `/search` 1.5 s, `/seller` 1.3 s. Each card is a fairly deep tree
(photos, badges, tags, motion wrappers), and whole result lists are rendered at once.

### 3.8 What is already good (keep it)

- Pages are split per route (`lazyPage`, review M-34) and a deploy-replaced chunk reloads once.
- React Query has a 60 s `staleTime` and no refetch on focus.
- Feeds are precomputed server-side (`admin.feed_rank`, `feed_products()`).
- HTML is served from Vercel's edge in ~0.3 s with brotli.
- Video close-ups use posters and mount `<video>` only near the active slide (`preload="none"`).
- The performance advisor reports no slow-policy (`auth_rls_initplan`) or missing-index problems on hot tables; it
  lists 130 unused indexes (write overhead only) and 2 admin tables without a primary key.
- The big seller-only libraries already load only with their pages: recharts (Analytics), tus-js-client (video
  upload), vaul (Onboarding), qrcode (review link), embla (Seller Home), cmdk (category picker). See §3.9.

### 3.9 Library ("vendor") code

Measured on 2026-11-27 from a source-map build of `main` (the same code as production; its entry file is 1.26 MB /
377 KB gzip against production's 1.29 MB / 386 KB). Every byte of all 230 script files was traced back to its source
file through the source maps; gzip sizes are each part compressed on its own, and they add up to the file's real
gzip size.

**Whole app.** 3.37 MB of script (1.55 MB gzip), of which **1.37 MB (41 %) is npm libraries**. The app has 54
runtime dependencies; no package is bundled twice. There is **no separate library chunk**: `vite.config.ts` has no
`manualChunks` ("manual chunking caused runtime issues", since 2026-05-17), so all libraries that the first page
needs are inside `index-*.js`.

**Libraries in the first script (every visitor, buyer or seller, every page):**

| Library | KB minified | KB gzip | Can it leave the first script? |
|---|---:|---:|---|
| react + react-dom + scheduler | 139 | 45.0 | no |
| `@supabase/auth-js`, `postgrest-js`, `functions-js`, `supabase-js` | 125 | 31.6 | no (sign-in and every data call) |
| **framer-motion** + motion-dom + motion-utils | **115** | **38.2** | **yes** (3.3) |
| Radix tooltip, dialog, popper + floating-ui, react-remove-scroll | 64 | 22.5 | partly: dialog and scroll-lock come from the tap-to-open modals (3.1); tooltip from `TooltipProvider` in `App.tsx` |
| `@supabase/realtime-js` + phoenix | 56 | 16.4 | **no**: `supabase-js` 2.110 imports `RealtimeClient` statically |
| `@tanstack/react-query` + query-core | 37 | 11.0 | no |
| sonner (toasts) | 32 | 9.2 | no (`toast()` is called from everywhere) |
| lucide-react (the icons used) | 29 | 5.7 | partly, with the pages that use them |
| `@supabase/storage-js` + iceberg-js | 27 | 6.9 | **no**: also a static import of `supabase-js` |
| react-router | 21 | 7.8 | no |
| tailwind-merge, clsx, class-variance-authority | 21 | 7.0 | no |
| **`@radix-ui/react-toast` + the shadcn `<Toaster />`** | **14** | **5.3** | **yes: unused.** `App.tsx` mounts it, but nothing calls `useToast()` or `toast({…})`; every toast goes through sonner (3.8) |
| input-otp | 9 | 3.8 | no while the OTP page stays eager (D-7) |
| other (next-themes, use-sidecar, tslib…) | 5 | 2.7 | – |
| **Total libraries** | **690** | **≈ 211** | of 1,249 KB / 377 KB gzip |

What this means:
- **The floor.** The libraries that must stay (react, Supabase including realtime and storage, react-query, router,
  sonner, tailwind-merge, input-otp, the icons and Radix pieces the shell uses) are about **150–155 KB gzip on
  their own**. With the app shell (~70 KB), the eager sign-in pages (7 KB) and the shared query code on top, the
  first script can't get much below **~250 KB gzip** without replacing `supabase-js` by its separate parts, which
  would touch sign-in and is not proposed. The earlier target of 170 KB in §4 was not reachable; it is now
  ≤ 250 KB, with ≤ 220 KB as a stretch through splitting the app shell further.
- **What can go:** framer-motion (38 KB gzip), the unused Radix toaster (5 KB), the tap-to-open modals with the
  dialog code they pull in (~15 KB), the data tables (40 KB), and most of `src/lib/queries/*` (~25 of 37 KB):
  about 125 KB gzip in total, taking the first script from 377 to ~250 KB gzip.
- **framer-motion is imported by 89 files**, not 12 as first counted, so 3.3 is a larger change than estimated: it
  is about using `LazyMotion` + `m` everywhere, with CSS for the simple fades.
- **Deploys throw away the library cache.** `main` had 232 commits on 16 different days in the last 30, and every
  deploy gives `index-*.js` a new name. Once 1.1 turns on the year-long cache, a returning visitor would still
  re-download all 377 KB after each deploy, although ~211 KB of it (the libraries) didn't change. A separate
  library chunk that changes only when `package.json` does (1.7) means only the app part (~165 KB gzip, falling
  to ~90 KB after Phase 3) is fetched again.

**Libraries that load with their own page (whole app):**

| Library | KB minified | Loaded by | Note |
|---|---:|---|---|
| recharts + d3-*/victory-vendor + lodash + react-smooth + decimal.js-light + recharts-scale + others | 402 (≈ 107 gzip) | seller Analytics (`Analytics-*.js`, 449 KB, 119 KB gzip) | 3.6 loads it only when the charts scroll into view |
| tus-js-client + url-parse + js-base64 | 59 | video upload | fine; only on upload |
| vaul (drawer) | 28 | seller Onboarding | fine |
| qrcode | 22 | `ReviewLinkShare` | fine |
| embla-carousel | 18 | Seller Home | fine |
| cmdk + Radix scroll-area + popover | 27 | `SubCategorySelector` (seller forms) | fine |
| date-fns | 11 (3 files) | Notifications and others | fine |

**Seller side.** A seller's first visit downloads the same 377 KB first script as a buyer's, plus the page's file
(Seller Home 18 KB gzip, Analytics 119 KB gzip, Onboarding 29 KB gzip). Measured page weights for all 18 seller
pages are in §2.2 (0.79–1.38 MB per first visit, of which ~0.6 MB is script). The only seller library worth
changing is recharts on Analytics (3.6).

**Unused packages** (cost install time, not page speed): `zod` and `@hookform/resolvers` have no importer;
`react-hook-form`, `react-day-picker`, `react-resizable-panels` and six Radix packages (aspect-ratio,
context-menu, hover-card, menubar, navigation-menu, toggle-group) are imported only by their own
`src/components/ui/*` file (`form`, `calendar`, `resizable`, …), which nothing imports; `@radix-ui/react-toast`
joins them after 3.8. Tree-shaking already keeps them out of the pages,
so removing them is tidying (6), not a speed fix.

---

## 4. Targets

Lab targets, measured with the Phase 0 script on the same profiles as the baseline:

| Measure | Baseline (worst / typical) | Target |
|---|---|---|
| Mobile LCP, home feed | 15.1 s | ≤ 3.0 s |
| Mobile LCP, product / storefront / search results | 5.7–14.1 s | ≤ 3.0 s |
| Mobile LCP, text pages (Terms, Help, Login…) | 3.9–5.1 s | ≤ 2.0 s |
| Mobile LCP, second visit | 3.0–13.1 s | ≤ 1.5 s |
| Mobile TBT | up to 4.4 s | ≤ 300 ms |
| Desktop LCP | up to 6.5 s | ≤ 1.5 s |
| Entry script (gzip) | 386 KB | ≤ 250 KB (stretch 220 KB; §3.9 explains the floor) |
| Script re-downloaded by a returning visitor after a deploy (gzip) | 386 KB | ≤ 100 KB (library chunk stays cached) |
| Requests on a first visit, text page | 114 | ≤ 25 |
| Image bytes, first screen of the home feed (phone) | ~2.4 MB | ≤ 350 KB |
| Supabase calls before the first screen is complete | 11 (home), 15 (product), 40 (search) | ≤ 3 |
| One Supabase read from India, warm connection | ~400 ms | ≤ 80 ms (after D-2) |

Field targets once Phase 0's real-user data is in: Core Web Vitals "good" at the 75th percentile for Indian mobile
visitors (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1).

---

## 5. The build plan

Seven phases. Phases 1–3 need no new service and no decision from Mitra beyond the usual merge approval; they can
start at once. Phase 4 includes the region decision (D-2). Each phase is its own branch and worktree, built and
checked locally, and merged only after Mitra approves (a `main` push deploys production). Migrations follow
`documentation/claude.md` (named by live version, applied with the CLI, md5-checked, policies with `(select …)`,
self-guarded definer functions with `coalesce`).

### Phase 0: Measurement and guardrails (½ day)

| # | Task | Where |
|---|---|---|
| 0.1 | Commit the measurement script used for this baseline as `scripts/perf/page-speed.mjs`, with the URL list (sitemap + the 13 extra buyer pages + seller pages for the local stack) and the analytics stubs. Each page runs 3 times and the median is reported (single runs move 10–15 %, §2.3); one throw-away warm-up load before the first page, so the first URL doesn't pay the new-connection cost alone. The seller list uses a test vendor on a plan with the CRM, so `/crm` measures the CRM. Output: JSON + the markdown tables in §2. | `scripts/perf/` |
| 0.2 | Save this baseline as `scripts/perf/baseline-2026-11-27.json` and add `npm run perf` (production) and `npm run perf:local`. | `package.json` |
| 0.3 | Bundle budget: `scripts/perf/bundle-budget.mjs`, run at the end of `npm run build`, fails if the entry chunk exceeds the target (start at the current size and lower it with each phase until it reaches 250 KB gzip), if the library chunk (1.7) grows by more than 10 KB gzip without a `package.json` change in the same commit, or if a new npm package appears in the entry or library chunk (the script prints the per-package table from §3.9, built with the same source-map method) or if any image in `dist/assets` is over 150 KB. | `package.json` build |
| 0.4 | Real-user field data (**D-4**): either Vercel Speed Insights, or the `web-vitals` library (~2 KB) sending LCP/INP/CLS/TTFB, page and connection type to a small `web_vitals` table through one batched RPC (respecting the analytics consent answer), with a 7-day view in Cosora-Admin. | `src/lib/analytics/` |

**Done when:** `npm run perf` reproduces the §2 table within noise, and the build prints the entry size.

### Phase 1: Caching and the app shell (1–2 days, no backend)

| # | Task | Detail |
|---|---|---|
| 1.1 | **Cache fingerprinted files for a year.** | `vercel.json` → `headers`: `{"source": "/assets/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}]}`. HTML keeps `max-age=0, must-revalidate` (it must, so a deploy is picked up). Check that `api/*`, `sitemap.xml` and the `/blogs` rewrites keep their current headers. |
| 1.2 | **Fonts.** | Self-host DM Sans (the body font) as one variable `woff2`, Latin subset, `font-display: swap`, `<link rel="preload">` in `index.html`. Load Playfair Display, Barlow Condensed, Dancing Script, Open Sans and Roboto only in the components that use them (or replace them with DM Sans where the design allows, D-5). Remove the render-blocking Google Fonts stylesheet and its two `preconnect`s. Keep the theme script's optional admin font (it already loads after paint). |
| 1.3 | **Connect to Supabase early.** | `<link rel="preconnect" href="https://vxdhhgdfubqedfpwfyrb.supabase.co" crossorigin>` and `dns-prefetch` in `index.html`, so the ~1 s TLS handshake overlaps with the script download. |
| 1.4 | **Shrink the page warm-up.** | In `lazyPage.ts`: warm only on `effectiveType === "4g"`, no `saveData`, `deviceMemory ≥ 4`; start after the first page's data has arrived and the browser is idle (not "2 s after load"); warm only **3** pages chosen for the current role (buyer: ProductDetail, SearchResults, VendorProfile; seller: SellerHome, Products, Leads); fetch with `<link rel="prefetch">` (download only, low priority) instead of `import()` (download, parse and run). Add prefetch on `pointerenter`/`touchstart` for links to warmed pages. |
| 1.5 | **Hindi/Gujarati catalogue.** | Split `hi`/`gu` into a "core" catalogue (header, nav, home, product, common buttons; target ≤ 60 KB) and per-area catalogues loaded with their pages. Cache the catalogue in `localStorage`/IndexedDB keyed by its hash, so a returning Hindi visitor doesn't wait for it before paint; cut the 3 s cap to 1 s. |
| 1.7 | **A separate, stable library chunk.** | In `vite.config.ts` → `build.rollupOptions.output.manualChunks`, put only self-contained libraries that never import app code in one `vendor-core` chunk: `react`, `react-dom`, `scheduler`, `react-router`, `react-router-dom`, `@remix-run/router`, `@supabase/*`, `iceberg-js`, `@tanstack/*` (≈ 140 KB gzip). Everything else stays where Rollup puts it. This is far narrower than the attempt that "caused runtime issues" (the usual cause is splitting React from the libraries that use it, or putting app code in a manual chunk). Check: `vite preview` plus the full Playwright suite, sign-in with the dummy OTP, the one-time reload on a replaced chunk, and a deploy-to-deploy test (build twice with an app-only change; the `vendor-core` file name must not change). With 1.1 this turns ~211 KB of re-download per deploy into ~0 for returning visitors. If anything breaks, drop 1.7 alone; the rest of Phase 1 doesn't depend on it. |
| 1.6 | **Vercel function region.** | Pin `api/*` (sitemap, csp-report) to `bom1` in `vercel.json` (`"regions": ["bom1"]`), and check the `cosora-blogs` project's function region. |

**Done when:** a second visit to any page makes 0 requests for `/assets/*`; Terms on the phone paints ≤ 2.5 s cold
and ≤ 1.5 s warm; a text page makes ≤ 30 requests in its first 10 s.

### Phase 2: Images (3–4 days; the "images taking extra time" part)

| # | Task | Detail |
|---|---|---|
| 2.1 | **Make thumbnails for every photo.** | Migration: fire `trg_products_thumbs` also `AFTER INSERT` when `status = 'live'`, and add a trigger on `product_images` (insert, and update of `url`) that queues the photo when its listing is live. One-off backfill job: queue every live listing's photos in batches of 20 a minute (the `product-thumbs` function takes ~2 s CPU per photo), with progress in a table. Needs Mitra's go-ahead as a new job. |
| 2.2 | **Never request a thumbnail that doesn't exist.** | Record each finished thumbnail (`product_images.thumb_ready_at`, written by `product-thumbs` after the upload), and have `feed_products()`, `search_products()`, `related_products()` etc. return `thumb_url` only when it is ready. `<CardPhotos>` uses `thumb_url` if present, else the original: no 404, no 1.2–1.7 s wait. |
| 2.3 | **Several sizes, modern format** (**D-3**, see §6). | Either (a) Supabase Storage image transformations (`/storage/v1/render/image/public/…?width=…&quality=70`, WebP/AVIF served automatically; requires the Pro plan), which can replace `product-thumbs` entirely; or (b) a Bunny CDN pull zone with Bunny Optimizer in front of public Storage (`img.cosora.in`, edges in Mumbai/Chennai; Bunny is already used for video), resizing by `?width=`; or (c) extend `product-thumbs` to write 240 / 480 / 960 px WebP. (a) and (b) also move image delivery closer to India. |
| 2.4 | **One `<Img>` component** for listing, seller, category and ad pictures. | `src` + `srcset` (240w, 480w, 960w) + `sizes` from the card's grid, `width`/`height` (no layout shift), `decoding="async"`, `loading="lazy"` **except** the first row on screen, which gets `loading="eager"` and `fetchpriority="high"`. Pages pass `priority` to their first 2–4 cards. Replace the 124 `<img>` tags where they show those pictures. |
| 2.5 | **Year-long cache on uploads.** | Upload listing, logo, banner and premises photos with `cacheControl: "31536000"` (paths are unique per upload). Backfill the existing 419 objects' `Cache-Control` with a one-off script (copy to self with new metadata). |
| 2.6 | **Bundled images.** | One-off `sharp` script (or `vite-imagetools`) for `src/assets`: category tiles to 160 and 320 px WebP (from 480 px JPEG); the logo PNG (65 KB) replaced by the existing SVG or a 2× WebP (~6 KB); `Trustedseal.png` (152 KB) to WebP at display size; category heroes and Studio hero to ≤ 60 KB WebP with a 2× variant. Target `dist/assets` images 7.7 MB → ≤ 2 MB; the budget in 0.3 keeps it there. |
| 2.7 | **The Landing hero.** | `<link rel="preload" as="image" fetchpriority="high">` for the Studio hero (the LCP element on `/`), sized for phones. |
| 2.8 | **Clean-ups found on the way.** | Remove `images.unsplash.com` pictures still shown on some pages (33 seen), or bundle them; check that the moderation follow-up (thumbnails removed on takedown, ToDo) still holds with the new sizes. |

**Done when:** the home feed on the phone downloads ≤ 350 KB of images for its first screen, has no 4xx image
requests, and its LCP image starts loading within 300 ms of its data arriving; `npm run perf` reports ≤ 10 % of
images oversized.

### Phase 3: Smaller first script, less work on the phone (3–4 days)

| # | Task | Detail |
|---|---|---|
| 3.1 | **Opened-on-tap modals load when first opened** (`SaveToFolderModal`, `CallNumberModal`, `QuickRfqModal`, `ShareSheet`, `VideoCloseUpsViewer`). Keep `Landing` and `NewArrivals` eager (they are the two first pages), but split NewArrivals' rails below the fold. **Sign-in pages (Login, Register, OtpVerify, AuthCallback) stay eager unless Mitra decides otherwise (D-7):** `documentation/claude.md` keeps them in the first script since review M-34, so the sign-in screen never waits on a download. Only their loading changes, never the sign-in flow. | `App.tsx`, `BuyerShell` |
| 3.2 | **Move `sellerCategories.ts` (109 KB) out of the entry.** `lib/queries/products.ts` and `lib/searchFilters.ts` import it for labels; give them a small generated lookup (id → label, ~8 KB) and keep the full table for the seller forms that need it. Same for `countries.ts` and `sizeCharts.ts`. | `src/data/`, `src/lib/` |
| 3.3 | **framer-motion out of the entry (38 KB gzip).** Use `LazyMotion` + `m` with `domAnimation` loaded async (~5 KB stays in the entry), or plain CSS transitions for simple fades and slides (hero, rails, to-top button). 89 files import `framer-motion`; do the eager ones first (shell, Landing, NewArrivals, the buyer cards), then the rest in one sweep, and add a lint rule against `motion.` / `import { motion }`. | 89 files (§3.9) |
| 3.4 | **Realtime only for signed-in users, after the first paint.** `RealtimeHubProvider` opens its channels only when a session exists and the browser is idle. This saves the connection and its messages, **not bytes**: `supabase-js` 2.110 imports the realtime and storage clients statically, so their 23 KB gzip stays in the entry (§3.9). | `src/lib/realtimeHub.tsx` |
| 3.5 | **Render less at once.** Search results, home feed and storefront: render the first 12 cards, the rest as the user scrolls (IntersectionObserver), plus `content-visibility: auto` on card rows; `React.memo` the card; no motion wrapper per card. Target TBT ≤ 300 ms on those pages. | `SearchResults`, `NewArrivals`, `VendorProfile`, `ListingProductCard` |
| 3.6 | **Seller Analytics:** load the charts (recharts, ~330 KB) only when their section scrolls into view; show the numbers first. | `src/pages/Analytics.tsx` |
| 3.7 | **CSS:** check Tailwind's `content` globs and remove unused component CSS; split the Landing-only styles (`/* Preserve original fonts for Landing page */`) into the Landing chunk. | `index.css` |
| 3.8 | **Remove the unused Radix toaster (5 KB gzip).** `App.tsx` mounts both `<Toaster />` (Radix, `components/ui/toaster`) and `<Sonner />`; no file calls `useToast()` or `toast({…})`, every toast is sonner's. Drop the Radix `<Toaster />` and its `ui/toast`, `ui/toaster`, `hooks/use-toast` files. | `App.tsx`, `src/components/ui/` |
| 3.9 | **`TooltipProvider` at the root** pulls Radix tooltip + popper + floating-ui (~12 KB gzip) into the entry. Check which first-screen components use tooltips; if none, move the provider into the shells (`BuyerShell`, the seller layout) that load with their pages. | `App.tsx` |

**Done when:** entry chunk ≤ 250 KB gzip (`bundle-budget.mjs`, 0.3); no framer-motion, `@radix-ui/react-toast` or `sellerCategories` in the entry; Terms on the phone paints ≤ 2.0 s cold; search results' TBT ≤ 300 ms.

### Phase 4: Latency, fewer and earlier data calls (5–8 days, includes D-2)

| # | Task | Detail |
|---|---|---|
| 4.1 | **Edge cache for public data.** Data that is the same for every signed-out visitor is served through Vercel functions in `bom1` (Mumbai) that call Supabase with the anon key and return `CDN-Cache-Control: s-maxage=60, stale-while-revalidate=600`: the signed-out home feed rails (`feed_products` default call, `top_vendors`, `featured_listings_on`, `spotlight_listings`, `video_closeups_feed`, `sample_vendor_ids`), `categories`, `pref_category_map`, `attribute_definitions`, `subscription_plans`, `feature_flags`/site config, and `active_ads` per slot and category. Signed-out visitors get these from Mumbai in ~50 ms instead of 0.4–1.3 s from Sydney. Signed-in, personalised calls (For You, Following, saved, chats, seller pages) keep going to Supabase directly. CSP `connect-src 'self'` already allows it. | `api/public/*.ts`, `src/lib/queries/*` |
| 4.2 | **One call per page.** New read-only `STABLE` RPCs that return everything a page's first screen needs in one JSON: `home_page(p_tab, p_category)` (all rails, ads and spotlight), `product_page(p_id)` (listing, photos with `thumb_url`, videos, documents, review summary, seller stats, related, ads, plan badge), `vendor_store_page(p_id)`, `search_page(p_q, filters)` (results, ads, facet counts), and for sellers `seller_home_page()`. They replace the 3 waves on the product page with 1 call and the 11 home calls with 1–2. Lower sections can still load on scroll. | migrations + `src/lib/queries/*` |
| 4.3 | **Call read-only RPCs with `GET`** (`supabase.rpc(fn, args, { get: true })`) so the edge cache (4.1) and a read replica (4.7) can serve them. | `src/lib/queries/*` |
| 4.4 | **Start the first page's data before React renders.** In `main.tsx`, look at `location.pathname` and start the matching first call (via `queryClient.prefetchQuery` with the page's own query key) in parallel with loading the page chunk, so data and code download together. With 1.3, the connection is already open. | `src/main.tsx`, `src/lib/routeData.ts` |
| 4.5 | **Remember data between visits.** `@tanstack/react-query-persist-client` with an IndexedDB persister: public feeds, categories and the signed-in user's own lists kept up to 24 h, shown at once on the next visit and refreshed in the background. The cache key includes the build hash and the user id; sign-out clears it. Nothing private for another account can be shown. | `App.tsx` |
| 4.6 | **Batch analytics.** Engagement events, impressions and views go into one queue flushed every 3 s, on `visibilitychange` and on `pagehide` via `navigator.sendBeacon`, to a new `log_engagement_events(jsonb[])` RPC (same rate limits and per-visitor caps as today, applied per element). Search results: 27 calls → 1. | `src/lib/queries/engagement.ts`, migration |
| 4.7 | **Region (D-2).** See §6. Recommended: move the project to `ap-south-1` (Mumbai) before launch. Fallback: a Mumbai read replica behind the Supabase API load balancer (geo-routes `GET`s, hence 4.3). | runbook in §7 |
| 4.8 | **De-duplicate.** Combine the two `pref_category_map` queries into one query key; let SponsoredRail and the feed share one `active_ads` window per page (they already split it by index); one `feed_products` call where two rails ask for overlapping data. Mostly absorbed by 4.2. | `forYou.ts`, `ads.ts`, `feed.ts` |
| 4.9 | **`attribute_definitions` by category.** The product page asks only for its category's rows (`.eq("category_id", …)`); the full set (forms, filters) comes from the edge cache (4.1) with a long `max-age`, since it changes only on an admin edit. 96 KB → ~3 KB per product page. | `attributeDefinitions.ts` |

**Done when:** the first screen of home, product, storefront and search results needs ≤ 3 calls; signed-out home
data arrives ≤ 300 ms after the script runs on the phone profile; after D-2, a warm Supabase read from India takes
≤ 80 ms.

### Phase 5: Seller side (2–3 days, after Phases 1–4)

Seller pages share all of the above (entry script, fonts, caching, warm-up, Sydney). In addition, from §2.2:

| # | Task | Detail |
|---|---|---|
| 5.1 | **One call for Seller Home.** `seller_home_page()` returns the plan, usage, score, counts, recent leads, notifications summary and tiles for the signed-in seller (19–20 calls today). | migration + `SellerHome.tsx` |
| 5.2 | **One start-up call for a signed-in account: `session_bootstrap()`.** Every signed-in page load makes the same 15 calls in three waves before the page's own data (§2.2): `profiles`, `my_contact_info`, `is_admin`, `saved_folders`, `saved_items`, `recently_viewed`, `buyer_profiles` ×2, `my_feature_flags`, `vendor_profiles` ×3, `products`, `get_vendor_plan` **and** `vendor_entitlements`, `notifications` (GET and a HEAD count), `chat_unread_counts` ×2. One definer function returns the caller's own rows for all of them (same columns the app reads today, the caller's own data only, `coalesce`d guard), seeded into each existing query key so no screen changes how it reads. The buyer-side stores (saves, recently viewed) load on the seller side only when a buyer page opens; `get_vendor_plan` is dropped where `vendor_entitlements` already answers. Kept fresh by the existing live-updates hub, and saved between visits (4.5). On production this removes two to three Sydney round trips from every signed-in page load. | `AuthContext`, `UserRoleContext`, `StoreSync`, `DashboardSidebar`, `DashboardHeader`, migration |
| 5.3 | **Analytics, Advertisements, Leads:** one RPC each for their first screen; charts load on scroll (3.6). | pages + migrations |
| 5.4 | **Upload:** compress photos in a Web Worker (the 1600 px shrink runs on the main thread today) and upload them in parallel while the seller fills the next step. | `Upload.tsx`, `src/lib/imageCompress.ts` |
| 5.5 | **Warm-up for sellers:** Seller Home, Products, Leads only (1.4). | `lazyPage.ts` |

**Done when:** every seller page measured in §2.2 makes ≤ 6 Supabase calls before its first screen is complete and
paints ≤ 3.0 s on the phone profile against the local stack plus a simulated 80 ms RTT.

### Phase 6: Keep it fast (ongoing)

- `npm run perf` before every release that touches pages; the bundle budget (0.3) fails a build that grows the entry.
- New npm packages: a pull request that adds a runtime dependency states its gzip size and which chunk it lands in
  (the 0.3 table shows both); anything over 10 KB gzip loads with the page that needs it, never in the entry.
- Tidying (no speed effect): remove `zod`, `@hookform/resolvers`, `react-hook-form`, `react-day-picker`,
  `react-resizable-panels`, the six unused Radix packages and their unused `src/components/ui/*` files (§3.9).
- A rule in `documentation/claude.md`: new pictures go through `<Img>`; new public reads go through the edge cache;
  a page's first screen is one RPC; no new eager import in `App.tsx` without a reason.
- Monthly: the Supabase performance advisor and the field data (0.4), with findings added to `ToDo.md`.
- The 130 unused indexes: review once real traffic exists (they cost writes, not reads); not part of this plan.

---

## 6. Decisions for Mitra

| # | Question | Options | Recommendation |
|---|---|---|---|
| D-1 | Start with Phases 0–3 (no new services) now? | yes / wait | **Yes.** They are low-risk front-end and caching changes and roughly halve load times on their own (estimate). |
| D-2 | Where should the database live? | (A) **Move the project to `ap-south-1` Mumbai.** Every call, Auth, Storage, Realtime and edge function gets ~5–10× lower latency from India. Needs a paid plan ("Restore to another project") or a CLI dump/restore, plus the runbook in §7 and a short maintenance window. (B) **Keep Sydney, add a Mumbai read replica** behind the API load balancer (paid plan + at least Small compute): only REST `GET`s and `get: true` RPCs are geo-routed; Auth, Storage, writes and Realtime stay in Sydney. (C) **Keep Sydney**, rely on the edge cache (4.1) and an image CDN (2.3): fixes signed-out browsing, not signed-in users or sellers. | **(A), before public launch.** The data is small today (43 sellers, 423 photos, ~95 MB of Storage), so this is the cheapest it will ever be. Do 4.1 either way. |
| D-3 | How should photos be resized? | (a) Supabase image transformations (Pro plan; simplest, no new vendor, replaces `product-thumbs`). (b) Bunny CDN + Optimizer in front of Storage (India edges, cheap per GB, already a vendor). (c) Extend `product-thumbs` to more sizes (no new cost, but images still come from Sydney unless D-2 is A). | **(a) if the project moves to Mumbai and the plan is upgraded; (b) if it stays in Sydney.** Either way, 2.1 and 2.2 first. |
| D-4 | Real-user speed data? | Vercel Speed Insights (paid per data point) / own `web_vitals` table / none | **Own table**, batched, behind the analytics consent; no new vendor. |
| D-5 | Fonts | keep all six / the theme's body font (Open Sans + Roboto today) + Playfair only / one body font | **The theme's body font + Playfair Display**, self-hosted; the others only where a design really needs them. Since 1.2 (2026-11-27) the six no longer block the first paint, so this now saves bytes, not paint time. |
| D-6 | Thumbnail backfill job | run it / skip | **Run it** (a one-off job, ~20 photos a minute, 423 photos ≈ 25 minutes). It is a new job, so it needs your yes. |
| D-7 | Sign-in pages in the first script (rule from review M-34) | keep eager / load them as their own files, warmed on Landing and on any "Sign in" button's hover/touch | **Keep eager for now.** With input-otp they are ~35 KB minified (~11 KB gzip), against the ~125 KB gzip that 3.1–3.3 and 3.8 remove (§3.9); revisit only if the entry is still over budget after Phase 3. Sign-in itself is not touched either way. |

---

## 7. Region move runbook (if D-2 = A)

Prepared and rehearsed on the local stack first; executed in one announced window.

1. **Inventory everything tied to the project ref `vxdhhgdfubqedfpwfyrb`:** stored URLs (`product_images.url`,
   `products` photo fields, `rfqs.image/images/customization_images`, vendor logos and banners, `site_content`,
   `hero_slides`, blog images, `admin.storage_origin`); function bodies with the URL hard-coded (e.g.
   `admin.queue_product_thumbs`); `vercel.json` CSP (`img-src`, `media-src`, `connect-src`); `VITE_SUPABASE_URL`/keys
   in the three Vercel projects (buyer, admin, blogs); edge-function secrets; Vault secrets (`service_role_key`);
   pg_cron jobs and pg_net targets; Razorpay webhook URL; Bunny webhook/settings; Google OAuth redirect URI; the
   SMS/OTP provider settings; `src/lib/thumbs.ts` / `storageUrl.ts` prefixes (env-driven).
2. **New project in `ap-south-1`** on the paid plan, same Postgres major (17), same extensions; Auth settings,
   providers, templates, rate limits and redirect URLs copied.
3. **Database:** "Restore to another project" from a physical backup (preferred) or `supabase db dump` (roles,
   schema, data) + restore. Then compare the catalogue with production: tables, policies, functions (md5 of each
   body), triggers, cron jobs, grants. The migration ledger travels with the dump.
4. **Storage:** copy every bucket object by object with the service key (≈ 95 MB), keeping paths and metadata (set
   the year-long cache here, 2.5); bucket policies come with the database.
5. **Edge functions:** deploy all with the CLI to the new ref; copy secrets.
6. **Rewrite stored URLs** to the new ref in one migration (only the host part), and update
   `admin.storage_origin`.
7. **Cut-over window:** set a maintenance banner; stop writes on the old project (revoke `anon`/`authenticated`
   writes); take a final delta (or the final dump if the window allows a full one); switch the env vars in the three
   Vercel projects and redeploy; update webhooks and OAuth; smoke-test sign-in (mobile + OTP, unchanged), browse,
   enquiry, chat, seller upload, payment demo path, admin panel.
8. **Keep the old project read-only for 14 days** as a fallback, then pause it.

Estimated effort: 1–2 days of preparation and rehearsal, a 1–2 hour window.

---

## 8. Order, effort and expected effect

| Order | Work | Effort | Mobile home LCP (estimate) | Text page LCP (estimate) |
|---|---|---|---|---|
| — | Baseline | — | 15.1 s | 4.2 s |
| 1 | Phase 0 + Phase 1 (cache, fonts, preconnect, warm-up) | 1.5–2.5 days | ~12 s | ~2.5 s (warm ~1 s) |
| 2 | Phase 2.1, 2.2, 2.4, 2.6, 2.7 (thumbnails everywhere, no 404s, sized images, priority) | 3 days | ~6 s | ~2.3 s |
| 3 | Phase 3 (entry ≤ 250 KB, render less) | 3–4 days | ~5 s | ~2.0 s |
| 4 | Phase 4.1, 4.4, 4.5, 4.6, 4.8, 4.9 (edge cache, early data, saved cache, batching) | 3–4 days | ~3.5 s (signed-out) | ~2.0 s |
| 5 | D-2 region move + Phase 4.2/4.3 (one call per page) + 2.3 (image CDN) | 4–6 days | ~2.5–3 s | ~1.8 s |
| 6 | Phase 5 (seller side) | 2–3 days | — | — |

The estimates come from the measured costs in §3 (for example, removing the 404 wait saves 1.2–1.7 s per card photo;
a 1-year asset cache removes ~110 revalidations; moving from ~0.4 s to ~0.05 s per round trip on 2–3 sequential
waves). They are not promises: each phase is re-measured with `npm run perf`, and the table above gets the real
numbers as each phase ships.

---

## 9. Progress (D-1, started 2026-11-27)

Mitra said "start the D1" on 2026-11-27, then "push and merge" the same day: Phases 0–3 up to 2b3bfe3 are on
`main` and live (checked: `/assets/*` served `max-age=31536000, immutable`, HTML `max-age=0`). Later commits on
branch `perf/phase-0-1` wait for the next push. Migration `20261127100000` is in the repo but **not applied**.

| Item | State | Note |
|---|---|---|
| 0.1–0.3 | done | `npm run perf`, `perf:local`, `perf:bundle`; the budget runs at the end of `npm run build` |
| 0.4 | waits on D-4 | |
| 1.1 | done | `/assets/*` cached a year; takes effect on deploy (a local preview doesn't apply `vercel.json`) |
| 1.2 | done, partly | fonts no longer block the first paint; self-hosting and fewer families wait on D-5 |
| 1.3 | done | preconnect to Supabase, added by a build plugin (`vite.config.ts`) only when `VITE_SUPABASE_URL` is set: the `%VITE_…%` placeholder failed CI's e2e build, which has no Supabase env (fixed the same day) |
| 1.4 | done | 3 pages per side, after the network is quiet; `import()` kept, no hover prefetch |
| 1.5 | deferred | its own branch; the year-long cache already saves returning Hindi/Gujarati visitors the download |
| 1.6 | skipped | the two functions aren't on any page's load path; revisit with D-2 |
| 1.7 | done | `vendor-core` 116.7 KB gzip, imports nothing from the app file; its name changes when the app starts or stops using one of its exports |
| 2.1 | done | `20261127100000` applied 2026-11-27 (CLI, md5 checked); backfill run the same day (D-6: Mitra "fix both"), 280 → 0 live photos without a thumbnail. Home feed: 12 thumbnails, 0 missing; 12 full photos still load from surfaces that don't use `<CardPhotos>` (carousel, ad rails): next |
| 2.2 | not needed | with 2.1 and the backfill every live photo has its thumbnail; the fallback stays |
| 2.4 | done, partly | the first 4 cards on the home feed and search results load at once with high priority; `srcset` waits on D-3 |
| 2.7 | done | Landing hero `fetchpriority="high"` |
| 3.1 | done | the 4 tap-to-open dialogs load on first open (`LazyModals.tsx`) |
| 3.2 | done | `errorMessage` no longer pulls the registration validator and the category table (`registrationErrors.ts`) |
| 3.3 | done | Mitra (2026-11-27): "do what will make the site faster". The 12 first-script files import `m as motion` inside `<LazyMotion features={domMax}>` (loaded after the first script, `lib/motionFeatures.ts`); sign-in pages keep their animations and stay in the first script (D-7 unchanged). First load 305.4 → 275.4 KB gzip |
| 3.4 | skipped | the hub already connects only for signed-in accounts behind its switch; delaying it makes callers that wait up to 5 s for it open their own channels |
| 3.5 | done for search results | 24 cards at a time; the storefront (≤ 200 listings, ~10 today) left as is |
| 3.6 | done | recharts loads with the first chart (`components/vendor/Recharts.tsx`): Analytics' file 119 → 11.7 KB gzip |
| 3.8 | done | Radix toaster removed |
| 3.9 | done | `TooltipProvider` moved into Onboarding, the only page with a tooltip; first load 318.2 → 305.4 KB gzip |
| 3.7 | not done | CSS split; small |
| CI | fixed (main ed3b6df) | E2E ran nothing for weeks (runner OS, Node 18, `.env` read at import, local-stack specs, no Supabase settings in the build, stale specs); now green: Checks and E2E pass |
| 4.1 | live (main 0528865) | checked: `X-Vercel-Cache: HIT` from `bom1`, private reads refused; `api/public-data.ts` (bom1) + `src/lib/publicData.ts`: signed-out reads of listed functions and public tables from Vercel's edge cache (60 s, stale 120 s); signed-in, writes, counts, search, analytics direct. Local check: calls to Sydney home 10 → 1, product 13 → 0, store 7 → 1, search 13 → 3, page text identical |
| 4.2 | not started | page RPCs (migrations) |
| 4.6 | live (main 3616f00) | `log_engagement_events(jsonb)` applied 2026-11-27 (md5 checked); the app queues events 2 s / 25 and sends them together: search results 27 calls → 2 |
| 2.4 (rest) | live (main 3616f00) | `ThumbImg` on the carousel, sponsored rails, New Arrivals rails and store grids: home feed 12 full photos (1.7 MB) → 0 |
| 4.3 | not needed yet | GET RPCs matter for a read replica (4.7) |
| 4.4 | live | `src/lib/routeData.ts`: product and store data start with the app (first call ~0.6 s → ~0.1 s after start) |
| 4.5 | not started | persisted query cache needs a new package |
| 4.7 | waits on D-2 | region |
| 4.8 | live | `pref_category_map` read once (2 → 1); the two `active_ads` calls are different slots, left for 4.2 |
| 4.9 | live | product page reads its category's questions only (535 KB → 24–110 KB uncompressed) |

### 9.1 Measured (2026-11-27, 8 key pages, phone profile, median of 3 runs)

Live site against this branch served by `vite preview` with the same data and throttling. `vercel.json` doesn't apply
to a local preview, so the year-long cache (1.1) isn't in these numbers; it shows only after a deploy.

| Page | Live | Phase 1 | Phases 0–3 | TBT live → 0–3 | Requests live → 0–3 | Script KB live → 0–3 |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 5.8 s | 5.5 s | **4.2 s** | 134 → 258 ms | 116 → 66 | 634 → 473 |
| `/terms` | 3.7 s | 3.5 s | **3.4 s** | 57 → 171 ms | 114 → 64 | 640 → 479 |
| `/home/new-arrivals` | 15.4 s | 13.8 s | **11.9 s** | 1355 → 2119 ms | 171 → 121 | 633 → 473 |
| `/search/results?q=shirt` | 12.5 s | 10.1 s | **10.0 s** | 3219 → 1296 ms | 213 → 163 | 635 → 473 |
| `/product/…` | 5.5 s | 5.4 s | 5.9 s (runs 7.5, 5.9, 5.5) | 938 → 753 ms | 154 → 104 | 633 → 473 |
| `/vendor/…` | 7.0 s | 7.9 s | **6.8 s** | 718 → 1147 ms | 141 → 85 | 635 → 381 |
| `/categories` | 6.5 s | 4.7 s | **3.8 s** | 17 → 158 ms | 123 → 52 | 634 → 325 |
| `/seller` | 4.0 s | 4.2 s | **3.9 s** | 1444 → 1927 ms | 141 → 92 | 1537 → 1377 |

Open: TBT rose on six pages. The sweep counts long tasks until the network has been quiet for 2.5 s, which now
includes the warm-up (1.4 starts it once the network is quiet) parsing the three warmed pages and the files split out
of the first script (the seller category table now arrives with SearchResults). The work moved after the first paint
rather than grew, but it can still delay a tap; to check next: TBT with the warm-up blocked, and whether the warmed
SearchResults should leave the category table for when it opens.

## Appendix A: Data behind this document

- Raw results: `scratchpad/perf/prod.json` (production), `seller2.json` (re-runs of `/` and `/seller`),
  `recheck.json` (re-runs of the home feed and `/blogs/about`), `vendor.json` (seller pages, local stack); second
  sweep: `prod-run2.json`, `home-run2b.json` (`/` alone), `vendor-run2.json`; `compare.cjs` builds §2.3. Library breakdown (§3.9): `vendor.cjs` (every chunk, per package)
  and `vendor3.cjs` (the entry, per group, with gzip), run on a `vite build --sourcemap` of `main`. They will be copied to `scripts/perf/baseline-2026-11-27*.json` in
  Phase 0.
- Production checks (read-only, 2026-11-27): `get_project` (region), performance advisor, `storage.objects` counts and
  sizes by bucket, `pg_trigger` for the thumbnail triggers, `admin.queue_product_thumbs` body, `net._http_response`
  (keeps only ~6 h, no thumbnail calls in it).
- Per-page Supabase calls (phone profile, start + duration in ms):
  - Home feed: `active_ads` 3910+2030, `featured_listings_on` 3921+2142, `sample_vendor_ids` 3926+2035, `active_ads`
    3926+2074, `top_vendors` 3932+2028, `video_closeups_feed` 3939+2158, `pref_category_map` 3940+2216 and
    3941+2316, `feed_products` 3942+2629 and 3942+2407, `spotlight_listings` 6346+605.
  - Product: `sample_vendor_ids` 3941+792, `products` 3943+808, `attribute_definitions` 3943+2826; then
    `active_ads`, `product_videos`, `product_documents`, `product_reviews`, `product_review_summary`,
    `vendor_review_stats`, `related_products`, `products` (5341–5381, 558–1197 each); then `subscription_plans`
    6569+880, `products` 6634+420.
  - Storefront: `vendor_profiles`, `sample_vendor_ids` (4479), then `products`, `product_videos` (4905), then
    `catalogues`, `reviews`, `vendor_review_stats` (6511–6523).
  - Search results: 1× each `sample_vendor_ids`, `search_products`, `featured_listings_on`, `attribute_definitions`
    (1717 ms), `video_closeups_feed`, `categories`; 2× `products`, `vendor_profiles`, `search_ads`;
    27× `log_engagement_event`; 1× `subscription_plans`.
