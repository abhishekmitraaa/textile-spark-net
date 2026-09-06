-- Backfill: enqueue every row that predates its embedding trigger.
--
-- The pipeline was built and tested, but never seeded. Measured before this
-- migration ran: 30 products, 0 with an embedding, and 0 messages ever archived
-- (pgmq.metrics total_messages = 1, a_embedding_jobs empty) -- so no job has
-- ever been carried through to a vector.
--
-- The decisive diagnostic is net._http_response, which logs every call pg_net
-- makes: it holds exactly ONE row for the life of this project, a 403
-- {"error":"forbidden"} at 2026-09-06 18:40:33. That is the deliberate anon-key
-- negative test recorded in 20260906150000's comment, and it PREDATES both the
-- first cron tick (18:42) and the queue's creation (20:15). Meaning: across 100+
-- cron ticks, including ticks that ran while a message was visible, the poller
-- has never once made an HTTP call. The unsatisfied guard is therefore
-- specifically `exists (select 1 from vault.decrypted_secrets ...)` -- the
-- service_role_key secret below -- and not the message-visibility guard.
--
-- Separately, the enqueue trigger only fires on write, and these rows were
-- seeded before it existed, so nothing was ever going to embed them.
--
-- That is a correctness problem for THIS feature specifically, not just an
-- unfinished chore from the last one: vendor_profiles.catalog_embedding is the
-- mean of a vendor's product embeddings, so with no product embeddings there is
-- no catalog vector, and with no catalog vector match_rfq_vendors has nothing to
-- rank on. Every score would be the category term alone -- the boolean this work
-- set out to replace.
--
-- Cost of draining this queue once: 34 rows through text-embedding-3-small,
-- which is a fraction of a US cent. It stays queued and costs nothing at all
-- until the two operator secrets below exist.
--
-- STILL REQUIRED, and deliberately not automatable from a migration -- both are
-- credentials that must not enter version control or a chat transcript:
--
--   1. OPENAI_API_KEY on the generate-embedding edge function
--      (Dashboard -> Edge Functions -> generate-embedding -> Secrets).
--      Without it the worker returns {"error":"not_configured"} and archives
--      nothing, so the queue simply waits.
--   2. The service_role_key vault secret the cron poller authenticates with:
--        select vault.create_secret(
--          '<the project service_role key>', 'service_role_key',
--          'Lets pg_cron authenticate to edge functions');
--      Until this exists the schedule is inert -- it is the missing half of why
--      76 cron runs produced nothing.
--
-- Once both are set the existing every-minute schedule drains this with no
-- further action: 34 jobs at BATCH=20 is two ticks. Verify with
--   select count(*) filter (where embedding is not null) from products;

-- Products: ALL statuses, not just live. The enqueue trigger lists text columns
-- only, so a draft promoted to live later never re-enqueues -- embedding it now
-- is what makes that promotion instant instead of silently unsearchable.
select pgmq.send('embedding_jobs', jsonb_build_object(
         'table', 'products', 'id', p.id, 'text', p.search_text))
from public.products p
where p.search_text is not null
  and length(trim(p.search_text)) > 0
  and p.embedding is null;

-- RFQs: adding the stored generated column above rewrote the table but did not
-- fire the row trigger, so these need the same treatment.
select pgmq.send('embedding_jobs', jsonb_build_object(
         'table', 'rfqs', 'id', r.id, 'text', r.search_text))
from public.rfqs r
where r.search_text is not null
  and length(trim(r.search_text)) > 0
  and r.embedding is null;
