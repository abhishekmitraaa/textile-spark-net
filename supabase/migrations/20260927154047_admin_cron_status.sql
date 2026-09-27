-- Admin completion, Phase 2b (Mitra, 2026-09-27): admins can see whether the scheduled
-- jobs are running.
--
-- admin_cron_status() returns, for every pg_cron job:
--   * its schedule and whether it is active;
--   * its last run: status, start, end, and the first 300 characters of the message;
--   * its run and failure counts over the last 24 hours.
-- Cosora-Admin's System Health page shows it. Without it, a job that fails every
-- night is visible only in cron.job_run_details, which no admin can read.
--
-- Access: super_admin and vendor_ops, the same audience as
-- admin_embedding_pipeline_health() on that page. SECURITY DEFINER, empty
-- search_path, EXECUTE for authenticated only.
--
-- Cost: cron.job_run_details has no jobid index (it belongs to supabase_admin, so
-- postgres can't add one). Both reads walk the runid primary key:
--   * the last run per job goes backwards from the newest runid, with LIMIT 1;
--   * the 24-hour counts cover only the newest 5,000 runids. That is about 10 days
--     at today's ~460 runs a day, and cron-history-prune keeps the table to 14 days.

create or replace function public.admin_cron_status()
returns table(
  jobname          text,
  schedule         text,
  active           boolean,
  last_status      text,
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_message     text,
  runs_24h         integer,
  failures_24h     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_floor bigint;
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['super_admin', 'vendor_ops']::public.admin_role_type[]), false) then
    raise exception 'not authorized: scheduled job status is for super admins and vendor ops' using errcode = '42501';
  end if;

  select coalesce(max(r.runid), 0) - 5000 into v_floor from cron.job_run_details r;

  return query
    with recent as (
      select r.jobid,
             count(*)::integer                                    as runs,
             (count(*) filter (where r.status = 'failed'))::integer as failures
        from cron.job_run_details r
       where r.runid > v_floor
         and r.start_time > now() - interval '24 hours'
       group by r.jobid
    )
    select j.jobname::text,
           j.schedule::text,
           j.active,
           d.status::text,
           d.start_time,
           d.end_time,
           left(d.return_message, 300),
           coalesce(rc.runs, 0),
           coalesce(rc.failures, 0)
      from cron.job j
      left join lateral (
        select r.status, r.start_time, r.end_time, r.return_message
          from cron.job_run_details r
         where r.jobid = j.jobid
         order by r.runid desc
         limit 1
      ) d on true
      left join recent rc on rc.jobid = j.jobid
     order by j.jobname;
end
$function$;

revoke all on function public.admin_cron_status() from public, anon, authenticated;
grant execute on function public.admin_cron_status() to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('anon', 'public.admin_cron_status()', 'EXECUTE') then
    raise exception 'self-check: anon can execute admin_cron_status()';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_cron_status()', 'EXECUTE') then
    raise exception 'self-check: authenticated cannot execute admin_cron_status()';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.admin_cron_status()'::regprocedure) then
    raise exception 'self-check: admin_cron_status() is not SECURITY DEFINER';
  end if;
end
$check$;
