# Seller Home audit — Medium fixes, plan (2026-11-17)

Mitra, 2026-11-17: "plan a fix for all the bugs which were in medium priority and then fix them … ask me for decisions
which need my attention and plan on you own for the obvious fixes. do it in the batch of 20."

Source: `documentation/seller-home-audit-2026-11-15.md`. Sections A–C and every High item are live (2026-11-17). That
leaves 38 Medium items in sections D–L; two were already fixed with the High release (SH-036 by the live-update hub,
SH-092 with SH-090), so **36 remain: batch 1 = 20, batch 2 = 16**. Branch `seller-home/medium-fixes`.

## Decisions

| Item | Question | Decision |
|---|---|---|
| SH-044 | Social links are scored but nobody sees them | **Show them on the store** (Mitra, 2026-11-17), behind the same contact gate as the website; each box takes its own platform's links |
| SH-077 | Search terms on seller Analytics | **3-person floor** (Mitra, 2026-11-17): a term shows once 3 different visitors searched it, as on Live Activity and the buyer map; the rest are "Other searches" |
| all others | — | My call (obvious fixes), listed below |

## Batch 1 (20)

| Item | Fix |
|---|---|
| SH-034 | Every notice kind the database writes gets a destination (`notificationKindMeta`, the `ad_`/`certificate_` families by prefix); a kind with nowhere to go (billing incidents, admin-only) shows no action instead of pushing `/notifications` onto itself. `scripts/notification-kinds-check.mjs` reads every `notify(…, '<kind>'` in both repos' migrations and fails on an unknown kind. |
| SH-035 | Kinds grouped into real tabs (lead alerts and reviewed requirements → Requirements; plans, refunds, autopay, payment incidents → Payments); a tab with nothing in it is hidden (Quotes & Leads until something writes quote notices); copy says only what is sent; the requirements banner is the seller's lead alerts. |
| SH-041 | Contact sheet saves only changed fields (`contactChanges`), and won't edit over a failed or unfinished read (Try again). |
| SH-042 | Outside India the state is a typed region (country from `vendor_profiles.country_code`). |
| SH-043 | Changed phone/WhatsApp/email/website/PIN pass registration's rules in the sheet (`checkContactChanges`) and in the database (`trg_vendor_profiles_contact_checks`, migration `20261117100000`: a browser's new or changed value only). |
| SH-044 | Social links: per-platform rules (`src/lib/socialLinks.ts`), at most 3 per platform, Save waits for the saved links, store page "Find us online". |
| SH-045 | Score page: a failed or pending read shows no "Missing" badges and no count, with Try again. |
| SH-046 | "In review" badge when premises photos or listings wait for Cosora; the tile "Complete product details" is "Get a listing approved". |
| SH-054 | Upload: each step's required fields are checked before Continue. |
| SH-055 | A blank MOQ is stored as NULL ("Not specified"), never "2". |
| SH-056 | A PDF added to or removed from a live listing sends it back to review (database). |
| SH-057 | Listing photo/PDF write policies name their staff roles (super admin, product moderator). They are the listing's reviewers, so their own change isn't sent back to them; it goes in the Admin Log (`trg_admin_audit` on both tables). |
| SH-058 | Upload: photos are uploaded before the listing row is written, a failure removes what was uploaded, and only JPEG/PNG/WebP are offered. |
| SH-059 | At the plan's limit Publish keeps the form (no jump to /subscription): the seller can save a draft or upgrade. |
| SH-060 | Upload's steps are history entries (Back goes a step back); typed answers survive a refresh (photos must be picked again). |
| SH-061 | Listing photos are shrunk to 1600 px in the browser like every other upload. |
| SH-062 | `/products` shows an error with Try again, never "Your catalog is empty", when the read fails. |
| SH-072 | Deleting a catalogue deletes its PDF too and checks a row went; a failed insert removes the uploaded file. |
| SH-073 | Upload Catalogue at the plan's limit: the form is disabled with the reason and an Upgrade link. |
| SH-077 | Analytics reads `vendor_engagement_events()` (migration `100200`): the seller's events with a per-answer visitor key instead of account or session ids, and search terms only once 3 different visitors used them ("Other searches" otherwise). Browser roles then lose `viewer_id`, `session_id` and `query_text` (`100300`, **after** the app is live: the old app reads them). |
| SH-063 (Low) | Taken with SH-054: each Upload dropdown carries its field's id, so its label names it (screen readers, and the required-field checks' tests). |

## Batch 1 — done (2026-11-17)

Built on `seller-home/medium-fixes`. Checks: `node scripts/seller-medium-fixes-check.mjs` (36 rules),
`node scripts/notification-kinds-check.mjs`, `npm run i18n:check`, `npm run rls:check` and `scripts/rls-policy-check.sql`
on the local stack (0 findings), `npm run build`; local specs `seller-home-medium` (8/8) and the specs that touch these
pages (ranking-f1, sizes-media, vendor-serious, seller-home-fixes, seller-home-high, listing-edits, catalogue-review,
profile-score-ranking). Three older specs were updated for the new behaviour (required answers, the photo input's
types). Not exercised in a browser: a failed photo upload's clean-up (SH-058), the plan-limit message (SH-059) and a
catalogue's file removal on delete (SH-072); each is a few lines read with the rest.

Release order (both batches together, Mitra 2026-11-17): migrations `100000`, `100100`, `100200`, `110000` → the four
payment functions → the app → check the live bundle reads `vendor_engagement_events` → `100300`.

**Released 2026-11-17.** Read-only pre-check on production first: `ad_order_fulfil` and `active_ads` matched the repo's
last definitions (and my migration's bodies, less the additions), the photo/PDF policies and the engagement grants
were what the migrations replace, none of the new objects existed. Migrations applied with `supabase db query --linked`
(not in the migration ledger), every self-check passing; `rls-policy-check.sql` on production 156 policies, 0 findings;
the four payment functions deployed; buyer main pushed `9f1e841..8d8f767`; the live bundle reads
`vendor_engagement_events`, `vendor_response_threads`, "Get verified", "Find us online"; then `100300`. The push security
review flagged that the search-term floor counted guest sessions (a script can invent them): `20261117110100` counts
signed-in visitors only, not the seller or staff, applied before `100300` (securityflags.md, with the residual).

## Batch 2 (16) — done (2026-11-17)

Decision (Mitra, 2026-11-17): **SH-093 "Sell them to Free sellers … build this completely"**, and **release both batches
together**. My calls: the seal lasts 30 days and the certificate a year from approval (the certificate carries the badge
for that year), at the prices already shown (₹44, ₹199); paid plans keep the seal included and can now buy the
certificate.

| Item | Fix |
|---|---|
| SH-078 | The Analytics funnel counts only requirements still before their deadline. |
| SH-079 | Leads, Quotes and Analytics: loading, error (Try again) and signed out are their own states. |
| SH-080 | Reply times come from `vendor_response_threads()` (one row per thread); buyer names in groups of 100, errors surfaced. |
| SH-091 | A paid order clears the builder, so a second tap can't buy it again. |
| SH-093 | "Get verified" on /advertisements: the Trusted Seal or the Verified Certificate bought on its own by any registered seller, Free included, with discount codes. The server fixes the order (`verificationSpec`: no listing, no targeting, 30 days / a year) and skips the ad-reach rule for it; payment is never approval. The seal and certificate left the campaign builder. |
| SH-094 | Only ad types buyers see are sold (`sellableAdTypes()` / `SELLABLE_AD_TYPES`): website and mobile banners, Facebook/Instagram, Google Shopping, their bundles and direct messages aren't offered, their goals are hidden, and the server refuses them. |
| SH-095 | The builder lists live listings only; the server checks every listing is the seller's own and live before payment, and `ad_order_fulfil()` refuses another seller's listing. |
| SH-096 | `seller_registered()` is checked before any ad or verification payment (`_shared/adOrderChecks.ts`). |
| SH-097 | `/old-advertisements` files campaigns by `runStateOf()`: Scheduled, In review, Needs attention (with Cosora's reason), Paused, Ended; a button only where the seller can act. |
| SH-098 | `advertisements_running_idx` and a status/date pre-filter in `active_ads()` (same rows). Spreading impression counting needs a new scheduled job, which is Mitra's call: in ToDo.md. |
| SH-101 | Signed out, Messages asks to sign in (no seeded chats). |
| SH-102 | The thread's Back goes back; Delete chat replaces the thread's history entry. |
| SH-103 | A seller's Call reaches the buyer (`call_buyer_contact`). |
| SH-104 | A thread id that isn't an account (not a uuid, your own, unknown) says "This conversation no longer exists". |
| SH-105 | Opening a chat writes nothing; the first message creates the conversation (insert-if-missing, never rewritten). |
| SH-106 | A seller's Calls tab lists buyers' calls to them, as incoming. |

Migration `20261117110000`; payment functions `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook`,
`discount-quote` (shared: `adPricing.ts`, `adReach.ts`, `adOrderChecks.ts`). Checks: `scripts/seller-medium-fixes-check.mjs`
(both batches), `scripts/seller-home/medium_b.sql`, `tests/local/seller-home-medium-b.spec.ts` (8/8, the seal and
certificate bought through the real paid path against a mock Razorpay), and the related specs (chat-unread,
block-everywhere, chat-composer-keyboard, seller-home-high, seller-home-fixes, rfq-leads, admin-pages, first-fixes,
low-fixes, subscriptions-p5, todo-open, views). Not caused here and left open: `audit-second` "loads older messages"
fails the same way on main (todo.md).

## Release

Like the High fixes: every migration checked locally, then a read-only comparison on production, then the migrations
with the Supabase CLI (`db query --linked`), then the app. Nothing reaches production without Mitra's yes.
