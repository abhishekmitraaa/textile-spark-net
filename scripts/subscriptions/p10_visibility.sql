-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P10: featured listings, the spotlight, impressions (2026-10-09).
-- Migration 20261009140000_subscriptions_p10_visibility.sql (on top of P0-P9).
--   places     up to 10 on a category page: 1-5 by tier (VIP, Gold, then Silver if room), 6-10
--              rotating among the rest; one per seller, its best seller; the subtree counts
--   who        lapsed, suspended, Basic and Free sellers never; the viewer's own never
--   nearby     Gold and VIP sellers in or serving the buyer's state first within their tier
--   rotation   by day and session: the same session sees the same order, others take turns
--   spotlight  VIP products only, one per seller first
--   impressions only eligible products, once per 30 minutes, at most 20 a call
--   page       the seller's totals; entitlements; the switch; grants
-- Its own test categories, so other local data can't change the counts. Never commits.
-- HOW TO RUN (local stack with P0-P10 applied, or: begin; <P10>; <this>; rollback;).
-- ─────────────────────────────────────────────────────────────────────────────
do $p10$
declare
  v       uuid[];          -- 14 sellers by plan, in this order:
  plans   text[] := array['vip','vip','gold','gold','gold','gold','gold','gold','silver','silver','silver','silver','basic','free'];
  buyer   uuid;
  cat     uuid := 'a1000000-0000-4000-8000-0000000000aa';
  sub     uuid := 'a1000000-0000-4000-8000-0000000000ab';
  labels text[] := array[
    'the switch is about the viewer',                                         -- 1
    'ten places: 1-5 by tier, 6-10 rotating; one each; never Basic or Free',  -- 2
    'a seller''s best-selling product there, from the whole subtree',        -- 3
    'a lapsed or suspended seller, and the viewer''s own, never',            -- 4
    'one Silver seller alone takes place 1',                                 -- 5
    'rotation: steady for a session, turns across sessions',                 -- 6
    'nearby Gold sellers first among Gold',                                   -- 7
    'spotlight: VIP products only, a seller''s best first',                  -- 8
    'impressions: eligible only, once per 30 minutes, 20 at most',           -- 9
    'the Visibility page''s figures',                                        -- 10
    'entitlements: the place and the page',                                  -- 11
    'grants: browsing is open, impressions are the functions''',             -- 12
    'places 6-10 give Silver turns'];                                         -- 13
  got text; want text; i int; n int; k int; j jsonb; j2 jsonb; s text; x uuid;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  select array_agg(y.id order by y.id) into v
    from (select vp.id from public.vendor_profiles vp join public.profiles p on p.id = vp.id
           where vp.id not in ('22222222-2222-2222-2222-222222222222', '02d5183b-f984-4ca9-a7cb-684564e37789')
           order by vp.id limit 14) y;
  select b.id into buyer from public.buyer_profiles b where b.id <> all (v) order by b.created_at limit 1;
  if cardinality(v) < 14 or buyer is null then
    raise exception 'the harness needs 14 local vendors and a buyer';
  end if;
  insert into public.categories (id, name, parent_id) values (cat, 'P10 Test Category', null), (sub, 'P10 Test Sub', cat);
  update public.feature_flags set enabled = false, allow_profile_ids = array[buyer] || v where key = 'featured_listings';
  update public.profiles set account_status = 'active' where id = any (v || buyer);
  update public.buyer_profiles set state_code = 'GJ' where id = buyer;
  update public.vendor_profiles set state_code = 'MH', served_states = '{}' where id = any (v);
  for k in 1..14 loop
    update public.vendor_profiles set plan_id = case when plans[k] = 'free' then null else plans[k] end,
           plan_expires_at = case when plans[k] = 'free' then null else now() + interval '20 days' end
     where id = v[k];
    -- Two products each: a better seller in the sub-category, a lesser one in the parent.
    insert into public.products (vendor_id, name, status, category_id, sold_count, enquiries_count)
    values (v[k], 'P10 best ' || k, 'live', sub, 100 + k, 5), (v[k], 'P10 other ' || k, 'live', cat, 1, 0);
  end loop;
  delete from public.featured_impressions where vendor_id = any (v);

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
      if i = 1 then
        set local role authenticated;
        got := public.featured_listings_on()::text || ' n=' || jsonb_array_length(public.featured_listings(cat, 's1'));
        reset role;
        update public.feature_flags set allow_profile_ids = v where key = 'featured_listings';
        set local role authenticated;
        got := got || ' off=' || public.featured_listings_on()::text || ' n=' || jsonb_array_length(public.featured_listings(cat, 's1'))
               || ' spot=' || jsonb_array_length(public.spotlight_listings(null, 's1'));
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        got := got || ' anon=' || jsonb_array_length(public.featured_listings(cat, 's1'));
        reset role;
        update public.feature_flags set enabled = true where key = 'featured_listings';
        set local role anon;
        got := got || ' everyone on: anon=' || jsonb_array_length(public.featured_listings(cat, 's1'));
        reset role;
        want := 'true n=10 off=false n=0 spot=0 anon=0 everyone on: anon=10';
      elsif i = 2 then
        set local role authenticated;
        j := public.featured_listings(cat, 's2');
        reset role;
        got := 'n=' || jsonb_array_length(j)
               || ' tiers=' || (select string_agg(e ->> 'tier', ',' order by (e ->> 'slot')::int) from jsonb_array_elements(j) e where (e ->> 'slot')::int <= 5)
               || ' sellers=' || (select count(distinct e ->> 'vendor_id') from jsonb_array_elements(j) e)
               || ' basic/free=' || (select count(*) from jsonb_array_elements(j) e where (e ->> 'vendor_id')::uuid in (v[13], v[14]))
               || ' rest=' || (select count(*) from jsonb_array_elements(j) e where (e ->> 'slot')::int > 5 and e ->> 'tier' in ('top5', 'top10'));
        want := 'n=10 tiers=spotlight,spotlight,top5,top5,top5 sellers=10 basic/free=0 rest=5';
      elsif i = 3 then
        set local role authenticated;
        j := public.featured_listings(cat, 's3');
        j2 := public.featured_listings(sub, 's3');
        reset role;
        got := (select string_agg(distinct split_part(p.name, ' ', 2), ',') from jsonb_array_elements(j) e join public.products p on p.id = (e ->> 'product_id')::uuid)
               || ' sub=' || jsonb_array_length(j2);
        want := 'best sub=10';
      elsif i = 4 then
        update public.vendor_profiles set plan_expires_at = now() - interval '1 day' where id = v[1];
        update public.profiles set account_status = 'suspended' where id = v[2];
        set local role authenticated;
        j := public.featured_listings(cat, 's4');
        reset role;
        got := 'vips=' || (select count(*) from jsonb_array_elements(j) e where (e ->> 'vendor_id')::uuid in (v[1], v[2]))
               || ' first=' || (select e ->> 'tier' from jsonb_array_elements(j) e where (e ->> 'slot')::int = 1);
        -- A seller browsing their own category doesn't see themselves featured.
        perform set_config('request.jwt.claims', json_build_object('sub', v[3], 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.featured_listings(cat, 's4');
        reset role;
        got := got || ' own=' || (select count(*) from jsonb_array_elements(j) e where (e ->> 'vendor_id')::uuid = v[3]);
        want := 'vips=0 first=top5 own=0';
      elsif i = 5 then
        update public.products set status = 'draft' where vendor_id = any (v) and vendor_id <> v[9];
        set local role authenticated;
        j := public.featured_listings(cat, 's5');
        reset role;
        got := jsonb_array_length(j) || ' ' || (j -> 0 ->> 'slot') || '/' || (j -> 0 ->> 'tier');
        want := '1 1/top10';
      elsif i = 6 then
        set local role authenticated;
        got := ((public.featured_listings(cat, 'steady') -> 0) = (public.featured_listings(cat, 'steady') -> 0))::text;
        s := '';
        for k in 1..30 loop
          s := s || (public.featured_listings(cat, 'turn-' || k) -> 0 ->> 'vendor_id') || ',';
        end loop;
        reset role;
        got := got || ' both vips lead sometimes=' || (position(v[1]::text in s) > 0 and position(v[2]::text in s) > 0)::text;
        want := 'true both vips lead sometimes=true';
      elsif i = 7 then
        update public.vendor_profiles set served_states = array['GJ', 'RJ'] where id = v[8];   -- one Gold seller serves the buyer's state
        set local role authenticated;
        n := 0;
        for k in 1..20 loop
          j := public.featured_listings(cat, 'near-' || k);
          if (j -> 2 ->> 'vendor_id')::uuid = v[8] then n := n + 1; end if;   -- place 3: the first after the two VIP sellers
        end loop;
        got := 'near first=' || n || '/20 flag=' || (select e ->> 'nearby' from jsonb_array_elements(public.featured_listings(cat, 'near-1')) e where (e ->> 'vendor_id')::uuid = v[8]);
        reset role;
        want := 'near first=20/20 flag=true';
      elsif i = 8 then
        set local role authenticated;
        j := public.spotlight_listings(null, 'sp', 12);
        j2 := public.spotlight_listings(sub, 'sp', 12);
        reset role;
        got := 'n=' || jsonb_array_length(j) || ' vendors=' || (select count(distinct e ->> 'vendor_id') from jsonb_array_elements(j) e)
               || ' only vip=' || (select bool_and((e ->> 'vendor_id')::uuid in (v[1], v[2])) from jsonb_array_elements(j) e)::text
               || ' first two=' || (select string_agg(distinct split_part(p.name, ' ', 2), ',') from jsonb_array_elements(j) with ordinality e(x, o)
                                      join public.products p on p.id = (e.x ->> 'product_id')::uuid where e.o <= 2)
               || ' sub=' || jsonb_array_length(j2);
        want := 'n=4 vendors=2 only vip=true first two=best sub=2';
      elsif i = 9 then
        set local role authenticated;
        select p.id into x from public.products p where p.vendor_id = v[3] and p.name like 'P10 best%';
        n := public.log_featured_impressions(jsonb_build_array(jsonb_build_object('product_id', x, 'placement', 'featured')), 'imp');
        got := 'first=' || n;
        n := public.log_featured_impressions(jsonb_build_array(jsonb_build_object('product_id', x, 'placement', 'featured')), 'imp');
        got := got || ' again=' || n;
        n := public.log_featured_impressions(jsonb_build_array(jsonb_build_object('product_id', x, 'placement', 'spotlight')), 'imp');
        got := got || ' gold as spotlight=' || n;
        select p.id into x from public.products p where p.vendor_id = v[13] and p.name like 'P10 best%';
        n := public.log_featured_impressions(jsonb_build_array(jsonb_build_object('product_id', x, 'placement', 'featured')), 'imp');
        got := got || ' basic=' || n;
        begin perform public.log_featured_impressions((select jsonb_agg(jsonb_build_object('product_id', x, 'placement', 'featured')) from generate_series(1, 21)), 'imp');
          got := got || ' 21 taken';
        exception when sqlstate '22023' then got := got || ' 21 refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        select p.id into x from public.products p where p.vendor_id = v[1] and p.name like 'P10 best%';
        n := public.log_featured_impressions(jsonb_build_array(jsonb_build_object('product_id', x, 'placement', 'spotlight')), null);
        got := got || ' anon no session=' || n;
        reset role;
        got := got || ' rows=' || (select count(*) from public.featured_impressions where vendor_id = any (v));
        want := 'first=1 again=0 gold as spotlight=0 basic=0 21 refused anon no session=0 rows=1';
      elsif i = 10 then
        insert into public.featured_impressions (vendor_id, product_id, placement, session_id, created_at)
        select v[1], p.id, pl, 'h' || g, now() - make_interval(days => g % 40)
          from public.products p, unnest(array['featured', 'spotlight']) pl, generate_series(1, 40) g
         where p.vendor_id = v[1] and p.name like 'P10 best%';
        perform set_config('request.jwt.claims', json_build_object('sub', v[1], 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_visibility(30);
        reset role;
        got := (j ->> 'featured') || ' boost=' || (j ->> 'boost') || ' featured=' || (j -> 'impressions' ->> 'featured')
               || ' spotlight=' || (j -> 'impressions' ->> 'spotlight') || ' days=' || jsonb_array_length(j -> 'impressions' -> 'by_day')
               || ' categories=' || (select string_agg(e ->> 'name', ',' order by e ->> 'name') from jsonb_array_elements(j -> 'categories') e);
        want := 'spotlight boost=4 featured=30 spotlight=30 days=30 categories=P10 Test Category,P10 Test Sub';
      elsif i = 11 then
        insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
        select y.w, y.p, 'monthly', 'active', now() - interval '5 days', now() + interval '25 days'
          from (values (v[1], 'vip'), (v[3], 'gold'), (v[9], 'silver'), (v[13], 'basic')) as y(w, p)
        on conflict (vendor_id) do update set plan_id = excluded.plan_id, status = 'active', current_period_end = excluded.current_period_end,
          scheduled_plan_id = null, scheduled_from = null;
        delete from public.vendor_subscriptions where vendor_id = v[14];
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        got := '';
        foreach x in array array[v[1], v[3], v[9], v[13], v[14]] loop
          j := public.vendor_entitlements(x) -> 'features';
          got := got || (j ->> 'featured') || '/' || (j ->> 'visibility_page') || ' ';
        end loop;
        update public.feature_flags set allow_profile_ids = '{}' where key = 'featured_listings';
        j := public.vendor_entitlements(v[1]) -> 'features';
        got := got || 'off=' || (j ->> 'visibility_page');
        want := 'spotlight/true top5/true top10/true none/true none/false off=false';
      elsif i = 12 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        got := 'anon on=' || public.featured_listings_on()::text;
        begin perform count(*) from public.featured_impressions; got := got || ' read';
        exception when insufficient_privilege then got := got || ' read refused'; end;
        begin perform public.my_visibility(); got := got || ' page';
        exception when insufficient_privilege then got := got || ' page refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin insert into public.featured_impressions (vendor_id, product_id, placement) select v[1], p.id, 'spotlight' from public.products p where p.vendor_id = v[1] limit 1; got := got || ' inserted';
        exception when insufficient_privilege then got := got || ' insert refused'; end;
        begin perform admin.vendor_featured_tier(v[1]); got := got || ' tier read';
        exception when insufficient_privilege then got := got || ' tier refused'; end;
        reset role;
        want := 'anon on=false read refused page refused insert refused tier refused';
      elsif i = 13 then
        set local role authenticated;
        s := '';
        for k in 1..40 loop
          j := public.featured_listings(cat, 'silver-' || k);
          s := s || coalesce((select string_agg(e ->> 'vendor_id', ',') from jsonb_array_elements(j) e where (e ->> 'slot')::int > 5), '') || ',';
        end loop;
        reset role;
        got := 'silvers with a turn=' || (select count(*) from unnest(v[9:12]) w where position(w::text in s) > 0)
               || ' golds in 6-10 sometimes=' || ((select count(*) from unnest(v[3:8]) w where position(w::text in s) > 0) > 0)::text;
        want := 'silvers with a turn=4 golds in 6-10 sometimes=true';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P10 (rolled back)%', E'\n' || out;
end
$p10$;
