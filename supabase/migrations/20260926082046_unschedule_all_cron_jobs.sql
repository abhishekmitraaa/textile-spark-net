-- Remove every scheduled job (Mitra, 2026-09-26: "remove all the scheduled tasks").
--
-- Mitra chose to delete all twelve permanently, after being told what stops:
-- account-deletion requests are no longer processed on schedule, subscriptions
-- no longer expire, scheduled ads no longer start or end, new products get no
-- search embeddings, vendor catalogue counts and currency rates go stale, the
-- FAQ CDN snapshot refreshes only when an FAQ is edited, the prune jobs stop,
-- and the embedding health log and both alarms go quiet.
--
-- Each job was created by an earlier migration in this folder; re-running its
-- cron.schedule / cron.alter_job statement brings it back. documentation/ToDo.md,
-- "Restore the scheduled jobs", lists which migration holds each one.

do $$
declare
  j record;
begin
  for j in select jobid from cron.job loop
    perform cron.unschedule(j.jobid);
  end loop;
  if exists (select 1 from cron.job) then
    raise exception 'self-check failed: % cron job(s) remain', (select count(*) from cron.job);
  end if;
end
$$;
