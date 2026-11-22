# Cosora-Admin review — Medium batch 1 (AR-M01 to AR-M21), 2026-11-22

Branch `fix/admin-review-medium1-2026-11-22` in both repos. Migration `supabase/migrations/20261122110000_admin_review_medium1.sql`.
AR-M06 (the dialog) shipped with the High batch, so this batch is the next 20: M01–M05, M07–M21.

## Mitra's decisions
- AR-M18: keep the whole chat on the review page ("Keep whole, fix the rest"): no paging, but no reload on every tab focus,
  lazy photos, and a new file no longer re-signs every link.
- AR-M13: "Toggle on the page": the review tab of Products, Video Closeups and Catalogues is oldest first by default, with
  an Oldest first / Newest first switch kept in the address; the other tabs default to newest first.

## Items
| Item | Where | Fix |
|---|---|---|
| M01 | `set_account_status`, `catalogues_insert`, `AccountStatus.tsx` | Notice and card list everything suspension stops; catalogues now refused to a suspended seller |
| M02 | `useAdminSession.tsx` | Query cache cleared on sign-out and when another account signs in |
| M03 | `Guard.tsx`, `Login.tsx` | Sign-in returns to the page asked for (`safeReturnPath`) |
| M04 | `hooks/useUrlState.ts`, 25 pages | Tabs, filters and searches in the address (replace, never push) |
| M05 | `components/BackLink.tsx` | Back goes back in the app's history, else to the list |
| M07 | 20 files, `index.css` | `text-ink-ghost` text → `ink-faint`; dark `ink-muted` / `ink-faint` raised |
| M08 | `ui.tsx` `Stat` | Figures wrap and step down on phones; icon hidden on phones |
| M09 | `admin_vendor_location_counts()`, `Geography.tsx`, `lib/geo.ts` | Grouped counts from the database, no 1,000 cap |
| M10 | `SystemHealth.tsx` | All 26 jobs described; overdue gap derived from each schedule |
| M11 | `admin_search_trend_hide`, `trg_search_trend_items_snapshot` | Hide removes the term from the published run; no recompute |
| M12, M13 | `lib/queuePaging.ts`, `QueueSortToggle`, Products/Videos/Catalogues, 3 indexes | 50 at a time, keyset (created_at, id), order toggle |
| M14 | `lib/registrations.ts` | Approved photos page past rows with no `reviewed_at` |
| M15 | `admin.premises_photo_decide`, `admin.vendor_document_decide` | Four-argument forms refuse a stale decision; KYC refreshes the queue and badge |
| M16 | `admin.review_report_decide`, `admin_review_reports_list(4)` | Dismiss closes the reports on screen only; list pages by 100 |
| M17 | `admin_am_vendors` | Filter, serve-check and sort before the 500 cut |
| M18 | `ChatThread.tsx` | Focus reload only when a minute old; files signed per group of 100; lazy media |
| M19 | `lib/chat.ts`, `admin_conversation_review_page()` | Ids 100 per request; review tabs page by 100 |
| M20 | `admin.rfq_review_reasons` | `trg_admin_audit` |
| M21 | `subscription_refund_event`, `billing_incidents` | A failed plan refund opens a `refund_failed` incident, flagged when its guarantee is closed |

## Compatibility
The released app keeps working on the new database: every changed RPC keeps its old signature (the three-argument photo and
KYC decisions, the four-argument report decide, the one-argument report list). Checked by running the browser script
against the released admin on the migrated local database.

## Release order
1. Read-only production comparison of the functions rewritten in full (saved local originals in the session scratchpad).
2. Apply `20261122110000`.
3. Push both mains (admin: the app; buyer: translations and docs).
