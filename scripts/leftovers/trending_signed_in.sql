-- Trending terms count signed-in visitors only (20261118100000). Rolled back.
begin;
set local session_replication_role = replica;
do $t$
declare
  b uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  s uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  i int;
  y timestamptz := (((now() at time zone 'Asia/Kolkata')::date - 1)::timestamp + interval '12 hours') at time zone 'Asia/Kolkata';
begin
  for i in 1..3 loop
    insert into auth.users (id, email) values (b[i], 'trend-b' || i || '-' || b[i] || '@cosora.test'), (s[i], 'trend-s' || i || '-' || s[i] || '@cosora.test');
    insert into public.profiles (id) values (b[i]), (s[i]) on conflict do nothing;
    insert into public.vendor_profiles (id, brand_name, onboarding_complete) values (s[i], 'Trend seller ' || i, true);
    -- Three guests (invented sessions), three registered sellers, three buyers.
    insert into public.engagement_events (event_type, vendor_id, query_text, session_id, created_at)
    values ('search_impression', s[1], 'zz guest term', 'trend-guest-' || i, y);
    insert into public.engagement_events (event_type, vendor_id, query_text, viewer_id, created_at)
    values ('search_impression', s[1], 'zz seller term', s[i], y), ('search_impression', s[1], 'zz buyer term', b[i], y);
  end loop;
  if exists (select 1 from admin.search_trend_terms((y at time zone 'Asia/Kolkata')::date, (y at time zone 'Asia/Kolkata')::date) t where t.label = 'zz guest term') then
    raise exception 'FAIL: three guests made a term trend';
  end if;
  if exists (select 1 from admin.search_trend_terms((y at time zone 'Asia/Kolkata')::date, (y at time zone 'Asia/Kolkata')::date) t where t.label = 'zz seller term') then
    raise exception 'FAIL: three sellers made a term trend';
  end if;
  if not exists (select 1 from admin.search_trend_terms((y at time zone 'Asia/Kolkata')::date, (y at time zone 'Asia/Kolkata')::date) t where t.label = 'zz buyer term' and t.visitors = 3) then
    raise exception 'FAIL: three signed-in buyers did not make a term trend';
  end if;
  raise notice 'trending signed-in: 3/3 pass';
end
$t$;
rollback;
