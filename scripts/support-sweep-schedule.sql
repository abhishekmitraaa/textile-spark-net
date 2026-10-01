-- PENDING APPROVAL (help-feature-plan.md D-21): Mitra approves the scheduled job before this
-- runs. It is deliberately not in supabase/migrations/, because every file there is applied.
-- Once approved: apply it with apply_migration as `support_sweep_schedule`, then save it in
-- supabase/migrations/ under the version the database records.
--
-- Needs, first: 20261001140000_support_sweep_receipts_fraud_records.sql applied, and the
-- `support-sweep` edge function deployed (verify_jwt = true).
--
-- What runs, every 15 minutes (96 runs a day; cron-history-prune keeps 14 days of run
-- history, so about 1,350 rows):
--   * requests resolved 7+ days ago with no reply since are closed, and the requester is told;
--   * a callback window that ended with no call logged is flagged for staff, once;
--   * a fraud report a year after it was filed (once decided) is deleted, files first;
--     the confirmed-fraud record stays;
--   * a deleted account's other requests are deleted, files first.
-- Like fx-rates-refresh, the job raises when the Vault service_role_key is missing, so a
-- missing key shows as a failed run instead of a silent no-op.

select cron.schedule('support-sweep', '*/15 * * * *', $cron$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'support-sweep: Vault secret service_role_key is missing, so the support sweep can''t run';
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/support-sweep',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := '{"reason":"cron"}'::jsonb,
      timeout_milliseconds := 60000
    );
  end
  $do$;
$cron$);

do $check$
begin
  if (select count(*) from cron.job where jobname = 'support-sweep' and schedule = '*/15 * * * *' and active) <> 1 then
    raise exception 'support-sweep is not scheduled as expected';
  end if;
end
$check$;
