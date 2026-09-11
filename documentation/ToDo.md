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

- [ ] Build a real trends data source for /home/trends — Added: 2026-09-11 — Context: The Trends page's category chips, featured images, curated looks and suggested searches are hand-picked editorial content; there is no trends job, no Google Trends integration and no search-volume log feeding it. Master Prompt 7 (buyer-trust thread, Phase 3) relabelled the page "Curated trend picks" and removed everything that posed as measured data (invented "↑ 800%" search-growth figures, a "Top Brands" list of invented names, USD prices). A real pipeline needs a source — the closest existing one is `engagement_events` rows with `event_type = 'search_impression'` and `query_text`, or an external trends API — plus a scheduled job and a table the page reads; only then should "trending" copy come back. The curated images are also still hotlinked from picsum.photos and need owned replacements. — Reference: 2026-09-11, Master Prompt 7 Phase 3.3, which asked for this to be logged as a future feature rather than built.

## Completed
(move finished items here, keep the same entry, add "Completed: YYYY-MM-DD" and, if
known, a one-line note on how/where it was done — don't delete history)
