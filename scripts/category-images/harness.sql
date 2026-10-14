-- ─────────────────────────────────────────────────────────────
-- HARNESS for category pictures (2026-10-14; migration 20261014090000_category_images.sql).
-- Runs against the local stack's fixed accounts. Every line prints PASS or FAIL with what it
-- saw, and the last line is the tally.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/category-images/harness.sql
-- It never commits: the block ends by raising, which rolls everything back.
-- ─────────────────────────────────────────────────────────────
create or replace function pg_temp.act(p_uid uuid) returns void language plpgsql as $f$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $f$;
grant execute on function pg_temp.act(uuid) to public;

do $h$
declare
  buyer   uuid := '11111111-1111-1111-1111-111111111111';
  super   uuid := '33333333-3333-3333-3333-333333333333';
  support uuid := 'b71bf451-a5f9-4ab5-8196-f9ff3bb2122e';
  manager uuid := 'bae52e9d-7390-4e58-a92c-5756553c2c8e';
  modr    uuid := '7b9fad26-da14-48b1-9717-a96f47a5946a';
  slot    text := 'new-arrivals/kidswear';
  img1    text := 'categories/' || gen_random_uuid() || '.webp';
  img2    text := 'categories/' || gen_random_uuid() || '.jpg';
  got text; n int; log0 bigint;
begin
  create temp table _r (i serial, label text, want text, got text) on commit drop;
  grant all on _r to public;
  grant usage on sequence _r_i_seq to public;

  -- Two uploaded objects (the panel uploads before it saves).
  insert into storage.objects (bucket_id, name, owner) values ('site-content', img1, manager), ('site-content', img2, super);
  select coalesce(max(id), 0) into log0 from admin.audit_log;

  -- 1. Who may read the admin list
  perform pg_temp.act(manager);
  begin got := jsonb_array_length(public.admin_category_images())::text; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('manager lists every slot', '191', got);

  foreach got in array array[support::text, modr::text, buyer::text] loop
    perform pg_temp.act(got::uuid);
    begin perform public.admin_category_images(); got := 'listed'; exception when others then got := sqlstate; end;
    reset role;
    insert into _r (label, want, got) values ('support / moderator / buyer can''t list', '42501', got);
  end loop;

  -- 2. Setting a picture
  perform pg_temp.act(manager);
  begin got := coalesce(public.admin_category_image_set(slot, img1), '(none)'); exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('manager sets a picture; nothing replaced', '(none)', got);
  select image_path || '|' || (updated_by = manager)::text into got from public.category_images where id = slot;
  insert into _r (label, want, got) values ('the row holds it, and who set it', img1 || '|true', got);

  perform pg_temp.act(super);
  begin got := coalesce(public.admin_category_image_set(slot, img2), '(none)'); exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('super admin replaces it; the old path comes back to remove', img1, got);

  perform pg_temp.act(support);
  begin perform public.admin_category_image_set(slot, img1); got := 'set'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('support can''t set', '42501', got);

  perform pg_temp.act(manager);
  begin perform public.admin_category_image_set(slot, 'banners/' || gen_random_uuid() || '.png'); got := 'set'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a path outside categories/ is refused', '22023', got);

  perform pg_temp.act(manager);
  begin perform public.admin_category_image_set(slot, 'categories/' || gen_random_uuid() || '.png'); got := 'set'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a picture that was never uploaded is refused', '22023', got);

  perform pg_temp.act(manager);
  begin perform public.admin_category_image_set('categories/nope/nope', img1); got := 'set'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('an unknown slot is refused', 'P0002', got);

  -- 3. What anyone reads
  perform pg_temp.act(null);
  select count(*)::text into got from public.category_images;
  reset role;
  insert into _r (label, want, got) values ('a visitor reads only the slots with a picture', '1', got);

  perform pg_temp.act(null);
  begin perform updated_by from public.category_images limit 1; got := 'read'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a visitor can''t read who changed it', '42501', got);

  perform pg_temp.act(manager);
  begin update public.category_images set image_path = null where id = slot; got := 'updated'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a direct write is refused, staff included', '42501', got);

  -- 4. Back to the default, and the Admin Log
  perform pg_temp.act(manager);
  begin got := coalesce(public.admin_category_image_set(slot, null), '(none)'); exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('"Use default" clears it and returns the path to remove', img2, got);

  select count(*)::text into got from admin.audit_log
   where id > log0 and target_table = 'public.category_images' and target_id = slot and action = 'update';
  insert into _r (label, want, got) values ('each change is in the Admin Log, naming the slot', '3', got);

  for got in select format('%s %s | want %s | got %s', case when r.want = r.got then 'PASS' else 'FAIL' end, r.label, r.want, r.got) from _r r order by r.i loop
    raise notice '%', got;
  end loop;
  select count(*) into n from _r r where r.want is distinct from r.got;
  raise exception 'TALLY: % of % passed (rolled back)', (select count(*) from _r) - n, (select count(*) from _r);
end
$h$;
