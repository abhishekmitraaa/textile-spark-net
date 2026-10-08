-- Subscriptions P2: the notification-dispatch schedule (2026-10-08).
--
-- A NEW SCHEDULED JOB: apply only with Mitra's say-so (claude.md: every new pg_cron job
-- needs his approval). Apply it after 20261008130000 and once notification-dispatch is
-- deployed.
--
--   notification-dispatch   * * * * *   calls the notification-dispatch edge function
--
-- It calls the function only when a message is due (or a send's lock has expired), so a
-- quiet minute costs one indexed query. Without the Vault key it raises, every minute, so
-- the failure shows in System Health instead of messages silently waiting.

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'notification-dispatch';

select cron.schedule(
  'notification-dispatch',
  '* * * * *',
  $cmd$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'notification-dispatch: Vault secret service_role_key is missing, so no email, WhatsApp or SMS is being sent';
    end if;
    if exists (select 1 from admin.notification_outbox o
                where (o.status = 'queued' and o.next_attempt_at <= now())
                   or (o.status = 'sending' and o.locked_until < now())) then
      perform net.http_post(
        url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/notification-dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    end if;
  end
  $do$;
  $cmd$
);

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  v_schedule text;
  v_command  text;
begin
  select schedule, command into v_schedule, v_command from cron.job where jobname = 'notification-dispatch' and active;
  if v_schedule is distinct from '* * * * *' then
    raise exception 'self-check: notification-dispatch has schedule %, expected every minute', v_schedule;
  end if;
  if position('functions/v1/notification-dispatch' in v_command) = 0 or position('raise exception' in v_command) = 0 then
    raise exception 'self-check: notification-dispatch must call the function and raise without the Vault key';
  end if;
end
$check$;
