-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 14: discount codes (Phase 10, 2026-09-29).
-- Each case runs in its own rolled-back subtransaction; nothing it writes survives.
--
--   who may call      super_admin and finance_admin -> ok; the five other admin roles and
--                     a buyer -> 42501; anon -> 42501 (no EXECUTE)
--   client roles      a signed-in vendor can't call the payment functions' RPCs, read the
--                     discount tables or list codes
--   save rules        a malformed, short or long code, an unknown kind or target, 0% / 101% /
--                     ₹0, plans on a non-plan code, an invite-only / free / unknown plan, a
--                     cap of 0, 0 per vendor, an end before the start and a long note ->
--                     22023; a duplicate in any case -> 23505; an unknown id -> P0002
--   lifecycle         create (trimmed, upper-cased, plans de-duplicated), list, switch off,
--                     unknown id -> P0002; the Admin Log names the admin
--   check reasons     every refusal reason, and the arithmetic on plan, certificate and ad
--                     lines (the certificate is never part of an ad code's discount)
--   guessing limit    ten unknown codes lock that vendor out for an hour, no one else
--   reserve and uses  the last use: held by one vendor, refused to another, replaced by the
--                     same vendor's next checkout, free again when it lapses; a price that
--                     changed since the quote, a reused order and a missing order refused
--   confirm/release   idempotent confirm, wrong order, release never undoes a confirmation,
--                     the per-vendor limit, a replaced order paid anyway
--   edit locks        after a confirmed use the code, kind, value and plans are fixed and
--                     the cap can't go below the uses; dates, caps, note and on/off can change
--   order columns     the discount columns' consistency checks on orders and invoices
--   ledger            discounted rows carry the discount, summary totals it, a code finds
--                     its rows, and a ₹0 invoice counts as verified
--
-- The race for the last use across separate connections is scripts/discount-race-check.sql.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h14$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  va     uuid := '22222222-2222-2222-2222-222222222222';
  vb     uuid;
  labels text[] := array[
    'super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager',
    'buyer', 'anon', 'client roles', 'save rules', 'lifecycle', 'check reasons', 'guessing limit',
    'reserve and uses', 'confirm/release', 'edit locks', 'order columns', 'ledger'];
  roles  text[] := array['super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager'];
  i int; k int; t text; j jsonb; c1 uuid; r1 jsonb; r2 jsonb; r3 jsonb;
  out text := '';
begin
  select v.id into vb from public.vendor_profiles v where v.id <> va order by v.id limit 1;
  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, (case when i between 1 and 7 then roles[i] else 'super_admin' end)::public.admin_role_type, true)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

      if i = 9 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object(
          'sub', case i when 8 then buyer when 10 then va else pr end, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', (case i when 8 then buyer when 10 then va else pr end)::text, true);
        set local role authenticated;
      end if;

      if i <= 9 then
        j := public.admin_discount_codes();
        raise exception using errcode = 'P0099', message = format('%s codes listed', jsonb_array_length(j));

      elsif i = 10 then
        t := '';
        begin perform public.discount_check('H14X', va, 'ad'); exception when others then t := t || 'check ' || sqlstate || '; '; end;
        begin perform public.discount_reserve('H14X', va, 'ad', 'h14_o'); exception when others then t := t || 'reserve ' || sqlstate || '; '; end;
        begin perform public.discount_confirm(gen_random_uuid(), 'h14_o'); exception when others then t := t || 'confirm ' || sqlstate || '; '; end;
        begin perform public.discount_release(gen_random_uuid(), 'h14_o'); exception when others then t := t || 'release ' || sqlstate || '; '; end;
        begin perform count(*) from admin.discount_codes; exception when others then t := t || 'read codes ' || sqlstate || '; '; end;
        begin perform count(*) from admin.discount_redemptions; exception when others then t := t || 'read redemptions ' || sqlstate || '; '; end;
        begin perform public.admin_discount_codes(); exception when others then t := t || 'admin list ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 11 then
        t := '';
        begin perform public.admin_discount_code_save(null, 'A!C', 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || 'A!C ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'AB', 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || 'AB ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, repeat('A', 33), 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || '33 chars ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, '-H14', 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || 'leading dash ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'bogus', 10, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || 'kind ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 0, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || '0% ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 101, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || '101% ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'flat', 0, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || 'Rs0 ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'buyer_order', null, null, 1, null, null, true, null); exception when others then t := t || 'target ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'ad_purchase', array['gold'], null, 1, null, null, true, null); exception when others then t := t || 'plans on ads ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', array['vip'], null, 1, null, null, true, null); exception when others then t := t || 'vip ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', array['free'], null, 1, null, null, true, null); exception when others then t := t || 'free ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', array['nope'], null, 1, null, null, true, null); exception when others then t := t || 'unknown plan ' || sqlstate || ' (' || sqlerrm || '); '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', null, 0, 1, null, null, true, null); exception when others then t := t || 'cap 0 ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', null, null, 0, null, null, true, null); exception when others then t := t || '0 per vendor ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', null, null, 1, now(), now() - interval '1 day', true, null); exception when others then t := t || 'ends first ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(null, 'H14K', 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, repeat('n', 201)); exception when others then t := t || 'long note ' || sqlstate || '; '; end;
        perform public.admin_discount_code_save(null, 'H14DUP', 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, null);
        begin perform public.admin_discount_code_save(null, ' h14dup ', 'flat', 50, 'ad_purchase', null, null, 1, null, null, true, null); exception when others then t := t || 'duplicate ' || sqlstate || ' (' || sqlerrm || '); '; end;
        begin perform public.admin_discount_code_save(gen_random_uuid(), 'H14K', 'percent', 10, 'vendor_plan', null, null, 1, null, null, true, null); exception when others then t := t || 'unknown id ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 12 then
        c1 := public.admin_discount_code_save(null, ' h14plan ', 'percent', 25, 'vendor_plan', array['silver', 'gold', 'gold'],
                                              100, 2, null, now() + interval '10 days', true, '  H14 launch  ');
        select e into r1 from jsonb_array_elements(public.admin_discount_codes()) e where e ->> 'id' = c1::text;
        t := format('saved %s: %s %s on %s %s, cap %s, %s per vendor, state %s, uses %s, note "%s"',
                    r1 ->> 'code', r1 ->> 'value', r1 ->> 'kind', r1 ->> 'applies_to', r1 -> 'plan_ids',
                    r1 ->> 'max_uses', r1 ->> 'per_vendor_limit', r1 ->> 'state', r1 ->> 'uses', r1 ->> 'note');
        perform public.admin_discount_code_set_active(c1, false);
        t := t || format('; switched off: %s', (select e ->> 'state' from jsonb_array_elements(public.admin_discount_codes()) e
                                                  where e ->> 'id' = c1::text));
        begin perform public.admin_discount_code_set_active(gen_random_uuid(), true); exception when others then t := t || '; unknown id ' || sqlstate; end;
        reset role;
        t := t || format('; created_by is the admin: %s', (select c.created_by = pr from admin.discount_codes c where c.id = c1));
        t := t || format('; Admin Log: %s',
                 (select string_agg(x.action || ' ' || x.n, ', ' order by x.action) from (
                    select l.action, count(*) as n from admin.audit_log l
                     where l.target_table = 'admin.discount_codes' and l.actor_id = pr group by l.action) x));
        raise exception using errcode = 'P0099', message = t;

      elsif i = 13 then
        perform public.admin_discount_code_save(null, 'H14PLAN25', 'percent', 25, 'vendor_plan', null, null, 1, null, null, true, null);
        perform public.admin_discount_code_save(null, 'H14GOLD', 'percent', 10, 'vendor_plan', array['gold'], null, 1, null, null, true, null);
        perform public.admin_discount_code_save(null, 'H14CERT', 'flat', 500, 'certificate', null, null, 1, null, null, true, null);
        perform public.admin_discount_code_save(null, 'H14ADS', 'percent', 10, 'ad_purchase', null, null, 1, null, null, true, null);
        perform public.admin_discount_code_save(null, 'H14OFF', 'percent', 10, 'vendor_plan', null, null, 1, null, null, false, null);
        perform public.admin_discount_code_save(null, 'H14LATER', 'percent', 10, 'vendor_plan', null, null, 1, now() + interval '1 day', null, true, null);
        perform public.admin_discount_code_save(null, 'H14PAST', 'percent', 10, 'vendor_plan', null, null, 1, now() - interval '2 days', now() - interval '1 day', true, null);
        perform public.admin_discount_code_save(null, 'H14TINY', 'percent', 1, 'ad_purchase', null, null, 1, null, null, true, null);
        reset role;
        set local role service_role;
        t := concat_ws('; ',
          'unknown ' || (public.discount_check('H14NOPE', va, 'subscription', 'gold', 2299) ->> 'reason'),
          'malformed ' || (public.discount_check('H1 4!', va, 'subscription', 'gold', 2299) ->> 'reason'),
          'off ' || (public.discount_check('H14OFF', va, 'subscription', 'gold', 2299) ->> 'reason'),
          'tomorrow ' || (public.discount_check('H14LATER', va, 'subscription', 'gold', 2299) ->> 'reason'),
          'yesterday ' || (public.discount_check('H14PAST', va, 'subscription', 'gold', 2299) ->> 'reason'),
          'plan code on ads ' || (public.discount_check('H14PLAN25', va, 'ad', null, 0, 1000, 199) ->> 'reason'),
          'ad code on a plan ' || (public.discount_check('H14ADS', va, 'subscription', 'gold', 2299) ->> 'reason'),
          'gold code on silver ' || (public.discount_check('H14GOLD', va, 'subscription', 'silver', 1499) ->> 'reason'),
          'certificate code, no certificate ' || (public.discount_check('H14CERT', va, 'ad', null, 0, 1000, 0) ->> 'reason'),
          '1% of Rs22 ' || (public.discount_check('H14TINY', va, 'ad', null, 0, 22, 0) ->> 'reason'),
          'a buyer ' || (public.discount_check('H14PLAN25', buyer, 'subscription', 'gold', 2299) ->> 'reason'),
          '25% of Rs2299 = ' || (public.discount_check(' h14plan25 ', va, 'subscription', 'gold', 2299) ->> 'discount_rupees'),
          'gold code on gold = ' || (public.discount_check('H14GOLD', va, 'subscription', 'gold', 2299) ->> 'discount_rupees'),
          'Rs500 off a Rs199 certificate = ' || (public.discount_check('H14CERT', va, 'ad', null, 0, 1000, 199) ->> 'discount_rupees'),
          '10% of Rs1000 ad lines beside a certificate = ' || (public.discount_check('H14ADS', va, 'ad', null, 0, 1000, 199) ->> 'discount_rupees'));
        begin perform public.discount_check('H14PLAN25', va, 'buyer_order'); exception when others then t := t || '; bad order kind ' || sqlstate; end;
        reset role;
        t := t || format('; unknown-code attempts logged for the vendor: %s', (select count(*) from admin.discount_attempts a where a.vendor_id = va));
        raise exception using errcode = 'P0099', message = t;

      elsif i = 14 then
        perform public.admin_discount_code_save(null, 'H14ADS', 'percent', 10, 'ad_purchase', null, null, 1, null, null, true, null);
        reset role;
        set local role service_role;
        for k in 1..10 loop
          perform public.discount_check('H14GUESS' || k, va, 'ad', null, 0, 1000, 0);
        end loop;
        t := 'after 10 unknown codes, a real one: ' || (public.discount_check('H14ADS', va, 'ad', null, 0, 1000, 0) ->> 'reason');
        t := t || '; another vendor: ' || coalesce(public.discount_check('H14ADS', vb, 'ad', null, 0, 1000, 0) ->> 'discount_rupees', 'refused');
        reset role;
        update admin.discount_attempts a set at = now() - interval '61 minutes' where a.vendor_id = va;
        set local role service_role;
        t := t || '; an hour later: ' || coalesce(public.discount_check('H14ADS', va, 'ad', null, 0, 1000, 0) ->> 'discount_rupees', 'refused');
        raise exception using errcode = 'P0099', message = t;

      elsif i = 15 then
        c1 := public.admin_discount_code_save(null, 'H14LAST', 'flat', 100, 'ad_purchase', null, 1, 1, null, null, true, null);
        reset role;
        set local role service_role;
        r1 := public.discount_reserve('H14LAST', va, 'ad', 'h14_order_a1', 100, null, 0, 1000, 0);
        r2 := public.discount_reserve('H14LAST', vb, 'ad', 'h14_order_b1', null, null, 0, 1000, 0);
        t := format('A reserves: %s (Rs%s off); B while A holds it: %s', r1 ->> 'ok', r1 ->> 'discount_rupees', r2 ->> 'reason');
        r3 := public.discount_reserve('H14LAST', va, 'ad', 'h14_order_a2', null, null, 0, 1000, 0);
        reset role;
        t := t || format('; A again: %s, A''s first is now %s', r3 ->> 'ok',
                         (select r.status from admin.discount_redemptions r where r.order_ref = 'h14_order_a1'));
        t := t || format('; held for %s min',
                         (select round(extract(epoch from r.expires_at - r.reserved_at) / 60) from admin.discount_redemptions r
                           where r.order_ref = 'h14_order_a2'));
        update admin.discount_redemptions r set expires_at = now() - interval '1 second' where r.order_ref = 'h14_order_a2';
        set local role service_role;
        r2 := public.discount_reserve('H14LAST', vb, 'ad', 'h14_order_b2', null, null, 0, 1000, 0);
        t := t || format('; once A''s lapses, B: %s', r2 ->> 'ok');
        r3 := public.discount_reserve('H14LAST', va, 'ad', 'h14_order_a3', 100, null, 0, 1000, 0);
        t := t || format('; A while B holds it: %s', r3 ->> 'reason');
        reset role;
        update admin.discount_codes c set max_uses = null where c.id = c1;
        set local role service_role;
        r3 := public.discount_reserve('H14LAST', va, 'ad', 'h14_order_a4', 50, null, 0, 1000, 0);
        t := t || format('; quoted Rs50 off, the code now gives Rs100: %s', r3 ->> 'reason');
        begin perform public.discount_reserve('H14LAST', va, 'ad', 'h14_order_b2', null, null, 0, 1000, 0); exception when others then t := t || '; an order already holding a code ' || sqlstate; end;
        begin perform public.discount_reserve('H14LAST', va, 'ad', '  ', null, null, 0, 1000, 0); exception when others then t := t || '; no order ' || sqlstate; end;
        raise exception using errcode = 'P0099', message = t;

      elsif i = 16 then
        c1 := public.admin_discount_code_save(null, 'H14ONCE', 'percent', 20, 'vendor_plan', null, null, 1, null, null, true, null);
        reset role;
        set local role service_role;
        r1 := public.discount_reserve('H14ONCE', va, 'subscription', 'h14_sub_a1', null, 'gold', 2299);
        r2 := public.discount_confirm((r1 ->> 'redemption_id')::uuid, 'h14_sub_a1');
        r3 := public.discount_confirm((r1 ->> 'redemption_id')::uuid, 'h14_sub_a1');
        t := format('confirm %s (Rs%s); again %s, same time %s', r2 ->> 'ok', ((r2 ->> 'discount_paise')::bigint / 100),
                    r3 ->> 'ok', (r2 ->> 'confirmed_at') = (r3 ->> 'confirmed_at'));
        t := t || '; wrong order: ' || (public.discount_confirm((r1 ->> 'redemption_id')::uuid, 'h14_other') ->> 'reason');
        t := t || '; release after paying: ' || (public.discount_release((r1 ->> 'redemption_id')::uuid, 'h14_sub_a1') ->> 'ok');
        t := t || '; A again (1 per vendor): ' || (public.discount_check('H14ONCE', va, 'subscription', 'gold', 2299) ->> 'reason');
        t := t || '; B: Rs' || (public.discount_check('H14ONCE', vb, 'subscription', 'gold', 2299) ->> 'discount_rupees');
        r1 := public.discount_reserve('H14ONCE', vb, 'subscription', 'h14_sub_b1', null, 'gold', 2299);
        r2 := public.discount_reserve('H14ONCE', vb, 'subscription', 'h14_sub_b2', null, 'gold', 2299);
        t := t || '; B''s replaced order paid anyway: ' || (public.discount_confirm((r1 ->> 'redemption_id')::uuid, 'h14_sub_b1') ->> 'ok');
        t := t || '; B''s open one released: ' || (public.discount_release((r2 ->> 'redemption_id')::uuid, 'h14_sub_b2') ->> 'ok');
        t := t || '; released again: ' || (public.discount_release((r2 ->> 'redemption_id')::uuid, 'h14_sub_b2') ->> 'ok');
        reset role;
        t := t || format('; rows %s', (select string_agg(r.order_ref || '=' || r.status, ', ' order by r.order_ref)
                                         from admin.discount_redemptions r where r.code_id = c1));
        raise exception using errcode = 'P0099', message = t;

      elsif i = 17 then
        c1 := public.admin_discount_code_save(null, 'H14LOCK', 'percent', 20, 'vendor_plan', array['gold'], 5, 1, null, null, true, null);
        reset role;
        set local role service_role;
        r1 := public.discount_reserve('H14LOCK', va, 'subscription', 'h14_lock_a', null, 'gold', 2299);
        perform public.discount_confirm((r1 ->> 'redemption_id')::uuid, 'h14_lock_a');
        r2 := public.discount_reserve('H14LOCK', vb, 'subscription', 'h14_lock_b', null, 'gold', 2299);
        perform public.discount_confirm((r2 ->> 'redemption_id')::uuid, 'h14_lock_b');
        reset role;
        set local role authenticated;
        t := '';
        begin perform public.admin_discount_code_save(c1, 'H14LOCK', 'percent', 30, 'vendor_plan', array['gold'], 5, 1, null, null, true, null); exception when others then t := t || 'value ' || sqlstate || ' (' || sqlerrm || '); '; end;
        begin perform public.admin_discount_code_save(c1, 'H14LOCK2', 'percent', 20, 'vendor_plan', array['gold'], 5, 1, null, null, true, null); exception when others then t := t || 'text ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(c1, 'H14LOCK', 'flat', 20, 'vendor_plan', array['gold'], 5, 1, null, null, true, null); exception when others then t := t || 'kind ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(c1, 'H14LOCK', 'percent', 20, 'vendor_plan', array['gold', 'silver'], 5, 1, null, null, true, null); exception when others then t := t || 'plans ' || sqlstate || '; '; end;
        begin perform public.admin_discount_code_save(c1, 'H14LOCK', 'percent', 20, 'vendor_plan', array['gold'], 1, 1, null, null, true, null); exception when others then t := t || 'cap below uses ' || sqlstate || ' (' || sqlerrm || '); '; end;
        perform public.admin_discount_code_save(c1, 'h14lock', 'percent', 20, 'vendor_plan', array['gold'], 10, 3,
                                                now() - interval '1 day', now() + interval '30 days', false, 'edited');
        select e into r1 from jsonb_array_elements(public.admin_discount_codes()) e where e ->> 'id' = c1::text;
        t := t || format('allowed: cap %s, %s per vendor, active %s, note %s, ends %s; uses %s by %s vendors, Rs%s off',
                         r1 ->> 'max_uses', r1 ->> 'per_vendor_limit', r1 ->> 'active', r1 ->> 'note',
                         (r1 ->> 'valid_to') is not null, r1 ->> 'uses', r1 ->> 'vendors', ((r1 ->> 'discount_paise')::bigint / 100));
        j := public.admin_discount_redemptions(c1);
        t := t || format('; redemptions listed %s, first vendor named %s', jsonb_array_length(j), (j -> 0 ->> 'vendor_name') is not null);
        raise exception using errcode = 'P0099', message = t;

      elsif i = 18 then
        reset role;
        t := '';
        begin insert into public.ad_orders (order_id, vendor_id, spec, amount, discount_paise) values ('h14_bad1', va, '{}', 100, 500);
        exception when others then t := t || 'ad discount without a code ' || sqlstate || '; '; end;
        begin insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, amount, list_rupees, discount_rupees, discount_code, discount_redemption_id)
              values ('h14_bad2', va, 'gold', 100, 100, 200, 'H14X', gen_random_uuid());
        exception when others then t := t || 'discount above the price ' || sqlstate || '; '; end;
        begin insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, amount, discount_rupees, discount_code, discount_redemption_id)
              values ('h14_bad3', va, 'gold', 100, 50, 'H14X', gen_random_uuid());
        exception when others then t := t || 'discount without a price ' || sqlstate || '; '; end;
        begin insert into public.subscription_invoices (vendor_id, amount, discount_amount, discount_code) values (va, 100, 0, 'H14X');
        exception when others then t := t || 'invoice discount of 0 ' || sqlstate || '; '; end;
        begin insert into public.subscription_invoices (vendor_id, amount, discount_amount) values (va, 100, 50);
        exception when others then t := t || 'invoice discount without a code ' || sqlstate || '; '; end;
        insert into public.ad_orders (order_id, vendor_id, spec, amount, discount_paise, discount_code, discount_redemption_id)
        values ('free_h14', va, '{}', 0, 19900, 'H14CERT', gen_random_uuid());
        insert into public.subscription_payment_orders (order_id, vendor_id, plan_id, amount, list_rupees)
        values ('h14_plain', va, 'gold', 271300, 2299);
        t := t || 'a Rs0 order with its discount and a plain order with its list price: ok';
        raise exception using errcode = 'P0099', message = t;

      elsif i = 19 then
        reset role;
        insert into public.subscription_invoices (vendor_id, plan_id, amount, gst_amount, status, discount_amount, discount_code, invoice_number)
        values (va, 'gold', 1724, 310, 'paid', 575, 'H14LEDGER', 'H14-INV-1'),
               (va, 'gold', 0, 0, 'paid', 2299, 'H14LEDGER', 'H14-INV-2');
        insert into public.ad_orders (order_id, vendor_id, spec, amount, status, paid_at, discount_paise, discount_code, discount_redemption_id)
        values ('h14_ad_paid', va, '{"placementIds":["openListing"]}', 90000, 'paid', now(), 10000, 'H14LEDGER', gen_random_uuid());
        update admin.admin_users set admin_role = 'finance_admin' where id = pr;
        set local role authenticated;
        select string_agg(format('%s %s paid Rs%s, Rs%s off with %s, verified %s', l.kind, l.reference, l.total_paise / 100,
                                 l.discount_paise / 100, l.discount_code, l.verified), ' | ' order by l.reference)
          into t
          from public.admin_payments_ledger(p_search => 'H14LEDGER') l;
        j := public.admin_payments_summary(p_search => 'H14LEDGER');
        t := t || format(' || summary: %s discounted, Rs%s off, unverified %s', j ->> 'discounted',
                         (j ->> 'discounts_paise')::bigint / 100, j ->> 'unverified');
        raise exception using errcode = 'P0099', message = t;
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'H14 (rolled back)%', E'\n' || out;
end
$h14$;
