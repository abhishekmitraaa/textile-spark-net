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
- **A flag Mitra says to leave alone moves to `ToDo.md`** (2026-09-25), with its full record,
  and is listed below so its ID still resolves.
- IDs are never reused.

### Status at a glance (2026-09-25, after the flag-fix pass)

| Status | IDs | Where |
|---|---|---|
| **Fixed** | MPF-1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 18, 19, 20, 22, 23, 25, 26, 27 | `myprofileflags-fixed.md` |
| **Moved to `ToDo.md`**, left as they are on Mitra's instruction | MPF-4, 10, 14, 15, 16, 17, 21, 24 | `ToDo.md` (table below) |
| **Open** | none | |

MPF-6 is fixed, but its WhatsApp send can't be verified until Meta is set up, which is
MPF-24, now in `ToDo.md`.

## Open decisions

Waiting on Mitra unless marked otherwise.

1. **Analytics my test runs wrote to production: Phase 19's, and the flag-fix pass's.**

   **Phase 19** (2026-09-24). Before it was fixed, the
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

   **The flag-fix pass** (2026-09-25, 19:20–19:30 UTC). Its regression run wrote:
   - 58 events: 56 `ad_impression` and 2 `product_view`. Of those, 27 impressions were
     from demo-vendor through the new `role-on-load` test, and 1 view plus 10
     impressions from demo-buyer and 1 view plus 19 signed out, through
     `profile-contact-privacy`'s page sweep;
   - `products.views_count` +2 and `advertisements.impressions` +61;
   - one refreshed `viewed_at` in demo-buyer's recently viewed.

   Both specs now answer the tracking calls in the browser, and a re-run moved nothing.
   The same options apply: delete the 58 events (all dated 2026-09-25 19:20–19:30 UTC
   from those three viewers) and take `views_count` back by 2, or leave it. The ad
   counter can't be put back exactly. Detail: `test.md`, the flag-fix pass entry.
2. **CI runs the whole test suite against production on every push to `main`.**
   - `.github/workflows/e2e.yml` builds the buyer app and runs every Playwright spec against
     the live project, with the demo logins from repository secrets. The last six runs on
     `main` (2026-09-23) all failed at the test step.
   - Specs that don't answer the tracking calls in the browser write analytics from CI, the
     same way decision 1 describes.
   - **Options:** answer the tracking calls in one shared fixture for every spec, point CI
     at a Supabase branch database, or stop running it on push.

   **Merged and deployed (2026-09-26).** Phases 14–26 and the flag-fix pass are merged to
   `main` in both repos. Vercel deploys `main` to Production in both. The branches
   `my-profile/phase-14` (buyer app) and `my-profile/phase-15` (Cosora-Admin) are kept.
   - **Live with that deploy:**
     - buyer app: the Subscription page's "Contact us" (Phase 24); FAQs read from the CDN
       snapshot (Phase 23); the `no_contact` message; notifications that say they aren't
       live yet (MPF-12); Seller → Buyer only after a completed registration (MPF-22);
     - Cosora-Admin: support writes FAQs (Phase 22); the Admin Log page, and panel sign-ins
       and sign-outs recorded (MPF-26); the "Analytics events refused" panel (MPF-23).
   - **Live before it, without an app deploy:**
     - Phase 16's database changes and sweep function;
     - Phase 18's migration and `account-deletion` v2;
     - Phase 20's `fx_rates`, `fx-rates-refresh` and its cron job;
     - Phase 22's and Phase 23's migrations, `faqs-snapshot` and its cron job;
     - Phase 24's migration (which changed no live row);
     - the flag-fix pass's six migrations: the quote rule, refused-event recording, the
       Manager role, the Admin Log (and its guard's search_path) and the cron alarms;
     - `admin-invite` v7, `admin-refund-payment` v5, and the three subscription functions.
   - **`otp-dev-verify` and `.claude/tmp/`,** which are never to be committed:
     - Commit `85f4f6a` ("index.ts", 2026-09-25 14:56 IST, before the flag-fix pass) added
       `otp-dev-verify/index.ts` and `.claude/tmp/phase5-context.md` to `my-profile/phase-14`.
     - The flag-fix commit removed both again with `git rm --cached`, which keeps the local
       copies. `main`'s files have neither, and the function is not deployed.
     - Both stay in the history of the branch and `main`, and both repos are public.
       Neither file holds a secret value or personal data.
     - The bypass itself is MPF-21, in `ToDo.md`.
3. **Should `call_buyer_contact()` require an accepted quote?** Since MPF-18's fix
   (2026-09-25) only the buyer can accept a quote, so "accepted" can be trusted. Today any
   quote by the caller on the buyer's request counts, which was Phase 11 decision 2 in
   `myprofileflags-fixed.md`.
4. **Narrow the admin email lookups?** `admin_profile_search()` and `admin_profile_emails()`
   admit any active admin, which keeps the access every admin role had before MPF-3. That
   now includes the new Manager role. Narrowing them to support and super_admin would take
   emails off Accounts and Chats for product, ads, vendor-ops and finance admins (Phase 11).
5. **Who holds the Manager role?** It exists (MPF-26), and nobody holds it yet. A super
   admin grants it on the Admins page.

Resolved decisions are recorded in `myprofileflags-fixed.md`, under each phase's
"decisions" heading:
- Phase 9 Q3 (support writes FAQs): Phase 22;
- Phase 9 Q2 (the FAQ read path at 10k users, with the measurements): Phase 23;
- Phase 9 Q4 (the seeded FAQ content and the answer used): Phase 24;
- how the regression pass ran: Phase 26;
- what was fixed and moved on 2026-09-25: the flag-fix pass.

---

## Open flags

None. Every flag is either fixed (`myprofileflags-fixed.md`) or moved to `ToDo.md`.

## Moved to `ToDo.md` (2026-09-25)

Left as they are, on Mitra's instruction. Each `ToDo.md` entry carries the flag's full
record.

| ID | Title | `ToDo.md` entry |
|---|---|---|
| MPF-4 | Deletion emails can't go out yet: no `RESEND_API_KEY`, and no verified sending domain | "Set up Resend so account-deletion codes can go out by email (MPF-4)" |
| MPF-10 | The fake email "Verify" is gone; nothing verifies a profile email | "Decide whether to build real verification for the profile email (MPF-10)" |
| MPF-14 | The seeded buyer Help FAQs promise features that don't exist | "Fix the buyer Help FAQ answers that describe features Cosora doesn't have (MPF-14)" |
| MPF-15 | Vendors have no real support destination; vendor Help is the buyer page and its chats are canned | "Give vendors a real support destination, and stop the canned chats posing as live support (MPF-15)" |
| MPF-16 | Andy's Seller Registration and Subscription FAQs promise things the product doesn't do (published verbatim by decision) | "Decide whether Andy's Seller Registration and Subscription FAQ answers change, or the product catches up (MPF-16)" |
| MPF-17 | The Subscription FAQ promises a 7-day money-back guarantee the Terms contradict | "Resolve the Subscription FAQ's 7-day money-back promise against the Terms, and make a refund possible (MPF-17)" |
| MPF-21 | `otp-dev-verify` is a sign-in bypass, and it is on by default (parked, never deployed) | "Never deploy otp-dev-verify as it is; harden it or delete it once SMS works (MPF-21)" |
| MPF-24 | WhatsApp deletion codes can't go out yet: no Meta Business account, sender number or approved template | "Set up Meta WhatsApp so account-deletion codes reach phone-only accounts (MPF-24)" |
