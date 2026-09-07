-- Per-buyer taste vector + cold-start fallback (Phases 1 and 2).
--
-- COMPUTED ON DEMAND, NOT MATERIALIZED, deliberately. With 3 buyers holding any
-- history there is no performance case for a stored buyer_profiles.taste_embedding
-- plus a refresh schedule, and a stored vector buys staleness bugs. Everything
-- below is shaped so that materializing later is a query-plan change, not a
-- rewrite: for_you_products calls buyer_taste_embedding() as an opaque scalar,
-- so swapping its body for `select taste_embedding from buyer_profiles ...`
-- changes nothing above it.

-- ── Scalar multiply, which pgvector does not ship ──
-- The brief's `sum(embedding * w) / nullif(sum(w), 0)` cannot compile: pgvector
-- 0.8.2 defines only halfvec*halfvec (ELEMENT-WISE), halfvec+halfvec and
-- halfvec-halfvec. There is no halfvec*float8 and no halfvec/float8 operator —
-- verified against pg_operator on this database before writing this.
--
-- sum(halfvec) and avg(halfvec) DO exist, so the aggregate half of the brief is
-- fine; only the scaling needed a workaround. Multiplying element-wise by a
-- constant-filled vector is the idiomatic one, and it is exact rather than an
-- approximation.
--
-- STRICT so a null weight (or a null vector) short-circuits to null instead of
-- array_fill building an array of NULLs, which the ::vector cast rejects
-- outright. That is what makes the `1.0 / nullif(sum(w), 0)` divide-by-zero
-- guard below behave as the brief intended.
create or replace function public.halfvec_scale(v extensions.halfvec, k double precision)
returns extensions.halfvec
language sql immutable strict parallel safe
set search_path = pg_catalog, public, extensions
as $fn$
  select v * (array_fill(k::real,
                array[extensions.vector_dims(v::extensions.vector)]
              )::extensions.vector)::extensions.halfvec;
$fn$;

comment on function public.halfvec_scale(extensions.halfvec, double precision) is
  'Multiply a halfvec by a scalar. pgvector has no halfvec*float8 operator, so this multiplies element-wise by a constant-filled vector of the same dimension.';

-- ── The taste vector ──
-- Recency-weighted mean of the embeddings of everything this buyer has engaged
-- with. Three signals, weighted by how much intent each one actually carries:
-- a view is 1, a save is 3, and a product-targeted RFQ is 5 — the strongest
-- signal available, since the buyer wrote to a vendor about that specific item.
--
-- Decay is a ~30-day half-life: exp(-0.023 * days) puts a 60-day-old view at
-- 0.2516 of a fresh one, i.e. the quarter-weight the brief specifies.
--
-- The final divide by sum(w) is kept even though cosine distance is
-- scale-invariant and ranking would be identical without it. It costs one extra
-- scale and it makes the return value a true weighted mean — which matters the
-- moment this is materialized (Phase 5) and something other than `<=>` reads it.
--
-- SECURITY DEFINER: reads recently_viewed / saved_items / rfqs, all of which are
-- RLS-scoped to their owner. The caller gate lives in for_you_products, which is
-- the only thing meant to call this — hence the revokes at the bottom.
create or replace function public.buyer_taste_embedding(p_buyer_id uuid)
returns extensions.halfvec(1536)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with signals as (
    select product_id, 1.0::float8 as weight, viewed_at as ts
      from public.recently_viewed where buyer_id = p_buyer_id
    union all
    select product_id, 3.0::float8, created_at
      from public.saved_items where buyer_id = p_buyer_id
    union all
    select product_id, 5.0::float8, created_at
      from public.rfqs where buyer_id = p_buyer_id and product_id is not null
  ),
  weighted as (
    select p.embedding as emb,
           s.weight * exp(-0.023 * extract(epoch from (now() - s.ts)) / 86400) as w
      from signals s
      join public.products p on p.id = s.product_id
     where p.embedding is not null
  )
  -- No status filter on the joined product: a buyer's history is a statement
  -- about their taste even if the item has since gone off-sale. What gets
  -- RANKED is status-gated (for_you_products); what the taste is LEARNED from
  -- need not be.
  select public.halfvec_scale(
           sum(public.halfvec_scale(emb, w)),
           1.0 / nullif(sum(w), 0)
         )::extensions.halfvec(1536)
    from weighted;
$fn$;

comment on function public.buyer_taste_embedding(uuid) is
  'Recency-weighted mean of the embeddings a buyer has viewed (1x), saved (3x) or sent a product-targeted RFQ about (5x). ~30-day half-life. NULL when the buyer has no history whose products carry an embedding.';

-- ── Cold start ──
-- Centroid of the live catalogue in the categories the buyer picked at
-- onboarding. Reads pref_category_map rather than any name list, so there is
-- exactly one definition of "which categories does preference X mean" — see
-- that migration for why the TypeScript map could not be used directly.
create or replace function public.buyer_cold_start_embedding(p_buyer_id uuid)
returns extensions.halfvec(1536)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select avg(pr.embedding)::extensions.halfvec(1536)
  from public.buyer_profiles bp
  cross join lateral unnest(bp.preferred_categories) as pref(pref_id)
  join public.pref_category_map m on m.pref_id = pref.pref_id
  join public.products pr on pr.category_id = m.category_id
  where bp.id = p_buyer_id
    and pr.status = 'live'
    and pr.embedding is not null;
$fn$;

comment on function public.buyer_cold_start_embedding(uuid) is
  'Centroid of live products in the buyer''s onboarding-selected categories, resolved through pref_category_map. NULL when the buyer set no preferences, or none of them map to a category holding an embedded live product.';

-- Neither of these is a public endpoint: both take a buyer id, and returning
-- another buyer's taste vector would leak their browsing history. Only
-- for_you_products (SECURITY DEFINER, with an auth.uid() guard) is meant to
-- call them, and it does so as the definer.
revoke all on function public.halfvec_scale(extensions.halfvec, double precision) from public, anon, authenticated;
revoke all on function public.buyer_taste_embedding(uuid)                         from public, anon, authenticated;
revoke all on function public.buyer_cold_start_embedding(uuid)                    from public, anon, authenticated;
