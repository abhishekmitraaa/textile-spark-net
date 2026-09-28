-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 09: the payments ledger (Phase 5, 2026-09-28).
-- Each case runs in its own rolled-back subtransaction. Fixtures (an ad order of
-- each kind, a checkout, a refund) exist only inside the case that makes them.
--
--   who may read       super_admin, finance_admin, support -> rows;
--                      product_moderator, vendor_ops, ads_moderator, manager,
--                      a buyer -> 42501; anon -> 42501 (no EXECUTE)
--   production rows    every invoice once, newest first, none gateway-verified
--   agrees w/ Reports  paid subscription net, GST, ads and unverified totals equal
--                      admin_report_summary()'s, all time and for a date window
--   pagination         limit 4 walks 4 + 4 + 1 rows with the cursor, no repeats
--   search             an invoice number -> 1 row; a literal '%' -> 0 rows
--   cursor check       half a cursor -> 22023
--   fixtures           a certificate-only order, a mixed order, an old unpaid
--                      order, a checkout and a processed refund each show as
--                      their own row with the right kind, status, sign and total;
--                      a refund asked for is stamped by the trigger
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h09$
declare
  sa     uuid := '33333333-3333-3333-3333-333333333333';
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  labels text[] := array[
    'super_admin', 'finance_admin', 'support', 'product_moderator', 'vendor_ops', 'ads_moderator', 'manager',
    'buyer', 'anon', 'production rows', 'agrees with Reports (all time)', 'agrees with Reports (window)',
    'pagination', 'search: invoice number', 'search: literal %', 'half a cursor', 'fixtures: every kind',
    'fixtures: refund stamped and summed', 'fixtures: agrees with Reports'];
  roles text[] := array['super_admin', 'finance_admin', 'support', 'product_moderator', 'vendor_ops', 'ads_moderator', 'manager'];
  i int; n int; n2 int; t text; t2 text; j jsonb; r jsonb; k1 text; ts1 timestamptz;
  page_keys text[]; all_keys text[] := '{}'; next_at timestamptz; next_key text;
  out text := '';
  v_inv uuid;
begin
  for i in 1..array_length(labels, 1) loop
    begin
      -- Fixtures for cases 17-19, made as the table owner before switching role.
      if i >= 17 then
        insert into public.ad_orders (order_id, vendor_id, spec, amount, status, created_at, paid_at) values
          ('order_H09CERT', vendor, '{"placementIds": ["verifiedCertificate"], "days": 365, "items": []}', 19900, 'paid', now() - interval '2 hours', now() - interval '2 hours'),
          ('order_H09MIX', vendor, '{"placementIds": ["openListing", "verifiedCertificate"], "days": 30, "items": [{"productId": "x"}], "campaignLabel": "H09 mix"}', 85900, 'paid', now() - interval '3 hours', now() - interval '3 hours'),
          ('order_H09OLD', vendor, '{"placementIds": ["openListing"], "days": 7, "items": []}', 15400, 'created', now() - interval '30 hours', null);
        insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, created_at)
        values ('order_H09SUB', vendor, 'basic', 'monthly', 82500, 'created', now() - interval '10 minutes');
        select x.id into v_inv from public.subscription_invoices x where x.invoice_number = 'INV-2026-000009';
        update public.subscription_invoices set refund_status = 'pending' where id = v_inv;
        select x.refund_requested_at into ts1 from public.subscription_invoices x where x.id = v_inv;
        update public.subscription_invoices
           set refund_status = 'processed', razorpay_refund_id = 'rfnd_H09', refunded_amount = 82500, refunded_at = now()
         where id = v_inv;
      end if;

      if i between 1 and 7 or i >= 10 then
        insert into admin.admin_users (id, admin_role, is_active)
        values (pr, (case when i between 1 and 7 then roles[i] else 'finance_admin' end)::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      end if;
      if i = 9 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', case when i = 8 then buyer else pr end, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', (case when i = 8 then buyer else pr end)::text, true);
        set local role authenticated;
      end if;

      if i <= 9 then
        select count(*) into n from public.admin_payments_ledger();
        raise exception using errcode = 'P0099', message = format('%s rows', n);
      elsif i = 10 then
        select count(*), count(*) filter (where x.kind = 'subscription' and x.status = 'paid'),
               count(*) filter (where x.verified), bool_and(x.vendor_name is not null)
          into n, n2, k1, t
          from public.admin_payments_ledger(p_limit => 200) x;
        select string_agg(x.reference, ' > ' order by x.occurred_at desc) into t2
          from (select * from public.admin_payments_ledger(p_limit => 3)) x;
        raise exception using errcode = 'P0099', message = format('%s rows, %s paid subscriptions, %s verified, every row named: %s; newest: %s', n, n2, k1, t, t2);
      elsif i in (11, 12) then
        j := case when i = 11 then public.admin_payments_summary()
                  else public.admin_payments_summary(p_from => '2026-07-17', p_to => '2026-09-01') end;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', sa::text, true);
        set local role authenticated;
        r := case when i = 11 then public.admin_report_summary()
                  else public.admin_report_summary('2026-07-17', '2026-09-01') end -> 'totals';
        raise exception using errcode = 'P0099', message = format(
          'net %s/%s, gst %s/%s, ads %s/%s, unverified %s/%s (ledger/reports)',
          j ->> 'subscriptions_net_paise', r ->> 'subscriptions_net_paise', j ->> 'gst_paise', r ->> 'gst_paise',
          j ->> 'ads_paise', r ->> 'ads_paise', j ->> 'unverified_paise', r ->> 'unverified_paise');
      elsif i = 13 then
        t := null; ts1 := null; t2 := null;
        loop
          select count(*), array_agg(x.entry_key),
                 (array_agg(x.occurred_at order by x.occurred_at, x.entry_key))[1],
                 (array_agg(x.entry_key order by x.occurred_at, x.entry_key))[1]
            into n, page_keys, next_at, next_key
            from public.admin_payments_ledger(p_cursor_at => ts1, p_cursor_key => t, p_limit => 4) x;
          exit when n = 0;
          all_keys := all_keys || page_keys;
          t2 := coalesce(t2 || '+', '') || n;
          ts1 := next_at;
          t := next_key;
        end loop;
        select count(*), count(distinct k) into n, n2 from unnest(all_keys) k;
        raise exception using errcode = 'P0099', message = format('pages %s, %s rows, %s distinct', t2, n, n2);
      elsif i = 14 then
        select count(*) into n from public.admin_payments_ledger(p_search => 'INV-2026-000009');
        raise exception using errcode = 'P0099', message = format('%s row', n);
      elsif i = 15 then
        select count(*) into n from public.admin_payments_ledger(p_search => '%');
        raise exception using errcode = 'P0099', message = format('%s rows', n);
      elsif i = 16 then
        perform public.admin_payments_ledger(p_cursor_at => now());
      elsif i = 17 then
        select string_agg(format('%s/%s%s %s', x.kind, x.status, case when x.includes_certificate then '+cert' else '' end, x.total_paise), '; ' order by x.entry_key)
          into t
          from public.admin_payments_ledger(p_limit => 200) x
         where x.entry_key not like 'invoice:%';
        raise exception using errcode = 'P0099', message = t;
      elsif i = 18 then
        j := public.admin_payments_summary(p_kinds => array['refund']);
        select count(*) into n from public.admin_payments_ledger(p_statuses => array['abandoned']);
        raise exception using errcode = 'P0099', message = format('refund asked for stamped: %s; refunds %s, refunded %s paise; abandoned rows %s',
          ts1 is not null, j ->> 'refunds', j ->> 'refunded_paise', n);
      elsif i = 19 then
        j := public.admin_payments_summary();
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', sa::text, true);
        set local role authenticated;
        r := public.admin_report_summary() -> 'totals';
        raise exception using errcode = 'P0099', message = format(
          'ads %s/%s, net %s/%s; paid %s, pending %s, abandoned %s, review %s (ledger/reports, then counts)',
          j ->> 'ads_paise', r ->> 'ads_paise', j ->> 'subscriptions_net_paise', r ->> 'subscriptions_net_paise',
          j ->> 'paid', j ->> 'pending', j ->> 'abandoned', j ->> 'review');
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 100) || E'\n';
    end;
  end loop;
  raise exception 'H09 (rolled back)%', E'\n' || out;
end
$h09$;
