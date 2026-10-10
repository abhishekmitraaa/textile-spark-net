# Security Flags & Gaps

Log of every security flag, vulnerability, gap, or risk discovered anywhere in this
codebase — infra, dependencies, auth, data handling, or business logic. Maintained
automatically the moment something is found, during any session or while working any
prompt, without being asked.

IMPORTANT: never paste actual secret values, API keys, tokens, passwords, or working
exploit payloads into this file. Describe the finding, its location, and its risk —
not the sensitive value itself. This file may end up in version control history.

## Open Flags (unresolved, needs attention)
| Date found | Title | Severity | Location | Status |
|---|---|---|---|---|
| 2026-10-11 | **Plan checkout and autopay are open to every seller while Razorpay runs on test keys**: anyone can take any plan, VIP included, with Razorpay's published test card numbers and pay nothing; with no GST billing details a purchase gets a receipt, not a tax invoice | High (revenue; the plan's seal, featured places and lead access come with it) | `feature_flags` `subscription_checkout`, `subscription_autopay` (enabled 2026-10-11); Razorpay secrets are test keys; `admin.billing_entity` empty | **Open, accepted by Mitra 2026-10-11** (told before choosing "All 11 for everyone"). Closes when the live Razorpay keys and the GST details are in. Until then plans bought in test mode carry `payment_mode = 'test'`, so they can be found and reviewed (Cosora-Admin › Subscriptions) |
| 2026-10-10 | `subscription-verify-payment` answers `already`, with the plan and invoice id, to anyone who sends a paid order's id, payment id and signature | Low (hardening: the three values are the payer's own, and the answer changes nothing) | `supabase/functions/subscription-verify-payment/index.ts` (live path) | Open: check the caller owns the order before answering |
| 2026-10-10 | `created_at` is still the browser's on `profiles`, `buyer_profiles` and `vendor_documents`; `vendor_profiles.profile_score` is written by the browser by design | Low (nothing ranks or vouches by them) | those tables; `src/lib/queries/vendorDashboard.ts` | Open, logged only. `profiles` sits beside sign-in, which is not to be touched |
| 2026-10-07 | **Signed-out callers could read any vendor's plan, period end and usage** (`get_vendor_plan` guard not coalesced; anon held EXECUTE) | Low–Medium | `public.get_vendor_plan(uuid)` | Fixed on branch `subscriptions/p0-foundations` (`20261009171435_subscriptions_p0_foundations.sql`): guard coalesced, anon EXECUTE revoked. Open until applied. Verified live 2026-10-07 in a rolled-back probe as anon |
| 2026-10-07 | **Any signed-in account could take a paid plan, its trust seal and its search boost without paying** (demo path, and now Razorpay test cards) | High | `subscription-verify-payment` demo path; `subscription-create-order` | Fixed on branch (P0): `subscription_checkout_gate()` + the `subscription_checkout` switch, off by default. Open until applied and deployed. The ad checkout's demo path (2026-09-12 row) is unchanged |
| 2026-10-07 | Issued tax invoices can be edited and deleted by super and finance admins through the API | Medium | RLS `subscription_invoices_admin_update/_delete` | Fixed on branch `subscriptions/p1-billing-core` (`20261009171650`): a BEFORE UPDATE/DELETE trigger refuses every browser role, admins included; a processed refund issues a credit note. Open until applied |
| 2026-10-07 | `subscription_payment_orders` and `subscription_usage` readable by every admin role | Low | their SELECT policies (bare `is_admin()`) | Fixed on branch (P0): roles named. Open until applied |
| 2026-10-07 | Payment functions read the vendor id out of an unverified token, relying on the platform's verify_jwt alone | Low (design) | `subscription-create-order`, `-verify-payment`, `discount-quote` | Fixed on branch (P0): Supabase Auth confirms the caller (`_shared/auth.ts`). Open until deployed. The ad functions still decode the token |
| 2026-10-07 | GSTIN and PAN saved unchecked and printed on the tax invoice | Low | `Subscription.tsx`; onboarding | Fixed on branch for /subscription (P0). Onboarding still saves them unchecked (ToDo) |
| 2026-10-07 | Upgrade credit counts demo invoices (no gateway payment) as money paid | Medium (latent until live payments) | `admin.subscription_quote` credit query | Fixed on branch (P1): once the first live payment is fulfilled, only live invoices earn credit. Open until applied |
| 2026-10-07 | A charge that fails to activate after its order is claimed is only logged to the console | Medium (latent until live payments) | `subscription-verify-payment`, `subscription-webhook` | Fixed on branch (P1): one fulfilment transaction (`subscription_fulfil`), billing incidents, webhook events stored once, `billing-reconcile` (its schedule awaits approval). Open until applied and deployed |
| 2026-10-02 | Seller registration collects the owner's masked Aadhaar (live 2026-10-02) | Medium (compliance, for counsel) | `src/pages/Onboarding.tsx`, `src/pages/Kyc.tsx`, `vendor_documents` (`aadhaar`), bucket `business-docs` | Open: live without counsel's confirmation, at the user's instruction (ToDo.md) |
| 2026-10-01 | Signed-out callers can raise any live product's views and enquiries, a video's views and an ad's clicks, with no limit | Low (metrics integrity: these counts order the related-products fallback, and vendors read them as demand) | `increment_product_view`, `increment_product_enquiry`, `increment_video_view`, `ad_click` (SECURITY DEFINER, EXECUTE for anon by design) | Open, follow-up from the 2026-10-01 review. `ad_impression` has a per-session daily cap and a throttle; these four have none, and `ad_click` doesn't take a session into account at all. Fix shape: a per-session limit in the database like `ad_impression`'s, or count from `engagement_events` instead. The session id comes from the browser, so a database limit stops only naive repeats; a per-IP limit needs an edge function in front. Log entry below |
| 2026-09-29 | A review's display name is client-supplied: `reviewer_name` / `reviewer_company` are written by the browser, so a buyer can post under any name | Low (impersonation in review text; the author's uid is still recorded) | `src/lib/queries/reviews.ts` (`resolveReviewer`); `reviews` / `product_reviews` / `service_reviews` insert policies | Open: fill them in a BEFORE INSERT trigger from `buyer_profiles` / `profiles` |
| 2026-09-28 | Microsoft Clarity's script, once switched on, can read every buyer-site page | Low (third-party script; dormant until `VITE_CLARITY_PROJECT_ID` is set) | `src/lib/analytics/clarity.ts` (loads `https://www.clarity.ms/tag/<id>`) | Open, accepted with Mitra's decision to install Clarity. Masking controls what Clarity uploads, not what its script can read: like any third-party script it runs with the page's privileges. In place: it loads only when configured, identifies no one, and the sign-in, chat, onboarding, KYC, profile, requirement, quote, lead and billing screens and every overlay are masked. The buyer site sends no Content-Security-Policy, so nothing limits which scripts load; a CSP that allows `www.clarity.ms` and `*.clarity.ms` is the next step. Log entry below |
| 2026-09-28 | Session replay would start without asking the visitor | Low (a legal question; dormant until Clarity is switched on) | `src/lib/analytics/clarity.ts`; the notice on `/terms` (`TermsConditions.tsx`, `#analytics`) | Open, a decision for Mitra and legal before `VITE_CLARITY_PROJECT_ID` is set. The Terms page describes recording and cookies, but nothing asks for consent, and Clarity sets its cookies on the first page. Clarity offers a consent API and a project setting that holds cookies until consent. Log entry below |
| 2026-09-27 | **Dummy OTP is live: any 6 digits sign in as any phone number's account** | High (accepted for now, on Mitra's instruction; Critical once real users hold phone accounts) | `supabase/functions/otp-dev-verify/index.ts` (deployed 2026-09-27, version 1), called by `src/lib/auth/otp.ts` when Supabase refuses to send an SMS | Open, on purpose. Mitra asked for it on 2026-09-27 while SMS delivery isn't live. Anyone who types a number is signed in as that number's account, and accounts can be created without limit. It signs in only to accounts it created itself (never a Google or email account, never an admin, and it fails closed). Kill switch: the secret `OTP_DEV_BYPASS=off`. Switch it off or delete it before real users sign up by phone, then review the accounts with `app_metadata.created_by = otp-dev-verify`. Log entry below |
| 2026-09-24 | WhatsApp account-deletion codes will arrive as Meta's fixed text, "<code> is your verification code.", which doesn't say the code deletes the account | Low (social engineering; dormant until WhatsApp is configured) | `supabase/functions/account-deletion/index.ts` (`sendWhatsApp`) and the Meta template it names (`WHATSAPP_TEMPLATE`) | Open, setup guidance. Someone holding a stolen session could request a deletion, then ask the owner for "the verification code"; the email version says what the code is for, and Meta's authentication templates can't. Create the template with Meta's security recommendation ("For your security, do not share this code.") and a 10-minute expiry. Already in place: the code only confirms a deletion and signs no one in, deletion waits 14 days with Cancel on `/profile`, and scheduling posts an in-app notification. My Profile Phase 18; `myprofileflags.md` MPF-24 |
| 2026-09-24 | The parked `otp-dev-verify` edge function signs anyone in as any phone number with any code, and is on by default | Critical if deployed; nil today (not deployed) | `supabase/functions/otp-dev-verify/index.ts`. Committed to branch `my-profile/phase-14` by `85f4f6a` (2026-09-25) and removed again before the merge to `main` (2026-09-26), so it is in the public history but not in `main`'s files. Not deployed: not among the 16 functions on 2026-09-24 or the 18 on 2026-09-26 (`list_edge_functions`) | **Superseded on 2026-09-27** by the dummy-OTP row above: now deployed on purpose. Of the fixes listed here, the admin check was rewritten to use `admin_status_of()` and fails closed. Off by default, refusing the production ref, a number allowlist, a secret header and restricted CORS were not applied, because each would stop the dummy OTP working on the live site. As first recorded: open, parked. Flagged by the automated security review on 2026-09-24. `ENABLED = true`, turned off only by `OTP_DEV_BYPASS=off`; it creates accounts with the service-role key, allows CORS `*`, and has no allowlist or secret. Never deploy it as it is, and never commit it. Before any use: off by default, refuse the production project ref, a dev-number allowlist, a shared-secret header, restricted CORS, and an admin check that doesn't read the dropped `profiles.is_admin`. Better: delete it once real SMS delivery works. `ToDo.md`: the MPF-21 entry (moved there from `myprofileflags.md` on 2026-09-25, left as it is on Mitra's instruction) and "Wire up mobile OTP delivery" |
| 2026-09-23 | pg_cron's run history is 63% of the database and grows without limit toward the free plan's 500 MB cap, which makes the project read-only | Medium (availability) | `cron.job_run_details`: 120 MB, 50,692 rows since 2026-09-06, ~3,000 rows/day from two every-minute jobs | Open, a decision for the owner. Pruning deletes run history, and `embedding-health-alarm` deliberately surfaces failures as rows there, so the window must be long enough to notice an alarm. Suggested: a daily pg_cron job `delete from cron.job_run_details where end_time < now() - interval '14 days'` (postgres has DELETE; it cannot VACUUM FULL or index the table, which `supabase_admin` owns). Its full-scan cost was already removed from the health check (migration `20260923093304`) |
| 2026-09-22 | `BUNNY_API_KEY` is rejected by Bunny Stream (401 "Authentication has been denied"), so reconciliation cannot list the library and a vendor delete of a Bunny video cannot remove the paid asset | Low (misconfiguration; cost leak, not access) | Edge-function secret `BUNNY_API_KEY` used by `bunny-reconcile`, `bunny-delete-video`, `bunny-upload-url` | Open. Found during admin-schema separation 5b: as super_admin `bunny-reconcile` passed authz and got 401 from `video.bunnycdn.com`. Most likely a rotated or wrong key. Today 0 `product_videos` rows use the bunny provider, so nothing is leaking yet. If uploads switch to Bunny while the key is bad, each delete fails with `bunny_delete_failed` (the function refuses to report success). Fix: set a valid library API key and re-run `bunny-reconcile`. The key value is not recorded here |
| 2026-09-22 | Mobile + OTP is the primary login but has no delivery yet. When the in-house OTP API is wired, OTP brute-force and SMS-pumping (toll-fraud) protection must exist before it goes live | Medium | `src/lib/auth/otp.ts` (the single OTP seam); Supabase Auth phone settings / the future `otp-verify` edge function | Open, suspected gap, not exploitable today. Nothing is sent now: `phone_provider_disabled`. Once live, an unauthenticated caller can make the platform send SMS to any number, and a 6-digit code is guessable without attempt limits. The seam only surfaces the server's rate-limit error; it does not enforce one. Before go-live: per-number and per-IP send limits, a verify-attempt cap with lockout, code expiry, and ideally a CAPTCHA on send |
| 2026-09-22 | Integration option (B), the custom API verifying codes itself with an edge function minting the session, would make that edge function an authentication authority | High (design-time) | Future `otp-verify` edge function (not written); `TODO(otp-integration)` in `src/lib/auth/otp.ts` | Open, design constraint, nothing built. If (B) is chosen, the function must verify the code with the API **server-to-server**, and never trust a client-sent "verified" flag or API response. It must keep the API secret server-side, bind the code to the exact E.164 number, make codes single-use, rate-limit, and create or find the user without letting client metadata set `is_admin` (`handle_new_user()` whitelists `active_role` only; keep it that way). Option (A), Supabase's Send SMS hook, keeps generation and verification inside Supabase and avoids this class entirely |
| 2026-09-28 | The Admin Log can show a vendor's private fields to a manager | Low (admin-internal; managers don't otherwise see them) | `admin.audit_row_change()`: an admin's INSERT or DELETE of a `vendor_profiles` row logs the whole row, and an UPDATE logs changed values, into `admin.audit_log`, which super_admin and manager read. `admin_vendor_private()` doesn't admit manager | Open, logged only. Options: mask the eight fields in `vendor_profiles` audit rows (record that they changed, not their values), or accept that the log is complete evidence. Only admin actions are logged, and admins can't edit those columns today, so it's the rare case of an admin deleting or creating a vendor row, or editing their own |
| 2026-09-11 | Product-level `rating_avg` / `reviews_count` / `sold_count` are vendor-writable and have no real source | Low | `products` (`products_update` admits `vendor_id = auth.uid()`; no guard on these columns) | Superseded 2026-10-10 (the row above on counts and ratings): the rating and review count are computed from `product_reviews` since 2026-09-29, and the counts now choose featured listings. The guard keeps the seeded values the cards show (Mitra's decision stands) and stops a seller raising them. `sold_count` still has no source |
| 2026-09-11 | embed-query's per-IP key parses `x-forwarded-for` identically but was never probed | Low | `supabase/functions/embed-query/index.ts` (`.split(",")[0]`) | Open — confirm next time that file is touched |
| 2026-09-12 | Ad payment falls back to a demo mode that creates campaigns from the CLIENT-SUPPLIED spec with no payment record | Medium | `supabase/functions/razorpay-verify-payment/index.ts` (`if (!keySecret)`, line ~256) | Open — severity reduced, not removed. Since 2026-09-12 a demo-mode campaign lands on `pending_review` like any other and cannot reach a buyer without admin approval, so it can no longer publish unpaid inventory. But it still lets a signed-in vendor create campaigns (and grant themselves trust seals via `grantSeals`) with no money and no `ad_orders` row — `ad_orders` has 0 rows today, which means this is the live path. Needs `RAZORPAY_KEY_SECRET` configured, or the fallback removed |
| 2026-09-14 | **A vendor could give themselves the trust badge and a search-ranking boost, free** | High | `vprofiles_update` policy on `public.vendor_profiles` (no column restriction); `enforce_vendor_profile_admin_fields()` guarded only `is_verified` / `rating_avg` / `reviews_count` | Fixed 2026-09-14, migration `20260914110000_guard_vendor_trust_and_plan_columns`. NOT introduced by the ads work — open since `vprofiles_update` was written. The policy admits `id = auth.uid()` with no column guard, so a signed-in vendor could PATCH their own row and set `ad_verified_until` (the TrustedSEAL badge, drawn on every product card, the vendor profile and search results), `plan_expires_at` (the same badge by a second route via `trustSealFromParts`, **and** the search boost via `vendorBoost`), and `plan_id` (which tier that boost is worth). Proven live by what PERSISTED, not by whether the statement raised — `plan_id` went `gold → vip` and `ad_verified_until` to 2036. Entitlements were never bypassable: `get_vendor_plan()` resolves the effective plan from `vendor_subscriptions`, so product/lead caps and `ad_location_scope` held. The exposure was the trust badge and search ranking. Re-verified after: vendor refused 42501 on all three, brand/city editing still works, super_admin still allowed, and `grant_ad_verification()` (the approval path) still grants |
| 2026-09-14 | **`razorpay-webhook` granted trust badges on payment — "payment is never approval" held on one publish path and not the other** | High | `supabase/functions/razorpay-webhook/index.ts` — its own copy of `grantSeals()`, calling `grant_ad_verification()` directly after insert | Fixed 2026-09-14, removed and redeployed (webhook v7). `razorpay-verify-payment` had this removed on 2026-09-12; the webhook kept its copy in **both the repo and production**, and the webhook is the path that runs *unattended* — the server-to-server backstop for when the buyer closes the browser. `guard_ad_activation` protects the campaign STATUS on both paths, but nothing protected the seal grant: `grant_ad_verification` is SECURITY DEFINER with no internal authorization check and the webhook runs as service_role. Blast radius was contained by two things, neither of them a design: `grant_ad_verification` is not granted to `anon`/`authenticated` (so no vendor could call it directly), and `RAZORPAY_WEBHOOK_SECRET` is unset, so the webhook returns `not_configured` and has never run. It would have activated silently on the day real payments were switched on |
| 2026-09-14 | Deployed `razorpay-create-order` was **older than the committed source**, missing the `intent_failed` guard | Medium | Edge function deployment (was v4, from July) vs `supabase/functions/razorpay-create-order/index.ts` | Fixed 2026-09-14 by redeploying (v5). The deployed copy recorded the `ad_orders` payment intent fire-and-forget and returned `configured: true` regardless. With no intent row a completed payment finds nothing to fulfil, `publishOrder` takes its "already paid / unknown" branch and reports `ok:true, count:0` — vendor charged, no campaign, UI says it worked. Latent only because `RAZORPAY_KEY_SECRET` is unset so the function returns `not_configured` before reaching it. Found by diffing every deployed edge function against both repos, which is now written up in `MIGRATIONS.md` as a standing step |
| 2026-09-14 | Vendor-level ad products billed per-product **and** per-day — a ₹199 certificate charged up to ₹72,635 | High | `computeAmountRupees`/`computeAmountPaise`/`adRows`, duplicated across three edge functions + `src/pages/Advertisements.tsx` | Fixed for the two vendor-level types 2026-09-14 (`trustedSeal`, `verifiedCertificate` now charged once per order, flat) and consolidated into one shared module with a drift check. **Six types remain advertised flat but billed per-day** — `wholesalerPick`, `brandAd`, `webMobileCombo`, `fbInsta`, `googleProduct`, `socialCombo` — left unchanged because repricing live products is a business decision, not an engineering one. Logged in `todo.md` (High) with the overcharge table |
| 2026-09-13 | `certificate_orders` kept Supabase's default table grants — anon held SELECT, both client roles held INSERT/UPDATE/DELETE | Medium | `public.certificate_orders` (created by migration `20260913130000`, closed by `20260913130100`) | Fixed 2026-09-13, self-caught in review of my own migration. `grant select ... to authenticated` reads like the whole story and is not: Supabase grants ALL on every new `public` table to anon/authenticated/service_role by default, and revoking PUBLIC alone is a no-op because each role holds the privilege in its own right. Nothing leaked and nothing was writable — RLS returns no rows to anon and there is NO write policy for any role — but an RLS-denied UPDATE matches zero rows and **PostgREST reports SUCCESS**, the exact failure mode this project has been removing everywhere else, and a table-level write grant means any policy added later by mistake opens writes immediately. Revoked from `public, anon, authenticated`, re-granted SELECT to `authenticated` only, sequence revoked too. Re-verified with `has_table_privilege`: anon SELECT false, authenticated UPDATE/INSERT/DELETE false, authenticated SELECT true |
| 2026-09-13 | Certificates are sellable to every vendor but deliverable to almost none — only 2 of 10 `vendor_profiles` rows have a postable address | Medium | `public.vendor_profiles` (`address_line`, `postal_code`); purchase path in `razorpay-create-order` does not require one | Open — logged in ToDo.md (High). `verifiedCertificate` (₹199) is a printed certificate that gets couriered, and `certificate_orders` snapshots the address at purchase. Only 2 of 10 vendors carry both an address line and a postcode, and the one that does has zero live products. `certificate_dispatch()` refuses to mark such an order dispatched and the vendor's tracking page says the address was missing, so nothing is silently lost — but a vendor can still pay for a parcel that cannot be sent. Demonstrated live: demo order `CERT-2609-003` is stuck at `printed` for this reason. Same shape as the city-targeting gap: the field is sold before it is collected |
| 2026-09-13 | Vendor-level ad products are priced per-PRODUCT, so one certificate purchase can charge 3× and create 3 parcels | Medium | `computeAmountRupees()` / `adRows()` — duplicated across `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook` | Open — logged in ToDo.md (High). `verifiedCertificate` (₹199) and `trustedSeal` (₹44) are about the vendor, not a product, but every placement is multiplied by the number of products in the spec. Buying a certificate alongside three products charges 3 × ₹199, creates three `advertisements` rows, and the fulfilment trigger creates three orders — three identical parcels for one vendor. Not auto-merged on purpose: the fix is a refund decision and belongs to a person. The admin Certificates screen now shows a caution when one vendor has more than one open order, so it is visible rather than silently shipped |
| 2026-09-13 | For You served the SAME ad set at three depths of one page and logged an impression for each | Low | `src/pages/ForYou.tsx` (`feedItems` emitted `{kind:"recent"}` every 16 products, all handed the same `recentAds` array) | Fixed 2026-09-13 — the slot is now cut into disjoint blocks (`useAdSlotBlocks`), so each depth shows different campaigns. Not a breach, but it inflated every affected vendor's impression count threefold on a single page view while the buyer saw one set of ads repeated, and impressions are what vendors are reported against |
| 2026-09-13 | Admin ad-moderation analytics were readable by any signed-in user | High | `ad_review_metrics(integer)`, `ad_fraud_signals(integer)` — SECURITY DEFINER, granted to `authenticated`, no authorization check inside | Fixed 2026-09-13 — both now check `ad_moderator()` and raise 42501. Confirmed live BEFORE the fix: signed in as demo-buyer, `/rest/v1/rpc/ad_review_metrics` returned real queue depth, decision counts and rejection-reason breakdown. `ad_fraud_signals` returned `[]` only because nothing was flagged; with data it would have exposed vendor ids, click counts and suspected-fraud reasons. Re-probed after: buyer DENY, vendor DENY, admin ALLOW |
| 2026-09-13 | Ten new ad helper functions kept Supabase's default PUBLIC EXECUTE grant and were callable over the REST API | Medium | `vendor_account_in_good_standing`, `ad_target_live_status`, `ad_moderator`, `ad_owner`, `ad_viewer_city`, `ad_frequency_capped`, `ad_logging_throttled`, `ad_seal_sources`, `is_ad_eligible`, `ad_targeting_matches` | Fixed 2026-09-13 — revoked from `public, anon, authenticated`. The nine review RPCs were locked down explicitly; these helpers were written alongside and the revoke was not carried across. Confirmed live BEFORE the fix as an ANONYMOUS caller: `vendor_account_in_good_standing('<vendor uuid>')` → `true`, i.e. any account's suspension state was probeable unauthenticated. All are called from inside SECURITY DEFINER functions owned by postgres, so delivery is unaffected — re-verified signed-out `active_ads` and `ad_impression` still work |
| 2026-09-13 | A vendor could delete their own campaign and erase its "append-only" review history | Medium | `ad_review_log.ad_id` ON DELETE CASCADE + `advertisements_delete` policy admitting the owner | Fixed 2026-09-13 — new `trg_guard_ad_deletion` refuses a signed-in non-admin deleting a campaign that has any `ad_review_log` row. Confirmed live BEFORE: a campaign with 1 decision row, deleted by its owner, left 0 log rows — so a vendor rejected for misleading claims could erase the rejection before resubmitting. Confirmed after: refused, campaign and its history intact. Drafts with no review history can still be deleted |
| 2026-09-13 | Two fabricated "sponsored" placements were rendering to buyers, and a third rail served off-platform ad types as on-platform cards | Medium | `src/components/buyer/EverydayFashionHero.tsx` (`sponsored: true` on an invented product); `src/lib/followingStore.ts` (`isAd: true` on the invented brand "LUNE"); `src/components/buyer/SponsoredRail.tsx` (unfiltered `active_ads()`) | Fixed 2026-09-13 — both false paid claims removed; `SponsoredRail` now falls back to `ON_PLATFORM_CARD_TYPES` so `fbInsta`/`googleProduct`/`socialCombo`/`searchListing`/`directBroadcast`/`webMobileCombo` can no longer render as product cards. `scripts/ad-slot-map-check.mjs` asserts it both ways. The surrounding fabricated content (the hero's 8 invented products with dead `/product/ef-N` links, and the signed-out brand SEED) is NOT fixed — logged in ToDo.md as product decisions |
| 2026-09-12 | Trust seals (`trustedSeal` / `verifiedCertificate`) are granted at payment, before any review | Medium | `supabase/functions/razorpay-verify-payment/index.ts` (`grantSeals()` → `grant_ad_verification()`) | Open — the campaign itself is now review-gated, but the seal is not: `grantSeals` runs on the payment path alongside the insert, so a vendor gets `vendor_profiles.ad_verified_until` extended and the badge renders on their profile and product cards before a human has looked at anything. Fix shape: move the grant into `approve_ad_campaign()` for seal-bearing placements |

## Fixed / Closed Flags
| Date found | Title | Severity | Location | Status |
|---|---|---|---|---|
| 2026-10-10 | Any signed-in buyer can review any seller or listing, with no dealings between them | Medium while the dummy OTP is live (any phone number is an account) | `reviews_insert_own`, `product_reviews_insert_own`; `guard_review_write()` stops only self-reviews | **Accepted by Mitra, 2026-10-10:** "buyer should be able to review without even dealing with the vendor". Kept as is; self-reviews stay refused |
| 2026-10-10 | A catalogue's file address (seller-written) was rendered as a link: a `javascript:` address would run in a Cosora staff session from the new Catalogues screen, and on the seller's own Business Profile | High (caught before release by the automated security review) | `catalogues.file_url`, `cover_url`; Cosora-Admin `Catalogues.tsx`; `BusinessProfile.tsx` | **Fixed before release, live**: `catalogues_web_urls` (http(s) only) and `webUrl()` in both apps |
| 2026-10-10 | Catalogues have no approval screen in Cosora-Admin: an uploaded catalogue waits in review with nothing that shows it to a moderator | Low (functional; production has no catalogues yet) | Cosora-Admin (no page reads `catalogues`); `approve_vendor_content('catalogues', id)` exists | **Fixed 2026-10-10, live** (`20261010133347_catalogue_review.sql`, Cosora-Admin › Catalogues), with a reason the seller sees |
| 2026-10-10 | Editing a listing, video or catalogue that is already live does not send it back to review: approved content can be swapped through the API (the app's own edit already re-reviews) | Medium | `products`, `product_videos`, `catalogues`, `product_images`: an owner's edit kept `status` | **Fixed 2026-10-10, live** (`20261010124955_listing_edit_rereview.sql`): back to review, with a record staff see in Cosora-Admin |
| 2026-10-10 | Follower counts are placeholders and never move: six production sellers showed 1,240 to 8,760 followers for one or two real ones; one seller follows themselves | Low (trust: a buyer reads it as demand) | `vendor_profiles.followers_count`; `follows` | **Fixed 2026-10-10, live** (`20261010125031_follower_count.sql`): counted by the database, self-follows refused |
| 2026-10-10 | **A paid-plan seller could run ads without paying and without review**, restart an ad Cosora had paused, suspended or rejected, and give a paid ad more time and more slots | High | `enforce_ads_moderation()` (an owner could set `paused_by_vendor` from any status, then `resume_ad_campaign()`); no guard on a campaign's dates, slots, wording or listing; `create_certificate_order()` fired for drafts | **Fixed 2026-10-10, live** (`20261010060959_server_owned_columns.sql`). Before the fix production had the same code and nothing there looked used; never tried on production |
| 2026-10-10 | **A seller could set the counts, ratings, dates and search vectors that rank and feature their own listings**; a buyer could date a requirement or review in the future | Medium–High (they choose the featured listing, the spotlight and which listings stay live on a smaller plan) | `products`, `product_videos`, `vendor_profiles`, `rfqs`, `reviews`, `product_reviews`, `service_reviews`: every column granted, no guard | **Fixed 2026-10-10, live** (`20261010060959_server_owned_columns.sql`): a browser's value is ignored. Replaces the 2026-09-11 row on product counters |
| 2026-10-10 | A seller could create a catalogue as `live`, or set it live, without review | Medium | `catalogues` (no status rule; the app sends `under_review`) | **Fixed 2026-10-10, live** (`20261010060959_server_owned_columns.sql`): a seller sets `draft` or `under_review`. Production had no catalogues |
| 2026-09-30 | `/report-fraud` takes a fraud report, keeps nothing, and says it will be reviewed within 48 hours | Medium (trust and safety: a victim believes a report was filed) | `src/pages/ReportFraud.tsx:82` (success toast only; the upload box at `:67` toggles a boolean); linked signed-out from `Landing.tsx:524`, and from `VendorLanding.tsx:136` and `Onboarding.tsx:48` | Fixed 2026-10-02. P1 (live 2026-10-01) made the form an honest email with no 48-hour promise; P3 (live 2026-10-02) stores the report, with evidence, for the restricted Fraud queue. Rollout is Off, so the email form is what people see until it's switched on. |
| 2026-09-30 | The Help page's support chat has no chat-monitoring notice, and both support chats present an invented agent with fake presence | Medium (the notice is legally required in every chat flow, `claude.md`) | `src/pages/Help.tsx:77-227` (`ChatModal`: no notice, agent "Abdul", fake typing); `src/pages/SupportChat.tsx:26-117,157` (canned replies, "Online", read ticks) | Fixed 2026-10-02. P1 (live 2026-10-01) removed both canned chats; P3 (live 2026-10-02) is the real chat, which shows the monitoring notice and only "Cosora Support" (D-06). Rollout is Off. |
| 2026-09-30 | 33 SECURITY DEFINER functions in `public` can be called by `anon` | Low after review: none of them lets a signed-out caller read or change what it shouldn't | Live catalog, 2026-10-01: 34 definer functions in `public` executable by anon (the 33, plus `support_status`, public on purpose) | **Reviewed and closed 2026-10-01.** 11 are trigger or event-trigger functions: EXECUTE revoked from public, anon and authenticated (`20261001113147`), rehearsed with a real trigger firing for a signed-in buyer afterwards. 23 keep it, each for a stated reason: public read paths, signed-out logging, the policy helpers that 48 RLS policies written `TO public` call, and signed-in functions that refuse or answer null otherwise. Not part of admin-completion Phase 11, which is about admin reads. One follow-up: the unthrottled counters (Open row, 2026-10-01). Log entry below |
| 2026-09-27 | Every admin role can read every row of seven tables (KYC documents, signed contracts, invoices, subscriptions, ad and certificate orders, analytics events), whatever its section | Medium (insider over-exposure: a product moderator or manager can read vendors' KYC metadata and billing through the API) | RLS read policies `... or is_admin()` on `vendor_documents`, `vendor_contracts`, `subscription_invoices`, `vendor_subscriptions`, `ad_orders`, `certificate_orders`, `engagement_events` | Fixed 2026-10-02 (admin completion Phase 11, `20261002064904_admin_least_privilege_reads.sql`): each read policy names the roles whose section reads the table, and the plan-cap triggers read the plan through the definer helper `vendor_cap_plan()`. Harness 15 17/17 live: product_moderator and manager now read none of the seven; each other role reads only its section's tables |
| 2026-09-29 | Live subscription invoices dropped the signature-verified Razorpay payment id (`paymentId: null` into the invoice), so a real payment would have read as "not gateway-verified" and had no id to refund against | Low (audit trail; latent while the keys are unset) | `subscription-verify-payment` `activateFromOrder`; `subscription-webhook` | Fixed 2026-09-29 (admin completion Phase 10): verify passes the verified id, the webhook the event's payment id (verify v6, webhook v5). `scripts/discount-flow-check.mjs` B1 and C1 assert it |
| 2026-09-29 | **A seller could review their own store and products**, and so set their own rating (insert policies checked only `buyer_id = auth.uid()`) | Medium (reputation fraud) | `reviews`, `product_reviews` | Fixed 2026-09-29: `guard_review_write()` (migration `20260928190320`) |
| 2026-09-29 | **A buyer could write a "seller reply" onto their own review** (`reviews_update_own` let the author set `reply_body` / `replied_at`) | Medium (a forged response in the seller's name) | `reviews` | Fixed 2026-09-29: the guard keeps the reply columns unless a reply RPC writes them |
| 2026-09-27 | **Every vendor's PAN, owner email, phone, WhatsApp and street address is readable signed out** (anon holds column SELECT on all 43 `vendor_profiles` columns; `vprofiles_select` is `USING (true)`) | High (PII and tax id of every vendor, unauthenticated) | `public.vendor_profiles`; readers in `src/lib/queries/vendor.ts`, `vendorStore.ts`, `calls.ts`, `AdReceiptDetail.tsx`, `InvoiceDetail.tsx`, `Subscription.tsx` | **Fixed 2026-09-28** (admin completion Phase 4). Readers first: `my_vendor_private()`, the gated and rate-limited `call_vendor_contact()` and `admin_vendor_private()` (`20260927184250`, `20260927185902`), both apps moved onto them, then `writeOwnVendorRow()` for writes. Then `20260928042152` replaced table SELECT with column grants without the eight columns. **Verified live:** signed-out `select=phone`, `select=*`, a `pan` filter and a private embed went from 200 to 401/42501; public columns still 200; harness `08` 18/18; every select string in both live bundles still works. The MPF-19 order held: the code was live first |
| 2026-09-11 | Public vendor profile fills a vendor's empty identity and contact fields with invented values (GSTIN, PAN, owner, phone, email, address) | Medium | `src/pages/VendorProfile.tsx` (`detailRows`, `contactRows`, `contactAddress`, `aboutText`, `bannerSrc`) | **Fixed in code 2026-09-28** (admin completion Phase 4a; live with its merge). Every fallback is gone: an empty field reads "Not provided" or its row is left out; employees, year, member since and turnover come from the vendor's row; an unknown or loading vendor no longer renders a whole invented seller. The email, PAN and street address aren't shown to buyers at all. The catalogue entries for the invented values were removed, and the build was grepped for them: 0 |
| 2026-09-27 | "Approve all for vendor" on the Video Closeups screen also published that vendor's pending products and catalogues, which nobody had reviewed there | Medium (moderation bypass by a moderator's click) | `approve_vendor_content_bulk()` called from Cosora-Admin `Videos.tsx` | **Fixed 2026-09-27** (Phase 3a, `20260927182120`): `approve_vendor_videos_bulk()`, videos only. The old function is dropped after the panel deploy. Harness `05` |
| 2026-09-27 | An admin plan change or cancel left the trust seal and search boost on the old plan (`vendor_profiles.plan_id`/`plan_expires_at` not updated) | Medium (a canceled vendor kept a paid badge) | Cosora-Admin `Subscriptions.tsx` direct UPDATE of `vendor_subscriptions` | **Fixed 2026-09-27** (Phase 3b, `20260927182524`): `admin_subscription_change_plan()` / `admin_subscription_cancel()`. Harness `06` |
| 2026-09-27 | **Admin writes admitted every admin role.** Support and Manager accounts could reprice or delete plans, delete any profile, edit any quote or Video Closeup, rewrite KYC review fields and write `engagement_events` | High (integrity; any compromised or careless low-privilege admin account) | RLS write policies on `subscription_plans`, `quotes`, `product_videos`, `catalogues`, `advertisements`, `vendor_documents`, `buyer_profiles`, `profiles`, `engagement_events` (bare `is_admin()` arms) | **Fixed 2026-09-27** (admin completion Phase 1a, `20260927145549`). Harness `scripts/admin-completion/01_write_matrix.sql`, baseline and live |
| 2026-09-27 | **Ad review could be skipped, and moderators could edit what they approve.** A direct UPDATE switched a campaign on with no review log. Moderators could rename a listing while approving it and reject with a blank reason. vendor_ops could extend a plan (trust seal and search boost). Vendors could set their own ad impressions and clicks | High (money-adjacent integrity: paid seals, ranking, ad metrics) | `guard_ad_activation` admin bypass, `advertisements` admin RLS arm, `guard_ad_deletion`, `enforce_products_moderation`, `enforce_product_videos_moderation`, `reject_vendor_content`, `enforce_vendor_profile_admin_fields`, `enforce_ads_moderation` | **Fixed 2026-09-27** (Phase 1a and 1b, `20260927145549` and `20260927150304`). Harness `02` |
| 2026-09-27 | Support could suspend a super admin or itself; a `.*` chat flag pattern was accepted and would lock every chat; `certificate_dispatch()` told unauthorised callers whether a vendor had an address; every admin role could read the admin roster | Medium | `set_account_status`, `admin_flag_pattern_add`/`_update`, `certificate_dispatch`, `admin_list_admins` | **Fixed 2026-09-27** (Phase 1c, `20260927150657`). Harness `03` |
| 2026-09-27 | anon and authenticated held TRUNCATE (not subject to RLS), TRIGGER and REFERENCES on every public table | Low (no API path used them; defence in depth) | Supabase default grants on 45 `public` tables | **Fixed 2026-09-27** (Phase 1d, `20260927150904`), with the default privilege revoked for future tables |
| 2026-09-24 | Two cron jobs would record success while doing nothing if the Vault `service_role_key` went missing, so accounts past their deletion cooling-off would silently not be anonymized | Low (the key is present today; the consequence is a broken privacy promise, not an exposure) | pg_cron `account-deletion-sweep` (Phase 16) and `fx-rates-refresh` (Phase 20): `select net.http_post(...) where exists (<vault secret>)` | **Fixed 2026-09-25** (`20260925172634`): `fx-rates-refresh` raises without the key, and a separate `account-deletion-sweep-alarm` does for the sweep, so its SQL fallback isn't rolled back. `myprofileflags-fixed.md` → MPF-27 |
| 2026-09-24 | FAQ edits and deletes leave no record of who made them or what the text was, and support can now edit public FAQ text as well as super_admin | Low (public text; only active support and super_admin admins can write; nothing exposed) | `public.faqs`; `admin_faq_update` / `_delete` / `_reorder` (only `created_by`, set on add; an edit changes `updated_at` only; no history table) | **Fixed 2026-09-25** (`20260925173658`, `20260925174031`): the Admin Log records every admin change, with the text before and after, plus panel sign-ins and the invite and refund edge functions; append-only; super_admin and the new Manager role read it. `myprofileflags-fixed.md` → MPF-26 |
| 2026-09-24 | The deployed `subscription-create-order` is older than the repo and lacks the `intent_failed` guard: a failed intent write can let a vendor pay and stay on the old plan | Medium once Razorpay is live; nil today (demo mode: keys unset) | `subscription-create-order` v3 (deployed 16 Jul) vs commit `0fc15f6` (26 Jul). `-verify-payment` and `-webhook` also predate their first commit | **Fixed 2026-09-25**: deployed sources diffed (all three were commit `40c4611`), then redeployed from the repo with `_shared/gst.ts`: create-order v4 (with the `intent_failed` guard), verify-payment v5, webhook v4. Live smoke 3/3, GST check consistent. `myprofileflags-fixed.md` → MPF-25 |
| 2026-09-23 | A vendor can set their own quote's status, including to "accepted", with no buyer involved | Low (integrity of the buyer's quote list and the vendor's acceptance rate and Total Order Value; nothing exposed) | `quotes_update` on `public.quotes` (`vendor_id = auth.uid() OR owns_rfq(rfq_id) OR is_admin()`, no column guard) | **Fixed 2026-09-25** (`20260925173024`, `trg_quotes_update_roles`): only the RFQ owner (or an admin) changes `status`; the vendor changes the terms and may only reset status to pending, and revised terms put a decided quote back to pending. It also closes the mirror hole found while fixing: the buyer could rewrite the vendor's price. Live `scripts/quote-status-roles-check.mjs` 11/11. `myprofileflags-fixed.md` → MPF-18 |
| 2026-09-23 | Account deletion left traces: avatar files in Storage, private activity rows, and a 1-hour access-token window in which a stale token could still edit or delete the account's own rows | Low (privacy; the account itself cannot sign in again) | `anonymize_account()`, the `account-deletion-sweep` job, Storage avatar objects, own-row write policies | Fixed 2026-09-24 (My Profile Phase 16). The sweep is now the `account-deletion-sweep` edge function: it anonymizes, then deletes `avatars/<user id>/` through the Storage API, and retries a failed cleanup on every run (`20260923200739`). `anonymize_account()` deletes saved items and folders, saved videos, follows, recently viewed, video likes and notifications. `account_not_deleted(auth.uid())` gates all 46 own-row write policies (`20260923201559`). Proven with a real stale token: before the gate it could still edit its RFQ and review and add a saved item; after, 42501 / 403 / 0 rows. Still there, by design: message text and GoTrue's audit log. `myprofileflags-fixed.md` → MPF-7 |
| 2026-09-23 | Signed-in users could still read every user's email and phone (interim grant while production ran the old code) | Medium (PII, readable by any signed-in account; signed out was closed) | `profiles.email`, `profiles.phone`: column SELECT granted back to `authenticated` by `20260923174653` | Fixed 2026-09-24. Both front ends were deployed (textile-spark-net `main` `d1ff52a`, Cosora-Admin `main` `106f84c`), and the live bundles were checked for the new readers and the absence of the old selects. Then `20260923190354_profiles_contact_columns_revoke_interim.sql` revoked the grant, with Mitra's approval. `scripts/profile-contact-privacy-check.mjs` 24/24. Against the live sites, `tests/profile-contact-privacy.spec.ts` 4/4 and `tests/profile-edit-routes.spec.ts` 1/1. `myprofileflags-fixed.md` → MPF-19 |
| 2026-09-23 | A buyer wrote their own `calls` rows, and vendor call analytics trusted them: any vendor, any timestamp, any direction and context text, even while suspended, with UPDATE and DELETE afterwards | Low (analytics integrity; nothing exposed) | `calls_insert` and `calls_write` (FOR ALL) on `public.calls`, both only `buyer_id = auth.uid()` | Fixed 2026-09-23 (My Profile Phase 12), migration `20260923182259_calls_writes_only_through_log_call.sql`. **Proven before the fix**, rolled back as demo-buyer: a call dated 400 days ago with direction `missed` was accepted, re-targeting and re-dating it was accepted, and deleting it was accepted. Now clients hold no INSERT, UPDATE, DELETE or TRUNCATE on `calls`, both write policies are dropped, and `log_call(vendor, context)` is the only write path: it requires an active caller and a vendor target that isn't the caller, sets `buyer_id`, `direction` and `created_at` itself, cleans the context to 200 characters, and rate-limits (60 s per vendor, 5 per vendor per day, 30 per hour). SELECT is unchanged. **Verified:** rolled-back rehearsal, 18 checks; `scripts/suspension-gate-check.mjs` 9/9 (the log_call pair plus 4 new invariants); a real Call Now click logged once, then rate-limited, and dialled both times; `profile-calls-stat` and `vendor-analytics` 6/6. Detail: `myprofileflags-fixed.md` → MPF-2 |
| 2026-09-23 | **Every user's email and phone number was readable by anyone holding the public anon key, without signing in** | High (PII of all users, unauthenticated) | `public.profiles`: `profiles_select` is `USING (true)`, and anon and authenticated held table-wide SELECT | Fixed 2026-09-23 (My Profile Phase 11), migration `20260923171821_profiles_contact_columns_private.sql`. Table SELECT is replaced by column SELECT on every column except `email` and `phone`, for anon and authenticated. The legitimate readers go through `my_contact_info()` (own row), `call_buyer_contact()` (a buyer's phone for a vendor who has quoted on their RFQ, with callGate's suspension and chat-lock rules enforced in the database), and the admin-gated `admin_profile_search()` / `admin_profile_emails()`. **Verified:** the two proof requests re-run before the fix (still `0-0/20` and `0-0/7`) and after (HTTP 401, 42501, no `Content-Range`, no rows); `scripts/profile-contact-privacy-check.mjs` 24/24; `scripts/contact-gate-check.mjs` 13/13; `tests/profile-contact-privacy.spec.ts` 4/4; regression 25/25. The signed-in half was reopened on purpose until deploy, and closed on 2026-09-24 by `20260923190354` (MPF-19). Detail: `myprofileflags-fixed.md` → MPF-3 |
| 2026-09-23 | New `faqs` table let anyone, signed out, read `created_by`, which names the admin who wrote each FAQ | Low (would identify super admins, with their contact details via MPF-3's open profiles; no rows carried an admin id yet) | `public.faqs` table-wide SELECT for anon/authenticated, granted by `20260923144549` | Fixed 2026-09-23, same phase: `20260923150408` grants column SELECT without `created_by`. Over HTTP as anon afterwards: the app's query returns 200 with 12 rows, and `created_by` returns 42501. Guarded by `tests/faqs-admin-editable.spec.ts` |
| 2026-09-23 | The 370 load-test accounts can now sign in to production, all with one shared password | Medium | `auth.users` rows `loadtest-%@cosora.test` (250 buyers, 120 vendors) | Closed 2026-09-23: the accounts no longer exist. `scripts/loadtest-cleanup.sql` was run (dry run, then commit) and deleted all 370 users with their 370 identities and 170 sessions. Afterwards 0 `auth.users` match `@cosora.test` or `loadtest`, so the shared password opens nothing. It was never in either repo or its history. It is still in `.env` as `LOADTEST_PASSWORD` (now unused) and in old prompt text. Until then the flag stood as logged: repaired on purpose for the Master Prompt 12 load harness, the accounts could act towards real users |
| 2026-09-22 | Load-test fixtures are live in the buyer catalogue: 351 of 377 live products are "[LOADTEST] …" listings, 120 of 130 vendor profiles are "[LOADTEST] Vendor Co N" (40 marked verified), from 370 `loadtest-*@cosora.test` accounts | Medium | `vendor_profiles`, `products`, `profiles`, `auth.users`; created 2026-09-16 17:35–17:39 UTC in the Master Prompt 11 thread (see commit `08a0550`) | Closed 2026-09-23: the population was deleted by `scripts/loadtest-cleanup.sql`: 120 vendor profiles, 577 products, 572 RFQs, 1,082 quotes, 221 conversations, 1,321 messages, 24 ads (and 18 review-log rows), 24 subscriptions, 184 engagement events. Leftover checks are all 0, including every `[LOADTEST]` / `loadtest` text pattern. Real rows are unchanged: 26 live listings, 10 vendor profiles. The 40 unearned verified badges went with their vendors |
| 2026-09-23 | **Plan caps could be exceeded by sending requests at the same time**: a free vendor at 1/2 listings ended at 6/2, and one at 9/10 leads at 11/10 | Medium (paid-entitlement bypass; needs no privilege, only parallel requests) | `enforce_product_cap()`, `enforce_lead_cap()`: count-then-decide with no lock | Fixed 2026-09-23 (Master Prompt 12, Part E), migration `20260923082118_plan_cap_triggers_serialize_per_vendor`: a per-vendor `pg_advisory_xact_lock` before each count. **Proven both ways over real HTTP** with `scripts/cap-race-check.mjs` (10 simultaneous inserts at one free slot, 5 rounds per cap). Before: the product cap was over in 5/5 rounds (2–5 accepted), the lead cap in 4/5 (2 accepted). After: exactly 1 accepted in all 20 rounds at 10 and at 20 concurrency. The 2026-09-16 findings had reported this as a PASS because their probe ran its inserts sequentially in one SQL session. Any vendor with a script, or a double-tapped submit button, could exceed a free plan's listing or lead limit. Every over-cap row the probes created was deleted by the probe itself |
| 2026-09-23 | `quotes_insert` did not check the RFQ's status or who it was addressed to: quotes landed on closed requests, and on requests addressed to a different vendor | Low | `quotes_insert` policy on `public.quotes` (`vendor_id = auth.uid() AND account_is_active(auth.uid())`); `quotes_update` let a vendor move a quote to another RFQ | Fixed 2026-09-23, migration `20260923081708_quotes_only_on_rfqs_open_to_the_vendor` (Mitra: "closed RFQs should not receive any quotes"). New definer trigger `trg_quotes_accepting_rfq` on INSERT and on UPDATE of `rfq_id`/`vendor_id`, applied to every role. **The cross-vendor case, suspected when logged, was proven before the fix:** loadtest-vendor-56 quoted a request addressed only to loadtest-vendor-57, and it was accepted. `scripts/quote-rfq-open-check.mjs`: before 2/6 as expected, after 6/6. Closed and post-close revision are refused P0001; other-vendor is refused 42501; an active open RFQ and an active addressed-to-me request are accepted. A rolled-back probe: moving a quote onto a closed RFQ is refused, and the buyer can still accept a quote on a closed RFQ |
| 2026-09-22 | Privileged writers could still set vendor review numbers — 118 of 130 vendor rows were fabricated again five days after the Master Prompt 8 fix | Medium | `enforce_vendor_profile_admin_fields()` (returned early for every role but `authenticated`) | Fixed 2026-09-22 (Master Prompt 9) — migration `20260922200000_vendor_review_aggregates_single_writer`: computed on INSERT and refused on UPDATE for every role unless `sync_vendor_rating()` is writing; all rows recomputed, mismatched 118 → 0 |
| 2026-09-12 | Paid ad campaigns published to buyers with no review, because the activation guard was BEFORE UPDATE only and the payment path INSERTs | High | `guard_ad_activation()`; `supabase/functions/razorpay-verify-payment/index.ts` (`adRows()` sets `status:"active"`) | Fixed 2026-09-12 (Advertising v3, Phase 1) — guard rebuilt and bound to INSERT; any non-admin insert of `status='active'` is redirected to `pending_review`. Proven live before and after |
| 2026-09-12 | A vendor could revive their own rejected campaign via rejected → paused → active | High | `guard_ad_activation()` (allowed any `paused` → `active`); `enforce_ads_moderation()` (owner exempt from the status check) | Fixed 2026-09-12 (Advertising v3, Phase 1) — non-admin → `active` now raises 42501; the owner exemption is narrowed to `draft`/`pending_review`/`paused_by_vendor`/`archived`. Proven live before and after |
| 2026-09-12 | Campaigns delivered before their own start date — the serving RPC checked `ends_at` but never `starts_at` | Medium | `active_ads()` | Fixed 2026-09-12 (Advertising v3, Phase 3.1) — delivery gates on `is_ad_eligible()`, which checks both bounds, vendor good standing and targeting |
| 2026-09-12 | A suspended vendor's paid campaigns kept serving | Medium | `active_ads()` (no vendor-status check) | Fixed 2026-09-12 (Advertising v3, Phase 3.1) — `is_ad_eligible()` requires `vendor_account_in_good_standing()`, which reuses the existing `account_is_active()` |
| 2026-09-12 | Admin ad takedown wrote status and reason via a bare client UPDATE | Low | `cosora-admin/src/pages/Ads.tsx` | Fixed 2026-09-12 (Advertising v3, Phase 4) — routed through `pause_ad_campaign_by_admin()` / `reject_ad_campaign()` / `resume_ad_campaign()`, which raise on refusal and write `ad_review_log` in the same transaction |
| 2026-09-11 | A vendor could set its own review count and star rating | Medium | `vendor_profiles` (`vprofiles_update` + `enforce_vendor_profile_admin_fields()`) | Fixed 2026-09-11 (Master Prompt 8, Phase 2) — signed-in writes to both columns refused; `sync_vendor_rating()` is the only writer |
| 2026-09-11 | Super-admin demo credential shipped in the production JS bundle and committed to a public repo | Critical | `src/contexts/AuthContext.tsx` (`DEMO_ACCOUNTS`); 16 other tracked files in `scripts/` and `tests/`; more in Cosora-Admin | Fixed 2026-09-11 (Master Prompt 8, Phase 1) — rotated, sessions revoked, old password refused; literal out of every build; all test credentials read from env |
| 2026-09-11 | Unverified claim that image-search's per-IP key cannot be spoofed via `x-forwarded-for` | Low | `supabase/functions/image-search/index.ts` | Closed 2026-09-11 — tested on this deployment; no bypass; comment made precise, parsing unchanged |
| 2026-09-10 | image-search has no rate limit | Medium | `supabase/functions/image-search/index.ts` | Fixed 2026-09-10 |
| 2026-09-10 | No rejection path for non-product images | Low | `supabase/functions/image-search/index.ts`, `src/pages/Search.tsx` | Fixed 2026-09-10 |

The two 2026-09-10 flags were logged and closed in the same edit: they were found and reported (not fixed)
at the end of the previous session on 2026-09-10, deliberately left out of that session's scope, and fixed
in the next one.

## Log

### 2026-10-10 — Edits to approved content, follower counts, and two tests Mitra asked for — Severity: Medium / Low (fixed and live 2026-10-10)
- **Edits.** Mitra decided (2026-10-10) that an edit sends approved content back to review and that staff see what
  changed. Through the API an owner could change a live listing (name, price, description, any detail), a live video
  (caption, the video itself) or a live catalogue, and add, remove or replace a live listing's pictures, all without
  review: the moderation triggers checked the owner's own status change, not the content. The vendor app already
  sends its edits to review, so the gap was the API. `20261010124955_listing_edit_rereview.sql` closes it for all four tables and keeps
  what changed (`admin.listing_edits`), shown on the Products and Videos queues.
- **How "the owner, from a browser" is told apart** in SECURITY DEFINER trigger functions (they must write the admin
  table, so `current_user` is their owner): `current_setting('role') = 'authenticated'` and `auth.uid()` is the
  item's vendor, as `guard_ad_deletion` does. Moderators' updates, definer functions acting for another account
  (counters, ratings), the service role and scheduled jobs are left alone; the harness covers each.
- **Followers.** Nothing maintained `followers_count` and since server_owned_columns a browser can't set it, so the
  number could only be fixed in the database. `20261010125031_follower_count.sql`.
- **Paid-seller ad, tested end to end** on the local stack (all four paid plans) and, rolled back, on production: the
  server_owned_columns fix holds at every door a browser has (table, functions, purchase). Locally this needed a third
  side runtime serving the ad functions with the mock Razorpay keys (`scripts/local-stack/README.md`).
- **Following page, tested:** only followed sellers in the followed sections. Not a security issue, logged for scale:
  it loads every seller and live listing into the browser.
- **Still open, for Mitra:** catalogues have no approval screen; reviews need no dealings with the seller; the
  verify-payment "already" answer to a non-owner.
- Related changelog entry: 2026-10-10 (Edits, followers, and two tests)

### 2026-10-10 — Full test after the release: advertising without paying, and values the server is meant to own — Severity: High / Medium (fixed and live 2026-10-10)
- **How it was found:** the full test Mitra asked for on 2026-10-10 (local stack only). After the attack pass on
  plans and payments held (44 attempts), a sweep wrote every column of an account's own rows, one at a time, and read
  the database afterwards. The first pass asked for the row back and was refused on tables with private columns before
  the write was tried; the sweep that mattered sent `Prefer: return=minimal`. Scripts: `scripts/security/full-test/`.
- **Advertising.** `enforce_ads_moderation()` let an owner set four statuses from any status, and
  `resume_ad_campaign()` makes `paused_by_vendor` active. So: draft (no payment) → `paused_by_vendor` → resume →
  live, in the slots and until the date the draft named. The same from `paused_by_admin`, `suspended`, `rejected`
  and `expired`. Nothing held a running campaign's `ends_at`, `placement`, `starts_at`, `created_at`, `title`,
  `image_url` or `product_id`. A browser's insert as `pending_review` reached the review queue with nothing to
  tell it from a paid one, and `approve_ad_campaign()` grants the verified badge for a `trustedSeal` placement.
  `create_certificate_order()` ran for any insert naming `verifiedCertificate`, a draft included. A Free seller was
  already refused (no ads on Free); every paid plan was open.
- **Counts, ratings, dates, vectors.** Listed in the open-table row. `admin.featured_candidates`,
  `spotlight_listings`, `admin.apply_product_cap`, `for_you_products`, `related_products`, `match_products` and
  `search_suggestions` read the product counts. The search vectors could be written but not read, so a seller would
  have had to compute one with the same public model.
- **What already held** (and still does): plan, expiry, verification and the vendor-level rating on
  `vendor_profiles`; a subscription's row, invoices and orders; a quote's status; a review's reply and author; a
  document's verification; a listing's and a video's status; impressions and clicks.
- **The fix** (`20261010060959_server_owned_columns.sql`, live 2026-10-10, applied before its branch was pushed; checked on production as the roles, in a block that rolled back: a running ad's owner has four direct changes refused and can still pause and resume; a listing edit saves while its counts and date stay; views and enquiries still count. No seller there has a paid plan now, so a paid seller's browser insert was checked on the local stack only): described in the changelog entry of the same date. The rule for new work is in
  `documentation/claude.md` ("A row policy is not a column policy").
- **Production:** the same functions (md5 equal), grants and triggers, read from the catalogue; the gap was not tried
  there. All 22 campaigns are active, expired or in review, none dated in the future or ending more than 400 days out.
  None carries an order id (they predate the column), so an unpaid campaign cannot be told apart by data.
- **Not fixed, for Mitra:** (1) *edits to live content.* Options: send a listing back to review only when its name,
  description or pictures change (not price or stock); or keep it live and queue the edit for a moderator; or leave as
  is. (2) *Reviews with no dealings.* (3) *`followers_count` is never updated by anything:* a follow or unfollow leaves
  the number where it was. A functional gap, not a security one; with the guard above, the fix is a definer trigger
  on `follows`.
- Related changelog entry: 2026-10-10 (Full test after the release)

### 2026-10-10 — Subscriptions: the database half of S-1 to S-8 is live — Severity: Info
- P0 to P12 were applied to production on 2026-10-09 with every switch off (changelog, 2026-10-10). The fixes that
  live in the database are in force: **S-1** (`get_vendor_plan` no longer answers a caller with no session; checked
  after P0), **S-3** (invoices can't be edited; corrections are credit notes), **S-4** (least-privilege reads on plan
  orders) and **S-7** (upgrade credit counts live invoices only).
- **Not closed until the edge functions are deployed and `main` is pushed:** **S-2** and **S-5** (the checkout gate
  and `auth.getUser()` are in the payment functions), **S-6** (the GSTIN and PAN checks are in the app), and **S-8**
  (`subscription_fulfil` exists, but the deployed functions still make the old separate calls). The old functions
  keep working on the new database: the two payment-mode triggers fill in what they don't send.
- **Later on 2026-10-10:** the fourteen functions are deployed and `main` carries the app, so S-2, S-5, S-6 and S-8
  are closed with this release. One scheduled job was added, `billing-reconcile` (approved 2026-10-08): it sends the
  service-role key from Vault to this project's own `billing-reconcile` function and nowhere else. Checked after the
  deploy: no function serves a caller without credentials; the two webhooks, which take none, refuse a bad signature.
- New execute grants were compared with the tested copy for anon, authenticated and service_role, function by
  function: no difference. No new scheduled job was created.

### 2026-10-09 — Subscriptions P13: truth pass reviewed — Severity: Info
- **Stricter writes:** with P1's shims off, an order or invoice without its payment mode is refused instead of being
  guessed as "test"; nothing can be recorded in the wrong money mode by omission.
- **Less surface:** `subscription_usage` had insert, update and delete grants for visitors and signed-in users (its
  RLS let nobody through, but the grants were there); they are revoked. Dropping it is in the release runbook.
- **Claims:** the plans page and FAQs no longer promise a dedicated manager to Silver, SMS alerts or a "100%" seal.

### 2026-10-09 — Subscriptions P12: admin tooling reviewed — Severity: Info
- **Who:** the figures, lists, price history and complimentary plans are read by super_admin, finance_admin and support
  (as invoices are); prices and complimentary plans are changed by super_admin and finance_admin only. Every function
  checks the role itself; visitors can't call them; `admin.apply_due_plan_prices` can't be called by any signed-in user.
- **Giving away revenue is bounded and visible:** a complimentary plan never replaces a paid period or autopay (and
  can't race a payment: it takes the same per-vendor lock as activation); at most two years; the reason is required
  and kept in the Admin Log (append-only) and on the grant.
- **Prices can't surprise a payment in flight:** an order and a mandate carry their own price; a price only takes
  effect through the history (who, when, why, what it was before).
- **Search** in the lists is a plain substring match, not a pattern; at most 100 characters.

### 2026-10-09 — Subscriptions P11: bulk import reviewed — Severity: Info
- **The product rules can't be skipped:** `import_products` runs with the seller's own rights (the migration refuses a
  definer version), so the insert policy, the listing limit and moderation apply to every row; nothing goes live.
- **Bounded:** 500 rows a call, 20 calls a day, one at a time per seller (an advisory lock, so the daily count holds
  under concurrent calls); a 5 MB file limit in the page. Image links must be https and are stored as links, not fetched.
- **History rows:** a seller can insert their own `product_import_batches` rows directly (the invoker import needs
  that); it only changes their own history and their own daily count. Another seller's rows can't be read or written.
- **Category lookup** (`category_for_import`) is callable by visitors; it returns ids of public categories only.

### 2026-10-09 — Subscriptions P10: featured listings reviewed — Severity: Info
- **What visitors can call:** `featured_listings`, `spotlight_listings`, `featured_listings_on` and
  `log_featured_impressions`. The first three return only live products and ids that browsing shows anyway.
- **Impressions can't be faked into someone's figures cheaply:** each insert checks the product is live and that its
  seller really has that place, skips the viewer's own, and counts an account or session once per product and place
  per 30 minutes; at most 20 a call. A visitor with many sessions can still add views; the page says "seen", not "sold".
- **Impressions are private:** RLS on with no policies; a seller reads only their own totals (`my_visibility`).
- **Seal tiers** are drawn from plan fields already public on `vendor_profiles`.

### 2026-10-09 — Subscriptions P9: account managers reviewed — Severity: Info
- **Staff see only the vendors they serve.** Every `admin_am_*` function checks `admin.am_serves()`: an account manager
  gets their named vendors and the shared team, never another manager's vendor; support and other roles get nothing.
  Only super admins and managers name a manager, and only an active account manager can be named. Assignments,
  notes and call outcomes are in the Admin Log.
- **A vendor reads only their own thread, calls and notes** (RLS), and writes only through the functions; the
  assignments table has no browser access at all.
- **What leaves the app:** nothing. The bell names who wrote; the words stay on the page.
- **Volume:** 30 messages an hour per vendor under the vendor's lock (forced-overlap test, mutation-checked); one open
  call request per vendor by a unique index.
- **Accepted:** a named manager's first name and photo are shown to their Gold and VIP vendors (the plan); ordinary
  support still shows "Cosora Support" only (D-06).

### 2026-10-09 — Subscriptions P8: the CRM reviewed — Severity: Info
- **A seller's CRM is theirs alone.** RLS lets a vendor read only their own leads, notes and follow-ups; anon nothing;
  staff nothing (P9 will give account managers a summary through a checked function).
- **No way round the functions:** the tables have no insert, update or delete grants for browsers. Each `crm_*`
  function checks the plan (with the switch), the owner and the limits; a requirement can be tracked only when the
  vendor could see it (the overseas rule included), never the vendor's own or a removed one.
- **Volume:** 5,000 leads, 500 notes a lead and 1,000 open follow-ups per vendor, counted under the vendor's own lock
  (forced-overlap test, mutation-checked); the reminder run takes at most 5,000 follow-ups and never runs twice at once.
- **Nothing a buyer wrote leaves the app:** the WhatsApp reminder carries the vendor's own name and a count. The bell
  shows the lead's title (the vendor's copy, tidied) in the app only.
- **Accepted:** a tracked lead keeps a copy of the requirement's title after the requirement closes, as the vendor saw
  it; it is replaced if Cosora removes the requirement. A buyer's later edits don't reach the copy.

### 2026-10-09 — Subscriptions P7: VIP's head start could be skipped — Severity: Low — Fixed before release
- **Found by** the background review of the first P7 commit ("logic-bypass", no detail given). Re-reading the rule's
  inputs: posting decided the head start, but the buyer's update policy lets them change `vendor_id` and
  `category_id` afterwards.
- **The way round:** send an overseas requirement to one seller (no head start, since it isn't open), then open it to
  everyone, and Gold saw it at once. Likewise post with no category, or in a category no VIP lists in, then choose
  the VIP's category. Only the buyer could do it, and only to bring their own requirement to Gold sooner.
- **Fixed:** the stamp also runs when `vendor_id` or `category_id` changes, and gives VIP the head start those
  edits would otherwise skip (from the moment it opens; or from posting, when a category is chosen later). A running
  head start is never shortened. Harness case 19, mutation-checked; two end-to-end checks over PostgREST.
- **Also tightened:** a VIP account that isn't in good standing no longer earns a head start.
- **Checked and fine:** the ranked feed can't be called without a session (no anon grant), so its "caller is the
  vendor" test can't be skipped; the catch-up's run log has one row per requirement; a quote moved onto an
  overseas requirement is checked like a new one.

### 2026-10-09 — Subscriptions P7: overseas requirements reviewed — Severity: Info
- **The rule is the database's.** Every path that hands a requirement to a vendor applies it: the read policy, the
  ranked feed (definer), the quote guard (definer) and lead alerts (definer). The page and the badge only label
  what comes back. The harness reads through each path for every plan.
- **The marks can't be forged.** `overseas`, `buyer_country_code` and `overseas_vip_until` are stamped by a
  trigger and a browser's write is undone, so a buyer can't move their requirement to everyone or end VIP's head
  start, and a seller can't learn more by setting them (checked over PostgREST).
- **What lower plans learn:** a count (this month, open) and nothing else; no ids or titles. The tier function for
  another vendor is the service role's.
- **Accepted:** a buyer chooses their own country, so they decide who sees their requirements; that is the point.
  `admin.support_check_entity` (Help & Support) still accepts any open requirement's id in a ticket, so a seller
  who has an overseas requirement's id can learn that it exists. Ids are random UUIDs and the ticket shows staff,
  not the seller, its title; not changed here.

### 2026-10-09 — Subscriptions P6: a filter was the wrong control — Severity: Medium — Fixed before release
- **Found by** the third background review, of the second fix (filter bypass / parser differential, and two more
  it didn't name).
- **The control changed.** Two rounds of tightening a filter were answered by two more ways round it, which is what
  filters over free text invite. Now **no message that leaves the app carries a buyer's words**: alert email,
  WhatsApp, SMS and digest carry a category, a quantity and the vendor's own name. There is nothing to bypass. The
  tidy function remains for in-app text only and is documented as not a control.
- **Also fixed, from re-reading the commit for what the review didn't name:**
  - `rfqs.title` has no length limit and the tidy ran eight patterns over all of it, inside the buyer's write. Its
    input is now cut to 400 characters.
  - The fan-out's lock was global, so any account posting in a loop could make every other buyer's post wait up
    to three seconds. It is now per buyer.
  - `coalesce(auth.role(), 'service_role')` trusted a caller with no role claim. `admin.trusted_caller()` decides
    by the connection, and fails closed for anything through the API.
- **What is left:** in the app, a buyer's words are shown to vendors as they always were on Leads. Several accounts
  can each spend their own daily cap. The vendor's hourly cap can be exceeded by as many fan-outs as overlap.

### 2026-10-09 — Subscriptions P6: the first fix's filter and limit could be sidestepped — Severity: Medium — Fixed before release
- **Found by** the background security review of the hardening commit (input validation / parser differential;
  race condition / rate-limit bypass), again by category only.
- **The filter.** It matched links and numbers as they are usually typed. A mail or chat app links `evil.com/pay`
  with no scheme; digits can be written in Devanagari; a zero-width character splits "https" for a pattern but not
  for a reader. **Fixed two ways:** the channels where a wrong guess costs most (WhatsApp, SMS, the email's subject)
  no longer carry the buyer's words at all; and `admin.alert_text` now normalises first and removes anything with a
  dot in a name, any scheme, any address and eight or more digits however spaced.
- **The limit.** `buyer_daily_cap` counted committed runs, so requirements posted in the same instant each found
  room. **Fixed:** fan-outs take one advisory lock. Proven by forcing the overlap with two sessions, with and
  without the lock.
- **What is left:** a filter can only remove what it recognises; words alone ("your account is suspended, reply to
  this") still reach an email's body and the bell, quoted as the buyer's. Several accounts can each spend their own
  daily cap. Both are bounded by the per-vendor hourly cap and by moderation of requirements (R3).

### 2026-10-09 — Subscriptions P6: lead alerts could be used to reach vendors — Severity: Medium — Fixed before release
- **Found by** the background security review of the P6 commit (authorization; content injection and abuse), which
  gave categories only; the specifics below are from re-reading the migration against them.
- **Content.** A requirement's title is its buyer's text, and P6 pushed it to up to 50 vendors by bell, email,
  WhatsApp and SMS under Cosora's name. Markup was already escaped by the email renderer, but the words themselves
  could carry a link or a number to call. **Fixed:** `admin.alert_text()` strips links, email addresses and phone
  numbers from everything pushed.
- **Volume.** Nothing limited how many requirements one account could post to set alerts off; the hourly cap is per
  vendor. **Fixed:** `buyer_daily_cap` (5 in 24 hours); one requirement tells at most `max_vendors` in total.
- **Authorization.** `rfqs.embedding` was writable by the requirement's buyer (the update policy covers every
  column and nothing guarded this one, since before P6). With P6 that let a buyer choose which vendors were "close"
  and re-run the second pass by clearing and setting it. **Fixed:** `trg_rfqs_embedding_guard` ignores a browser's
  write; the update pass runs only for the service role. This also protects `match_vendor_rfqs` ranking.
- **Also:** `lead_digest_run` checks its caller as well as its grant; a removed requirement's title no longer shows
  in a vendor's alert history.
- **Left:** a title's long number range (for example "10000-20000 pcs") is dropped from alerts along with phone
  numbers. The requirement itself and the Leads page are unchanged.

### 2026-10-09 — Subscriptions P6: lead alerts reviewed — Severity: Info
- **What a vendor learns from an alert** is what the Leads page already shows them for an open requirement: its
  title, category and quantity. Never the buyer's name or contact.
- **Who is told** is decided in the database (`admin.lead_alert_fanout`), which a browser can't call; the daily run
  is the service role's. A vendor reads only their own alerts (through `my_lead_alerts`) and settings (RLS), and
  writes settings only through `set_lead_alert_settings`.
- **A buyer can't be blocked or slowed into failure by it:** the trigger catches every error, and the matching is
  bounded (`max_vendors`). A buyer can't make it alert twice (one row per requirement and vendor).
- **Consent and switches are P2's:** WhatsApp and SMS need the vendor's recorded consent; the email honours the
  vendor's "New requirements (RFQs)" switch; nothing is queued unless `notification_delivery` lists the vendor.
- **Volume:** at most `hourly_cap` alerts an hour reach a vendor as they happen, and one digest a day.
- **Existing, noted:** `match_rfq_vendors` is callable by any signed-in account (RFQ/leads R2) and returns vendor
  ids and scores for a requirement the caller may not own. Not changed here; worth restricting.

### 2026-10-09 — Subscriptions P5: ad reach reviewed — Severity: Info
- **The plan's reach is decided in the database**, from the plan in force, for every path that creates or edits an
  ad: a browser's write (trigger), the order before payment, and both publish functions. The publish functions run
  as the service role, so they don't trust the stored spec: they ask again and clamp.
- **Fails closed:** if the reach can't be read, nothing is published and a paid order goes to refund review.
- **Who can ask:** `ad_reach_resolve` is the service role's; `ad_reach_check` answers only for the caller's own ad
  or an admin; `ad_viewer_location` and the eligibility functions aren't callable from a browser (the migration's
  self-check). `active_ads` stays open to signed-out buyers and returns no location.
- **A buyer's location is never returned to a vendor.** It is read inside `active_ads` and used only to filter.
- **Closed here:** a vendor in their grace days was treated as Free by the publish functions (they read the
  subscription row themselves); `razorpay-create-order` charged a Free vendor before the publish step refused.
- **Open, for Mitra:** an ad bought on a bigger plan keeps its reach after a downgrade until it ends (reach is
  decided when the ad is made or edited, not at each view).

### 2026-10-08 — Subscriptions P4: plan lifecycle reviewed — Severity: Info
- **Who can pause or resume a listing:** only `admin.apply_product_cap()` (reached from the trigger on
  `vendor_subscriptions`) and the vendor's own `vendor_set_live_products()`, which checks ownership and the plan's
  limit under the cap trigger's lock. A browser's write to `paused_at` or `paused_from` is refused, and a vendor
  can't set `paused` or `live` by hand (the moderation trigger, unchanged). Resubmitting a paused listing is held to
  the limit by the cap trigger.
- **No way round moderation:** a listing resumes into the status it was paused from; any save while paused sends it
  to review on return, so photos or text changed while hidden are reviewed.
- **Grace can't be stretched:** a renewal paid in the grace days starts at the old period end. `grace_days` is
  capped at 28.
- **Internal functions** (`admin.feature_on_for`, `admin.grace_interval`, `admin.apply_product_cap`, the job) are
  not callable from a browser (the migration's self-check). `admin.feature_on_for` has no role test by design: schema
  `admin` isn't exposed.
- **Left as it is:** production has 6 vendors over the Free limit with no plan. P4 doesn't touch them (only a plan
  getting smaller pauses listings). Mitra to decide whether they should be brought under the limit.

### 2026-10-08 — Subscriptions P3: autopay reviewed — Severity: Info (one thing to verify before go-live)
- **Who can set one up:** an Auth-confirmed, registered, active vendor the `subscription_autopay` switch lists, through
  the same checkout gate as a one-off order. The mandate's functions are service-role only (the migration's
  self-check); a vendor reads only its own mandates.
- **Proof of payment:** the checkout signature is HMAC of `payment_id|subscription_id` with the key secret, checked
  in constant time; the subscription must be the caller's. The flow check fails if the order is reversed.
- **Double charging:** one-off checkout is refused while autopay is on; a replaced mandate is cancelled at Razorpay
  and, if that fails, opens a billing incident. A charge of an unexpected amount opens one too.
- **To verify before go-live:** the Razorpay behaviour here is from Razorpay's documentation and a local mock, not
  from Razorpay's test mode. In particular whether `subscription.charged` fires for the upfront payment (handled both
  ways) and the exact authorisation amount with a future start.

### 2026-10-08 — Subscriptions P2: outbound messages reviewed — Severity: Info (no open flag)
- **Addresses at rest:** the outbox keeps each message's email address or phone number. It is in the `admin` schema
  with RLS on and no client privilege; Cosora-Admin sees only masked addresses (`admin_notification_health`); finished
  rows are pruned after 90 days.
- **Opt-in:** WhatsApp and SMS are queued only with a recorded opt-in, written only by the person through
  `set_contact_consent`, with every change kept (`admin.contact_consent_log`).
- **Injection:** payload values are HTML-escaped in email bodies and URL-encoded in link paths
  (`notification-dispatch-check` proves both); WhatsApp and SMS carry plain text.
- **Abuse:** `notify_deliver` and the dispatcher's RPCs are service-role only (the migration's self-check); the admin
  test send goes only to the caller's own address, super admins only, five an hour.

### 2026-10-08 — Subscriptions P1 fixes S-3, S-7 and S-8 on its branch — Severity: Medium
- **S-3** was proven, not assumed: with the immutability trigger removed, the harness's finance-admin browser session
  edits and deletes an issued invoice (cases 13 and 14 fail); with it, both are refused.
- **S-7:** with the live-only filter removed, a demo invoice earns upgrade credit after live payments begin (case 16).
- **S-8:** the four separate calls (claim, confirm, activate, invoice) and the webhook's copy of them are gone. A paid
  order whose plan can't be activated is recorded as paid and opens a billing incident; nothing is left to a console
  line.
- New surfaces checked in the same harness: the `invoices` bucket (a vendor reads only its own folder; a moderator
  nothing), credit notes (the vendor's own only), billing incidents (finance and support read; a moderator is
  refused; resolving needs a note), and every new service-role function refused to browser roles by the migration's
  self-check. `invoice-render` answers 404, never 403, for someone else's invoice.

### 2026-10-07 — Vendor subscriptions audit: eight findings — Severity: High / Medium / Low
- Found during the subscription audit (`cosora testing/subscription-session/SUBSCRIPTION-ANALYSIS-REPORT.md`), read
  against origin/main and the live database. The open-table rows above, dated 2026-10-07, are its findings S-1 to S-8.
- **S-1 was verified live:** in a transaction that rolled back, as `anon` with no JWT, `get_vendor_plan('<vendor>')`
  returned that vendor's usage and `subscription_end`. The cause is the uncoalesced guard this file warns about for
  `ad_category_benchmarks`.
- **S-2:** production had 9 "paid" invoices and none carried a Razorpay payment id. With Razorpay in test mode
  (Mitra, 2026-10-08), published test cards would do the same through a real checkout.
- Fixes S-1, S-2, S-4, S-5 and S-6 (for /subscription) are built on `subscriptions/p0-foundations` (2026-10-08);
  S-3, S-7 and S-8 are planned for subscriptions P1.

### 2026-10-02 — Collecting a masked Aadhaar at seller registration — Severity: Medium (compliance, for counsel)
- **What:** Andy asked for every document in the Seller Registration FAQ to be collected, Aadhaar included. The code had left Aadhaar out on purpose (Aadhaar Act 2016 / UIDAI rules for entities that aren't an authorised KUA/AUA).
- **As built (branch `faq-truth/registration-plans-refunds`, not merged):** a masked copy only (first 8 digits hidden), a consent tick, the private `business-docs` bucket under the seller's own folder (`business_docs_owner_select`: the seller and admins), opened through a 5-minute signed URL, deleted with the account. The number is never asked for or stored, and `vendor_documents_detail_check` refuses an Aadhaar row not marked masked. Phase 11 limits admin reads of `vendor_documents` to super_admin, vendor_ops and support.
- **Risk:** a seller can still upload an unmasked copy; the reviewer is told to check ("Masked copy; check that only the last 4 digits show"), but nothing detects it. Whether a private marketplace may *require* Aadhaar is a legal question (2018 Puttaswamy judgment).
- **Next:** counsel (ToDo.md, "Counsel: confirm collecting a masked Aadhaar at seller registration"); the branch was merged and deployed on 2026-10-02 at the user's instruction ("do this"), before counsel answered. If counsel says no, switching it off means making the Aadhaar row optional in `Onboarding.tsx` and `Kyc.tsx` and deleting the stored files.

### 2026-10-01 — Review of the SECURITY DEFINER functions signed-out callers can run — Severity: Low
- **Asked for:** Andy, 2026-10-01 ("check … and fix if needed"), closing the 2026-09-30 suspected flag.
- **Method:** the live catalog (`pg_proc`, `has_function_privilege('anon', …)`), each body read, the policies that
  call each helper counted (`pg_policy`), and the app's callers found with a search of both repos.
- **The 34 functions, by kind:**
  - **11 trigger or event-trigger functions** (`check_message_blocklist`, `check_message_flag_patterns`,
    `create_certificate_order`, `guard_ad_activation`, `log_ad_submission`, `sync_product_rating`,
    `sync_vendor_rating`, `sync_video_likes_count`, `vendor_contracts_skip_duplicate_version`,
    `vendor_documents_guard_review_columns`, `rls_auto_enable`). No client can call them, and a trigger fires
    without an EXECUTE check, so the grant only put them on the list. **Revoked** by
    `20261001113147_revoke_trigger_function_execute.sql`. Rehearsed first: a signed-in buyer's video like still fired
    `sync_video_likes_count` (likes 1 → 2), a signed-out direct call got 42501, then rolled back.
  - **7 policy helpers** (`account_is_active`, `account_not_deleted`, `admin_role`, `is_admin`,
    `is_conversation_member`, `owns_product`, `owns_rfq`). **Kept.** Postgres runs a policy's functions as the
    querying role: 8 policies written `TO public` call `account_is_active` and 40 call `account_not_deleted`, so a
    revoke would break signed-out reads (for example `video_likes_owner`). For a signed-out caller five answer about
    the caller (false or null). The two account helpers say whether a given account is active or deleted, which
    anyone can already read from `profiles.account_status` (`profiles_select` is `USING (true)`).
  - **6 public read paths** (`active_ads`, `match_videos`, `related_products`, `search_products`,
    `search_suggestions`, `support_status`). **Kept**: signed-out browsing needs them. They return live rows only.
    `match_count` is unbounded, so a caller can ask for every live row at once: cheap to cap later, and public data.
  - **6 signed-out writes by design** (`ad_impression`, `ad_click`, `csp_report_ingest`, `log_engagement_event`,
    `increment_product_view`, `increment_video_view`), plus `increment_product_enquiry`. **Kept.** `ad_impression`
    is capped per session and throttled, `csp_report_ingest` caps its rows, and `log_engagement_event` records
    failures (MPF-23). The four counters have no limit: **new Open flag, 2026-10-01**.
  - **3 signed-in functions** (`get_vendor_plan`, `ad_category_benchmarks`, `submit_report`). **Kept.** For a
    signed-out caller the first two return null (they answer only for the caller's own vendor id, or an admin) and
    `submit_report` refuses non-members. Revoking would turn a null into an error for any caller that runs before
    sign-in settles, for no gain.
- **Not related to admin-completion Phase 11**, which narrows admin SELECT on six tables.

### 2026-09-30 — Help & Support planning session: three findings — Severity: Medium / Medium / unknown (suspected)
- **Found:** during Stage 1 of the Help planning session (verifying the Help audit report). Read-only: no code or data
  was changed. The plan that fixes the first two is `documentation/help-feature-plan.md`.
- **1. The fraud form discards reports** (`src/pages/ReportFraud.tsx`).
  - It asks for the reporter's name, email and phone, the suspect number, a city and a description.
  - Submit only shows "Report submitted. Our team will review it within 48 hours." (`:82`). Nothing is stored or sent.
  - The "attach" box toggles a boolean and never reads a file (`:67`).
  - It is linked from the signed-out home page footer (`Landing.tsx:524`), `/seller` and vendor onboarding.
  - Risk: a fraud victim believes they reported and waits for a review that never comes.
  - Fix: P1 replaces it with a prefilled `mailto:` and drops the 48-hour line; P3 builds a stored report reviewed in
    a restricted Cosora-Admin queue.
- **2. Support chat without the monitoring notice, and invented staff.**
  - `ChatModal` in `Help.tsx` (opened by "Contact Us" and "Start Live Chat") has no `CHAT_MONITORING_NOTICE`.
  - It shows an agent "Abdul" and a two-second "typing" indicator, and never replies.
  - `SupportChat.tsx` (`/profile/help/chat`) shows the notice, but replies on a timer from a canned list and shows
    "Online" and read ticks.
  - Neither sends anything anywhere.
  - Risk: a legal requirement is missing, and users are misled about being helped.
  - Fix: P1 removes both chats; P3 builds a real chat with the notice.
- **3. Suspected: `anon` can execute 33 SECURITY DEFINER functions in `public`.**
  - Supabase's default PUBLIC EXECUTE grant was left on them (the same pattern as the 2026-09-13 ad-helper flag).
  - Checked: `submit_report` refuses callers who aren't in the conversation, so it is safe.
  - Not checked: the other 32. Some are meant to be public.
  - Next step: list them, and revoke from `public` and `anon` where a function isn't meant for signed-out callers.
    This probably belongs with admin-completion Phase 11.

### 2026-09-29 — Discount codes: what stops a vendor pricing their own order — Severity: n/a (design, admin completion Phase 10)
- **The browser never sends a discount or an amount**, only a code. The payment functions price the order,
  and the database decides the discount (`admin.discount_evaluate`).
- **The four RPCs that hold and spend uses are service-role only** (`discount_check`, `_reserve`, `_confirm`,
  `_release`): revoked from public, anon and authenticated, confirmed with `has_function_privilege`, and
  absent from the advisors' anon/authenticated lists. The three tables are in the admin schema with no
  client privileges.
- **Guessing:** ten unknown codes in an hour lock that vendor out of every code for the rest of the hour,
  in the quote and at checkout. A lockout is per vendor account; account creation is OTP-gated.
- **Races:** the last use is taken under the code's row lock; checked with real concurrent requests
  (`scripts/discount-race-check.sql`).
- **₹0 orders** have no signature to check, so fulfilment requires the caller's own order, a stored amount
  of 0 and a redemption that confirms (`free: true` only for `free_` ids).
- **Admin edits:** super_admin and finance_admin only, in the database; a used code's meaning can't change;
  both tables in the Admin Log.
- **Still open (not changed here):** the 2026-09-12 flag. Checkouts run in demo mode because the Razorpay
  keys aren't set, so a vendor activates a plan or submits ads without paying, code or not.

### 2026-09-29 — Self-reviews and forged seller replies — Severity: Medium (fixed the same day)
- **Found:** while auditing the reviews pipeline for Mitra.
  - The insert policies on `reviews` and `product_reviews` checked only `buyer_id = auth.uid()`. A seller could toggle to the buyer side and 5-star their own store or products, and `sync_vendor_rating()` would publish the result. None of the 20 live reviews is a self-review.
  - `reviews_update_own` let a review's author set `reply_body`, so a buyer could put words in the seller's mouth under "Reply from …".
- **Fixed:** `guard_review_write()`, SECURITY DEFINER and not executable by clients, runs BEFORE INSERT/UPDATE on both tables:
  - it refuses a self-review with 42501;
  - it fixes a review's author and subject;
  - it keeps the reply columns unless `reply_to_review` / `reply_to_product_review` set the transaction-local `cosora.review_reply`.
  - Both RPCs are now authenticated-only (they were PUBLIC and anon), and they refuse suspended accounts.
  - Verified by 14 rolled-back SQL cases and `tests/reviews-pipeline.spec.ts`. See changelog 2026-09-29.
- **Left open:** `reviewer_name` is still client-supplied (Open Flags).

### 2026-09-28 — Microsoft Clarity on the buyer site (admin completion Phase 8) — Severity: Low (dormant until configured)
- What was done: Mitra chose "native dashboard + install Clarity". `src/lib/analytics/clarity.ts`
  adds Clarity's tag only in a production build with `VITE_CLARITY_PROJECT_ID` set, after the
  page's load event, and never identifies anyone.
  - Masked in the browser, so never uploaded: 32 routes wrapped in `<ClarityMask>` (sign-in and
    sign-up, chats, onboarding and KYC, profile and settings, requirements, quotes, leads,
    billing, notifications, fraud reports), every dialog, alert dialog, drawer and sheet, the
    vendor page's revealed phone number and Help's delete-account card. Clarity also masks every
    input box in all modes.
- Risks logged (two new Open rows):
  - The script itself can read any page it runs on. Masking limits uploads, not access. No CSP
    limits scripts on the buyer site.
  - Nothing asks for consent before recording; the Terms notice only describes it. Legal review
    is pending (`ToDo.md`).
- Not a risk: the id is not a secret (it's in the tag URL), and the admin panel only links to
  Clarity's dashboard, which needs a Microsoft sign-in.
- Related changelog entry: 2026-09-28 (Phase 8: live activity and Clarity).

### 2026-09-28 — Vendor private fields, Phase 4a: readers first — Severity: High (open until Phase 4b)
- What was done: the fix for the 2026-09-27 Open row, first half. Nothing was revoked yet (the
  MPF-19 order: readers and code first, then the revoke).
  - `my_vendor_private()`: the vendor's own eight fields.
  - `call_vendor_contact(vendor)`: phone and WhatsApp for a signed-in account.
    - callGate's three rules are enforced in the database, and a refusal is 42501 with the reason
      code.
    - **Anti-harvesting:** at most 30 different vendors an hour and 100 a day per account.
      Concurrent calls are serialised per caller with an advisory lock, and the ledger
      (`admin.vendor_contact_reveals`) has no client grants.
    - Nothing is revealed on page load, only when the buyer asks.
  - `admin_vendor_private(ids)`: super_admin, vendor_ops, support and finance_admin only.
  - `has_phone` / `has_whatsapp`: public flags that say a number exists.
  - Both apps now read the eight fields only through these. `select("*")` on `vendor_profiles`
    is gone from both apps' `src/` and from the specs.
- Verified: `scripts/admin-completion/07_vendor_contact.sql` 25/25 as expected. No function, view
  or policy reads the columns as the caller, so 4b affects direct table reads only.
- Found on the way:
  - The Admin Log copies the fields for admin actions (new Open row, Low).
  - `catalog_embedding` (1,536 numbers per vendor) is readable signed out. No client reads it, so
    4b will leave it out of the grant.
- Status: Fixed 2026-09-28 by Phase 4b (`20260928042152`), after the rehearsal caught that the
  app's upserts would be refused and `writeOwnVendorRow()` shipped first.
- Related changelog entries: 2026-09-28 (Phase 4a; before Phase 4b; Phase 4b).

### 2026-09-27 — Admin writes admitted every admin role, and moderation could be bypassed — Severity: High (fixed the same day)
- What was found:
  - The admin panel's `roles.ts` is UX only, and the database didn't match it for writes. RLS write policies admitted any active admin (`is_admin()`), so any admin role could:
    - reprice or delete plans;
    - delete any profile;
    - edit any quote or Video Closeup;
    - rewrite KYC review fields;
    - insert, update or delete analytics events.
  - `guard_ad_activation` let any admin switch a campaign on with a plain UPDATE, skipping the review RPCs and `admin.ad_review_log`.
  - Product moderators could edit a listing's content while approving it, and reject with a blank reason.
  - vendor_ops could extend a plan (trust seal and search boost).
  - Vendors could set their own ad counters.
  - Support could suspend super admins and itself.
  - A match-everything chat pattern was accepted.
  - The dispatch RPC checked the address before the role.
  - The admin roster (emails) was readable by every admin role.
- Where: the policies and functions listed in the Fixed rows above (2026-09-27).
- How it was discovered:
  - the admin-panel research pass of 2026-09-26/27, re-checked live;
  - a baseline run of the harnesses under `scripts/admin-completion/`, which also found the `profiles` DELETE, `engagement_events`, moderator-edit and vendor-counter gaps.
- Risk: a low-privilege admin account (or a stolen session) could change prices, delete accounts, fake verification, and alter what buyers see and what vendors paid for, with no review trail on the ad path.
- Fix applied: migrations `20260927145549`, `20260927150304`, `20260927150657`, `20260927150904` (admin completion, Phase 1). Each was rehearsed in a rolled-back transaction, and each harness was run before, in the rehearsal and live. Harness `04` confirms 12 ordinary app paths still work.
- Status: Fixed. Admin **reads** are narrowed in Phase 11.
- Related changelog entry: 2026-09-27 (admin completion, Phase 1: database write hardening).

### 2026-09-27 — Dummy OTP switched on: any 6 digits sign in as any phone number — Severity: High (accepted for now)
- What was found: Nothing new was discovered. This is a deliberate change that opens a hole.
  Mitra (2026-09-27): "just typing any otp for now should let me log in", and asked for it to
  be logged here. No SMS can be sent yet, so the parked `otp-dev-verify` edge function was
  hardened and deployed, and `src/lib/auth/otp.ts` uses it whenever Supabase refuses to send
  an SMS. Any 6 digits return a real session for the typed number.
- Where: `supabase/functions/otp-dev-verify/index.ts` (deployed 2026-09-27, version 1, JWT
  gate on); `src/lib/auth/otp.ts` (`sendOtp` returns `test_mode`, `verifyOtp` calls
  `verifyDummyOtp`); `src/pages/OtpVerify.tsx` (the "Test mode" notice).
- How it was discovered: requested by Mitra, after the code screen stopped everyone at "No
  code was sent".
- Risk / impact if left unaddressed:
  - **Anyone can be anyone with a phone account.** Typing a number signs in as that number's
    account, so a phone account has no protection at all. Whoever knows or guesses the number
    can read its chats, quotes and requirements, and act as it.
  - **Unlimited accounts.** A script can create an account per number, with no rate limit or
    CAPTCHA, and post requirements or messages from them.
  - **Squatted numbers carry over.** The accounts are created with `auth.users.phone` set, so
    they are the same accounts real SMS sign-in will open later. Someone who signed in as a
    number now still holds a refresh token then.
  - The anon key is public, so the JWT gate only turns away callers who lack it.
- What limits it:
  - It signs in only to accounts it created. They carry `app_metadata.created_by =
    "otp-dev-verify"`, which users can't write. A Google or email account with the same
    number is refused (`phone_exists`), and so is an email signup that claimed the
    `p<digits>@phone.cosora.invalid` address first.
  - It never signs in to an admin. `admin_status_of()` must answer `is_admin = false`, and any
    failure refuses. The parked version read `profiles.is_admin`, which was dropped on
    2026-09-22, so its query would have errored and the check would have been skipped (fail
    open).
  - New accounts take only `full_name`, `phone`, `active_role` and `brand_name` from the
    request, and `handle_new_user()` limits `active_role` to buyer or seller.
  - No email is sent: the magic-link token is generated and redeemed inside the function.
  - The code screen says no SMS was sent and that any 6 digits work. There is no timer and no
    "code sent".
- Tested:
  - Against the deployed function: a new number got a session and a tagged account; the same
    number with another code got the same account; 5 digits and a number without `+` were
    refused; an `is_admin` key in the signup data was dropped.
  - `admin_status_of()` answers true for demo-admin and false for the probe account.
  - Not staged live: the untagged-account and number-on-another-account refusals, which need
    direct `auth.users` edits that the session's safety check blocked; and an admin-number
    refusal end to end, which would write test rows to the admin audit log.
- Fix applied (or recommended fix):
  - Applied: the limits above.
  - Not applied, because each would stop the dummy OTP working on the live site: off by
    default, refusing the production project, a number allowlist, a secret header, and CORS
    limited to the app.
  - To switch it off at once: set the secret `OTP_DEV_BYPASS=off` (Supabase → Edge Functions →
    Secrets). The app goes back to "No code was sent".
  - Before real users sign up by phone, or on the day SMS delivery works: switch it off and
    delete the function. Then review the accounts with `created_by = otp-dev-verify`, and sign
    them out or delete them.
- Status: Open (accepted risk, on Mitra's instruction, 2026-09-27)
- Related changelog entry: 2026-09-27 "dummy OTP signs in" in documentation/changelog.md
### 2026-09-23 — Every user's email and phone readable with the public anon key — Severity: High (fixed; the signed-in half closed 2026-09-24)
- What was found: `profiles_select` is `USING (true)`, and anon and authenticated held
  table-wide SELECT, so `email` and `phone` were readable by anyone with the anon key, which
  ships in the app bundle.
- Where: `public.profiles`, columns `email` and `phone`.
- How it was discovered: My Profile Phase 2 recon (account deletion), with two count-only HTTP
  requests. It was logged then in the Open table. Re-proven at the start of Phase 11, before any
  change: `select=id&email=not.is.null` → `0-0/20`, and the same for `phone` → `0-0/7`.
- Risk / impact if left unaddressed: a complete, unauthenticated list of every user's email
  and phone. Open RFQs are readable by any signed-in user, so any RFQ also led to its buyer's
  contact details.
- Fix applied: migration `20260923171821_profiles_contact_columns_private.sql`.
  - It revokes table SELECT and grants column SELECT on the 7 other columns to anon and
    authenticated. Names, avatars, roles and `account_status` stay readable, as the app needs.
  - Four SECURITY DEFINER readers, with `search_path = ''` and EXECUTE for authenticated only:
    `my_contact_info()`, `call_buyer_contact(buyer)`, `admin_profile_search(term, limit)` and
    `admin_profile_emails(ids)`.
  - `call_buyer_contact()` moves the vendor→buyer phone read into the database, with the RFQ
    relationship (the caller has quoted on one of the buyer's RFQs) and callGate's rules:
    caller suspended, target suspended, chat under review. A refusal is a 42501 whose message
    is the reason code.
  - Callers moved: in the buyer app `AuthContext`, `fetchProfileFull()`, the data export and
    `useCallBuyer()`; in Cosora-Admin the Accounts search, Chats search, chat participants and
    suspension-history actors, plus one admin test script.
  - It was rehearsed rolled back first, with 18 behaviour checks as anon, demo-buyer,
    demo-vendor and an admin. The migration self-asserts the grants.
- Verification: the two proof requests → HTTP 401, 42501, no `Content-Range`, no rows. The
  script and spec results are in the Fixed row.
- **Incident during the fix:** the migration went live before the new front-end code. Both
  production front ends (`cosora.in`, `cosora-admin.vercel.app`) still select the columns
  directly as a signed-in user, so profile loading and the admin searches broke. In that
  window, a profile edit on `cosora.in` could also have saved blanks over the user's name,
  email, phone and photo, because the old edit form seeded itself from the refused read. On
  Mitra's decision, `20260923174653` granted the two columns back to **authenticated only**.
  Signed out stayed closed. The grant stood until both deploys, and `20260923190354` revoked
  it on 2026-09-24 (MPF-19).
- Lesson: revoking a column that clients read is a two-step change. Ship the new readers and
  the code, deploy, check the live bundles, and only then revoke.
- Status: Fixed. Signed out since 2026-09-23 (Phase 11); signed in since 2026-09-24, when
  `20260923190354` revoked the interim grant after both deploys (MPF-19).

### 2026-09-23 — A vendor can mark their own quote accepted — Severity: Low
- What was found: `quotes_update` admits `vendor_id = auth.uid()` with no column guard, so a
  vendor can set their own quote's `status` to anything, including `accepted`.
- Where: `quotes_update` on `public.quotes`. Accepted quotes are read by the buyer's quote
  list and by the vendor's acceptance rate and Total Order Value (`vendorAnalytics.ts`,
  `Quotes.tsx`).
- How it was discovered: Phase 11, while choosing the relationship rule for
  `call_buyer_contact()`. A rolled-back probe as demo-vendor updated 1 row to `accepted`.
- Risk / impact if left unaddressed: a vendor can fake a buyer's acceptance, which the buyer
  then sees in their list, and inflate their own acceptance rate and Total Order Value. It
  gates nothing else today: `call_buyer_contact()` ignores quote status for this reason.
- Recommended fix: a trigger letting only the RFQ owner or an admin change `status`, while the
  vendor edits only price, MOQ, lead time and comment.
- Status: Fixed 2026-09-25 (`20260925173024`). Detail: `myprofileflags-fixed.md` → MPF-18.

### 2026-09-23 — New `faqs` table exposed which admin wrote each FAQ — Severity: Low (fixed the same phase)
- What was found: Phase 9's migration `20260923144549` granted SELECT on the whole of
  `public.faqs` to anon and authenticated. The RLS policy limits the rows to active ones, not
  the columns, so `created_by` was readable without signing in.
- Where: `public.faqs`, column `created_by` (→ `profiles.id`), set by `admin_faq_add()` to
  the calling admin.
- How it was discovered: while documenting Phase 9. A rolled-back probe as anon read
  `created_by` on all 17 rows. All 17 were seeded rows with a null `created_by`, and the
  test rows that carried demo-admin's id had already been deleted, so no admin id was ever
  exposed.
- Risk / impact if left unaddressed: every FAQ an admin adds would carry their profile id.
  Profiles are readable signed out (the open High flag on `profiles_select`, MPF-3), so the
  id resolves to a name, email and phone: a public list of who holds super_admin, which is
  a ready-made target list for phishing.
- Fix applied: migration `20260923150408_faqs_hide_created_by_from_clients.sql`.
  - Clients get column SELECT on every column except `created_by`. It was rehearsed
    rolled-back against live first. Its self-check asserts the column is unreadable, the
    content columns are readable, and there is no write grant, for both roles.
  - After: over HTTP as anon, the app's exact query → 200 with 12 rows, `select=created_by`
    → 42501, and `select=*` → 42501. No client uses `*`.
  - The admin still sees creators: `admin_faq_list()` is SECURITY DEFINER, so column grants
    don't apply to it.
  - The spec now asserts 42501 on `created_by` for anon and demo-buyer.
- Lesson for new public tables: table-wide SELECT plus a row policy still exposes every
  column. Grant columns when a row carries who wrote it.

### 2026-09-23 — Buyer-written `calls` rows feed vendor analytics unchecked — Severity: Low
- What was found: the only write check on `public.calls` is `buyer_id = auth.uid()`. Every
  other column is the client's to choose: `vendor_id` (any profile), `created_at`,
  `product_context` and `direction` within its CHECK list. `calls_write` (FOR ALL) also
  admits UPDATE and DELETE of the buyer's own rows. Nothing checks `account_is_active()`.
- Where: `calls_insert`, `calls_write`; read by `callAnalytics.ts` (`useVendorCalls`) and
  `vendorAnalytics.ts`.
- How it was discovered: Phase 1 of the profile-stats work read the `calls` policies before
  counting. The SELECT side is why the Calls stat filters `buyer_id` (see `claude.md`,
  "A 'my N' count filters on the owner column").
- Risk / impact if left unaddressed: the vendor's call analytics (count, trend, today, top
  contexts) can be inflated, backdated or erased by any signed-in buyer with a script. A
  suspended buyer can keep logging calls. The profile stat can also be inflated, but only
  for the buyer themselves. Not exercised live, so this is suspected, not proven.
- Recommended fix: a SECURITY DEFINER `log_call()` as the only insert path (active account,
  vendor target, server-set `created_at` and `direction`, rate limit); no client
  UPDATE/DELETE on `calls`.
- Status: **Fixed 2026-09-23** (My Profile Phase 12), migration
  `20260923182259_calls_writes_only_through_log_call.sql`.
  - Proven first, in a rolled-back transaction as demo-buyer: a call dated 400 days ago with
    direction `missed` to demo-vendor was accepted; re-targeting it to another profile and
    re-dating it was accepted; deleting it was accepted.
  - The fix, as recommended: `log_call()` is the only insert path, and clients have no
    INSERT/UPDATE/DELETE/TRUNCATE on `calls`. `calls_insert` and `calls_write` are dropped, so a
    grant restored by mistake would still meet RLS with no write policy. The rate limit is the
    account-deletion idiom: a per-caller advisory lock, 60 seconds between calls to the same
    vendor, and caps of 5 per vendor per day and 30 per hour.
  - It also refuses calling yourself, so a vendor can't inflate their own count.
  - Verification is in the Fixed row and in `test.md`.
  - **Production:** the live `cosora.in` bundle still inserts directly. That insert is now
    refused, but the bundle ignores the result and dials anyway, so calls placed there aren't
    logged until the Phase 12 code is deployed (the same deploy as MPF-19).
    Deployed 2026-09-24: the live bundle calls `log_call()` and has no direct insert.
- Related changelog entry: 2026-09-23 "Profile Calls stat is real" and "Phase 12, MPF-2".
  Fuller context: `myprofileflags-fixed.md` → MPF-2.

### 2026-09-23 — Plan caps bypassable by concurrent requests — Severity: Medium (fixed the same day)
- What was found: `enforce_product_cap()` and `enforce_lead_cap()` count the vendor's rows
  and then decide, with nothing serializing two writes from the same vendor. Concurrent
  requests all count the same free slot.
- Where: both trigger functions (they fire on `products` and `quotes`).
- How it was discovered: Master Prompt 12 Part E asked for an advisory lock as insurance
  against a race that the 2026-09-16 probe had NOT observed. Before adding it, the race was
  tested properly: `scripts/cap-race-check.mjs` sent 10 simultaneous HTTP inserts, as separate
  transactions on separate connections, at a vendor with one free slot. That broke the product
  cap in 5/5 rounds (up to 5 accepted, 6/2 listings) and the lead cap in 4/5 (11/10). The
  earlier "PASS" came from inserts run one after another in a single SQL session.
- Risk / impact if left unaddressed: any vendor could exceed a paid limit (listings, monthly
  leads) with a trivial script, or by accident with a double-submit.
- Fix applied: migration `20260923082118`, a per-vendor `pg_advisory_xact_lock` before each
  count. After: exactly 1 accepted in every one of 20 rounds (10 and 20 concurrent). See the
  Fixed table and `technicalimplementation.md` → "Plan caps".

### 2026-09-23 — Load-test accounts made able to sign in; quotes accepted on closed RFQs — Severity: Medium / Low
- What was found: (1) All 370 `loadtest-*@cosora.test` users had NULL in four GoTrue string
  columns, so every sign-in failed with HTTP 500. Repairing them, as Master Prompt 12 Part D
  requires, turns 370 dormant rows into working production accounts that share one password.
  (2) `quotes_insert` admits any quote whose `vendor_id` is the caller's, whatever the RFQ's
  status or target.
- Where: `auth.users` (`loadtest-%@cosora.test`); the `quotes_insert` policy.
- How it was discovered: Master Prompt 12. (1) The Part D repair itself: four untouched
  accounts returned 500 before and 200 after. (2) The Part A live check: a quote on a
  targeted RFQ the buyer had just closed was accepted, while the vendor's own read of that
  RFQ returned 0 rows.
- Risk / impact if left unaddressed: (1) Anyone with the password can act as 120 vendors and
  250 buyers towards real users until cleanup. (2) Buyers can receive quotes on requests they
  closed. A cross-vendor quote needs an RFQ id the vendor cannot list.
- Fix applied (or recommended fix): (1) None yet, by design. Run the Part G cleanup script
  when testing is done, and rotate the password first if that is not soon. (2) None; this is a
  product decision (should a closed RFQ accept quotes?). If it should not, add
  `exists (select 1 from rfqs r where r.id = rfq_id and r.status = 'active' and (r.vendor_id
  is null or r.vendor_id = auth.uid()))` to the policy's WITH CHECK.
- **Update, same day:** (2) decided and fixed. Mitra: "closed RFQs should not receive any
  quotes". Implemented as a trigger rather than the WITH CHECK above, so the vendor gets a
  specific message and every role is covered (migration `20260923081708`). The cross-vendor
  case was proven exploitable before the fix. See the Fixed table.
- **Update, same day:** (1) closed. `scripts/loadtest-cleanup.sql` was run, dry run then
  commit, and deleted all 370 accounts with their identities and sessions. The shared
  password now signs in to nothing. See the Fixed table and the changelog entry "load-test
  population deleted".

### 2026-09-22 — Primary login moved to mobile + OTP with delivery stubbed: the risks to settle before go-live — Severity: Medium (High for option B, design-time)
- What was found: Mobile number + OTP was restored as the primary sign-in and signup (branch
  `auth/restore-mobile-otp`). All send/verify goes through `src/lib/auth/otp.ts`. No code
  can be delivered yet: the in-house OTP API is not integrated, and Supabase answers
  `phone_provider_disabled`. Nothing is exploitable today. What matters is what must be true on
  the day delivery is switched on.
- Where: `src/lib/auth/otp.ts`, `src/pages/Login.tsx`, `src/pages/Register.tsx`,
  `src/pages/OtpVerify.tsx`; Supabase Auth phone and hook settings; the future `otp-verify`
  edge function if option (B) is chosen.
- How it was discovered: designing the integration seam for the restore-mobile-OTP brief
  (2026-09-22).
- Risk / impact if left unaddressed:
  - **SMS pumping / toll fraud:** the send endpoint is unauthenticated by nature, so without
    limits anyone can make the platform pay to text arbitrary numbers.
  - **Code brute force:** 6 digits is 10^6, trivial without an attempt cap.
  - **(B) only:** a session-minting edge function that trusts its caller would be a full
    authentication bypass.
  - **Client-supplied metadata:** the signup data rides on the OTP request from the browser.
    `handle_new_user()` whitelists `active_role` to buyer/seller, and admin status is not
    settable from metadata at all. Since Phase 5c (2026-09-22) `profiles` has no admin column;
    admin identity is only `admin.admin_users`, written only by the admin_* RPCs or as postgres.
    That must stay true on any new path.
- Fix applied (or recommended fix):
  - Nothing to fix yet.
  - Before go-live: per-number and per-IP send limits, a verify-attempt cap with lockout, short
    code expiry, and ideally a CAPTCHA on send.
  - Prefer option (A), Supabase's Send SMS hook, which keeps generation, verification and
    session issuance inside Supabase.
  - If (B): verify server-to-server, keep the secret server-side, make codes single-use and
    bound to the E.164 number, and create users without client control of privileged columns.
- Status: Open (monitoring until integration)
- Related changelog entry: 2026-09-22 "Auth · mobile number + OTP restored as the primary
  login" in documentation/changelog.md

### 2026-09-11 — Super-admin demo credential shipped in the production bundle — Severity: Critical
- What was found: `DEMO_ACCOUNTS` in `src/contexts/AuthContext.tsx` is a module-level export
  holding the email and the shared demo password for `demo-buyer`, `demo-vendor` and
  **`demo-admin@cosora.dev`, which is a `super_admin`** on the live project. `DevAccountSwitcher`
  correctly renders nothing in production (`if (!import.meta.env.DEV) return null`), but the
  constant it reads is not dev-gated, so the literal ships in the bundle whether or not the
  button renders.
- Where: `src/contexts/AuthContext.tsx` (the constant). The same password is also hardcoded in
  16 other tracked files under `scripts/` and `tests/` (`git grep` on HEAD, 2026-09-11). The
  repository `abhishekmitraaa/textile-spark-net` is public. The password has been in the
  repository since 2026-07-05 (`2ac5be8`).
- How it was discovered: Master Prompt 7 (buyer-trust thread), Phase 5 — the Bunny spec signs
  in as demo-admin. Confirmed in a local production build (`dist/assets/index-*.js`) AND on the
  live deployment: the bundle served by `textile-spark-net.vercel.app` on 2026-09-11
  (`/assets/index-DGTU6TCp.js`) contains the admin email and password as a string literal.
- Risk / impact: anyone who opens devtools on the production site, or reads the public repo,
  can sign in to Cosora-Admin as a super_admin — suspend accounts, approve or reject KYC and
  content, open every vendor's KYC scans through signed URLs (`business_docs_owner_select`
  admits `is_admin()`), and read admin-only tables. Removing the literal from the bundle does
  NOT undo the exposure: it is in public git history and in every bundle already deployed.
- Fix applied (2026-09-11, Master Prompt 8, Phase 1), in the order recommended above:
  1. **Rotation, first, before any code.** A new random password per account was generated
     and bcrypt-hashed locally; only the hash was sent to the database
     (`auth.users.encrypted_password`), so no new value appears in any tool log or file but
     the gitignored `.env`. In the same transaction every `auth.sessions` row was deleted and
     every `auth.refresh_tokens` row revoked, because a password change alone does not end a
     session an attacker may already hold (demo-admin had 1 live session and 1 unrevoked
     refresh token at the time). Accounts: demo-admin, and — on Mitra's decision —
     demo-buyer and demo-vendor. Also rotated, because their passwords were in the same
     public repo: `zz-mp4-vendor`, `zz-mp5-link` and the three `zz-test-vendor-*` accounts.
     Verified with a password grant against `/auth/v1/token`: each old password now returns
     HTTP 400 `invalid_credentials`; each new one returns 200.
  2. **demo-admin keeps `super_admin`** — Mitra's decision, asked rather than assumed. Its
     password is now a secret held only in `.env`.
  3. **No build can contain a demo password.** `vite.config.ts` defines `__DEMO_PASSWORDS__`
     from `.env` only when `command === "serve"`; every build, including `build:dev`, gets
     `null`, and `DEMO_ACCOUNTS` is `null` without it. Verified: after `npm run build`, no
     file in `dist/` contains the old password, any new one, or even the demo-admin email.
  4. **Every test credential comes from the environment.** `scripts/lib/test-credentials.mjs`
     in both repos (process env first, then `.env`); names in `.env.example`; CI maps them
     from repository secrets. Scripts call `credential()`, which throws with the variable's
     name; specs use `optionalCredential()` plus `test.skip`, the pattern
     `mp7-admin-vendor-panels.spec.ts` introduced. Beyond the 17 files counted above, the
     sweep found the throwaway-vendor password in 7 more textile-spark-net files (one of them
     a tracked handoff file under `screenshots/`, written by `vendor-signup.spec.ts`, which
     no longer writes it), and the rlstest/chatfx fixture password in 13 Cosora-Admin files,
     including the two seed scripts that create admin logins. The seeds now read
     `current_setting('cosora.fixture_password')` and abort if it is unset. No fixture
     account exists today, so nothing needed rotating there. Verified: `git grep -lF` for
     each of the three old values returns 0 files in both repositories.
- Still true, and not fixable: the old passwords remain in public git history and in
  previously deployed bundles. Rotation is what makes them worthless. CI secrets must be
  created in GitHub by a human; until they are, the specs that need them skip.
- Status: Fixed 2026-09-11
- Related changelog entries: 2026-09-11 (Master Prompt 7, buyer-trust thread · security finding);
  2026-09-11 (Master Prompt 8 · Phase 1)

### 2026-09-11 — A vendor could set its own review count and star rating — Severity: Medium
- What was found: `vendor_profiles.reviews_count` and `rating_avg` are what buyers see as a
  supplier's reputation (vendor page, New Arrivals tiles, RFQ vendor cards). `vprofiles_update`
  admits `id = auth.uid()`, and `enforce_vendor_profile_admin_fields()` guarded only
  `is_verified`, so a vendor could write both numbers directly.
- Where: `vendor_profiles` RLS + `enforce_vendor_profile_admin_fields()`.
- How it was discovered: Master Prompt 8, Phase 2, while making the vendor aggregates truthful.
  Proven, not inferred: signed in as demo-vendor through the anon key, an update setting its
  own `reviews_count` 5 → 10004 and `rating_avg` → 5 was ACCEPTED; reverted immediately.
- Risk / impact: any vendor could claim thousands of reviews and a 5.0 rating.
- Fix applied: migration `20260911120000_vendor_review_aggregates_truthful.sql`. The trigger
  forces both to 0 on a signed-in INSERT and raises `42501` on a signed-in UPDATE that changes
  either. `sync_vendor_rating()` is SECURITY DEFINER, so it runs as the owner and stays the
  only writer. Verified after applying: the vendor's self-write → `REFUSED 42501`; a
  super_admin's write → `REFUSED 42501`; an ordinary vendor profile update → ok; a buyer
  editing their own review still moves the aggregate (4.4 → 3.8 → 4.4 on revert).
- Status: Fixed 2026-09-11
- Related changelog entry: 2026-09-11 (Master Prompt 8 · Phase 2)

### 2026-09-11 — Product-level counters are vendor-writable and have no real source — Severity: Low
- What was found: `products.rating_avg`, `reviews_count` and `sold_count` have no writer and
  no source (`reviews` has no `product_id`; there is no orders table), and `products_update`
  admits `vendor_id = auth.uid()` with no guard on these columns.
- Where: `products` RLS; read by `src/lib/queries/products.ts` for listing cards.
- How it was discovered: Master Prompt 8, Phase 2, next to the vendor-level fix above.
- Risk / impact: the cards already show seeded values (Mitra chose to keep them for now),
  and a vendor could also raise its own. Guarding them before they are computed from
  something real would only freeze the seed values.
- Fix applied: none — deliberately, on Mitra's decision about the cards.
- Status: Open
- Related changelog entry: 2026-09-11 (Master Prompt 8 · Phase 2)

### 2026-09-11 — Public vendor profile invents a vendor's missing identity and contact details — Severity: Medium
- What was found: on `/vendor/:id`, every empty field on a REAL vendor falls back to a
  hardcoded demo value. The fallbacks cover the Company MD / owner name, phone, email,
  website and a Gwalior street address in the contact card, plus a GSTIN and PAN in "Detailed
  information", an About paragraph and a stock banner. A buyer can call a phone number, or
  trust a GSTIN, that belongs to no one on the platform.
- Where: `src/pages/VendorProfile.tsx` — `detailRows`, `detailRowsResolved`, `contactRows`,
  `contactAddress`, `aboutText`, `websiteValue`, `bannerSrc`.
- How it was discovered: Master Prompt 8, Phase 2, while removing the same page's invented
  rating fallback.
- Risk / impact: misattributed contact details and fabricated tax identifiers on a real
  business's public page.
- Fix applied: none — Mitra chose to log it for a later round. The fix is to render "Not
  provided" or omit the row, as `/product/:id` already does.
- Status: Open
- Related changelog entry: 2026-09-11 (Master Prompt 8 · Phase 2)

### 2026-09-22 — Privileged writers could still set vendor review numbers — Severity: Medium
- What was found: Master Prompt 8 made `vendor_profiles.rating_avg` / `reviews_count`
  truthful and refused signed-in writes, but `enforce_vendor_profile_admin_fields()` began
  with `if current_user <> 'authenticated' then return new; end if;`. Any service_role,
  postgres or migration insert could therefore set any number. On 2026-09-16 17:36:02 UTC a
  load-test batch did: 120 "[LOADTEST] Vendor Co N" rows, 118 of them with
  `reviews_count = N` (1–49) and a rating of 3.0–4.9, against 0 rows in `reviews`.
- Where: `enforce_vendor_profile_admin_fields()`; the batch came from the Master Prompt 11
  thread (its commit `08a0550` uses `loadtest-vendor-3@cosora.test`). No script in either
  repository creates it.
- How it was discovered: Mitra's Master Prompt 9 re-audit, 2026-09-22 —
  `total 130, mismatched 118` on the prompt's own query.
- Risk / impact: the one-writer rule held only for app users. Any seed, load test or future
  admin tool running with privileges could hand vendors a reputation they never earned.
- Fix applied: migration `20260922200000_vendor_review_aggregates_single_writer.sql`. On
  INSERT, from any role, both columns are computed from `reviews`, whatever the payload says.
  On UPDATE, from any role, changing either raises `42501` unless the transaction-local
  setting `cosora.review_aggregate_sync` is `'on'`. `sync_vendor_rating()` sets it around its
  own UPDATE and clears it straight after; PostgREST gives clients no way to set it. A
  privileged session can set it deliberately; that is the documented escape hatch, and the
  migration's own recompute uses it. The badge and plan guards added on 2026-09-14
  (`20260914110000`) were carried over unchanged. Verified: mismatched 118 → 0. In a
  rolled-back probe as postgres: a direct UPDATE was refused `42501`; an INSERT claiming
  (999, 5.0) was stored as (0, 0.0); one real review gave (1, 4.0); the setting read `''`
  after the sync, and a direct UPDATE later in the same transaction was still refused.
  Signed in: a vendor's own count, badge date and plan were each refused `42501`; an ordinary
  profile edit worked; a buyer's review edit moved the aggregate 4.4 → 3.8 → 4.4.
- Status: Fixed 2026-09-22
- Related changelog entry: 2026-09-22 (Master Prompt 9, buyer-trust thread)

### 2026-09-22 — Load-test fixtures are live in the buyer catalogue — Severity: Medium
- What was found: 370 `loadtest-*@cosora.test` accounts (250 buyers, 120 sellers), created
  2026-09-16 17:35 UTC, with 120 "[LOADTEST] Vendor Co N" vendor profiles (40 of them
  `is_verified = true`) and 351 "[LOADTEST] …" products, all `live`. That is 351 of the 377
  live products a buyer can see.
- Where: `auth.users`, `profiles`, `vendor_profiles`, `products` (and, per `08a0550`, quotes
  on open RFQs that the anon key cannot see).
- How it was discovered: Master Prompt 9, tracing the 118 mismatched review counts.
- Risk / impact: buyers browse a catalogue that is 93% test listings, from vendors whose
  verified badge was never earned. The project's own precedent is to delete synthetic data
  after a load test and verify 0 remain (the 2026-09-10 scale run, `d3b5ccf` / `1a926ad`).
- Fix applied: none here. Mitra chose to leave the cleanup to the Master Prompt 11 thread that
  created the data (`08a0550`: "The other 369 are left for Part 3"). Only the review
  numbers were corrected (all 120 now read 0 / 0.0).
- **Update 2026-09-23:** removed. `scripts/loadtest-cleanup.sql` (written in Master Prompt 12
  Part G) was run, dry run then commit. The buyer catalogue is now the 26 real live listings.
  0 `[LOADTEST]` products, RFQs, quotes, vendors or ads remain, and every real-row count the
  script tracks is unchanged.
- Status: Closed 2026-09-23
- Related changelog entry: 2026-09-22 (Master Prompt 9, buyer-trust thread); 2026-09-23
  "load-test population deleted"

### YYYY-MM-DD — <short title> — Severity: Critical / High / Medium / Low
- What was found:
- Where (file / module / endpoint / dependency):
- How it was discovered:
- Risk / impact if left unaddressed:
- Fix applied (or recommended fix, if not yet fixed):
- Status: Open / Fixed / Accepted risk / Monitoring
- Related changelog entry: (link the dated entry in documentation/changelog.md, if any)

### 2026-09-11 — Unverified claim that image-search's per-IP key cannot be spoofed via x-forwarded-for — Severity: Low
- What was found: The 2026-09-10 session reported that on this project "the client IP can't be faked"
  via `x-forwarded-for`. That rested on ONE observation: a forged value `zz-xffprobe-…` was counted under
  the real address. The value was not a valid IP, so a gateway that simply discarded malformed entries
  would have produced the same result. Community reports on Supabase disagree. One describes a forged
  value arriving with the real IP appended AFTER it (forged value at position 0); another describes the
  header being overwritten. `image-search` keys its per-IP bucket on position 0 (`.split(",")[0]`).
  If a forged prefix could survive there, anyone could mint a fresh per-IP bucket on every request.
  The global and per-user buckets would still hold.
- Where (file / module / endpoint / dependency): `supabase/functions/image-search/index.ts`, the
  `const ip = …split(",")[0]` line before the `image_search_rate_check` call.
- How it was discovered: Raised as an open question in the brief for the 2026-09-11 session, and
  settled empirically on this deployment instead of from either report.
  - **Method:** a temporary build (v6) echoed its IP-related headers in response to a one-off nonce,
    returning before the limiter and before any OpenAI call. v7 removed it.
  - **Ground truth:** the client's real public IPv4 was confirmed by three independent outside services.
  - **Cases,** 3 requests each plus a curl repeat of (c): (a) no forged header; (b) a forged single
    IPv4; (c) a forged `a, b` pair; (d) a forged non-IP token; (e) a forged IPv6 address; (f) a forged
    `X-Real-IP` only.
  - **Observed, in all 19 requests:** the header that reached the function was exactly
    `<real>,<real>, <upstream proxy>`.
    - No forged value appeared in any position.
    - `X-Real-IP` was stripped entirely.
    - `cf-connecting-ip` carried the real address.
    - The trailing proxy address varied per request (`13.248.105.16`–`.46`).
- Risk / impact if left unaddressed: As tested, none. There is no bypass on this deployment. The real
  risk was the reverse. The textbook hardening ("use the last `x-forwarded-for` entry") would have keyed
  every caller on a shared, rotating proxy address. That would have throttled unrelated buyers together
  and made the per-IP budget meaningless.
- Fix applied: No code change to the parsing; `.split(",")[0]` is correct here. The comment next to it
  now records exactly what was tested and observed, replacing the generic "spoofable/not spoofable"
  wording, and warns against switching to the last entry. Deployed as v7. The probe branch is confirmed
  gone: the nonce now receives `400 no_image`. `claude.md` and `technicalimplementation.md` record the
  same finding with its limits: one date, one IPv4 client, observed platform behaviour, not a Supabase
  guarantee.
- Status: Fixed (question closed; re-open if the platform's proxy chain changes).
- Related changelog entry: `documentation/changelog.md`, 2026-09-11, "x-forwarded-for settled
  empirically on this deployment".

### 2026-09-11 — embed-query's per-IP key parses x-forwarded-for identically but was never probed — Severity: Low
- What was found: `supabase/functions/embed-query/index.ts` derives its per-IP rate-limit key with the
  same `(req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()` that image-search uses, and
  passes it to `embed_query_rate_check`. The 2026-09-11 probe was run against `image-search` only.
- Where (file / module / endpoint / dependency): `supabase/functions/embed-query/index.ts` (the `ip`
  line before the `embed_query_rate_check` RPC).
- How it was discovered: Reading embed-query while settling the same question for image-search on
  2026-09-11. Not edited: embed-query was explicitly out of scope for that session.
- Risk / impact if left unaddressed: Probably none. Both functions sit behind the same Supabase edge,
  and the probe showed that edge rebuilding the header before function code runs, so embed-query very
  likely receives the same `<real>,<real>, <proxy>` shape. But it was not observed for embed-query
  itself. If a forged prefix could ever reach it, only embed-query's per-IP bucket would be bypassable.
  Its global 10,000/hour bucket still bounds spend, at ~$0.00002 per call.
- Fix applied (or recommended fix, if not yet fixed): Recommended, not applied. The next time
  `embed-query/index.ts` is touched, run the same probe against it: a temporary nonce-gated echo of
  `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`, cases (a)–(f) as in the entry above, then
  remove it. Keep `.split(",")[0]` if the result matches, and add the same precise comment. Do NOT
  switch to the last entry: on this deployment that is a rotating proxy address.
- Status: Open
- Related changelog entry: `documentation/changelog.md`, 2026-09-11, "x-forwarded-for settled
  empirically on this deployment".

### 2026-09-10 — image-search has no rate limit — Severity: Medium
- What was found: The `image-search` edge function made one billable OpenAI vision call (`gpt-4o-mini`)
  per request with no limit of any kind: no per-IP, per-user or global ceiling. Its only gate is
  `verify_jwt`, and the anon key that satisfies it ships in the client bundle, so in practice anyone
  could call it. Before 2026-09-10 the exposure was theoretical, because `OPENAI_API_KEY` was unset and
  every call returned `not_configured`. It became live the moment the key was added.
- Where (file / module / endpoint / dependency): `supabase/functions/image-search/index.ts`
  (`POST /functions/v1/image-search`).
- How it was discovered: Reported at the end of the previous 2026-09-10 session, which verified photo
  search end to end with the real key and, as out of scope, noted it as "callable by any holder of the
  public anon key … with no rate limit". It was left unfixed there on purpose. This session confirmed
  it against the deployed v4 source (no limiter call anywhere) before fixing it.
- Risk / impact if left unaddressed: Unbounded spend. A scripted loop could run up OpenAI charges at
  the rate the function can serve, limited only by OpenAI account limits. Every such call also ran a
  real catalogue search.
- Fix applied: New `public.image_search_rate_check()` (migration
  `20260910190000_image_search_rate_limit.sql`), a structural copy of the proven
  `embed_query_rate_check`. It uses a fixed-window UPSERT in the existing `embed_query_rate_limit`
  table under new `img:`-prefixed keys, so embed-query's keys and rows are untouched. There are three
  budgets, checked in order:
  - `img:global`: 300 per hour. This bounds total spend.
  - `img:ip:<addr>`: 10 per 10 minutes.
  - `img:user:<jwt sub>`: 10 per 10 minutes. This is the one bucket a caller cannot spoof.
  The function is SECURITY DEFINER, with EXECUTE revoked from `public, anon, authenticated` (both
  grants; verified with `has_function_privilege`) and granted to `service_role` only. `image-search` v5
  calls it on EVERY request that would reach OpenAI (there is no cache to exempt) and returns
  `{ error: "rate_limited" }` at 200. It fails OPEN if the RPC itself errors, so a limiter outage cannot
  take photo search down. `Search.tsx` shows a dedicated "Too many photo searches" toast for it.
  Verified live: the per-IP limit tripped on exactly the predicted call. The budgets were exercised in
  a self-rolling-back `DO` block at the database layer, and again through the real function and a real
  browser. `get_advisors(security)` showed no new findings.
- Residual risk (accepted, same trade-off as embed-query): the global bucket is shared, so one abuser
  burning 300 calls in an hour disables photo search for everyone until the window rolls. The
  alternative is an unbounded bill. Also observed: this project's gateway sets `x-forwarded-for` itself
  (a client-supplied value was ignored, measured 2026-09-10), so the per-IP bucket is harder to evade
  than the code comment assumes.
- Status: Fixed
- Related changelog entry: `documentation/changelog.md`, 2026-09-10, "Photo search now refuses
  non-product images and is rate limited".

### 2026-09-10 — No rejection path for non-product images — Severity: Low
- What was found: The vision prompt asked for a product query UNCONDITIONALLY, and nothing in the
  function could return "this is not a product photo". Any image produced a plausible garment
  description. A flat blue rectangle came back as "men blue denim jacket" and ran a real search.
  Separately, `Search.tsx` had one catch-all error branch, so every failure (including any future
  error code) showed "Couldn't recognise that image", which blames the photo.
- Where (file / module / endpoint / dependency): `supabase/functions/image-search/index.ts` (the
  prompt and the raw-string response parsing); `src/pages/Search.tsx` (`handleImageFile`).
- How it was discovered: Observed in the previous 2026-09-10 session's real-browser compression
  check. A generated transparent PNG was answered with a fabricated denim jacket, and it was reported
  there as out of scope. Re-confirmed this session from the deployed v4 source: there was no
  classification gate.
- Risk / impact if left unaddressed: An integrity problem rather than an exploitable hole. The
  platform silently presented fabricated matches as results for an irrelevant photo, which conflicts
  with the project rule "no fabricated data on the search surfaces". It also spent a vision call AND a
  catalogue search on input that should have been refused.
- Fix applied: The vision request now uses OpenAI Structured Outputs:
  `response_format` `json_schema` named `image_search_result`, `strict: true`, with required
  `is_apparel_or_textile: boolean` and `query: string | null`. The prompt tells the model to describe
  the item only when the photo clearly shows an apparel, fabric, trim, accessory or other
  textile/fashion product, and otherwise to return false/null ("do not guess"). A false verdict, a null
  query or a safety refusal returns `{ error: "no_match" }`. Unparseable output returns
  `bad_model_output`. `Search.tsx` now has an explicit branch per code, and anything unrecognised gets
  the generic "Image search unavailable" copy, never the recognition copy. Verified live:
  - the real garment fixture still returns a real query;
  - a generated solid-colour square returns `no_match`, and the browser shows "Couldn't recognise that
    image" without running a search;
  - an unknown code (mocked, since the live function cannot be made to produce one) shows the generic
    copy.
- Status: Fixed
- Related changelog entry: `documentation/changelog.md`, 2026-09-10, "Photo search now refuses
  non-product images and is rate limited".
