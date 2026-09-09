-- Phase 6 fix for the 2026-09-06..09 silent outage.
--
-- WHAT HAPPENED: the embedding pipeline was a structural no-op for three days
-- and reported success 3,960 consecutive times. The worker's cron command was a
-- single statement guarded by
--     ... where exists (select 1 from vault.decrypted_secrets where name='service_role_key')
-- and the secret did not exist. A SELECT whose WHERE is false returns zero rows
-- and SUCCEEDS, so cron.job_run_details recorded status='succeeded' on every
-- run while nothing was ever embedded. There was no error to find, which is why
-- it took a manual from-scratch investigation rather than an alert.
--
-- Two changes, both small:
--   1. The worker now RAISES when there is work it cannot do. A missing secret
--      becomes status='failed' in cron.job_run_details within one minute
--      instead of an invisible success forever.
--   2. A single health function an admin can glance at, covering the other
--      silent-failure shape: a queue that stops draining.
-- Deliberately not a monitoring subsystem — no new tables, no new schedule.
--
-- NOTE: cron.unschedule/schedule assigns a NEW jobid, so cron.job_run_details
-- history for the old jobid no longer joins. embedding_pipeline_health()'s
-- worker_last_run therefore reads null until the rescheduled job has run once
-- (about a minute). Verified populating at 13:02 UTC on 2026-09-09.

-- ── 1. Make the worker fail loudly ──
-- Still costs zero edge invocations when idle: the no-work path returns before
-- any check, exactly as before.
select cron.unschedule('embedding-worker')
where exists (select 1 from cron.job where jobname = 'embedding-worker');

select cron.schedule(
  'embedding-worker',
  '* * * * *',
  $job$
  do $inner$
  declare
    v_has_secret boolean;
    v_waiting    integer;
  begin
    select count(*) into v_waiting from pgmq.q_embedding_jobs where vt <= now();

    -- Nothing to do. Return silently so an idle marketplace spends no edge
    -- function invocations (the reason this guard exists at all).
    if v_waiting = 0 then
      return;
    end if;

    select exists (select 1 from vault.decrypted_secrets where name = 'service_role_key')
      into v_has_secret;

    -- THE FIX. Previously this condition silently skipped the POST and the run
    -- still reported success. Now it is an error, so the outage is visible in
    -- cron.job_run_details on the very next tick.
    if not v_has_secret then
      raise exception
        'embedding-worker: % job(s) waiting but vault secret "service_role_key" is missing - the pipeline is a no-op. Create it with vault.create_secret(...).',
        v_waiting;
    end if;

    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/generate-embedding',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
        )
      ),
      body    := '{}'::jsonb
    );
  end
  $inner$;
  $job$
);

-- ── 2. The glanceable health check ──
-- Answers "is the embedding pipeline actually working?" in one row. Catches the
-- shape the raise above cannot: a queue that is being read but never drains
-- (bad OpenAI key, billing lapsed, poison message) — there the cron succeeds
-- and the edge function returns 200, but rows never get vectors.
create or replace function public.embedding_pipeline_health()
returns table (
  status              text,
  reason              text,
  queue_depth         integer,
  oldest_job_age      interval,
  products_missing    integer,
  rfqs_missing        integer,
  videos_missing      integer,
  vault_secret_ok     boolean,
  worker_last_run     timestamptz,
  worker_last_failure timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with m as (
    select
      (select count(*)::int from pgmq.q_embedding_jobs)                                as depth,
      (select now() - min(enqueued_at) from pgmq.q_embedding_jobs)                     as oldest,
      (select count(*)::int from public.products
        where status='live' and embedding is null
          and length(trim(coalesce(search_text,''))) > 0)                              as p_missing,
      (select count(*)::int from public.rfqs where embedding is null)                  as r_missing,
      (select count(*)::int from public.product_videos
        where status='live' and embedding is null)                                     as v_missing,
      (select exists (select 1 from vault.decrypted_secrets where name='service_role_key')) as secret_ok,
      (select max(start_time) from cron.job_run_details d
         join cron.job j on j.jobid=d.jobid where j.jobname='embedding-worker')        as last_run,
      (select max(start_time) from cron.job_run_details d
         join cron.job j on j.jobid=d.jobid
        where j.jobname='embedding-worker' and d.status <> 'succeeded')                as last_fail
  )
  select
    case
      when not m.secret_ok                      then 'CRITICAL'
      -- The exact signature of the 3-day outage: work piling up and not moving.
      when m.oldest > interval '30 minutes'     then 'CRITICAL'
      when m.depth > 100                        then 'WARN'
      when m.oldest > interval '10 minutes'     then 'WARN'
      when m.p_missing + m.r_missing + m.v_missing > 0 then 'WARN'
      else 'OK'
    end,
    case
      when not m.secret_ok then 'vault secret service_role_key is missing - worker cannot authenticate'
      when m.oldest > interval '30 minutes' then 'queue not draining: oldest job older than 30 minutes'
      when m.depth > 100 then 'queue backing up (>100 jobs)'
      when m.oldest > interval '10 minutes' then 'queue draining slowly: oldest job older than 10 minutes'
      when m.p_missing + m.r_missing + m.v_missing > 0
        then 'rows with text but no embedding - enqueue may have been missed'
      else 'pipeline healthy'
    end,
    m.depth, m.oldest, m.p_missing, m.r_missing, m.v_missing,
    m.secret_ok, m.last_run, m.last_fail
  from m;
$$;

comment on function public.embedding_pipeline_health() is
  'One-row verdict on the embedding pipeline (queue depth/age, unembedded rows, vault secret, worker run history). Built after the 2026-09 silent outage, where 3,960 cron runs reported success over a dead pipeline.';

-- Admin/ops only. It reports queue and cron internals, which is not buyer- or
-- vendor-facing data, and PUBLIC gets EXECUTE by default on every new function.
revoke all on function public.embedding_pipeline_health() from public, anon, authenticated;
grant execute on function public.embedding_pipeline_health() to service_role;
