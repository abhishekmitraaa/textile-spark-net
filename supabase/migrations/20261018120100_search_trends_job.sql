-- The daily job behind trending searches (20261018120000_search_trends.sql). A separate migration because
-- a new scheduled job is Mitra's call: the feature's tables and functions can ship without it, and then
-- the list is computed only when staff hide or unhide a term.
--
-- search-trends-refresh, 18:40 UTC = 00:10 India time: computes yesterday's list (widening to the week or
-- the month when yesterday is thin). The new run fires trg_search_trend_runs_snapshot, which queues the
-- site-config/site.json rebuild; the hourly faq-snapshots-refresh job rebuilds it too, so a lost call
-- can't leave the page stale for more than an hour. It also prunes runs older than 90 days (their items
-- go by cascade). Plain SQL, no edge function and no secret: if the computation fails, the job fails
-- and System Health shows it (it never reports success for work it didn't do).

select cron.unschedule('search-trends-refresh')
 where exists (select 1 from cron.job where jobname = 'search-trends-refresh');
select cron.schedule(
  'search-trends-refresh',
  '40 18 * * *',
  $job$
  select admin.search_trends_refresh('job');
  delete from admin.search_trend_runs
   where computed_at < now() - interval '90 days'
     and id <> (select max(id) from admin.search_trend_runs);
  $job$
);

do $check$
begin
  if not exists (select 1 from cron.job where jobname = 'search-trends-refresh' and schedule = '40 18 * * *' and active) then
    raise exception 'self-check: the search-trends-refresh job is missing';
  end if;
end
$check$;
