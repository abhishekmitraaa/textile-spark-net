-- Autocomplete source for the search box (Phase 4.1).
--
-- Replaces two hardcoded arrays in Search.tsx: SEARCH_SUGGESTIONS (invented
-- search-volume numbers like "Handbags For Clothes  2,348,215") and
-- BRAND_SUGGESTIONS (real trademarked brands — H&M, Zara, Levi's — that are not
-- vendors on this marketplace, with invented follower counts). Every number
-- below is counted from a real row.
--
-- Deliberately keyword-only: this fires per keystroke, and an OpenAI round-trip
-- per character is the wrong trade. Semantic matching belongs on the submitted
-- search (search_products), not on the dropdown.
create or replace function public.search_suggestions(
  q           text,
  max_results int default 5
)
returns table (
  kind       text,
  label      text,
  ref_id     uuid,
  count_hint int,
  verified   boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with n as (select public.normalise_search_query(q) as qn)
  -- Categories that actually contain live products. count_hint is the real
  -- number of listings a buyer will land on, not a fabricated search volume.
  (
    select 'category'::text, c.category_name, c.cid, c.n_products, null::boolean
    from (
      -- min() has no uuid variant; any representative id for the name will do.
      select p.category_name,
             (array_agg(p.category_id order by p.category_id))[1] as cid,
             count(*)::int as n_products
      from public.products p, n
      where p.status = 'live'
        and p.category_name is not null
        and n.qn is not null
        and p.category_name ilike '%' || n.qn || '%'
      group by p.category_name
    ) c
    order by c.n_products desc, c.category_name
    limit max_results
  )
  union all
  -- Individual live listings, most-enquired first.
  (
    select 'product'::text, p.name, p.id, p.enquiries_count, null::boolean
    from public.products p, n
    where p.status = 'live'
      and n.qn is not null
      and p.name ilike '%' || n.qn || '%'
    order by p.enquiries_count desc, p.views_count desc, p.name
    limit max_results
  )
  union all
  -- Real vendor storefronts. count_hint is the real follower count.
  (
    select 'vendor'::text, v.brand_name, v.id, v.followers, v.is_verified
    from (
      select vp.id, vp.brand_name, vp.is_verified,
             (select count(*)::int from public.follows f where f.vendor_id = vp.id) as followers
      from public.vendor_profiles vp, n
      where n.qn is not null
        and vp.brand_name is not null
        and vp.brand_name ilike '%' || n.qn || '%'
    ) v
    order by v.followers desc, v.brand_name
    limit max_results
  );
$$;

comment on function public.search_suggestions(text, int) is
  'Keyword autocomplete over real categories (with live product counts), live product names, and vendor storefronts (with real follower counts).';

grant execute on function public.search_suggestions(text, int) to anon, authenticated;
