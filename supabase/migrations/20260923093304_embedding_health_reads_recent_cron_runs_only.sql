-- embedding_pipeline_health(): stop scanning the whole pg_cron run history
-- (Master Prompt 12, Part F — found by the k6 load harness).
--
-- What the harness found. At 50 VUs (scripts/load/marketplace.k6.js), requests
-- stalled for 8-16 s and PostgREST logged `504 PGRST003 Timed out acquiring
-- connection from connection pool` at 09:25:31 UTC — hidden from clients
-- because the gateway retried. The Postgres log for the same window shows
-- `select * from public.embedding_pipeline_health()` taking 64,407 ms, started
-- by the `embedding-health-alarm` cron job at 09:25:00.
--
-- Why it is expensive at all. Its last two columns read
--   max(start_time) from cron.job_run_details join cron.job ... where jobname = 'embedding-worker'
-- twice (the second also `status <> 'succeeded'`). pg_cron never prunes
-- job_run_details and indexes it on runid only, so each read is a parallel seq
-- scan of the whole history: 50,692 rows / 120 MB (63% of this 190 MB
-- database), measured 1,257 ms for ONE of the two reads on an idle, fully
-- cached system. pg_stat_statements: the alarm job averaged 3,152 ms over 1,948
-- runs (max 18.3 s), the health-log job 2,359 ms (max 15.6 s) — every 5 minutes
-- between them, forever growing, and 64 s once it met real traffic.
--
-- The change — the two subqueries, nothing else:
--   worker_last_run      exact: newest embedding-worker row by walking the
--                        primary key backwards (runid is assigned at start, so
--                        the newest runid is the newest start). Stops at the
--                        first match: 6 buffers.
--   worker_last_failure  the newest non-succeeded embedding-worker run among
--                        the latest 5,000 cron runs (all jobs; ~1.4 days at the
--                        current ~3,700 runs/day), NULL if none. It used to
--                        search all history; the worker has never failed
--                        (19,518 runs, all 'succeeded'), so it was scanning
--                        120 MB every call to return NULL. Bounded on purpose:
--                        without an index on jobid (the table belongs to
--                        supabase_admin, so postgres cannot add one) an
--                        unbounded "last failure ever" is a full scan by
--                        definition. Neither app reads either column (checked
--                        in both repos); the status/reason logic uses neither.
-- Measured together: 27 ms, 2,549 buffers (was ~2,500 ms, ~30,500 buffers).
--
-- Unchanged: the signature, LANGUAGE sql, STABLE SECURITY DEFINER, search_path,
-- grants (create or replace keeps them), and every other column and rule.
-- record_embedding_pipeline_health() calls this and inherits the saving.
--
-- NOT done here: pruning cron.job_run_details. It is 63% of the database and
-- grows ~7-9 MB/day toward the free plan's 500 MB cap, but deleting run history
-- is a retention decision, raised in the Master Prompt 12 Part F report.

create temp table _health_before on commit drop as
select status, reason, queue_depth, products_missing, rfqs_missing, videos_missing, vault_secret_ok
  from public.embedding_pipeline_health();

create or replace function public.embedding_pipeline_health()
 returns table(status text, reason text, queue_depth integer, oldest_job_age interval, products_missing integer, rfqs_missing integer, videos_missing integer, vault_secret_ok boolean, worker_last_run timestamp with time zone, worker_last_failure timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with w as (
    select jobid from cron.job where jobname = 'embedding-worker'
  ),
  m as (
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
      -- Newest run by primary key, not max() over a seq scan of all history.
      (select d.start_time from cron.job_run_details d
        where d.jobid = (select jobid from w) and d.start_time is not null
        order by d.runid desc limit 1)                                                 as last_run,
      -- Newest failure within the latest 5,000 cron runs (~1.4 days).
      (select max(x.start_time)
         from (select r.jobid, r.status, r.start_time
                 from cron.job_run_details r
                order by r.runid desc limit 5000) x
        where x.jobid = (select jobid from w) and x.status <> 'succeeded')             as last_fail
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
$function$;

do $$
declare
  b record; a record; old_last_run timestamptz; new_last_run timestamptz;
begin
  select * into b from _health_before;
  select status, reason, queue_depth, products_missing, rfqs_missing, videos_missing, vault_secret_ok
    into a from public.embedding_pipeline_health();
  if (a.status, a.reason, a.products_missing, a.rfqs_missing, a.videos_missing, a.vault_secret_ok)
     is distinct from (b.status, b.reason, b.products_missing, b.rfqs_missing, b.videos_missing, b.vault_secret_ok) then
    raise exception 'health status changed across the rewrite: before %, after %', b, a;
  end if;
  -- The exact column must equal the old full-history answer. One statement,
  -- one snapshot, so a worker run landing in between cannot fake a mismatch.
  select (select max(d.start_time) from cron.job_run_details d
            join cron.job j on j.jobid = d.jobid where j.jobname = 'embedding-worker'),
         (select h.worker_last_run from public.embedding_pipeline_health() h)
    into old_last_run, new_last_run;
  if old_last_run is distinct from new_last_run then
    raise exception 'worker_last_run differs: full scan %, new %', old_last_run, new_last_run;
  end if;
  if (select prosecdef from pg_proc where oid = 'public.embedding_pipeline_health()'::regprocedure) is not true then
    raise exception 'embedding_pipeline_health must stay SECURITY DEFINER (it reads vault and cron)';
  end if;
end $$;
