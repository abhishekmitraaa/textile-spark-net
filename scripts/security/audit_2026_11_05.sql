-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY HARNESS: security audit run-1 fixes (2026-11-05), F03 F04 F05 F06 F07.
-- Migration 20261105100000_security_audit_fixes.sql.
--   F04  a seller's new quote is always pending; only the buyer accepts it
--   F03  the listing cap counts every non-draft insert (the status the row will really get)
--   F05  KYC scans in business-docs: owner, super_admin, vendor_ops, support only
--   F06  a PDF a listing uses can't be deleted and uploaded again at the same path
--   F07  a plan order activates only what it was priced for (no reused upgrade credit)
-- Every write is made as the browser or the payment functions make it. Never commits:
-- each case's report rolls it back.
-- ─────────────────────────────────────────────────────────────────────────────
do $sa$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  buyer   uuid := '11111111-1111-1111-1111-111111111111';
  spare   uuid[];
  adsmod  uuid;
  rfq     uuid := 'a5f00000-0000-4000-8000-0000000005a1';
  pid     uuid := 'a5f00000-0000-4000-8000-0000000005a2';
  pdf     text;
  q       jsonb;
  r       jsonb;
  n int; m int; x uuid; s text;
  labels text[] := array[
    'F04 a seller''s quote inserted as accepted is stored pending; the buyer can still accept',  -- 1
    'F03 at the cap, rejected and paused inserts are refused; a draft is not',                   -- 2
    'F05 business-docs: an ads moderator sees no KYC scan; vendor ops and the owner do',         -- 3
    'F06 a listing''s PDF can''t be deleted and uploaded again; a new path can',                 -- 4
    'F07 five free upgrade orders from one credit: the first activates, the rest are refused',   -- 5
    'F07 a second paid upgrade order after the upgrade: an incident, no extra month',            -- 6
    'F07 two full-price orders for a new plan: both activate (prepaid renewal)',                 -- 7
    'F02 a buyer-number reveal is recorded and stays after the quote is deleted',                -- 8
    'F02 a caller''s 31st different buyer in an hour is refused; a buyer already seen is not',   -- 9
    'F02 a buyer''s number goes to at most 20 different callers a day',                          -- 10
    'F02 an account that hasn''t finished seller registration gets no buyer number'];            -- 11
  got text; want text; i int;
  out text := '';
begin
  select array_agg(id) into spare from (
    select p.id from public.profiles p
     where p.id not in (vendor, buyer) and public.account_is_active(p.id)
       and not exists (select 1 from admin.admin_users a where a.id = p.id)
       and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
       and not exists (select 1 from public.vendor_subscriptions s where s.vendor_id = p.id)
     order by p.created_at limit 4) t;
  if coalesce(array_length(spare, 1), 0) < 4 then raise exception 'the harness needs four spare profiles'; end if;
  select a.id into adsmod from admin.admin_users a where a.admin_role = 'ads_moderator' and a.is_active limit 1;
  if adsmod is null then raise exception 'the harness needs an active ads moderator'; end if;
  update public.profiles set account_status = 'active' where id in (vendor, buyer);

  for i in 1..array_length(labels, 1) loop
    begin
      if i = 1 then
        insert into public.rfqs (id, buyer_id, vendor_id, title, status, expires_at)
        values (rfq, buyer, vendor, 'SA direct request', 'active', now() + interval '3 days');
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.quotes (rfq_id, vendor_id, price_per_unit, moq, status)
        values (rfq, vendor, 999, 10, 'accepted') returning status::text into got;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.quotes set status = 'accepted' where rfq_id = rfq and vendor_id = vendor;
        reset role;
        got := got || ', buyer accepts: ' || (select status::text from public.quotes where rfq_id = rfq and vendor_id = vendor);
        want := 'pending, buyer accepts: accepted';

      elsif i = 2 then
        delete from public.subscription_mandates where vendor_id = vendor;
        delete from public.vendor_subscriptions where vendor_id = vendor;
        update public.products set status = 'draft' where vendor_id = vendor and status in ('under_review', 'live');
        set local session_replication_role = replica;
        insert into public.products (vendor_id, name, status) values (vendor, 'SA cap 1', 'under_review'), (vendor, 'SA cap 2', 'under_review');
        set local session_replication_role = origin;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        foreach s in array array['rejected', 'paused', 'draft'] loop
          begin
            insert into public.products (vendor_id, name, status) values (vendor, 'SA ' || s, s::public.product_status);
            got := got || s || ' ok, ';
          exception when sqlstate 'P0001' then got := got || s || ' refused, ';
          end;
        end loop;
        reset role;
        got := got || (select count(*) from public.products where vendor_id = vendor and status in ('under_review', 'live')) || ' listed';
        want := 'rejected refused, paused refused, draft ok, 2 listed';

      elsif i = 3 then
        insert into admin.admin_users (id, admin_role, is_active) values (spare[1], 'vendor_ops', true);
        insert into storage.objects (bucket_id, name, owner_id, metadata)
        values ('business-docs', vendor || '/kyc/sa-pan.jpg', vendor::text, '{"eTag":"sa"}');
        got := '';
        foreach x in array array[adsmod, spare[1], vendor] loop
          perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
          set local role authenticated;
          select count(*) into n from storage.objects where bucket_id = 'business-docs' and name = vendor || '/kyc/sa-pan.jpg';
          reset role;
          got := got || n || ' ';
        end loop;
        got := 'ads moderator, vendor ops, owner: ' || btrim(got);
        want := 'ads moderator, vendor ops, owner: 0 1 1';

      elsif i = 4 then
        set local session_replication_role = replica;
        insert into public.products (id, vendor_id, name, status) values (pid, vendor, 'SA live listing', 'live');
        set local session_replication_role = origin;
        pdf := vendor || '/' || pid || '/a5f00000-0000-4000-8000-0000000005a3.pdf';
        insert into storage.objects (bucket_id, name, owner_id, metadata) values ('product-files', pdf, vendor::text, '{"eTag":"reviewed"}');
        insert into public.product_documents (product_id, path, name, size_bytes, position) values (pid, pdf, 'spec.pdf', 100, 0);
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        perform set_config('storage.allow_delete_query', 'true', true);
        set local role authenticated;
        delete from storage.objects where bucket_id = 'product-files' and name = pdf;
        get diagnostics n = row_count;
        begin
          insert into storage.objects (bucket_id, name, owner_id, metadata) values ('product-files', pdf, vendor::text, '{"eTag":"swapped"}');
          got := 'deleted ' || n || ', same path uploaded again';
        exception when insufficient_privilege then got := 'deleted ' || n || ', same path refused';
        end;
        insert into storage.objects (bucket_id, name, owner_id, metadata)
        values ('product-files', vendor || '/' || pid || '/a5f00000-0000-4000-8000-0000000005a4.pdf', vendor::text, '{"eTag":"new"}');
        reset role;
        got := got || ', new path ok';
        want := 'deleted 1, same path refused, new path ok';

      elsif i in (5, 6, 7) then
        x := spare[i - 3];
        set local session_replication_role = replica;
        insert into public.vendor_profiles (id) values (x);
        set local session_replication_role = origin;
        perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
        set local role service_role;
        if i = 5 then
          -- Basic now, plus two prepaid Basic months: the unused value covers Silver in full.
          insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
          values ('sa5_new', x, 'basic', 'monthly', 82500, 'created', 'test', 699, 0, 'new', 0);
          perform public.subscription_fulfil('sa5_new', 'pay_sa5_new', 'verify');
          for n in 1..2 loop
            insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
            values ('sa5_ren' || n, x, 'basic', 'monthly', 82500, 'created', 'test', 699, 0, 'renewal', 0);
            perform public.subscription_fulfil('sa5_ren' || n, 'pay_sa5_ren' || n, 'verify');
          end loop;
          -- Five Silver orders, all priced before any is paid, as subscription-create-order prices them.
          for n in 1..5 loop
            q := public.subscription_quote_for(x, 'silver', 'monthly');
            insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
            values ('free_sa5_' || n, x, 'silver', 'monthly', 0, 'created', 'free', (q ->> 'charge_rupees')::int, 0, q ->> 'kind', (q ->> 'credit_rupees')::int);
          end loop;
          m := 0;
          for n in 1..5 loop
            begin
              r := public.subscription_fulfil('free_sa5_' || n, null, 'free');
              if coalesce((r ->> 'ok')::boolean, false) then m := m + 1; end if;
            exception when sqlstate 'P0001' then null;
            end;
          end loop;
          got := m || ' activated, Silver ends in ' ||
                 (select (current_period_end::date - current_date) from public.vendor_subscriptions where vendor_id = x) || ' days';
          want := '1 activated, Silver ends in ' || ((current_date + interval '1 month')::date - current_date) || ' days';
        elsif i = 6 then
          insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
          values ('sa6_new', x, 'basic', 'monthly', 82500, 'created', 'test', 699, 0, 'new', 0);
          perform public.subscription_fulfil('sa6_new', 'pay_sa6_new', 'verify');
          for n in 1..2 loop
            q := public.subscription_quote_for(x, 'silver', 'monthly');
            insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
            values ('sa6_up' || n, x, 'silver', 'monthly', ((q ->> 'charge_rupees')::int + round((q ->> 'charge_rupees')::int * 0.18)::int) * 100,
                    'created', 'test', (q ->> 'charge_rupees')::int, 0, q ->> 'kind', (q ->> 'credit_rupees')::int);
          end loop;
          r := public.subscription_fulfil('sa6_up1', 'pay_sa6_up1', 'verify');
          got := 'first ' || coalesce(r ->> 'ok', 'null');
          r := public.subscription_fulfil('sa6_up2', 'pay_sa6_up2', 'verify');
          reset role;
          got := got || ', second ' || coalesce(r ->> 'reason', 'ok') || '/' || coalesce(r ->> 'detail', '-') ||
                 ', incident ' || (select count(*) from admin.billing_incidents where order_ref = 'sa6_up2') ||
                 ', Silver ends in ' || (select (current_period_end::date - current_date) from public.vendor_subscriptions where vendor_id = x) || ' days';
          want := 'first true, second activation_failed/price_changed, incident 1, Silver ends in ' ||
                  ((current_date + interval '1 month')::date - current_date) || ' days';
        else
          for n in 1..2 loop
            q := public.subscription_quote_for(x, 'basic', 'monthly');
            insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, billing_cycle, amount, status, payment_mode, list_rupees, discount_rupees, change_kind, credit_rupees)
            values ('sa7_new' || n, x, 'basic', 'monthly', 82500, 'created', 'test', (q ->> 'charge_rupees')::int, 0, q ->> 'kind', 0);
          end loop;
          got := '';
          for n in 1..2 loop
            r := public.subscription_fulfil('sa7_new' || n, 'pay_sa7_new' || n, 'verify');
            got := got || coalesce(r ->> 'ok', 'null') || ' ';
          end loop;
          got := btrim(got) || ', Basic ends ' || (select current_period_end::date from public.vendor_subscriptions where vendor_id = x);
          want := 'true true, Basic ends ' || (now() + interval '2 months')::date;
        end if;
        reset role;

      elsif i in (8, 9, 10, 11) then
        -- An open, untargeted requirement of the buyer, and a quote on it by the caller (the seller 2222).
        update public.vendor_profiles set onboarding_complete = (i <> 11) where id = vendor;
        -- Nothing else may refuse first: no chat under review and no block between the two.
        update public.conversations set status = 'active'
         where user_a = least(vendor, buyer) and user_b = greatest(vendor, buyer);
        delete from public.chat_blocks where (blocker_id, blocked_id) in ((vendor, buyer), (buyer, vendor));
        insert into public.rfqs (id, buyer_id, title, status, expires_at)
        values (rfq, buyer, 'SA open requirement', 'active', now() + interval '7 days');
        set local session_replication_role = replica;
        insert into public.quotes (rfq_id, vendor_id, price_per_unit) values (rfq, vendor, 100);
        set local session_replication_role = origin;
        if i = 9 then
          insert into admin.buyer_contact_reveals (caller_id, buyer_id, revealed_at)
          select vendor, gen_random_uuid(), now() - interval '10 minutes' from generate_series(1, 30);
        elsif i = 10 then
          insert into admin.buyer_contact_reveals (caller_id, buyer_id, revealed_at)
          select gen_random_uuid(), buyer, now() - interval '2 hours' from generate_series(1, 20);
        end if;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          perform * from public.call_buyer_contact(buyer);
          got := 'revealed';
        exception when insufficient_privilege then got := sqlerrm;
        end;
        if i = 8 then
          delete from public.quotes where rfq_id = rfq and vendor_id = vendor;
          reset role;
          got := got || ', quote deleted, recorded ' ||
                 (select count(*) from admin.buyer_contact_reveals where caller_id = vendor and buyer_id = buyer);
          want := 'revealed, quote deleted, recorded 1';
        elsif i = 9 then
          reset role;
          insert into admin.buyer_contact_reveals (caller_id, buyer_id, revealed_at) values (vendor, buyer, now() - interval '3 hours');
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          set local role authenticated;
          perform * from public.call_buyer_contact(buyer);
          reset role;
          got := got || ', after an earlier reveal today: revealed';
          want := 'rate_limited, after an earlier reveal today: revealed';
        elsif i = 10 then
          reset role;
          want := 'buyer_limited';
        else
          reset role;
          want := 'not_a_vendor';
        end if;
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 200) || E'\n';
    end;
  end loop;
  raise exception 'SECURITY AUDIT FIXES (rolled back)%', E'\n' || out;
end
$sa$;
