-- Admin completion, Phase 3b (Mitra, 2026-09-27): the Admin Log records WHY, and admin
-- subscription changes keep a vendor's plan consistent.
--
-- 1. admin.audit_log gains `reason`. An admin RPC that must say why sets the
--    transaction-local `cosora.audit_reason`, and admin.audit_row_change() copies it
--    onto every row that transaction changes. The log recorded who, when and what,
--    never why. admin_audit_log_list() returns the new column (dropped and
--    recreated, since a return type can't change in place; grants restored).
-- 2. admin_subscription_change_plan(subscription, plan, reason) and
--    admin_subscription_cancel(subscription, reason), super_admin and finance_admin.
--    The panel used to UPDATE vendor_subscriptions directly: a one-click select with
--    no reason. It left vendor_profiles.plan_id / plan_expires_at (the trust seal
--    and the search boost) on the old values, and a cancel left the seal on until
--    the old expiry. Each function changes both tables in one transaction, records
--    the reason, and tells the vendor.
--    * Changing plans moves no money and keeps the period end. Refunds stay on the
--      invoice's Refund action.
--    * Cancel ends the plan now. There is no autopay (every period is paid
--      explicitly), so "cancel at period end" would change nothing and isn't offered.
--    * Moving a vendor to Free is a cancel, not a plan change.

-- ── Pre-check: patch exactly the bodies read on 2026-09-27 ────────────────────
do $pre$
begin
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'admin' and p.proname = 'audit_row_change') is distinct from 'c761a771ae1edf5d5be9b2deb5c2a434' then
    raise exception 'pre-check: admin.audit_row_change() has changed since it was read';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'admin_audit_log_list') is distinct from '7555ef3a3c7b01cb6f8524d7acb5e483' then
    raise exception 'pre-check: public.admin_audit_log_list() has changed since it was read';
  end if;
end
$pre$;

-- ── 1: a reason on audit rows ────────────────────────────────────────────────
alter table admin.audit_log add column if not exists reason text;

create or replace function admin.audit_row_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_role    public.admin_role_type;
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb;
  v_owner   text := coalesce(tg_argv[0], '');
  v_skip    text[] := array[
    'updated_at', 'embedding', 'fts', 'search_text', 'catalog_embedding',
    'catalog_embedding_updated_at', 'recommended_product_ids', 'category_name',
    'views_count', 'enquiries_count', 'sold_count', 'rating_avg', 'reviews_count',
    'likes_count', 'impressions', 'clicks', 'followers_count', 'profile_score',
    'last_message', 'last_message_at'];
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return null;
  end if;
  select u.admin_role into v_role from admin.admin_users u where u.id = v_uid and u.is_active;
  if v_role is null then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - v_skip; end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new) - v_skip; end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k))
      into v_changes
      from jsonb_object_keys(v_new) as k
     where (v_old -> k) is distinct from (v_new -> k);
    if v_changes is null then
      return null;  -- only counters or derived columns moved
    end if;
  else
    v_changes := coalesce(v_new, v_old);
  end if;

  insert into admin.audit_log
    (actor_id, actor_role, actor_name, action, target_table, target_id, own_row, changes, reason)
  values (
    v_uid, v_role, admin.audit_actor_name(v_uid), lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_owner <> '' and coalesce(v_new ->> v_owner, v_old ->> v_owner) = v_uid::text,
    v_changes,
    -- Set by an admin RPC that has to say why (set_config('cosora.audit_reason', …, true)).
    nullif(current_setting('cosora.audit_reason', true), '')
  );
  return null;
end;
$function$;

drop function public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer);
create function public.admin_audit_log_list(
  p_actor uuid default null,
  p_table text default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 100)
 returns table(id bigint, at timestamptz, actor_id uuid, actor_role admin_role_type, actor_name text,
               action text, target_table text, target_id text, own_row boolean, changes jsonb,
               source text, reason text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'manager'), false) then
    raise exception 'not authorized: the Admin Log requires the super_admin or manager role'
      using errcode = '42501';
  end if;
  return query
    select l.id, l.at, l.actor_id, l.actor_role, l.actor_name, l.action, l.target_table,
           l.target_id, l.own_row, l.changes, l.source, l.reason
      from admin.audit_log l
     where (p_actor is null or l.actor_id = p_actor)
       and (p_table is null or l.target_table = p_table)
       and (p_action is null or l.action = p_action)
       and (p_from is null or l.at >= p_from)
       and (p_to is null or l.at < p_to)
       and (p_before_id is null or l.id < p_before_id)
     order by l.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$function$;
revoke all on function public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer) from public, anon;
grant execute on function public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer) to authenticated, service_role;

-- ── 2: subscription changes that keep the vendor's plan consistent ───────────
create or replace function public.admin_subscription_change_plan(p_subscription_id uuid, p_plan_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub  public.vendor_subscriptions;
  v_plan public.subscription_plans;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: changing a vendor''s plan requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required to change a vendor''s plan' using errcode = '22023';
  end if;

  select * into v_sub from public.vendor_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'no subscription %', p_subscription_id using errcode = 'P0002';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found then
    raise exception 'unknown plan %', p_plan_id using errcode = '22023';
  end if;
  if v_plan.id = 'free' then
    raise exception 'to move a vendor to Free, cancel the subscription instead' using errcode = '22023';
  end if;
  if v_plan.id = v_sub.plan_id then
    raise exception 'this subscription is already on the % plan', v_plan.name using errcode = 'P0001';
  end if;

  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);

  update public.vendor_subscriptions set plan_id = v_plan.id, updated_at = now() where id = v_sub.id;

  -- The plan cached on vendor_profiles (trust seal, search boost) follows while the
  -- subscription is running. A lapsed row keeps the vendor on Free until they pay.
  if v_sub.status = 'active' and v_sub.current_period_end > now() then
    update public.vendor_profiles
       set plan_id = v_plan.id, plan_expires_at = v_sub.current_period_end
     where id = v_sub.vendor_id;
  end if;

  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(
    v_sub.vendor_id, 'subscription_changed', 'Your plan was changed',
    format('Cosora moved your subscription to the %s plan. Your current period end is unchanged.', v_plan.name),
    null);
end;
$function$;

create or replace function public.admin_subscription_cancel(p_subscription_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.vendor_subscriptions;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: canceling a subscription requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required to cancel a subscription' using errcode = '22023';
  end if;

  select * into v_sub from public.vendor_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'no subscription %', p_subscription_id using errcode = 'P0002';
  end if;
  if v_sub.status in ('canceled', 'expired') then
    raise exception 'this subscription is already %', v_sub.status using errcode = 'P0001';
  end if;

  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);

  update public.vendor_subscriptions
     set status = 'canceled',
         auto_renew = false,
         current_period_end = case when current_period_end > now() then now() else current_period_end end,
         updated_at = now()
   where id = v_sub.id;

  -- The trust seal and search boost end with the plan.
  update public.vendor_profiles
     set plan_expires_at = now()
   where id = v_sub.vendor_id
     and plan_expires_at > now();

  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(
    v_sub.vendor_id, 'subscription_canceled', 'Your subscription was canceled',
    'Cosora canceled your subscription, so your plan has ended. Contact support if you think this is a mistake.',
    null);
end;
$function$;

revoke all on function public.admin_subscription_change_plan(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_subscription_cancel(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_subscription_change_plan(uuid, text, text) to authenticated;
grant execute on function public.admin_subscription_cancel(uuid, text) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'admin' and table_name = 'audit_log' and column_name = 'reason') then
    raise exception 'self-check: admin.audit_log.reason missing';
  end if;
  if (select prosrc from pg_proc where oid = 'admin.audit_row_change()'::regprocedure) !~ 'cosora.audit_reason' then
    raise exception 'self-check: audit_row_change() does not record the reason';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer)'::regprocedure
                  and pg_get_function_result(p.oid) ~ 'reason text') then
    raise exception 'self-check: admin_audit_log_list() does not return reason';
  end if;
  foreach f in array array[
    'public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer)',
    'public.admin_subscription_change_plan(uuid, text, text)',
    'public.admin_subscription_cancel(uuid, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: authenticated cannot execute %', f;
    end if;
  end loop;
  -- Every table the panel writes still carries the audit trigger, pointing at this function.
  if exists (select 1 from pg_trigger t where t.tgname = 'trg_admin_audit' and t.tgfoid <> 'admin.audit_row_change()'::regprocedure) then
    raise exception 'self-check: a trg_admin_audit points elsewhere';
  end if;
end
$check$;
