-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P3: autopay (2026-10-08).
-- Migration 20261009174014_subscriptions_p3_autopay.sql (on top of P0, P1 and P2).
--   plans     a Razorpay plan is saved once per plan, cycle, mode and amount
--   mandate   created → authenticated → active; statuses only move forward; cancelled is
--             final; auto_renew follows; a new mandate lists the old one for cancelling
--   charges   the upfront payment is the first order; a later charge is a renewal order,
--             fulfilled once through subscription_fulfil; a wrong amount opens an incident
--   trouble   pending and halted tell the vendor (bell, and one email per day)
--   access    service functions refused to a browser; a vendor reads only its own mandates
--   activate  a purchase no longer sets auto_renew
-- HOW TO RUN (local stack with P0-P3 applied, or: begin; <P3>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p3$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  other   uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  finance uuid := 'b71bf451-a5f9-4ab5-8196-f9ff3bb2122e';   -- local-support, promoted below
  t0      timestamptz := date_trunc('second', now()) + interval '30 days';
  labels text[] := array[
    'a Razorpay plan is saved once; a second save gets the first',  -- 1
    'the autopay functions are refused to a browser',               -- 2
    'a mandate that isn''t authenticated isn''t autopay',           -- 3
    'authenticated: on, with method and next charge; once',         -- 4
    'a new mandate lists the old one for cancelling',               -- 5
    'the upfront payment is the first order',                       -- 6
    'a renewal charge: a renewal order, fulfilled once',            -- 7
    'a charge for another amount: incident, still renewed',         -- 8
    'pending: the vendor is told, one email a day',                 -- 9
    'halted: autopay off, the vendor told',                         -- 10
    'cancelled is final',                                           -- 11
    'an unknown subscription is not ours',                          -- 12
    'mandates: own only; another vendor none; finance all',         -- 13
    'a purchase no longer claims autopay',                          -- 14
    'autopay_vendor_open: the one that is set up',                  -- 15
    'autopay incidents: only the autopay kinds',                    -- 16
    'my_autopay for someone with none: off',                        -- 17
    'a first purchase with autopay: on once the plan exists'];      -- 18
  got text; want text; i int; n int; j jsonb;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  update admin.admin_users set admin_role = 'finance_admin' where id = finance;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'gold', 'monthly', 'expired', now() - interval '60 days', now() - interval '30 days')
  on conflict (vendor_id) do update set plan_id = 'gold', billing_cycle = 'monthly', status = 'expired',
    current_period_start = now() - interval '60 days', current_period_end = now() - interval '30 days',
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;
  update public.vendor_profiles set brand_name = 'P3 Vendor', owner_email = 'p3@example.com' where id = vendor;
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (other, 'P3 other vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  delete from public.subscription_mandates where vendor_id in (vendor, other);
  delete from admin.subscription_gateway_plans;
  delete from admin.billing_entity;
  update public.feature_flags set enabled = false, allow_profile_ids = array[vendor] where key = 'notification_delivery';
  update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key = 'subscription_autopay';

  for i in 1..array_length(labels, 1) loop
    begin
      -- The upfront order and its mandate, as subscription-autopay would leave them at checkout.
      insert into public.subscription_payment_orders
        (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees, autopay)
      values ('sub_p3_a', vendor, 'gold', 'monthly', 271300, 'created', 'test', 2299, 0, 'new', 0, true);
      perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      set local role service_role;
      perform public.autopay_mandate_create(vendor, 'sub_p3_a', 'gold', 'monthly', 'test', 2299, 271300, 'sub_p3_a', t0);

      if i = 1 then
        got := public.autopay_gateway_plan_save('gold', 'monthly', 'test', 2299, 271300, 'plan_p3_A');
        got := got || ',' || public.autopay_gateway_plan_save('gold', 'monthly', 'test', 2299, 271300, 'plan_p3_B');
        got := got || ',' || public.autopay_gateway_plan('gold', 'monthly', 'test', 271300)
               || ',' || coalesce(public.autopay_gateway_plan('gold', 'yearly', 'test', 271300), 'none');
        want := 'plan_p3_A,plan_p3_A,plan_p3_A,none';
      elsif i = 2 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        begin perform public.autopay_charge('sub_p3_a', 'pay_x', 271300); got := got || 'charge ran ';
        exception when insufficient_privilege then got := got || 'charge refused '; end;
        begin perform public.autopay_mandate_event('sub_p3_a', 'active'); got := got || 'event ran';
        exception when insufficient_privilege then got := got || 'event refused'; end;
        want := 'charge refused event refused';
      elsif i = 3 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_autopay();
        reset role;
        got := (j ->> 'on') || ' renew=' || (select auto_renew from public.vendor_subscriptions where vendor_id = vendor);
        want := 'false renew=false';
      elsif i = 4 then
        j := public.autopay_mandate_event('sub_p3_a', 'authenticated', 'upi', t0);
        got := (j ->> 'changed');
        j := public.autopay_mandate_event('sub_p3_a', 'authenticated', null, null);
        got := got || ',' || (j ->> 'changed');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_autopay();
        reset role;
        got := got || ' ' || (j ->> 'on') || '/' || (j ->> 'status') || '/' || (j ->> 'method') || '/' || (j ->> 'amount_paise')
               || '/' || ((j ->> 'next_charge_at')::timestamptz = t0) || ' renew=' || (select auto_renew from public.vendor_subscriptions where vendor_id = vendor);
        want := 'true,false true/authenticated/upi/271300/true renew=true';
      elsif i = 5 then
        perform public.autopay_mandate_event('sub_p3_a', 'active', 'card', t0);
        perform public.autopay_mandate_create(vendor, 'sub_p3_b', 'gold', 'yearly', 'test', 22990, 2712800, null, t0);
        j := public.autopay_mandate_event('sub_p3_b', 'authenticated', 'upi', t0);
        got := (j -> 'replace')::text;
        j := public.autopay_mandate_event('sub_p3_a', 'cancelled');
        j := public.autopay_mandate_event('sub_p3_b', 'active');
        got := got || ' then ' || (j -> 'replace')::text;
        want := '["sub_p3_a"] then []';
      elsif i = 6 then
        perform public.autopay_mandate_event('sub_p3_a', 'authenticated', 'upi', t0);
        j := public.autopay_charge('sub_p3_a', 'pay_p3_1', 271300);
        got := (j ->> 'kind') || ' ' || (j ->> 'order_ref');
        want := 'first sub_p3_a';
      elsif i in (7, 8) then
        perform public.autopay_mandate_event('sub_p3_a', 'authenticated', 'upi', t0);
        j := public.subscription_fulfil('sub_p3_a', 'pay_p3_1', 'verify');
        if i = 7 then
          j := public.autopay_charge('sub_p3_a', 'pay_p3_2', 271300);
          got := (j ->> 'kind') || ' ' || (j ->> 'order_ref');
          j := public.subscription_fulfil(j ->> 'order_ref', 'pay_p3_2', 'webhook');
          got := got || ' ' || (j ->> 'kind');
          j := public.autopay_charge('sub_p3_a', 'pay_p3_2', 271300);
          got := got || ' again=' || (j ->> 'kind');
          reset role;
          got := got || ' ' || (select string_agg(change_kind || ':' || amount || '+' || gst_amount, ',' order by created_at, change_kind)
                                  from public.subscription_invoices where vendor_id = vendor and razorpay_payment_id like 'pay_p3_%')
                 || ' months=' || (select round(extract(epoch from current_period_end - current_period_start) / 86400 / 30)
                                     from public.vendor_subscriptions where vendor_id = vendor)
                 || ' incidents=' || (select count(*) from admin.billing_incidents where kind = 'autopay_amount_mismatch');
          want := 'renewal subchg_pay_p3_2 renewal again=already new:2299+414,renewal:2299+414 months=2 incidents=0';
        else
          j := public.autopay_charge('sub_p3_a', 'pay_p3_3', 100000);
          got := (j ->> 'kind');
          j := public.subscription_fulfil(j ->> 'order_ref', 'pay_p3_3', 'webhook');
          reset role;
          got := got || ' fulfilled=' || (j ->> 'ok') || ' incident='
                 || (select (detail ->> 'charged_paise') || '/' || (detail ->> 'expected_paise') from admin.billing_incidents
                      where kind = 'autopay_amount_mismatch' and payment_ref = 'pay_p3_3');
          want := 'renewal fulfilled=true incident=100000/271300';
        end if;
      elsif i in (9, 10) then
        perform public.autopay_mandate_event('sub_p3_a', 'active', 'upi', t0);
        if i = 9 then
          perform public.autopay_mandate_event('sub_p3_a', 'pending');
          perform public.autopay_mandate_event('sub_p3_a', 'active');
          perform public.autopay_mandate_event('sub_p3_a', 'pending');
          reset role;
          got := 'bell=' || (select count(*) from public.notifications where profile_id = vendor and kind = 'autopay' and created_at > now() - interval '1 minute')
                 || ' emails=' || (select count(*) from admin.notification_outbox where profile_id = vendor and template_key = 'autopay_payment_failed')
                 || ' ' || (select (payload ->> 'amount') || ' ' || (payload ->> 'plan_name') from admin.notification_outbox
                             where profile_id = vendor and template_key = 'autopay_payment_failed' limit 1)
                 || ' renew=' || (select auto_renew from public.vendor_subscriptions where vendor_id = vendor);
          want := 'bell=2 emails=1 ₹2,713.00 Gold renew=true';
        else
          perform public.autopay_mandate_event('sub_p3_a', 'pending');
          perform public.autopay_mandate_event('sub_p3_a', 'halted');
          reset role;
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          set local role authenticated;
          j := public.my_autopay();
          reset role;
          got := (j ->> 'on') || '/' || (j ->> 'status') || ' renew=' || (select auto_renew from public.vendor_subscriptions where vendor_id = vendor)
                 || ' stopped=' || (select count(*) from admin.notification_outbox where profile_id = vendor and template_key = 'autopay_stopped')
                 || ' next=' || coalesce(j ->> 'next_charge_at', 'none');
          want := 'false/halted renew=false stopped=1 next=none';
        end if;
      elsif i = 11 then
        perform public.autopay_mandate_event('sub_p3_a', 'active', 'upi', t0);
        perform public.autopay_mandate_event('sub_p3_a', 'cancelled');
        j := public.autopay_mandate_event('sub_p3_a', 'active');
        reset role;
        got := (j ->> 'status') || ' changed=' || (j ->> 'changed') || ' ended=' || (select ended_at is not null from public.subscription_mandates where razorpay_subscription_id = 'sub_p3_a')
               || ' renew=' || (select auto_renew from public.vendor_subscriptions where vendor_id = vendor);
        want := 'cancelled changed=false ended=true renew=false';
      elsif i = 12 then
        got := (public.autopay_mandate_event('sub_nobody', 'active') ->> 'known') || ',' || (public.autopay_charge('sub_nobody', 'pay_n', 100) ->> 'known');
        want := 'false,false';
      elsif i = 13 then
        perform public.autopay_mandate_create(other, 'sub_p3_other', 'basic', 'monthly', 'test', 699, 82500, null, t0);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select string_agg(razorpay_subscription_id, ',' order by razorpay_subscription_id) into got from public.subscription_mandates;
        begin
          update public.subscription_mandates set status = 'active' where vendor_id = vendor;
          got := got || ' wrote';
        exception when insufficient_privilege then got := got || ' no-write';
        end;
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        select got || ' | other ' || string_agg(razorpay_subscription_id, ',') into got from public.subscription_mandates;
        perform set_config('request.jwt.claims', json_build_object('sub', finance, 'role', 'authenticated')::text, true);
        select got || ' | finance ' || count(*) into got from public.subscription_mandates where razorpay_subscription_id like 'sub_p3_%';
        want := 'sub_p3_a no-write | other sub_p3_other | finance 2';
      elsif i = 14 then
        reset role;
        insert into public.subscription_payment_orders
          (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
        values ('order_p3_manual', vendor, 'gold', 'monthly', 271300, 'created', 'test', 2299, 0, 'new', 0);
        set local role service_role;
        j := public.subscription_fulfil('order_p3_manual', 'pay_p3_m', 'verify');
        reset role;
        got := (j ->> 'ok') || ' ' || (select status || ' renew=' || auto_renew from public.vendor_subscriptions where vendor_id = vendor);
        want := 'true active renew=false';
      elsif i = 15 then
        got := coalesce(public.autopay_vendor_open(vendor) ->> 'sub_id', 'none');
        perform public.autopay_mandate_event('sub_p3_a', 'authenticated', 'upi', t0);
        got := got || ',' || (public.autopay_vendor_open(vendor) ->> 'sub_id') || '/' || (public.autopay_vendor_open(vendor) ->> 'status');
        perform public.autopay_mandate_event('sub_p3_a', 'cancelled');
        got := got || ',' || coalesce(public.autopay_vendor_open(vendor) ->> 'sub_id', 'none');
        want := 'none,sub_p3_a/authenticated,none';
      elsif i = 16 then
        begin
          perform public.autopay_incident('dispute', 'sub_p3_a', '{}');
          got := 'dispute opened';
        exception when sqlstate '22023' then got := 'dispute refused';
        end;
        perform public.autopay_incident('autopay_cancel_failed', 'sub_p3_a', '{"status": 502}');
        reset role;
        got := got || ', ' || (select kind || ' ' || (vendor_id = vendor) || ' ' || (detail ->> 'subscription') from admin.billing_incidents
                                where kind = 'autopay_cancel_failed' and order_ref = 'sub_p3_a');
        want := 'dispute refused, autopay_cancel_failed true sub_p3_a';
      elsif i = 17 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.my_autopay();
        got := (j ->> 'on') || ' available=' || (j ->> 'available');
        want := 'false available=false';
      elsif i = 18 then
        -- A seller who has never had a plan: the mandate is authenticated (verify) before
        -- the fulfilment creates the vendor_subscriptions row.
        reset role;
        delete from public.vendor_subscriptions where vendor_id = vendor;
        set local role service_role;
        perform public.autopay_mandate_event('sub_p3_a', 'authenticated', 'upi', t0);
        j := public.subscription_fulfil('sub_p3_a', 'pay_p3_first', 'verify');
        reset role;
        got := (j ->> 'ok') || ' ' || (select plan_id || '/' || status || ' renew=' || auto_renew from public.vendor_subscriptions where vendor_id = vendor);
        want := 'true gold/active renew=true';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P3 (rolled back)%', E'\n' || out;
end
$p3$;
