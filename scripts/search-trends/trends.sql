-- Trending searches harness (migration 20261018120000_search_trends.sql).
--
-- Run on the LOCAL stack, never production:
--   docker exec -i supabase_db_localstack psql -U postgres -v ON_ERROR_STOP=1 -q < scripts/search-trends/trends.sql
-- Everything happens in one transaction that is rolled back at the end. Dates are in 2030, so no real
-- local event falls inside a window. Each case raises "FAIL <n>: …" or prints "ok <n>".
--
-- Fixtures (local stack, scripts/local-stack): demo buyer/vendor 1111…/2222…, super admin 3333…,
-- support b71bf451…, manager bae52e9d…, product 0ea791f9… in category "Shirt".

begin;

create function pg_temp.ok(n text, cond boolean, msg text) returns void language plpgsql as $f$
begin
  if cond is distinct from true then raise exception 'FAIL %: %', n, msg; end if;
  raise notice 'ok %  %', n, msg;
end $f$;

-- One search by one visitor at an India time. v: a profile id (signed in) or a session id (guest).
create function pg_temp.search(q text, v text, at_ist timestamp, kind text default 'search_impression',
                               product uuid default null) returns void language sql as $f$
  insert into public.engagement_events (event_type, vendor_id, product_id, viewer_id, session_id, source, query_text, created_at)
  values (kind, '22222222-2222-2222-2222-222222222222', product,
          case when v ~ '^[0-9a-f-]{36}$' then v::uuid end,
          case when v ~ '^[0-9a-f-]{36}$' then null else v end,
          'organic_search', q, at_ist at time zone 'Asia/Kolkata')
$f$;

create function pg_temp.terms() returns text[] language sql as $f$
  select coalesce(array_agg(i.label order by i.rank), '{}') from admin.search_trend_items i
   where i.run_id = (select max(id) from admin.search_trend_runs) and i.kind = 'term'
$f$;
create function pg_temp.cats() returns text[] language sql as $f$
  select coalesce(array_agg(i.label order by i.rank), '{}') from admin.search_trend_items i
   where i.run_id = (select max(id) from admin.search_trend_runs) and i.kind = 'category'
$f$;
create function pg_temp.win() returns text language sql as $f$
  select trend_window from admin.search_trend_runs order by id desc limit 1
$f$;

-- "Now" for every computation: 15 June 2030, 09:00 India time. Yesterday is 14 June.
create function pg_temp.refresh() returns bigint language sql as $f$
  select admin.search_trends_refresh('manual', timestamp '2030-06-15 09:00' at time zone 'Asia/Kolkata')
$f$;

-- ── A. One term from 3 visitors yesterday; four more earlier in the week ─────
select pg_temp.search('Linen  Shirt ', 's:a1', '2030-06-14 10:00');
select pg_temp.search('linen shirt', 's:a2', '2030-06-14 11:00');
select pg_temp.search('linen shirt', '11111111-1111-1111-1111-111111111111', '2030-06-14 12:00');
-- 2 visitors only: below the floor.
select pg_temp.search('silk saree', 's:b1', '2030-06-14 10:00');
select pg_temp.search('silk saree', 's:b2', '2030-06-14 10:05');
select pg_temp.search('silk saree', 's:b2', '2030-06-14 10:06'); -- same visitor twice still counts once
-- 2 visitors and a staff member: staff don't count.
select pg_temp.search('staff term', 's:c1', '2030-06-14 10:00');
select pg_temp.search('staff term', 's:c2', '2030-06-14 10:00');
select pg_temp.search('staff term', '33333333-3333-3333-3333-333333333333', '2030-06-14 10:00');
-- Never published, whatever the count: a phone number, an email, a link.
select pg_temp.search(q, v, '2030-06-14 10:00')
  from unnest(array['call 9876543210', 'me@example.com', 'www.shop.in', 'see https://x.co']) q,
       unnest(array['s:d1', 's:d2', 's:d3']) v;
-- Too long (41 characters).
select pg_temp.search(repeat('a', 41), v, '2030-06-14 10:00') from unnest(array['s:e1', 's:e2', 's:e3']) v;
-- India midnight: 00:01 on the 14th counts for the 14th; 00:01 on the 15th is today and doesn't.
select pg_temp.search('denim jacket', v, '2030-06-14 00:01') from unnest(array['s:f1', 's:f2', 's:f3']) v;
select pg_temp.search('cargo pants', v, '2030-06-15 00:01') from unnest(array['s:g1', 's:g2', 's:g3']) v;
-- Earlier in the week (10 June), three terms with 3 visitors each.
select pg_temp.search(q, v, '2030-06-10 15:00')
  from unnest(array['cotton kurta', 'polo t-shirt', 'hoodie']) q, unnest(array['s:h1', 's:h2', 's:h3']) v;

select pg_temp.refresh();
select pg_temp.ok('A1', pg_temp.win() = 'week', 'yesterday has 2 terms, so the list widens to the week (got ' || pg_temp.win() || ')');
select pg_temp.ok('A2', 'linen shirt' = any (pg_temp.terms()), 'a term from 3 visitors is listed, spaces and case folded');
select pg_temp.ok('A3', not ('silk saree' = any (pg_temp.terms())), 'a term from 2 visitors is not');
select pg_temp.ok('A4', not ('staff term' = any (pg_temp.terms())), 'staff searches don''t count toward the floor');
select pg_temp.ok('A5', not exists (select 1 from unnest(pg_temp.terms()) t where t ~ '[0-9]{5}|@|www|https'),
                  'no phone number, email or link is published');
select pg_temp.ok('A6', not exists (select 1 from unnest(pg_temp.terms()) t where char_length(t) > 40), 'no term over 40 characters');
select pg_temp.ok('A7', 'denim jacket' = any (pg_temp.terms()), '00:01 India time belongs to that India day');
select pg_temp.ok('A8', not ('cargo pants' = any (pg_temp.terms())), 'today''s searches wait for tomorrow''s list');
select pg_temp.ok('A9', pg_temp.terms() = array['cotton kurta', 'denim jacket', 'hoodie', 'linen shirt', 'polo t-shirt'],
                  'equal visitors and visitor-days fall back to the name: ' || array_to_string(pg_temp.terms(), ', '));

-- ── B. Five terms yesterday: the list is yesterday's ─────────────────────────
select pg_temp.search(q, v, '2030-06-14 18:00')
  from unnest(array['cotton kurta', 'polo t-shirt', 'hoodie']) q, unnest(array['s:i1', 's:i2', 's:i3']) v;
select pg_temp.refresh();
select pg_temp.ok('B1', pg_temp.win() = 'day', 'five qualifying terms yesterday keep the list to yesterday (got ' || pg_temp.win() || ')');
select pg_temp.ok('B2', (select ist_day from admin.search_trend_runs order by id desc limit 1) = date '2030-06-14', 'the list is dated yesterday');
select pg_temp.ok('B3', cardinality(pg_temp.terms()) = 5, 'five terms');

-- ── C. Nothing yesterday or in the week: the month, with whatever it has ─────
create function pg_temp.refresh_later() returns bigint language sql as $f$
  select admin.search_trends_refresh('manual', timestamp '2030-07-05 09:00' at time zone 'Asia/Kolkata')
$f$;
select pg_temp.refresh_later();
select pg_temp.ok('C1', pg_temp.win() = 'month', 'a thin week widens to the month');
select pg_temp.ok('C2', pg_temp.terms() = array['cotton kurta', 'hoodie', 'polo t-shirt', 'cargo pants', 'denim jacket', 'linen shirt'],
                  'the month ranks the June terms by visitors (6 before 3): ' || array_to_string(pg_temp.terms(), ', '));
select pg_temp.refresh();

-- ── D. Categories: a clicked result's category, or its name searched ─────────
select pg_temp.search('shirt', 's:j1', '2030-06-14 09:00', 'search_click', '0ea791f9-644d-4c72-aa94-edf803d1abda');
select pg_temp.search('shirts', 's:j2', '2030-06-14 09:00');
select pg_temp.refresh();
select pg_temp.ok('D1', 'Shirt' = any (pg_temp.cats()), 'a category from one visitor is listed: Cosora''s own word, no floor');
select pg_temp.ok('D2', (select i.visitors from admin.search_trend_items i where i.run_id = (select max(id) from admin.search_trend_runs)
                          and i.kind = 'category' and i.label = 'Shirt') = 2, 'a click and a plural name search both count');
select pg_temp.ok('D3', not ('shirt' = any (pg_temp.terms())), 'one click is not a trending term');

-- ── E. Running twice gives the same list ─────────────────────────────────────
create temp table e_before as select pg_temp.terms() t, pg_temp.cats() c, pg_temp.win() w;
select pg_temp.refresh();
select pg_temp.ok('E1', (select t = pg_temp.terms() and c = pg_temp.cats() and w = pg_temp.win() from e_before), 'a second run publishes the same list');

-- ── F. Who reads what ────────────────────────────────────────────────────────
create function pg_temp.as_user(uid text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', uid, true);
$f$;
create function pg_temp.as_anon() returns void language sql as $f$
  select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
$f$;

update public.feature_flags set enabled = false, allow_profile_ids = '{}' where key = 'search_trending';
select pg_temp.as_anon();
set local role anon;
select pg_temp.ok('F1', (select (r ->> 'shown')::boolean = false and jsonb_array_length(r -> 'terms') = 0
                           from public.trending_searches() r), 'switch off: a visitor gets no terms');
do $$ begin
  perform 1 from admin.search_trend_items limit 1;
  raise exception 'FAIL F2: anon read admin.search_trend_items';
exception when insufficient_privilege then raise notice 'ok F2  anon can''t read the counts';
end $$;
reset role;

update public.feature_flags set allow_profile_ids = array['11111111-1111-1111-1111-111111111111']::uuid[] where key = 'search_trending';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
set local role authenticated;
select pg_temp.ok('F3', (select (r ->> 'shown')::boolean and not (r ->> 'public')::boolean and jsonb_array_length(r -> 'terms') = 5
                           and r ->> 'window' = 'day' and not (r -> 'terms' -> 0 ? 'visitors')
                           from public.trending_searches() r), 'a listed account sees five terms, words only, not public');
do $$ begin
  perform public.admin_search_trends();
  raise exception 'FAIL F4: a buyer read the admin list';
exception when insufficient_privilege then raise notice 'ok F4  a buyer can''t read the admin list';
end $$;
reset role;
select pg_temp.as_anon();
set local role anon;
select pg_temp.ok('F5', (select jsonb_array_length(r -> 'terms') = 0 from public.trending_searches() r), 'a visitor still sees nothing');
reset role;

update public.feature_flags set enabled = true where key = 'search_trending';
select pg_temp.as_anon();
set local role anon;
select pg_temp.ok('F6', (select (r ->> 'public')::boolean and jsonb_array_length(r -> 'terms') = 5 from public.trending_searches() r),
                  'switch on for everyone: visitors see the list and it is public');
reset role;

-- ── G. Hide and unhide ───────────────────────────────────────────────────────
select pg_temp.as_user('bae52e9d-7390-4e58-a92c-5756553c2c8e'); -- manager
set local role authenticated;
select pg_temp.ok('G1', jsonb_array_length(public.admin_search_trends() -> 'terms') = 5, 'a manager reads the list with counts');
do $$ begin
  perform public.admin_search_trend_hide('hoodie', 'testing a manager');
  raise exception 'FAIL G2: a manager hid a term';
exception when insufficient_privilege then raise notice 'ok G2  a manager can''t hide';
end $$;
reset role;

select pg_temp.as_user('b71bf451-a5f9-4ab5-8196-f9ff3bb2122e'); -- support
set local role authenticated;
do $$ begin
  perform public.admin_search_trend_hide('hoodie', 'x');
  raise exception 'FAIL G3: a hide without a reason was accepted';
exception when invalid_parameter_value then raise notice 'ok G3  a hide needs a reason';
end $$;
select public.admin_search_trend_hide('  HOODIE ', 'Not a garment we list (harness)');
reset role;
select pg_temp.refresh();
select pg_temp.ok('G4', not ('hoodie' = any (pg_temp.terms())), 'a hidden term leaves the list, whatever its case and spaces');
select pg_temp.ok('G5', exists (select 1 from admin.audit_log l where l.reason like 'Trending search hidden:%'),
                  'the hide is in the Admin Log with its reason');
select pg_temp.as_user('b71bf451-a5f9-4ab5-8196-f9ff3bb2122e');
set local role authenticated;
select public.admin_search_trend_unhide('hoodie', 'Harness: shown again');
do $$ begin
  perform public.admin_search_trend_unhide('hoodie', 'second time');
  raise exception 'FAIL G6: unhiding a term that isn''t hidden passed';
exception when no_data_found then raise notice 'ok G6  only a hidden term can be unhidden';
end $$;
reset role;
select pg_temp.refresh();
select pg_temp.ok('G7', 'hoodie' = any (pg_temp.terms()), 'unhidden, it is back');
select pg_temp.ok('G8', (select not hidden from admin.search_trend_hidden where term_norm = 'hoodie'), 'the row is kept as history');

-- ── H. A new run queues the site-config rebuild ──────────────────────────────
select pg_temp.ok('H1', exists (select 1 from pg_trigger where tgname = 'trg_search_trend_runs_snapshot' and tgenabled <> 'D'),
                  'the snapshot trigger is on the runs table');

rollback;
\echo 'search trends harness: all cases passed (rolled back)'
