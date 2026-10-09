-- Subscriptions P6: the lead digest's schedule (2026-10-09).
--
-- A NEW SCHEDULED JOB: apply only with Mitra's say-so (claude.md: every new pg_cron job
-- needs his approval). Apply it after 20261009100000.
--
--   lead-alert-digest   30 3 * * *   (09:00 IST)   select public.lead_digest_run();
--
-- Once a day it matches any requirement the trigger missed, then queues one digest email
-- per vendor with what matched since the last one. It only queues: sending is the
-- notification-dispatch job's (P2). Until this job exists, alerts that go out as they
-- happen still do; nothing is lost, the digest simply isn't sent.

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'lead-alert-digest';

select cron.schedule(
  'lead-alert-digest',
  '30 3 * * *',
  $cmd$ select public.lead_digest_run(); $cmd$
);
