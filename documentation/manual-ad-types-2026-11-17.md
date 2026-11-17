# Ad types done by hand: plan and record (2026-11-17)

**Request (Mitra, 2026-11-17):** "bring back all the ad type except the mobile banner and the website banner and create
a banner for the other ad types that those ads will go to the admin dashboard as they will be done manually".

**Status:** built and tested locally on branch `ads/manual-types` (buyer) and `ads/manual-types` (Cosora-Admin). Not on
production: the release waits for Mitra's yes.

## What changed

| Ad type | Before (SH-094, earlier on 2026-11-17) | Now |
|---|---|---|
| Facebook & Instagram Ad (`fbInsta`) | not sold | sold, done by hand |
| Google Product Ad (`googleProduct`) | not sold | sold, done by hand |
| Social Media Combo (`socialCombo`) | not sold | sold, done by hand |
| Direct Broadcast (`directBroadcast`, ₹15 a message) | not sold | sold, done by hand |
| Website Banner Ad, Mobile Banner Ad | not sold | still not sold (their slot is deferred) |
| Web & Mobile Combo | not sold | still not sold. **My call:** it is a bundle of the two banners, so it stays off with them. |

The goals that pick a manual type ("Visit your website" → Google Product, "Message you" → Direct Broadcast) are back in
the builder. Their banner parts stay filtered out.

## How it works

1. **Seller, campaign builder (`/advertisements`):**
   - Each of the four cards carries the tag "Set up by hand by the Cosora team".
   - Picking any of them shows a notice: these run outside the app; once Cosora approves the campaign, the team sets them up, marks them done under Your Campaigns, and the seller gets a notice.
   - Payment, review and the plan's reach rules are unchanged.
2. **Server:**
   - `SELLABLE_AD_TYPES` (`supabase/functions/_shared/adPricing.ts`) and `sellableAdTypes()` (`src/lib/adSlots.ts`, `MANUAL_AD_TYPES`) list the four again.
   - `scripts/seller-medium-fixes-check.mjs` keeps them equal and checks that the banners stay unsold.
   - The four stay in `UNPLACED_AD_TYPES`: they never render as an in-app card.
3. **Database (migration `20261117120000_manual_ad_work.sql`):**
   - `admin.ad_manual_work` has one row per campaign the team has done (`done_at`, `done_by`, an optional staff note of up to 500 characters). It is closed to browser roles and covered by `trg_admin_audit`.
     - The audit trigger keys `target_id` on an `id` column, so for this table the campaign id appears in the logged changes (`ad_id`).
   - `admin_ad_manual_list()` returns every campaign whose placement includes a manual type, excluding draft, rejected and archived ones, with not-done campaigns first. Readable by super admins, ads moderators and support (the Ads section's readers).
   - `admin_ad_manual_done(ad, done, note)` is for super admins and ads moderators (the Ads section's writers).
     - It refuses a campaign that is still in review, and one with no manual type.
     - Marking done notifies the seller (`ad_manual_done`: "Cosora has set up your ad").
     - "Not done" deletes the row; the Admin Log keeps both actions.
   - `my_ad_manual_work()` returns the seller's own campaigns that include a manual type, with `done_at`.
4. **Cosora-Admin › Ads › Manual work** (a fourth view beside Review, Moderation and Monitoring) has three tabs:
   - **To do:** approved, not yet done.
   - **In review:** waiting for approval.
   - **Done:** with date, staff name and note.

   Writers get "Mark done", which takes a note, and "Not done". Support only reads.
5. **Seller, Your Campaigns:** a campaign that includes a manual type shows one of three lines:
   - "After approval, the Cosora team sets up the part that runs outside the app."
   - "The Cosora team is setting up the part that runs outside the app."
   - "Set up by the Cosora team on <date>."

## Decided after the first build (Mitra, 2026-11-17: "add the field for message and change the wording")

- **Direct Broadcast is bought by the message.**
  - The builder asks "Messages per listing", from 10 to 10,000 and starting at 100 (my call), and charges ₹15 × messages × listings, whatever the days.
  - `clampMessages()` / `withMessages()` are in both pricing copies, and `scripts/ad-pricing-check.mjs` compares them over generated orders, out-of-range counts included.
  - `razorpay-create-order` stores the clamped count in `ad_orders.spec.messages`. `admin.ad_broadcast_messages()` reads it back for Manual work ("Message buyers · 300 messages") and for the seller's Your Campaigns line.
  - Before this, a broadcast cost ₹15 once per listing: one message.
- **The four cards' descriptions now say what the team does** and promise no reach:
  - **Facebook & Instagram Ad:** "Cosora's team promotes your listing on Facebook and Instagram, with a link back to it on Cosora."
  - **Google Product Ad:** "… lists your product on Google Shopping, with a link back to it on Cosora."
  - **Social Media Combo:** "Facebook, Instagram and Google Shopping together: Cosora's team sets up all three for your listing."
  - **Direct Broadcast:** "Cosora's team sends a message about your listing to buyers in its category. You choose how many messages, at ₹15 each."

## Still open

- **No refund path for a manual type the team can't carry out.** It would be a refund through finance, as for any campaign.
- **Delivery of the messages isn't tracked in the app;** the team's note on "Mark done" is the record.

## Tests

- `tests/local/manual-ads.spec.ts` (4):
  - who lists and who marks, and only after approval, through PostgREST (notice and Admin Log included);
  - the server sells the four, up to a Razorpay order id on a paid plan, and still refuses the three banner types; a broadcast's count is clamped, priced and stored;
  - the builder tags, notice and messages field, and Your Campaigns' lines;
  - the Cosora-Admin view: an ads writer marks one done, a broadcast shows its messages, and support only reads.
- Updated:
  - `tests/local/seller-home-medium-b.spec.ts`: the builder still has no banners, and the website and message goals are back;
  - `tests/local/todo-open.spec.ts`: the three social types show "/day", and Web & Mobile Combo is gone.
- Related local specs: 25/25 pass (manual-ads, todo-open, seller-home-medium, seller-home-medium-b).
- Checks:
  - `seller-medium-fixes-check.mjs` and `notification-kinds-check.mjs` pass.
  - `npm run i18n:check`: 0 missing.
  - Typechecks and both builds pass.
  - `ad-slot-map-check.mjs` fails one check ("every slot label is set"), and it fails on main too. Not caused by this change.

## Release (each step needs Mitra's yes)

1. Migration `20261117120000` with the CLI (`db query --linked -f … --agent no`).
2. Deploy `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook` and `discount-quote` (they share `_shared/adPricing.ts`).
3. Push buyer main and Cosora-Admin main.
