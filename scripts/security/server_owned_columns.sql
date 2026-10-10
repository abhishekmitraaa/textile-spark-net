-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY HARNESS: server-owned values and the advertising path (2026-10-10).
-- Migration 20261010120000_server_owned_columns.sql (its written version; the live one once applied).
--   ads        a browser makes a draft and nothing else; an owner's status moves only through
--              pause / resume / resubmit; what was paid for and reviewed stays as it was;
--              a draft orders no certificate; review and the payment functions are untouched
--   counts     a browser's value for a count, rating, date or search vector is ignored on
--              products, videos, seller profiles, requirements and reviews, and the rest of
--              the same write still saves; the functions that move them still do
--   catalogues uploaded for review; a seller never sets one live
-- Every write below is made as the browser would make it (role authenticated, the account's
-- own token) unless it says otherwise.
-- HOW TO RUN (local stack with the migration applied, or: begin; <migration>; <this>; rollback;).
-- Never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $soc$
declare
  vendor  uuid := '22222222-2222-2222-2222-222222222222';
  buyer   uuid;
  staff   uuid;
  cat     uuid;
  cat_nm  text;
  prod    uuid := 'a5c00000-0000-4000-8000-000000000001';   -- live
  prod2   uuid := 'a5c00000-0000-4000-8000-000000000002';   -- live, the vendor's other listing
  vid     uuid := 'a5c00000-0000-4000-8000-0000000000b1';   -- live video
  ad_run  uuid := 'a5c00000-0000-4000-8000-0000000000a1';   -- active, 5 days left
  ad_cr   uuid := 'a5c00000-0000-4000-8000-0000000000a2';   -- changes requested
  ad_pa   uuid := 'a5c00000-0000-4000-8000-0000000000a3';   -- paused by Cosora
  ad_su   uuid := 'a5c00000-0000-4000-8000-0000000000a4';   -- suspended
  ad_rj   uuid := 'a5c00000-0000-4000-8000-0000000000a5';   -- rejected
  ad_ex   uuid := 'a5c00000-0000-4000-8000-0000000000a6';   -- expired
  vec     text := '[' || array_to_string(array_fill(0.01::real, array[1536]), ',') || ']';
  far     timestamptz := '2099-01-01 00:00:00+00';
  x       uuid; y uuid; n int; s text; t0 timestamptz; q text;
  labels text[] := array[
    'ads: a browser makes a draft, whatever it asks for',                    -- 1
    'ads: a draft orders no certificate; a paid campaign does',              -- 2
    'ads: the owner cannot set a status; a draft cannot be resumed',         -- 3
    'ads: a draft is the vendor''s to edit, but not its date',               -- 4
    'ads: a running campaign keeps what was paid for and reviewed',          -- 5
    'ads: after "changes requested": wording, picture, targeting, resubmit', -- 6
    'ads: pause and resume still work for the owner',                        -- 7
    'ads: paused by Cosora, suspended, rejected, expired stay that way',     -- 8
    'ads: review and the payment functions are untouched',                   -- 9
    'products: a new listing starts at zero, now, the category''s name',     -- 10
    'products: an edit keeps the stored counts and saves the rest',          -- 11
    'products: views, enquiries and review ratings are still counted',       -- 12
    'videos: counts and rating are the server''s; likes and views count',    -- 13
    'seller profile: followers, joined date and the catalogue vector',       -- 14
    'requirements and reviews: the date is when the row was made',           -- 15
    'catalogues: uploaded for review, never set live by the seller',         -- 16
    'the service role and back-office writes are untouched',                 -- 17
    'the guards cannot be called'];                                          -- 18
  got text; want text; i int;
  out text := '';
begin
  -- Fixtures (rolled back with everything else).
  select b.id into buyer from public.buyer_profiles b
   where public.account_is_active(b.id) and b.id <> vendor
     and not exists (select 1 from public.vendor_profiles v where v.id = b.id)
     and not exists (select 1 from admin.admin_users a where a.id = b.id)
   order by b.created_at limit 1;
  select p.id into staff from public.profiles p
   where p.id not in (vendor, buyer) and public.account_is_active(p.id)
     and not exists (select 1 from admin.admin_users a where a.id = p.id)
     and not exists (select 1 from public.vendor_profiles v where v.id = p.id)
   order by p.created_at limit 1;
  select c.id, c.name into cat, cat_nm from public.categories c where c.parent_id is not null order by c.name limit 1;
  if buyer is null or staff is null or cat is null then raise exception 'the harness needs a buyer, a spare profile and a category'; end if;
  insert into admin.admin_users (id, admin_role, is_active) values (staff, 'ads_moderator', true);
  update public.profiles set account_status = 'active' where id = vendor;
  update public.feature_flags set enabled = false, allow_profile_ids = array[vendor] where key in ('ad_state_targeting', 'subscription_lifecycle');
  update public.vendor_profiles set brand_name = 'SOC Vendor', state_code = 'GJ', followers_count = 12 where id = vendor;
  delete from public.subscription_mandates where vendor_id = vendor;
  insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
  values (vendor, 'gold', 'monthly', 'active', now() - interval '10 days', now() + interval '20 days')
  on conflict (vendor_id) do update set plan_id = 'gold', billing_cycle = 'monthly', status = 'active',
    current_period_start = now() - interval '10 days', current_period_end = now() + interval '20 days',
    scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null, auto_renew = false;
  delete from public.certificate_orders where vendor_id = vendor;
  delete from public.advertisements where vendor_id = vendor;
  delete from public.reviews where buyer_id = buyer;
  delete from public.product_reviews where buyer_id = buyer;
  delete from public.service_reviews where buyer_id = buyer;
  insert into public.products (id, vendor_id, name, status, category_id, views_count, enquiries_count, sold_count) values
    (prod, vendor, 'SOC product', 'live', cat, 7, 3, 2), (prod2, vendor, 'SOC second', 'live', cat, 0, 0, 0);
  insert into public.product_videos (id, vendor_id, product_id, video_url, status, likes_count, views_count, rating, reviews)
  values (vid, vendor, prod, 'https://example.com/v.mp4', 'live', 4, 9, 4.5, '12');
  -- Campaigns as payment and review would leave them (the triggers that send a new ad to review are bypassed).
  set local session_replication_role = replica;
  insert into public.advertisements (id, vendor_id, product_id, title, placement, status, starts_at, ends_at) values
    (ad_run, vendor, prod, 'SOC running',   'openListing', 'active',            now() - interval '1 day',  now() + interval '5 days'),
    (ad_cr,  vendor, prod, 'SOC changes',   'openListing', 'changes_requested', now() - interval '1 day',  now() + interval '5 days'),
    (ad_pa,  vendor, prod, 'SOC paused',    'openListing', 'paused_by_admin',   now() - interval '1 day',  now() + interval '5 days'),
    (ad_su,  vendor, prod, 'SOC suspended', 'openListing', 'suspended',         now() - interval '1 day',  now() + interval '5 days'),
    (ad_rj,  vendor, prod, 'SOC rejected',  'openListing', 'rejected',          now() - interval '1 day',  now() + interval '5 days'),
    (ad_ex,  vendor, prod, 'SOC expired',   'openListing', 'expired',           now() - interval '9 days', now() - interval '2 days');
  set local session_replication_role = origin;

  for i in 1..array_length(labels, 1) loop
    begin
      perform set_config('request.jwt.claims', '', true);
      if i = 1 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.advertisements (vendor_id, product_id, title, placement, status, starts_at, ends_at, created_at, impressions, clicks, ad_order_id)
        values (vendor, prod, 'SOC asks for review', 'websiteBanner,trustedSeal', 'pending_review', now(), far, far, 500, 50, 'order_never_paid');
        insert into public.advertisements (vendor_id, product_id, title, status) values (vendor, prod, 'SOC asks to be live', 'active');
        reset role;
        got := (select string_agg(a.status || '/' || (a.created_at <= now()) || '/' || (a.ad_order_id is null) || '/' || a.impressions, ' ' order by a.title)
                  from public.advertisements a where a.vendor_id = vendor and a.title like 'SOC asks%')
               || ' logged=' || (select count(*) from admin.ad_review_log l join public.advertisements a on a.id = l.ad_id where a.title like 'SOC asks%');
        want := 'draft/true/true/0 draft/true/true/0 logged=0';
      elsif i = 2 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.advertisements (vendor_id, title, status, placement) values (vendor, 'SOC draft certificate', 'draft', 'verifiedCertificate');
        reset role;
        got := (select count(*) from public.certificate_orders where vendor_id = vendor)::text || ' for a draft, ';
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        insert into public.advertisements (vendor_id, title, status, placement, starts_at, ends_at)
        values (vendor, 'SOC paid certificate', 'active', 'verifiedCertificate', now(), now() + interval '365 days');
        reset role;
        got := got || (select count(*) from public.certificate_orders where vendor_id = vendor)::text || ' for a paid one, '
               || (select status from public.advertisements where title = 'SOC paid certificate');
        want := '0 for a draft, 1 for a paid one, pending_review';
      elsif i = 3 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.advertisements (vendor_id, product_id, title, placement, ends_at) values (vendor, prod, 'SOC draft', 'websiteBanner', far) returning id into x;
        got := '';
        foreach s in array array['paused_by_vendor', 'pending_review', 'archived'] loop
          begin
            update public.advertisements set status = s where id = x;
            got := got || s || ' set, ';
          exception when insufficient_privilege then got := got || s || ' refused, ';
          end;
        end loop;
        begin
          perform public.resume_ad_campaign(x);
          got := got || 'resumed';
        exception when sqlstate 'P0001' then got := got || 'resume refused';
        end;
        reset role;
        got := got || ' ' || (select status from public.advertisements where id = x);
        want := 'paused_by_vendor refused, pending_review refused, archived refused, resume refused draft';
      elsif i = 4 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.advertisements (vendor_id, product_id, title, placement, ends_at) values (vendor, prod, 'SOC draft', 'websiteBanner', far) returning id into x;
        update public.advertisements set title = 'SOC draft, renamed', placement = 'openListing', ends_at = now() + interval '3 days', product_id = prod2 where id = x;
        got := 'edited';
        begin
          update public.advertisements set created_at = far where id = x;
          got := got || ', date set';
        exception when insufficient_privilege then got := got || ', date refused';
        end;
        reset role;
        got := got || ', ' || (select title || '|' || placement || '|' || (product_id = prod2) || '|' || (created_at <= now()) from public.advertisements where id = x);
        want := 'edited, date refused, SOC draft, renamed|openListing|true|true';
      elsif i = 5 then
        q := (select md5(to_jsonb(a)::text) from public.advertisements a where a.id = ad_run);
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        n := 0;
        foreach s in array array[
          format('ends_at = %L', far), $$placement = 'openListing,websiteBanner,wholesalerPick'$$, 'starts_at = now()', format('created_at = %L', far),
          $$title = 'not reviewed'$$, $$image_url = 'https://example.com/not-reviewed.jpg'$$, format('product_id = %L', prod2),
          $$target_categories = '["x"]'$$, 'daily_budget = 1', $$target_states = '{MH}'$$] loop
          begin
            execute 'update public.advertisements set ' || s || ' where id = $1' using ad_run;
          exception when insufficient_privilege then n := n + 1;
          end;
        end loop;
        reset role;
        got := n || ' of 10 refused, ' || case when q = (select md5(to_jsonb(a)::text) from public.advertisements a where a.id = ad_run) then 'unchanged' else 'CHANGED' end;
        want := '10 of 10 refused, unchanged';
      elsif i = 6 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.advertisements set title = 'SOC changes, reworded', image_url = 'https://example.com/new.jpg', target_categories = '["knits"]' where id = ad_cr;
        got := 'edited';
        begin update public.advertisements set ends_at = far where id = ad_cr; got := got || ', dates set';
        exception when insufficient_privilege then got := got || ', dates refused'; end;
        begin update public.advertisements set placement = 'websiteBanner' where id = ad_cr; got := got || ', slots set';
        exception when insufficient_privilege then got := got || ', slots refused'; end;
        begin update public.advertisements set product_id = prod2 where id = ad_cr; got := got || ', listing set';
        exception when insufficient_privilege then got := got || ', listing refused'; end;
        perform public.resubmit_ad_campaign(ad_cr);
        reset role;
        got := got || ', ' || (select status || '|' || title || '|' || placement from public.advertisements where id = ad_cr);
        want := 'edited, dates refused, slots refused, listing refused, pending_review|SOC changes, reworded|openListing';
      elsif i = 7 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.pause_ad_campaign_by_vendor(ad_run);
        got := (select status from public.advertisements where id = ad_run);
        s := public.resume_ad_campaign(ad_run);
        reset role;
        got := got || ' ' || s || ' ' || (select status from public.advertisements where id = ad_run);
        want := 'paused_by_vendor active active';
      elsif i = 8 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := '';
        foreach x in array array[ad_pa, ad_su, ad_rj, ad_ex] loop
          n := 0;
          begin update public.advertisements set status = 'paused_by_vendor' where id = x;
          exception when insufficient_privilege then n := n + 1; end;
          begin update public.advertisements set ends_at = far where id = x;
          exception when insufficient_privilege then n := n + 1; end;
          begin perform public.resume_ad_campaign(x);
          exception when insufficient_privilege or sqlstate 'P0001' then n := n + 1; end;
          got := got || n || ' ';
        end loop;
        reset role;
        got := got || (select string_agg(status, ',' order by title) from public.advertisements where id in (ad_pa, ad_su, ad_rj, ad_ex));
        want := '3 3 3 3 expired,paused_by_admin,rejected,suspended';
      elsif i = 9 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.resubmit_ad_campaign(ad_cr);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
        set local role authenticated;
        got := public.approve_ad_campaign(ad_cr, null);
        reset role;
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        update public.advertisements set ends_at = now() + interval '9 days', title = 'SOC service edit' where id = ad_cr;
        reset role;
        got := got || ', ' || (select status || '|' || title || '|' || (ends_at > now() + interval '8 days') from public.advertisements where id = ad_cr);
        want := 'active, active|SOC service edit|true';
      elsif i = 10 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        execute 'insert into public.products (vendor_id, name, status, category_id, views_count, enquiries_count, sold_count, rating_avg, reviews_count, created_at, category_name, embedding)
                 values ($1, ''SOC browser listing'', ''draft'', $2, 5000, 5000, 5000, 5, 900, $3, ''Bestsellers'', $4::halfvec)' using vendor, cat, far, vec;
        reset role;
        got := (select views_count || '|' || enquiries_count || '|' || sold_count || '|' || rating_avg::int || '|' || reviews_count || '|' || (created_at <= now())
                       || '|' || (category_name = cat_nm) || '|' || (embedding is null)
                  from public.products where vendor_id = vendor and name = 'SOC browser listing');
        want := '0|0|0|0|0|true|true|true';
      elsif i = 11 then
        t0 := (select created_at from public.products where id = prod);
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        execute 'update public.products set name = ''SOC product, renamed'', price_value = 42, views_count = 999999, enquiries_count = 999999, sold_count = 999999,
                        rating_avg = 5, reviews_count = 4321, created_at = $2, category_name = ''Bestsellers'', embedding = $3::halfvec where id = $1' using prod, far, vec;
        reset role;
        got := (select name || '|' || price_value::int || '|' || views_count || '|' || enquiries_count || '|' || sold_count || '|' || rating_avg::int || '|' || reviews_count
                       || '|' || (created_at = t0) || '|' || (category_name = cat_nm) || '|' || (embedding is null)
                  from public.products where id = prod);
        want := 'SOC product, renamed|42|7|3|2|0|0|true|true|true';
      elsif i = 12 then
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.increment_product_view(prod);
        perform public.increment_product_enquiry(prod);
        insert into public.product_reviews (product_id, buyer_id, rating, body) values (prod, buyer, 4, 'SOC review');
        reset role;
        got := (select views_count || '|' || enquiries_count || '|' || rating_avg::int || '|' || reviews_count from public.products where id = prod);
        want := '8|4|4|1';
      elsif i = 13 then
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        execute 'insert into public.product_videos (vendor_id, product_id, video_url, brand_line, likes_count, views_count, rating, reviews, created_at, embedding)
                 values ($1, $2, ''https://example.com/new.mp4'', ''SOC browser video'', 5000, 5000, 5, ''9.9k'', $3, $4::halfvec)' using vendor, prod, far, vec;
        execute 'update public.product_videos set brand_line = ''SOC video, renamed'', likes_count = 999999, views_count = 999999, rating = 5, reviews = ''9.9k'', created_at = $2, embedding = $3::halfvec where id = $1'
          using vid, far, vec;
        reset role;
        got := (select likes_count || '|' || views_count || '|' || rating::int || '|' || coalesce(reviews, '-') || '|' || (created_at <= now()) || '|' || (embedding is null)
                  from public.product_videos where brand_line = 'SOC browser video')
               || ' ' || (select brand_line || '|' || likes_count || '|' || views_count || '|' || rating || '|' || reviews || '|' || (created_at <= now()) from public.product_videos where id = vid);
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.video_likes (buyer_id, video_id) values (buyer, vid);
        perform public.increment_video_view(vid);
        reset role;
        got := got || ' ' || (select likes_count || '|' || views_count from public.product_videos where id = vid);
        want := '0|0|0|-|true|true SOC video, renamed|4|9|4.5|12|true 5|10';
      elsif i = 14 then
        t0 := (select created_at from public.vendor_profiles where id = vendor);
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        execute 'update public.vendor_profiles set brand_name = ''SOC Vendor, renamed'', followers_count = 250000, created_at = ''2001-01-01'', catalog_embedding = $2::halfvec,
                        catalog_embedding_updated_at = $3 where id = $1' using vendor, vec, far;
        reset role;
        got := (select brand_name || '|' || followers_count || '|' || (created_at = t0) || '|' || (catalog_embedding_updated_at is distinct from far)
                  from public.vendor_profiles where id = vendor);
        want := 'SOC Vendor, renamed|12|true|true';
      elsif i = 15 then
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.rfqs (buyer_id, title, category_id, created_at) values (buyer, 'SOC requirement', cat, far) returning id into x;
        update public.rfqs set created_at = far, title = 'SOC requirement, renamed' where id = x;
        insert into public.reviews (vendor_id, buyer_id, rating, body, created_at) values (vendor, buyer, 4, 'SOC', far);
        update public.reviews set created_at = far, rating = 5 where vendor_id = vendor and buyer_id = buyer;
        insert into public.product_reviews (product_id, buyer_id, rating, created_at) values (prod, buyer, 4, far);
        update public.product_reviews set created_at = far where product_id = prod and buyer_id = buyer;
        insert into public.service_reviews (service_kind, service_id, buyer_id, rating, created_at) values ('freelancer', 'soc-1', buyer, 4, '2001-01-01');
        reset role;
        got := (select title || '|' || (created_at <= now()) from public.rfqs where id = x)
               || ' ' || (select rating || '|' || (created_at <= now()) from public.reviews where vendor_id = vendor and buyer_id = buyer)
               || ' ' || (select (created_at <= now())::text from public.product_reviews where product_id = prod and buyer_id = buyer)
               || ' ' || (select (created_at > now() - interval '1 hour')::text from public.service_reviews where service_id = 'soc-1' and buyer_id = buyer);
        want := 'SOC requirement, renamed|true 5|true true true';
      elsif i = 16 then
        update admin.admin_users set admin_role = 'product_moderator' where id = staff;
        perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.catalogues (vendor_id, title, status, created_at) values (vendor, 'SOC catalogue', 'live', far) returning id into x;
        got := (select status::text || '|' || (created_at <= now()) from public.catalogues where id = x);
        begin update public.catalogues set status = 'live' where id = x; got := got || ', live set';
        exception when insufficient_privilege then got := got || ', live refused'; end;
        update public.catalogues set status = 'draft', title = 'SOC catalogue, renamed' where id = x;
        update public.catalogues set status = 'under_review' where id = x;
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.approve_vendor_content('catalogues', x);
        reset role;
        got := got || ', ' || (select status::text || '|' || title from public.catalogues where id = x);
        perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
        set local role authenticated;
        update public.catalogues set status = 'draft' where id = x;
        get diagnostics n = row_count;
        reset role;
        got := got || ', a buyer changed ' || n;
        want := 'under_review|true, live refused, live|SOC catalogue, renamed, a buyer changed 0';
      elsif i = 17 then
        perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
        set local role service_role;
        execute 'update public.products set views_count = 50, sold_count = 6, embedding = $2::halfvec, created_at = now() - interval ''40 days'' where id = $1' using prod2, vec;
        update public.vendor_profiles set followers_count = 13 where id = vendor;
        insert into public.rfqs (buyer_id, title, category_id, created_at) values (buyer, 'SOC imported', cat, now() - interval '3 days');
        reset role;
        got := (select views_count || '|' || sold_count || '|' || (embedding is not null) || '|' || (created_at < now() - interval '39 days') from public.products where id = prod2)
               || ' ' || (select followers_count from public.vendor_profiles where id = vendor)
               || ' ' || (select (created_at < now() - interval '2 days')::text from public.rfqs where title = 'SOC imported');
        want := '50|6|true|true 13 true';
      elsif i = 18 then
        got := (select string_agg(r || ':' || has_function_privilege(r, f, 'execute'), ' ' order by f, r)
                  from unnest(array['anon', 'authenticated']) r,
                       unnest(array['public.products_server_columns_guard()', 'public.product_videos_server_columns_guard()',
                                    'public.vendor_profiles_server_columns_guard()', 'public.created_at_guard()', 'public.catalogues_moderation_guard()']) f);
        want := 'anon:false authenticated:false anon:false authenticated:false anon:false authenticated:false anon:false authenticated:false anon:false authenticated:false';
      end if;
      reset role;
      raise exception using errcode = 'P0099',
        message = (case when got = want then 'PASS ' else 'FAIL ' end) || coalesce(got, 'null') || ' (want ' || want || ')';
    exception
      when sqlstate 'P0099' then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': ' || sqlerrm || E'\n';
      when others then out := out || lpad(i::text, 2) || ' ' || labels[i] || ': FAIL -> ' || sqlstate || ' ' || left(sqlerrm, 160) || E'\n';
    end;
  end loop;
  raise exception 'SERVER-OWNED COLUMNS (rolled back)%', E'\n' || out;
end
$soc$;
