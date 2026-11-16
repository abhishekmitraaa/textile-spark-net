-- Seller Home audit, the High items left after A–C (documentation/seller-home-high-fixes-plan-2026-11-16.md).
-- One block per fix; each check raises with its name when it fails. Runs in one transaction and rolls back.
--
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < scripts/seller-home/high_fixes.sql
--
-- Task 5 (SH-075), a quote's terms need an open request:
--   quote_terms_open           the seller revises a quote on an open request; an accepted one goes back to pending
--   quote_terms_closed         the seller can't change the terms once the buyer closed the request
--   quote_status_after_close   the buyer can still accept, shortlist or reject a quote on a closed request
--   quote_unwin_after_close    the seller can't move an accepted quote back to pending on a closed request
--   quote_terms_expired        ... nor once the request's deadline has passed
--   quote_terms_removed        ... nor once Cosora removed the request
--
-- Task 7 (SH-090), a paid ad order gets its campaigns or stays waiting:
--   ad_order_all_or_nothing    one bad campaign row leaves the order 'created' with no campaigns; good rows mark it
--                              paid and insert them all; a second call claims nothing

begin;

-- ─────────────────────────── Task 5: quotes ───────────────────────────
do $$
declare
  buyer uuid;
  vendor uuid;
  rfq uuid;
  q uuid;
  st text;
  refused boolean;
begin
  select vp.id into vendor from public.vendor_profiles vp
   where vp.onboarding_complete and public.account_is_active(vp.id) order by vp.created_at limit 1;
  select p.id into buyer from public.profiles p
   where p.id <> vendor and public.account_is_active(p.id)
     and not public.chat_blocked_between(p.id, vendor) order by p.created_at limit 1;
  if vendor is null or buyer is null then raise exception 'setup: need a seller and a buyer'; end if;

  insert into public.rfqs (buyer_id, title, quantity, status) values (buyer, 'High fixes: quote terms', 100, 'active') returning id into rfq;
  insert into public.quotes (rfq_id, vendor_id, price_per_unit, moq, status) values (rfq, vendor, 250, 50, 'accepted') returning id into q;

  -- quote_terms_open
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.quotes set price_per_unit = 260 where id = q;
  execute 'reset role';
  select status::text into st from public.quotes where id = q;
  if st <> 'pending' or (select price_per_unit from public.quotes where id = q) <> 260 then
    raise exception 'quote_terms_open: a revised quote on an open request should be saved and pending (status %)', st;
  end if;

  -- quote_terms_closed
  update public.quotes set status = 'accepted' where id = q;
  update public.rfqs set status = 'closed' where id = rfq;
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  refused := false;
  begin
    update public.quotes set price_per_unit = 1 where id = q;
  exception when sqlstate 'P0001' then
    refused := true;
  end;
  execute 'reset role';
  if not refused then
    raise exception 'quote_terms_closed: the seller changed an accepted quote on a closed request (now % and %)',
      (select price_per_unit from public.quotes where id = q), (select status from public.quotes where id = q);
  end if;

  -- quote_status_after_close
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.quotes set status = 'shortlisted' where id = q;
  update public.quotes set status = 'accepted' where id = q;
  execute 'reset role';
  if (select status from public.quotes where id = q) <> 'accepted' then
    raise exception 'quote_status_after_close: the buyer could not decide a quote on a closed request';
  end if;

  -- quote_unwin_after_close (the status alone, no terms changed)
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  refused := false;
  begin
    update public.quotes set status = 'pending' where id = q;
  exception when sqlstate 'P0001' then
    refused := true;
  end;
  execute 'reset role';
  if not refused or (select status from public.quotes where id = q) <> 'accepted' then
    raise exception 'quote_unwin_after_close: the seller moved an accepted quote to % on a closed request',
      (select status from public.quotes where id = q);
  end if;

  -- quote_terms_expired
  update public.rfqs set status = 'active', expires_at = now() - interval '1 hour' where id = rfq;
  if (select expires_at from public.rfqs where id = rfq) > now() then raise exception 'setup: the deadline did not move'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  refused := false;
  begin
    update public.quotes set moq = 10 where id = q;
  exception when sqlstate 'P0001' then
    refused := true;
  end;
  execute 'reset role';
  if not refused then raise exception 'quote_terms_expired: the seller changed a quote after the deadline'; end if;

  -- quote_terms_removed
  update public.rfqs set status = 'closed', expires_at = now() + interval '5 days', removed_at = now(), removed_reason = 'harness' where id = rfq;
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  refused := false;
  begin
    update public.quotes set comment = 'new words after removal' where id = q;
  exception when sqlstate 'P0001' then
    refused := true;
  end;
  execute 'reset role';
  if not refused then raise exception 'quote_terms_removed: the seller changed a quote on a request Cosora removed'; end if;

  raise notice 'Task 5 quotes: 6 checks passed';
end $$;

-- ─────────────────────────── Task 7: a paid ad order ───────────────────────────
do $$
declare
  vendor uuid;
  oid text := 'order_hx_' || replace(gen_random_uuid()::text, '-', '');
  good jsonb;
  ans jsonb;
  failed boolean := false;
begin
  select vp.id into vendor from public.vendor_profiles vp where vp.onboarding_complete order by vp.created_at limit 1;
  insert into public.ad_orders (order_id, vendor_id, spec, amount, status) values (oid, vendor, '{}'::jsonb, 6600, 'created');
  good := jsonb_build_object('vendor_id', vendor, 'product_id', null, 'title', 'hx campaign', 'image_url', null,
    'daily_budget', 22, 'placement', 'openListing', 'status', 'active',
    'starts_at', now(), 'ends_at', now() + interval '3 days',
    'target_categories', null, 'target_cities', null, 'target_states', '[]'::jsonb, 'target_countries', '[]'::jsonb,
    'ad_order_id', oid);

  -- One good row and one the table refuses (a state code that isn't one): nothing may be kept.
  begin
    perform public.ad_order_fulfil(oid, jsonb_build_array(good, good || jsonb_build_object('target_states', jsonb_build_array('not-a-state'))));
  exception when others then
    failed := true;
  end;
  if not failed then raise exception 'ad_order_all_or_nothing: a refused campaign row did not fail the call'; end if;
  if (select status from public.ad_orders where order_id = oid) <> 'created'
     or exists (select 1 from public.advertisements where ad_order_id = oid) then
    raise exception 'ad_order_all_or_nothing: a failed call left the order % with % campaigns',
      (select status from public.ad_orders where order_id = oid), (select count(*) from public.advertisements where ad_order_id = oid);
  end if;

  ans := public.ad_order_fulfil(oid, jsonb_build_array(good, good));
  if not (ans ->> 'claimed')::boolean or (ans ->> 'count')::int <> 2
     or (select status from public.ad_orders where order_id = oid) <> 'paid'
     or (select count(*) from public.advertisements where ad_order_id = oid and status = 'pending_review') <> 2 then
    raise exception 'ad_order_all_or_nothing: good rows should mark the order paid with 2 campaigns in review (%)', ans;
  end if;

  ans := public.ad_order_fulfil(oid, jsonb_build_array(good));
  if (ans ->> 'claimed')::boolean or (select count(*) from public.advertisements where ad_order_id = oid) <> 2 then
    raise exception 'ad_order_all_or_nothing: a second call published again (%)', ans;
  end if;

  raise notice 'Task 7 ad orders: ad_order_all_or_nothing passed';
end $$;

rollback;
