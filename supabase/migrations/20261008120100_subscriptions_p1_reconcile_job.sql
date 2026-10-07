-- Subscriptions P1: the billing-reconcile schedule (2026-10-08).
--
-- A NEW SCHEDULED JOB: apply only with Mitra's say-so (claude.md: every new pg_cron job
-- needs his approval). It is separate from 20261008120000 so the billing core can ship
-- without it.
--
--   billing-reconcile   */15 * * * *   calls the billing-reconcile edge function
--
-- The function asks Razorpay about unpaid live and test plan orders that are between 15
-- minutes and 3 days old, and fulfils any that were paid (the browser closed before
-- verify-payment ran and the webhook didn't arrive). The job only calls it when such an
-- order exists, so most ticks cost one indexed query. Without the Vault key it raises,
-- every tick, so the failure shows in System Health instead of passing silently.

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'billing-reconcile';

select cron.schedule(
  'billing-reconcile',
  '*/15 * * * *',
  $cmd$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'billing-reconcile: Vault secret service_role_key is missing, so paid orders that never reached Cosora aren''t being caught';
    end if;
    if exists (select 1 from public.subscription_payment_orders o
                where o.status = 'created' and o.payment_mode in ('live', 'test')
                  and o.created_at < now() - interval '15 minutes'
                  and o.created_at > now() - interval '3 days'
                  and (o.reconciled_at is null or o.reconciled_at < now() - interval '15 minutes')) then
      perform net.http_post(
        url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/billing-reconcile',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    end if;
  end
  $do$;
  $cmd$
);

-- Unpaid intents by age: the job's query reads this index, not the whole table.
create index if not exists subscription_payment_orders_unpaid_idx
  on public.subscription_payment_orders (created_at) where status = 'created';

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  v_schedule text;
  v_command  text;
begin
  select schedule, command into v_schedule, v_command from cron.job where jobname = 'billing-reconcile' and active;
  if v_schedule is distinct from '*/15 * * * *' then
    raise exception 'self-check: billing-reconcile has schedule %, expected */15 * * * *', v_schedule;
  end if;
  if position('functions/v1/billing-reconcile' in v_command) = 0 or position('raise exception' in v_command) = 0 then
    raise exception 'self-check: billing-reconcile must call the function and raise without the Vault key';
  end if;
end
$check$;
