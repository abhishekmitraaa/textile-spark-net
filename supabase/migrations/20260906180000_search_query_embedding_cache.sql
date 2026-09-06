-- Query-embedding cache + the single search entrypoint the client calls
-- (Phase 4).
--
-- Buyers in a vertical marketplace type the same handful of things ("cotton
-- t-shirt", "linen shirt", "kurta"), so an unbounded OpenAI call per search is
-- both a cost leak and latency nobody needs. Cached vectors make the common
-- query free and fast.
--
-- The vector deliberately never leaves the database. An earlier shape had the
-- browser fetch its own 1536-float embedding and pass it into match_products —
-- ~20 KB on the wire each way for a value the browser cannot use for anything.

create table if not exists public.search_query_embeddings (
  query_norm   text primary key,
  embedding    extensions.halfvec(1536) not null,
  hits         integer not null default 1,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

-- RLS on with NO policies: this table is service_role / SECURITY DEFINER only.
-- Nothing client-side has any business reading raw embeddings.
alter table public.search_query_embeddings enable row level security;

create or replace function public.normalise_search_query(q text)
returns text language sql immutable parallel safe as
$$ select nullif(lower(trim(regexp_replace(coalesce(q, ''), '\s+', ' ', 'g'))), '') $$;

-- Upsert used by the embed-query edge function after a cache miss.
create or replace function public.cache_query_embedding(p_query text, p_embedding text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n text := public.normalise_search_query(p_query);
begin
  if n is null then return false; end if;
  insert into public.search_query_embeddings (query_norm, embedding)
  values (n, p_embedding::extensions.halfvec(1536))
  on conflict (query_norm) do update
    set hits = public.search_query_embeddings.hits + 1,
        last_used_at = now();
  return true;
end $$;

-- True when this query already has a cached vector — lets the edge function
-- skip OpenAI entirely without exposing the vector itself.
create or replace function public.has_query_embedding(p_query text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.search_query_embeddings
    where query_norm = public.normalise_search_query(p_query)
  );
$$;

-- ── The one call the client makes ──
-- Resolves the cached vector server-side and delegates to match_products.
-- `embedding_used` tells the client whether this was a full hybrid search or a
-- keyword-only degrade, which is what drives the background cache warm.
create or replace function public.search_products(
  query       text,
  match_count int default 60
)
returns table (
  id             uuid,
  score          double precision,
  fts_rank       int,
  vec_rank       int,
  boost_tier     int,
  embedding_used boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with cached as (
    select e.embedding
    from public.search_query_embeddings e
    where e.query_norm = public.normalise_search_query(query)
  )
  select m.id, m.score, m.fts_rank, m.vec_rank, m.boost_tier,
         (select count(*) from cached) > 0 as embedding_used
  from public.match_products(
         query,
         (select embedding from cached),
         match_count
       ) m;
$$;

comment on function public.search_products(text, int) is
  'Client-facing product search. Resolves a cached query embedding server-side and delegates to match_products; degrades to keyword-only when the query has never been embedded.';

-- Postgres grants EXECUTE to PUBLIC by default, so both helpers must be revoked
-- explicitly rather than merely granted to service_role.
revoke all on function public.cache_query_embedding(text, text) from public, anon, authenticated;
revoke all on function public.has_query_embedding(text)         from public, anon, authenticated;
grant execute on function public.cache_query_embedding(text, text) to service_role;
grant execute on function public.has_query_embedding(text)         to service_role;
grant execute on function public.search_products(text, int)        to anon, authenticated;
