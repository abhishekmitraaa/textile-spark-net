-- Region move: the vault secrets and the 27 scheduled jobs. psql -v svc=<new service key> -v blog=<blog secret> -v active=<true|false>
begin;
select vault.create_secret(:'svc', 'service_role_key', 'This project''s service key, read by the scheduled jobs that call edge functions') is not null as svc_saved;
select vault.create_secret(:'blog', 'blog_revalidate_secret', 'Shared with the blog''s Vercel project (revalidation)') is not null as blog_saved;
\i /work/cron-jobs.sql  -- generated from production at the move (see the runbook, step 7)
select count(*) filter (where cron.alter_job(jobid, active := :'active'::boolean) is null) as jobs_set from cron.job;
commit;
