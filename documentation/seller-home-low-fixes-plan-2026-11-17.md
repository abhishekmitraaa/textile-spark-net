# Seller Home audit: the Low items, plan and record (2026-11-17)

**Request (Mitra, 2026-11-17):** "review the todo.md … plan a fix for all the bugs which were in low priority and then fix
them. I want you to ask me for decisions which need my attention and plan on you own for the obvious fixes. do it in the
batch of 20".

**Source:** `documentation/seller-home-audit-2026-11-15.md` (sections D–L) and root `todo.md` ("Seller Home audit — what
is still open"). There are 27 open Low items; SH-063 was fixed with the Medium batch. The local spec `audit-second`
("loads older" chat messages) also fails on main and is taken with batch 2.

**Status:** LIVE 2026-11-18 with the manual ad types (buyer main `26383e7`, admin main `37ecb85`).

**Branch:** `seller-home/low-fixes` (worktree `.worktrees/sh-low`). It is stacked on `ads/manual-types`, because both
change `Advertisements.tsx` (SH-099).

## Mitra's decisions (2026-11-17)

| Item | Question | Answer |
|---|---|---|
| SH-082 | "View quote" and "View RFQ" open nothing; quotes can't be revised | **View only:** the buttons open the quote and the request, read-only. Changing a price stays a conversation in chat. |
| SH-107 | "View Buyer Profile" in chat opens "Seller not found" | **Small buyer card:** name, company, city and member since. No contact details. |

## Batch 1 (20): built and tested locally, 2026-11-17

Commit on `seller-home/low-fixes`; migrations `20261117130000` (applied locally) and `20261117130100` (applied locally;
on production only after the app is live). Tests: `tests/local/seller-home-low.spec.ts` 7/7; related local specs
(catalogue-review, listing-edits, profile-score-ranking, seller-home-fixes, seller-home-high, seller-home-medium,
vendor-serious) 67/67; `seller-medium-fixes-check`, `notification-kinds-check`, `ad-pricing-check`, `i18n:check` (0
missing) pass. What was built differs from the plan below in these places:
- SH-051: `my_profile_score()` (the caller's own) goes out with batch 1, so the production specs and
  `scripts/lib/vendor-row.mjs` read the score through it before the column is revoked. The data export no longer
  includes the score (it's Cosora's ranking value, like the search text it already left out).
- SH-052: the existing `useStepBack(fallback)` already did this; it is reused, not a new helper.
- SH-053: `EditSheet` itself became a Radix dialog, so every sheet built on it (the reach and capacity sheets too) is
  one; the employees and turnover pickers use it.
- SH-064: the unit shows as one lower-case word ("per piece"), whether stored as "pieces", "Piece" or nothing.
- SH-069: the banner keeps its sentence about short videos and drops the "5×" heading for "Show your product in motion".


| Item | Plan (my call unless marked) |
|---|---|
| SH-037 | The bell's count always comes from a count query (not the newest 100). The page shows 100 at a time with "Show older", so "Read all" never clears notices the seller couldn't reach. |
| SH-038 | Signed out, `/notifications` says "Sign in to see your notifications" with a sign-in link, instead of loading forever. |
| SH-039 | Every title and body the database writes gets an entry in `external-strings.json`, with templates (`{0}`) for joined text. Buyer-written text in a title ("New requirement: …", "Follow-up due: …") is wrapped in `data-no-translate`. |
| SH-040 | The live `trg_notifications_update_columns` / `enforce_notification_update_columns()` goes into a migration file, copied from the database as it stands. `securityflags.md` and `ToDo.md` stop listing "notifications UPDATE allows any column" as open. |
| SH-047 | The score trigger fires after any update that changes status, vendor or what the score reads, not only an UPDATE that names `status`. |
| SH-048 | The browser's score trims and counts exactly as SQL does: spaces, tabs and line ends only, counted in code points. |
| SH-049 | The "State your production capacity" item opens the Capacity bands (the field the score reads), not Detailed information. |
| SH-050 | About Us shows a live count, "N of 11 characters to count toward your score", and the save says when it is too short to count. |
| SH-051 | `profile_score` stops being readable by visitors and other accounts. The seller reads their own through `seller_home_summary()`; ranking reads it in the database. |
| SH-052 | One helper, `useSafeBack(fallback)`: go back only when the app has history, else go to the page named. It is used on the score page, Upload Video and Upload Catalogue (SH-070, SH-074). |
| SH-053 | The edit sheets (employees, turnover, year, and every `EditSheet`) become real dialogs (`role="dialog"`, a focus trap, Escape to close) with a labelled back button. |
| SH-064 | Products shows prices with `priceText()` (paise kept) and one unit wording. |
| SH-065 | The Products category filter works and lists the seller's own categories. |
| SH-066 | "Duplicate" copies the whole listing: every field the form writes, its attributes, sizes and photos (the photo files are copied, so deleting one listing never breaks the other). PDFs aren't copied (each listing's own documents, under the 3-PDF limit). The copy is a draft for review, as before. |
| SH-067 | `product_documents_cap()` takes an advisory lock per listing before counting. |
| SH-069 | "Video Closeups get 5× more reach" is removed (no invented claims). |
| SH-070 | Deleting a video asks first; the back arrow uses `useSafeBack`. |
| SH-074 | Catalogues: the invented "3× more inquiries" line is removed; the fixed "0 views · 0 downloads" is removed (nothing counts them); `page_count` and `cover_url` aren't shown, since nothing writes them; delete asks first; the back arrow uses `useSafeBack`. |
| SH-081 | Quote prices must be more than 0: a CHECK on `quotes.price_per_unit` (`not valid`, so old rows are left alone), the same test in both forms, and a keypad with a decimal point. |
| SH-082 | **(Mitra: view only)** "View quote" opens a read-only dialog with the quote and the request it answers. |

## Batch 2 (7, and the failing chat spec): built and tested locally, 2026-11-17

Migration `20261117140000` (applied locally). Tests: `tests/local/seller-home-low-b.spec.ts` 5/5; `audit-second`'s chat
test 5/5 in a row. What was built differs from the plan below in these places:
- SH-099, impressions: Mitra, 2026-11-18, "there should be no daily cap and all the impressions should be recorded".
  The cap was what made the audit's finding (it read events only the browser wrote, so it held for nobody else); it is
  gone for everyone. `ad_impression()` counts every call on a running campaign, signed in or out, owner included. A
  per-viewer counter built first (`ad_impression_daily`) was dropped before release. Accepted: anyone can raise a
  campaign's impression count by calling the function; ads are flat-rate, so no one is charged for it.
- SH-099, the FAQ: the line that says ads "can be stopped" stays as it is (Mitra, 2026-11-18: "let the wording be the
  way it is").
- SH-108: the lists load 100 at a time with "Show older reviews"; the tab counts are over every review.
- audit-second: the app was right. Playwright's click scrolled the button into view, the scroll reached the top and
  loaded the older page by itself, and the button turned to "Loading…" and went away before the click. The test now
  presses the button where it is, as a keyboard or screen reader does.


| Item | Plan |
|---|---|
| SH-083 | "Repeat Buyers" counts a buyer once per request: a direct request and the conversation it opens are one touch. |
| SH-084 | `my_lead_alerts` leaves out requirements whose buyer has a block with the seller (either way). |
| SH-085 | Quotes and Seller Home print prices with `priceText()`. |
| SH-099 | `ad_impression` writes the events its cap counts. The X is hidden on campaigns that went through review (nobody deletes a reviewed campaign, by rule), so it no longer fails. Signed out or loading, the page doesn't claim "Your current (Free) plan". "No subscriptions" and "Automatically finds and updates audiences" are replaced with true wording. The "Date Range" button is removed. The FAQ wording is Andy's, so it is raised, not changed. |
| SH-107 | **(Mitra: small buyer card)** `chat_buyer_card(conversation)` returns name, company, city and member since to the other participant only, never while blocked. Names are read in groups of 100. Names and previews carry `data-no-translate`. |
| SH-108 | Review averages and breakdowns come from the database (`vendor_review_stats()`); replies are limited to 2,000 characters (function and CHECK); sharing uses `<ShareSheet>`. |
| SH-109 | `/reviews` and `/help` get an `h1`. |
| audit-second | Fix "Load earlier messages" being re-rendered before it can be tapped, or the test if the test is wrong. |

## Release

Each step needs Mitra's yes: migrations through the CLI, any function deploys, then push buyer main (and Cosora-Admin main
if it changes).
