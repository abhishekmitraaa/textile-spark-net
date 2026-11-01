# Search on Cosora: how it works

Last checked against production and `main` on 2026-11-01. Function bodies quoted here were read from the live
database (`pg_get_functiondef`), not from migration files: several were redefined by later migrations.

This is the one place that describes search end to end: how a listing becomes findable, what happens when a buyer
types, how results are ranked, what the search pages show, what is logged, and the trending list built on top of
it. The business rules it obeys live in `claude.md`; this file explains the machinery. When you change search,
update this file in the same change.

---

## 1. The map

| Piece | Where |
|---|---|
| Search landing page `/search` | `src/pages/Search.tsx` |
| Results page `/search/results?q=…` (or `?category=…`) | `src/pages/SearchResults.tsx` |
| Search queries (autocomplete, results) | `src/lib/queries/search.ts` |
| Context-aware filters | `src/lib/searchFilters.ts`, `src/data/sellerCategories.ts` |
| Trending list (app) | `src/lib/searchTrends.ts`, `src/lib/queries/searchTrends.ts` |
| Sponsored cards | `src/components/buyer/SponsoredRail.tsx`, `src/lib/queries/ads.ts`, `src/lib/adSlots.ts` |
| Voice search | `src/hooks/useSpeechSearch.ts` (browser Web Speech API, no key) |
| Search logging | `src/lib/queries/engagement.ts` (`logEngagement`, `markNavSource`) |
| Ranking (database) | `search_products()` → `match_products()` |
| Autocomplete (database) | `search_suggestions()` |
| Sponsored search cards (database) | `search_ads()` → `admin.search_ads_ranked()` |
| Query embedding cache | `search_query_embeddings`, `cache_query_embedding()`, `has_query_embedding()`, `normalise_search_query()` |
| Edge functions | `embed-query` (a buyer's query → vector), `generate-embedding` (listings → vectors, queue drainer), `image-search` (photo → text query) |
| Trending (database) | `admin.search_trends_refresh()`, `trending_searches()`, `admin_search_trend*()`; migrations `20261018120000`–`150000` |
| Cosora-Admin | Insight › Live Activity (top searches), Insight › Trending searches, System Health (embedding pipeline) |

---

## 2. The whole path in one picture

```
 Seller saves a listing
   └─ products.search_text / products.fts   (generated columns, always current)
   └─ trigger enqueue_product_embedding → pgmq queue "embedding_jobs"
        └─ cron "embedding-worker" (every minute) → edge fn generate-embedding → OpenAI text-embedding-3-small
             └─ set_product_embedding() → products.embedding (halfvec 1536, HNSW index)

 Buyer types on /search
   └─ autocomplete: search_suggestions(q)  (categories · listings · sellers, real counts)
 Buyer submits → /search/results?q=…
   └─ search_products(q, 200)
        ├─ looks up the query's vector in search_query_embeddings (never sent to the browser)
        └─ match_products: keyword (full-text) top 40 ∪ vector (cosine < 0.80) top 40
             → fused with RRF (k = 60) → × paid boost (1 + 0.05 × tier) → recent demand breaks ties
   └─ no cached vector? → edge fn embed-query (rate limited) caches it → search runs once more
   └─ the app loads those listings, keeps the server's order, filters with facets, logs impressions
   └─ sponsored cards: search_ads(q) puts campaigns near the query first
```

---

## 3. Making a listing findable

### 3.1 The text a listing is searched by
Two **generated columns** on `products`, recomputed by Postgres on every write, so they can't drift:

- `search_text`: `name`, `description`, `fabric`, `gsm`, `fit_type`, `colour`, `pattern[]`, `occasion[]`,
  `neck_type`, `sleeve_type`, `collar_type`, `category_name`, and every form answer in `attributes`
  (`attributes_search_text()`, Ranking F1, 2026-10-07).
- `fts`: `to_tsvector('english', <the same text>)`. It repeats the `search_text` expression on purpose: a generated
  column can't read another generated column.

`category_name` is denormalised onto `products` (a generated column can't run a subquery) and kept in sync by a
trigger on `category_id`. Category is the strongest single signal: "t-shirt" finds "Ribbed Tank Top" only through it.

Indexes: `products_fts_idx` (GIN on `fts`), `products_embedding_idx` (HNSW, `halfvec_cosine_ops`),
`products_trgm_idx` (GIN trigram on `search_text`; nothing in search uses it today, see §11).

### 3.2 The meaning of a listing (embeddings)
- A trigger (`enqueue_product_embedding`) puts `{table, id, text: search_text}` on the pgmq queue `embedding_jobs`
  whenever the text changes. Videos (`build_video_search_text`) and requirements (RFQs) are embedded the same way.
- `embedding-worker` (pg_cron, every minute) calls `generate-embedding` (service role only): 20 messages per call,
  one call per 20 waiting (at most 10 at once, so a backlog drains in parallel). Each call asks OpenAI `text-embedding-3-small` (1536 dimensions) and writes `products.embedding` through
  `set_product_embedding()`. A message is archived only after the row is written; a failure leaves it queued for the
  next tick (claude.md: "the embedding pipeline is a queue, and failure is the retry").
- `vendor-catalog-recompute` (every minute) keeps each seller's catalogue embedding current for seller matching.
- Health: `embedding-health-log` (every 10 min) and `embedding-health-alarm`; Cosora-Admin › System Health.
- Today: 27 of 27 live listings have an embedding.

---

## 4. The search landing page `/search`

Top to bottom (`Search.tsx`):

1. **Search bar**: typing opens the autocomplete overlay; Enter runs the search. The mic uses the browser's Web
   Speech API (`useSpeechSearch`); a final transcript runs the search.
2. **Photo search**: "Click a photo" / "Select a photo". The photo is shrunk to 1,024 px (JPEG 0.8) in the browser,
   sent to `image-search`, which asks `gpt-4o-mini` for a short garment description or says it isn't a product
   photo (`no_match`). A description runs as a normal search. Every error code has its own message.
3. **Trending** (§8): "Trending yesterday / this week / this month" and the most searched categories. Hidden when
   there is nothing to show or the switch is off.
4. **Recent keywords**: what this visitor searched in this visit. Kept in component state only: it is lost when the
   page unmounts and never stored or sent anywhere.
5. **Browse by category**: the 8 categories with the most live listings, counted by the database
   (`live_category_counts`), with real counts. Tapping one filters the feed below.
6. **Greeting + live feed**: "<first name>, here's what's live" for a signed-in buyer (from `profiles.full_name`),
   "Guest, here's what's live" signed out, nothing until the account has loaded (Mitra, 2026-10-18). The feed is
   `feed_products` (newest first), loaded as the buyer scrolls.
7. **Sponsored cards** in the feed: slot `searchSponsored` (types `searchListing`, `openListing`), a block after
   every 8 cards, at most 3 blocks, each block different campaigns (`active_ads()`, filtered by the chip's category).
8. **Jump to a category**: six fixed shortcuts (T-Shirts, Shirts, Jeans, Kurta, Activewear, Jackets). Each just runs
   that search; they claim nothing about data.

### Autocomplete
`useSearchSuggestions` waits for 2+ characters and a 200 ms pause, then calls `search_suggestions(q, 5)`. It returns
up to 5 of each, matched with `ILIKE '%q%'`:

| Kind | Matches | Order | Number shown |
|---|---|---|---|
| Category | live listings' `category_name` | most live listings | live listings in it |
| Listing | live listings' `name` | recent demand (`product_trend`) | its enquiries |
| Seller | `vendor_profiles.brand_name` | paid plan, then profile score, then followers | followers |

A listing suggestion opens the product; a category runs that search; a seller opens the storefront. Every number is
counted from real rows (the old invented search volumes and celebrity brands are gone: claude.md, "No fabricated data
on the search surfaces").

---

## 5. Running a search

### 5.1 `search_products(query, match_count)`
What the app calls (`useProductSearch`, `match_count` 200; the function caps it at 200 because signed-out callers can
reach it). It:
1. normalises the query (`normalise_search_query`: lower case, trimmed, single spaces);
2. looks it up in `search_query_embeddings`; the vector stays in the database;
3. calls `match_products(query, vector, match_count)` and returns ids, score, both ranks, the boost tier and
   `embedding_used`.

### 5.2 `match_products`: the one place results are ranked
```
keyword hits : p.status = 'live' and p.fts @@ websearch_to_tsquery('english', q)
               ordered by ts_rank, then recent demand            → top 40 (depth = max(match_count, 40))
vector hits  : p.status = 'live' and (p.embedding <=> qvec) < 0.80
               ordered by distance                                → top 40
fused score  : 1/(60 + keyword rank) + 1/(60 + vector rank)        (RRF, k = 60, a listing in both lists gets both)
final score  : fused × (1 + 0.05 × search_boost_tier)              (tier 0–4 from the seller's live plan → at most ×1.20)
order        : final score, then recent demand (product_trend.log2_score), then id
```
Why each part is there:
- `status = 'live'` is load-bearing: the function is SECURITY DEFINER and skips RLS, so this is what keeps drafts,
  listings in review and rejected ones out.
- **RRF, k = 60** (the paper's constant, untuned): blends "contains the words" with "means the same thing" without
  having to compare their raw scores.
- **The 0.80 distance cutoff**: vector search always has a nearest neighbour, so without it gibberish returned the
  whole catalogue. Calibrated on 26 listings (real queries' nearest 0.30–0.52, gibberish 0.83): **re-measure as the
  catalogue grows** (`scripts/search-relevance-check.mjs`).
- **The paid boost is applied after fusion and is bounded at ×1.20**: it can reorder near neighbours, never lift an
  irrelevant listing over a relevant one. The tier is `subscription_plans.limits.search_boost_tier`, only while the
  seller's plan is live (`plan_expires_at` in the future).
- **Recent demand** (`product_trend.log2_score`, 2026-10-17): enquiries weigh 10, a signed-in view 1, a signed-out view
  0.25, and every event fades with time (log2 scale, half-lives). It breaks ties; it doesn't override relevance.

### 5.3 The first search of a new phrase
If the query had no cached vector, the results were keyword-only. The app then calls `embed-query`, which asks
OpenAI for the vector once, stores it (`cache_query_embedding`, `hits` + 1 on repeats) and returns only `{ok}`. The
app runs the search again, now semantic. Every later search of that phrase, by anyone, costs nothing.
- If OpenAI isn't reachable, the key is missing or a budget is used up, keyword results stand, and the results footer
  says "keyword match only". Degraded search admits it (claude.md).
- `embed-query` budgets (`embed_query_rate_check`, checked only on a cache miss): **30 per IP per 5 minutes,
  10,000 globally per hour**. Over budget answers 200 with `ok:false`.
- The cache: `prune-query-embedding-cache` (03:17 daily) deletes phrases unused for 30 days that were searched fewer
  than 5 times, and caps the table at 200,000 rows. 35 phrases cached today.
- Known wrinkle: a query that returns zero rows can't report `embedding_used`, so it re-warms each time.

### 5.4 Back in the browser
`fetchCatalogueByIds` loads the listings, then the app **reapplies the server's order** (an `IN` lookup returns rows
in storage order). The browser never ranks by relevance itself: it can't see relevance, so any re-sort would throw
the ranking away (claude.md).

Photo search: `image-search` budgets (`image_search_rate_check`, every call, no cache): **10 per IP per 10 minutes,
10 per signed-in account per 10 minutes, 300 globally per hour**.

---

## 6. The results page `/search/results`

**Two sources.** With a typed query (or `?category=`), the ranked search above. With nothing typed, there is nothing
to rank: live listings come from `feed_products` in feed order, 96 at a time, as the buyer scrolls.

**Tabs.** Product (the ranked list) and Brand, which groups the same ranked results by seller, so the two tabs can
never disagree. Both counts are real.

**Filters** (`searchFilters.ts`). The facets follow what was searched: "mens t-shirt" gets sleeve, fit, fabric, GSM;
"womens jeans" gets style, wash, waist; "fabric" gets type, GSM, width, weave; and so on. Gender is inferred from the
query and applied as a hidden pre-scope. The Category facet's options and counts come from the results themselves
(counted with every other active facet applied). Facets filter the loaded results in the browser.
- Facet values are compared to column values **exactly**: `products.gender` holds Men / Women / Kids / Unisex, and a
  "Boys" option once made every kids search return nothing. Check a new facet's options against
  `select distinct <column>` on live data.
- A facet with no backing column falls back to `hashPick`, a stable pseudo-value per product (see §11).

**Sort.** "What's new" keeps the incoming order: for a search, that is `match_products`' relevance. Price,
popularity (recent demand), discount and rating re-sort what has loaded.

**Featured places** (subscriptions P10). On a category page only (a category picked, nothing typed, default order),
sellers whose plan features them take the first places, tagged "Featured": VIP, Gold, then Silver, rotating per day
and session (`featured_listings()`, switch `featured_listings`, which lists viewers). A Gold or VIP seller based in or
serving the buyer's state comes first within its tier. Impressions are recorded with `log_featured_impressions`,
which checks the listing really had that place. Never on a typed search: relevance already includes the plan.

**Sponsored cards.** Slot `searchResultsSponsored` (types `searchListing`, `featuredProduct`, up to 12, blocks of 4).
On a search, `search_ads(q)` (2026-10-13) first takes campaigns whose promoted product is within cosine **0.60** of
the query (nearest first), then fills with campaigns the category rule admits, bumped ones before others. The
comparison happens in the database; the browser never sees the vector or the distance. A search with no cached vector
gets `active_ads()`' usual rows. Status, dates, the seller's standing and the viewer's state
(`ad_targeting_matches`) apply as everywhere.

**Video Close-Ups rail.** Live Video Close-Ups (`useVideoCloseUps`), up to 12, ordered in the browser by how many
query words appear in their category, product line or brand.

**Requirement prompts.** A "Submit Requirement" card is interleaved every 5 rows, and the Brand tab ends with one;
both open the Quick RFQ.

**Loading, empty and results are three separate states.** No placeholder products while loading; an empty
catalogue renders empty.

---

## 7. What search records

Through `log_engagement_event()` (SECURITY DEFINER; the browser can't insert directly; `viewer_id` comes from the
session, a guest is a `session_id`; a refused event is counted in `admin.engagement_event_failures`):

| Event | When | Notes |
|---|---|---|
| `search_impression` | a typed search shows results | **one per seller per query**, deduplicated for the page's life; needs a seller, so a search with no results is not recorded |
| `search_click` | a result is opened | carries the product and the query |
| `product_view` with `source = organic_search` | the product page after a search click | `markNavSource` leaves a 15-second marker the product page reads |

Who reads it:
- Sellers' Analytics: "search query performance" (their impressions and clicks by term).
- Cosora-Admin › Live Activity: top searches, **only terms 3+ different visitors made** in the window (privacy floor).
- Trending searches (§8).

A test that opens product pages writes production analytics: see claude.md before pointing one at production.

---

## 8. Trending searches (built 2026-10-18)

### 8.1 Why it exists, and its source
The search page used to show hardcoded "Popular keywords" and "Trending Keywords" lists with invented volumes; they
were removed in September (claude.md: "Curated is not trending"). Mitra asked for trending garment and fashion
keywords from Google Trends, refreshed daily. Google's official Trends API is an invite-only alpha and there were no
keys, so (Mitra, 2026-10-18) **the source is Cosora's own searches**. Google Trends can feed the same tables later
(ToDo).

### 8.2 The rules
- **Window ladder.** The list is for yesterday (India time). With fewer than 5 qualifying terms it widens to the 7
  days to yesterday, then the 30. The heading says which: "Trending yesterday", "this week", "this month".
- **Privacy floor.** A typed term qualifies only when **3+ different visitors** searched it in the window (the Live
  Activity rule: a rare search can identify the person). Active staff don't count.
- **Word filters** (after NFKC normalisation): more than 4 digits of any script, a dot of any kind, "@", "http" or
  "www" keep a term out. They keep the obvious out; free text can always be written round a filter, so staff
  take-down is the control.
- **Categories** count every visitor who clicked a search result in a category or searched its name ("shirt",
  "shirts" → Shirt; "dresses" → Dress). They are Cosora's own words, so they have no floor.
- **Typed terms are not public for now** (Mitra, 2026-10-18, "Categories only for now"). A guest is counted by a
  session id its own browser sends, and `log_engagement_event` is open by design, so a script can pose as 3 visitors
  and publish any words. The `search_trending_terms` switch stays off until terms need staff approval or only
  signed-in searches count.
- Words only reach the public, never counts.

### 8.3 The machinery
- `admin.search_trend_terms(from, to)` / `admin.search_trend_categories(from, to)` count; `admin.search_trends_refresh()`
  picks the window and writes one `admin.search_trend_runs` row and its `admin.search_trend_items` (rank, label,
  visitors, visitor-days). A refresh only inserts; the newest run is in force.
- Job **`search-trends-refresh`** at 18:40 UTC (**00:10 India time**) runs it and prunes runs over 90 days old. A hide
  or unhide also recomputes at once.
- `trending_searches()` (anyone) returns `{public, shown, window, ist_day, terms[], categories[]}`: `shown` follows
  the `search_trending` switch; terms also need `search_trending_terms`.
- **Delivery at scale.** A new run, or a change to either switch, queues the rebuild of `site-config/site.json`
  (`site-config-snapshot` puts the signed-out answer in its `search_trends` key; the hourly snapshot job rebuilds it
  too). The app already loads that file from the CDN on every page, so the list costs no request per visitor.
  Only an account the switch lists, while it isn't on for everyone, reads `trending_searches()` itself.
- The app shows a list only when it is for yesterday (`isShowable`): if the job hasn't run, nothing is shown rather
  than an old list labelled "yesterday".
- **Volume** (1M synthetic events, local): 30-day terms 5.8 s, categories 1.5 s, one day 0.19 s, a full nightly run
  0.49 s. The 30-day path only runs when traffic is thin. Partial index `engagement_events_search_time_idx`.

### 8.4 Cosora-Admin › Trending searches (`/trending-searches`)
The list in force with visitors and visitor-days, both switches' state, recent computations, and the hidden terms.
Super admins, support and managers read; **super admins and support hide** a term (or a category of that name) with a
reason, which reaches the Admin Log (`admin_search_trend_hide` / `_unhide`). An unhidden term keeps its row as
history. While typed terms are off, the page says so.

### 8.5 Where it stands (2026-11-01)
Live for everyone since 2026-10-18, categories only. The job has run every night. The list is the 30-day window
(search traffic is light): Jeans, Activewear, Shirt, Belts, Denim, Kids Wear. Three typed terms pass the floor and
stay hidden.

---

## 9. Rules to keep (the short list)

1. **One ranking place.** Relevance is decided in `match_products` only. Don't re-sort search results in the
   browser for relevance; the browse feed's boost sort is a different surface.
2. **Every function that returns listings filters `status = 'live'` itself** (definer functions skip RLS).
3. **Vectors never reach the browser.** The app sends text and gets ids back.
4. **No fabricated data on search surfaces**: every number is counted from rows; empty renders empty; degraded
   search says "keyword match only".
5. **A public list of what people typed needs a floor** (3 visitors), and is off until abuse is solved (§8.2).
6. **Changing a function's parameters overloads it** (`create or replace` with an added parameter left two
   `match_products` and broke all search in production once). Drop the old signature in the same migration.
7. **A SECURITY DEFINER function that touches vectors needs `search_path = public, extensions`**, or `<=>` doesn't
   resolve.
8. **HNSW is used only when the query vector is a constant or parameter**: a vector from a join gives a sequential
   scan. Benchmark through the real RPC.
9. **Facet options must equal column values exactly.**
10. **Re-measure the 0.80 (search) and 0.60 (ads) cutoffs** as the catalogue grows.

---

## 10. Built for volume: what holds at 10,000 concurrent buyers, and what to watch

Holds:
- Ranking is one indexed SQL call (GIN full-text, HNSW vector, 40 + 40 candidates).
- A phrase is embedded once, ever; repeat searches cost one indexed read. OpenAI spend is bounded by two budgets.
- The trending list rides on a CDN file every page already loads.
- Impressions are logged once per seller per query, not per card.

To watch as the catalogue grows (none is a problem at 27 live listings):
- `search_suggestions` matches with `ILIKE '%q%'` on `name`, `category_name` and `brand_name`, and counts each
  matching seller's followers with a subquery. That scans the tables on every pause in typing. The trigram index
  `products_trgm_idx` covers `search_text`, not `name`. Add trigram indexes on the matched columns (or match on
  `search_text`) and a follower count column before the catalogue is large.
- The results page asks for 200 results and filters them in the browser: facets see only those 200.
- The Video Close-Ups rail matches query words over every live video in the browser.
- `match_products` re-ranks only its top 40 + 40; a very broad query on a big catalogue sees only those.

---

## 11. Known gaps and open items

- **Typed trending terms are off** until staff approve terms or only signed-in searches count (§8.2).
- **Google Trends** as a source: ToDo, waiting for access or a paid provider.
- **Searches with no results are not recorded** (an impression needs a seller), so trending and analytics can't see
  demand Cosora can't serve yet.
- **Recent keywords aren't kept** beyond the page visit.
- **`hashPick` facets**: a facet with no backing column gives each product a stable pseudo-value. That is invented
  data in a filter; replace each with a real column or remove it.
- **The 0.80 / 0.60 cutoffs** were calibrated on ~26 listings.
- **A zero-result query re-warms its embedding on every search** (§5.3).

---

## 12. Tests and tools

| What | How |
|---|---|
| Search relevance, cutoff | `node scripts/search-relevance-check.mjs`, `scripts/search-smoke.mjs` |
| Photo search | `node scripts/image-search-check.mjs` |
| Trending: SQL harness (38 cases, rolled back) | `docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 -q < scripts/search-trends/trends.sql` |
| Trending: through PostgREST | `scripts/search-trends/rest-check.mjs` (local tokens) |
| Trending: the snapshot function | `node --experimental-strip-types scripts/search-trends/snapshot-check.mjs` |
| Trending: browser | `tests/local/search-trending.spec.ts` (local stack, `playwright.local.config.ts`) |
| Local site.json rebuild | `scripts/search-trends/rebuild-local-snapshot.mjs` (the local trigger posts to production's URL) |

---

## 13. History

| Date | Change |
|---|---|
| 2026-09-06 | Full-text + vector search, RRF fusion, paid boost after fusion (`match_products`); query embedding cache; autocomplete from real rows |
| 2026-09-08/09 | Search logging (impressions per seller, clicks, `organic_search` views); 0.80 distance cutoff; invented search data removed |
| 2026-09-10 | Rate limits on `embed-query` and `image-search`; photo search answers "not a product photo" |
| 2026-09-11 | "Curated is not trending": `/home/trends` relabelled; trending ToDo opened |
| 2026-10-07 | Form answers (`attributes`) become part of `search_text` (Ranking F1) |
| 2026-10-09 | Featured places and spotlight on category pages (subscriptions P10) |
| 2026-10-13 | Sponsored search cards ordered by semantic nearness (`search_ads`) |
| 2026-10-14 | Results without a query load 96 at a time from `feed_products`; category counts by the database |
| 2026-10-17 | Recent demand (`product_trend`) breaks ties in search and orders listing suggestions |
| 2026-10-18 | Trending searches (own searches; categories only); greeting by name or "Guest"; search capped at 200 for signed-out callers (2026-10-19) |
| 2026-10-22 | Seller suggestions ordered by plan, then profile score |
