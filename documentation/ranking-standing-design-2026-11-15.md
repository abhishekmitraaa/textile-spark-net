# Personalised ranking, Part 2: Standing — design

**Status:** LIVE 2026-11-15 (migration 20261115110000). Written 2026-11-15 under Mitra's "fix on your own" (2026-10-31) and "continue" (2026-11-15). It builds
on the decisions in `documentation/ranking-foundations-design-2026-10-07.md` (Mitra, 2026-10-06/07) and the profile
score rule (Mitra, 2026-10-22: "not above paid plan"). Every call made here without Mitra is marked **Call** and
listed again at the end.

## What Standing is

Standing is one number from 0 to 1 for each seller: how good a seller is to send a buyer to, whatever the buyer
asked. It ranks sellers for buyers. Fit (Part 3, live) ranks requirements for a seller; Standing is the other side.

**Where it is used:** wherever a seller list is ordered today by profile score. Paid plan still goes first
everywhere it went first; Standing replaces profile score inside each tier, and profile score becomes one of
Standing's inputs.

| Surface | Today | With Standing |
|---|---|---|
| Recommended Premium Brands (`top_vendors`) | paid, profile score, rating | paid, Standing, rating |
| Brand suggestions on Following (`new_brand_suggestions`) | paid, profile score, recency | paid, Standing, recency |
| Sellers in search suggestions (`search_suggestions`) | paid, profile score, followers | paid, Standing, followers |
| A requirement's matched sellers (`match_rfq_vendors`) | paid, then match + 0.1 × profile score | paid, then match + 0.1 × Standing |
| Lead alerts (`admin.lead_alert_fanout`) | VIP, match + 0.1 × profile score, plan | VIP, match + 0.1 × Standing, plan |
| A buyer's quotes (My Quotes) | Most Recent, Lowest Price, Highest Rating | a new **Recommended** order, the default |

**Call:** the buyer's own quotes are ordered by Standing alone, with no paid tier. The buyer asked these sellers for
offers; letting a paid plan push one quote above another would sell a place in the buyer's own comparison. The other
three sorts stay.

## The score

`Standing = 0.30 I + 0.25 R + 0.15 A + 0.15 T + 0.15 P`. Each part runs from 0 to 1.

| Part | Measures | Source |
|---|---|---|
| **I**, buyer interest | People who came back to this seller, over the last 90 days | listing views (`product_view_daily`), follows, chats a buyer started |
| **R**, reviews | The seller's reviews and its listings' reviews, Bayesian-weighted | `reviews`, `product_reviews` |
| **A**, activity | How often and how fast the seller answers requirements, over 90 days | `quotes` against `rfqs` |
| **T**, trust | What Cosora has checked about the seller | registration, documents, trust seal, fraud findings |
| **P**, profile score | How complete the profile is | `vendor_profiles.profile_score` / 100 |

Buyer interest weighs most and more than activity (decision, 2026-10-07: "buyer interest weighted more").

### I — buyer interest
- **Unique people:** the distinct signed-in viewers of the seller's listings in the last 90 days (never the seller),
  plus followers who followed in that window, plus people who messaged the seller in that window; a person counts
  once across the three. A signed-out viewer's key is made by the browser, so anyone could mint them: those views
  don't count (found by the automated security review).
- **Repeat visits:** viewers who came back on at least two different days.
- `I = min(1, log2(1 + unique + repeat) / log2(201))`. A seller with 200 interested people in 90 days is at the top.
  **Call:** the 200 ceiling is fixed, not relative to the busiest seller, so one big seller doesn't flatten everyone.

### R — reviews
- Every rating of the seller (`reviews`) and of its listings (`product_reviews`), 1 to 5.
- Bayesian average: `(C × m + Σ ratings) / (C + n)`, with `C = 5` and `m` the average of every rating on Cosora
  (4 when there are none). `R = (average − 1) / 4`.
- A seller with no reviews sits at the platform average, neither helped nor hurt. Never the seeded
  `products.rating_avg` (claude.md).

### A — activity
- **Volume:** quotes sent in the last 90 days, `min(1, log2(1 + q) / log2(31))` (30 quotes is the top).
- **Speed:** the median hours from a requirement going live to this seller's quote; 1 at 4 hours or less, falling
  evenly to 0 at 72 hours.
- `A = (volume + speed) / 2`; with no quotes in the window, speed is 0.

### T — trust
- 0.5 when the seller's registration is approved (`vendor_registrations.status = 'registered'`, or a seller who
  registered before registrations were reviewed: `onboarding_complete`);
- 0.25 when Cosora has verified at least one of its documents (`vendor_documents.verified`);
- 0.25 when it carries the trust seal from verification or a bought seal (`is_verified`, `ad_verified_until`). **Call:**
  a paid plan's seal doesn't count here, because paid plan already ranks first.
- **A fraud finding** against the seller that isn't withdrawn (`admin.fraud_findings`) sets T to 0 and halves
  Standing. **Call.**

### New sellers
For the first 30 days of a seller's account, I and A count as at least 0.5, so a new seller isn't buried for having
no history yet. **Call.** The account's age, not its listings': unlisting everything and listing afresh doesn't make
an old seller new (security review).

## How it is kept

- `admin.vendor_standing`: one row per seller (Standing and its five parts, when computed). Not readable by clients.
- `admin.refresh_vendor_standing()` recomputes every seller; a pg_cron job, `vendor-standing-refresh`, runs it
  every hour. A seller without a row yet counts 0.5 until the next run.
- `public.vendor_standing(p_vendor uuid)` returns a seller's Standing rounded to two decimals (0.5 without a row),
  for the ranking functions only: no client can call it. A queryable number would let anyone watch a seller's
  Standing halve when staff record a fraud finding (security review). `top_vendors` and `new_brand_suggestions`,
  which ran with the visitor's rights, now run as definer to read it; their filters are explicit (live listings, the
  caller's own follows), so they return what they returned before. Nothing in the app shows the number.
- **My Quotes:** `quote_order_for_rfq(p_rfq uuid)` returns the caller's own requirement's quote ids, best Standing
  first (42501 for anyone else's requirement). It returns ids only, never the scores.

## Not in Standing

- **Company type.** No buyer says which kind of supplier they want, so ranking manufacturers above traders would be a
  guess. It stays a label and a filter. **Call.**
- **Product ranking** (feeds, product search) keeps recent demand (2026-10-17); Standing ranks sellers, not listings.
- **Location** is Fit's, not Standing's.

## Testing

- SQL harness `scripts/ranking/standing.sql`: each part's edges (no data, the ceilings, repeat visits, the Bayesian
  pull, speed bounds, each trust piece, a fraud finding, the new-seller floor), the weighted total, paid still first
  in each function, `quote_order_for_rfq` ownership, and no client access to the table or the refresh.
- Local spec `tests/local/ranking-standing.spec.ts`: My Quotes opens on Recommended, with the better-standing seller's
  quote first, and the other sorts still work.
- Typecheck, lint, i18n, the full local suite, a rehearsal against production's state, then the release.

## Calls to review (Mitra or Andy)

1. The weights 0.30 / 0.25 / 0.15 / 0.15 / 0.15.
2. A buyer's own quotes ordered by Standing with no paid tier; Recommended as the default sort.
3. The ceilings: 200 interested people, 30 quotes, 4 to 72 hours.
4. Trust: a paid plan's seal not counted; a fraud finding halves Standing.
7. Only signed-in viewers count towards interest (signed-out views can't be told from minted ones).
5. The 30-day floor for new sellers.
6. Company type left out of the score.
