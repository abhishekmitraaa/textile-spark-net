-- Scored RFQ <-> vendor fit, both directions (Phases 4 and 5).
--
-- What is being replaced: a boolean. fetchOpenRfqs intersected a paid vendor's
-- product category_ids against the RFQ's single category_id and sorted the hits
-- to the top. Two things about that are worth stating precisely, because only
-- one of them is a design flaw.
--
--   * The flaw: one category tag is the entire signal. An RFQ that says "180-200
--     GSM combed cotton, custom label, 500 units" and a vendor whose catalogue is
--     full of combed-cotton tees are invisible to each other unless someone filed
--     both under the same tag.
--   * NOT a flaw: the paywall. Free vendors see the plain pool, paid vendors get
--     ranking. That is how IndiaMART and Alibaba monetise lead access and it is
--     untouched here -- only the relevance computation underneath it changes.
--
-- -- Why the category signal reads products, not vendor_profiles.category --
-- Phase 3's spec proposed falling back to "the existing category-array
-- intersection using vendor_profiles.category". That column cannot serve: it
-- holds a business-TYPE label (its only value across all 7 vendors today is
-- 'Fabric Manufacturer'), it is text[] rather than a categories FK, and it is
-- null for 5 of the 7 vendors. Intersecting it with rfqs.category_id (a uuid)
-- is not a comparison that can be made. The vendor's own live products'
-- category_ids are the real signal -- which is what the boolean being replaced
-- already read, and the part of it worth keeping.
--
-- -- Weighting --
-- score = 0.7 * similarity + 0.3 * category_match. Deliberately blunt. With 3
-- open RFQs and 7 vendors there is no statistical basis for anything more
-- precise, and a number that looks tuned invites trust it has not earned.

-- ---------------------------------------------------------------
-- Direction 1: given an RFQ, which vendors fit.
-- ---------------------------------------------------------------
-- The vector half is written as a genuine nearest-neighbour scan -- ORDER BY
-- <=> with a LIMIT, against a scalar subquery so the probe vector is a constant
-- the planner can push into vendor_profiles_catalog_embedding_idx -- rather than
-- a per-vendor similarity loop. At 7 vendors Postgres will seqscan regardless;
-- the shape matters for when it is not 7.
--
-- The FULL OUTER JOIN is the null-catalog fallback from Phase 3.3. A vendor with
-- no live products has no catalog vector, cannot appear in the vector half, and
-- must still be reachable through exact category overlap. They surface with
-- similarity NULL and score 0.3 -- ranked below any real semantic match, which
-- is the honest position for a vendor we know nothing about yet.
create or replace function public.match_rfq_vendors(
  p_rfq_id    uuid,
  match_count int default 20
)
returns table (
  vendor_id      uuid,
  similarity     double precision,
  category_match boolean,
  score          double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with rfq as (
    select r.id, r.embedding, r.category_id
    from public.rfqs r
    where r.id = p_rfq_id
  ),
  vendor_cats as (
    select p.vendor_id, array_agg(distinct p.category_id) as cat_ids
    from public.products p
    where p.status = 'live' and p.category_id is not null
    group by p.vendor_id
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
    select vc.vendor_id
    from vendor_cats vc, rfq r
    where r.category_id is not null
      and r.category_id = any(vc.cat_ids)
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
$fn$;

comment on function public.match_rfq_vendors(uuid, int) is
  'Ranks vendors against one RFQ: 0.7 * cosine(rfq.embedding, vendor_profiles.catalog_embedding) + 0.3 * live-product category overlap. Vendors with no catalog vector fall back to category overlap alone.';

-- Engine, not entry point -- the same call this codebase made for match_products
-- in 20260906200000. Nothing client-side calls this direction yet, and leaving
-- it executable by `authenticated` would hand any vendor a way to enumerate a
-- competitor's fit against every open RFQ. Grant it outward when a buyer- or
-- admin-facing surface actually needs it.
revoke all on function public.match_rfq_vendors(uuid, int) from public, anon, authenticated;
grant execute on function public.match_rfq_vendors(uuid, int) to service_role;


-- ---------------------------------------------------------------
-- Direction 2: given a vendor, score the open lead pool. This is what the
-- Leads UI calls (Phase 5).
-- ---------------------------------------------------------------
-- No nearest-neighbour LIMIT on this side, on purpose: the vendor's feed lists
-- EVERY open RFQ, scored -- a lead must never vanish because it ranked 21st. The
-- pool is the small side of this relation (3 rows today, and bounded by how many
-- requirements are open at once), so scoring all of it is the cheaper plan too.
create or replace function public.match_vendor_rfqs(
  p_vendor_id uuid,
  match_count int default 200
)
returns table (
  rfq_id         uuid,
  similarity     double precision,
  category_match boolean,
  score          double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
begin
  -- SECURITY DEFINER bypasses RLS, so without this any authenticated vendor
  -- could pass a competitor's id and read their scored feed. service_role
  -- (auth.uid() null -- the verification queries and any future server-side job)
  -- is exempt; anon never reaches here, having no grant.
  if auth.uid() is not null and p_vendor_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with v as (
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
end $fn$;

comment on function public.match_vendor_rfqs(uuid, int) is
  'Scores the open RFQ pool for one vendor (the caller, unless service_role). Same 0.7/0.3 weighting as match_rfq_vendors. Returns open-marketplace RFQs only: targeted requests are excluded.';

revoke all on function public.match_vendor_rfqs(uuid, int) from public, anon;
grant execute on function public.match_vendor_rfqs(uuid, int) to authenticated, service_role;
