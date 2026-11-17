-- Ad impressions are counted in batches (Mitra, 2026-11-18: "Build the job now"; ToDo.md "Count ad impressions in
-- batches", Seller Home audit SH-098).
--
-- ad_impression() added 1 to the campaign's row on every view, so a busy page with the same few newest campaigns made
-- every viewer wait on those rows. Now a view adds a row to admin.ad_impression_queue (an insert, which waits on
-- nothing), and the job ad-impressions-fold adds the queue up into advertisements.impressions every minute, then
-- empties what it added. Every impression is still recorded, with no cap (Mitra, 2026-11-18); the counts on screen
-- lag by up to a minute.

create table if not exists admin.ad_impression_queue (
  id    bigint generated always as identity primary key,
  ad_id uuid not null,
  at    timestamptz not null default now()
);
revoke all on table admin.ad_impression_queue from public, anon, authenticated;

-- A view on a running campaign queues one impression. Same rule as 20261117140000's ad_impression: no cap, whoever
-- calls; a campaign that isn't running records nothing.
create or replace function public.ad_impression(ad uuid, p_session text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if ad is null then return; end if;
  if exists (select 1 from public.advertisements a where a.id = ad and a.status = 'active') then
    insert into admin.ad_impression_queue (ad_id) values (ad);
  end if;
end $function$;

-- Folds the queue into the campaigns, once. Rows queued while it runs wait for the next run.
create or replace function admin.ad_impressions_fold()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rows integer;
begin
  -- One fold at a time.
  if not pg_try_advisory_xact_lock(hashtext('admin.ad_impressions_fold')) then
    return 0;
  end if;
  with taken as (
    delete from admin.ad_impression_queue q where q.id <= (select max(id) from admin.ad_impression_queue)
    returning q.ad_id
  ), counted as (
    select t.ad_id, count(*) as n from taken t group by t.ad_id
  )
  update public.advertisements a
     set impressions = a.impressions + c.n
    from counted c
   where a.id = c.ad_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end
$function$;
revoke all on function admin.ad_impressions_fold() from public, anon, authenticated;

-- Every minute.
do $job$
begin
  if exists (select 1 from cron.job where jobname = 'ad-impressions-fold') then
    perform cron.unschedule('ad-impressions-fold');
  end if;
  perform cron.schedule('ad-impressions-fold', '* * * * *', 'select admin.ad_impressions_fold();');
end
$job$;

do $check$
begin
  if position('ad_impression_queue' in pg_get_functiondef('public.ad_impression(uuid, text)'::regprocedure)) = 0 then
    raise exception 'self-check: ad_impression still writes the campaign row';
  end if;
  if not exists (select 1 from cron.job where jobname = 'ad-impressions-fold' and active) then
    raise exception 'self-check: the fold job is not scheduled';
  end if;
  if has_table_privilege('anon', 'admin.ad_impression_queue', 'insert')
     or has_function_privilege('authenticated', 'admin.ad_impressions_fold()', 'execute') then
    raise exception 'self-check: browsers can reach the impression queue';
  end if;
end
$check$;
