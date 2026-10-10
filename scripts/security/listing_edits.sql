-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY HARNESS: edited listings go back to review, and staff see what changed (2026-10-10).
-- Migration 20261010124955_listing_edit_rereview.sql (applied 2026-10-10; written as 20261010150000).
--   owner      a change to what buyers see sends a live listing, video or catalogue to review; the change
--              is recorded (live, rejected, paused-after-live, or already open); pictures count
--   not edits  counts other people move, the owner's own views, unpublishing, the service role, a moderator
--   decision   approving or rejecting closes the record; the next edit opens a new one
--   reading    staff read the open records; sellers, buyers and visitors can't; the table is closed
-- Every write is made as the browser would make it (role authenticated, the account's token) unless it says
-- otherwise. HOW TO RUN (local stack with the migration applied, or: begin; <migration>; <this>; rollback;).
-- Never commits: each case runs in its own savepoint, which its report rolls back.
-- ─────────────────────────────────────────────────────────────────────────────
do $le$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  buyer   uuid;
  modr    uuid;
  cat     uuid;
  p_live  uuid := 'a5e00000-0000-4000-8000-000000000001';
  p_live2 uuid := 'a5e00000-0000-4000-8000-000000000002';
  p_draft uuid := 'a5e00000-0000-4000-8000-000000000003';
  p_rej   uuid := 'a5e00000-0000-4000-8000-000000000004';
  p_pause uuid := 'a5e00000-0000-4000-8000-000000000005';
  img1    uuid := 'a5e00000-0000-4000-8000-0000000000c1';
  img2    uuid := 'a5e00000-0000-4000-8000-0000000000c2';
  vid     uuid := 'a5e00000-0000-4000-8000-0000000000b1';
  cata    uuid := 'a5e00000-0000-4000-8000-0000000000d1';
  r       record; n int; s text;
  labels text[] := array[
    'owner changes a live listing: back to review, and what changed is recorded',  -- 1
    'a second edit adds to the record; a value put back drops out',                -- 2
    'owner edits and saves as draft: draft, still recorded',                       -- 3
    'a draft never approved: edited freely, nothing recorded',                     -- 4
    'a rejected listing edited: stays rejected, recorded as after rejection',      -- 5
    'the vendor app''s save, then a new picture: one record with the picture',     -- 6
    'pictures on a live listing: removed, reordered, replaced',                    -- 7
    'a picture on a listing paused after being live: reviewed when it resumes',    -- 8
    'counts, the owner''s own view, a buyer''s review, the service role: not edits', -- 9
    'unpublishing a live listing without changes: draft, nothing recorded',        -- 10
    'a moderator approves: closed as live; the next edit opens a new record',      -- 11
    'a moderator rejects: closed as rejected',                                     -- 12
    'videos: an owner''s change goes to review and is recorded; likes are not',    -- 13
    'catalogues: an owner''s change goes to review and is recorded',               -- 14
    'staff read open records; a seller, a buyer and a visitor can''t',            -- 15
    'the table and the helpers are closed to browsers'];                           -- 16
  got text; want text; i int;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  select b.id into buyer from public.buyer_profiles b
   where public.account_is_active(b.id) and b.id <> vendor
     and not exists (select 1 from public.vendor_profiles v where v.id = b.id)
     and not exists (select 1 from admin.admin_users a where a.id = b.id)
   order by b.created_at limit 1;
  select p.id into modr from public.profiles p
   where p.id not in (vendor, buyer) and public.account_is_active(p.id)
     and not exists (select 1 from admin.admin_users a where a.id = p.id)
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.created_at limit 1;
  select c.id into cat from public.categories c where c.parent_id is not null order by c.name limit 1;
  if buyer is null or modr is null or cat is null then raise exception 'the harness needs a buyer, a spare profile and a category'; end if;
  insert into admin.admin_users (id, admin_role, is_active) values (modr, 'product_moderator', true);
  update public.profiles set account_status = 'active' where id = vendor;
  delete from public.product_reviews where buyer_id = buyer;
  -- Listings, a video and a catalogue as review left them (the triggers that would move them are bypassed).
  set local session_replication_role = replica;
  insert into public.products (id, vendor_id, name, description, price_value, status, category_id, views_count, paused_from, paused_at) values
    (p_live,  vendor, 'LE Poplin',  'Cotton poplin', 450, 'live',     cat, 7, null, null),
    (p_live2, vendor, 'LE Twill',   'Cotton twill',  300, 'live',     cat, 0, null, null),
    (p_draft, vendor, 'LE Draft',   null,            100, 'draft',    cat, 0, null, null),
    (p_rej,   vendor, 'LE Rejected', null,           200, 'rejected', cat, 0, null, null),
    (p_pause, vendor, 'LE Paused',  null,            250, 'paused',   cat, 0, 'live', now());
  insert into public.product_images (id, product_id, url, position) values
    (img1, p_live2, 'https://example.com/le-1.jpg', 0), (img2, p_live2, 'https://example.com/le-2.jpg', 1);
  insert into public.product_videos (id, vendor_id, product_id, video_url, brand_line, status, likes_count)
  values (vid, vendor, p_live, 'https://example.com/le.mp4', 'LE video', 'live', 3);
  insert into public.catalogues (id, vendor_id, title, status) values (cata, vendor, 'LE catalogue', 'live');
  set local session_replication_role = origin;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
      set local role authenticated;
      if i = 1 then
        update public.products set name = 'LE Poplin, new', price_value = 99 where id = p_live;
        reset role;
        select e.* into r from admin.listing_edits e where e.entity = 'product' and e.entity_id = p_live and e.resolved_at is null;
        got := (select status::text from public.products where id = p_live) || ' ' || r.was_status || ' ' || r.edits || ' '
               || (r.changes -> 'price_value')::text || ' ' || (r.changes -> 'name' ->> 'to') || ' keys=' || (select count(*) from jsonb_object_keys(r.changes));
        want := 'under_review live 1 {"to": 99.00, "from": 450.00} LE Poplin, new keys=2';
      elsif i = 2 then
        update public.products set price_value = 99 where id = p_live;
        update public.products set price_value = 450, description = 'Cotton poplin, 120 GSM' where id = p_live;
        reset role;
        select e.* into r from admin.listing_edits e where e.entity = 'product' and e.entity_id = p_live and e.resolved_at is null;
        got := r.edits || ' ' || (select string_agg(k, ',' order by k) from jsonb_object_keys(r.changes) k) || ' ' || (r.changes -> 'description' ->> 'from');
        want := '2 description Cotton poplin';
      elsif i = 3 then
        update public.products set name = 'LE Poplin v2', status = 'draft' where id = p_live;
        reset role;
        got := (select status::text from public.products where id = p_live) || ' '
               || (select was_status || ' ' || (changes ? 'name') from admin.listing_edits where entity_id = p_live and resolved_at is null);
        want := 'draft live true';
      elsif i = 4 then
        update public.products set name = 'LE Draft, renamed' where id = p_draft;
        reset role;
        got := (select status::text from public.products where id = p_draft) || ' records=' || (select count(*) from admin.listing_edits where entity_id = p_draft);
        want := 'draft records=0';
      elsif i = 5 then
        update public.products set price_value = 180 where id = p_rej;
        reset role;
        got := (select status::text from public.products where id = p_rej) || ' '
               || (select was_status || ' ' || (changes -> 'price_value' ->> 'to') from admin.listing_edits where entity_id = p_rej and resolved_at is null);
        want := 'rejected rejected 180.00';
      elsif i = 6 then
        -- Upload.tsx: every field sent back as it was, status 'under_review'; then the new picture.
        update public.products set name = 'LE Twill', description = 'Cotton twill', price_value = 300, status = 'under_review' where id = p_live2;
        insert into public.product_images (product_id, url, position) values (p_live2, 'https://example.com/le-3.jpg', 2);
        reset role;
        select e.* into r from admin.listing_edits e where e.entity_id = p_live2 and e.resolved_at is null;
        got := (select status::text from public.products where id = p_live2) || ' ' || r.was_status || ' ' || (r.changes -> 'images')::text
               || ' records=' || (select count(*) from admin.listing_edits where entity_id = p_live2);
        want := 'under_review live {"added": 1, "removed": 0, "reordered": false} records=1';
      elsif i = 7 then
        delete from public.product_images where id = img2;
        update public.product_images set position = 5 where id = img1;
        update public.product_images set url = 'https://example.com/le-1b.jpg' where id = img1;
        reset role;
        got := (select status::text from public.products where id = p_live2) || ' '
               || (select (changes -> 'images')::text || ' edits=' || edits from admin.listing_edits where entity_id = p_live2 and resolved_at is null);
        want := 'under_review {"added": 1, "removed": 2, "reordered": true} edits=4';
      elsif i = 8 then
        insert into public.product_images (product_id, url, position) values (p_pause, 'https://example.com/le-p.jpg', 0);
        reset role;
        got := (select status::text || ' ' || paused_from from public.products where id = p_pause) || ' '
               || (select was_status from admin.listing_edits where entity_id = p_pause and resolved_at is null);
        want := 'paused under_review paused';
      elsif i = 9 then
        perform public.increment_product_view(p_live);
        update public.products set views_count = 9999 where id = p_live;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.product_reviews (product_id, buyer_id, rating, body) values (p_live, buyer, 5, 'LE');
        perform public.increment_product_enquiry(p_live);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        update public.products set description = 'set by a job' where id = p_live;
        reset role;
        got := (select status::text || ' views ' || views_count || ' enquiries ' || enquiries_count || ' rated ' || reviews_count from public.products where id = p_live)
               || ' records=' || (select count(*) from admin.listing_edits where entity_id = p_live);
        want := 'live views 8 enquiries 1 rated 1 records=0';
      elsif i = 10 then
        update public.products set status = 'draft' where id = p_live;
        reset role;
        got := (select status::text from public.products where id = p_live) || ' records=' || (select count(*) from admin.listing_edits where entity_id = p_live);
        want := 'draft records=0';
      elsif i = 11 then
        update public.products set price_value = 99 where id = p_live;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.products set status = 'live' where id = p_live;
        reset role;
        got := (select outcome || ' ' || (resolved_by = modr) from admin.listing_edits where entity_id = p_live);
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.products set price_value = 120 where id = p_live;
        reset role;
        got := got || ', then ' || (select status::text from public.products where id = p_live) || ' '
               || (select count(*) || ' records, ' || count(*) filter (where resolved_at is null) || ' open, from '
                          || max(changes -> 'price_value' ->> 'from') filter (where resolved_at is null)
                     from admin.listing_edits where entity_id = p_live);
        want := 'live true, then under_review 2 records, 1 open, from 99.00';
      elsif i = 12 then
        update public.products set name = 'LE Poplin, again' where id = p_live;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.products set status = 'rejected', rejection_reason = 'Name does not match the pictures' where id = p_live;
        reset role;
        got := (select outcome || ' open=' || (select count(*) from admin.listing_edits where entity_id = p_live and resolved_at is null)
                  from admin.listing_edits where entity_id = p_live);
        want := 'rejected open=0';
      elsif i = 13 then
        update public.product_videos set brand_line = 'LE video, new caption' where id = vid;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.video_likes (buyer_id, video_id) values (buyer, vid);
        reset role;
        got := (select status::text || ' likes ' || likes_count from public.product_videos where id = vid) || ' '
               || (select was_status || ' ' || (changes -> 'brand_line' ->> 'to') || ' keys=' || (select count(*) from jsonb_object_keys(changes))
                     from admin.listing_edits where entity = 'product_video' and entity_id = vid and resolved_at is null);
        want := 'under_review likes 4 live LE video, new caption keys=1';
      elsif i = 14 then
        update public.catalogues set title = 'LE catalogue 2027' where id = cata;
        reset role;
        got := (select status::text from public.catalogues where id = cata) || ' '
               || (select was_status || ' ' || (changes -> 'title' ->> 'to') from admin.listing_edits where entity = 'catalogue' and entity_id = cata and resolved_at is null);
        want := 'under_review live LE catalogue 2027';
      elsif i = 15 then
        update public.products set price_value = 99 where id = p_live;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := 'staff ' || (select count(*) || ' ' || max(was_status) from public.admin_listing_edits('product', array[p_live, p_draft]));
        reset role;
        foreach s in array array['vendor', 'buyer', 'anon'] loop
          perform set_config('request.jwt.claims', case s when 'vendor' then json_build_object('sub', vendor, 'role', 'authenticated')
                                                          when 'buyer' then json_build_object('sub', buyer, 'role', 'authenticated')
                                                          else json_build_object('role', 'anon') end::text, true);
          execute 'set local role ' || case s when 'anon' then 'anon' else 'authenticated' end;
          begin
            perform public.admin_listing_edits('product', array[p_live]);
            got := got || ', ' || s || ' read';
          exception when insufficient_privilege then got := got || ', ' || s || ' refused';
          end;
          reset role;
        end loop;
        want := 'staff 1 live, vendor refused, buyer refused, anon refused';
      elsif i = 16 then
        n := 0;
        begin perform count(*) from admin.listing_edits; exception when insufficient_privilege then n := n + 1; end;
        begin perform admin.listing_edit_note('product', p_live, vendor, 'live', '{}'::jsonb); exception when insufficient_privilege then n := n + 1; end;
        begin perform admin.listing_edit_merge('{}'::jsonb, '{}'::jsonb); exception when insufficient_privilege then n := n + 1; end;
        reset role;
        got := n || ' of 3 refused';
        want := '3 of 3 refused';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'LISTING EDITS (rolled back)%', E'\n' || out;
end
$le$;
