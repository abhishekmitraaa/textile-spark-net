# Cosora — Project Memory (read this first, every session)

Last updated: 2026-09-09

## What Cosora Is

Cosora is a **three-sided B2B sourcing marketplace for India's fashion and textile
industry**, connecting **Buyers** (brands, retailers, designers, wholesalers, sourcing
managers and buying houses), **Vendors** (manufacturers, mills, fabric suppliers, service
providers such as printers and logistics firms, and freelancers like pattern makers and
CLO 3D artists), and an **Admin** layer (Cosora's own ops team). It replaces a fragmented
offline sourcing process — WhatsApp threads, brokers, trade fairs and personal contacts —
with a single trust-and-discovery platform where deals are initiated, negotiated and
tracked: vendors list products and run ads, buyers post RFQs and receive comparable quotes
from multiple suppliers, and admin verifies, moderates and monetises the whole thing. Think
of it as the infrastructure layer between a fabric mill in Surat and a fashion brand in
Delhi. It runs as one unified web app in which the same person can toggle between the
Vendor and Buyer experience.

## Business Rules — Predefined

Rules decided before or outside of Claude Code sessions.

### Legal & compliance
- **Chat monitoring disclosure** — "We'll be monitoring the messages" (or similar) is
  **legally required** in all chat flows. Never remove or hide it.
- **Product moderation** — all product listings go through admin moderation before going
  live (24–48 hours).

### Locale
- **Currency & timezone** — default to **INR** and **IST** for all Indian users.

### Product / UX rules
- **Role toggle placement** — the "Switch to Buyer/Seller" toggle appears **only** on the
  Vendor Dashboard Home and the Buyer Homepage. Nowhere else.
- **Authentication is OTP-only** — phone number + one-time password, no passwords. Google
  OAuth is a secondary option. A vendor-first user lands on the vendor dashboard after
  login; a buyer-first user lands on the buyer homepage. Vendor → Buyer is a direct toggle
  for a vendor who completed onboarding (Mitra, 2026-09-25, MPF-22);
  **Buyer → Vendor requires completing full vendor onboarding first.**
  > **This is the product INTENT and is not what ships today (as of 2026-09-08).** No SMS
  > provider is configured — `signInWithOtp({ phone })` returns `phone_provider_disabled` —
  > so live auth is **email + password with email confirmation ON**, and the phone control
  > is a labelled "coming soon" row. `/auth/otp-verify` was deleted because it accepted any
  > six digits and then hardcoded `setRole("buyer")`. The routing and toggle rules above are
  > unchanged and still hold. Restoring OTP means configuring a provider first, not
  > rebuilding the form.
- **"Video Closeups", never "Reels"** — product videos in the buyer feed are called Video
  Closeups. Deliberate brand/product naming decision.
- **Audio-first matters** — many Indian manufacturers are more comfortable speaking than
  typing. Audio messages in chat and voice-to-text in the RFQ form are critical for the
  real user base, not nice-to-haves.
- **Subscription tiers (Basic / Silver / Gold)** determine vendor lead volume, product
  listing caps, and geographic ad reach.

### Brand colours
| Usage | Hex |
|---|---|
| Vendor primary CTA, links, blue states | `#256fef` |
| Buyer primary CTA, alerts, Switch-to-Buyer banner | `#EF4D62` |
| Success, verified, accepted states | `#14ae5c` |
| Borders, inactive, placeholder | `#d0d4dc` |
| Body text, headings | `#363636` |

### Engineering conventions treated as product rules
- **Image imports must use ES module syntax** — `import img from "@/assets/image.png"`,
  never a file-path string.
- **Layout wrappers are role-specific** — every **vendor** page wraps in `DashboardLayout`;
  every **buyer** page uses `BuyerShell`. Putting `DashboardLayout` on a buyer route
  double-stacks the top bar.
- **No credential in source, ever — not even a test one** (Master Prompt 8, 2026-09-11). A
  super_admin password sat in `AuthContext.tsx`, 16 scripts/specs and the production bundle
  of a public repo for two months. Test logins are read through
  `scripts/lib/test-credentials.mjs` from the gitignored `.env` (or CI secrets); the names
  are in `.env.example`. Scripts use `credential()`; specs use `optionalCredential()` plus
  `test.skip`. The dev account switcher gets demo passwords only through
  `vite.config.ts`'s `__DEMO_PASSWORDS__`, which is `null` in every build. A new fixture
  seed takes its password from `current_setting(...)`, never a literal. After any change
  near auth, build and `grep -rlF` each value over `dist/`: the answer must be 0.
- **Typecheck the buyer app with `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json`.**
  At the repo root, a bare `npx tsc --noEmit` checks nothing and exits 0 whatever the code.
  Phase 26 injected a type error: the root command reported 0, and `-p tsconfig.app.json`
  reported 1. Cosora-Admin's plain `tsc` does check its code.
- **Show a caught error with `errorMessage(e)` (`src/lib/errorMessage.ts`), never with
  `e instanceof Error ? e.message : String(e)`** (Master Prompt 12, 2026-09-23). Supabase
  throws plain objects, not `Error`s, so that pattern rendered "[object Object]" in 41
  toasts: a vendor refused by the lead cap or by a closed request was never told why.
  Found by `tests/mp12-sourcing-loop.spec.ts` F4.
- **A reputation number has one writer, and no fallback** (Master Prompt 8, 2026-09-11;
  every role since Master Prompt 9, 2026-09-22). `vendor_profiles.rating_avg` /
  `reviews_count` are written only by `sync_vendor_rating()` on `reviews`. For EVERY role —
  signed-in users, admins, service_role, postgres, migrations —
  `enforce_vendor_profile_admin_fields()` computes them from `reviews` on INSERT and refuses
  an UPDATE with `42501` unless `cosora.review_aggregate_sync` is `'on'`, which only
  `sync_vendor_rating()` sets. A seed or load test that wants a vendor with reviews writes
  real `reviews` rows; one that claims a count gets 0. Signed-in-only guards are not
  enough: a 2026-09-16 load-test batch walked straight through the old one. A surface with no real reviews shows none: "–" and "No reviews yet", never
  4.5, never a seeded aggregate, never a demo breakdown. Product-level `rating_avg` /
  `reviews_count` / `sold_count` are still seed values on the cards (Mitra's call); do
  not add a new reader of them.
- **A "my N" count filters on the owner column. It never leans on RLS alone** (2026-09-23).
  The SELECT policies on `calls`, `quotes` and `conversations` also admit the vendor side
  and admins, so a bare `count: "exact"` over-reports for anyone who is also a vendor or an
  admin. Measured on the admin account: calls 10 against 8 of its own, quotes 3 against 1,
  chats 4 against 3. `useCallCount()` filters `buyer_id`. `useProfileStats()` (Quotes and
  Chats on `/profile`) filters quotes on `rfqs.buyer_id` through an `rfqs!inner` embed, and
  chats on `user_a`/`user_b` (fixed 2026-09-24, MPF-1; it used to count unfiltered).
  Read the policy before trusting RLS to mean "mine".
  - More measured in Phase 3 (data export), signed in as demo-buyer:
    - `rfqs_select` shows every active open RFQ to any signed-in user: 3 against 2 of its own.
    - `reviews`, `product_reviews` and `profiles` are `SELECT true`: 9 against 2, 11 against 3,
      and 20 against 1.
  - Any "my data" read, count or export filters on the owner column: `buyer_id` or `id`, or
    the parent's (quotes by `rfq_id` in my RFQs, messages by `conversation_id` in my
    conversations).
- **A form save sends only the fields the user changed** (2026-09-24, MPF-9).
  - Diff against what loaded (`profileChanges()` in `lib/queries/profile.ts`).
  - An emptied field is a change, saved as NULL.
  - A default is a placeholder, never a value that gets saved.
  - Code that runs on every sign-in writes only what it exists to write, never an object
    built from blanks: `applyPendingSignupProfile()` once saved a whole blank profile on
    every sign-in.
  - A signup value that waits in auth metadata is applied once. It is written only where
    nothing is saved, then cleared from the metadata. Left there, it overwrote a later
    edit (MPF-20).

## Business Rules — Discovered/Decided During Development

Rules that emerged while building. Append here the moment one is settled — never leave one
undocumented. Deep technical rationale for each lives in
`documentation/technicalimplementation.md`.

- **A buyer account is anonymized, never deleted, and only after a confirmation code and 14
  days** (Phase 2 of the My Profile brief, 2026-09-23; design approved by Mitra).
  - The flow runs from `/profile/help`: a 6-digit code goes to the **auth** email, or, for an
    account with no usable email, to the confirmed **auth** phone on WhatsApp (Phase 18). The
    channel is decided by `account_deletion_channels()` and stored on the request. Then
    `cooling_off`, a `/profile` banner with Cancel, and finally the daily
    `account-deletion-sweep`, which runs `anonymize_account()`.
  - The rows stay, because other people's history hangs off them. RFQs, messages and
    conversations CASCADE from `profiles`, and reviews CASCADE from `auth.users`.
  - The identity is scrubbed everywhere it is copied: `profiles`, `buyer_profiles`, the
    three review tables' `reviewer_name`, and `auth.users`. Identities are removed and the
    auth user is banned, so the person cannot sign back in to the scrubbed row.
  - `'deleted'` is terminal. `set_account_status()` refuses it both ways.
  - The account's private activity (saved items and folders, saved videos, follows,
    recently viewed, video likes, notifications) is deleted, and its avatar folder is
    removed by the `account-deletion-sweep` edge function, after the anonymization
    (Phase 16, 2026-09-24).
  - **Every own-row write policy carries `account_not_deleted(auth.uid())`** (WITH
    CHECK for UPDATE/FOR ALL/INSERT, USING for DELETE), so a token issued before the
    sweep can't write. A new policy of that kind must include it. It refuses deleted
    accounts only: suspension is `account_is_active()` on content creation (Mitra's
    call).
  - Vendor, admin and suspended accounts are refused and sent to support.
  - Every state change is a definer function; clients hold SELECT only. **Neither channel is live:**
    email needs `RESEND_API_KEY`, and WhatsApp needs `WHATSAPP_ACCESS_TOKEN` and
    `WHATSAPP_PHONE_NUMBER_ID` plus a Meta-approved template. The function answers
    `not_configured` with the channel, and the database mints nothing.
  - **Things to know about the WhatsApp channel (Phase 18, 2026-09-24):**
    - **The database answers before `not_configured`.** The function passes the channels it
      has secrets for, and the database checks the blocker first. So a vendor, admin or
      suspended account sees its own reason, not "isn't available online yet". demo-buyer
      has a `vendor_profiles` row, so it sees "Seller accounts can't be deleted here".
    - **`no_email` is now `no_contact`.** An app build from before Phase 18 doesn't know it
      and shows "Something went wrong". Until the Phase 14–18 app is deployed, that reaches
      the 3 real accounts with an unconfirmed email and no phone.
    - **"Sent" on WhatsApp means Meta accepted it, not that it was delivered.** A number
      that isn't on WhatsApp is reported only through a webhook this project doesn't have.
      The user sees "We've sent a code", nothing arrives, "Send a new code" goes the same
      way, and support is the way out.
    - **Meta fixes the template text** as "<code> is your verification code.", so it can't
      say the code deletes the account. That is a small social-engineering risk, logged in
      `securityflags.md`. Create the template with Meta's security recommendation on and a
      10-minute expiry (`myprofileflags.md` MPF-24).
  - Detail: `technicalimplementation.md` → "Account deletion".
- **Notification preferences are stored and read by nothing, and there is no delivery
  pipeline** (checked 2026-09-23).
  - Nothing reads `buyer_profiles.notifications` or `vendor_profiles.notifications` to send
    anything. There is no push infrastructure. The only sender (`account-deletion`: email, or
    WhatsApp for an account with no email) is transactional.
  - `notify()` fills the in-app bell only from ad, certificate, account, deletion, KYC and
    chat-moderation events. **No quote, message or RFQ event notifies anyone.**
  - Every surface that shows the switches, or a summary of them, says so:
    `/profile/notifications`, Vendor Settings, the `/profile` row ("Not live yet") and the
    seller home's RFQ card. They all read `NOTIFICATION_DELIVERY_LIVE` in
    `src/lib/notificationDelivery.ts`: the one switch to flip once a sender honours the
    toggles (MPF-12, 2026-09-25). A new surface that mentions notifications reads it too.
  - Building delivery is its own master prompt, not a profile-page change.
- **Currency converts displayed prices, for display only; timezone is still read by nothing**
  (currency: Phase 20 of the My Profile brief, 2026-09-24, MPF-11).
  - **Every buyer-facing price goes through `useDisplayCurrency()`:** `show(amountInInr,
    inrText)`, `showText(inrText)` or `showBoth(...)`.
    - Each returns the INR text untouched unless a conversion is running, so an INR buyer's
      page is byte-identical.
    - **A new buyer-facing price must go through one of them.** Otherwise it silently stays
      INR beside converted ones, and only its missing "≈" keeps the page honest.
  - **Never convert:** vendor pages and vendor billing (`formatINR`), amounts a buyer types,
    and anything stored or sent. Prices are set, quoted, paid, settled and invoiced in INR.
  - **Rates:** `public.fx_rates`, refreshed daily by `fx-rates-refresh` (ECB via Frankfurter).
    No key, no secret.
  - **Timezone:** no date renders in the chosen zone, and Regional Settings says so. Don't claim
    an effect in copy until one exists.
- **GST is `supabase/functions/_shared/gst.ts` (`gstOn`).**
  - Don't write `* 0.18` anywhere. `node scripts/gst-check.mjs` fails if a subscription
    function keeps its own copy.
  - A tax figure the browser shows needs a client mirror and a check script, as with
    `adPricing`.
  - Nothing buyer-facing charges money today: don't build or simulate a charge to use it.
- **A buyer's location nudges For You, and never filters it** (Phase 5 of the My Profile
  brief, 2026-09-23).
  - `for_you_products()` subtracts a small boost from the cosine distance, for ordering
    only: 0.05 same city, 0.02 same state. It applies on the taste and cold-start tiers, not
    popularity.
  - Hard requirement: a buyer with no city or state, or whose city matches nothing, gets
    **byte-identical** results to before. The no-location case is a verbatim branch of the
    old query.
  - The boost reorders the same rows and never adds or drops one. The reported `distance`
    stays raw.
  - Location resolves like the app shows it: `products.location`, falling back to the
    vendor's city.
  - Any change keeps the vector-DB ground rules: SECURITY DEFINER,
    `search_path = public, extensions`, the `auth.uid()` guard, minimal grants and no new
    OpenAI calls. Re-verify the no-location buyers against a baseline md5.
  - Detail: `technicalimplementation.md` → "For You ranking".
- **FAQ content lives in `public.faqs`, never in a component** (Phase 9 of the My Profile
  brief, 2026-09-23).
  - Buyer Help (`/profile/help`, `/help`), `/subscription` and the seller landing `/seller`
    read it with `useFaqs(surface)`. A new FAQ block anywhere uses `<FaqSection surface="…">`. Don't add
    another hardcoded array.
  - Clients read active rows (anon too), and every write is an `admin_faq_*` RPC from
    Cosora-Admin `/faqs`: support and super_admin write (support since Phase 22,
    2026-09-24), and every other role is refused. Changing who writes means changing the
    four RPC gates **and** `SECTION_WRITE.faqs` in Cosora-Admin's `roles.ts` together.
    Edits keep no history (MPF-26).
  - **Pages read a CDN snapshot first, the table second** (Phase 23, 2026-09-24).
    `useFaqs()` fetches `faq-snapshots/<surface>.json` and falls back to the table on any
    failure. The files are rebuilt after every committed FAQ write (`trg_faqs_snapshot` →
    `faqs-snapshot`) and hourly. An edit reaches visitors within ~47 s, not instantly.
    - A new column the pages render must be added to the function's select **and** to
      `parseFaqSnapshot()`. Otherwise the snapshot lacks it and the pages silently fall back
      to the table.
    - Never write to the bucket from a client or by hand; rebuild with the cron command.
    - A spec that checks an edit on a page at once must block the snapshot URL, as
      `faqs-admin-editable` does.
    - A spec that reorders FAQs waits for each `admin_faq_reorder` response, never
      "networkidle", and compares every row's **position** with a snapshot at the end.
      The pages hide inactive rows, so a row left out of place still shows the right
      order. Phase 26 found "How is GST handled?" left at 250 instead of 140 that way.
  - Clients have **column** SELECT on `faqs`, without `created_by`: a new reader names its
    columns, because `select *` fails.
  - The seeded text was moved verbatim and isn't vetted. Several buyer Help answers describe
    features that don't exist (MPF-14). Fix them in the admin, not in code.
  - Andy's Seller Registration and Subscription answers are published **verbatim**, by
    Mitra's decision (2026-09-23), even where the product differs (MPF-16, MPF-17). Don't
    quietly "fix" them in code or in the admin. Raise it instead: the wording is Andy's call.
  - "Lowest billing plan?" hardcodes plan prices, so a change to `subscription_plans` prices
    means editing that answer in the admin too.
  - Document verification is promised in **3–5 days** everywhere: the FAQ, `Kyc.tsx` and
    `Onboarding.tsx`. Listing, video and catalogue moderation is a separate review, still
    quoted as 24–48 hours.
  - Detail: `technicalimplementation.md` → "FAQs".
- **`profiles.email` and `profiles.phone` are not client-selectable** (MPF-3, Phase 11 of the
  My Profile brief, 2026-09-23).
  - Never select, filter, order on or return them from `profiles`, in either app. Use:
    - `fetchMyContactInfo()` (`my_contact_info()`) for the signed-in user's own;
    - `call_buyer_contact()` for a buyer's phone, which applies callGate's rules in the
      database;
    - `admin_profile_search()` / `admin_profile_emails()` in Cosora-Admin.
  - Anyone else's contact details need a new definer function with an explicit rule. Never
    re-grant the columns.
  - `profiles` has column grants, so `select("*")` fails, and a new column needs
    `grant select (col)` in its migration.
  - **Revoking a column that clients read is ordered:** ship the new readers and the code,
    deploy both front ends, check the live bundles, and only then revoke. Phase 11 revoked
    first and broke `cosora.in` and the admin panel (MPF-19).
  - MPF-19 closed 2026-09-24: the interim grant is revoked, so no client role can read the
    two columns.
  - Detail: `technicalimplementation.md` → "Profile contact details".
- **`calls` rows are written only by `log_call()`** (MPF-2, Phase 12 of the My Profile brief,
  2026-09-23).
  - Clients have no INSERT, UPDATE or DELETE on `calls`. Never add a write policy or grant back;
    change `log_call()` instead.
  - The server owns `buyer_id`, `direction` and `created_at`. A limit (`rate_limited`,
    `too_many_calls`) is a status, not an error, and a dial must never wait on the log.
  - Logging vendor-initiated calls needs its own definer function with its own rules.
  - A test that logs a call can't clean it up as a client. Tag its `product_context` and
    remove it with SQL.
  - Detail: `technicalimplementation.md` → "Calls — one write path".
- **The admin side exists and is built — in a separate repo.** `Cosora-Admin` runs against
  the same Supabase project and owns some of this project's migrations. Older notes
  claiming "admin is not designed or built" are stale.
- **Vendors must never be able to publish straight to the buyer feed.** Products *and*
  videos default to `under_review`; the transition to `live` is enforced by a BEFORE
  trigger, not by client convention and not by RLS alone.
- **Moderation must be reviewable.** A hard blocklist stop leaves no trail, so
  `keyword_blocklist` is deliberately **empty** and stays that way until a human names a
  term; pattern flags keep the message and lock the thread instead, so support can read it.
- **Moderation notices never identify the reporter, the matched pattern, the verdict or the
  reason.** A report notice is deliberately identical to a pattern-triggered lock — in a
  two-person thread, saying "a report happened" names the reporter by elimination.
- **A lock must be unlockable.** Locked conversations can be resumed only via the
  `resolve_conversation_review` RPC; a verdict defaults to leaving the thread locked and the
  reviewer opts in to reopening.
- **Suspension blocks content *creation*, not existing content.** A suspended account cannot
  create RFQs, quotes, products, videos, ads or reviews — but live content stays up, a
  running ad campaign keeps serving, and an in-progress session is not ended. A suspended
  vendor can still delete their own videos.
- **Suspension is account-level, not vendor-level** — the same human toggles between buyer
  and vendor, so a vendor-table flag could not stop them messaging as a buyer.
- **Media is rationed by the Supabase Free plan.** 5 GB/month egress is shared org-wide
  across database, auth and storage; exceeding it 402s the whole app. Video uploads are
  capped at 50 MB / 60 s, review photos at 4 photos / 2 MB.
- **iPhone `.mov` is deliberately not accepted** (HEVC plays on Safari, fails on
  Chrome/Android, and there is no transcoding step). A renamed `.mov` is now caught
  client-side by a magic-byte check on the ISO-BMFF major brand (`qt  ` = QuickTime) —
  a stopgap for the accidental case, not a security control; HEVC inside a genuine MP4
  container still passes and needs a real transcoder to reject.
- **Raising the video size cap has a dashboard-first ordering that cannot be skipped.**
  See "Raising MAX_VIDEO_BYTES" below. A bucket's `file_size_limit` can never exceed the
  project's global limit, so bumping the bucket or the client constant before raising the
  global limit in the dashboard silently does nothing.
- **No mock data in production.** Dev-only helpers return `[]` in a production build; an
  empty catalogue is meant to render empty. Do not seed demo rows to "fix" an empty state.
- **A view is monotonic; a like is a toggle. They are modelled differently on purpose.**
  Views go through a SECURITY DEFINER `increment_video_view(uuid)` scoped to
  `status='live'` (mirroring `increment_product_view`) — a buyer owns no video row, so the
  +1 cannot be a client UPDATE. Likes get a per-buyer join table (`video_likes`) with
  `product_videos.likes_count` maintained by an AFTER trigger, because a counter-only RPC
  gives no way to undo a like and no source of truth for *who* liked. Same reasoning made
  `saved_videos` a table rather than a column.
- **Durably saved ≠ interested this session.** `saved_videos` is what the buyer chose to
  keep; the in-session `bookmarkedVideoIds` set is what caught their eye in the last few
  minutes, and only the second one feeds `rankVideoCloseUps`. Hydrating stored saves into
  the ranking signal would let a save from six weeks ago reshuffle today's reel.
- **A rejection reason must reach the vendor.** `reject_vendor_content` stores it and the
  BEFORE trigger protects it, but it is only meaningful read together with
  `status = 'rejected'` — a resubmitted row keeps the old note until an approve clears it
  (`approve_vendor_content` nulls it as of 20260905172020). Every surface that renders it,
  vendor- or admin-side, gates on the status as well as the column.
- **The Bunny API key is the only credential in this codebase that a server must
  hold on the client's behalf.** Bunny's TUS upload is authorised by
  `SHA256(library_id + api_key + expiration + video_id)`, which cannot be computed in
  a browser without shipping the key, so `bunny-upload-url` is the first signed-URL
  edge function here — every other upload goes browser→Supabase Storage under RLS.
  The **Library ID is not a secret and cannot be one**: Bunny requires it as a plain
  `LibraryId` header on the client's own request and it appears in every playback URL.
- **An unconfigured provider must fall back, not fail.** `bunny-upload-url` returns
  `not_configured` as a **200** (the razorpay-create-order convention) and
  `createProductVideo` then takes the original Supabase Storage path. That keeps
  uploads working before Bunny is wired up — but it is SILENT, so
  `node scripts/bunny-config-check.mjs` and the provider census in
  `documentation/orphan-reconciliation.sql` are how you tell whether the migration
  actually happened.
- **Video placeholders ship in the bundle, never hotlinked.** The reel's poster is on the
  critical path of every card and is what the `<video>` paints under before the first
  frame decodes; a third-party image host there is a DNS lookup and an availability
  dependency on a surface whose whole premise is staying fast.
- **A review's subject id must be the resolved entity id, never the route param** — buyer
  side vendor links carry slugs. And where no real row exists, the Write-a-Review CTA is
  hidden rather than shown and left to fail.
- **Signed-out / loading / error / empty must stay four distinct states** on any surface
  that reads from Supabase. Collapsing them is how a broken page passes for an empty one.
- **Vendor contact details are gated by the same rule as calling** — one resolution, many
  consumers, and a skeleton (never real rows) while the gate resolves. **Known open
  decision:** `vendor_profiles` is world-readable including `phone`, so the gate is a UI
  rule only. Closing it is a marketplace-discovery decision, not a bug fix.
- **There is no `/orders` route.** "Track Orders" maps to `/requirement/my-quotes`; "View
  Order Details" maps to `/chat`.
- **Payment amounts are computed server-side, never accepted from the client**, and the
  Razorpay account is in **live mode** — checkouts move real money. Refunds are manual.
- **Total Order Value is the retention metric.** The cumulative figure of orders won through
  Cosora is the single strongest reason a vendor stays. **It is computed in exactly one
  place** — `useVendorOrderValue` in `src/lib/queries/vendorAnalytics.ts` — and both the
  Analytics card and the Quotes metrics rail read it, because two screens printing different
  numbers for a vendor's book is worse than either number being absent. An accepted quote
  *is* the order (there is no orders table): `quotes.price_per_unit × rfqs.quantity`. An
  accepted quote whose RFQ has no quantity contributes **zero** and is counted separately as
  `unpriced`, never guessed at.
- **A metric is windowed or it is lifetime, and the UI must say which.** Windowed metrics sit
  on a real per-row timestamp (`quotes.created_at`, `messages.created_at`,
  `reviews.created_at`, `calls.created_at`) and a date filter genuinely re-scopes them.
  Lifetime metrics sit on monotonic counters with no event history — `products.views_count`,
  `products.enquiries_count`, `advertisements.impressions/clicks` — and a date filter cannot
  touch them: `increment_product_view`'s whole signature is `{ p: uuid }`, so no timestamp
  and no viewer identity is ever recorded. Every analytics card carries either a
  `Last <range>` pill or a `Lifetime` pill with the reason. **A filter control that silently
  does nothing is worse than one that is visibly unavailable.**
- **Views and enquiries are independent counters and their ratio is not always a rate.**
  `views_count` and `enquiries_count` were not necessarily incremented over the same period,
  so `inquiries ÷ views` can exceed 100% — the demo vendor sits at 15,425%. Above 100% the
  Conversion card shows the two underlying counts and says they are not comparable. A
  four-figure "conversion rate" would undermine every honest figure beside it.
- **Missed calls cannot be measured and must never be shown as a number.** `calls` is exactly
  `(id, buyer_id, vendor_id, direction, product_context, created_at)` — no status, no
  duration, no answered flag. A row records the **dialer opening** (`tel:` is all a web app
  can do), not a connected call. Every live row is also `direction = 'outgoing'`, because the
  insert policy is `buyer_id = auth.uid()` and `useCallBuyer` deliberately does not log — so
  vendor-facing surfaces map direction to the **vendor's** perspective (a buyer's outgoing
  call is the vendor's inbound one) rather than printing the raw column.
- **Ad money is "revenue booked", never cost, CPC, CPM or ROAS.** Cosora ads are flat-rate
  prepaid placements, not an auction: there is no bid, no per-impression price and no
  attributed order revenue, so those figures have nothing behind them. The Advertise strip's
  invented "Avg. Cost/Lead" was deleted rather than renamed; the real figure is **revenue
  booked ÷ leads**, matching Cosora-Admin's `AdsMonitoring.tsx`. Two schema facts go with it:
  **`ad_orders.amount` is in paise** (`computeAmountPaise` multiplies by 100), and
  **`ad_orders` has no `ad_id`** — one order publishes one `advertisements` row per spec
  item, so per-campaign attribution divides the amount across items and matches on product +
  nearest start date, reporting anything unmatched rather than hiding it. Campaigns published
  through the demo path create no `ad_orders` row at all and genuinely booked ₹0.
- **`advertisements.placement` is a comma-joined CSV, not a single value** (`"openListing,
  trustedSeal"`). Anything branching on placement must test membership, not equality.
- **An ad click must honour the campaign goal the vendor paid for.** `SponsoredRail.tsx` and
  `NewArrivals.tsx` used to `navigate('/product/${a.productId}')` for every ad whatever its
  placement, so a vendor who bought the "Visit your profile" goal
  (`GOAL_PLACEMENTS.visitProfile: ["storePromotion", "brandAd"]`) got product traffic
  instead of storefront traffic, and a profile-goal ad with no `product_id` was a dead card
  that navigated nowhere at all. **Fixed 2026-09-08**: `adDestination()` in
  `src/lib/adDestination.ts` routes a storePromotion/brandAd placement to
  `/vendor/${vendorId}` and everything else to the product, falls back to the storefront
  when a product-goal ad has no product, and returns null when there is nowhere to go — the
  caller must then not navigate. It lives in its own dependency-free module so
  `node scripts/ad-destination-check.mjs` can exercise it without a browser or a session;
  that matters because `active_ads` currently returns zero rows, so no UI test could reach
  this branch. **This is buyer-facing navigation, not analytics** — treat a change to it as
  a product change.
- **Buyer location was collected and thrown away for the entire life of the product.**
  `AccountInfo.tsx` asks every new buyer for a pincode, and on the "use my location" path it
  reverse-geocodes a city and state out of BigDataCloud too — then used them for a toast and
  discarded all three, because `saveAccountInfo()` never accepted or wrote them. So
  `buyer_profiles.city/state/postal_code` stayed null for every account created through
  onboarding. **Fixed 2026-09-09.** Two consequences that are permanent: every pre-existing
  buyer has no location and it **cannot be recovered after the fact** — do not backfill a
  guess — and the geography feature therefore has to state its own coverage rather than imply
  completeness.
- **A bare pincode is not a city, and must not be turned into one by guessing.** The
  geolocation path stores city + state + postal_code together because all three were really
  resolved; the manual path stores **only** postal_code. There is no pincode gazetteer in this
  project, and inventing a city from a pincode would put a fabricated place on a vendor's map —
  the exact failure the analytics work exists to remove. A pincode→city lookup is a separate
  project with a real data source, not a helper function.
- **A vendor sees where their buyers are only as counts, and only above a threshold.**
  `vendor_buyer_geography` is SECURITY DEFINER and does the `engagement_events → buyer_profiles`
  join server-side; **`buyer_profiles` RLS is unchanged and must stay that way.** Any place
  backed by fewer than **3 distinct viewer_ids** is folded into an unnamed `other` bucket —
  a vendor with two regular buyers in one small town could otherwise identify both from a map
  with a "2" on it. Only buyer-*initiated* events count (`product_view`, `profile_view`,
  `search_click`); `ad_impression` is excluded so ad spend cannot inflate a demand map. The
  threshold is a privacy guarantee, not a display preference — changing it is a policy decision.
- **The schema must stay compatible with a future working-capital lending product.** Order
  volume, capacity, reliability, pricing and transaction history are being collected with
  that in mind even though the product does not exist yet.
- **The side on load is `profiles.active_role`** (MPF-13, fixed 2026-09-24).
  - `UserRoleContext` seeds `role` from it once per account per page load. A switch after
    that stands until a reload.
  - `vendorRegistered` is `vendor_profiles.onboarding_complete` alone (Mitra's call).
    localStorage holds only a per-account hint until that read returns.
  - `useSwitchRole` is the one place that decides where a switch goes, and both directions
    need a completed registration.
    - Buyer → Seller goes through `/onboarding` unless registered.
    - Seller → Buyer is only for a registered seller (Mitra, 2026-09-25, MPF-22:
      onboarding collects everything the buyer side needs). Anyone else goes to
      `/onboarding` with "Finish your seller registration to use the buyer side".
- **Search ranking happens in ONE place: `match_products`.** Keyword rank and vector rank
  are fused with RRF (k = 60, the paper's constant, deliberately untuned), and the vendor's
  paid `search_boost_tier` is applied as a multiplication **after** fusion — bounded at
  1 + 4×0.05 = 1.20, so it can reorder near-neighbours but cannot lift an irrelevant listing
  over a relevant one. Never reintroduce a client-side sort over search results: the browser
  cannot see relevance, so any re-sort silently discards the ranking it was given. (The
  browse feed still sorts by boost — that is a different surface with nothing to rank
  against.)
- **No fabricated data on the search surfaces, ever again.** Search.tsx and SearchResults.tsx
  previously shipped invented search volumes, **real trademarked brands (H&M, Zara, Levi's)
  that are not vendors here**, invented follower counts, a "Popular keywords" list stamped
  with today's date implying a trending job that did not exist, a "Sponsored" rail of fake
  listings priced in USD, and a 15-item picsum product pool rendered whenever the catalogue
  was empty. All removed. Every number on those pages is now counted from a real row, and an
  empty catalogue renders empty (see "No mock data in production").
- **A degraded search must admit it.** When a query has no cached embedding the results are
  keyword-only, and the footer says `· keyword match only`. Loading / empty / results stay
  three distinct states — a failed fetch used to render eight placeholder products and pass
  for a populated catalogue.
- **No fabricated data on a vendor's own storefront, either (2026-09-08).** The same rule as
  the search surfaces, applied to `/my-store`, `/business-profile` and their siblings. Removed:
  a `picsum.photos` avatar and the words "business name" in the store header, six **Korean
  fashion brand logos** (chuu, cherrykoko, brandi, stylenanda, styleonme, hotping) rendered as
  the vendor's own categories, six invented products under a "Caramel Fashion / 3,538"
  heading, five invented videos, four invented "recommendations" behind a grid that persisted
  nothing, two invented catalogue PDFs, a fake PAN (`ABCPR1234D`), a fake turnover
  (`Rs 2 - 5 Cr`), `"1 Year"` as member-since, `7,333` followers — and an **80/5/0/0/15 star
  breakdown shown to vendors with no reviews**, which is a fabricated reputation on a person's
  own profile. An empty vendor now renders empty states with a CTA. Loading renders skeletons,
  never a placeholder number.
- **A product page renders its own row and nothing else (2026-09-11).** `/product/:id` used to
  spread the real listing over a hardcoded demo product, so every field the row did not set was
  inherited fiction — GOTS/OEKO-TEX certification and a 4-hour response time on every live
  listing, four invented named reviewers on any product without reviews. There is no template
  now, and none may be reintroduced "for fields we don't store yet": a field with no column is
  not rendered, and an empty one says "not specified". **Never display `rating_avg` or
  `reviews_count` from `products` or `vendor_profiles` as a rating** — on seeded rows they are
  fiction (23 of 26 live listings; one vendor claims 4,800 reviews with zero rows). Derive
  ratings from `product_reviews` / `reviews`. `products.sold_count` has no writer at all.
- **No invented endorsements on marketing pages (2026-09-11).** The landing page carried a
  five-star testimonial attributed to a named founder of a named brand, with a stock headshot —
  none of it real. A testimonial, logo wall, customer count or quote goes on a public page only
  when a real, consenting customer supplied it; rewording an invented quote does not make it
  real. Same rule for imagery: nothing hotlinked from a placeholder service, and an image the
  project does not own is replaced with nothing, not with another placeholder.
- **Curated is not trending (2026-09-11).** A surface that shows hand-picked content must say so
  ("curated", "suggested") and must not print numbers that imply measurement — search growth,
  "top sellers", trend deltas — unless a real data source produces them. `/home/trends` carried
  invented "↑ 800%" keyword growth and a "Top Brands" list of brands that do not exist; both are
  gone, and the page is labelled "Curated trend picks" until a real trends job exists.
- **A registration that was not saved must never look like one that was.** `/onboarding`'s
  submit used to show "Welcome to Cosora" unconditionally — a signed-out vendor completed
  eight steps and wrote nothing anywhere. A missing session or a failed write now blocks on
  the final step with the form intact. Corollary: never persist a `blob:` URL. Three of these
  steps stored `URL.createObjectURL()` results, which are alive only in the tab that made
  them, so `vendor_documents.file_url` was always null and `office_photos` always empty.
- **The app never claims to have verified something it cannot verify.** There is no PAN
  lookup wired to this project, so onboarding does a **format** check and reports "Submitted
  for review"; `vendor_documents.verified` is flipped by an admin and by nothing in the
  client. A green "Verified" tick derived from a regex and a `setTimeout` is the app vouching
  for a document nobody has looked at. Same rule retired the OTP modal's `482931` auto-fill.
- **A vendor sees exactly the trust seal buyers see.** `/business-profile` gates TrustedSEAL
  on `trustSealFromParts()` — the same helper `/vendor/:id` and every product card use. It
  used to render unconditionally, so every vendor believed they were verified, including the
  ones buyers see no seal for. Unverified vendors get a "Get verified" chip pointing at
  `/advertisements`, where the seal is actually sold.
- **A "share this" link must point at the surface the recipient needs.** The vendor review
  link shared `${origin}/reviews` — the *vendor's own dashboard* — so a buyer who followed it
  landed on their own empty seller page. It is `${origin}/vendor/:id`, where a working review
  modal already exists. Relatedly: a `<QrCode>` lucide icon is a *picture* of a QR code and
  does not scan; if a QR is shown, generate a real one.
- **Identity documents go in a PRIVATE bucket, and the code enforces it (2026-09-08).** KYC
  scans live in `business-docs`, never `product-images`. `assertKycBucket()` runs at the top
  of every function that touches a `/kyc/` path and throws otherwise; a private bucket has no
  public URL, so reads are 5-minute signed URLs minted **on demand for the one document being
  opened**. The `${vendorId}/kyc/…` prefix is load-bearing —
  `business_docs_owner_select` keys on `foldername(name)[1]`. Never call `getPublicUrl()` on a
  private bucket: it returns a string that 400s, which reads as success.
- **A vendor must never be able to mark themselves verified.** `vendor_documents_all` is one
  `ALL` policy with `vendor_id = auth.uid() OR is_admin()`, which let a vendor `update … set
  verified = true` on their own KYC from the browser. The `vendor_documents_guard_review`
  trigger refuses the four review columns to non-admins; `set_vendor_document_verified()` is
  the only writer. Before adding a self-service column to any table with a permissive `ALL`
  policy, ask what a client could set it to.
- **A KYC resubmission is a new row, through one helper** (Master Prompt 8, 2026-09-11).
  The guard above makes editing a reviewed row impossible for a vendor, so a replacement is a
  fresh INSERT, which the guard forces to unreviewed. Every writer of `vendor_documents` goes
  through `replaceVendorDocuments()`: insert the new rows, then delete the superseded ones by
  id, then remove their storage objects. One active document per type, no stranded scan, and
  never a moment with no row. The rejection is kept in the `kyc_rejected` notification, not
  in a dead row.
- **An identity document is uploaded when it is submitted, not when it is picked**
  (Master Prompt 8, 2026-09-11). `/onboarding` is reachable by buyers on purpose, so a
  pick-time upload put a PAN scan under an account with no vendor profile the moment a
  buyer chose a file, and abandoning left it there. Onboarding holds `File` objects and
  uploads at submit; a failed submit calls `discardUnreferencedKycUploads()`. Any new
  identity-document input follows the same rule.
- **Authorization for a moderation verdict goes INSIDE a SECURITY DEFINER function.** A
  client UPDATE that RLS denies matches zero rows and returns success. This repo has been
  bitten by that; `set_vendor_document_verified()` follows `set_account_status()` — same
  support/super_admin gate, raises on every failure path, and the admin UI's button is gated
  on the matching section so a disabled control is never the only defence.
- **A rejection needs a reason, and the person rejected has to see it.** The database refuses
  `set_vendor_document_verified(..., false, null)`. `/kyc` renders the note the way
  /upload-video renders a moderator's note on a rejected clip. Approving clears it.
- **Approving KYC does not grant the trust seal.** The seal has exactly three sources (admin
  flag, active paid plan, ad purchase) and `sealSources()`/`trustSealFromParts()` enumerate
  them. KYC status is shown in the admin's verification card as CONTEXT for the human making
  the call — adding a fourth source silently would make that card stop describing what buyers
  see.
- **A signed contract is append-only.** `vendor_contracts` has select and insert policies and
  **no update or delete for anyone, admins included** — an editable contract is not evidence.
  It is written inside `saveVendorOnboarding()`, in the same call that sets
  `onboarding_complete`, so "onboarded but no contract on file" is not a reachable state.
  `agreement_version` comes from one constant that is rendered AND stored, so the record
  always names the wording the vendor actually read.
- **RLS policies are not the whole story — check the foreign keys too.** `vendor_contracts`
  had no UPDATE or DELETE policy for anyone and was still destroyable: its `vendor_id` FK was
  `ON DELETE CASCADE` to `vendor_profiles`, whose `FOR ALL` policy let a vendor delete their
  own row, so a vendor could erase their own signed agreement from the browser. Now
  `ON DELETE RESTRICT` **and** an admin-only `vprofiles_delete`; both are load-bearing and
  neither may be relaxed alone. Before trusting "no delete policy" to protect a table, ask
  what cascades into it. Same lesson as the `vendor_documents` self-verify hole: an integrity
  guarantee is only as strong as the paths nobody checked.
- **One signature per (vendor, agreement version).** A retried onboarding submit used to sign a
  second permanent contract that nothing could remove. `trg_vendor_contracts_one_per_version`
  skips the duplicate. It is a trigger and not a UNIQUE constraint because one vendor
  deliberately retains two historical rows as the record of that bug — see
  `technicalimplementation.md` before "fixing" it into a constraint.
- **Deleting a row does not delete its storage object, and nothing cascades.** Every KYC
  re-submission used to strand the previous identity scan in the private bucket, referenced by
  nothing. Any code path — product OR test — that replaces a row holding a storage path must
  read the path first, delete the row, then remove the object, in that order.
- **Mobile + OTP is the primary sign-in and signup, and every code goes through ONE seam.**
  `src/lib/auth/otp.ts` (`sendOtp` / `verifyOtp`) is the only file allowed to call
  `supabase.auth.signInWithOtp` / `supabase.auth.verifyOtp`. Login.tsx and Register.tsx
  send, and `/auth/otp-verify` (OtpVerify.tsx) verifies. Email + password is no longer a
  user-facing sign-in; the dev demo switcher still uses it. **SMS delivery is not live**: the
  project has no SMS provider, so the send returns `phone_provider_disabled`. The seam maps that
  to `not_live`, and the code screen then says "No code was sent" and shows no expiry timer.
  That state is read from the server's answer, not from a flag. Never show "code sent", a timer
  or a "verified" tick unless the server accepted the send and the verify. Google and guest
  browsing are the working routes until then. The custom in-house OTP API plugs into
  `otp.ts` only: its TODO records the open choice between an Auth "Send SMS hook" (otp.ts
  unchanged) and API-side verification with an edge function minting the session.
  Onboarding's phone field is still a plain contact field.
- **Email confirmation is ON, so a signup has no session.** `auth.signUp()` returns a user and
  `session: null`. Register.tsx therefore ends on a "check your email" screen rather than
  routing to a dashboard the account cannot load. `active_role` is carried in
  `raw_user_meta_data` and applied by `handle_new_user` **at signup**, because the client has
  no session to write it with — and a seller confirmed as a buyer is a bug you notice much
  later. That metadata is client-supplied, so the role is whitelisted to buyer/seller there.
  Admin status cannot be set from it at all: since admin-schema separation Phase 5c (2026-09-22)
  `profiles` has no admin column.

- **`admin.admin_users` is the ONLY source of truth for who is an admin and in what role
  (Phase 5c, 2026-09-22).** `profiles.is_admin` / `profiles.admin_role`, the profiles → admin_users
  mirror trigger (`admin.sync_from_profiles`) and the `profiles_admin_requires_role` CHECK are
  dropped. Do not reintroduce any of them.
  - Read: `is_admin()` / `admin_role()` for the caller (RLS, triggers, the main app's `isAdmin`);
    `admin_whoami()` for the panel's identity; `admin_status_of(uuid)` for service-role edge
    functions authorizing a decoded caller; `admin_list_admins()` for the roster.
  - Write: only `admin_grant` / `admin_set_role` / `admin_revoke` (super_admin or service_role;
    a manager for teammates in the team roles, below).
    They refuse (42501) to leave zero active super_admins; the escape hatch is SQL as postgres on
    `admin.admin_users`. Dev seed and cleanup scripts write that table directly.
  - `admin.shadow_admin_columns()` survives as a no-op: its profiles write is guarded by a
    column-exists check. `enforce_admin_grants()` now guards only `account_status`.
  - Embedding-health alerts go to the active `admin_users` rows.
  - **Manager** (`manager`, 2026-09-25) reads the Admin Log and, since 2026-09-26 (Mitra),
    manages the team: it adds, changes and removes teammates in the five **team roles**
    (`admin.is_team_role()`: product_moderator, vendor_ops, ads_moderator, finance_admin,
    support). It never grants Super admin or Manager, and never changes a super admin, another
    manager or itself. It sees no moderation or commerce section. A super admin grants
    Manager on the Admins page.
    - The rule is in the database (migration `20260925210601`): `admin_set_role`,
      `admin_grant`, `admin_revoke` and `admin_search_candidates` admit a manager on those
      terms. `admin-invite` (v8) refuses anything else before creating an account or sending
      an email, then grants with the caller's token, so `admin_grant` decides.
    - **A new admin role is not a team role until it is added to `admin.is_team_role()` on
      purpose**, and to `TEAM_ROLES` in Cosora-Admin's `roles.ts` and in `admin-invite`.
- **Every admin change goes in the Admin Log, which is append-only** (MPF-26, 2026-09-25).
  - `admin.audit_log` is written by three things:
    - `trg_admin_audit`, on each table the admin panel writes;
    - `admin_audit_session()`, for panel sign-in and sign-out;
    - `admin_audit_record()`, service role only, for the invite and refund edge functions.
  - Only super_admin and manager read it (`admin_audit_log_list()`), and nobody updates or
    deletes a row.
  - **A new table the admin panel writes gets `trg_admin_audit`**
    (`admin.audit_row_change('<owner column>')`). A new edge function that writes with the
    service-role key for an admin calls `admin_audit_record()`. Otherwise its changes never
    reach the log.
  - Counters and derived columns are left out (views, impressions, clicks, likes, ratings,
    embeddings, search text, `updated_at`). A new counter column goes on that list in
    `admin.audit_row_change()`, or an admin browsing the site shows up as changing rows.

- **The email-confirmation link is the primary signup path, and it has to FINISH the signup.**
  `handle_new_user()` writes exactly email, full_name, phone and active_role — nothing else.
  The brand name (seller) or company (buyer) typed at signup lives only in
  `raw_user_meta_data` until `applyPendingSignupProfile()` moves it, and that write needs a
  session, which a confirmation-gated signup does not have until the link is clicked.
  `AuthCallback.tsx` is where that session first exists, so it must call it — and for the
  whole of the trust-and-auth pass it did not, so every user who confirmed by email
  silently lost the name. `applyPendingSignupProfile` now has three call sites
  (Register, Login, AuthCallback) and is awaited before the redirect. **A signup fix is
  proved by the column, not by where the page redirected to.**
- **One profile score: one formula, one input shaper, one writer.**
  `calculateProfileScore()` is the formula; `profileScoreInputFrom()` is the only
  snake_case→camelCase mapping; `PROFILE_SCORE_COLUMNS` is the only select list; and
  `syncProfileScore(vendorId)` is the only thing outside the dashboard that writes the
  column. `saveVendorOnboarding()` used to carry a SECOND formula (nine unweighted checks
  against the in-memory payload, versus fifteen weighted signals against the rows) — same
  column, two authors, whichever ran last won, so a vendor finished onboarding on one
  number and watched it change on their first dashboard load. `syncProfileScore` must be
  called AFTER every other write in a flow: it scores rows, not intentions.
- **Aadhaar is deliberately NOT collected, and the app must not ask for it (2026-09-09).**
  Retaining Aadhaar numbers or images is constrained by the Aadhaar Act 2016 and UIDAI rules
  for any entity that is not an authorised KUA/AUA, and PAN already identifies the business
  for B2B verification. The payload key, the `vendor_profiles` column and the `aadhaar`
  `doc_type` all still exist so nothing that reads them breaks — but there is no input, no
  upload, and the step-1 "documents required" checklist no longer promises one. **Building
  the capture is a compliance decision, not a form-field decision.** CIN, by contrast, IS
  collected — optional, with its own upload, because only companies and LLPs registered with
  the MCA have one and **there is no entity-type field anywhere in the form** to tell a
  proprietorship apart. Every KYC document type now uploads through one
  `makeKycUploadHandler` factory, so a new type cannot acquire a different bucket or path.
- **A typed signature legitimately has no image, and surfaces must say so.** Onboarding lets
  a vendor draw a signature or accept the auto-generated cursive rendering of their typed
  name; only the drawn one produces a file, so `vendor_contracts.signature_url` is null for
  the typed case. That is complete evidence — `signed_name` + `agreement_version` +
  timestamp + the affirmative act — and the admin panel renders "typed — no image on file".
  **Do not "fix" this by rendering the typed name to a canvas and storing it:** that
  manufactures something that looks like a signature the vendor never made.
- **A test that uploads to storage must delete the OBJECTS, not just the rows.**
  `vendor-onboarding-write-path.spec.ts` deleted its `vendor_documents` rows and left the
  files, so every run leaked an identity scan into the private `business-docs` bucket —
  referenced by nothing and, after the fact, indistinguishable from a real vendor's KYC.
  Storage is not covered by a row delete and there is no cascade.
- **A spec that opens product or vendor pages writes production analytics.** A product page
  calls:
  - `increment_product_view`, an unthrottled `products.views_count + 1`;
  - `log_engagement_event`;
  - `ad_impression` for each sponsored card, which also adds to `advertisements.impressions`.

  Signed in, it also writes `recently_viewed`. Phase 19's link check did all of this twice
  before it was fixed. To check that a page opens, use a signed-out context and answer those
  RPCs in the browser (`TRACKING` in `tests/profile-data-export.spec.ts`). Snapshot the
  counters before and after to prove nothing moved.
- **Cleanup in a spec goes in `afterEach`, not a `finally`.** When a test times out,
  Playwright cuts its `finally` short; `afterEach` still runs. Phase 19's first run left
  saves behind that way.
- **A `<canvas>` inside a vaul `Drawer` needs `data-vaul-no-drag`.** vaul reads a pointer
  drag across drawer content as swipe-to-dismiss. `touch-action: none` defends the touch
  path only — browsers ignore touch-action for a mouse — and Onboarding's `onOpenChange`
  nulls the signature when the drawer closes unsaved, so a dismissed drawer discards the
  drawing with no error at all.
- **Supabase's built-in SMTP rate-limits signups, and that is a production blocker.**
  `auth.signUp()` starts returning "email rate limit exceeded" after a handful of attempts
  per hour on this project — reproduced twice, and it is why `tests/vendor-signup.spec.ts`
  fails intermittently with no code defect behind it. Register.tsx surfaces it honestly,
  but a burst of genuine signups will be rejected until custom SMTP is configured in
  Supabase Auth. Nothing in the codebase can fix this.
- **Never collect contact details you cannot act on.** The Business Tools "Get Reviews" form
  gathered real customer names and phone numbers and dropped them behind
  `toast.success("Review requests sent!")` — there is no SMS pipeline in this repo, so nothing
  was ever sent and the vendor had no way to know. A tile that says "coming soon" is honest; a
  tile that fakes a success is not.
- **Query embeddings never reach the browser.** `search_products` resolves the cached vector
  server-side; the client sends text and gets ids back. Shipping 1536 floats each way for a
  value the browser cannot use was the shape this replaced.
- **The embedding pipeline is a queue, and failure is the retry.** `generate-embedding`
  archives a pgmq message ONLY after the row is written; anything else leaves it queued for
  the next `pg_cron` tick. That is what lets the backfill be enqueued before OpenAI billing
  exists and drain by itself afterwards. Do not "fix" a stuck queue by archiving messages.
- **`generate-embedding` is service_role-only and `embed-query` is the public one, on
  purpose.** The queue drainer checks `role = 'service_role'` inside the handler on top of
  `verify_jwt` (the anon key gets 403 — verified), because the anon key ships in the bundle
  and would otherwise let anyone burn OpenAI credits. They are separate functions so an auth
  mistake on the buyer-facing path cannot expose the drainer.
- **The lead cap applies to the open marketplace only (Andy, 2026-09-22).** A lead is a
  distinct open-marketplace RFQ (`rfqs.vendor_id is null`) the vendor quoted in the window.
  A reply to a request addressed directly to the vendor is never counted and never refused
  by the cap, even at the cap. The dashboard (`get_vendor_plan()`, the source of truth) and
  `enforce_lead_cap()` must count the same thing. Mechanism: `technicalimplementation.md` →
  "Plan caps".
- **A quote needs an RFQ that is open to that vendor (Mitra, 2026-09-23: "closed RFQs should
  not receive any quotes").** The RFQ must be `active`, and a request addressed to a vendor
  can be quoted only by that vendor. This applies to every writer, and it covers re-submitting
  an existing quote after the buyer closed the request. Enforced by `trg_quotes_accepting_rfq`
  (migration `20260923081708`), which fires before the lead cap so a closed request reports
  "closed", not a cap hit. Accepting or rejecting a quote is unaffected.
- **The buyer decides a quote's status; the vendor sets its terms** (MPF-18, 2026-09-25,
  `trg_quotes_update_roles`).
  - The RFQ's owner may change only `status`.
  - The quote's vendor may change its terms, and may move `status` only to pending.
    Changing the terms of a quote that isn't pending puts it back to pending.
  - Only an admin changes `id`, `rfq_id`, `vendor_id` or `created_at`.
  - So `accepted` means the buyer accepted these terms, and Total Order Value can trust it.
- **A plan cap must hold under concurrent requests, not just sequential ones.**
  `enforce_product_cap()` and `enforce_lead_cap()` take
  `pg_advisory_xact_lock(hashtext(vendor_id::text))` before they count (`20260923082118`).
  Without it, 10 simultaneous HTTP inserts at one free slot got 2–5 through, in 9 of 10
  rounds. Any new count-then-decide trigger takes the same lock.
- **Any signed-in user may read any ACTIVE open-marketplace RFQ (Andy, 2026-09-22).**
  `rfqs_select` works like an open sourcing board on purpose. It does not check that the
  reader is a vendor. Settled; do not "fix" it.
- **Every migration is a committed file named by its LIVE version (Master Prompt 12,
  2026-09-23).** Applying through the MCP is not enough. Apply, read the version the
  database stamped, and name the file `<that version>_<name>.sql` with statements equal to
  what was applied (md5-compared). Reports cite the file's raw GitHub URL. Older files use
  authored timestamps (`MIGRATIONS.md`), and 45 live migrations, the whole base schema
  among them, are in neither repo.

### Postgres facts that are not guessable (all cost a failed migration to learn)

- **A generated column cannot reference another generated column.** `fts` therefore inlines
  the whole `search_text` expression rather than reading the column. They cannot drift —
  both derive from the same own-row columns — but the duplication is deliberate, not an
  oversight to "clean up".
- **`array_to_string` is STABLE, not IMMUTABLE**, so it cannot appear in a generated column.
  `public.immutable_array_to_string(text[], text)` is the narrow wrapper that makes
  `pattern`/`occasion` indexable. Do not widen it to other element types.
- **A generated column cannot run a subquery**, which is the entire reason `category_name`
  is denormalised onto `products` (synced by a BEFORE `UPDATE OF category_id` trigger).
  Category is the best-populated field on the table and the single most valuable search
  signal — a query for `t-shirt` matches "Ribbed Tank Top" only through its category.
- **`UPDATE ... OF <col>` fires on the columns NAMED as a target, not on the ones whose
  values changed.** That is what makes the category-rename cascade
  (`UPDATE products SET category_id = category_id`) work; it looks like a no-op and is not.
  Verified against this database.
- **`pg_net` registers against the `public` schema but its FUNCTIONS live under `net`.** The
  cron poller calls `net.http_post`. The extension namespace and the callable namespace are
  not the same thing here. This is also why `get_advisors` reports
  `extension_in_public: pg_net` and why that warning is **left alone**: all 12 of its
  functions are in `net` and **zero** are in `public` (verified via `pg_depend`), so nothing
  is actually exposed. `ALTER EXTENSION pg_net SET SCHEMA` would try to relocate objects out
  of a schema the extension creates for itself, and the only thing it would buy is silencing
  a cosmetic lint on the surface that carries the embedding cron.
- **A SECURITY DEFINER function pinned to `search_path = public` cannot resolve pgvector's
  `<=>` operator at all.** Every function touching embeddings needs
  `set search_path = public, extensions`.
- **`if not (<nullable expr>) then ... end if;` DOES NOT FIRE when the expression is NULL,
  which turns a self/admin guard into no guard at all.** The `ad_category_benchmarks` pattern
  `if not (vid = auth.uid() or public.is_admin()) then return null; end if;` looks airtight and
  is not: with no JWT, `auth.uid()` is NULL, so `vid = auth.uid()` is NULL,
  `NULL or false` is NULL, `not NULL` is NULL, and `if NULL then` is skipped — the function
  falls through and returns real data to an unauthenticated caller. **Verified against this
  database**: `vendor_buyer_geography` returned a full result when called with an explicit `v`
  and no JWT, until the test became
  `if not (coalesce(vid = auth.uid(), false) or coalesce(public.is_admin(), false))`.
  **`ad_category_benchmarks` still has the original shape and still carries its default PUBLIC
  execute grant** — low impact (its output is anonymised peer aggregates) but it is the same
  hole, left alone here rather than changed underneath `CompetitorAds.tsx`. Any new
  self-guarded function must coalesce.
- **`create or replace function` with an ADDED parameter does not replace — it OVERLOADS.**
  Adding `max_distance` to `match_products` left the old 4-arg version in place; both
  accepted the 3-arg call `search_products` makes, Postgres raised
  `42725: function ... is not unique`, and **all search failed in production**. Any
  migration that changes a function's parameter list must `drop function` the old
  signature explicitly, and that drop must be in the migration file or a fresh deploy
  recreates the ambiguity. Dropping also discards grants, so re-assert them after.
- **No scheduled job runs** (Mitra, 2026-09-26). All twelve pg_cron jobs were deleted by
  `20260926082046_unschedule_all_cron_jobs.sql`: the account-deletion sweep and its alarm,
  subscription expiry, the ad schedule sweep, the embedding worker and its health log and
  alarm, the vendor catalogue recompute, two prune jobs, FX rates and FAQ snapshots. Nothing
  that depended on them happens by itself until they are restored (`ToDo.md`, "Restore the
  scheduled jobs"). A stale value from one of them is not a bug in that feature. Don't
  re-create a job without Mitra's say-so.
- **A SQL statement that does nothing still SUCCEEDS — that is how a cron job lies.**
  The embedding worker was `select net.http_post(...) where exists (<vault secret>)`.
  With the secret absent the WHERE was false, zero rows came back, and pg_cron recorded
  `status = 'succeeded'` **3,960 times over three days while nothing was embedded**. A
  scheduled job whose work is conditional must RAISE when it cannot do work it has
  (see `20260909130000`), or the outage is invisible. Never treat a green
  `cron.job_run_details` as evidence that a pipeline ran.
- **Vector search always has a nearest neighbour, so it never returns "no results".**
  Without a distance cutoff every query — including gibberish — returned the entire live
  catalogue presented as matches. `match_products.max_distance` (0.80) exists for this.
  It is calibrated against real measured distances (real queries' nearest 0.30-0.52,
  gibberish 0.83) on a **26-product** catalogue; re-measure as the catalogue grows. The
  FTS branch is deliberately not thresholded.
- **Facet option strings are compared to column values EXACTLY.** `searchFilters.ts`
  offered gender `Boys`/`Girls` and pre-scoped kids queries to `Boys`, but
  `products.gender` only ever holds Men / Women / Kids / Unisex — so **every kids, child
  and baby search returned zero results**, and the 4 Unisex listings were unreachable.
  Any facet vocabulary must be checked against `select distinct <col>` on live data, not
  against what the UI copy suggests.
- **Postgres grants EXECUTE to PUBLIC by default.** `grant ... to service_role` alone does
  not restrict anything; the matching `revoke all ... from public, anon, authenticated` is
  the part that does the work.
- **On Supabase there are TWO independent grants exposing a function, and revoking one
  proves nothing.** Three migrations in this project "hardened" functions with
  `revoke execute ... from public` and **all three were no-ops from the day they were
  written** — `reject_vendor_content` stayed `anon`-callable for over a month. The cause is
  NOT drop-and-recreate wiping grants (no migration ever dropped them; `20260801102505`
  used `ALTER FUNCTION ... RENAME` specifically to preserve the ACL). It is that Supabase
  registers `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,
  authenticated, service_role` in `pg_default_acl` for **both** the `postgres` and
  `supabase_admin` grantors, so every function born in `public` carries explicit per-role
  grants that revoking the PUBLIC pseudo-role never touches. Read the ACL to tell them
  apart — a leading `=X/postgres` with an **empty grantee** is PUBLIC; `anon=X/postgres` is
  the named role. `set_account_status` had the exact inverse shape (PUBLIC only, no `anon`
  grant), so for that one `from anon` was the no-op. **Revoke both, then confirm with
  `has_function_privilege('anon', oid, 'EXECUTE')`.** A revoke that runs without error is
  not evidence of anything.
- **A single-row CTE can be re-executed once per outer row, turning O(1) into O(N x M).**
  `match_vendor_rfqs` held the vendor's category set in a `with v as (...)` CTE and scored
  each open RFQ against it. Postgres inlined the CTE and pulled its correlated subquery into
  the nested loop: `SubPlan 1 -> Aggregate (loops=2003)`, ~2.07M product row reads for one
  call, **98% of the query's buffers**, 1,991 ms. `with v as materialized (...)` fixed it —
  loops 2003 -> 1, **52x faster**. Where a CTE holds one constant row that every outer row
  reuses, MATERIALIZED is a correctness-of-plan requirement, not a style preference. Nothing
  in the source hints at this; only `EXPLAIN (ANALYZE, BUFFERS)` shows the `loops=` count.
- **pgvector's HNSW index is only used when the query vector is a constant or parameter at
  execution time.** Ordering by a vector that arrives from a JOINED table produces a
  `Seq Scan` + join filter (measured: 2,039 ms over 10k rows), while the identical query
  with the vector as a literal gets `Index Scan using products_embedding_idx` (2.5 ms warm).
  A function PARAMETER behaves like the literal, which is why the real RPCs are fine — but
  it makes any ad-hoc benchmark that joins to a vectors table measure the wrong thing.
  A scalar subquery (`(select embedding from cur)`) resolves as an InitPlan and **does**
  keep the index; extra `ORDER BY` tiebreakers after the `<=>` are fine too, handled by an
  Incremental Sort. Both verified on this database at 10k products / 2.5k videos.
- **A trigger that must see rows RLS hides needs a SECURITY DEFINER helper; the trigger
  itself must stay INVOKER.** The plan-cap triggers start with
  `if current_user <> 'authenticated' then return new`. Inside a definer function
  `current_user` is the owner, so making the trigger definer silently disables the cap for
  everyone. Left as invoker, whatever it reads is filtered by the caller's RLS: `rfqs_select`
  hides a CLOSED RFQ even from the vendor who quoted it. An in-trigger count then
  under-counts past quotes on RFQs closed since (a cap bypass), and an in-trigger lookup reads
  NULL. `lead_cap_used()` and
  `rfq_targets_vendor()` are the pattern: definer, pinned `search_path`, raise `42501` unless
  asked about the caller (with `is distinct from`), EXECUTE to authenticated only. Return the
  narrowest answer the trigger needs, never a column RLS would hide.
- **A count-then-decide trigger races under real concurrency, and a single SQL session cannot
  show it.** Each concurrent transaction counts before the others commit, so all of them see
  the same free slot. The 2026-09-16 probe reported "no race" because its "concurrent"
  inserts ran one after another in one session. Real parallel HTTP requests
  (`scripts/cap-race-check.mjs`) broke both caps in 9 of 10 rounds. The fix is a
  per-key `pg_advisory_xact_lock` before the count. It works because each plpgsql statement
  in a VOLATILE function takes a fresh snapshot under READ COMMITTED (PostgREST's default),
  so the waiter's count sees the row the lock holder just committed. It would not work
  under REPEATABLE READ. Test a race with separate connections, never with one session.
- **PostgREST pool exhaustion does not show up as an error. It shows up as a 10–15 s stall
  with HTTP 200.** When PostgREST cannot get a pool connection within 10 s it returns
  `504 PGRST003`, and Supabase's gateway retries it, so the client sees a slow success. In
  the 2026-09-23 load test the client error rate was 0% while `postgrest_logs` held the
  PGRST003s. Look for pool trouble there, and in latency tails, never in client error rates.
  PostgREST's pool here tops out at ~11 connections, whatever the load.
- **`cron.job_run_details` is never pruned, has no `jobid` index, and is 63% of the database**
  (120 MB of 190 MB on 2026-09-23, +~3,000 rows/day). It belongs to `supabase_admin`:
  `postgres` can DELETE from it but cannot index it. Read it only by walking `runid`
  backwards with a LIMIT. A `max()` or `where jobid =` over it is a full scan, which is what
  made `embedding_pipeline_health()` take 64 s under load. Pruning it is an open retention
  decision. Note that `embedding-health-alarm` surfaces failures as rows in this table.
- **Deleting a vendor account is not a one-statement cascade here.** `auth.users` →
  `profiles` → `vendor_profiles` / `products` does cascade. But deleting a product fires
  `trg_products_sync_vendor_catalog`, which INSERTs into `vendor_catalog_recompute_queue`
  (FK → `vendor_profiles`), so in one cascade the product deletes can hit a vendor row
  that is already gone, and the whole delete aborts. `messages.quote_id` / `rfq_id` and
  `rfqs.product_id` are NO ACTION, and `vendor_contracts` is RESTRICT. Delete children first:
  conversations, RFQs, ads, products, then the user. `scripts/loadtest-cleanup.sql` is the
  worked example.
- **Production holds no load-test population since 2026-09-23.** `scripts/loadtest-cleanup.sql`
  deleted all 370 `loadtest-*@cosora.test` accounts and their content, leaving 20 real
  accounts and 26 live listings. Row counts are now real usage. Any check that signs in as
  `loadtest-*` (the k6 harness, `mp12-sourcing-loop`, the cap and quote scripts) needs a new
  population first. Create it with the same email pattern and `[LOADTEST]` tags, so the same
  script can remove it.
- **GoTrue returns HTTP 500 "Database error querying schema" for any user row with NULL in
  `confirmation_token`, `recovery_token`, `email_change_token_new` or `email_change`.** It
  fails before the password is checked, so a user seeded by raw SQL looks perfect in
  `auth.users` and cannot log in. Seed those four as `''`. All 370 load-test users had this
  until 2026-09-23.
- **pg_cron runs each job in ONE transaction, so a job that RAISEs rolls back its own
  logging.** Recording health history and raising an alarm therefore cannot live in the same
  job — `embedding-health-log` (records, never raises) and `embedding-health-alarm` (raises,
  writes nothing) are split for exactly this reason, not for tidiness.
  `account-deletion-sweep` and `account-deletion-sweep-alarm` are split the same way (MPF-27,
  2026-09-25): a raise in the sweep would roll back its SQL fallback.
- **Inside a PL/pgSQL exception handler, `SQLSTATE` and `SQLERRM` are variables.** A
  statement there that names a column `sqlstate` fails, and a nested
  `exception when others` then swallows that too: a failure log that records nothing. The
  MPF-23 rehearsal caught exactly that on 2026-09-25. Call such a column something else
  (`error_code`).
- **Storage's CDN runs as Smart CDN on this Free-plan project** (measured 2026-09-24, Phase
  23), although Supabase documents Smart CDN as Pro only. Responses carry `x-smart-cdn: true`;
  the edge keeps a copy until the object changes, and an overwrite invalidates it in ~47 s
  (three trials). It serves a cache hit whatever cache headers the client sends, and sends no
  `Age`. So Cache-Control max-age bounds browsers, not the edge. If Supabase ever turns it off
  for Free, the edge falls back to max-age. Re-measure with `scripts/faq-cdn-propagation.mjs`.
- **`pgmq.read()` sets the visibility timeout in the same statement that returns the rows**,
  so concurrent readers get disjoint sets and can safely be run in parallel. Demonstrated on
  this database: with 30 messages queued, two successive `embedding_jobs_read(20, 90)` calls
  returned 20 and 10 with **overlap 0**. This is what makes the adaptive dispatcher (several
  concurrent worker invocations per tick) safe. It holds across ticks only because
  `VT_SECONDS` (90) exceeds the tick interval (60).

## Visit-level tracking — APPLIED 2026-09-08, and how it was verified

`engagement_events` + `log_engagement_event` are **live on the project** (migration
`20260907170000_engagement_events.sql`). Nothing is left to switch on. What was checked,
because none of it can be read off the schema:

- `node scripts/engagement-events-check.mjs` — **19/19**, and it writes real rows as real
  accounts, then deletes them. Covers: direct INSERT refused for anon / authenticated /
  the owning vendor (there is no INSERT policy at all); `viewer_id` taken from `auth.uid()`
  inside the function; `session_id` kept only when signed out and dropped when signed in;
  a **forged `p_vendor_id` ignored** in favour of the product's real owner; the status
  guard; a bad `event_type` and an unknown product id both returning cleanly; and RLS —
  the vendor reads their own rows, a buyer reads **nothing, not even events they generated
  themselves**, anon reads nothing.
- The **status guard** was proved in a self-rolling-back `DO` block (the demo vendor has no
  non-live product and a plan trigger refuses creating one — free plan allows 2 listings,
  they have 6): `product_notlive_dropped=t product_live_written=t cta_on_notlive_kept=t
  ad_notactive_dropped=t ad_active_written=t`, then `raise` rolled the whole thing back.
- **End-to-end through the real app**: a buyer searching `polo` and opening a result
  produced `search_impression ×2 (source=organic_search, query_text=polo)` →
  `search_click` → `product_view` **with `source=organic_search` preserved across the hard
  navigation**, which is the thing the 15-second `sessionStorage` marker exists to do.
  Two impressions for one search because impressions are counted **per vendor**, not per
  matching product.
- `src/lib/database.types.ts` was hand-written before access returned. It was diffed
  token-for-token against `generate_typescript_types` — **171/171 and 24/24 tokens
  identical**, so no regeneration was needed. Diff it again after any change here.

**A refused event is recorded, not lost** (MPF-23, 2026-09-25). `log_engagement_event()`
still returns normally, but any failure other than an unknown id is counted in
`admin.engagement_event_failures`, and Cosora-Admin's System Health page shows it. A new
event type or source must be added to `engagement_events`' CHECK constraints first, or
every such event lands there.

**The two `security_definer_function_executable` warnings on `log_engagement_event` are
expected and must not be "fixed".** `get_advisors` flags that `anon` and `authenticated`
can execute it. That is the entire design: a signed-out buyer's product view has to be
loggable, and the function is SECURITY DEFINER precisely so no client can INSERT into the
table directly. Revoking `EXECUTE` from `anon` would silently stop recording signed-out
traffic. The project already carries 67 of these same warnings for the same reason
(`increment_product_view`, `ad_impression`, `ad_click` among them). **0 ERROR-level lints.**

## Product semantic search — what is left to switch it on

Everything is built, applied and deployed. Search **works today** as keyword-only and says
so in the UI. Two steps turn on the semantic half, and neither can be done from a migration.

1. **Store the service-role key in Vault.** Run once in the dashboard SQL editor — never in
   a migration, so the key never enters git or a chat transcript:
   ```sql
   select vault.create_secret('<the project service_role key>', 'service_role_key',
     'Lets pg_cron authenticate to edge functions');
   ```
   The `embedding-worker` cron job is already scheduled and guarded on this secret existing,
   so it is inert until the row appears and starts working by itself afterwards. The anon key
   will **not** do: `generate-embedding` rejects anything that is not `role = 'service_role'`.
2. **Enable billing on the OpenAI account.** `OPENAI_API_KEY` is already set as an edge
   function secret. Verify with the probe branch, which spends no tokens and touches no
   queue: `POST /functions/v1/generate-embedding {"probe":true}` (service-role auth) →
   `has_openai_key`, `has_service_key`, `supabase_url_set`.
3. **Then enqueue the backfill** (26 live rows, drains in one cron tick):
   ```sql
   select pgmq.send('embedding_jobs', jsonb_build_object(
     'table','products','id',id,'text',search_text))
   from public.products
   where status = 'live' and embedding is null and length(trim(search_text)) > 0;
   ```
4. **Verify:** `select count(*) from products where status='live' and embedding is null`
   should reach 0, and the four queries that return nothing today — `summer beachwear`,
   `breathable office wear`, `wedding outfit`, `gym clothing` — should start returning
   sensible neighbours. Do that check by hand; at this catalogue size it is five minutes and
   it is the only thing that actually tells you the embeddings are good.

**Watch the spend — both buyer-facing OpenAI functions are rate limited (since 2026-09-10).**
- **`embed-query`**: callable by any holder of the public anon key; one OpenAI call per *novel*
  query (repeat queries come from `search_query_embeddings` and cost nothing), ~$0.00002 each,
  length-capped. Metered only on a cache miss by `embed_query_rate_check`: **30 per IP per 5 min,
  10,000 globally per hour**.
- **`image-search`**: one `gpt-4o-mini` vision call per photo and no cache, so it is metered on
  **every** call by `image_search_rate_check`: **10 per IP per 10 min, 10 per signed-in user per
  10 min, 300 globally per hour**. Its counters live in the same `embed_query_rate_limit` table
  under `img:`-prefixed keys.
- Both return `rate_limited` as a 200 and fail OPEN if the limiter itself errors. **Using up a
  global budget turns that feature off for everyone until the window rolls.** That is an accepted
  trade-off on both, because the alternative is an unbounded bill. Mechanism and history:
  `documentation/securityflags.md` and the 2026-09-10 changelog entries ("Master Prompt 6" for
  embed-query; "Photo search now refuses non-product images and is rate limited" for image-search).

**The per-IP key is the LEFTMOST `x-forwarded-for` entry. On this deployment that entry is the
caller's real address — tested, not assumed (2026-09-11).** A temporary probe build of
`image-search` echoed the headers it received, from a client whose public IPv4 was confirmed
independently. Six cases, 3 requests each, plus one via curl: no forged header, a forged single
IPv4, a forged `a, b` pair, a forged non-IP token, a forged IPv6 address, and a forged
`X-Real-IP`. What arrived was always exactly `<real>,<real>, <upstream proxy>`: **no forged value
in any position**, and `X-Real-IP` never arrived. **The LAST entry is a proxy address that changes
per request and must never be used as the key.** This is observed platform behaviour on one date
from one IPv4 client, not a Supabase guarantee, and community reports disagree. Re-run the probe if
the proxy chain may have changed. `embed-query` parses the header the same way but was not itself
probed; that is an open item in securityflags.md.

## Raising MAX_VIDEO_BYTES (the 90 MB / Pro-plan step)

Written down now so it is not a judgement call under pressure later. The order matters
and the first step is the one that cannot be automated.

1. **Upgrade the Supabase org to Pro.** Free caps the project's global file size limit at
   50 MB, which is where today's `MAX_VIDEO_BYTES` comes from.
2. **Raise Storage → Settings → Global file size limit in the dashboard. FIRST.**
   This cannot be done via a migration, via the Storage API, or via MCP — it is a project
   setting, not schema, and there is no SQL for it. Set it to the new ceiling (90 MB).
3. **Then** bump the two places that mirror it, together, in the same change:
   - `MAX_VIDEO_BYTES` in `src/lib/queries/videos.ts` (the client gate), and
   - the `product-videos` bucket's `file_size_limit` (the server-side gate, so bypassing
     the client gains nothing).

**Skipping step 2, or doing it after step 3, silently accomplishes nothing.** A bucket's
`file_size_limit` can never exceed the project's global limit — set the bucket to 90 MB
while the project is still at 50 MB and uploads keep failing at 50 MB with an error that
points at the bucket, which is the wrong place to look. The client constant would then be
advertising a ceiling the platform will not honour, so a vendor picks an 80 MB file, waits
through a long resumable upload on a phone connection, and gets rejected at the end.

Egress, not just size, is the real constraint — see "Media is rationed by the Supabase
Free plan" above. Raising the cap raises what a single view costs.

## Bunny Stream — the deploy checklist (order matters, twice)

Two settings here are **not retroactive**, which is the same shape of trap as the
storage-limit ordering above: doing them late looks like it worked and is not.

1. **Enable MP4 Fallback in the Bunny library's Encoding tab — BEFORE the first
   upload.** `bunny-upload-url` hands the client a `play_<res>p.mp4` playback URL
   because the reel viewer plays a plain `<video src>`, which cannot decode an HLS
   manifest outside Safari. Bunny only generates those MP4 renditions for videos
   uploaded *while the setting is on*. Turn it on afterwards and every already-uploaded
   video 404s forever — the fix is a re-encode or a re-upload, per video.
   **Verified done on 2026-09-06** (`hasMP4Fallback: true` on a real upload).
1b. **Hotlink protection is ON, and that is fine — do not "fix" it.** The library
   has "block direct URL file access", so every playback URL returns **403 to a
   request with a blank `Referer`** and **200 to one from `localhost:8080` or
   `textile-spark-net.vercel.app`**. A browser playing the reel always sends a
   Referer; `curl -I` and a script `HEAD` never do. Verified 2026-09-06 both ways.
   Anything that probes these URLs must send a Referer or it will report a
   catalogue-wide outage that does not exist — which is exactly what happened
   before `scripts/bunny-e2e-check.mjs` learned to probe both shapes. If new
   origins are added (a custom domain), they must be added to Bunny's referrer
   allowlist or playback stops there.
1c. **The rendition is derived, never hardcoded.** `pickRendition()` in
   `bunny-upload-url` chooses from the source dimensions the client already probed,
   because Bunny only builds renditions the source supports. Verified 2026-09-06
   with the platform's own vendor clip (478×850 portrait phone video): Bunny
   produced **240p, 360p and 480p and no 720p**, and the function correctly chose
   480p. A hardcoded `play_720p.mp4` would have 404'd for exactly the content this
   marketplace receives. A ≥720p source still gets 720p; 1080p is deliberately not
   on the ladder (9:16 phone reel, and Bunny egress is billed).
2. **Set all three edge-function secrets**, none of which may ever reach the client:
   ```
   npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb "BUNNY_API_KEY=..."
   npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb "BUNNY_LIBRARY_ID=..."
   npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb "BUNNY_CDN_HOSTNAME=vz-....b-cdn.net"
   ```
   `BUNNY_CDN_HOSTNAME` is the library's CDN hostname from the Bunny dashboard. It is
   **not** a secret (it is in every playback URL) but it lives with the others so the
   edge function can compose complete URLs and the client needs no constant at all —
   which is what lets the delivery domain change later without a client release.
3. **Deploy the three functions**, all with `verify_jwt = true` (declared in
   `supabase/config.toml`; the manual JWT decode inside each is only sound because of it):
   `bunny-upload-url`, `bunny-delete-video`, `bunny-reconcile`.
4. **Verify:** `node scripts/bunny-config-check.mjs`. It signs in as a real vendor and
   calls the function's `{"probe":true}` branch, which reports the configuration verdict
   **without creating a Bunny video** — the only other way to check leaves a stray empty
   video in the library every time. It prints secret *names*, never values.
5. **Then** run `node scripts/bunny-e2e-check.mjs`. It uploads the real 478×850 vendor
   clip through the whole chain — slot, TUS, encode, row insert, delete — and asserts
   each step against **Bunny's API**, not the CDN. That distinction is load-bearing: a
   protected pull zone answers 403 for a file that exists and for one that does not, so
   a CDN probe cannot tell "encoded fine" from "never encoded", and an earlier version
   of this script passed its delete assertion for exactly that wrong reason (403 before,
   403 after). The script leaves nothing behind — it deletes its own Bunny video through
   the real delete path and removes its throwaway row in a `finally`.
6. **Finally, with both dev servers up, run
   `npx playwright test tests/video-closeups-bunny.spec.ts`.** Step 5 cannot answer the
   only question a buyer has — does the reel *play* — because from Node every playback
   URL is a 403 (see 1b). A browser sends a `Referer`, so this spec is the instrument
   that measures playback: it asserts `readyState >= 2` (a frame actually decoded) on the
   stored Bunny MP4 in **both** the moderator's player and the buyer reel, plus the
   renamed-`.mov` rejection with a request spy proving nothing was uploaded. It uses the
   `demo-*` accounts and cleans up asset-then-row in `afterAll`.

Nothing about moderation changes: the row still inserts as `under_review` and the same
BEFORE trigger still enforces it, whatever the provider — asserted at both layers
(`bunny-e2e-check.mjs` step 5 against an insert that explicitly asks for `live`, and
`video-closeups-bunny.spec.ts` T8.2/T8.4 through the real moderation UI).

## Mobile number + OTP login: the brief and where it stands (2026-09-22)

The standing brief for auth in the buyer/vendor app. Branch `auth/restore-mobile-otp`,
commit `532cd3e`. **Not pushed:** wait for Mitra's go.

> **Standing instruction (Mitra, 2026-09-23): sign-in stays mobile number + OTP only, and
> the OTP is a dummy for now. Don't change it.** No phase of other work may add, alter or
> re-route a sign-in method. That includes email sign-in, email-verification flows used as
> a login, and "just making the OTP real". Features that need to confirm who someone is
> (for example the deletion code, which goes to the account's email, or to its phone on
> WhatsApp) must not turn into a sign-in path. Accounts created through real sign-in have no
> usable email, so their deletion code goes over WhatsApp (Phase 18, `myprofileflags-fixed.md`
> MPF-6). That is a delivery channel only, and it never signs anyone in.

**Why.** The app was originally OTP-only. Email + password was later made the primary login,
and phone sign-in was demoted to a disabled "coming soon" row, because this Supabase project
has no SMS provider (`signInWithOtp({ phone })` returns `phone_provider_disabled`). That is
now reversed: **mobile number + OTP is the primary sign-in AND the account-creation path.**
Continue with Google, "Create an account" and "Explore as Guest" stay. Email + password is
removed as a *user-facing* sign-in.

**Delivery is not live, and the rule is honesty.** Codes will be delivered by a custom
in-house OTP/verification API: separate software, **not integrated yet**. Supabase phone OTP
is disabled. So delivery is stubbed behind one seam, and the no-fake-signals rule applies in
full:
- Never say "we texted you a code" when nothing was sent.
- Never show an expiry timer for a code that doesn't exist.
- Never show a "verified" tick for a code nothing checked.
- A visible dev note or a fixed dev code is acceptable. A fake "code sent" is not.

**Ground rules for any work on this flow.**
- App.tsx is edited only by surgical insertion, never rewritten.
- Do not touch the DevAccountSwitcher / demo-account logins. They use `signInWithPassword` for
  demo-buyer/vendor/admin, are dev-only, and must keep working.
- Frontend/auth-flow change only: no migration, nothing regenerated on the DB.
- Typecheck against `tsconfig.app.json`, and prove the harness catches an injected error before
  trusting a 0. The build must pass.
- Commit to the branch. Do not push until Mitra says so.

**The seam: `src/lib/auth/otp.ts`, the ONLY place a code is sent or checked.**
- It exposes `sendOtp(phone, { signupData? })` and `verifyOtp(phone, code)`, with phone in
  E.164 (`+91…`). No other file may call `supabase.auth.signInWithOtp` or
  `supabase.auth.verifyOtp`. Check with
  `grep -rnE "auth\s*\.\s*(signInWithOtp|verifyOtp)\s*\(" src`, which must find only otp.ts.
- **Interim behaviour:** it calls Supabase phone auth for real. `phone_provider_disabled` maps
  to `{ status: "not_live" }`. The code screen then says "No code was sent", drops the "You
  will receive an OTP" line and the timer, and raises no "sent" toast. `verifyOtp` returns
  `not_live` without calling `/verify` when the last send for that number was not live. The
  honesty comes from the server's answer, not a flag, so it flips by itself once delivery
  works.
- **Session mechanism:** a successful `verifyOtp` is an ordinary Supabase session. AuthContext,
  RLS, `handle_new_user()` and `applyPendingSignupProfile()` need no change. The signup
  metadata (`full_name`, E.164 `phone`, `active_role`, `brand_name`) rides on the OTP
  request. `handle_new_user()` reads `profiles.phone` from **metadata**, not from
  `auth.users.phone`, so the seam always sends `phone` in `data`.
- **Open decision for integration day** (recorded as `TODO(otp-integration)` in otp.ts;
  **neither is implemented**):
  - **(A) The custom API is only the SMS SENDER.** Supabase generates and verifies the code and
    issues the session. Point Auth → Hooks → "Send SMS hook" at the API and enable the Phone
    provider. otp.ts does not change.
  - **(B) The custom API generates AND verifies the code.** A Supabase edge function checks the
    code with the API server-to-server, finds or creates the `auth.users` row (with the signup
    metadata), and mints a session. The client applies it with `supabase.auth.setSession()`.
    Only the two Supabase calls in otp.ts get replaced, and the result types stay the same.
    Security requirements for (B) are in `securityflags.md`.
  - Do not add a third path.

**What the "previous OTP UI" actually was (Step 0).** It lives in git at `2279630^`; commit
`2279630` (2026-09-09) replaced it.
- **Layout (restored):** Login had a country-code picker (12 countries, +91 default), a 10-digit
  number field and **Send Code**. `/auth/otp-verify` (`OtpVerify.tsx`) had a masked number
  (`+91-9876XXXXX`), "Not You?", a 57-second expiry timer, and a Previous/Next bar lifted above
  the on-screen keyboard. The code boxes now use the existing `input-otp` component.
- **Behaviour (not restored, all of it fake):**
  - The old flow **never called Supabase**.
  - A `setTimeout(400)` checked the number against a hardcoded Set of two "registered" numbers,
    and a match "signed you in" with no session.
  - The code screen accepted any six digits, then went to role selection with no session.
  - It showed the timer for a code nothing had sent.
  - It fell back to a hardcoded phone number when opened directly.
  - Onboarding also had an OTP "Verify" modal that toasted "OTP sent" and ticked "Mobile
    verified" for any six digits; that stays removed. Onboarding's phone field remains a plain
    contact field.

**Flow now.**
- **Sign-in:** Login (number) → `sendOtp` → `/auth/otp-verify` → `verifyOtp` →
  `applyPendingSignupProfile` → route by `profiles`. Not onboarded goes to
  `/auth/role-selection`; seller goes to `/seller-home`; otherwise `/home/new-arrivals`.
- **Signup:** Register (role → name, brand, mobile) → `sendOtp(e164, { signupData })` → the same
  code screen. Not onboarded then goes seller → `/onboarding`, buyer → `/home/new-arrivals`, as
  Register did before.
- Open `/auth/otp-verify` with no navigation state → redirect to `/auth/login`.
- A plain send error (bad number, rate limit) stays on the entry screen.

**Consequences accepted with this change.**
- 376 accounts have an email identity and no Google identity: 370 `@cosora.test` fixtures, 5
  `@cosora.in`, 1 `@gmail.com`. They have no user-facing way in except Google with the same
  verified email.
- Three UI specs drive the removed email signup and fail as written: `mp4-phase1-register`,
  `mp5-phase4-confirmation-link` (P4.a) and `vendor-signup`. `mp4-phase2-callback-onboarding`
  signs in through the API and is unaffected.
- The dev-only switcher pill (fixed, bottom-left) overlaps the OTP screen's Previous button at
  phone width. It does not render in any build.
- **Until delivery is live, nobody can sign in or sign up by phone.** Google and guest browsing
  are the only working routes for real users.

**Verified 2026-09-22.** A browser run passed 43/43 checks against the dev server:
- V1: login surface.
- V2: Google hands off to accounts.google.com with `redirect_to=/auth/callback`; guest home
  renders; the demo switcher returns 200 and creates a session.
- V3: phone → code, honest on both the login and the signup path.
- V4: grep.
- V5: `tsc` 0 errors, the probe fires 1, and the build passes.

The verified-code → session step can only run once an SMS provider or the custom API exists.

## Domain Terms

| Term | Meaning |
|---|---|
| **RFQ** | Request for Quotation — a buyer's sourcing requirement post |
| **Quick RFQ** | Simplified RFQ (image + quantity), designed for <30 seconds |
| **Lead** | A buyer inquiry arriving in the vendor dashboard |
| **MOQ** | Minimum Order Quantity |
| **GSM** | Fabric weight (grams per square metre) |
| **TradeSEAL** | Cosora's paid vendor verification badge, purchased via the ad system |
| **Pan India** | Nationwide ad targeting across all of India |
| **UPI AutoPay** | Subscription payment method via India's UPI system |
| **Profile Score** | Vendor's profile completeness % — higher = better visibility |
| **Total Order Value** | Cumulative orders won through Cosora — strongest vendor retention metric |
| **Video Closeup** | A product video in the buyer feed. Never called a "Reel" |

## Architecture Snapshot

- **Repo**: `textile-spark-net` (`github.com/abhishekmitraaa/textile-spark-net`), ported
  from the Next.js source `cosorawork/client-cosora-vendor-frontend`.
- **Stack**: Vite + React 18 + TypeScript + shadcn-ui + Tailwind + React Router v6 +
  React Query + Framer Motion, on **Supabase** (Postgres/Auth/Storage/Edge Functions/
  Realtime), with **Razorpay** payments, deployed to **Vercel**.
- **Key folders**: `src/pages/` (route components), `src/components/` (`buyer/`,
  `dashboard/`, `layout/`, `ui/`, feature folders), `src/contexts/`, `src/hooks/`,
  `src/lib/` (`queries/` for Supabase access, `*Store.ts` for
  `useSyncExternalStore`-backed client state), `src/data/`, `supabase/migrations/`,
  `supabase/functions/`, `tests/` (Playwright), `scripts/` (verification scripts).
- **Routing**: every route is declared in `src/App.tsx`; `buyerShellRoutes` at the top of
  that file defines the buyer pages that use the `BuyerRouteShell` wrapper.
- **Dev server**: `localhost:8080` (non-standard). Path alias `@/*` → `src/*`.
- **Admin panel**: separate repo `Cosora-Admin`, same Supabase project.

Depth — schema, invariants, integrations, tech debt — lives in
`documentation/technicalimplementation.md`. Keep this snapshot current, not exhaustive.

## Pointers

- Full dated history: `documentation/changelog.md`
- Test data & results: `documentation/test.md`
- Technical depth: `documentation/technicalimplementation.md`
- Routes/pages: `documentation/sitemap.md`
- Buyer/Vendor/Admin feature detail: `documentation/sides.md`
- Security flags & gaps: `documentation/securityflags.md`
- Flags found and not fixed during the phased My Profile brief (2026-09-23 onward), and
  the decisions still open: `documentation/myprofileflags.md`. Fixed ones, and each phase's
  decision record: `documentation/myprofileflags-fixed.md`
- ToDo list: `documentation/ToDo.md`
- Razorpay runbook: `supabase/RAZORPAY.md`

## Documentation Protocol — follow every session, unprompted

1. At the start of a session, read ONLY this file for baseline context. Do not read the
   other `documentation/*.md` files unless the task at hand needs them.
2. The moment you decide, confirm, or discover a business rule or platform-level fact,
   add it to the sections above immediately — do not wait to be asked.
3. Before ending ANY turn in which you changed code, a decision, or a business rule —
   with no exceptions and without being asked:
     a. Append a dated entry to `documentation/changelog.md` (what changed, why, files touched).
     b. Update this file if the change affects business rules, architecture, or
        platform-level facts.
4. Whenever you write or run a test, update `documentation/test.md` with the test data
   used, what was checked, and the result.
5. Whenever you touch implementation details (schema, APIs, libraries, patterns,
   infra choices), update `documentation/technicalimplementation.md`.
6. Whenever a route/page/sub-page is added, renamed, or removed, update
   `documentation/sitemap.md`.
7. Whenever buyer-side, vendor-side, or admin-side features or flows change, update
   the matching section of `documentation/sides.md`.
8. Treat updating these files as PART OF finishing a task, not a separate step you
   might skip. A task is not done until its docs reflect it.
9. The moment you notice, suspect, or discover a security flag, vulnerability,
   misconfiguration, exposed secret, missing auth/permission check, unsafe input
   handling, insecure dependency, or any other security gap — whether in existing
   code you're reading, new code you're writing, a dependency, or infra/config —
   log it to `documentation/securityflags.md` immediately, in the same turn you find
   it. Do this even if:
     - the task you were asked to do is unrelated to security
     - you aren't asked to fix it, or don't fix it in this turn
     - you're not fully certain it's exploitable — log it as a suspected gap and
       note your uncertainty rather than staying silent
   Never paste the actual secret/credential/exploit value into the log — describe
   it and its location only, per the warning at the top of that file. If you do fix
   it in the same turn, also add the normal `changelog.md` entry and cross-reference
   it from the `securityflags.md` entry. Update the "Open Flags" table (add on
   discovery, move to Fixed/Accepted/Monitoring as status changes).
10. Whenever, during any session, you are asked to add something to the todo list —
    by any phrasing that clearly means "note this for later" (e.g. "add to todo",
    "todo:", "remind me to...", "let's do this later", "park this") — append a full
    entry to `documentation/ToDo.md` in that same turn, without asking the user to
    supply the context or reference themselves. Write:
      - Task: a clear, standalone description — someone reading only this line
        should understand what to do.
      - Context: capture what was being discussed or built when this came up, why
        it matters, and anything (a file, a decision, a dependency, a constraint)
        needed to act on it later without re-reading the original conversation.
      - Reference: the date and a short pointer to what this session was working
        on, so Andy can place it in time even without a clickable chat link.
    Keep it under "## Open". When a todo item is later completed, move its entry to
    "## Completed", add the completion date, and add a one-line note of how/where it
    was done if that's known — never just delete a finished item.

### How the automation actually works (`.claude/settings.json`)

- **`PreCompact` hook (agent)** — the only thing that *writes* these docs. It runs a
  review-and-update agent **before every compaction**, automatic or manual `/compact`.
  Tied to the compaction boundary, **not** literally "after each chat".
- **`UserPromptSubmit` hook (command)** — read-only; injects `documentation/claude.md`
  into context on every prompt (baseline only, per step 1 above — the 348 KB changelog is
  deliberately NOT injected). Never writes. It runs `powershell -NoProfile`, **not** `pwsh`:
  PowerShell 7 is not installed on this machine, so the pre-existing `pwsh` invocation was
  failing silently and no context was ever injected. It also needs `-Encoding UTF8` on
  `Get-Content`, or PS 5.1 reads the file as ANSI and mangles every em dash.
- **`Stop` hook (command)** — posts a reminder only; it does not update anything.
- `.github/copilot-instructions.md` is prose for GitHub Copilot; Claude Code does **not**
  execute it. Do not treat it as the hook source.

**What this means for you (the assistant):** the `PreCompact` agent is a safety net, not a
guarantee. A short session that never compacts won't trigger it, and agent hooks can fail to
fire. So the protocol above is yours to execute — do not assume a hook already did it.
