-- ─────────────────────────────────────────────────────────────────────────────
-- RANKING HARNESS STANDING (Part 2): how good a seller is to send a buyer to (2026-11-15).
-- documentation/ranking-standing-design-2026-11-15.md.
-- Each case runs in its own rolled-back subtransaction. Every line prints PASS or FAIL.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/ranking/standing.sql
-- Fixtures are written with session_replication_role = replica (the rating and plan guards refuse even postgres).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.n(x double precision) returns text language sql immutable as
$$ select case when x is null then '-' else rtrim(rtrim(round(x::numeric, 3)::text, '0'), '.') end $$;

-- A clean seller: no views, follows, messages, quotes, reviews, checks or recent listings.
create or replace function pg_temp.clean(v uuid) returns void language plpgsql as $$
begin
  delete from public.product_view_daily d using public.products p where p.id = d.product_id and p.vendor_id = v;
  delete from public.follows where vendor_id = v;
  delete from public.messages m using public.conversations c where c.id = m.conversation_id and v in (c.user_a, c.user_b);
  delete from public.quotes where vendor_id = v;
  delete from public.reviews where vendor_id = v;
  delete from public.product_reviews r using public.products p where p.id = r.product_id and p.vendor_id = v;
  update public.vendor_documents set verified = false where vendor_id = v;
  delete from public.vendor_registrations where vendor_id = v;
  delete from admin.fraud_findings where subject_profile_id = v;
  update public.vendor_profiles set onboarding_complete = false, is_verified = false, ad_verified_until = null,
         plan_expires_at = null, profile_score = 0, created_at = now() - interval '400 days' where id = v;
  update public.products set created_at = now() - interval '400 days' where vendor_id = v;
end $$;

do $st$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  labels text[] := array[
    'no data: no interest, no activity, reviews at the platform average, no trust, no profile',
    'interest: unique signed-in people across views, follows and messages, plus repeat visits; own and browser-only views ignored',
    'interest: 200 interested people is the ceiling',
    'reviews: the Bayesian average of seller and listing reviews',
    'activity: three quotes within 4 hours',
    'activity: one quote after 38 hours',
    'trust: registered, then a verified document, then the seal; a paid plan adds nothing',
    'trust: a fraud finding zeroes trust and halves Standing; a withdrawn one doesn''t',
    'a new account''s interest and activity are at least 0.5 for 30 days; a fresh listing on an old account isn''t new',
    'Standing is 0.30 I + 0.25 R + 0.15 A + 0.15 T + 0.15 P',
    'the refresh writes one row per seller; clients can''t read the table or run the refresh',
    'vendor_standing() is rounded to 2 decimals, 0.5 without a row, and closed to visitors',
    'Recommended Premium Brands: paid first, then Standing',
    'seller search suggestions: paid first, then Standing',
    'the requirement match, lead alerts and brand suggestions read Standing, not profile score',
    'a buyer''s quotes in Standing order, for their own requirement only',
    'browser-only viewers add no interest, however many',
    'the two seller lists run as definer and visitors can still call them'];
  wants text[] := array[
    '0|neutral|0|0|0',
    '0.392',
    '1',
    'match',
    '0.702',
    '0.351',
    '0.5|0.75|1|0.5',
    '0|halved|0.5',
    '0.5|0.5|0|0|0|0',
    'sum',
    'rows|42501|42501',
    '0.12|0.5|f',
    'alpha,beta|beta,alpha',
    'alpha,beta|beta,alpha',
    '3 of 3',
    'q2,q1|42501',
    '0',
    't|t|t'];
  got text; i int; acc text; b text;
  out text := '';
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid();
  conv uuid := gen_random_uuid();
  v2 uuid;
  m double precision;
  s record;
begin
  for i in 1..array_length(labels, 1) loop
    begin
      set local session_replication_role = replica;
      perform pg_temp.clean(vendor);
      insert into public.products (id, vendor_id, name, status, created_at) values (p1, vendor, 'ST listing', 'live', now() - interval '400 days');
      got := null;
      begin
        if i = 1 then
          select avg(x)::double precision into m from (select rating::double precision x from public.reviews
                                                         union all select rating from public.product_reviews) z;
          m := coalesce(m, 4);
          select * into s from admin.vendor_standing_parts(vendor);
          got := pg_temp.n(s.i) || '|' || case when abs(s.r - (m - 1) / 4) < 0.001 then 'neutral' else pg_temp.n(s.r) end
              || '|' || pg_temp.n(s.a) || '|' || pg_temp.n(s.t) || '|' || pg_temp.n(s.p);
        elsif i = 2 then
          insert into public.product_view_daily (product_id, viewer_key, day) values
            (p1, 'u:00000000-0000-0000-0000-0000000000a1', current_date), (p1, 'u:00000000-0000-0000-0000-0000000000a2', current_date),
            (p1, 'u:00000000-0000-0000-0000-0000000000a3', current_date),
            (p1, 'u:00000000-0000-0000-0000-0000000000a4', current_date), (p1, 'u:00000000-0000-0000-0000-0000000000a4', current_date - 1),
            (p1, 'u:' || vendor, current_date), (p1, 'b:someone-signed-out', current_date);
          insert into public.follows (follower_id, vendor_id, created_at) values (buyer, vendor, now());
          insert into public.conversations (id, user_a, user_b, created_at) values (conv, least(admn, vendor), greatest(admn, vendor), now());
          insert into public.messages (conversation_id, sender_id, body, created_at) values (conv, admn, 'hi', now());
          -- 3 one-day viewers + 1 two-day viewer + 1 follower + 1 messenger = 6 people, 1 repeat: log2(8)/log2(201).
          select pg_temp.n(x.i) into got from admin.vendor_standing_parts(vendor) x;
        elsif i = 3 then
          insert into public.product_view_daily (product_id, viewer_key, day)
            select p1, 'u:' || gen_random_uuid(), current_date from generate_series(1, 250) g;
          select pg_temp.n(x.i) into got from admin.vendor_standing_parts(vendor) x;
        elsif i = 4 then
          insert into public.reviews (vendor_id, buyer_id, rating, body) values (vendor, buyer, 5, 'a'), (vendor, admn, 5, 'b');
          insert into public.product_reviews (product_id, buyer_id, rating, body) values (p1, buyer, 2, 'c');
          select avg(x)::double precision into m from (select rating::double precision x from public.reviews
                                                         union all select rating from public.product_reviews) z;
          select case when abs(x.r - (((5 * m + 12) / 8) - 1) / 4) < 0.001 then 'match' else pg_temp.n(x.r) end into got
            from admin.vendor_standing_parts(vendor) x;
        elsif i in (5, 6) then
          insert into public.rfqs (id, buyer_id, title, status, created_at) values
            (r1, buyer, 'ST one', 'active', now() - interval '3 days'),
            (r2, buyer, 'ST two', 'active', now() - interval '3 days'),
            (r3, buyer, 'ST three', 'active', now() - interval '3 days');
          if i = 5 then
            insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr, status, created_at) values
              (r1, vendor, 10, 10, 'pending', now() - interval '3 days' + interval '1 hour'),
              (r2, vendor, 10, 10, 'pending', now() - interval '3 days' + interval '2 hours'),
              (r3, vendor, 10, 10, 'pending', now() - interval '3 days' + interval '3 hours');
          else
            insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr, status, created_at) values
              (r1, vendor, 10, 10, 'pending', now() - interval '3 days' + interval '38 hours');
          end if;
          select pg_temp.n(x.a) into got from admin.vendor_standing_parts(vendor) x;
        elsif i = 7 then
          insert into public.vendor_registrations (id, vendor_id, country_code, status) values (gen_random_uuid(), vendor, 'IN', 'registered');
          select pg_temp.n(x.t) into acc from admin.vendor_standing_parts(vendor) x;
          insert into public.vendor_documents (vendor_id, doc_type, verified) values (vendor, 'pan', true);
          select acc || '|' || pg_temp.n(x.t) into acc from admin.vendor_standing_parts(vendor) x;
          update public.vendor_profiles set is_verified = true where id = vendor;
          select acc || '|' || pg_temp.n(x.t) into acc from admin.vendor_standing_parts(vendor) x;
          update public.vendor_profiles set is_verified = false, plan_expires_at = now() + interval '30 days' where id = vendor;
          delete from public.vendor_documents where vendor_id = vendor and verified;
          select acc || '|' || pg_temp.n(x.t) into got from admin.vendor_standing_parts(vendor) x;
        elsif i = 8 then
          insert into public.vendor_registrations (id, vendor_id, country_code, status) values (gen_random_uuid(), vendor, 'IN', 'registered');
          update public.vendor_profiles set profile_score = 60 where id = vendor;
          insert into admin.fraud_findings (ticket_no, subject_profile_id, subject_kind, subject_name, what_happened, outcome, account_status, decided_at)
            values ('ST-1', vendor, 'vendor', 'ST', 'test', 'warned', 'active', now()) returning id into r1;
          select * into s from admin.vendor_standing_parts(vendor);
          got := pg_temp.n(s.t) || '|' || case when abs(s.standing - (0.30 * s.i + 0.25 * s.r + 0.15 * s.a + 0.15 * s.p) / 2) < 0.001
                                                then 'halved' else pg_temp.n(s.standing) end;
          update admin.fraud_findings set withdrawn_at = now() where id = r1;
          select got || '|' || pg_temp.n(x.t) into got from admin.vendor_standing_parts(vendor) x;
        elsif i = 9 then
          update public.vendor_profiles set created_at = now() - interval '5 days' where id = vendor;
          select pg_temp.n(s2.i) || '|' || pg_temp.n(s2.a) into acc from admin.vendor_standing_parts(vendor) s2;
          update public.vendor_profiles set created_at = now() - interval '40 days' where id = vendor;
          select acc || '|' || pg_temp.n(s2.i) || '|' || pg_temp.n(s2.a) into acc from admin.vendor_standing_parts(vendor) s2;
          -- Unlisting everything and listing afresh doesn't make an old account new.
          update public.products set created_at = now() - interval '1 day' where vendor_id = vendor;
          select acc || '|' || pg_temp.n(s2.i) || '|' || pg_temp.n(s2.a) into got from admin.vendor_standing_parts(vendor) s2;
        elsif i = 10 then
          insert into public.vendor_registrations (id, vendor_id, country_code, status) values (gen_random_uuid(), vendor, 'IN', 'registered');
          update public.vendor_profiles set profile_score = 80 where id = vendor;
          insert into public.product_view_daily (product_id, viewer_key, day) values (p1, 'b:z1', current_date);
          select * into s from admin.vendor_standing_parts(vendor);
          got := case when abs(s.standing - (0.30 * s.i + 0.25 * s.r + 0.15 * s.a + 0.15 * s.t + 0.15 * s.p)) < 0.0001
                      then 'sum' else pg_temp.n(s.standing) end;
        elsif i = 11 then
          perform admin.refresh_vendor_standing();
          got := case when (select count(*) from admin.vendor_standing) = (select count(*) from public.vendor_profiles)
                      then 'rows' else 'missing rows' end;
          set local session_replication_role = origin;
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          begin
            perform 1 from admin.vendor_standing limit 1;
            got := got || '|read';
          exception when others then got := got || '|' || sqlstate; end;
          begin
            perform admin.refresh_vendor_standing();
            got := got || '|ran';
          exception when others then got := got || '|' || sqlstate; end;
        elsif i = 12 then
          delete from admin.vendor_standing where vendor_id = vendor;
          insert into admin.vendor_standing (vendor_id, standing, i, r, a, t, p) values (vendor, 0.123456, 0, 0, 0, 0, 0);
          acc := public.vendor_standing(vendor)::text;
          delete from admin.vendor_standing where vendor_id = vendor;
          got := acc || '|' || public.vendor_standing(vendor)::text || '|'
              || left(has_function_privilege('anon', 'public.vendor_standing(uuid)', 'execute')::text, 1);
        elsif i in (13, 14) then
          -- Two sellers on a level field: nobody else paid, everyone else at 0.5.
          select vp.id into v2 from public.vendor_profiles vp where vp.id <> vendor
            and exists (select 1 from public.products p where p.vendor_id = vp.id and p.status = 'live') limit 1;
          update public.vendor_profiles set plan_expires_at = null;
          update public.vendor_profiles set brand_name = 'STDZ Alpha' where id = vendor;
          update public.vendor_profiles set brand_name = 'STDZ Beta' where id = v2;
          delete from admin.vendor_standing;
          insert into admin.vendor_standing (vendor_id, standing, i, r, a, t, p) values (vendor, 0.95, 0, 0, 0, 0, 0), (v2, 0.9, 0, 0, 0, 0, 0);
          if i = 13 then
            select string_agg(case t.id when vendor then 'alpha' else 'beta' end, ',' order by o) into acc
              from public.top_vendors(2) with ordinality t(id, brand_name, city, rating_avg, reviews_count, is_verified, plan_expires_at, ad_verified_until, image_url, live_products, o);
            update public.vendor_profiles set plan_expires_at = now() + interval '30 days' where id = v2;
            select acc || '|' || string_agg(case t.id when vendor then 'alpha' else 'beta' end, ',' order by o) into got
              from public.top_vendors(2) with ordinality t(id, brand_name, city, rating_avg, reviews_count, is_verified, plan_expires_at, ad_verified_until, image_url, live_products, o);
          else
            select string_agg(case x.ref_id when vendor then 'alpha' else 'beta' end, ',' order by o) into acc
              from public.search_suggestions('STDZ', 5) with ordinality x(kind, label, ref_id, count_hint, verified, o) where x.kind = 'vendor';
            update public.vendor_profiles set plan_expires_at = now() + interval '30 days' where id = v2;
            select acc || '|' || string_agg(case x.ref_id when vendor then 'alpha' else 'beta' end, ',' order by o) into got
              from public.search_suggestions('STDZ', 5) with ordinality x(kind, label, ref_id, count_hint, verified, o) where x.kind = 'vendor';
          end if;
        elsif i = 15 then
          select count(*) filter (where p.prosrc ilike '%vendor\_standing(%' and p.prosrc not ilike '%profile\_score%') || ' of ' || count(*)
            into got from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname, p.proname) in (('public', 'match_rfq_vendors'), ('admin', 'lead_alert_fanout'), ('public', 'new_brand_suggestions'));
        elsif i = 16 then
          select vp.id into v2 from public.vendor_profiles vp where vp.id <> vendor limit 1;
          insert into public.rfqs (id, buyer_id, title, status) values (r1, buyer, 'ST mine', 'active');
          insert into public.quotes (id, rfq_id, vendor_id, price_per_unit, price_inr, status) values
            (r2, r1, vendor, 10, 10, 'pending'), (r3, r1, v2, 10, 10, 'pending');
          delete from admin.vendor_standing where vendor_id in (vendor, v2);
          insert into admin.vendor_standing (vendor_id, standing, i, r, a, t, p) values (vendor, 0.2, 0, 0, 0, 0, 0), (v2, 0.8, 0, 0, 0, 0, 0);
          perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          select string_agg(case q.quote_id when r2 then 'q1' else 'q2' end, ',' order by q.position) into acc
            from public.quote_order_for_rfq(r1) q;
          execute 'reset role';
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          begin
            perform * from public.quote_order_for_rfq(r1);
            got := acc || '|read';
          exception when others then got := acc || '|' || sqlstate; end;
        elsif i = 17 then
          insert into public.product_view_daily (product_id, viewer_key, day)
            select p1, 'b:x' || g, current_date from generate_series(1, 250) g;
          select pg_temp.n(x.i) into got from admin.vendor_standing_parts(vendor) x;
        elsif i = 18 then
          select string_agg(left(p.prosecdef::text, 1), '|' order by p.proname) into acc
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('top_vendors', 'new_brand_suggestions');
          got := acc || '|' || left(has_function_privilege('anon', 'public.top_vendors(integer)', 'execute')::text, 1);
        end if;
      exception when others then
        got := sqlstate || ' ' || sqlerrm;
      end;
      out := out || case when got is not distinct from wants[i] then 'PASS ' else 'FAIL ' end
                 || labels[i] || case when got is distinct from wants[i] then format(' (got %s, want %s)', got, wants[i]) else '' end || E'\n';
      raise exception 'rollback-case';
    exception when others then
      if sqlerrm <> 'rollback-case' then
        out := out || 'FAIL ' || labels[i] || ' (setup: ' || sqlerrm || ')' || E'\n';
      end if;
    end;
  end loop;
  raise notice E'\n%', out;
end
$st$;
