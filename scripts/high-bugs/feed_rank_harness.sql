-- ─────────────────────────────────────────────────────────────
-- HARNESS for 20261118160000_feed_rank.sql (buyer review H-11, 2026-11-18).
-- Proves the new feed_products() returns the same ids in the same order as the body it replaces, for every sort and
-- filter, keeps admin.feed_rank in step through its triggers, and times both.
-- HOW TO RUN (from the repo root):
--   (sed -n '1,/^-- HARNESS-SPLIT/p' scripts/high-bugs/feed_rank_harness.sql;
--    sed -e '/^begin;$/d' -e '/^commit;$/d' supabase/migrations/20261118160000_feed_rank.sql;
--    sed -n '/^-- HARNESS-SPLIT/,$p' scripts/high-bugs/feed_rank_harness.sql) \
--   | docker exec -i supabase_db_localstack psql -U postgres -At
-- It never commits: the last block raises with the report, which rolls everything back.
-- ─────────────────────────────────────────────────────────────
begin;
set local session_replication_role = replica;  -- synthetic rows skip the embedding queue, caps and triggers
with v as (select id from public.vendor_profiles order by id limit 1000)
insert into public.products (id, vendor_id, name, status, price_value, compare_at_price, gender, created_at,
                             enquiries_count, sold_count, rating_avg, category_id)
select gen_random_uuid(), v.id, 'feedh ' || g, 'live', 100 + g, case when g % 5 = 0 then 200 + g end,
       (array['Men', 'Women', 'Kids', 'Unisex'])[1 + g % 4], now() - (random() * interval '90 days'),
       (random() * 50)::int, (random() * 20)::int,
       case when g % 7 = 0 then 0 else round((random() * 5)::numeric, 1) end,  -- rating_avg is NOT NULL; 0 = no reviews
       case when g % 3 = 0 then (select id from public.categories order by id limit 1)
            when g % 3 = 1 then (select id from public.categories order by id offset 1 limit 1) end
  from v, generate_series(1, 100) g;
insert into public.products (vendor_id, name, status, price_value, created_at)
select (select id from public.vendor_profiles order by id limit 1), 'feedh hidden draft', 'under_review', 1, now();
insert into public.product_trend (product_id, log2_score)
select id, public.demand_log_of(1 + random() * 100, now() - random() * interval '30 days')
  from public.products where name like 'feedh %' and status = 'live' and random() < 0.8
on conflict (product_id) do nothing;
update public.vendor_profiles set plan_id = 'gold', plan_expires_at = now() + interval '30 days'
 where id in (select id from public.vendor_profiles order by id limit 50);
update public.vendor_profiles set plan_id = 'gold', plan_expires_at = now() - interval '1 day'
 where id in (select id from public.vendor_profiles order by id offset 50 limit 10);
update public.vendor_profiles set onboarding_complete = true, country_code = 'AE'
 where id in (select id from public.vendor_profiles order by id offset 60 limit 5);
analyze public.products; analyze public.product_trend; analyze public.vendor_profiles;
set local session_replication_role = origin;

-- Keep today's body as feed_products_old, to compare against.
do $copy$
begin
  execute replace(pg_get_functiondef(p.oid), 'FUNCTION public.feed_products(', 'FUNCTION public.feed_products_old(')
     from pg_proc p where p.proname = 'feed_products' and p.pronamespace = 'public'::regnamespace;
end
$copy$;
-- HARNESS-SPLIT (the migration's statements are inserted above this line by the run command)

create temp table _r (i serial, label text, want text, got text);
grant all on _r to anon;
grant usage on sequence _r_i_seq to anon;

-- Trigger checks, as postgres (moderation is a server path).
do $trg$
declare
  v_pid uuid; v_vid uuid; v_before integer; v_after integer;
begin
  select id, vendor_id into v_pid, v_vid from public.products where name = 'feedh 1' and status = 'live' limit 1;
  update public.products set status = 'under_review' where id = v_pid;
  insert into _r (label, want, got) values ('a listing leaving live leaves feed_rank at once', '0',
    (select count(*)::text from admin.feed_rank where product_id = v_pid));
  update public.products set status = 'live' where id = v_pid;
  insert into _r (label, want, got) values ('a listing going live enters feed_rank at once', '1',
    (select count(*)::text from admin.feed_rank where product_id = v_pid));
  select k_boost into v_before from admin.feed_rank where product_id = v_pid;
  update public.vendor_profiles set plan_id = 'gold', plan_expires_at = now() + interval '30 days' where id = v_vid;
  select k_boost into v_after from admin.feed_rank where product_id = v_pid;
  insert into _r (label, want, got) values ('a seller''s new plan re-keys their listings at once',
    (select coalesce((limits ->> 'search_boost_tier')::integer, 0)::text from public.subscription_plans where id = 'gold'),
    v_after::text);
  insert into _r (label, want, got) values ('every live listing is ranked', '0',
    (select count(*)::text from public.products p where p.status = 'live'
        and not exists (select 1 from admin.feed_rank fr where fr.product_id = p.id)));
end
$trg$;

-- What the every-minute job costs: a refresh with nothing changed, and one after demand moved on 10% of listings.
do $job$
declare t0 timestamptz; n integer;
begin
  t0 := clock_timestamp();
  n := admin.feed_rank_refresh();
  insert into _r (label, want, got) values ('job: refresh with nothing changed (rows written, ms)', 'faster',
    n || ' rows, ' || round(extract(epoch from clock_timestamp() - t0) * 1000) || ' ms');
  update public.product_trend set log2_score = log2_score + 0.5 where random() < 0.1;
  t0 := clock_timestamp();
  n := admin.feed_rank_refresh();
  insert into _r (label, want, got) values ('job: refresh after 10% of demand moved (rows written, ms)', 'faster',
    n || ' rows, ' || round(extract(epoch from clock_timestamp() - t0) * 1000) || ' ms');
end
$job$;

set local role anon;

do $h$
declare
  cat1 uuid := (select id from public.categories order by id limit 1);
  vids uuid[] := array(select id from public.vendor_profiles order by id limit 5);
  ids  uuid[] := array(select id from public.products where name like 'feedh %' and status = 'live' order by name limit 60);
  ex   uuid[] := array(select id from public.products where name like 'feedh %' and status = 'live' order by name limit 10);
  s text; same boolean; n_old integer; t0 timestamptz; ms_old numeric; ms_new numeric; i integer;
begin
  foreach s in array array['newest', 'trending', 'discount', 'price_asc', 'price_desc', 'rating'] loop
    -- plain, a second page, the largest page
    same := array(select id from public.feed_products(s, 24)) = array(select id from public.feed_products_old(s, 24));
    insert into _r (label, want, got) values (s || ': first page identical', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 48)) = array(select id from public.feed_products_old(s, 48, 48));
    insert into _r (label, want, got) values (s || ': offset 48 identical', 'true', same::text);
    same := array(select id from public.feed_products(s, 96, 900)) = array(select id from public.feed_products_old(s, 96, 900));
    insert into _r (label, want, got) values (s || ': deep page identical', 'true', same::text);
    -- each filter
    same := array(select id from public.feed_products(s, 48, 0, array[cat1])) = array(select id from public.feed_products_old(s, 48, 0, array[cat1]));
    insert into _r (label, want, got) values (s || ': category', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, 'Women')) = array(select id from public.feed_products_old(s, 48, 0, null, 'Women'));
    insert into _r (label, want, got) values (s || ': gender', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, vids)) = array(select id from public.feed_products_old(s, 48, 0, null, null, vids));
    insert into _r (label, want, got) values (s || ': sellers', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, null, true)) = array(select id from public.feed_products_old(s, 48, 0, null, null, null, true));
    insert into _r (label, want, got) values (s || ': on sale', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, null, false, 'feedh 1')) = array(select id from public.feed_products_old(s, 48, 0, null, null, null, false, 'feedh 1'));
    insert into _r (label, want, got) values (s || ': text', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, null, false, null, ex)) = array(select id from public.feed_products_old(s, 48, 0, null, null, null, false, null, ex));
    insert into _r (label, want, got) values (s || ': excluded ids', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, null, false, null, null, 20)) = array(select id from public.feed_products_old(s, 48, 0, null, null, null, false, null, null, 20));
    insert into _r (label, want, got) values (s || ': discount above 20', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, null, false, null, null, null, 40)) = array(select id from public.feed_products_old(s, 48, 0, null, null, null, false, null, null, null, 40));
    insert into _r (label, want, got) values (s || ': discount up to 40', 'true', same::text);
    same := array(select id from public.feed_products(s, 200, 0, null, null, null, false, null, null, null, null, ids)) = array(select id from public.feed_products_old(s, 200, 0, null, null, null, false, null, null, null, null, ids));
    insert into _r (label, want, got) values (s || ': fixed ids', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, null, null, null, false, null, null, null, null, null, 'international')) = array(select id from public.feed_products_old(s, 48, 0, null, null, null, false, null, null, null, null, null, 'international'));
    insert into _r (label, want, got) values (s || ': international sellers', 'true', same::text);
    same := array(select id from public.feed_products(s, 48, 0, array[cat1], 'Women', null, true, null, null, null, null, null, 'india')) = array(select id from public.feed_products_old(s, 48, 0, array[cat1], 'Women', null, true, null, null, null, null, null, 'india'));
    insert into _r (label, want, got) values (s || ': filters combined', 'true', same::text);
  end loop;

  -- every column of a card, not just the ids
  same := (select array_agg(t::text) from public.feed_products('newest', 24) t) = (select array_agg(t::text) from public.feed_products_old('newest', 24) t);
  insert into _r (label, want, got) values ('newest: whole rows identical', 'true', same::text);
  same := (select array_agg(t::text) from public.feed_products('trending', 24) t) = (select array_agg(t::text) from public.feed_products_old('trending', 24) t);
  insert into _r (label, want, got) values ('trending: whole rows identical', 'true', same::text);
  select count(*) into n_old from public.feed_products('newest', 96) where id not in (select id from public.products where status = 'live');
  insert into _r (label, want, got) values ('only live listings', '0', n_old::text);

  -- Timing: 20 calls each, first page.
  foreach s in array array['newest', 'trending'] loop
    t0 := clock_timestamp();
    for i in 1..20 loop perform count(*) from public.feed_products_old(s, 24); end loop;
    ms_old := round(extract(epoch from clock_timestamp() - t0) * 1000 / 20, 1);
    t0 := clock_timestamp();
    for i in 1..20 loop perform count(*) from public.feed_products(s, 24); end loop;
    ms_new := round(extract(epoch from clock_timestamp() - t0) * 1000 / 20, 1);
    insert into _r (label, want, got) values (s || ': ms per call old → new (' ||
      (select count(*) from public.products where status = 'live') || ' live)', 'faster', ms_old || ' → ' || ms_new);
  end loop;
end
$h$;

reset role;
do $report$
declare r text;
begin
  select string_agg(format('%s %s | want %s | got %s', case when want = got or want = 'faster' then 'PASS' else 'FAIL' end,
                           label, want, got), E'\n' order by i) into r from _r;
  raise exception E'feed_rank harness (rolled back)\n%', r;
end
$report$;
