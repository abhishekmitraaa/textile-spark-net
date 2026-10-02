-- Plan changes, the 7-day money-back guarantee and the registration documents
-- (2026-10-02; migrations 20261002105236 and 20261002105804).
--
-- One DO block, run as postgres. It changes rows only inside its own transaction and
-- ends with RAISE EXCEPTION, so nothing is kept; the result is the exception text.
-- Run it on the local stack (scripts/local-stack/README.md), or paste both migrations
-- above it in one call to rehearse.
--
-- Fixtures, all rolled back: demo-vendor (2222…) is the seller; demo-admin (3333…) is
-- super_admin; demo-buyer (1111…) is made a support admin; plans are the live ones
-- (Basic 699/6,990, Silver 1,499/14,990, Gold 2,299/22,990, VIP invite-only).

do $t$
declare
  vendor  constant uuid := '22222222-2222-2222-2222-222222222222';
  admin_u constant uuid := '33333333-3333-3333-3333-333333333333';
  buyer   constant uuid := '11111111-1111-1111-1111-111111111111';
  results text[] := '{}';
  fails   int := 0;
  q       jsonb;
  j       jsonb;
  v_n     int;
  v_txt   text;
  v_end   timestamptz;
  v_req   uuid;
  r       record;
begin
  -- A clean slate for the seller, inside this transaction.
  delete from public.subscription_invoices where vendor_id = vendor;
  delete from public.subscription_payment_orders where vendor_id = vendor;
  delete from public.refund_guarantee_requests where vendor_id = vendor;
  delete from public.vendor_subscriptions where vendor_id = vendor;
  insert into admin.admin_users (id, admin_role, is_active) values (buyer, 'support', true)
    on conflict (id) do update set admin_role = 'support', is_active = true;

  -- ── P1 a first purchase ──────────────────────────────────────────────────
  q := admin.subscription_quote(vendor, 'basic', 'monthly');
  if q ->> 'kind' = 'new' and (q ->> 'charge_rupees')::int = 699 and (q ->> 'credit_rupees')::int = 0
     and (q ->> 'starts_now')::boolean then results := results || 'P1 ok new Basic: 699'::text;
  else fails := fails + 1; results := results || ('P1 FAIL ' || q::text); end if;

  -- ── P2 the refusals ──────────────────────────────────────────────────────
  if admin.subscription_quote(vendor, 'vip', 'monthly') ->> 'reason' = 'invite_only'
     and admin.subscription_quote(vendor, 'free', 'monthly') ->> 'reason' = 'bad_plan'
     and admin.subscription_quote(vendor, 'nope', 'monthly') ->> 'reason' = 'unknown_plan'
     and admin.subscription_quote(vendor, 'gold', 'weekly') ->> 'reason' = 'bad_cycle' then
    results := results || 'P2 ok VIP, Free, unknown plan and cycle refused'::text;
  else fails := fails + 1; results := results || 'P2 FAIL refusals'::text; end if;

  -- ── P3 upgrade: the unused part of what's paid comes off ──────────────────
  -- Basic monthly, 10 of 30 days used, paid 699.
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'basic', 'monthly', 'active', now() - interval '10 days', now() + interval '20 days');
  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, billing_period_start, billing_period_end, razorpay_payment_id)
  values (vendor, 'basic', 699, 'INR', 126, 'paid', now() - interval '10 days', now() + interval '20 days', 'pay_test_1');
  q := admin.subscription_quote(vendor, 'gold', 'monthly');
  if q ->> 'kind' = 'upgrade' and (q ->> 'credit_rupees')::int = 466 and (q ->> 'charge_rupees')::int = 2299 - 466
     and (q ->> 'starts_now')::boolean then results := results || 'P3 ok Basic → Gold after 10 of 30 days: 2,299 − 466 = 1,833'::text;
  else fails := fails + 1; results := results || ('P3 FAIL ' || q::text); end if;

  -- ── P4 renewal and downgrade quotes start at the current end ─────────────
  q := admin.subscription_quote(vendor, 'basic', 'monthly');
  j := admin.subscription_quote(vendor, 'basic', 'yearly');
  if q ->> 'kind' = 'renewal' and (q ->> 'charge_rupees')::int = 699
     and (q ->> 'period_start')::timestamptz = (select current_period_end from public.vendor_subscriptions where vendor_id = vendor)
     and j ->> 'kind' = 'upgrade' then results := results || 'P4 ok same plan renews from the end; monthly → yearly is an upgrade'::text;
  else fails := fails + 1; results := results || ('P4 FAIL ' || q::text || ' / ' || j::text); end if;

  -- ── P5 activation: the upgrade, as the payment function runs it ───────────
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  j := public.subscription_activate(vendor, 'gold', 'monthly');
  execute 'reset role';
  select s.plan_id, s.current_period_end into r from public.vendor_subscriptions s where s.vendor_id = vendor;
  if j ->> 'kind' = 'upgrade' and r.plan_id = 'gold' and r.current_period_end > now() + interval '27 days'
     and (select superseded_at is not null from public.subscription_invoices where razorpay_payment_id = 'pay_test_1')
     and (select plan_id from public.vendor_profiles where id = vendor) = 'gold' then
    results := results || 'P5 ok activated: Gold from now, the Basic invoice marked credited'::text;
  else fails := fails + 1; results := results || ('P5 FAIL ' || j::text); end if;
  -- The Gold invoice the function would write.
  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, billing_period_start, billing_period_end, razorpay_payment_id, change_kind, credit_rupees)
  values (vendor, 'gold', 1833, 'INR', 330, 'paid', now(), (j ->> 'period_end')::timestamptz, 'pay_test_2', 'upgrade', 466);

  -- A credited invoice is never credited again: Gold monthly → yearly credits only the Gold invoice.
  q := admin.subscription_quote(vendor, 'gold', 'yearly');
  if q ->> 'kind' = 'upgrade' and (q ->> 'credit_rupees')::int between 1830 and 1833 then
    results := results || ('P5b ok the credited Basic invoice isn''t counted again (credit ' || (q ->> 'credit_rupees') || ')');
  else fails := fails + 1; results := results || ('P5b FAIL ' || q::text); end if;

  -- ── P6 a downgrade is paid now and starts at the end ─────────────────────
  select current_period_end into v_end from public.vendor_subscriptions where vendor_id = vendor;
  q := admin.subscription_quote(vendor, 'silver', 'monthly');
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  j := public.subscription_activate(vendor, 'silver', 'monthly');
  execute 'reset role';
  select * into r from public.vendor_subscriptions where vendor_id = vendor;
  if q ->> 'kind' = 'downgrade' and (q ->> 'charge_rupees')::int = 1499 and not (q ->> 'starts_now')::boolean
     and r.plan_id = 'gold' and r.scheduled_plan_id = 'silver' and r.scheduled_from = v_end
     and r.current_period_end = v_end + interval '1 month' then
    results := results || 'P6 ok Gold → Silver: 1,499 now, Silver from the end of Gold, no gap'::text;
  else fails := fails + 1; results := results || ('P6 FAIL ' || q::text || ' ' || to_jsonb(r)::text); end if;
  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, billing_period_start, billing_period_end, razorpay_payment_id, change_kind)
  values (vendor, 'silver', 1499, 'INR', 270, 'paid', v_end, v_end + interval '1 month', 'pay_test_3', 'downgrade');

  -- What the seller sees.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  j := public.get_vendor_plan(vendor);
  execute 'reset role';
  if j ->> 'effective_plan_id' = 'gold' and j ->> 'scheduled_plan_id' = 'silver' and j ->> 'scheduled_plan_name' = 'Silver'
     and (j ->> 'scheduled_from')::timestamptz = v_end then
    results := results || 'P6b ok get_vendor_plan: on Gold, Silver scheduled'::text;
  else fails := fails + 1; results := results || ('P6b FAIL ' || j::text); end if;

  -- ── P7 one paid next period at a time ────────────────────────────────────
  if admin.subscription_quote(vendor, 'gold', 'monthly') ->> 'reason' = 'already_scheduled'
     and admin.subscription_quote(vendor, 'basic', 'monthly') ->> 'reason' = 'already_scheduled' then
    results := results || 'P7 ok a renewal or second downgrade waits for the scheduled one'::text;
  else fails := fails + 1; results := results || 'P7 FAIL'::text; end if;

  -- ── P8 an upgrade replaces the scheduled downgrade and credits it in full ─
  q := admin.subscription_quote(vendor, 'gold', 'yearly');
  if q ->> 'kind' = 'upgrade' and (q ->> 'credit_rupees')::int >= 1499 + 1830 then
    results := results || ('P8 ok the prepaid Silver month is credited too (credit ' || (q ->> 'credit_rupees') || ')');
  else fails := fails + 1; results := results || ('P8 FAIL ' || q::text); end if;

  -- ── P9 the sweep switches the plan on its day ────────────────────────────
  update public.vendor_subscriptions set scheduled_from = now() - interval '1 minute' where vendor_id = vendor;
  perform public.expire_subscriptions();
  select * into r from public.vendor_subscriptions where vendor_id = vendor;
  if r.plan_id = 'silver' and r.scheduled_plan_id is null and r.status = 'active'
     and (select plan_id from public.vendor_profiles where id = vendor) = 'silver'
     and exists (select 1 from public.notifications where profile_id = vendor and kind = 'subscription_changed') then
    results := results || 'P9 ok expire_subscriptions: Silver now, still active, the seller told'::text;
  else fails := fails + 1; results := results || ('P9 FAIL ' || to_jsonb(r)::text); end if;

  -- ── P10 yearly → monthly is never an upgrade ─────────────────────────────
  update public.vendor_subscriptions set billing_cycle = 'yearly' where vendor_id = vendor;
  if admin.subscription_quote(vendor, 'gold', 'monthly') ->> 'kind' = 'downgrade'
     and admin.subscription_quote(vendor, 'silver', 'monthly') ->> 'kind' = 'downgrade'
     and admin.subscription_quote(vendor, 'gold', 'yearly') ->> 'kind' = 'upgrade' then
    results := results || 'P10 ok a yearly seller moving to monthly waits for the year to end'::text;
  else fails := fails + 1; results := results || 'P10 FAIL'::text; end if;

  -- ── P11 who may call what ────────────────────────────────────────────────
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  j := public.subscription_change_preview('gold', 'yearly');
  begin
    perform public.subscription_activate(vendor, 'gold', 'yearly');
    fails := fails + 1; results := results || 'P11 FAIL a seller activated a plan'::text;
  exception when insufficient_privilege then
    begin
      perform public.subscription_quote_for(vendor, 'gold', 'yearly');
      fails := fails + 1; results := results || 'P11 FAIL a seller priced through the service function'::text;
    exception when insufficient_privilege then
      if j ->> 'kind' = 'upgrade' then results := results || 'P11 ok preview for the seller; activate and quote_for refused'::text;
      else fails := fails + 1; results := results || ('P11 FAIL preview ' || j::text); end if;
    end;
  end;
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.subscription_change_preview('gold', 'yearly');
    fails := fails + 1; results := results || 'P11b FAIL anon'::text;
  exception when insufficient_privilege then results := results || 'P11b ok anon refused'::text;
  end;
  execute 'reset role';

  -- ── R: the 7-day money-back guarantee ────────────────────────────────────
  delete from public.subscription_invoices where vendor_id = vendor;
  if admin.refund_guarantee_eval(vendor) ->> 'reason' = 'no_payment' then results := results || 'R1 ok no payment, nothing to refund'::text;
  else fails := fails + 1; results := results || 'R1 FAIL'::text; end if;

  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, billing_period_start, billing_period_end, created_at)
  values (vendor, 'gold', 2299, 'INR', 414, 'paid', now() - interval '2 days', now() + interval '28 days', now() - interval '2 days');
  if admin.refund_guarantee_eval(vendor) ->> 'reason' = 'no_money_taken' then
    results := results || 'R2 ok a demo checkout took no money, so none is offered back'::text;
  else fails := fails + 1; results := results || ('R2 FAIL ' || admin.refund_guarantee_eval(vendor)::text); end if;

  update public.subscription_invoices set razorpay_payment_id = 'pay_test_r1' where vendor_id = vendor;
  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, billing_period_start, billing_period_end, created_at, razorpay_payment_id)
  values (vendor, 'gold', 20000, 'INR', 3600, 'paid', now() - interval '1 day', now() + interval '1 year', now() - interval '1 day', 'pay_test_r2');
  j := admin.refund_guarantee_eval(vendor);
  if (j ->> 'eligible')::boolean and (j ->> 'total_rupees')::int = 2713 + 23600 and jsonb_array_length(j -> 'invoices') = 2 then
    results := results || 'R3 ok eligible: both payments in the first 7 days, 26,313 in full'::text;
  else fails := fails + 1; results := results || ('R3 FAIL ' || j::text); end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  j := public.refund_guarantee_request('Not the right fit for my business');
  select count(*) into v_n from public.refund_guarantee_requests where vendor_id = vendor;
  begin
    perform public.refund_guarantee_request(null);
    fails := fails + 1; results := results || 'R4 FAIL a second request was accepted'::text;
  exception when others then
    get stacked diagnostics v_txt = pg_exception_hint;
    if j ->> 'reason' = 'requested' and v_n = 1 and v_txt = 'requested' then
      results := results || 'R4 ok the seller asks once; a second ask is refused'::text;
    else fails := fails + 1; results := results || ('R4 FAIL ' || j::text || ' hint ' || coalesce(v_txt, '')); end if;
  end;
  begin
    perform public.admin_refund_guarantee_requests('open');
    fails := fails + 1; results := results || 'R4b FAIL a seller listed the requests'::text;
  exception when insufficient_privilege then results := results || 'R4b ok sellers can''t list or close requests'::text;
  end;
  execute 'reset role';
  if exists (select 1 from public.notifications where profile_id = vendor and kind = 'refund_requested'
              and body like '%₹26,313%') then results := results || 'R4c ok the seller is told: ₹26,313'::text;
  else fails := fails + 1; results := results || 'R4c FAIL no notification'::text; end if;

  -- Another (non-admin) account can't see it.
  delete from admin.admin_users where id = buyer;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.refund_guarantee_requests;
  execute 'reset role';
  if v_n = 0 then results := results || 'R5 ok another account reads no request'::text;
  else fails := fails + 1; results := results || ('R5 FAIL saw ' || v_n); end if;

  -- Support can't close it; finance must refund each payment first.
  insert into admin.admin_users (id, admin_role, is_active) values (buyer, 'support', true);
  select id into v_req from public.refund_guarantee_requests where vendor_id = vendor;
  update public.vendor_subscriptions set status = 'active', plan_id = 'gold', billing_cycle = 'yearly',
         current_period_end = now() + interval '1 year' where vendor_id = vendor;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_refund_guarantee_close(v_req, 'support tries');
    fails := fails + 1; results := results || 'R6 FAIL support closed a refund request'::text;
  exception when insufficient_privilege then results := results || 'R6 ok support refused'::text;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_refund_guarantee_close(v_req, 'too early');
    fails := fails + 1; results := results || 'R6b FAIL closed before the refunds'::text;
  exception when others then
    get stacked diagnostics v_txt = pg_exception_hint;
    if v_txt = 'refund_first' then results := results || 'R6b ok refused until every payment is refunded'::text;
    else fails := fails + 1; results := results || ('R6b FAIL ' || sqlerrm); end if;
  end;
  j := (select to_jsonb(x) from public.admin_refund_guarantee_requests('open') x limit 1);
  execute 'reset role';
  if (j ->> 'total_rupees')::int = 26313 and jsonb_array_length(j -> 'invoices') = 2 and j ->> 'vendor_name' is not null then
    results := results || 'R6c ok finance sees the request, its two payments and the seller'::text;
  else fails := fails + 1; results := results || ('R6c FAIL ' || coalesce(j::text, 'null')); end if;

  -- admin-refund-payment's outcome on both invoices, then the close.
  update public.subscription_invoices set razorpay_refund_id = 'rfnd_test_' || left(id::text, 8), refund_status = 'processed', status = 'refunded'
   where vendor_id = vendor;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', admin_u, 'role', 'authenticated')::text, true);
  perform public.admin_refund_guarantee_close(v_req, 'Refunded under the guarantee');
  execute 'reset role';
  select * into r from public.vendor_subscriptions where vendor_id = vendor;
  if r.status = 'canceled' and r.current_period_end <= now()
     and (select status from public.refund_guarantee_requests where id = v_req) = 'closed'
     and exists (select 1 from public.notifications where profile_id = vendor and kind = 'refund_processed')
     and admin.refund_guarantee_eval(vendor) ->> 'reason' = 'closed' then
    results := results || 'R7 ok closed: the plan ended, the seller told, no second guarantee'::text;
  else fails := fails + 1; results := results || ('R7 FAIL ' || to_jsonb(r)::text); end if;

  -- The window.
  delete from public.refund_guarantee_requests where vendor_id = vendor;
  delete from public.subscription_invoices where vendor_id = vendor;
  insert into public.subscription_invoices (vendor_id, plan_id, amount, currency, gst_amount, status, created_at, razorpay_payment_id)
  values (vendor, 'basic', 699, 'INR', 126, 'paid', now() - interval '8 days', 'pay_test_old');
  if admin.refund_guarantee_eval(vendor) ->> 'reason' = 'window_closed' then
    results := results || 'R8 ok 8 days after the first payment the window is closed'::text;
  else fails := fails + 1; results := results || 'R8 FAIL'::text; end if;

  -- ── D: registration documents ────────────────────────────────────────────
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  insert into public.vendor_documents (vendor_id, doc_type, file_url, detail, verified) values
    (vendor, 'business_registration', vendor || '/kyc/udyam.pdf', '{"kind": "udyam", "number": "UDYAM-GJ-01-0000001"}', true),
    (vendor, 'aadhaar', vendor || '/kyc/aadhaar.pdf', jsonb_build_object('masked', true, 'consent_at', now()), false),
    (vendor, 'catalog', vendor || '/kyc/catalogue.xlsx', '{"name": "catalogue.xlsx", "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}', false);
  select count(*) into v_n from public.vendor_documents
   where vendor_id = vendor and doc_type in ('business_registration', 'aadhaar', 'catalog') and not verified;
  if v_n = 3 then results := results || 'D1 ok a seller files a business registration, masked Aadhaar and catalogue, all unreviewed'::text;
  else fails := fails + 1; results := results || ('D1 FAIL ' || v_n); end if;
  begin
    insert into public.vendor_documents (vendor_id, doc_type, file_url, detail) values (vendor, 'aadhaar', vendor || '/kyc/a.pdf', '{}');
    fails := fails + 1; results := results || 'D2 FAIL an Aadhaar without the masked consent'::text;
  exception when check_violation then
    begin
      insert into public.vendor_documents (vendor_id, doc_type, file_url, detail) values (vendor, 'business_registration', null, '{"kind": "udyam"}');
      fails := fails + 1; results := results || 'D2 FAIL a business registration without a file'::text;
    exception when check_violation then
      begin
        insert into public.vendor_documents (vendor_id, doc_type, file_url, detail) values (vendor, 'business_registration', vendor || '/kyc/b.pdf', '{"kind": "trust_me"}');
        fails := fails + 1; results := results || 'D2 FAIL an unknown registration kind'::text;
      exception when check_violation then
        results := results || 'D2 ok refused: Aadhaar not marked masked, a registration without a file or with an unknown kind'::text;
      end;
    end;
  end;
  execute 'reset role';

  raise exception 'PLAN CHANGES CHECK: % failed of %. %', fails, array_length(results, 1), array_to_string(results, ' | ');
end
$t$;
