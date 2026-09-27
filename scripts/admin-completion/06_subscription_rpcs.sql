-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN COMPLETION HARNESS 06: subscription RPCs and the audit reason (Phase 3b,
-- 2026-09-27). Each case runs in its own rolled-back subtransaction, as a buyer-only
-- account promoted in-txn (finance_admin unless the case says otherwise).
--
--   change plan (active sub, basic -> silver, with reason)
--       ok: vendor_subscriptions and vendor_profiles both on silver; audit rows carry
--           the reason; the vendor was notified
--   change plan, blank reason             -> 22023
--   change plan, support                  -> 42501
--   change plan to free                   -> 22023
--   change plan to the same plan          -> P0001
--   cancel (active sub, with reason)
--       ok: canceled, period ended now, seal off; audit rows carry the reason
--   cancel an expired sub                 -> P0001
--   Admin Log (super_admin) shows the reason of a change made in the same transaction
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h06$
declare
  sa  uuid := '33333333-3333-3333-3333-333333333333';
  pr  uuid := 'a5900467-ba8f-4331-b733-d30a59c33dd9';
  v_active uuid; v_expired uuid; v_vendor uuid;
  t text; t2 text; n int;
  labels text[] := array['change plan', 'change plan: blank reason', 'change plan: support', 'change plan: to free',
                         'change plan: same plan', 'cancel', 'cancel: expired sub', 'admin log shows reason'];
  i int; out text := '';
begin
  select s.id, s.vendor_id into v_active, v_vendor from public.vendor_subscriptions s
   where s.status = 'active' and s.current_period_end > now() order by s.created_at limit 1;
  select s.id into v_expired from public.vendor_subscriptions s where s.status = 'expired' order by s.created_at limit 1;
  if v_active is null or v_expired is null then
    raise exception 'H06: needs one active and one expired subscription (active %, expired %)', v_active, v_expired;
  end if;

  for i in 1..array_length(labels, 1) loop
    begin
      insert into admin.admin_users (id, admin_role, is_active)
      values (pr, (case when i = 3 then 'support' else 'finance_admin' end)::public.admin_role_type, true)
      on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
      perform set_config('request.jwt.claims', json_build_object('sub', pr, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', pr::text, true);
      set local role authenticated;

      if i = 1 then
        perform public.admin_subscription_change_plan(v_active, 'silver', 'Upgraded as agreed on a support call');
        reset role;
        select s.plan_id into t from public.vendor_subscriptions s where s.id = v_active;
        select v.plan_id into t2 from public.vendor_profiles v where v.id = v_vendor;
        select count(*) into n from admin.audit_log l
         where l.actor_id = pr and l.reason = 'Upgraded as agreed on a support call' and l.at >= now() - interval '1 minute';
        raise exception using errcode = 'P0099', message = format('subscription %s, profile %s, reasoned audit rows %s, notice %s', t, t2, n,
          (select count(*) from public.notifications x where x.profile_id = v_vendor and x.kind = 'subscription_changed' and x.created_at >= now() - interval '1 minute'));
      elsif i = 2 then perform public.admin_subscription_change_plan(v_active, 'silver', '   ');
      elsif i = 3 then perform public.admin_subscription_change_plan(v_active, 'silver', 'x');
      elsif i = 4 then perform public.admin_subscription_change_plan(v_active, 'free', 'x');
      elsif i = 5 then perform public.admin_subscription_change_plan(v_active, (select s.plan_id from public.vendor_subscriptions s where s.id = v_active), 'x');
      elsif i = 6 then
        perform public.admin_subscription_cancel(v_active, 'Chargeback raised by the vendor''s bank');
        reset role;
        select s.status || ', ends ' || case when s.current_period_end <= now() then 'now' else 'later' end into t
          from public.vendor_subscriptions s where s.id = v_active;
        select case when v.plan_expires_at <= now() then 'seal off' else 'seal ON' end into t2 from public.vendor_profiles v where v.id = v_vendor;
        select count(*) into n from admin.audit_log l where l.actor_id = pr and l.reason like 'Chargeback%' and l.at >= now() - interval '1 minute';
        raise exception using errcode = 'P0099', message = format('%s; %s; reasoned audit rows %s', t, t2, n);
      elsif i = 7 then perform public.admin_subscription_cancel(v_expired, 'x');
      elsif i = 8 then
        perform public.admin_subscription_change_plan(v_active, 'gold', 'Promotional upgrade');
        reset role;
        perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', sa::text, true);
        set local role authenticated;
        select string_agg(distinct x.reason, ', ') into t
          from public.admin_audit_log_list(p_actor => pr, p_limit => 20) x where x.reason is not null;
        raise exception using errcode = 'P0099', message = format('reasons listed: %s', coalesce(t, 'none'));
      end if;
      raise exception using errcode = 'P0099', message = 'no error';
    exception
      when sqlstate 'P0099' then out := out || labels[i] || ': ok ' || sqlerrm || E'\n';
      when others then out := out || labels[i] || ': -> ' || sqlstate || ' ' || left(sqlerrm, 90) || E'\n';
    end;
  end loop;
  raise exception 'H06 (rolled back)%', E'\n' || out;
end
$h06$;
