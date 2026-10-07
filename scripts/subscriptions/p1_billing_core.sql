-- ─────────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS HARNESS P1: billing core (2026-10-08).
-- Migration 20261008120000_subscriptions_p1_billing_core.sql (on top of P0).
--   fulfil    one transaction: claim, confirm the code, activate, invoice; service role
--             only; done once; a demo refusal undoes everything; a paid refusal opens an
--             incident and keeps the money's record
--   invoice   taxable value = list - discount; GST = charged - taxable; CGST+SGST or IGST
--             by place of supply; supplier and recipient frozen; numbered per series and FY;
--             receipt + incident when a live payment has no billing details
--   free      a ₹0 order is claimed only when its redemption confirms; a refused activation
--             undoes everything, as in demo mode (no money was taken)
--   bucket    the invoices bucket: a vendor reads only its own folder; finance reads all
--   notes     a processed refund issues a credit note in the invoice's proportions
--   S-3       a browser role can't edit or delete an issued invoice, admins included
--   S-7       demo invoices earn credit only until live payments begin
--   events    a webhook event is recorded once; refund and dispute events are handled
--   reconcile unpaid live/test intents are listed, then skipped once marked
--   incidents finance reads and resolves (with a reason, in the Admin Log); others refused
-- HOW TO RUN (local stack, P0 and P1 applied, or: begin; <P1>; <this>; rollback;). Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p1$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  other   uuid := '02d5183b-f984-4ca9-a7cb-684564e37789';
  finance uuid := 'b71bf451-a5f9-4ab5-8196-f9ff3bb2122e';   -- local-support, promoted below
  moder   uuid := '7b9fad26-da14-48b1-9717-a96f47a5946a';
  code_id uuid := gen_random_uuid();
  fy      text := admin.financial_year(now());
  labels text[] := array[
    'fulfil refused to a browser',                                  -- 1
    'live order, no billing details: receipt, CGST+SGST, incident', -- 2
    'a second fulfil does nothing',                                 -- 3
    'billing details set, vendor in another state: IGST',           -- 4
    'recipient GSTIN decides the place of supply',                  -- 5
    'test mode: a test document in its own series',                 -- 6
    'demo refusal undoes the claim',                                -- 7
    'paid refusal: incident, money kept on record',                 -- 8
    'free order: unconfirmed redemption claims nothing',            -- 9
    'free order: confirmed, invoiced at zero',                      -- 10
    'full refund: credit note',                                     -- 11
    'partial refund: proportional credit note',                     -- 12
    'S-3 finance admin cannot edit an invoice',                     -- 13
    'S-3 nor delete one',                                           -- 14
    'S-7 before live: a demo invoice earns credit',                 -- 15
    'S-7 after live: only live invoices earn credit',               -- 16
    'event recorded once',                                          -- 17
    'refund event completes the refund',                            -- 18
    'dispute events: one incident per payment, each step added',    -- 19
    'reconcile lists unpaid live intents, skips marked ones',       -- 20
    'incidents: finance reads, a moderator is refused',             -- 21
    'incidents: resolving needs a reason and is logged',            -- 22
    'credit notes: the vendor reads its own, another vendor none',  -- 23
    'free refusal undoes the claim and the code''s confirmation',    -- 24
    'invoices bucket: the vendor reads its own folder, no other',   -- 25
    'transitional: a missing mode is filled, refused once live'];   -- 26
  got text; want text; i int; n int; j jsonb; inv uuid;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  update admin.admin_users set admin_role = 'finance_admin' where id = finance;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'gold', 'monthly', 'expired', now() - interval '60 days', now() - interval '30 days')
  on conflict (vendor_id) do update set status = 'expired', current_period_start = now() - interval '60 days',
    current_period_end = now() - interval '30 days';
  update public.vendor_subscriptions set status = 'expired', scheduled_plan_id = null, scheduled_billing_cycle = null,
         scheduled_from = null where vendor_id in (vendor, other);
  update public.vendor_profiles set brand_name = 'P1 Vendor', state = 'Gujarat', state_code = 'GJ', gstin = null where id = vendor;
  insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (other, 'P1 other vendor', true)
    on conflict (id) do update set onboarding_complete = true;
  delete from admin.billing_entity;
  update admin.billing_settings set live_since = null;
  insert into admin.discount_codes (id, code, kind, value, applies_to, per_vendor_limit, active)
  values (code_id, 'P1HARNESS', 'percent', 25, 'vendor_plan', 50, true);

  for i in 1..array_length(labels, 1) loop
    begin
      -- Orders and redemptions each case uses (inside the case, so they roll back with it).
      insert into admin.discount_redemptions (id, code_id, vendor_id, order_kind, order_ref, status, eligible_paise, discount_paise, expires_at)
      values ('aaaaaaaa-0000-0000-0000-000000000001', code_id, vendor, 'subscription', 'order_p1_live', 'reserved', 229900, 57500, now() + interval '30 minutes'),
             ('aaaaaaaa-0000-0000-0000-000000000002', code_id, vendor, 'subscription', 'free_p1', 'reserved', 229900, 229900, now() + interval '30 minutes');
      insert into public.subscription_payment_orders
        (order_id, vendor_id, plan_id, billing_cycle, amount, gst_number, status, list_rupees, discount_rupees, discount_code,
         discount_redemption_id, change_kind, credit_rupees, payment_mode, created_at)
      values
        ('order_p1_live', vendor, 'gold', 'monthly', 203400, null, 'created', 2299, 575, 'P1HARNESS',
         'aaaaaaaa-0000-0000-0000-000000000001', 'new', 0, 'live', now() - interval '20 minutes'),
        ('order_p1_test', vendor, 'gold', 'monthly', 271300, null, 'created', 2299, 0, null, null, 'new', 0, 'test', now()),
        ('demo_p1', vendor, 'basic', 'monthly', 82500, null, 'created', 699, 0, null, null, 'downgrade', 0, 'demo', now()),
        ('free_p1', vendor, 'gold', 'monthly', 0, null, 'created', 2299, 2299, 'P1HARNESS',
         'aaaaaaaa-0000-0000-0000-000000000002', 'new', 0, 'free', now()),
        ('free_p1_bad', vendor, 'gold', 'monthly', 0, null, 'created', 2299, 2299, 'P1HARNESS',
         'aaaaaaaa-0000-0000-0000-00000000dead', 'new', 0, 'free', now());

      if i in (4, 5) then
        insert into admin.billing_entity (legal_name, address_line1, city, state_code, postal_code, gstin, pan, sac_code, invoice_prefix)
        values ('Cosora Test Pvt Ltd', '1 Test Road', 'Mumbai', 'MH', '400001', '27AAPFU0939F1ZV', 'AAPFU0939F', '998599', 'INV');
      end if;
      if i = 5 then
        update public.vendor_profiles set gstin = '27AAACR5055K1Z7' where id = vendor;   -- registered in Maharashtra
      end if;

      -- Service role by default; browser roles where a case says so.
      perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
      set local role service_role;

      if i = 1 then
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          perform public.subscription_fulfil('order_p1_live', 'pay_x', 'verify');
          got := 'ran';
        exception when insufficient_privilege then got := 'refused';
        end;
        want := 'refused';
      elsif i in (2, 3) then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        if i = 3 then j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'webhook'); end if;
        reset role;
        select string_agg(document_type || ' ' || amount || '+' || gst_amount || ' c' || cgst_paise || ' s' || sgst_paise || ' i' || igst_paise
                          || ' t' || total_paise || ' ' || (invoice_number like 'RCT/' || fy || '/%') || ' ' || razorpay_payment_id, ';')
          into got from public.subscription_invoices where razorpay_order_id = 'order_p1_live';
        if i = 2 then
          got := got || ' | inc=' || (select count(*) from admin.billing_incidents where kind = 'invoice_incomplete' and order_ref = 'order_p1_live')
                     || ' red=' || (select status from admin.discount_redemptions where id = 'aaaaaaaa-0000-0000-0000-000000000001')
                     || ' plan=' || (select plan_id || '/' || status from public.vendor_subscriptions where vendor_id = vendor);
          want := 'receipt 1724+310 c15500 s15500 i0 t203400 true pay_p1 | inc=1 red=confirmed plan=gold/active';
        else
          got := got || ' | already=' || (j ->> 'already');
          want := 'receipt 1724+310 c15500 s15500 i0 t203400 true pay_p1 | already=true';
        end if;
      elsif i in (4, 5) then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        reset role;
        select document_type || ' ' || supply_type || ' ' || place_of_supply || ' c' || cgst_paise || ' s' || sgst_paise || ' i' || igst_paise
               || ' ' || (invoice_number like 'INV/' || fy || '/%') || ' ' || (supplier ->> 'gstin') || ' ' || coalesce(sac_code, '-')
          into got from public.subscription_invoices where razorpay_order_id = 'order_p1_live';
        want := case i when 4 then 'tax_invoice inter GJ c0 s0 i31000 true 27AAPFU0939F1ZV 998599'
                       else 'tax_invoice intra MH c15500 s15500 i0 true 27AAPFU0939F1ZV 998599' end;
      elsif i = 6 then
        j := public.subscription_fulfil('order_p1_test', 'pay_test_1', 'verify');
        reset role;
        select document_type || ' ' || (invoice_number like 'TST/' || fy || '/%') || ' ' || amount || '+' || gst_amount
          into got from public.subscription_invoices where razorpay_order_id = 'order_p1_test';
        want := 'test true 2299+414';
      elsif i = 7 then
        reset role;
        update public.vendor_subscriptions set status = 'active', plan_id = 'gold', current_period_start = now(),
               current_period_end = now() + interval '30 days', scheduled_plan_id = 'silver', scheduled_billing_cycle = 'monthly',
               scheduled_from = now() + interval '30 days' where vendor_id = vendor;
        set local role service_role;
        begin
          perform public.subscription_fulfil('demo_p1', null, 'demo');
          got := 'fulfilled';
        exception when sqlstate 'P0001' then got := 'refused';
        end;
        reset role;
        got := got || ' order=' || (select status from public.subscription_payment_orders where order_id = 'demo_p1')
               || ' invoices=' || (select count(*) from public.subscription_invoices where razorpay_order_id = 'demo_p1');
        want := 'refused order=created invoices=0';
      elsif i = 8 then
        reset role;
        update public.vendor_subscriptions set status = 'active', plan_id = 'gold', current_period_start = now(),
               current_period_end = now() + interval '30 days', scheduled_plan_id = 'silver', scheduled_billing_cycle = 'monthly',
               scheduled_from = now() + interval '30 days' where vendor_id = vendor;
        update public.subscription_payment_orders set plan_id = 'basic', change_kind = 'downgrade' where order_id = 'order_p1_live';
        set local role service_role;
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        reset role;
        got := (j ->> 'reason') || ' order=' || (select status from public.subscription_payment_orders where order_id = 'order_p1_live')
               || ' incident=' || (select count(*) from admin.billing_incidents where kind = 'activation_failed' and order_ref = 'order_p1_live');
        want := 'activation_failed order=paid incident=1';
      elsif i = 9 then
        j := public.subscription_fulfil('free_p1_bad', null, 'free');
        reset role;
        got := (j ->> 'reason') || ' order=' || (select status from public.subscription_payment_orders where order_id = 'free_p1_bad');
        want := 'discount_unconfirmed order=created';
      elsif i = 10 then
        j := public.subscription_fulfil('free_p1', null, 'free');
        reset role;
        select amount || '+' || gst_amount || ' d' || discount_amount || ' ' || payment_mode into got
          from public.subscription_invoices where razorpay_order_id = 'free_p1';
        want := '0+0 d2299 free';
      elsif i in (11, 12) then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        inv := (j ->> 'invoice_id')::uuid;
        update public.subscription_invoices
           set refund_status = 'processed', razorpay_refund_id = 'rfnd_p1', refunded_at = now(),
               refunded_amount = case i when 11 then 203400 else 101700 end
         where id = inv;
        reset role;
        select taxable_paise || ' c' || cgst_paise || ' s' || sgst_paise || ' t' || total_paise || ' ' || (credit_note_number like 'RCN/' || fy || '/%')
          into got from public.subscription_credit_notes where invoice_id = inv;
        want := case i when 11 then '172400 c15500 s15500 t203400 true' else '86200 c7750 s7750 t101700 true' end;
      elsif i in (13, 14) then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        inv := (j ->> 'invoice_id')::uuid;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', finance, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          if i = 13 then
            update public.subscription_invoices set amount = 1 where id = inv;
          else
            delete from public.subscription_invoices where id = inv;
          end if;
          got := 'changed';
        exception when insufficient_privilege then got := 'refused';
        end;
        want := 'refused';
      elsif i in (15, 16) then
        reset role;
        update public.vendor_subscriptions set status = 'active', plan_id = 'basic', billing_cycle = 'monthly',
               current_period_start = now() - interval '10 days', current_period_end = now() + interval '20 days'
         where vendor_id = vendor;
        insert into public.subscription_invoices (vendor_id, plan_id, amount, gst_amount, status, billing_period_start, billing_period_end,
                                                  payment_mode, document_type, invoice_number)
        values (vendor, 'basic', 699, 126, 'paid', now() - interval '10 days', now() + interval '20 days', 'demo', 'demo', 'DMO/P1/HARNESS');
        if i = 16 then
          update admin.billing_settings set live_since = now();
        end if;
        got := (admin.subscription_quote(vendor, 'gold', 'monthly', now()) ->> 'credit_rupees');
        want := case i when 15 then 'credit>0' else '0' end;
        if i = 15 and got::int > 0 then got := 'credit>0'; end if;
      elsif i = 17 then
        j := public.payment_event_record('evt_p1', 'payment.captured', 'subscription-webhook', 'order_p1_live', 'pay_p1', null, 'abc');
        got := (j ->> 'duplicate');
        j := public.payment_event_record('evt_p1', 'payment.captured', 'subscription-webhook', 'order_p1_live', 'pay_p1', null, 'abc');
        got := got || ',' || (j ->> 'duplicate');
        want := 'false,true';
      elsif i = 18 then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        inv := (j ->> 'invoice_id')::uuid;
        j := public.subscription_refund_event('pay_p1', 'rfnd_p1e', 'processed', 203400);
        reset role;
        got := (j ->> 'matched') || ' ' || (select refund_status || '/' || razorpay_refund_id || '/' || status from public.subscription_invoices where id = inv)
               || ' notes=' || (select count(*) from public.subscription_credit_notes where invoice_id = inv);
        want := 'true processed/rfnd_p1e/refunded notes=1';
      elsif i = 19 then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        perform public.billing_dispute_event('pay_p1', 'payment.dispute.created', '{"amount": 203400}');
        perform public.billing_dispute_event('pay_p1', 'payment.dispute.under_review', '{"amount": 203400}');
        perform public.billing_dispute_event('pay_p1', 'payment.dispute.won', '{"amount": 203400}');
        reset role;
        select string_agg(kind || ' ' || (vendor_id = vendor) || ' ' || (detail ->> 'event') || ' events=' || jsonb_array_length(detail -> 'events'), ';')
          into got from admin.billing_incidents where kind = 'dispute' and payment_ref = 'pay_p1';
        want := 'dispute true payment.dispute.won events=3';
      elsif i = 20 then
        select string_agg(order_id, ',' order by order_id) into got from public.billing_reconcile_candidates(50) where order_id like '%p1%';
        perform public.billing_reconcile_mark('order_p1_live');
        got := got || ' | after=' || coalesce((select string_agg(order_id, ',') from public.billing_reconcile_candidates(50) where order_id like '%p1%'), 'none');
        want := 'order_p1_live | after=none';
      elsif i in (21, 22) then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');   -- opens an invoice_incomplete incident
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', case i when 21 then moder else finance end, 'role', 'authenticated')::text, true);
        set local role authenticated;
        if i = 21 then
          begin
            perform public.admin_billing_incidents(true);
            got := 'moderator read';
          exception when insufficient_privilege then got := 'moderator refused';
          end;
          perform set_config('request.jwt.claims', json_build_object('sub', finance, 'role', 'authenticated')::text, true);
          select count(*) into n from public.admin_billing_incidents(true) where order_ref = 'order_p1_live';
          got := got || ', finance sees ' || n;
          want := 'moderator refused, finance sees 1';
        else
          begin
            perform public.admin_billing_incident_resolve((select id from public.admin_billing_incidents(true) where order_ref = 'order_p1_live' limit 1), ' ');
            got := 'resolved without reason';
          exception when sqlstate '22023' then got := 'needs a reason';
          end;
          perform public.admin_billing_incident_resolve((select id from public.admin_billing_incidents(true) where order_ref = 'order_p1_live' limit 1),
                                                        'P1 harness: tax invoice issued by hand');
          reset role;
          got := got || ', log=' || (select count(*) from admin.audit_log where target_table = 'admin.billing_incidents'
                                       and reason = 'P1 harness: tax invoice issued by hand');
          want := 'needs a reason, log=1';
        end if;
      elsif i = 23 then
        j := public.subscription_fulfil('order_p1_live', 'pay_p1', 'verify');
        update public.subscription_invoices set refund_status = 'processed', razorpay_refund_id = 'rfnd_p1', refunded_amount = 203400
         where id = (j ->> 'invoice_id')::uuid;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into n from public.subscription_credit_notes;
        got := 'vendor ' || n;
        perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
        select count(*) into n from public.subscription_credit_notes;
        got := got || ', other ' || n;
        want := 'vendor 1, other 0';
      elsif i = 24 then
        reset role;
        update public.vendor_subscriptions set status = 'active', plan_id = 'gold', billing_cycle = 'monthly', current_period_start = now(),
               current_period_end = now() + interval '30 days', scheduled_plan_id = 'silver', scheduled_billing_cycle = 'monthly',
               scheduled_from = now() + interval '30 days' where vendor_id = vendor;
        set local role service_role;
        begin
          perform public.subscription_fulfil('free_p1', null, 'free');
          got := 'fulfilled';
        exception when sqlstate 'P0001' then got := 'refused';
        end;
        reset role;
        got := got || ' order=' || (select status from public.subscription_payment_orders where order_id = 'free_p1')
               || ' red=' || (select status from admin.discount_redemptions where id = 'aaaaaaaa-0000-0000-0000-000000000002')
               || ' incidents=' || (select count(*) from admin.billing_incidents where order_ref = 'free_p1');
        want := 'refused order=created red=reserved incidents=0';
      elsif i = 25 then
        reset role;
        insert into storage.objects (bucket_id, name) values ('invoices', vendor || '/P1-HARNESS.v1.pdf'), ('invoices', other || '/P1-OTHER.v1.pdf');
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select string_agg(name, ',') into got from storage.objects where bucket_id = 'invoices' and name like '%P1-%';
        got := 'vendor ' || coalesce(got, 'none');
        perform set_config('request.jwt.claims', json_build_object('sub', moder, 'role', 'authenticated')::text, true);
        select count(*) into n from storage.objects where bucket_id = 'invoices' and name like '%P1-%';
        got := got || ', moderator ' || n;
        perform set_config('request.jwt.claims', json_build_object('sub', finance, 'role', 'authenticated')::text, true);
        select count(*) into n from storage.objects where bucket_id = 'invoices' and name like '%P1-%';
        got := got || ', finance ' || n;
        want := 'vendor ' || vendor || '/P1-HARNESS.v1.pdf, moderator 0, finance 2';
      elsif i = 26 then
        -- What the payment functions deployed before P1 write: no mode, no document type.
        insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status)
        values ('order_p1_old', vendor, 'gold', 'monthly', 271300, 'created'), ('demo_p1_old', vendor, 'gold', 'monthly', 0, 'created');
        insert into public.subscription_invoices (vendor_id, plan_id, amount, gst_amount, status, razorpay_payment_id, razorpay_order_id, invoice_number)
        values (vendor, 'gold', 2299, 414, 'paid', 'pay_p1_old', 'order_p1_old', 'P1-OLD-1'),
               (vendor, 'gold', 2299, 414, 'paid', null, 'demo_p1_old', 'P1-OLD-2');
        reset role;
        select string_agg(payment_mode, ',' order by order_id desc) into got from public.subscription_payment_orders where order_id like '%p1_old';
        got := got || ' | ' || (select string_agg(payment_mode || '/' || document_type, ',' order by invoice_number)
                                  from public.subscription_invoices where invoice_number like 'P1-OLD-%');
        update admin.billing_settings set live_since = now();
        set local role service_role;
        begin
          insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status)
          values ('order_p1_old2', vendor, 'gold', 'monthly', 271300, 'created');
          got := got || ' | live: guessed';
        exception when not_null_violation then got := got || ' | live: refused';
        end;
        want := 'test,demo | test/test,demo/demo | live: refused';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'P1 (rolled back)%', E'\n' || out;
end
$p1$;
