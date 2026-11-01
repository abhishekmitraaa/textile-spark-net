# Personalised ranking, Part 3: Fit — design

**Status:** written 2026-11-01 under Mitra's "fix on your own" (2026-10-31). It builds on the decisions in
`documentation/ranking-foundations-design-2026-10-07.md` (Mitra, 2026-10-06/07). Every call this document makes on
its own is marked **Call** and listed again at the end for review.

## What Fit is

Fit scores one vendor against one open requirement. It orders that vendor's lead feed (Quotes → Leads), and every
vendor still sees every lead (decision, 2026-10-07). It changes no one's access. It is not Standing: suggested
suppliers, quote order in My Quotes and search are Part 2.

Today `match_vendor_rfqs` scores `0.7 × text similarity + 0.3 × category match`. Fit keeps both and adds the inputs
Part 1 now stores.

## The score

`score = 0.45 S + 0.20 C + 0.15 A + 0.12 L + 0.08 K`. Each part runs from 0 to 1.

| Part | What it measures | Missing data |
|---|---|---|
| **S**, text similarity | Cosine similarity between the requirement and the vendor's catalogue (unchanged). | 0, as today |
| **C**, category | The requirement's category is one of the vendor's live listing categories (unchanged, including "Others (custom)"). | 0, as today |
| **A**, category answers | The buyer's answers against the vendor's live listings, through `attribute_definitions.match_key` and `match_weight` (F3). | 0.5 |
| **L**, location | The buyer's profile state against the vendor's base state and "states I serve" (F2). | 0.5 |
| **K**, scale | The vendor's monthly capacity for the requirement's category family against the quantity asked (F2). | 0.5 |

**Neutral is 0.5** (decision: "location is neutral when missing"; "scale is neutral when missing"). For a vendor
with none of the new data, every lead gains the same 0.175, so the feed keeps today's order. The 0.45 : 0.20 ratio
is within 4% of today's 0.7 : 0.3. **Call:** the five weights. Text and category stay the larger share because they
are the only parts that are filled for most vendors today. Production on 2026-11-01: 5 of 13 vendors and 2 of 20
buyers have a state; no capacity is filled in; no listing has answers yet.

### A — category answers

- **Which answers count.** These are the requirement's answers whose question has `match_weight > 0`. The question's
  `match_key` names the listing question it means. The price boxes (`budgetMin`, `budgetMax`) never count.
- **The vendor's answers.** These come from the vendor's live listings, under the `match_key`. A listing answer sits
  in `products.attributes` (F1). Four listing questions keep their own column (`fabric`, `gsm`, `pattern`,
  `sizes`). A listing's colours are saved under `colours`, which the requirement key `colors` reads.
- **Comparing.** Values are compared as trimmed, lower-case text. An answer matches when the buyer's values and the
  vendor's values share at least one. **Call:** exact equality, no fuzzy matching. The two forms share option lists,
  so a choice either matches or it doesn't.
- **The part's value.** A = Σ(weight × matched) / Σ(weight), over the answers the vendor has listings for. If the
  vendor has no listing value for a question, that question is skipped: unknown, not a miss. With no question left
  to compare, A = 0.5.

### L — location

| Case | L |
|---|---|
| The requirement is from overseas (P7) and the vendor is tagged export-ready | 1 |
| The requirement is from overseas and the vendor isn't tagged export-ready | 0.5 |
| The buyer has no state, or the vendor gave neither a state nor states served | 0.5 |
| The buyer's state is the vendor's base state | 1 |
| The buyer's state is one of the vendor's "states I serve" | 0.8 |
| The vendor listed states served, and the buyer's state is not among them | 0 |
| The vendor gave only a base state, which is different from the buyer's | 0.25 |

**Call:** export-ready counts for overseas buyers. It is the one place company type and capability tags fit a
requirement without guessing. No requirement says which kind of supplier the buyer wants, so the primary type
stays out of Fit and goes to Standing.

**Near you.** A lead shows a "Near you" badge when L ≥ 0.8 and the requirement is from India. The badge is literally
true: the buyer's profile state is the vendor's state or one they serve.

### K — scale

- **The family.** `public.category_root_of(category uuid)` walks up the requirement's category to its top-level row
  and returns that row's seller-category id (`sellerCategories.ts`, the source the categories table is seeded
  from). Older categories outside the 16 return null.
- **When it is compared.** Only when the vendor's capacity for that family exists, is in the family's usual unit
  (pieces for product families; metres for raw materials; kg for chemicals & dyes), and the requirement has a
  quantity.
- **Its value.** K = min(1, monthly capacity ÷ quantity). Otherwise K = 0.5.
- **Call:** a services family (counted in orders or projects) is never compared, because a requirement's quantity
  isn't a count of projects.

## The app

- **Lead feed:** each lead gets `near` from `match_vendor_rfqs`, and the card shows **Near you** next to the existing
  badges. Sorting is unchanged in the browser: best score first, newest first within a tie.
- **Buyer nudge** (moved here from F2). Location now counts, so the nudge can say so truthfully.
  - **Profile:** a buyer with no state sees **"Add your state** so suppliers near you see your requirements
    sooner." It links to Business details, which opens with the state picker in focus. It takes the one banner slot
    the "Add your city" nudge uses: state first, then city.
  - **My Quotes:** the same line, which can be dismissed for the visit.
  - It never appears on the requirement form (decision, 2026-10-07).

## Not in Fit

- Lead alerts (`lead_alert_fanout`) and the buyer's suggested suppliers (`match_rfq_vendors`) keep their order.
  Suggested suppliers are Standing. **Call:** lead alerts stay as they are until Standing, so one release doesn't
  change who is alerted.
- Nothing changes who can see a lead. The overseas, blocked and expired rules stay exactly as they are.

## Privacy

`match_vendor_rfqs` is a definer function and now reads the buyer's `state_code`. Vendors still never see a buyer's
state. A "Near you" badge does tell a vendor that the buyer is in their state or a state they serve. A vendor could
change their state repeatedly to probe a buyer's state. A state is coarse, and the vendor already talks to the buyer
once they quote, so this is logged in `securityflags.md` as Low.

## Testing

- **SQL harness:** `scripts/ranking/fit_match.sql`, self-rolling-back. It covers every row of the L table, A's
  match, miss and skip cases, K's units and neutral cases, `category_root_of`, unchanged visibility, and "no new data
  keeps today's order".
- **Local browser spec:** `tests/local/ranking-fit.spec.ts`. It checks that a near lead ranks above an otherwise
  equal far lead, that the Near you badge appears, and that the buyer's nudge shows, links to the state picker and
  goes away once a state is saved.
- **Other checks:** typecheck, eslint, i18n, the full local suite, a rehearsal against a copy of production, then
  the release.

## Calls to review (Mitra or Andy)

1. The weights 0.45 / 0.20 / 0.15 / 0.12 / 0.08, and neutral = 0.5.
2. Location values 1 / 0.8 / 0.25 / 0, and export-ready counting for overseas buyers.
3. Category answers match exactly (case-insensitive), and an unknown answer is skipped.
4. Services families are never compared on scale.
5. Lead alerts keep their order until Standing.
