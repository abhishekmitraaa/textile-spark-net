# Medium bugs, batch 2 of 4: frame, sign-up gate, Back, Register (2026-11-19)

Items: M-01, M-12, M-13, M-14, M-28, M-29, M-43, M-48, M-53, M-54, M-55, M-56, M-57, M-58, M-59, M-60, M-61, M-62,
M-63, M-64. Built on top of batch 1 (branch `fix/medium-batch2-2026-11-19` from `fix/medium-batch1-2026-11-19`).

## Mitra's decisions (2026-11-19)
- M-60 "Allow switch back": until a seller registration is submitted, /onboarding offers "I'm a buyer, not a seller".
- M-61 "Database checks": requirements (rfq_submissions, rfqs), chats (conversations, messages) and reviews are refused
  until the buyer Terms are accepted, while `buyer_signup_required` is on; sellers (registered, exempt, pending) and
  staff are not caught, and an account on the seller side may still send messages.
- M-59 "Return to the page": sign-in and sign-up land a buyer on the page a prompt or the gate took them from.
  Sign-in itself (mobile + OTP, Login, OtpVerify, otp.ts, AuthContext) is untouched.

## Decided without asking
- M-01: the gate keeps a page it already showed while it re-reads the registration (no double mount).
- M-12/M-13: `BuyerFrame` (side + gate) wraps buyer routes without BuyerShell: Trends, Following › View All, Search,
  Search Results, a seller's store, Video Close-Ups, sample profiles, chats, Interest preference, My Reviews and the
  profile sub-pages.
- M-14: Cosora Studio picks its frame by side.
- M-28: Quick RFQ is a dialog (role, focus, Escape), pinned above the keyboard, and asks for sign-in first.
- M-29: `useBackCloses` is per overlay (owner id; a pop on its way delays a new push; nesting-safe); Back closes the
  listed overlays. Login's pickers are left alone (Login is not changed by other work). Address filters picked inside an
  overlay are written on the page's own entry once the overlay's entry is gone (`afterOverlay`).
- M-43: `useStepParam` puts Post Requirement's, My Quotes' and Report Fraud's steps in the address, one entry each.
- M-48: profile sub-pages' Back and a finished save use `useStepBack("/profile")`.
- M-53/M-54: Account Information says who sees the name; a typed pincode gets a State picker; the state nudge stays
  dismissed 30 days (`useDismissed`).
- M-55/M-56: Register keeps Buyer/Seller in the address (`?as=seller`); a signed-in visitor is told so.
- M-57: after a new account's seller registration, the welcome tap rewinds over the sign-in pages (`finishAuthFlow`).
- M-62/M-63/M-64: the sidebar shows the account's own name or Sign in; seller pages draw the seller frame for every
  account (`DisplaySide`), so new and waiting sellers no longer get buyer tabs inside the seller frame.
- Found while testing: Search's filter sheet sat under the phone's bottom bar ("Show N results" couldn't be tapped).

## Not done
- M-58 (Google sign-up: Back shows Home 4–5 times): needs a real Google sign-in to reproduce and test; neither the
  local stack nor this session can do one. Left open in ToDo.md.

## Database
- `20261119110000_buyer_terms_db_check.sql`: `admin.caller_may_act_as_buyer()`, `admin.enforce_buyer_terms()` and 7
  BEFORE INSERT triggers. After the commit security review, `rfq_submissions` was added (requirements are written there).
