-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P4: reminders, the grace days, paused listings (2026-10-08).
-- Migrations 20261008150000 (status "paused") and 20261008150100 (on top of P0-P3).
--   grace      the plan in force: active, then grace, then free; what a purchase costs in
--              the grace days; the seal date runs to the end of them
--   reminders  7/4/2/1/0 days before, once each, a missed day made up; the email switch;
--              autopay gets one notice; the grace notice; all of it off with the switch
--   lapse      expired after the grace days; listings over the limit paused, the vendor's
--              picks first, then the most viewed; a paid downgrade and an admin's cancel too
--   resume     a purchase brings them back as they were; an edited one goes to review; a
--              purchase never pauses
--   vendor     picks, swap, the Products page's numbers; no hand-written pause columns
--   access     the job, the cap and the switch test are refused to a browser
-- HOW TO RUN (local stack with P0-P4 applied, or: begin; <150100>; <this>; rollback;).
-- The status "paused" (150000) must already be committed. Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p4$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  other   uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  p1 uuid := 'a4000000-0000-4000-8000-000000000001';   -- live, 50 views
  p2 uuid := 'a4000000-0000-4000-8000-000000000002';   -- live, 40
  p3 uuid := 'a4000000-0000-4000-8000-000000000003';   -- live, 30
  p4 uuid := 'a4000000-0000-4000-8000-000000000004';   -- live, 20
  p5 uuid := 'a4000000-0000-4000-8000-000000000005';   -- live, 10
  p6 uuid := 'a4000000-0000-4000-8000-000000000006';   -- in review, 99
  px uuid := 'a4000000-0000-4000-8000-0000000000ff';   -- the other vendor's
  t_end timestamptz;
  labels text[] := array[
    'the plan in force: active, then grace, then free',                    -- 1
    'switch off: no grace days',                                           -- 2
    'get_vendor_plan in the grace days: still the plan, with grace_until', -- 3
    'vendor_entitlements in the grace days: still paid',                   -- 4
    'in grace, the same plan again is a renewal from the old end',         -- 5
    'in grace, another plan starts now',                                   -- 6
    'after the grace days a purchase is new',                              -- 7
    'a renewal paid in grace runs from the old end; seal date has grace',  -- 8
    'a reminder 7 days before: bell and email, once',                      -- 9
    'a missed day is made up: 3 days left sends the 4-day reminder',       -- 10
    'the day itself',                                                      -- 11
    'the email switch stops the email, not the bell',                      -- 12
    'autopay: one notice two days before, no reminders',                   -- 13
    'switch off: nobody is reminded',                                      -- 14
    'the grace notice: once, nothing paused yet',                          -- 15
    'the lapse: expired, told, over the Free limit paused, most viewed kept', -- 16
    'the vendor''s picks are kept first, then used up',                    -- 17
    'switch off: a lapse pauses nothing and says nothing',                 -- 18
    'a paid downgrade starting pauses down to the new limit',              -- 19
    'a purchase brings them back; one saved while paused goes to review',  -- 20
    'a vendor can''t write the pause columns or pause by hand',            -- 21
    'resubmitting a paused listing is held to the limit; draft is free',   -- 22
    'swap: the ones named go live, the others pause; within the limit',    -- 23
    'my_product_cap: the smaller limit that is coming',                    -- 24
    'an admin''s cancel pauses; a purchase never does',                    -- 25
    'the job, the cap and the switch test are refused to a browser',       -- 26
    'ads: the grace days keep the plan''s reach',                          -- 27
    'picks: own listings only; no plan, no picks',                         -- 28
    'the autopay-stopped email no longer names a date'];                   -- 29
  got text; want text; i int; n int; j jsonb;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  update public.feature_flags set enabled = false, allow_profile_ids = array[vendor] where key = 'subscription_lifecycle';
  update public.feature_flags set enabled = false, allow_profile_ids = array[vendor] where key = 'notification_delivery';
  update admin.billing_settings set grace_days = 7;
  update public.vendor_profiles set brand_name = 'P4 Vendor', owner_email = 'p4@example.com', notifications = '{}'::jsonb,
         plan_id = null, plan_expires_at = null where id = vendor;
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (other, 'P4 other vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  delete from public.vendor_subscriptions where vendor_id = other;
  delete from public.subscription_mandates where vendor_id = vendor;
  delete from public.notifications where profile_id = vendor;
  delete from admin.notification_outbox where profile_id = vendor;
  delete from admin.subscription_reminder_log where vendor_id = vendor;
  update public.products set status = 'draft' where vendor_id in (vendor, other) and status <> 'draft';
  insert into public.products (id, vendor_id, name, status, views_count, created_at) values
    (p1, vendor, 'P4-1', 'live', 50, now() - interval '6 days'),
    (p2, vendor, 'P4-2', 'live', 40, now() - interval '5 days'),
    (p3, vendor, 'P4-3', 'live', 30, now() - interval '4 days'),
    (p4, vendor, 'P4-4', 'live', 20, now() - interval '3 days'),
    (p5, vendor, 'P4-5', 'live', 10, now() - interval '2 days'),
    (p6, vendor, 'P4-6', 'under_review', 99, now() - interval '1 day'),
    (px, other,  'P4-other', 'live', 5, now());
  t_end := date_trunc('second', now()) + interval '20 days';
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'gold', 'monthly', 'active', t_end - interval '1 month', t_end)
  on conflict (vendor_id) do update set plan_id = 'gold', billing_cycle = 'monthly', status = 'active',
    current_period_start = t_end - interval '1 month', current_period_end = t_end,
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false, keep_product_ids = null;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', '', true);
      if i = 1 then
        got := (select status || '/' || plan_id from admin.vendor_effective_plan(vendor, t_end - interval '1 day'))
               || ' ' || (select status || '/' || plan_id || '/' || (period_end = t_end) from admin.vendor_effective_plan(vendor, t_end + interval '1 day'))
               || ' ' || (select status || '/' || plan_id from admin.vendor_effective_plan(vendor, t_end + interval '7 days'));
        want := 'active/gold grace/gold/true free/free';
      elsif i = 2 then
        update public.feature_flags set allow_profile_ids = '{}' where key = 'subscription_lifecycle';
        got := (select status || '/' || plan_id from admin.vendor_effective_plan(vendor, t_end + interval '1 day'))
               || ' ' || admin.grace_interval(vendor);
        want := 'free/free 00:00:00';
      elsif i = 3 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.get_vendor_plan();
        reset role;
        got := (j ->> 'status') || '/' || (j ->> 'effective_plan_id') || '/' || (j ->> 'trust_seal') || '/'
               || ((j ->> 'grace_until')::timestamptz = now() + interval '5 days') || '/' || (j ->> 'grace_days')
               || '/' || (j -> 'usage' ->> 'products_used') || '+' || (j -> 'usage' ->> 'products_paused');
        want := 'grace/gold/true/true/7/6+0';
      elsif i = 4 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_entitlements();
        reset role;
        got := (j ->> 'status') || '/' || (j ->> 'paid') || '/' || (j -> 'features' ->> 'crm') || '/' || (j -> 'features' ->> 'seal_tier')
               || '/' || ((j ->> 'grace_until')::timestamptz = now() + interval '5 days');
        want := 'grace/true/true/gold/true';
      elsif i = 5 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id = vendor;
        j := admin.subscription_quote(vendor, 'gold', 'monthly', now());
        got := (j ->> 'kind') || '/' || (j ->> 'in_grace') || '/' || ((j ->> 'period_start')::timestamptz = now() - interval '2 days')
               || '/' || ((j ->> 'period_end')::timestamptz = now() - interval '2 days' + interval '1 month') || '/' || (j ->> 'starts_now')
               || '/' || (j ->> 'current_plan_id');
        want := 'renewal/true/true/true/true/gold';
      elsif i = 6 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id = vendor;
        j := admin.subscription_quote(vendor, 'basic', 'monthly', now());
        got := (j ->> 'kind') || '/' || ((j ->> 'period_start')::timestamptz = now()) || '/' || (j ->> 'credit_rupees');
        j := admin.subscription_quote(vendor, 'gold', 'yearly', now());
        got := got || ' ' || (j ->> 'kind') || '/' || ((j ->> 'period_end')::timestamptz = now() + interval '1 year');
        want := 'new/true/0 new/true';
      elsif i = 7 then
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        j := admin.subscription_quote(vendor, 'gold', 'monthly', now());
        got := (j ->> 'kind') || '/' || (j ->> 'in_grace') || '/' || coalesce(j ->> 'current_plan_id', 'none');
        want := 'new/false/none';
      elsif i = 8 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        j := public.subscription_activate(vendor, 'gold', 'monthly');
        reset role;
        got := (j ->> 'kind') || ' end=' || (select current_period_end = now() - interval '2 days' + interval '1 month' from public.vendor_subscriptions where vendor_id = vendor)
               || ' seal=' || (select plan_id || '/' || (plan_expires_at = now() - interval '2 days' + interval '1 month' + interval '7 days')
                                 from public.vendor_profiles where id = vendor);
        want := 'renewal end=true seal=gold/true';
      elsif i = 9 then
        update public.vendor_subscriptions set current_period_end = now() + interval '7 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform public.expire_subscriptions();
        got := (select count(*) || ':' || max(title) from public.notifications where profile_id = vendor and kind = 'plan_expiring')
               || ' mail=' || (select count(*) || ':' || max(channel) || ':' || max(payload ->> 'when') from admin.notification_outbox where profile_id = vendor and template_key = 'plan_expiring')
               || ' log=' || (select string_agg(kind, ',' order by kind) from admin.subscription_reminder_log where vendor_id = vendor);
        want := '1:Your Gold plan ends in 7 days mail=1:email:in 7 days log=d7';
      elsif i = 10 then
        update public.vendor_subscriptions set current_period_end = now() + interval '3 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select max(title) from public.notifications where profile_id = vendor and kind = 'plan_expiring')
               || ' log=' || (select string_agg(kind, ',' order by kind) from admin.subscription_reminder_log where vendor_id = vendor);
        -- The next day (2 left) is its own reminder; the one after (1 left) too.
        update admin.subscription_reminder_log set period_end = now() + interval '2 days' where vendor_id = vendor;
        update public.vendor_subscriptions set current_period_end = now() + interval '2 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := got || ' then=' || (select string_agg(kind, ',' order by kind) from admin.subscription_reminder_log where vendor_id = vendor);
        want := 'Your Gold plan ends in 3 days log=d4 then=d2,d4';
      elsif i = 11 then
        update public.vendor_subscriptions
           set current_period_end = ((now() at time zone 'Asia/Kolkata')::date + time '23:59:59') at time zone 'Asia/Kolkata'
         where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select max(title) from public.notifications where profile_id = vendor and kind = 'plan_expiring')
               || ' log=' || (select string_agg(kind, ',' order by kind) from admin.subscription_reminder_log where vendor_id = vendor);
        want := 'Your Gold plan ends today log=d0';
      elsif i = 12 then
        update public.vendor_profiles set notifications = '{"emailPlanExpiry": false}'::jsonb where id = vendor;
        update public.vendor_subscriptions set current_period_end = now() + interval '7 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select count(*) from public.notifications where profile_id = vendor and kind = 'plan_expiring')
               || ' mail=' || (select count(*) from admin.notification_outbox where profile_id = vendor);
        want := '1 mail=0';
      elsif i = 13 then
        update public.vendor_subscriptions set current_period_end = now() + interval '2 days', auto_renew = true where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform public.expire_subscriptions();
        got := (select count(*) filter (where kind = 'autopay') || '/' || count(*) filter (where kind = 'plan_expiring') || ':' || max(title)
                  from public.notifications where profile_id = vendor)
               || ' mail=' || (select count(*) from admin.notification_outbox where profile_id = vendor);
        want := '1/0:Your Gold plan renews on ' || to_char((now() + interval '2 days') at time zone 'Asia/Kolkata', 'FMDD Mon YYYY') || ' mail=0';
      elsif i = 14 then
        update public.feature_flags set allow_profile_ids = '{}' where key = 'subscription_lifecycle';
        update public.vendor_subscriptions set current_period_end = now() + interval '7 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select count(*) from public.notifications where profile_id = vendor)
               || '/' || (select count(*) from admin.subscription_reminder_log where vendor_id = vendor);
        want := '0/0';
      elsif i = 15 then
        update public.vendor_subscriptions set current_period_end = now() - interval '1 day' where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform public.expire_subscriptions();
        got := (select status from public.vendor_subscriptions where vendor_id = vendor)
               || ' bell=' || (select count(*) || ':' || (max(title) like 'Your Gold plan has ended: renew by %') from public.notifications where profile_id = vendor)
               || ' mail=' || (select count(*) || ':' || max(template_key) || ':' || (max(payload ->> 'grace_until') = to_char((now() + interval '6 days') at time zone 'Asia/Kolkata', 'FMDD Mon YYYY'))
                                 from admin.notification_outbox where profile_id = vendor)
               || ' paused=' || (select count(*) from public.products where vendor_id = vendor and status::text = 'paused')
               || ' seal=' || (select plan_id || '/' || (plan_expires_at = now() + interval '6 days') from public.vendor_profiles where id = vendor);
        want := 'active bell=1:true mail=1:plan_grace:true paused=0 seal=gold/true';
      elsif i = 16 then
        -- The seal date is ahead of the plan here (an admin's edit, say): the lapse still ends it.
        update public.vendor_profiles set plan_id = 'gold', plan_expires_at = now() + interval '20 days' where id = vendor;
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select status from public.vendor_subscriptions where vendor_id = vendor)
               || ' live=' || (select string_agg(name, ',' order by name) from public.products where vendor_id = vendor and status = 'live')
               || ' paused=' || (select count(*) || '(' || string_agg(paused_from, ',' order by name) || ')' from public.products where vendor_id = vendor and status::text = 'paused')
               || ' bell=' || (select string_agg(kind, ',' order by kind) from public.notifications where profile_id = vendor)
               || ' mail=' || (select string_agg(template_key, ',' order by template_key) from admin.notification_outbox where profile_id = vendor)
               || ' seal=' || (select coalesce(plan_id, 'none') from public.vendor_profiles where id = vendor)
               || ' other=' || (select status::text from public.products where id = px);
        want := 'expired live=P4-1,P4-2 paused=4(live,live,live,under_review) bell=listings_paused,plan_lapsed mail=listings_paused,plan_lapsed seal=none other=live';
      elsif i = 17 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_keep_products(array[p5, p4, p5]);
        reset role;
        perform set_config('request.jwt.claims', '', true);
        got := (j ->> 'kept') || ' ' || (select keep_product_ids::text from public.vendor_subscriptions where vendor_id = vendor);
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := got || ' live=' || (select string_agg(name, ',' order by name) from public.products where vendor_id = vendor and status = 'live')
               || ' picks=' || (select coalesce(keep_product_ids::text, 'cleared') from public.vendor_subscriptions where vendor_id = vendor);
        want := '2 {' || p5 || ',' || p4 || '} live=P4-4,P4-5 picks=cleared';
      elsif i = 18 then
        update public.feature_flags set allow_profile_ids = '{}' where key = 'subscription_lifecycle';
        update public.vendor_subscriptions set current_period_end = now() - interval '1 hour' where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select status from public.vendor_subscriptions where vendor_id = vendor)
               || ' paused=' || (select count(*) from public.products where vendor_id = vendor and status::text = 'paused')
               || ' bell=' || (select count(*) from public.notifications where profile_id = vendor);
        want := 'expired paused=0 bell=0';
      elsif i = 19 then
        update public.subscription_plans set limits = limits || '{"product_cap": 3}'::jsonb where id = 'basic';
        update public.vendor_subscriptions
           set scheduled_plan_id = 'basic', scheduled_billing_cycle = 'monthly', scheduled_from = now() - interval '1 minute',
               current_period_end = now() + interval '30 days'
         where vendor_id = vendor;
        perform public.expire_subscriptions();
        got := (select plan_id || '/' || status from public.vendor_subscriptions where vendor_id = vendor)
               || ' live=' || (select string_agg(name, ',' order by name) from public.products where vendor_id = vendor and status = 'live')
               || ' paused=' || (select count(*) from public.products where vendor_id = vendor and status::text = 'paused')
               || ' bell=' || (select string_agg(kind, ',' order by kind) from public.notifications where profile_id = vendor);
        want := 'basic/active live=P4-1,P4-2,P4-3 paused=3 bell=listings_paused,subscription_changed';
      elsif i = 20 then
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.products set name = 'P4-3 edited' where id = p3;
        update public.products set name = 'P4-4' where id = p4;   -- saved unchanged: its photos may have changed
        reset role;
        got := (select string_agg(paused_from, ',' order by name) from public.products where vendor_id = vendor and status::text = 'paused');
        delete from public.notifications where profile_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        j := public.subscription_activate(vendor, 'gold', 'monthly');
        reset role;
        got := got || ' ' || (j ->> 'kind') || ' ' || (select string_agg(name || '=' || status::text, ',' order by name) from public.products where vendor_id = vendor)
               || ' marks=' || (select count(*) from public.products where vendor_id = vendor and (paused_at is not null or paused_from is not null))
               || ' bell=' || (select string_agg(kind || ':' || title, ',') from public.notifications where profile_id = vendor);
        want := 'under_review,under_review,live,under_review new P4-1=live,P4-2=live,P4-3 edited=under_review,P4-4=under_review,P4-5=live,P4-6=under_review marks=0 bell=listings_resumed:4 paused listings are back';
      elsif i = 21 then
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin update public.products set paused_from = 'live', paused_at = now() - interval '1 day' where id = p6; got := got || 'marks written ';
        exception when insufficient_privilege then got := got || 'marks refused '; end;
        begin update public.products set status = 'paused' where id = p1; got := got || 'paused by hand ';
        exception when insufficient_privilege then got := got || 'pause refused '; end;
        begin update public.products set status = 'live' where id = p3; got := got || 'resumed by hand';
        exception when insufficient_privilege or sqlstate 'P0001' then got := got || 'resume refused'; end;
        reset role;
        want := 'marks refused pause refused resume refused';
      elsif i = 22 then
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin update public.products set status = 'under_review' where id = p3; got := 'resubmitted ';
        exception when sqlstate 'P0001' then got := 'held to the limit '; end;
        update public.products set status = 'draft' where id = p4;
        reset role;
        got := got || (select status::text || '/' || coalesce(paused_from, 'null') || '/' || (paused_at is null) from public.products where id = p4);
        want := 'held to the limit draft/null/true';
      elsif i = 23 then
        update public.vendor_subscriptions set current_period_end = now() - interval '8 days' where vendor_id = vendor;
        perform public.expire_subscriptions();
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.vendor_set_live_products(array[p3, p6]);
        got := (j ->> 'paused') || '/' || (j ->> 'resumed');
        begin perform public.vendor_set_live_products(array[p1, p2, p3]); got := got || ' three allowed';
        exception when sqlstate 'P0001' then got := got || ' three refused'; end;
        begin perform public.vendor_set_live_products(array[px]); got := got || ' theirs allowed';
        exception when sqlstate '22023' then got := got || ' theirs refused'; end;
        reset role;
        got := got || ' ' || (select string_agg(name || '=' || status::text || coalesce('<' || paused_from, ''), ',' order by name) from public.products where vendor_id = vendor)
               || ' other=' || (select status::text from public.products where id = px);
        want := '2/2 three refused theirs refused P4-1=paused<live,P4-2=paused<live,P4-3=live,P4-4=paused<live,P4-5=paused<live,P4-6=under_review other=live';
      elsif i = 24 then
        update public.vendor_subscriptions set current_period_end = now() + interval '3 days' where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_product_cap();
        reset role;
        got := (j ->> 'available') || '/' || (j ->> 'cap') || '/' || (j ->> 'active') || '/' || (j ->> 'paused') || ' next='
               || (j -> 'next' ->> 'reason') || '/' || (j -> 'next' ->> 'cap') || '/' || ((j -> 'next' ->> 'at')::timestamptz = now() + interval '10 days');
        update public.vendor_subscriptions set auto_renew = true where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_product_cap();
        reset role;
        got := got || ' autopay=' || coalesce(j -> 'next' ->> 'reason', 'none');
        update public.vendor_subscriptions set auto_renew = false, current_period_end = now() + interval '20 days' where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_product_cap();
        reset role;
        got := got || ' early=' || coalesce(j -> 'next' ->> 'reason', 'none');
        want := 'true/200/6/0 next=plan_end/2/true autopay=none early=none';
      elsif i = 25 then
        -- Someone already over a plan's limit who buys it keeps what they have: the plan
        -- ended while the switch was off (nothing paused), and Basic here allows 3.
        update public.subscription_plans set limits = limits || '{"product_cap": 3}'::jsonb where id = 'basic';
        update public.feature_flags set allow_profile_ids = '{}' where key = 'subscription_lifecycle';
        update public.vendor_subscriptions set status = 'expired', current_period_end = now() - interval '30 days' where vendor_id = vendor;
        update public.feature_flags set allow_profile_ids = array[vendor] where key = 'subscription_lifecycle';
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        j := public.subscription_activate(vendor, 'basic', 'monthly');
        reset role;
        got := 'purchase ' || (j ->> 'kind') || ' paused=' || (select count(*) from public.products where vendor_id = vendor and status::text = 'paused');
        -- An admin's cancel ends the plan now: the Free limit applies.
        update public.vendor_subscriptions set status = 'canceled', current_period_end = now() where vendor_id = vendor;
        got := got || ', cancel paused=' || (select count(*) from public.products where vendor_id = vendor and status::text = 'paused')
               || ' live=' || (select string_agg(name, ',' order by name) from public.products where vendor_id = vendor and status = 'live');
        want := 'purchase new paused=0, cancel paused=4 live=P4-1,P4-2';
      elsif i = 26 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin perform public.expire_subscriptions(); got := got || 'job ran ';
        exception when insufficient_privilege then got := got || 'job refused '; end;
        begin perform admin.apply_product_cap(vendor, true); got := got || 'cap ran ';
        exception when insufficient_privilege then got := got || 'cap refused '; end;
        begin perform admin.feature_on_for('subscription_lifecycle', vendor); got := got || 'switch read ';
        exception when insufficient_privilege then got := got || 'switch refused '; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        set local role anon;
        begin perform public.my_product_cap(); got := got || 'anon read';
        exception when insufficient_privilege then got := got || 'anon refused'; end;
        reset role;
        want := 'job refused cap refused switch refused anon refused';
      elsif i = 27 then
        update public.vendor_subscriptions set current_period_end = now() - interval '2 days' where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'grace:' || public.vendor_cap_plan(vendor);
        begin
          insert into public.advertisements (vendor_id, title) values (vendor, 'P4 grace ad');
          got := got || ' ad allowed';
        exception when others then
          got := got || case when sqlerrm like 'Advertising is a paid feature%' then ' ad refused as Free' else ' ad allowed' end;
        end;
        reset role;
        update public.feature_flags set allow_profile_ids = '{}' where key = 'subscription_lifecycle';
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          insert into public.advertisements (vendor_id, title) values (vendor, 'P4 no-grace ad');
          got := got || ', off: ad allowed';
        exception when others then
          got := got || case when sqlerrm like 'Advertising is a paid feature%' then ', off: ad refused as Free' else ', off: ad allowed' end;
        end;
        reset role;
        want := 'grace:gold ad allowed, off: ad refused as Free';
      elsif i = 28 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.vendor_keep_products(array[p1, px]); got := 'theirs kept';
        exception when sqlstate '22023' then got := 'theirs refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.vendor_keep_products(array[px]); got := got || ', no plan kept';
        exception when sqlstate 'P0001' then got := got || ', no plan refused'; end;
        j := public.my_product_cap();
        reset role;
        got := got || ', ' || (j ->> 'plan_id') || '/' || (j ->> 'cap') || '/' || (j ->> 'active') || '/' || (j ->> 'available') || '/' || coalesce(j ->> 'next', 'none');
        want := 'theirs refused, no plan refused, free/2/1/false/none';
      elsif i = 29 then
        got := (select version || ':' || (body not like '%{{period_end}}%') from admin.notification_templates
                 where key = 'autopay_stopped' and channel = 'email' and locale = 'en' and active order by version desc limit 1)
               || ' wa=' || (select active::text from admin.notification_templates where key = 'plan_expiring' and channel = 'whatsapp');
        want := '2:true wa=false';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P4 (rolled back)%', E'\n' || out;
end
$p4$;
