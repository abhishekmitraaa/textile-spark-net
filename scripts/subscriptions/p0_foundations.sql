-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P0: foundations and safety (2026-10-08).
-- Migration 20261009171435_subscriptions_p0_foundations.sql.
--   S-1   get_vendor_plan: signed-out callers can't run it; another vendor gets null;
--         the vendor and an admin get the plan
--   rule  a paid downgrade counts from scheduled_from at read time, in get_vendor_plan,
--         vendor_cap_plan and vendor_entitlements, before the daily sweep runs
--   cap   the product cap still holds, now reading the plan through the shared rule
--   ent   vendor_entitlements: own ok, another vendor refused, seal tier by plan
--   flags feature_on / my_feature_flags follow enabled and the allowlist; only a super
--         admin changes a switch, with a reason that reaches the Admin Log
--   gate  subscription_checkout_gate: service role only; not a vendor, suspended,
--         switch off, allowed
--   S-4   payment orders: the vendor, finance and support read; a product moderator doesn't
--   VIP   open: the quote no longer answers invite_only
--   GST   gstin_is_valid; billing entity: finance saves, a bad GSTIN or state is refused,
--         a moderator is refused, the reason reaches the Admin Log
-- HOW TO RUN (local stack): begin; <migration>; <this file>; rollback;  It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p0$
declare
  vendor   uuid := '22222222-2222-2222-2222-222222222222';
  other    uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';   -- local-extra1, made a vendor below
  buyer    uuid := '11111111-1111-1111-1111-111111111111';
  sadmin   uuid := '33333333-3333-3333-3333-333333333333';
  moder    uuid := '7b9fad26-da14-48b1-9717-a96f47a5946a';
  finance  uuid := 'b71bf451-a5f9-4ab5-8196-f9ff3bb2122e';   -- local-support, promoted to finance_admin below
  labels text[] := array[
    'S-1 anon cannot run get_vendor_plan',          -- 1
    'S-1 another vendor gets null',                 -- 2
    'S-1 own vendor gets the plan',                 -- 3
    'S-1 admin gets the plan',                      -- 4
    'rule scheduled downgrade counts at read time', -- 5
    'rule vendor_cap_plan follows it',              -- 6
    'cap product cap still holds',                  -- 7
    'ent own entitlements, gold seal',              -- 8
    'ent another vendor refused',                   -- 9
    'flags off by default',                         -- 10
    'flags allowlist turns it on for one account',  -- 11
    'flags manager cannot change a switch',         -- 12
    'flags super admin needs a reason',             -- 13
    'flags change reaches the Admin Log',           -- 14
    'gate refused to a browser',                    -- 15
    'gate buyer is not a vendor',                   -- 16
    'gate suspended vendor',                        -- 17
    'gate switch off',                              -- 18
    'gate allowlisted vendor ok',                   -- 19
    'S-4 vendor reads own payment orders',          -- 20
    'S-4 finance reads all payment orders',         -- 21
    'S-4 moderator reads none',                     -- 22
    'VIP quote is not invite_only',                 -- 23
    'GST checksum',                                 -- 24
    'GST finance saves billing entity',             -- 25
    'GST bad checksum refused',                     -- 26
    'GST state mismatch refused',                   -- 27
    'GST moderator refused',                        -- 28
    'GST save reaches the Admin Log'];              -- 29
  got text; want text; i int; n int; j jsonb;
  out text := '';
begin
  -- Fixtures (all rolled back).
  update admin.admin_users set admin_role = 'finance_admin' where id = finance;
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (other, 'P0 other vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end,
                                           scheduled_plan_id, scheduled_billing_cycle, scheduled_from)
  values (vendor, 'gold', 'monthly', 'active', now() - interval '20 days', now() + interval '40 days',
          null, null, null)
  on conflict (vendor_id) do update set plan_id = 'gold', billing_cycle = 'monthly', status = 'active',
    current_period_start = now() - interval '20 days', current_period_end = now() + interval '40 days',
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'subscription_payment_orders' and column_name = 'payment_mode') then
    -- Since P1 every order says its mode; P13 switched off the shim that guessed it.
    execute $o$insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode)
      values ('order_p0_harness_1', $1, 'gold', 'monthly', 271282, 'created', 'test'),
             ('order_p0_harness_2', $2, 'basic', 'monthly', 82482, 'created', 'test')$o$ using vendor, other;
  else
    insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status)
    values ('order_p0_harness_1', vendor, 'gold', 'monthly', 271282, 'created'),
           ('order_p0_harness_2', other, 'basic', 'monthly', 82482, 'created');
  end if;

  for i in 1..array_length(labels, 1) loop
    begin
      -- Who is asking.
      perform set_config('request.jwt.claims', json_build_object(
        'sub', case when i in (1, 15) then null
                    when i in (4, 12) then case when i = 4 then sadmin else 'bae52e9d-7390-4e58-a92c-5756553c2c8e' end
                    when i in (13, 14) then sadmin
                    when i in (21, 25, 26, 27, 29) then finance
                    when i in (22, 28) then moder
                    when i = 11 then vendor
                    else vendor end,
        'role', case when i = 1 then 'anon' when i in (16, 17, 18, 19) then 'service_role' else 'authenticated' end)::text, true);
      if i = 1 then
        set local role anon;
      elsif i in (16, 17, 18, 19) then
        set local role service_role;
      elsif i not in (5, 6, 24) then
        set local role authenticated;
      end if;

      if i = 1 then
        begin
          j := public.get_vendor_plan(vendor);
          got := 'ran: ' || coalesce(j ->> 'effective_plan_id', 'null');
        exception when insufficient_privilege then got := 'denied';
        end;
        want := 'denied';
      elsif i = 2 then
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        got := coalesce(public.get_vendor_plan(vendor)::text, 'null'); want := 'null';
      elsif i = 3 then
        got := public.get_vendor_plan(vendor) ->> 'effective_plan_id'; want := 'gold';
      elsif i = 4 then
        got := public.get_vendor_plan(vendor) ->> 'effective_plan_id'; want := 'gold';
      elsif i = 5 then
        update public.vendor_subscriptions
           set scheduled_plan_id = 'silver', scheduled_billing_cycle = 'monthly', scheduled_from = now() - interval '1 minute'
         where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.get_vendor_plan(vendor);
        got := (j ->> 'effective_plan_id') || ' scheduled=' || coalesce(j ->> 'scheduled_plan_id', 'none')
               || ' ent=' || (public.vendor_entitlements(vendor) ->> 'plan_id');
        want := 'silver scheduled=none ent=silver';
      elsif i = 6 then
        update public.vendor_subscriptions
           set scheduled_plan_id = 'silver', scheduled_billing_cycle = 'monthly', scheduled_from = now() - interval '1 minute'
         where vendor_id = vendor;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := public.vendor_cap_plan(vendor); want := 'silver';
      elsif i = 7 then
        -- Free plan (no subscription) for the other vendor: cap 2.
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        insert into public.products (vendor_id, name, status) values (other, 'P0 cap 1', 'under_review'), (other, 'P0 cap 2', 'under_review');
        begin
          insert into public.products (vendor_id, name, status) values (other, 'P0 cap 3', 'under_review');
          got := 'third listing accepted';
        exception when sqlstate 'P0001' then got := 'refused at 2';
        end;
        want := 'refused at 2';
      elsif i = 8 then
        got := public.vendor_entitlements(vendor) -> 'features' ->> 'seal_tier'; want := 'gold';
      elsif i = 9 then
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        begin
          perform public.vendor_entitlements(vendor);
          got := 'returned';
        exception when insufficient_privilege then got := 'refused';
        end;
        want := 'refused';
      elsif i = 10 then
        got := public.feature_on('subscription_checkout')::text; want := 'false';
      elsif i = 11 then
        reset role;
        update public.feature_flags set allow_profile_ids = array[vendor] where key = 'subscription_checkout';
        set local role authenticated;
        select string_agg(key || '=' || enabled, ',') into got from public.my_feature_flags() where key = 'subscription_checkout';
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        got := got || ' other=' || public.feature_on('subscription_checkout');
        want := 'subscription_checkout=true other=false';
      elsif i = 12 then
        begin
          perform public.admin_feature_flag_set('subscription_checkout', true, '{}', 'manager try');
          got := 'changed';
        exception when insufficient_privilege then got := 'refused';
        end;
        want := 'refused';
      elsif i = 13 then
        begin
          perform public.admin_feature_flag_set('subscription_checkout', true, '{}', '  ');
          got := 'changed';
        exception when sqlstate '22023' then got := 'needs a reason';
        end;
        want := 'needs a reason';
      elsif i = 14 then
        perform public.admin_feature_flag_set('subscription_checkout', false, array[vendor], 'P0 harness: test account');
        reset role;
        select count(*) into n from admin.audit_log
         where target_table = 'public.feature_flags' and reason = 'P0 harness: test account' and actor_id = sadmin;
        got := n || ' log row'; want := '1 log row';
      elsif i = 15 then
        begin
          perform public.subscription_checkout_gate(vendor);
          got := 'ran';
        exception when insufficient_privilege then got := 'refused';
        end;
        want := 'refused';
      elsif i = 16 then
        got := public.subscription_checkout_gate(buyer) ->> 'reason'; want := 'not_vendor';
      elsif i = 17 then
        reset role;
        update public.profiles set account_status = 'suspended' where id = other;
        set local role service_role;
        got := public.subscription_checkout_gate(other) ->> 'reason'; want := 'suspended';
        reset role;
        update public.profiles set account_status = 'active' where id = other;
      elsif i = 18 then
        got := public.subscription_checkout_gate(other) ->> 'reason'; want := 'payments_not_open';
      elsif i = 19 then
        reset role;
        update public.feature_flags set allow_profile_ids = array[vendor] where key = 'subscription_checkout';
        set local role service_role;
        got := public.subscription_checkout_gate(vendor)::text; want := '{"ok": true}';
      elsif i = 20 then
        select string_agg(order_id, ',' order by order_id) into got from public.subscription_payment_orders
         where order_id like 'order_p0_harness_%';
        want := 'order_p0_harness_1';
      elsif i = 21 then
        select count(*) into n from public.subscription_payment_orders where order_id like 'order_p0_harness_%';
        got := n::text; want := '2';
      elsif i = 22 then
        select count(*) into n from public.subscription_payment_orders where order_id like 'order_p0_harness_%';
        got := n::text; want := '0';
      elsif i = 23 then
        j := public.subscription_change_preview('vip', 'monthly');
        got := coalesce(j ->> 'kind', j ->> 'reason'); want := 'upgrade';
      elsif i = 24 then
        got := public.gstin_is_valid('27AAPFU0939F1ZV') || ',' || public.gstin_is_valid('27AAPFU0939F1ZX')
               || ',' || public.gstin_is_valid('27aapfu0939f1zv') || ',' || public.gstin_is_valid(null);
        want := 'true,false,false,false';
      elsif i in (25, 26, 27, 28) then
        begin
          j := public.admin_billing_entity_save(jsonb_build_object(
                 'legal_name', 'Cosora Test Pvt Ltd', 'address_line1', '1 Test Road', 'city', 'Mumbai',
                 'state_code', case when i = 27 then 'GJ' else 'MH' end, 'postal_code', '400001',
                 'gstin', case when i = 26 then '27AAPFU0939F1ZX' else '27AAPFU0939F1ZV' end,
                 'pan', 'AAPFU0939F', 'sac_code', '998599'),
               'P0 harness: billing details');
          got := 'saved ' || (j ->> 'gstin');
        exception
          when insufficient_privilege then got := 'refused';
          when check_violation then got := 'invalid';
        end;
        want := case i when 25 then 'saved 27AAPFU0939F1ZV' when 28 then 'refused' else 'invalid' end;
      elsif i = 29 then
        perform public.admin_billing_entity_save(jsonb_build_object(
                 'legal_name', 'Cosora Test Pvt Ltd', 'address_line1', '2 Test Road', 'city', 'Mumbai',
                 'state_code', 'MH', 'postal_code', '400001', 'gstin', '27AAPFU0939F1ZV', 'pan', 'AAPFU0939F'),
               'P0 harness: address moved');
        reset role;
        select count(*) into n from admin.audit_log where target_table = 'admin.billing_entity' and reason = 'P0 harness: address moved';
        got := n || ' log row'; want := '1 log row';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P0 (rolled back)%', E'\n' || out;
end
$p0$;
