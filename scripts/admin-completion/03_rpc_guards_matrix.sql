-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 03: guards inside the admin RPCs (Phase 1c, 2026-09-27).
--
-- Personas: super_admin (demo-admin), support / manager / ads_moderator /
-- finance_admin (a buyer-only account promoted inside each rolled-back
-- subtransaction), and a plain buyer. Every check rolls itself back.
-- A cell reads `=N` or `->SQLSTATE`.
--
-- Expected after Phase 1c:
--   suspend self                 ->42501 for super_admin and support (P0001 for roles without the gate)
--   suspend another admin        =1 super_admin; ->42501 support
--   suspend a buyer              =1 super_admin, support
--   request changes, no note     ->22023 super_admin, ads_moderator; ->42501 others
--   request changes, with note   =1 super_admin, ads_moderator
--   add pattern '.*'             ->22023 super_admin, support; ->42501 others
--   add pattern '\d+'            ->22023 super_admin, support
--   add pattern '\ybank transfer\y' =1 super_admin, support
--   add pattern '('              ->2201B super_admin, support (the table CHECK)
--   dispatch, blank courier      ->42501 for every role except super_admin/finance_admin (role first)
--   admin roster                 =N super_admin, manager; ->42501 everyone else
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h03$
declare
  sa    uuid := '33333333-3333-3333-3333-333333333333';
  pr    uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  buyer uuid := 'cee2058e-eb8c-4380-8961-1ed71783c321';
  t_admin uuid;   -- another active admin (not demo-admin)
  t_buyer uuid := '948b930b-eae6-47eb-bcf6-06e1870f58dd';
  t_ad    uuid;   -- a pending_review campaign
  t_cert  uuid;   -- a printed certificate order
  personas text[] := array['super_admin', 'support', 'manager', 'ads_moderator', 'finance_admin', 'buyer'];
  labels text[] := array['suspend self', 'suspend another admin', 'suspend a buyer', 'request changes no note',
                         'request changes with note', 'add pattern .*', 'add pattern \d+', 'add pattern bank transfer',
                         'add pattern (', 'dispatch blank courier', 'admin roster'];
  p text; who uuid; n int; i int; out text := '';
begin
  select u.id into t_admin from admin.admin_users u where u.is_active and u.id <> sa order by u.id limit 1;
  select id into t_ad from public.advertisements where status = 'pending_review' order by created_at limit 1;
  select id into t_cert from public.certificate_orders where status = 'printed' order by created_at limit 1;
  if t_admin is null or t_ad is null or t_cert is null then
    raise exception 'H03: a target is missing (admin %, pending ad %, printed certificate %)', t_admin, t_ad, t_cert;
  end if;

  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 1..array_length(labels, 1) loop
      begin
        if p not in ('super_admin', 'buyer') then
          insert into admin.admin_users (id, admin_role, is_active)
          values (pr, p::public.admin_role_type, true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
        end if;
        who := case p when 'super_admin' then sa when 'buyer' then buyer else pr end;
        perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', who::text, true);
        set local role authenticated;

        if    i = 1  then perform public.set_account_status(who, 'suspended', null, 'admin_manual'); n := 1;
        elsif i = 2  then perform public.set_account_status(t_admin, 'suspended', null, 'admin_manual'); n := 1;
        elsif i = 3  then perform public.set_account_status(t_buyer, 'suspended', null, 'admin_manual'); n := 1;
        elsif i = 4  then perform public.request_ad_changes(t_ad, 'image_quality', null); n := 1;
        elsif i = 5  then perform public.request_ad_changes(t_ad, 'image_quality', 'Use a sharper product photo'); n := 1;
        elsif i = 6  then select count(*) into n from public.admin_flag_pattern_add('.*', 'H03 all', true);
        elsif i = 7  then select count(*) into n from public.admin_flag_pattern_add('\d+', 'H03 digits', true);
        elsif i = 8  then select count(*) into n from public.admin_flag_pattern_add('\ybank transfer\y', 'H03 bank', true);
        elsif i = 9  then select count(*) into n from public.admin_flag_pattern_add('(', 'H03 bad', true);
        elsif i = 10 then perform public.certificate_dispatch(t_cert, '', ''); n := 1;
        elsif i = 11 then select count(*) into n from public.admin_list_admins();
        end if;
        raise exception using errcode = 'P0099', message = coalesce(n, -1)::text;
      exception
        when sqlstate 'P0099' then out := out || ' | ' || labels[i] || '=' || sqlerrm;
        when others then out := out || ' | ' || labels[i] || '->' || sqlstate;
      end;
    end loop;
    out := out || E'\n';
  end loop;
  raise exception 'H03 (rolled back)%', E'\n' || out;
end
$h03$;
