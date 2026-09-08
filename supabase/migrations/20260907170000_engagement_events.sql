-- Visit-level engagement tracking. ONE table, seven event types.
--
-- WHY THIS EXISTS. Every "trend" on the vendor Analytics page was a fixture
-- because the schema had nowhere to put a trend. `products.views_count`,
-- `advertisements.impressions` and `advertisements.clicks` are monotonic
-- counters: `increment_product_view(p uuid)` takes the product id and nothing
-- else — no timestamp, no viewer, no referrer — so "views last week", "unique
-- visitors" and "traffic sources" were all unanswerable, not merely unbuilt.
-- This table is the event log those questions need.
--
-- WHY ONE TABLE AND NOT FOUR. The obvious decomposition (product_views,
-- profile_views, search_events, ad_events) loses the only thing that makes the
-- data worth collecting: every panel on the Analytics page is "group this
-- vendor's events by <dimension> over <window>". Four tables means four
-- near-identical schemas, four RLS policies to keep in step, four indexes on
-- (vendor_id, created_at), and a UNION in every query that spans them — and the
-- queries DO span them, because "ad-attributed profile views" is an ad event
-- and a profile event at once. The columns that differ between types are all
-- nullable and cheap (product_id, ad_id, query_text, cta_name), so one table
-- costs a few NULLs and buys a single index, a single policy, and a single
-- shape every future panel reads.
--
-- WHY NO CLIENT INSERT POLICY. There is deliberately no `for insert` policy on
-- this table, so `supabase.from('engagement_events').insert(...)` fails for
-- every role including `authenticated`. Writes go exclusively through
-- `log_engagement_event` below, mirroring `increment_product_view`: a viewer
-- owns none of these rows, and a client that could INSERT freely could forge
-- another vendor's traffic, inflate their own ad numbers, or write a
-- `vendor_id` that has nothing to do with what they looked at.
--
-- THE COUNTERS STAY. This does not replace views_count / impressions / clicks
-- and does not touch `increment_product_view`, `ad_impression` or `ad_click`.
-- Other surfaces read those columns directly (the buyer feed sorts on
-- views_count; the campaigns table reads impressions/clicks), and the counters
-- carry history from before this table existed that the event log will never
-- have. The client call sites do both writes, side by side — see
-- `src/lib/queries/engagement.ts`.
--
-- THE THREE COUNTER RPCs ARE NOT EDITED, and the reason is not squeamishness
-- about touching them. Their bodies are one line each:
--     increment_product_view: update products    set views_count  = views_count  + 1 where id = p  and status = 'live';
--     ad_impression:          update advertisements set impressions = impressions + 1 where id = ad and status = 'active';
--     ad_click:               update advertisements set clicks      = clicks      + 1 where id = ad and status = 'active';
-- Folding the insert in would need a `p_source` argument on each (the source is
-- only known at the client), converting each from `language sql` to plpgsql to
-- get an exception block, and accepting that a telemetry failure rolls back the
-- counter update it shares a transaction with. Three live functions on the
-- buyer's critical path, rewritten for a logging side effect, is the wrong
-- trade. What DOES have to be preserved is the status filter each carries —
-- see the guard in log_engagement_event below.

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),

  event_type text not null check (event_type in (
    'product_view',      -- a buyer opened a product detail page
    'profile_view',      -- a buyer opened a vendor storefront
    'search_impression', -- this vendor's row appeared in a result set
    'search_click',      -- a buyer opened it from that result set
    'ad_impression',     -- a paid placement was rendered
    'ad_click',          -- a paid placement was tapped
    'cta_click'          -- a named call-to-action button was pressed
  )),

  -- Not null on purpose: an event nobody can attribute to a vendor cannot be
  -- read back under this table's RLS and would be write-only noise.
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,

  -- `on delete set null`, not cascade: an event is a historical fact. Deleting
  -- a product must not retroactively shrink last month's traffic.
  product_id uuid references public.products(id) on delete set null,
  ad_id uuid references public.advertisements(id) on delete set null,

  -- NULL means signed-out. Distinguishing "we know who" from "we do not" is the
  -- whole basis of the unique-visitor count, so it must never be defaulted.
  viewer_id uuid references public.profiles(id) on delete set null,

  -- Fallback dedup key, and ONLY for signed-out traffic. Never read when
  -- viewer_id is present — two devices signed into one account are one visitor.
  session_id text,

  source text check (source in (
    'organic_search', 'category_browse', 'recommendation', 'ad', 'external', 'direct'
  )),

  -- Populated for search_impression / search_click.
  query_text text,
  -- Populated for cta_click. A stable identifier, not a display label.
  cta_name text,

  created_at timestamptz not null default now()
);

-- Every read on this table is "one vendor, one time window", optionally
-- narrowed by type. `created_at desc` matches the direction every panel scans.
create index if not exists engagement_events_vendor_time_idx
  on public.engagement_events (vendor_id, created_at desc);
create index if not exists engagement_events_vendor_type_time_idx
  on public.engagement_events (vendor_id, event_type, created_at desc);

alter table public.engagement_events enable row level security;

-- SELECT only, and only your own rows. Same shape as the subscription tables
-- (`(vendor_id = auth.uid()) or is_admin()`). vendor_profiles.id IS the auth
-- uid on this project, so no join is needed to resolve ownership.
--
-- Note what this policy does NOT grant: a buyer cannot read the events they
-- generated. That is intentional — these rows describe a vendor's traffic, and
-- the viewer_id column is exactly the field that must not become a way to
-- enumerate who looked at what.
drop policy if exists engagement_events_select on public.engagement_events;
create policy engagement_events_select on public.engagement_events
  for select using ((vendor_id = auth.uid()) or is_admin());

-- Admin gets the full surface for the ops panel, matching every other table
-- Cosora-Admin reads.
drop policy if exists engagement_events_admin on public.engagement_events;
create policy engagement_events_admin on public.engagement_events
  for all using (is_admin()) with check (is_admin());

-- ── The one write path ───────────────────────────────────────────────────────
--
-- SECURITY DEFINER, mirroring increment_product_view. `viewer_id` is taken from
-- auth.uid() INSIDE the function and is never a parameter: letting the caller
-- name the viewer would make every "unique visitors" and "ad-attributed" figure
-- forgeable by anyone holding the anon key, which ships in the bundle.
--
-- The vendor is resolved server-side too wherever the event names a product or
-- an ad, so a client cannot attribute its traffic to someone else's storefront.
-- `v_vendor` is only trusted from the argument for the two event types that
-- have no product or ad to derive it from (profile_view, cta_click), and even
-- then the row must exist in vendor_profiles or the FK rejects it.
--
-- Returns void and never raises on a bad reference: this is fire-and-forget
-- telemetry sitting in front of a buyer's navigation, and a logging failure
-- must never break the page the buyer actually asked for.
--
-- THE STATUS GUARD IS THE POINT OF DOING THIS SERVER-SIDE. The counter RPCs
-- only count a view of a `status = 'live'` product and only count an impression
-- or click on a `status = 'active'` ad. Without the same filter here the event
-- log and the counter would disagree about the same visit — concretely, a
-- vendor previewing their own `under_review` listing bumps no counter but would
-- log a product_view against themselves, quietly poisoning their own analytics
-- with their own page refreshes. The guard applies ONLY to the three event
-- types that mirror a counter; a cta_click that happens to name a non-live
-- product is still a real button press and is still recorded.
create or replace function public.log_engagement_event(
  p_event_type text,
  p_vendor_id uuid default null,
  p_product_id uuid default null,
  p_ad_id uuid default null,
  p_session_id text default null,
  p_source text default null,
  p_query_text text default null,
  p_cta_name text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_vendor uuid;
begin
  -- Mirror the counter RPCs' own filters, so the log and the counters can never
  -- tell different stories about one visit. See the comment above.
  if p_event_type = 'product_view' and p_product_id is not null
     and not exists (select 1 from public.products
                     where id = p_product_id and status = 'live') then
    return;
  end if;

  if p_event_type in ('ad_impression', 'ad_click') and p_ad_id is not null
     and not exists (select 1 from public.advertisements
                     where id = p_ad_id and status = 'active') then
    return;
  end if;

  -- Derive the vendor from the subject wherever one exists; fall back to the
  -- argument only for events that name no product and no ad.
  if p_product_id is not null then
    select vendor_id into v_vendor from public.products where id = p_product_id;
  elsif p_ad_id is not null then
    select vendor_id into v_vendor from public.advertisements where id = p_ad_id;
  end if;

  if v_vendor is null then
    v_vendor := p_vendor_id;
  end if;

  -- Nothing to attribute — drop it rather than writing an unreadable row.
  if v_vendor is null then
    return;
  end if;

  insert into public.engagement_events (
    event_type, vendor_id, product_id, ad_id, viewer_id, session_id,
    source, query_text, cta_name
  ) values (
    p_event_type, v_vendor, p_product_id, p_ad_id, auth.uid(),
    -- A session id is dedup material for signed-out traffic only. Storing one
    -- next to a known viewer_id would be a second identifier for the same
    -- person and the unique-visitor coalesce would never look at it anyway.
    case when auth.uid() is null then p_session_id else null end,
    p_source, p_query_text, p_cta_name
  );
exception
  -- A bad product/ad/vendor id, or an event_type outside the check constraint,
  -- must not surface as a failed navigation for the buyer.
  when others then
    return;
end;
$function$;

revoke all on function public.log_engagement_event(text, uuid, uuid, uuid, text, text, text, text) from public;
grant execute on function public.log_engagement_event(text, uuid, uuid, uuid, text, text, text, text) to authenticated, anon;
