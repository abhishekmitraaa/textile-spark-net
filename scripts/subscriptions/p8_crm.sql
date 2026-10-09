-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P8: the CRM (2026-10-09).
-- Migration 20261009120000_subscriptions_p8_crm.sql (on top of P0-P7).
--   levels    Silver pipeline, Gold analytics, VIP success; none without the switch or a plan
--   writes    track, add, change, notes and follow-ups only through crm_*; each checks the
--             plan, the owner, the requirement (the overseas rule too) and the limits
--   database  quotes, chats, requests sent to one vendor and removals move leads forward,
--             and never fail the write that fired them
--   reminders the follow-up run rings the bell; Gold and VIP also get WhatsApp, with no
--             buyer's words; once per follow-up
--   analytics Gold and VIP: funnel, win rate, follow-ups kept
-- HOW TO RUN (local stack with P0-P8 applied, or: begin; <P8>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p8$
declare
  gold    uuid := '22222222-2222-2222-2222-222222222222';
  free    uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  basic   uuid;
  silver  uuid;
  vip     uuid;
  buyer   uuid;
  abroad  uuid;
  c1      uuid;
  everyone uuid[];
  rfq     uuid := 'a8000000-0000-4000-8000-000000000001';
  rfq2    uuid := 'a8000000-0000-4000-8000-000000000002';
  rfq3    uuid := 'a8000000-0000-4000-8000-000000000003';
  lead    uuid;
  lead2   uuid;
  fu      uuid;
  fu2     uuid;
  labels text[] := array[
    'each plan''s level, on the switch; the grace days count',            -- 1
    'a vendor tracks a requirement from Leads, once',                      -- 2
    'only what the vendor can see can be tracked',                         -- 3
    'a lead added by hand, and what is refused',                           -- 4
    'changing a lead: fields, tags, a stage move recorded',                -- 5
    'lost with a reason, then reopened',                                   -- 6
    'another vendor''s leads: not readable, not changeable',               -- 7
    'a browser can''t write the tables, or call the run',                  -- 8
    'a quote tracks the requirement as quoted, with a value',              -- 9
    'the buyer''s answer moves it: shortlisted, accepted, declined',       -- 10
    'a chat opened with the buyer: new leads become contacted',            -- 11
    'a requirement sent to one vendor becomes their lead',                 -- 12
    'a requirement Cosora removes loses its words',                        -- 13
    'notes: kept in order, limited',                                       -- 14
    'follow-ups: next one on the lead, done, moved, removed',              -- 15
    'limits: leads and open follow-ups',                                   -- 16
    'the reminder run: bell for Silver, WhatsApp too for Gold, once',      -- 17
    'analytics: Gold''s figures; Silver refused',                          -- 18
    'a CRM failure never fails the quote'];                                -- 19
  got text; want text; i int; n int; j jsonb;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (free, 'P8 free vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  select array_agg(x.id order by x.id) into everyone
    from (select v.id from public.vendor_profiles v join public.profiles p on p.id = v.id
           where v.id not in (gold, free) order by v.id limit 3) x;
  basic := everyone[1]; silver := everyone[2]; vip := everyone[3];
  select array_agg(x.id order by x.created_at) into everyone
    from (select b.id, b.created_at from public.buyer_profiles b where b.id not in (gold, free, basic, silver, vip) order by b.created_at limit 2) x;
  buyer := everyone[1]; abroad := everyone[2];
  select c.id into c1 from public.categories c where c.name = 'Activewear' limit 1;
  if vip is null or abroad is null or c1 is null then
    raise exception 'the harness needs three more local vendors, two buyers and the Activewear category';
  end if;
  everyone := array[gold, free, basic, silver, vip];

  update public.feature_flags set enabled = false, allow_profile_ids = everyone where key in ('crm', 'notification_delivery', 'subscription_lifecycle');
  update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key in ('lead_alerts', 'overseas_leads');
  update public.feature_flags set enabled = false, allow_profile_ids = array[abroad] where key = 'overseas_leads';
  update admin.crm_config set max_leads = 5000, max_notes_per_lead = 500, max_open_follow_ups = 1000;
  update admin.billing_settings set grace_days = 7;
  update public.profiles set account_status = 'active' where id = any (everyone || array[buyer, abroad]);
  update public.buyer_profiles set country = 'India', country_code = 'IN' where id = buyer;
  update public.buyer_profiles set country = 'United States', country_code = 'US' where id = abroad;
  update public.vendor_profiles set brand_name = 'P8 Gold Mills', whatsapp = '+91 98765 43210', notifications = '{}'::jsonb where id = gold;
  update public.vendor_profiles set whatsapp = '+91 98765 43211', notifications = '{}'::jsonb where id = silver;
  delete from public.vendor_lead_pipeline where vendor_id = any (everyone);
  delete from public.notifications where profile_id = any (everyone);
  delete from admin.notification_outbox where profile_id = any (everyone);
  delete from public.contact_consent where profile_id = any (everyone);
  delete from public.subscription_mandates where vendor_id = any (everyone);
  update public.products set status = 'draft' where (vendor_id = any (everyone) or category_id = c1) and status <> 'draft';
  insert into public.products (vendor_id, name, status, category_id) select v, 'P8 listing', 'live', c1 from unnest(everyone) v;
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
        got := admin.vendor_crm_level(free) || '/' || admin.vendor_crm_level(basic) || '/' || admin.vendor_crm_level(silver)
               || '/' || admin.vendor_crm_level(gold) || '/' || admin.vendor_crm_level(vip);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        reset role;
        got := got || ' gold=' || (j ->> 'crm_level') || '/' || (j ->> 'crm_pipeline') || '/' || (j ->> 'crm_analytics') || '/' || (j ->> 'crm');
        update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, silver) where key = 'crm';
        got := got || ' off=' || admin.vendor_crm_level(silver);
        update public.feature_flags set allow_profile_ids = allow_profile_ids || silver where key = 'crm';
        update public.vendor_subscriptions set current_period_start = now() - interval '33 days', current_period_end = now() - interval '2 days' where vendor_id = silver;
        got := got || ' grace=' || admin.vendor_crm_level(silver);
        want := 'none/none/pipeline/analytics/success gold=analytics/true/true/true off=none grace=pipeline';
      elsif i = 2 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P8 joggers', c1, 500);
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_track(rfq);
        lead2 := public.crm_track(rfq);
        got := (lead = lead2)::text || ' ' || (select l.stage || '/' || l.source || '/' || l.title || '/' || (l.buyer_id = buyer) from public.vendor_lead_pipeline l where l.id = lead)
               || ' history=' || (select string_agg(n.kind || ':' || n.body || ':' || (n.meta ->> 'by'), ',') from public.vendor_lead_notes n where n.pipeline_id = lead);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', free, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.crm_track(rfq); got := got || ' free tracked';
        exception when insufficient_privilege then got := got || ' free: ' || sqlerrm; end;
        reset role;
        want := 'true new/lead/P8 joggers/true history=stage:new:vendor free: The CRM comes with the Silver, Gold and VIP plans.';
      elsif i = 3 then
        -- An overseas requirement during VIP's head start: Silver and Gold can't track it, VIP can.
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, abroad, 'P8 overseas', c1);
        got := (select overseas || '/' || (overseas_vip_until > now()) from public.rfqs where id = rfq2);
        foreach lead in array array[silver, gold, vip] loop
          perform set_config('request.jwt.claims', json_build_object('sub', lead, 'role', 'authenticated')::text, true);
          set local role authenticated;
          begin perform public.crm_track(rfq2); got := got || ' tracked';
          exception when sqlstate 'P0002' then got := got || ' refused'; end;
          reset role;
        end loop;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.crm_track(gen_random_uuid()); got := got || ' nothing tracked';
        exception when sqlstate 'P0002' then got := got || ' unknown refused'; end;
        reset role;
        want := 'true/true refused refused tracked unknown refused';
      elsif i = 4 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('Trade fair contact', 'Asha Exports', 125000.555, array['fair', 'priority']);
        got := (select l.source || '/' || l.stage || '/' || l.buyer_name || '/' || l.value_inr || '/' || array_to_string(l.tags, '+') || '/' || coalesce(l.rfq_id::text, 'none')
                  from public.vendor_lead_pipeline l where l.id = lead);
        begin perform public.crm_add_lead('  '); got := got || ' blank added';
        exception when sqlstate '22023' then got := got || ' blank refused'; end;
        begin perform public.crm_add_lead('x', null, -5); got := got || ' negative added';
        exception when sqlstate '22023' then got := got || ' negative refused'; end;
        begin perform public.crm_add_lead('x', null, null, array['a','b','c','d','e','f','g','h','i','j','k']); got := got || ' 11 tags added';
        exception when sqlstate '22023' then got := got || ' 11 tags refused'; end;
        reset role;
        want := 'manual/new/Asha Exports/125000.56/fair+priority/none blank refused negative refused 11 tags refused';
      elsif i = 5 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('Lead to change');
        perform public.crm_update_lead(lead, jsonb_build_object('title', 'Renamed', 'value_inr', 9000, 'tags', jsonb_build_array('a', 'a', ' b ', ''), 'stage', 'contacted'));
        got := (select l.title || '/' || l.value_inr || '/' || array_to_string(l.tags, '+') || '/' || l.stage || '/' || (l.stage_changed_at = now())
                  from public.vendor_lead_pipeline l where l.id = lead);
        perform public.crm_update_lead(lead, jsonb_build_object('value_inr', null));
        got := got || ' cleared=' || coalesce((select value_inr::text from public.vendor_lead_pipeline where id = lead), 'null');
        begin perform public.crm_update_lead(lead, jsonb_build_object('vendor_id', free)); got := got || ' vendor changed';
        exception when sqlstate '22023' then got := got || ' other key refused'; end;
        begin perform public.crm_update_lead(lead, jsonb_build_object('stage', 'paid')); got := got || ' bad stage taken';
        exception when sqlstate '22023' then got := got || ' bad stage refused'; end;
        got := got || ' history=' || (select string_agg((n.meta ->> 'from') || '>' || (n.meta ->> 'to') || ':' || (n.meta ->> 'by'), ',' order by n.created_at)
                                        from public.vendor_lead_notes n where n.pipeline_id = lead and n.kind = 'stage' and n.meta ->> 'from' is not null);
        reset role;
        want := 'Renamed/9000.00/a+b/contacted/true cleared=null other key refused bad stage refused history=new>contacted:vendor';
      elsif i = 6 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('Lead to lose');
        perform public.crm_update_lead(lead, jsonb_build_object('stage', 'lost', 'lost_reason', 'Price too high'));
        got := (select l.stage || '/' || l.lost_reason || '/' || (l.closed_at is not null) from public.vendor_lead_pipeline l where l.id = lead);
        perform public.crm_update_lead(lead, jsonb_build_object('stage', 'negotiating'));
        got := got || ' ' || (select l.stage || '/' || coalesce(l.lost_reason, 'none') || '/' || (l.closed_at is null) from public.vendor_lead_pipeline l where l.id = lead)
               || ' reason=' || (select n.meta ->> 'reason' from public.vendor_lead_notes n where n.pipeline_id = lead and n.meta ->> 'to' = 'lost');
        reset role;
        want := 'lost/Price too high/true negotiating/none/true reason=Price too high';
      elsif i = 7 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('Silver''s own');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'gold reads=' || (select count(*) from public.vendor_lead_pipeline where id = lead)
               || '/' || (select count(*) from public.vendor_lead_notes where pipeline_id = lead);
        begin perform public.crm_update_lead(lead, '{"title": "Mine now"}'); got := got || ' changed';
        exception when sqlstate 'P0002' then got := got || ' change refused'; end;
        begin perform public.crm_add_note(lead, 'hello'); got := got || ' noted';
        exception when sqlstate 'P0002' then got := got || ' note refused'; end;
        begin perform public.crm_add_follow_up(lead, now() + interval '1 day'); got := got || ' follow-up added';
        exception when sqlstate 'P0002' then got := got || ' follow-up refused'; end;
        begin perform public.crm_delete_lead(lead); got := got || ' deleted';
        exception when sqlstate 'P0002' then got := got || ' delete refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        begin got := got || ' anon reads=' || (select count(*) from public.vendor_lead_pipeline);
        exception when insufficient_privilege then got := got || ' anon refused'; end;
        reset role;
        got := got || ' still=' || (select title from public.vendor_lead_pipeline where id = lead);
        want := 'gold reads=0/0 change refused note refused follow-up refused delete refused anon refused still=Silver''s own';
      elsif i = 8 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin insert into public.vendor_lead_pipeline (vendor_id, title) values (silver, 'direct'); got := got || 'inserted';
        exception when insufficient_privilege then got := got || 'insert refused'; end;
        lead := public.crm_add_lead('Protected');
        begin update public.vendor_lead_pipeline set stage = 'won' where id = lead; got := got || ' updated';
        exception when insufficient_privilege then got := got || ' update refused'; end;
        begin delete from public.vendor_lead_notes where pipeline_id = lead; got := got || ' notes deleted';
        exception when insufficient_privilege then got := got || ' notes delete refused'; end;
        begin perform public.crm_followup_run(); got := got || ' run';
        exception when insufficient_privilege then got := got || ' run refused'; end;
        reset role;
        want := 'insert refused update refused notes delete refused run refused';
      elsif i = 9 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P8 quoted', c1, 400);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id, price_per_unit) values (rfq, gold, 125.50);
        reset role;
        got := (select l.stage || '/' || l.source || '/' || l.value_inr || '/' || l.title from public.vendor_lead_pipeline l where l.vendor_id = gold and l.rfq_id = rfq);
        -- A lead tracked as new first moves to quoted, and keeps a value already given.
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_track(rfq);
        perform public.crm_update_lead(lead, '{"value_inr": 1}');
        insert into public.quotes (rfq_id, vendor_id, price_per_unit) values (rfq, silver, 130);
        reset role;
        got := got || ' tracked=' || (select l.stage || '/' || l.value_inr from public.vendor_lead_pipeline l where l.id = lead)
               || ' basic=' || (select count(*) from public.vendor_lead_pipeline l where l.vendor_id = basic);
        perform set_config('request.jwt.claims', json_build_object('sub', basic, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id, price_per_unit) values (rfq, basic, 120);
        reset role;
        got := got || '/' || (select count(*) from public.vendor_lead_pipeline l where l.vendor_id = basic);
        want := 'quoted/quote/50200.00/P8 quoted tracked=quoted/1.00 basic=0/0';
      elsif i = 10 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P8 answered', c1, 100);
        insert into public.quotes (rfq_id, vendor_id, price_per_unit) values (rfq, gold, 10), (rfq, silver, 11), (rfq, vip, 12);
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.quotes set status = 'shortlisted' where rfq_id = rfq and vendor_id = gold;
        reset role;   -- the buyer can't read a vendor's CRM; the harness reads as postgres
        got := (select stage from public.vendor_lead_pipeline where vendor_id = gold and rfq_id = rfq);
        set local role authenticated;
        update public.quotes set status = 'rejected' where rfq_id = rfq and vendor_id = silver;
        update public.quotes set status = 'accepted' where rfq_id = rfq and vendor_id = gold;
        reset role;
        got := got || ' ' || (select stage from public.vendor_lead_pipeline where vendor_id = gold and rfq_id = rfq)
               || ' ' || (select stage || ':' || lost_reason from public.vendor_lead_pipeline where vendor_id = silver and rfq_id = rfq)
               || ' vip=' || (select stage from public.vendor_lead_pipeline where vendor_id = vip and rfq_id = rfq);
        -- A won lead stays won.
        update public.quotes set status = 'rejected' where rfq_id = rfq and vendor_id = gold;
        got := got || ' after=' || (select stage from public.vendor_lead_pipeline where vendor_id = gold and rfq_id = rfq)
               || ' by=' || (select string_agg(distinct n.meta ->> 'by', ',') from public.vendor_lead_notes n
                               join public.vendor_lead_pipeline l on l.id = n.pipeline_id where l.vendor_id = gold and l.rfq_id = rfq);
        want := 'negotiating won lost:The buyer declined your quote vip=quoted after=won by=system';
      elsif i = 11 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P8 chat', c1), (rfq2, buyer, 'P8 chat quoted', c1);
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_track(rfq);
        reset role;
        insert into public.quotes (rfq_id, vendor_id) values (rfq2, silver);
        delete from public.conversations where (user_a = least(silver, buyer) and user_b = greatest(silver, buyer));
        insert into public.conversations (user_a, user_b) values (least(silver, buyer), greatest(silver, buyer));
        got := (select stage from public.vendor_lead_pipeline where id = lead) || ' '
               || (select stage from public.vendor_lead_pipeline where vendor_id = silver and rfq_id = rfq2);
        want := 'contacted quoted';
      elsif i = 12 then
        insert into public.rfqs (id, buyer_id, title, category_id, vendor_id) values (rfq, buyer, 'P8 for Gold only', c1, gold);
        insert into public.rfqs (id, buyer_id, title, category_id, vendor_id) values (rfq2, buyer, 'P8 for Free only', c1, free);
        got := (select stage || '/' || source || '/' || title from public.vendor_lead_pipeline where vendor_id = gold and rfq_id = rfq)
               || ' free=' || (select count(*) from public.vendor_lead_pipeline where vendor_id = free);
        want := 'new/direct/P8 for Gold only free=0';
      elsif i = 13 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P8 spam with a link', c1);
        insert into public.quotes (rfq_id, vendor_id) values (rfq, gold), (rfq, silver);
        update public.quotes set status = 'accepted' where rfq_id = rfq and vendor_id = gold;
        update public.rfqs set removed_at = now(), removed_reason = 'Spam', status = 'closed' where id = rfq;
        got := (select string_agg(l.stage || ':' || l.title || ':' || coalesce(l.lost_reason, '-'), ' ' order by l.stage desc)
                  from public.vendor_lead_pipeline l where l.rfq_id = rfq);
        perform set_config('request.jwt.claims', json_build_object('sub', vip, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.crm_track(rfq); got := got || ' tracked';
        exception when sqlstate 'P0002' then got := got || ' removed not trackable'; end;
        reset role;
        want := 'won:Requirement removed by Cosora:- lost:Requirement removed by Cosora:Removed by Cosora removed not trackable';
      elsif i = 14 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('Noted lead');
        perform public.crm_add_note(lead, 'First call went well');
        perform public.crm_add_note(lead, '  Second, trimmed  ');
        got := (select string_agg(n.body, '|' order by n.created_at, n.id) from public.vendor_lead_notes n where n.pipeline_id = lead and n.kind = 'note');
        begin perform public.crm_add_note(lead, repeat('x', 2001)); got := got || ' long taken';
        exception when sqlstate '22023' then got := got || ' long refused'; end;
        reset role;
        update admin.crm_config set max_notes_per_lead = 3;   -- the creation entry and two notes
        set local role authenticated;
        begin perform public.crm_add_note(lead, 'one too many'); got := got || ' over taken';
        exception when sqlstate 'P0001' then got := got || ' over refused'; end;
        reset role;
        want := 'First call went well|Second, trimmed long refused over refused';
      elsif i = 15 then
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('Follow me');
        fu := public.crm_add_follow_up(lead, now() + interval '3 days', 'Send samples');
        fu2 := public.crm_add_follow_up(lead, now() + interval '1 day', 'Call back');
        got := ((select next_follow_up_at from public.vendor_lead_pipeline where id = lead) = now() + interval '1 day')::text;
        perform public.crm_update_follow_up(fu2, true);
        got := got || ' next=' || ((select next_follow_up_at from public.vendor_lead_pipeline where id = lead) = now() + interval '3 days')
               || ' note=' || (select n.body || '/' || (n.meta ->> 'on_time') from public.vendor_lead_notes n where n.pipeline_id = lead and n.kind = 'follow_up');
        reset role;
        update public.vendor_lead_followups set notified_at = now() where id = fu;
        set local role authenticated;
        perform public.crm_update_follow_up(fu, null, now() + interval '5 days');
        got := got || ' moved=' || (select (notified_at is null)::text from public.vendor_lead_followups where id = fu);
        perform public.crm_delete_follow_up(fu);
        got := got || ' after delete=' || coalesce((select next_follow_up_at::text from public.vendor_lead_pipeline where id = lead), 'none');
        begin perform public.crm_add_follow_up(lead, now() - interval '3 days'); got := got || ' past taken';
        exception when sqlstate '22023' then got := got || ' past refused'; end;
        begin perform public.crm_add_follow_up(lead, now() + interval '2 years'); got := got || ' far taken';
        exception when sqlstate '22023' then got := got || ' far refused'; end;
        reset role;
        want := 'true next=true note=Call back/true moved=true after delete=none past refused far refused';
      elsif i = 16 then
        update admin.crm_config set max_leads = (select count(*) + 1 from public.vendor_lead_pipeline where vendor_id = silver), max_open_follow_ups = 1;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        lead := public.crm_add_lead('The last one that fits');
        begin perform public.crm_add_lead('One too many'); got := 'over taken';
        exception when sqlstate 'P0001' then got := 'full refused'; end;
        perform public.crm_add_follow_up(lead, now() + interval '1 day');
        begin perform public.crm_add_follow_up(lead, now() + interval '2 days'); got := got || ' follow-up over taken';
        exception when sqlstate 'P0001' then got := got || ' follow-up over refused'; end;
        reset role;
        -- Full: a quote still goes through, it just isn't tracked.
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P8 when full', c1);
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id) values (rfq, silver);
        reset role;
        got := got || ' quote=' || (select count(*) from public.quotes where rfq_id = rfq and vendor_id = silver)
               || ' tracked=' || (select count(*) from public.vendor_lead_pipeline where rfq_id = rfq and vendor_id = silver);
        want := 'full refused follow-up over refused quote=1 tracked=0';
      elsif i = 17 then
        update admin.notification_templates set active = true where key = 'crm_followup' and channel = 'whatsapp';
        insert into public.contact_consent (profile_id, channel, opted_in, changed_at, source)
        values (gold, 'whatsapp', true, now(), 'vendor_settings'), (silver, 'whatsapp', true, now(), 'vendor_settings');
        insert into public.vendor_lead_pipeline (id, vendor_id, title) values
          ('a8000000-0000-4000-8000-0000000000a1', silver, 'Silver lead, buyer wrote http://x.example'),
          ('a8000000-0000-4000-8000-0000000000a2', gold, 'Gold lead one'),
          ('a8000000-0000-4000-8000-0000000000a3', gold, 'Gold lead two'),
          ('a8000000-0000-4000-8000-0000000000a4', free, 'Free lead');
        insert into public.vendor_lead_followups (pipeline_id, vendor_id, due_at) values
          ('a8000000-0000-4000-8000-0000000000a1', silver, now() - interval '5 minutes'),
          ('a8000000-0000-4000-8000-0000000000a2', gold, now() - interval '10 minutes'),
          ('a8000000-0000-4000-8000-0000000000a3', gold, now() - interval '1 minute'),
          ('a8000000-0000-4000-8000-0000000000a4', free, now() - interval '1 minute'),
          ('a8000000-0000-4000-8000-0000000000a2', gold, now() + interval '1 hour'),      -- not yet
          ('a8000000-0000-4000-8000-0000000000a2', gold, now() - interval '9 days');      -- too old to ring
        j := public.crm_followup_run();
        got := (j ->> 'vendors') || '/' || (j ->> 'follow_ups')
               || ' silver=' || (select string_agg(title, '|') from public.notifications where profile_id = silver and kind = 'crm_follow_up')
               || ' gold=' || (select string_agg(title, '|') from public.notifications where profile_id = gold and kind = 'crm_follow_up')
               || ' free=' || (select count(*) from public.notifications where profile_id = free and kind = 'crm_follow_up')
               || ' wa=' || coalesce((select string_agg(o.payload::text, ',') from admin.notification_outbox o where o.template_key = 'crm_followup'), 'none')
               || ' wa to=' || coalesce((select string_agg(distinct (o.profile_id = gold)::text, ',') from admin.notification_outbox o where o.template_key = 'crm_followup'), 'none');
        j := public.crm_followup_run();
        got := got || ' again=' || (j ->> 'follow_ups') || '/' || (select count(*) from public.notifications where kind = 'crm_follow_up' and profile_id = any (everyone));
        want := '2/3 silver=Follow-up due: Silver lead, buyer wrote gold=2 follow-ups due free=0 wa={"name": "P8 Gold Mills", "count": "2"} wa to=true again=0/2';
      elsif i = 18 then
        insert into public.vendor_lead_pipeline (id, vendor_id, title, stage, value_inr, source, created_at, closed_at, lost_reason) values
          ('a8000000-0000-4000-8000-0000000000b1', gold, 'Won one', 'won', 1000, 'quote', now() - interval '10 days', now() - interval '2 days', null),
          ('a8000000-0000-4000-8000-0000000000b2', gold, 'Lost one', 'lost', 500, 'lead', now() - interval '8 days', now() - interval '1 day', 'Price'),
          ('a8000000-0000-4000-8000-0000000000b3', gold, 'Open one', 'quoted', 300, 'manual', now() - interval '3 days', null, null),
          ('a8000000-0000-4000-8000-0000000000b4', gold, 'New one', 'new', null, 'manual', now() - interval '1 day', null, null);
        insert into public.vendor_lead_notes (pipeline_id, vendor_id, kind, body, meta) values
          ('a8000000-0000-4000-8000-0000000000b2', gold, 'stage', 'lost', '{"from": "negotiating", "to": "lost", "by": "system"}');
        insert into public.vendor_lead_followups (pipeline_id, vendor_id, due_at, done_at) values
          ('a8000000-0000-4000-8000-0000000000b3', gold, now() - interval '3 days', now() - interval '3 days'),
          ('a8000000-0000-4000-8000-0000000000b3', gold, now() - interval '2 days', now()),
          ('a8000000-0000-4000-8000-0000000000b3', gold, now() - interval '1 day', null);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.crm_analytics(30);
        reset role;
        got := (j -> 'funnel')::text || ' won=' || (j ->> 'won') || '/' || (j ->> 'won_value') || ' lost=' || (j ->> 'lost')
               || ' rate=' || (j ->> 'win_rate') || ' days=' || (j ->> 'avg_days_to_win') || ' open=' || (j ->> 'open_value')
               || ' fu=' || (j -> 'follow_ups')::text || ' reasons=' || (j -> 'lost_reasons')::text;
        perform set_config('request.jwt.claims', json_build_object('sub', silver, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.crm_analytics(30); got := got || ' silver read';
        exception when insufficient_privilege then got := got || ' silver: ' || sqlerrm; end;
        reset role;
        want := '{"new": 4, "won": 1, "quoted": 3, "contacted": 3, "negotiating": 2} won=1/1000.00 lost=1 rate=0.500 days=8.0 open=300.00 fu={"due": 3, "done": 2, "on_time": 1, "overdue_open": 1} reasons=[{"count": 1, "reason": "Price"}] silver: CRM analytics come with the Gold and VIP plans.';
      elsif i = 19 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P8 resilient', c1);
        alter table public.vendor_lead_pipeline add constraint p8_harness_break check (title = 'never') not valid;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id) values (rfq, gold);
        reset role;
        got := 'quote=' || (select count(*) from public.quotes where rfq_id = rfq and vendor_id = gold)
               || ' tracked=' || (select count(*) from public.vendor_lead_pipeline where rfq_id = rfq);
        insert into public.rfqs (id, buyer_id, title, category_id, vendor_id) values (rfq2, buyer, 'P8 resilient direct', c1, gold);
        got := got || ' direct posted=' || (select count(*) from public.rfqs where id = rfq2);
        want := 'quote=1 tracked=0 direct posted=1';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P8 (rolled back)%', E'\n' || out;
end
$p8$;
