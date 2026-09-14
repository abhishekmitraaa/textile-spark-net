# Cosora Advertising System v3 — Full Session Report

**Repos:** `textile-spark-net` (buyer/vendor app) + `cosora-admin` (admin panel), one shared Supabase project (`vxdhhgdfubqedfpwfyrb`, Postgres 17.6).
**Scope of this document:** everything done in this session, from the original 11-phase master prompt through to the final search-placement / repeating-slots / certificate-fulfilment / vendor-payments work. All "still open" items below were re-verified live against the database in the last hour, not recalled from memory.

---

## 1. Ground rules the whole build operated under

These were stated up front and enforced throughout — every design decision below traces back to one of these:

1. **No mock data.** Empty state renders empty, never fabricated content.
2. **Additive migrations only.** Never drop a column or table.
3. **Payment is never approval, no exception.** Every vendor-purchased ad requires admin approval before it can be served to a buyer.
4. **One taxonomy.** Reuse the existing category table as the only targeting vocabulary — no second parallel category system.
5. **SECURITY DEFINER pattern for all status changes.** Authorization checked *inside* the function, which RAISES on refusal — never a bare client-side UPDATE (see §3 for why this specific rule exists).
6. **Contextual, first-party targeting only.** No third-party tracking, no new invasive personal-data collection.
7. **Flat-rate pricing only.** No auction, no automated bidding, no CPC ranking in this pass.
8. **Real APIs or honest interim steps.** No static link pretending to be a dynamic integration.
9. **Vendor pages keep their own brand colour** (`#256fef`), distinct from buyer pages (`#EF4D62`/`#ef4d62`) — confirmed from the actual repo, not assumed.
10. **Verify the tooling before trusting it.** Typecheck/lint commands were confirmed to report a non-zero baseline before being trusted to report zero.
11. **Seven ad types were explicitly told NOT to get an invented placement**: `searchListing`, `directBroadcast`, `webMobileCombo`, `fbInsta`, `googleProduct`, `socialCombo`, `verifiedCertificate` — "flag them back for a pricing-page decision instead of inventing somewhere for them to go." (Two of these were later resolved this session with real decisions — see §7.)

---

## 2. Phase-by-phase build narrative

### Phase 0 — Inspect before assuming
Every phase started by reading the actual schema, actual RLS policies, actual grants, and actual live data before writing a line of code. This caught several false assumptions baked into the original prompt (e.g. it assumed a banner-management table existed; it doesn't — nothing in the database matches `%banner%`).

### Phase 1 — Campaign state model
The `advertisements.status` check constraint was widened from 5 values to 12, plus 2 legacy values kept for backward compatibility (additive rule):

```
draft, pending_review, scheduled, active, rejected, changes_requested,
paused_by_vendor, paused_by_admin, expired, budget_exhausted, suspended, archived
-- legacy, still accepted, never written by new code:
paused, ended
```

`budget_exhausted` is documented as **structurally unreachable** — pricing is flat-rate/prepaid, there are no budget columns anywhere, so nothing can ever set this status. This was stated explicitly rather than left as a silent dead value.

A new append-only table, `ad_review_log`, was created: every status transition writes a row (reviewer, previous status, new status, decision, reason code, note, timestamp via `clock_timestamp()` — not `now()`, because several rows can land in one transaction and `now()` would stamp them all identically). RLS: owner or admin can SELECT; nobody has INSERT/UPDATE/DELETE grants at all — the only way a row is ever written is from inside a SECURITY DEFINER function.

**The core fix of this phase:** `guard_ad_activation()` was rewritten and — critically — bound to **INSERT**, not just UPDATE, via a new trigger `trg_guard_ad_activation_insert`. This closed the actual hole in the system. See §3 for why this mattered more than anything else in the build.

### Phase 2 — Review RPCs
Nine SECURITY DEFINER functions, each checking authorization inside itself and raising `42501` on refusal, replacing every bare client-side status UPDATE:

`approve_ad_campaign`, `reject_ad_campaign`, `request_ad_changes`, `resubmit_ad_campaign`, `pause_ad_campaign_by_vendor`, `pause_ad_campaign_by_admin`, `resume_ad_campaign`, `suspend_ad_campaign`, `archive_ad_campaign`, plus an internal shared applier `ad_apply_decision`.

The two pause functions are deliberately separate: a vendor may lift their own pause, but must not be able to lift an admin's pause on their own campaign.

### Phase 3 — Delivery, eligibility, targeting, sweep, frequency capping
This is the "contextual targeting" engine — fully detailed in §6. Summary of what was built:
- `is_ad_eligible()` — the single gate every ad passes through before a buyer ever sees it
- `ad_targeting_matches()` — category + city matching against the one taxonomy
- `vendor_account_in_good_standing()` — suspended vendors stop serving immediately
- `active_ads()` rewritten to call all of the above, with recency-only ordering (no bidding)
- `ad_frequency_capped()` — 8 impressions/viewer/ad/day, counted from `engagement_events`
- `sweep_ad_schedules()` — cron every 5 minutes, flips `scheduled→active` and `active→expired` on wall-clock time
- `ad_impression()` / `ad_click()` — session-scoped logging RPCs, dropped and recreated with new signatures (the overload trap — see §8)

**Decision made and documented:** frequency capping suppresses *logging only*, not rendering — an ad past its daily cap still shows, it just stops counting. This was a direct resolution of a contradiction between two parts of the original spec (one section implied suppression, another explicitly said it shouldn't).

### Phase 4 — Admin review UI
`AdReviewQueue.tsx` — four tabs (Waiting for review / Changes requested / Scheduled / Suspended), oldest-first ordering, a fixed vocabulary of 8 reason codes (not free text, so a rejection-reason breakdown report doesn't split "misleading" and "Misleading claims" into two buckets), full decision history per campaign, and Phase 8.3 metric tiles.

### Phase 5 — Buyer placement build-out
Built against a 5-artboard mockup you supplied as a Claude artifact. Full detail in §7.

### Phase 6 — Fraud/frequency basics
`ad_fraud_signals()` — a read-only heuristic scan (clicks concentrated in very few viewers, clicks rarely leading to a product/profile view, one viewer clicking many times). **Deliberately read-only, not auto-suspend** — the original prompt contradicted itself here (one line said "route flagged campaigns to `suspend_ad_campaign`", another said "never auto-block"), and the read-only resolution was chosen and documented as the one that doesn't silently violate the second instruction.

### Phase 7 — WhatsApp via real APIs
No Meta Business account, WABA, or BSP relationship exists for this project. You said you're building your own messaging service in a separate repo. So `messaging.ts` was built as a **seam**, not a stub: a `MessagingProvider` interface (`kind`, `label`, `canReach`, `open`) that every call site goes through, with `messaging()` selecting the active provider. Today's only provider is a real per-vendor `wa.me` click-to-chat link (replacing a hardcoded platform-wide number) — honestly labelled as click-to-chat, not an API integration, with no server-side delivery capability.

### Phase 8 — Reporting
`ad_review_metrics()` — queue depth by status, oldest-waiting-hours, decision counts, average hours-to-decision, rejection-reason breakdown, fraud-flagged count. All authorization-gated (see §9, bug #1 for the fix this needed).

### Phase 9 — Live verification
Every claim in this build was proven with **self-rolling-back SQL transactions** — a `DO $$ ... RAISE EXCEPTION ... $$` block that performs the real operations, records the real before/after state as text, then raises an exception so the whole transaction rolls back and touches nothing. This was used dozens of times across the session (full list of proof-matrices in §10).

### Phase 10 — Report
This document and its predecessors in-conversation.

### Phase 11 — Semantic ad matching
**Explicitly not built**, per your instruction. See §5 for exactly what this would mean and why it's still skipped.

---

## 3. THE actual security hole this entire build closed

Before this build, `guard_ad_activation()` only fired on UPDATE. But the real payment path (`razorpay-verify-payment`) never UPDATEs a draft row to active — it **INSERTs** a new row with `status: "active"` directly, running as `service_role`, which bypasses RLS entirely. With no INSERT-time trigger, there was no wall at all — a paid campaign went straight to `active` and was served to buyers immediately, with zero admin review ever happening.

Proven live, before/after, with self-rolling-back transactions:

| Scenario | Before | After |
|---|---|---|
| Paid campaign inserted as `active` | **served to buyers = true** | lands on `pending_review`, served = false |
| `rejected → paused → active` (vendor revives own rejected campaign) | succeeds | refused, `42501` |
| Campaign with a future `starts_at` | **served today anyway** | correctly not served |
| Suspended vendor's campaigns | kept serving | stopped serving |
| Trust seal (`trustedSeal`/`verifiedCertificate`) | granted **at payment**, before any review | 0 at payment, granted only at `approve_ad_campaign()` |

This is the single most consequential fix in the entire session — everything else is refinement on top of a system that, before this, had no actual admin gate at all despite one being claimed to exist.

---

## 4. Complete migration list applied this session (in order)

Real applied versions from Supabase's migration history (not the filenames I originally wrote — Supabase reconciles the timestamp on apply):

| Version | Name | What it did |
|---|---|---|
| `20260911193153` | `ad_review_state_model` | Early first pass at the state model (superseded by the 2026-09-12 version below) |
| `20260911211427` | `ad_review_rpcs` | Early first pass at review RPCs |
| `20260911211443` | `ad_delivery_eligibility_and_targeting` | Early first pass at eligibility |
| `20260911211503` | `ad_event_logging_fraud_and_frequency` | Early first pass at frequency capping |
| `20260911211513` | `ad_review_metrics` | Early first pass at metrics |
| `20260911211656` | `ad_review_log_statement_order` | Ordering fix |
| `20260911211943` | `active_ads_context_modes` | Early context modes |
| `20260912095353` | `ad_campaign_state_model` | **Phase 1** — 12-status model, `ad_review_log`, INSERT-time `guard_ad_activation` (the real fix, §3) |
| `20260912095715` | `ad_review_rpcs` | **Phase 2** — the 9 review RPCs, finalized |
| `20260912100056` | `ad_eligibility_targeting_and_sweep` | **Phase 3** — `is_ad_eligible`, `ad_targeting_matches`, `sweep_ad_schedules`, frequency capping |
| `20260912101142` | `ad_multi_category_context` | Widened targeting to accept an array of categories (For You's plural-preference case) |
| `20260912101930` | `ad_fraud_signals_and_review_metrics` | **Phase 6/8** — fraud heuristic (read-only) + metrics RPC |
| `20260912103147` | `grant_seals_on_approval_not_payment` | Moved trust-seal grant from payment time to approval time |
| `20260913103311` | `ad_review_hardening` | **Code review fixes** — 4 self-introduced gaps closed (§9) |
| `20260913180619` | `certificate_orders` | **Certificate fulfilment** — new table, RLS, trigger, 5 fulfilment RPCs |
| `20260913182505` | `certificate_orders_revoke_default_grants` | **Self-caught fix** — closed the default-grant gap on the certificate table |

Plus pre-existing infrastructure this build relied on but did not create: `advertisements_buyer_publish_and_analytics` (20260705), `ad_payment_intents_and_rls_lockdown` (20260705), `ad_targeting`/`ad_verifications`/`ad_category_benchmarks` (20260716), `ad_orders_refund_review_status` (20260718), `add_category_name_to_active_ads` + `make_active_ads_ordering_total` (20260727).

---

## 5. The contextual targeting algorithm — full technical detail

There is **no ranking model, no machine learning, no vector similarity, and no bidding** in ad delivery. It is a deterministic filter, in this exact order:

### Step 1 — Eligibility gate (`is_ad_eligible`)
```sql
select a.status = 'active'
   and (a.starts_at is null or a.starts_at <= now())
   and (a.ends_at   is null or a.ends_at   >  now())
   and public.vendor_account_in_good_standing(a.vendor_id)
   and public.ad_targeting_matches(a, p_categories, p_city);
```
Four AND conditions. All must pass. `vendor_account_in_good_standing()` calls the shared `account_is_active()` — a suspended vendor's campaigns stop serving the instant the suspension is applied, with no separate ad-specific suspension logic to keep in sync.

### Step 2 — Targeting match (`ad_targeting_matches`)
```sql
select
  ( p_categories is null or cardinality(p_categories) = 0
    or a.target_categories is null
    or jsonb_array_length(a.target_categories) = 0
    or exists (select 1 from unnest(p_categories) pc
               where a.target_categories ? pc::text) )
  and
  ( a.target_cities is null
    or jsonb_array_length(a.target_cities) = 0
    or (p_city is not null and a.target_cities ? p_city) );
```
Read this carefully — it is **not symmetric** between "untargeted" and "unmatched":
- If the **ad** has no target categories set → it matches every viewer context (untargeted = universal).
- If the **viewer** has no category context → the ad only matches if it's also untargeted (the `p_categories is null` branch only kicks in when *nothing* was passed in at all, not per-ad).
- City is stricter: if the ad targets specific cities, an unknown viewer city **fails closed** — they will not see it. There is no "assume they're everywhere" fallback.

### Step 3 — Multi-category union (For You's case)
`For You` targets on the buyer's *stored preferences*, which is plural and each preference maps to multiple taxonomy rows. `active_ads()` unions the singular and plural category filters:
```sql
nullif(array_remove(coalesce(filter_categories, array[]::uuid[]) || filter_category, null), array[]::uuid[])
```
This exists specifically so a buyer with 3 preferences sees campaigns targeting *any* of those 3, not just the first one — an earlier version of the targeting only read the singular parameter and silently ignored every preference after the first.

### Step 4 — Placement type filter
```sql
filter_placements is null
or exists (select 1 from unnest(filter_placements) fp
           where (',' || replace(coalesce(a.placement,''),' ','') || ',') like ('%,' || fp || ',%'))
```
`advertisements.placement` is a comma-joined string (e.g. `"openListing,trustedSeal"`), because one purchase can legitimately buy several placement types. The comma-wrapping (`',' || ... || ','`) is deliberate — without it, a filter for `"list"` would incorrectly match a placement containing `"...listing..."` as a substring.

### Step 5 — Ordering
```sql
order by a.created_at desc, a.id desc
```
Newest campaign wins. No relevance score, no bid amount, no CPC, no quality score. This is a direct consequence of ground rule #7 — flat-rate pricing only, no auction in this pass. The `id desc` tiebreaker exists so two campaigns created in the same millisecond still sort deterministically (important for the block-slicing math in §7 — an unstable sort would let the same ad drift between blocks on every fetch).

### Step 6 — Frequency capping (logging-only)
```sql
select count(*) from engagement_events
 where ad_id = p_ad and (viewer_id = auth.uid() or session_id = p_session)
   and event_type = 'ad_impression' and created_at >= date_trunc('day', now())
>= 8
```
Signed-in viewers are keyed on `auth.uid()`; signed-out viewers on an anonymous session id. Past 8 impressions/day, the ad **still renders** — only the impression counter stops incrementing, so a vendor isn't billed/credited for impressions beyond what's meaningfully countable, but the buyer's experience doesn't change.

### Step 7 — Sweep (time-based promotion/expiry)
A cron job every 5 minutes calls `sweep_ad_schedules()`, which promotes `scheduled → active` campaigns whose start time has arrived, and expires `active/scheduled/paused* → expired` campaigns whose end time has passed. Both transitions go through `ad_apply_decision()` — the same internal function every RPC uses — so a scheduled campaign going live writes the same kind of `ad_review_log` row and buyer notification a human approval would.

### What "context" actually is, per page
| Page | Context source | How resolved |
|---|---|---|
| New Arrivals | none | untargeted rail |
| Trends | the trending hashtag chip | resolved by name to a `categories` row via `resolveFilterSchema`/name lookup |
| Sale | none | cross-category page by definition, no single category to narrow to |
| For You | buyer's stored preferences (plural) | `pref_category_map` maps each preference to multiple taxonomy rows, unioned |
| Following | none | interleaved slide, not a targeted rail |
| Search | selected category chip | resolved by name |
| Search Results | selected facet → dominant category of matched results → raw query text | three-tier fallback, first non-null wins, resolved by name against the one taxonomy |

---

## 6. Role of the vector database — **none, for advertisements**

This needs to be stated precisely because it's easy to assume "contextual targeting" implies semantic/embedding matching. It does not, anywhere in this build.

### What the vector pipeline actually is (for organic search, unrelated to ads)
Cosora has a real, running embedding pipeline, built well before this session:
- `products`, `rfqs`, and `product_videos` each carry a `halfvec(1536)` column.
- A trigger enqueues a job into a `pgmq` queue on insert/update of relevant text fields.
- `pg_cron` dispatches queued jobs to an Edge Function on a schedule, adaptively (backs off under load).
- The Edge Function calls OpenAI's embedding endpoint and writes the vector back.
- `match_products(query text, query_embedding halfvec, match_count int, boost_weight float, max_distance float)` fuses keyword full-text search with vector cosine similarity using **Reciprocal Rank Fusion (RRF)** — two independently ranked lists (keyword hits, vector-nearest hits) are merged by rank position rather than raw score, which avoids one signal dominating just because its score scale is bigger. A `boost_weight` parameter lets a vendor's paid plan tier nudge their own products up within that fused ranking (a real, existing thing — separate from the advertising system entirely).

### What touches ads: nothing
`advertisements` has **no embedding column**. `active_ads()` never calls `match_products()` or any vector operation. Ad targeting is purely the category/city set-membership matching described in §5 — an ad tagged "Jeans" will not match a search for "denim trousers" unless "denim trousers" happens to resolve to the same taxonomy row by name; there is no semantic fallback.

This was a deliberate scope decision, not an oversight — Phase 11 of the original master prompt was titled "semantic ad matching" and explicitly marked "do not build unless asked." It stayed unbuilt through the entire session. There is an open ToDo item (`documentation/ToDo.md`, updated 2026-09-13) noting that this decision is now more relevant than when it was written, because `searchListing` — the ad type that would benefit most from semantic matching — went from unplaced to placed this session. Building the embedding column and wiring it into `match_products`'s fusion (or a parallel `match_ads`) is the concrete next step if you want it, but nothing has been built toward it.

---

## 7. Where every ad type is placed — complete map

### The 8 live slots (defined in `src/lib/adSlots.ts`, a dependency-free data module checked by `scripts/ad-slot-map-check.mjs`)

| Slot id | Page | Position in page | Ad types accepted | Max fetched | Repeat structure | Blocks rendering live |
|---|---|---|---|---|---|---|
| `newArrivalsSponsored` | New Arrivals | "Sponsored" rail, above Video Close-Ups | `openListing` | 12 | 3 blocks × 4 | 3 |
| `newArrivalsBrandPicks` | New Arrivals | "Brand Picks" rail | `storePromotion`, `brandAd` | 8 | 2 blocks × 4 | 1 (only 3 campaigns match today) |
| `trendsSponsored` | Trends | "Sponsored — trending in #{hashtag}" | `featuredProduct`, `wholesalerPick` | 12 | 3 blocks × 4 | 2–3 depending on category |
| `saleSponsored` | Sale | "Sponsored deals" | `openListing`, `featuredProduct` | 12 | 3 blocks × 4 | 3 |
| `forYouSponsored` | For You | "Related To Recent Views" | `openListing`, `featuredProduct` | 12 | 3 blocks × 4 | 3 |
| `followingBrands` | Following | interleaved 1-in-4 into "Looking for New Brands?" carousel | `storePromotion`, `brandAd` | 8 | interleaved, not blocked | n/a — ratio-based, not depth-based |
| `followingPopular` | Following | "Most Popular" (shown only once the followed-brand feed runs dry) | `openListing` | 8 | 2 blocks × 4 | 2 |
| `searchSponsored` | Search (`/search`) | scrolled feed, every 8 products | `searchListing`, `openListing` | 12 | 3 blocks × 4 | 3 |
| `searchResultsSponsored` | Search Results (`/search/results`) | product grid, every 8–12 products | `searchListing`, `featuredProduct` | 12 | 3 blocks × 4 | 3 |

Plus two non-slot surfaces:
- **`trustedSeal`** — renders as the existing product-card badge (a small overlay on the card image), not a rail. Granted at approval, not payment (§3).
- **`verifiedCertificate`** — not a placement at all. It is fulfilment: a physical certificate posted to the vendor. See §8.

Plus one **deferred** slot:
- **`newArrivalsBanner`** — reserved for `websiteBanner`/`mobileBanner`, but not rendered. The original spec claimed it "reuses the admin's existing (unused) banner-management table" — confirmed live that no such table exists anywhere in the schema. Rendering these as ordinary product cards would missell both types, so the slot exists in code (so the placement *decision* is recorded) but nothing calls it.

Plus five **unplaced** types, each with a stated reason in `UNPLACED_AD_TYPES`:
- `directBroadcast` (₹15/msg) — no buyer-facing messaging surface exists to deliver into; blocked on your separate messaging-service repo.
- `webMobileCombo` (₹129) — a bundle of `websiteBanner` + `mobileBanner`, which already share the one deferred banner slot; a separate placement would render the same banner twice.
- `fbInsta` (₹59) — off-platform Facebook/Instagram reach; no on-platform slot can honestly represent it.
- `googleProduct` (₹59) — off-platform Google Shopping reach; same reasoning.
- `socialCombo` (₹99) — bundle of the two above, both off-platform.

### The repetition mechanism (built this session)

Every live rail slot now **recurs down its page** instead of appearing once near the top. The mechanism:

1. **One fetch per slot per page.** React Query keys on `(max, category, placementTypes, categoryIds)`, so mounting the same slot three times on one page is still exactly one network request — React Query's cache dedupes it.
2. **`adSlotBlock(slot, items, index)`** slices that one fetched window into disjoint pieces: block 0 = rows 1–4, block 1 = rows 5–8, block 2 = rows 9–12 (for a `4×3` slot).
3. **No overlap, ever.** This is the property that makes repetition honest rather than a display trick — a vendor's campaign appears in exactly one block, never two. A buyer scrolling the page meets *more sponsored positions*, never the same campaign twice, and the vendor is not billed/credited an inflated impression count because the layout happened to show their ad more than once.
4. **Short inventory yields fewer blocks, never a repeated block.** If only 3 campaigns match a slot that's configured for `4×3` (max 12), block 0 renders those 3, and blocks 1 and 2 render nothing — they do **not** fall back to re-showing block 0's campaigns. This was verified live: `newArrivalsBrandPicks` has exactly 3 matching campaigns today and renders exactly 1 block, not 2.
5. **Verified with a property check, not just eyeballing.** `scripts/ad-slot-map-check.mjs` runs `adSlotBlock` at every inventory depth from 0 to (max + 3) for every slot and asserts: (a) no item ever appears in two blocks, (b) every fetched row up to `max` lands in *some* block, (c) a block index past the configured count renders nothing rather than wrapping around. 18 checks total, all passing as of the last run.

### Demo campaigns seeded (through the real pipeline, not inserted as pre-approved)

Every seeded campaign was inserted requesting `status = 'active'` **as `service_role`**, which the INSERT-time guard (§3) redirects to `pending_review` exactly as a real paid campaign would be — then approved through `approve_ad_campaign()` acting as demo-admin, exercising the real RPC's own authorization check rather than bypassing it. All titles carry a `[demo]` suffix, visible in both the vendor dashboard and the admin panel.

- **11 original campaigns** (products: Premium Cotton Polo, Oversized Graphic Tee, Floral Wrap Midi Dress, Slim Fit Stretch Jeans [targeted at the real "Jeans" taxonomy row], Quilted Puffer Jacket, Chikankari Anarkali, Canvas Sneakers, Gauze Co-ord Set, Linen Camp Shirt [carries `trustedSeal`], Ribbed Tank Top [targeted at "T-shirts/Tops"], plus one deliberately carrying **all 7 originally-unplaced types** on "Leather Belt" — this one campaign renders nowhere, by design, to make the build-or-retire gap concrete rather than theoretical.
- **1 scheduled** (Cotton Track Pants, starts 5 days out) — proves `scheduled` status correctly does not serve.
- **1 left in `pending_review`** (Women's Casual Kurta Set) — so the admin Review tab isn't empty for a demo walkthrough.
- **4 more `searchListing` campaigns** added this session (Oversized Crew Tee, Wide-Leg Trouser, Formal Blazer - Navy, Slim Fit Jeans [targeted at "Jeans"]) — specifically so the search slots have enough inventory to show 2–3 *different* blocks rather than one, proving the disjoint-slicing property with real data rather than a unit test alone.
- **2 certificate purchases** — one against a vendor with a full postal address, one against a vendor without one, specifically to demonstrate both outcomes of the certificate pipeline (see §8) rather than only the happy path.

Live confirmation as of the last check: 17 `active`, 3 `expired`, 1 `pending_review`, 1 `scheduled`. `searchListing` campaigns currently serving: 5.

---

## 8. Certificate fulfilment — full detail

### What changed and why
`verifiedCertificate` (₹199) had been sitting in the "unplaced" bucket with the stated reason "renders the identical badge to `trustedSeal` (₹44), needs a distinct visual design." That framing was wrong about what the product actually *is*. You confirmed this session that it's a **physical, printed certificate that gets couriered to the vendor** — which is exactly what the admin panel's pre-existing `Certificates.tsx` page had been guessing at, under a caution banner reading "Built pending Andy's confirmation that the certificate is a physical printed article that gets couriered" and running entirely on nine invented dev-seed rows with no real table behind it.

So this was reclassified, not placed: `verifiedCertificate` moved from `UNPLACED_AD_TYPES` to a new `FULFILMENT_AD_TYPES` category — it has no buyer-facing slot for the same reason a physical T-shirt has no ad slot; it's a product being shipped, not an impression being served.

### The new schema (`certificate_orders`)
```
id, reference (e.g. "CERT-2609-003"), vendor_id, ad_order_id, ad_id,
status (processing → printed → dispatched → delivered, or returned/cancelled),
contact_name, contact_phone, address_line, area, city, state, postal_code, vendor_name,
courier, tracking_number, return_reason,
purchased_at, printed_at, dispatched_at, delivered_at, created_at, updated_at
```

**The address fields are a snapshot taken at the moment of purchase, not a live join to `vendor_profiles`.** This is deliberate: if a vendor updates their profile address after ordering, a parcel already printed or in transit must not silently retarget to the new address — the label that was actually printed is the one any support conversation needs to reference.

### How an order gets created
An `AFTER INSERT` trigger (`trg_create_certificate_order`) on `advertisements` fires on every insert, checks whether the comma-joined `placement` string contains `verifiedCertificate`, and if so, inserts a `certificate_orders` row by copying the vendor's current profile fields as the snapshot. This trigger point was chosen specifically because it's the *one place every purchase path converges* — the real Razorpay verify-payment function, the Razorpay webhook, and the demo-mode fallback path all eventually insert into `advertisements`, so hooking there means no edge function needed redeploying and no purchase path can be missed. The trigger swallows its own errors into a `RAISE WARNING` rather than letting a fulfilment-creation failure roll back the campaign insert itself — because failing the campaign insert here would mean a vendor gets charged with no campaign created at all, which is strictly worse than a fulfilment order that has to be created by hand afterward.

### The fulfilment RPCs
Five SECURITY DEFINER functions (`certificate_mark_printed`, `certificate_dispatch`, `certificate_mark_delivered`, `certificate_mark_returned`, `certificate_cancel_order`), all routed through one shared `certificate_apply()` that checks `certificate_fulfiller()` (currently `super_admin` or `finance_admin`) and enforces a strict forward-only transition table — `dispatched` cannot be reached except from `printed`, `delivered` cannot be reached except from `dispatched`, and so on.

**Two real preconditions enforced, not just cosmetic:**
- `certificate_dispatch()` refuses if courier or tracking number is empty — a parcel marked dispatched with neither is a parcel nobody can trace.
- `certificate_dispatch()` also refuses if the snapshot has no `address_line`/`postal_code` — there is nothing to put on a label.

### Admin UI
`cosora-admin/src/pages/Certificates.tsx` was rewritten to read the real table (`src/lib/certificates.ts`) instead of the nine-row dev-seed store, which was deleted. The tab structure, forward-only pipeline UI, and courier dropdown were kept exactly as they were — they were already correct, only the data source was fake. A new warning surfaces when one vendor has more than one open certificate order simultaneously (see the pricing bug in §9).

### Vendor-side tracking
Part of the new `/my-payments` page (§9) — a step-by-step visual pipeline with real timestamps at each completed step, courier + tracking number surfaced once dispatched, and an explicit statement that no predicted delivery date is shown (because Cosora has no courier-tracking API integration, and a guessed date presented as fact is worse than no date).

### Proven live, self-rolling-back (8 assertions, all passed)
1. A purchase carrying `verifiedCertificate` creates a fulfilment order with the vendor's snapshot correctly populated.
2. A purchase *without* it creates zero extra orders.
3. A non-admin buyer attempting `certificate_mark_printed` is refused (`42501`).
4. Attempting to dispatch before printing is refused (`22023`).
5. Attempting to dispatch with empty courier/tracking is refused even from the correct state.
6. The happy path succeeds, and the vendor receives an in-app notification.
7. Marking delivered succeeds and sets `delivered_at`.
8. Attempting to cancel a delivered order is refused (only `processing`/`printed` can be cancelled).

A second, separate access-matrix test confirmed RLS isolation: vendor A sees exactly their own order (1), sees 0 of vendor B's, an unrelated buyer sees 0, `super_admin` sees all, and a vendor attempting to mark their *own* certificate delivered (bypassing the admin-only RPC gate) is refused.

---

## 9. Vendor "My Payments" — full detail

New page at `/my-payments`, added to the seller sidebar below Subscription. Two tabs: **Payments & bills** and **Certificate orders**.

### The unit trap this surfaced
Three money-bearing tables exist in this schema and they do **not** agree on units, and nothing anywhere had documented this before now:
- `ad_orders.amount` — **paise** (`razorpay-create-order`: `rupees * 100`)
- `subscription_payment_orders.amount` — **paise** (`(base + gst) * 100`)
- `subscription_invoices.amount` — **rupees** (confirmed against live rows ranging 699–22000, which are unambiguously rupee amounts)

Rendering these three side by side on one ledger without normalizing would have displayed a vendor's ad spend as roughly 100× their actual charge, and the bug would have looked like a pricing error rather than what it actually is — a units mismatch. `vendorPayments.ts` now exposes exactly one field, `amountRupees`, and every source converts at its own boundary before that value ever reaches a component.

### Which rows count as "a payment"
- **Subscriptions** are read from `subscription_invoices`, never from `subscription_payment_orders` — the order row is a pre-checkout *intent* recorded before Razorpay Checkout even opens; listing both would double-count every subscription that was actually paid for.
- **Ad orders** exclude `status = 'created'` (an abandoned checkout, never actually paid) but **include** `status = 'refund_review'` deliberately — that status means money was taken and the campaign was then refused by a plan-limit check, and it's precisely the row a vendor most needs visibility into, not one to hide.

### Receipts, not tax invoices, for ad purchases
`/my-payments/receipt/:orderId` deliberately prints "PAYMENT RECEIPT" and explicitly states in its footer that it is **not** a tax invoice — because `ad_orders` has no GST columns at all, unlike `subscription_invoices` which carries a real `gst_amount`, `gst_number`, and `invoice_number`. Printing a fabricated GST split or an invented invoice number on a document a vendor might file with their accountant was rejected as a design option. Per-placement dollar amounts are also deliberately absent from the receipt line items — `ad_orders` stores one gross total, not a breakdown, and re-deriving a per-line figure from the current price table (which may have changed since the purchase happened) would put numbers on a financial document that don't actually come from the payment record.

---

## 10. Complete verification proof log (this session)

Every one of these was a real SQL transaction against the live database, executed, its output captured, then rolled back — not a description of expected behaviour.

| # | What was proven | Result |
|---|---|---|
| 1 | Paid campaign inserted `active` → served vs. redirected to `pending_review` | Before: served=true. After: pending_review, served=false |
| 2 | `rejected → paused → active` revival attempt | Before: succeeded. After: refused `42501` |
| 3 | Future-dated campaign served today | Before: served. After: not served |
| 4 | Suspended vendor's campaigns | Before: kept serving. After: stopped |
| 5 | Trust seal grant timing | Before: at payment. After: 0 at payment, 1 at approval |
| 6 | RLS authorization matrix (26 cases: buyer/vendor/admin × 9 RPCs + edge cases) | 26/26 correct |
| 7 | Anonymous probe of 10 helper functions | Before: `vendor_account_in_good_standing()` callable anonymously → `true`. After: revoked, inaccessible |
| 8 | Demo-buyer call to `ad_review_metrics`/`ad_fraud_signals` | Before: returned real queue data to a buyer. After: `42501` |
| 9 | Vendor deleting a campaign with review history | Before: erased `ad_review_log` rows via cascade. After: refused with a human-readable message |
| 10 | `avg_hours_to_decision` metric | Before: always null (nothing logged the initial queue entry). After: computes correctly |
| 11 | For You feed at 48 products scrolled | Before: same 4 ads shown 3×, 3 impressions logged per ad per page view. After: disjoint blocks, 1 impression per ad |
| 12 | Certificate order creation on purchase | Order created with correct vendor snapshot; non-certificate purchase creates nothing |
| 13 | Certificate fulfilment transition guards | Dispatch-before-print refused; dispatch-without-courier refused; happy path succeeds + notifies |
| 14 | Certificate access isolation | Vendor A: own=1, other=0; unrelated buyer=0; admin=all; self-service-attempt refused |
| 15 | `certificate_orders` default-grant exposure | Before: anon SELECT=true, authenticated UPDATE=true (via RLS-masked no-op). After: both false, re-confirmed with `has_table_privilege` |
| 16 | `searchListing` delivery | Before: 0 slots anywhere rendered it. After: 5 campaigns actively serving via `active_ads()` |
| 17 | Ad slot block partition property (18 automated checks, every slot, every inventory depth 0 through max+3) | 18/18 passing — no item ever appears in two blocks; every fetched row lands in some block; out-of-range block index renders nothing |
| 18 | Buyer-repo TypeScript baseline confirmed non-zero before trusting a later 0 result | Deliberate type error injected → compiler caught it → removed → 0 errors confirmed genuine |

---

## 11. Complete bug/gap ledger — verified current status

Everything below was re-checked against the live database or the current file contents in this session, not carried forward from memory.

### A. Fixed and re-confirmed fixed

| # | Issue | Where | Confirmed fix |
|---|---|---|---|
| 1 | **No actual admin gate existed.** Paid campaigns went live immediately via the INSERT path, which the original UPDATE-only trigger never covered. | `guard_ad_activation()` | Bound to INSERT via `trg_guard_ad_activation_insert`; proven with live before/after |
| 2 | Admin analytics (`ad_review_metrics`, `ad_fraud_signals`) readable by any signed-in buyer | Both functions had no internal authorization check despite being `SECURITY DEFINER` | Both now raise `42501` for non-moderators |
| 3 | 10 helper functions kept Supabase's default public EXECUTE grant | `vendor_account_in_good_standing`, `ad_target_live_status`, etc. | Revoked from `public, anon, authenticated`; delivery unaffected (called internally from definer functions) |
| 4 | Time-to-decision metric permanently null | `ad_review_metrics` derived `queued_at` from a log row that never got written on first submission | `trg_ad_log_submission` now writes it on intake |
| 5 | Vendor could delete a campaign and erase its own rejection history | `advertisements` DELETE cascaded into `ad_review_log` via FK | `trg_guard_ad_deletion` refuses a signed-in non-admin deleting a campaign with any review history |
| 6 | `AdRow` dropped `moderation_reason`/`moderated_at` in its own mapper | Buyer-side `ads.ts` | Fields added back to the mapping |
| 7 | Three fabricated "paid" ads found in the buyer app: `RECENT_VIEW_ADS` (already fixed earlier), an `isAd: true` flag on invented seed brand "LUNE" shown to signed-out visitors, and a `sponsored: true` flag on a hero slide with an invented product and a dead link | `followingStore.ts`, `EverydayFashionHero.tsx` | All three false claims removed |
| 8 | Off-platform ad leak: an untyped rail (`ProductDetail`'s "Sponsored" section) served every eligible campaign with no type filter, including `fbInsta`/`googleProduct`/`socialCombo` campaigns that had nothing to do with an on-platform card | `SponsoredRail.tsx` | Restricted to `ON_PLATFORM_CARD_TYPES` |
| 9 | For You showed 4 ads 3× down one page, billing 3 impressions per ad for one viewing | `ForYou.tsx` feed assembly | Now uses disjoint blocks |
| 10 | New Arrivals labelled 4 unpaid, organic products with an "AD" chip | `NewArrivals.tsx` "we recommend" section | Chip removed |
| 11 | For You's "AD" chip failed WCAG AA contrast (~2.3:1, needs 4.5:1) | `ForYou.tsx` | Changed to `text-gray-500`, ~4.8:1 |
| 12 | `certificate_orders` kept Supabase's default table grants (anon SELECT, client UPDATE reachable) | New table, self-introduced this session | Revoked and re-verified with `has_table_privilege` |
| 13 | `searchListing` sold, delivered nowhere | — | Two real slots built; 5 campaigns confirmed serving live |

### B. Still open — verified persisting right now

| # | Gap | Exact location | What is actually wrong | Concrete effect |
|---|---|---|---|---|
| 1 | **Only 2 of 10 `vendor_profiles` rows have a complete postal address**, and the one that does has **zero live products** | `vendor_profiles.address_line`/`postal_code` | Confirmed via live count query this session | `verifiedCertificate` is purchasable by any vendor but deliverable to almost none. `certificate_dispatch()` correctly refuses to ship blind (so nothing gets lost in the mail), but nothing stops the sale itself. Demonstrated live: demo order `CERT-2609-003` is stuck at `printed` permanently for exactly this reason |
| 2 | **`verifiedCertificate` and `trustedSeal` are priced per-product, not per-vendor**, in `computeAmountRupees()`/`adRows()` | Duplicated logic across `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook` edge functions | A certificate is about the *vendor*, but pricing multiplies by item count in the order spec | Buying a certificate alongside 3 products in one order charges 3×₹199 and the fulfilment trigger creates 3 separate physical parcels for one vendor. Not auto-merged (that's a refund decision requiring a human); admin UI now warns but does not prevent it. Confirmed structurally present — 0 duplicate cases exist today only because certificate order volume is 2 total |
| 3 | **`delivery_team` admin role does not exist** in `admin_role_type` enum — confirmed live | `admin_role_type` enum, `certificate_fulfiller()`, `roles.ts` | Certificate dispatch (day-to-day operational work) is gated to `super_admin`/`finance_admin` only, both roles meant for moderation/finance authority | No narrow operational role can be granted to someone whose job is literally "print and post certificates," without also handing them finance or full admin access |
| 4 | **`ad_orders` has no foreign key to the campaign(s) it paid for** — confirmed live, no `ad_id` column exists on that table | `ad_orders` schema | One order can spawn multiple `advertisements` rows (one per product in the spec) with no join back | Per-campaign revenue can only be approximated by matching timestamps + spec content, never traced exactly |
| 5 | **`ad_orders` and `subscription_payment_orders` both have 0 rows in production** — confirmed live | Both payment tables | Every purchase you have seen actually go through has used the **demo-mode fallback** in `razorpay-verify-payment` (`if (!keySecret)` branch), which publishes campaigns directly from client-supplied data with no real Razorpay transaction and no payment record | `RAZORPAY_KEY_SECRET` is not configured. The system has never processed a real payment; "demo mode" is currently the *only* live path |
| 6 | **Advertising purchases have no GST treatment or invoice numbering** | Ad payment path entirely | `subscription_invoices` has `gst_amount`/`gst_number`/`invoice_number`; `ad_orders` has none of these columns | `/my-payments` receipts for ad purchases explicitly state "not a tax invoice" in their footer — a vendor needing GST input credit on advertising spend has no compliant document to claim it with |
| 7 | **`wholesalerPick`'s "72-hour bump" does not exist** | `trendsSponsored` slot / `active_ads()` ordering | Ordering is flat `created_at desc, id desc` for every campaign type with no exception | Vendors are sold a specific feature (priority placement for 72 hours after purchase) that has zero supporting logic anywhere — it ranks identically to every other campaign the moment it's approved |
| 8 | **New Arrivals "we recommend" still shows duplicate content** | `NewArrivals.tsx` | The false "AD" label was removed (fixed, see A10), but the section still renders `products.slice(0,4)` — the exact same catalogue rows the feed directly above it already shows | Cosmetic redundancy on the page; not a billing or security issue, but an unresolved UX/product decision |
| 9 | **5 ad types remain genuinely unplaced**: `directBroadcast`, `webMobileCombo`, `fbInsta`, `googleProduct`, `socialCombo` (down from the original 7 — `searchListing` and `verifiedCertificate` were resolved this session) | `adSlots.ts` `UNPLACED_AD_TYPES` | No honest on-platform representation exists for off-platform reach or message-based delivery | Vendors can purchase all 5 today and their money buys literally nothing rendered anywhere |
| 10 | **Only 1 of 7 `buyer_profiles` rows has a city set** | `buyer_profiles.city` | Unchanged this session, previously flagged | City-targeted campaigns fail closed correctly (an unknown-city viewer won't see them) but this means a vendor buying city targeting reaches almost nobody in practice |
| 11 | **WhatsApp integration is click-to-chat only**, not a real Cloud API integration | `messaging.ts` | Unchanged, documented as an honest interim seam | No server-side message delivery, no approved templates, cannot notify a vendor who isn't currently looking at their own phone |
| 12 | **Cross-repo migration dependency** — a buyer-repo migration alters `ad_review_log`, a table created by an admin-repo migration | Buyer migration `ad_eligibility_targeting_and_sweep` | Unchanged | Neither repo's migration set can be deployed standalone in isolation; deployment order between the two repos matters and is undocumented anywhere outside this report |
| 13 | **Phase 11 (semantic ad matching) remains unbuilt** | No embedding column on `advertisements` | Deliberately skipped per original instruction | An ad tagged "Jeans" cannot match a search for "denim trousers" unless both happen to resolve to the identical taxonomy row by exact name |

---

## 12. Files touched this session (non-exhaustive high-signal list)

**Buyer repo (`textile-spark-net`):**
`src/lib/adSlots.ts` (rewritten — repeat structure, fulfilment types, slot-only exclusions), `src/lib/queries/ads.ts` (`useAdSlotBlocks`, `adSlotBlock` re-export), `src/lib/queries/vendorPayments.ts` (new), `src/components/buyer/SponsoredRail.tsx` (block-aware), `src/components/buyer/SponsoredNote.tsx`, `src/pages/Search.tsx`, `src/pages/SearchResults.tsx`, `src/pages/NewArrivals.tsx`, `src/pages/Trends.tsx`, `src/pages/Sale.tsx`, `src/pages/ForYou.tsx`, `src/pages/Following.tsx`, `src/pages/MyPayments.tsx` (new), `src/pages/AdReceiptDetail.tsx` (new), `src/components/layout/DashboardSidebar.tsx` (My Payments nav entry), `src/App.tsx` (routes), `scripts/ad-slot-map-check.mjs` (18 assertions), `scripts/ad-demo-campaigns.sql`, `scripts/ad-demo-search-and-certificates.sql` (new), `scripts/ad-demo-campaigns-cleanup.sql`.

**Admin repo (`cosora-admin`):**
`src/pages/Certificates.tsx` (rewritten against real data), `src/lib/certificates.ts` (new), `src/lib/roles.ts` (certificate gate now mirrors a real SQL predicate), `src/lib/devSeed/certificates.ts` (deleted), `src/components/AdReviewQueue.tsx`, `scripts/ad-review-rls.mjs` (26-case authorization matrix).

**Database:** 16 new/modified migrations this session (full list in §4), 15 new/modified SECURITY DEFINER functions, 1 new table (`certificate_orders`), 3 new triggers on `advertisements`.

---

*This report reflects live database state and current file contents as verified in the final hour of this session. Where a gap is marked "still open," it was independently re-queried against production, not assumed to still be true from earlier in the conversation.*
