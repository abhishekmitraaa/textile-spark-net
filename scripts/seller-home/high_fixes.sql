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
--
-- Task 8 (SH-088), ad days start at approval and are kept while paused:
--   ad_approve_late            a 3-day campaign paid 5 days ago is approved: live, 3 days from now; a seal's badge
--                              runs to the new end
--   ad_pause_gives_back        a campaign paused for 2 days ends 2 days later once resumed
--   ad_pause_seal              a Trusted Seal campaign gets no extra days
--   ad_pause_before_start      a pause that ended before the start date adds nothing
--   ad_sweep_keeps_paused      the sweep leaves a paused campaign that holds its days, and ends a paused seal
--   ad_resume_twice            three pauses of a day each add three days, no more
--   ad_admin_pause             Cosora's pause gives the days back too, counted from the first pause

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

-- ─────────────────────────── Task 8: ad days ───────────────────────────
do $$
declare
  vendor uuid;
  staff uuid;
  ad uuid;
  seal uuid;
  a public.advertisements;
  was timestamptz;
  i int;
  as_vendor text;
  as_staff text;

  -- A campaign as the payment functions would leave it, in any status (the fixtures step round the activation guard).
begin
  select vp.id into vendor from public.vendor_profiles vp where vp.onboarding_complete order by vp.created_at limit 1;
  select au.id into staff from admin.admin_users au where au.is_active and au.admin_role = 'super_admin' order by au.created_at limit 1;
  if vendor is null or staff is null then raise exception 'setup: need a seller and a super admin'; end if;
  as_vendor := json_build_object('sub', vendor, 'role', 'authenticated')::text;
  as_staff := json_build_object('sub', staff, 'role', 'authenticated')::text;
  perform set_config('cosora.ad_review', 'on', true);

  -- ad_approve_late
  insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at, daily_budget)
  values (vendor, 'hx late', 'openListing', 'pending_review', now() - interval '5 days', now() - interval '2 days', 22) returning id into ad;
  insert into public.advertisements (vendor_id, title, placement, status, starts_at, ends_at, daily_budget)
  values (vendor, 'hx late seal', 'trustedSeal', 'pending_review', now() - interval '5 days', now() - interval '2 days', 44) returning id into seal;
  perform set_config('cosora.ad_review', '', true);
  perform set_config('request.jwt.claims', as_staff, true);
  if public.approve_ad_campaign(ad) <> 'active' then raise exception 'ad_approve_late: not live after approval'; end if;
  perform public.approve_ad_campaign(seal);
  select * into a from public.advertisements where id = ad;
  if a.status <> 'active' or abs(extract(epoch from a.starts_at - now())) > 5
     or abs(extract(epoch from a.ends_at - (now() + interval '3 days'))) > 5 then
    raise exception 'ad_approve_late: status %, starts %, ends % (want live, now, now + 3 days)', a.status, a.starts_at, a.ends_at;
  end if;
  select * into a from public.advertisements where id = seal;
  if not exists (select 1 from public.vendor_ad_verifications v
                  where v.vendor_id = vendor and v.source = 'trustedSeal' and v.expires_at = a.ends_at)
     or abs(extract(epoch from a.ends_at - (now() + interval '3 days'))) > 5 then
    raise exception 'ad_approve_late: the seal''s badge does not run to the new end (%)', a.ends_at;
  end if;

  -- ad_pause_gives_back
  select ends_at into was from public.advertisements where id = ad;
  perform set_config('request.jwt.claims', as_vendor, true);
  perform public.pause_ad_campaign_by_vendor(ad);
  if (select paused_at from public.advertisements where id = ad) is null then raise exception 'ad_pause_gives_back: paused_at was not set'; end if;
  update public.advertisements set paused_at = now() - interval '2 days', starts_at = starts_at - interval '2 days', ends_at = ends_at - interval '2 days' where id = ad;
  was := was - interval '2 days';
  if public.resume_ad_campaign(ad) <> 'active' then raise exception 'ad_pause_gives_back: not live after resume'; end if;
  select * into a from public.advertisements where id = ad;
  if a.paused_at is not null or abs(extract(epoch from a.ends_at - (was + interval '2 days'))) > 5 then
    raise exception 'ad_pause_gives_back: ends % (want %), paused_at %', a.ends_at, was + interval '2 days', a.paused_at;
  end if;

  -- ad_pause_seal
  select ends_at into was from public.advertisements where id = seal;
  perform public.pause_ad_campaign_by_vendor(seal);
  update public.advertisements set paused_at = now() - interval '1 day', starts_at = starts_at - interval '1 day' where id = seal;
  perform public.resume_ad_campaign(seal);
  if (select ends_at from public.advertisements where id = seal) <> was then
    raise exception 'ad_pause_seal: a seal campaign got extra days (% → %)', was, (select ends_at from public.advertisements where id = seal);
  end if;

  -- ad_pause_before_start
  perform set_config('cosora.ad_review', 'on', true);
  update public.advertisements set status = 'scheduled', starts_at = now() + interval '3 days', ends_at = now() + interval '6 days' where id = ad;
  perform set_config('cosora.ad_review', '', true);
  select ends_at into was from public.advertisements where id = ad;
  perform public.pause_ad_campaign_by_vendor(ad);
  update public.advertisements set paused_at = now() - interval '1 day' where id = ad;
  if public.resume_ad_campaign(ad) <> 'scheduled' then raise exception 'ad_pause_before_start: should be scheduled again'; end if;
  if (select ends_at from public.advertisements where id = ad) <> was then
    raise exception 'ad_pause_before_start: a pause before the start changed the end (% → %)', was, (select ends_at from public.advertisements where id = ad);
  end if;

  -- ad_sweep_keeps_paused
  perform set_config('cosora.ad_review', 'on', true);
  update public.advertisements set status = 'paused_by_vendor', starts_at = now() - interval '6 days', ends_at = now() - interval '1 day', paused_at = now() - interval '5 days' where id = ad;
  update public.advertisements set status = 'paused_by_vendor', starts_at = now() - interval '6 days', ends_at = now() - interval '1 day', paused_at = now() - interval '5 days' where id = seal;
  perform set_config('cosora.ad_review', '', true);
  perform public.sweep_ad_schedules();
  if (select status from public.advertisements where id = ad) <> 'paused_by_vendor' then
    raise exception 'ad_sweep_keeps_paused: the sweep ended a paused campaign that holds its days (%)', (select status from public.advertisements where id = ad);
  end if;
  if (select status from public.advertisements where id = seal) <> 'expired' then
    raise exception 'ad_sweep_keeps_paused: a paused seal past its end should be finished (%)', (select status from public.advertisements where id = seal);
  end if;
  -- ... and the held campaign still resumes, with the days it held. (Two statements: a query doesn't see what a
  -- function it calls has just written.)
  if public.resume_ad_campaign(ad) <> 'active' then raise exception 'ad_sweep_keeps_paused: the held campaign did not resume'; end if;
  if abs(extract(epoch from (select ends_at from public.advertisements where id = ad) - (now() + interval '4 days'))) > 5 then
    raise exception 'ad_sweep_keeps_paused: the held campaign should resume with 4 days left (ends %)', (select ends_at from public.advertisements where id = ad);
  end if;

  -- ad_resume_twice
  select ends_at into was from public.advertisements where id = ad;
  for i in 1..3 loop
    perform public.pause_ad_campaign_by_vendor(ad);
    update public.advertisements set paused_at = paused_at - interval '1 day', starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day' where id = ad;
    was := was - interval '1 day';
    perform public.resume_ad_campaign(ad);
    was := was + interval '1 day';
  end loop;
  if abs(extract(epoch from (select ends_at from public.advertisements where id = ad) - was)) > 5 then
    raise exception 'ad_resume_twice: three one-day pauses moved the end by % (want none beyond the paused time)',
      (select ends_at from public.advertisements where id = ad) - was;
  end if;

  -- ad_admin_pause: the seller pauses, Cosora pauses on top, Cosora resumes
  select ends_at into was from public.advertisements where id = ad;
  perform public.pause_ad_campaign_by_vendor(ad);
  update public.advertisements set paused_at = now() - interval '3 days', starts_at = starts_at - interval '3 days', ends_at = ends_at - interval '3 days' where id = ad;
  was := was - interval '3 days';
  perform set_config('request.jwt.claims', as_staff, true);
  perform public.pause_ad_campaign_by_admin(ad, 'policy_other', 'harness');
  if abs(extract(epoch from (select paused_at from public.advertisements where id = ad) - (now() - interval '3 days'))) > 5 then
    raise exception 'ad_admin_pause: Cosora''s pause restarted the paused clock';
  end if;
  perform public.resume_ad_campaign(ad);
  if abs(extract(epoch from (select ends_at from public.advertisements where id = ad) - (was + interval '3 days'))) > 5 then
    raise exception 'ad_admin_pause: ends % (want %)', (select ends_at from public.advertisements where id = ad), was + interval '3 days';
  end if;

  raise notice 'Task 8 ad days: 7 checks passed';
end $$;

rollback;
