-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY HARNESS: a seller's follower count is the number of buyers following them (2026-10-10).
-- Migration 20261010125031_follower_count.sql (applied 2026-10-10; written as 20261010150100).
--   follow, unfollow, move a follow, a deleted account: the count follows; never below zero
--   a seller can't follow themselves; a browser can't set the count; the function can't be called
--   after the migration every seller's count is the real one
-- Writes are made as the browser would make them (role authenticated, the account's token).
-- HOW TO RUN (local stack with the migration applied). Never commits: each case's report rolls it back.
-- ─────────────────────────────────────────────────────────────────────────────
do $fc$
declare
  seller  uuid := '22222222-2222-2222-2222-222222222222';
  seller2 uuid;
  b1 uuid; b2 uuid; plain uuid;
  labels text[] := array[
    'a buyer follows a seller: +1; unfollows: -1',                   -- 1
    'two buyers: 2; the same buyer twice is refused',                -- 2
    'a seller can''t follow their own business',                    -- 3
    'moving a follow to another seller moves the count',             -- 4
    'an unfollow never takes the count below zero',                  -- 5
    'following an account that isn''t a seller changes nothing',     -- 6
    'a buyer''s account deleted: their follows stop counting',       -- 7
    'a seller can''t set their own count',                           -- 8
    'the counting function can''t be called',                        -- 9
    'every seller''s count is the real number'];                      -- 10
  got text; want text; i int; c0 int;
  out text := '';
begin
  select v.id into seller2 from public.vendor_profiles v where v.id <> seller order by v.created_at limit 1;
  select b.id into b1 from public.buyer_profiles b
   where b.id not in (seller, seller2) and not exists (select 1 from public.vendor_profiles v where v.id = b.id)
     and public.account_not_deleted(b.id) order by b.created_at limit 1;
  select b.id into b2 from public.buyer_profiles b
   where b.id not in (seller, seller2, b1) and not exists (select 1 from public.vendor_profiles v where v.id = b.id)
     and public.account_not_deleted(b.id) order by b.created_at limit 1;
  select p.id into plain from public.profiles p
   where p.id not in (seller, seller2, b1, b2) and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.created_at limit 1;
  if seller2 is null or b1 is null or b2 is null or plain is null then raise exception 'the harness needs two sellers, two buyers and a plain profile'; end if;
  delete from public.follows where follower_id in (b1, b2) or vendor_id in (seller, seller2);
  update public.vendor_profiles set followers_count = 0 where id in (seller, seller2);

  for i in 1..array_length(labels, 1) loop
    begin
      if i = 1 then
        perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.follows (follower_id, vendor_id) values (b1, seller);
        reset role;
        got := (select followers_count::text from public.vendor_profiles where id = seller);
        set local role authenticated;
        delete from public.follows where follower_id = b1 and vendor_id = seller;
        reset role;
        got := got || ' ' || (select followers_count from public.vendor_profiles where id = seller);
        want := '1 0';
      elsif i = 2 then
        perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.follows (follower_id, vendor_id) values (b1, seller);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', b2, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.follows (follower_id, vendor_id) values (b2, seller);
        reset role;
        got := (select followers_count::text from public.vendor_profiles where id = seller);
        perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          insert into public.follows (follower_id, vendor_id) values (b1, seller);
          got := got || ', twice allowed';
        exception when unique_violation then got := got || ', twice refused';
        end;
        reset role;
        got := got || ' ' || (select followers_count from public.vendor_profiles where id = seller);
        want := '2, twice refused 2';
      elsif i = 3 then
        perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
        set local role authenticated;
        begin
          insert into public.follows (follower_id, vendor_id) values (seller, seller);
          got := 'allowed';
        exception when check_violation then got := 'refused';
        end;
        reset role;
        got := got || ' ' || (select followers_count from public.vendor_profiles where id = seller);
        want := 'refused 0';
      elsif i = 4 then
        perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.follows (follower_id, vendor_id) values (b1, seller);
        update public.follows set vendor_id = seller2 where follower_id = b1 and vendor_id = seller;
        reset role;
        got := (select string_agg(followers_count::text, ' ' order by (id = seller) desc) from public.vendor_profiles where id in (seller, seller2));
        want := '0 1';
      elsif i = 5 then
        perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.follows (follower_id, vendor_id) values (b1, seller);
        reset role;
        update public.vendor_profiles set followers_count = 0 where id = seller;   -- as if it had drifted
        set local role authenticated;
        delete from public.follows where follower_id = b1 and vendor_id = seller;
        reset role;
        got := (select followers_count::text from public.vendor_profiles where id = seller);
        want := '0';
      elsif i = 6 then
        c0 := (select count(*) from public.vendor_profiles where followers_count > 0);
        perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.follows (follower_id, vendor_id) values (b1, plain);
        reset role;
        got := 'saved ' || (select count(*) from public.follows where follower_id = b1 and vendor_id = plain)
               || ', sellers with followers ' || ((select count(*) from public.vendor_profiles where followers_count > 0) - c0) || ' more';
        want := 'saved 1, sellers with followers 0 more';
      elsif i = 7 then
        insert into public.follows (follower_id, vendor_id) values (b1, seller), (b2, seller);
        got := (select followers_count::text from public.vendor_profiles where id = seller);
        delete from public.profiles where id = b2;   -- what account deletion's last step does; follows cascade
        got := got || ' ' || (select followers_count from public.vendor_profiles where id = seller);
        want := '2 1';
      elsif i = 8 then
        insert into public.follows (follower_id, vendor_id) values (b1, seller);
        perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.vendor_profiles set followers_count = 250000 where id = seller;
        reset role;
        got := (select followers_count::text from public.vendor_profiles where id = seller);
        want := '1';
      elsif i = 9 then
        perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := has_function_privilege('public.follows_count_sync()', 'execute')::text;
        reset role;
        got := got || ' ' || has_function_privilege('anon', 'public.follows_count_sync()', 'execute');
        want := 'false false';
      elsif i = 10 then
        got := (select count(*)::text from public.vendor_profiles v
                 where v.followers_count <> (select count(*) from public.follows f where f.vendor_id = v.id and f.follower_id <> f.vendor_id)
                   and v.id not in (seller, seller2));
        want := '0';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'FOLLOWER COUNT (rolled back)%', E'\n' || out;
end
$fc$;
