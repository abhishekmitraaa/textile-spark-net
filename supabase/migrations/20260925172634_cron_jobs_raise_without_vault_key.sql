-- ─────────────────────────────────────────────────────────────
-- MPF-27: two cron jobs would record success while doing nothing if the Vault
-- secret service_role_key went missing.
--
-- Both called net.http_post(...) `where exists (<the Vault secret>)`. Without the
-- secret the WHERE is false, nothing is sent, and cron.job_run_details says
-- 'succeeded' every run: the failure claude.md records for the embedding worker
-- (3,960 silent "successful" runs).
--
--   fx-rates-refresh: rewritten as a DO block that raises when the secret is
--     missing, the shape faq-snapshots-refresh has had since 20260924174051.
--
--   account-deletion-sweep: left as it is. Its command also runs
--     process_due_account_deletions(interval '1 day'), the SQL fallback that
--     anonymizes a request overdue by a day even when the edge function never
--     ran. pg_cron runs a job's statements in one transaction, so a raise in the
--     same job would roll that fallback back. A second job,
--     account-deletion-sweep-alarm, runs two minutes later and raises when the
--     secret is missing: the same split as embedding-health-log and
--     embedding-health-alarm. "Nothing is due" stays a quiet success; only a
--     missing secret fails.
-- ─────────────────────────────────────────────────────────────

select cron.alter_job(
  job_id  := (select jobid from cron.job where jobname = 'fx-rates-refresh'),
  command := $cmd$
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

select cron.schedule('account-deletion-sweep-alarm', '43 3 * * *', $cmd$
  do $do$
  begin
    if not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
      raise exception 'account-deletion-sweep: Vault secret service_role_key is missing, so due deletions get only the SQL fallback, with no avatar or private-row cleanup';
    end if;
  end
  $do$;
  $cmd$);

-- Self-check.
do $check$
declare
  v_fx    text;
  v_alarm text;
  v_sweep text;
begin
  select command into v_fx from cron.job where jobname = 'fx-rates-refresh' and active;
  select command into v_alarm from cron.job where jobname = 'account-deletion-sweep-alarm' and active and schedule = '43 3 * * *';
  select command into v_sweep from cron.job where jobname = 'account-deletion-sweep' and active;
  if v_fx is null or v_fx !~ 'raise exception' or v_fx ~ 'where exists' or v_fx !~ 'functions/v1/fx-rates-refresh' then
    raise exception 'self-check: fx-rates-refresh is not the raising DO block';
  end if;
  if v_alarm is null or v_alarm !~ 'raise exception' then
    raise exception 'self-check: account-deletion-sweep-alarm missing or not raising';
  end if;
  if v_sweep is null or v_sweep !~ 'process_due_account_deletions' then
    raise exception 'self-check: account-deletion-sweep lost its SQL fallback';
  end if;
end
$check$;
