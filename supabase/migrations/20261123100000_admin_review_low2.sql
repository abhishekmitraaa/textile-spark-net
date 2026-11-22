-- Cosora-Admin review, Low batch 2 (AR-L24, AR-L39, AR-L40), 2026-11-23.
-- Anchored patches (production's bodies are CRLF, normalised first; an applied patch is skipped).

create or replace function pg_temp.patch_fn(p_fn regprocedure, p_old text, p_new text, p_tag text) returns void
language plpgsql as $$
declare d text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
begin
  if position(p_new in d) > 0 then return; end if;
  if (length(d) - length(replace(d, p_old, ''))) / length(p_old) <> 1 then
    raise exception '%: anchor not found exactly once in %', p_tag, p_fn;
  end if;
  execute replace(d, p_old, p_new);
end $$;

-- AR-L24: the guard is coalesced (a null role is a refusal, not a pass-through) and the page is at most 500 rows.
select pg_temp.patch_fn('public.admin_embedding_pipeline_health(integer)'::regprocedure,
  $a$  if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then$a$,
  $a$  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'), false) then$a$,
  'L24 guard');
select pg_temp.patch_fn('public.admin_embedding_pipeline_health(integer)'::regprocedure,
  $a$  limit greatest(coalesce(p_limit, 60), 1);$a$,
  $a$  limit least(greatest(coalesce(p_limit, 60), 1), 500);$a$,
  'L24 limit');

-- AR-L39: embedding usage per India day and table, for System Health. Read from the archive by time (its
-- archived_at index), never the whole archive; at most 90 days. Replaces the view nothing read.
create or replace function public.admin_embedding_usage(p_days integer default 14)
returns table (day date, source_table text, jobs_processed bigint, chars_embedded bigint, est_usd numeric,
               avg_queue_seconds numeric, max_queue_seconds numeric, retried_jobs bigint)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
  v_from timestamptz := ((now() at time zone 'Asia/Kolkata')::date - (v_days - 1)) at time zone 'Asia/Kolkata';
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'), false) then
    raise exception 'not authorized: embedding usage requires the super_admin or vendor_ops role' using errcode = '42501';
  end if;
  return query
  select (a.archived_at at time zone 'Asia/Kolkata')::date,
         coalesce(a.message ->> 'table', 'unknown'),
         count(*),
         sum(length(coalesce(a.message ->> 'text', '')))::bigint,
         -- text-embedding-3-small: about 4 characters a token, $0.02 per million tokens.
         round(sum(length(coalesce(a.message ->> 'text', '')))::numeric / 4.0 / 1000000.0 * 0.02, 4),
         round(avg(extract(epoch from a.archived_at - a.enqueued_at)), 1),
         round(max(extract(epoch from a.archived_at - a.enqueued_at)), 1),
         sum((a.read_ct > 1)::integer)::bigint
  from pgmq.a_embedding_jobs a
  where a.archived_at >= v_from
  group by 1, 2
  order by 1 desc, 2;
end $$;

revoke all on function public.admin_embedding_usage(integer) from public, anon;
grant execute on function public.admin_embedding_usage(integer) to authenticated;

drop view if exists public.embedding_usage_daily;

-- AR-L40: the CSP reports the buyer site sends (`/api/csp-report` → `csp_report_ingest`), newest first.
create or replace function public.admin_csp_violations(p_limit integer default 100)
returns table (id bigint, directive text, blocked text, document_path text, source text, sample text,
               disposition text, hits integer, first_seen timestamptz, last_seen timestamptz)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'), false) then
    raise exception 'not authorized: CSP reports require the super_admin or vendor_ops role' using errcode = '42501';
  end if;
  return query
  select v.id, v.directive, v.blocked, v.document_path, v.source, v.sample, v.disposition, v.hits, v.first_seen, v.last_seen
  from public.csp_violations v
  order by v.last_seen desc, v.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

revoke all on function public.admin_csp_violations(integer) from public, anon;
grant execute on function public.admin_csp_violations(integer) to authenticated;

-- Self-check.
do $$
declare d text := pg_get_functiondef('public.admin_embedding_pipeline_health(integer)'::regprocedure);
begin
  if position('coalesce(public.is_admin()' in d) = 0 or position('least(greatest(' in d) = 0 then
    raise exception 'L24 patch missing';
  end if;
  if to_regclass('public.embedding_usage_daily') is not null then raise exception 'L39 view still there'; end if;
end $$;
