-- Make the pipeline health check watch itself, and make embedding spend visible
-- as a trend rather than as a monthly surprise.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 2e — turn embedding_pipeline_health() into an actual alert
-- ══════════════════════════════════════════════════════════════════════════
--
-- The function exists, works, and is called by nobody. The entire incident this
-- project just came through — three days of 100% failure with every cron run
-- reporting "succeeded" — is precisely the failure mode it was built to detect,
-- and it still required a human to think to run it by hand.
--
-- What already exists in this project, checked rather than assumed:
--   * `notifications` — a real table, per-profile, user-facing, with a `kind`
--     discriminator, already written to by the moderation functions. Admins are
--     `profiles.is_admin` (2 today).
--   * `cron.job_run_details` — where a RAISEing job becomes visible. This is
--     the channel the loud-worker fix already established.
--   * NO email sender, NO Slack/webhook integration, NO ops alerting service
--     anywhere in migrations or src. So there is no external channel to wire
--     into, and this builds the smallest viable version instead.
--
-- ── Why two cron jobs and not one ──────────────────────────────────────────
-- pg_cron runs each job in a single transaction, so a job that RAISEs rolls
-- back everything it did — including its own log row. Recording history and
-- raising an alarm are therefore mutually exclusive inside one job. They are
-- split:
--
--   embedding-health-log   (*/10)      records a row, never raises
--   embedding-health-alarm (5-55/10)   raises if unhealthy, writes nothing
--
-- offset by 5 minutes so the alarm reads a freshly-logged state.

create table if not exists public.embedding_pipeline_health_log (
  checked_at       timestamptz primary key default now(),
  status           text        not null,
  reason           text,
  queue_depth      integer,
  products_missing integer,
  rfqs_missing     integer,
  videos_missing   integer,
  vault_secret_ok  boolean
);

comment on table public.embedding_pipeline_health_log is
  'Ten-minute history of embedding_pipeline_health(). Exists so "the pipeline has been dead since Tuesday" is answerable after the fact — during the 3-day outage there was no record of anything having been wrong.';

create index if not exists embedding_pipeline_health_log_status_idx
  on public.embedding_pipeline_health_log (checked_at desc) where status <> 'OK';

alter table public.embedding_pipeline_health_log enable row level security;
revoke all on public.embedding_pipeline_health_log from public, anon, authenticated;
grant select, insert, delete on public.embedding_pipeline_health_log to service_role;

create or replace function public.record_embedding_pipeline_health()
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  h          record;
  v_previous text;
begin
  select * into h from public.embedding_pipeline_health();

  select status into v_previous
  from public.embedding_pipeline_health_log
  order by checked_at desc limit 1;

  insert into public.embedding_pipeline_health_log
    (status, reason, queue_depth, products_missing, rfqs_missing, videos_missing, vault_secret_ok)
  values
    (h.status, h.reason, h.queue_depth, h.products_missing, h.rfqs_missing, h.videos_missing, h.vault_secret_ok);

  -- Notify admins on the TRANSITION into a bad state, not on every subsequent
  -- check. A 3-day outage should produce one notification, not 432 of them —
  -- an alert channel that floods is an alert channel people mute, which would
  -- reproduce the original failure with extra steps.
  if h.status <> 'OK' and (v_previous is null or v_previous = 'OK') then
    insert into public.notifications (profile_id, kind, title, body)
    select p.id,
           'system',
           'Embedding pipeline: ' || h.status,
           coalesce(h.reason, 'no reason reported')
             || ' (queue ' || coalesce(h.queue_depth, 0)
             || ', missing: ' || coalesce(h.products_missing, 0) || ' products / '
             || coalesce(h.rfqs_missing, 0) || ' RFQs / '
             || coalesce(h.videos_missing, 0) || ' videos)'
    from public.profiles p
    where p.is_admin;
  end if;

  -- Keep 90 days. This is a 10-minute heartbeat, so that is ~13k rows.
  delete from public.embedding_pipeline_health_log
  where checked_at < now() - interval '90 days';

  return h.status;
end
$function$;

comment on function public.record_embedding_pipeline_health() is
  'Records one embedding_pipeline_health() sample and notifies admins on transition into a non-OK state. Never raises — see the migration header for why logging and alarming are separate cron jobs.';

revoke execute on function public.record_embedding_pipeline_health() from public, anon, authenticated;
grant execute on function public.record_embedding_pipeline_health() to service_role;

select cron.unschedule('embedding-health-log')
where exists (select 1 from cron.job where jobname = 'embedding-health-log');

select cron.schedule(
  'embedding-health-log', '*/10 * * * *',
  $job$ select public.record_embedding_pipeline_health(); $job$
);

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

-- ══════════════════════════════════════════════════════════════════════════
-- 2f — embedding usage as a trend
-- ══════════════════════════════════════════════════════════════════════════
--
-- Every successfully processed job lands in pgmq's archive table with both
-- `enqueued_at` and `archived_at` retained, so the usage history already exists
-- — nothing new needs logging, it just needs reading.
--
-- One archived job == one embedding == one row's share of an OpenAI batch call.
-- The cost column is derived from text-embedding-3-small's published price
-- ($0.02 per 1M tokens) with a deliberately crude ~1 token per 4 characters
-- estimate. It is an order-of-magnitude figure for spotting a 10x jump, NOT an
-- invoice, and is labelled as such so nobody reconciles against it.
--
-- The queue-lag columns answer the other question this view is for: "is the
-- pipeline keeping up, or is it just quietly falling behind?" — the shape the
-- health check cannot see, because a queue that drains slowly is never empty
-- but is never alarmingly deep either.

create or replace view public.embedding_usage_daily as
select
  archived_at::date                                              as day,
  coalesce(message ->> 'table', 'unknown')                       as source_table,
  count(*)                                                       as jobs_processed,
  sum(length(coalesce(message ->> 'text', '')))                  as chars_embedded,
  round((sum(length(coalesce(message ->> 'text', ''))) / 4.0)
        / 1000000.0 * 0.02, 4)                                   as est_usd,
  round(avg(extract(epoch from (archived_at - enqueued_at)))::numeric, 1) as avg_queue_seconds,
  round(max(extract(epoch from (archived_at - enqueued_at)))::numeric, 1) as max_queue_seconds,
  sum((read_ct > 1)::int)                                        as retried_jobs
from pgmq.a_embedding_jobs
group by 1, 2;

comment on view public.embedding_usage_daily is
  'Embedding jobs processed per day per source table, derived from the pgmq archive. est_usd is a rough ~4-chars-per-token estimate for spotting trend changes, NOT a billing figure. avg/max_queue_seconds show whether the pipeline is keeping up.';

alter view public.embedding_usage_daily set (security_invoker = on);
revoke all on public.embedding_usage_daily from public, anon, authenticated;
grant select on public.embedding_usage_daily to service_role;
