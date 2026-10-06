-- ─────────────────────────────────────────────────────────────────────────────
-- The embedding pipeline's scheduled jobs come back (Mitra, 2026-10-06).
--
-- All twelve pg_cron jobs were deleted on 2026-09-26 (20260926082046). Admin completion
-- Phase 2 (20260927153142) restored the essential ones and left these five off, because
-- embeddings needed OpenAI billing (documentation/ToDo.md, "Decide on the five scheduled
-- jobs"). Checked 2026-10-06 before restoring:
--   * embed-query embedded and cached a new search on 2026-10-05, so the OpenAI key answers;
--   * the Vault secret service_role_key exists; generate-embedding v4 is deployed;
--   * embedding_pipeline_health() read CRITICAL: 2 jobs waiting, the oldest 7 days (a vendor
--     product from 2026-09-29, and a buyer's quote request from 2026-10-06), and one vendor
--     waiting for a catalogue recompute.
-- Without the worker, a new RFQ gets no similarity score (vendors' feeds rank it by
-- category only), a new product misses semantic and image search, and a new vendor never
-- gets a catalogue embedding.
--
-- Each job is re-created from its most recent definition, verbatim:
--   embedding-worker              * * * * *       20260910140000 (dispatch scales with the
--                                                 backlog, capped at 10; raises if the Vault
--                                                 key is missing while work waits)
--   vendor-catalog-recompute      * * * * *       20260910130000
--   embedding-health-alarm        5-55/10 * * * * 20260910170000
--   prune-query-embedding-cache   17 3 * * *      20260910160000
--   prune-embed-rate-limit        23 3 * * *      20260910160000
-- embedding-health-log already runs (20260927153142). The two every-minute jobs add about
-- 2,900 rows a day to cron.job_run_details; cron-history-prune keeps 14 days.
-- Idle cost is nil: the worker returns before posting when nothing is waiting.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── embedding-worker (20260910140000) ──────────────────────────────────────
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
    v_posts      integer;
    v_key        text;
    i            integer;
  begin
    select count(*) into v_waiting from pgmq.q_embedding_jobs where vt <= now();

    -- Nothing to do. Return silently so an idle marketplace spends no edge
    -- function invocations (the reason this guard exists at all).
    if v_waiting = 0 then
      return;
    end if;

    select exists (select 1 from vault.decrypted_secrets where name = 'service_role_key')
      into v_has_secret;

    -- Previously this condition silently skipped the POST and the run still
    -- reported success. It is an error, so the outage is visible in
    -- cron.job_run_details on the very next tick.
    if not v_has_secret then
      raise exception
        'embedding-worker: % job(s) waiting but vault secret "service_role_key" is missing - the pipeline is a no-op. Create it with vault.create_secret(...).',
        v_waiting;
    end if;

    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'service_role_key';

    -- One invocation per 20 waiting jobs, capped. See the header for why 10.
    v_posts := least(ceil(v_waiting::numeric / 20)::integer, 10);

    for i in 1..v_posts loop
      perform net.http_post(
        url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/generate-embedding',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := '{}'::jsonb
      );
    end loop;
  end
  $inner$;
  $job$
);

-- ── vendor-catalog-recompute (20260910130000) ──────────────────────────────
select cron.unschedule('vendor-catalog-recompute')
where exists (select 1 from cron.job where jobname = 'vendor-catalog-recompute');

select cron.schedule(
  'vendor-catalog-recompute',
  '* * * * *',
  $job$ select public.drain_vendor_catalog_recompute(50); $job$
);

-- ── embedding-health-alarm (20260910170000) ────────────────────────────────
select cron.unschedule('embedding-health-alarm')
where exists (select 1 from cron.job where jobname = 'embedding-health-alarm');

select cron.schedule(
  'embedding-health-alarm', '5-55/10 * * * *',
  $job$
  do $alarm$
  declare h record;
  begin
    select * into h from public.embedding_pipeline_health();
    if h.status <> 'OK' then
      raise exception 'embedding pipeline %: % (queue=%, missing products=%, rfqs=%, videos=%, vault_secret_ok=%)',
        h.status, coalesce(h.reason,'?'), coalesce(h.queue_depth,0),
        coalesce(h.products_missing,0), coalesce(h.rfqs_missing,0),
        coalesce(h.videos_missing,0), h.vault_secret_ok;
    end if;
  end
  $alarm$;
  $job$
);

-- ── prune-query-embedding-cache (20260910160000) ───────────────────────────
select cron.unschedule('prune-query-embedding-cache')
where exists (select 1 from cron.job where jobname = 'prune-query-embedding-cache');

select cron.schedule(
  'prune-query-embedding-cache',
  '17 3 * * *',
  $job$ select public.prune_search_query_embeddings(); $job$
);

-- ── prune-embed-rate-limit (20260910160000) ────────────────────────────────
select cron.unschedule('prune-embed-rate-limit')
where exists (select 1 from cron.job where jobname = 'prune-embed-rate-limit');

select cron.schedule(
  'prune-embed-rate-limit',
  '23 3 * * *',
  $job$ delete from public.embed_query_rate_limit
        where caller <> 'global' and window_start < now() - interval '1 day'; $job$
);

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
declare
  v_missing text;
begin
  select string_agg(n, ', ') into v_missing
    from unnest(array['embedding-worker', 'vendor-catalog-recompute', 'embedding-health-alarm',
                      'prune-query-embedding-cache', 'prune-embed-rate-limit']) as n
   where not exists (select 1 from cron.job j where j.jobname = n and j.active);
  if v_missing is not null then
    raise exception 'restore_embedding_jobs self-check: not scheduled or not active: %', v_missing;
  end if;
end
$check$;
