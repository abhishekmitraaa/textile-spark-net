# Cosora-Admin review 2026-11-22 — High fixes, batch 1 (AR-H01 – AR-H18)

Source: `documentation/ToDo.md` → "Cosora-Admin review 2026-11-22". All 18 High items, one batch (Mitra asked for
batches of 20). Branch `fix/admin-review-high-2026-11-22` in both repos (worktrees `.worktrees/admin-high`).
Built and tested on the local stack; nothing reaches production until Mitra says so (main push = production deploy;
migrations and edge functions are applied/deployed one by one after a read-only production comparison).

## Mitra's decisions (2026-11-22)
- AR-H01 autopay: the admin action cancels the Razorpay autopay too; if Razorpay refuses, the action stops and says why.
- AR-H07 refund of a credited invoice: an upgrade charges only the difference, so the earlier invoice's value lives in
  the new plan; a full refund of it is refused (refunds go on the newest invoice). Mitra's words: "while upgrading to
  gold, the difference between the plan should only be taken at the transaction". Confirmed 2026-11-23: "yes, difference
  only at the transaction".
- AR-H11 Approve on the Rejected tab: kept, with a confirmation, and the seller gets the normal "approved" notice.
- AR-H13 test and demo money: left out of the totals and shown on their own line; the ledger gets a money filter.
- AR-H14 credit notes: shown to finance and to the seller, with a PDF.
- AR-H15 paid ads: refunded through Razorpay from the admin, like plan refunds; rejecting or suspending a paid campaign
  flags its order for refund.

## Database (buyer repo, migration `20261122100000_admin_review_high.sql`, plus `100100` for the money view)
| Item | Change |
|---|---|
| H01 | `admin_subscription_cancel`, `_change_plan`, `admin_refund_guarantee_close` refuse with `autopay_active` while the vendor has a live mandate (`authenticated/active/pending/halted`), the rule `admin_subscription_grant` already uses. |
| H02 | `subscription_fulfil`: stale only when the credit still available is less than the credit the order counted (`list - charge < o.credit_rupees`). A price change no longer refuses a paid order; reusing one credit twice (F07) still does. |
| H03 | Drop `vendor_documents_update` (the app replaces a document by insert + delete, `replaceVendorDocuments()`) and the storage policy `business_docs_owner_update`; the guard also refuses a non-admin change of `file_url`, `doc_type` or `detail` on a reviewed row. |
| H05 | `admin_support_claim(ticket, take_over boolean)`: refuses `held_by_other` when a colleague holds the ticket unless `take_over`; the one-argument form keeps working and never takes over. |
| H08 | `admin.keyword_breadth_problem(term)`: at least 3 characters, and refused when it appears in 2 or more of the ordinary sample messages the flag-pattern check uses. Called by `admin_keyword_add`. |
| H09 | `admin_vendor_list(search, onboarding, after_created, after_id, limit)`: keyset pages of 50 with account status, search on brand / city / GSTIN, indexed. |
| H10 | `admin.listing_revs` (kind, id, rev) bumped by triggers on a listing's content columns and on `product_images` / `product_documents`; `admin_listing_revs(kind, ids)`; `admin_listing_decide(kind, id, from, to, reason, rev)` (SECURITY INVOKER, so every moderation trigger and policy still applies as the admin) refuses `changed_since_loaded`. |
| H11 | `admin.notify_moderation_outcome` also sends the approved notice for rejected → live. |
| H12 | `admin_support_counts` reads only new / open tickets (every count already required that). |
| H13 | `admin.payment_entries` gains `payment_mode`; `admin_payments_summary` and `admin_report_summary` total live money only and return test and demo separately; `admin_payments_ledger` takes a mode filter. |
| H14 | `admin_credit_notes(vendor, after, limit)` for finance; sellers read their own rows (policy exists). |
| H15 | `ad_orders` gains refund columns and the status `refunded`; `admin_ad_refund_claim/record` (service role); rejecting or suspending a campaign with a paid order sets it to `refund_review`; `ad_order_refund_event` for webhooks. |

## Edge functions
- `subscription-autopay` (buyer repo): action `admin_cancel { vendorId }` for an active super admin or finance admin not
  on a temporary password; cancels through `retireMandates`, writes the Admin Log.
- `admin-refund-payment`, `admin-staff`, `admin-invite` (admin repo): the caller is confirmed by Supabase Auth with
  their own token (`/auth/v1/user`), refused while `must_change_password` is set (H06); the refund refuses a credited
  invoice (H07) and refunds an ad order (H15).
- `invoice-render` (buyer repo): draws a credit note PDF (H14).
- `razorpay-webhook` (buyer repo): records refund events for ad orders (H15).

## Cosora-Admin
- H01 Subscriptions: cancel / change / guarantee close call `admin_cancel` first when the vendor has autopay.
- H04 Blogs: the publish date is shown and saved in India time (one formatter both ways).
- H05 Support ticket: "Assigned to X" above the reply box with a confirmation before replying on a colleague's ticket;
  "Take over" asks first.
- H07 Invoices: Refund disabled on a credited invoice, with the reason.
- H09 Vendors: server search, filters and pages in the address.
- H10/H11 Products, Videos, Catalogues: decide through `admin_listing_decide`; Approve on Rejected asks first.
- H12 Support realtime: refreshes coalesced to one per 2 s, only the list, counts and the open ticket.
- H13 Payments, Reports: live totals, test/demo line, money filter.
- H14 Invoices: credit notes listed under the refunded invoice, PDF.
- H15 Payments: ad orders needing a refund, with Refund.
- H16 Modal: a dialog with typed changes asks before closing (backdrop, Esc, Back); Back closes a dialog; the blog
  editor warns before leaving the page.
- H17 Chats, Subscriptions: searches debounced, previous results kept while loading; the search box never unmounts.
- H18 Support ticket, carousel: one column below the breakpoint.

## Buyer / seller app
- H14 My Payments: credit notes under the refunded invoice, with the PDF.

## Tests (local stack)
SQL harness for every database item (rolled back); Playwright on the admin dev server for H04, H05, H09, H10, H11,
H16, H17, H18; Deno checks of the edge functions where Razorpay can be stubbed. Results go in `documentation/test.md`.

## Release order (after Mitra's go)
1. Read production's current bodies of every function changed here and compare with the local ones (CRLF).
2. Apply `20261122100000` and `100100`; deploy `subscription-autopay`, `invoice-render`, `razorpay-webhook`,
   `admin-refund-payment`, `admin-staff`, `admin-invite`.
3. Push both mains (Vercel deploys); check the live bundles.
