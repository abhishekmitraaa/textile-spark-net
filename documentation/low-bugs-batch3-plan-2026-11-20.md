# Low bugs, batch 3: requirements, chats, help, profile and sign-up (2026-11-20)

Items: L-38–L-67 (30, Mitra: "continue with the next batch of 30"). Branch `fix/low-batch3-2026-11-20` from main
`73401ab` (batches 1 and 2 live). Migration `20261120120000_low_batch3.sql`. Batches 4–6 now cover L-68–L-71 (sign-up
leftovers), L-72–L-85 (Seller Home) and L-86–L-104 (database and routes).

## Mitra's calls

- L-52: "Remove the field". The timezone picker is gone; the saved value stays, unused.
- L-55, L-59: "New text, don't re-ask". The Terms are 2026-11-v2 (no "India's premier", effective 20th November 2026);
  buyers who accepted v1 are not asked again.
- L-56: "Allow the two-line change". OtpVerify's Previous and Not you? replace the code screen's entry. Nothing else
  in sign-in changed.
- L-58: "Keep all interests". Only the Save bar covering the last row is fixed.

## Left, with the reason

- L-63 (Register: an unfinished account's old role wins, plausible): decided inside Register and OtpVerify, which stay
  untouched under the sign-in rule. Needs Mitra's word to change.
- L-64 (~15–18 profile reads per sign-up): the reads are AuthContext's, also on the no-touch list.

## What changed

- L-38: the requirement form's success screen and Quick Quote replace their entry with My Quotes; photos uploaded for a
  requirement the database refused are removed (`removeRfqImages()`, `writeRefused()`); a failed photo removes the ones
  that went up.
- L-39: `setQuoteStatusDb()` says so when no row changed.
- L-40: Chat, Support thread and the Support frame fall back with `useStepBack()` (replace).
- L-41: `<LoadFailed>` with Try again on the chat list (chats and calls), profile forms and support pages; Profile's
  counts show "–" until known; a support thread is read only once the session is known.
- L-42: the chat list reads the newest 500 and says so at the limit (states read side by side); saves read 1,000 at a
  time, folder items by the account's folder ids.
- L-43: no 401 from a support thread while the session loads.
- L-44: a callback number is cleaned to +91… (the profile phone's rule) before it is sent.
- L-45: the currency message comes after the save, and a refused save goes back.
- L-46: the export adds requirements in review, saved videos, service reviews, blocks and support requests.
- L-47: `/profile/regional-settings` and `/profile/data-export` are two pages.
- L-48: profile photo shrunk on pick, uploaded on Save, old one removed.
- L-49: deleting a review asks first.
- L-50: Notifications and Social links ask to sign in when signed out; currency says "on this device".
- L-51: Profile's Saved counts saved video close-ups (its own query).
- L-53, L-54: `/auth/welcome` is a guarded "what next" screen.
- L-55: one acceptance row per version (`accept_buyer_terms`).
- L-57: `<SignupHeader>` on every step, "Step N of 5", Continue everywhere.
- L-58: the interest picker's padding follows the Save bar's height; the sign-up route shows the sign-up header.
- L-60: the "I agree" tick survives a trip to the full Terms (per account, cleared after accepting).
- L-61, L-62: For You's first-run step is `?intro=`; "done" is per account.
- L-65: a sent-back registration also refills PAN, GSTIN and the WhatsApp choice, after the overseas switch is known,
  over anything the buyer profile filled.
- L-66: the seller welcome lists only what was sent (listing, catalogue, premises photo).
- L-67: /seller: no "10 minutes"; "every requirement posted to all sellers" (direct requests skip review); signed in,
  the header offers Seller Home or Cosora instead of Login.

## Checks

- `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json`: clean. `npm run i18n:check`: 8279/8279. eslint on the changed
  files: no errors. `npm run build`: passes.
- Migration: applied on the local stack; rehearsed on production in a transaction that was rolled back (v2, patched),
  production confirmed still v1 afterwards.
- Browser, local stack (:8135): /seller signed out (Login) and in (Open Cosora), no "10 minutes"; Welcome; Profile
  counts; data export has the new sections (1 requirement in review, 3 support requests); the two settings pages;
  chats; Account Information "Step 3 of 5"; Terms "Step 5 of 5", new date, no "premier", tick kept after reload;
  accepting twice wrote one row; For You first run Start → Next → Next returns to the page's own entry, a double tap
  doesn't push twice. The local test buyer was restored afterwards.

## Code review (medium)

10 findings, all fixed: overseas refill waits for the switch; the Terms tick belongs to the account and is cleared;
saved-video count is its own query; Welcome only peeks at the return page and offers Retry when the profile didn't
load; photos stay after a network failure; For You pops its step entries and ignores taps on a leaving step; the old
browser-wide "done" flag carries over once; the chat states are read in parallel; no step counter on role selection;
Welcome's interests action opens the interest editor.

## Release (when Mitra says)

Apply the migration with the CLI, then push main (the app's BUYER_TERMS_VERSION must reach production right after:
in between, accepting from an old tab answers "These Terms have changed. Reload"). Check `buyer_terms_version()` is
2026-11-v2, then remove the released L- lines from ToDo.md (keep L-63, L-64).
