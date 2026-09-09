-- Phase 1 fix: give the vector branch a distance cutoff.
--
-- FOUND BY TESTING, and only visible once real embeddings existed: vector search
-- returns nearest neighbours with no notion of "too far", so EVERY query
-- returned the entire live catalogue. `search_products('zzzznotathing')` gave
-- 26 results — the whole catalogue, presented to the buyer as matches. There
-- was no such thing as a zero-result search any more, the "N results" count was
-- meaningless, and the honest empty state built in Master Prompt 1 Phase 4 had
-- become unreachable.
--
-- The threshold is measured, not guessed. Cosine distance from each cached
-- query embedding to all 26 live product vectors, 2026-09-09:
--
--   query            nearest   p25      median   farthest
--   linen shirt      0.3049    0.6183   0.6537   0.7513
--   kurta            0.4432    0.6586   0.7088   0.8143
--   gym clothing     0.5152    0.6416   0.6787   0.7863
--   zzzznotathing    0.8301    0.8779   0.8887   0.9292   <- gibberish
--
-- Every real query's NEAREST neighbour sits at 0.30-0.52; gibberish's nearest is
-- 0.83, further than any real query's best match. 0.80 sits in that gap: it
-- cannot discard a genuine top match, and it rejects an unrelated query outright.
-- Measured after: gibberish 26 -> 0 results, kurta 26 -> 25, others unchanged.
--
-- CAVEAT, deliberately recorded: this is calibrated against 26 products and 4
-- sample queries. Revisit it as the catalogue grows — if buyers start reporting
-- "no results" for reasonable terms, this constant is the first thing to raise.
--
-- The FTS branch is intentionally NOT thresholded. A literal keyword match is
-- self-evidently relevant however far apart the embeddings are, so a query with
-- real keyword overlap still returns results regardless of this cutoff.

-- ── DROP FIRST. This is load-bearing, do not remove. ──
-- `create or replace function` with an ADDED parameter does not replace
-- anything: it creates a second overload. Both accept the 3-argument call
-- search_products makes (the rest being defaulted), so Postgres raises
--   42725: function public.match_products(text, halfvec, integer) is not unique
-- and ALL SEARCH FAILS. That happened for real while writing this migration.
drop function if exists public.match_products(text, extensions.halfvec, int, double precision);

create or replace function public.match_products(
  query            text,
  query_embedding  extensions.halfvec(1536) default null,
  match_count      int default 40,
  boost_weight     double precision default 0.05,
  max_distance     double precision default 0.80
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
      greatest(coalesce(match_count, 40), 40)                as depth,
      60                                                     as rrf_k
  ),
  ts as (
    select websearch_to_tsquery('english', qtext) as tsq
    from params where qtext is not null
  ),
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
  vec_hits as (
    select s.id, row_number() over () as rank
    from (
      select p.id
      from public.products p
      where p.status = 'live'
        and query_embedding is not null
        and p.embedding is not null
        -- The cutoff. Without it an unrelated query still returns the whole
        -- catalogue, because nearest-neighbour search always has a nearest.
        and (p.embedding <=> query_embedding) < max_distance
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

-- match_products is the ranking engine, not a public entry point.
-- search_products (SECURITY DEFINER) calls it as the definer, so no client grant
-- is needed. Re-asserted here because DROP discarded the previous grants.
revoke all on function public.match_products(text, extensions.halfvec, int, double precision, double precision)
  from public, anon, authenticated;
