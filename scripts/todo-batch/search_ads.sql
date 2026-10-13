-- ─────────────────────────────────────────────────────────────
-- HARNESS: ads in semantic search. Migration 20261013110000_search_ads_semantic.sql.
-- Fixtures: four live products of the local vendor with hand-made embeddings at a known
-- cosine distance from one cached query (0, 0.3, 0.7, 1), and campaigns on them.
-- Every line prints PASS or FAIL with what it saw; the last line is the tally.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/todo-batch/search_ads.sql
-- It never commits: the block ends by raising, which rolls everything back.
-- ─────────────────────────────────────────────────────────────
-- A 1536-dimension vector that is (x, y, 0, 0, …): its cosine distance from (1, 0, …) is 1 - x
-- when x² + y² = 1.
create or replace function pg_temp.vec(x double precision, y double precision) returns extensions.halfvec
language sql as $f$
  select ('[' || x::text || ',' || y::text || repeat(',0', 1534) || ']')::extensions.halfvec
$f$;

do $h$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  jeans  uuid; shirts uuid;
  q      text := 'harness denim trousers ' || gen_random_uuid()::text;
  p_exact uuid; p_near uuid; p_loose uuid; p_far uuid;
  a_exact uuid; a_near uuid; a_loose uuid; a_far_ctx uuid; a_far_other uuid; a_state uuid; a_paused uuid;
  slot text[] := array['searchListing'];
  mh text; gj text;
  got text; pass int; fail int; line text;
begin
  create temp table _r (i serial, label text, want text, got text) on commit drop;
  select id into jeans  from public.categories where name = 'Jeans' limit 1;
  select id into shirts from public.categories where name = 'Shirt' limit 1;
  select code into mh from public.india_states where name = 'Maharashtra';
  select code into gj from public.india_states where name = 'Gujarat';

  -- Only this harness's campaigns are in the slot.
  update public.advertisements set status = 'paused' where status = 'active';

  insert into public.search_query_embeddings (query_norm, embedding)
    values (public.normalise_search_query(q), pg_temp.vec(1, 0));

  insert into public.products (vendor_id, name, status, category_id) values (vendor, 'H exact', 'live', jeans) returning id into p_exact;
  insert into public.products (vendor_id, name, status, category_id) values (vendor, 'H near', 'live', jeans) returning id into p_near;
  insert into public.products (vendor_id, name, status, category_id) values (vendor, 'H loose', 'live', jeans) returning id into p_loose;
  insert into public.products (vendor_id, name, status, category_id) values (vendor, 'H far', 'live', shirts) returning id into p_far;
  update public.products set status = 'live', embedding = pg_temp.vec(1, 0)                       where id = p_exact;  -- distance 0
  update public.products set status = 'live', embedding = pg_temp.vec(0.7, sqrt(1 - 0.49))        where id = p_near;   -- 0.3
  update public.products set status = 'live', embedding = pg_temp.vec(0.3, sqrt(1 - 0.09))        where id = p_loose;  -- 0.7
  update public.products set status = 'live', embedding = pg_temp.vec(0, 1)                       where id = p_far;    -- 1

  -- Campaigns. "ctx" is the page's category context below (Shirt); Jeans is another category.
  insert into public.advertisements (vendor_id, product_id, title, placement, status, target_categories, created_at)
    values (vendor, p_near, 'H ad near', 'searchListing', 'active', jsonb_build_array(jeans::text), now() - interval '5 hours') returning id into a_near;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, target_categories, created_at)
    values (vendor, p_exact, 'H ad exact', 'searchListing', 'active', jsonb_build_array(jeans::text), now() - interval '6 hours') returning id into a_exact;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, target_categories, created_at)
    values (vendor, p_loose, 'H ad loose', 'searchListing', 'active', jsonb_build_array(jeans::text), now() - interval '4 hours') returning id into a_loose;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, target_categories, created_at)
    values (vendor, p_far, 'H ad far in context', 'searchListing', 'active', jsonb_build_array(shirts::text), now() - interval '3 hours') returning id into a_far_ctx;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, target_categories, created_at)
    values (vendor, p_far, 'H ad far elsewhere', 'searchListing', 'active', jsonb_build_array(jeans::text), now() - interval '2 hours') returning id into a_far_other;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, target_categories, target_states, created_at)
    values (vendor, p_exact, 'H ad Gujarat only', 'searchListing', 'active', jsonb_build_array(jeans::text), array[gj], now() - interval '1 hour') returning id into a_state;
  insert into public.advertisements (vendor_id, product_id, title, placement, status, created_at)
    values (vendor, p_exact, 'H ad paused', 'searchListing', 'paused', now()) returning id into a_paused;
  -- Whatever the insert guards made of them, set the state this harness is about.
  -- cosora.ad_review is what the review functions set: the only way a campaign becomes active.
  perform set_config('cosora.ad_review', 'on', true);
  update public.advertisements set status = 'active' where id in (a_near, a_exact, a_loose, a_far_ctx, a_far_other, a_state);
  update public.advertisements set status = 'paused' where id = a_paused;
  perform set_config('cosora.ad_review', '', true);

  -- 1. Signed out (location unknown), context Shirt: the two near products first, nearest first,
  --    then the campaign that targets the context. The Gujarat-only one is shown too: a viewer
  --    whose state isn't known sees a state-targeted ad.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  select string_agg(s.title || '=' || s.matched_by, ' > ' order by s.n) into got
    from (select t.*, row_number() over () as n from admin.search_ads_ranked(q, 10, slot, array[shirts], admin.search_ads_cutoff()) t) s;
  insert into _r (label, want, got) values ('semantic matches first, nearest first, then the category context',
    'H ad Gujarat only=semantic > H ad exact=semantic > H ad near=semantic > H ad far in context=category', got);

  -- 2. The same search through active_ads(): only the context campaign. That is what changed.
  select coalesce(string_agg(s.title, ' > ' order by s.n), '') into got
    from (select t.*, row_number() over () as n from public.active_ads(10, null, slot, array[shirts]) t) s;
  insert into _r (label, want, got) values ('active_ads() alone serves only the category match', 'H ad far in context', got);

  -- 3. A far product in another category is not served.
  select count(*)::text into got from admin.search_ads_ranked(q, 10, slot, array[shirts], admin.search_ads_cutoff()) t where t.ad_id = a_far_other;
  insert into _r (label, want, got) values ('a far product outside the context is not served', '0', got);

  -- 4. Distance 0.7 is past the paid cutoff of 0.60, and inside it when the caller widens it.
  select count(*) filter (where t.ad_id = a_loose) into got from admin.search_ads_ranked(q, 10, slot, array[shirts], admin.search_ads_cutoff()) t;
  select got || '|' || (select t.matched_by from admin.search_ads_ranked(q, 10, slot, array[shirts], 0.80) t where t.ad_id = a_loose) into got;
  insert into _r (label, want, got) values ('the cutoff decides a loose match', '0|semantic', got);

  -- 5. A search nobody has embedded: exactly active_ads(), in its order.
  select (coalesce((select string_agg(s.ad_id::text, ',' order by s.n) from (select t.ad_id, row_number() over () as n from admin.search_ads_ranked('never searched ' || q, 10, slot, array[shirts], admin.search_ads_cutoff()) t) s), '')
        = coalesce((select string_agg(s.ad_id::text, ',' order by s.n) from (select t.ad_id, row_number() over () as n from public.active_ads(10, null, slot, array[shirts]) t) s), ''))::text
       || '|' || (select string_agg(distinct t.matched_by, ',') from admin.search_ads_ranked('never searched ' || q, 10, slot, array[shirts], admin.search_ads_cutoff()) t)
    into got;
  insert into _r (label, want, got) values ('no query embedding: the same rows and order as active_ads()', 'true|category', got);

  -- 6. No category context at all: semantic first, then every eligible campaign, as active_ads() does.
  select string_agg(s.matched_by, ',' order by s.n) into got
    from (select t.*, row_number() over () as n from admin.search_ads_ranked(q, 10, slot, null, admin.search_ads_cutoff()) t) s;
  insert into _r (label, want, got) values ('no context: semantic first, the rest by the category rule', 'semantic,semantic,semantic,category,category,category', got);

  -- 7. A buyer known to be in Maharashtra never sees the Gujarat-only campaign, however near it is.
  insert into public.buyer_profiles (id, state, state_code) values (buyer, 'Maharashtra', mh)
    on conflict (id) do update set state = excluded.state, state_code = excluded.state_code;
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', buyer::text, true);
  select (select state_code from public.ad_viewer_location()) || '|' || count(*) filter (where t.ad_id = a_state)
         || '|' || count(*) filter (where t.ad_id = a_exact) into got
    from admin.search_ads_ranked(q, 10, slot, array[shirts], admin.search_ads_cutoff()) t;
  insert into _r (label, want, got) values ('semantic matching never widens location targeting', mh || '|0|1', got);

  -- 8. A paused campaign is never served, and the limit holds.
  select count(*) filter (where t.ad_id = a_paused) || '|' || (select count(*) from admin.search_ads_ranked(q, 2, slot, null, admin.search_ads_cutoff())) into got
    from admin.search_ads_ranked(q, 10, slot, null, admin.search_ads_cutoff()) t;
  insert into _r (label, want, got) values ('paused campaigns stay out; max_count is honoured', '0|2', got);

  -- 9. Another slot's ad types never leak into this one.
  select count(*)::text into got from admin.search_ads_ranked(q, 10, array['brandAd'], null, admin.search_ads_cutoff()) t;
  insert into _r (label, want, got) values ('the placement filter still applies', '0', got);

  -- 10. What the app calls: the same campaigns in the same order, with active_ads()'s columns and
  --     nothing else. No cutoff to set, no reason, no distance.
  select ((select string_agg(x.ad_id::text, ',' order by x.n) from (select t.ad_id, row_number() over () as n from public.search_ads(q, 10, slot, array[shirts]) t) x)
        = (select string_agg(r.ad_id::text, ',' order by r.pos) from admin.search_ads_ranked(q, 10, slot, array[shirts], admin.search_ads_cutoff()) r))::text
         || '|' || (pg_get_function_result('public.search_ads(text, integer, text[], uuid[])'::regprocedure)
                    = pg_get_function_result('public.active_ads(integer, uuid, text[], uuid[])'::regprocedure))::text
         || '|' || (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'search_ads')
    into got;
  insert into _r (label, want, got) values ('the public function: same order, active_ads() columns, one signature with no cutoff', 'true|true|1', got);

  -- 11. Signed-out visitors call the public one; no browser role reaches the ranked one.
  select has_function_privilege('anon', 'public.search_ads(text, integer, text[], uuid[])', 'EXECUTE')::text
         || '|' || has_function_privilege('anon', 'admin.search_ads_ranked(text, integer, text[], uuid[], double precision)', 'EXECUTE')::text
         || '|' || has_function_privilege('authenticated', 'admin.search_ads_ranked(text, integer, text[], uuid[], double precision)', 'EXECUTE')::text
    into got;
  insert into _r (label, want, got) values ('anon may call search_ads(); nobody in a browser may call the ranked rule', 'true|false|false', got);

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  begin perform count(*) from admin.search_ads_ranked(q, 10, slot, null, 2.0); got := 'ran';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a signed-out caller who tries the ranked rule with a wide cutoff is refused', '42501', got);
  for line in
    select (case when r.want = r.got then 'PASS ' else 'FAIL ' end) || lpad(r.i::text, 2) || ' ' || r.label
           || (case when r.want = r.got then '' else '  want [' || r.want || '] got [' || coalesce(r.got, 'null') || ']' end)
      from _r r order by r.i
  loop
    raise notice '%', line;
  end loop;
  select count(*) filter (where r.want = r.got), count(*) filter (where r.want is distinct from r.got) into pass, fail from _r r;
  raise exception 'HARNESS DONE: % passed, % failed (rolled back)', pass, fail;
end
$h$;
