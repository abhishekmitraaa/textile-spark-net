-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P12: admin tooling and KPIs (2026-10-09).
-- Migration 20261009160000_subscriptions_p12_admin_tooling.sql (on top of P0-P11).
--   who        super/finance set prices and give plans; support only reads; a vendor nothing
--   prices     now (history, previous, Admin Log); scheduled, replaced, cancelled; the morning
--              run applies what is due and only that; its failure doesn't stop the run;
--              the checks; an order made before a change keeps its price
--   grants     a complimentary plan (period, cache, grace, notice, log, paused listings back);
--              refused over a paid period, autopay, a suspended account, bad dates; extended
--   lists      every worklist view, search, plan filter, pages without gaps or repeats
--   KPIs       the changes a known set of subscriptions makes to every figure
-- HOW TO RUN (local stack with P0-P12 applied, or: begin; <P12>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p12$
declare
  super uuid; fin uuid; sup uuid;
  e uuid; g uuid; d uuid; l uuid; m uuid; f uuid; x uuid; y uuid;
  fx uuid[];
  labels text[] := array[
    'who may',                                                               -- 1
    'a price now: plan, history with the previous price, the Admin Log',     -- 2
    'a scheduled price waits, is replaced, is cancelled',                    -- 3
    'the morning run applies what is due, in order, and only that',          -- 4
    'a failing price step doesn''t stop the morning run (mutation)',         -- 5
    'the price checks',                                                      -- 6
    'an order made before a change keeps its price',                         -- 7
    'a complimentary plan: period, cache, grace, notice, log',               -- 8
    'complimentary plans refused where they would clash; extended',          -- 9
    'a complimentary plan brings paused listings back',                      -- 10
    'every worklist view picks the right subscriptions',                     -- 11
    'search, plan filter and pages without gaps or repeats',                 -- 12
    'the KPIs move by what the fixtures add'];                               -- 13
  got text; want text; s1 text; i int; j jsonb; k0 jsonb; k1 jsonb; n int; t text;
  pm int; py int; v_from timestamptz; ids uuid[]; page1 uuid[]; page2 uuid[]; page3 uuid[];
  last_at timestamptz; last_id uuid;
  out text := '';
begin
  select a.id into super from admin.admin_users a where a.admin_role = 'super_admin' and a.is_active order by a.id limit 1;
  select a.id into sup from admin.admin_users a where a.admin_role = 'support' and a.is_active order by a.id limit 1;
  select p.id into fin from public.profiles p
   where not exists (select 1 from admin.admin_users a where a.id = p.id)
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.id limit 1;
  select array_agg(z.id order by z.id) into fx
    from (select v.id from public.vendor_profiles v join public.profiles p on p.id = v.id
           where not exists (select 1 from admin.admin_users a where a.id = v.id)
           order by v.id desc limit 8) z;
  if super is null or sup is null or fin is null or cardinality(fx) < 8 then
    raise exception 'the harness needs a super_admin, a support admin, a spare profile and eight local vendors';
  end if;
  e := fx[1]; g := fx[2]; d := fx[3]; l := fx[4]; m := fx[5]; f := fx[6]; x := fx[7]; y := fx[8];
  insert into admin.admin_users (id, admin_role, is_active) values (fin, 'finance_admin', true)
    on conflict (id) do update set admin_role = 'finance_admin', is_active = true;

  -- Neutral first, so the KPIs before and after differ only by the fixtures.
  update public.profiles set account_status = 'active' where id = any (fx);
  update public.feature_flags set enabled = false, allow_profile_ids = fx where key = 'subscription_lifecycle';
  update admin.billing_settings set grace_days = 7;
  delete from public.subscription_mandates where vendor_id = any (fx);
  delete from public.subscription_payment_orders where vendor_id = any (fx);
  delete from public.subscription_grants where vendor_id = any (fx);
  delete from public.vendor_subscriptions where vendor_id = any (fx);
  delete from public.notifications where profile_id = any (fx);
  update public.products set status = 'draft' where vendor_id = any (fx) and status <> 'draft';
  update public.vendor_profiles set plan_id = null, plan_expires_at = null where id = any (fx);
  update public.vendor_profiles set brand_name = 'P12 ' || chr(64 + array_position(fx, id)) || ' Mills' where id = any (fx);
  delete from public.subscription_plan_prices where status = 'scheduled';

  perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
  set local role authenticated;
  k0 := public.admin_subscription_kpis();
  reset role;

  -- E expiring in 3 days, live invoice, no autopay. G in grace (ended 2 days ago), yearly, test
  -- invoice. D running with a scheduled downgrade and a live mandate at a price of its own.
  -- L lapsed 5 days ago. M yearly, mandate halted, live invoice. F a failed payment. X a
  -- complimentary Gold plan (given below). Y nothing.
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew,
                                           scheduled_plan_id, scheduled_billing_cycle, scheduled_from, updated_at)
  values (e, 'gold', 'monthly', 'active', now() - interval '27 days', now() + interval '3 days', false, null, null, null, now()),
         (g, 'silver', 'yearly', 'active', now() - interval '367 days', now() - interval '2 days', false, null, null, null, now()),
         (d, 'gold', 'monthly', 'active', now() - interval '10 days', now() + interval '20 days', true, 'basic', 'monthly', now() + interval '20 days', now()),
         (l, 'basic', 'monthly', 'expired', now() - interval '45 days', now() - interval '15 days', false, null, null, null, now() - interval '5 days'),
         (m, 'vip', 'yearly', 'active', now() - interval '325 days', now() + interval '40 days', false, null, null, null, now());
  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, invoice_number,
                                            billing_period_start, billing_period_end, payment_mode, document_type, total_paise, created_at)
  values (e, 'gold', 2299, 'INR', 414, 'paid', 'P12-E', now() - interval '27 days', now() + interval '3 days', 'live', 'receipt', 271300, now() - interval '27 days'),
         (g, 'silver', 9999, 'INR', 1800, 'paid', 'P12-G', now() - interval '367 days', now() - interval '2 days', 'test', 'test', 1179900, now() - interval '367 days'),
         (m, 'vip', 49999, 'INR', 9000, 'paid', 'P12-M', now() - interval '325 days', now() + interval '40 days', 'live', 'receipt', 5899900, now() - interval '325 days');
  insert into public.subscription_mandates (vendor_id, razorpay_subscription_id, plan_id, billing_cycle, payment_mode, list_rupees, amount_paise, status, start_at)
  values (d, 'sub_p12_d', 'gold', 'monthly', 'live', 2000, 236000, 'active', now() - interval '10 days'),
         (m, 'sub_p12_m', 'vip', 'yearly', 'live', 49999, 5899900, 'halted', now() - interval '325 days');
  insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, list_rupees, payment_mode, created_at)
  values ('p12_failed_f', f, 'gold', 'monthly', 271300, 'failed', 2299, 'live', now() - interval '2 days');
  perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_subscription_grant(x, 'gold', ((now() at time zone 'Asia/Kolkata')::date + 60), 'P12 harness promotion');
  reset role;

  for i in 1..array_length(labels, 1) loop
    begin
      got := ''; want := '';
      perform set_config('request.jwt.claims', '', true);
      select monthly_price, yearly_price into pm, py from public.subscription_plans where id = 'silver';

      if i = 1 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'super:' || (public.admin_plan_price_set('silver', pm + 1, py, null, 'P12 harness') ->> 'status');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', fin, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' finance:' || (public.admin_plan_price_set('silver', pm + 2, py, null, 'P12 harness') ->> 'status');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := got || ' support reads:' || ((public.admin_subscription_kpis() ->> 'running') is not null)::text
               || '/' || (select count(*) >= 0 from public.admin_subscription_worklist('all'))::text;
        begin perform public.admin_plan_price_set('silver', pm + 3, py, null, 'x x x'); got := got || ' support priced';
        exception when insufficient_privilege then got := got || ' price refused'; end;
        begin perform public.admin_subscription_grant(y, 'gold', (now() at time zone 'Asia/Kolkata')::date + 10, 'x x x'); got := got || ' support granted';
        exception when insufficient_privilege then got := got || ' grant refused'; end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin perform public.admin_subscription_kpis(); got := got || ' vendor read';
        exception when insufficient_privilege then got := got || ' vendor refused'; end;
        begin perform public.admin_subscription_worklist('all'); got := got || ' list';
        exception when insufficient_privilege then got := got || '/refused'; end;
        got := got || ' table=' || (select count(*) from public.subscription_plan_prices) || '/' || (select count(*) from public.subscription_grants);
        reset role;
        got := got || ' anon=' || has_function_privilege('anon', 'public.admin_subscription_worklist(text,integer,text,text,timestamptz,uuid,integer)', 'execute')::text;
        want := 'super:applied finance:applied support reads:true/true price refused grant refused vendor refused/refused table=0/0 anon=false';

      elsif i = 2 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_plan_price_set('silver', pm + 100, py + 1000, (now() at time zone 'Asia/Kolkata')::date, 'P12 harness raise');
        reset role;
        got := (j ->> 'status') || ' plan=' || (select (monthly_price - pm) || '/' || (yearly_price - py) from public.subscription_plans where id = 'silver')
            || ' history=' || (select pp.status || ':' || (pp.previous_monthly = pm) || ':' || (pp.previous_yearly = py) || ':' || (pp.created_by = super)
                                 from public.subscription_plan_prices pp where pp.id = (j ->> 'id')::uuid)
            || ' log=' || (select count(*) from admin.audit_log a where a.target_table = 'public.subscription_plans' and a.target_id = 'silver'
                             and a.reason = 'P12 harness raise' and a.actor_id = super);
        want := 'applied plan=100/1000 history=applied:true:true:true log=1';

      elsif i = 3 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        j := public.admin_plan_price_set('silver', pm + 200, py, (now() at time zone 'Asia/Kolkata')::date + 10, 'P12 first schedule');
        got := (j ->> 'status') || ' plan same=' || (select monthly_price = pm from public.subscription_plans where id = 'silver')::text
            || ' from=' || ((j ->> 'effective_from')::timestamptz = (((now() at time zone 'Asia/Kolkata')::date + 10)::timestamp at time zone 'Asia/Kolkata'))::text;
        k1 := public.admin_plan_price_set('silver', pm + 300, py, (now() at time zone 'Asia/Kolkata')::date + 20, 'P12 second schedule');
        got := got || ' replaced=' || ((k1 ->> 'replaced')::uuid = (j ->> 'id')::uuid)::text
            || ' first=' || (select status from public.subscription_plan_prices where id = (j ->> 'id')::uuid);
        perform public.admin_plan_price_cancel((k1 ->> 'id')::uuid, 'P12 changed our mind');
        got := got || ' cancelled=' || (select status from public.subscription_plan_prices where id = (k1 ->> 'id')::uuid);
        begin perform public.admin_plan_price_cancel((k1 ->> 'id')::uuid, 'P12 again'); got := got || ' twice';
        exception when sqlstate 'P0001' then got := got || ' twice refused'; end;
        reset role;
        want := 'scheduled plan same=true from=true replaced=true first=canceled cancelled=canceled twice refused';

      elsif i = 4 then
        insert into public.subscription_plan_prices (plan_id, monthly_price, yearly_price, effective_from, reason)
        values ('silver', pm + 50, py, now() - interval '2 hours', 'P12 due silver'),
               ('gold', (select monthly_price + 50 from public.subscription_plans where id = 'gold'),
                        (select yearly_price from public.subscription_plans where id = 'gold'), now() - interval '1 hour', 'P12 due gold'),
               ('basic', (select monthly_price + 50 from public.subscription_plans where id = 'basic'),
                         (select yearly_price from public.subscription_plans where id = 'basic'), now() + interval '1 day', 'P12 tomorrow basic');
        select monthly_price into n from public.subscription_plans where id = 'basic';
        perform public.expire_subscriptions();
        got := 'silver=' || (select monthly_price - pm from public.subscription_plans where id = 'silver')
            || ' applied=' || (select string_agg(plan_id, ',' order by applied_at, plan_id) from public.subscription_plan_prices where reason like 'P12 due%' and status = 'applied')
            || ' basic waits=' || (select status from public.subscription_plan_prices where reason = 'P12 tomorrow basic')
            || '/' || (select (monthly_price = n)::text from public.subscription_plans where id = 'basic');
        want := 'silver=50 applied=gold,silver basic waits=scheduled/true';

      elsif i = 5 then
        execute $m$create or replace function admin.apply_due_plan_prices() returns integer language plpgsql set search_path = '' as
                   $b$ begin raise exception 'P12 mutation: prices broken'; end $b$$m$;
        update public.vendor_subscriptions set scheduled_from = now() - interval '1 minute', current_period_start = now() - interval '1 minute'
         where vendor_id = d;
        perform public.expire_subscriptions();
        got := 'run finished, downgrade ' || (select plan_id from public.vendor_subscriptions where vendor_id = d);
        want := 'run finished, downgrade basic';

      elsif i = 6 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        foreach t in array array['free', 'zero', 'yearly', 'far', 'same', 'reason', 'unknown'] loop
          begin
            if t = 'free' then perform public.admin_plan_price_set('free', 10, 100, null, 'P12 check');
            elsif t = 'zero' then perform public.admin_plan_price_set('silver', 0, py, null, 'P12 check');
            elsif t = 'yearly' then perform public.admin_plan_price_set('silver', pm, pm * 12 + 1, null, 'P12 check');
            elsif t = 'far' then perform public.admin_plan_price_set('silver', pm + 1, py, (now() at time zone 'Asia/Kolkata')::date + 366, 'P12 check');
            elsif t = 'same' then perform public.admin_plan_price_set('silver', pm, py, null, 'P12 check');
            elsif t = 'reason' then perform public.admin_plan_price_set('silver', pm + 1, py, null, ' a ');
            else perform public.admin_plan_price_set('nope', pm + 1, py, null, 'P12 check');
            end if;
            got := got || t || ':allowed ';
          exception when others then got := got || t || ':' || sqlstate || ' ';
          end;
        end loop;
        reset role;
        got := btrim(got);
        want := 'free:22023 zero:22023 yearly:22023 far:22023 same:P0001 reason:22023 unknown:22023';

      elsif i = 7 then
        select monthly_price into n from public.subscription_plans where id = 'basic';
        insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, list_rupees, change_kind, payment_mode, created_at)
        values ('p12_demo_y', y, 'basic', 'monthly', n * 118, 'created', n, 'new', 'demo', now());
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_plan_price_set('basic', n + 500, (select yearly_price from public.subscription_plans where id = 'basic'), null, 'P12 rise mid-checkout');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        j := public.subscription_fulfil('p12_demo_y', null, 'demo');
        reset role;
        got := 'ok=' || (j ->> 'ok') || ' invoice base=' || (select (amount = n)::text from public.subscription_invoices where razorpay_order_id = 'p12_demo_y')
            || ' plan now=' || (select (monthly_price = n + 500)::text from public.subscription_plans where id = 'basic');
        want := 'ok=true invoice base=true plan now=true';

      elsif i = 8 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        select current_period_end into v_from from public.vendor_subscriptions where vendor_id = x;
        got := (select s.plan_id || ':' || s.status || ':' || s.billing_cycle || ':' || s.auto_renew::text
                  from public.vendor_subscriptions s where s.vendor_id = x)
            || ' ends=' || (v_from = (((now() at time zone 'Asia/Kolkata')::date + 61)::timestamp at time zone 'Asia/Kolkata'))::text
            || ' cache=' || (select v.plan_id || ':' || (v.plan_expires_at = v_from + interval '7 days')::text from public.vendor_profiles v where v.id = x)
            || ' grant=' || (select count(*) from public.subscription_grants gg where gg.vendor_id = x and gg.ends_at = v_from and gg.granted_by = super)
            || ' notice=' || (select count(*) from public.notifications nn where nn.profile_id = x and nn.title = 'You have a complimentary plan'
                                and nn.body like 'Cosora gave you the Gold plan until %, at no charge.')
            || ' log=' || (select count(*) from admin.audit_log a where a.target_table = 'public.vendor_subscriptions'
                             and a.reason = 'Complimentary plan: P12 harness promotion')
            || ' entitled=' || (public.vendor_entitlements(x) ->> 'plan_id');
        want := 'gold:active:monthly:false ends=true cache=gold:true grant=1 notice=1 log=1 entitled=gold';

      elsif i = 9 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        foreach t in array array['paid', 'autopay', 'halted', 'suspended', 'freeplan', 'today', 'far', 'nobody'] loop
          begin
            if t = 'paid' then perform public.admin_subscription_grant(e, 'vip', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 check');
            elsif t = 'autopay' then perform public.admin_subscription_grant(d, 'vip', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 check');
            elsif t = 'halted' then
              reset role; update public.vendor_subscriptions set status = 'expired' where vendor_id = m; set local role authenticated;
              perform public.admin_subscription_grant(m, 'gold', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 check');
            elsif t = 'suspended' then
              reset role; update public.profiles set account_status = 'suspended' where id = y; set local role authenticated;
              perform public.admin_subscription_grant(y, 'gold', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 check');
            elsif t = 'freeplan' then perform public.admin_subscription_grant(f, 'free', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 check');
            elsif t = 'today' then perform public.admin_subscription_grant(f, 'gold', (now() at time zone 'Asia/Kolkata')::date, 'P12 check');
            elsif t = 'far' then perform public.admin_subscription_grant(f, 'gold', (now() at time zone 'Asia/Kolkata')::date + 731, 'P12 check');
            else perform public.admin_subscription_grant(gen_random_uuid(), 'gold', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 check');
            end if;
            got := got || t || ':allowed ';
          exception when others then got := got || t || ':' || sqlstate || ' ';
          end;
        end loop;
        -- Extending the running complimentary plan is allowed, and so is one for a lapsed vendor.
        j := public.admin_subscription_grant(x, 'gold', (now() at time zone 'Asia/Kolkata')::date + 90, 'P12 extend');
        got := got || 'extend:' || (j ->> 'ok');
        j := public.admin_subscription_grant(l, 'silver', (now() at time zone 'Asia/Kolkata')::date + 14, 'P12 win back');
        got := got || ' lapsed:' || (j ->> 'ok');
        reset role;
        want := 'paid:P0001 autopay:P0001 halted:P0001 suspended:P0001 freeplan:22023 today:22023 far:22023 nobody:P0002 extend:true lapsed:true';

      elsif i = 10 then
        insert into public.products (vendor_id, name, status, paused_at, paused_from)
        select f, 'P12 paused ' || s, 'paused', now() - interval '1 day', 'live' from generate_series(1, 3) s;
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.admin_subscription_grant(f, 'silver', (now() at time zone 'Asia/Kolkata')::date + 30, 'P12 back online');
        reset role;
        got := 'live=' || (select count(*) from public.products where vendor_id = f and name like 'P12 paused %' and status = 'live');
        want := 'live=3';

      elsif i = 11 then
        perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
        set local role authenticated;
        foreach t in array array['expiring', 'grace', 'downgrade', 'lapsed', 'granted', 'autopay_trouble'] loop
          select string_agg(chr(64 + array_position(fx, w.vendor_id)), '' order by array_position(fx, w.vendor_id))
            into s1 from (select w.vendor_id from public.admin_subscription_worklist(t, 30, null, 'P12 ', null, null, 200) w) w;
          got := got || t || '=' || coalesce(s1, '') || ' ';
        end loop;
        select string_agg(coalesce(w.mandate_status, '-') || ':' || w.granted::text || ':' || (w.grace_until is not null)::text || ':' || (w.last_failed_at is not null)::text,
                          ' ' order by w.vendor_id)
          into t from public.admin_subscription_worklist('all', 7, null, 'p12 c mills', null, null, 50) w;
        got := got || 'D=' || t;
        reset role;
        want := 'expiring=AC grace=B downgrade=C lapsed=D granted=G autopay_trouble=EF D=active:false:false:false';

      elsif i = 12 then
        perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'gold=' || (select string_agg(chr(64 + array_position(fx, w.vendor_id)), '' order by array_position(fx, w.vendor_id))
                             from public.admin_subscription_worklist('all', 7, 'gold', 'P12 ', null, null, 50) w);
        select array_agg(w.vendor_id), max(w.sort_at), null into page1, last_at, last_id from public.admin_subscription_worklist('all', 7, null, 'P12 ', null, null, 2) w;
        select w.sort_at, w.vendor_id into last_at, last_id from public.admin_subscription_worklist('all', 7, null, 'P12 ', null, null, 2) w
          order by w.sort_at, w.vendor_id limit 1;
        select array_agg(w.vendor_id) into page2 from public.admin_subscription_worklist('all', 7, null, 'P12 ', last_at, last_id, 2) w;
        select w.sort_at, w.vendor_id into last_at, last_id from public.admin_subscription_worklist('all', 7, null, 'P12 ', last_at, last_id, 2) w
          order by w.sort_at, w.vendor_id limit 1;
        select array_agg(w.vendor_id) into page3 from public.admin_subscription_worklist('all', 7, null, 'P12 ', last_at, last_id, 50) w;
        select array_agg(w.vendor_id) into ids from public.admin_subscription_worklist('all', 7, null, 'P12 ', null, null, 50) w;
        got := got || ' pages=' || cardinality(page1) || '+' || cardinality(page2) || '+' || coalesce(cardinality(page3), 0)
            || ' same=' || ((select array_agg(z order by z) from unnest(page1 || page2 || coalesce(page3, '{}')) z)
                            = (select array_agg(z order by z) from unnest(ids) z))::text
            || ' distinct=' || (select count(distinct z) = count(*) from unnest(page1 || page2 || coalesce(page3, '{}')) z)::text;
        -- Expiring is soonest first; with one per page the second page follows the first.
        select w.sort_at, w.vendor_id into last_at, last_id from public.admin_subscription_worklist('expiring', 30, null, 'P12 ', null, null, 1) w;
        got := got || ' soonest=' || chr(64 + array_position(fx, (select w.vendor_id from public.admin_subscription_worklist('expiring', 30, null, 'P12 ', null, null, 1) w)))
            || chr(64 + array_position(fx, (select w.vendor_id from public.admin_subscription_worklist('expiring', 30, null, 'P12 ', last_at, last_id, 1) w)));
        begin perform public.admin_subscription_worklist('everything'); got := got || ' bad view';
        exception when sqlstate '22023' then got := got || ' bad view refused'; end;
        reset role;
        want := 'gold=ACG pages=2+2+2 same=true distinct=true soonest=AC bad view refused';

      elsif i = 13 then
        perform set_config('request.jwt.claims', json_build_object('sub', super, 'role', 'authenticated')::text, true);
        set local role authenticated;
        k1 := public.admin_subscription_kpis();
        reset role;
        got := 'running+' || ((k1 ->> 'running')::int - (k0 ->> 'running')::int)
            || ' grace+' || ((k1 ->> 'in_grace')::int - (k0 ->> 'in_grace')::int)
            || ' gold+' || (coalesce((k1 #>> '{by_plan,gold}')::int, 0) - coalesce((k0 #>> '{by_plan,gold}')::int, 0))
            || ' silver+' || (coalesce((k1 #>> '{by_plan,silver}')::int, 0) - coalesce((k0 #>> '{by_plan,silver}')::int, 0))
            || ' vip+' || (coalesce((k1 #>> '{by_plan,vip}')::int, 0) - coalesce((k0 #>> '{by_plan,vip}')::int, 0))
            || ' granted+' || ((k1 ->> 'granted')::int - (k0 ->> 'granted')::int)
            || ' exp7+' || ((k1 ->> 'expiring_7d')::int - (k0 ->> 'expiring_7d')::int)
            || '/' || ((k1 ->> 'expiring_7d_manual')::int - (k0 ->> 'expiring_7d_manual')::int)
            || ' exp30+' || ((k1 ->> 'expiring_30d')::int - (k0 ->> 'expiring_30d')::int)
            || ' autopay+' || ((k1 ->> 'autopay_on')::int - (k0 ->> 'autopay_on')::int)
            || ' lapsed+' || ((k1 ->> 'lapsed_30d')::int - (k0 ->> 'lapsed_30d')::int)
            || ' halted+' || ((k1 ->> 'mandates_halted')::int - (k0 ->> 'mandates_halted')::int)
            || ' failed+' || ((k1 ->> 'failed_payments_7d')::int - (k0 ->> 'failed_payments_7d')::int)
            || ' mrr_live ok=' || (abs(((k1 ->> 'mrr_live')::numeric - (k0 ->> 'mrr_live')::numeric)
                 - ((select monthly_price from public.subscription_plans where id = 'gold') + 2000
                    + (select yearly_price from public.subscription_plans where id = 'vip') / 12.0)) <= 1)::text
            || ' mrr_test ok=' || (abs(((k1 ->> 'mrr_test')::numeric - (k0 ->> 'mrr_test')::numeric)
                 - (select yearly_price from public.subscription_plans where id = 'silver') / 12.0) <= 1)::text;
        want := 'running+4 grace+1 gold+3 silver+1 vip+1 granted+1 exp7+1/1 exp30+2 autopay+1 lapsed+1 halted+1 failed+1 mrr_live ok=true mrr_test ok=true';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 200) || E'\n';
    end;
  end loop;
  raise exception 'P12 (rolled back)%', E'\n' || out;
end
$p12$;
