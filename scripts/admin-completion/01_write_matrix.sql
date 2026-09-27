-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 01: who may WRITE what (Phase 1a, 2026-09-27).
--
-- 10 personas × 14 checks, each in its own rolled-back subtransaction:
--   super_admin        demo-admin 33333333-…
--   <team role>        a buyer-only account promoted inside the subtransaction by
--                      writing admin.admin_users as postgres (never committed):
--                      product_moderator, vendor_ops, ads_moderator, finance_admin,
--                      support, manager
--   buyer              a buyer-only account (own buyer_profiles row)
--   vendor             demo-vendor 22222222-… (owns ads 9b3a4d18…)
--   anon
--
-- Every target row belongs to someone else, except "own ad" (the vendor's) and
-- "own buyer_profile" (the buyer's). A cell reads `=N` (rows matched or counted)
-- or `->SQLSTATE` (refused with an error).
--
-- Expected after Phase 1a (admin_write_role_separation):
--   upd plans               =1 for super_admin, finance_admin; =0 for everyone else
--   upd other quote         =1 super_admin only
--   upd video               =1 super_admin, product_moderator
--   upd other ad            =0 for every persona (admins act through the review RPCs)
--   upd own ad              =1 vendor only
--   upd other kyc doc       =0 for every persona
--   sel kyc docs            every admin sees all rows; buyer/vendor/anon see 0 of these
--   upd other buyer_profile =0 for every persona
--   sel buyer_profiles      super_admin and support see all; other admins 0; buyer 1 (own)
--   del other profile       super_admin =1 (or an FK refusal); everyone else =0
--   ins profile             ->42501 for every persona except anon's own nothing
--   upd other profile       =1 super_admin, support
--   upd engagement event    =0 for every persona
--   ins engagement event    ->42501 for every persona
--
-- HOW TO RUN: execute this whole file as ONE statement (MCP execute_sql). It never
-- commits: every check raises to roll itself back, and the block raises at the end.
-- Pitfall already hit once: never probe an RPC as `count(*) from (select rpc()) s`.
-- ─────────────────────────────────────────────────────────────────────────────
do $h01$
declare
  sa     uuid := '33333333-3333-3333-3333-333333333333';
  pr     uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';   -- promoted in-txn
  buyer  uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';   -- buyer-only, own buyer_profiles row
  vendor uuid := '22222222-2222-2222-2222-222222222222';   -- demo-vendor
  t_quote uuid := 'ecc604d8-82dd-4451-b162-3dbbc526fedc';  -- vendor 6f66…, RFQ 6f66…
  t_video uuid := '35783726-439f-4e02-b2fe-3cd2eda8f707';  -- vendor 6f66…
  t_ad    uuid := '565979ce-2df8-4add-ba7c-a959e8fdcb3b';  -- vendor a0000002…
  t_ownad uuid := '9b3a4d18-6905-4863-bf61-3832dd26607f';  -- demo-vendor's
  t_doc   uuid := 'b33a850f-37fe-4339-acc2-0fa1876d7b67';  -- vendor 9ddda61f…
  t_bp    uuid := '8f36cfbe-51af-49c7-bcf3-0c8dd974f286';  -- another buyer's buyer_profiles
  t_prof  uuid := '948b930b-eae6-47eb-bcf6-06e1870f58dd';  -- buyer-only profile
  t_event uuid := '2ad74c5f-e25f-4b3b-853e-59c796fc00ea';
  t_plan  text;
  personas text[] := array['super_admin', 'product_moderator', 'vendor_ops', 'ads_moderator',
                           'finance_admin', 'support', 'manager', 'buyer', 'vendor', 'anon'];
  labels text[] := array['upd plans', 'upd other quote', 'upd video', 'upd other ad', 'upd own ad',
                         'upd other kyc doc', 'sel kyc docs', 'upd other buyer_profile',
                         'sel buyer_profiles', 'del other profile', 'ins profile',
                         'upd other profile', 'upd engagement event', 'ins engagement event'];
  p text; who uuid; n int; i int; out text := '';
begin
  select id into t_plan from public.subscription_plans order by sort_order limit 1;
  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 1..array_length(labels, 1) loop
      begin
        if p not in ('super_admin', 'buyer', 'vendor', 'anon') then
          insert into admin.admin_users (id, admin_role, is_active)
          values (pr, p::public.admin_role_type, true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        end if;
        who := case p when 'super_admin' then sa when 'buyer' then buyer when 'vendor' then vendor
                      when 'anon' then null else pr end;
        if who is null then
          perform set_config('request.jwt.claims', '', true);
          perform set_config('request.jwt.claim.sub', '', true);
          set local role anon;
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', who::text, true);
          set local role authenticated;
        end if;

        if    i = 1  then update public.subscription_plans set name = name where id = t_plan; get diagnostics n = row_count;
        elsif i = 2  then update public.quotes set comment = comment where id = t_quote; get diagnostics n = row_count;
        elsif i = 3  then update public.product_videos set brand_line = brand_line where id = t_video; get diagnostics n = row_count;
        elsif i = 4  then update public.advertisements set title = title where id = t_ad; get diagnostics n = row_count;
        elsif i = 5  then update public.advertisements set title = title where id = t_ownad; get diagnostics n = row_count;
        elsif i = 6  then update public.vendor_documents set doc_type = doc_type where id = t_doc; get diagnostics n = row_count;
        elsif i = 7  then select count(*) into n from public.vendor_documents where vendor_id <> coalesce(who, '00000000-0000-0000-0000-000000000000'::uuid);
        elsif i = 8  then update public.buyer_profiles set company = company where id = t_bp; get diagnostics n = row_count;
        elsif i = 9  then select count(*) into n from public.buyer_profiles;
        elsif i = 10 then delete from public.profiles where id = t_prof; get diagnostics n = row_count;
        elsif i = 11 then insert into public.profiles (id, active_role) values (gen_random_uuid(), 'buyer'); get diagnostics n = row_count;
        elsif i = 12 then update public.profiles set full_name = full_name where id = t_prof; get diagnostics n = row_count;
        elsif i = 13 then update public.engagement_events set cta_name = cta_name where id = t_event; get diagnostics n = row_count;
        elsif i = 14 then insert into public.engagement_events (event_type, vendor_id) values ('profile_view', vendor); get diagnostics n = row_count;
        end if;
        raise exception using errcode = 'P0099', message = n::text;
      exception
        when sqlstate 'P0099' then out := out || ' | ' || labels[i] || '=' || sqlerrm;
        when others then out := out || ' | ' || labels[i] || '->' || sqlstate;
      end;
    end loop;
    out := out || E'\n';
  end loop;
  raise exception 'H01 (rolled back)%', E'\n' || out;
end
$h01$;
