-- Content-Security-Policy violation reports, collected while the marketplace's
-- full policy runs in Report-Only mode.
--
-- The CSP enforced today is deliberately narrow (frame-ancestors, base-uri,
-- object-src). The full policy, which also restricts scripts, styles, images,
-- fonts, frames and network calls to an inventoried list of origins, ships as
-- Content-Security-Policy-Report-Only first. Browsers then report what the
-- policy WOULD have blocked, without blocking it. This table is where those
-- reports land, so the policy can be corrected against real traffic over a real
-- stretch of time before it is switched to enforcing.
--
-- Reports arrive at /api/csp-report (textile-spark-net api/csp-report.ts), which
-- normalises both browser formats and calls csp_report_ingest().
--
-- Stored aggregated, not per report: one row per (directive, blocked origin,
-- page path, source), with a hit count and first/last seen. No IP address, no
-- user agent, no query strings, no user id. That keeps it free of personal data
-- and bounded in size however much traffic arrives.
--
-- Reading it: see MIGRATIONS.md or run
--   select directive, blocked, document_path, source, hits, last_seen
--     from public.csp_violations order by hits desc;

create table if not exists public.csp_violations (
  id            bigint generated always as identity primary key,
  directive     text        not null,
  blocked       text        not null,
  document_path text        not null,
  source        text        not null default '',
  sample        text,
  disposition   text        not null default 'report',
  hits          integer     not null default 1,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  constraint csp_violations_key unique (directive, blocked, document_path, source)
);

comment on table public.csp_violations is
  'Aggregated CSP violation reports from the marketplace Report-Only policy. No personal data. Written only by csp_report_ingest().';

-- Nobody reads or writes this table directly from a client. RLS on with no
-- policies, and no grants: the ingest function below is the only way in.
alter table public.csp_violations enable row level security;
revoke all on table public.csp_violations from public, anon, authenticated;

-- Accepts an array of already-normalised reports from the /api/csp-report
-- function. It is callable with the anon key because browsers post reports
-- without credentials, so it trusts nothing:
--   * at most 20 reports per call;
--   * every field truncated;
--   * once 5,000 distinct rows exist, new keys are dropped and only existing
--     rows count up, so junk can fill the table once but never grow it.
create or replace function public.csp_report_ingest(p_reports jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r jsonb;
  v_directive text;
  v_blocked text;
  v_path text;
  v_source text;
  v_full boolean;
begin
  if p_reports is null or jsonb_typeof(p_reports) <> 'array' then
    return;
  end if;

  select count(*) >= 5000 into v_full from public.csp_violations;

  for r in select value from jsonb_array_elements(p_reports) limit 20 loop
    if jsonb_typeof(r) <> 'object' then continue; end if;

    v_directive := left(coalesce(nullif(btrim(r ->> 'directive'), ''), 'unknown'), 64);
    v_blocked   := left(coalesce(nullif(btrim(r ->> 'blocked'), ''), 'unknown'), 200);
    v_path      := left(coalesce(nullif(btrim(r ->> 'document_path'), ''), '/'), 200);
    v_source    := left(coalesce(btrim(r ->> 'source'), ''), 300);

    if v_full then
      update public.csp_violations v
         set hits = v.hits + 1, last_seen = now()
       where v.directive = v_directive and v.blocked = v_blocked
         and v.document_path = v_path and v.source = v_source;
    else
      insert into public.csp_violations as v
             (directive, blocked, document_path, source, sample, disposition)
      values (v_directive, v_blocked, v_path, v_source,
              left(nullif(r ->> 'sample', ''), 120),
              left(coalesce(nullif(r ->> 'disposition', ''), 'report'), 16))
      on conflict (directive, blocked, document_path, source) do update
         set hits = v.hits + 1,
             last_seen = now(),
             sample = coalesce(v.sample, excluded.sample);
    end if;
  end loop;
end
$fn$;

revoke execute on function public.csp_report_ingest(jsonb) from public;
grant execute on function public.csp_report_ingest(jsonb) to anon, authenticated;
