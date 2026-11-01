-- ─────────────────────────────────────────────────────────────────────────────
-- RANKING HARNESS FIT (Part 3): one vendor against one requirement (2026-11-01).
-- documentation/ranking-fit-design-2026-11-01.md; plan documentation/ranking-fit-plan-2026-11-01.md.
-- Each case runs in its own rolled-back subtransaction. Every line prints PASS or FAIL.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/ranking/fit_match.sql
-- Fixtures are written with session_replication_role = replica (the listing and rating guards refuse even
-- postgres), so state_code is set directly rather than through the state trigger.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.n(x double precision) returns text language sql immutable as
$$ select case when x is null then '-' else rtrim(rtrim(round(x::numeric, 3)::text, '0'), '.') end $$;
-- A vendor's location change, through the history trigger (fixtures otherwise run as replica, which skips it).
create or replace function pg_temp.vloc(v uuid, code text, served text[]) returns void language plpgsql as $$
begin
  set local session_replication_role = origin;
  update public.vendor_profiles set state_code = code, served_states = served where id = v;
  set local session_replication_role = replica;
end $$;
-- A lead counts as posted now (location is read as it was when the lead was posted).
create or replace function pg_temp.repost(r uuid) returns void language sql as
$$ update public.rfqs set created_at = clock_timestamp() where id = r $$;

do $fit$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  buyer2 uuid := '33333333-3333-3333-3333-333333333333';
  labels text[] := array[
    'a category''s family is its top-level seller category',
    'location: the buyer is in the vendor''s state', 'location: the buyer is in a state the vendor serves',
    'location: the vendor lists states served and the buyer''s isn''t one',
    'location: the vendor gave only a different base state', 'location: unknown on either side is neutral',
    'location: overseas counts export-ready',
    'answers: a matching answer', 'answers: a different answer',
    'answers: no listing value, no answers, or only a draft listing are neutral',
    'answers: one value against a list, and colours against colors',
    'answers: column-backed listing values and the weighted share',
    'scale: capacity against quantity', 'scale: wrong unit, a services family, or no quantity are neutral',
    'a vendor with no new data gets today''s score plus 0.175',
    'a near lead ranks first and only it is near',
    'who sees a lead is unchanged (an overseas lead stays hidden from a free vendor)',
    'a buyer can''t read a vendor''s feed', 'clients can''t call the scoring function',
    'location: a vendor''s change after a lead was posted doesn''t change that lead',
    'location: a state picked in the app (free text, code derived) is recorded'];
  wants text[] := array[
    'apparel-home|apparel-home|apparel-home|-|-',
    '1', '0.8',
    '0',
    '0.25', '0.5|0.5',
    '1|0.5',
    '1', '0',
    '0.5|0.5|0.5',
    '1|1',
    '0.667',
    '0.25|1', '0.5|0.5|0.5',
    '0.175',
    'near-first|t|f',
    'hidden',
    '42501', '42501',
    '1|1|0.25',
    'GJ'];
  got text; i int;
  out text := '';
  apparel uuid; shirts uuid; grand uuid; legacy uuid; itroot uuid;
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid();
  a text; b text; c text;
begin
  select id into apparel from public.categories where name = 'Apparel & Home Categories' and parent_id is null;
  select id into shirts from public.categories where name = 'Men''s Shirts' and parent_id = apparel;
  select id into itroot from public.categories where name = 'IT, Software & SaaS' and parent_id is null;
  select id into legacy from public.categories where parent_id is null and grp <> 'Taxonomy' limit 1;
  for i in 1..array_length(labels, 1) loop
    begin
      set local session_replication_role = replica;
      -- A clean vendor and buyers for every case.
      update public.vendor_profiles set capabilities = '{}' where id = vendor;
      insert into public.buyer_profiles (id, state_code) values (buyer, null), (buyer2, null)
        on conflict (id) do update set state_code = null;
      delete from public.products where vendor_id = vendor;
      delete from public.vendor_capacity where vendor_id = vendor;
      insert into public.rfqs (id, buyer_id, title, status, category_id, quantity)
        values (r1, buyer, 'FIT one', 'active', shirts, 1000);
      perform pg_temp.vloc(vendor, null, '{}');
      perform pg_temp.repost(r1);
      got := null;
      begin
        if i = 1 then
          grand := gen_random_uuid();
          insert into public.categories (id, name, grp, parent_id) values (grand, 'FIT grandchild', 'Men''s Shirts', shirts);
          got := coalesce(public.category_root_of(apparel), '-') || '|' || coalesce(public.category_root_of(shirts), '-')
              || '|' || coalesce(public.category_root_of(grand), '-') || '|' || coalesce(public.category_root_of(legacy), '-')
              || '|' || coalesce(public.category_root_of(null), '-');
        elsif i between 2 and 6 then
          if i = 2 then
            perform pg_temp.vloc(vendor, 'GJ', '{}');
            update public.buyer_profiles set state_code = 'GJ' where id = buyer;
          elsif i = 3 then
            perform pg_temp.vloc(vendor, 'MH', '{GJ,KA}');
            update public.buyer_profiles set state_code = 'GJ' where id = buyer;
          elsif i = 4 then
            perform pg_temp.vloc(vendor, 'MH', '{KA}');
            update public.buyer_profiles set state_code = 'GJ' where id = buyer;
          elsif i = 5 then
            perform pg_temp.vloc(vendor, 'MH', '{}');
            update public.buyer_profiles set state_code = 'GJ' where id = buyer;
          end if;
          perform pg_temp.repost(r1);
          if i = 6 then
            perform pg_temp.vloc(vendor, 'GJ', '{}');
            perform pg_temp.repost(r1);
            select pg_temp.n(f.loc_part) into a from admin.rfq_fit(vendor, r1) f;
            perform pg_temp.vloc(vendor, null, '{}');
            perform pg_temp.repost(r1);
            update public.buyer_profiles set state_code = 'GJ' where id = buyer;
            select a || '|' || pg_temp.n(f.loc_part) into got from admin.rfq_fit(vendor, r1) f;
          else
            select pg_temp.n(f.loc_part) into got from admin.rfq_fit(vendor, r1) f;
          end if;
        elsif i = 7 then
          update public.rfqs set overseas = true where id = r1;
          update public.vendor_profiles set capabilities = '{export_ready}' where id = vendor;
          select pg_temp.n(f.loc_part) into a from admin.rfq_fit(vendor, r1) f;
          update public.vendor_profiles set capabilities = '{}' where id = vendor;
          select a || '|' || pg_temp.n(f.loc_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i between 8 and 9 then
          insert into public.products (id, vendor_id, name, status, attributes)
            values (p1, vendor, 'FIT listing', 'live', case when i = 8 then '{"weaveType": "Twill"}' else '{"weaveType": "Satin"}' end::jsonb);
          update public.rfqs set attributes = '{"weave": " twill ", "budgetMin": "100"}' where id = r1;
          select pg_temp.n(f.attr_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 10 then
          insert into public.products (id, vendor_id, name, status, attributes)
            values (p1, vendor, 'FIT listing', 'live', '{"foldType": "Flat"}');
          update public.rfqs set attributes = '{"weave": "Twill"}' where id = r1;
          select pg_temp.n(f.attr_part) into a from admin.rfq_fit(vendor, r1) f;
          update public.rfqs set attributes = '{}' where id = r1;
          select pg_temp.n(f.attr_part) into b from admin.rfq_fit(vendor, r1) f;
          insert into public.products (id, vendor_id, name, status, attributes)
            values (p2, vendor, 'FIT draft', 'draft', '{"weaveType": "Twill"}');
          update public.rfqs set attributes = '{"weave": "Twill"}' where id = r1;
          select a || '|' || b || '|' || pg_temp.n(f.attr_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 11 then
          insert into public.products (id, vendor_id, name, status, attributes)
            values (p1, vendor, 'FIT listing', 'live', '{"colours": ["Red", "Blue"], "weaveType": "Twill"}');
          update public.rfqs set attributes = '{"colors": "blue"}' where id = r1;
          select pg_temp.n(f.attr_part) into a from admin.rfq_fit(vendor, r1) f;
          update public.rfqs set attributes = '{"weave": ["Satin", "Twill"]}' where id = r1;
          select a || '|' || pg_temp.n(f.attr_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 12 then
          insert into public.products (id, vendor_id, name, status, fabric, gsm, sizes)
            values (p1, vendor, 'FIT listing', 'live', 'Cotton', '180', '{M,L}');
          update public.rfqs set attributes = '{"fabric": "cotton", "gsm": "180", "sizes": ["XL"]}' where id = r1;
          select pg_temp.n(f.attr_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 13 then
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit) values (vendor, 'apparel-home', 250, 'pieces');
          select pg_temp.n(f.scale_part) into a from admin.rfq_fit(vendor, r1) f;
          update public.vendor_capacity set monthly_capacity = 5000 where vendor_id = vendor;
          select a || '|' || pg_temp.n(f.scale_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 14 then
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit) values (vendor, 'apparel-home', 250, 'kg');
          select pg_temp.n(f.scale_part) into a from admin.rfq_fit(vendor, r1) f;
          insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit) values (vendor, 'it-software-saas', 5, 'projects');
          update public.rfqs set category_id = itroot, quantity = 2 where id = r1;
          select pg_temp.n(f.scale_part) into b from admin.rfq_fit(vendor, r1) f;
          update public.vendor_capacity set unit = 'pieces' where vendor_id = vendor and category_root = 'apparel-home';
          update public.rfqs set category_id = shirts, quantity = null where id = r1;
          select a || '|' || b || '|' || pg_temp.n(f.scale_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 15 then
          select pg_temp.n(m.score - (0.45 * coalesce(m.similarity, 0) + 0.20 * m.category_match::int)) into got
            from public.match_vendor_rfqs(vendor, 5000) m where m.rfq_id = r1;
        elsif i = 16 then
          perform pg_temp.vloc(vendor, 'GJ', '{}');
          perform pg_temp.repost(r1);
          update public.buyer_profiles set state_code = case id when buyer then 'MH' else 'GJ' end where id in (buyer, buyer2);
          insert into public.rfqs (id, buyer_id, title, status, category_id, quantity)
            values (r2, buyer2, 'FIT two', 'active', shirts, 1000);
          perform pg_temp.repost(r2);
          -- The two leads differ only in the buyer's state: buyer2 is in the vendor's state.
          select case when m.rfq_id = r2 then 'near-first' else 'far-first' end into a
            from public.match_vendor_rfqs(vendor, 5000) m where m.rfq_id in (r1, r2) order by m.score desc, m.rfq_id limit 1;
          select a, (select m.near::text from public.match_vendor_rfqs(vendor, 5000) m where m.rfq_id = r2),
                 (select m.near::text from public.match_vendor_rfqs(vendor, 5000) m where m.rfq_id = r1)
            into a, b, c;
          got := a || '|' || left(b, 1) || '|' || left(c, 1);
        elsif i = 17 then
          update public.rfqs set overseas = true where id = r1;
          got := case when exists (select 1 from public.match_vendor_rfqs(vendor, 5000) m where m.rfq_id = r1) then 'shown' else 'hidden' end;
        elsif i = 18 then
          perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform * from public.match_vendor_rfqs(vendor, 10);
          got := 'read';
        elsif i = 19 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform * from admin.rfq_fit(vendor, r1);
          got := 'called';
        elsif i = 20 then
          perform pg_temp.vloc(vendor, 'GJ', '{}');
          update public.buyer_profiles set state_code = 'GJ' where id = buyer;
          perform pg_temp.repost(r1);
          select pg_temp.n(f.loc_part) into a from admin.rfq_fit(vendor, r1) f;
          perform pg_temp.vloc(vendor, 'MH', '{}');
          select pg_temp.n(f.loc_part) into b from admin.rfq_fit(vendor, r1) f;
          perform pg_temp.repost(r1);
          select a || '|' || b || '|' || pg_temp.n(f.loc_part) into got from admin.rfq_fit(vendor, r1) f;
        elsif i = 21 then
          -- What the business profile does: it writes the state's name; sync_state_code derives the code.
          set local session_replication_role = origin;
          update public.vendor_profiles set state = 'Gujarat' where id = vendor;
          set local session_replication_role = replica;
          select coalesce(h.state_code, '-') into got from admin.vendor_location_history h
           where h.vendor_id = vendor order by h.valid_from desc, h.id desc limit 1;
        end if;
      exception when others then
        got := sqlstate || ' ' || sqlerrm;
        if sqlstate = '42501' then got := '42501'; end if;
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
$fit$;
