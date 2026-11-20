# Buyer review leftovers (2026-11-21)

The last open items of the 2026-11-18 buyer review: H-12's two follow-ups, M-58, L-63, L-64, Medium batch 4's three
follow-ups (M-25, M-33, M-75), and what Low batch 5's release turned up. Branch `fix/review-leftovers-2026-11-20` from main
`f83a999` (Low batches 1–5 live). Buyer repo only. Migration `20261120150000_review_leftovers.sql`.

Already on production from this branch: `20261120140200_low_batch5_guard_hotfix.sql` (2026-11-21, Mitra: "Apply the
hotfix") and the demo account re-seed (`scripts/fixtures/demo-accounts-reseed-2026-11-21.sql`).

## Mitra's calls (2026-11-20)

- H-12 originals: "Remove on delete only". A listing that stops being live (other than a pause) loses its
  thumbnails, which come back when it goes live again; a deleted listing loses its photos too, unless something else
  still shows them.
- L-63, L-64: "Fix both". Register.tsx, OtpVerify.tsx and AuthContext.tsx may change for these two items only: same
  mobile + OTP flow, no new way to sign in. `otp.ts` and `otp-dev-verify` untouched.
- Demo accounts: "Re-seed them". demo-buyer's Terms acceptance recorded, demo-vendor registered (no live listings).
- M-58: "Fix it, you test it". Mitra signs up once with a Google account after release and checks Back.

## The regression found on the way (fixed on production)

Low batch 5's revoke (`20261120140100`) withdrew `profiles.account_status` from browsers. `guard_deleted_account()` runs as
the caller and SELECTed it, so every signed-in update to `profiles` and write to `buyer_profiles` failed with "permission
denied" from the revoke (2026-11-20 evening) until the hotfix (2026-11-21): choosing a role in sign-up, the sign-up steps,
profile edits. The hotfix reads `OLD` on profiles and `account_not_deleted()` on buyer_profiles; the rule is unchanged. No
policy and no other caller-run function reads the three withdrawn columns (checked on production). claude.md now says to
list those before any revoke.

## What changed

- **H-12 (1)** `trg_products_thumbs_off` (leaving live, not for a pause) and `trg_products_photos_on_delete` (before
  delete) call `admin.queue_product_photo_removal()`, which asks the edge function `product-thumbs` (new `remove`
  action) through pg_net once the write commits. The function checks each path again: a thumbnail goes only if its photo
  isn't a live listing's; an original only if `product_photo_in_use()` finds nothing still showing it (listings, ads,
  catalogues, videos, reviews, requirements, premises photos, logos, banners, office photos, avatars).
- **H-12 (2)** The four thumbnails named before the `<path>.jpg` naming are deleted (`legacy`, by the migration).
- **M-58** AuthCallback marks its own history entry as where sign-up starts, so Terms (or the seller registration)
  rewinds over the steps as after a phone sign-in. Before, every step stayed in history and sent Back to Home.
- **L-63** On the code screen, an account that hadn't finished signing up takes the role picked on Register
  (`chooseRole`); a finished account (a submitted seller registration counts) keeps its own.
- **L-64** A phone sign-up made 13 profile requests (5 profile rows, 4 contact reads, 4 admin checks); now 8 (3, 4, 1).
  The code screen waits for AuthContext's load (`awaitProfile`), choosing a role takes the row back from the update,
  Terms refreshes the row only and Account Information the row and contact details (`refreshProfile(parts)`). The
  remaining contact reads are Account Information's own form.
- **M-25** The product page, its related listings and Brand Picks read each listing's seller in the same request
  (embedded through `profiles`), and plan boosts are read once however many strips ask: 14 requests to 10 signed out,
  and no request waits for another to learn the seller.
- **M-33** `ad_impressions()` records each ad's engagement event (same function, same limits); the app no longer sends
  one `log_engagement_event` per ad.
- **M-75** Every foreign key in public and admin has an index (60 were missing).
- **Visitor write grants**: anon held Supabase's default INSERT / UPDATE / DELETE on 33 public tables. No write policy
  admits a signed-out request and every public table has row security, so nothing could be written; the grants are gone
  too, and the default privileges for new tables.

## Checks

- tsc clean; i18n 8298/8298; eslint: no errors; build passes; `npm run rls:check` 0; `scripts/rls-policy-check.sql`
  0; `scripts/todo-batch/search_ads.sql` 12/12.
- Local stack: sign-up specs 54/54 (`buyer-signup`, `signup-back`, the new `review-leftovers`); 14 of them were already
  failing on main before this branch (outdated "NEXT", no Welcome screen, a read before a lazy page loaded) and are
  brought up to date.
- Migration: run in rolled-back transactions locally (a takedown queues the thumbnails, a delete the originals, a pause
  nothing; `product_photo_in_use` both ways; `ad_impressions` as a visitor queues each ad once and records its event
  once) and applied locally without the legacy call. Rehearsed on production and rolled back: 60 indexes, no anon
  write grants, self-check passed.
- Production after the re-seed: `contact-gate-check` 21/21, `profile-contact-privacy-check` all pass.

## Code review (medium)

9 findings. Fixed: a removal could delete a thumbnail the listing's rebuild wrote meanwhile (the request carries when it
was queued, and a newer thumbnail stays); a paused listing taken down kept its thumbnails; index names could collide (a
hash of the constraint); `chooseRole` dropped a full reload under way (the role is put back over it instead); the release
order between the migration and the app is stated (migration first: a short double count beats a gap); demo-vendor now
has its Supplier Agreement on file; the privacy check's RFQ-relationship refusal is tested again (#23, as demo-vendor).
Checked: the anon revoke applies in full on production (the rehearsal's self-check); the index build took seconds there
(the tables are small). Accepted: L-63 changes the code screen, with Mitra's word, recorded in claude.md's sign-in rule.

## Release (when Mitra says)

1. Deploy the edge function `product-thumbs` with the CLI (its `remove` action must exist before the triggers call it).
2. Apply `20261120150000_review_leftovers.sql` with the CLI.
3. Push main (buyer repo only) straight after.
4. Mitra: one Google sign-up, then Back from Home (M-58).
5. Remove the review's H-12 follow-ups, M-58, L-63, L-64 and the batch 4 / batch 5 follow-up notes from ToDo.md.
