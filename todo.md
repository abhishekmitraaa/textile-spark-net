# Cosora — Deferred / Follow-Up Items

Durable record of everything explicitly **deferred rather than built**, so it
does not get lost the way the previous "still open" ledger nearly did.

Last reviewed: 2026-11-17 (Seller Home fixes released).
Longer-form engineering notes live in `documentation/ToDo.md`; this file is the
short list of things someone has to *decide*.

---

## High priority

- **Seller registration go-live steps (added 2026-11-13, after the registration release).** The new registration is
  live with both of its switches off. In order:
  - Review the 10 office photos from 5 existing sellers in Cosora-Admin › Premises photos. The migration moved them
    into the review queue, and they won't show on those stores until approved.
  - Have "Abc" sign the agreement on `/kyc`. That seller is registered but has never signed the Supplier Agreement.
  - Turn on `seller_registration_required` in Cosora-Admin › Feature switches. From then on, sellers who haven't
    finished registering can't add listings, videos, catalogues, ads or quotes.
  - Leave `overseas_seller_registration` off until the CA confirms GST on plans sold to sellers outside India.

- **Real Razorpay payments.** `RAZORPAY_KEY_SECRET` is unset. Every ad and
  subscription payment currently runs through the demo-mode fallback path in
  `razorpay-verify-payment`, including anything that looks like a real
  transaction. Confirmed 2026-09-14: `ad_orders` and
  `subscription_payment_orders` both hold **0 rows** in production, which means
  no purchase has ever been recorded through the real path. This is running in
  production today. Decide on payment go-live, then set the secret and verify
  with one real transaction before trusting any revenue number from this system.
  - Related, and only reachable once this is on: `RAZORPAY_WEBHOOK_SECRET` is
    also unset, so `razorpay-webhook` returns `not_configured` and never runs.
    That is the only reason the seal-grant hole removed on 2026-09-14 never
    fired in production.

- **GST / invoicing for ad purchases.** No invoicing exists. Subscriptions
  produce a real tax invoice (`subscription_invoices` carries `invoice_number`,
  `gst_amount`, `gst_number`); advertising produces none, so
  `/my-payments/receipt/:orderId` prints "PAYMENT RECEIPT" and says in its
  footer that it is not a tax invoice. Blocked on the Razorpay item above —
  build invoicing on a live payment path, not a simulated one.

- **5 unplaced ad types still purchasable with no delivery mechanism:**
  Direct Broadcast, Web & Mobile Combo, Facebook & Instagram Ad, Google Product
  Ad, Social Media Combo. Vendors can buy these today; nothing delivers on the
  purchase. Needs either a build-out or a decision to stop selling them.
  Reasons each is unplaced are in `src/lib/adSlots.ts` (`UNPLACED_AD_TYPES`),
  and `scripts/ad-slot-map-check.mjs` fails if any type is neither placed nor
  given a stated reason.

- **Certificates are sellable to every vendor but deliverable to almost none.**
  Only **2 of 10** `vendor_profiles` rows carry both an address line and a
  postcode, and the one that does has zero live products.
  `certificate_dispatch()` correctly refuses to mark a parcel dispatched with no
  address, so nothing ships blind — but nothing stops the sale. Either require a
  delivery address before the certificate can be added to an order, or let the
  vendor supply one against an existing order. Demonstrable live: demo order
  `CERT-2609-003` is stuck at `printed` for exactly this reason.

## Seller Home audit (2026-11-15) — what is still open

Every High item and sections A–C (SH-001 to SH-033) were fixed and are live since 2026-11-17 (buyer `a96cbd3`, admin
`f3db33a`). Still open from the audit: the Medium and Low items of sections D–L (SH-034 to SH-109, less the High ones),
listed with context in `documentation/seller-home-audit-2026-11-15.md`; the two below were on this list before.

- **Uploads waiting for review count as missing (SH-046).** A premises photo under review shows "Missing", with no
  "waiting for review" state; the "Complete product details" tile really means "get a listing approved".
- `/business-profile-score`'s back arrow (`navigate(-1)`) leaves the app when the page was opened from a link
  (SH-052, seen).

## Medium priority

- **Retire the old buyer interest ids, on or after 2026-11-12** (Interest Preference v2). `pref_category_map` still
  holds rows for `tshirts, shirts, coords, dresses, bottomwear, activewear`, for a browser tab still running the
  pre-2026-10-11 app (it filters its own feed with them). Saved rows can't tell you when that's over: since
  `20261012040000_interest_preferences_v2_followups` the database translates old ids on every write
  (`interest_ids_translate()`), so no row ever holds one. The app is replaced on the next page load, so wait a month
  from the release (2026-10-11), then delete those map rows in a migration. Keep `interest_ids_translate()` and
  `LEGACY_INTEREST_IDS` (the second covers signed-out picks saved in a browser); both cost nothing.

- **Confirm the rights to the interest photos.** The 13 in `src/assets/Buyer/Preference/` came from Mitra with no
  source recorded; one shows a real brand's label (hobbytime.etsy.com) and one a child. claude.md says an image the
  project doesn't own is replaced, not kept. The 4 from Unsplash are recorded in `src/assets/interests/README.md`.


- **City targeting reaches almost nobody.** Only 1 of the buyer profiles has a
  city set, and `ad_targeting_matches()` fails closed by design (a viewer whose
  city is unknown is not shown a city-targeted ad). A soft, dismissible nudge
  was added to the buyer profile page on 2026-09-14; if uptake stays low,
  decide whether to keep selling city targeting at all.

---

## Low priority / blocked

- **Decide how the knowledge graph stays current** (added 2026-11-05). `graphify-out/` in the `cosora testing` folder
  goes stale with every merge: nothing reruns `graphify update .`, because that folder isn't a git repo and so can't
  carry a commit hook. Choose between running it by hand after each release (code is free; changed docs cost tokens),
  a commit hook in each of the three repos that runs it at the workspace root, or a scheduled run. Also decide whether
  the 295 screenshots go in: each needs its own subagent, roughly 300 runs, so they were left out.

- **Two skill folders are broken links** (found 2026-11-05). `cosora lovable/.claude/skills/design-taste-frontend` and
  this repo's `.claude/skills/emil-design-eng` still point at `Desktop/cosora lovable/...`, where the project lived
  before it moved into `cosora testing`; git prints "could not open directory" on every `git status` and graphify
  can't read them. Both skills are still there in the `.agents/skills/` folders the links meant. Repoint the links
  (one `mklink /D` each) or delete them.

- **WhatsApp Business Cloud API.** Requires a Meta Business account and a BSP
  relationship, neither of which exists. Current state: click-to-chat
  (`wa.me`) only, through the `MessagingProvider` seam in `src/lib/messaging.ts`
  — a real per-vendor link, honestly labelled, not an API integration. Mitra is
  building a separate messaging service; implement `MessagingProvider` against
  it and return it from `messaging()`, and no call site needs to change.

- **Design spec file missing.** The v4 brief referenced
  `claude/buyer-ad-placement-design-spec.md` for the "Bumped ↑" tag convention.
  That file does not exist in either repo, so the bump indicator was implemented
  as a small "Bumped" chip on the ad card. Trivial to restyle once the spec
  exists.

