-- Phase 3 — Eligibility-gated delivery, contextual targeting, schedule sweep.
--
-- The one gate. Before this, `active_ads()` checked `status = 'active'` and
-- `ends_at > now()` and nothing else, which left three separate bugs:
--   * no starts_at check at all, so a campaign scheduled to begin in 30 days
--     served today (proved live before this migration);
--   * no vendor good-standing check, so a suspended vendor's paid campaign kept
--     running;
--   * target_cities was stored, billed for, and never read by anything.
--
-- Everything now funnels through is_ad_eligible(). Nothing downstream has to
-- remember to apply four checks in the right order, which is the entire point.

-- ── The decision log gains one more verb ────────────────────────────────────
-- The sweep promotes scheduled -> active. That is not an approval (already
-- given) nor a resume (never paused), so it needs its own decision value.
-- Idempotent rebuild; additive, no value removed.
alter table public.ad_review_log drop constraint if exists ad_review_log_decision_check;
alter table public.ad_review_log
  add constraint ad_review_log_decision_check check (decision = any (array[
    'submitted', 'approved', 'rejected', 'changes_requested', 'resubmitted',
    'paused', 'resumed', 'suspended', 'expired', 'archived', 'promoted']));

-- ── 1.4  Eligibility ────────────────────────────────────────────────────────

create or replace function public.vendor_account_in_good_standing(p_vendor uuid)
returns boolean language sql stable security definer set search_path to 'public'
-- account_is_active() already fails closed on a missing profile row and is what
-- the advertisements INSERT policy uses. Reused rather than reimplemented so the
-- two can never disagree about what "in good standing" means.
as $$ select public.account_is_active(p_vendor); $$;

-- The viewer's city, resolved SERVER-SIDE from first-party data the project
-- already collects (buyer_profiles.city, written at onboarding). Deliberately
-- not a parameter: a client that could name its own city could claim to be in
-- whatever city had the most inventory.
create or replace function public.ad_viewer_city()
returns text language sql stable security definer set search_path to 'public'
as $$
  select lower(nullif(trim(city), '')) from public.buyer_profiles where id = auth.uid();
$$;

-- Phase 3.3 + 3.5. One function, so category and city can never be applied at
-- different call sites in different orders.
create or replace function public.ad_targeting_matches(
  a public.advertisements, p_category uuid, p_city text
) returns boolean language sql stable set search_path to 'public'
as $$
  select
    -- CATEGORY: an ad with no target_categories is untargeted and matches any
    -- context; a targeted ad matches only its own categories. When the page has
    -- no category context at all (p_category is null) targeting cannot be
    -- evaluated, so it does not exclude.
    (
      p_category is null
      or a.target_categories is null
      or jsonb_typeof(a.target_categories) <> 'array'
      or jsonb_array_length(a.target_categories) = 0
      or a.target_categories ? p_category::text
    )
    and
    -- CITY: fails CLOSED. "Target Mumbai" cannot honestly be honoured for a
    -- viewer whose city is unknown, so an unknown-city viewer does not see
    -- city-targeted campaigns. Untargeted campaigns are unaffected.
    -- Stored shape is confirmed lowercase name strings, e.g. ["mumbai","delhi"].
    (
      a.target_cities is null
      or jsonb_typeof(a.target_cities) <> 'array'
      or jsonb_array_length(a.target_cities) = 0
      or (p_city is not null and a.target_cities ? p_city)
    );
$$;

create or replace function public.is_ad_eligible(
  a public.advertisements, p_category uuid default null, p_city text default null
) returns boolean language sql stable set search_path to 'public'
as $$
  select a.status = 'active'
     and (a.starts_at is null or a.starts_at <= now())
     and (a.ends_at   is null or a.ends_at   >  now())
     -- No budget clause. Pricing is flat-rate/prepaid per the ground rules, so
     -- there are no budget_total/budget_spent columns and 'budget_exhausted' is
     -- structurally unreachable. Stated here rather than left as a silent gap.
     and public.vendor_account_in_good_standing(a.vendor_id)
     and public.ad_targeting_matches(a, p_category, p_city);
$$;

-- ── 3.1 + 3.7  Delivery ─────────────────────────────────────────────────────
-- DROP FIRST. `create or replace` with an added parameter OVERLOADS rather than
-- replaces, and a two-argument call then resolves to neither (42725) — the same
-- mistake that took match_products() down. The old signature goes explicitly.
drop function if exists public.active_ads(integer, uuid);

create or replace function public.active_ads(
  max_count         integer  default 12,
  filter_category   uuid     default null,
  filter_placements text[]   default null
)
returns table(ad_id uuid, product_id uuid, title text, placement text,
              product_name text, price_value numeric, currency text,
              image_url text, vendor_id uuid, vendor_name text, category_name text)
language sql stable security definer set search_path to 'public'
as $$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi
                                 where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name,
         c.name
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  left join public.categories c on c.id = p.category_id
  where public.is_ad_eligible(a, filter_category, public.ad_viewer_city())
    -- Phase 5 routes specific ad types to specific rails. Matched server-side
    -- on the CSV so a rail cannot come back empty merely because its ad types
    -- fell outside the LIMIT. `placement` is comma-joined by adRows(), e.g.
    -- "openListing,trustedSeal" — membership, never equality.
    and (
      filter_placements is null
      or exists (
        select 1 from unnest(filter_placements) fp
        where (',' || replace(coalesce(a.placement, ''), ' ', '') || ',')
              like ('%,' || fp || ',%')
      )
    )
  -- Recency, with the id tiebreaker kept. Rows sharing a created_at once broke
  -- pagination between two rails and double-counted impressions; this must stay
  -- a TOTAL order. No bid, no quality score, no auction (ground rules).
  order by a.created_at desc, a.id desc
  limit greatest(1, max_count);
$$;

revoke all on function public.active_ads(integer, uuid, text[]) from public;
grant execute on function public.active_ads(integer, uuid, text[]) to anon, authenticated, service_role;

-- ── 3.6 + 6.1  Frequency cap and burst guard ────────────────────────────────
-- Counts out of engagement_events, which already carries ad_id, viewer_id,
-- session_id and created_at. That is the existing counting infrastructure; a
-- second per-viewer table would be a parallel source of truth for the same fact.
create index if not exists engagement_events_ad_viewer_time_idx
  on public.engagement_events (ad_id, viewer_id, created_at desc)
  where ad_id is not null;
create index if not exists engagement_events_ad_session_time_idx
  on public.engagement_events (ad_id, session_id, created_at desc)
  where ad_id is not null;

create or replace function public.ad_frequency_capped(
  p_ad uuid, p_session text default null, p_cap integer default 8
) returns boolean language sql stable security definer set search_path to 'public'
as $$
  -- Signed-in viewers are capped by viewer_id; signed-out ones by session_id,
  -- which is a per-tab sessionStorage value, not a durable identifier. A viewer
  -- with neither cannot be capped at all, and is not counted as capped —
  -- failing closed there would suppress every anonymous impression.
  select case
    when auth.uid() is not null then
      (select count(*) from public.engagement_events e
        where e.ad_id = p_ad and e.viewer_id = auth.uid()
          and e.event_type = 'ad_impression'
          and e.created_at >= date_trunc('day', now())) >= p_cap
    when nullif(p_session, '') is not null then
      (select count(*) from public.engagement_events e
        where e.ad_id = p_ad and e.session_id = p_session
          and e.event_type = 'ad_impression'
          and e.created_at >= date_trunc('day', now())) >= p_cap
    else false
  end;
$$;

-- Burst guard (6.1): the same viewer cannot log the same ad twice within a few
-- seconds. Catches a remount loop or a scripted replay without needing IP.
create or replace function public.ad_logging_throttled(
  p_ad uuid, p_session text default null, p_window interval default interval '5 seconds'
) returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.engagement_events e
     where e.ad_id = p_ad
       and e.event_type = 'ad_impression'
       and e.created_at >= now() - p_window
       and ((auth.uid() is not null and e.viewer_id = auth.uid())
         or (auth.uid() is null and nullif(p_session, '') is not null and e.session_id = p_session))
  );
$$;

-- Counters gain the session parameter. Dropped explicitly for the same
-- overload reason as active_ads above.
drop function if exists public.ad_impression(uuid);
drop function if exists public.ad_click(uuid);

create or replace function public.ad_impression(ad uuid, p_session text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  -- Cap and throttle affect LOGGING ONLY. Phase 3.6 is explicit that the ad may
  -- still render past its cap — the buyer sees it, Cosora just stops counting
  -- it. So this is deliberately NOT part of is_ad_eligible(): making it a
  -- delivery filter would have changed what buyers see, which 3.6 rules out.
  if public.ad_frequency_capped(ad, p_session) then return; end if;
  if public.ad_logging_throttled(ad, p_session)  then return; end if;
  update public.advertisements set impressions = impressions + 1
   where id = ad and status = 'active';
end $$;

create or replace function public.ad_click(ad uuid, p_session text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  -- Clicks are not frequency-capped: a second genuine click is a real event and
  -- suppressing it would understate what a vendor paid for. The fraud heuristic
  -- in Phase 6.3 is what looks at click shape.
  update public.advertisements set clicks = clicks + 1
   where id = ad and status = 'active';
end $$;

revoke all on function public.ad_impression(uuid, text) from public;
revoke all on function public.ad_click(uuid, text) from public;
grant execute on function public.ad_impression(uuid, text) to anon, authenticated, service_role;
grant execute on function public.ad_click(uuid, text) to anon, authenticated, service_role;

-- ── 3.2  Schedule sweep ─────────────────────────────────────────────────────
-- The read path (3.1) already hides a lapsed campaign from buyers. This is the
-- WRITE path: without it every dashboard keeps showing "active" forever. Both
-- were broken; fixing only one leaves the other. All three campaigns in this
-- database are status='active' with ends_at in July — this is what corrects them.
create or replace function public.sweep_ad_schedules()
returns table(promoted integer, expired integer)
language plpgsql security definer set search_path to 'public'
as $$
declare r record; v_promoted int := 0; v_expired int := 0;
begin
  for r in
    select id from public.advertisements
     where status = 'scheduled'
       and starts_at is not null and starts_at <= now()
       and (ends_at is null or ends_at > now())
     order by starts_at
  loop
    perform public.ad_apply_decision(
      r.id, 'active', 'promoted', null, null, null,
      'Your campaign has started', null);
    v_promoted := v_promoted + 1;
  end loop;

  for r in
    select id from public.advertisements
     where status in ('active', 'scheduled', 'paused_by_vendor', 'paused_by_admin', 'paused')
       and ends_at is not null and ends_at <= now()
     order by ends_at
  loop
    perform public.ad_apply_decision(
      r.id, 'expired', 'expired', null, null, null,
      'Your campaign has finished its run', null);
    v_expired := v_expired + 1;
  end loop;

  return query select v_promoted, v_expired;
end $$;

revoke all on function public.sweep_ad_schedules() from public, anon, authenticated;

-- Every five minutes, matching the cadence of the other maintenance jobs on
-- this project (see cron.job: embedding-worker, vendor-catalog-recompute).
select cron.unschedule('ads-schedule-sweep')
 where exists (select 1 from cron.job where jobname = 'ads-schedule-sweep');
select cron.schedule('ads-schedule-sweep', '*/5 * * * *', $cron$ select public.sweep_ad_schedules(); $cron$);
