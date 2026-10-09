-- Subscriptions P5: ad reach by state (plan "build every vendor subscription feature",
-- 2026-10-08). Mitra: ads target STATES. A buyer known to be in another state never sees the
-- ad; a signed-out buyer, or one whose state isn't known, still can. A plan that reaches one
-- or four states and names none reaches the vendor's own state.
--
-- Until now an ad carried "target cities" (a fixed list of chips, some of them regions),
-- counted against the plan but matched only against a buyer's free-text city.
--
-- WHAT A PLAN REACHES (subscription_plans.limits.ad_location_scope):
--   none        no ads
--   state_1     1 state         state_4   up to 4 states
--   pan_india   any states; none named = all of India
--   global      as pan_india, plus countries outside India (VIP)
--
-- WHO SEES AN AD (public.ad_targeting_matches, in this order):
--   1. A buyer known to be outside India sees it only if their country is in target_countries.
--   2. An ad with target_states: buyers in those states, and buyers whose state isn't known.
--   3. An older ad with target_cities and no states: as before (the buyer's city is listed).
--   4. An ad with neither: everyone in India.
-- A buyer's country comes from buyer_profiles.country_code, which P7 adds; until then every
-- buyer counts as in India and rule 1 never applies.
--
-- ONE RULE, THREE CALLERS (admin.ad_reach): the trigger on advertisements (a browser's
-- write), razorpay-create-order (refuses before any money moves) and the two functions
-- that publish a paid order (they clamp instead of refusing: the vendor has paid). All three
-- read the plan in force, so the grace days count (the payment functions read the
-- subscription row themselves and treated a vendor in grace as Free).
--
-- The ad_state_targeting switch (off): off, a vendor's ads keep city targeting exactly as
-- before and carry no states. Delivery needs no switch: an ad without states is matched
-- as it always was.
--
-- Harness: scripts/subscriptions/p5_ad_reach.sql.

-- ── 0. Guard: the functions patched here are the ones that were read ────────────────
do $guard$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.enforce_ad_location_scope()',                          '9e91812a5c74c301c744a7364dc11ab4'),
      ('public.ad_targeting_matches(public.advertisements,uuid[],text)', 'bfdd953c40fe15dae9d1a24a8088e12a'),
      ('public.is_ad_eligible(public.advertisements,uuid[],text)',    'fe2ff78219a035947de311ad5752de6e'),
      ('public.active_ads(integer,uuid,text[],uuid[])',               'b0f95ca6cd0d33650b6e545ba283c382')
    ) as t(fn, want)
  loop
    if md5((select prosrc from pg_proc where oid = r.fn::regprocedure)) <> r.want then
      raise exception '% changed since it was read; re-read it before patching', r.fn;
    end if;
  end loop;
end
$guard$;

-- ── 1. The switch ───────────────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('ad_state_targeting',
        'Ads target states, and countries on VIP (subscriptions P5). Off: a vendor''s new ads keep the older city targeting and carry no states.',
        false)
on conflict (key) do nothing;

-- ── 2. Where an ad reaches ──────────────────────────────────────────────────────────
alter table public.advertisements
  add column target_states text[] not null default '{}',
  add column target_countries text[] not null default '{}';
alter table public.advertisements
  add constraint advertisements_target_states_check
    check (cardinality(target_states) <= 40 and array_to_string(target_states, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  add constraint advertisements_target_countries_check
    check (cardinality(target_countries) <= 60 and array_to_string(target_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');
comment on column public.advertisements.target_states is
  'The states this ad reaches (india_states codes). Empty: all of India, or for an ad made before state targeting, whatever target_cities says. Set through admin.ad_reach(), which holds it to the vendor''s plan.';
comment on column public.advertisements.target_countries is
  'Countries outside India whose buyers see this ad (ISO alpha-2), VIP only. Empty: no buyer known to be outside India sees it.';

-- ── 3. Who sees an ad ───────────────────────────────────────────────────────────────
-- Read with to_jsonb so this works before and after P7 adds buyer_profiles.country_code.
create or replace function public.ad_viewer_location()
returns table(city text, state_code text, country_code text)
language sql stable security definer set search_path = '' as $function$
  select lower(nullif(btrim(b.city), '')),
         nullif(btrim(b.state_code), ''),
         upper(nullif(btrim(to_jsonb(b) ->> 'country_code'), ''))
    from public.buyer_profiles b
   where b.id = (select auth.uid())
$function$;

create or replace function public.ad_targeting_matches(
  a public.advertisements, p_categories uuid[], p_city text, p_state text, p_country text)
returns boolean
language sql stable set search_path to 'public' as $function$
  select
    (
      p_categories is null
      or cardinality(p_categories) = 0
      or a.target_categories is null
      or jsonb_typeof(a.target_categories) <> 'array'
      or jsonb_array_length(a.target_categories) = 0
      or exists (
        select 1 from unnest(p_categories) pc
        where a.target_categories ? pc::text
      )
    )
    and
    case
      when p_country is not null and p_country <> 'IN' then p_country = any (a.target_countries)
      when cardinality(a.target_states) > 0 then p_state is null or p_state = any (a.target_states)
      when a.target_cities is not null and jsonb_typeof(a.target_cities) = 'array' and jsonb_array_length(a.target_cities) > 0
        then p_city is not null and a.target_cities ? p_city
      else true
    end;
$function$;

-- The three-argument forms stay for any caller that has only a city.
create or replace function public.ad_targeting_matches(a public.advertisements, p_categories uuid[], p_city text)
returns boolean
language sql stable set search_path to 'public' as $function$
  select public.ad_targeting_matches(a, p_categories, p_city, null, null);
$function$;

create or replace function public.is_ad_eligible(
  a public.advertisements, p_categories uuid[], p_city text, p_state text, p_country text)
returns boolean
language sql stable set search_path to 'public' as $function$
  select a.status = 'active'
     and (a.starts_at is null or a.starts_at <= now())
     and (a.ends_at   is null or a.ends_at   >  now())
     and public.vendor_account_in_good_standing(a.vendor_id)
     and public.ad_targeting_matches(a, p_categories, p_city, p_state, p_country);
$function$;

create or replace function public.is_ad_eligible(
  a public.advertisements, p_categories uuid[] default null::uuid[], p_city text default null::text)
returns boolean
language sql stable set search_path to 'public' as $function$
  select public.is_ad_eligible(a, p_categories, p_city, null, null);
$function$;

create or replace function public.active_ads(
  max_count integer default 12, filter_category uuid default null::uuid,
  filter_placements text[] default null::text[], filter_categories uuid[] default null::uuid[])
returns table(ad_id uuid, product_id uuid, title text, placement text, product_name text, price_value numeric, currency text, image_url text, vendor_id uuid, vendor_name text, category_name text, is_bumped boolean)
language sql stable security definer set search_path to 'public' as $function$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi
                                 where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name,
         c.name,
         public.ad_is_bumped(a)
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  left join public.categories c on c.id = p.category_id
  -- Where the viewer is, read once: no row for a signed-out viewer or one with no buyer profile.
  left join (select * from public.ad_viewer_location()) v on true
  where public.is_ad_eligible(
          a,
          nullif(array_remove(
            coalesce(filter_categories, array[]::uuid[]) || filter_category,
            null), array[]::uuid[]),
          v.city, v.state_code, v.country_code)
    and (
      filter_placements is null
      or exists (
        select 1 from unnest(filter_placements) fp
        where (',' || replace(coalesce(a.placement, ''), ' ', '') || ',')
              like ('%,' || fp || ',%')
      )
    )
  order by public.ad_is_bumped(a) desc, a.created_at desc, a.id desc
  limit greatest(1, max_count);
$function$;

-- ── 4. What a plan lets an ad reach ─────────────────────────────────────────────────
-- p_strict: a browser's write and the order before payment are refused with a reason;
-- a paid order is clamped instead (the first states the plan allows, countries dropped),
-- and blocked only when nothing can be published (no ads on the plan, or a state plan with
-- no state to reach).
create or replace function admin.ad_reach(
  p_vendor uuid, p_states text[], p_countries text[], p_cities jsonb, p_strict boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_plan      text;
  v_name      text;
  v_scope     text;
  v_allow     integer;
  v_on        boolean := admin.feature_on_for('ad_state_targeting', p_vendor);
  v_home      text;
  v_states    text[];
  v_countries text[];
  v_cities    jsonb := case when jsonb_typeof(p_cities) = 'array' then p_cities else '[]'::jsonb end;
  v_asked     integer;
  v_unknown   boolean := false;
begin
  select e.plan_id into v_plan from admin.vendor_effective_plan(p_vendor, now()) e;
  select p.name, coalesce(p.limits ->> 'ad_location_scope', 'none') into v_name, v_scope
    from public.subscription_plans p where p.id = coalesce(v_plan, 'free');
  v_scope := coalesce(v_scope, 'none');
  v_name := coalesce(v_name, 'Free');
  v_allow := case v_scope when 'none' then 0 when 'state_1' then 1 when 'state_4' then 4 else null end;

  if v_scope = 'none' then
    return jsonb_build_object('ok', false, 'blocked', true, 'reason', 'no_ads_on_plan', 'scope', v_scope, 'state_targeting', v_on,
      'message', 'Advertising is a paid feature: your ' || v_name || ' plan cannot create ad campaigns. Upgrade to a paid plan.');
  end if;

  if not v_on then
    -- City targeting, as before: the answer keeps the first cities the plan allows, which
    -- is what an order publishes. A browser's own write is held to the count by the
    -- trigger, from the row itself (it allows narrowing an older ad).
    v_asked := jsonb_array_length(v_cities);
    if v_allow is not null and v_asked > v_allow then
      select coalesce(jsonb_agg(x.c order by x.ord), '[]'::jsonb) into v_cities
        from jsonb_array_elements(v_cities) with ordinality as x(c, ord) where x.ord <= v_allow;
    end if;
    return jsonb_build_object('ok', true, 'blocked', false, 'scope', v_scope, 'plan_name', v_name, 'state_targeting', false,
      'states', '[]'::jsonb, 'countries', '[]'::jsonb, 'cities', v_cities,
      'requested', v_asked, 'allowed', coalesce(v_allow, v_asked), 'allowance', v_allow);
  end if;

  -- Codes as given, upper-cased, once each, in the order chosen; unknown ones set aside.
  select coalesce(array_agg(d.code order by d.ord), '{}') into v_states
    from (select distinct on (upper(btrim(t.x))) upper(btrim(t.x)) as code, t.ord
            from unnest(coalesce(p_states, '{}')) with ordinality as t(x, ord)
           where t.x is not null and btrim(t.x) <> ''
           order by upper(btrim(t.x)), t.ord) d;
  v_unknown := exists (select 1 from unnest(v_states) s where not exists (select 1 from public.india_states i where i.code = s));
  v_states := array(select s.code from unnest(v_states) with ordinality as s(code, ord)
                     where exists (select 1 from public.india_states i where i.code = s.code) order by s.ord);
  select coalesce(array_agg(d.code order by d.ord), '{}') into v_countries
    from (select distinct on (upper(btrim(t.x))) upper(btrim(t.x)) as code, t.ord
            from unnest(coalesce(p_countries, '{}')) with ordinality as t(x, ord)
           where t.x is not null and upper(btrim(t.x)) ~ '^[A-Z]{2}$' and upper(btrim(t.x)) <> 'IN'
           order by upper(btrim(t.x)), t.ord) d;
  v_asked := cardinality(v_states);

  if v_unknown and p_strict then
    return jsonb_build_object('ok', false, 'blocked', false, 'reason', 'unknown_state', 'scope', v_scope, 'state_targeting', true,
      'message', 'One of the states chosen for this ad isn''t recognised.');
  end if;
  if cardinality(v_countries) > 0 and v_scope <> 'global' then
    if p_strict then
      return jsonb_build_object('ok', false, 'blocked', false, 'reason', 'countries_need_vip', 'scope', v_scope, 'state_targeting', true,
        'message', 'Reaching buyers outside India is part of the VIP plan.');
    end if;
    v_countries := '{}';
  end if;

  if v_allow is not null then
    if cardinality(v_states) = 0 then
      select nullif(btrim(v.state_code), '') into v_home from public.vendor_profiles v where v.id = p_vendor;
      if v_home is null then
        return jsonb_build_object('ok', false, 'blocked', not p_strict, 'reason', 'choose_state', 'scope', v_scope, 'state_targeting', true, 'allowance', v_allow,
          'message', 'Choose the state this ad should reach. Your ' || v_name || ' plan reaches up to ' || v_allow || case when v_allow = 1 then ' state.' else ' states.' end);
      end if;
      v_states := array[v_home];
    elsif cardinality(v_states) > v_allow then
      if p_strict then
        return jsonb_build_object('ok', false, 'blocked', false, 'reason', 'too_many_states', 'scope', v_scope, 'state_targeting', true, 'allowance', v_allow,
          'message', 'Ad targeting exceeds your plan: ' || v_name || ' reaches up to ' || v_allow
                     || case when v_allow = 1 then ' state' else ' states' end || '; this ad targets ' || cardinality(v_states) || '.');
      end if;
      v_states := v_states[1:v_allow];
    end if;
  end if;

  return jsonb_build_object('ok', true, 'blocked', false, 'scope', v_scope, 'plan_name', v_name, 'state_targeting', true,
    'states', to_jsonb(v_states), 'countries', to_jsonb(v_countries), 'cities', '[]'::jsonb,
    'requested', v_asked, 'allowed', coalesce(v_allow, cardinality(v_states)), 'allowance', v_allow);
end
$function$;

-- For the payment functions (service role).
create or replace function public.ad_reach_resolve(
  p_vendor uuid, p_states text[], p_countries text[], p_cities jsonb, p_strict boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ad_reach_resolve is for the payment functions only' using errcode = '42501';
  end if;
  return admin.ad_reach(p_vendor, p_states, p_countries, p_cities, coalesce(p_strict, false));
end
$function$;

-- For the trigger below, which runs as the browser's role: the vendor's own ad, or an admin's.
create or replace function public.ad_reach_check(p_vendor uuid, p_states text[], p_countries text[], p_cities jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not (coalesce(p_vendor = auth.uid(), false) or coalesce(public.is_admin(), false)) then
    raise exception 'Only the vendor or an admin can check this ad''s reach.' using errcode = '42501';
  end if;
  return admin.ad_reach(p_vendor, p_states, p_countries, p_cities, true);
end
$function$;

-- A browser's write to an ad's targeting is held to the plan in force. Unchanged targeting
-- (a moderator's status change, a title edit) isn't re-checked.
create or replace function public.enforce_ad_location_scope()
returns trigger
language plpgsql set search_path to 'public' as $function$
declare
  r      jsonb;
  new_n  integer;
  old_n  integer;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  new.target_states := coalesce(new.target_states, '{}');
  new.target_countries := coalesce(new.target_countries, '{}');
  if tg_op = 'UPDATE'
     and new.target_states = old.target_states
     and new.target_countries = old.target_countries
     and new.target_cities is not distinct from old.target_cities then
    return new;
  end if;

  r := public.ad_reach_check(new.vendor_id, new.target_states, new.target_countries, coalesce(new.target_cities, '[]'::jsonb));
  if not coalesce((r ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(r ->> 'message', 'This ad''s targeting isn''t allowed on your plan.') using errcode = 'P0001';
  end if;

  if coalesce((r ->> 'state_targeting')::boolean, false) then
    new.target_states := array(select jsonb_array_elements_text(r -> 'states'));
    new.target_countries := array(select jsonb_array_elements_text(r -> 'countries'));
    new.target_cities := null;
    return new;
  end if;

  -- City targeting (the switch is off for this vendor): the rule as it was. More cities
  -- than the plan allows is refused on a new ad, and on an edit only when it adds some.
  new.target_states := '{}';
  new.target_countries := '{}';
  new_n := coalesce(jsonb_array_length(
             case when jsonb_typeof(new.target_cities) = 'array' then new.target_cities else '[]'::jsonb end), 0);
  old_n := case when tg_op = 'UPDATE' then coalesce(jsonb_array_length(
             case when jsonb_typeof(old.target_cities) = 'array' then old.target_cities else '[]'::jsonb end), 0) else 0 end;
  if (r ->> 'allowance') is not null and new_n > (r ->> 'allowance')::int and (tg_op = 'INSERT' or new_n > old_n) then
    raise exception
      'Ad targeting exceeds your plan: % (%) allows up to % target location(s); this ad targets %.',
      lower(r ->> 'plan_name'), r ->> 'scope', (r ->> 'allowance')::int, new_n
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- ── 5. Grants ───────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'admin.ad_reach(uuid,text[],text[],jsonb,boolean)',
    'public.ad_reach_resolve(uuid,text[],text[],jsonb,boolean)',
    'public.ad_viewer_location()',
    'public.ad_targeting_matches(public.advertisements,uuid[],text,text,text)',
    'public.is_ad_eligible(public.advertisements,uuid[],text,text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.ad_reach_resolve(uuid,text[],text[],jsonb,boolean)',
    'public.ad_viewer_location()',
    'public.ad_targeting_matches(public.advertisements,uuid[],text,text,text)',
    'public.is_ad_eligible(public.advertisements,uuid[],text,text,text)'] loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on function public.ad_reach_check(uuid, text[], text[], jsonb) from public, anon;
  grant execute on function public.ad_reach_check(uuid, text[], text[], jsonb) to authenticated;
end
$grants$;

-- ── 6. Self-check ───────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'admin.ad_reach(uuid,text[],text[],jsonb,boolean)', 'public.ad_reach_resolve(uuid,text[],text[],jsonb,boolean)',
    'public.ad_viewer_location()',
    'public.ad_targeting_matches(public.advertisements,uuid[],text,text,text)',
    'public.is_ad_eligible(public.advertisements,uuid[],text,text,text)',
    'public.ad_targeting_matches(public.advertisements,uuid[],text)',
    'public.is_ad_eligible(public.advertisements,uuid[],text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.active_ads(integer,uuid,text[],uuid[])', 'EXECUTE') then
    raise exception 'active_ads must stay callable by signed-out buyers';
  end if;
  if has_function_privilege('anon', 'public.ad_reach_check(uuid,text[],text[],jsonb)', 'EXECUTE') then
    raise exception 'ad_reach_check is for signed-in accounts';
  end if;
  if exists (select 1 from public.advertisements where cardinality(target_states) > 0 or cardinality(target_countries) > 0) then
    raise exception 'no ad has states or countries before the switch is first turned on';
  end if;
  if (select enabled from public.feature_flags where key = 'ad_state_targeting') then
    raise exception 'ad_state_targeting must start switched off';
  end if;
end
$check$;
