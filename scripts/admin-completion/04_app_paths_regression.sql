-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 04: the ordinary app paths still work after Phase 1
-- (2026-09-27). Each path runs as the persona that uses it in the apps, in its
-- own rolled-back subtransaction. A cell reads `ok <detail>` or `FAIL <sqlstate>`.
--
--   anon         log_engagement_event on a live product (a row is written)
--   anon         ad_impression on an active campaign (impressions +1 through the ad server)
--   anon         ad_click on an active campaign (clicks +1)
--   anon         increment_product_view on a live product
--   ads_moderator approve_ad_campaign on the pending campaign
--   ads_moderator suspend_ad_campaign on an active campaign
--   support      set_vendor_document_verified(doc, true)
--   buyer        upsert own buyer_profiles row
--   buyer        post an RFQ
--   vendor       rename own vendor profile (brand_name)
--   vendor       rename own campaign
--   product_mod  approve an under_review product (status + reason only)
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h04$
declare
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  t_prod_live uuid; t_prod_review uuid; t_ad_active uuid; t_ad_pending uuid; t_ownad uuid; t_doc uuid;
  labels text[] := array['anon log_engagement_event', 'anon ad_impression', 'anon ad_click', 'anon increment_product_view',
                         'ads_moderator approve pending', 'ads_moderator suspend active', 'support verify KYC doc',
                         'buyer upsert own buyer_profile', 'buyer post RFQ', 'vendor rename own profile',
                         'vendor rename own campaign', 'product_moderator approve product'];
  persona text[] := array['anon', 'anon', 'anon', 'anon', 'ads_moderator', 'ads_moderator', 'support',
                          'buyer', 'buyer', 'vendor', 'vendor', 'product_moderator'];
  who uuid; i int; n0 bigint; n1 bigint; t text; out text := '';
begin
  select id into t_prod_live from public.products where status = 'live' order by created_at limit 1;
  select id into t_prod_review from public.products where status = 'under_review' order by created_at limit 1;
  select id into t_ad_active from public.advertisements where status = 'active' and vendor_id <> vendor order by created_at limit 1;
  select id into t_ad_pending from public.advertisements where status = 'pending_review' order by created_at limit 1;
  select id into t_ownad from public.advertisements where vendor_id = vendor order by created_at limit 1;
  select id into t_doc from public.vendor_documents order by created_at limit 1;

  for i in 1..array_length(labels, 1) loop
    begin
      if persona[i] in ('ads_moderator', 'support', 'product_moderator') then
        insert into admin.admin_users (id, admin_role, is_active)
        values (pr, persona[i]::public.admin_role_type, true)
        on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      end if;
      who := case persona[i] when 'anon' then null when 'buyer' then buyer when 'vendor' then vendor else pr end;

      -- Counters read as postgres, before switching role.
      if i = 1 then select count(*) into n0 from public.engagement_events;
      elsif i = 2 then select impressions into n0 from public.advertisements where id = t_ad_active;
      elsif i = 3 then select clicks into n0 from public.advertisements where id = t_ad_active;
      elsif i = 4 then select views_count into n0 from public.products where id = t_prod_live;
      end if;

      if who is null then
        perform set_config('request.jwt.claims', '', true);
        perform set_config('request.jwt.claim.sub', '', true);
        set local role anon;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', who::text, true);
        set local role authenticated;
      end if;

      if    i = 1  then perform public.log_engagement_event('product_view', null, t_prod_live, null, 'h04-session', 'direct', null, null);
      elsif i = 2  then perform public.ad_impression(t_ad_active, 'h04-session');
      elsif i = 3  then perform public.ad_click(t_ad_active, 'h04-session');
      elsif i = 4  then perform public.increment_product_view(t_prod_live);
      elsif i = 5  then t := public.approve_ad_campaign(t_ad_pending, null);
      elsif i = 6  then perform public.suspend_ad_campaign(t_ad_active, 'suspected_fraud', 'H04 probe');
      elsif i = 7  then perform public.set_vendor_document_verified(t_doc, true, null);
      elsif i = 8  then insert into public.buyer_profiles (id, company) values (who, 'H04 Co')
                         on conflict (id) do update set company = excluded.company;
      elsif i = 9  then insert into public.rfqs (buyer_id, title, product_name, quantity) values (who, 'H04 probe', 'Cotton poplin', 500);
      elsif i = 10 then update public.vendor_profiles set brand_name = brand_name where id = who;
      elsif i = 11 then update public.advertisements set title = title where id = t_ownad;
      elsif i = 12 then update public.products set status = 'live', rejection_reason = null where id = t_prod_review;
      end if;

      reset role;
      if i = 1 then select count(*) into n1 from public.engagement_events; t := format('rows %s -> %s', n0, n1);
      elsif i = 2 then select impressions into n1 from public.advertisements where id = t_ad_active; t := format('impressions %s -> %s', n0, n1);
      elsif i = 3 then select clicks into n1 from public.advertisements where id = t_ad_active; t := format('clicks %s -> %s', n0, n1);
      elsif i = 4 then select views_count into n1 from public.products where id = t_prod_live; t := format('views %s -> %s', n0, n1);
      elsif i = 5 then t := 'now ' || t;
      else t := '';
      end if;
      raise exception using errcode = 'P0099', message = t;
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': FAIL ' || sqlstate || ' ' || left(sqlerrm, 100) || E'\n';
    end;
  end loop;
  raise exception 'H04 (rolled back)%', E'\n' || out;
end
$h04$;
