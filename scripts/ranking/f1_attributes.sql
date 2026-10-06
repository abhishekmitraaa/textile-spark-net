-- ─────────────────────────────────────────────────────────────────────────────
-- RANKING HARNESS F1: the forms' answers are stored, searchable and embedded
-- (2026-10-07). documentation/ranking-foundations-design-2026-10-07.md, "F1".
-- Each case plants its own product and requirement in a rolled-back subtransaction.
-- Every line prints PASS or FAIL with what it saw.
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
--   local:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/ranking/f1_attributes.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $f1$
declare
  buyer  uuid := '11111111-1111-1111-1111-111111111111';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  admn   uuid := '33333333-3333-3333-3333-333333333333';
  p uuid; r uuid;
  labels text[] := array[
    'product attributes default to {}', 'a non-object is refused', 'more than 8 KB is refused',
    'product search text holds the values', 'fts finds an attribute value', 'empty attributes keep the old search text',
    'a product attribute change queues one embedding', 'requirement search text holds the values',
    'a requirement attribute change queues one embedding', 'admin lead detail returns the attributes',
    'a vendor reads an open requirement''s attributes'];
  wants text[] := array['{}', '23514', '23514', 'yes', 'yes', 'same', '1', 'yes', '1', 'Linen', 'Linen'];
  got text; i int; n0 bigint; n1 bigint; old_text text;
  out text := '';
begin
  for i in 1..array_length(labels, 1) loop
    begin
      p := gen_random_uuid(); r := gen_random_uuid();
      insert into public.products (id, vendor_id, name, status) values (p, vendor, 'F1 product', 'draft');
      insert into public.rfqs (id, buyer_id, title, status) values (r, buyer, 'F1 requirement', 'active');
      insert into admin.admin_users (id, admin_role, is_active) values (admn, 'super_admin', true)
        on conflict (id) do update set admin_role = 'super_admin', is_active = true;

      begin
        if i = 1 then
          select attributes::text into got from public.products where id = p;
        elsif i = 2 then
          update public.products set attributes = '["x"]'::jsonb where id = p;
          got := 'accepted';
        elsif i = 3 then
          update public.products set attributes = jsonb_build_object('note', repeat('x', 9000)) where id = p;
          got := 'accepted';
        elsif i = 4 then
          update public.products
             set attributes = '{"composition": "Cotton 60% Polyester 40%", "width": "58 inch", "certifications": ["GOTS", "OEKO-TEX"], "customizable": true}'::jsonb
           where id = p;
          select case when search_text like '%GOTS%' and search_text like '%Cotton 60%' || '%' and search_text not like '%true%'
                      then 'yes' else 'no: ' || search_text end
            into got from public.products where id = p;
        elsif i = 5 then
          update public.products set attributes = '{"certifications": ["GOTS"]}'::jsonb where id = p;
          select case when fts @@ plainto_tsquery('english', 'GOTS') then 'yes' else 'no' end into got
            from public.products where id = p;
        elsif i = 6 then
          select case when search_text = (
                   coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(fabric, '') || ' ' ||
                   coalesce(gsm, '') || ' ' || coalesce(fit_type, '') || ' ' || coalesce(colour, '') || ' ' ||
                   coalesce(public.immutable_array_to_string(pattern, ' '), '') || ' ' ||
                   coalesce(public.immutable_array_to_string(occasion, ' '), '') || ' ' || coalesce(neck_type, '') || ' ' ||
                   coalesce(sleeve_type, '') || ' ' || coalesce(collar_type, '') || ' ' || coalesce(category_name, ''))
                 then 'same' else 'changed: [' || search_text || ']' end
            into got from public.products where id = p;
        elsif i = 7 then
          select count(*) into n0 from pgmq.q_embedding_jobs;
          update public.products set attributes = '{"width": "60 inch"}'::jsonb where id = p;
          select count(*) into n1 from pgmq.q_embedding_jobs;
          got := (n1 - n0)::text;
        elsif i = 8 then
          update public.rfqs set attributes = '{"fabricType": "Linen", "sizes": ["S", "M"]}'::jsonb where id = r;
          select case when search_text like '%Linen%' then 'yes' else 'no: ' || search_text end into got
            from public.rfqs where id = r;
        elsif i = 9 then
          select count(*) into n0 from pgmq.q_embedding_jobs;
          update public.rfqs set attributes = '{"fabricType": "Linen"}'::jsonb where id = r;
          select count(*) into n1 from pgmq.q_embedding_jobs;
          got := (n1 - n0)::text;
        elsif i = 10 then
          update public.rfqs set attributes = '{"fabricType": "Linen"}'::jsonb where id = r;
          perform set_config('request.jwt.claims', json_build_object('sub', admn, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', admn::text, true);
          set local role authenticated;
          got := public.admin_lead_detail(r) -> 'attributes' ->> 'fabricType';
        elsif i = 11 then
          update public.rfqs set attributes = '{"fabricType": "Linen"}'::jsonb where id = r;
          perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', vendor::text, true);
          set local role authenticated;
          select attributes ->> 'fabricType' into got from public.rfqs where id = r;
        end if;
      exception when others then
        got := sqlstate;
      end;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = wants[i] then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || wants[i] || ')';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 140) || E'\n';
    end;
  end loop;
  raise exception 'F1 (rolled back)%', E'\n' || out;
end
$f1$;
