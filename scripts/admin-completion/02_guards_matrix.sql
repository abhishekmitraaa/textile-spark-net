-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 02: moderation and campaign guards (Phase 1b, 2026-09-27).
--
-- Personas: super_admin (demo-admin), the team roles (a buyer-only account
-- promoted inside each rolled-back subtransaction), and demo-vendor. Every
-- check rolls itself back. A cell reads `=N` (rows) or `->SQLSTATE`.
--
-- Targets are looked up by state: an under_review product and the live video
-- (neither owned by a persona), a vendor profile that is not a persona, and
-- demo-vendor's own campaign that has review history.
--
-- Expected after Phase 1b:
--   approve product (status only)      =1 super_admin, product_moderator; ->42501 others with RLS access, =0 without
--   approve + rename product           ->42501 for super_admin and product_moderator
--   reject product, blank reason       ->22023 for super_admin and product_moderator
--   reject product, with reason        =1 super_admin, product_moderator
--   rpc reject_vendor_content(null)    ->22023 super_admin, product_moderator; ->P0001 others
--   reject video, blank reason         ->22023 super_admin, product_moderator
--   set plan_expires_at                =1 super_admin; ->42501 vendor_ops; =0 others (no RLS arm)
--   set is_verified                    =1 super_admin, vendor_ops
--   set ad_verified_until              =1 super_admin; ->42501 vendor_ops
--   vendor: set own ad impressions     ->42501
--   vendor: rename own ad              =1
--   vendor: insert ad, impressions=999 =0 (the value stored)
--   vendor: delete own reviewed ad     ->42501
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h02$
declare
  sa     uuid := '33333333-3333-3333-3333-333333333333';
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  vendor uuid := '22222222-2222-2222-2222-222222222222';
  t_prod uuid; t_video uuid; t_vp uuid; t_ownad uuid;
  personas text[] := array['super_admin', 'product_moderator', 'vendor_ops', 'finance_admin', 'support', 'vendor'];
  labels text[] := array['approve product', 'approve+rename product', 'reject product blank', 'reject product reason',
                         'rpc reject_vendor_content(null)', 'reject video blank', 'set plan_expires_at',
                         'set is_verified', 'set ad_verified_until', 'own ad impressions', 'rename own ad',
                         'insert ad impressions=999', 'delete own reviewed ad'];
  p text; who uuid; n int; i int; out text := '';
begin
  select id into t_prod from public.products where status = 'under_review' and vendor_id not in (vendor, pr, sa) order by created_at limit 1;
  select id into t_video from public.product_videos where vendor_id not in (vendor, pr, sa) order by created_at limit 1;
  select id into t_vp from public.vendor_profiles where id not in (vendor, pr, sa) order by created_at limit 1;
  select a.id into t_ownad from public.advertisements a
   where a.vendor_id = vendor and exists (select 1 from admin.ad_review_log l where l.ad_id = a.id) limit 1;
  if t_prod is null or t_video is null or t_vp is null or t_ownad is null then
    raise exception 'H02: a target is missing (product %, video %, vendor profile %, reviewed ad %)', t_prod, t_video, t_vp, t_ownad;
  end if;

  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 1..array_length(labels, 1) loop
      -- The insert probe runs once, as a vendor on a paid plan (a free plan
      -- cannot create campaigns at all, so demo-vendor would only show that gate).
      if i = 12 and p <> 'vendor' then
        out := out || ' | ' || labels[i] || '=n/a';
        continue;
      end if;
      begin
        if p not in ('super_admin', 'vendor') then
          insert into admin.admin_users (id, admin_role, is_active)
          values (pr, p::public.admin_role_type, true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        end if;
        who := case p when 'super_admin' then sa when 'vendor' then vendor else pr end;
        if i = 12 then
          select vs.vendor_id into who from public.vendor_subscriptions vs
           where vs.status = 'active' and vs.current_period_end > now() order by vs.vendor_id limit 1;
        end if;
        perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', who::text, true);
        set local role authenticated;

        if    i = 1  then update public.products set status = 'live', rejection_reason = null where id = t_prod; get diagnostics n = row_count;
        elsif i = 2  then update public.products set status = 'live', name = name || ' (edited)' where id = t_prod; get diagnostics n = row_count;
        elsif i = 3  then update public.products set status = 'rejected', rejection_reason = '  ' where id = t_prod; get diagnostics n = row_count;
        elsif i = 4  then update public.products set status = 'rejected', rejection_reason = 'Photos are blurry' where id = t_prod; get diagnostics n = row_count;
        elsif i = 5  then perform public.reject_vendor_content('products', t_prod, null); n := 1;
        elsif i = 6  then update public.product_videos set status = 'rejected', rejection_reason = null where id = t_video; get diagnostics n = row_count;
        elsif i = 7  then update public.vendor_profiles set plan_expires_at = now() + interval '1 year' where id = t_vp; get diagnostics n = row_count;
        elsif i = 8  then update public.vendor_profiles set is_verified = not is_verified where id = t_vp; get diagnostics n = row_count;
        elsif i = 9  then update public.vendor_profiles set ad_verified_until = now() + interval '1 year' where id = t_vp; get diagnostics n = row_count;
        elsif i = 10 then update public.advertisements set impressions = impressions + 1000 where id = t_ownad; get diagnostics n = row_count;
        elsif i = 11 then update public.advertisements set title = title where id = t_ownad; get diagnostics n = row_count;
        elsif i = 12 then insert into public.advertisements (vendor_id, title, status, impressions, clicks)
                          values (who, 'H02 probe', 'draft', 999, 999) returning impressions into n;
        elsif i = 13 then delete from public.advertisements where id = t_ownad; get diagnostics n = row_count;
        end if;
        raise exception using errcode = 'P0099', message = coalesce(n, -1)::text;
      exception
        when sqlstate 'P0099' then out := out || ' | ' || labels[i] || '=' || sqlerrm;
        when others then out := out || ' | ' || labels[i] || '->' || sqlstate;
      end;
    end loop;
    out := out || E'\n';
  end loop;
  raise exception 'H02 (rolled back)%', E'\n' || out;
end
$h02$;
