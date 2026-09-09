-- Where a vendor's buyer interest comes from, as aggregates only.
--
-- SHAPE IS COPIED FROM ad_category_benchmarks ON PURPOSE: same
-- `(v uuid default auth.uid())` signature, same self-or-admin guard, same
-- `returns jsonb` / `jsonb_build_object` envelope, same STABLE SECURITY DEFINER
-- + `search_path = public`. That function is this project's established pattern
-- for "let a vendor see an aggregate over rows they cannot read individually",
-- and this is the same problem with a different grouping key.
--
-- WHY A FUNCTION AND NOT A POLICY. The vendor needs counts per city; they must
-- never gain read access to `buyer_profiles`. Widening that table's RLS — even
-- to "rows of buyers who viewed my products" — would hand every vendor a
-- queryable list of their buyers' home cities joined to names and companies.
-- SECURITY DEFINER keeps the join server-side and returns only tallies, so
-- `buyer_profiles` and `profiles` RLS are UNCHANGED by this migration. That is
-- asserted by scripts/vendor-buyer-geography-check.mjs, not merely intended.
--
-- WHICH EVENTS COUNT. product_view, profile_view and search_click only —
-- buyer-INITIATED interest. `ad_impression` is deliberately excluded: an
-- impression is the platform deciding to render something, not a buyer
-- expressing interest, and counting it would let ad spend inflate a map that is
-- supposed to answer "where is demand".
--
-- THE k-ANONYMITY RULE IS THE POINT, NOT A NICETY. A vendor with two regular
-- buyers in one small town could otherwise identify both from a map with a "2"
-- on it. Any bucket backed by fewer than `min_viewers` distinct viewer_ids is
-- folded into an "other" aggregate that names no place.
--
-- ONE STATEMENT, NO TEMP TABLE. An earlier draft materialised the joined rows
-- into a temp table. That is wrong here twice over: a `STABLE` function must not
-- perform DDL, and Supabase pools connections through PgBouncer, so a temp table
-- can outlive its request and collide with a concurrent call on the same backend.
-- The CTEs below are shared by every scalar subquery in the final select, which
-- gets the same single-pass behaviour with none of that risk.
--
-- Applied 2026-09-09.

create or replace function public.vendor_buyer_geography(
  v uuid default auth.uid(),
  p_days int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  -- Minimum distinct viewers before a place may be named. Changing this changes
  -- a privacy guarantee, not a display preference.
  min_viewers constant int := 3;

  vid    uuid := coalesce(v, auth.uid());
  -- Clamped: p_days arrives from a client and feeds an index range scan.
  days   int  := greatest(1, least(coalesce(p_days, 30), 365));
  cutoff timestamptz;
  result jsonb;
begin
  if vid is null then return null; end if;

  -- coalesce() is load-bearing, not defensive noise. With an unauthenticated
  -- caller `auth.uid()` is NULL, so `vid = auth.uid()` is NULL, and
  -- `not (NULL or false)` is NULL — which `if` treats as not-true, so a bare
  -- `if not (...) then return null` FALLS THROUGH and hands the caller real
  -- data. Verified against this database before the coalesce was added: called
  -- with an explicit `v` and no JWT, the function returned a full result.
  -- NOTE: ad_category_benchmarks, which this is modelled on, still has that
  -- shape AND its default PUBLIC execute grant. Low impact there (its output is
  -- anonymised peer aggregates) but it is the same hole — flagged, not silently
  -- changed here, because CompetitorAds.tsx depends on it.
  if not (coalesce(vid = auth.uid(), false) or coalesce(public.is_admin(), false)) then
    return null;
  end if;

  cutoff := now() - make_interval(days => days);

  with base as (
    -- LEFT join so signed-out traffic (viewer_id null) and buyers who never
    -- supplied a location still reach the coverage totals rather than silently
    -- vanishing. A map that quietly drops 80% of its input is exactly the
    -- failure this analytics work exists to remove.
    select
      e.viewer_id,
      nullif(btrim(b.city), '')  as city,
      nullif(btrim(b.state), '') as state
    from public.engagement_events e
    left join public.buyer_profiles b on b.id = e.viewer_id
    where e.vendor_id = vid
      and e.created_at > cutoff
      and e.event_type in ('product_view', 'profile_view', 'search_click')
  ),
  city_groups as (
    select city, state, count(*)::int as events, count(distinct viewer_id)::int as viewers
    from base
    where city is not null
    group by city, state
  ),
  state_groups as (
    -- Aggregated here rather than summed from `city_groups` on the client,
    -- because the threshold has to apply at the level being displayed. A state
    -- with five viewers spread over three small cities is safe to name even
    -- though none of its cities is; rolling up the already-censored city list
    -- would discard that for no privacy gain.
    select state, count(*)::int as events, count(distinct viewer_id)::int as viewers
    from base
    where state is not null
    group by state
  )
  select jsonb_build_object(
    -- has_data is about the WINDOW, not about location coverage: zero events is
    -- "nobody visited", which reads differently from "people visited but we know
    -- where none of them are". The UI must keep those two apart.
    'has_data', (select count(*) from base) > 0,
    'window_days', days,
    'min_viewers', min_viewers,

    'cities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'city', city, 'state', state, 'events', events, 'viewers', viewers
             ) order by events desc, city)
      from city_groups where viewers >= min_viewers
    ), '[]'::jsonb),

    'states', coalesce((
      select jsonb_agg(jsonb_build_object(
               'state', state, 'events', events, 'viewers', viewers
             ) order by events desc, state)
      from state_groups where viewers >= min_viewers
    ), '[]'::jsonb),

    -- Everything the threshold rejected, aggregated so the totals still
    -- reconcile but no place is named.
    'other', (
      select jsonb_build_object(
        'events',  coalesce(sum(events), 0)::int,
        'viewers', coalesce(sum(viewers), 0)::int,
        'places',  count(*)::int
      )
      from city_groups where viewers < min_viewers
    ),

    -- Events whose viewer has no stored location at all, or who was signed out.
    'unknown_events', (select count(*) from base where city is null and state is null),

    'home_location', (
      select jsonb_build_object(
               'city',  nullif(btrim(vp.city), ''),
               'state', nullif(btrim(vp.state), '')
             )
      from public.vendor_profiles vp where vp.id = vid
    ),

    'coverage', jsonb_build_object(
      'total_events', (select count(*) from base),
      'events_with_location', (select count(*) from base where city is not null or state is not null)
    )
  )
  into result;

  return result;
end;
$function$;

-- Postgres grants EXECUTE to PUBLIC by default, so the revoke is the part that
-- does the work (see claude.md). Tighter than ad_category_benchmarks, which
-- still carries its default PUBLIC grant: this function reads another user's
-- location, and an anonymous caller has no vendor identity to be granted one.
revoke all on function public.vendor_buyer_geography(uuid, int) from public, anon;
grant execute on function public.vendor_buyer_geography(uuid, int) to authenticated;
