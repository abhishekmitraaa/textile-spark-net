# Ranking on Cosora: every ordering, how it works

Written 2026-11-15 from the functions running on production that day, after Ranking Fit and Ranking Standing were
released. It covers every place where Cosora decides what comes first:
- listings shown to buyers;
- sellers shown to buyers;
- requirements (leads) shown to sellers;
- which sellers are told about a new requirement.

`documentation/search.md` describes search in more depth: indexing, the search page, filters and trending searches.
This file summarises search and points there.

**Keep it true.** When a ranking function changes, change its section here in the same commit. Each section names its
function, so `grep` finds both.

---

## Contents

1. [The map](#1-the-map)
2. [Words used here](#2-words-used-here)
3. [Shared building blocks](#3-shared-building-blocks)
   - 3.1 Paid plans and what they buy in ranking
   - 3.2 Recent demand (`product_trend`)
   - 3.3 Meaning: embeddings and similarity
   - 3.4 Ratings
   - 3.5 Profile score
   - 3.6 The trade-buyer lift for international sellers
4. [Listings for buyers](#4-listings-for-buyers)
   - 4.1 Feeds and their sorts (`feed_products`)
   - 4.2 For You (`for_you_products`)
   - 4.3 Search (`match_products`)
   - 4.4 Similar listings (`related_products`)
   - 4.5 Spotlight and featured listings
   - 4.6 Sponsored search ads (`search_ads`)
   - 4.7 Video Closeups
   - 4.8 Trending searches
5. [Sellers for buyers: Standing](#5-sellers-for-buyers-standing)
6. [Requirements for sellers: Fit](#6-requirements-for-sellers-fit)
7. [Sellers for a requirement: matching and lead alerts](#7-sellers-for-a-requirement-matching-and-lead-alerts)
8. [What ranking never uses](#8-what-ranking-never-uses)
9. [How fresh each signal is](#9-how-fresh-each-signal-is)
10. [Known gaps](#10-known-gaps)
11. [Where the code and tests live](#11-where-the-code-and-tests-live)
12. [History](#12-history)

---

## 1. The map

| What is ordered | Who sees it | Where | Function | Ordered by (first key first) |
|---|---|---|---|---|
| Listings in a feed | buyers, visitors | New Arrivals, Trends, Sale, category and store grids | `feed_products` | plan boost tier, then the sort the page asks for (newest, trending, discount, price, rating) |
| A buyer's own feed | signed-in buyers | For You | `for_you_products` | closeness to the buyer's taste, a small nudge for their city/state, recent demand |
| Search results | everyone | `/search/results` | `match_products` (through `search_products`) | words and meaning fused (RRF), × plan boost, × trade lift; recent demand breaks ties |
| Similar listings | everyone | a listing's page | `related_products` | closeness of meaning; recent demand |
| Spotlight | everyone | spotlight rails | `spotlight_listings` | VIP sellers' best listing each, rotated daily |
| Featured candidates | Cosora-Admin | featured slots | `admin.featured_candidates` | plan's featured tier, then each seller's best listing |
| Sponsored results | everyone | Search page sponsored row | `search_ads` → `admin.search_ads_ranked` | meaning match first, then category match, bumped, newest |
| Videos | everyone | Video Closeups | client query; `match_videos` for "more like this" | most viewed; closeness of meaning |
| Trending searches | everyone | `/search` | `trending_searches` | distinct visitors, then searches |
| Sellers in lists | buyers, visitors | Recommended Premium Brands, brand suggestions on Following, sellers in search suggestions | `top_vendors`, `new_brand_suggestions`, `search_suggestions` | **paid plan**, then **Standing**, then rating / recency / followers |
| A buyer's quotes | the buyer | My Quotes › a requirement | `quote_order_for_rfq` | **Standing** only (Recommended, the default sort) |
| Requirements | sellers | Quotes › Leads | `match_vendor_rfqs` (with `admin.rfq_fit`) | **Fit** |
| Sellers matched to a requirement | the database | lead alerts | `match_rfq_vendors`, `admin.lead_alert_fanout` | paid plan, then match + 0.1 × Standing; alerts: VIP first |

---

## 2. Words used here

- **Listing:** a row in `products`. Only `status = 'live'` listings are ever ranked for buyers. Every buyer-facing
  ranking function filters on this itself, because most of them run with the database's rights and skip row security.
- **Seller / vendor:** a `vendor_profiles` row.
- **Requirement / lead / RFQ:** a row in `rfqs` that Cosora approved (from `rfq_submissions`). "Open" means
  `status = 'active'`, not removed, not addressed to one seller (`vendor_id is null`), and its deadline
  (`expires_at`, 7 days after approval, extendable) has not passed.
- **Paid plan:** `vendor_profiles.plan_expires_at > now()`. Five plans exist: Free, Basic, Silver, Gold, VIP.
- **Boost tier:** a plan's `limits.search_boost_tier` (0–4). It applies only while the plan is paid.
- **Recent demand:** a listing's `product_trend.log2_score` (section 3.2). It is the "trending" signal everywhere.
- **Embedding:** a 1,536-number vector of a text's meaning (OpenAI `text-embedding-3-small`). Two embeddings'
  **cosine distance** (`<=>`) runs from 0 (same meaning) to 2; **similarity** is 1 − distance.
- **Standing:** a seller's score for buyers, 0 to 1 (section 5).
- **Fit:** how well a requirement suits one seller (section 6).
- **Definer function:** runs with the database owner's rights, not the caller's. Such a function must apply every
  filter that row security would otherwise apply.

---

## 3. Shared building blocks

### 3.1 Paid plans and what they buy in ranking

| Plan | Boost tier | Featured | Lead alert channels | Alert priority | Ad reach |
|---|---|---|---|---|---|
| Free | 0 | none | none | — | can't run ads |
| Basic | 1 | none | digest | — | 1 state |
| Silver | 2 | top 10 | app, digest | — | 4 states |
| Gold | 3 | top 5 | app, email, WhatsApp, SMS | — | all India |
| VIP | 4 | spotlight | app, email, WhatsApp, SMS | told first | global |

Where a plan counts, and how:
- **Feeds** (`feed_products`, newest and trending sorts): the boost tier is the first sort key. On those two sorts every
  VIP listing comes before every Gold listing, and so on down.
- **Search** (`match_products`): the tier multiplies the relevance score by `1 + 0.05 × tier`. That is at most ×1.20
  for VIP, so a much better match still wins.
- **Seller lists** (`top_vendors`, `new_brand_suggestions`, `search_suggestions`) and **requirement matching**
  (`match_rfq_vendors`): any paid plan comes first. Within paid, and within unpaid, Standing decides.
- **Lead alerts:** VIP (`lead_alert_priority`) is told first. Between equal matches, the bigger plan comes first.
- **Spotlight:** only VIP sellers' listings appear (`featured = 'spotlight'`).
- **Not used:** the buyer's own quotes (My Quotes › Recommended) and Fit (a seller's lead feed). A plan never buys a
  place in a buyer's comparison of offers, and every seller sees every lead.

### 3.2 Recent demand (`product_trend`)

One number per listing measures how much buyers want it now. Every "trending" order and most tie-breaks use it.

**Events and their weights** (`listing_demand_weight`):

| Event | Weight | Written by |
|---|---|---|
| A signed-in buyer views the listing | 1.0 | `increment_product_view` |
| A signed-out visitor views it | 0.25 | `increment_product_view` |
| A buyer sends an enquiry | 10.0 | `increment_product_enquiry` |

**Fading.** Each event's weight halves every 7 days. Rather than rewriting every row every day, the score is kept in
log2 form against a fixed epoch (2026-10-17 00:00 IST):
- an event of weight `w` at time `t` adds `log2(w) + (t − epoch) / 7 days`;
- two values combine as `log2(2^a + 2^b)` (`demand_log_add`), computed stably as
  `max(a, b) + log2(1 + 2^(min − max))`.

Because every score is measured against the same epoch, comparing two listings' `log2_score` is the same as comparing
their decayed totals today. Nothing needs recomputing as time passes.

**Worked example.** Listing A had 8 signed-in views exactly 14 days ago. Listing B had 1 enquiry today.
- A: `8 × 2^(−2) = 2` (two half-lives).
- B: `10 × 2^0 = 10`.

B ranks above A on trending, although A had more events.

**Guards on views** (`increment_product_view`):
- one view per viewer per listing per day (`product_view_daily`);
- a seller's own views don't count;
- only live listings count;
- at most 100 signed-out viewers per listing per day.

Signed-in viewers are keyed `u:<account>`. Signed-out viewers are keyed `b:<browser id>`, an id the browser makes up,
which is why they weigh a quarter and are capped. `product_view_daily` is only this day-by-day dedupe ledger: days
before yesterday are deleted as calls come in. A counted signed-in view is also written to
`admin.seller_viewer_daily` (seller, viewer, day), which keeps 90 days for Standing (section 5.3).

### 3.3 Meaning: embeddings and similarity

What gets an embedding, and how:
- **Listing** (`products.embedding`): built from its name, description, category and category answers by the embedding
  worker (a pg_cron job every minute, edge function `generate-embedding`).
- **Requirement** (`rfqs.embedding`): the same, from the requirement's text.
- **Seller's catalogue** (`vendor_profiles.catalog_embedding`): the average of its live listings' embeddings,
  recomputed by the `vendor-catalog-recompute` job every minute after a listing changes.
- **Search phrase:** embedded on first use and cached (`embed-query`; see search.md §5.3).
- **Buyer taste:** built on the fly from the buyer's history (section 4.2).

Until an embedding exists, every ranking that uses meaning treats it as unknown (similarity 0, or no meaning hit) and
falls back to its other keys. Production on 2026-11-15: 7 of 14 sellers have a catalogue embedding.

### 3.4 Ratings

- **Seller ratings** (`vendor_profiles.rating_avg`, `reviews_count`) are written only by `sync_vendor_rating` from real
  `reviews` rows. No seller has a rating without reviews.
- **Listing ratings** (`products.rating_avg`) are written by `sync_product_rating` when a listing's reviews change. But
  22 of the 27 live listings still carry a seeded rating with no review behind it (2026-11-15), and those seeded
  numbers reach a few orders (section 10).
- **Standing** never reads `rating_avg`. It recomputes reviews from the review rows (section 5.3).

### 3.5 Profile score

`vendor_profiles.profile_score` (0–100) is computed by the database (`vendor_profile_score_of()`, trigger
`trg_vendor_profiles_zz_profile_score`). A seller can't set it. It awards points for:

| Check | Points | Check | Points |
|---|---|---|---|
| Contact details | 8 | Ten live listings | 10 |
| About us | 8 | Reviews | 9 |
| A live listing | 7 | Social links | 6 |
| Category | 7 | Website | 7 |
| Premises photos | 7 | Two quotes sent | 7 |
| Email | 7 | Year established | 5 |
| Employee count | 4 | Annual turnover | 4 |
| Capacity | 4 | | |

Since 2026-11-15 it ranks sellers only as one part of Standing (15%).

### 3.6 The trade-buyer lift for international sellers

When the viewer is a trade buyer (`admin.viewer_trade_buyer()`), approved sellers outside India get a small, bounded
lift (Mitra, 2026-11-13):
- **Search:** their score × 1.10.
- **Trending feed:** +1.0 on `log2_score`, which is the same as doubling their recent demand.

"Approved" means `onboarding_complete` and `country_code <> 'IN'`. The lift appears nowhere else.

---

## 4. Listings for buyers

### 4.1 Feeds and their sorts (`feed_products`)

One function serves every grid of listings: New Arrivals, Trends, Sale, categories and a store's listings.

- **Filters:** category ids, gender, sellers, on sale, discount bands, a name/brand search (60 characters), excluded or
  exact ids, and supplier location (India or international).
- **Page size:** up to 96 per page (200 for an id list); offset up to 960.

| Sort | Order (first key first) |
|---|---|
| `newest` (default) | boost tier ↓, created ↓, id ↓ |
| `trending` | boost tier ↓, recent demand ↓ (+1.0 trade lift), listing rating ↓, created ↓ |
| `discount` | discount % ↓, created ↓ (only listings with a compare-at price above the price) |
| `price_asc` | price ↑, created ↓ |
| `price_desc` | price ↓, created ↓ |
| `rating` | listing rating ↓, created ↓ |

**Why boost comes first on newest and trending:** these are the default views, and a paid plan's promise is
visibility there. Price, discount and rating sorts are the buyer's own choice, so plans don't reorder them.

**Performance:** the function sorts only the keys first (a top-N sort with `LIMIT`), then builds cards for the one
page. That keeps a 10,000-listing feed under ~200 ms (`scripts/feeds/harness.sql`).

### 4.2 For You (`for_you_products`)

Only for the signed-in buyer themself; anyone else's id is refused with 42501, because a taste-ranked catalogue would
reveal their browsing.

**The taste vector** (`buyer_taste_embedding`) is a weighted average of the embeddings of what the buyer interacted
with:

| Signal | Weight |
|---|---|
| A listing they viewed (`recently_viewed`) | 1 |
| A listing they saved (`saved_items`) | 3 |
| A listing they asked for in a requirement | 5 |

Each weight fades as `exp(−0.023 × days)`, a half-life of about 30 days.

**Cold start** (`buyer_cold_start_embedding`): with no history, the average embedding of live listings in the
categories the buyer picked at sign-up (`preferred_categories` → `pref_category_map`).

**Order:**
1. **Closeness:** live listings nearest the vector (cosine distance), with recent demand breaking ties. The index
   serves this directly.
2. **Location nudge:** for a buyer with a city or state, the same candidate set is re-sorted by distance minus a
   small nudge. It is 0.05 when the listing (or its seller) is in the buyer's city, else 0.02 for their state. The
   nudge only reorders; it never adds or drops a listing.
3. **No vector at all:** recent demand ↓, listing rating ↓, newest.

### 4.3 Search (`match_products`)

Full detail is in `documentation/search.md` §5. In short:

1. **Word hits:** listings whose full-text index (`products.fts`) matches the phrase, in `ts_rank` order (recent
   demand breaks ties), up to `max(40, match_count)` deep.
2. **Meaning hits:** listings within cosine distance **0.80** of the phrase's embedding, nearest first, to the same
   depth. The cutoff matters: nearest-neighbour search always returns something, so without it a nonsense phrase
   would return the whole catalogue.
3. **Fusion (reciprocal rank fusion, k = 60):** `rrf = 1/(60 + word rank) + 1/(60 + meaning rank)`. A listing found
   only one way gets only that term.
4. **Plan and trade lift:** `score = rrf × (1 + 0.05 × boost tier) × (1.10 for a trade buyer's view of an approved
   international seller)`.
5. **Order:** score ↓, recent demand ↓, id.

Seller suggestions in the search box are a separate function (section 5).

### 4.4 Similar listings (`related_products`)

On a listing's page: the live listings nearest the listing's own embedding, with recent demand breaking ties. The
anchor itself may be any status; only results must be live. With no embedding, the fallback is recent demand ↓,
listing rating ↓, newest. `match_videos` does the same for videos.

### 4.5 Spotlight and featured listings

- **`spotlight_listings`** (switch `featured_listings`):
  - **Who:** only sellers on a plan with `featured = 'spotlight'` (VIP), paid and with an active account.
  - **Which listing:** each seller's listings are ranked by recent demand ↓, listing rating ↓, newest, and their best
    one is shown first.
  - **Seller order:** sellers take turns in an order set by `md5(seller || today || session)`. The order changes every
    day and differs between visitors, so no VIP seller always holds the first place. It can be limited to a category
    subtree.
  - **Size:** up to 12.
- **`admin.featured_candidates`** (for Cosora-Admin's featured slots): sellers on featured plans, tiered spotlight 3 >
  top 5 2 > top 10 1. Each seller's best listing is chosen the same way (demand, rating, newest).

### 4.6 Sponsored search ads (`search_ads` → `admin.search_ads_ranked`)

The sponsored row on the search page. `is_ad_eligible()` decides who can show at all:
- the ad's status and dates;
- the seller's account in good standing;
- the viewer's state, country or city against the ad's targeting.

Among eligible ads:
1. **Meaning match:** the ad's product is within cosine distance **0.60** (`admin.search_ads_cutoff()`) of the search
   phrase, nearest first.
2. **Category match:** otherwise, the ad targets the searched category.
3. Then bumped ads (Wholesaler Pick's 72-hour bump) ↓, newest ↓.

Ads never mix into organic results; they are labelled "Sponsored" in their own row.

### 4.7 Video Closeups

The reel is a client query on `product_videos`: approved videos, the **most viewed first** (`views_count`), limited to
30 (paging is a ToDo). "More like this" uses `match_videos`, by closeness of meaning with views breaking ties.

### 4.8 Trending searches

`trending_searches` shows the latest daily run (`admin.search_trends_refresh`, pg_cron `search-trends-refresh`):
- **Window:** yesterday, widening to 7 or 30 days when fewer than 5 terms qualify.
- **Order:** distinct visitors ↓, then searches ↓.
- **What is shown:** categories only for now (typed terms wait behind the switch `search_trending_terms`, because a
  script can pose as visitors).

Full rules: search.md §8.

---

## 5. Sellers for buyers: Standing

Live since 2026-11-15 (migration `20261115110000`). Design and the calls made without Mitra:
`documentation/ranking-standing-design-2026-11-15.md`.

### 5.1 What it is

One number from 0 to 1 per seller: how good a seller is to send a buyer to, whatever the buyer is looking for. It
replaced profile score as the in-tier order of every seller list. Paid plan still goes first wherever it did.

### 5.2 The formula

```
Standing = 0.30 × I   (buyer interest)
         + 0.25 × R   (reviews)
         + 0.15 × A   (activity)
         + 0.15 × T   (trust)
         + 0.15 × P   (profile score / 100)

If a fraud finding against the seller is on record (not withdrawn): T = 0 and Standing is halved.
```

Buyer interest weighs most, and more than activity (Mitra's decision, 2026-10-07).

### 5.3 The five parts

**I — buyer interest (30%)**
- **People:** distinct signed-in people in the last 90 days who viewed the seller's listings, followed the seller,
  or messaged the seller. A person counts once across the three. The seller's own views never count.
- **Repeat viewers:** signed-in viewers seen on two or more different days.
- `I = min(1, ln(1 + people + repeat) / ln(201))`, so 200 interested people is the top.
- **Why signed-in only:** a signed-out viewer's key is made by the browser, so anyone could mint "people". The
  automated security review caught this before release.
- **Where viewers come from:** `admin.seller_viewer_daily`, one row per seller, signed-in viewer and day (IST).
  `increment_product_view` writes it whenever it counts a signed-in view, the hourly refresh drops rows older than
  90 days, and deleting a buyer's account deletes their rows. It isn't readable by clients. Until 2026-11-15
  (migration `20261115120000`) the view part read the counter's two-day dedupe ledger and saw about two days.

| People + repeat | I |
|---|---|
| 0 | 0 |
| 3 | 0.26 |
| 7 | 0.39 |
| 30 | 0.65 |
| 100 | 0.87 |
| 200 or more | 1 |

**R — reviews (25%)**
- Every rating of the seller (`reviews`) and of its listings (`product_reviews`), 1 to 5.
- Bayesian average: `(5 × m + Σ ratings) / (5 + n)`. Here `m` is the average of every rating on Cosora (4 if there are
  none), and the 5 imaginary average reviews keep one 5-star review from beating thirty 4.6s.
- `R = (average − 1) / 4`. A seller with no reviews sits at the platform average.
- **Example:** with `m = 4.2` and three reviews of 5, 5 and 2, the average is `(21 + 12) / 8 = 4.125`, so
  `R = 0.78`.

**A — activity (15%)**
- **Volume:** quotes in the last 90 days, `min(1, ln(1 + q) / ln(31))` (30 quotes is the top).
- **Speed:** the median hours from a requirement going live to this seller's quote. It is 1 at 4 hours or less,
  falling evenly to 0 at 72 hours, and 0 with no quotes.
- `A = (volume + speed) / 2`.
- **Examples:** three quotes within 4 hours → `A = (0.40 + 1) / 2 = 0.70`. One quote after 38 hours →
  `(0.20 + 0.50) / 2 = 0.35`.

**T — trust (15%)**

| Piece | Adds |
|---|---|
| Registration approved (`vendor_registrations.status = 'registered'`; or, for a seller who registered before reviews existed, `onboarding_complete` with no registration row) | 0.50 |
| At least one document verified by Cosora (`vendor_documents.verified`) | 0.25 |
| The trust seal from verification or a bought seal (`is_verified`, `ad_verified_until`) | 0.25 |
| A paid plan's seal | 0: paid plan already ranks first |
| A fraud finding not withdrawn (`admin.fraud_findings`) | T = 0 and Standing halved |

**P — profile score (15%):** `profile_score / 100` (section 3.5).

**New sellers:** for the first 30 days of a seller's account, I and A count as at least 0.5, so a new seller isn't
buried for having no history yet. The floor follows the account's age, not its listings', so unlisting and relisting
can't make an old seller new.

### 5.4 A worked example

Seller S has:
- 12 interested people, 2 of them repeat viewers;
- reviews averaging 4.5 over 4 ratings, with a platform average of 4.2;
- 5 quotes, a median of 10 hours;
- registration approved and the verified seal;
- a profile score of 72.

| Part | Calculation | Value |
|---|---|---|
| I | `ln(15) / ln(201)` | 0.51 |
| R | `((5 × 4.2 + 18) / 9 − 1) / 4` | 0.83 |
| A | `(ln 6 / ln 31 + (72 − 10) / 68) / 2` = `(0.52 + 0.91) / 2` | 0.72 |
| T | 0.50 + 0.25 | 0.75 |
| P | 72 / 100 | 0.72 |

`Standing = 0.30 × 0.51 + 0.25 × 0.83 + 0.15 × 0.72 + 0.15 × 0.75 + 0.15 × 0.72 ≈ 0.69`.

Production on release day ranged from 0.25 to 0.56 across 14 sellers.

### 5.5 Where Standing is used

| Surface | Function | Order |
|---|---|---|
| Recommended Premium Brands | `top_vendors` | paid ↓, Standing ↓, rating ↓, reviews ↓, id |
| Brand suggestions on Following | `new_brand_suggestions` | paid ↓, Standing ↓, latest pictured listing ↓ |
| Sellers in search suggestions | `search_suggestions` | paid ↓, Standing ↓, followers ↓, name |
| A requirement's matched sellers | `match_rfq_vendors` | paid ↓, (match + 0.1 × Standing) ↓ (section 7) |
| Lead alerts | `admin.lead_alert_fanout` | VIP ↓, (match + 0.1 × Standing) ↓, bigger plan ↓ (section 7) |
| A buyer's quotes | `quote_order_for_rfq` | Standing ↓, first quoted ↑ (no paid tier) |

Notes on these surfaces:
- **Requirement matching uses Standing only as a push.** It adds at most 0.1 to a match of up to 1, so a seller who
  really fits the requirement still beats a well-standing seller who sells something else.
- **My Quotes** opens on **Recommended**. The buyer can switch to Most Recent, Lowest Price or Highest Rating (the
  seller's real rating).

### 5.6 How it is kept, and who can see it

- **Storage:** `admin.vendor_standing` holds one row per seller: the total, the five parts and when it was computed.
  `admin.vendor_standing_parts(seller)` computes them, `admin.refresh_vendor_standing()` writes every seller, and the
  pg_cron job **`vendor-standing-refresh`** runs it every hour at :07. A seller without a row yet counts as 0.5.
- **The number is never handed out:**
  - `public.vendor_standing(seller)` (rounded to 2 decimals) can be called only by the ranking functions, not by any
    client.
  - `top_vendors` and `new_brand_suggestions` run as definer to read it; their filters are explicit (live listings,
    the caller's own follows).
  - `quote_order_for_rfq` returns quote ids and positions only, and only for the caller's own requirement.
- **Why the number is hidden:** a queryable number would let anyone watch a seller's Standing halve when staff record
  a fraud finding. The automated security review caught this before release.

---

## 6. Requirements for sellers: Fit

Live since 2026-11-15 (migration `20261115100000`). Design and calls: `documentation/ranking-fit-design-2026-11-01.md`.

### 6.1 Who sees which lead (unchanged by Fit)

`match_vendor_rfqs` first decides the pool; Fit only orders it. A seller sees a requirement when it is:
- open (section 2);
- not their own;
- not blocked either way between buyer and seller (`chat_blocked_between`);
- either from India, or overseas and visible to the seller's tier. VIP sees overseas requirements at once; Gold sees
  them after the VIP head start (`overseas_vip_until`, 24 hours); and anyone who already quoted keeps seeing it.

The browser shows every open lead. A lead the score didn't reach (the first 200 by score are scored) keeps score 0
and stays listed, newest first.

### 6.2 The formula

```
score = 0.45 × S   (text similarity)
      + 0.20 × C   (category match)
      + 0.15 × A   (category answers)
      + 0.12 × L   (location)
      + 0.08 × K   (scale)
```

A, L and K are 0.5 when either side hasn't said. So a seller with none of the new data gets the same +0.175 on every
lead, and the feed keeps the order it had before Fit.

### 6.3 The five parts

**S — text similarity (45%):** cosine similarity between the requirement's embedding and the seller's catalogue
embedding; 0 while either is missing. A lead card says "Strong match" at similarity ≥ 0.45.

**C — category match (20%):** 1 when the requirement's category is one of the seller's live listings' categories,
else 0. "Others (Custom)" counts as every seller's category, for a seller with any live listing. The card says
"Matches your category".

**A — category answers (15%)**
- The buyer's answers on the requirement form are compared with the seller's live listings.
- Only questions with `match_weight > 0` count. Their `match_key` names the listing question they mean (Cosora-Admin
  › Form questions, F3).
- **Listing values** come from `products.attributes`, plus the four column-backed answers: fabric, GSM, pattern and
  sizes. Colours are read from `colours`.
- **Matching:** values are compared as trimmed lower-case text, and a question matches when the two share at least one
  value.
- **A question the seller's listings don't answer is skipped:** it counts as unknown, not a miss.
- `A = Σ(weight × matched) / Σ(weight)` over the questions compared; 0.5 when none can be.
- **Example:** the buyer asked fabric "cotton", GSM "180" and sizes "XL". The seller lists cotton, GSM 180 and sizes
  M and L. Fabric and GSM match, sizes miss, so `A = 2/3`.

**L — location (12%):** the buyer's profile state against the seller's state and "states I serve", **as they were
when the requirement was posted** (see below).

| Case | L |
|---|---|
| Overseas requirement, seller tagged export-ready | 1 |
| Overseas requirement, seller not export-ready | 0.5 |
| Buyer has no state, or the seller gave neither state nor states served | 0.5 |
| Buyer's state = seller's state | 1 |
| Buyer's state is one the seller serves | 0.8 |
| Seller listed states served and the buyer's isn't one | 0 |
| Seller gave only a base state, a different one | 0.25 |

**"Near you":** a lead from India with L ≥ 0.8 shows the badge.

**Why "as posted":** a buyer's state is private, readable only by the buyer and support. If location were read live,
a seller could keep editing "states I serve" and watch the badge to work out a buyer's state. So every change to a
seller's state or served states is recorded in `admin.vendor_location_history` (trigger on every profile update), and
a lead is scored against the entry in force when it was posted. A seller who sets a state after a lead was posted is
neutral on that lead.

**K — scale (8%)**
- **Compared when:** the seller's monthly capacity for the requirement's category family exists, is in the family's
  usual unit, and the requirement has a quantity.
- **Usual units:** pieces for product families, metres for raw materials, kg for chemicals and dyes.
- **Value:** `K = min(1, capacity / quantity)`.
- **Otherwise 0.5.** Services families (orders, projects) are never compared.
- **The family:** `public.category_root_of()` walks up from the requirement's category to its top-level seller
  category.

### 6.4 A worked example

The buyer is in Gujarat and asks for 1,000 shirts in cotton. The seller:
- is based in Maharashtra and serves Gujarat;
- lists cotton shirts;
- has a catalogue similarity of 0.62;
- makes 500 pieces a month.

| Part | Value |
|---|---|
| S | 0.62 |
| C | 1 |
| A | 1 (fabric matches) |
| L | 0.8 (served state) |
| K | 500 / 1,000 = 0.5 |

`score = 0.45 × 0.62 + 0.20 + 0.15 × 1 + 0.12 × 0.8 + 0.08 × 0.5 = 0.765`, and the card shows **Near you**.

### 6.5 Asking buyers for their state

Location only works if buyers have a state, so a buyer without one is asked:
- **Profile:** "Add your state so suppliers near you see your requirements sooner". It takes the one banner slot
  before the city nudge.
- **My Quotes:** the same line.
- **Never on the requirement form** (Mitra, 2026-10-07).

"Add state" opens Business details with the state picker in focus.

---

## 7. Sellers for a requirement: matching and lead alerts

### 7.1 `match_rfq_vendors(requirement, n)`

Finds sellers for a requirement, used today by lead alerts. There is no buyer-facing "suggested suppliers" list yet.

**Who matches:**
- the 20 or more sellers nearest by catalogue embedding;
- plus every seller with a live listing in the requirement's category ("Others" matches everyone with a live listing);
- minus sellers blocked either way with the buyer.

**The match:** `0.7 × similarity + 0.3 × category match` is the score it returns.

**Order:** paid plan ↓, then `(match + 0.1 × Standing)` ↓, then similarity.

### 7.2 Lead alerts (`admin.lead_alert_fanout`)

When a requirement goes live, Cosora tells the best-matched sellers. The settings (`admin.lead_alert_config`,
2026-11-15):

| Setting | Value | Meaning |
|---|---|---|
| `max_vendors` | 50 | at most 50 sellers told per requirement |
| `min_similarity` | 0.35 | a seller must match the category or reach this similarity |
| `hourly_cap` | 10 | a seller gets at most 10 instant alerts an hour; more are held for the digest |
| `buyer_daily_cap` | 5 | after 5 alerted requirements in 24 hours, a buyer's next ones alert nobody (they still reach Leads) |
| `max_age_hours` | 48 | older requirements aren't alerted (the catch-up skips them) |
| `overseas_head_start_hours` | 24 | VIP's head start on overseas requirements |

**Who is eligible:** a matched seller (category, or similarity ≥ 0.35) who:
- is not the buyer;
- is on a plan with alert channels;
- is let in by the `lead_alerts` switch;
- has an account in good standing;
- can see the requirement (the overseas rules);
- if they set their own category filter, has the requirement's category in it ("Others" always passes).

**Order:** `lead_alert_priority` (VIP) first, then `(match + 0.1 × Standing)` ↓, then the bigger plan, then id. Up to
four times `max_vendors` candidates are considered, so that before the requirement's embedding exists, who is told
doesn't depend on seller ids.

**How each seller is told:**
- **Instantly:** on the plan's channels, except the digest.
- **Held** (recorded on `admin.lead_alerts.held`):
  - `off`: the seller turned instant alerts off;
  - `digest_only`: the plan has only the digest;
  - `rate_limit`: the hourly cap was reached;
  - `quiet_hours`: inside the seller's quiet hours.
- **The daily digest** (`lead_digest_run`, 09:00 IST; pg_cron runs in GMT, `30 3 * * *`): counts by category the alerts a seller hasn't been sent. Plans with
  a digest get everything new; others get only what was held. Requirements past their deadline are left out (since
  2026-11-14).

---

## 8. What ranking never uses

- **Listing ratings in any seller ranking.** Standing recomputes reviews from review rows. `products.sold_count` has
  no writer and orders nothing.
- **A paid plan inside a buyer's own comparison:** My Quotes › Recommended and every seller's lead feed are
  plan-blind.
- **Company type** (manufacturer, trader…): no buyer says which kind they want, so it is a label and a filter, not a
  score.
- **A delivery city on the requirement form:** location comes from the buyer's profile state, never asked on the form.
- **Signed-out viewers in Standing:** only in listing demand, weighted ¼ and capped.
- **Live seller location for posted leads:** Fit reads the location as it was at posting.
- **Seller-written ranking fields:** profile score, ratings and Standing are computed by the database; guards refuse
  client writes to rating and plan columns.

---

## 9. How fresh each signal is

| Signal | Updated | By |
|---|---|---|
| Recent demand (`product_trend`) | on every counted view and enquiry | `increment_product_view`, `increment_product_enquiry` |
| Listing embeddings | within about a minute of a change | `embedding-worker` (pg_cron, every minute) |
| Seller catalogue embedding | within about a minute of a listing change | `vendor-catalog-recompute` (every minute) |
| Ratings | on every review change | `sync_vendor_rating`, `sync_product_rating` |
| Profile score | on every profile change and listing or quote change | trigger, `admin.vendor_score_refresh()` |
| Standing | hourly at :07 | `vendor-standing-refresh` |
| Standing's viewer ledger | on every counted signed-in view; pruned past 90 days hourly | `increment_product_view`, `admin.refresh_vendor_standing()` |
| Fit | live, every time Leads loads | `match_vendor_rfqs` |
| Seller location history | on every profile update | `trg_vendor_profiles_location_history` |
| Trending searches | daily | `search-trends-refresh` |
| Lead alerts | when a requirement goes live; the catch-up and digest daily at 09:00 IST | `admin.lead_alert_fanout`, `lead-alert-digest` |

---

## 10. Known gaps

1. **Standing's interest is still filling up.** Its 90-day viewer ledger started on 2026-11-15 with the two days
   the view counter held, so until mid-February 2027 the view part covers fewer than 90 days. Follows and messages
   already cover 90.
2. **Seeded listing ratings.**
   - **The problem:** 22 of 27 live listings carry a `rating_avg` with no review behind it.
   - **Where they reach:** the feed's "rating" sort and its trending tie-break, `related_products`' fallback, For
     You's no-vector fallback, and Spotlight's and featured slots' pick of each seller's best listing. Standing is not
     affected.
   - **Status:** ToDo "Decide what listing cards show instead of the invented product ratings and review counts".
3. **Cheap accounts.** While the test sign-in code accepts any 6 digits, a seller could make accounts to view, follow
   or message themselves. That inflates Standing's interest by at most 0.30 (log-scaled, capped at 200 people). This
   is in securityflags.md, Low.
4. **Video Closeups shows the 30 most-viewed videos with no paging.** This is in ToDo.md.
5. **No buyer-facing suggested-suppliers list.** `match_rfq_vendors` is ranked and ready, but only lead alerts use it.
6. **Thin data.** On 2026-11-15:
   - 2 of 20 buyers have a state;
   - no seller has capacity filled in;
   - no live listing has category answers;
   - 7 of 14 sellers have a catalogue embedding.

   Fit and Standing were built to be neutral on missing data, so they reorder little until these fill in.

---

## 11. Where the code and tests live

| Area | Code (database unless marked) | Tests |
|---|---|---|
| Recent demand | `add_listing_demand`, `demand_log_of`, `demand_log_add`, `demand_age_halflives`, `listing_demand_weight`, `increment_product_view` | `scripts/ranking/demand_counters.sql`, `rank_real_demand.sql`, `tests/local/views.spec.ts` |
| Feeds | `feed_products`; app `src/lib/queries/products.ts` | `scripts/feeds/harness.sql` |
| For You | `for_you_products`, `buyer_taste_embedding`, `buyer_cold_start_embedding` | For You specs |
| Search | `search_products`, `match_products`, `search_suggestions`; edge `embed-query` | see search.md §12 |
| Ads | `search_ads`, `admin.search_ads_ranked`, `is_ad_eligible` | `scripts/todo-batch/search_ads.sql` |
| Standing | `admin.vendor_standing_parts`, `admin.refresh_vendor_standing`, `public.vendor_standing`, `quote_order_for_rfq`, `top_vendors`, `new_brand_suggestions`; app `src/pages/MyQuotes.tsx`, `useQuoteOrder` | `scripts/ranking/standing.sql` (22), `tests/local/ranking-standing.spec.ts`, `profile-score-ranking.spec.ts` |
| Fit | `match_vendor_rfqs`, `admin.rfq_fit`, `admin.fit_values`, `public.category_root_of`, `admin.vendor_location_history`; app `src/lib/queries/rfqs.ts`, `OpenRfqLeads.tsx`, `BuyerStateNudge.tsx` | `scripts/ranking/fit_match.sql` (21), `tests/local/ranking-fit.spec.ts` |
| Attributes (F1/F3) | `attribute_definitions`, `attributes_problem`, `match_key` / `match_weight` | `scripts/ranking/f1_attributes.sql`, `f3_attribute_definitions.sql`, `tests/local/ranking-f3.spec.ts` |
| Location, type, capacity (F2) | `india_states`, `vendor_capacity`, `state_code_for` | `scripts/ranking/f2_vendor_profile.sql` |
| Lead alerts | `match_rfq_vendors`, `admin.lead_alert_fanout`, `lead_digest_run`, `my_lead_alerts` | `scripts/todo-open/deadline.sql`, lead alert specs |
| Profile score | `vendor_profile_score_of`, `admin.vendor_score_refresh`; app `PROFILE_SCORE_WEIGHTS` (`src/lib/queries/vendorDashboard.ts`) | `tests/local/profile-score-ranking.spec.ts` |

Design documents:
- `ranking-foundations-design-2026-10-07.md` (Part 1);
- `ranking-fit-design-2026-11-01.md` (Part 3);
- `ranking-standing-design-2026-11-15.md` (Part 2);
- the F1, F2, F3 and Fit plans.

---

## 12. History

| Date | Change |
|---|---|
| 2026-09-23 | For You's location nudge (city 0.05, state 0.02) |
| 2026-10-02 | The lead feed ranks by catalogue similarity + category match; every plan sees every lead |
| 2026-10-07 | Ranking Part 1, F1 and F2: listings and requirements keep their category answers; seller state, served states, type and capacity |
| 2026-10-17/18 | Every "popular" order becomes recent demand (log2, 7-day half-life); views counted once per viewer per day |
| 2026-10-22 | Profile score is computed by the database and ranks sellers after paid plan |
| 2026-11-01 | F3: one vocabulary of form questions, editable in Cosora-Admin, with match keys and weights |
| 2026-11-13 | The trade-buyer lift for approved international sellers (×1.10 search, +1.0 trending) |
| 2026-11-14 | Requirements past their deadline leave counts, alerts and the digest; Leads shows "Deadline passed" |
| 2026-11-15 | **Fit** orders each seller's lead feed; "Near you"; buyers asked for their state |
| 2026-11-15 | **Standing** replaces profile score in every seller list; My Quotes opens on Recommended |
| 2026-11-15 | Standing's buyer interest reaches back 90 days (`admin.seller_viewer_daily`) |
