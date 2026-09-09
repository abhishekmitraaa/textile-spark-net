-- Two cost-control measures for the buyer-facing query embedding path.
--
-- Both exist because embed-query is callable by anyone holding the public anon
-- key and each cache MISS is a real, billable OpenAI call. Its own header has
-- said "there is no rate limit yet, so watch spend if the marketplace is ever
-- scraped" since it was written. At 33 products that was a note; at the traffic
-- this prompt targets it is an unmetered spend surface with no ceiling.
--
-- Checked first: this project has NO existing rate-limiting pattern anywhere —
-- no table, no function, no middleware, in migrations or in src. So this is the
-- smallest viable version rather than a reuse of something established.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Retention for search_query_embeddings
-- ══════════════════════════════════════════════════════════════════════════
--
-- The table has no eviction policy: every distinct phrase any buyer has ever
-- typed is kept forever. Each row is a 1536-dim halfvec (~3 KB) plus the text,
-- so a million distinct queries is a few GB of a table whose entire purpose is
-- to avoid paying twice for the same phrase.
--
-- Policy — age AND unpopularity together, never age alone:
--
--   * hits >= 5 is never evicted by age. A phrase that has been searched five
--     times is a real repeat query; that is exactly what the cache is for, and
--     evicting it means paying OpenAI again to relearn something already known.
--   * hits < 5 and untouched for 30 days is evicted. These are the long tail —
--     typos, one-off product names, a phrase typed once during a session that
--     never came back. They are the bulk of the growth and the least likely to
--     ever be hit again.
--   * A hard cap of 200,000 rows backstops both, evicting least-recently-used
--     first. This is what makes the growth bounded rather than merely slowed:
--     without it, a scraper generating novel phrases faster than 30 days can
--     retire them still grows the table without limit. 200k rows is ~600 MB of
--     vectors, and at that size the table is still doing its job for every
--     phrase that repeats at all.
--
-- LRU by (last_used_at, hits) rather than by created_at: a phrase first seen a
-- year ago but searched yesterday is a live query, and age of first sighting
-- says nothing useful about it.

create or replace function public.prune_search_query_embeddings(
  p_max_age_days integer default 30,
  p_min_hits     integer default 5,
  p_max_rows     integer default 200000
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_deleted integer := 0;
  v_n       integer;
begin
  -- Long tail: old AND never repeated.
  delete from public.search_query_embeddings
  where last_used_at < now() - make_interval(days => greatest(coalesce(p_max_age_days, 30), 1))
    and hits < greatest(coalesce(p_min_hits, 5), 1);
  get diagnostics v_n = row_count;
  v_deleted := v_deleted + v_n;

  -- Hard cap, LRU first. Only runs when the table is actually over budget.
  delete from public.search_query_embeddings
  where query_norm in (
    select query_norm from public.search_query_embeddings
    order by last_used_at asc, hits asc
    offset greatest(coalesce(p_max_rows, 200000), 1000)
  );
  get diagnostics v_n = row_count;
  v_deleted := v_deleted + v_n;

  return v_deleted;
end
$function$;

comment on function public.prune_search_query_embeddings(integer, integer, integer) is
  'Evicts long-tail entries from the query embedding cache: unrepeated phrases older than p_max_age_days, then LRU down to p_max_rows. Phrases with hits >= p_min_hits are never evicted by age. Runs nightly.';

revoke execute on function public.prune_search_query_embeddings(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.prune_search_query_embeddings(integer, integer, integer) to service_role;

-- Nightly, not per-minute: this is housekeeping on a slow-growing table and
-- there is no benefit to evicting a row the hour it becomes eligible.
select cron.unschedule('prune-query-embedding-cache')
where exists (select 1 from cron.job where jobname = 'prune-query-embedding-cache');

select cron.schedule(
  'prune-query-embedding-cache',
  '17 3 * * *',
  $job$ select public.prune_search_query_embeddings(); $job$
);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Rate limiting for embed-query
-- ══════════════════════════════════════════════════════════════════════════
--
-- Fixed-window counters in a table, keyed on an opaque caller string. Fixed
-- window rather than sliding: it is one row and one upsert per call, it cannot
-- drift, and the worst case (a caller getting 2x the budget by straddling a
-- window boundary) is irrelevant when the thing being limited costs $0.00002.
--
-- TWO scopes are checked on every call, and this is the important part:
--
--   * 'ip:<address>' — bounds any single client.
--   * 'global'       — bounds TOTAL spend regardless of how many clients there
--                      are. A scraper rotating IPs defeats per-IP limiting
--                      completely, and per-IP limiting alone would have left
--                      the actual bill unbounded. The global ceiling is the
--                      one that protects the credit card.
--
-- Defaults: 30 novel queries per IP per 5 minutes, 10,000 globally per hour.
-- The per-IP figure is far above human behaviour (a buyer typing continuously
-- with a debounce produces a handful of distinct phrases per minute) and far
-- below scraping throughput. The global figure caps worst-case spend at roughly
-- $0.20/hour on embeddings; it is deliberately high enough that a genuine
-- traffic spike is not throttled, and it is the number to revisit against real
-- traffic rather than a guess to defend forever.

create table if not exists public.embed_query_rate_limit (
  caller        text        primary key,
  window_start  timestamptz not null default now(),
  count         integer     not null default 0
);

comment on table public.embed_query_rate_limit is
  'Fixed-window rate counters for embed-query, keyed on ''ip:<addr>'' or ''global''. Internal: no client touches this directly.';

alter table public.embed_query_rate_limit enable row level security;
revoke all on public.embed_query_rate_limit from public, anon, authenticated;
grant select, insert, update, delete on public.embed_query_rate_limit to service_role;

create index if not exists embed_query_rate_limit_window_idx
  on public.embed_query_rate_limit (window_start);

create or replace function public.embed_query_rate_check(
  p_ip             text,
  p_ip_limit       integer default 30,
  p_ip_window_secs integer default 300,
  p_global_limit   integer default 10000,
  p_global_window_secs integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_count integer;
begin
  -- Global scope first: if the platform-wide ceiling is hit, nobody gets a new
  -- embedding regardless of which IP they are on. Checked before the per-IP
  -- counter so a rotating-IP scraper cannot consume the global budget while
  -- each individual IP still looks well-behaved.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('global', now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_global_window_secs, 3600), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  if v_count > greatest(coalesce(p_global_limit, 10000), 1) then
    return false;
  end if;

  -- Per-IP scope. An absent/unparseable address collapses to a single shared
  -- 'ip:unknown' bucket, which is the safe direction: unattributable traffic
  -- shares one budget rather than each anonymous call getting a fresh one.
  insert into public.embed_query_rate_limit (caller, window_start, count)
  values ('ip:' || coalesce(nullif(trim(p_ip), ''), 'unknown'), now(), 1)
  on conflict (caller) do update
    set window_start = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 300), 1))
          then now() else public.embed_query_rate_limit.window_start end,
        count = case
          when public.embed_query_rate_limit.window_start
               < now() - make_interval(secs => greatest(coalesce(p_ip_window_secs, 300), 1))
          then 1 else public.embed_query_rate_limit.count + 1 end
  returning count into v_count;

  return v_count <= greatest(coalesce(p_ip_limit, 30), 1);
end
$function$;

comment on function public.embed_query_rate_check(text, integer, integer, integer, integer) is
  'Returns true if this caller may make one more NOVEL query embedding. Increments a global counter and a per-IP counter; false if either budget is exhausted. Called by embed-query only on a cache MISS — cached lookups cost nothing and are never throttled.';

revoke execute on function public.embed_query_rate_check(text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.embed_query_rate_check(text, integer, integer, integer, integer) to service_role;

-- Counter rows for IPs nobody has used in a day are dead weight. Folded into
-- the same nightly slot as the cache prune.
select cron.unschedule('prune-embed-rate-limit')
where exists (select 1 from cron.job where jobname = 'prune-embed-rate-limit');

select cron.schedule(
  'prune-embed-rate-limit',
  '23 3 * * *',
  $job$ delete from public.embed_query_rate_limit
        where caller <> 'global' and window_start < now() - interval '1 day'; $job$
);
