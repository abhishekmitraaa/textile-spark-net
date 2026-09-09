-- embedding-worker: dispatch in proportion to the backlog instead of always
-- firing exactly one invocation per minute.
--
-- ── The measurement ────────────────────────────────────────────────────────
-- generate-embedding processes BATCH = 20 messages per invocation, and the cron
-- fires it once every 60 seconds. That is a hard ceiling of 20 jobs/minute,
-- 1,200/hour, regardless of backlog.
--
-- Measured, not inferred: 300 synthetic jobs were enqueued at 19:48:13 and the
-- queue drained to zero at ~20:03 — 15 ticks, exactly 20 per tick, no faster
-- when 300 were waiting than when 20 were. The cadence, not OpenAI and not the
-- database, is the bottleneck.
--
-- What that costs at the volumes this prompt targets:
--   a vendor bulk-importing 500 listings    -> 25 minutes before they are searchable
--   a 2,000-video upload wave               -> 100 minutes
--   re-embedding a 10,000-product catalogue -> 8.3 hours
--
-- ── The fix ────────────────────────────────────────────────────────────────
-- pg_net's http_post is asynchronous — it queues the request and returns — so
-- one cron tick can dispatch several worker invocations that then run
-- concurrently. Fire ceil(waiting / 20) of them, capped.
--
-- Idle behaviour is unchanged: 0 waiting still returns before posting anything,
-- so an idle marketplace still spends no invocations. One job waiting still
-- fires exactly one post. The extra concurrency only appears under backlog,
-- which is the definition of adaptive here — no second schedule, no polling
-- loop, no change to the 60-second tick.
--
-- Cap of 10 -> 200 jobs/minute, 12,000/hour. That turns the 500-listing import
-- into ~2.5 minutes and the 10,000-product re-embed into ~50 minutes. The cap
-- exists because these are real concurrent OpenAI calls: uncapped, a large
-- backlog would dispatch hundreds of simultaneous requests and convert a
-- throughput problem into a rate-limit problem. 10 is deliberately below
-- OpenAI's default concurrency allowances, and is the number to raise first if
-- throughput is still short — after checking the account's actual rate limits,
-- not before.
--
-- ── Why concurrent workers do not double-process ───────────────────────────
-- Demonstrated rather than assumed, per this prompt's ground rules. With 30
-- messages queued, calling embedding_jobs_read(20, 90) twice in succession:
--
--   read_1 claimed 20 messages
--   read_2 claimed 10 messages
--   overlap: 0
--
-- pgmq's read sets a visibility timeout on the rows it returns in the same
-- statement, so a second reader cannot see them. VT_SECONDS = 90 in the worker
-- is longer than the 60-second tick, which is what makes this hold across ticks
-- as well as across concurrent invocations within one tick.
--
-- The loud-failure behaviour from 20260909130000 is preserved exactly: a
-- missing vault secret with work waiting still RAISES, so the run shows as
-- failed in cron.job_run_details rather than silently succeeding over a dead
-- pipeline. That was the 3-day incident and it must not regress.

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
