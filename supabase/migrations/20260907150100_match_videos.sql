-- "Similar reels" — nearest-neighbour over product_videos.embedding (Phase 4).
--
-- READ THIS BEFORE WIRING IT TO ANYTHING. This function is a capability, not a
-- shipped feature. product_videos holds one live row, so today it returns zero
-- rows for the only input that exists — correctly, since a reel is never its own
-- neighbour. It becomes useful somewhere north of a dozen live reels.
--
-- WHAT THIS MUST NOT REPLACE:
--   * The buyer feed's default ordering. useVideoCloseUps sorts by views_count
--     desc and stays that way. A static leaderboard is an honest answer to "what
--     should I watch"; a content-similarity feed over one video would show an
--     empty rail, which is strictly worse.
--   * rankVideoCloseUps / interestedCategories (VideoCloseUpsPage.tsx,
--     NewArrivals.tsx). That in-session bookmark signal is real, separate, and
--     untouched by this work.
-- Ranking the primary feed by a per-user signal is Master Prompt 4's problem,
-- not this function's.
--
-- Deliberately NO fallback branch, unlike related_products. That one has a
-- same-category fallback because a product page must always render its strip,
-- and a sparse strip beats a missing section. A "more like this" rail is
-- optional chrome: when there is no embedding, or no second reel, returning
-- zero rows tells the caller to render nothing at all. Padding it with
-- same-category reels would put the word "similar" over rows nothing measured.
create or replace function public.match_videos(
  p_video_id  uuid,
  match_count int default 10
)
returns table (
  id       uuid,
  distance double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with cur as (
    -- The anchor is looked up without a status filter: it is the reference
    -- point, never a result. Only the rows returned below are status-gated.
    -- Same reasoning as related_products.
    select v.embedding from public.product_videos v where v.id = p_video_id
  )
  select v.id,
         (v.embedding <=> (select embedding from cur))::double precision as distance
  from public.product_videos v
  where v.status = 'live'
    and v.id <> p_video_id
    and v.embedding is not null
    and (select embedding from cur) is not null
  -- Ordering by the bare `<=>` against a scalar subquery is what keeps
  -- product_videos_embedding_idx usable; views_count and id are tiebreakers
  -- only, so they cannot pull the plan off the HNSW index.
  order by v.embedding <=> (select embedding from cur),
           v.views_count desc, v.id
  limit match_count;
$fn$;

comment on function public.match_videos(uuid, int) is
  'Nearest-neighbour live reels by embedding cosine distance, excluding the anchor. Returns zero rows when the anchor has no embedding — callers should render no rail rather than falling back to an unrelated ordering.';

-- Buyer-facing, so anon and authenticated, matching related_products and
-- search_products. SECURITY DEFINER with an internal status = 'live' filter is
-- the only thing keeping reels in moderation out of the result, exactly as in
-- those two — that filter is load-bearing, not cosmetic.
grant execute on function public.match_videos(uuid, int) to anon, authenticated;
