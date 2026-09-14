# Cosora — Deferred / Follow-Up Items

Durable record of everything explicitly **deferred rather than built**, so it
does not get lost the way the previous "still open" ledger nearly did.

Last reviewed: 2026-09-14 (Ads v4 follow-up).
Longer-form engineering notes live in `documentation/ToDo.md`; this file is the
short list of things someone has to *decide*.

---

## High priority

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

- **Eight ad types are advertised at a flat price but billed per day.** The
  Advertise catalogue shows `period: ""` (no "/day") for these, and the billing
  formula multiplies by campaign length anyway. Two were fixed on 2026-09-14;
  **six remain**:

  | Ad type | Shown | Billed, 7 days × 1 product | Billed, 30 days × 3 products |
  |---|---|---|---|
  | Wholesaler Pick | ₹59 | ₹413 | ₹5,310 |
  | Brand Ad | ₹69 | ₹483 | ₹6,210 |
  | Web & Mobile Combo | ₹129 | ₹903 | ₹11,610 |
  | Facebook & Instagram Ad | ₹59 | ₹413 | ₹5,310 |
  | Google Product Ad | ₹59 | ₹413 | ₹5,310 |
  | Social Media Combo | ₹99 | ₹693 | ₹8,910 |

  Fixed on 2026-09-14 (now genuinely flat, charged once per order):
  Trusted Seal ₹44, Verified Certificate ₹199 — the latter had been billing
  **₹72,635** on the 365-day campaigns the live certificate purchases actually
  carry.

  Repricing six live products is a business decision, not an engineering one,
  so their behaviour is unchanged. Decide whether each is genuinely flat (fix
  the billing) or genuinely per-day (fix the catalogue copy). `wholesalerPick`
  is the sharpest case: it is now a real 72-hour product, so billing it per day
  across a 30-day campaign is incoherent either way.
  Code: `src/lib/adPricing.ts` + `supabase/functions/_shared/adPricing.ts`
  (`VENDOR_LEVEL_TYPES`, `unitsFor`).

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

---

## Medium priority

- **`delivery_team` admin role.** Certificate dispatch is day-to-day operational
  work but is gated to `super_admin` / `finance_admin`, both roles carrying far
  broader authority. The enum value does not exist, so naming it anywhere would
  imply a role nobody can hold. Revisit when certificate volume justifies it;
  when adding, update `admin_role_type`, `certificate_fulfiller()`, and
  `SECTION_READ`/`SECTION_WRITE` in `Cosora-Admin/src/lib/roles.ts` **in the
  same change** — the roles file is UX only and the database is the authority.

- **City targeting reaches almost nobody.** Only 1 of the buyer profiles has a
  city set, and `ad_targeting_matches()` fails closed by design (a viewer whose
  city is unknown is not shown a city-targeted ad). A soft, dismissible nudge
  was added to the buyer profile page on 2026-09-14; if uptake stays low,
  decide whether to keep selling city targeting at all.

---

## Low priority / blocked

- **WhatsApp Business Cloud API.** Requires a Meta Business account and a BSP
  relationship, neither of which exists. Current state: click-to-chat
  (`wa.me`) only, through the `MessagingProvider` seam in `src/lib/messaging.ts`
  — a real per-vendor link, honestly labelled, not an API integration. Mitra is
  building a separate messaging service; implement `MessagingProvider` against
  it and return it from `messaging()`, and no call site needs to change.

- **Semantic ad matching (v3 Phase 11).** Deliberately unbuilt. The
  vector/embedding pipeline (products, RFQs, videos → `halfvec(1536)`, fused
  with keyword search by RRF in `match_products`) is real and running, but
  `advertisements` has **no embedding column** and ad targeting is plain
  category/city set-membership. So an ad tagged "Jeans" cannot match a search
  for "denim trousers" unless both resolve to the same taxonomy row by name.
  More relevant now that `searchListing` is actually placed.

- **Design spec file missing.** The v4 brief referenced
  `claude/buyer-ad-placement-design-spec.md` for the "Bumped ↑" tag convention.
  That file does not exist in either repo, so the bump indicator was implemented
  as a small "Bumped" chip on the ad card. Trivial to restyle once the spec
  exists.

---

## Done — moved out of this list

- ~~Vendor-level billing for Trusted Seal / Verified Certificate~~ — done
  2026-09-14. Charged once per order, materialised as one campaign row with
  `product_id = null`, one parcel. The entitlement model
  (`vendor_ad_verifications`) was already per-vendor and was left alone.
- ~~Wholesaler Pick 72-hour bump~~ — built 2026-09-14. Verified live: the paid
  campaign moved from position 3 to position 1 in its slot, stops being bumped
  at exactly 72 hours, and keeps serving afterwards.
- ~~`ad_orders` has no link to the campaigns it paid for~~ — done 2026-09-14,
  as `advertisements.ad_order_id` (the correct direction: one order → many
  campaigns).
- ~~Cross-repo migration dependency undocumented~~ — `MIGRATIONS.md` in both
  repos, 2026-09-14.
- ~~`razorpay-webhook` granted trust badges on payment~~ — removed 2026-09-14.
  It had kept its own copy of `grantSeals()` after `razorpay-verify-payment`
  dropped it, so "payment is never approval" held on one publish path and not
  the other.
