-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P5: ad reach by state (2026-10-08).
-- Migration 20261009175317_subscriptions_p5_ad_reach.sql (on top of P0-P4).
--   who sees   states: buyers there and buyers whose state isn't known; an overseas buyer
--              only a listed country; older city ads as before; untargeted ads everyone
--   reach      what each plan lets an ad reach, refused (strict) or clamped (a paid order);
--              a state plan with no state named reaches the vendor's own; grace days count
--   switch     off: city targeting as before, no states
--   trigger    a browser's write is held to the plan; unchanged targeting isn't re-checked
--   access     the resolver is the payment functions'; active_ads stays open to everyone
-- HOW TO RUN (local stack with P0-P5 applied, or: begin; <P5>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p5$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  other   uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  buyer   uuid;
  prod    uuid := 'a5000000-0000-4000-8000-000000000001';
  ad_gj   uuid := 'a5000000-0000-4000-8000-0000000000a1';   -- states {GJ}
  ad_all  uuid := 'a5000000-0000-4000-8000-0000000000a2';   -- nothing named
  ad_city uuid := 'a5000000-0000-4000-8000-0000000000a3';   -- older: cities ["mumbai"]
  ad_us   uuid := 'a5000000-0000-4000-8000-0000000000a4';   -- countries {US}, all India
  a       public.advertisements;
  labels text[] := array[
    'states: buyers there and buyers whose state isn''t known',          -- 1
    'an overseas buyer sees only an ad that lists their country',        -- 2
    'an older city ad matches as before; an untargeted ad, everyone',    -- 3
    'active_ads for a buyer in the state, in another, and signed out',   -- 4
    'Free: no ads',                                                      -- 5
    'one state: none named is the vendor''s own; two refused or clamped',-- 6
    'one state, none named, no state on the profile: asked to choose',   -- 7
    'four states: four allowed, five refused',                           -- 8
    'pan-India: none named is all of India; countries need VIP',         -- 9
    'VIP: countries kept, India and bad codes dropped',                  -- 10
    'codes are tidied; an unknown state is refused or dropped',          -- 11
    'the grace days keep the plan''s reach',                             -- 12
    'switch off: no states, cities kept to the plan''s count',            -- 13
    'browser: a new ad on a one-state plan gets the vendor''s state',    -- 14
    'browser: more states than the plan refused; a Free vendor refused', -- 15
    'browser: an edit that leaves targeting alone isn''t re-checked',    -- 16
    'browser, switch off: the city rule as before',                      -- 17
    'the resolver is the payment functions''; the check is own-ad only', -- 18
    'active_ads stays open to signed-out buyers'];                       -- 19
  got text; want text; i int; j jsonb;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  select b.id into buyer from public.buyer_profiles b where b.id not in (vendor, other) order by b.created_at limit 1;
  if buyer is null then raise exception 'the harness needs one buyer profile'; end if;
  update public.feature_flags set enabled = false, allow_profile_ids = array[vendor] where key in ('ad_state_targeting', 'subscription_lifecycle');
  update admin.billing_settings set grace_days = 7;
  update public.vendor_profiles set brand_name = 'P5 Vendor', state_code = 'GJ' where id = vendor;
  delete from public.subscription_mandates where vendor_id = vendor;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'basic', 'monthly', 'active', now() - interval '10 days', now() + interval '20 days')
  on conflict (vendor_id) do update set plan_id = 'basic', billing_cycle = 'monthly', status = 'active',
    current_period_start = now() - interval '10 days', current_period_end = now() + interval '20 days',
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (other, 'P5 other vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  delete from public.vendor_subscriptions where vendor_id = other;
  delete from public.advertisements where vendor_id in (vendor, other);
  insert into public.products (id, vendor_id, name, status) values (prod, vendor, 'P5 product', 'live');
  -- Running ads as review would leave them (the triggers that send a new ad to review are bypassed).
  set local session_replication_role = replica;
  insert into public.advertisements (id, vendor_id, product_id, title, placement, status, starts_at, ends_at, target_states, target_countries, target_cities) values
    (ad_gj,   vendor, prod, 'P5 Gujarat',  'openListing', 'active', now() - interval '1 day', now() + interval '5 days', '{GJ}', '{}', null),
    (ad_all,  vendor, prod, 'P5 all',      'openListing', 'active', now() - interval '1 day', now() + interval '5 days', '{}',   '{}', null),
    (ad_city, vendor, prod, 'P5 Mumbai',   'openListing', 'active', now() - interval '1 day', now() + interval '5 days', '{}',   '{}', '["mumbai"]'),
    (ad_us,   vendor, prod, 'P5 overseas', 'openListing', 'active', now() - interval '1 day', now() + interval '5 days', '{}',   '{US}', null);
  set local session_replication_role = origin;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', '', true);
      if i = 1 then
        select * into a from public.advertisements where id = ad_gj;
        got := public.ad_targeting_matches(a, null, null, 'GJ', null) || '/' || public.ad_targeting_matches(a, null, null, 'MH', null)
               || '/' || public.ad_targeting_matches(a, null, 'mumbai', null, null) || '/' || public.ad_targeting_matches(a, null, null, 'GJ', 'IN');
        want := 'true/false/true/true';
      elsif i = 2 then
        select * into a from public.advertisements where id = ad_us;
        got := public.ad_targeting_matches(a, null, null, null, 'US') || '/' || public.ad_targeting_matches(a, null, null, null, 'GB')
               || '/' || public.ad_targeting_matches(a, null, null, 'MH', null);
        select * into a from public.advertisements where id = ad_gj;
        got := got || ' ' || public.ad_targeting_matches(a, null, null, 'GJ', 'US');
        select * into a from public.advertisements where id = ad_all;
        got := got || ' ' || public.ad_targeting_matches(a, null, null, null, 'US');
        want := 'true/false/true false false';
      elsif i = 3 then
        select * into a from public.advertisements where id = ad_city;
        got := public.ad_targeting_matches(a, null, 'mumbai', 'MH', null) || '/' || public.ad_targeting_matches(a, null, 'delhi', 'DL', null)
               || '/' || public.ad_targeting_matches(a, null, null, null, null) || '/' || public.ad_targeting_matches(a, null, 'mumbai');
        select * into a from public.advertisements where id = ad_all;
        got := got || ' ' || public.ad_targeting_matches(a, null, null, 'MH', null) || '/' || public.ad_targeting_matches(a, null, null);
        want := 'true/false/false/true true/true';
      elsif i = 4 then
        update public.buyer_profiles set state_code = 'GJ', city = 'Surat' where id = buyer;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := (select string_agg(x.title, ',' order by x.title collate "C") from public.active_ads(50) x where x.vendor_id = vendor);
        reset role;
        update public.buyer_profiles set state_code = 'MH', city = 'Mumbai' where id = buyer;
        set local role authenticated;
        got := got || ' | ' || (select string_agg(x.title, ',' order by x.title collate "C") from public.active_ads(50) x where x.vendor_id = vendor);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        got := got || ' | ' || (select string_agg(x.title, ',' order by x.title collate "C") from public.active_ads(50) x where x.vendor_id = vendor);
        reset role;
        want := 'P5 Gujarat,P5 all,P5 overseas | P5 Mumbai,P5 all,P5 overseas | P5 Gujarat,P5 all,P5 overseas';
      elsif i = 5 then
        j := admin.ad_reach(other, '{GJ}', '{}', '[]', true);
        got := (j ->> 'ok') || '/' || (j ->> 'blocked') || '/' || (j ->> 'reason');
        j := admin.ad_reach(other, '{GJ}', '{}', '[]', false);
        got := got || ' ' || (j ->> 'blocked') || ' ' || ((j ->> 'message') like 'Advertising is a paid feature%');
        want := 'false/true/no_ads_on_plan true true';
      elsif i = 6 then
        j := admin.ad_reach(vendor, '{}', '{}', '[]', true);
        got := (j ->> 'ok') || (j -> 'states')::text;
        j := admin.ad_reach(vendor, '{MH}', '{}', '["mumbai"]', true);
        got := got || ' ' || (j -> 'states')::text || (j -> 'cities')::text;
        j := admin.ad_reach(vendor, '{MH,GJ}', '{}', '[]', true);
        got := got || ' ' || (j ->> 'ok') || '/' || (j ->> 'reason');
        j := admin.ad_reach(vendor, '{MH,GJ}', '{}', '[]', false);
        got := got || ' ' || (j ->> 'ok') || (j -> 'states')::text || '/' || (j ->> 'requested') || '>' || (j ->> 'allowed');
        want := 'true["GJ"] ["MH"][] false/too_many_states true["MH"]/2>1';
      elsif i = 7 then
        update public.vendor_profiles set state_code = null, state = null where id = vendor;
        j := admin.ad_reach(vendor, '{}', '{}', '[]', true);
        got := (j ->> 'ok') || '/' || (j ->> 'blocked') || '/' || (j ->> 'reason');
        j := admin.ad_reach(vendor, '{}', '{}', '[]', false);
        got := got || ' ' || (j ->> 'ok') || '/' || (j ->> 'blocked');
        j := admin.ad_reach(vendor, '{KA}', '{}', '[]', false);
        got := got || ' ' || (j ->> 'ok') || (j -> 'states')::text;
        want := 'false/false/choose_state false/true true["KA"]';
      elsif i = 8 then
        update public.vendor_subscriptions set plan_id = 'silver' where vendor_id = vendor;
        j := admin.ad_reach(vendor, '{GJ,MH,RJ,DL}', '{}', '[]', true);
        got := (j ->> 'ok') || '/' || jsonb_array_length(j -> 'states');
        j := admin.ad_reach(vendor, '{GJ,MH,RJ,DL,KA}', '{}', '[]', true);
        got := got || ' ' || (j ->> 'ok') || '/' || (j ->> 'reason');
        j := admin.ad_reach(vendor, '{GJ,MH,RJ,DL,KA}', '{}', '[]', false);
        got := got || ' ' || (j -> 'states')::text;
        want := 'true/4 false/too_many_states ["GJ", "MH", "RJ", "DL"]';
      elsif i = 9 then
        update public.vendor_subscriptions set plan_id = 'gold' where vendor_id = vendor;
        j := admin.ad_reach(vendor, '{}', '{}', '[]', true);
        got := (j ->> 'ok') || (j -> 'states')::text;
        j := admin.ad_reach(vendor, '{GJ,MH,RJ,DL,KA,TN}', '{}', '[]', true);
        got := got || ' ' || jsonb_array_length(j -> 'states');
        j := admin.ad_reach(vendor, '{}', '{US}', '[]', true);
        got := got || ' ' || (j ->> 'ok') || '/' || (j ->> 'reason');
        j := admin.ad_reach(vendor, '{}', '{US}', '[]', false);
        got := got || ' ' || (j ->> 'ok') || (j -> 'countries')::text;
        want := 'true[] 6 false/countries_need_vip true[]';
      elsif i = 10 then
        update public.vendor_subscriptions set plan_id = 'vip' where vendor_id = vendor;
        j := admin.ad_reach(vendor, '{GJ}', array['us', 'IN', 'gb', 'USA', 'us'], '[]', true);
        got := (j ->> 'ok') || (j -> 'states')::text || (j -> 'countries')::text;
        want := 'true["GJ"]["US", "GB"]';
      elsif i = 11 then
        update public.vendor_subscriptions set plan_id = 'gold' where vendor_id = vendor;
        j := admin.ad_reach(vendor, array['gj', 'GJ', ' mh ', null, ''], '{}', '[]', true);
        got := (j -> 'states')::text;
        j := admin.ad_reach(vendor, '{GJ,ZZ}', '{}', '[]', true);
        got := got || ' ' || (j ->> 'ok') || '/' || (j ->> 'reason');
        j := admin.ad_reach(vendor, '{GJ,ZZ}', '{}', '[]', false);
        got := got || ' ' || (j -> 'states')::text;
        want := '["GJ", "MH"] false/unknown_state ["GJ"]';
      elsif i = 12 then
        update public.vendor_subscriptions set plan_id = 'gold', current_period_end = now() - interval '2 days' where vendor_id = vendor;
        j := admin.ad_reach(vendor, '{}', '{}', '[]', true);
        got := (j ->> 'ok') || '/' || (j ->> 'scope');
        update public.feature_flags set allow_profile_ids = '{}' where key = 'subscription_lifecycle';
        j := admin.ad_reach(vendor, '{}', '{}', '[]', true);
        got := got || ' ' || (j ->> 'ok') || '/' || (j ->> 'reason');
        want := 'true/pan_india false/no_ads_on_plan';
      elsif i = 13 then
        update public.feature_flags set allow_profile_ids = '{}' where key = 'ad_state_targeting';
        j := admin.ad_reach(vendor, '{MH,GJ}', '{US}', '["mumbai", "delhi", "pune"]', false);
        got := (j ->> 'state_targeting') || (j -> 'states')::text || (j -> 'countries')::text || (j -> 'cities')::text || (j ->> 'requested') || '>' || (j ->> 'allowed');
        j := admin.ad_reach(vendor, '{}', '{}', '["mumbai", "delhi", "pune"]', true);
        got := got || ' ' || (j ->> 'ok') || jsonb_array_length(j -> 'cities') || '/' || (j ->> 'allowance');
        want := 'false[][]["mumbai"]3>1 true1/1';
      elsif i = 14 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.advertisements (vendor_id, title, status, target_cities) values (vendor, 'P5 browser ad', 'draft', '["mumbai"]');
        reset role;
        got := (select target_states::text || '/' || target_countries::text || '/' || coalesce(target_cities::text, 'null')
                  from public.advertisements where vendor_id = vendor and title = 'P5 browser ad');
        want := '{GJ}/{}/null';
      elsif i = 15 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          insert into public.advertisements (vendor_id, title, status, target_states) values (vendor, 'P5 two states', 'draft', '{GJ,MH}');
          got := 'two allowed';
        exception when sqlstate 'P0001' then got := case when sqlerrm like 'Ad targeting exceeds your plan: Basic reaches up to 1 state;%' then 'two refused' else sqlerrm end;
        end;
        begin
          insert into public.advertisements (vendor_id, title, status, target_countries) values (vendor, 'P5 abroad', 'draft', '{US}');
          got := got || ', abroad allowed';
        exception when sqlstate 'P0001' then got := got || case when sqlerrm = 'Reaching buyers outside India is part of the VIP plan.' then ', abroad refused' else ', ' || sqlerrm end;
        end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          insert into public.advertisements (vendor_id, title, status) values (other, 'P5 free ad', 'draft');
          got := got || ', free allowed';
        exception when sqlstate 'P0001' then got := got || case when sqlerrm like 'Advertising is a paid feature%' then ', free refused' else ', ' || sqlerrm end;
        end;
        reset role;
        want := 'two refused, abroad refused, free refused';
      elsif i = 16 then
        -- An ad that reaches more than the plan now allows (bought on a bigger plan), sent back
        -- for changes: the one time its owner edits a submitted ad (server_owned_columns).
        set local session_replication_role = replica;
        update public.advertisements set target_states = '{GJ,MH,RJ}', status = 'changes_requested' where id = ad_gj;
        set local session_replication_role = origin;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.advertisements set title = 'P5 Gujarat, renamed' where id = ad_gj;
        got := 'renamed';
        begin
          update public.advertisements set target_states = '{GJ,MH}' where id = ad_gj;
          got := got || ', narrowed to two';
        exception when sqlstate 'P0001' then got := got || ', two refused';
        end;
        update public.advertisements set target_states = '{MH}' where id = ad_gj;
        reset role;
        set local session_replication_role = replica;
        update public.advertisements set status = 'active' where id = ad_gj;
        set local session_replication_role = origin;
        got := got || ', ' || (select title || ' ' || target_states::text from public.advertisements where id = ad_gj);
        want := 'renamed, two refused, P5 Gujarat, renamed {MH}';
      elsif i = 17 then
        update public.feature_flags set allow_profile_ids = '{}' where key = 'ad_state_targeting';
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.advertisements (vendor_id, title, status, target_cities, target_states) values (vendor, 'P5 one city', 'draft', '["mumbai"]', '{MH}');
        begin
          insert into public.advertisements (vendor_id, title, status, target_cities) values (vendor, 'P5 two cities', 'draft', '["mumbai", "delhi"]');
          got := 'two cities allowed';
        exception when sqlstate 'P0001' then got := case when sqlerrm = 'Ad targeting exceeds your plan: basic (state_1) allows up to 1 target location(s); this ad targets 2.' then 'two cities refused' else sqlerrm end;
        end;
        reset role;
        got := got || ', ' || (select target_states::text || '/' || target_cities::text from public.advertisements where vendor_id = vendor and title = 'P5 one city');
        want := 'two cities refused, {}/["mumbai"]';
      elsif i = 18 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin perform public.ad_reach_resolve(vendor, '{}', '{}', '[]', false); got := got || 'resolver ran ';
        exception when insufficient_privilege then got := got || 'resolver refused '; end;
        begin perform public.ad_reach_check(other, '{}', '{}', '[]'); got := got || 'other checked ';
        exception when insufficient_privilege then got := got || 'other refused '; end;
        j := public.ad_reach_check(vendor, '{}', '{}', '[]');
        reset role;
        got := got || 'own ' || (j ->> 'ok');
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        j := public.ad_reach_resolve(vendor, '{MH,GJ}', '{}', '[]', false);
        reset role;
        got := got || ' service ' || (j -> 'states')::text;
        want := 'resolver refused other refused own true service ["MH"]';
      elsif i = 19 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        got := (select (count(*) >= 3)::text from public.active_ads(50) x where x.vendor_id = vendor);
        begin perform public.ad_viewer_location(); got := got || ' location read';
        exception when insufficient_privilege then got := got || ' location refused'; end;
        reset role;
        want := 'true location refused';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P5 (rolled back)%', E'\n' || out;
end
$p5$;
