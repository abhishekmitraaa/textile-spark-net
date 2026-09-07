-- "For You" — the three-tier personalised feed (Phase 3).
--
-- Tier 1 taste vector -> tier 2 cold-start centroid -> tier 3 global popularity.
-- The contract that matters: THIS NEVER RETURNS AN EMPTY FEED for a catalogue
-- with any live product. Personalisation degrades, it does not disappear.
--
-- WHICH TIER ACTUALLY FIRES TODAY: all five buyers land on tier 3, because
-- products.embedding is 0/30 — OpenAI billing is still inactive (see
-- 20260907120300). Tier 1 and tier 2 are both unreachable until that queue
-- drains. They are verified structurally against synthetic vectors, not against
-- production data, and that distinction is recorded in the changelog.
--
-- `source` is returned rather than inferred by the caller. The frontend needs to
-- know whether it is showing real personalisation or a popularity leaderboard —
-- labelling a popularity feed "picked for you" would be a lie, and making the
-- client re-derive which tier ran would be a second source of truth.
create or replace function public.for_you_products(
  p_buyer_id  uuid,
  match_count int default 20
)
returns table (
  id       uuid,
  distance double precision,
  source   text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $fn$
declare
  v_emb extensions.halfvec(1536);
  v_src text;
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
end $fn$;

comment on function public.for_you_products(uuid, int) is
  'Personalised buyer feed: taste vector, else onboarding-preference centroid, else global popularity. Returns `source` so the caller can tell which tier ran. Never returns an empty feed while any live product exists.';

-- Buyers only; a signed-out visitor has no buyer id to pass. anon is
-- deliberately excluded, unlike related_products/search_products which are
-- genuinely public.
revoke all on function public.for_you_products(uuid, int) from public, anon;
grant execute on function public.for_you_products(uuid, int) to authenticated, service_role;
