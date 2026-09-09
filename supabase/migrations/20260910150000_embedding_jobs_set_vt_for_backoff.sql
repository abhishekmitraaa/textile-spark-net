-- embedding_jobs_set_vt(): let the worker push a message's next retry further
-- out, so a rate-limited or failing OpenAI is backed off from rather than
-- hammered at a fixed cadence.
--
-- ── Why this is needed ─────────────────────────────────────────────────────
-- The worker's failure policy is already correct in the important respect: when
-- OpenAI returns a non-2xx it returns early WITHOUT archiving anything, so
-- every message in the batch stays queued and no job is silently lost. That was
-- verified by reading the handler, and it is what made the 3-day billing outage
-- self-healing once the key was funded.
--
-- What it has no notion of is WAITING. A message becomes visible again when its
-- 90-second visibility timeout lapses, and the next tick picks it straight back
-- up. Against a sustained 429 that is a retry roughly every 90-120 seconds,
-- forever, at whatever concurrency the adaptive dispatcher has chosen — which
-- is precisely the behaviour that keeps an account rate-limited instead of
-- letting it recover.
--
-- pgmq.set_vt() moves a single message's visibility timeout. Exposing it lets
-- the worker apply exponential backoff keyed on the message's own read_ct,
-- which pgmq already tracks and which nothing has ever read until now.
--
-- service_role only, matching embedding_jobs_read / embedding_jobs_archive:
-- these are the worker's internal plumbing, never a client entry point.

create or replace function public.embedding_jobs_set_vt(p_msg_id bigint, p_vt integer)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select pgmq.set_vt('embedding_jobs', p_msg_id, p_vt) is not null;
$function$;

comment on function public.embedding_jobs_set_vt(bigint, integer) is
  'Pushes one embedding job''s next retry out by p_vt seconds. Used by generate-embedding for exponential backoff when OpenAI returns 429/5xx.';

revoke execute on function public.embedding_jobs_set_vt(bigint, integer) from public, anon, authenticated;
grant execute on function public.embedding_jobs_set_vt(bigint, integer) to service_role;
