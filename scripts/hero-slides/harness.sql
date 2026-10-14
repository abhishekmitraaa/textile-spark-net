-- ─────────────────────────────────────────────────────────────
-- HARNESS for New Arrivals' carousel picks (2026-10-14; migration 20261014150000_hero_slides.sql).
-- Runs against the local stack's fixed accounts and three of its live listings. Every line prints
-- PASS or FAIL with what it saw, and the last line is the tally.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/hero-slides/harness.sql
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
  a uuid; b uuid; c uuid;
  got text; n int; log0 bigint; who uuid;
begin
  create temp table _r (i serial, label text, want text, got text) on commit drop;
  grant all on _r to public;
  grant usage on sequence _r_i_seq to public;

  delete from public.hero_slides;
  -- The local stack holds few live listings: make three, from drafts (rolled back with the rest).
  update public.products set status = 'live'
   where id in (select id from public.products where status = 'draft' order by created_at desc limit 3);
  select id into a from public.products where status = 'live' order by created_at desc limit 1;
  select id into b from public.products where status = 'live' and id <> a order by created_at desc limit 1;
  select id into c from public.products where status = 'live' and id not in (a, b) order by created_at desc limit 1;
  if c is null then raise exception 'the local stack needs three live listings'; end if;
  select coalesce(max(id), 0) into log0 from admin.audit_log;

  -- 1. Who may read and save
  perform pg_temp.act(manager);
  begin got := jsonb_array_length(public.admin_hero_slides())::text; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('manager lists the picks (none yet)', '0', got);

  foreach who in array array[support, modr, buyer] loop
    perform pg_temp.act(who);
    begin perform public.admin_hero_slides(); got := 'listed'; exception when others then got := sqlstate; end;
    reset role;
    insert into _r (label, want, got) values ('support / moderator / buyer can''t list', '42501', got);
    perform pg_temp.act(who);
    begin perform public.admin_hero_slides_save(jsonb_build_array(jsonb_build_object('product_id', a))); got := 'saved'; exception when others then got := sqlstate; end;
    reset role;
    insert into _r (label, want, got) values ('support / moderator / buyer can''t save', '42501', got);
  end loop;

  perform pg_temp.act(null);
  begin perform public.admin_hero_slides_save('[]'::jsonb); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a visitor can''t call the save', '42501', got);

  -- 2. Saving, reordering, scheduling
  perform pg_temp.act(manager);
  begin got := public.admin_hero_slides_save(jsonb_build_array(
                 jsonb_build_object('product_id', a), jsonb_build_object('product_id', b)))::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('manager saves two picks', '2', got);
  select string_agg(position::text || ':' || (product_id = a)::text || ':' || (updated_by = manager)::text, ',' order by position)
    into got from public.hero_slides;
  insert into _r (label, want, got) values ('in order, signed by the manager', '1:true:true,2:false:true', got);

  perform pg_temp.act(super);
  begin got := public.admin_hero_slides_save(jsonb_build_array(
                 jsonb_build_object('product_id', b, 'starts_at', '2026-10-20T04:30:00Z', 'ends_at', '2026-10-27T04:30:00Z'),
                 jsonb_build_object('product_id', a)))::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('a super admin swaps them and schedules one (positions swap in one save)', '2', got);
  select string_agg((product_id = b)::text || ':' || coalesce(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), '-'), ',' order by position)
    into got from public.hero_slides;
  insert into _r (label, want, got) values ('the new order and the schedule are stored', 'true:2026-10-20 04:30,false:-', got);

  -- 3. What a save refuses
  update public.products set status = 'paused' where id = c;
  perform pg_temp.act(manager);
  begin perform public.admin_hero_slides_save(jsonb_build_array(jsonb_build_object('product_id', c))); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a listing that isn''t live can''t join', '22023', got);

  update public.products set status = 'paused' where id = a;
  perform pg_temp.act(manager);
  begin got := public.admin_hero_slides_save(jsonb_build_array(jsonb_build_object('product_id', b), jsonb_build_object('product_id', a)))::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('a pick that stopped being live may stay', '2', got);

  perform pg_temp.act(manager);
  begin perform public.admin_hero_slides_save(jsonb_build_array(jsonb_build_object('product_id', b), jsonb_build_object('product_id', b))); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('the same listing twice is refused', '22023', got);

  perform pg_temp.act(manager);
  begin perform public.admin_hero_slides_save((select jsonb_agg(jsonb_build_object('product_id', b)) from generate_series(1, 13))); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('more than 12 is refused', '22023', got);

  perform pg_temp.act(manager);
  begin perform public.admin_hero_slides_save(jsonb_build_array(jsonb_build_object('product_id', b, 'starts_at', '2026-10-20T00:00:00Z', 'ends_at', '2026-10-19T00:00:00Z'))); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('an end before the start is refused', '22023', got);

  perform pg_temp.act(manager);
  begin perform public.admin_hero_slides_save(jsonb_build_array(jsonb_build_object('product_id', 'not-a-uuid'))); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a malformed listing id is refused', '22023', got);

  perform pg_temp.act(manager);
  begin perform public.admin_hero_slides_save('{"product_id": "x"}'::jsonb); got := 'saved'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('anything but a list is refused', '22023', got);

  select count(*)::text into got from public.hero_slides;
  insert into _r (label, want, got) values ('a refused save changes nothing', '2', got);

  -- 4. What anyone reads
  update public.hero_slides set ends_at = now() - interval '1 minute', starts_at = null where product_id = b;
  perform pg_temp.act(null);
  select count(*)::text into got from public.hero_slides;
  reset role;
  insert into _r (label, want, got) values ('a visitor reads only the picks that haven''t ended', '1', got);

  perform pg_temp.act(null);
  begin perform updated_by from public.hero_slides limit 1; got := 'read'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a visitor can''t read who changed it', '42501', got);

  perform pg_temp.act(manager);
  begin insert into public.hero_slides (product_id, position) values (c, 5); got := 'inserted'; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a direct write is refused, staff included', '42501', got);

  -- feed_products is what the app asks with the ids: a pick that isn't live comes back empty.
  perform pg_temp.act(null);
  select count(*)::text into got from public.feed_products('newest', 12, 0, p_ids => array[a, b]);
  reset role;
  insert into _r (label, want, got) values ('the app gets only the live picks back', '1', got);

  -- 5. Clearing, and the Admin Log
  perform pg_temp.act(manager);
  begin got := public.admin_hero_slides_save('[]'::jsonb)::text; exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('saving an empty list clears the carousel', '0', got);
  select count(*)::text into got from public.hero_slides;
  insert into _r (label, want, got) values ('no picks are left', '0', got);

  select (count(*) filter (where target_id is not null) = count(*) and count(*) >= 6)::text into got from admin.audit_log
   where id > log0 and target_table = 'public.hero_slides';
  insert into _r (label, want, got) values ('each change is in the Admin Log, naming the row', 'true', got);

  for got in select format('%s %s | want %s | got %s', case when r.want = r.got then 'PASS' else 'FAIL' end, r.label, r.want, r.got) from _r r order by r.i loop
    raise notice '%', got;
  end loop;
  select count(*) into n from _r r where r.want is distinct from r.got;
  raise exception 'TALLY: % of % passed (rolled back)', (select count(*) from _r) - n, (select count(*) from _r);
end
$h$;
