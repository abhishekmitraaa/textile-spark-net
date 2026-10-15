-- ─────────────────────────────────────────────────────────────
-- HARNESS for reports in Cosora-Admin and JPEG-only admin pictures (2026-10-16;
-- migration 20261016100000_reports_in_app_admin_jpeg.sql).
-- Runs against the local stack's fixed accounts with the support rollout Off (as production).
-- Every line prints PASS or FAIL with what it saw, and the last line is the tally.
-- HOW TO RUN: docker exec -i supabase_db_localstack psql -U postgres -At < scripts/reports-jpeg/harness.sql
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
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  admin   uuid := '33333333-3333-3333-3333-333333333333';
  manager uuid := 'bae52e9d-7390-4e58-a92c-5756553c2c8e';
  r jsonb; fraud_id uuid; feedback_id uuid; chat_id uuid; vendor_fraud uuid;
  got text; hint text; n int;
begin
  create temp table _r (i serial, label text, want text, got text) on commit drop;
  grant all on _r to public;
  grant usage on sequence _r_i_seq to public;

  update public.support_settings set rollout = 'off' where singleton;
  -- Earlier local runs mustn't trip the daily caps (3 reports, 5 notes).
  update public.support_tickets set created_at = now() - interval '2 days' where requester_id in (buyer, vendor);

  -- 1. Reports and feedback with the rollout Off.
  perform pg_temp.act(buyer);
  begin
    r := public.support_report_fraud('Took an advance for 200 shirts and stopped replying.', 'Fake Mills', '9876543210',
                                     null, null, null, 25000, current_date - 3, 'Surat', 'en');
    fraud_id := (r ->> 'ticket_id')::uuid; got := 'stored';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('a buyer outside the rollout reports fraud: stored', 'stored', got);
  select t.channel || '/' || t.category into got from public.support_tickets t where t.id = fraud_id;
  insert into _r (label, want, got) values ('the report is a fraud_report ticket for the Fraud reports board', 'fraud_report/trust_fraud', got);
  select coalesce(d.reported_name, '-') || '/' || coalesce(d.city, '-') into got from public.support_fraud_details d where d.ticket_id = fraud_id;
  insert into _r (label, want, got) values ('its details are kept', 'Fake Mills/Surat', got);

  perform pg_temp.act(buyer);
  begin
    r := public.support_submit_feedback('bug', 'The size filter resets when I go back.', '/search/results', 'en');
    feedback_id := (r ->> 'ticket_id')::uuid; got := 'stored';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('a buyer outside the rollout sends feedback: stored', 'stored', got);
  select t.channel into got from public.support_tickets t where t.id = feedback_id;
  insert into _r (label, want, got) values ('the feedback is a feedback ticket', 'feedback', got);

  -- 2. The report's own thread: evidence and follow-ups.
  perform pg_temp.act(buyer);
  begin
    r := public.support_prepare_upload(fraud_id, 'image', 'image/png', 120000, null);
    got := case when r ->> 'path' like fraud_id::text || '/%.png' then 'reserved' else r::text end;
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('the reporter adds a screenshot to the report (PNG is fine for requesters)', 'reserved', got);
  select (a.requester_can_view)::text into got from public.support_attachments a where a.ticket_id = fraud_id;
  insert into _r (label, want, got) values ('fraud evidence stays write-only for the reporter', 'false', got);

  perform pg_temp.act(buyer);
  begin perform public.support_post_message(fraud_id, 'He also used a second number.', null); got := 'sent';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  begin perform public.support_post_message(feedback_id, 'It happens on the phone only.', null); got := got || '/sent';
  exception when others then got := got || '/' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('follow-ups on the report and on the feedback go through', 'sent/sent', got);

  -- 3. Everything else in support still follows the rollout.
  perform pg_temp.act(buyer);
  begin perform public.support_start_chat('buyer_account', 'I can''t change my number.', 'en', null, null); got := 'started';
  exception when others then get stacked diagnostics hint = pg_exception_hint; got := sqlstate || '/' || hint; end;
  reset role;
  insert into _r (label, want, got) values ('live chat stays closed outside the rollout', 'P0001/support_unavailable', got);

  chat_id := (admin.support_open_ticket(buyer, 'chat', 'buyer_account', 'An older chat.', 'en', null, null)).id;
  perform pg_temp.act(buyer);
  begin perform public.support_post_message(chat_id, 'Hello again', null); got := 'sent';
  exception when others then get stacked diagnostics hint = pg_exception_hint; got := sqlstate || '/' || hint; end;
  begin perform public.support_prepare_upload(chat_id, 'image', 'image/jpeg', 1000, null); got := got || ' ' || 'reserved';
  exception when others then get stacked diagnostics hint = pg_exception_hint; got := got || ' ' || sqlstate || '/' || hint; end;
  reset role;
  insert into _r (label, want, got) values ('a chat ticket outside the rollout: no message, no upload',
    'P0001/support_unavailable P0001/support_unavailable', got);

  update public.support_settings set rollout = 'all' where singleton;
  perform pg_temp.act(buyer);
  begin perform public.support_post_message(chat_id, 'Hello again', null); got := 'sent';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  reset role;
  insert into _r (label, want, got) values ('with the rollout On, the chat ticket takes messages as before', 'sent', got);
  update public.support_settings set rollout = 'off' where singleton;

  -- 4. Nobody else's report, and no visitor.
  perform pg_temp.act(vendor);
  vendor_fraud := (public.support_report_fraud('A buyer sent a fake payment screenshot.', null, null, null, null, null, null, null, null, 'en') ->> 'ticket_id')::uuid;
  reset role;
  perform pg_temp.act(buyer);
  begin perform public.support_post_message(vendor_fraud, 'Let me in', null); got := 'sent';
  exception when others then got := sqlstate; end;
  begin perform public.support_prepare_upload(vendor_fraud, 'image', 'image/jpeg', 1000, null); got := got || '/reserved';
  exception when others then got := got || '/' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('someone else''s report: no message, no upload', 'P0002/P0002', got);

  perform pg_temp.act(null);
  begin perform public.support_report_fraud('anonymous', null, null, null, null, null, null, null, null, 'en'); got := 'stored';
  exception when others then got := sqlstate; end;
  begin perform public.support_submit_feedback('idea', 'anonymous', null, 'en'); got := got || '/stored';
  exception when others then got := got || '/' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('a visitor can''t report or send feedback (signed in only)', '42501/42501', got);

  -- 5. The daily cap still holds.
  perform pg_temp.act(buyer);
  begin
    perform public.support_report_fraud('two', null, null, null, null, null, null, null, null, 'en');
    perform public.support_report_fraud('three', null, null, null, null, null, null, null, null, 'en');
    perform public.support_report_fraud('four', null, null, null, null, null, null, null, null, 'en');
    got := 'stored';
  exception when others then get stacked diagnostics hint = pg_exception_hint; got := hint; end;
  reset role;
  insert into _r (label, want, got) values ('the fourth report in a day is refused', 'rate_limited', got);

  -- 6. Staff pictures are JPEG only.
  perform pg_temp.act(admin);
  begin perform public.admin_support_prepare_upload(fraud_id, 'image', 'image/png', 1000, null); got := 'reserved';
  exception when others then get stacked diagnostics hint = pg_exception_hint; got := sqlstate || '/' || hint; end;
  begin perform public.admin_support_prepare_upload(fraud_id, 'image', 'image/webp', 1000, null); got := got || ' reserved';
  exception when others then get stacked diagnostics hint = pg_exception_hint; got := got || ' ' || sqlstate || '/' || hint; end;
  reset role;
  insert into _r (label, want, got) values ('staff can''t attach a PNG or WebP picture', '22023/file_type 22023/file_type', got);
  perform pg_temp.act(admin);
  begin perform public.admin_support_prepare_upload(fraud_id, 'image', 'image/jpeg', 1000, null); got := 'reserved';
  exception when others then got := sqlstate || ' ' || sqlerrm; end;
  begin perform public.admin_support_prepare_upload(fraud_id, 'pdf', 'application/pdf', 1000, null); got := got || '/reserved';
  exception when others then got := got || '/' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('staff attach a JPEG, and a PDF as before', 'reserved/reserved', got);

  -- 7. The site-content bucket: JPEG only, by type and by name.
  select array_to_string(allowed_mime_types, ',') into got from storage.buckets where id = 'site-content';
  insert into _r (label, want, got) values ('the site-content bucket accepts image/jpeg only', 'image/jpeg', got);

  perform pg_temp.act(admin);
  begin insert into storage.objects (bucket_id, name, owner) values ('site-content', 'banners/' || gen_random_uuid() || '.png', admin); got := 'inserted';
  exception when others then got := sqlstate; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('site-content', 'banners/' || gen_random_uuid() || '.jpg', admin); got := got || '/inserted';
  exception when others then got := got || '/' || sqlstate; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('site-content', 'blog/' || gen_random_uuid() || '.webp', admin); got := got || ' ' || 'inserted';
  exception when others then got := got || ' ' || sqlstate; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('site-content', 'blog/' || gen_random_uuid() || '.jpeg', admin); got := got || '/inserted';
  exception when others then got := got || '/' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('super admin: a .png banner and a .webp blog picture refused; .jpg and .jpeg allowed',
    '42501/inserted 42501/inserted', got);

  perform pg_temp.act(manager);
  begin insert into storage.objects (bucket_id, name, owner) values ('site-content', 'categories/' || gen_random_uuid() || '.webp', manager); got := 'inserted';
  exception when others then got := sqlstate; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('site-content', 'categories/' || gen_random_uuid() || '.jpg', manager); got := got || '/inserted';
  exception when others then got := got || '/' || sqlstate; end;
  reset role;
  insert into _r (label, want, got) values ('manager: a .webp category picture refused; .jpg allowed', '42501/inserted', got);

  select string_agg(policyname, ',' order by policyname) into got from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'DELETE')
     and qual like '%site-content%' and qual like '%png%';
  insert into _r (label, want, got) values ('pictures already stored as PNG/WebP stay readable and removable',
    'blog_media_admin_delete,blog_media_admin_select,site_content_admin_delete,site_content_admin_select,site_content_category_delete,site_content_category_select', got);

  for got in select format('%s %s | want %s | got %s', case when r.want = r.got then 'PASS' else 'FAIL' end, r.label, r.want, r.got) from _r r order by r.i loop
    raise notice '%', got;
  end loop;
  select count(*) into n from _r r where r.want is distinct from r.got;
  raise exception 'TALLY: % of % passed (rolled back)', (select count(*) from _r) - n, (select count(*) from _r);
end
$h$;
