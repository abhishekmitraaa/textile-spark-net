# My Profile work: fixed flags

Flags from the phased My Profile brief that have been **fixed**. They were moved here out of
`myprofileflags.md` on 2026-09-24 (Mitra: keep only open flags and open decisions there).
Each entry still has what was found, the fix and how it was verified. This file also holds
the decisions each phase recorded.

- Earlier references to these flags "in `myprofileflags.md`" (in `changelog.md`, `test.md`,
  migrations and scripts) now mean this file.
- Open flags and open decisions: `myprofileflags.md`. IDs are never reused.

## Fixed flags

| ID | Found | Title | Type | Severity | Status |
|---|---|---|---|---|---|
| MPF-1 | 2026-09-23, Phase 1 | Profile Quotes and Chats stats over-count for anyone who is also a vendor or an admin | Correctness | Medium (wrong numbers on the user's own profile; nothing exposed) | **Fixed 2026-09-24** (Phase 13); probe re-run, and the new spec fails on the old code |
| MPF-2 | 2026-09-23, Phase 1 | Buyers write their own `calls` rows, and vendor call analytics trusts them | Security (data integrity) | Low | **Fixed 2026-09-23** (Phase 12); proven first, rolled back |
| MPF-3 | 2026-09-23, Phase 2 recon | Every user's email and phone is readable without signing in | Security (PII exposure) | High | **Fixed 2026-09-23** (Phase 11) for signed-out callers; the signed-in half was reopened on purpose until deploy, and closed 2026-09-24 (MPF-19) |
| MPF-5 | 2026-09-23, Phase 2 | Cosora-Admin shows a deleted account as "active" | Correctness (admin UI, other repo) | Low | **Fixed 2026-09-24** (Phase 15, in Cosora-Admin) |
| MPF-6 | 2026-09-23, Phase 2 | Phone-only accounts will have no email to receive a deletion code, and sign-in is mobile-only, so that becomes every new account | Product gap | **High** once real sign-ups start; nil today | **Fixed 2026-09-24** (Phase 18), WhatsApp send unverified pending Meta Business setup (MPF-24) |
| MPF-7 | 2026-09-23, Phase 2 | What anonymization leaves behind | Privacy | Low | **Fixed 2026-09-24** (Phase 16): avatar files, private activity rows and the access-token window. Message text and GoTrue's audit log stay, by design |
| MPF-8 | 2026-09-23, Phase 3 | "Export All Data" covers the brief's tables, not every table the buyer owns rows in | Product scope | Low | **Fixed 2026-09-24** (Phase 19): vendors contacted and messaged, saved, recently viewed and following are in the file. Still out, by the brief's scope: video likes, saved videos, service reviews, notifications, deletion requests and the call log itself |
| MPF-9 | 2026-09-23, Phase 4 | Every profile save rewrites every field; an empty country becomes "India" | Correctness (data layer, pre-existing) | Low | **Fixed 2026-09-24** (Phase 14), with a sign-in step that blanked the whole profile |
| MPF-11 | 2026-09-23, Phase 6 | A second currency picker in the buyer menu drawer saves nothing and converts nothing | Fabricated UI | Low | **Fixed 2026-09-24** (Phase 20): the drawer picker is the same setting as Regional Settings, and the setting converts displayed prices (display only). GST extracted to `_shared/gst.ts`, uncalled by anything buyer-facing |
| MPF-13 | 2026-09-23, Phase 8 | Every page load starts in buyer mode, so a vendor who refreshes sees the buyer sidebar and nav | Correctness (role state, pre-existing) | Medium | **Fixed 2026-09-24** (Phase 17) |
| MPF-19 | 2026-09-23, Phase 11 | Interim: signed-in users can still read every user's email and phone until the new code is deployed | Security (PII exposure), temporary | Medium | **Fixed 2026-09-24**: both front ends deployed, then the grant was revoked (`20260923190354`) |
| MPF-20 | 2026-09-24, Phase 14 | The sign-in step re-applies a signup name: a vendor's brand on every sign-in, and a buyer's company once it has been cleared | Correctness (pre-existing) | Low (not reachable until OTP sign-in is live) | **Fixed 2026-09-24** (Phase 14, on request) |

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
- **Status: Fixed 2026-09-24 (My Profile Phase 15), in Cosora-Admin.**
- **Fix:**
  - `AccountStatusBadge`, exported from `src/components/AccountStatus.tsx`, is now the one
    place `account_status` gets a label and a tone:
    - `active` → green;
    - `suspended` → red;
    - `deleted` → a neutral grey "deleted";
    - any other value → shown as itself in grey, never as "active".
  - It is used in the Accounts table, the Account status card, and the **Vendors list**.
    `src/pages/Vendors.tsx` had the same suspended-or-active test. The brief named two
    places; the third was found by a grep for the same pattern.
  - **Account status card, for a deleted account:**
    - no Suspend or Reinstate button;
    - a note saying the account was deleted by its owner and anonymized, and that
      `set_account_status()` refuses any change to it;
    - the "What suspending actually stops" notice is hidden;
    - the suspension ledger still shows, for roles that may read it.

    The card is also on each vendor's page, so that is covered too.
  - **Accounts row:** a deleted account's row says "View" instead of "Manage"; there is
    nothing to manage.
  - `database.types.ts` in Cosora-Admin: `account_status_type` gains `'deleted'`, matching
    the live enum. The buyer app's types already had it.
- **Not changed:** screens that only show a badge when an account is suspended (Ads,
  Products, Videos, Chats) never said "active", so they're correct as they are.
- **Verified:**
  - New `tests/admin-deleted-status.spec.ts`, 2/2, as demo-admin against Cosora-Admin on
    :5174.
  - **How the deleted account was made:** no deleted account exists, and one can't be made
    for a test, because `'deleted'` is terminal. Only `anonymize_account()` sets it,
    `set_account_status()` refuses it, and `guard_deleted_account()` refuses every
    signed-in write to the account. So the spec rewrites `account_status` in the admin's
    own responses, in the browser only: demo-buyer reads as deleted, demo-vendor as
    suspended, and demo-admin stays active. Nothing is written, and the spec asserts that
    nothing called `set_account_status`.
  - **Accounts:**
    - the deleted row shows the grey "deleted" badge and "View", with no "Manage";
    - its card shows the note and no Suspend or Reinstate button, and the ledger still
      loads;
    - the suspended row and its card are unchanged (red badge, Reinstate), and so are the
      active row and its card (green badge, Suspend).
  - **Vendors:** the list shows "deleted" for the deleted account and never "active". Its
    vendor page's card has no status button. The suspended vendor's page offers Reinstate.
  - **Against the old code** (Cosora-Admin's `src/` stashed), both tests **failed**: the
    deleted row read "active", and the Vendors row had no "deleted".
  - Regression: `profile-contact-privacy.spec.ts`'s Cosora-Admin test passes. Cosora-Admin
    tsc 0.
  - Screenshots: `screenshots/mpf5-admin-accounts-deleted.png` and
    `mpf5-admin-account-card-deleted.png`.

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
- **Status: Fixed 2026-09-24 (My Profile Phase 18). The WhatsApp send is unverified,
  pending Meta Business setup (MPF-24).**
- **Not the fix proposed above.** The brief chose a WhatsApp code over reusing the sign-in
  OTP, so sign-in is untouched: nothing here calls `otp.ts`, Supabase phone auth or
  `otp-dev-verify`.
- **Database** (migration `20260923213225_account_deletion_whatsapp_channel`):
  - `account_deletion_requests.channel` (`email` or `whatsapp`, default `email`) is set when
    a request opens, and every code for that request goes the same way.
  - `account_deletion_channels(uid)` lists where an account can be reached, best first:
    - a confirmed email that is not a `.invalid` placeholder → `email` (the old rule);
    - then a confirmed `auth.users.phone` → `whatsapp`.

    Email wins when both exist. No API role can call it.
  - `account_deletion_blocker()`: `no_email` is now `no_contact`, and fires only when neither
    exists.
  - `issue_account_deletion_code(uid, channels)`: the edge function passes the channels it
    has secrets for.
    - If the account's channel isn't one of them, the answer is `not_configured` with that
      channel, before anything is written.
    - The address or number comes back as `destination`.
  - A request whose channel no longer reaches the account (its email was removed or
    unconfirmed, say) is closed and a new one opened, as a request over a day old already
    was.
- **Edge function `account-deletion`, v2:** a WhatsApp branch next to the Resend one.
  - It sends Meta's copy-code **authentication** template to
    `/v25.0/<phone number id>/messages`, with the code as the body and button parameter.
  - **Secrets:**
    - required: `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`;
    - optional: `WHATSAPP_TEMPLATE` (default `account_deletion_code`),
      `WHATSAPP_TEMPLATE_LANG` (default `en`) and `WHATSAPP_API_VERSION` (default `v25.0`).
  - `{action:"status"}` now answers `{configured:{email, whatsapp}}`. Today both are false.
  - A failed send discards the code, as for email.
- **App** (`accountDeletion.ts`, `DeleteAccountCard.tsx`):
  - `deletionCopy()` words `no_contact` as "We can't send you a code", and the old `no_email`
    maps to it.
  - `not_configured` and `send_failed` are worded per channel.
  - The dialog says where the code goes: before sending, from the signed-in user; after
    sending, from the channel the server used (or the open request's `channel`).
  - An email account's wording is unchanged.
- **One change for email accounts.** The function used to answer `not_configured` before
  asking the database. Now the database answers first, so an account the blocker refuses sees
  that reason instead.
  - demo-buyer has a vendor row, so it now sees "Seller accounts can't be deleted here",
    where it used to see "isn't available online yet".
  - An eligible email account still gets `not_configured`, verified live.
- **Until the Phase 14–18 app is deployed**, the live app doesn't know `no_contact` and shows
  "Something went wrong" for it. That reaches only accounts with neither a confirmed email nor
  a confirmed phone: 3 of today's 20 real accounts.
- **Verified:**
  - **Database, rolled back** (rehearsal before applying, then again live): 10 groups on
    synthetic accounts.
    - phone-only → WhatsApp;
    - email-only → email;
    - both → email;
    - neither → `no_contact`;
    - a `.invalid` placeholder with a confirmed phone → WhatsApp;
    - `not_configured` names the channel and writes nothing;
    - a phone-only account confirms and is scheduled;
    - a request keeps its channel, and is reopened when that channel stops reaching the
      account;
    - the grants.
  - **Edge function, locally** (Deno shim, fake PostgREST, Resend and Graph API), 10/10:
    - the exact Cloud API request;
    - the masked number (`+91 *******210`);
    - a template error, a bad token and a 500, each discarding the code;
    - the secrets reported independently.
    - The email send is byte-identical to the committed v1's (same URL, headers and body).
  - **Live, a throwaway account** (created as postgres, deleted afterwards):
    - with a confirmed email, the deployed function answered `not_configured` for **email**
      and opened nothing;
    - made phone-only (email null, confirmed phone), it answered `not_configured` for
      **WhatsApp**: routed there, not blocked, and still nothing opened;
    - the app showed the WhatsApp wording and that answer (`mpf6-whatsapp-not-configured.png`);
    - a code then issued on the WhatsApp channel by SQL, in place of Meta, was confirmed in
      the app: `cooling_off` on `whatsapp` (`mpf6-whatsapp-code-step.png`).
  - **The app:** `tests/account-deletion-channel.spec.ts`, 4/4. Against the old app code the
    email test still passes and the 3 WhatsApp tests fail.
- **Not verified:** a real WhatsApp message arriving. That needs MPF-24's setup.

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
- **Status: Fixed 2026-09-24 (My Profile Phase 16).** Message text and
  `auth.audit_log_entries` remain, by design, as the brief said.
- **1. Avatar files: the sweep is an edge function now.** It is `account-deletion-sweep`,
  posted to by pg_cron, the `embedding-worker` shape. Migration
  `20260923200739_account_deletion_sweep_edge_function_and_private_rows.sql`.
  - `account_deletion_sweep_list()` reads each due request's avatar objects and
    `avatar_url` before anything is scrubbed.
  - `complete_account_deletion()` anonymizes: the same lock and re-check, it never raises,
    and failures go to `last_error`.
  - **Only then**, the function deletes every object under `avatars/<user id>/` through the
    Storage API. `record_account_storage_cleanup()` re-lists the folder itself and sets
    `storage_cleaned_at` only when it is empty.
  - **Order:** the files go after the anonymization. `anonymize_account()` can refuse (the
    account became a vendor during the 14 days, say), and a refused deletion must not cost
    the person their photo.
  - **Failures:** a Storage failure never blocks the anonymization. It is kept in
    `storage_error`, and every run retries completed requests whose folder isn't confirmed
    empty.
  - **Scope:** the whole folder, so earlier and never-saved uploads go too. Nothing outside
    it is touched: `avatar_url` is user-editable, so a URL pointing elsewhere is logged,
    never followed. RFQ and review images (in `product-images`) stay with their records.
  - **Backstop:** the cron job also runs `process_due_account_deletions(interval '1 day')`
    in SQL. If the function didn't run, the 14-day promise still holds a day late, and the
    files follow on the function's next run.
- **2. Private activity rows:** `anonymize_account()` now deletes the account's own rows.
  - **Deleted:** saved items, saved folders (`saved_folder_items` cascades from them,
    checked in `pg_constraint`), saved videos, follows made by the account, recently
    viewed, video likes and notifications.
  - **The FK audit** covered every FK into `profiles`, `buyer_profiles` and `auth.users`.
    - Shared history is kept: RFQs, quotes, conversations, messages, calls and all three
      review tables.
    - The deletion request and the suspension ledger are kept.
    - `engagement_events` stays for vendors' analytics, with only `viewer_id` cleared, as
      the FK's own ON DELETE SET NULL would do.
    - Vendor-side and admin tables can't apply: a deleted account is never either.
- **3. The access-token window:** migration `20260923201559_deleted_accounts_cannot_write.sql`.
  - **The gate:** a new `account_not_deleted(auth.uid())`, true unless the status is
    `'deleted'` (and false for a missing row). Mitra chose it over `account_is_active()`,
    which would also have stopped suspended accounts editing their own rows.
  - **Where it went:** every policy that ties a write to `auth.uid()`, 46 in all, read from
    `pg_policies`. The statements were generated from the live policy text.
    - UPDATE and FOR ALL policies: WITH CHECK, so reads are unchanged.
    - DELETE policies: USING, so a stale token can't delete the RFQs, and with them the
      vendors' quotes, or the reviews anonymization keeps.
    - Storage own-folder INSERT, UPDATE and DELETE in all five buckets.
  - A self-check fails the migration if any such policy is left ungated.
- **Verified:**
  - **A throwaway buyer** (`e7492f53…`, created as postgres, the way Phase 2 did) was seeded
    through its own session:
    - two avatar files, one saved as `avatar_url` and one never saved;
    - a saved item, a saved folder with an item, a saved video, a video like and a follow of
      demo-vendor;
    - a recently-viewed product and a product-view event;
    - an RFQ addressed to demo-vendor, and a review of demo-vendor.
  - **The deletion flow:** code issued by SQL (no email, MPF-4), confirmed as the user
    (`scheduled`), `scheduled_for` moved 1 minute into the past. An access token was captured
    by a fresh sign-in, and then the cron job's own `net.http_post` was fired.
  - **After the sweep:**
    - the function answered 200 `{due 1, completed 1, storage_cleaned 1}`;
    - the request is `completed`, with storage confirmed and no errors;
    - both avatar files are gone (the public URL answers 400);
    - saved items, saved folders and their items, saved videos, video likes, follows,
      recently viewed and notifications are all 0 for the account;
    - the product-view event is kept, with `viewer_id` NULL;
    - the video's like count is back to 1;
    - the RFQ and the review are kept.
  - **The stale token, before part 3:**
    - `profiles` and `buyer_profiles` UPDATE were refused (42501, the Phase 2 triggers);
    - but the RFQ UPDATE, the review UPDATE and a saved-item INSERT **succeeded**.
  - **The same token after part 3:** the RFQ UPDATE, review UPDATE and saved-item INSERT
    got 42501; the avatar upload got 403; the RFQ and review DELETEs matched 0 rows, and
    both rows are still there.
  - **Rolled back, as demo-buyer:** suspended, its own-RFQ UPDATE still works (1 row);
    marked deleted, the same UPDATE is 42501 and its DELETE matches 0 rows.
  - **The function's own gate:** no auth → 401, the anon key → 403.
  - **Regression:**
    - `scripts/suspension-gate-check.mjs` 9/9, suspension unchanged;
    - `profile-save-diff`, `profile-edit-routes`, `buyer-settings` and `profile-calls-stat`,
      7/7: active buyers and vendors still write their own rows.
  - **Advisors:** 139 security findings, was 137. The +2 is `account_not_deleted()`
    executable by anon and by authenticated, by design (RLS calls it, as it does
    `account_is_active()`).
  - **Cleanup:** the auth user was deleted, which cascaded its rows, and the test event and
    the gate script's tagged call were deleted.
    - Nothing references the account, in any table or bucket.
    - `calls` is back to 10 rows, and demo-vendor's rating back to 4.4 / 5.
    - The scratch credentials and token were deleted.

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
- **Status: Fixed 2026-09-24 (My Profile Phase 19)**, for the brief's scope. Only
  `buildAllDataJson()` changed; the RFQ CSV is unchanged.
- **New sections,** each read with an explicit owner filter:
  - `vendors_contacted`: `{vendor_id, brand_name}` for every vendor the buyer
    - has a conversation with (a counterpart with a `vendor_profiles` row),
    - called (`calls.buyer_id`),
    - or received a quote from.

    Deduplicated and sorted by brand.
  - `vendors_messaged`: the vendors whose conversation has at least one message the buyer
    sent, not an empty shell.
  - `saved`, mirroring the app's All Saves and named folders:
    - `all_saves` from `saved_items`, by `buyer_id`;
    - `folders` from `saved_folders`, by `buyer_id`, each with its items. `saved_folder_items`
      has no owner column, so it is read only for the buyer's own folder ids.
  - `recently_viewed`, by `buyer_id`.
  - `following`, from `follows`, by `follower_id`.
- **Links:** `/product/:id` and `/vendor/:id`, the routes in `App.tsx` and what the app's own
  cards link to. They are made absolute on the site the file was exported from.
  - A product the buyer can no longer open (`products_select` admits `live` only) gets
    `product_name: null` and `link: null`.
  - So does a vendor that no longer exists: the same rule as My Reviews.
  - The header's `links` note says so.
- **Header:**
  - `format_version` is 2, and `contents` names the new sections;
  - `counts` adds `vendors_contacted`, `vendors_messaged`, `saved_items`, `saved_folders`,
    `saved_folder_items`, `recently_viewed` and `following`.
- **Page copy, outside the brief's "only `buildAllDataJson()`":** the "Export All Data"
  subtitle on `/profile/data-export` lists the new sections. It is one line in
  `ProfileAccountPrefs.tsx`, changed so the page doesn't under-describe the file.
- **Still not in the file,** because the brief didn't list them: video likes, saved videos,
  service reviews, notifications, deletion requests, and the call log itself (calls only
  feed `vendors_contacted`).
- **Why the owner filters matter here:** for a buyer, RLS on these tables is already
  owner-only. But `follows_select` and `calls_select` admit admins, so an RLS-only export by
  an admin would have held everyone's follows and calls.
- **Verified:** `tests/profile-data-export.spec.ts`, **3/3**.
  - **demo-buyer**, with its real data (2 calls to demo-vendor, a conversation it wrote in,
    4 follows, 8 recently viewed), plus 2 saves and a folder the test creates and removes:
    - every section equals the buyer's owner-filtered rows, and the counts match;
    - `vendors_messaged` is a subset of `vendors_contacted`, which includes the called vendor;
    - the unlisted recently-viewed product has no name and no link;
    - all 7 product links and 4 vendor links open the right page.
  - **demo-admin**, whose RLS shows it 11 foreign follows and 10 foreign calls: its export
    holds 0 following and 0 vendors contacted, which are its own.
  - **Against the committed code,** both new tests fail. **With the `calls` and `follows`
    owner filters removed,** the admin test fails: 9 other accounts' vendors appear in
    `following`.

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
- **Status: Fixed 2026-09-24 (My Profile Phase 14).**
- **Fix:**
  - `useEditableProfile` keeps a `baseline`: the form as seeded from the loaded row, and after
    each save, as saved. `save()` diffs the form against it with `profileChanges()` and sends
    only the fields that differ. When none do, it sends nothing and the page says "No changes
    to save".
  - `saveProfileFull(userId, changes)` takes that patch and writes only the columns for the
    fields in it, in the vendor store's `if (p.x !== undefined)` style. A table with nothing
    to write isn't touched. An emptied field is a change, saved as NULL.
  - `country` no longer defaults to "India" in `EMPTY_PROFILE` or `fetchProfileFull()`. "India"
    is the Country field's placeholder on `/profile/business-details`, and is never saved.
  - The other side effects are gone too:
    - `display_name` is written only when the name changes;
    - the Google picture still shows when no photo is stored, but it becomes the stored
      avatar only if the buyer picks a photo.
  - The "no save before the profile loads" guard is unchanged: `form` stays null until the
    row loads.
- **Found and fixed with it: a sign-in step that blanked the whole profile.**
  - `applyPendingSignupProfile()` runs after every OTP sign-in (`OtpVerify.tsx`) and in
    `AuthCallback.tsx`.
  - For a buyer whose signup metadata has a company, it called `saveProfileFull()` with
    `{...EMPTY_PROFILE, name, email, phone, company}`. So every sign-in:
    - wrote NULL over the buyer's other business and personal fields and the avatar;
    - set country to "India";
    - reverted the name and phone to the signup values;
    - for a phone-only account with no auth email, wrote NULL over a saved email.
  - Now it writes only the company, and only while none is saved. `handle_new_user()` wrote
    the name, email and phone when the account was created.
  - It was not reachable in production: Supabase's phone provider is disabled, so no OTP
    sign-in completes yet. It would have run from the first real one.
  - What it still did is MPF-20, fixed the same day.
- **Verified:**
  - New `tests/profile-save-diff.spec.ts`, 2/2, as demo-buyer, recording every write request
    to `profiles` and `buyer_profiles`:
    - **Job title only:** one request, carrying just `id` and `job_title`. Both rows are
      otherwise unchanged, and the NULL country stays NULL.
    - **State cleared:** one request, `{id, state: null}`, saved as NULL.
    - **Untouched form:** no request, and "No changes to save".
    - **The sign-in step:** no write while a company is saved. With none saved, one request
      carrying just `id` and `company`.
  - **Against the old code** (the `src/` changes stashed), both tests **failed**:
    - the job-title save also sent a `profiles` write;
    - with a company saved, the sign-in step still sent both writes with the whole blank
      profile.

    The spec restored both rows in full, and a SQL fingerprint of both rows matched the one
    taken before.
  - **Live SQL,** after a run that kept its markers:
    - the `profiles` row is byte-identical, email and phone included;
    - the other 19 `buyer_profiles` columns are byte-identical;
    - country is still NULL, state is NULL and the job title is the marker.

    Then restored, and both rows matched their original fingerprints.
  - **Regression:** `profile-edit-routes`, `buyer-settings`, `profile-quotes-chats-stat` and
    `profile-calls-stat` pass with the new spec, 8/8. tsc 0, eslint 0.

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
- **Status: Fixed 2026-09-24 (My Profile Phase 20).** The drawer's picker is now the same
  setting as Regional Settings, and that setting converts displayed prices, for display only.
- **Part A: display conversion.**
  - **Rates:** `public.fx_rates`, one row with an INR base. pg_cron `fx-rates-refresh`
    refreshes it daily at 16:30 UTC through the `fx-rates-refresh` edge function (migration
    `20260924161525`), the embedding-worker / account-deletion-sweep shape.
  - **Source: Frankfurter.**
    - It's free and needs no API key, account or secret.
    - The primary is its v1 endpoint, the European Central Bank's euro reference rates; its
      v2 multi-source endpoint is the fallback.
    - The INR rates are computed from the EUR ones, which keeps the ECB's precision (asked
      directly, INR-based rates come back with 3 significant figures).
    - Why: the picker offers only USD, EUR and GBP, which the ECB publishes every working day.
      There was no FX integration anywhere in the repo to reuse.
  - **Client:**
    - `src/lib/currency.ts`: `formatInCurrency(amountInInr, code, rates)`. `formatINR` now calls
      its `formatCurrency`, with byte-identical output.
    - `useFxRates()`.
    - `DisplayCurrencyContext`, with `show` / `showText` / `showBoth`. Each call site gets its
      own INR text back untouched unless a conversion is running. An INR buyer's pages never
      read the rates.
  - **Where it converts:**
    - Product cards and pages: New Arrivals, Trends, For You, Sale, Following, search results,
      saved items, recently viewed, the product page, the vendor profile, sponsored rails and
      video close-ups.
    - Quotes and budgets: My Quotes, received quotes, the quote details, the compare table and
      the direct-request thread.
    - Quotes and the product page's main price keep the INR price beside the conversion:
      "≈ $5.20 (₹499)".
  - **Left in ₹ INR, by design:**
    - the New Arrivals hero's invented products and the service-vendor rates. They are static
      content, and unmarked, so the note stays true;
    - vendor pages and vendor billing (`formatINR`);
    - amounts a buyer types (RFQ budgets).
  - **Display only, said wherever it shows:**
    - every converted figure is marked "≈";
    - a note under the top bar, and on search results, the vendor profile and the quote
      screens, says prices are converted for display and vendors quote and are paid in ₹ INR;
    - Regional Settings states the rate, and that Cosora's plans and GST invoices stay in ₹ INR;
    - the drawer picker says it too.
  - **The drawer picker** is controlled, reading and writing `buyer_profiles.regional.currency`
    through `useCurrencySetting`. That's the same field Regional Settings writes, so there is
    one real setting.
- **Part B: GST, ready, and called by nothing buyer-facing.**
  - `supabase/functions/_shared/gst.ts` (`gstOn(base, rate = 0.18)`) replaces the three copies
    in the subscription functions, which now import it.
  - Buyers pay Cosora nothing today, so nothing buyer-facing calls it, and no charge was built
    or simulated to call it.
  - The three functions weren't redeployed (MPF-25).
- **Verified:**
  - **Migration:** rehearsed rolled back, then applied; its checksum equals the live one.
  - **`fx-rates-refresh`:** local harness 6/6; deployed as v1.
  - **Forced refresh** (the cron job's own command): the empty table got ECB rates for 24 Sep,
    and the function answered `changed: true`. The scheduled 16:30 UTC run then advanced
    `updated_at` with the same rates (`changed: false`): the ECB publishes once per working day.
  - **INR is byte-identical:** as demo-buyer with no currency set, every "₹" line on 11 buyer
    pages was captured twice before the change (identical both times) and once after. All 239
    lines are identical.
  - **`tests/display-currency.spec.ts`, 1/1:**
    - USD was picked in the real picker;
    - every price line on the 11 pages is either converted correctly at the cached rate
      (worked out independently of the app's code) or one of the by-design INR lines;
    - the notes, the drawer picker and a received quote ("≈ $x (₹y)") were checked;
    - an INR buyer never reads the rates;
    - the setting was put back to NULL, and no event, view, impression or recently-viewed row
      was written.
  - `profile-regional-honesty.spec.ts` updated to the new copy, 1/1; buyer-settings 2/2; tsc 0.
  - **GST:** `node scripts/gst-check.mjs` 30/30. An old-vs-new harness of
    `subscription-create-order` and `-verify-payment` passed 12/12, with identical Razorpay
    orders and invoices for every plan and cycle.

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
- **Status: Fixed 2026-09-24 (My Profile Phase 17).**
- **Fix, in `src/contexts/UserRoleContext.tsx` only** (`useSwitchRole.ts` untouched):
  - **The side on load.** When the signed-in profile arrives, `role` is seeded from
    `profiles.active_role` ('seller' → seller, anything else → buyer), once per account per
    page load.
    - A switch after that, or a role set before it, stands for the rest of the session. A
      profile refetch doesn't undo it. (OtpVerify sets the role at sign-in while the profile
      is still loading.)
    - A hard reload seeds again, and signing out goes back to buyer.
  - **`vendorRegistered` comes from the database:** `vendor_profiles.onboarding_complete`,
    read alongside the profile (react-query `["vendor_registered", id]`).
    - Mitra's decision: that column alone. The old rule that `active_role = 'seller'` means
      registered is gone.
    - Onboarding's `setVendorRegistered(true)` updates the cached answer, after its own write
      of `onboarding_complete = true`.
  - **localStorage is only a hint.** It is now per account (`cosora.vendorRegistered.<id>`):
    used until the read returns, then corrected to match it. The old unkeyed key is removed,
    because on a shared browser one account's flag could route another.
- **Consequence of the decision:** 10 seller-role accounts have no completed registration on
  file (MPF-22). They load on the seller side, but switching back from Buyer to Seller sends
  them to `/onboarding`. demo-vendor is one of them.
- **Verified:** new `tests/role-on-load.spec.ts`, **4/4**.
  - **demo-vendor, nothing stored:**
    - hard loads of `/seller-home` and `/notifications` show the seller sidebar with no
      switching, and Settings opens `/settings`;
    - switched to Buyer, it stays buyer while moving around in-app, and a reload is seller
      again;
    - switching back to Seller goes to `/onboarding` (MPF-22).
  - **demo-buyer with a completed registration on file:** the read is answered in the
    browser, because no buyer-role account has one. Seller goes straight to `/seller-home`,
    the hint becomes "true", it stays seller in-app, and a reload is buyer.
  - **demo-buyer's real row (false) with a stale "true" hint:** `/onboarding`, and the hint
    is corrected to "false".
  - **No `vendor_profiles` row:** `/onboarding`.
  - **Against the old file, all 4 fail.** The vendor's hard load showed the buyer sidebar,
    and the old code never reads the database, so the other three never saw their read.
  - `buyer-settings.spec.ts` no longer switches demo-vendor to Seller first.
  - **Regression:**
    - buyer-settings 2/2, vendor-analytics 5/5, vendor-my-store 8/8;
    - the contact-privacy page sweep and Call Buyer, 2/2 (Call Buyer's suspension and quote
      acceptance were restored);
    - tsc 0.
  - **Screenshots:** the vendor-page screenshots were re-rendered and kept. The committed
    ones had captured this bug: the buyer menu on demo-vendor's pages.

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

## MPF-20: The sign-in step re-applies a signup name

- **Where:** `applyPendingSignupProfile()` in `src/lib/queries/signupProfile.ts`, run after
  every OTP sign-in (`OtpVerify.tsx`) and in `AuthCallback.tsx`.
- **What:** the brand or company a user typed at signup stays in their auth metadata for
  good, and the step writes it back on each sign-in:
  - **Vendor:** `saveVendorProfile(id, { brandName })` on every sign-in, so a brand renamed
    in the vendor settings reverts to the signup name at the next sign-in.
  - **Buyer:** since Phase 14 the company is written only while none is saved. A buyer who
    clears it on purpose gets the signup company back at the next sign-in.
- **Not reachable yet:** Supabase's phone provider is disabled, so no OTP sign-in completes.
- **Why not fixed:** the vendor half is outside Phase 14, which was the buyer profile save,
  and a full fix touches the auth metadata.
- **Fix, if wanted:** apply it once. Either clear `brand_name` from the metadata after a
  successful write, or record that it was applied, and skip it after that. That is the
  documented intent ("apply what signup captured but could not write").
- **Status: Fixed 2026-09-24 (My Profile Phase 14, on request).**
- **Fix:** `applyPendingSignupProfile()` applies the signup name once.
  - **Vendor:** it writes `brand_name` only while none is saved, as the buyer's company
    already was.
  - **Both roles:** it then clears `brand_name` from the auth metadata with
    `auth.updateUser({ data: { brand_name: null } })`.
    - Supabase Auth removes a key set to null, and `updateUser` merges, so nothing else in
      the metadata changes.
    - Only this function reads `brand_name`. That was checked in the app and in every database
      function.
  - **On failure:** if the write fails, the metadata is kept and the next sign-in tries again.
    If only the clearing fails, the next sign-in finds the name saved, writes nothing, and
    tries the clearing again.
  - Sign-in itself is unchanged: the same step, run at the same point, with one more request
    after its write.
- **Who it protects:** 5 seller accounts still carry a signup `brand_name`, and 2 of them have
  since saved a different brand. Under the old code, their next sign-in would have reverted
  it. Under the new code, it writes nothing and clears the metadata.
- **Verified:** tests 4 and 5 of `tests/profile-save-diff.spec.ts` (3/3 in the file), with
  real metadata writes.
  - **Buyer:**
    - company saved → only the metadata request, `data: {brand_name: null}`, and the metadata
      exactly as before;
    - the write failing (a 500 injected) → metadata kept;
    - no company → `{id, company}`, then the metadata request;
    - a company cleared afterwards stays cleared at the next sign-in.
  - **Vendor:** brand saved → no vendor write. None saved → `{id, brand_name}`, then the
    metadata request. The next sign-in writes nothing.
  - **Against the old code:** with the MPF-20 change reverted and Phase 14's buyer fix kept,
    both tests **failed**. The buyer's name was never cleared, and the vendor's signup brand
    was written over the saved one.
  - **Afterwards:** SQL fingerprints of both demo accounts (auth metadata, `profiles`,
    `buyer_profiles`, `vendor_profiles`) match the originals, and no `brand_name` key is left.
  - Regression 6/6; tsc 0, eslint 0.

---

## Phase 9 decisions (2026-09-23)

(Phase 24, 2026-09-25: the questions Andy's content left open were the Seller Registration
placement, "Lowest billing plan?", and seeding by migration. All three are settled below
and in "Phase 24 decisions".)

1. **Content file:** arrived. It's kept as
   `documentation/seller-registration-and-subscription-faq-content.md` and was loaded
   through the admin RPCs.
2. **Seller Registration placement:** the vendor landing page `/seller` (Mitra's choice). It
   replaces that page's 4 hardcoded questions.
3. **"Lowest billing plan?":** written in Andy's tone from the live plans (Mitra: "write them
   up yourself"). It hardcodes ₹699/₹6,990 and the Free and Basic limits, so it needs
   updating if plan prices change. Worth a read by Andy. **Kept in Phase 24** (Mitra,
   2026-09-25), over a new wording the Phase 24 brief supplied. That wording was accurate
   against `subscription_plans`, but it wasn't used.
4. **Should `support` write FAQs?** **Resolved 2026-09-24, Phase 22: yes** (Mitra's brief).
   The four write RPCs now admit support and super_admin (migration `20260924170736`), and
   `SECTION_WRITE.faqs` in Cosora-Admin's `roles.ts` matches. See "Phase 22 decisions".

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

---

## Phase 14 decisions (2026-09-24)

1. **The sign-in step writes only the company, and only while none is saved.** My call. The
   brief named `saveProfileFull()` and the hook, but the new patch-style save changed what
   this caller had to pass. It was also the worst case of MPF-9: a whole blank profile on
   every sign-in. The vendor half, and applying the name only once, followed on request the
   same day (MPF-20).
2. **The Google picture is no longer adopted on save.** It is in the baseline, so it is shown
   but becomes the stored avatar only if the buyer picks a photo. MPF-9 had listed adopting
   it as a side effect of the full write.
3. **"No changes to save".** An untouched form sends nothing, so the page says so rather than
   "Profile updated".
4. **"India" is a placeholder.** The brief offered a placeholder or a default shown only on a
   form that never loaded. The pages render no form until the row loads, so a placeholder is
   the only way it appears.

---

## Phase 15 decisions (2026-09-24)

1. **The label is "deleted", in lower case.** The brief suggested "Deleted". The
   neighbouring badges read "active" and "suspended", so the three match.
2. **The Vendors list is fixed too.** It had the same suspended-or-active test, so a
   deleted vendor account would have shown as active there. MPF-5 couldn't be called fixed
   with it left.
3. **"View" instead of "Manage"** on a deleted row, and the card keeps the suspension
   history. The brief asked for no action buttons; the history is still worth reading.
4. **Verification rewrites the status in the browser** rather than deleting an account.
   Deletion is irreversible by design, so a real deleted test account would stay deleted.

---

## Phase 16 decisions (2026-09-24)

1. **The write gate refuses deleted accounts only (Mitra's choice).** The brief said to use
   `account_is_active()`. That is true only for `'active'`, so it would also have stopped
   suspended accounts pausing ads and products, closing an RFQ, accepting a quote, editing
   their profile or marking notifications read, which changes what suspension means.
   `account_not_deleted()` closes the stale-token window and leaves suspension as it was.
2. **DELETE and storage policies are gated too.** The brief named UPDATE policies. A stale
   token could also delete the account's RFQs (and with them the vendors' quotes) or its
   reviews, or re-upload an avatar after the sweep removed it.
3. **Files after anonymization, not before.** The brief's order was read the URL, delete the
   file, then anonymize. The URL and the file list are still read first, but the delete
   waits until anonymization succeeds, so a refused deletion doesn't cost the person their
   photo.
4. **The whole `avatars/<user id>/` folder, never beyond it.** It takes earlier and
   never-saved uploads too. `avatar_url` is user-editable, so it is never followed outside
   that folder.
5. **`engagement_events` are unlinked, not deleted.** They are vendors' analytics, so
   deleting them would change vendors' counts. Clearing `viewer_id` is what the FK's own
   ON DELETE SET NULL would do.
6. **A SQL backstop in the cron job.** Anything overdue by a day is anonymized in SQL, so
   the promise doesn't depend on the edge function.

---

## Phase 17 decisions (2026-09-24)

1. **`vendorRegistered` is `onboarding_complete` alone (Mitra's choice).** The alternative
   was "`onboarding_complete` or seller role". The consequence for the 10 seller-role
   accounts without a completed registration is MPF-22.
2. **The localStorage hint is per account.** The old key was shared by every account on a
   browser, so one account's flag could answer for another until the database read
   returned. My call.
3. **Signing out goes back to buyer**, so the next sign-in seeds from its own `active_role`
   rather than keeping the last account's side. My call.
4. **The brief's `'vendor'` role maps to seller.** `profiles.active_role` only allows
   `buyer` and `seller`, so it never occurs.
5. **Two cases were verified by answering one read in the browser**: a completed
   registration, and no vendor row. No buyer-role account has a completed registration, and
   giving demo-buyer one would list it as a vendor without a contract.

---

## Phase 18 decisions (2026-09-24)

1. **Build it now, with WhatsApp dormant (Mitra's choice at the step-1 stop).** The other
   options were to wait for Meta setup, or to build everything except the Meta send and leave
   that for the in-house messaging service. MPF-6 is "Fixed, WhatsApp send unverified"
   because of this choice.
2. **The function tells the database which channels it can deliver on**, so `not_configured`
   names the channel and nothing is written. The old function checked its one secret before
   asking the database. My call.
3. **Email wins when an account has both**, so no email-bearing account changes channel. This
   is the brief's rule, and the migration's self-check proved it for every account.
4. **A request keeps the channel it opened on.** If that channel stops reaching the account,
   the request is closed and a new one opened, rather than sending a code somewhere the
   account can't read. My call.
5. **`no_email` is now `no_contact`**, and the app maps both.
6. **The old one-argument `issue_account_deletion_code` was dropped**, not kept with a
   default: only the edge function calls it, and it was redeployed straight after the
   migration.
7. **The wording before sending is predicted from the signed-in user**, by the same rule as
   the database; the server decides.
8. **Defaults:** Graph API `v25.0`, template `account_deletion_code`, language `en`. All
   three can be overridden by a secret.

---

## Phase 19 decisions (2026-09-24)

1. **Links are absolute, on the site the file was exported from** (`window.location.origin`).
   A bare path isn't clickable in a downloaded file, and a hardcoded domain would be a guess.
   My call.
2. **A product or vendor the buyer can no longer open gets no link,** as on My Reviews.
3. **`saved` mirrors the app:** All Saves (`saved_items`) plus the named folders.
4. **Product names are included** next to each link, though the brief didn't ask for them,
   so the file reads without opening every link.
5. **`vendors_contacted` keeps a call or quote vendor whose vendor row is gone**, with a null
   brand name. Conversation counterparts count only with a vendor row, the brief's rule, since
   the other side of a chat can be a buyer.
6. **`format_version` is 2,** because the file's shape grew.
7. **The page subtitle was updated,** one line outside the brief's scope.

---

## Phase 20 decisions (2026-09-24)

1. **FX source: Frankfurter (ECB),** free and without a key, with its v2 endpoint as the
   fallback. My call; the brief asked for the choice to be named.
2. **Conversion happens where a price renders,** and each call site passes its own INR text,
   which comes back untouched for INR. INR is byte-identical by construction, not by
   re-formatting.
3. **Every converted figure carries "≈",** and quotes and the product page's price keep the INR
   price beside it, so a converted number never reads as a price in another currency.
4. **Converted figures show cents ("$5.20");** INR keeps `formatINR`'s shape.
5. **Left in INR:** the invented New Arrivals hero, the static service-vendor rates, typed
   amounts, and vendor pages and billing.
6. **The drawer picker was wired, not removed,** to the same field. Regional Settings keeps
   saving currency with its other regional fields, so a quick currency-then-timezone change
   can't have one save overwrite the other.
7. **USD, EUR and GBP only:** the picker's existing list.
8. **A signed-out visitor's device choice converts too,** as Regional Settings already saved it.
9. **GST was extracted and the three subscription functions refactored, but not redeployed.**
   Their deployed versions are older than the repo (MPF-25), so a redeploy is a decision.

---

## Phase 22 decisions (2026-09-24)

Phase 9 Q3: support writes FAQs, not just reads them.

1. **Support writes FAQs:** add, edit, deactivate, reorder and delete, on all three surfaces.
   `product_moderator`, `vendor_ops`, `ads_moderator` and `finance_admin` stay refused, as do
   inactive admins, non-admins and anon.
2. **Only the gate and the 42501 message changed** in `admin_faq_add`, `_update`, `_delete` and
   `_reorder`. Each takes `admin_faq_list`'s predicate character for character. Undoing both
   edits on the live definitions gives back the old functions exactly. `admin_faq_list` was
   not touched (md5 unchanged).
3. **Two wording fixes beyond the brief:** the `faqs` table comment, and the admin page's
   subtitle and header comment. All three said super_admin only.
4. **Tested with two run-only fixture admins,** `rlstest-support` and `rlstest-productmod`
   (the earlier `rlstest-*` accounts had been deleted). Their password was generated locally
   for the run, and only its bcrypt hash went to the database. Both were deleted afterwards.
5. **Found, not built: an edit history for FAQs (MPF-26).** It's a new open decision.

---

## Phase 23 decisions (2026-09-24)

Phase 9 Q2: the FAQ read path at 10k concurrent users. Ideation first, then the build.

1. **The table was never the limit; PostgREST is.** `faqs` is ~30 indexed rows. Every FAQ
   page load spent a PostgREST request, from a pool of ~10 connections shared with the whole
   app, on content that changes a few times a month. The 2026-09-23 k6 run peaked at
   ~128 req/s across the app's queries.
2. **Client:** `useFaqs()` keeps a loaded list for 10 minutes (`staleTime`, was the app-wide
   60 s) and in memory for 30.
3. **Rebuilt by a database trigger calling an edge function, not by the admin app.** The
   trigger covers every write path (admin RPCs, SQL fixes, specs). pg_net queues the call
   inside the transaction, so a rolled-back write never rebuilds. The admin app would miss
   any write not made from a tab that stays open, and would need Storage write rights.
   This matches `fx-rates-refresh` and the deletion sweep: pg_net → a service-role-only
   function, with the Vault key.
4. **Best effort, with a backstop:** the trigger never fails an admin's write. It queues one
   call per transaction. An hourly cron rebuilds all three files anyway, and raises if the
   Vault key is missing. The function rebuilds from the committed table and re-reads after
   uploading, so edits in quick succession settle on the latest state.
5. **The files hold only what anyone can already read:** the function reads with the anon
   key, so only active rows appear, and never `created_by`. The bucket has no client write
   policy.
6. **The pages read the file first and the table second.** Any failure falls back to the
   unchanged table query: network error, HTTP error, bad JSON, the wrong shape or version,
   another surface's file, or no answer within 3 s.
7. **`cache: "no-cache"` on the fetch:** the CDN sends no `Age` header, so a browser could
   otherwise keep a nearly-expired copy for another full max-age. The CDN serves a cache
   hit to that request as well (measured), so no request reaches the database.
8. **Smart CDN, found rather than assumed.** Supabase documents Smart CDN (invalidate on
   overwrite) as Pro only, and this project is on Free. But Storage answers with
   `x-smart-cdn: true`, and the behaviour matches: an overwrite reaches every request within
   ~47 s (measured three times), not at max-age. The first version of the timing test
   assumed plain max-age caching and failed, because the edit showed up at once. It was
   rewritten on the measured model. `max-age=300` stays as the browser bound, and as the
   edge bound if Smart CDN were ever off. The applied migration's header still says "within
   5 minutes"; the file is kept as applied, and the correction is in the docs.
9. **Admin copy:** Cosora-Admin's FAQ page said changes go live "as soon as they're saved".
   It now says "within about a minute".
10. **The Phase 9 spec checks each edit on the page immediately,** so its pages now block the
    snapshot URL and read the table. The snapshot path has its own spec.
11. **Load test:** the CDN path from one machine up to where the machine gave out. The table
    path only at modest capped rates, with abort thresholds, because it is production.
    Measured (moved here from `myprofileflags.md` in Phase 26):
    - **CDN path:** 250 req/s at p95 165 ms and 500 req/s at p95 256 ms, with 0 failures and
      100% cache hits. Around 940 req/s (p95 1.7 s) the load machine itself topped out. The
      edge answered all 50,384 requests it received with 200, as cache hits, averaging
      ~15 ms, and the failures at the top step never reached it.
    - **Table fallback:** 25, 50, 100 and 150 req/s, all at p95 ~360 ms, with 0 failures and
      no pool errors.
    - **An edit:** the rebuilt file is at the origin in 2–3 s, and every request gets it
      within ~47 s (three trials, 45.9–46.8 s). Phase 26's run saw 5.3 s for an edit and
      40.4 s for a delete.
    - 10k concurrent users each opening an FAQ page every 20 s is 500 req/s: the level above,
      with no database load at all.
12. **Found, not fixed: MPF-27.** Two older cron jobs would succeed silently without the
    Vault key.

---

## Phase 24 decisions (2026-09-25)

Phase 9 Q4: seed the Seller Registration and Subscription FAQ content. The brief assumed it
wasn't seeded. It had been live since 2026-09-23, added through the admin, so the phase
stopped and asked. Mitra's answers:

1. **Codify, don't duplicate.** Migration `20260925075432_faqs_seed_seller_registration_and_subscription.sql`:
   - moves the five Subscription rows `20260923144549` seeded to 120–140 (three still live)
     and 210/240 (the two Andy's versions replace, switched off);
   - inserts Andy's 15 questions wherever no active copy exists.

   Every statement is conditional, so on the live database it changed nothing, and on a
   fresh database it produces the live state. Both were rehearsed and rolled back. The text
   is copied from the live rows byte for byte.
2. **"Lowest billing plan?" keeps the Phase 9 answer:** "Yes! Plans start at just ₹699/month (or ₹6,990/year) with Basic: 10 product listings and 150 leads a month. Just getting started? Our Free plan costs nothing and gives you 2 listings and 10 leads a month. Prices exclude GST." The brief's
   wording was accurate against live pricing, but it wasn't used.
3. **"Contact us" writes to hello@cosora.in**
   (`mailto:hello@cosora.in?subject=Subscription%20question`). This overrides Andy's "take
   them to the Help page", because `/help` is the buyer page and its chat is canned (MPF-15).
4. **The Subscription list stays as it is:** Andy's 5 in his order, then the three accurate
   seeded questions (autopay, payment methods, GST). The two superseded seeded questions
   stay off, so no question appears twice. The brief expected "5 original + 4 new = 9". That
   count left out "Lowest billing plan?", and it would have repeated two questions.
5. **Seller Registration stays on `/seller`,** Phase 9's placement. `/seller` renders the list
   with `useFaqs()` in its own layout, not `<FaqSection>`.

---

## Phase 26 decisions (2026-09-25)

The closing regression pass: Phases 11–25 re-checked together, live, in one sitting. The
results are in `test.md`, in the Phase 26 entry.

1. **The deletion sweep was fired by hand, with Mitra's go-ahead.** The permission system
   refused running cron job 14's command (an HTTP call with the service-role key). Asked,
   Mitra chose to fire it once. Only the throwaway test account was due.
2. **Item 11 (Phase 21, RFQ and message notifications) is reported as not built,** and was not
   built in this pass. Delivery is its own brief (claude.md, "Notification preferences").
3. **Item 14's "9 Subscription FAQs" is checked as 8,** per Phase 24 decision 4.
4. **Item 7's "once, then freely" is checked with the registered state answered in the
   browser.** Completing a real onboarding would write a signed contract, which can't be
   deleted.
5. **The break it found was in a test, not the product.** `faqs-admin-editable` could leave a
   seeded FAQ out of position. The row was moved back, and the spec now waits for each
   reorder and checks every position.
6. **Committed and pushed on the phase branches, on Mitra's "push everything to repo".** Not
   merged to `main` and not deployed.
