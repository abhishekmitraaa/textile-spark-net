-- Managers assign teammates' roles (Mitra, 2026-09-26).
--
-- A super admin grants the Manager role (MPF-26). A manager then adds, changes and
-- removes teammates in the five team roles:
--   product_moderator, vendor_ops, ads_moderator, finance_admin, support.
-- A manager never grants Super admin or Manager, never changes or removes a super
-- admin or another manager, and never changes their own access. Super admins and
-- the service role keep every power they had.
--
-- The team roles are listed by name, not as "everything but super_admin and
-- manager", so a role added to admin_role_type later is not assignable by a
-- manager until someone adds it here on purpose.
--
-- Every change a manager makes is in the Admin Log: trg_admin_audit on
-- admin.admin_users records it with actor_role 'manager'.

create or replace function admin.is_team_role(p_role public.admin_role_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_role in ('product_moderator', 'vendor_ops', 'ads_moderator', 'finance_admin', 'support')
$$;
revoke all on function admin.is_team_role(public.admin_role_type) from public;

-- ── admin_set_role: a manager moves a teammate between team roles ──
create or replace function public.admin_set_role(p_user_id uuid, p_role public.admin_role_type)
returns table(id uuid, admin_role public.admin_role_type, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_prev   public.admin_role_type;
  v_caller public.admin_role_type;  -- null for the service role
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    v_caller := public.admin_role();
    if v_caller is null or v_caller not in ('super_admin', 'manager') then
      raise exception 'not authorized: only a super_admin or a manager may change admin roles' using errcode = '42501';
    end if;
  end if;
  if p_user_id is null or p_role is null then
    raise exception 'p_user_id and p_role are required' using errcode = '22004';
  end if;

  -- Serialise against concurrent super_admin changes before counting them.
  perform 1 from admin.admin_users u where u.admin_role = 'super_admin' and u.is_active for update;
  select u.admin_role into v_prev from admin.admin_users u where u.id = p_user_id and u.is_active for update;
  if not found then
    raise exception 'not an active admin: %', p_user_id using errcode = 'P0002';
  end if;

  if v_caller = 'manager'
     and not (p_user_id <> auth.uid() and admin.is_team_role(v_prev) and admin.is_team_role(p_role)) then
    raise exception 'not authorized: a manager may only move teammates between the team roles' using errcode = '42501';
  end if;

  if v_prev = 'super_admin' and p_role <> 'super_admin'
     and not exists (select 1 from admin.admin_users u
                      where u.admin_role = 'super_admin' and u.is_active and u.id <> p_user_id) then
    raise exception 'refused: this would leave no active super_admin' using errcode = '42501';
  end if;

  update admin.admin_users u set admin_role = p_role where u.id = p_user_id;
  perform admin.shadow_admin_columns(p_user_id, true, p_role);

  return query select u.id, u.admin_role, u.is_active from admin.admin_users u where u.id = p_user_id;
end
$function$;

-- ── admin_grant: a manager adds a teammate in a team role ──
create or replace function public.admin_grant(p_user_id uuid, p_role public.admin_role_type)
returns table(id uuid, admin_role public.admin_role_type, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_prev        public.admin_role_type;
  v_prev_active boolean;
  v_caller      public.admin_role_type;  -- null for the service role
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    v_caller := public.admin_role();
    if v_caller is null or v_caller not in ('super_admin', 'manager') then
      raise exception 'not authorized: only a super_admin or a manager may grant admin access' using errcode = '42501';
    end if;
  end if;
  if p_user_id is null or p_role is null then
    raise exception 'p_user_id and p_role are required' using errcode = '22004';
  end if;
  if not exists (select 1 from auth.users au where au.id = p_user_id) then
    raise exception 'no such user: %', p_user_id using errcode = 'P0002';
  end if;

  perform 1 from admin.admin_users u where u.admin_role = 'super_admin' and u.is_active for update;
  select u.admin_role, u.is_active into v_prev, v_prev_active
    from admin.admin_users u where u.id = p_user_id for update;

  -- A grant to an active admin is a role change, so a manager may make it only
  -- where they could change the role: a teammate, into a team role, not themselves.
  if v_caller = 'manager'
     and not (p_user_id <> auth.uid() and admin.is_team_role(p_role)
              and (not coalesce(v_prev_active, false) or admin.is_team_role(v_prev))) then
    raise exception 'not authorized: a manager may only grant team roles, and not to a super_admin or manager' using errcode = '42501';
  end if;

  if coalesce(v_prev_active, false) and v_prev = 'super_admin' and p_role <> 'super_admin'
     and not exists (select 1 from admin.admin_users u
                      where u.admin_role = 'super_admin' and u.is_active and u.id <> p_user_id) then
    raise exception 'refused: this would leave no active super_admin' using errcode = '42501';
  end if;

  insert into admin.admin_users as u (id, admin_role, is_active, created_by)
  values (p_user_id, p_role, true, auth.uid())
  on conflict on constraint admin_users_pkey do update
    set admin_role = excluded.admin_role,
        is_active  = true,
        created_by = coalesce(auth.uid(), u.created_by);
  perform admin.shadow_admin_columns(p_user_id, true, p_role);

  return query select u.id, u.admin_role, u.is_active from admin.admin_users u where u.id = p_user_id;
end
$function$;

-- ── admin_revoke: a manager removes a teammate ──
create or replace function public.admin_revoke(p_user_id uuid)
returns table(id uuid, admin_role public.admin_role_type, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_prev        public.admin_role_type;
  v_prev_active boolean;
  v_caller      public.admin_role_type;  -- null for the service role
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    v_caller := public.admin_role();
    if v_caller is null or v_caller not in ('super_admin', 'manager') then
      raise exception 'not authorized: only a super_admin or a manager may revoke admin access' using errcode = '42501';
    end if;
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22004';
  end if;

  perform 1 from admin.admin_users u where u.admin_role = 'super_admin' and u.is_active for update;
  select u.admin_role, u.is_active into v_prev, v_prev_active
    from admin.admin_users u where u.id = p_user_id for update;

  if v_caller = 'manager'
     and (p_user_id = auth.uid() or (coalesce(v_prev_active, false) and not admin.is_team_role(v_prev))) then
    raise exception 'not authorized: a manager may only remove teammates in the team roles' using errcode = '42501';
  end if;

  if coalesce(v_prev_active, false) and v_prev = 'super_admin'
     and not exists (select 1 from admin.admin_users u
                      where u.admin_role = 'super_admin' and u.is_active and u.id <> p_user_id) then
    raise exception 'refused: this would leave no active super_admin' using errcode = '42501';
  end if;

  -- Idempotent: revoking a non-admin changes nothing and returns no row.
  update admin.admin_users u set is_active = false where u.id = p_user_id;
  perform admin.shadow_admin_columns(p_user_id, false, null);

  return query select u.id, u.admin_role, u.is_active from admin.admin_users u where u.id = p_user_id;
end
$function$;

-- ── admin_search_candidates: managers add existing accounts too ──
create or replace function public.admin_search_candidates(p_query text)
returns table(id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  if not coalesce(public.admin_role() in ('super_admin', 'manager'), false) then
    raise exception 'not authorized: super_admin or manager only' using errcode = '42501';
  end if;
  if length(v_q) < 3 then
    return;
  end if;
  return query
    select p.id, p.email, p.full_name
      from public.profiles p
     where p.email ilike '%' || v_q || '%'
       and not exists (select 1 from admin.admin_users au where au.id = p.id and au.is_active)
     order by p.email
     limit 10;
end
$function$;

-- Self-check: the helper names exactly the five team roles, and each of the four
-- functions now admits a manager.
do $check$
declare
  v_team text;
  v_fn   text;
begin
  select string_agg(r::text, ',' order by r::text) into v_team
    from unnest(enum_range(null::public.admin_role_type)) r where admin.is_team_role(r);
  if v_team is distinct from 'ads_moderator,finance_admin,product_moderator,support,vendor_ops' then
    raise exception 'is_team_role self-check failed: %', v_team;
  end if;
  foreach v_fn in array array['admin_set_role', 'admin_grant', 'admin_revoke', 'admin_search_candidates'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = v_fn and p.prosrc like '%''manager''%') then
      raise exception 'self-check failed: % does not admit a manager', v_fn;
    end if;
  end loop;
end
$check$;
