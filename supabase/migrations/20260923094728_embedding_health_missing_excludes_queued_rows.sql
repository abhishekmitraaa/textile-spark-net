-- embedding_pipeline_health(): a row waiting in the queue is not a "missed
-- enqueue" (Master Prompt 12, Part F — found by the load harness).
--
-- The WARN "rows with text but no embedding - enqueue may have been missed"
-- counted every row with a NULL embedding, INCLUDING rows whose job was
-- sitting in pgmq.q_embedding_jobs waiting for the next one-minute worker
-- tick. So any request posted in the minute before a check raised it:
--   * 07:50 UTC 2026-09-23 — embedding-health-log recorded WARN
--     (rfqs_missing 1, queue_depth 1) for an RFQ the Master Prompt 12 Part A
--     check had just created, and notified all 3 admins "Embedding pipeline:
--     WARN". The RFQ was embedded a minute later. A false alarm.
--   * 09:25 and 09:35 — embedding-health-alarm failed on the same condition
--     (09:25: "queue=7, rfqs=7" — seven RFQs from the k6 run, all queued).
-- With real buyers posting requests this pages admins whenever traffic and a
-- :x0 check coincide, which is how an alert gets ignored.
--
-- The change: the three *_missing counts exclude rows that have a pending job
-- in the queue (payload {table, id, text}, as the three enqueue triggers
-- write it). That is exactly what the reason text claims to detect — an
-- enqueue that did not happen. A queued job that never drains is still caught,
-- by the unchanged `oldest > 10 / 30 minutes` and `depth > 100` rules, and a
-- job archived without writing (exhausted or unprocessable) leaves its row
-- missing and unqueued, so it still WARNs.
--
-- Everything else is identical to 20260923093304 (the cheap cron reads).

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
      -- "Missing" = no embedding AND no job waiting for it: an enqueue that
      -- never happened, not one the worker has not reached yet.
      (select count(*)::int from public.products p
        where p.status='live' and p.embedding is null
          and length(trim(coalesce(p.search_text,''))) > 0
          and not exists (select 1 from pgmq.q_embedding_jobs q
                           where q.message->>'table' = 'products' and q.message->>'id' = p.id::text)) as p_missing,
      (select count(*)::int from public.rfqs r
        where r.embedding is null
          and not exists (select 1 from pgmq.q_embedding_jobs q
                           where q.message->>'table' = 'rfqs' and q.message->>'id' = r.id::text))    as r_missing,
      (select count(*)::int from public.product_videos v
        where v.status='live' and v.embedding is null
          and not exists (select 1 from pgmq.q_embedding_jobs q
                           where q.message->>'table' = 'product_videos' and q.message->>'id' = v.id::text)) as v_missing,
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

-- Proven inside the migration, then rolled back by the savepoint: an RFQ whose
-- job is queued is NOT missing; the same RFQ with its job removed IS missing.
do $$
declare
  b record; a record; rid uuid; buyer uuid; queued_missing int; unqueued_missing int; base int;
begin
  select * into b from _health_before;
  select status, reason, products_missing, rfqs_missing, videos_missing, vault_secret_ok
    into a from public.embedding_pipeline_health();
  -- Nothing is queued right now in the normal case, so the verdict must not move.
  if (select count(*) from pgmq.q_embedding_jobs) = 0
     and (a.status, a.reason, a.products_missing, a.rfqs_missing, a.videos_missing, a.vault_secret_ok)
         is distinct from (b.status, b.reason, b.products_missing, b.rfqs_missing, b.videos_missing, b.vault_secret_ok) then
    raise exception 'health verdict changed with an empty queue: before %, after %', b, a;
  end if;

  select rfqs_missing into base from public.embedding_pipeline_health();
  select id into buyer from auth.users where email = 'loadtest-buyer-1@cosora.test';
  begin
    -- The insert fires enqueue_rfq_embedding, exactly as a buyer's post does.
    insert into public.rfqs (buyer_id, title, quantity, description, status)
    values (buyer, '[LOADTEST] health-check probe (rolled back)', 1, 'probe', 'active')
    returning id into rid;
    select rfqs_missing into queued_missing from public.embedding_pipeline_health();
    delete from pgmq.q_embedding_jobs where message->>'id' = rid::text;
    select rfqs_missing into unqueued_missing from public.embedding_pipeline_health();
    raise exception using errcode = 'P0100', message = 'probe done';
  exception when sqlstate 'P0100' then
    null; -- everything in this block, the RFQ and the queue delete, is rolled back
  end;
  if queued_missing is distinct from base then
    raise exception 'a queued RFQ was counted as missing (base %, with queued probe %)', base, queued_missing;
  end if;
  if unqueued_missing is distinct from base + 1 then
    raise exception 'an unqueued RFQ was not counted as missing (base %, unqueued probe %)', base, unqueued_missing;
  end if;
end $$;
