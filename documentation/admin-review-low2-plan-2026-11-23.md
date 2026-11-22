# Cosora-Admin review — Low batch 2 (AR-L21 to AR-L40), 2026-11-23

Branch `fix/admin-review-low2-2026-11-23` in both repos, on top of Low batch 1's branch (`79fd831` / `a32bf23`). Migration
`supabase/migrations/20261123100000_admin_review_low2.sql`: anchored patches (both anchors found once on production,
read-only check 2026-11-23), two new readers, and the drop of a view nothing read (nothing depends on it on production).
No decision was needed from Mitra in this batch.

## Items
| Item | Fix |
|---|---|
| L21 | Replace and "Use default" on Category pictures, and deleting a blog category, ask first |
| L22 | Reports keep paise (`rupees()` no longer rounds; `inrText()` shows up to 2 decimals); the carousel's start and end are India time whatever the browser's zone (`toLocalInput` / `fromLocalInput` use `lib/blogs`' IST helpers), labelled so |
| L23 | System Health's two pipeline panels and Reports' flag log show a failed read as an error, never an empty state |
| L24 | `admin_embedding_pipeline_health`: guard coalesced, at most 500 rows |
| L25 | Sign-out ends this browser's session only (`signOut({ scope: "local" })`) |
| L26 | Admins shows its load error |
| L27 | A role change asks first ("takes effect straight away"); Cancel puts the dropdown back |
| L28 | Managers aren't offered a reset on a deactivated row the function refuses |
| L29 | "Section not available" names the section as the sidebar does (`sectionLabel()`) |
| L30 | An unknown request number is "There is no request …", asked once (P0002 / 22P02 → not found) |
| L31 | `/vendors/<not a uuid>` is "Vendor not found" with no database read (`lib/uuid.ts`) |
| L32 | A picture that fails to load becomes a "Picture unavailable" tile (`lib/brokenImages.ts`, one capture listener) |
| L33 | Touch screens: buttons, tabs, selects, checkboxes and links outside a sentence are at least 24 px (`index.css`) |
| L34 | The moderation queues read 15 at a time on a phone (50 on a computer) |
| L35 | Two page widths, not three; the Geography map is taller and narrower so India fills it |
| L36 | Tabs are a tab list (role tab, aria-selected, one tab stop, arrows / Home / End) |
| L37 | A requirement past the promised 3–5 minutes is marked "N min / h / d overdue"; a registration past 5 days says sellers are told 3–5 days |
| L38 | A keyword with no recorded author says "not recorded" |
| L39 | System Health › Embedding usage: `admin_embedding_usage(days)` (India days, at most 90, from the archive by time); the unread `embedding_usage_daily` view is dropped |
| L40 | System Health › Content Security Policy reports: `admin_csp_violations(limit)` (newest first, at most 500) |
