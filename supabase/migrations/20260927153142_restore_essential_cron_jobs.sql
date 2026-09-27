-- Admin completion, Phase 2 (Mitra, 2026-09-27): the essential scheduled jobs come back,
-- with a daily prune of their run history.
--
-- All twelve pg_cron jobs were deleted on 2026-09-26 (20260926082046). Mitra's choice
-- on 2026-09-27: restore the essential ones, and add a daily prune of
-- cron.job_run_details (it was 145 MB of a 212 MB database, and grows without limit).
-- Each job is re-created from its most recent definition, verbatim:
--
--   account-deletion-sweep        41 3 * * *   20260923200739 (edge function + 1-day SQL backstop)
--   account-deletion-sweep-alarm  43 3 * * *   20260925172634 (raises if the Vault key is missing)
--   subscription-expiry-sweep     29 3 * * *   20260916180244
--   ads-schedule-sweep            */5 * * * *  20260912120200 (scheduled ads start and end on time)
--   faq-snapshots-refresh         17 * * * *   20260924174051 (raises if the Vault key is missing)
--   embedding-health-log          */10 * * * * 20260910170000 (System Health's history)
--   fx-rates-refresh              30 16 * * *  20260925172634 (raising DO block)
--
-- New:
--   cron-history-prune            11 3 * * *   deletes run history older than 14 days
--
-- Left off on purpose, and recorded in documentation/ToDo.md:
--   * embedding-worker and vendor-catalog-recompute, the two every-minute jobs.
--     Embeddings need OpenAI billing, which isn't on.
--   * embedding-health-alarm (it would raise every 10 minutes while the worker is off).
--   * prune-query-embedding-cache and prune-embed-rate-limit.
--
-- Nothing was overdue when this was applied (0 scheduled ads due, 0 subscriptions or
-- deletions past due), so no catch-up run is needed.

-- A clean slate for these names, so the migration is re-runnable.
select cron.unschedule(j.jobid)
  from cron.job j
 where j.jobname in ('account-deletion-sweep', 'account-deletion-sweep-alarm', 'subscription-expiry-sweep',
                     'ads-schedule-sweep', 'faq-snapshots-refresh', 'embedding-health-log',
                     'fx-rates-refresh', 'cron-history-prune');

select cron.schedule(
  'account-deletion-sweep',
  '41 3 * * *',
  $job$
  select net.http_post(
    url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/account-deletion-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'service_role_key')
    and exists (select 1 from public.account_deletion_requests
                 where (status = 'cooling_off' and scheduled_for <= now())
                    or (status = 'completed' and storage_cleaned_at is null));
  select public.process_due_account_deletions(interval '1 day');
  $job$
);

select cron.schedule('account-deletion-sweep-alarm', '43 3 * * *', $cmd$
  do $do$
  begin
    if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
      raise exception 'account-deletion-sweep: Vault secret service_role_key is missing, so due deletions get only the SQL fallback, with no avatar or private-row cleanup';
    end if;
  end
  $do$;
  $cmd$);

select cron.schedule('subscription-expiry-sweep', '29 3 * * *', $cron$ select public.expire_subscriptions(); $cron$);

select cron.schedule('ads-schedule-sweep', '*/5 * * * *', $cron$ select public.sweep_ad_schedules(); $cron$);

select cron.schedule(
  'faq-snapshots-refresh',
  '17 * * * *',
  $job$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'faq-snapshots-refresh: Vault secret service_role_key is missing, so the FAQ snapshots can''t be rebuilt';
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/faqs-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := '{"reason":"cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end
  $do$;
  $job$
);

select cron.schedule(
  'embedding-health-log', '*/10 * * * *',
  $job$ select public.record_embedding_pipeline_health(); $job$
);

select cron.schedule(
  'fx-rates-refresh',
  '30 16 * * *',
  $cmd$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'fx-rates-refresh: Vault secret service_role_key is missing, so the exchange rates can''t be refreshed';
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/fx-rates-refresh',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  end
  $do$;
  $cmd$
);

-- New: run history older than 14 days is deleted daily. The table has no jobid
-- index and postgres can't add one (it belongs to supabase_admin), so a bounded
-- table is also what keeps its readers fast.
select cron.schedule(
  'cron-history-prune',
  '11 3 * * *',
  $job$ delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '14 days'; $job$
);

-- The first prune now, instead of waiting for tomorrow's 03:11 UTC tick.
delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '14 days';

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  v_expected jsonb := '{
    "account-deletion-sweep":       ["41 3 * * *",   "functions/v1/account-deletion-sweep"],
    "account-deletion-sweep-alarm": ["43 3 * * *",   "raise exception"],
    "subscription-expiry-sweep":    ["29 3 * * *",   "expire_subscriptions"],
    "ads-schedule-sweep":           ["*/5 * * * *",  "sweep_ad_schedules"],
    "faq-snapshots-refresh":        ["17 * * * *",   "functions/v1/faqs-snapshot"],
    "embedding-health-log":         ["*/10 * * * *", "record_embedding_pipeline_health"],
    "fx-rates-refresh":             ["30 16 * * *",  "functions/v1/fx-rates-refresh"],
    "cron-history-prune":           ["11 3 * * *",   "delete from cron.job_run_details"]
  }';
  k text;
  v_schedule text;
  v_command text;
begin
  if (select count(*) from cron.job where active) <> 8 or (select count(*) from cron.job) <> 8 then
    raise exception 'self-check: expected exactly 8 active cron jobs, found % (% active)',
      (select count(*) from cron.job), (select count(*) from cron.job where active);
  end if;
  for k in select jsonb_object_keys(v_expected) loop
    select schedule, command into v_schedule, v_command from cron.job where jobname = k and active;
    if v_schedule is distinct from (v_expected -> k ->> 0) then
      raise exception 'self-check: % has schedule %, expected %', k, v_schedule, v_expected -> k ->> 0;
    end if;
    if position((v_expected -> k ->> 1) in v_command) = 0 then
      raise exception 'self-check: % does not run %', k, v_expected -> k ->> 1;
    end if;
  end loop;
  -- The jobs that call edge functions must fail loudly, not succeed silently, without the key.
  if (select command from cron.job where jobname = 'fx-rates-refresh') ~ 'where exists' then
    raise exception 'self-check: fx-rates-refresh is the silent where-exists form';
  end if;
  if exists (select 1 from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '14 days') then
    raise exception 'self-check: run history older than 14 days remains';
  end if;
end
$check$;
