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
| 2026-09-24 | Two cron jobs would record success while doing nothing if the Vault `service_role_key` went missing, so accounts past their deletion cooling-off would silently not be anonymized | Low (the key is present today; the consequence is a broken privacy promise, not an exposure) | pg_cron `account-deletion-sweep` (Phase 16) and `fx-rates-refresh` (Phase 20): `select net.http_post(...) where exists (<vault secret>)` | Open. The same silent-success shape `claude.md` records for the embedding worker. Fix shape: a `do` block that raises when the key is missing (as `faq-snapshots-refresh` does), keeping "nothing due" a quiet success for the sweep. Found in My Profile Phase 23; `myprofileflags.md` MPF-27 |
| 2026-09-24 | FAQ edits and deletes leave no record of who made them or what the text was, and support can now edit public FAQ text as well as super_admin | Low (public text; only active support and super_admin admins can write; nothing exposed) | `public.faqs`; `admin_faq_update` / `_delete` / `_reorder` (only `created_by`, set on add; an edit changes `updated_at` only; no history table) | Open, a decision. Phase 22 widened FAQ writes from super_admin to support + super_admin by design (migration `20260924170736`). A changed or deleted answer on the public Help, Subscription or seller page can't be traced to an admin or restored, and Cosora-Admin shows the creator under the "Updated" date as if they were the last editor. Fix shape: a revisions table written by the `admin_faq_*` functions, or at least `updated_by`. `myprofileflags.md` MPF-26 |
| 2026-09-24 | The deployed `subscription-create-order` is older than the repo and lacks the `intent_failed` guard: a failed intent write can let a vendor pay and stay on the old plan | Medium once Razorpay is live; nil today (demo mode: keys unset) | `subscription-create-order` v3 (deployed 16 Jul) vs commit `0fc15f6` (26 Jul). `-verify-payment` and `-webhook` also predate their first commit | Open, a decision: diff, then redeploy all three from the repo (with `_shared/gst.ts`). The same drift as the fixed 2026-09-14 `razorpay-create-order` row. Found in My Profile Phase 20; `myprofileflags.md` MPF-25 |
| 2026-09-24 | WhatsApp account-deletion codes will arrive as Meta's fixed text, "<code> is your verification code.", which doesn't say the code deletes the account | Low (social engineering; dormant until WhatsApp is configured) | `supabase/functions/account-deletion/index.ts` (`sendWhatsApp`) and the Meta template it names (`WHATSAPP_TEMPLATE`) | Open, setup guidance. Someone holding a stolen session could request a deletion, then ask the owner for "the verification code"; the email version says what the code is for, and Meta's authentication templates can't. Create the template with Meta's security recommendation ("For your security, do not share this code.") and a 10-minute expiry. Already in place: the code only confirms a deletion and signs no one in, deletion waits 14 days with Cancel on `/profile`, and scheduling posts an in-app notification. My Profile Phase 18; `myprofileflags.md` MPF-24 |
| 2026-09-24 | The parked `otp-dev-verify` edge function signs anyone in as any phone number with any code, and is on by default | Critical if deployed; nil today (not deployed, never committed) | `supabase/functions/otp-dev-verify/index.ts`, untracked. Not among the 16 deployed functions (`list_edge_functions`, 2026-09-24) | Open, parked. Flagged by the automated security review on 2026-09-24. `ENABLED = true`, turned off only by `OTP_DEV_BYPASS=off`; it creates accounts with the service-role key, allows CORS `*`, and has no allowlist or secret. Never deploy it as it is, and never commit it. Before any use: off by default, refuse the production project ref, a dev-number allowlist, a shared-secret header, restricted CORS, and an admin check that doesn't read the dropped `profiles.is_admin`. Better: delete it once real SMS delivery works. `myprofileflags.md` → MPF-21; `ToDo.md` "Wire up mobile OTP delivery" |
| 2026-09-23 | A vendor can set their own quote's status, including to "accepted", with no buyer involved | Low (integrity of the buyer's quote list and the vendor's acceptance rate and Total Order Value; nothing exposed) | `quotes_update` on `public.quotes` (`vendor_id = auth.uid() OR owns_rfq(rfq_id) OR is_admin()`, no column guard) | Open, proven with a rolled-back probe as demo-vendor: 1 row updated to `accepted`. Found in Phase 11 while choosing the rule for `call_buyer_contact()`, which therefore does **not** trust quote status: any quote by the caller on the buyer's RFQ counts. Fix shape: a trigger letting only the RFQ owner or an admin change `status`, and the vendor only the quote's own terms. `myprofileflags.md` → MPF-18 |
| 2026-09-23 | pg_cron's run history is 63% of the database and grows without limit toward the free plan's 500 MB cap, which makes the project read-only | Medium (availability) | `cron.job_run_details`: 120 MB, 50,692 rows since 2026-09-06, ~3,000 rows/day from two every-minute jobs | Open, a decision for the owner. Pruning deletes run history, and `embedding-health-alarm` deliberately surfaces failures as rows there, so the window must be long enough to notice an alarm. Suggested: a daily pg_cron job `delete from cron.job_run_details where end_time < now() - interval '14 days'` (postgres has DELETE; it cannot VACUUM FULL or index the table, which `supabase_admin` owns). Its full-scan cost was already removed from the health check (migration `20260923093304`) |
| 2026-09-22 | `BUNNY_API_KEY` is rejected by Bunny Stream (401 "Authentication has been denied"), so reconciliation cannot list the library and a vendor delete of a Bunny video cannot remove the paid asset | Low (misconfiguration; cost leak, not access) | Edge-function secret `BUNNY_API_KEY` used by `bunny-reconcile`, `bunny-delete-video`, `bunny-upload-url` | Open. Found during admin-schema separation 5b: as super_admin `bunny-reconcile` passed authz and got 401 from `video.bunnycdn.com`. Most likely a rotated or wrong key. Today 0 `product_videos` rows use the bunny provider, so nothing is leaking yet. If uploads switch to Bunny while the key is bad, each delete fails with `bunny_delete_failed` (the function refuses to report success). Fix: set a valid library API key and re-run `bunny-reconcile`. The key value is not recorded here |
| 2026-09-22 | Mobile + OTP is the primary login but has no delivery yet. When the in-house OTP API is wired, OTP brute-force and SMS-pumping (toll-fraud) protection must exist before it goes live | Medium | `src/lib/auth/otp.ts` (the single OTP seam); Supabase Auth phone settings / the future `otp-verify` edge function | Open, suspected gap, not exploitable today. Nothing is sent now: `phone_provider_disabled`. Once live, an unauthenticated caller can make the platform send SMS to any number, and a 6-digit code is guessable without attempt limits. The seam only surfaces the server's rate-limit error; it does not enforce one. Before go-live: per-number and per-IP send limits, a verify-attempt cap with lockout, code expiry, and ideally a CAPTCHA on send |
| 2026-09-22 | Integration option (B), the custom API verifying codes itself with an edge function minting the session, would make that edge function an authentication authority | High (design-time) | Future `otp-verify` edge function (not written); `TODO(otp-integration)` in `src/lib/auth/otp.ts` | Open, design constraint, nothing built. If (B) is chosen, the function must verify the code with the API **server-to-server**, and never trust a client-sent "verified" flag or API response. It must keep the API secret server-side, bind the code to the exact E.164 number, make codes single-use, rate-limit, and create or find the user without letting client metadata set `is_admin` (`handle_new_user()` whitelists `active_role` only; keep it that way). Option (A), Supabase's Send SMS hook, keeps generation and verification inside Supabase and avoids this class entirely |
| 2026-09-11 | Public vendor profile fills a vendor's empty identity and contact fields with invented values (GSTIN, PAN, owner, phone, email, address) | Medium | `src/pages/VendorProfile.tsx` (`detailRows`, `contactRows`, `contactAddress`, `aboutText`, `bannerSrc`) | Open — logged only, on Mitra's decision (Master Prompt 8) |
| 2026-09-11 | Product-level `rating_avg` / `reviews_count` / `sold_count` are vendor-writable and have no real source | Low | `products` (`products_update` admits `vendor_id = auth.uid()`; no guard on these columns) | Open — cards keep showing them on Mitra's decision; guard them when they are computed from something real |
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
- Status: Open. Detail: `myprofileflags.md` → MPF-18.

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
