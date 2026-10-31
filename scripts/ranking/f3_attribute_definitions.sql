-- ─────────────────────────────────────────────────────────────────────────────
-- RANKING HARNESS F3: one vocabulary, editable by admins (2026-10-31).
-- documentation/ranking-foundations-design-2026-10-07.md "F3"; plan documentation/ranking-f3-plan-2026-10-31.md.
-- Each case runs in its own rolled-back subtransaction. Every line prints PASS or FAIL.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/ranking/f3_attribute_definitions.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $f3$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  labels text[] := array[
    'the listing form''s 773 questions are seeded', 'the requirement form''s 188 questions are seeded',
    'anon reads only active questions', 'nobody writes the table directly',
    'a seller can''t save a question', 'a seller can''t deactivate a question',
    'a super admin adds a question and it is audited', 'a manager can''t save a question',
    'a core question can''t be deactivated', 'a core question keeps its key and kind',
    'a super admin deactivates and reactivates a question',
    'a requirement question carries the listing key it means',
    'a seller''s unknown listing key is refused', 'a listing value of the wrong kind is refused',
    'sku, subType and colours are accepted', 'every question set''s full answers are accepted',
    'staff and the database are never refused', 'a key defined with two kinds accepts both shapes',
    'a turned-off question''s key is still accepted', 'a buyer''s unknown requirement key is refused'];
  wants text[] := array[
    '773', '188',
    'one fewer', '42501',
    '42501', '42501',
    'saved|audited', '42501',
    '22023', 'quantity|text',
    'false|true',
    'budget|0;colors|1;fabric|1',
    '22023', '22023|22023',
    'ok', '19 of 19',
    'ok|ok', 'ok|ok',
    'ok', '22023'];
  got text; i int; n int; m int; rid uuid;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active) values (admn, 'super_admin', true)
        on conflict (id) do update set admin_role = 'super_admin', is_active = true;
      got := null;
      begin
        if i = 1 then
          select count(*)::text into got from public.attribute_definitions where form = 'product';
        elsif i = 2 then
          select count(*)::text into got from public.attribute_definitions where form = 'requirement';
        elsif i = 3 then
          select count(*) into n from public.attribute_definitions;
          update public.attribute_definitions set active = false
           where id = (select id from public.attribute_definitions where not core order by key limit 1);
          execute 'set local role anon';
          select count(*) into m from public.attribute_definitions;
          execute 'reset role';
          got := case when m = n - 1 then 'one fewer' else format('%s of %s', m, n) end;
        elsif i = 4 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.attribute_definitions (form, key, label, kind) values ('product', 'x', 'X', 'text');
          got := 'inserted';
        elsif i = 5 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_save(null, '{"form":"product","category_id":"apparel-home","layer":"common","key":"h3x","label":"H","kind":"text"}'::jsonb);
          got := 'saved';
        elsif i = 6 then
          select id into rid from public.attribute_definitions where not core limit 1;
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_set_active(rid, false);
          got := 'changed';
        elsif i = 7 then
          select count(*) into n from admin.audit_log where target_table = 'public.attribute_definitions';
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          rid := public.admin_attribute_save(null, '{"form":"product","category_id":"apparel-home","layer":"common","key":"liningFabric","label":"Lining fabric","kind":"select","options":["Cotton","Satin"]}'::jsonb);
          execute 'reset role';
          select count(*) into m from admin.audit_log where target_table = 'public.attribute_definitions';
          got := case when rid is not null and exists (select 1 from public.attribute_definitions where id = rid and key = 'liningFabric')
                      then 'saved' else 'not saved' end || '|' || case when m > n then 'audited' else 'not audited' end;
        elsif i = 8 then
          update admin.admin_users set admin_role = 'manager' where id = admn;
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_save(null, '{"form":"product","category_id":"apparel-home","layer":"common","key":"m1","label":"M","kind":"text"}'::jsonb);
          got := 'saved';
        elsif i = 9 then
          select id into rid from public.attribute_definitions where core and form = 'requirement' limit 1;
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_set_active(rid, false);
          got := 'deactivated';
        elsif i = 10 then
          select id into rid from public.attribute_definitions where core and key = 'quantity' and schema_key = 'womens';
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_save(rid, '{"key":"qty","kind":"number","label":"How many?"}'::jsonb);
          execute 'reset role';
          select key || '|' || kind into got from public.attribute_definitions where id = rid;
        elsif i = 11 then
          select id into rid from public.attribute_definitions where not core and form = 'product' limit 1;
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_set_active(rid, false);
          execute 'reset role';
          select active::text into got from public.attribute_definitions where id = rid;
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          perform public.admin_attribute_set_active(rid, true);
          execute 'reset role';
          select got || '|' || active::text into got from public.attribute_definitions where id = rid;
        elsif i = 12 then
          select string_agg(d.k || '|' || d.w, ';' order by d.k) into got
            from (select distinct key as k, match_weight::int::text as w from public.attribute_definitions
                   where form = 'requirement' and schema_key = 'womens' and key in ('colors', 'fabric', 'budget')) d;
        elsif i = 13 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H13', 'draft', '{"zzzUnknown": "x"}');
          got := 'ok';
        elsif i = 14 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          begin
            insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H14a', 'draft', '{"washCare": {"a": 1}}');
            got := 'ok';
          exception when others then got := sqlstate; end;
          begin
            insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H14b', 'draft', '{"neckType": 5}');
            got := got || '|ok';
          exception when others then got := got || '|' || sqlstate; end;
        elsif i = 15 then
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.products (vendor_id, name, status, attributes)
          values (vendor, 'H15', 'draft', '{"sku": "A-1", "subType": "Polo", "colours": ["Red", "Blue"], "washCare": ["Machine Wash"], "neckType": "Round Neck", "brand": "true"}');
          got := 'ok';
        elsif i = 16 then
          -- One answer to every question of each set (a list for the multi-choice ones), plus the price boxes.
          select count(*) filter (where public.attributes_problem('requirement', a) is null)::text || ' of ' || count(*)
            into got
            from (select jsonb_object_agg(key, case when kind = 'chips' then to_jsonb(array[coalesce(options[1], 'x')])
                                                     else to_jsonb(coalesce(options[1], 'x')) end)
                         || '{"budgetMin": "100", "budgetMax": "200"}'::jsonb as a
                    from public.attribute_definitions where form = 'requirement' group by schema_key) s;
        elsif i = 17 then
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H17a', 'draft', '{"zzzStaff": "x"}');
          execute 'reset role';
          insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H17b', 'draft', '{"zzzDb": "x"}');
          got := 'ok|ok';
        elsif i = 18 then
          -- "material" is a single choice in some categories and a list in others.
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H18a', 'draft', '{"material": "Cotton"}');
          insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H18b', 'draft', '{"material": ["Cotton", "Silk"]}');
          got := 'ok|ok';
        elsif i = 19 then
          update public.attribute_definitions set active = false where form = 'product' and key = 'washCare';
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.products (vendor_id, name, status, attributes) values (vendor, 'H19', 'draft', '{"washCare": ["Hand Wash"]}');
          got := 'ok';
        elsif i = 20 then
          perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
          insert into public.rfq_submissions (buyer_id, title, quantity, attributes) values (buyer, 'H20', 10, '{"zzzUnknown": "x"}');
          got := 'ok';
        end if;
      exception when others then
        got := sqlstate;
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
$f3$;
