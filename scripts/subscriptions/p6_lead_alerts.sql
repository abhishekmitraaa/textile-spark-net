-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P6: lead alerts and lead channels (2026-10-09).
-- Migration 20261009175832_subscriptions_p6_lead_alerts.sql (on top of P0-P5).
--   who      vendors who list in the requirement's category, each by their plan's channels;
--            VIP first; never the buyer, a vendor off the switch, or for a requirement that
--            is direct, closed, removed or old
--   pacing   the vendor's own choices, quiet hours, the hourly cap
--   twice    the embedding's arrival tells only vendors not yet told
--   safe     a failure never stops the requirement; the daily run picks it up
--   digest   one email a day with what matched, or only what was held
--   page     settings, the page's data, entitlements, access, the admin's figures
--   abuse    a buyer's words go out without links or numbers; a buyer's alerts are capped a
--            day; one requirement tells at most max_vendors; a browser can't write the embedding
-- HOW TO RUN (local stack with P0-P6 applied, or: begin; <P6>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p6$
declare
  gold    uuid := '22222222-2222-2222-2222-222222222222';
  free    uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  basic   uuid;
  silver  uuid;
  vip     uuid;
  buyer   uuid;
  admin_id uuid := '33333333-3333-3333-3333-333333333333';
  c1      uuid;   -- every paid vendor lists here
  c2      uuid;   -- only the Gold vendor lists here
  everyone uuid[];
  rfq     uuid := 'a6000000-0000-4000-8000-000000000001';
  rfq2    uuid := 'a6000000-0000-4000-8000-000000000002';
  rfq3    uuid := 'a6000000-0000-4000-8000-000000000003';
  vec     text;
  labels text[] := array[
    'a requirement in the category: each plan told by its channels',     -- 1
    'VIP is told first, then the bigger plan',                           -- 2
    'not told: the buyer''s own account, a vendor off the switch',       -- 3
    'nobody told: direct, closed, removed or old requirements',          -- 4
    'category choice: only the categories chosen',                       -- 5
    'instant off: held for the digest, no bell',                         -- 6
    'quiet hours: only the bell',                                        -- 7
    'the hourly cap: the next one waits for the digest',                 -- 8
    'the embedding arriving tells only vendors not yet told',            -- 9
    'a failure never stops the requirement; the daily run picks it up',  -- 10
    'the digest: one email with what matched, once',                     -- 11
    'a plan told as it happens gets a digest only of what was held',     -- 12
    'digest off: nothing sent, nothing left waiting',                    -- 13
    'the email switch stops the email, not the bell',                    -- 14
    'settings: saved and read back; bad quiet hours refused',            -- 15
    'the page: channels, categories, what was told',                     -- 16
    'entitlements: the plan''s, and only on the switch',                 -- 17
    'a browser can''t run the matching or write settings directly',      -- 18
    'the admin''s figures; refused to a vendor',                         -- 19
    'the grace days: still told',                                        -- 20
    'no message carries a buyer''s words; the bell''s are tidied',        -- 21
    'a buyer''s alerts are capped a day; the next one tells nobody',     -- 22
    'both passes together tell at most max_vendors',                     -- 23
    'a browser can''t write the embedding or set the second pass off',   -- 24
    'a requirement Cosora removed keeps no words on the vendor''s page', -- 25
    'the digest run answers the scheduled job and the service role'];    -- 26
  got text; want text; i int; n int; j jsonb;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  select array_agg(x.id order by x.id) into everyone
    from (select v.id from public.vendor_profiles v join public.profiles p on p.id = v.id
           where v.id not in (gold, free) order by v.id limit 3) x;
  basic := everyone[1]; silver := everyone[2]; vip := everyone[3];
  if vip is null then raise exception 'the harness needs three more local vendors'; end if;
  select b.id into buyer from public.buyer_profiles b where b.id not in (gold, free, basic, silver, vip) order by b.created_at limit 1;
  select c.id into c1 from public.categories c where c.name = 'Activewear' limit 1;
  select c.id into c2 from public.categories c where c.name = 'Dress' limit 1;
  if buyer is null or c1 is null or c2 is null then raise exception 'the harness needs a buyer and the Activewear and Dress categories'; end if;
  everyone := array[gold, free, basic, silver, vip];

  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (free, 'P6 free vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  update public.feature_flags set enabled = false, allow_profile_ids = everyone where key in ('lead_alerts', 'notification_delivery');
  update public.feature_flags set enabled = false, allow_profile_ids = array[gold] where key = 'subscription_lifecycle';
  update admin.lead_alert_config set min_similarity = 0.35, max_vendors = 50, hourly_cap = 10, max_age_hours = 48;
  update admin.billing_settings set grace_days = 7;
  update public.profiles set account_status = 'active' where id = any (everyone);
  update public.vendor_profiles set owner_email = 'p6-' || left(id::text, 8) || '@example.com', notifications = '{}'::jsonb, catalog_embedding = null
   where id = any (everyone);
  delete from public.lead_alert_settings where vendor_id = any (everyone);
  delete from public.subscription_mandates where vendor_id = any (everyone);
  delete from public.notifications where profile_id = any (everyone);
  delete from admin.notification_outbox where profile_id = any (everyone);
  delete from admin.lead_alerts;
  delete from admin.lead_alert_runs;
  update public.products set status = 'draft' where vendor_id = any (everyone) and status <> 'draft';
  update public.products set status = 'draft' where category_id in (c1, c2) and status = 'live';   -- nobody else lists here
  insert into public.products (vendor_id, name, status, category_id)
  select v, 'P6 listing', 'live', c1 from unnest(array[gold, free, basic, silver, vip]) v;
  insert into public.products (vendor_id, name, status, category_id) values (gold, 'P6 dress', 'live', c2);
  delete from public.vendor_subscriptions where vendor_id = free;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  select x.v, x.p, 'monthly', 'active', now() - interval '5 days', now() + interval '25 days'
    from (values (gold, 'gold'), (basic, 'basic'), (silver, 'silver'), (vip, 'vip')) as x(v, p)
  on conflict (vendor_id) do update set plan_id = excluded.plan_id, billing_cycle = 'monthly', status = 'active',
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;
  select '[' || string_agg('0.05', ',') || ']' into vec from generate_series(1, 1536);

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', '', true);
      if i = 1 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P6 500 track pants', c1, 500);
        got := (select string_agg(a.plan_id || ':' || array_to_string(a.channels, '+') || ':' || coalesce(a.held, '-'), ' ' order by a.plan_id)
                  from admin.lead_alerts a where a.rfq_id = rfq)
               || ' bell=' || (select string_agg(pl.id, ',' order by pl.id) from public.notifications nt
                                 join public.vendor_subscriptions vs on vs.vendor_id = nt.profile_id join public.subscription_plans pl on pl.id = vs.plan_id
                                where nt.kind = 'lead_match' and nt.title = 'New requirement: P6 500 track pants')
               || ' mail=' || (select string_agg(pl.id || '/' || o.channel, ',' order by pl.id) from admin.notification_outbox o
                                 join public.vendor_subscriptions vs on vs.vendor_id = o.profile_id join public.subscription_plans pl on pl.id = vs.plan_id
                                where o.template_key = 'lead_alert')
               || ' free=' || (select count(*) from admin.lead_alerts a where a.vendor_id = free);
        want := 'basic::digest_only gold:app+email:- silver:app:- vip:app+email:- bell=gold,silver,vip mail=gold/email,vip/email free=0';
      elsif i = 2 then
        update admin.lead_alert_config set max_vendors = 2;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 priority', c1);
        got := (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq);
        update admin.lead_alert_config set max_vendors = 1;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, buyer, 'P6 priority 2', c1);
        got := got || ' ' || (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq2);
        want := 'gold,vip vip';
      elsif i = 3 then
        update public.feature_flags set allow_profile_ids = array_remove(allow_profile_ids, silver) where key = 'lead_alerts';
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, gold, 'P6 from a seller account', c1);
        got := (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq);
        want := 'basic,vip';
      elsif i = 4 then
        insert into public.rfqs (id, buyer_id, title, category_id, vendor_id) values (rfq, buyer, 'P6 direct', c1, gold);
        insert into public.rfqs (id, buyer_id, title, category_id, status) values (rfq2, buyer, 'P6 closed', c1, 'closed');
        insert into public.rfqs (id, buyer_id, title, category_id, created_at) values (rfq3, buyer, 'P6 old', c1, now() - interval '3 days');
        insert into public.rfqs (buyer_id, title, category_id, status, removed_at, removed_reason) values (buyer, 'P6 removed', c1, 'closed', now(), 'spam');
        got := (select count(*) from admin.lead_alerts)::text || '/' || (select count(*) from public.notifications where kind = 'lead_match');
        want := '0/0';
      elsif i = 5 then
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.set_lead_alert_settings(true, true, array[c2], null, null);
        reset role;
        perform set_config('request.jwt.claims', '', true);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 activewear', c1);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, buyer, 'P6 dresses', c2);
        got := (select count(*) from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = gold)::text
               || '/' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq2 and a.vendor_id = gold)
               || ' others=' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id <> gold);
        want := '0/1 others=3';
      elsif i = 6 then
        insert into public.lead_alert_settings (vendor_id, instant) values (gold, false);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 instant off', c1);
        got := (select array_to_string(a.channels, '+') || ':' || a.held from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = gold)
               || ' bell=' || (select count(*) from public.notifications where profile_id = gold)
               || ' mail=' || (select count(*) from admin.notification_outbox where profile_id = gold);
        want := ':off bell=0 mail=0';
      elsif i = 7 then
        insert into public.lead_alert_settings (vendor_id, quiet_start, quiet_end)
        values (gold, ((now() at time zone 'Asia/Kolkata') - interval '1 hour')::time, ((now() at time zone 'Asia/Kolkata') + interval '1 hour')::time);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 quiet', c1);
        got := (select array_to_string(a.channels, '+') || ':' || a.held from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = gold)
               || ' bell=' || (select count(*) from public.notifications where profile_id = gold)
               || ' mail=' || (select count(*) from admin.notification_outbox where profile_id = gold)
               || ' vip=' || (select array_to_string(a.channels, '+') from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = vip);
        want := 'app:quiet_hours bell=1 mail=0 vip=app+email';
      elsif i = 8 then
        update admin.lead_alert_config set hourly_cap = 2;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 one', c1), (rfq2, buyer, 'P6 two', c1);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq3, buyer, 'P6 three', c1);
        got := (select string_agg(coalesce(a.held, 'sent'), ',' order by q.title) from admin.lead_alerts a join public.rfqs q on q.id = a.rfq_id where a.vendor_id = gold)
               || ' bell=' || (select count(*) from public.notifications where profile_id = gold)
               || ' basic=' || (select string_agg(a.held, ',') from admin.lead_alerts a where a.vendor_id = basic and a.rfq_id = rfq3);
        want := 'sent,rate_limit,sent bell=2 basic=digest_only';
      elsif i = 9 then
        -- The Free vendor's fixture account moves to Gold and lists nowhere near the category;
        -- its catalogue is as close to the requirement as can be.
        update public.products set status = 'draft' where vendor_id = free;
        insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
        values (free, 'gold', 'monthly', 'active', now() - interval '5 days', now() + interval '25 days');
        update public.vendor_profiles set catalog_embedding = vec::extensions.halfvec(1536) where id = free;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 two passes', c1);
        got := (select count(*) from admin.lead_alerts a where a.rfq_id = rfq)::text
               || '/' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = free);
        update public.rfqs set embedding = vec::extensions.halfvec(1536) where id = rfq;
        got := got || ' then ' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq)
               || '/' || (select a.category_match::text || ':' || (a.score > 0.69) from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = free)
               || ' bell=' || (select count(*) from public.notifications where profile_id = gold)
               || ' run=' || (select with_embedding::text from admin.lead_alert_runs where rfq_id = rfq);
        update public.rfqs set embedding = vec::extensions.halfvec(1536) where id = rfq;   -- set again: nothing more
        got := got || ' again=' || (select count(*) from admin.lead_alerts a where a.rfq_id = rfq);
        want := '4/0 then 5/false:true bell=1 run=true again=5';
      elsif i = 10 then
        update public.subscription_plans set limits = limits || '{"lead_alert_channels": "broken"}'::jsonb where id = 'gold';
        insert into public.rfqs (id, buyer_id, title, category_id, created_at) values (rfq, buyer, 'P6 survives', c1, now() - interval '20 minutes');
        got := (select count(*) from public.rfqs where id = rfq)::text || ' err=' || (select (error is not null)::text from admin.lead_alert_runs where rfq_id = rfq)
               || ' alerts=' || (select count(*) from admin.lead_alerts where rfq_id = rfq);
        update public.subscription_plans set limits = limits || '{"lead_alert_channels": ["app", "email", "whatsapp", "sms"]}'::jsonb where id = 'gold';
        j := public.lead_digest_run();
        got := got || ' caught=' || (j ->> 'caught_up') || ' alerts=' || (select count(*) from admin.lead_alerts where rfq_id = rfq)
               || ' err=' || (select coalesce(error, 'none') from admin.lead_alert_runs where rfq_id = rfq);
        want := '1 err=true alerts=0 caught=1 alerts=4 err=none';
      elsif i = 11 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 denim jackets', c1), (rfq2, buyer, 'P6 polo shirts', c1);
        j := public.lead_digest_run();
        got := (j ->> 'digests') || ' basic=' || (select o.payload ->> 'count' from admin.notification_outbox o where o.profile_id = basic and o.template_key = 'lead_digest')
               || ' lines=' || (select o.payload ->> 'lines' from admin.notification_outbox o where o.profile_id = basic and o.template_key = 'lead_digest')
               || ' silver=' || (select count(*) from admin.notification_outbox o where o.profile_id = silver and o.template_key = 'lead_digest')
               || ' gold=' || (select count(*) from admin.notification_outbox o where o.profile_id = gold and o.template_key = 'lead_digest')
               || ' waiting=' || (select count(*) from admin.lead_alerts where digest_at is null);
        j := public.lead_digest_run();
        got := got || ' again=' || (j ->> 'digests') || '/' || (select count(*) from admin.notification_outbox o where o.template_key = 'lead_digest');
        want := '2 basic=2 new buyer requirements lines=- 2 in Activewear silver=1 gold=0 waiting=0 again=0/2';
      elsif i = 12 then
        update admin.lead_alert_config set hourly_cap = 1;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 sent at once', c2);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, buyer, 'P6 held back', c2);
        j := public.lead_digest_run();
        got := (select (o.payload ->> 'count') || ':' || (o.payload ->> 'lines') || ':' || ((o.payload::text) like '%P6 %')::text
                  from admin.notification_outbox o where o.profile_id = gold and o.template_key = 'lead_digest');
        want := '1 new buyer requirement:- 1 in Dress:false';
      elsif i = 13 then
        insert into public.lead_alert_settings (vendor_id, digest) values (basic, false);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 no digest', c1);
        j := public.lead_digest_run();
        got := (select count(*) from admin.notification_outbox o where o.profile_id = basic)::text
               || ' waiting=' || (select count(*) from admin.lead_alerts where vendor_id = basic and digest_at is null);
        want := '0 waiting=0';
      elsif i = 14 then
        update public.vendor_profiles set notifications = '{"emailNewRfq": false}'::jsonb where id = gold;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 no email', c1);
        got := 'bell=' || (select count(*) from public.notifications where profile_id = gold)
               || ' mail=' || (select count(*) from admin.notification_outbox where profile_id = gold)
               || ' went=' || (select array_to_string(a.channels, '+') from admin.lead_alerts a where a.rfq_id = rfq and a.vendor_id = gold)
               || ' vip mail=' || (select count(*) from admin.notification_outbox where profile_id = vip);
        want := 'bell=1 mail=0 went=app vip mail=1';
      elsif i = 15 then
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.set_lead_alert_settings(false, true, array[c1, c1, '00000000-0000-4000-8000-000000000000'::uuid], '22:00', '07:00');
        j := public.my_lead_alerts() -> 'settings';
        got := (j ->> 'instant') || '/' || (j ->> 'digest') || '/' || jsonb_array_length(j -> 'category_ids') || '/' || (j ->> 'quiet_start') || '-' || (j ->> 'quiet_end');
        begin perform public.set_lead_alert_settings(true, true, null, '22:00', null); got := got || ' half allowed';
        exception when sqlstate '22023' then got := got || ' half refused'; end;
        perform public.set_lead_alert_settings(true, true, null, null, null);
        j := public.my_lead_alerts() -> 'settings';
        reset role;
        got := got || ' cleared=' || (j ->> 'instant') || '/' || coalesce(j ->> 'category_ids', 'null') || '/' || coalesce(j ->> 'quiet_start', 'none')
               || ' rows=' || (select count(*) from public.lead_alert_settings);
        want := 'false/true/1/22:00-07:00 half refused cleared=true/null/none rows=1';
      elsif i = 16 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P6 page row', c1, 250);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_lead_alerts(10);
        reset role;
        got := (j ->> 'available') || '/' || (j ->> 'plan_id') || '/' || (j -> 'channels')::text || ' live=' || (j -> 'live_channels')::text || ' cats=' || jsonb_array_length(j -> 'categories')
               || ' alerts=' || jsonb_array_length(j -> 'alerts') || ':' || (j -> 'alerts' -> 0 ->> 'title') || ':' || (j -> 'alerts' -> 0 ->> 'category')
               || ':' || (j -> 'alerts' -> 0 ->> 'quantity') || ':' || (j -> 'alerts' -> 0 ->> 'open') || ':' || (j -> 'alerts' -> 0 -> 'channels')::text;
        perform set_config('request.jwt.claims', json_build_object('sub', free, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_lead_alerts();
        reset role;
        got := got || ' free=' || (j ->> 'available') || '/' || jsonb_array_length(j -> 'alerts');
        want := 'true/gold/["app", "email", "whatsapp", "sms"] live=["app", "email"] cats=2 alerts=1:P6 page row:Activewear:250:true:["app", "email"] free=false/0';
      elsif i = 17 then
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        reset role;
        got := (j ->> 'lead_alerts') || '/' || jsonb_array_length(j -> 'lead_alert_channels');
        perform set_config('request.jwt.claims', json_build_object('sub', free, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        reset role;
        got := got || ' free=' || (j ->> 'lead_alerts') || '/' || jsonb_array_length(j -> 'lead_alert_channels');
        update public.feature_flags set allow_profile_ids = '{}' where key = 'lead_alerts';
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements() -> 'features';
        reset role;
        got := got || ' off=' || (j ->> 'lead_alerts') || '/' || jsonb_array_length(j -> 'lead_alert_channels');
        want := 'true/4 free=false/0 off=false/4';
      elsif i = 18 then
        insert into public.lead_alert_settings (vendor_id, instant) values (basic, false);
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin perform admin.lead_alert_fanout(rfq); got := got || 'matching ran ';
        exception when insufficient_privilege then got := got || 'matching refused '; end;
        begin perform public.lead_digest_run(); got := got || 'digest ran ';
        exception when insufficient_privilege then got := got || 'digest refused '; end;
        begin insert into public.lead_alert_settings (vendor_id, instant) values (gold, false); got := got || 'insert allowed ';
        exception when insufficient_privilege then got := got || 'insert refused '; end;
        begin update public.lead_alert_settings set instant = true where vendor_id = basic; got := got || 'update allowed ';
        exception when insufficient_privilege then got := got || 'update refused '; end;
        got := got || 'sees=' || (select count(*) from public.lead_alert_settings);
        reset role;
        want := 'matching refused digest refused insert refused update refused sees=0';
      elsif i = 19 then
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 counted', c1);
        perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_lead_alert_stats(7);
        reset role;
        got := (j ->> 'requirements_matched') || '/' || (j ->> 'alerts') || '/' || (j ->> 'vendors_told') || '/' || (j ->> 'as_it_happened')
               || '/' || (j -> 'held')::text || '/' || (j ->> 'waiting_for_digest') || '/' || (j ->> 'match_errors');
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.admin_lead_alert_stats(7); got := got || ' vendor read';
        exception when insufficient_privilege then got := got || ' vendor refused'; end;
        reset role;
        want := '1/4/4/3/{"digest_only": 1}/4/0 vendor refused';
      elsif i = 20 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id in (gold, vip);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 in grace', c1);
        got := (select string_agg(a.plan_id, ',' order by a.plan_id) from admin.lead_alerts a where a.rfq_id = rfq);
        want := 'basic,gold,silver';   -- the lifecycle switch lists only the Gold vendor: VIP's plan is over
      elsif i = 21 then
        insert into public.rfqs (id, buyer_id, title, category_id)
        values (rfq, buyer, E'P6 urgent\nhttp://evil.example/pay call +91 98765 43210 or mail a@b.co', c1);
        got := (select nt.title from public.notifications nt where nt.profile_id = gold and nt.kind = 'lead_match')
               || ' | ' || (select coalesce(o.payload ->> 'title', 'no title') || '/' || ((o.payload::text) like '%urgent%')::text
                              from admin.notification_outbox o where o.profile_id = gold and o.template_key = 'lead_alert');
        j := public.lead_digest_run();
        got := got || ' | ' || (select o.payload ->> 'lines' from admin.notification_outbox o where o.profile_id = basic and o.template_key = 'lead_digest');
        -- Without a scheme, in another script's digits, with odd separators: still removed.
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, buyer, 'P6 pay at evil.com/pay or ९८७६५ ४३२१० or 98765/43210', c1);
        got := got || ' | ' || (select nt.title from public.notifications nt where nt.profile_id = silver and nt.kind = 'lead_match' and nt.title like 'New requirement: P6 pay%')
               || ' | subject=' || (select t.subject from admin.notification_templates t where t.key = 'lead_alert' and t.channel = 'email' and t.active order by t.version desc limit 1)
               || ' | wa=' || (select array_to_string(t.wa_params, ',') from admin.notification_templates t where t.key = 'lead_alert' and t.channel = 'whatsapp');
        want := 'New requirement: P6 urgent call or mail | no title/false | - 1 in Activewear | New requirement: P6 pay at or or | subject=New buyer requirement in {{category}} | wa=name,category,quantity';
      elsif i = 22 then
        update admin.lead_alert_config set buyer_daily_cap = 2;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 first', c1);
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq2, buyer, 'P6 second', c1);
        insert into public.rfqs (id, buyer_id, title, category_id, created_at) values (rfq3, buyer, 'P6 third', c1, now() - interval '20 minutes');
        got := (select string_agg(x.alerted::text || ':' || coalesce(x.skipped, '-'), ' ' order by q.title) from admin.lead_alert_runs x join public.rfqs q on q.id = x.rfq_id)
               || ' third=' || (select count(*) from admin.lead_alerts where rfq_id = rfq3);
        j := public.lead_digest_run();   -- the daily run doesn't tell them after all
        got := got || ' after=' || (j ->> 'caught_up') || '/' || (select count(*) from admin.lead_alerts where rfq_id = rfq3)
               || ' open=' || (select count(*) from public.rfqs where id = rfq3 and status = 'active');
        want := '4:- 4:- 0:buyer_cap third=0 after=0/0 open=1';
      elsif i = 23 then
        update admin.lead_alert_config set max_vendors = 3;
        update public.products set status = 'draft' where vendor_id = free;
        insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
        values (free, 'gold', 'monthly', 'active', now() - interval '5 days', now() + interval '25 days');
        update public.vendor_profiles set catalog_embedding = vec::extensions.halfvec(1536) where id = free;
        insert into public.rfqs (id, buyer_id, title, category_id) values (rfq, buyer, 'P6 capped', c1);
        got := (select count(*) from admin.lead_alerts where rfq_id = rfq)::text;
        update public.rfqs set embedding = vec::extensions.halfvec(1536) where id = rfq;
        got := got || '/' || (select count(*) from admin.lead_alerts where rfq_id = rfq) || ' alerted=' || (select alerted from admin.lead_alert_runs where rfq_id = rfq);
        want := '3/3 alerted=3';
      elsif i = 24 then
        update public.profiles set account_status = 'active' where id = buyer;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.rfqs (id, buyer_id, title, category_id, embedding) values (rfq, buyer, 'P6 crafted', c1, vec::extensions.halfvec(1536));
        update public.rfqs set embedding = vec::extensions.halfvec(1536) where id = rfq;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        got := (select (embedding is null)::text from public.rfqs where id = rfq) || ' alerts=' || (select count(*) from admin.lead_alerts where rfq_id = rfq)
               || ' run=' || (select with_embedding::text || '/' || alerted from admin.lead_alert_runs where rfq_id = rfq);
        want := 'true alerts=4 run=false/4';
      elsif i = 25 then
        insert into public.rfqs (id, buyer_id, title, category_id, quantity) values (rfq, buyer, 'P6 later removed', c1, 90);
        update public.rfqs set status = 'closed', removed_at = now(), removed_reason = 'spam' where id = rfq;
        perform set_config('request.jwt.claims', json_build_object('sub', gold, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_lead_alerts(5) -> 'alerts' -> 0;
        reset role;
        got := (j ->> 'title') || '/' || coalesce(j ->> 'category', 'null') || '/' || coalesce(j ->> 'quantity', 'null') || '/' || (j ->> 'open');
        want := 'A requirement Cosora removed/null/null/false';
      elsif i = 26 then
        got := (public.lead_digest_run() ->> 'digests');
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        got := got || '/' || (public.lead_digest_run() ->> 'digests');
        reset role;
        want := '0/0';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P6 (rolled back)%', E'\n' || out;
end
$p6$;
