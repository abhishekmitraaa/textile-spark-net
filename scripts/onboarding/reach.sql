-- ─────────────────────────────────────────────────────────────────────────────
-- REACH HARNESS (vendor registration fixes, 2026-11-13): the Free plan's one catalogue, IGST for overseas
-- sellers, and the bounded lift trade buyers give international sellers in feeds and search.
-- Every case runs in its own savepoint and prints PASS/FAIL; the file ROLLS BACK.
-- HOW TO RUN (local stack): bash scripts/onboarding/run.sh scripts/onboarding/reach.sql
--
-- The md5 baselines were taken on the local stack on 2026-11-13, BEFORE 20261113100400 was applied, from
-- the same queries. They prove a signed-out visitor and a buyer without a trade type see exactly what they
-- saw before. They stay valid only while the local stack's live listings are unchanged; retake them (the
-- queries are pg_temp.feed_md5 / pg_temp.search_md5 below, on the old functions) if listings change.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP off
begin;

create function pg_temp.ok(label text, pass boolean, detail text default '') returns void
language plpgsql as $$
begin
  raise notice '%: % %', case when pass then 'PASS' else 'FAIL' end, label, coalesce(detail, '');
end $$;

create function pg_temp.new_user(tag text) returns uuid
language plpgsql as $$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values (u, tag || '-' || left(u::text, 8) || '@harness.test', 'authenticated', 'authenticated',
          jsonb_build_object('full_name', 'Harness ' || tag, 'active_role', 'buyer'), false, false, now(), now(), '', '', '', '');
  return u;
end $$;

create function pg_temp.claims(u uuid) returns void
language plpgsql as $$
begin
  if u is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('request.jwt.claim.sub', '', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u::text, true);
  end if;
end $$;

-- md5 of the feed's original 27 columns, as one viewer (null = signed out).
create function pg_temp.feed_md5(viewer uuid, sort text) returns text
language plpgsql as $$
declare r text;
begin
  perform pg_temp.claims(viewer);
  if viewer is null then set local role anon; else set local role authenticated; end if;
  select md5(string_agg(f::text, '|' order by o)) into r from (
    select row(id, vendor_id, name, price_value, currency, compare_at_price, moq, fabric, gsm, fit_type, gender, rating_avg,
               enquiries_count, sold_count, views_count, location, category_id, category_name, images, created_at, brand_name,
               vendor_city, is_verified, plan_id, plan_expires_at, ad_verified_until, boost) as f, row_number() over () as o
      from public.feed_products(sort, 96, 0)) t;
  reset role;
  return r;
end $$;

create function pg_temp.search_md5(viewer uuid, q text) returns text
language plpgsql as $$
declare r text;
begin
  perform pg_temp.claims(viewer);
  if viewer is null then set local role anon; else set local role authenticated; end if;
  select md5(string_agg(s::text, '|' order by o)) into r from (
    select row(id, score, fts_rank, vec_rank, boost_tier, embedding_used) s, row_number() over () o
      from public.search_products(q, 200)) t;
  reset role;
  return r;
end $$;

-- ═════════════════ baselines: signed-out and untyped buyers see what they saw before ═════════════════
savepoint c;
do $c$
declare b uuid := '11111111-1111-1111-1111-111111111111';
begin
  perform pg_temp.ok('baseline: anon feed newest unchanged', pg_temp.feed_md5(null, 'newest') = 'fa1895edd539205400913c92efb288ec');
  perform pg_temp.ok('baseline: anon feed trending unchanged', pg_temp.feed_md5(null, 'trending') = 'd796b0d2a02bc47c5e4906c1fba04cbb');
  perform pg_temp.ok('baseline: anon search unchanged', pg_temp.search_md5(null, 'shirt') = 'b6aefaa2af757742fa896d6e3591574b');
  perform pg_temp.ok('baseline: untyped buyer search unchanged', pg_temp.search_md5(b, 'shirt') = 'b6aefaa2af757742fa896d6e3591574b');
exception when others then perform pg_temp.ok('baselines', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

-- ═════════════════ the Free plan's one catalogue ═════════════════
savepoint c;
do $c$
declare u uuid := pg_temp.new_user('r-free'); b uuid := pg_temp.new_user('r-basic'); r text;
begin
  insert into public.vendor_profiles (id, brand_name) values (u, 'Free Cat'), (b, 'Basic Cat');
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (b, 'basic', 'monthly', 'active', now() - interval '1 day', now() + interval '29 days');
  perform pg_temp.claims(u);
  begin
    set local role authenticated;
    insert into public.catalogues (vendor_id, title) values (u, 'First');
    reset role;
    r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.ok('free seller: 1st catalogue ok', r = 'ok', r);
  begin
    set local role authenticated;
    insert into public.catalogues (vendor_id, title) values (u, 'Second');
    reset role;
    r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.ok('free seller: 2nd catalogue → the Free plan message', r like 'P0001:The Free plan includes 1 PDF catalogue%', r);
  perform pg_temp.claims(b);
  begin
    set local role authenticated;
    insert into public.catalogues (vendor_id, title) values (b, 'One'), (b, 'Two');
    reset role;
    r := 'ok';
  exception when others then r := sqlstate || ':' || sqlerrm;
  end;
  perform pg_temp.ok('basic seller: 2 catalogues ok', r = 'ok', r);
exception when others then perform pg_temp.ok('free catalogue', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

-- ═════════════════ overseas sellers are billed IGST ═════════════════
savepoint c;
do $c$
declare os uuid := pg_temp.new_user('r-inv-os'); mh uuid := pg_temp.new_user('r-inv-mh'); inv record;
begin
  delete from admin.billing_entity;
  insert into admin.billing_entity (legal_name, address_line1, city, state_code, postal_code, gstin, pan, sac_code, invoice_prefix)
  values ('Cosora Test Pvt Ltd', '1 Test Road', 'Mumbai', 'MH', '400001', '27AAPFU0939F1ZV', 'AAPFU0939F', '998599', 'INV');
  insert into public.vendor_profiles (id, brand_name, onboarding_complete, country, country_code, city)
  values (os, 'Dubai Trading', true, 'United Arab Emirates', 'AE', 'Dubai');
  insert into public.vendor_profiles (id, brand_name, onboarding_complete, state, city) values (mh, 'Mumbai Mills', true, 'Maharashtra', 'Mumbai');
  insert into public.subscription_payment_orders
    (order_id, vendor_id, plan_id, billing_cycle, amount, gst_number, status, list_rupees, discount_rupees, change_kind, credit_rupees, payment_mode)
  values ('order_reach_os', os, 'basic', 'monthly', 82482, null, 'created', 699, 0, 'new', 0, 'test'),
         ('order_reach_mh', mh, 'basic', 'monthly', 82482, null, 'created', 699, 0, 'new', 0, 'test');
  -- As the payment functions call it: the service role.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;
  perform public.subscription_fulfil('order_reach_os', 'pay_reach_os', 'verify');
  perform public.subscription_fulfil('order_reach_mh', 'pay_reach_mh', 'verify');
  reset role;
  select supply_type, igst_paise, cgst_paise, place_of_supply, recipient into inv from public.subscription_invoices where vendor_id = os;
  perform pg_temp.ok('overseas invoice: inter, IGST > 0, CGST 0, no Indian place of supply, country on the recipient',
    inv.supply_type = 'inter' and inv.igst_paise > 0 and coalesce(inv.cgst_paise, 0) = 0 and inv.place_of_supply is null
    and inv.recipient ->> 'country_code' = 'AE',
    coalesce(inv.supply_type, '?') || ' igst=' || coalesce(inv.igst_paise::text, '?') || ' pos=' || coalesce(inv.place_of_supply, 'null'));
  select supply_type, cgst_paise, sgst_paise, place_of_supply into inv from public.subscription_invoices where vendor_id = mh;
  perform pg_temp.ok('Indian invoice in Cosora''s state unchanged: intra, CGST + SGST, place MH',
    inv.supply_type = 'intra' and inv.cgst_paise > 0 and inv.sgst_paise > 0 and inv.place_of_supply = 'MH',
    coalesce(inv.supply_type, '?') || ' pos=' || coalesce(inv.place_of_supply, 'null'));
exception when others then perform pg_temp.ok('overseas billing', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

-- ═════════════════ trade buyers: a bounded lift for international sellers ═════════════════
create function pg_temp.reach_fixture() returns jsonb
language plpgsql as $$
declare inv uuid := pg_temp.new_user('r-in'); intl uuid := pg_temp.new_user('r-intl'); unapp uuid := pg_temp.new_user('r-unapp');
        trade uuid := pg_temp.new_user('r-trade'); plain uuid := pg_temp.new_user('r-plain');
        cat uuid := (select id from public.categories limit 1); p_in uuid; p_intl uuid; p_unapp uuid;
begin
  insert into public.vendor_profiles (id, brand_name, onboarding_complete, country, country_code)
  values (inv, 'Surat Zylo', true, 'India', 'IN'), (intl, 'Dubai Zylo', true, 'United Arab Emirates', 'AE'),
         (unapp, 'Pending Zylo', false, 'United Arab Emirates', 'AE');
  insert into public.products (vendor_id, name, status, category_id, created_at)
  values (intl, 'zylophane kurta', 'live', cat, now() - interval '2 days') returning id into p_intl;
  insert into public.products (vendor_id, name, status, category_id, created_at)
  values (inv, 'zylophane kurta', 'live', cat, now() - interval '1 day') returning id into p_in;
  insert into public.products (vendor_id, name, status, category_id, created_at)
  values (unapp, 'zylophane kurta', 'live', cat, now() - interval '3 days') returning id into p_unapp;
  insert into public.product_trend (product_id, log2_score) values (p_in, 3.0), (p_intl, 3.0), (p_unapp, 3.0)
    on conflict (product_id) do update set log2_score = excluded.log2_score;
  insert into public.buyer_profiles (id, business_type) values (trade, 'Exporter'), (plain, null)
    on conflict (id) do update set business_type = excluded.business_type;
  return jsonb_build_object('in', inv, 'intl', intl, 'unapp', unapp, 'trade', trade, 'plain', plain,
                            'p_in', p_in, 'p_intl', p_intl, 'p_unapp', p_unapp);
end $$;

-- The listing order a viewer sees for these sellers' trending feed (product ids, comma-joined).
create function pg_temp.trending_ids(viewer uuid, vendors uuid[]) returns text
language plpgsql as $$
declare r text;
begin
  perform pg_temp.claims(viewer);
  set local role authenticated;
  select string_agg(id::text, ',' order by o) into r
    from (select id, row_number() over () o from public.feed_products('trending', 96, 0, null, null, vendors)) t;
  reset role;
  return r;
end $$;

savepoint c;
do $c$
declare f jsonb := pg_temp.reach_fixture(); vendors uuid[]; t text; u text;
begin
  vendors := array[(f ->> 'in')::uuid, (f ->> 'intl')::uuid];
  t := pg_temp.trending_ids((f ->> 'trade')::uuid, vendors);
  u := pg_temp.trending_ids((f ->> 'plain')::uuid, vendors);
  perform pg_temp.ok('untyped buyer: newer Indian listing first (no lift)', split_part(u, ',', 1) = f ->> 'p_in', u);
  perform pg_temp.ok('Exporter buyer: the international listing rises on trending', split_part(t, ',', 1) = f ->> 'p_intl', t);
  update public.subscription_plans set limits = limits where id = 'basic';
  update public.vendor_profiles set plan_id = 'basic', plan_expires_at = now() + interval '30 days' where id = (f ->> 'in')::uuid;
  t := pg_temp.trending_ids((f ->> 'trade')::uuid, vendors);
  perform pg_temp.ok('the lift never puts a listing above a higher paid tier', split_part(t, ',', 1) = f ->> 'p_in', t);
exception when others then perform pg_temp.ok('trending lift', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare f jsonb := pg_temp.reach_fixture(); st double precision; su double precision; first_t text; first_u text;
        pt double precision; pu double precision;
begin
  perform pg_temp.claims((f ->> 'trade')::uuid);
  set local role authenticated;
  select score into st from public.search_products('zylophane', 200) where id = (f ->> 'p_intl')::uuid;
  select score into pt from public.search_products('zylophane', 200) where id = (f ->> 'p_unapp')::uuid;
  select id::text into first_t from public.search_products('zylophane', 200) limit 1;
  reset role;
  perform pg_temp.claims((f ->> 'plain')::uuid);
  set local role authenticated;
  select score into su from public.search_products('zylophane', 200) where id = (f ->> 'p_intl')::uuid;
  select score into pu from public.search_products('zylophane', 200) where id = (f ->> 'p_unapp')::uuid;
  select id::text into first_u from public.search_products('zylophane', 200) limit 1;
  reset role;
  perform pg_temp.ok('search: Exporter buyer''s score for an international listing is the untyped score × 1.10',
    abs(st / su - 1.10) < 1e-9, coalesce((st / su)::text, 'null'));
  perform pg_temp.ok('search: a pending (unapproved) overseas seller gets no lift',
    pt is not null and pt = pu, coalesce(pt::text, 'null') || ' vs ' || coalesce(pu::text, 'null'));
exception when others then perform pg_temp.ok('search lift', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

savepoint c;
do $c$
declare f jsonb := pg_temp.reach_fixture(); ids text; cc text; n int;
begin
  perform pg_temp.claims(null);
  set local role anon;
  select string_agg(id::text, ','), count(*) into ids, n
    from public.feed_products(p_sort => 'newest', p_limit => 96, p_supplier => 'international') where id in
      ((f ->> 'p_in')::uuid, (f ->> 'p_intl')::uuid, (f ->> 'p_unapp')::uuid);
  select vendor_country_code into cc from public.feed_products(p_sort => 'newest', p_limit => 96, p_ids => array[(f ->> 'p_intl')::uuid]);
  reset role;
  perform pg_temp.ok('p_supplier international lists only approved overseas sellers', ids = f ->> 'p_intl', coalesce(ids, 'none'));
  perform pg_temp.ok('feed_products row carries vendor_country_code', cc = 'AE', coalesce(cc, 'null'));
  set local role anon;
  select count(*) into n from public.feed_products(p_sort => 'newest', p_limit => 5);
  reset role;
  perform pg_temp.ok('the old named call (no p_supplier) still works', n >= 0, n::text);
exception when others then perform pg_temp.ok('supplier filter', false, sqlstate || ' ' || sqlerrm);
end $c$;
rollback to savepoint c;

rollback;
