-- Subscriptions P10: featured listings, the VIP spotlight and seal tiers (plan "build every
-- vendor subscription feature", 2026-10-09).
--
-- WHAT EACH PLAN GETS (subscription_plans.limits.featured):
--   Basic   'none'      priority in its categories (the existing search_boost_tier ordering)
--   Silver  'top10'     a rotating place among the first 10 of a category page, tagged Featured
--   Gold    'top5'      among the first 5, ahead of Silver; ahead of other Gold sellers for a
--                       buyer in a state it is based in or serves ("nearby buyers")
--   VIP     'spotlight' place 1 (rotating among VIP sellers), and the Spotlight rail on the
--                       home and category pages
-- Rotation is by day and by the browsing session, so every eligible seller gets turns. A
-- seller has at most one featured product on a page (its best-selling live one there).
--
-- SEAL TIERS are drawn by the app from the vendor's cached plan (vendor_profiles.plan_id and
-- plan_expires_at, already public): Verified, Gold verified, VIP trusted.
--
-- THE SWITCH `featured_listings` (off) is about the VIEWER: a buyer it lists (or everyone, when
-- on) sees featured places, the spotlight and the seal tiers; the Visibility page shows for a
-- seller it lists. Off, browsing is exactly as before.
--
-- IMPRESSIONS: public.featured_impressions, insert-only (no counter row for every view to
-- fight over), one per product, place and browsing session or account per 30 minutes, only for
-- a product that really is eligible for that place. Sellers read their own totals on
-- /visibility (my_visibility).
--
-- Not here: moving browsing itself to the server (the plan's browse_products). The buyer pages
-- shape the whole catalogue in the browser (facets, tiers, sorts); that is its own change.
--
-- Harness: scripts/subscriptions/p10_visibility.sql.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure))
     <> 'bcaef0ad92e5a466023c5f236985ca6c' then
    raise exception 'vendor_entitlements changed since it was read; re-read it before patching';
  end if;
end
$guard$;

-- ── 1. The switch and each plan's place ────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('featured_listings',
        'Featured listings, the VIP spotlight and seal tiers (subscriptions P10). Lists VIEWERS: a buyer it lists sees featured places, the spotlight and Gold/VIP seals; a seller it lists sees the Visibility page. Off: browsing as before.',
        false)
on conflict (key) do nothing;

update public.subscription_plans set limits = limits || '{"featured": "none"}'::jsonb where id not in ('silver', 'gold', 'vip');
update public.subscription_plans set limits = limits || '{"featured": "top10"}'::jsonb where id = 'silver';
update public.subscription_plans set limits = limits || '{"featured": "top5"}'::jsonb where id = 'gold';
update public.subscription_plans set limits = limits || '{"featured": "spotlight"}'::jsonb where id = 'vip';

-- 3 spotlight (VIP), 2 top5 (Gold), 1 top10 (Silver), 0 none: from the plan the vendor's profile
-- caches (plan_id while plan_expires_at is ahead, the grace days included), for a vendor in
-- good standing. The same cache the buyer pages already rank by.
create or replace function admin.vendor_featured_tier(p_vendor uuid)
returns integer
language sql stable security definer set search_path = '' as $function$
  select coalesce((
    select case p.limits ->> 'featured' when 'spotlight' then 3 when 'top5' then 2 when 'top10' then 1 else 0 end
      from public.vendor_profiles v
      join public.subscription_plans p on p.id = v.plan_id
     where v.id = p_vendor and v.plan_expires_at > now()
       and public.vendor_account_in_good_standing(v.id)), 0)
$function$;

-- A category and everything under it.
create or replace function admin.category_subtree(p_category uuid)
returns uuid[]
language sql stable security definer set search_path = '' as $function$
  with recursive t(id) as (
    select c.id from public.categories c where c.id = p_category
    union
    select c.id from public.categories c join t on c.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}') from t
$function$;

-- Whether featured places, the spotlight and seal tiers are shown to the caller.
create or replace function public.featured_listings_on()
returns boolean
language sql stable security definer set search_path = '' as $function$
  select admin.feature_on_for('featured_listings', (select auth.uid()))
$function$;

-- ── 2. Featured places on a category page ──────────────────────────────────────────
-- Each eligible seller's best-selling live product in the categories given, with its tier,
-- whether the seller is near the buyer (Gold and VIP only) and its turn for the day and session.
-- Set-based, for speed on every category page: only paid sellers whose plan features them, in
-- good standing (the rule of account_is_active, as a join), are looked at; then their live
-- products here (the partial index on live products by category).
create or replace function admin.featured_candidates(p_cats uuid[], p_state text, p_day text, p_session text, p_viewer uuid)
returns table (vendor_id uuid, product_id uuid, tier integer, nearby boolean, turn text)
language sql stable security definer set search_path = '' as $function$
  with eligible as (
    select v.id, v.state_code, v.served_states,
           case pl.limits ->> 'featured' when 'spotlight' then 3 when 'top5' then 2 when 'top10' then 1 else 0 end as tier
      from public.vendor_profiles v
      join public.subscription_plans pl on pl.id = v.plan_id
      join public.profiles pf on pf.id = v.id and pf.account_status = 'active'
     where v.plan_expires_at > now()
       and coalesce(pl.limits ->> 'featured', 'none') in ('spotlight', 'top5', 'top10')
       and v.id is distinct from p_viewer
  ), best as (
    select distinct on (pr.vendor_id) pr.vendor_id, pr.id as product_id
      from public.products pr
      join eligible e on e.id = pr.vendor_id
     where pr.status = 'live' and pr.category_id = any (p_cats)
     order by pr.vendor_id, (pr.sold_count + pr.enquiries_count) desc, pr.created_at desc
  )
  select b.vendor_id, b.product_id, e.tier,
         e.tier >= 2 and p_state is not null
           and (e.state_code = p_state or p_state = any (coalesce(e.served_states, '{}'))),
         md5(b.vendor_id::text || p_day || coalesce(p_session, ''))
    from best b join eligible e on e.id = b.vendor_id
$function$;

-- Up to 10 places. Places 1-5 go by tier: VIP sellers first (place 1 rotates among them), then
-- Gold, Gold and VIP sellers near the buyer ahead of the rest of their tier; Silver only where
-- fewer than five Gold and VIP sellers list here. Places 6-10 rotate among everyone left, Silver
-- included, so Silver's turns aren't taken by Gold's overflow. Rotation is by IST day and the
-- browsing session. The candidates are read once.
create or replace function public.featured_listings(p_category uuid, p_session text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me    uuid := auth.uid();
  v_day   text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_state text;
  v_all   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_used  uuid[] := '{}';
  v_slot  integer := 0;
  c       jsonb;
begin
  if p_category is null or not admin.feature_on_for('featured_listings', v_me) then
    return v_out;
  end if;
  if v_me is not null then
    select b.state_code into v_state from public.buyer_profiles b where b.id = v_me;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.tier desc, x.nearby desc, x.turn), '[]'::jsonb) into v_all
    from admin.featured_candidates(admin.category_subtree(p_category), v_state, v_day, p_session, v_me) x;

  for c in select e from jsonb_array_elements(v_all) e loop
    exit when v_slot >= 5;
    v_slot := v_slot + 1;
    v_used := v_used || (c ->> 'vendor_id')::uuid;
    v_out := v_out || jsonb_build_object('product_id', c -> 'product_id', 'vendor_id', c -> 'vendor_id', 'slot', v_slot,
                                         'tier', case (c ->> 'tier')::int when 3 then 'spotlight' when 2 then 'top5' else 'top10' end,
                                         'nearby', c -> 'nearby');
  end loop;
  for c in select e from jsonb_array_elements(v_all) e order by e ->> 'turn' loop
    exit when v_slot >= 10;
    continue when (c ->> 'vendor_id')::uuid = any (v_used);
    v_slot := v_slot + 1;
    v_used := v_used || (c ->> 'vendor_id')::uuid;
    v_out := v_out || jsonb_build_object('product_id', c -> 'product_id', 'vendor_id', c -> 'vendor_id', 'slot', v_slot,
                                         'tier', case (c ->> 'tier')::int when 3 then 'spotlight' when 2 then 'top5' else 'top10' end,
                                         'nearby', c -> 'nearby');
  end loop;
  return v_out;
end
$function$;

-- ── 3. The VIP spotlight ───────────────────────────────────────────────────────────
-- VIP sellers' products for the Spotlight rail: each seller's best first, rotating; then more of
-- theirs. In a category when given.
create or replace function public.spotlight_listings(p_category uuid default null, p_session text default null, p_limit integer default 8)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me   uuid := auth.uid();
  v_day  text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_cats uuid[];
begin
  if not admin.feature_on_for('featured_listings', v_me) then
    return '[]'::jsonb;
  end if;
  if p_category is not null then
    v_cats := admin.category_subtree(p_category);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('product_id', x.id, 'vendor_id', x.vendor_id) order by x.rn, x.turn)
      from (select pr.id, pr.vendor_id,
                   row_number() over (partition by pr.vendor_id order by (pr.sold_count + pr.enquiries_count) desc, pr.created_at desc) as rn,
                   md5(pr.vendor_id::text || v_day || coalesce(p_session, '')) as turn
              from public.products pr
              join public.vendor_profiles vp on vp.id = pr.vendor_id
              join public.subscription_plans p on p.id = vp.plan_id
             join public.profiles pf on pf.id = vp.id and pf.account_status = 'active'
             where pr.status = 'live'
               and p.limits ->> 'featured' = 'spotlight' and vp.plan_expires_at > now()
               and (v_cats is null or pr.category_id = any (v_cats))
               and pr.vendor_id is distinct from v_me
             order by rn, turn
             limit least(greatest(coalesce(p_limit, 8), 1), 12)) x), '[]'::jsonb);
end
$function$;

-- ── 4. Impressions ─────────────────────────────────────────────────────────────────
create table public.featured_impressions (
  id          bigint generated always as identity primary key,
  vendor_id   uuid not null references public.vendor_profiles (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  placement   text not null check (placement in ('featured', 'spotlight')),
  viewer_id   uuid,
  session_id  text check (session_id is null or char_length(session_id) <= 100),
  created_at  timestamptz not null default now()
);
create index featured_impressions_vendor on public.featured_impressions (vendor_id, created_at desc);
create index featured_impressions_dedupe on public.featured_impressions (product_id, placement, session_id, created_at desc);
alter table public.featured_impressions enable row level security;
revoke all on public.featured_impressions from anon, authenticated;
comment on table public.featured_impressions is
  'A featured or spotlight product seen (subscriptions P10). Insert-only through log_featured_impressions(); sellers read their totals through my_visibility().';

-- Records what a browser was shown: at most 20 at a time, each product and place once per
-- account or session per 30 minutes, and only where that product is eligible for the place.
create or replace function public.log_featured_impressions(p_items jsonb, p_session text default null)
returns integer
language plpgsql security definer set search_path = '' as $function$
declare
  v_me  uuid := auth.uid();
  v_ses text := left(nullif(btrim(coalesce(p_session, '')), ''), 100);
  v_n   integer := 0;
  r     record;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    raise exception 'Up to 20 items.' using errcode = '22023';
  end if;
  if v_me is null and v_ses is null then
    return 0;
  end if;
  if not admin.feature_on_for('featured_listings', v_me) then
    return 0;
  end if;
  for r in
    select distinct (e ->> 'product_id')::uuid as product_id, e ->> 'placement' as placement
      from jsonb_array_elements(p_items) e
     where e ->> 'placement' in ('featured', 'spotlight')
       and (e ->> 'product_id') ~ '^[0-9a-fA-F-]{36}$'
  loop
    insert into public.featured_impressions (vendor_id, product_id, placement, viewer_id, session_id)
    select pr.vendor_id, pr.id, r.placement, v_me, v_ses
      from public.products pr
     where pr.id = r.product_id and pr.status = 'live'
       and admin.vendor_featured_tier(pr.vendor_id) >= case r.placement when 'spotlight' then 3 else 1 end
       and pr.vendor_id is distinct from v_me
       and not exists (select 1 from public.featured_impressions f
                        where f.product_id = r.product_id and f.placement = r.placement
                          and f.created_at > now() - interval '30 minutes'
                          and ((v_me is not null and f.viewer_id = v_me) or (v_me is null and f.session_id = v_ses)));
    if found then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end
$function$;

-- ── 5. The seller's Visibility page ────────────────────────────────────────────────
create or replace function public.my_visibility(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me   uuid := auth.uid();
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_tier integer;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_tier := admin.vendor_featured_tier(v_me);
  return jsonb_build_object(
    'available', admin.feature_on_for('featured_listings', v_me),
    'featured', case v_tier when 3 then 'spotlight' when 2 then 'top5' when 1 then 'top10' else 'none' end,
    'boost', coalesce((select (p.limits ->> 'search_boost_tier')::int from public.vendor_profiles v
                         join public.subscription_plans p on p.id = v.plan_id
                        where v.id = v_me and v.plan_expires_at > now()), 0),
    'days', v_days,
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'products', x.n) order by x.n desc, c.name)
                              from (select pr.category_id, count(*) as n from public.products pr
                                     where pr.vendor_id = v_me and pr.status = 'live' and pr.category_id is not null
                                     group by pr.category_id) x
                              join public.categories c on c.id = x.category_id), '[]'::jsonb),
    'impressions', jsonb_build_object(
       'featured', (select count(*) from public.featured_impressions f where f.vendor_id = v_me and f.placement = 'featured'
                      and f.created_at > now() - make_interval(days => v_days)),
       'spotlight', (select count(*) from public.featured_impressions f where f.vendor_id = v_me and f.placement = 'spotlight'
                       and f.created_at > now() - make_interval(days => v_days)),
       'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'featured', d.featured, 'spotlight', d.spotlight) order by d.day)
                             from (select (f.created_at at time zone 'Asia/Kolkata')::date as day,
                                          count(*) filter (where f.placement = 'featured') as featured,
                                          count(*) filter (where f.placement = 'spotlight') as spotlight
                                     from public.featured_impressions f
                                    where f.vendor_id = v_me and f.created_at > now() - make_interval(days => v_days)
                                    group by 1) d), '[]'::jsonb),
       'ads', coalesce((select sum(a.impressions) from public.advertisements a where a.vendor_id = v_me), 0)));
end
$function$;

-- ── 6. Entitlements carry it ───────────────────────────────────────────────────────
do $patch$
declare
  v_def text := pg_get_functiondef('public.vendor_entitlements(uuid)'::regprocedure);
  v_old text := $q$      'am_page',            paid and admin.feature_on_for('account_managers', p_vendor) and coalesce(lim->>'am_level', 'none') in ('shared', 'named', 'vip')$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'vendor_entitlements no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E',\n'
    || $q$      -- Visibility (P10): the place a plan buys, and the page (Basic and up, where the switch lists the vendor).$q$ || E'\n'
    || $q$      'featured',           case when paid then coalesce(lim->>'featured', 'none') else 'none' end,$q$ || E'\n'
    || $q$      'visibility_page',    paid and admin.feature_on_for('featured_listings', p_vendor) and coalesce((lim->>'search_boost_tier')::int, 0) >= 1$q$);
end
$patch$;

-- ── 7. Grants ──────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array['admin.vendor_featured_tier(uuid)', 'admin.category_subtree(uuid)',
                           'admin.featured_candidates(uuid[],text,text,text,uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Browsing is open to visitors.
  foreach f in array array['public.featured_listings_on()', 'public.featured_listings(uuid,text)',
                           'public.spotlight_listings(uuid,text,integer)', 'public.log_featured_impressions(jsonb,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  revoke all on function public.my_visibility(integer) from public, anon;
  grant execute on function public.my_visibility(integer) to authenticated;
end
$grants$;

-- ── 8. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from public.subscription_plans where limits ? 'featured') <> (select count(*) from public.subscription_plans) then
    raise exception 'every plan says its featured place';
  end if;
  if (select enabled from public.feature_flags where key = 'featured_listings') then
    raise exception 'featured_listings must start switched off';
  end if;
  if position('visibility_page' in (select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure)) = 0 then
    raise exception 'the entitlements patch did not apply';
  end if;
  if has_table_privilege('anon', 'public.featured_impressions', 'INSERT')
     or has_table_privilege('authenticated', 'public.featured_impressions', 'SELECT') then
    raise exception 'impressions are written and read through the functions only';
  end if;
end
$check$;
