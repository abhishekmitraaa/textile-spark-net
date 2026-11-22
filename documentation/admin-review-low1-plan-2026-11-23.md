# Cosora-Admin review — Low batch 1 (AR-L01 to AR-L20), 2026-11-23

**LIVE 2026-11-23 (buyer main `344ddb3`, Cosora-Admin main `fd35854`; migrations `20261122140000`, `20261123100000`, `20261123110000` applied with the CLI, not in the ledger).**

Branch `fix/admin-review-low1-2026-11-22` in both repos (from main after the Medium release). Migration
`supabase/migrations/20261122140000_admin_review_low1.sql` (anchored patches; every anchor found once on production,
read-only check 2026-11-23).

## Mitra's decisions
- AR-L03 "Overseas only": an overseas registration is approved only after every document it sent is reviewed; Indian
  registrations keep their order.
- AR-L04 "Let vendor_ops review documents": vendor_ops verifies and rejects KYC documents, as support and super admins do.

## Items
| Item | Fix |
|---|---|
| L01 | An approval drops the row from the loaded queue (`dropFromQueue`) and marks the other tabs stale, no refetch of every page |
| L02 | Paused tab: no Reject or Remove |
| L03 | `admin_vendor_registration_decide` refuses `documents_unreviewed` for an overseas registration |
| L04 | `admin.vendor_document_decide` admits vendor_ops; the KYC panel's buttons follow |
| L05 | `admin_product_reasons_swap(a, b)`: one change |
| L06 | "View on site" for live listings and videos, "View store on cosora.in" on a vendor (`lib/site.ts`) |
| L07 | Form question errors in words (`attributeErrorText`); the key hint names "_" |
| L08 | A request's subject opens: chat, vendor, requirement (`/leads?open=`), quote's requirement, account, KYC's vendor, invoice, certificate, ad, review; listings and videos on cosora.in |
| L09 | Support and blog times in India time (`lib/ist.ts`) |
| L10 | A fraud record's request number links to the request |
| L11 | Already fixed with AR-H06 (live): the refund function asks Supabase Auth and checks the invoice id is a UUID |
| L12 | `admin_billing_incidents(open_only, before_at, before_id, limit)`: 50 at a time with Load older |
| L13 | Finished covers `budget_exhausted` and `archived` |
| L14 | Resuming a campaign Cosora paused notifies the seller (`ad_resumed`) |
| L15 | Plan names in the guarantee panel's invoices; the plan prices panel says when it couldn't load |
| L16 | The refund confirmation says the plan stays active |
| L17 | Publish on a scheduled article says when it goes public |
| L18 | `blog_href_ok()` in `blog_blocks_valid` and the hero button; the editors check the same |
| L19 | `admin_blog_unused_images()`; replaced, removed and abandoned uploads removed after the save or cancel |
| L20 | A banner destination that isn't one of the app's routes is flagged (`lib/cosoraRoutes.ts`, copied from App.tsx) |
