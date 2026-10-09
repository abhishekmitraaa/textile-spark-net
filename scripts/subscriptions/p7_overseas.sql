-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P7: overseas requirements (2026-10-09).
-- Migration 20261009110000_subscriptions_p7_overseas.sql (on top of P0-P6).
--   country   a typed name becomes a code; the buyer's code follows their country
--   stamp     an overseas buyer's requirement is marked, with VIP's head start when a VIP
--             vendor lists in its category; an Indian buyer's, and an unlisted buyer's, isn't
--   read      during the head start: VIP, the buyer and admins. After it: Gold too. Never
--             Free to Silver, except a vendor who already quoted. An Indian requirement is
--             everyone's, as before
--   feed      match_vendor_rfqs and the quote guard follow the same rule
--   alerts    VIP is told during the head start, Gold once it is over
--   others    the count; entitlements; what a browser can't call
-- The three stamped columns can't be written through the API: that is checked over HTTP in
-- test.md's end-to-end run (this harness connects as postgres, which the rule trusts).
-- HOW TO RUN (local stack with P0-P7 applied, or: begin; <P7>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p7$
declare
  gold    uuid := '22222222-2222-2222-2222-222222222222';
  free    uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  basic   uuid;
  silver  uuid;
  vip     uuid;
  abroad  uuid;   -- a buyer in the United States, on the switch
  home    uuid;   -- a buyer in India
  admin_id uuid := '33333333-3333-3333-3333-333333333333';
  c1      uuid;   -- every vendor lists here (so a VIP vendor does)
  c2      uuid;   -- only the Gold vendor lists here
  everyone uuid[];
  rfq     uuid := 'a7000000-0000-4000-8000-000000000001';
  rfq2    uuid := 'a7000000-0000-4000-8000-000000000002';
  rfq3    uuid := 'a7000000-0000-4000-8000-000000000003';
  rfq4    uuid := 'a7000000-0000-4000-8000-000000000004';
  labels text[] := array[
    'a typed country becomes a code; the buyer''s code follows',           -- 1
    'an overseas buyer''s requirement is stamped, with VIP''s head start', -- 2
    'an Indian buyer''s, and an unlisted buyer''s, isn''t marked',         -- 3
    'no VIP vendor in the category: no head start',                        -- 4
    'sent to one vendor: theirs to read and quote, no head start',         -- 5
    'who can read it during the head start',                               -- 6
    'after the head start: Gold too, still not Silver',                    -- 7
    'an Indian requirement is everyone''s, as before',                     -- 8
    'a vendor who already quoted keeps seeing it',                         -- 9
    'the ranked feed follows the same rule',                               -- 10
    'a quote can''t be sent on one the vendor can''t see',                 -- 11
    'everyone else is told a number, and nothing more',                    -- 12
    'entitlements: Gold and VIP, on the switch; the grace days count',     -- 13
    'lead alerts: VIP during the head start, Gold once it is over',        -- 14
    'head start of 0 hours: Gold at once',                                 -- 15
    'switch off: nothing is marked and everyone reads everything',         -- 16
    'a tier, the stamp and the list are not a browser''s to call or write', -- 17
    'staff see the marking on the requirement''s detail',                 -- 18
    'the head start can''t be skipped by the buyer''s later edits'];       -- 19
  got text; want text; i int; n int; n0 int; n1 int; j jsonb;
  out text := '';

  -- How many of the three requirements the caller's session can read.
  who text;
begin
  -- Fixtures (rolled back with everything else).
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (free, 'P7 free vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  select array_agg(x.id order by x.id) into everyone
    from (select v.id from public.vendor_profiles v join public.profiles p on p.id = v.id
           where v.id not in (gold, free) order by v.id limit 3) x;
  basic := everyone[1]; silver := everyone[2]; vip := everyone[3];
  select array_agg(x.id order by x.created_at) into everyone
    from (select b.id, b.created_at from public.buyer_profiles b where b.id not in (gold, free, basic, silver, vip) order by b.created_at limit 2) x;
  abroad := everyone[1]; home := everyone[2];
  select c.id into c1 from public.categories c where c.name = 'Activewear' limit 1;
  select c.id into c2 from public.categories c where c.name = 'Dress' limit 1;
  if vip is null or home is null or c1 is null or c2 is null then
    raise exception 'the harness needs three more local vendors, two buyers and the Activewear and Dress categories';
  end if;
  everyone := array[gold, free, basic, silver, vip];

  update public.feature_flags set enabled = false, allow_profile_ids = everyone || abroad where key = 'overseas_leads';
  update public.feature_flags set enabled = false, allow_profile_ids = everyone where key in ('lead_alerts', 'notification_delivery');
  update public.feature_flags set enabled = false, allow_profile_ids = array[gold] where key = 'subscription_lifecycle';
  update admin.lead_alert_config set min_similarity = 0.35, max_vendors = 50, hourly_cap = 10, max_age_hours = 48, buyer_daily_cap = 50, overseas_head_start_hours = 24;
  update admin.billing_settings set grace_days = 7;
  update public.profiles set account_status = 'active' where id = any (everyone || array[abroad, home]);
  update public.buyer_profiles set country = 'United States', country_code = 'US' where id = abroad;
  update public.buyer_profiles set country = 'India', country_code = 'IN' where id = home;
  update public.vendor_profiles set catalog_embedding = null, notifications = '{}'::jsonb where id = any (everyone);
  delete from public.lead_alert_settings where vendor_id = any (everyone);
  delete from public.subscription_mandates where vendor_id = any (everyone);
  delete from public.notifications where profile_id = any (everyone);
  delete from admin.lead_alerts;
  delete from admin.lead_alert_runs;
  update public.products set status = 'draft' where (vendor_id = any (everyone) or category_id in (c1, c2)) and status <> 'draft';
  insert into public.products (vendor_id, name, status, category_id) select v, 'P7 listing', 'live', c1 from unnest(everyone) v;
  insert into public.products (vendor_id, name, status, category_id) values (gold, 'P7 dress', 'live', c2);
  delete from public.vendor_subscriptions where vendor_id = free;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  select x.v, x.p, 'monthly', 'active', now() - interval '5 days', now() + interval '25 days'
    from (values (gold, 'gold'), (basic, 'basic'), (silver, 'silver'), (vip, 'vip')) as x(v, p)
  on conflict (vendor_id) do update set plan_id = excluded.plan_id, billing_cycle = 'monthly', status = 'active',
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', '', true);
      if i = 1 then
        got := coalesce(public.country_code_for('u.s.a.'), 'null') || '/' || coalesce(public.country_code_for('Bharat'), 'null') || '/' || coalesce(public.country_code_for('United  Arab Emirates'), 'null')
               || '/' || coalesce(public.country_code_for('Nowhere'), 'null') || '/' || coalesce(public.country_code_for(''), 'null');
        update public.buyer_profiles set country = 'germany' where id = abroad;
        got := got || ' ' || (select country_code from public.buyer_profiles where id = abroad);
        update public.buyer_profiles set country = 'Atlantis' where id = abroad;
        got := got || ' ' || coalesce((select country_code from public.buyer_profiles where id = abroad), 'null');
        update public.buyer_profiles set country = 'France', country_code = 'BD' where id = abroad;   -- the writer's own code wins
        got := got || ' ' || (select country_code from public.buyer_profiles where id = abroad);
        want := 'US/IN/AE/null/null DE null BD';
      elsif i = 2 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 overseas', c1);
        got := (select buyer_country_code || '/' || overseas || '/' || (overseas_vip_until = now() + interval '24 hours') from public.rfqs where id = rfq);
        -- A hand-written value on insert is replaced.
        insert into public.rfqs (id, buyer_id, title, category_id, overseas, buyer_country_code, overseas_vip_until)
        values (rfq2, abroad, 'P7 forged', c1, false, 'IN', null);
        got := got || ' ' || (select buyer_country_code || '/' || overseas || '/' || (overseas_vip_until is not null) from public.rfqs where id = rfq2);
        want := 'US/true/true US/true/true';
      elsif i = 3 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, home, 'P7 indian', c1);
        update public.buyer_profiles set country = null, country_code = null where id = home;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, home, 'P7 no country', c1);
        update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, abroad) where key = 'overseas_leads';
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq3, abroad, 'P7 unlisted buyer', c1);
        got := (select string_agg(coalesce(buyer_country_code, 'null') || '/' || overseas || '/' || (overseas_vip_until is null), ' ' order by title) from public.rfqs where id in (rfq, rfq2, rfq3));
        want := 'IN/false/true null/false/true US/false/true';
      elsif i = 4 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 dresses', c2);
        insert into public.rfqs (id, buyer_id, title) values (rfq2, abroad, 'P7 no category');
        got := (select string_agg(overseas || '/' || (overseas_vip_until is null), ' ' order by title) from public.rfqs where id in (rfq, rfq2));
        want := 'true/true true/true';
      elsif i = 5 then
        insert into public.rfqs (id, buyer_id, title, category_id, vendor_id) values (rfq, abroad, 'P7 direct', c1, basic);
        got := (select overseas || '/' || (overseas_vip_until is null) from public.rfqs where id = rfq);
        perform set_config('request.jwt.claims', json_build_object('sub', basic, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' reads=' || (select count(*) from public.rfqs where id = rfq);
        insert into public.quotes (rfq_id, vendor_id) values (rfq, basic);
        reset role;
        got := got || ' quoted=' || (select count(*) from public.quotes where rfq_id = rfq and vendor_id = basic);
        want := 'true/true reads=1 quoted=1';
      elsif i in (6, 7, 8) then
        if i = 8 then
          insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, home, 'P7 indian', c1);
        else
          insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 overseas', c1);
        end if;
        if i = 7 then
          update public.rfqs set overseas_vip_until = now() - interval '1 minute' where id = rfq;
        end if;
        got := '';
        foreach who in array array['vip', 'gold', 'silver', 'basic', 'free', 'buyer', 'other buyer', 'admin'] loop
          perform set_config('request.jwt.claims', json_build_object('sub',
            case who when 'vip' then vip when 'gold' then gold when 'silver' then silver when 'basic' then basic when 'free' then free
                     when 'buyer' then (case when i = 8 then home else abroad end) when 'other buyer' then (case when i = 8 then abroad else home end)
                     else admin_id end, 'role', 'authenticated')::text, true);
          set local role authenticated;
          got := got || who || '=' || (select count(*) from public.rfqs where id = rfq) || ' ';
          reset role;
        end loop;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        got := got || 'anon=' || (select count(*) from public.rfqs where id = rfq);
        reset role;
        want := case i
          when 6 then 'vip=1 gold=0 silver=0 basic=0 free=0 buyer=1 other buyer=0 admin=1 anon=0'
          when 7 then 'vip=1 gold=1 silver=0 basic=0 free=0 buyer=1 other buyer=0 admin=1 anon=0'
          else        'vip=1 gold=1 silver=1 basic=1 free=1 buyer=1 other buyer=1 admin=1 anon=0' end;
      elsif i = 9 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 quoted then downgraded', c2);
        -- The Silver vendor was on Gold when they quoted.
        update public.vendor_subscriptions set plan_id = 'gold' where vendor_id = silver;
        insert into public.quotes (rfq_id, vendor_id) values (rfq, silver);
        update public.vendor_subscriptions set plan_id = 'silver' where vendor_id = silver;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'quoted reads=' || (select count(*) from public.rfqs where id = rfq) || ' feed=' || (select count(*) from public.match_vendor_rfqs(silver) m where m.rfq_id = rfq);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', basic, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' another reads=' || (select count(*) from public.rfqs where id = rfq) || ' asked=' || public.vendor_quoted_rfq(rfq);
        reset role;
        want := 'quoted reads=1 feed=1 another reads=0 asked=false';
      elsif i = 10 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 overseas', c1);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, home, 'P7 indian', c1);
        got := '';
        foreach who in array array['vip', 'gold', 'silver'] loop
          perform set_config('request.jwt.claims', json_build_object('sub', case who when 'vip' then vip when 'gold' then gold else silver end, 'role', 'authenticated')::text, true);
          set local role authenticated;
          got := got || who || '=' || (select count(*) filter (where m.rfq_id = rfq) || '+' || count(*) filter (where m.rfq_id = rfq2)
                                         from public.match_vendor_rfqs(case who when 'vip' then vip when 'gold' then gold else silver end) m) || ' ';
          reset role;
        end loop;
        update public.rfqs set overseas_vip_until = now() - interval '1 minute' where id = rfq;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || 'gold later=' || (select count(*) from public.match_vendor_rfqs(gold) m where m.rfq_id = rfq);
        reset role;
        want := 'vip=1+1 gold=0+1 silver=0+1 gold later=1';
      elsif i = 11 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 overseas', c1);
        got := '';
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin insert into public.quotes (rfq_id, vendor_id) values (rfq, silver); got := got || 'silver quoted, ';
        exception when insufficient_privilege then got := got || case when sqlerrm = 'Overseas requirements are part of the Gold and VIP plans.' then 'silver refused, ' else sqlerrm || ', ' end; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin insert into public.quotes (rfq_id, vendor_id) values (rfq, gold); got := got || 'gold quoted, ';
        exception when insufficient_privilege then got := got || case when sqlerrm like 'This overseas requirement is with VIP sellers first. It opens to Gold on %' then 'gold told to wait, ' else sqlerrm || ', ' end; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vip, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id) values (rfq, vip);
        reset role;
        update public.rfqs set overseas_vip_until = now() - interval '1 minute' where id = rfq;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id) values (rfq, gold);
        reset role;
        got := got || 'quotes=' || (select string_agg(p.id, ',' order by p.id) from public.quotes q join public.vendor_subscriptions s on s.vendor_id = q.vendor_id
                                      join public.subscription_plans p on p.id = s.plan_id where q.rfq_id = rfq);
        want := 'silver refused, gold told to wait, quotes=gold,vip';
      elsif i = 12 then
        -- counted against what is already there (an end-to-end run leaves requirements behind)
        n0 := (select count(*) from public.rfqs r where r.overseas and r.vendor_id is null and r.removed_at is null
                  and r.created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata');
        n1 := (select count(*) from public.rfqs r where r.overseas and r.vendor_id is null and r.status::text = 'active' and r.removed_at is null);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 secret title', c1), (rfq2, abroad, 'P7 another', c2);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq3, home, 'P7 indian', c1);
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.overseas_lead_count();
        reset role;
        got := (j ->> 'available') || '/' || (j ->> 'tier') || '/+' || ((j ->> 'this_month')::int - n0) || '/+' || ((j ->> 'open')::int - n1)
               || ' keys=' || (select string_agg(k, ',' order by k) from jsonb_object_keys(j) k) || ' leak=' || ((j::text) like '%secret%')::text;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        begin perform public.overseas_lead_count(); got := got || ' anon read';
        exception when insufficient_privilege then got := got || ' anon refused'; end;
        reset role;
        want := 'true/none/+2/+2 keys=available,open,this_month,tier leak=false anon refused';
      elsif i = 13 then
        got := '';
        foreach who in array array['vip', 'gold', 'silver', 'free'] loop
          perform set_config('request.jwt.claims', json_build_object('sub', case who when 'vip' then vip when 'gold' then gold when 'silver' then silver else free end, 'role', 'authenticated')::text, true);
          set local role authenticated;
          j := public.vendor_entitlements() -> 'features';
          got := got || who || '=' || (j ->> 'overseas_leads') || '/' || (j ->> 'overseas_tier') || '/' || public.my_overseas_tier() || ' ';
          reset role;
        end loop;
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id in (gold, vip);   -- only Gold has grace days here
        update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, gold) where key = 'overseas_leads';
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        got := got || 'gold in grace, off the switch=' || (j ->> 'overseas_leads') || '/' || public.my_overseas_tier();
        reset role;
        got := got || ' vip lapsed=' || admin.vendor_overseas_tier(vip);
        want := 'vip=true/vip/vip gold=true/gold/gold silver=false/none/none free=false/none/none gold in grace, off the switch=false/gold vip lapsed=none';
      elsif i = 14 then
        insert into public.rfqs (id, buyer_id, title, category_id, created_at) values (rfq, abroad, 'P7 alerted', c1, now() - interval '20 minutes');
        got := (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq);
        j := public.lead_digest_run();   -- the head start isn't over: nobody new
        got := got || ' still=' || (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq);
        -- now() is fixed inside one transaction, so put the first run back to before the head start ended
        update admin.lead_alert_runs set ran_at = now() - interval '2 hours' where rfq_id = rfq;
        update public.rfqs set overseas_vip_until = now() - interval '1 minute' where id = rfq;
        j := public.lead_digest_run();
        got := got || ' after=' || (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq);
        j := public.lead_digest_run();   -- and not again
        got := got || ' again=' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq)
               || ' gold page=' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = gold);
        want := 'vip still=vip after=gold,vip again=2 gold page=1';
      elsif i = 15 then
        update admin.lead_alert_config set overseas_head_start_hours = 0;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 no head start', c1);
        got := (select overseas || '/' || (overseas_vip_until is null) from public.rfqs where id = rfq);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' gold reads=' || (select count(*) from public.rfqs where id = rfq);
        reset role;
        want := 'true/true gold reads=1';
      elsif i = 16 then
        update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key = 'overseas_leads';
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 switch off', c1);
        got := (select overseas::text from public.rfqs where id = rfq);
        perform set_config('request.jwt.claims', json_build_object('sub', free, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' free reads=' || (select count(*) from public.rfqs where id = rfq) || ' page=' || (public.vendor_entitlements() -> 'features' ->> 'overseas_leads');
        reset role;
        want := 'false free reads=1 page=false';
      elsif i = 17 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin perform admin.vendor_overseas_tier(vip); got := got || 'tier read ';
        exception when insufficient_privilege then got := got || 'tier refused '; end;
        begin insert into public.countries (code, name, name_hi, name_gu) values ('ZZ', 'Nowhere', 'x', 'x'); got := got || 'list written ';
        exception when insufficient_privilege then got := got || 'list refused '; end;
        got := got || 'list read=' || (select (count(*) = 250)::text from public.countries);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        got := got || ' anon list=' || (select (count(*) = 250)::text from public.countries) || ' anon tier=' || public.my_overseas_tier();
        reset role;
        want := 'tier refused list refused list read=true anon list=true anon tier=none';
      elsif i = 18 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, abroad, 'P7 for staff', c1), (rfq3, home, 'P7 indian for staff', c1);
        perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_lead_detail(rfq);
        got := (j -> 'overseas' ->> 'country_code') || '/' || (j -> 'overseas' ->> 'country') || '/' || ((j -> 'overseas' ->> 'vip_until') is not null)::text
               || ' indian=' || coalesce(public.admin_lead_detail(rfq3) ->> 'overseas', 'null');
        reset role;
        want := 'US/United States/true indian=null';
      elsif i = 19 then
        -- posted 30 hours ago with no category: too late for a head start when one is chosen
        insert into public.rfqs (id, buyer_id, title, created_at) values (rfq4, abroad, 'P7 too late', now() - interval '30 hours');
        perform set_config('request.jwt.claims', json_build_object('sub', abroad, 'role', 'authenticated')::text, true);
        set local role authenticated;
        -- sent to one vendor, then opened to everyone
        insert into public.rfqs (id, buyer_id, title, category_id, vendor_id) values (rfq, abroad, 'P7 sent then opened', c1, basic);
        got := (select (overseas_vip_until is null)::text from public.rfqs where id = rfq);
        update public.rfqs set vendor_id = null where id = rfq;
        -- no category, then one a VIP lists in; Gold's category, then the VIP's
        insert into public.rfqs (id, buyer_id, title) values (rfq2, abroad, 'P7 category later');
        update public.rfqs set category_id = c1 where id = rfq2;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq3, abroad, 'P7 category moved', c2);
        update public.rfqs set category_id = c1 where id = rfq3;
        update public.rfqs set category_id = c1 where id = rfq4;
        -- a head start already running isn't shortened by moving to Gold's category
        update public.rfqs set category_id = c2 where id = rfq;
        reset role;
        got := got || ' opened=' || (select (overseas_vip_until > now() + interval '23 hours')::text from public.rfqs where id = rfq)
               || ' later=' || (select (overseas_vip_until = created_at + interval '24 hours')::text from public.rfqs where id = rfq2)
               || ' moved=' || (select (overseas_vip_until = created_at + interval '24 hours')::text from public.rfqs where id = rfq3)
               || ' late=' || (select (overseas_vip_until is null)::text from public.rfqs where id = rfq4);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' gold reads=' || (select count(*) from public.rfqs where id in (rfq, rfq2, rfq3, rfq4));
        reset role;
        want := 'true opened=true later=true moved=true late=true gold reads=1';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P7 (rolled back)%', E'\n' || out;
end
$p7$;
