# My Profile work: flags

Flags raised during the phased My Profile brief (Phase 0 ground-truth pass onward, started
2026-09-23) that were **found and not fixed** in the phase that found them. Each entry has
what someone needs to pick it up later without the original conversation.

- Security flags are **also** logged in `securityflags.md`, per the documentation protocol.
  This file carries more context and cross-references that entry. It doesn't replace it.
- When a flag is fixed, keep its entry, set Status to `Fixed YYYY-MM-DD`, and add the fix and
  how it was verified. Don't delete history.

## Open flags

| ID | Found | Title | Type | Severity | Status |
|---|---|---|---|---|---|
| MPF-1 | 2026-09-23, Phase 1 | Profile Quotes and Chats stats over-count for anyone who is also a vendor or an admin | Correctness | Medium (wrong numbers on the user's own profile; nothing exposed) | **Fixed 2026-09-24** (Phase 13); probe re-run, and the new spec fails on the old code |
| MPF-2 | 2026-09-23, Phase 1 | Buyers write their own `calls` rows, and vendor call analytics trusts them | Security (data integrity) | Low | **Fixed 2026-09-23** (Phase 12); proven first, rolled back |
| MPF-3 | 2026-09-23, Phase 2 recon | Every user's email and phone is readable without signing in | Security (PII exposure) | High | **Fixed 2026-09-23** (Phase 11) for signed-out callers; the signed-in half was reopened on purpose until deploy, and closed 2026-09-24 (MPF-19) |
| MPF-4 | 2026-09-23, Phase 2 | Deletion emails can't go out yet: no `RESEND_API_KEY`, and no verified sending domain | Setup (blocks the feature for real users) | High for the feature | Open, waiting on setup |
| MPF-5 | 2026-09-23, Phase 2 | Cosora-Admin shows a deleted account as "active" | Correctness (admin UI, other repo) | Low | Open |
| MPF-6 | 2026-09-23, Phase 2 | Phone-only accounts will have no email to receive a deletion code, and sign-in is mobile-only, so that becomes every new account | Product gap | **High** once real sign-ups start; nil today | Open, a decision |
| MPF-7 | 2026-09-23, Phase 2 | What anonymization leaves behind | Privacy | Low | Open, by design for now |
| MPF-8 | 2026-09-23, Phase 3 | "Export All Data" covers the brief's tables, not every table the buyer owns rows in | Product scope | Low | Open, a decision |
| MPF-9 | 2026-09-23, Phase 4 | Every profile save rewrites every field; an empty country becomes "India" | Correctness (data layer, pre-existing) | Low | Open |
| MPF-10 | 2026-09-23, Phase 4 | The fake email "Verify" is gone; nothing verifies a profile email | Product gap (was fabricated UI) | Low | Open, removed rather than carried over |
| MPF-11 | 2026-09-23, Phase 6 | A second currency picker in the buyer menu drawer saves nothing and converts nothing | Fabricated UI | Low | Open, left as-is by decision (Mitra, 2026-09-23) |
| MPF-12 | 2026-09-23, Phase 7 | Vendor Settings' notification switches, and the "Notifications: On" label on `/profile`, still imply live delivery | Overclaiming UI | Low | Open |
| MPF-13 | 2026-09-23, Phase 8 | Every page load starts in buyer mode, so a vendor who refreshes sees the buyer sidebar and nav | Correctness (role state, pre-existing) | Medium | Open |
| MPF-14 | 2026-09-23, Phase 9 | The seeded buyer Help FAQs promise features that don't exist | Overclaiming content (pre-existing, moved verbatim) | Medium (buyers are told about escrow and refunds that don't exist) | Open, now editable with no deploy |
| MPF-15 | 2026-09-23, Phase 9 | Vendors have no real support destination; vendor Help is the buyer page and its chat is canned | Product gap (pre-existing) | Medium | Open, a decision |
| MPF-16 | 2026-09-23, Phase 9 content | Andy's Seller Registration and Subscription FAQs promise things the product doesn't do (published verbatim by decision) | Overclaiming content | Medium (vendors are told about proration, alerts and documents that don't match) | Open, by decision |
| MPF-17 | 2026-09-23, Phase 9 content | The Subscription FAQ promises a 7-day money-back guarantee; the Terms say fees are non-refundable, and no refund can run today | Policy conflict | Medium (a public financial promise the Terms contradict) | Open, published by decision |
| MPF-18 | 2026-09-23, Phase 11 | A vendor can set their own quote to "accepted" | Security (data integrity) | Low | Open, proven (rolled back) |
| MPF-19 | 2026-09-23, Phase 11 | Interim: signed-in users can still read every user's email and phone until the new code is deployed | Security (PII exposure), temporary | Medium | **Fixed 2026-09-24**: both front ends deployed, then the grant was revoked (`20260923190354`) |

---

## MPF-1: Profile Quotes and Chats stats over-count for anyone who is also a vendor or an admin

- **Where:** `useProfileStats()` in `src/lib/queries/profile.ts` (about lines 200–216). It is
  rendered by the Quotes and Chats cells of the stats row in `src/pages/Profile.tsx`.
- **What:** both counts are a bare `select("*", { count: "exact", head: true })` with no
  filter, relying on RLS to mean "mine". The code comment says as much: "Counts rely on RLS:
  a buyer only 'sees' quotes on their own RFQs and conversations they're part of". That
  premise holds for a plain buyer only. The live SELECT policies are:
  - `quotes_select`: `vendor_id = auth.uid() OR is_admin() OR owns_rfq(rfq_id)`
  - `conversations_select`: `auth.uid() IN (user_a, user_b) OR (is_admin() AND admin_role() IN ('support','super_admin'))`
- **Who sees wrong numbers:**
  - **Any admin:** Quotes counts every quote on the platform.
  - **A support or super_admin admin:** Chats counts every conversation on the platform.
  - **A user who also sells:** Quotes adds the quotes they *sent* as a vendor to the quotes
    they *received*.
  - A plain buyer's numbers are correct.
- **Evidence (live, 2026-09-23):** a `DO` block counted as `authenticated` under each user's
  JWT claims, then raised an error to roll back. The technique is in `test.md`, Phase 1 entry.

  | Account | Quotes: shown (RLS only) / own | Chats: shown (RLS only) / own |
  |---|---|---|
  | demo-buyer | 2 / 2 | 1 / 1 |
  | admin account (`6f66d05d…`, active_role seller) | **3** / 1 | **4** / 3 |

- **How it came up:** Phase 1 asked for the Calls stat to be counted "the same RLS-reliant
  way quotes/conversations are already counted", after first checking that the `calls`
  policy scopes rows to the caller. It doesn't, so the Calls count filters `buyer_id`
  explicitly (`useCallCount()` in `src/lib/queries/calls.ts`). The same probe showed the
  pattern being copied was itself wrong for these two cells.
- **Why not fixed:** outside Phase 1's scope, which was the Calls stat only. The brief says to
  stop at the end of each phase.
- **Recommended fix:**
  - **Quotes:** count quotes on RFQs the user owns, e.g.
    `.from("quotes").select("id, rfqs!inner(buyer_id)", { count: "exact", head: true }).eq("rfqs.buyer_id", userId)`.
    Decide whether a buyer's "Quotes" means received quotes only; the stat links to
    `/requirement/my-quotes`, which suggests it does.
  - **Chats:** `.or(`user_a.eq.${userId},user_b.eq.${userId}`)`.
  - Then fix the misleading comment. The convention is in `claude.md`: "A 'my N' count
    filters on the owner column. It never leans on RLS alone".
- **Verify by:**
  - Re-run the probe and expect the admin account's figures to become Quotes 1 and Chats 3.
  - Extend `tests/profile-calls-stat.spec.ts`, or add a sibling spec, so Quotes and Chats
    must each equal an independent count and the list they link to.
  - Note that demo-buyer alone can't tell right from wrong here, because its numbers match
    either way. The check needs an account that is also a vendor or an admin.
- **Related:** `changelog.md` 2026-09-23 "Profile Calls stat is real"; `test.md` Phase 1 entry.
- **Status: Fixed 2026-09-24 (My Profile Phase 13).**
- **Fix:** `useProfileStats()` in `src/lib/queries/profile.ts` filters each count on the owner
  column. No migration: the policies are unchanged, and they are right for the pages that
  need the wider view (a vendor's own quotes, the admin queues).
  - **Quotes** = quotes *received* on the user's own RFQs, as recommended above:
    `.from("quotes").select("id, rfqs!inner(buyer_id)", { count: "exact", head: true }).eq("rfqs.buyer_id", userId)`.
    That is the set "Total Quotes" on `/requirement/my-quotes` counts, which the stat opens.
  - **Chats:** ``.or(`user_a.eq.${userId},user_b.eq.${userId}`)``, the same filter as the `/chats` list
    (`useConversations()`).
  - Both counts now throw on a read error instead of rendering 0.
  - The comment that said RLS alone meant "mine" now names the policies that admit more, and
    points at the `claude.md` rule. The `useCallCount()` comment no longer calls these counts
    RLS-reliant.
- **Verified:**
  - The probe, re-run rolled back (counts as `authenticated` under each user's claims). Bare
    (the old query) / new query / owned:

    | Account | Quotes | Chats |
    |---|---|---|
    | admin account (`6f66d05d…`, super_admin, also a vendor) | 3 / **1** / 1 | 4 / **3** / 3 |
    | demo-admin (super_admin) | 3 / 0 / 0 | 4 / 0 / 0 |
    | demo-vendor | 2 / 0 / 0 | 2 / 2 / 2 |
    | demo-buyer | 2 / 2 / 2 | 1 / 1 / 1 |

  - Over REST with real sign-ins, the two new requests equal an independent owner count for
    demo-buyer, demo-vendor and demo-admin.
  - New `tests/profile-quotes-chats-stat.spec.ts`: **2/2**. For demo-admin and demo-buyer, the
    Quotes and Chats cells must equal an independent owner count (taken by a different route
    from the app's) and the page each cell opens. demo-admin stands in for `6f66d05d…`, whose
    password the tests don't hold: RLS shows it 3 quotes and 4 chats while it owns none, and
    the spec asserts that gap before anything else.
    - With the old bare counts put back temporarily, demo-admin **failed** (Quotes: expected
      "0", received "3"), and demo-buyer passed, as the note above predicted.
    - With only the Chats filter removed, demo-admin **failed** on Chats (expected "0",
      received "4").
  - Regression: `profile-calls-stat` and `buyer-settings` with the new spec, 5/5. tsc 0,
    eslint 0.
- **Production:** live since the 2026-09-24 deploy (textile-spark-net `main` `d1ff52a`, bundle
  `index-Clokv8L0.js`). The new spec passes 2/2 against `https://www.cosora.in`.

---

## MPF-2: Buyers write their own `calls` rows, and vendor call analytics trusts them

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-23, Low). Keep both entries in
  step.
- **Where:**
  - Write policies on `public.calls`: `calls_insert` and `calls_write` (FOR ALL). Both check
    only `buyer_id = auth.uid()`.
  - The client write is in `useCallVendor()` in `src/lib/queries/calls.ts`.
  - The readers that trust the rows are `useVendorCalls()` and `callAnalyticsForWindow()` in
    `src/lib/queries/callAnalytics.ts`, and the calls read in `vendorAnalytics.ts`.
- **What:** everything except `buyer_id` is the client's to choose:
  - `vendor_id` may be any profile (the FK is to `profiles`, not to vendors).
  - `created_at` defaults to `now()`, but a client may set it; no trigger overrides it.
  - `product_context` is free text, shown in the vendor's top call contexts.
  - `direction` may be any of `outgoing`, `incoming` or `missed`.
  - There is no `account_is_active()` check. The suspension notice says the user "cannot …
    place calls", but a suspended buyer can still log calls through the API. The UI's
    `callGate()` is client-side only.
  - `calls_write` also allows UPDATE and DELETE of the buyer's own rows after the fact.
- **Impact:**
  - Any signed-in buyer with a script can inflate, backdate or erase any vendor's call
    analytics: count, trend, "N today" on the Advertise strip, and top contexts.
  - A buyer can also inflate their own Profile Calls stat. That affects only themselves.
  - Nothing private is exposed.
- **Evidence:** read from the live policies, the column defaults, the constraints and the
  absence of triggers on 2026-09-23. **Not exercised**, because proving it means writing
  fabricated rows to production. Treat it as suspected until someone tests it with a rolled-back
  insert as `authenticated`.
- **How it came up:** reading the `calls` policies before writing the Phase 1 count.
- **Why not fixed:** a policy and RPC change is outside Phase 1, and it changes the call-logging
  write path used by `useCallVendor()`.
- **Recommended fix:**
  - Make a SECURITY DEFINER `log_call(p_vendor_id, p_product_context)` the only insert path.
    It should require `account_is_active(auth.uid())` and a target with a `vendor_profiles`
    row, set `created_at = now()` and `direction = 'outgoing'` server-side, trim or limit
    `product_context`, and rate-limit per buyer.
  - Revoke client INSERT, UPDATE and DELETE on `calls`, keeping SELECT.
  - Point `useCallVendor()` at the RPC.
- **Verify by:**
  - Before the fix, as `authenticated` and rolled back: a backdated insert against another
    vendor succeeds.
  - After the fix: the direct insert, update and delete are refused, and `log_call` works for
    an active buyer and refuses a suspended one.
  - `scripts/suspension-gate-check.mjs` is the pattern to extend: run each case active and
    suspended, and pass only if the answer changes.
- **Related:** `changelog.md` 2026-09-23 "Profile Calls stat is real".
- **Status: Fixed 2026-09-23 (My Profile Phase 12).**
- **Proven first:** in a `DO` block as `authenticated` under demo-buyer's claims, then rolled
  back:
  - a call to demo-vendor dated 400 days ago, with direction `missed`, was accepted;
  - re-targeting that row to another profile and re-dating it was accepted (1 row);
  - deleting it was accepted (1 row).
- **Fix:** migration `20260923182259_calls_writes_only_through_log_call.sql`.
  - anon and authenticated lose INSERT, UPDATE, DELETE and TRUNCATE on `calls`, and
    `calls_insert` and `calls_write` are dropped. `calls_select` is unchanged: it already
    admits the buyer, the vendor and admins, so dropping `calls_write` (FOR ALL) changed no
    read. The rehearsal counted 2, 3 and 10 visible rows before and after.
  - `log_call(p_vendor_id, p_product_context)`, SECURITY DEFINER with `search_path = ''`:
    - refuses `not_signed_in` and `account_not_active` (42501), and `not_a_vendor` and
      `cannot_call_self` (22023);
    - sets `buyer_id = auth.uid()`, `direction = 'outgoing'` and `created_at = now()`;
    - collapses whitespace in `product_context`, trims it, cuts it to 200 characters, and
      stores empty as null;
    - rate-limits with the account-deletion idiom: a per-caller advisory lock, then
      `rate_limited` (with `retry_after_seconds`) within 60 s of the last call to the same
      vendor, and `too_many_calls` past 5 calls to one vendor in 24 h or 30 calls in an hour.
      A limit is a status, not an error: the dial has already happened, and the tap just
      isn't counted.
  - `useCallVendor()` calls it instead of inserting; logging stays best-effort and the dial
    goes ahead either way. `qc/pipeline.mjs` (workspace root) was switched too.
  - It doesn't refuse a suspended *target* vendor: the brief didn't ask for it, and callGate
    blocks those calls in the UI before logging.
- **Verified:**
  - Rehearsal, rolled back: direct INSERT/UPDATE/DELETE → 42501; visible rows unchanged for
    buyer, vendor and admin; a logged call has the server's buyer, direction and time and a
    200-character cleaned context; a repeat → `rate_limited` (60 s); non-vendor, self and null
    target refused; a 6th call to one vendor in 24 h and a 31st call in an hour →
    `too_many_calls`; suspended buyer → `account_not_active`; anon → 42501.
  - `scripts/suspension-gate-check.mjs`, extended: 9/9. The `log_call()` pair is ALLOW active
    and DENY suspended (`account_not_active`). While active, direct INSERT/UPDATE/DELETE
    return 42501, and a non-vendor target returns `not_a_vendor`.
    - Its ad case had failed on its own since 2026-09-16, because the expiry sweep marked the
      demo vendor's gold subscription `expired` and the fixture only moved the date. The
      fixture now saves and restores the status too.
  - A real Call Now click as demo-buyer on demo-vendor's profile (a temporary spec, deleted
    afterwards): the first tap → `logged`, the second → `rate_limited`, the number shown both
    times, no direct write to `/rest/v1/calls`, exactly one row added.
  - `profile-calls-stat` and `vendor-analytics`: 6/6.
  - The test rows (2 from the gate script, 1 from the click) were deleted with SQL, back to
    the original 10.
- **Production:** until the 2026-09-24 deploy, the live `cosora.in` bundle's direct insert was
  refused. It ignored the result and dialled anyway, so calls placed there weren't logged.
  The deployed bundle (`index-Clokv8L0.js`) calls `log_call()` and has no direct insert
  (checked in the bundle; not click-tested on production).

---

## MPF-3: Every user's email and phone is readable without signing in

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-23, **High**).
- **Where:** `public.profiles`. The policy `profiles_select` is `USING (true)` for role
  `public`, and both `anon` and `authenticated` hold column SELECT on everything, including
  `email` and `phone`. The anon key ships in the app bundle, so it is effectively public.
- **Evidence (2026-09-23):** real HTTP, with only the anon key and no session.
  - `GET /rest/v1/profiles?select=id&email=not.is.null` with `Prefer: count=exact` returned
    `Content-Range: 0-0/20`.
  - The same with `phone=not.is.null` returned `0-0/7`.
  - Only ids and counts were requested, so no personal value was read in proving it.
    `select=email,phone` would return them all.
- **How it came up:** Phase 2 recon. While designing account anonymization, I checked who can
  read the identity columns being scrubbed.
- **Why it matters for Phase 2:** anonymization removes a deleted user's email and phone,
  but every *active* user's are public until this is fixed.
- **Why not fixed in Phase 2:** the fix changes read access that live features depend on:
  - `callGate()` reads `account_status`;
  - `useCallBuyer()` reads a buyer's `phone` so a vendor can call about an RFQ;
  - chat, review and quote surfaces read names and avatars.

  Revoking blindly would break them, so it needs its own phase with a regression pass.
- **Recommended fix:**
  - Revoke column SELECT on `email` and `phone` from `anon` and `authenticated`, and keep the
    others.
  - Add a SECURITY DEFINER read for the user's own contact details.
  - Move the vendor-calls-buyer phone read into a definer function that applies the same
    rules as `callGate()`: an RFQ relationship, no suspension, and no chat under review.
  - Re-run `scripts/contact-gate-check.mjs` and the call and chat specs.
- **Verify by:** the same two anon count requests must fail on those columns (a 401 or 403,
  or a column-permission error). The call, chat and profile flows must still pass.
- **Compounded by (found in Phase 3):** `rfqs_select` lets **any** signed-in user read every
  active open RFQ, not only vendors. demo-buyer sees another buyer's RFQ. With this flag
  open, an RFQ's `buyer_id` leads straight to that buyer's email and phone. Open-RFQ
  visibility is probably intended for the marketplace. The contact columns are the part to
  close.
- **Status: Fixed 2026-09-23 (My Profile Phase 11)** for signed-out callers, which is the
  proven leak. The signed-in half was reopened on purpose until the new code was deployed,
  and closed on 2026-09-24: see MPF-19.
- **Re-proven first:** at the start of Phase 11, the same two anon-only requests still
  returned `0-0/20` and `0-0/7`.
- **Fix:** migration `20260923171821_profiles_contact_columns_private.sql`.
  - anon and authenticated lose table SELECT on `profiles`. They get column SELECT on the
    other seven columns: `id`, `full_name`, `avatar_url`, `active_role`, `onboarded`,
    `account_status` and `created_at`.
  - UPDATE is unchanged, so a user still edits their own email and phone. A filter or
    RETURNING on the two columns needs SELECT, so neither can read someone else's.
  - `my_contact_info()`: the caller's own email and phone. `src/lib/queries/myContact.ts`
    wraps it for `AuthContext`, `fetchProfileFull()` (`/profile`, `/profile/edit`, the
    onboarding prefill) and the data export.
  - `call_buyer_contact(buyer)`: the buyer's phone and name, for `useCallBuyer()`.
    - It applies callGate's three rules in the database, plus the RFQ relationship: the caller
      has quoted on one of this buyer's RFQs, in any status (MPF-18 says why not "accepted").
    - A refusal is a 42501 whose message is the reason, checked in this order:
      `not_signed_in`, `caller_suspended`, `no_rfq_relationship`, `target_suspended`,
      `under_review`. The hook maps them to callGate's copy.
  - `admin_profile_search(term, limit)` and `admin_profile_emails(ids)`: any active admin.
    Cosora-Admin's Accounts search, Chats search, chat participants and suspension-history
    actors use them.
  - Every other `profiles` reader in both repos selects only the other columns. Checked by
    grepping `from("profiles")` and embedded selects in both repos' `src/`, `scripts/` and
    `tests/`, and the edge functions, which use the service role and are unaffected.
  - `rfqs_select` is unchanged, as the brief required.
- **Verified:**
  - The two proof requests → HTTP 401, 42501, no `Content-Range`, no rows.
  - `scripts/profile-contact-privacy-check.mjs` (new, read-only): 24/24 before the interim
    grant.
    - Anon: 7 routes to the columns refused, the other columns readable, the 4 functions
      refused.
    - demo-buyer: others' columns refused, own row via `my_contact_info()`, admin functions
      refused.
    - demo-vendor: the phone of the buyer it quoted, and a refusal for a buyer it never quoted.
    - demo-admin: emails.
  - `scripts/contact-gate-check.mjs`, extended: 13/13. Each suspension and lock state is
    checked for callGate and for `call_buyer_contact()`.
  - `tests/profile-contact-privacy.spec.ts` (new): 4/4.
    - A 27-page sweep as buyer, vendor and signed out, with no refused `profiles` read.
    - A real Call Buyer click: the number is shown, and with the buyer suspended the click is
      refused with the right copy.
    - Cosora-Admin's Accounts and Chats.
  - Regression: 25/25, across:
    - `profile-edit-routes`, which now also asserts the user's own email and phone;
    - `profile-data-export`, `profile-calls-stat`, `buyer-settings` and
      `profile-notifications-honesty`;
    - `vendor-analytics` and `vendor-my-store`;
    - `mp8-product-detail-controls` and `mp7-product-detail-real-data` (reviews).
  - Not runnable: `chat-pipeline`, `admin-chat-moderation` and `mp12-sourcing-loop`. They need
    fixture accounts that no longer exist: there are 0 `cf00000…` profiles, and the load-test
    accounts were deleted. Chat and quotes are covered instead by the sweep, the Call Buyer
    click and the data export.

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

---

## MPF-5: Cosora-Admin shows a deleted account as "active"

- **Where:** `cosora-admin`, in `src/pages/Accounts.tsx` (about line 185) and
  `src/components/AccountStatus.tsx` (about line 136). Both render
  `account_status === "suspended" ? suspended : active`, so the new `'deleted'` value shows
  as a green "active".
- **Effect:**
  - An admin sees a deleted buyer as active and is offered Suspend.
  - The database refuses the suspend: `set_account_status()` answers 42501 for a deleted
    account (verified as super_admin, rolled back). So nothing breaks, but the label is
    wrong and the error is confusing.
- **Why not fixed:** it's in the other repo, outside this brief's buyer-app scope.
- **Fix:** render `deleted` as its own neutral badge with no action buttons, in both places.

---

## MPF-6: Phone-only accounts will have no email to receive a deletion code

- **Where:** `account_deletion_blocker()` returns `no_email` when `auth.users.email` is NULL
  or a `.invalid` placeholder. The mobile-OTP path (`otp-dev-verify`, parked) creates
  exactly those placeholders.
- **Today:** 0 accounts are affected. All 20 real accounts have a confirmed email: they are
  demo, test and admin accounts created before mobile sign-in.
- **Why this is not an edge case (Mitra, 2026-09-23):** sign-in is **mobile number + OTP
  only**, with a dummy OTP for now, and it stays that way. So every account created through
  the real sign-in has a placeholder email, and every such buyer who presses "Delete my
  account" will see "We can't confirm this by email" and be sent to support.
- **Fix, a decision for the owner:** confirm deletion with the same mobile OTP the account
  signs in with, through the same request, code and confirmation tables; only the delivery
  channel changes. It can only be real once real OTP delivery exists, since the OTP is a
  dummy today. Until then the email code serves the existing email-bearing accounts only.
- **Not done now,** because it would touch the OTP path, and sign-in must not change.

---

## MPF-7: What anonymization leaves behind

- **Kept on purpose**, because other people's history depends on them: RFQs, quotes,
  conversations, messages, reviews and calls. The identity on them is scrubbed.
- **Not scrubbed:**
  - **Message text.** A buyer who typed their phone number into a chat still has it there.
  - **Avatar image files in Storage.** `avatar_url` is nulled, but SQL cannot delete Storage
    objects. The files stay reachable by anyone who kept the URL.
  - **Private activity rows:** saved items and folders, follows, recently viewed,
    notifications and video likes. They are tied to "Deleted user", which no one can sign in
    as.
  - **`auth.audit_log_entries`**, GoTrue's own log, which contains the old email.
- **Access-token window:** a token issued before the sweep lives up to 1 hour.
  - Refused with it (verified): INSERTs, profile and buyer-profile writes, and refresh.
  - Not refused: UPDATEs to the user's own rows elsewhere (an RFQ's description, a review's
    text) and reads.
- **Also logged in:** `securityflags.md` (Low).
- **Fix shape, if wanted:**
  - Have the sweep call an edge function that deletes the avatar objects through the
    Storage API.
  - Delete the private activity rows inside `anonymize_account()`.
  - Gate own-row UPDATE policies on `account_is_active()`, as INSERTs already are.

---

## MPF-8: "Export All Data" covers the brief's tables, not every table the buyer owns rows in

- **Where:** `buildAllDataJson()` in `src/lib/queries/dataExport.ts`.
- **What:** the JSON holds exactly the brief's list:
  - the profile and buyer profile;
  - RFQs, and the quotes received on them;
  - conversations and their messages;
  - reviews and product reviews.
- **Not in the file**, though the buyer owns rows there:
  - `calls` (their call log);
  - `saved_items` and `saved_folders`;
  - `follows`;
  - `recently_viewed`;
  - `video_likes` and `saved_videos`;
  - `service_reviews`;
  - `notifications`;
  - `account_deletion_requests`.
- **Why it matters:** the button says "All Data". Under an access request, a buyer could
  reasonably expect the rest.
- **Why not done:** the brief named its tables, and each addition is a scope decision.
- **Fix, if wanted:** each is one owner-filtered read and one section, using the same
  pattern as the existing ones. The spec's ownership checks extend the same way.

---

## MPF-9: Every profile save rewrites every field; an empty country becomes "India"

- **Where:** `saveProfileFull()` in `src/lib/queries/profile.ts`. It was left unchanged on
  purpose: Phase 4 was a UI relocation. It is used by both new routes through
  `hooks/useEditableProfile.ts`.
- **What:** a save writes every column the form holds, not just the edited one:
  - `profiles`: full_name, email, phone and avatar_url;
  - `buyer_profiles`: 15 columns.
- **Side effects of writing every field:**
  - `EMPTY_PROFILE.country` is `"India"`, so an empty country is saved as `'India'`.
    Observed live: demo-buyer's `country` went NULL → `'India'` on a job-title save.
  - `display_name` is overwritten with `full_name`.
  - An empty avatar adopts the Google picture.

  The removed modal behaved the same way, so nothing changed with the move.
- **The one real hazard is closed.** A save before the profile loaded would have written
  blanks over real data. The new pages render no inputs until the row has loaded (the hook's
  `form` stays null until then).
- **Fix, if wanted:** send only changed fields (diff the form against the loaded row), and
  default `country` in the UI rather than in `EMPTY_PROFILE`.

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

---

## MPF-11: A second currency picker in the buyer menu drawer saves nothing and converts nothing

- **Where:** `src/components/buyer/BuyerTopBar.tsx`, about lines 80–88, the "Default
  Currency" block at the bottom of the buyer menu drawer.
- **What:**
  - It is an uncontrolled `<select>` (₹ INR, $ USD, € EUR, £ GBP) with no `value`, no
    `onChange` and no read of `buyer_profiles.regional`.
  - Choosing USD does nothing, and the choice resets when the drawer closes. It isn't even
    saved, unlike the Regional Settings picker.
  - It is **not** partial wiring. It is a second, unconnected surface that the Phase 6 brief
    didn't know about.
- **How it came up:** the Phase 6 repo-wide search. The brief's own grep missed it because
  the select holds literal option strings and never names `regional` or `currency`.
- **Why not changed in Phase 6:** the brief scoped the fix to Regional Settings, and the
  drawer is a surface it didn't anticipate, so it is reported for a decision rather than
  changed.
- **Options:**
  1. **Remove it** (recommended). Currency lives in Regional Settings, which now says
     honestly that prices stay in ₹ INR. A picker that does nothing is fabricated UI.
  2. **Replace it with a link row**, "Currency · ₹ INR ›", to `/profile/regional-settings`,
     showing the saved value. That needs a settings read in the drawer.
  3. **Leave it** until multi-currency pricing is built.
- **Decision (Mitra, 2026-09-23): leave it for now.** It stays in place, unchanged. Revisit
  when multi-currency pricing is built, or earlier if the drawer is reworked. The
  honest-copy pattern from Regional Settings, or option 1 or 2 above, is the fix.

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

## MPF-13: Every page load starts in buyer mode, so a vendor who refreshes sees the buyer sidebar and nav

- **Where:** `src/contexts/UserRoleContext.tsx`. `const [role, setRole] = useState<UserRole>("buyer")`.
- **What:** `role` only ever changes through `setRole` or `toggleRole`, which are called from
  `OtpVerify` (at sign-in), `Onboarding`, and the role switchers (`useSwitchRole`). Nothing
  reads `profiles.active_role` on load. So after any hard load (a refresh, a pasted link, a
  new tab), a signed-in **vendor** runs in buyer mode:
  - `DashboardSidebar` renders its buyer branch (My Profile / Settings → `/profile/settings`);
  - the role-aware bottom nav is the buyer one;
  - `homeHref` is the buyer home.

  The context already reads `profile.active_role`, but only to set `vendorRegistered`.
- **How it came up:** the Phase 8 spec's vendor check.
  - demo-vendor (`active_role = 'seller'`) on a freshly loaded `/notifications` clicked
    "Settings" and landed on the **buyer** Settings page.
  - After switching to Seller with the role switcher, as a real vendor does in-session,
    Settings went to `/settings` as expected, and the spec now does that.
  - The seller branch of the sidebar was not changed in Phase 8.
- **Why not fixed:** outside Phase 8. The fix also sits next to the sign-in flow (`OtpVerify`
  sets the role there), which must not change without a go-ahead.
- **Fix shape:** seed `role` from `profile.active_role` once the profile loads, in the same
  effect that sets `vendorRegistered`, and only until the user switches by hand, so a manual
  switch isn't overridden. Verify with a hard load as demo-vendor on `/seller-home`: the
  seller sidebar should appear without using the switcher.

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

## MPF-19: Interim: signed-in users can still read every user's email and phone

- **Also logged in:** `securityflags.md` (Open Flags, 2026-09-23, Medium).
- **Where:** migration `20260923174653_profiles_contact_columns_interim_authenticated.sql`:
  `grant select (email, phone) on public.profiles to authenticated`.
- **Why it exists:** the MPF-3 fix went live before the code that uses the new readers. Both
  production front ends still run the old code:
  - `cosora.in` (bundle `index-Bl47x8Yt.js`) loads the signed-in user's profile with `email`
    in the select, and the profile pages read `email` and `phone` directly;
  - `cosora-admin.vercel.app` (bundle `index-B920YuHP.js`) searches with `email.ilike` and reads
    participants' emails.

  All of that was refused, so profile loading and the admin's Accounts and Chats broke. A
  profile edit could also have saved blanks over the user's real name, email, phone and photo.
  Mitra chose to re-open the two columns to signed-in users only (2026-09-23).
- **What still holds:** signed out stays closed, and both MPF-3 proof requests still return
  401/42501. The four production queries were checked working again as demo-buyer and
  demo-admin.
- **Exposure until closed:** any signed-in account can read any user's email and phone, as
  that role could before MPF-3.
- **To close:**
  1. Deploy the Phase 11 code in both repos, to `cosora.in` and `cosora-admin.vercel.app`.
  2. Check that the new bundles call `my_contact_info` and `admin_profile_search` and no longer
     contain the old selects. The check used here fetches each `/assets/*.js` and searches for
     the old select strings.
  3. Run `revoke select (email, phone) on public.profiles from authenticated;` as a migration.
  4. Re-run `scripts/profile-contact-privacy-check.mjs` and expect 24/24. While the grant
     stands, its four "buyer cannot read / filter" checks fail by design.
- **Tracked in:** `ToDo.md`.
- **Status: Fixed 2026-09-24.** Mitra approved the revoke once the deploy was checked. By the
  migration versions (UTC), the grant was live for about 77 minutes: `20260923174653` to
  `20260923190354`.
  1. **Deployed.** textile-spark-net `main` `d1ff52a` is on `www.cosora.in` (bundle
     `index-Clokv8L0.js`, was `index-Bl47x8Yt.js`). Cosora-Admin `main` `106f84c` is on
     `cosora-admin.vercel.app` (`index-BzKTnSmz.js`, was `index-B920YuHP.js`).
  2. **Bundles checked.** The buyer bundle calls `my_contact_info`, `call_buyer_contact` and
     `log_call`. The admin bundle calls `admin_profile_search` and `admin_profile_emails`.
     Neither has a `profiles` select string naming `email` or `phone`. Also checked in SQL:
     no invoker-rights function or view reads the columns. Every edge function that reads
     `profiles` uses the service role.
  3. **Revoked** by `20260923190354_profiles_contact_columns_revoke_interim.sql`. Its
     self-check asserts that neither anon nor authenticated can select the two columns, that
     the other 7 columns and UPDATE are kept, and that the contact functions are executable.
  4. **`scripts/profile-contact-privacy-check.mjs` 24/24.**
  - **Live smoke after the revoke,** against `https://www.cosora.in` and
    `https://cosora-admin.vercel.app`:
    - `tests/profile-contact-privacy.spec.ts` 4/4: the 27-page sweep, Call Buyer and its
      suspended refusal, and the admin's Accounts and Chats;
    - `tests/profile-edit-routes.spec.ts` 1/1: saves still land.
    - The demo accounts are back to active, with no open suspension.

---

## Phase 9 decisions (2026-09-23)

1. **Content file:** arrived. It's kept as
   `documentation/seller-registration-and-subscription-faq-content.md` and was loaded
   through the admin RPCs.
2. **Seller Registration placement:** the vendor landing page `/seller` (Mitra's choice). It
   replaces that page's 4 hardcoded questions.
3. **"Lowest billing plan?":** written in Andy's tone from the live plans (Mitra: "write them
   up yourself"). It hardcodes ₹699/₹6,990 and the Free and Basic limits, so it needs
   updating if plan prices change. Worth a read by Andy.
4. **Should `support` write FAQs?** **Still open.** Today support reads and only super_admin
   writes. Widening it means changing the four write RPCs' gates (a migration) **and**
   `SECTION_WRITE.faqs` in Cosora-Admin's `roles.ts`.

---

## Phase 11 decisions (2026-09-23)

1. **Interim grant:** Mitra chose to re-open `email` and `phone` to signed-in users only until
   both front ends run the new code (MPF-19). The alternative was leaving production broken
   until a hotfix deploy.
2. **What "an RFQ relationship" means for `call_buyer_contact()`:** the caller has a quote, in
   any status, on one of the buyer's RFQs. My call, not asked. Quote status can't be trusted
   (MPF-18), so requiring `accepted` would add nothing today. Once MPF-18 is fixed, it can be
   narrowed to `accepted` if that's the intent; "Call Buyer" only renders on accepted quotes.
3. **Admin email access:** `admin_profile_search()` and `admin_profile_emails()` admit any
   active admin. That keeps today's access, because every admin role could read the columns
   before. Narrowing them to support and super_admin is open: product, ads, vendor-ops and
   finance admins would then lose emails on Accounts and Chats.
