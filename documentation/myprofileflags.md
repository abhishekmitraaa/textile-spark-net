# My Profile work: flags

Open flags from the phased My Profile brief (Phase 0 ground-truth pass onward, started
2026-09-23): things **found and not fixed**, and the decisions still waiting on someone.
Each entry has what someone needs to pick it up later without the original conversation.

- Security flags are **also** logged in `securityflags.md`, per the documentation protocol.
  This file carries more context and cross-references that entry. It doesn't replace it.
- **This file holds only what is open** (Mitra, 2026-09-24). When a flag is fixed, move its
  row and its section to `myprofileflags-fixed.md`, with Status `Fixed YYYY-MM-DD`, the fix
  and how it was verified. Don't delete it. Each phase's record of the decisions it made goes
  there too.
- IDs are never reused. MPF-1, 2, 3, 5, 6, 7, 8, 9, 11, 13, 19 and 20 are fixed and in
  `myprofileflags-fixed.md`.

### Status at a glance (2026-09-25, after the Phase 26 regression pass)

| Status | IDs | Where |
|---|---|---|
| **Fixed**, and re-confirmed live together in Phase 26 | MPF-1, 2, 3, 5, 6, 7, 8, 9, 11, 13, 19, 20 | `myprofileflags-fixed.md` |
| **Open, logged to `ToDo.md` by design** (Phase 25): not being fixed in this pass | MPF-4, 10, 14, 15 | Below, and their `ToDo.md` entries |
| **Open by decision:** Andy's FAQ wording, published verbatim | MPF-16, 17 | Below |
| **Open** | MPF-12, 18, 22, 23, 24, 25, 26, 27 | Below |
| **Open, parked:** never deploy as it is | MPF-21 | Below |

MPF-6 is fixed, but its WhatsApp send can't be verified until Meta is set up, which is
MPF-24. Phase 26 found no open flag fixed, and none newly broken.

## Open decisions

Waiting on Mitra unless marked otherwise. Each points to where the detail lives.

1. **The analytics my Phase 19 test runs wrote** (2026-09-24). Before it was fixed, the
   link check opened product pages signed in as demo-buyer, twice, between 22:06 and 22:11
   UTC. That wrote:
   - 14 `product_view` and 140 `ad_impression` events;
   - `products.views_count` +2 on each of 7 products;
   - `advertisements.impressions` up to +140;
   - one extra recently-viewed row for demo-buyer, and 7 refreshed `viewed_at` values.

   **Options:** delete the 154 events and take `views_count` back by exactly 2 on each of the
   7 products, or leave it all. The ad impression counters and the recently-viewed changes
   can't be restored exactly: `ad_impression()` is frequency-capped, and the extra row can't
   be told apart. Detail: `test.md`, the Phase 19 entry.
2. **Merge and deploy Phases 14–26.**
   - Committed and pushed on 2026-09-25 (Phase 26): the buyer app on branch
     `my-profile/phase-14` and Cosora-Admin on `my-profile/phase-15`. Neither is merged to
     `main` or deployed.
   - Already live without an app deploy: Phase 16's database changes and sweep function,
     Phase 18's migration and `account-deletion` v2, Phase 20's `fx_rates`,
     `fx-rates-refresh` and its cron job, Phase 22's migration, Phase 23's migration,
     `faqs-snapshot` and its cron job, and Phase 24's migration (which changed no live row).
   - Until the buyer app is deployed, the live Subscription page's "Contact us" still opens
     `/help`; the code now writes to hello@cosora.in (Phase 24).
   - Until the buyer app is deployed, the live site still reads FAQs from the table: the
     CDN snapshots are built and kept current, but nothing live reads them yet (Phase 23).
   - Until Cosora-Admin is deployed, the database lets support write FAQs but the live panel
     still shows support the read-only view (Phase 22).
   - Until the app is deployed, the live app shows "Something went wrong" for `no_contact`
     (3 accounts).
   - Never commit `supabase/functions/otp-dev-verify/` or `.claude/tmp/`.
3. **Email delivery for deletion codes (MPF-4).** A Resend key and a verified sending domain.
   Owner setup, not code.
4. **WhatsApp delivery for deletion codes (MPF-24).** A Meta Business account, a sender
   number, an approved template and two secrets. Also: whether deletion codes stay on Meta's
   Cloud API or move to the in-house messaging service when it lands (`ToDo.md`, the
   messaging-service entry).
5. **A vendor can set their own quote to "accepted" (MPF-18).** The fix shape. Then, once it
   is fixed, whether `call_buyer_contact()` should require an accepted quote. Today any quote
   counts, which was Phase 11 decision 2 in `myprofileflags-fixed.md`.
6. **Narrow the admin email lookups?** `admin_profile_search()` and `admin_profile_emails()`
   admit any active admin, which keeps the access every admin role had before MPF-3.
   Narrowing them to support and super_admin would take emails off Accounts and Chats for
   product, ads, vendor-ops and finance admins (Phase 11).
7. **Seller accounts with no completed registration (MPF-22).** 10 accounts go to
   `/onboarding` when they switch back to Seller. Either complete `/onboarding` for them,
   which also writes the signed contract, or leave them.
8. **Where vendors get support (MPF-15).** A vendor Help page (a `seller_help` FAQ surface,
   so a migration), or honest copy on `/help` for vendors. Since Phase 24 the Subscription
   page's "Contact us" writes to hello@cosora.in; the sidebars' "Help & Support" still opens
   the buyer page.
9. **The FAQ answers that don't match the product (MPF-14, MPF-16, MPF-17), for Andy.**
   Edit the wording in Cosora-Admin `/faqs` (no deploy), or let the product catch up.
   MPF-17 also needs the Terms to state the 7-day guarantee, and a working refund path
   (Razorpay keys or a manual process).
10. **Redeploy the three subscription payment functions (MPF-25).** The deployed versions
    are older than the repo, and `subscription-create-order` lacks the `intent_failed` guard.
    A redeploy also ships the Phase 20 GST extraction, which changes no amount (`gst-check`,
    and the old-vs-new harness). Diff each deployed source against the repo first.
11. **An edit history for FAQs (MPF-26)?** Since Phase 22, support edits FAQs as well as
    super_admin, and an edit or a delete leaves no record of who made it or what the text
    was before.

Resolved decisions are recorded in `myprofileflags-fixed.md`, under each phase's
"decisions" heading:
- Phase 9 Q3 (support writes FAQs): Phase 22;
- Phase 9 Q2 (the FAQ read path at 10k users, with the measurements): Phase 23;
- Phase 9 Q4 (the seeded FAQ content and the answer used): Phase 24;
- how the regression pass ran: Phase 26.

---

## Open flags

| ID | Found | Title | Type | Severity | Status |
|---|---|---|---|---|---|
| MPF-4 | 2026-09-23, Phase 2 | Deletion emails can't go out yet: no `RESEND_API_KEY`, and no verified sending domain | Setup (blocks the feature for real users) | High for the feature | Open, waiting on setup |
| MPF-10 | 2026-09-23, Phase 4 | The fake email "Verify" is gone; nothing verifies a profile email | Product gap (was fabricated UI) | Low | Open, removed rather than carried over |
| MPF-12 | 2026-09-23, Phase 7 | Vendor Settings' notification switches, and the "Notifications: On" label on `/profile`, still imply live delivery | Overclaiming UI | Low | Open |
| MPF-14 | 2026-09-23, Phase 9 | The seeded buyer Help FAQs promise features that don't exist | Overclaiming content (pre-existing, moved verbatim) | Medium (buyers are told about escrow and refunds that don't exist) | Open, now editable with no deploy |
| MPF-15 | 2026-09-23, Phase 9 | Vendors have no real support destination; vendor Help is the buyer page and its chat is canned | Product gap (pre-existing) | Medium | Open, a decision |
| MPF-16 | 2026-09-23, Phase 9 content | Andy's Seller Registration and Subscription FAQs promise things the product doesn't do (published verbatim by decision) | Overclaiming content | Medium (vendors are told about proration, alerts and documents that don't match) | Open, by decision |
| MPF-17 | 2026-09-23, Phase 9 content | The Subscription FAQ promises a 7-day money-back guarantee; the Terms say fees are non-refundable, and no refund can run today | Policy conflict | Medium (a public financial promise the Terms contradict) | Open, published by decision |
| MPF-18 | 2026-09-23, Phase 11 | A vendor can set their own quote to "accepted" | Security (data integrity) | Low | Open, proven (rolled back) |
| MPF-21 | 2026-09-24, Phase 17 (automated security review) | `otp-dev-verify` is a sign-in bypass, and it is on by default | Security (authentication bypass, parked) | Critical if deployed; nil today (not deployed, never committed) | Open, parked: never deploy it as it is |
| MPF-22 | 2026-09-24, Phase 17 | 10 seller-role accounts have no completed vendor registration on file, so switching back to Seller sends them to `/onboarding` | Data / product gap | Low (demo and seeded accounts today) | Open, a consequence of the Phase 17 decision |
| MPF-23 | 2026-09-24, Phase 16 | `log_engagement_event()` swallows every error, so a rejected event disappears with no trace | Correctness (analytics observability) | Low | Open |
| MPF-24 | 2026-09-24, Phase 18 | WhatsApp deletion codes can't go out yet: no Meta Business account, sender number or approved template | Setup (blocks the channel for phone-only accounts) | High for phone-only accounts once real sign-ups start; nil today | Open, waiting on setup |
| MPF-25 | 2026-09-24, Phase 20 | The deployed subscription payment functions are older than the repo: `subscription-create-order` lacks the 26 Jul `intent_failed` guard | Security (payment integrity), deploy drift | Medium once Razorpay is live; nil today (demo mode) | Open, a decision: redeploy |
| MPF-26 | 2026-09-24, Phase 22 | FAQ edits and deletes leave no record of who made them or what the text was | Audit (admin accountability) | Low: public text, and only support and super_admin can edit | Open, a decision: build a history, or accept |
| MPF-27 | 2026-09-24, Phase 23 | The `fx-rates-refresh` and `account-deletion-sweep` cron jobs would record success while doing nothing if the Vault key went missing | Reliability (the deletion sweep: a privacy promise) | Low: the key is present today | Open: make both raise, as `faq-snapshots-refresh` does |

---

## MPF-4: Deletion emails can't go out yet

- **Where:** the edge function `account-deletion` (deployed as v1), and its secrets
  `RESEND_API_KEY` (required) and `RESEND_FROM` (optional).
- **State on 2026-09-23:** `{action:"status"}` returns `{"configured":false}`. Until the key
  is set:
  - `request` answers `not_configured` and mints nothing (verified: 0 request rows);
  - the dialog says deletion isn't available online yet and points to hello@cosora.in
    (screenshot `account-deletion-not-configured.png`).
- **Two setup steps, both for the owner:**
  1. **Create a Resend account and add `RESEND_API_KEY`** as an edge-function secret, in the
     Supabase dashboard → Edge Functions → Secrets. It takes effect without a redeploy.
  2. **Verify a sending domain** (for example `cosora.in`) in Resend, and set `RESEND_FROM`
     to an address on it (for example `Cosora <no-reply@cosora.in>`). Without this, Resend's
     shared `onboarding@resend.dev` sender delivers **only to the Resend account owner's
     own address**, and every other buyer gets `send_failed`.
- **What is verified and what isn't:**
  - Verified end to end with a throwaway buyer: everything after the email, with the code
    issued through SQL in place of the email. That covers code entry, a wrong code, the
    banner, cancel, schedule, the sweep and anonymization.
  - **Not yet verified:** a real email arriving through Resend.
- **Verify by:** with the key set, sign in as a buyer whose confirmed email you can read,
  request a code, check it arrives, and enter it. Then check the request reads `cooling_off`
  and cancel it.
- **Logged to `ToDo.md` (2026-09-25, Phase 25):** "Set up Resend so account-deletion codes
  can go out by email (MPF-4)". Still open, because logging it doesn't fix it. When that entry
  was written, `account-deletion` was deployed as v2 (Phase 18), and the two steps above
  still applied.

---

## MPF-10: The fake email "Verify" is gone; nothing verifies a profile email

- **What was there:** the modal's Personal tab.
  - "Verify" toasted "Verification code sent" and sent nothing.
  - Any 4+ digit code then showed "Email verified".
  - The "Verified" badge appeared for **any** stored email, because `emailVerified` is
    `Boolean(p.email)` in `profile.ts`.
- **What Phase 4 did:** `/profile/edit` shows email as a plain field. This project removes a
  status nobody earned (see claude.md, "Business Rules — Discovered"), and moving it to a
  new, deep-linkable page would have spread it further.
- **Not built:** real verification. Phase 0 marked `email_verified` out of scope, and no
  column exists. `profiles.email` is a free-text contact field and has **nothing to do
  with sign-in**.
  - **Sign-in is mobile number + OTP only, and stays that way.** The OTP is a dummy for now
    (Mitra's instruction, 2026-09-23). Nothing here may change or add a sign-in method.
  - Phase 2's deletion codes go to `auth.users.email` (the account's own email, not this
    field), and never act as a sign-in.
- **Fix, if wanted:** verify `profiles.email` with an emailed code through the Phase 2
  Resend path, store the result in a real column, and only then show a badge. That is
  contact verification, not a sign-in method.
- **Logged to `ToDo.md` (2026-09-25, Phase 25):** "Decide whether to build real verification
  for the profile email (MPF-10)". Still open, because logging it doesn't fix it. When that
  entry was written, `emailVerified` in `profile.ts` was still `Boolean(contact.email)`, and no
  page rendered it.

---

## MPF-12: Vendor Settings' notification switches, and the "Notifications: On" label on `/profile`, still imply live delivery

- **Context:** Phase 7 made `/profile/notifications` honest. Its switches are saved
  preferences only, and nothing sends email or push from them. Two surfaces outside that
  page's scope carry the same overclaim.
- **Vendor Settings** (`src/pages/VendorSettings.tsx`, `EMAIL_ROWS` / `PUSH_ROWS`):
  - Eight switches saved to `vendor_profiles.notifications` ("When a buyer posts a
    requirement in your categories", "When a buyer messages you", …).
  - Nothing reads them. The in-app bell (`notify()`) is fed only by moderation, account, ad
    and certificate events. So a vendor who turns on "New requirements (RFQs)" gets nothing,
    anywhere.
- **The `/profile` row** "Notifications · On/Off" (`Profile.tsx`) is derived from the saved
  switches. "On" reads as "you are receiving notifications".
- **Why not changed in Phase 7:** the brief scoped the fix to the buyer profile's
  notifications page, and the vendor app is a different surface.
- **Fix:**
  - Vendor Settings: the same pattern as `ProfileNotifications.tsx` (a `DELIVERY_LIVE` flag,
    an amber note, "saved for when it launches" subtitles, event-worded descriptions).
  - The `/profile` row: show "Saved" or nothing instead of "On", until delivery exists.
- **Related:** building real delivery is its own master prompt. See the Phase 7 changelog
  entry for what it would take.

---

## MPF-14: The seeded buyer Help FAQs promise features that don't exist

- **Where:** `public.faqs`, surface `buyer_help`, seeded by
  `20260923144549_faqs_admin_editable.sql`. Shown on `/profile/help` and `/help`. Until
  Phase 9 this text was the hardcoded `faqCategories` in `src/pages/Help.tsx`, and Phase 9
  moved it over verbatim.
- **What:** answers that describe things the product doesn't have. Each claim was checked by
  searching `src/` and `supabase/migrations/`, and the only match is the seed itself.

  | Question | Claim | Reality |
  |---|---|---|
  | How do I track my order status? | Track it "under 'Active Orders'", with "notifications at each stage — from production to shipping to delivery" | No orders route or table (`sitemap.md`, "Routes that do NOT exist"). No quote, message or RFQ event notifies anyone (Phase 7) |
  | What payment methods are accepted? | "escrow payments for larger orders" | No escrow anywhere |
  | Is my payment secure? | "escrow services where payment is released to the vendor only after you confirm…" | Same: no escrow |
  | Can I get a refund if there's an issue with my order? | "Our buyer protection policy covers quality issues and non-delivery… within 7 days" | No buyer-protection policy and no refund flow for buyer orders |
  | How do I update my business profile? | Edit company info, contact details, "shipping addresses" and notification preferences | No shipping addresses. Editing is `/profile/edit` and `/profile/business-details` (Phase 4) |
  | Can I have multiple team members on one account? | "Settings > Team Management… permission levels" | No team accounts; one login per account |
  | How do I change my notification settings? | Choose updates "via email, SMS, or push notifications" | Saved preferences only. Nothing is sent by email, SMS or push (Phase 7) |

- **How it came up:** Phase 9 moved the text as-is, and reading it row by row to seed the
  table surfaced the claims.
- **Why not fixed:** rewriting what the product promises is a content decision, not a code
  one, and the brief moved the content unchanged. It's now a no-deploy fix.
- **Fix shape:** a super_admin rewrites or deactivates the rows above in Cosora-Admin
  `/faqs`, then checks the page signed out. `tests/faqs-admin-editable.spec.ts` asserts
  "12 questions across 4 topics", so update that line if the count changes.
- **Logged to `ToDo.md` (2026-09-25, Phase 25):** "Fix the buyer Help FAQ answers that
  describe features Cosora doesn't have (MPF-14)", with the 7 questions listed. Still open,
  because logging it doesn't fix it. When that entry was written, all 7 rows were live and
  active, still making their claims, and the page showed 12 questions in 4 topics.

---

## MPF-15: Vendors have no real support destination

- **Where:**
  - Vendor Settings → "Help Center" (`VendorSettings.tsx`, → `/help`);
  - both sidebars' "Help & Support" (`DashboardSidebar.tsx`, → `/help`);
  - `/help` renders the same `Help.tsx` as `/profile/help`.
- **What:**
  - A vendor asking for help lands on buyer content: the `buyer_help` FAQ (RFQs, quotes
    received, paying vendors), and a Delete account card that sends vendors to support.
  - The page's chat (`SupportChat`, `/profile/help/chat`) answers from a `CANNED` array on
    a timer. It has no Supabase call, so nothing reaches anyone. The same is true for
    buyers.
  - The only real channel is email to `hello@cosora.in`, the address on `VendorLanding.tsx`
    ("For support, write to…"), `Help.tsx` and `About.tsx`.
- **How it came up:** Phase 9 item 6 asked to confirm the vendor support destination before
  wiring the Subscription FAQ's "Contact us", and not to assume `/profile/help` works for a
  vendor. It doesn't, so the button is
  `mailto:hello@cosora.in?subject=Subscription%20question`.
- **Why not fixed:** outside Phase 9. The brief left Help's fake Contact Us chat untouched in
  this phase.
- **Fix shape:** a decision first. Either:
  - a vendor Help page: a `seller_help` surface drops straight into `faqs` and
    `<FaqSection>`, but it's a new check-constraint value, so a migration; or
  - honest copy on `/help` for vendors.

  Separately, the canned chat should be labelled as such or removed, on both sides.
- **Update (2026-09-23, Phase 9 content):** Andy's content asks for the Subscription FAQ's
  "Contact us" to open the Help page, so it now goes to `/help`, the buyer page this flag
  describes. A vendor who taps it gets buyer FAQs, a canned chat, and one real channel: the
  hello@cosora.in email link.
- **Update (2026-09-25, Phase 24):** Mitra chose the real inbox. The Subscription FAQ's
  "Contact us" is `mailto:hello@cosora.in?subject=Subscription%20question` again, overriding
  Andy's "take them to the Help page". The rest of this flag stands: the sidebars' "Help &
  Support" still opens the buyer Help page, and its chat is still canned.
- **Logged to `ToDo.md` (2026-09-25, Phase 25):** "Give vendors a real support destination,
  and stop the canned chats posing as live support (MPF-15)". Still open, because logging it
  doesn't fix it.
  - **Correction found while writing it:** there are two canned chats, not one. `/help`
    and `/profile/help` open `ChatModal` in `Help.tsx` ("Chat with us", "Start Live Chat").
    It shows a 2-second "typing" indicator and never replies. `SupportChat`
    (`/profile/help/chat`, from `/profile`'s "Chat with Us") is the one with the `CANNED`
    replies.
  - Both present an invented agent, "Abdul". The chat fix covers both.
  - `ChatModal` also lacks the chat-monitoring disclosure that `claude.md` requires in every
    chat flow; `SupportChat` has it. Add it if that chat stays.

---

## MPF-16: Andy's Seller Registration and Subscription FAQs promise things the product doesn't do

- **Where:** `public.faqs`, surfaces `seller_registration` (shown on `/seller`) and
  `subscription` (shown on `/subscription`). Loaded 2026-09-23 from Andy's content
  (`documentation/seller-registration-and-subscription-faq-content.md`).
- **Decision:** Mitra chose to publish the answers **verbatim** (2026-09-23), rather than as
  corrected versions, and to log each mismatch here. Each claim was checked against the code
  and the live data before publishing:

  | Answer (surface) | Claim | Reality (checked 2026-09-23) |
  |---|---|---|
  | Can I upgrade or downgrade my plan anytime? (subscription) | "the difference will be prorated" | No proration anywhere. `activateSubscription()` in `subscription-verify-payment` charges the plan's full price and starts a fresh period at the moment of payment |
  | same | "Downgrades will take effect from your next billing cycle" | A lower plan is bought like any other: it starts immediately and replaces the current one. The page enables every plan except the current one and Free |
  | What happens when I reach my lead limit? (subscription) | "You'll receive notifications as you approach your limit" | Nothing sends a notification about the limit. `/leads` shows "N/cap leads used", and quoting at the cap is refused with an upgrade prompt |
  | How are leads managed on Cosora? (seller) | Notified "via dashboard, email, or WhatsApp" | No email or WhatsApp is sent, and no in-app notification fires for new RFQs (Phase 7). Leads appear on `/leads` |
  | What documents are required to register? (seller) | GST, PAN, business registration (or MSME/Udyam), Aadhaar, product catalog | Onboarding requires only PAN; GST and CIN are optional. KYC collects PAN, GST and CIN (`COLLECTED_DOC_TYPES` in `Kyc.tsx`). Aadhaar is deliberately not collected, and there's no MSME/Udyam document type. Catalogues have their own upload page (`UploadCatalogue.tsx`) |
  | I don't have a GST number… (seller) | Marked "Unverified Seller", which "may affect visibility and lead access" | There's no such label. Searching the SQL and the app found no ranking or lead-access gate on `is_verified`. GST is optional at registration |
  | Is there any cost to register? (seller) | "Basic registration is free… pay for Premium listings, Pay-per-lead access, Featured vendor badges" | Registration is free (the **Free** plan), but "Basic" is the name of a ₹699/month plan on the Subscription page. Pay-per-lead doesn't exist; Andy's own lead answer calls it future |

- **Holds up:**
  - what Cosora is, and who can register;
  - buyers call or chat;
  - verification time (now 3–5 days across the app);
  - no shipping through Cosora;
  - the annual discount: yearly is 10× monthly, about 16.7%, so "up to 17%" and "2 months
    free" are right;
  - editing listings, though the answer doesn't mention that an edit sends a live listing
    back to review, hidden from buyers until re-approved.
- **Fix shape:** Andy edits the wording in Cosora-Admin `/faqs` (no deploy), or the product
  catches up. Each row is independent.

---

## MPF-17: The Subscription FAQ promises a 7-day money-back guarantee that the Terms contradict

- **Where:** the `public.faqs` subscription row "Is there a refund policy?", on
  `/subscription`: "We offer a 7-day money-back guarantee for first-time subscribers."
- **Conflicts:**
  - `TermsConditions.tsx` says "Fees are non-refundable unless stated otherwise."
  - No refund can run today. Cosora-Admin's `admin-refund-payment` exists, but its README
    records that refunds can't execute on this project because the Razorpay keys aren't set.
  - Nothing tracks "first-time subscriber" or the 7-day window.
- **Decision:** Mitra chose to publish it as written (2026-09-23).
- **Risk:** it's a public financial promise. A vendor who asks for a refund needs manual
  handling outside the app, and the Terms say the opposite.
- **Fix shape:**
  - update the Terms to state the guarantee, so "unless stated otherwise" is explicit in the
    Terms themselves;
  - then either set the Razorpay keys so `admin-refund-payment` works, or define the manual
    process support follows.

---

## MPF-18: A vendor can set their own quote to "accepted"

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-23, Low).
- **Where:** `quotes_update` on `public.quotes`. It is
  `vendor_id = auth.uid() OR owns_rfq(rfq_id) OR is_admin()` for both USING and WITH CHECK, and
  no trigger guards `status`. The two quote triggers watch `rfq_id`/`vendor_id` and the lead
  cap.
- **Evidence (2026-09-23):** a `DO` block as `authenticated`, under demo-vendor's claims,
  updated its own pending quote to `accepted` (1 row), then raised to roll back.
- **Impact:**
  - a buyer's quote list can show a quote as accepted that they never accepted;
  - the vendor's acceptance rate and Total Order Value (Analytics and the Quotes page) count
    it;
  - nothing is exposed: `call_buyer_contact()` ignores quote status on purpose.
- **How it came up:** Phase 11. "Call Buyer" only renders on accepted quotes, so "accepted"
  looked like the natural server rule. The probe showed that it would add nothing over "has
  quoted".
- **Recommended fix:** a BEFORE UPDATE trigger that lets only the RFQ owner, or an admin,
  change `status`, and lets the vendor change only the quote's own terms. After that,
  `call_buyer_contact()` can require `accepted`, if that's the intended rule.
- **Verify by:** as demo-vendor, the self-accept is refused. As demo-buyer, accept, shortlist
  and reject still work (the `setQuoteStatusDb()` path).

---

## MPF-21: `otp-dev-verify` is a sign-in bypass, and it is on by default

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-24).
- **Where:** `supabase/functions/otp-dev-verify/index.ts`, untracked on purpose: never
  committed and never deployed. It was not among the project's 16 deployed edge functions on
  2026-09-24 (`list_edge_functions`). Tracked in `ToDo.md`, "Wire up mobile OTP delivery".
- **What:** a stand-in for SMS delivery. It accepts any 6 digits for any phone number, creates
  the account with the service-role key when the number is new, and hands back a session.
  - `const ENABLED = true`: it is on unless `OTP_DEV_BYPASS=off` is set. Deploying it without
    that secret switches the bypass on.
  - CORS is `*`, and there is no allowlist, secret header or environment check.
  - It still reads `profiles.is_admin` to refuse admin numbers. That column was dropped on
    2026-09-22, so the check would now error.
- **How it came up:** the automated security review flagged it as a critical authentication
  bypass on 2026-09-24. It was already known as unsafe to deploy (ToDo), but it had no flag.
- **Why not fixed:** it is sign-in code, and sign-in stays as it is (Mitra). Its only
  protection is staying undeployed.
- **Fix, before it is ever deployed anywhere:**
  - off by default, requiring an explicit `OTP_DEV_BYPASS=on`;
  - refuse the production project ref;
  - a hardcoded allowlist of dev numbers;
  - a shared-secret header only the dev harness knows;
  - CORS limited to the dev app's origin;
  - rewrite the admin check to use `admin_status_of()`.

  Better: delete it once real SMS delivery works.

---

## MPF-22: Seller-role accounts with no completed registration go to `/onboarding` when switching back

- **Where:** `profiles.active_role` against `vendor_profiles.onboarding_complete`, read by
  `UserRoleContext` since Phase 17.
- **What:** Phase 17 made `vendorRegistered` come from `onboarding_complete` alone, by
  Mitra's decision. 10 seller-role accounts have no completed registration on file:
  - 6 with a vendor row whose `onboarding_complete` is false, because they were seeded rather
    than onboarded: demo-vendor (`22222222…`) and `a0000001…` to `a0000005…`;
  - 4 with no vendor row at all: `2ff76479…`, `33333333…` (demo-admin), `bfbaf9d0…` and
    `f2b28c34…`.

  They load on the seller side (their `active_role`) and use it normally. But after switching
  to Buyer, the Seller switch sends them to `/onboarding`. Before Phase 17,
  `active_role = 'seller'` counted as registered. Verified for demo-vendor in
  `tests/role-on-load.spec.ts`.
- **Same shape, going forward:** a new user who picks Seller in role selection and leaves
  `/onboarding` part-way has `active_role = 'seller'` with no vendor profile. After a reload
  they are on the seller side.
- **Fix, if wanted:** complete `/onboarding` for those accounts. That writes the signed
  contract too, which keeps "a completed vendor has a contract on file" true. Setting
  `onboarding_complete = true` directly would not.

---

## MPF-23: `log_engagement_event()` swallows every error

- **Where:** `public.log_engagement_event()`, which ends in
  `exception when others then return;`.
- **What:** any failed insert returns success with nothing written. Found in Phase 16: an
  event whose `source` was not in `engagement_events_source_check` recorded nothing and
  returned OK. A new client sending a wrong event type or source would under-count vendors'
  views and clicks, with no error anywhere.
- **Fix, if wanted:** narrow the handler to the failures that are expected, or log the
  failure somewhere an admin can see it, instead of swallowing everything.

---

## MPF-24: WhatsApp deletion codes can't go out yet

- **Where:** the edge function `account-deletion` (v2), and its secrets
  `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (both required), plus optional
  `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` and `WHATSAPP_API_VERSION`.
- **State on 2026-09-24:** `{action:"status"}` returns
  `{"configured":{"email":false,"whatsapp":false}}`. A phone-only account's request answers
  `not_configured` for WhatsApp and mints nothing (verified live: 0 request rows).
- **Why it is a setup dependency, not code:**
  - WhatsApp doesn't allow free-form messages from a business, so the code has to go out as
    a Meta-approved template, and approval can take 1–2 business days.
  - The repo recorded on 2026-09-12 that this project has none of it: no Meta Business
    account, no verified sender, no templates (`src/lib/messaging.ts`, `ToDo.md`). Mitra's
    stated direction then was an in-house messaging service rather than Meta's API.
  - Phase 18 stopped on that, and the decision was to build the Meta branch now and leave it
    dormant.
- **Setup steps, all for the owner:**
  1. A Meta Business account with a WhatsApp Business account and a verified sender number.
  2. An **AUTHENTICATION**-category template with a **copy-code** button:
     - named `account_deletion_code` in English (`en`), or set `WHATSAPP_TEMPLATE` /
       `WHATSAPP_TEMPLATE_LANG` to match;
     - with the security recommendation on (`add_security_recommendation`) and a 10-minute
       expiry (`code_expiration_minutes: 10`).

     Meta fixes the body text as "<code> is your verification code." It can't say
     "deletion" (see securityflags, 2026-09-24).
  3. A system-user access token with `whatsapp_business_messaging` permission, set as
     `WHATSAPP_ACCESS_TOKEN`.
  4. The sender's **phone number id** (not the number) as `WHATSAPP_PHONE_NUMBER_ID`.

  Secrets are set in Supabase → Edge Functions → Secrets, and take effect without a redeploy.
- **What "sent" means:** Meta accepted the message, not that it was delivered. A number
  that isn't on WhatsApp is reported only later, through a webhook this project doesn't
  have.
  - So the user sees "We've sent a code to your WhatsApp number", and it never arrives.
  - "Send a new code" goes the same way. The way out is support.
  - A delivery webhook would fix that, if it matters.
- **Cost:** Meta charges per authentication message. Each request allows 5 codes, 60 s apart,
  and only to the account's own number.
- **Verify by:**
  1. With the secrets set, sign in as a phone-only account whose WhatsApp you can read.
  2. Request a code, check it arrives, and enter it.
  3. Check the request reads `cooling_off` with `channel = 'whatsapp'`, then cancel it.

---

## MPF-25: The deployed subscription payment functions are older than the repo

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-24).
- **Where:** `subscription-create-order` (deployed v3, 16 Jul 2026),
  `subscription-verify-payment` (v4, 16 Jul) and `subscription-webhook` (v3, 16 Jul).
- **What:**
  - The repo's `subscription-create-order` gained an `intent_failed` guard on 26 Jul (commit
    `0fc15f6`, "rzr pay setup"). If recording the payment intent in
    `subscription_payment_orders` fails, it stops before Razorpay Checkout opens.
  - The deployed v3 predates it. Its source records the intent without checking the result.
  - Without the guard, a failed intent write still lets the vendor pay. The payment then hits
    `activateFromOrder`'s "already paid / unknown" branch, which returns ok without
    activating: the vendor is charged and stays on the old plan (the repo comment's words).
  - `-verify-payment` and `-webhook` were first committed on 17 Jul, the day after their
    deploy. Whether their deployed code matches the repo wasn't proven.
  - The same drift was found and fixed for `razorpay-create-order` on 2026-09-14
    (securityflags); the subscription copy was missed.
- **Reachable today?** No. `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are unset, so
  `subscription-create-order` answers `not_configured` and the app uses its simulated
  checkout. It matters the day payments go live.
- **How it came up:** Phase 20 extracted GST into `_shared/gst.ts` and refactored all three
  functions to import it. Before redeploying, it checked the deploy dates: each repo file
  changed after its last deploy.
- **Why not redeployed in Phase 20:** a redeploy ships everything in the repo, including this
  guard and anything else that differs, into the payment path. That's a decision, not a side
  effect of a GST refactor.
- **Fix:** diff each deployed source against the repo, then redeploy all three with
  `supabase/functions/_shared/gst.ts`. `node scripts/gst-check.mjs` and Phase 20's old-vs-new
  harness show the GST part changes no amount.

---

## MPF-26: FAQ edits and deletes leave no record of who made them or what the text was

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-24).
- **Where:** `public.faqs`, and `admin_faq_update`, `_delete` and `_reorder`.
- **What:**
  - `created_by` records who **added** a row, and nothing else does any recording. An edit
    overwrites `question` / `answer` / `active` and sets `updated_at`, a delete removes the row,
    and there is no history table.
  - The only admin audit table in the project is `admin.ad_review_log`, which is for ads.
  - So if an answer on the public Help, Subscription or seller page is changed or removed,
    nobody can tell who did it or what it said before.
  - Cosora-Admin's FAQ table shows the **creator's** name under the "Updated" date, which reads
    as the last editor.
- **Why now:** Phase 22 (migration `20260924170736`) let support write FAQs as well as
  super_admin, by design. Before it, only the 3 super_admin accounts could change the text.
- **Not exploitable from outside:** every write needs an active support or super_admin
  admin, and clients have no write grant on the table.
- **Fix shape:** a `faq_revisions` table written by the `admin_faq_*` functions themselves
  (who, when, the old and new text), read through an admin function. Or, at least, an
  `updated_by` column. Then the page shows the last editor, not the creator.
- **Not built in Phase 22:** the brief was the gate change only.

---

## MPF-27: Two cron jobs would succeed silently without the Vault key

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-24).
- **Where:** pg_cron `fx-rates-refresh` (Phase 20, `20260924161525`) and
  `account-deletion-sweep` (Phase 16).
- **What:** both are `select net.http_post(...) where exists (<Vault service_role_key>)`. If
  the secret were deleted or renamed, the WHERE would be false, nothing would be sent, and
  `cron.job_run_details` would record `succeeded` every run. That is the failure
  `claude.md` describes for the embedding worker (3,960 silent "successful" runs).
- **Impact if it happened:** FX rates stop refreshing (the rate line shows its date, so it
  is visible). More seriously, accounts past their 14-day cooling-off are not anonymized,
  and nobody is told.
- **How it came up:** Phase 23's `faq-snapshots-refresh` was written to raise instead, and
  reading the two older jobs for their pattern showed the difference.
- **Fix shape:** a `do` block that raises when the key is missing, as
  `faq-snapshots-refresh` does. For the sweep, "nothing is due" must stay a quiet success;
  only a missing key raises.
- **Not fixed in Phase 23:** outside the brief.
