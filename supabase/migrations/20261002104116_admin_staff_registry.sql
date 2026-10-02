-- Staff registration (Andy, 2026-10-01; documentation/help-feature-plan.md D-10).
--
-- A manager or super admin registers a staff member in Cosora-Admin (Admins page)
-- with their name, personal email and phone. Cosora-Admin's `admin-staff` edge
-- function then creates the admin-panel account:
--   * a generated employee ID and work email (the work email is the sign-in name);
--   * a temporary password, sent to the personal email, which must be changed at
--     first sign-in (app_metadata.must_change_password).
-- Account creation needs the service role, so it lives in the function. This
-- migration holds the directory and the pieces the function calls.
--
-- The ID and email formats are interim (ToDo.md, "Settle the staff work-email and
-- employee-ID formats"). Change admin.staff_next_employee_id() and
-- admin.staff_work_email() when they're decided; existing rows keep theirs.
--
--   admin.staff_members               the directory, one row per registered staff account
--   admin.staff_next_employee_id()    EMP-0001, EMP-0002, …
--   admin.staff_work_email(name, id)  first.last@cosora.in, made unique
--   admin_staff_identifiers(...)      service_role: a fresh ID and work email
--   admin_staff_record(...)           service_role: writes the directory row
--   admin_staff_password_event(...)   service_role: a temporary password issued, or changed
--   admin_staff_get(user)             service_role: one row, for the function's checks
--   admin_staff_list()                super_admin and manager: the directory
--   admin_audit_record()              also records the directory's insert and update
--
-- Sign-in for buyers and vendors is untouched: this is the admin panel's existing
-- email + password sign-in. No phone number is set on these auth users, so the
-- phone sign-in (and the dummy OTP, which never opens admin accounts) can't reach
-- them.

-- ── 1. The directory ─────────────────────────────────────────────────────────
create sequence if not exists admin.staff_employee_seq;

create table if not exists admin.staff_members (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  employee_id             text not null unique check (employee_id ~ '^EMP-[0-9]{4,}$'),
  full_name               text not null check (char_length(btrim(full_name)) between 2 and 120),
  work_email              text not null unique
                          check (work_email = lower(work_email)
                                 and work_email ~ '^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  personal_email          text not null
                          check (char_length(personal_email) <= 254
                                 and personal_email ~ '^[^[:space:]@,()<>]+@[^[:space:]@,()<>]+\.[^[:space:]@,()<>]+$'),
  phone                   text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  registered_by           uuid references auth.users (id) on delete set null,
  registered_at           timestamptz not null default now(),
  temp_password_issued_at timestamptz,
  temp_password_delivery  text check (temp_password_delivery in ('email', 'shown')),
  password_changed_at     timestamptz
);

-- One registration per person: the same personal email can't be registered twice.
create unique index if not exists staff_members_personal_email_key
  on admin.staff_members (lower(personal_email));
create index if not exists staff_members_registered_by_idx
  on admin.staff_members (registered_by);

alter table admin.staff_members enable row level security;
revoke all on admin.staff_members from public, anon, authenticated;
revoke all on sequence admin.staff_employee_seq from public, anon, authenticated;

comment on table admin.staff_members is
  'Staff registered from Cosora-Admin (admin-staff edge function): employee ID, work email (the admin-panel sign-in), personal contact, temporary-password state. No client grants; read through admin_staff_list().';

-- ── 2. The generators (interim formats, ToDo.md) ─────────────────────────────
create or replace function admin.staff_next_employee_id()
returns text language sql volatile set search_path = '' as $function$
  select 'EMP-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end
  from (select nextval('admin.staff_employee_seq') as n) s;
$function$;

-- first.last@cosora.in from the name: lowercase ASCII letters only, common Latin
-- accents folded (é → e), first and last word. A one-word name gives first@…; a
-- name with no Latin letters (for example written in Devanagari) gives the
-- employee ID (emp0001@…). Taken addresses, in auth.users or the directory, get
-- 2, 3, … appended to the local part.
create or replace function admin.staff_work_email(p_full_name text, p_employee_id text)
returns text language plpgsql stable set search_path = '' as $function$
declare
  v_words text[];
  v_local text;
  v_try   text;
  v_n     int := 1;
begin
  v_words := array_remove(
    regexp_split_to_array(
      regexp_replace(
        translate(lower(coalesce(p_full_name, '')),
                  'áàâäãåāăąéèêëēėęíìîïīįóòôöõøōúùûüūůñńçćčšśžźżýÿ',
                  'aaaaaaaaaeeeeeeeiiiiiiooooooouuuuuunncccsszzzyy'),
        '[^a-z[:space:]]+', '', 'g'),
      '[[:space:]]+'),
    '');

  if coalesce(array_length(v_words, 1), 0) = 0 then
    v_local := lower(replace(p_employee_id, '-', ''));
  elsif array_length(v_words, 1) = 1 then
    v_local := v_words[1];
  else
    v_local := v_words[1] || '.' || v_words[array_length(v_words, 1)];
  end if;
  v_local := left(v_local, 48);

  loop
    v_try := v_local || case when v_n = 1 then '' else v_n::text end || '@cosora.in';
    exit when not exists (select 1 from auth.users u where lower(u.email) = v_try)
          and not exists (select 1 from admin.staff_members s where s.work_email = v_try);
    v_n := v_n + 1;
  end loop;
  return v_try;
end
$function$;

revoke all on function admin.staff_next_employee_id() from public, anon, authenticated;
revoke all on function admin.staff_work_email(text, text) from public, anon, authenticated;

-- ── 3. What the admin-staff edge function calls (service_role only) ──────────
create function public.admin_staff_identifiers(p_full_name text, p_personal_email text)
returns table (employee_id text, work_email text)
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_existing text;
  v_id       text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_staff_identifiers is for the admin-staff edge function only' using errcode = '42501';
  end if;
  select s.employee_id into v_existing
    from admin.staff_members s where lower(s.personal_email) = lower(btrim(p_personal_email));
  if v_existing is not null then
    raise exception 'this personal email is already registered as %', v_existing
      using errcode = '23505', hint = 'already_registered';
  end if;
  v_id := admin.staff_next_employee_id();
  return query select v_id, admin.staff_work_email(p_full_name, v_id);
end
$function$;

create function public.admin_staff_record(
  p_user_id uuid, p_employee_id text, p_full_name text, p_work_email text,
  p_personal_email text, p_phone text, p_registered_by uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_staff_record is for the admin-staff edge function only' using errcode = '42501';
  end if;
  insert into admin.staff_members
    (user_id, employee_id, full_name, work_email, personal_email, phone, registered_by)
  values
    (p_user_id, p_employee_id, btrim(p_full_name), lower(p_work_email), btrim(p_personal_email), p_phone, p_registered_by);
end
$function$;

-- 'issued': a temporary password was set, and how it reached the person ('email', or
-- 'shown' once to the registrar because the email couldn't go). 'changed': the
-- person chose their own at first sign-in.
create function public.admin_staff_password_event(p_user_id uuid, p_event text, p_delivery text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_staff_password_event is for the admin-staff edge function only' using errcode = '42501';
  end if;
  if p_event = 'issued' then
    if p_delivery is null or p_delivery not in ('email', 'shown') then
      raise exception 'p_delivery must be email or shown' using errcode = '22023';
    end if;
    update admin.staff_members
       set temp_password_issued_at = now(), temp_password_delivery = p_delivery, password_changed_at = null
     where user_id = p_user_id;
  elsif p_event = 'changed' then
    update admin.staff_members set password_changed_at = now() where user_id = p_user_id;
  else
    raise exception 'unknown event %', p_event using errcode = '22023';
  end if;
  if not found then
    raise exception 'not a registered staff account' using errcode = 'P0002';
  end if;
end
$function$;

create function public.admin_staff_get(p_user_id uuid)
returns table (user_id uuid, employee_id text, full_name text, work_email text, personal_email text,
               admin_role public.admin_role_type, is_active boolean)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_staff_get is for the admin-staff edge function only' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.employee_id, s.full_name, s.work_email, s.personal_email, u.admin_role, u.is_active
      from admin.staff_members s
      left join admin.admin_users u on u.id = s.user_id
     where s.user_id = p_user_id;
end
$function$;

revoke all on function public.admin_staff_identifiers(text, text) from public, anon, authenticated;
revoke all on function public.admin_staff_record(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_staff_password_event(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_staff_get(uuid) from public, anon, authenticated;
grant execute on function public.admin_staff_identifiers(text, text) to service_role;
grant execute on function public.admin_staff_record(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.admin_staff_password_event(uuid, text, text) to service_role;
grant execute on function public.admin_staff_get(uuid) to service_role;

-- ── 4. The directory, for the Admins page (super_admin and manager) ──────────
create function public.admin_staff_list()
returns table (
  user_id uuid, employee_id text, full_name text, work_email text, personal_email text, phone text,
  admin_role public.admin_role_type, is_active boolean, registered_at timestamptz, registered_by_name text,
  temp_password_issued_at timestamptz, temp_password_delivery text, password_changed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if coalesce(public.admin_role()::text, '') not in ('super_admin', 'manager') then
    raise exception 'not authorized: the staff directory is for super admins and managers' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.employee_id, s.full_name, s.work_email, s.personal_email, s.phone,
           u.admin_role, coalesce(u.is_active, false), s.registered_at,
           admin.audit_actor_name(s.registered_by),
           s.temp_password_issued_at, s.temp_password_delivery, s.password_changed_at
      from admin.staff_members s
      left join admin.admin_users u on u.id = s.user_id
     order by s.registered_at desc;
end
$function$;

revoke all on function public.admin_staff_list() from public, anon;
grant execute on function public.admin_staff_list() to authenticated;

-- ── 5. The Admin Log records registrations and password resets ──────────────
-- The function writes them through admin_audit_record() with the registrar as the
-- actor: a registration as an 'insert' on admin.staff_members, a new temporary
-- password as an 'update'. Both actions are already in audit_log_action_check, so
-- the table isn't touched. The password itself is never logged. The audit
-- trigger isn't added to admin.staff_members: it skips service-role writes, which
-- are the only writes there.
do $guard$
begin
  -- The body read on 2026-10-01; only its action list changes below.
  if md5((select prosrc from pg_proc
           where oid = 'public.admin_audit_record(uuid,text,text,text,jsonb,text)'::regprocedure))
     <> 'd4e4344eab827625eecc9166fb84c2f4' then
    raise exception 'admin_audit_record changed since it was read; re-read it before patching';
  end if;
end
$guard$;

create or replace function public.admin_audit_record(
  p_actor uuid, p_action text, p_target_table text, p_target_id text, p_changes jsonb, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.admin_role_type;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_audit_record is for the admin edge functions only' using errcode = '42501';
  end if;
  if not (p_action in ('invite', 'refund')
          or (p_action in ('insert', 'update') and p_target_table = 'admin.staff_members')) then
    raise exception 'unknown audit action % on %', p_action, p_target_table using errcode = '22023';
  end if;
  select u.admin_role into v_role from admin.admin_users u where u.id = p_actor;
  insert into admin.audit_log
    (actor_id, actor_role, actor_name, action, target_table, target_id, changes, source)
  values
    (p_actor, v_role, admin.audit_actor_name(p_actor), p_action, p_target_table, p_target_id,
     p_changes, coalesce(nullif(p_source, ''), 'edge-function'));
end;
$function$;

-- ── 6. Self-check ────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if (select relrowsecurity from pg_class where oid = 'admin.staff_members'::regclass) is not true then
    raise exception 'admin.staff_members must have RLS on';
  end if;
  if has_table_privilege('authenticated', 'admin.staff_members', 'SELECT')
     or has_table_privilege('anon', 'admin.staff_members', 'SELECT') then
    raise exception 'admin.staff_members must not be readable by a client role';
  end if;
  foreach f in array array[
    'public.admin_staff_identifiers(text,text)',
    'public.admin_staff_record(uuid,text,text,text,text,text,uuid)',
    'public.admin_staff_password_event(uuid,text,text)',
    'public.admin_staff_get(uuid)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% must be service_role only', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% must be executable by service_role', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.admin_staff_list()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_staff_list()', 'EXECUTE') then
    raise exception 'admin_staff_list must be for authenticated only';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'admin\_staff\_%') <> 5 then
    raise exception 'expected exactly five admin_staff_* functions (one overload each)';
  end if;
  if has_function_privilege('authenticated', 'public.admin_audit_record(uuid,text,text,text,jsonb,text)', 'EXECUTE') then
    raise exception 'admin_audit_record must stay service_role only';
  end if;
end
$check$;
