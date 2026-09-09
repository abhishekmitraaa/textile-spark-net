-- match_rfq_vendors: stop aggregating the entire live catalogue on every call.
--
-- Found by the Master Prompt 6 scale pass. EXPLAIN (ANALYZE, BUFFERS) against
-- 510 vendors / 10,033 products:
--
--   ->  Sort (actual time=14.892..15.611 rows=10026 loops=1)
--         Sort Key: p.vendor_id, p.category_id
--         Sort Method: quicksort  Memory: 854kB
--         ->  Seq Scan on products p (rows=10026)
--
-- 15.6 ms of a 26 ms call, spent building `vendor_cats` — a per-vendor array of
-- distinct live category ids, for EVERY vendor on the platform — in order to
-- then ask one question of it: "which vendors carry this RFQ's category?".
--
-- The work is O(total live listings) per call and is entirely independent of
-- the RFQ being matched. At 100k listings it is ~150 ms of pure overhead on a
-- query that should be a single index lookup; at 1M it is seconds. Nothing
-- about it is cacheable across calls as written.
--
-- ── The rewrite ────────────────────────────────────────────────────────────
-- `cat` becomes a direct lookup:
--
--   select distinct p.vendor_id
--   from products p, rfq r
--   where p.status = 'live' and p.category_id = r.category_id
--
-- which is exactly what the aggregate form computed, reached without building
-- the array for every other vendor first. Proven equivalent on live data before
-- applying — both forms returned the same 10 vendors, with zero rows in either
-- direction of an EXCEPT in both directions.
--
-- `products.category_id` had NO index at all (products carried only pkey,
-- embedding, fts, trgm, status and vendor_id), so the lookup needs one. The
-- index is partial on status = 'live' because every caller of it — this
-- function, and the category filters in the buyer-facing feeds — only ever asks
-- about live listings, which keeps it small and keeps dead draft/rejected rows
-- out of it.
--
-- ── What is NOT changed, deliberately ──────────────────────────────────────
-- The `vec` CTE still resolves its query vector through `(select embedding from
-- rfq)`, which the planner materialises as an InitPlan rather than a constant,
-- so `vendor_profiles_catalog_embedding_idx` (HNSW) is NOT used — measured:
--
--   ->  Seq Scan on vendor_profiles v (actual time=0.016..0.281 rows=506)
--         Sort Method: top-N heapsort  Memory: 27kB
--
-- At 506 vendors that scan costs 0.28 ms and a seq scan is genuinely the
-- cheaper plan, so this is the planner being right, not a defect. It is
-- recorded here because the crossover is real: the index only earns its keep in
-- the tens of thousands of vendors, and at that point this CTE needs revisiting
-- with a measurement, not a guess. Left alone rather than forced with a hint
-- that would pessimise today's plan.

create index if not exists products_live_category_idx
  on public.products (category_id) where status = 'live';

comment on index public.products_live_category_idx is
  'Supports the RFQ->vendor category lookup in match_rfq_vendors and category filtering on live listings. Partial: no caller asks about non-live rows.';

-- Signature repeated EXACTLY, defaults included. `create or replace` with an
-- altered parameter list creates a second overload rather than replacing, which
-- took production search down for two minutes during Master Prompt 5.
create or replace function public.match_rfq_vendors(
  p_rfq_id uuid,
  match_count integer default 20
)
returns table(vendor_id uuid, similarity double precision, category_match boolean, score double precision)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with rfq as (
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.id = p_rfq_id
  ),
  vec as (
    select v.id as vendor_id,
           (1 - (v.catalog_embedding <=> (select embedding from rfq)))::double precision as similarity
    from public.vendor_profiles v
    where v.catalog_embedding is not null
      and (select embedding from rfq) is not null
    order by v.catalog_embedding <=> (select embedding from rfq)
    limit greatest(coalesce(match_count, 20), 20)
  ),
  cat as (
    -- Direct lookup against products_live_category_idx. Replaces a full
    -- aggregate of every vendor's category set; proven to return an identical
    -- vendor list. See the header.
    select distinct p.vendor_id
    from public.products p, rfq r
    where p.status = 'live'
      and r.category_id is not null
      and p.category_id = r.category_id
  )
  select
    coalesce(vec.vendor_id, cat.vendor_id)                          as vendor_id,
    vec.similarity                                                  as similarity,
    (cat.vendor_id is not null)                                     as category_match,
    (0.7 * coalesce(vec.similarity, 0)
       + 0.3 * (cat.vendor_id is not null)::int)::double precision  as score
  from vec
  full outer join cat on cat.vendor_id = vec.vendor_id
  order by score desc, similarity desc nulls last, 1
  limit coalesce(match_count, 20);
$function$;

comment on function public.match_rfq_vendors(uuid, integer) is
  'Scored vendor shortlist for one RFQ. 0.7 * cosine similarity + 0.3 * category match. The `cat` CTE must stay a direct category lookup — the earlier per-vendor aggregate form scanned the whole live catalogue on every call.';

revoke execute on function public.match_rfq_vendors(uuid, integer) from public, anon;
grant execute on function public.match_rfq_vendors(uuid, integer) to authenticated;
