# ToDo
Tasks Andy wants to come back to later. Entries are added only when explicitly asked
for during a session (e.g. "add this to the todo", "note this for later", "todo: ...",
"remind me to...") — but once asked, the full entry below is written automatically,
with no need to dictate format, context, or reference each time.

## Open

### <short task title> — added YYYY-MM-DD
- Task: plain description of what needs to be done
- Context: why this came up, what it depends on or relates to, and any detail needed
  to pick this up cold later without re-reading the original conversation
- Reference: which session/conversation this came from — the date, roughly what was
  being worked on at the time, and the prompt or exchange that triggered it
- Priority: (only if stated or obviously implied — otherwise omit)
- Status: Open

- [ ] Configure the embedding_alert_webhook_url Vault secret so CRITICAL pipeline alerts reach a human outside the app — Added: 2026-09-10 — Priority: High — Context: notify_embedding_alert_webhook() (added in MP7, wired into record_embedding_pipeline_health()) already POSTs a CRITICAL-only alert to whatever URL this secret holds, and fails safe (no-ops) when it's missing — which it currently is, confirmed live. Needs a human to pick a destination (Slack/Discord/PagerDuty/internal webhook) and run select vault.create_secret('<url>', 'embedding_alert_webhook_url', '...') in the Supabase SQL Editor. No code or redeploy required once that's done. Until it exists, a CRITICAL failure (like the original 3-day silent outage) is only visible to someone who opens the app or checks Supabase's cron logs.
- [ ] Route applyPendingSignupProfile failures to the same alert channel as the embedding webhook, once that channel exists — Added: 2026-09-11 — Context: `applyPendingSignupProfile()` (`src/lib/queries/signupProfile.ts`) moves a new user's brand name / business details from auth metadata into `vendor_profiles` / `profiles` on every sign-in path (Register, Login, AuthCallback). It is non-blocking by design and its failure path only reaches `console.error` (with user id and role), so a persistent failure would silently lose every new vendor's brand name with no operator-visible signal. Deliberately NOT given its own alerting in Master Prompt 8, Phase 7: the project already has one "must not go unnoticed" precedent — `notify_embedding_alert_webhook()` / `record_embedding_pipeline_health()` and the `embedding_alert_webhook_url` Vault secret (entry above). When that destination is configured, have this failure path report through the same channel (e.g. a small RPC that records the failure and calls the same notifier) rather than inventing a second one. Reference: Master Prompt 8 (2026-09-11), Phase 7 item 3.
- [ ] Decide which of the five controls removed from the product page should come back as real features — Added: 2026-09-11 — Context: Master Prompt 8, Phase 6 removed them from `/product/:id` because none did anything: "Add Fabric" and "Download PDF" (spec sheet) had no onClick; "Translate" (description) had no onClick; the review "Helpful?" thumbs tally was component state written nowhere; the review ⋮ menu had no onClick. Each needs a spec before it returns: Helpful needs a `review_helpful_votes` table + RLS + write path (additive schema); ⋮ would most plausibly be "Report review", which needs a moderation path for product reviews; Download PDF needs a real spec-sheet generator; Translate needs a translation provider; "Add Fabric" has no defined meaning yet. Reference: Master Prompt 8 (2026-09-11), Mitra chose "remove all five" over wiring or building them in a bug-fix pass.

- [ ] Build a real trends data source for /home/trends — Added: 2026-09-11 — Context: The Trends page's category chips, featured images, curated looks and suggested searches are hand-picked editorial content; there is no trends job, no Google Trends integration and no search-volume log feeding it. Master Prompt 7 (buyer-trust thread, Phase 3) relabelled the page "Curated trend picks" and removed everything that posed as measured data (invented "↑ 800%" search-growth figures, a "Top Brands" list of invented names, USD prices). A real pipeline needs a source — the closest existing one is `engagement_events` rows with `event_type = 'search_impression'` and `query_text`, or an external trends API — plus a scheduled job and a table the page reads; only then should "trending" copy come back. The curated images are also still hotlinked from picsum.photos and need owned replacements. — Reference: 2026-09-11, Master Prompt 7 Phase 3.3, which asked for this to be logged as a future feature rather than built.

## Completed
(move finished items here, keep the same entry, add "Completed: YYYY-MM-DD" and, if
known, a one-line note on how/where it was done — don't delete history)
