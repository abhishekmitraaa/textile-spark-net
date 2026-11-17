# Seller Home audit — Medium fixes, plan (2026-11-17)

Mitra, 2026-11-17: "plan a fix for all the bugs which were in medium priority and then fix them … ask me for decisions
which need my attention and plan on you own for the obvious fixes. do it in the batch of 20."

Source: `documentation/seller-home-audit-2026-11-15.md`. Sections A–C and every High item are live (2026-11-17). That
leaves 38 Medium items in sections D–L; two were already fixed with the High release (SH-036 by the live-update hub,
SH-092 with SH-090), so **36 remain: batch 1 = 20, batch 2 = 16**. Branch `seller-home/medium-fixes`.

## Decisions

| Item | Question | Decision |
|---|---|---|
| SH-044 | Social links are scored but nobody sees them | **Show them on the store** (Mitra, 2026-11-17), behind the same contact gate as the website; each box takes its own platform's links |
| SH-077 | Search terms on seller Analytics | **3-person floor** (Mitra, 2026-11-17): a term shows once 3 different visitors searched it, as on Live Activity and the buyer map; the rest are "Other searches" |
| all others | — | My call (obvious fixes), listed below |

## Batch 1 (20)

| Item | Fix |
|---|---|
| SH-034 | Every notice kind the database writes gets a destination (`notificationKindMeta`, the `ad_`/`certificate_` families by prefix); a kind with nowhere to go (billing incidents, admin-only) shows no action instead of pushing `/notifications` onto itself. `scripts/notification-kinds-check.mjs` reads every `notify(…, '<kind>'` in both repos' migrations and fails on an unknown kind. |
| SH-035 | Kinds grouped into real tabs (lead alerts and reviewed requirements → Requirements; plans, refunds, autopay, payment incidents → Payments); a tab with nothing in it is hidden (Quotes & Leads until something writes quote notices); copy says only what is sent; the requirements banner is the seller's lead alerts. |
| SH-041 | Contact sheet saves only changed fields (`contactChanges`), and won't edit over a failed or unfinished read (Try again). |
| SH-042 | Outside India the state is a typed region (country from `vendor_profiles.country_code`). |
| SH-043 | Changed phone/WhatsApp/email/website/PIN pass registration's rules in the sheet (`checkContactChanges`) and in the database (`trg_vendor_profiles_contact_checks`, migration `20261117100000`: a browser's new or changed value only). |
| SH-044 | Social links: per-platform rules (`src/lib/socialLinks.ts`), at most 3 per platform, Save waits for the saved links, store page "Find us online". |
| SH-045 | Score page: a failed or pending read shows no "Missing" badges and no count, with Try again. |
| SH-046 | "In review" badge when premises photos or listings wait for Cosora; the tile "Complete product details" is "Get a listing approved". |
| SH-054 | Upload: each step's required fields are checked before Continue. |
| SH-055 | A blank MOQ is stored as NULL ("Not specified"), never "2". |
| SH-056 | A PDF added to or removed from a live listing sends it back to review (database). |
| SH-057 | Listing photo/PDF write policies name their staff roles (super admin, product moderator); a staff change to a live listing is reviewed again. |
| SH-058 | Upload: photos are uploaded before the listing row is written, a failure removes what was uploaded, and only JPEG/PNG/WebP are offered. |
| SH-059 | At the plan's limit Publish keeps the form (no jump to /subscription): the seller can save a draft or upgrade. |
| SH-060 | Upload's steps are history entries (Back goes a step back); typed answers survive a refresh (photos must be picked again). |
| SH-061 | Listing photos are shrunk to 1600 px in the browser like every other upload. |
| SH-062 | `/products` shows an error with Try again, never "Your catalog is empty", when the read fails. |
| SH-072 | Deleting a catalogue deletes its PDF too and checks a row went; a failed insert removes the uploaded file. |
| SH-073 | Upload Catalogue at the plan's limit: the form is disabled with the reason and an Upgrade link. |
| SH-077 | Sellers lose raw `viewer_id`, `session_id` and `query_text` on `engagement_events`; Analytics reads counts from a definer function (`vendor_engagement_summary`) with the 3-person floor on search terms. |

## Batch 2 (16)

SH-078, SH-079, SH-080 (Leads/Quotes/Analytics), SH-091, SH-093, SH-094, SH-095, SH-096, SH-097, SH-098 (Advertising),
SH-101, SH-102, SH-103, SH-104, SH-105, SH-106 (Messages). Planned once batch 1 is done; SH-093 (seal and certificate
can't be bought) needs Mitra's decision.

## Release

Like the High fixes: every migration checked locally, then a read-only comparison on production, then the migrations
with the Supabase CLI (`db query --linked`), then the app. Nothing reaches production without Mitra's yes.
