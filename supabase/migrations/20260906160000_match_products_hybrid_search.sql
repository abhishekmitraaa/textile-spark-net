-- Hybrid product search: full-text + vector, fused with Reciprocal Rank Fusion,
-- then weighted by the vendor's paid search-boost tier (Phase 3).
--
-- The point of this function is that ranking happens in ONE place. Before it,
-- relevance was a JS substring test in the browser and plan boost was a separate
-- client-side sort key, so there was no way to express "a highly relevant free
-- listing should outrank a marginally relevant paid one". Here that trade-off is
-- a single visible multiplication.
--
-- RRF is used rather than score normalisation because ts_rank and cosine
-- distance are not on comparable scales and never will be. RRF only reads the
-- ORDER of each list, so the two halves can be combined without inventing a
-- conversion factor. k = 60 is the constant from the original RRF paper; it is
-- deliberately not tuned.
--
-- search_path MUST include extensions: pgvector lives there, and a SECURITY
-- DEFINER function that pins search_path to public alone cannot resolve the
-- `<=>` cosine-distance operator at all.
create or replace function public.match_products(
  query            text,
  query_embedding  extensions.halfvec(1536) default null,
  match_count      int default 40,
  boost_weight     double precision default 0.05
)
returns table (
  id         uuid,
  score      double precision,
  fts_rank   int,
  vec_rank   int,
  boost_tier int
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with params as (
    select
      nullif(trim(coalesce(query, '')), '')                  as qtext,
      -- Each half contributes at least 40 candidates so the fusion pool is
      -- never thinner than the page being asked for.
      greatest(coalesce(match_count, 40), 40)                as depth,
      60                                                     as rrf_k
  ),
  ts as (
    select websearch_to_tsquery('english', qtext) as tsq
    from params where qtext is not null
  ),
  -- Keyword half. Ordered inside the subquery, then numbered, so the rank
  -- reflects the LIMIT'd set rather than the whole table.
  fts_hits as (
    select s.id, row_number() over () as rank
    from (
      select p.id
      from public.products p, ts
      -- status = 'live' is load-bearing: SECURITY DEFINER bypasses RLS, so this
      -- filter is the only thing keeping draft / under_review / rejected
      -- listings out of buyer search results.
      where p.status = 'live'
        and p.fts @@ ts.tsq
      order by ts_rank(p.fts, ts.tsq) desc, p.enquiries_count desc, p.id
      limit (select depth from params)
    ) s
  ),
  -- Semantic half. Skipped entirely when the caller had no embedding to offer
  -- (OpenAI unavailable), which degrades this to plain FTS rather than failing.
  vec_hits as (
    select s.id, row_number() over () as rank
    from (
      select p.id
      from public.products p
      where p.status = 'live'
        and query_embedding is not null
        and p.embedding is not null
      order by p.embedding <=> query_embedding, p.id
      limit (select depth from params)
    ) s
  ),
  fused as (
    select
      coalesce(f.id, v.id) as id,
      coalesce(1.0 / ((select rrf_k from params) + f.rank), 0)
        + coalesce(1.0 / ((select rrf_k from params) + v.rank), 0) as rrf,
      f.rank as fts_rank,
      v.rank as vec_rank
    from fts_hits f
    full outer join vec_hits v on v.id = f.id
  )
  select
    fu.id,
    -- Business signal applied AFTER fusion, never instead of it. A multiplier
    -- bounded at 1 + 4*0.05 = 1.20 can reorder near-neighbours (adjacent RRF
    -- ranks differ by ~1.6% at the head of the list) but cannot lift an
    -- irrelevant listing over a relevant one. Raise boost_weight to sell a
    -- stronger tier; the composition stays honest either way.
    (fu.rrf * (1 + boost_weight * bt.tier))::double precision as score,
    fu.fts_rank::int,
    fu.vec_rank::int,
    bt.tier::int
  from fused fu
  join public.products p on p.id = fu.id
  left join public.vendor_profiles vp on vp.id = p.vendor_id
  left join public.subscription_plans sp on sp.id = vp.plan_id
  cross join lateral (
    select case
      when vp.plan_expires_at is not null and vp.plan_expires_at > now()
      then coalesce((sp.limits ->> 'search_boost_tier')::int, 0)
      else 0
    end as tier
  ) bt
  order by score desc, p.enquiries_count desc, p.views_count desc, fu.id
  limit coalesce(match_count, 40);
$$;

comment on function public.match_products(text, extensions.halfvec, int, double precision) is
  'Hybrid FTS + vector product search fused with RRF (k=60), weighted by the vendor plan search_boost_tier. Returns live products only.';

grant execute on function public.match_products(text, extensions.halfvec, int, double precision)
  to anon, authenticated;
