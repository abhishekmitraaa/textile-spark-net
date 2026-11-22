# Cosora-Admin review — Medium batch 2 (AR-M22 to AR-M41), 2026-11-22

Branch `fix/admin-review-medium2-2026-11-22` in both repos, on top of Medium batch 1 (not released; Mitra: "hold the
release"). Migration `supabase/migrations/20261122120000_admin_review_medium2.sql`, applied after `20261122110000`.

## Mitra's decision
- AR-M28: "Add a 10-minute job". The Customers summary is rebuilt by the job `customer-summary-refresh`
  (`admin.customer_summary_rebuild()`, every 10 minutes); the page only reads when it was built and says when the last
  rebuild failed or is late. This replaces the earlier rule "don't schedule it".

## Items
| Item | Where | Fix |
|---|---|---|
| M22 | `BillingIncidentsPanel.tsx` | Help text says what can really be done (no invoice to refund; no tax invoice reissue) |
| M23 | `Ads.tsx`, `AdReviewQueue.tsx`, `AdsMonitoring.tsx`, `lib/adsAnalytics.ts` | 50 at a time; monitoring reads every page; days in India time; booked money live only |
| M24 | `hooks/useUnsavedChanges.ts` on Theme, carousel, Billing details | Asks before a link, Back or closing the tab loses an edit (the discount form is a dialog: covered by High) |
| M25 | Accounts, trigram indexes on `profiles` | One search after typing pauses, in the address |
| M26 | `AccountStatus.tsx` | A status change refreshes the Accounts results |
| M27 | `useAdminSession.tsx`, `App.tsx` | Identity re-read every minute, on focus and on any refused read |
| M28 | `admin.customer_summary_rebuild`, job, `admin_customer_refresh` (read-only), Customers | See above |
| M29 | `admin_audit_log_actors` | Loose index scan instead of reading the whole log |
| M30 | `ResetPassword.tsx`, `lib/staff.ts` | Invite, recovery and new-password sign-ins go in the Admin Log |
| M31 | `admin_rfq_submissions_page`, Requirement review | Pages of 100; Approve confirmed |
| M32 | `conversations_last_message_idx` | Chats list ordered by an index |
| M33 | `SupportSettings.tsx` | Panels follow saved values only when they change |
| M34 | `Subscriptions.tsx` | Plan change and cancel say the listings over the new limit are paused |
| M35 | `lib/moneyRefresh.ts` | Every money list refreshes after any money action |
| M36 | `lib/certificates.ts`, Certificates | Counts per status, one tab 50 at a time |
| M37 | `Tabs` in `ui.tsx` | Fade and arrow when tabs are off screen; open tab scrolled into view |
| M38 | `Explainer` in `ui.tsx`, 7 pages | Explanations closed on phones, in plain words |
| M39 | Premises photos, Leads | Photo links named |
| M40 | `lib/storageUrl.ts` | Buyer pictures only from Cosora's Storage |
| M41 | `components/RoleLink.tsx` | Links to Vendors / Accounts only for roles that can open them |

## Compatibility
Old signatures kept (`admin_rfq_submissions`, `admin_customer_refresh` still answers with `refreshed_at`), so the
released admin keeps working once the migration is applied.

## Release order
After Medium batch 1: apply `20261122110000`, then `20261122120000`, then push both mains.
