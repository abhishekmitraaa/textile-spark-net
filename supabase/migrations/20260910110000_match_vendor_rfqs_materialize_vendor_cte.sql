-- match_vendor_rfqs: stop recomputing the vendor's category set once per RFQ.
--
-- Found by the Master Prompt 6 scale pass, not by reading the code — at
-- production volume today (4 RFQs, 33 products) the defect is invisible.
--
-- ── What the plan showed ───────────────────────────────────────────────────
-- Against 2,004 RFQs and 10,033 products, one call took 1,991 ms. The cost was
-- not the vector maths and not the composite sort (a top-N heapsort over 2,003
-- rows costs microseconds). It was this, from EXPLAIN (ANALYZE, BUFFERS):
--
--   SubPlan 1
--     ->  Aggregate (actual time=0.959..0.959 rows=1 loops=2003)
--           Buffers: shared hit=1135701
--           ->  Bitmap Heap Scan on products p (rows=1032 loops=2003)
--
-- loops=2003. The `v` CTE holds the vendor's live category ids — one row, the
-- same value for every RFQ being scored. But the planner inlined the CTE and
-- pulled the correlated subquery into the nested loop, so it re-ran the whole
-- per-vendor product aggregate once for EVERY RFQ in the pool: 2,003 x 1,032 =
-- ~2.07 million product row reads to answer one call. That subplan alone
-- accounted for 1,135,701 of the query's 1,155,858 buffer hits — 98%.
--
-- The work is quadratic in exactly the two dimensions this marketplace is
-- expected to grow: (open RFQs) x (that vendor's live listings). A vendor with
-- a large catalogue browsing their lead feed is the worst case, and it is also
-- the most valuable vendor on the platform.
--
-- ── The fix ────────────────────────────────────────────────────────────────
-- `with v as materialized (...)`. That is the entire change. MATERIALIZED
-- forces the CTE to be evaluated once into a working table instead of being
-- inlined, which is the correct semantics here — `v` is a single constant row,
-- and re-deriving it per outer row can never produce a different answer.
--
-- Measured on the same synthetic 2,004-RFQ / 10,033-product dataset:
--
--                       before          after
--   subplan loops       2003            1
--   buffers             1,155,858       20,724      (56x fewer)
--   execution           1,991 ms        38 ms       (52x faster)
--
-- Nothing else changes: same signature, same columns, same ordering, same
-- scoring weights, same authz guard, same row set. This is purely a plan fix.
--
-- Signature is repeated EXACTLY, including the default. `create or replace`
-- with an altered parameter list creates a second overload rather than
-- replacing, which took production search down for two minutes during Master
-- Prompt 5 — the argument list below must not drift.

create or replace function public.match_vendor_rfqs(
  p_vendor_id uuid,
  match_count integer default 200
)
returns table(rfq_id uuid, similarity double precision, category_match boolean, score double precision)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  -- SECURITY DEFINER bypasses RLS, so without this any authenticated vendor
  -- could pass a competitor's id and read their scored feed. service_role
  -- (auth.uid() null -- the verification queries and any future server-side job)
  -- is exempt; anon never reaches here, having no grant.
  if auth.uid() is not null and p_vendor_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  -- MATERIALIZED is load-bearing for performance, not a style choice. See the
  -- header: without it this subquery is re-executed once per candidate RFQ.
  with v as materialized (
    select vp.catalog_embedding as emb,
           (select array_agg(distinct p.category_id)
              from public.products p
             where p.vendor_id = vp.id
               and p.status = 'live'
               and p.category_id is not null) as cat_ids
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
  ),
  pool as (
    -- Load-bearing, exactly as status = 'live' is inside match_products:
    -- SECURITY DEFINER bypasses the rfqs_select policy, and `vendor_id is null`
    -- is the only thing keeping other vendors' TARGETED quote requests out of
    -- this shared feed. Do not remove it to "simplify" the query.
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.status = 'active'
      and r.vendor_id is null
  ),
  scored as (
    select
      pool.id as rfq_id,
      case when v.emb is not null and pool.embedding is not null
           then (1 - (pool.embedding <=> v.emb))::double precision
      end as similarity,
      coalesce(pool.category_id is not null
                 and pool.category_id = any(v.cat_ids), false) as category_match
    from pool cross join v
  )
  select
    s.rfq_id,
    s.similarity,
    s.category_match,
    (0.7 * coalesce(s.similarity, 0)
       + 0.3 * s.category_match::int)::double precision as score
  from scored s
  order by score desc, s.similarity desc nulls last, s.rfq_id
  limit coalesce(match_count, 200);
end $function$;

comment on function public.match_vendor_rfqs(uuid, integer) is
  'Scored open-RFQ feed for one vendor. 0.7 * cosine similarity + 0.3 * category match. The `v` CTE MUST stay MATERIALIZED — inlining it re-runs the per-vendor category aggregate once per RFQ (measured 52x slowdown at 2k RFQs).';

-- Grants are preserved by create-or-replace, but re-assert them so a future
-- drop-and-recreate cannot silently widen the surface, and so this file alone
-- describes the intended end state.
revoke execute on function public.match_vendor_rfqs(uuid, integer) from public, anon;
grant execute on function public.match_vendor_rfqs(uuid, integer) to authenticated;
