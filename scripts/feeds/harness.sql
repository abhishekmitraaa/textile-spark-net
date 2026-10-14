-- ─────────────────────────────────────────────────────────────
-- HARNESS for the buyer feeds (2026-10-14; migration 20261014120000_feed_products.sql).
-- 100,000 synthetic live listings from 1,000 sellers (50 on Gold), read as a signed-out visitor.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/feeds/harness.sql
-- It never commits: the block ends by raising, which rolls everything back.
-- ─────────────────────────────────────────────────────────────
begin;
set local session_replication_role = replica;  -- the synthetic rows skip the embedding queue and caps
with v as (select id from public.vendor_profiles order by id limit 1000)
insert into public.products (id, vendor_id, name, status, price_value, compare_at_price, gender, created_at,
                             enquiries_count, sold_count, rating_avg)
select gen_random_uuid(), v.id, 'feedh ' || g, 'live', 100 + g, case when g % 5 = 0 then 200 + g end,
       (array['Men', 'Women', 'Kids', 'Unisex'])[1 + g % 4], now() - (random() * interval '90 days'),
       (random() * 50)::int, (random() * 20)::int, round((random() * 5)::numeric, 1)
  from v, generate_series(1, 100) g;
insert into public.products (vendor_id, name, status, price_value, created_at)
select (select id from public.vendor_profiles order by id limit 1), 'feedh hidden draft', 'under_review', 1, now();
update public.vendor_profiles set plan_id = 'gold', plan_expires_at = now() + interval '30 days'
 where id in (select id from public.vendor_profiles order by id limit 50);
update public.vendor_profiles set plan_id = 'gold', plan_expires_at = now() - interval '1 day'
 where id in (select id from public.vendor_profiles order by id offset 50 limit 10);
analyze public.products;
set local session_replication_role = origin;
set local role anon;

create temp table _r (i serial, label text, want text, got text);

do $h$
declare
  got text; t0 timestamptz; ms numeric;
begin
  -- Order
  select (bool_and(ok))::text into got from (
    select boost >= coalesce(lead(boost) over w, boost) and
           (boost > coalesce(lead(boost) over w, -1) or created_at >= coalesce(lead(created_at) over w, created_at)) as ok
      from public.feed_products('newest', 48) window w as (order by null)) s;
  insert into _r (label, want, got) values ('newest: paid tier first, then newest', 'true', got);
  select string_agg(distinct boost::text, ',') into got from public.feed_products('newest', 24);
  insert into _r (label, want, got) values ('newest: the first page is the highest paid tier there is',
    (select max(boost)::text from public.feed_products('newest', 48)), got);
  select (bool_and(ok))::text into got from (
    select (boost, sold_count + enquiries_count) >= (coalesce(lead(boost) over w, boost),
                                                     coalesce(lead(sold_count + enquiries_count) over w, 0)) as ok
      from public.feed_products('trending', 48) window w as (order by null)) s;
  insert into _r (label, want, got) values ('trending: paid tier, then sold + enquiries', 'true', got);
  select (bool_and(ok))::text into got from (
    select price_value <= coalesce(lead(price_value) over w, price_value) as ok
      from public.feed_products('price_asc', 48) window w as (order by null)) s;
  insert into _r (label, want, got) values ('price_asc: cheapest first', 'true', got);
  select (bool_and(compare_at_price > price_value))::text || '|' || count(*) into got from public.feed_products('discount', 48);
  insert into _r (label, want, got) values ('discount: only listings on sale', 'true|48', got);
  select (bool_and(ok))::text into got from (
    select (compare_at_price - price_value) / compare_at_price
             >= coalesce(lead((compare_at_price - price_value) / compare_at_price) over w, 0) as ok
      from public.feed_products('discount', 48) window w as (order by null)) s;
  insert into _r (label, want, got) values ('discount: deepest cut first', 'true', got);
  select (count(*) > 0 and bool_and(round((compare_at_price - price_value) / compare_at_price * 100) > 25
                                    and round((compare_at_price - price_value) / compare_at_price * 100) <= 50))::text into got
    from public.feed_products('discount', 48, 0, null, null, null, true, null, null, 25, 50);
  insert into _r (label, want, got) values ('discount tier 25–50%', 'true', got);

  -- An expired plan earns no boost
  select count(*)::text into got from public.feed_products('newest', 48, 0,
    null, null, array(select id from public.vendor_profiles order by id offset 50 limit 10)) where boost > 0;
  insert into _r (label, want, got) values ('an expired plan gives no boost', '0', got);

  -- Filters
  select string_agg(distinct gender, ',') into got from public.feed_products('newest', 48, 0, null, 'kids');
  insert into _r (label, want, got) values ('gender filter', 'Kids', got);
  select (bool_and(vendor_id = (select id from public.vendor_profiles order by id offset 3 limit 1)))::text into got
    from public.feed_products('newest', 48, 0, null, null, array(select id from public.vendor_profiles order by id offset 3 limit 1));
  insert into _r (label, want, got) values ('seller filter', 'true', got);
  select count(*)::text into got from public.feed_products('newest', 48, 0, null, null, null, false, '%');
  insert into _r (label, want, got) values ('a "%" in the text is a character, not a wildcard', '0', got);
  select (count(*) > 0 and bool_and(name ilike '%feedh 7%'))::text into got
    from public.feed_products('newest', 48, 0, null, null, null, false, 'feedh 7');
  insert into _r (label, want, got) values ('text filter', 'true', got);
  select count(*)::text into got from public.feed_products('newest', 48, 0, null, null, null, false, 'hidden draft');
  insert into _r (label, want, got) values ('a listing under review never shows', '0', got);

  -- Paging
  select count(*)::text into got from (select id from public.feed_products('newest', 24, 0)
                                       intersect select id from public.feed_products('newest', 24, 24)) x;
  insert into _r (label, want, got) values ('pages 1 and 2 share nothing', '0', got);
  select count(*)::text into got from public.feed_products('newest', 24, 0, null, null, null, false, null,
                                                          array(select id from public.feed_products('newest', 24)));
  insert into _r (label, want, got) values ('excluded ids are left out, the page still full', '24', got);
  select count(*)::text into got from public.feed_products('newest', 200, 0, null, null, null, false, null, null, null, null,
                                                          array(select id from public.products where status = 'live' order by id limit 120));
  insert into _r (label, want, got) values ('only the given ids, up to 200 a page', '120', got);
  select count(*)::text into got from public.feed_products('newest', 500);
  insert into _r (label, want, got) values ('at most 48 a page', '48', got);
  begin
    perform public.feed_products('newest; drop table x', 1); got := 'accepted';
  exception when others then got := sqlstate;
  end;
  insert into _r (label, want, got) values ('an unknown sort is refused', '22023', got);
  begin
    perform public.feed_products('newest', 24, 0, null, null, array(select gen_random_uuid() from generate_series(1, 501)));
    got := 'accepted';
  exception when others then got := sqlstate;
  end;
  insert into _r (label, want, got) values ('more than 500 seller ids refused', '22023', got);

  -- Category counts
  select count(*)::text into got from public.live_category_counts(500);
  insert into _r (label, want, got) values ('category counts: at most 50 rows', (select least(50, count(distinct category_id))::text from public.products where status = 'live' and category_id is not null), got);

  -- Speed (100,000 live listings)
  perform * from public.feed_products('newest', 24, 0);  -- the first call also plans; time the next
  t0 := clock_timestamp(); perform * from public.feed_products('newest', 24, 0);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into _r (label, want, got) values ('newest, first page, under 150 ms', 'true', (ms < 150)::text || ' (' || round(ms) || ' ms)');
  t0 := clock_timestamp(); perform * from public.feed_products('newest', 24, 960);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into _r (label, want, got) values ('newest, page 41, under 150 ms', 'true', (ms < 150)::text || ' (' || round(ms) || ' ms)');
  t0 := clock_timestamp(); perform * from public.feed_products('trending', 24, 0, null, 'women');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into _r (label, want, got) values ('trending + gender, under 150 ms', 'true', (ms < 150)::text || ' (' || round(ms) || ' ms)');
  t0 := clock_timestamp(); perform * from public.live_category_counts(8);
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  insert into _r (label, want, got) values ('category counts, under 150 ms', 'true', (ms < 150)::text || ' (' || round(ms) || ' ms)');
end
$h$;

select format('%s %s | want %s | got %s', case when want = split_part(got, ' (', 1) then 'PASS' else 'FAIL' end, label, want, got)
  from _r order by i;
select format('TALLY: %s of %s passed (rolled back)', count(*) filter (where want = split_part(got, ' (', 1)), count(*)) from _r;
rollback;
