-- Harness for migration 20261117110000 (Seller Home audit, Medium batch 2). Local stack only; everything is rolled back.
--   docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 < scripts/seller-home/medium_b.sql
begin;

do $h$
declare
  v_vendor uuid;
  v_other uuid;
  v_buyer uuid;
  v_live uuid;
  v_theirs uuid;
  v_conv uuid;
  v_new int;
  v_old int;
  v_diff int;
  r record;
begin
  -- Two sellers with a live listing each, and a buyer.
  select v.id into v_vendor from public.vendor_profiles v
   where exists (select 1 from public.products p where p.vendor_id = v.id and p.status = 'live') order by v.created_at limit 1;
  select v.id into v_other from public.vendor_profiles v
   where v.id <> v_vendor and exists (select 1 from public.products p where p.vendor_id = v.id and p.status = 'live') order by v.created_at limit 1;
  select id into v_live from public.products where vendor_id = v_vendor and status = 'live' limit 1;
  select id into v_theirs from public.products where vendor_id = v_other and status = 'live' limit 1;
  select id into v_buyer from public.profiles where id not in (v_vendor, v_other) order by created_at limit 1;
  if v_vendor is null or v_other is null or v_buyer is null then raise exception 'harness: needs two sellers with live listings'; end if;

  -- ── SH-098: campaigns in every state; active_ads must equal the eligibility rule on its own ──
  -- (guard_ad_activation sends every insert to review; triggers are off for these test rows only.)
  set local session_replication_role = replica;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, starts_at, ends_at, daily_budget)
  select v_vendor, v_live, 'mb ' || s || ' ' || w, 'openListing', 'active',
         case w when 'future' then now() + interval '1 day' else now() - interval '1 day' end,
         case w when 'over' then now() - interval '1 hour' else now() + interval '5 days' end, 22
    from unnest(array['a','b']) s, unnest(array['now','future','over']) w;
  -- other statuses go in as postgres (no browser guard), so the rule sees each.
  insert into public.advertisements (vendor_id, product_id, title, placement, status, starts_at, ends_at, daily_budget)
  select v_vendor, v_live, 'mb ' || st, 'openListing', st, now() - interval '1 day', now() + interval '5 days', 22
    from unnest(array['pending_review','paused_by_vendor','rejected']) st;
  set local session_replication_role = origin;

  select count(*) into v_new from public.active_ads(500, null, null, null) x where x.title like 'mb %';
  select count(*) into v_old from public.advertisements a
    join public.products p on p.id = a.product_id and p.status = 'live'
   where a.title like 'mb %' and public.is_ad_eligible(a, null, null, null, null);
  if v_new <> v_old or v_new <> 2 then
    raise exception 'SH-098: active_ads gave % running test campaigns, the rule alone %, want 2', v_new, v_old;
  end if;
  raise notice 'ok  SH-098 active_ads = the eligibility rule (% of 9 test campaigns)', v_new;

  -- ── SH-095: fulfilment refuses another seller's listing ──
  insert into public.ad_orders (order_id, vendor_id, spec, amount, status) values ('mb_order_1', v_vendor, '{}'::jsonb, 2200, 'created');
  begin
    perform public.ad_order_fulfil('mb_order_1', jsonb_build_array(jsonb_build_object(
      'vendor_id', v_vendor, 'product_id', v_theirs, 'title', 't', 'image_url', null, 'daily_budget', 22,
      'placement', 'openListing', 'status', 'active', 'starts_at', now(), 'ends_at', now() + interval '1 day',
      'target_categories', null, 'target_cities', null, 'target_states', '[]'::jsonb, 'target_countries', '[]'::jsonb)));
    raise exception 'SH-095: a campaign on another seller''s listing was published';
  exception when sqlstate '22023' then
    raise notice 'ok  SH-095 another seller''s listing refused';
  end;
  -- and the seller's own listing, and a seal with no listing, still publish
  select (public.ad_order_fulfil('mb_order_1', jsonb_build_array(
      jsonb_build_object('vendor_id', v_vendor, 'product_id', v_live, 'title', 't', 'image_url', null, 'daily_budget', 22,
        'placement', 'openListing', 'status', 'active', 'starts_at', now(), 'ends_at', now() + interval '1 day',
        'target_categories', null, 'target_cities', null, 'target_states', '[]'::jsonb, 'target_countries', '[]'::jsonb),
      jsonb_build_object('vendor_id', v_vendor, 'product_id', null, 'title', 'Account verification — Trusted Seal', 'image_url', null,
        'daily_budget', 1, 'placement', 'trustedSeal', 'status', 'active', 'starts_at', now(), 'ends_at', now() + interval '30 days',
        'target_categories', null, 'target_cities', null, 'target_states', '[]'::jsonb, 'target_countries', '[]'::jsonb)
    )) ->> 'count')::int into v_new;
  if v_new <> 2 then raise exception 'SH-095: own listing + seal published % campaigns, want 2', v_new; end if;
  if (select status from public.advertisements where ad_order_id = 'mb_order_1' and placement = 'trustedSeal') <> 'pending_review' then
    raise exception 'SH-093: a paid seal went live without review';
  end if;
  raise notice 'ok  SH-095 own listing and a standalone seal publish (both in review)';

  -- ── SH-080: reply times per thread ──
  insert into public.conversations (user_a, user_b) values (least(v_vendor, v_buyer), greatest(v_vendor, v_buyer))
    on conflict (user_a, user_b) do nothing;
  select id into v_conv from public.conversations where user_a = least(v_vendor, v_buyer) and user_b = greatest(v_vendor, v_buyer);
  delete from public.messages where conversation_id = v_conv;
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (v_conv, v_buyer, 'hi', now() - interval '10 hours'),
    (v_conv, v_vendor, 'hello', now() - interval '7 hours'),
    (v_conv, v_buyer, 'price?', now() - interval '1 hour');
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.vendor_response_threads() t where t.conversation_id = v_conv;
  reset role;
  if r.buyer_id <> v_buyer or round(extract(epoch from r.first_reply_at - r.first_buyer_at) / 3600) <> 3 or r.awaiting is not true then
    raise exception 'SH-080: thread % gave buyer % reply % h awaiting %', v_conv, r.buyer_id,
      extract(epoch from r.first_reply_at - r.first_buyer_at) / 3600, r.awaiting;
  end if;
  raise notice 'ok  SH-080 first reply after 3 h, buyer waiting on the last message';
end
$h$;

-- The running-campaign index is what the planner picks for the pre-filter.
explain (costs off) select a.id from public.advertisements a
 where a.status = 'active' and (a.starts_at is null or a.starts_at <= now()) and (a.ends_at is null or a.ends_at > now())
 order by a.created_at desc, a.id desc limit 12;

rollback;
