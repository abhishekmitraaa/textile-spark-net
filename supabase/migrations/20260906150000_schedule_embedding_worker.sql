-- Drains embedding_jobs by invoking the generate-embedding edge function
-- (Phase 2). pg_cron fires the SQL; pg_net makes the HTTP call.
--
-- Two deliberate departures from the original spec, both about cost:
--
-- 1. Every minute, not every 10 seconds. Supabase Free allows 500k edge
--    function invocations/month; a 10s poll spends ~260k of them per month
--    doing nothing. And products sit in 24-48h admin moderation before they
--    reach a buyer, so a sub-minute embedding lag is not observable.
--
-- 2. The HTTP call only fires when there is actually a VISIBLE message waiting.
--    An idle marketplace therefore costs zero invocations — the cron tick is
--    just a cheap index check. `vt <= now()` rather than a bare EXISTS so a
--    batch already leased by the previous tick doesn't trigger a redundant one.
--
-- The vault guard means this schedule is inert but harmless until the
-- service_role_key secret is created, then starts working on its own with no
-- further migration.
--
-- PREREQUISITE, run once, and NOT from a migration (the key must never enter
-- version control or a chat transcript). In the Supabase dashboard SQL editor:
--
--   select vault.create_secret(
--     '<the project service_role key>',
--     'service_role_key',
--     'Lets pg_cron authenticate to edge functions'
--   );
--
-- The worker's own handler rejects anything that is not role = 'service_role',
-- so the anon key will not do here — verified: anon returns 403 forbidden.

select cron.unschedule('embedding-worker')
where exists (select 1 from cron.job where jobname = 'embedding-worker');

select cron.schedule(
  'embedding-worker',
  '* * * * *',
  $job$
  select net.http_post(
    url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/generate-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb
  )
  where exists (select 1 from pgmq.q_embedding_jobs where vt <= now())
    and exists (select 1 from vault.decrypted_secrets where name = 'service_role_key');
  $job$
);
