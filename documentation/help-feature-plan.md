# Help & Support: build plan

- **Date:** 2026-09-30.
- **Status:** planned. Nothing is built. Stage 5 (review) is next.
- **Decided by:** Andy (product owner), with the items marked for Mitra or counsel still open.
- **Inputs:** `help-feature-audit-research-and-implementation-report.md` (the "report", 2026-09-30), and the planning
  session that checked it against both repos and the live database.

**How to read this.** It refers to the report's IDs (features F1-F37, decisions D1-D10 and 1-13, risks R1-R11,
phases 0-9) and records only where this plan departs from it. The session's own decisions are D-01 onward, and its
architecture records are A1-A9.

**Session guardrails, carried into the build.**
- Sign-in is never changed by this work.
- Every merge to `main` is a production deploy, and Mitra approves it.
- Migrations are rehearsed in a rolled-back transaction first.

---

## 1. Goal, non-goals, done

**Goal.** Every Help feature in the buyer and vendor designs works for real, and staff with the `support` role
answer it from Cosora-Admin (D-01 to D-03). The features:
- live support chat, with photo (camera and gallery), audio voice notes and PDF;
- callback requests;
- a fraud report with evidence;
- app feedback;
- the four Quick Guides;
- vendor help and vendor FAQs;
- an online/offline state driven by opening hours;
- in-app notifications;
- every "contact support" dead end in the app leading somewhere.

The delete-account flow already exists; its email and WhatsApp delivery is owner setup (MPF-4, MPF-24).

**Non-goals now (D-02: debated after launch).** SLA engine and published SLA targets, CSAT, a support analytics page,
saved replies (macros), search upgrades and helpful votes, any AI, WhatsApp, outbound email beyond two receipts,
signed-out ticket intake, video attachments, typing and presence indicators, a named agent (D-06), and routing
tickets to other admin roles.

**Done, in user terms.**
- A buyer or vendor opens Help and chats with "Cosora Support".
- Outside Mon-Fri 10:00-19:00 IST, the chat says when the reply will come, and the message waits.
- A support-role staff member sees the chat in Cosora-Admin, answers, attaches files and resolves it.
- The user gets the reply in the app even after leaving the page.
- A callback request gets a call and a logged outcome.
- A fraud report is stored, reviewed in a restricted queue, and acknowledged with an ID. Feedback gets an ID the same
  way. Both get an email receipt once email is set up.
- A vendor gets vendor help, not buyer help.
- Nothing on the page claims something that isn't true.

---

## 2. Decisions

| ID | Decision | By | Status |
|---|---|---|---|
| D-01 | Build in-house; no bought help desk | Andy | closed |
| D-02 | Make the designed features work first; extras are debated afterwards | Andy | closed |
| D-03 | Run it from Cosora-Admin, staffed by the `support` role | Andy | closed |
| D-04 | Support phone **+91 88155 78226**, staffed 10:00-19:00 IST; `instagram.com/cosora` is Cosora's account | Andy | closed |
| D-05 | Supabase is on the Free plan; an upgrade is planned | Andy | tier and date: **Mitra** |
| D-06 | Users see only "Cosora Support"; the assigned agent is visible in Admin only | Andy | closed |
| D-07 | After hours the chat stays open as messages, with an offline notice and the next reply time | Andy | closed |
| D-08 | Admin access: support and super_admin read and act; manager reads only; other roles see nothing. Every phone-number reveal is logged | Andy | closed |
| D-09 | Attachments: photo, audio and PDF now; video after the Supabase upgrade | Andy | closed |
| D-10 | Any active admin with the support role can answer, from one shared queue | Andy | who holds the role: **Andy / Mitra** |
| D-11 | Refunds: a manual process (support passes the request to finance, who refund by hand in Razorpay); the Terms state the 7-day guarantee | Andy | process: **Mitra**; Terms wording: **Andy**, then counsel |
| D-12 | The 7 inaccurate buyer FAQs (MPF-14) stay live until launch; true replacements are drafted in the build and swapped in at launch | Andy | risk accepted |
| D-13 | Andy rewords her Seller Registration and Subscription answers (MPF-16) in `/faqs` | Andy | action: **Andy** |
| D-14 | No launch to real users while the dummy OTP is on; until then support runs for staff and test accounts only | Andy | switch-off date: **Mitra** |
| D-15 | Grievance Officer named later (`ToDo.md`); the `/grievance` page is built but hidden until named | Andy | **Andy / Mitra / counsel** |
| D-16 | When a buyer's deletion completes, their support messages and files are scrubbed. Fraud reports are kept until counsel sets a period | Andy | period: **counsel** |
| D-17 | The personal address on the Terms' Contact Information goes to `ToDo.md`; this build doesn't change it | Andy | **Andy** |
| D-18 | Hours: Mon-Fri 10:00-19:00 IST, closed weekends and holidays; editable in Admin with a holiday list | Andy | closed |
| D-19 | Staff reply in Hindi and English for now; automatic messages are in English, Hindi and Gujarati | Andy | closed |
| D-20 | Feedback gets a report ID, always shown on screen and in the bell, plus an email once Resend is configured | Andy | closed |
| D-21 | One scheduled job, every 15 minutes: auto-close resolved chats after 7 silent days, and flag callbacks that are due | Andy | approval: **Mitra** |
| D-22 | Email receipts for feedback and fraud reports only; the email carries no details of the report | Andy | closed |
| D-23 | Mitra sets up Resend (MPF-4) before support launches | Andy | action: **Mitra** |

### Architecture records

**A1. One case record for every request.**
- Context: chat, callback, fraud report and feedback all need an owner, a status, a history and one Admin queue.
- Options (scored in the session, out of 40):
  - the report's full model all at once: 32;
  - the same model, built in stages: 37;
  - a thin request table with the thread stored in one field: 30;
  - reusing the buyer-vendor chat tables: 25.
- Choice: the report's model (its D1), built in stages. Each request is one `support_tickets` row with a `channel`
  (chat, callback, fraud_report, feedback).
- Consequence: one queue and one history. The later tables (callbacks, fraud details, guides) are additive migrations.

**A2. Separate support tables, not `conversations` and `messages`.**
- Context: verified 2026-09-30. `messages_insert` requires `account_status = 'active'`. Every message runs through
  the blocklist and flag-pattern triggers. `conversations_select` has its own rules.
- Options: reuse the chat tables, or build separate ones.
- Choice: separate tables (the report's D2). Chat reporting (`submit_report`) stays as it is; Help explains it and
  links to it.
- Consequence: suspended users can appeal. Reusing chat would have locked them out.

**A3. Live updates.**
- Context: live chat is a designed feature (D-02). The project is on the Free plan: 200 realtime connections and 100
  messages a second.
- Options (scores are from before live chat was confirmed):
  - piggybacking on the existing notifications channel: 38;
  - Postgres Changes on the new tables: 35;
  - Broadcast: 31;
  - polling: 37.
- Choice: Postgres Changes on `support_messages` and `support_tickets`. It copies `src/lib/queries/chat.ts`, plus the
  per-instance channel name from `src/lib/queries/notifications.ts:92-127` (a shared name breaks when two components
  subscribe). All of it sits behind one hook, `useSupportThread`.
- Consequence: the proven pattern, with a later swap to Broadcast behind the same hook if the plan limits bite.

**A4. Attachments.**
- Context: evidence and voice notes are designed features. The Free plan shares 5 GB of downloads a month across the
  whole app.
- Options: copy the `business-docs` bucket pattern as it is, or narrow its admin gate.
- Choice: a private bucket `support-attachments`, path `{ticket_id}/{uuid}.{ext}`.
  - Policies go through a definer helper (ticket requester, or `admin.support_can_read()`), because the
    `business-docs` read policy admits every admin role through `is_admin()`.
  - Caps: image 5 MB, PDF 10 MB, audio 5 MB (about 2 minutes).
  - A server-side file-signature check marks a file clean before anyone sees it.
  - PDFs are download-only in Admin.
  - **Fraud evidence is write-only for the reporter**, who sees "N files received", never the files.
  - No malware scanner in v1; one is chosen before video or signed-out uploads.
- Consequence: limited damage if a dummy-OTP account is taken over; small egress.

**A5. Access control.**
- Context: D-08. Admin permissions change in four places together: the RPC gates, `SECTION_READ` and `SECTION_WRITE`
  in Cosora-Admin `src/lib/roles.ts`, the RLS policies, and the docs.
- Choice:
  - `admin.support_can_read()` admits super_admin, support and manager.
  - `admin.support_can_write()` admits super_admin and support. It follows the existing
    `admin.customers_can_read()` pattern.
  - Phone numbers are masked until a reveal, and each reveal writes an `admin.audit_log` row, so it shows on the Admin
    Log page.
- Consequence:
  - `ROLE_LABELS.support` changes from "Support (read-only)" to "Support".
  - The Manager description in `sides.md` changes, because managers now read personal data in support tickets.

**A6. Hours and the rollout switch.**
- Context: D-07, D-14, D-18. The hours on the page today are hardcoded and unenforced.
- Choice:
  - Tables `support_hours`, `support_holidays` and a one-row `support_settings` whose `rollout` is off, staff or all.
  - A public `support_status()` returns: open now, the next open time, and the rollout state.
  - The RPCs refuse when the rollout excludes the caller. "Staff" means active admins plus an allowlist of test
    accounts.
- Consequence: the banner, the offline notice and the reply estimate come from one place, and switching support off
  needs no deploy.

**A7. Honest email.**
- Context: D-20, D-22, D-23. Resend isn't configured today, and phone-created accounts have no email.
- Choice: a new edge function `support-receipt`, using a new shared helper `_shared/resend.ts`. It returns sent,
  not_configured or no_email.
  - The app says "We've emailed you" only on sent. The ID is always shown on screen and in the bell.
  - `account-deletion` isn't touched. Its Resend code moves to the helper later.
- Consequence: no false "email sent". Receipts start the day Resend is configured, with no code change.

**A8. Events and audit.**
- Context: verified 2026-09-30. `admin.audit_row_change()` records only active-admin actions, skips writes made by
  scheduled jobs or server functions, and on insert copies the whole row.
- Choice:
  - An append-only `support_events` table records every status change by the requester, an admin or the scheduled
    job.
  - `trg_admin_audit` goes on `support_tickets` and the configuration tables, and **never on `support_messages`**
    (it would copy every message body into the Admin Log).
  - Support messages are append-only for everyone.
- Consequence: a complete timeline, with no personal data duplicated into the audit log.

**A9. Room for the financing product.**
- Context: house constraint 12. The schema must not close off vendor financing.
- Choice: generic `entity_type` and `entity_id`, a server-built `context` field, and categories stored as rows.
  "Vendor didn't reply" tickets carry facts the server computes (last vendor message time, quote state).
- Consequence: those facts can later feed a vendor-reliability signal.

**Rules every support function keeps.**
- SECURITY DEFINER with a pinned `search_path`.
- One overload per function. Adding a parameter means DROP then CREATE.
- A signed-in caller (`auth.uid()` not null) and `account_not_deleted()`.
- **No `account_is_active()` gate**, so suspended users can appeal.
- Per-user rate limits, for example 5 new requests an hour and 30 messages in 5 minutes.
- EXECUTE revoked from `public` and `anon` unless a function is meant for signed-out callers.
- Message bodies of 4,000 characters at most, rendered as plain text, with `data-no-translate` on what users type.

---

## 3. Phase plan

**Every build prompt:**
- is page-specific and names exact file paths;
- delivers direct overwrites;
- edits `App.tsx` (in either repo) only by surgical line insertion;
- uses the theme tokens, never new hex values (`brand-vendor` #256fef on vendor surfaces, `brand-buyer` #EF4D62 on
  buyer surfaces and urgent alerts, #d0d4dc for inactive);
- runs `npx tsc --noEmit --skipLibCheck -p tsconfig.app.json` (buyer app) or `tsc` (Cosora-Admin), plus
  `npm run i18n:check`, before delivery;
- ends with the documentation protocol and the line "build completely then stop and wait for confirmation before
  proceeding to the next section."

### P0. Owner actions (no code; in parallel with everything)
Exit: every item below has a date.
- **Andy:**
  - reword the MPF-16 answers (D-13);
  - approve the MPF-14 replacement answers (drafted in P5);
  - say which staff get the support role (D-10).
- **Mitra:**
  - write the manual refund process (D-11);
  - set up Resend (D-23);
  - approve the scheduled job (D-21);
  - give a date for switching off the dummy OTP (D-14);
  - plan the Supabase upgrade (D-05).
- **Counsel:**
  - whether the grievance rules apply;
  - a retention period for fraud reports;
  - the Terms wording for the refund guarantee;
  - the missing Privacy Policy page.

### P1. Honesty patch (buyer app; small; ships first)
Exit: no fake agent, fake reply, fake presence, fake success message or dead button remains on a live page.
- `src/pages/Help.tsx`:
  - remove `ChatModal` and its typing indicator;
  - "Chat with us" and "Start Live Chat" become "Email us" (`mailto:` with a subject) until P3;
  - "Request a Callback" becomes "Call us: +91 88155 78226, Mon-Fri 10:00-19:00 IST";
  - hide the Quick Guides;
  - honest "Still need help?" copy;
  - for vendors, a note that this is buyer help and how to reach support (MPF-15 option b).
- `/profile/help/chat` (`SupportChat.tsx`) redirects to `/help`.
- `src/pages/ReportFraud.tsx`:
  - a prefilled `mailto:` with a body template in place of the fake submit;
  - remove "reviewed within 48 hours";
  - the layout by role, as `src/pages/Chat.tsx:271` does.
- `src/lib/notificationsStore.ts:279`: the suspension notice's "Contact support" gets `href: "/help"`.
- Every new string goes in `hi.json` and `gu.json`.
- Closes the two Help flags logged on 2026-09-30 in `securityflags.md` (the fraud form, and the chat notice and fake
  staff).

### P2. Data layer (buyer repo, `supabase/migrations/`)
- Entry: none, but sequence it with admin-completion Phases 10-12. Write policies in the Phase 12 style
  (`(select auth.uid())`).
- Exit: every table, function, bucket and policy is live, `rollout = off`, and the role-simulation tests pass.

**2a Schema.**
- Tables, each with RLS on:
  - `support_tickets`;
  - `support_messages`;
  - `support_events`;
  - `support_categories` (seeded; labels in English, Hindi and Gujarati);
  - `support_hours` and `support_holidays` (seeded to D-18);
  - `support_settings`.
- The ticket-number sequence (`CS-000001`).
- The two admin gate functions, and `trg_admin_audit` on tickets and the configuration tables.

**2b Requester functions.**
- `support_status`;
- `support_start_chat`, `support_post_message`, `support_prepare_upload`;
- `support_end_chat`, `support_reopen` (within 7 days);
- `support_request_callback`, `support_report_fraud`, `support_submit_feedback`;
- `support_my_requests`.

**2c Admin functions.**
- `admin_support_list`, `admin_support_get`;
- `admin_support_claim`, `admin_support_reply` (public reply or internal note), `admin_support_set_status`,
  `admin_support_reassign`;
- `admin_support_reveal_contact`;
- `admin_callback_log_attempt`, `admin_fraud_set_outcome`, `admin_feedback_mark_reviewed`;
- setters for hours, holidays and rollout (super_admin only);
- `admin_help_guide_*`.

**2d Storage, realtime and notifications.**
- The `support-attachments` bucket and its policies.
- `support_messages` and `support_tickets` added to the `supabase_realtime` publication.
- `support_notify()`, a wrapper around `notify()` whose signature stays unchanged. Its kinds are `support_reply`,
  `support_status`, `support_callback` and `support_receipt`.
- The `help_guides` table.

**2e Tests.** The role-simulation and mutation SQL tests in section 4.

### P3. Requester screens (buyer app)
- Entry: P2.
- Exit: every designed buyer and vendor flow works end to end for staff and test accounts.

**3a Help home** (`/help`, alias `/profile/help`).
- The layout follows the role.
- A status banner from `support_status()`.
- FAQs by role: `buyer_help` or `seller_help` (P5).
- Actions: Chat, Request a callback, Call us, Email, Instagram, Report fraud, Feedback, My requests, Delete account.

**3b Chat** (`/help/chat` starts a chat or resumes the open one; `/help/requests/:ticketNo` shows a thread).
- Reuses the `SupportChat.tsx` layout, with `useSupportThread` as the data layer.
- The monitoring notice.
- End chat, a closed state, start a new chat, reopen.

**3c Attachments.**
- Camera, gallery and PDF.
- A hold-to-record voice note, through a new `useVoiceRecorder` hook:
  - MediaRecorder with `isTypeSupported`: webm/opus, with mp4/aac as the Safari fallback;
  - a 120-second cap;
  - a file-picker fallback when the microphone is refused.
- Nothing like it exists yet. `useSpeechSearch` is speech-to-text, not recording.

**3d Other forms.**
- `/help/callback`.
- `/report-fraud`, as a wizard. Signed-out visitors see "sign in, call or email".
- `/feedback`. The My Store row goes back to "App Feedback".
- `/help/guides/:slug`.

**3e My requests, notifications and context links.**
- A `/help/requests` list.
- The new notification kinds in `KIND_META`, linking to `/help/requests`.
- Context links into `/help/chat?category=…&entity_type=…&entity_id=…` from:
  - `Kyc.tsx` (3 places);
  - `MyPayments.tsx` (2);
  - `campaignRunState.ts`;
  - `calls.ts`;
  - `accountDeletion.ts`;
  - the chat thread menu;
  - the suspension notice.
- `<ClarityMask>` on every support route.
- The i18n pass.

### P4. Admin console (Cosora-Admin)
- Entry: P2. Built alongside P3. **P3 and P4 launch together.**
- Exit: staff can work every channel.

**4a Roles and inbox.**
- `roles.ts` sections `support` and `support-settings`, plus nav and routes.
- A realtime inbox at `/support`, filtered by channel, status, category, side, language and assignee.

**4b Ticket workspace** (`/support/:ticketNo`), reusing the patterns in Admin `ChatThread.tsx`.
- Reply or internal note; attachments through signed URLs.
- Claim, reassign, resolve.
- A context card: account status, buyer or vendor, plan, KYC, the linked item.
- A logged phone reveal.
- Links to `set_account_status` and `admin_flags`.

**4c Boards.**
- `/support/callbacks`.
- `/support/fraud`, restricted, with outcome codes.
- `/support/feedback`.

**4d Settings and guides.**
- `/support/settings`: hours, holidays and rollout; super_admin writes.
- A Guides tab on `/faqs`.

### P5. Content
- Entry: P2, plus Andy's approvals.
- The `seller_help` FAQ surface, added in all five places. Also update the tests and scripts that list surfaces:
  - the `faqs_surface_check` constraint and `admin_faq_add()`'s check;
  - `SURFACES` in `supabase/functions/faqs-snapshot/index.ts`;
  - `FaqSurface` in `src/lib/queries/faqs.ts`;
  - the surface list in Cosora-Admin `src/pages/Faqs.tsx`;
  - `scripts/faq-snapshot-check.mjs`;
  - `tests/faqs-*.spec.ts`, `scripts/faq-cdn-propagation.mjs` and `scripts/load/faq-read.k6.js`.
- Vendor FAQs, true today: KYC, lead caps, product and video moderation, ads review, billing, suspension.
- The four Quick Guides.
- The MPF-14 replacements, ready to swap in at launch (D-12).
- FAQ translations stored with the FAQ (the open ToDo), because it touches the same five places.

### P6. Background work
- `support-receipt` and `_shared/resend.ts` (D-20, D-22).
- The `support-sweep` job, once Mitra approves it (D-21). It adds about 96 rows a day to what `cron-history-prune`
  clears.
- The deletion scrub in `anonymize_account()` and the deletion sweep (D-16).
- The `/grievance` page, hidden until named (D-15).

### P7. Launch gate
- Entry: P2-P6.
- Exit: section 4 passes, then gate **G1**:
  - at least one active support-role admin who has practised on the inbox;
  - Resend configured (D-23);
  - the dummy OTP off (D-14);
  - holidays entered;
  - the MPF-14 replacements approved and swapped in;
  - the refund process written before the billing category is switched on (D-11);
  - the scheduled job approved, or its tasks done by hand.
- Then set `rollout = all`.

### P8. After launch
Debate the non-goals, video (after the upgrade), WhatsApp through the `MessagingProvider` seam in
`src/lib/messaging.ts` (`ToDo.md` "Integrate Cosora's own messaging service"), and the metrics in section 7.

---

## 4. Test plan

- **Role simulation in SQL** (`set local role authenticated` with `request.jwt.claims`, inside a rolled-back
  transaction):
  - user A can't read user B's ticket, messages or files;
  - internal notes never reach the requester;
  - a fraud reporter can't read their own evidence;
  - manager reads, and every manager write raises 42501;
  - other admin roles and signed-out callers get nothing;
  - a suspended user can open a request, and a deleted one can't;
  - rate limits trip;
  - `rollout = staff` refuses a normal user;
  - storage refuses a path outside the caller's ticket;
  - each function has one overload.
- **Mutation tests.** In a rolled-back transaction, weaken one policy at a time: drop the internal-note filter, widen
  a gate to `is_admin()`, remove the evidence rule. The matching test must fail every time.
- **Playwright never writes to production.**
  - Specs run against the local Supabase stack: `supabase start`, then `supabase db reset` to apply the migrations
    (`supabase/config.toml` exists; Docker on this machine is unverified). The fallback is a Supabase branch database
    after the plan upgrade.
  - Tracking calls are answered in the browser, as existing specs do.
  - Four sessions: buyer, vendor, support admin, super admin.
  - If a spec ever has to touch production, its tickets carry `context.test = true`, are left out of counts, and are
    removed by `scripts/support-test-cleanup.sql`, written like `scripts/loadtest-cleanup.sql`.
  - The CI e2e job stays unable to run against production (`myprofileflags.md`, open decision 2).
- **Load.** `scripts/load/support.k6.js`, beside `faq-read.k6.js`: open a ticket, post, read the thread, list.
  Local stack or branch only.
- Every prompt runs the two `tsc` commands and `npm run i18n:check`.

---

## 5. Rollout and fallback

`rollout = off` (P2) → `staff` (admins and allowlisted test accounts, once P3 and P4 are verified) → `all` (after G1).

**Fallback:** a super admin sets `rollout = off` in `/support/settings`. Help goes back to the honest P1 state (call,
email), and tickets stay readable in Admin. No deploy is needed.

---

## 6. Documentation per phase

- Every phase: `changelog.md` and `test.md`.
- Schema and pattern phases (P2, P3b, P3c, P6): a new "Support" section in `technicalimplementation.md`.
- Route changes (P1, P3, P4): `sitemap.md`, fixing the stale `/about` row and the stale "support reads FAQs" line;
  Cosora-Admin `README.md` for admin routes.
- Flow changes: `sides.md`, buyer, vendor and admin sections. Replace the line that lists "Support chat, fraud reports,
  app feedback" as if they existed, and update the Manager description (D-08).
- `securityflags.md`: new flags as found. Close the 2026-09-30 Help flags when P1 and P3 land.
- `ToDo.md`: move MPF-15 to Completed at P3.
- `claude.md`: the business rules this plan settles (hours, phone, team name, reply languages, admin access,
  attachments, receipts, retention default, the OTP launch rule), and fix the stale sign-in note at lines 41-47.
- Cosora-Admin `CHANGELOG.md`, in step with its phases.

---

## 7. Risks and open questions

| Risk | Earliest signal | Mitigation |
|---|---|---|
| Nobody answers | oldest open ticket older than 1 working day | G1 staffing; the inbox sorts oldest first |
| Someone reads another user's support chat through the dummy OTP | any ticket from an account with `created_by = otp-dev-verify` | D-14 launch rule; write-only evidence |
| Spam from accounts the dummy OTP creates without limit | tickets from accounts less than a day old | rate limits; the rollout switch |
| Wrong answers from inaccurate FAQs (MPF-14, 16, 17) | a billing ticket citing the 7-day guarantee | D-11, D-12, D-13 |
| A broken hours promise | a reply later than the stated time | hours as data; holidays entered |
| Free-plan downloads (5 GB a month, shared) | the egress trend once attachments ship | caps; video after the upgrade |
| Clash with admin-completion Phases 10-12 | two branches touching the same policies | sequence with Mitra; Phase 12 policy style from the start |
| Live migrations on the only database | a failed rehearsal | rolled-back rehearsal; `rollout = off` |
| An email claimed that didn't send | none (designed out) | A7 |

**Metrics to judge Help at 30, 60 and 90 days** (targets are proposals):
- median first human reply: 1 working day, then 6 hours, then 4 hours;
- oldest open ticket: never more than 2 working days;
- reopen rate within 7 days: under 15%, then under 10%;
- contacts per 100 active users, by category;
- how often an agent marks a request as "already answered in the FAQ".

**Open questions.**
- **Mitra:**
  - the Supabase tier and upgrade date;
  - the dummy-OTP switch-off date;
  - Resend;
  - approval of the scheduled job;
  - the refund process;
  - who holds the Manager role.
- **Andy:**
  - which staff get the support role;
  - the MPF-16 edits;
  - approval of the MPF-14 replacements;
  - the Terms contact address (`ToDo.md`).
- **Counsel:**
  - whether the grievance rules apply, and the officer;
  - the retention period for fraud reports;
  - the Terms refund wording;
  - **there is no Privacy Policy page** (its links go to `/terms` or `#`).
- **Recheck after 1 October 2026:** third-party posts claim WhatsApp service messages become chargeable after 1,000
  a month. Meta's own pricing pages, read on 2026-09-30, don't say so. This only matters once WhatsApp is added (P8).

---

## 8. Not building now, and why

The non-goals in section 1. Each is either outside the designed features (D-02), or depends on setup that doesn't
exist (WhatsApp, MPF-24), or on the plan upgrade (video), or on data that doesn't exist yet (SLA values, analytics,
AI).

**Voice notes are in:** `claude.md` records that audio is critical for Cosora's users, so the report's Phase 8 slot
moves into P3.

---

## 9. Build prompt index

| # | Prompt | Phase |
|---|---|---|
| 1 | Honesty patch: Help, the SupportChat redirect, ReportFraud, the suspension notice link | P1 |
| 2 | Support schema, RLS, gates, seeds, rollout switch | P2a |
| 3 | Requester functions | P2b |
| 4 | Admin functions | P2c |
| 5 | Attachments bucket, realtime, `support_notify`, `help_guides` | P2d |
| 6 | Role-simulation and mutation SQL tests | P2e |
| 7 | Help home: layout by role, status banner, FAQs by role | P3a |
| 8 | Support chat thread and `useSupportThread` | P3b |
| 9 | Attachments and `useVoiceRecorder` | P3c |
| 10 | Callback, fraud wizard, feedback and guide pages | P3d |
| 11 | My requests, notification kinds, context links, i18n pass | P3e |
| 12 | Admin roles, nav, Support inbox | P4a |
| 13 | Ticket workspace | P4b |
| 14 | Callbacks, Fraud and Feedback boards | P4c |
| 15 | Support settings and the Guides tab | P4d |
| 16 | `seller_help` surface, vendor content, FAQ translations | P5 |
| 17 | `support-receipt` and `_shared/resend.ts` | P6 |
| 18 | `support-sweep` job (after Mitra approves) and the deletion scrub | P6 |
| 19 | The hidden `/grievance` page | P6 |
| 20 | Playwright on the local stack, k6, and the regression run against G1 | P7 |

---

## Appendix: where this plan departs from the report, and why

Checked on 2026-09-30 against `textile-spark-net` @ `a082ae9`, `Cosora-Admin` @ `b8d1019`, and read-only queries on
the live database.

**Corrections to the report's findings**
- `/report-fraud` is linked from the signed-out home-page footer (`src/pages/Landing.tsx:524`), from `/seller`
  (`VendorLanding.tsx:136`) and from onboarding (`Onboarding.tsx:48`). The report found no links to it.
- App Feedback is already relabelled "Contact support" and points to `/help` (`MyStore.tsx:485-489`).
- `/about` doesn't exist (no route and no page file). The Help email appears on `/help`, `/seller` (4 places),
  `/subscription` and the account-deletion messages.
- `SupportChat.tsx` also fakes an "Online" status (`:157`) and read ticks (`:232`, `:249`).
- `/report-fraud` and `/profile/help/chat` are masked by `<ClarityMask>` in `App.tsx` (lines 253 and 304), not by an
  attribute on the page.
- The audit trigger skips writes made by scheduled jobs and server functions. Hence A8.
- The `business-docs` read policy admits every admin role. Hence A4's narrower gate.
- Realtime has a second trap: a shared channel name breaks when two components subscribe. Hence A3.
- Postgres here ships a `hindi` text-search setting as well as `simple`, but no Gujarati one.

**Findings the report didn't have**
- The dummy OTP (`securityflags.md`, 2026-09-27) lets anyone open a phone-created account, and with it that account's
  support chats. Hence D-14.
- Suspended users stay signed in. Only content creation is blocked (`claude.md` Business Rules). So appeals need no
  signed-out form. Hence dropping the report's F12 for them.
- More dead ends than the report lists:
  - `Kyc.tsx:80,306,327`;
  - `MyPayments.tsx:330,391`;
  - `campaignRunState.ts:101`;
  - `calls.ts:86,94`;
  - `accountDeletion.ts:141-151`;
  - the suspension notice's button, which has no link (`notificationsStore.ts:279`).
- Mitra is building an in-house messaging service; `src/lib/messaging.ts` is the seam for it (`ToDo.md`).
- There is no Privacy Policy page. The Terms contact is a personal address (`ToDo.md`).
- New scheduled jobs are Mitra's call. Hence D-21.

**Departures in the design**
- A smaller set of tables first (A1).
- Manager is read-only rather than a full inbox user (D-08).
- Users see only the team name (D-06).
- Voice notes move from the report's Phase 8 into P3.
- The launch gate drops the SLA engine, CSAT and the email/WhatsApp outbox (D-02). It adds the dummy-OTP switch-off
  (D-14) and Resend (D-23).
- The honesty patch adds the real phone line and fixes the suspension notice, instead of only removing things.

**What the report got right and this plan relies on:**
- the live database has no support table, function or bucket;
- `notify()` can't be called by clients;
- `notifications.kind` has no CHECK constraint;
- the audit trigger is on 29 tables;
- the realtime publication holds `conversations`, `messages` and `notifications`;
- the five places a new FAQ surface must be added;
- the `roles.ts` details.
