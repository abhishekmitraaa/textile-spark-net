-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 12: Live Activity (Phase 8, 2026-09-28).
-- Each case runs in its own rolled-back subtransaction. The fixture events exist
-- only inside the case that plants them.
--
--   who may read      all 7 admin roles -> ok; an inactive admin, a buyer -> 42501;
--                     anon -> 42501 (no EXECUTE)
--   fixtures          12 events in the last hour and 1 three hours ago move the
--                     counts by exactly their share:
--                       active now +4 visitors (1 signed in, 3 guests);
--                       the hour +5 visitors, +12 events; the day +6 visitors;
--                       product_view +5, search_impression +5, cta_click +1,
--                       ad_impression +1; the product +5 views from +5 visitors;
--                       the vendor +6 actions (impressions left out)
--   search floor      '  H12   Denim ' from 3 visitors shows as 'h12 denim' (3);
--                     'h12 private' from 2 visitors doesn't show
--   window            1 -> 5, 100000 -> 1440, null and no argument -> 60;
--                     60 minute buckets, ascending, the last one this minute
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h12$
declare
  pr      uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer   uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  quiet   uuid := '948b930b-eae6-47eb-bcf6-06e1870f58dd';
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  product uuid := '918334d5-d876-42e6-9db3-101fe8d20c87';
  labels text[] := array[
    'super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager',
    'inactive admin', 'buyer', 'anon', 'fixtures move the counts', 'search floor', 'window'];
  roles text[] := array['super_admin', 'vendor_ops', 'product_moderator', 'support', 'finance_admin', 'ads_moderator', 'manager'];
  i int; t text; tag text;
  j0 jsonb; j1 jsonb; d0 jsonb; d1 jsonb;
  pv0 int; pvis0 int; va0 int;
  s_a text; s_b text; s_c text; s_d text; s_e text;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, (case when i between 1 and 7 then roles[i] else 'super_admin' end)::public.admin_role_type, i <> 8)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = excluded.is_active;

      if i between 11 and 12 then
        -- The counts before the fixtures exist, as the admin.
        perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', pr::text, true);
        set local role authenticated;
        j0 := public.admin_live_activity(60);
        d0 := public.admin_live_activity(1440);
        reset role;
        -- The product's and vendor's hour straight from the table: either may be outside
        -- the top 5 before the fixtures.
        select count(*), count(distinct coalesce(e.viewer_id::text, 's:' || e.session_id)) into pv0, pvis0
          from public.engagement_events e
         where e.product_id = product and e.event_type = 'product_view' and e.created_at > now() - interval '60 minutes';
        select count(*) into va0
          from public.engagement_events e
         where e.vendor_id = vendor and e.event_type not in ('ad_impression', 'search_impression')
           and e.created_at > now() - interval '60 minutes';

        tag := 'h12-' || left(md5(random()::text), 8) || '-';
        s_a := tag || 'a'; s_b := tag || 'b'; s_c := tag || 'c'; s_d := tag || 'd'; s_e := tag || 'e';
        insert into public.engagement_events (event_type, vendor_id, product_id, viewer_id, session_id, source, query_text, cta_name, created_at) values
          -- three guests and one signed-in buyer view the product in the last 5 minutes
          ('product_view', vendor, product, null, s_a, 'direct', null, null, now() - interval '1 minute'),
          ('product_view', vendor, product, null, s_b, 'direct', null, null, now() - interval '1 minute'),
          ('product_view', vendor, product, null, s_c, 'direct', null, null, now() - interval '1 minute'),
          ('product_view', vendor, product, quiet, null, 'direct', null, null, now() - interval '2 minutes'),
          ('cta_click',    vendor, product, quiet, null, null, null, 'message', now() - interval '2 minutes'),
          -- the three guests search one thing, typed differently; two of them search another
          ('search_impression', vendor, null, null, s_a, 'organic_search', '  H12   Denim ', null, now() - interval '3 minutes'),
          ('search_impression', vendor, null, null, s_b, 'organic_search', 'h12 denim', null, now() - interval '3 minutes'),
          ('search_impression', vendor, null, null, s_c, 'organic_search', 'H12 DENIM', null, now() - interval '3 minutes'),
          ('search_impression', vendor, null, null, s_a, 'organic_search', 'h12 private', null, now() - interval '3 minutes'),
          ('search_impression', vendor, null, null, s_b, 'organic_search', 'h12 private', null, now() - interval '3 minutes'),
          -- an ad impression: counted as an event, not as a buyer action
          ('ad_impression', vendor, null, null, s_a, 'ad', null, null, now() - interval '1 minute'),
          -- a fifth visitor 10 minutes ago: in the hour, not "now"
          ('product_view', vendor, product, null, s_d, 'direct', null, null, now() - interval '10 minutes'),
          -- a sixth 3 hours ago: in the day, not the hour
          ('product_view', vendor, product, null, s_e, 'direct', null, null, now() - interval '3 hours');
      end if;

      if i = 10 then
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', case when i = 9 then buyer else pr end, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', (case when i = 9 then buyer else pr end)::text, true);
        set local role authenticated;
      end if;

      if i <= 10 then
        j1 := public.admin_live_activity();
        raise exception using errcode = 'P0099', message = format('window %s min, %s minute buckets, keys %s',
          j1 ->> 'window_minutes', jsonb_array_length(j1 -> 'per_minute'),
          (select string_agg(k, ',' order by k) from jsonb_object_keys(j1) k));
      elsif i = 11 then
        j1 := public.admin_live_activity(60);
        d1 := public.admin_live_activity(1440);
        t := format('now +%s visitors (+%s signed in, +%s guests)',
          (j1 -> 'active_now' ->> 'visitors')::int - (j0 -> 'active_now' ->> 'visitors')::int,
          (j1 -> 'active_now' ->> 'signed_in')::int - (j0 -> 'active_now' ->> 'signed_in')::int,
          (j1 -> 'active_now' ->> 'guests')::int - (j0 -> 'active_now' ->> 'guests')::int);
        t := t || format('; hour +%s visitors +%s events, per-minute sum +%s; day +%s visitors',
          (j1 -> 'active_window' ->> 'visitors')::int - (j0 -> 'active_window' ->> 'visitors')::int,
          (j1 -> 'active_window' ->> 'events')::int - (j0 -> 'active_window' ->> 'events')::int,
          (select sum((m ->> 'events')::int) from jsonb_array_elements(j1 -> 'per_minute') m)
            - (select sum((m ->> 'events')::int) from jsonb_array_elements(j0 -> 'per_minute') m),
          (d1 -> 'active_window' ->> 'visitors')::int - (d0 -> 'active_window' ->> 'visitors')::int);
        t := t || format('; product_view +%s, search_impression +%s, cta_click +%s, ad_impression +%s',
          coalesce((j1 -> 'by_type' ->> 'product_view')::int, 0) - coalesce((j0 -> 'by_type' ->> 'product_view')::int, 0),
          coalesce((j1 -> 'by_type' ->> 'search_impression')::int, 0) - coalesce((j0 -> 'by_type' ->> 'search_impression')::int, 0),
          coalesce((j1 -> 'by_type' ->> 'cta_click')::int, 0) - coalesce((j0 -> 'by_type' ->> 'cta_click')::int, 0),
          coalesce((j1 -> 'by_type' ->> 'ad_impression')::int, 0) - coalesce((j0 -> 'by_type' ->> 'ad_impression')::int, 0));
        t := t || format('; product +%s views from +%s visitors (%s); vendor +%s actions',
          coalesce((select (p ->> 'views')::int from jsonb_array_elements(j1 -> 'top_products') p where p ->> 'id' = product::text), 0) - pv0,
          coalesce((select (p ->> 'visitors')::int from jsonb_array_elements(j1 -> 'top_products') p where p ->> 'id' = product::text), 0) - pvis0,
          coalesce((select format('%s by %s', p ->> 'name', p ->> 'vendor') from jsonb_array_elements(j1 -> 'top_products') p
                     where p ->> 'id' = product::text), 'not in the top 5'),
          coalesce((select (v ->> 'actions')::int from jsonb_array_elements(j1 -> 'top_vendors') v where v ->> 'id' = vendor::text), 0) - va0);
        raise exception using errcode = 'P0099', message = t;
      elsif i = 12 then
        j1 := public.admin_live_activity(60);
        raise exception using errcode = 'P0099', message = format('shown: %s; hidden h12 private: %s',
          coalesce((select string_agg(format('%s (%s)', s ->> 'query', s ->> 'visitors'), ', ')
                      from jsonb_array_elements(j1 -> 'top_searches') s where s ->> 'query' like 'h12%'), '-'),
          not exists (select 1 from jsonb_array_elements(j1 -> 'top_searches') s where s ->> 'query' = 'h12 private'));
      elsif i = 13 then
        t := format('1 -> %s, 100000 -> %s, null -> %s, default -> %s',
          public.admin_live_activity(1) ->> 'window_minutes', public.admin_live_activity(100000) ->> 'window_minutes',
          public.admin_live_activity(null) ->> 'window_minutes', public.admin_live_activity() ->> 'window_minutes');
        j1 := public.admin_live_activity();
        t := t || format('; buckets %s, ascending %s, last is this minute %s',
          jsonb_array_length(j1 -> 'per_minute'),
          (select bool_and(a.minute < b.minute)
             from (select (m ->> 'minute')::timestamptz as minute, n from jsonb_array_elements(j1 -> 'per_minute') with ordinality x(m, n)) a
             join (select (m ->> 'minute')::timestamptz as minute, n from jsonb_array_elements(j1 -> 'per_minute') with ordinality x(m, n)) b
               on b.n = a.n + 1),
          ((j1 -> 'per_minute' -> 59 ->> 'minute')::timestamptz = date_trunc('minute', now())));
        raise exception using errcode = 'P0099', message = t;
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 110) || E'\n';
    end;
  end loop;
  raise exception 'H12 (rolled back)%', E'\n' || out;
end
$h12$;
