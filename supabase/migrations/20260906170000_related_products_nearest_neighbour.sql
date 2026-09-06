-- "You might also like" — nearest-neighbour over the product embedding, with a
-- same-category fallback (Phase 3, consumed by useYouMightLike in Phase 4).
--
-- Replaces a category-id intersection, which could only ever answer "same
-- bucket" and had no notion of similarity inside that bucket. The fallback is
-- not a hack: a product whose embedding hasn't been generated yet (queue not
-- drained, or a listing with no text at all) still needs a strip, and silently
-- returning nothing would read as a broken section rather than a sparse one.
--
-- The two branches are mutually exclusive by construction — one requires the
-- anchor's embedding to be non-null, the other requires it to be null — so the
-- UNION ALL yields exactly one of them and the caller needs no branching.
create or replace function public.related_products(
  p_id        uuid,
  match_count int default 10
)
returns table (
  id          uuid,
  distance    double precision,
  is_fallback boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with cur as (
    -- The anchor is looked up without a status filter: it is the reference
    -- point, never a result. Only the rows returned below are status-gated.
    select p.embedding, p.category_id from public.products p where p.id = p_id
  ),
  vec as (
    select p.id,
           (p.embedding <=> (select embedding from cur))::double precision as distance,
           false as is_fallback
    from public.products p
    where p.status = 'live'
      and p.id <> p_id
      and p.embedding is not null
      and (select embedding from cur) is not null
    order by p.embedding <=> (select embedding from cur),
             p.enquiries_count desc, p.views_count desc, p.id
    limit match_count
  ),
  fb as (
    select p.id,
           null::double precision as distance,
           true as is_fallback
    from public.products p
    where p.status = 'live'
      and p.id <> p_id
      and (select embedding from cur) is null
      and p.category_id is not null
      and p.category_id = (select category_id from cur)
    order by p.enquiries_count desc, p.views_count desc, p.id
    limit match_count
  )
  select * from vec
  union all
  select * from fb;
$$;

comment on function public.related_products(uuid, int) is
  'Nearest-neighbour related products by embedding cosine distance, falling back to same-category ordering when the anchor has no embedding. Live products only.';

grant execute on function public.related_products(uuid, int) to anon, authenticated;
