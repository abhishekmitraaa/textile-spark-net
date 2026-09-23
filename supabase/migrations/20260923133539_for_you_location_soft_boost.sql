-- For You: a soft location boost (Phase 5 of the My Profile brief, 2026-09-23).
--
-- A buyer's `buyer_profiles.city` / `state` now nudges products from the same place
-- up their For You ordering. It is a boost, never a filter, and it adds no OpenAI
-- call: it re-sorts rows the embedding ranking already returned.
--
-- ── The rules ────────────────────────────────────────────────────────────────
-- * ORDERING ONLY. For the vector tiers the sort key becomes
--     cosine distance - boost
--   with a boost of 0.05 for a same-city product and 0.02 for a same-state one (the
--   larger of the two applies, never both). The returned `distance` is still the raw
--   cosine distance, so what it means does not change.
-- * THE SAME ROWS. The candidate set is the pre-boost query, verbatim, as a CTE: the
--   same filter, the same `ORDER BY embedding <=> v_emb` (so products_embedding_idx
--   still serves it), and the same LIMIT. The boost only reorders inside it, so it can
--   never drop or add a row.
-- * SMALL. At 0.05 a same-city product can pass neighbours within 0.05 of it, but it
--   cannot jump a clearly better match. Measured for the one buyer with a city today
--   (demo-buyer, Mumbai), its four Mumbai products sit at distances 0.336 to 0.467 in a
--   0.20 to 0.57 spread.
-- * NO LOCATION, NO CHANGE, BY CONSTRUCTION. A buyer with neither city nor state set
--   runs the pre-boost query verbatim (its own branch), rather than relying on a zero
--   boost to give the same answer. A buyer whose city matches no candidate goes
--   through the boost branch with every boost 0, so it is ordered on the same keys as
--   before. Both cases were verified byte-identical against a pre-change baseline
--   (documentation/test.md, Phase 5).
-- * LOCATION IS RESOLVED THE WAY THE APP SHOWS IT (products.ts:
--   `p.location ?? vendor.city`). `products.location` is "City[, State]", so the part
--   before the first comma is the city and the part after it is the state, falling
--   back to vendor_profiles.city / state. Matching is trim + lower-case equality.
--   Nothing fuzzy: "Navi Mumbai" is not "Mumbai".
-- * THE POPULARITY TIER IS UNCHANGED. It has no distance, so there is no score for a
--   "small adjustment" to adjust, and putting location first there would make the
--   boost a hard sort.
-- * Unchanged, as the vector-DB ground rules require: SECURITY DEFINER, STABLE,
--   `search_path = public, extensions` (pgvector's `<=>` does not resolve without
--   `extensions`), the `auth.uid()` self-access guard, and the grants (CREATE OR
--   REPLACE keeps the ACL; checked below). buyer_taste_embedding() and
--   buyer_cold_start_embedding() are called exactly as before and not touched.
--
-- Today this is visible for exactly one of the 7 buyer profiles (demo-buyer, the only
-- one with a city). For the other six it is a no-op.

-- The definition this patches, read live before writing it.
do $pre$
begin
  if md5(pg_get_functiondef('public.for_you_products(uuid,integer)'::regprocedure))
     <> '93714de19d40e8555eca42f428d56c0e' then
    raise exception 'for_you_products() changed since it was read; re-read it before patching';
  end if;
end
$pre$;

CREATE OR REPLACE FUNCTION public.for_you_products(p_buyer_id uuid, match_count integer DEFAULT 20)
 RETURNS TABLE(id uuid, distance double precision, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_emb extensions.halfvec(1536);
  v_src text;
  -- Location soft boost (2026-09-23): subtracted from the distance for ORDERING
  -- only. See the header of migration for_you_location_soft_boost.
  c_city_boost  constant double precision := 0.05;
  c_state_boost constant double precision := 0.02;
  v_city  text;
  v_state text;
begin
  -- Same guard as match_vendor_rfqs: a buyer may only ask for their own feed.
  -- Without it any authenticated user could pass someone else's id and read
  -- their taste-ranked catalogue, which is their browsing history by proxy.
  -- auth.uid() is null for service_role, which is how the cron/worker path and
  -- direct SQL verification still work.
  if auth.uid() is not null and p_buyer_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_emb := public.buyer_taste_embedding(p_buyer_id);
  v_src := 'taste';

  if v_emb is null then
    v_emb := public.buyer_cold_start_embedding(p_buyer_id);
    v_src := 'cold_start';
  end if;

  -- The `exists` is not redundant with `v_emb is not null`. A taste vector is
  -- built from the buyer's history, which may point at products that are no
  -- longer live — so a non-null vector does not by itself guarantee there is
  -- anything rankable. Checking here, rather than after the fact, is what keeps
  -- the never-empty guarantee true without relying on FOUND/ROW_COUNT
  -- behaviour after RETURN QUERY.
  if v_emb is not null
     and exists (select 1 from public.products
                  where status = 'live' and embedding is not null) then

    select lower(nullif(trim(b.city), '')), lower(nullif(trim(b.state), ''))
      into v_city, v_state
      from public.buyer_profiles b
     where b.id = p_buyer_id;

    -- No location: the pre-boost query, verbatim. These buyers get exactly the
    -- old result by construction, not because a boost happens to be zero.
    if v_city is null and v_state is null then
      return query
        select p.id,
               (p.embedding <=> v_emb)::double precision,
               v_src
        from public.products p
        where p.status = 'live'
          and p.embedding is not null
        -- Bare `<=>` first so products_embedding_idx stays usable; the count
        -- columns are tiebreakers only and match today's ordering.
        order by p.embedding <=> v_emb,
                 p.enquiries_count desc, p.views_count desc, p.id
        limit match_count;
      return;
    end if;

    -- With a location: the same candidates (the query above, as a CTE, with the
    -- index-served ORDER BY and the same LIMIT), re-sorted by distance minus the
    -- boost. It reorders inside the set and never adds or drops a row.
    return query
      with candidates as (
        select p.id,
               (p.embedding <=> v_emb)::double precision as dist,
               p.enquiries_count,
               p.views_count,
               p.vendor_id,
               lower(nullif(trim(split_part(p.location, ',', 1)), '')) as loc_city,
               lower(nullif(trim(split_part(p.location, ',', 2)), '')) as loc_state
        from public.products p
        where p.status = 'live'
          and p.embedding is not null
        order by p.embedding <=> v_emb,
                 p.enquiries_count desc, p.views_count desc, p.id
        limit match_count
      )
      select c.id, c.dist, v_src
      from candidates c
      left join public.vendor_profiles v on v.id = c.vendor_id
      order by c.dist - case
                 when v_city is not null
                      and coalesce(c.loc_city, lower(nullif(trim(v.city), ''))) = v_city
                   then c_city_boost
                 when v_state is not null
                      and coalesce(c.loc_state, lower(nullif(trim(v.state), ''))) = v_state
                   then c_state_boost
                 else 0
               end,
               c.enquiries_count desc, c.views_count desc, c.id;
    return;
  end if;

  -- Tier 3. Distance is NULL rather than a sentinel number: there is no vector,
  -- so there is no distance, and 0 would read as "perfect match".
  return query
    select p.id,
           null::double precision,
           'popularity'::text
    from public.products p
    where p.status = 'live'
    order by p.enquiries_count desc, p.views_count desc, p.id
    limit match_count;
end $function$;

-- The ground rules still hold after the replace.
do $post$
declare
  f record;
begin
  select p.prosecdef, p.provolatile, p.proconfig,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
         has_function_privilege('service_role',  p.oid, 'EXECUTE') as svc_x,
         has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_x,
         position('raise exception ''forbidden''' in p.prosrc) > 0 as guarded
    into f
    from pg_proc p
   where p.oid = 'public.for_you_products(uuid,integer)'::regprocedure;

  if not f.prosecdef then raise exception 'for_you_products is no longer SECURITY DEFINER'; end if;
  if f.provolatile <> 's' then raise exception 'for_you_products is no longer STABLE'; end if;
  if f.proconfig is distinct from array['search_path=public, extensions'] then
    raise exception 'for_you_products search_path is %, expected public, extensions', f.proconfig;
  end if;
  if not f.auth_x or not f.svc_x or f.anon_x then
    raise exception 'for_you_products grants changed (authenticated %, service_role %, anon %)', f.auth_x, f.svc_x, f.anon_x;
  end if;
  if not f.guarded then raise exception 'for_you_products lost its auth.uid() self-access guard'; end if;
end
$post$;
