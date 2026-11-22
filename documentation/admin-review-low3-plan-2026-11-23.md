# Cosora-Admin review — Low batch 3 (AR-L41 to AR-L52), 2026-11-23

**LIVE 2026-11-23 (buyer main `344ddb3`, Cosora-Admin main `fd35854`; migrations `20261122140000`, `20261123100000`, `20261123110000` applied with the CLI, not in the ledger).**

Branch `fix/admin-review-low3-2026-11-23` in both repos, on top of Low batch 2's branch (`9e09fa3` / `fdba6e6`). Migration
`supabase/migrations/20261123110000_admin_review_low3.sql`: one index and two readers, nothing existing changed (the
tables and roles they read match production, read-only check 2026-11-23).

## Mitra's decisions
- AR-L49 "Keep for now": `admin.demo_ads_offline` and `admin.demo_catalogue_offline` stay; the item stays open.
- AR-H07 confirmed (2026-11-23, "yes, difference only at the transaction"): an upgrade charges only the difference, so
  a credited invoice isn't refunded in full. Live since 2026-11-22.

## Items
| Item | Fix |
|---|---|
| L41 | The vendor page shows Bulk imports (`admin_vendor_import_batches`, last 20, 20 row errors each) and Contact reveals (`admin_contact_reveals`, both directions, last 50); index `vendor_contact_reveals_vendor_time_idx` |
| L42 | A requirement card without photos has a "No photos" tile in the photo's place |
| L43 | `/leads?lead=<id>` opens the request (Support's `?open=` links too, now `?lead=`); the parameter is taken out as the dialog opens so Back closes it; "Copy link" in the dialog; Leads times in India time |
| L44 | A table wider than the screen shows a fade and "Scroll ›" until scrolled to the end (`Table`) |
| L45 | Products tabs show counts (one head-only count per tab), refreshed after a decision |
| L46 | Back links are a 44 px target on a phone (`BackLink`) |
| L47 | A review without a message says why: a chat reported as a whole, or a matched message deleted with its account |
| L48 | A `?q=` over 100 characters is cut to 100, not sent to be refused |
| L49 | Not done: Mitra keeps the demo restore tables for now |
| L50 | The navigation rail shows "More below ⌄" while sections are out of sight |
| L51 | One in-app confirmation (`useConfirm()`, `components/Confirm.tsx`) replaces all 13 browser `confirm()`s, refunds included; a destructive one starts on Cancel |
| L52 | `Table fit` drops the 640 px floor; reasons and keywords wrap their buttons; block reasons is three columns |
