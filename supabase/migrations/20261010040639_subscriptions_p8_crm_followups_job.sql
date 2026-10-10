-- Subscriptions P8: the CRM follow-up reminders' schedule (2026-10-09).
--
-- A NEW SCHEDULED JOB: apply only with Mitra's say-so (claude.md: every new pg_cron job
-- needs his approval). Apply it after 20261009120000.
--
--   crm-followups   */15 * * * *   select public.crm_followup_run();
--
-- Every 15 minutes it rings the bell for each vendor with follow-ups due, and on Gold and VIP
-- queues a WhatsApp reminder (sending is the notification-dispatch job's, P2). A follow-up is
-- reminded once (notified_at); moving it reminds again. Until this job exists, follow-ups
-- still show on the CRM's Follow-ups page; only the reminder is missing.

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'crm-followups';

select cron.schedule(
  'crm-followups',
  '*/15 * * * *',
  $cmd$ select public.crm_followup_run(); $cmd$
);
