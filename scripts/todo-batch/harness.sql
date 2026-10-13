-- ─────────────────────────────────────────────────────────────
-- HARNESS for the 2026-10-13 batch: tax-id guard, admin activity, review reports, delivery team.
-- Migrations 20261013100000 … 20261013100400.
-- Runs against the local stack's fixed accounts. Every line prints PASS or FAIL with what
-- it saw, and the last line is the tally.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/todo-batch/harness.sql
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
  buyer2  uuid := '2fed911a-9c0f-47e2-944c-909e1493881f';
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  super   uuid := '33333333-3333-3333-3333-333333333333';
  support uuid := 'b71bf451-a5f9-4ab5-8196-f9ff3bb2122e';
  manager uuid := 'bae52e9d-7390-4e58-a92c-5756553c2c8e';
  modr    uuid := '7b9fad26-da14-48b1-9717-a96f47a5946a';
  good_gstin text := '27AAPFU0939F1ZV';
  good_pan   text := 'AAPFU0939F';
  rv uuid; rv2 uuid; pid uuid; prv uuid;
  got text; n int; n0 int; pass int := 0; fail int := 0; line text;
  -- label, expected, actual
begin
  -- ── helpers as nested blocks ──
  -- report(label, want, got)
  create temp table if not exists _r (i serial, label text, want text, got text) on commit drop;
  grant all on _r to public;
  grant usage on sequence _r_i_seq to public;

  -- ════ 1. Tax ids ════
  update public.vendor_profiles set gstin = null, pan = null where id = vendor;

  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set gstin = ' 27aapfu0939f1zv ', pan = 'aapfu 0939f' where id = vendor;
    reset role;
    select gstin || '|' || pan into got from public.vendor_profiles where id = vendor;
  exception when others then reset role; got := sqlstate || ' ' || sqlerrm; end;
  insert into _r (label, want, got) values ('tax: valid pair saved upper-cased, spaces removed', good_gstin || '|' || good_pan, got);

  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set gstin = '27AAPFU0939F1ZW' where id = vendor; got := 'saved';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('tax: GSTIN with a wrong check character refused', '23514', got);

  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set pan = 'ABCDE12345' where id = vendor; got := 'saved';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('tax: PAN of the wrong shape refused', '23514', got);

  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set pan = 'ABCDE1234F' where id = vendor; got := 'saved';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('tax: PAN that the GSTIN doesn''t contain refused',
    '23514 The GSTIN doesn''t match the PAN. A GSTIN contains the PAN it was issued for.', got);

  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set gstin = null where id = vendor; got := 'saved';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('tax: a seller without GST clears the GSTIN', 'saved', got);

  -- A row saved before the guard keeps an invalid value while its owner leaves it alone.
  alter table public.vendor_profiles disable trigger trg_vendor_profiles_tax_ids;
  update public.vendor_profiles set gstin = 'not-a-gstin', pan = good_pan where id = vendor;
  alter table public.vendor_profiles enable trigger trg_vendor_profiles_tax_ids;
  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set gstin = 'not-a-gstin', pan = good_pan, city = city where id = vendor; got := 'saved';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('tax: an old invalid value sent back unchanged still saves', 'saved', got);

  perform pg_temp.act(vendor);
  begin
    update public.vendor_profiles set gstin = 'still-not-one' where id = vendor; got := 'saved';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('tax: changing it to another invalid value refused', '23514', got);

  begin
    update public.vendor_profiles set gstin = 'seed value', pan = null where id = vendor;
    select gstin into got from public.vendor_profiles where id = vendor;
  exception when others then got := sqlstate; end;
  insert into _r (label, want, got) values ('tax: a seed or job is normalised, not refused', 'SEEDVALUE', got);

  -- ════ 2. Admin activity ════
  -- The local stack keeps what the browser specs recorded; start from none (rolled back with the rest).
  delete from admin.activity_views where actor_id = support;
  perform pg_temp.act(buyer);
  begin perform public.admin_activity_record('page', '/vendors'); got := 'recorded';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a non-admin can''t record', '42501', got);

  perform pg_temp.act(null);
  begin perform public.admin_activity_record('page', '/vendors'); got := 'recorded';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: signed out can''t record', '42501', got);

  perform pg_temp.act(support);
  begin
    got := public.admin_activity_record('page', '/support')::text || '|' || public.admin_activity_record('page', '/support')::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a page is recorded once within a minute', 'true|false', got);

  select actor_role || '|' || (actor_name is not null)::text into got
    from admin.activity_views where actor_id = support and path = '/support';
  insert into _r (label, want, got) values ('activity: the role and name come from the session', 'support|true', got);

  perform pg_temp.act(support);
  begin perform public.admin_activity_record('record', '/vendors/x'); got := 'recorded';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a record view must name its record', '22023', got);

  perform pg_temp.act(support);
  begin
    got := public.admin_activity_record('record', '/support/CS-000001', 'support_tickets', 'CS-000001', 'CS-000001')::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a record view is recorded', 'true', got);

  perform pg_temp.act(support);
  begin perform public.admin_activity_record('page', 'https://evil.example/'); got := 'recorded';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: only a path inside the panel', '22023', got);

  perform pg_temp.act(support);
  begin perform public.admin_activity_record('page', '//evil.example/x'); got := 'recorded';
  exception when others then got := sqlstate; end;
  begin perform public.admin_activity_record('page', '/' || chr(92) || 'evil.example'); got := got || '|recorded';
  exception when others then got := got || '|' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a path that a browser would read as another site is refused', '22023|22023', got);

  perform pg_temp.act(support);
  begin select count(*)::text into got from public.admin_activity_list();
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: support can''t read the list', '42501', got);

  perform pg_temp.act(manager);
  begin select count(*)::text into got from public.admin_activity_list(support);
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a manager reads one admin''s views', '2', got);

  perform pg_temp.act(super);
  begin select pages || '|' || records into got from public.admin_activity_summary(30) where actor_id = support;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('activity: the summary counts pages and records', '1|1', got);

  perform pg_temp.act(super);
  begin select count(*)::text into got from admin.activity_views;
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: the table is closed to browsers, super admins included', '42501', got);

  insert into admin.activity_views (at, actor_id, kind, path) values (now() - interval '181 days', support, 'page', '/old-page');
  insert into admin.activity_views (at, actor_id, kind, path) values (now() - interval '179 days', support, 'page', '/recent-page');
  insert into admin.activity_views (at, actor_id, kind, path, target_table, target_id)
    values (now() - interval '400 days', support, 'record', '/old-record', 'vendor_profiles', 'x');
  select count(*) into n0 from admin.audit_log;
  got := admin.activity_views_prune()::text;
  select got || '|' || count(*) filter (where path = '/old-page') || '|' || count(*) filter (where path = '/recent-page')
             || '|' || count(*) filter (where path = '/old-record') into got from admin.activity_views;
  select got || '|' || (count(*) = n0)::text into got from admin.audit_log;
  insert into _r (label, want, got) values ('activity: prune removes page visits past 180 days only; the Admin Log is untouched', '1|0|1|1|true', got);

  perform pg_temp.act(super);
  begin perform admin.activity_views_prune(); got := 'ran';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('activity: a browser can''t run the prune', '42501', got);

  -- ════ 3. Review reports ════
  insert into public.reviews (vendor_id, buyer_id, rating, body, reviewer_name)
    values (vendor, buyer, 1, 'Harness store review', 'Harness Buyer') returning id into rv;
  insert into public.reviews (vendor_id, buyer_id, rating, body, reviewer_name)
    values (vendor, buyer2, 5, 'Harness second review', 'Harness Buyer Two') returning id into rv2;
  select id into pid from public.products where vendor_id not in (buyer, buyer2) limit 1;

  perform pg_temp.act(null);
  begin got := public.report_review('store', rv, 'fake');
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: signed out can''t report', '42501', got);

  perform pg_temp.act(buyer);
  begin got := public.report_review('store', rv, 'fake');
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: nobody reports their own review', '42501', got);

  perform pg_temp.act(buyer2);
  begin got := public.report_review('store', rv, 'made_up_reason');
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: a reason from the list is required', '22023', got);

  perform pg_temp.act(buyer2);
  begin got := public.report_review('store', gen_random_uuid(), 'fake');
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: an unknown review', 'P0002', got);

  select count(*) into n0 from admin.audit_log;
  perform pg_temp.act(buyer2);
  begin got := public.report_review('store', rv, 'fake', '  looks invented  ') || '|' || public.report_review('store', rv, 'abusive');
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: reported, and a second report of the same review is not a new one', 'reported|already_reported', got);

  select note || '|' || (review_snapshot ->> 'body') || '|' || (review_snapshot ? 'subject_owner')::text into got
    from admin.review_reports where review_id = rv;
  insert into _r (label, want, got) values ('reviews: the note is trimmed and the review is copied onto the report', 'looks invented|Harness store review|false', got);

  -- The seller reports a review of their own store (the vendor is not its author).
  perform pg_temp.act(vendor);
  begin got := public.report_review('store', rv, 'abusive');
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: the reviewed seller can report it', 'reported', got);

  perform pg_temp.act(buyer2);
  begin select count(*)::text into got from admin.review_reports;
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: the reports table is closed to browsers', '42501', got);

  perform pg_temp.act(buyer2);
  begin select count(*)::text into got from public.admin_review_reports_list();
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: a user can''t read the queue', '42501', got);

  perform pg_temp.act(modr);
  begin select count(*)::text into got from public.admin_review_reports_list();
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: a product moderator can''t read the queue', '42501', got);

  perform pg_temp.act(support);
  begin
    select count(*) || '|' || bool_and(review_exists)::text || '|' || bool_and(reporter_name is not null)::text into got
      from public.admin_review_reports_list() where review_id = rv;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: support reads both reports, with who reported', '2|true|true', got);

  perform pg_temp.act(support);
  begin perform public.admin_review_report_decide('store', rv, 'remove', '   '); got := 'removed';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: removing needs a reason', '22023', got);

  perform pg_temp.act(modr);
  begin perform public.admin_review_report_decide('store', rv, 'dismiss'); got := 'dismissed';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: a product moderator can''t decide', '42501', got);

  select reviews_count into n from public.vendor_profiles where id = vendor;
  perform pg_temp.act(support);
  begin got := public.admin_review_report_decide('store', rv, 'remove', 'Not a real customer')::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  select got || '|' || (select count(*) from public.reviews where id = rv)
             || '|' || (select string_agg(distinct status, ',') from admin.review_reports where review_id = rv)
             || '|' || ((select reviews_count from public.vendor_profiles where id = vendor) = n - 1)::text into got;
  insert into _r (label, want, got) values ('reviews: remove closes both reports, deletes the review, and the rating count follows', '2|0|removed|true', got);

  select count(*) || '|' || bool_and(body !~* 'report')::text || '|' || bool_and(title !~* 'report')::text into got
    from public.notifications where profile_id = buyer and kind = 'review_removed';
  insert into _r (label, want, got) values ('reviews: the author is told, with no word of a report', '1|true|true', got);

  select count(*)::text into got from public.notifications
   where profile_id in (buyer2, vendor) and kind = 'review_removed';
  insert into _r (label, want, got) values ('reviews: the reporters are told nothing', '0', got);

  select count(*)::text into got from admin.audit_log
   where at >= now() - interval '1 minute' and target_table like '%review_reports' and action = 'update'
     and reason = 'Not a real customer';
  insert into _r (label, want, got) values ('reviews: the decision and its reason reach the Admin Log', '2', got);

  perform pg_temp.act(support);
  begin perform public.admin_review_report_decide('store', rv, 'dismiss'); got := 'dismissed';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: nothing open to decide a second time', 'P0002', got);

  -- Dismiss leaves the review up.
  perform pg_temp.act(buyer);
  got := public.report_review('store', rv2, 'spam');
  reset role;
  perform pg_temp.act(super);
  begin got := public.admin_review_report_decide('store', rv2, 'dismiss')::text;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  select got || '|' || (select count(*) from public.reviews where id = rv2)
             || '|' || (select status from admin.review_reports where review_id = rv2) into got;
  insert into _r (label, want, got) values ('reviews: dismiss keeps the review', '1|1|dismissed', got);

  -- A product review, through the same path.
  if pid is not null then
    insert into public.product_reviews (product_id, buyer_id, rating, body, reviewer_name)
      values (pid, buyer, 2, 'Harness product review', 'Harness Buyer') returning id into prv;
    perform pg_temp.act(buyer2);
    begin got := public.report_review('product', prv, 'spam');
    exception when others then got := sqlstate || ' ' || sqlerrm; end;
    reset role;
    perform pg_temp.act(support);
    begin got := got || '|' || public.admin_review_report_decide('product', prv, 'remove', 'Advertising')::text;
    exception when others then got := got || '|' || sqlstate || ' ' || sqlerrm; end;
    reset role;
    select got || '|' || count(*) into got from public.product_reviews where id = prv;
    insert into _r (label, want, got) values ('reviews: a product review is reported and removed', 'reported|1|0', got);
  end if;

  -- The daily limit: ten in 24 hours, then an answer, not an error.
  insert into admin.review_reports (review_kind, review_id, reporter_id, reason_code, review_snapshot)
    select 'store', gen_random_uuid(), buyer2, 'spam', '{}'::jsonb from generate_series(1, 10);
  insert into public.reviews (vendor_id, buyer_id, rating, body, reviewer_name)
    values (vendor, buyer, 3, 'Harness third review', 'Harness Buyer') returning id into rv;
  perform pg_temp.act(buyer2);
  begin got := public.report_review('store', rv, 'fake');
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: the eleventh report in a day is refused politely', 'rate_limited', got);

  perform pg_temp.act(buyer);
  begin select count(*)::text into got from public.review_report_reasons();
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('reviews: the reasons are one list both apps read', '6', got);

  -- ════ 4. Delivery team ════
  update admin.admin_users set admin_role = 'delivery_team', is_active = true where id = modr;
  perform set_config('request.jwt.claims', json_build_object('sub', modr, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', modr::text, true);
  got := public.certificate_fulfiller()::text;
  update admin.admin_users set admin_role = 'product_moderator' where id = modr;
  got := got || '|' || public.certificate_fulfiller()::text;
  insert into _r (label, want, got) values ('delivery: the delivery team fulfils certificates; a product moderator doesn''t', 'true|false', got);

  perform pg_temp.act(manager);
  begin perform public.admin_set_role(modr, 'delivery_team'); got := 'set';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  select got || '|' || admin_role::text into got from admin.admin_users where id = modr;
  insert into _r (label, want, got) values ('delivery: a manager gives a teammate the role', 'set|delivery_team', got);

  perform pg_temp.act(modr);
  begin select count(*)::text into got from public.certificate_orders; got := 'read';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('delivery: the delivery team reads certificate orders', 'read', got);

  perform pg_temp.act(modr);
  begin select count(*)::text into got from public.admin_review_reports_list();
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('delivery: the delivery team reads nothing of the review queue', '42501', got);

  perform pg_temp.act(modr);
  begin perform public.admin_set_role(support, 'delivery_team'); got := 'set';
  exception when others then got := sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('delivery: the delivery team can''t change anyone''s role', '42501', got);

  -- ── Print and roll back ──
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
