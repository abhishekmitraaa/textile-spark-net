-- Admin completion, Phase 1c (Mitra, 2026-09-27): guards inside the admin RPCs.
--
-- 1. set_account_status(): an admin never changes their own account's status, and
--    only a super admin changes another admin's. Until now a Support account could
--    suspend a super admin, or itself.
-- 2. request_ad_changes(): a note is required. The vendor is asked to change their
--    campaign, and a reason code alone doesn't say what to change. The panel's
--    form already required it; the database now agrees.
-- 3. admin_flag_pattern_add() / admin_flag_pattern_update() (when switching a
--    pattern on): a pattern that matches an empty message, or 2 or more of 12
--    ordinary business messages, is refused, and patterns are capped at 200
--    characters. A pattern like `.*` flags every new message and locks every
--    chat (reproduced 2026-09-26). A malformed regex is still refused by the
--    table's CHECK, in Postgres's own words.
-- 4. certificate_dispatch(): the role check runs first. It used to check the
--    delivery address first, so an unauthorised caller learned whether a vendor
--    had an address on file.
-- 5. admin_list_admins(): super admins and managers only (the Admins page's
--    audience). It returned every admin's email and name to every admin role.
-- 6. ad_bump_window(): a pinned search_path (security advisor,
--    function_search_path_mutable).

-- ── Pre-check: patch exactly the bodies read on 2026-09-27 ────────────────────
do $pre$
declare
  v_expected jsonb := '{
    "set_account_status":        "a33750431c7db693858b0952e86383f7",
    "request_ad_changes":        "6a0c7a29a131b2813749ddd5dff4f27c",
    "admin_flag_pattern_add":    "016860309bdce9aacb3a15117e20c2c1",
    "admin_flag_pattern_update": "a4302a61a272dbc3dda293ef28d1e8e0",
    "certificate_dispatch":      "3ff2072fe708eb482575f75bb46e20df",
    "admin_list_admins":         "39e38354e9e6df7c7fc2b970e3960c2d",
    "ad_bump_window":            "8595a7e20fb8845f2dea2c5eee239245"
  }';
  k text;
  v_md5 text;
begin
  for k in select jsonb_object_keys(v_expected) loop
    select md5(p.prosrc) into v_md5
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = k;
    if v_md5 is distinct from v_expected ->> k then
      raise exception 'pre-check: public.% has changed since it was read (md5 %, expected %)', k, v_md5, v_expected ->> k;
    end if;
  end loop;
end
$pre$;

-- ── 1: set_account_status ────────────────────────────────────────────────────
create or replace function public.set_account_status(p_profile_id uuid, p_new_status account_status_type, p_reason_id uuid, p_source text, p_conversation_review_id uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: changing account status requires the support or super_admin role';
  end if;

  -- An admin never changes their own account, and only a super admin changes
  -- another admin's (admin completion, Phase 1c).
  if p_profile_id = auth.uid() then
    raise exception 'You cannot change the status of your own account'
      using errcode = '42501';
  end if;
  if exists (select 1 from admin.admin_users u where u.id = p_profile_id and u.is_active)
     and public.admin_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can change the status of an admin''s account'
      using errcode = '42501';
  end if;

  -- 'deleted' is terminal and has one writer, anonymize_account() (account
  -- deletion, 2026-09-23). Without this, the else branch below would set a
  -- deleted account back to 'active'.
  if p_new_status = 'deleted'
     or exists (select 1 from public.profiles where id = p_profile_id and account_status = 'deleted') then
    raise exception 'account % is deleted, or this call would delete it: only the account-deletion flow sets that status', p_profile_id
      using errcode = '42501';
  end if;

  if p_new_status = 'suspended' then
    insert into admin.account_suspensions
      (profile_id, reason_id, source, conversation_review_id, suspended_by)
    values
      (p_profile_id, p_reason_id, p_source, p_conversation_review_id, auth.uid());

    update public.profiles set account_status = 'suspended' where id = p_profile_id;
  else
    update admin.account_suspensions
       set reinstated_by = auth.uid(),
           reinstated_at = now(),
           active        = false
     where profile_id = p_profile_id
       and active;

    update public.profiles set account_status = 'active' where id = p_profile_id;
  end if;

  if not found then
    raise exception 'profile % not found', p_profile_id;
  end if;

  if p_new_status = 'suspended' then
    perform public.notify(
      p_profile_id,
      'account_suspended',
      'Your account has been suspended',
      'You cannot send messages or place calls while your account is suspended. '
      || 'Contact support if you think this is a mistake.'
    );
  else
    perform public.notify(
      p_profile_id,
      'account_reinstated',
      'Your account is active again',
      'You can message and call as normal.'
    );
  end if;
end;
$function$;

-- ── 2: request_ad_changes needs a note ───────────────────────────────────────
create or replace function public.request_ad_changes(p_ad_id uuid, p_reason_code text, p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: requesting changes requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required to request changes' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'a note is required to request changes: tell the vendor what to change' using errcode = '22023';
  end if;

  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur <> 'pending_review' then
    raise exception 'campaign % is %, changes can only be requested on a pending_review campaign', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, 'changes_requested', 'changes_requested', p_reason_code, p_note, auth.uid(),
    'Your campaign needs changes before it can run', coalesce(p_note, p_reason_code));
end $function$;

-- ── 3: flag pattern breadth ──────────────────────────────────────────────────
create or replace function admin.flag_pattern_breadth_problem(p_pattern text)
returns text
language plpgsql
stable
set search_path = ''
as $function$
declare
  -- Ordinary messages on a sourcing marketplace. A pattern meant to catch
  -- contact details or off-platform requests matches none of them.
  v_samples text[] := array[
    'Hi, is this still available?',
    'What is the MOQ for this fabric?',
    'Please share your best price for 500 metres.',
    'Can you send samples to Delhi?',
    'Thank you, I will confirm by Monday.',
    'Do you have this in navy blue?',
    'What is the lead time for 2000 pieces?',
    'Okay',
    'Namaste ji, rate kya hai?',
    'The GSM should be around 180.',
    'Payment will be done after inspection.',
    'Sending the tech pack now.'];
  v_hits  int := 0;
  v_first text;
  s text;
begin
  if p_pattern is null then
    return null;  -- the table's NOT NULL reports it
  end if;
  if length(p_pattern) > 200 then
    return 'A pattern can be at most 200 characters';
  end if;
  begin
    if '' ~* p_pattern then
      return 'This pattern matches an empty message, so it would flag every chat. Make it more specific.';
    end if;
    foreach s in array v_samples loop
      if s ~* p_pattern then
        v_hits := v_hits + 1;
        v_first := coalesce(v_first, s);
      end if;
    end loop;
  exception when invalid_regular_expression then
    return null;  -- the table's CHECK refuses a malformed regex in Postgres's own words
  end;
  if v_hits >= 2 then
    return format('This pattern matches %s of %s ordinary business messages (for example "%s"), so it would lock most chats. Make it more specific.',
                  v_hits, array_length(v_samples, 1), v_first);
  end if;
  return null;
end
$function$;
revoke all on function admin.flag_pattern_breadth_problem(text) from public, anon, authenticated;

create or replace function public.admin_flag_pattern_add(p_pattern text, p_label text, p_active boolean default true)
 returns table(id uuid, pattern text, label text, active boolean, added_by uuid, created_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_id uuid;
  v_problem text;
begin
  -- Gate = flag_patterns_insert WITH CHECK (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Adding a flag pattern requires the support or super_admin role'
      using errcode = '42501';
  end if;

  -- A pattern that would match ordinary messages locks every chat it touches.
  v_problem := admin.flag_pattern_breadth_problem(p_pattern);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;

  -- flag_patterns_pattern_valid still refuses a malformed regex with Postgres's
  -- own message (the panel surfaces it verbatim), exactly as a direct insert.
  insert into admin.flag_patterns as f (pattern, label, active, added_by)
  values (p_pattern, p_label, coalesce(p_active, true), auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.pattern, f.label, f.active, f.added_by, f.created_at
      from admin.flag_patterns f
     where f.id = v_id;
end
$function$;

create or replace function public.admin_flag_pattern_update(p_id uuid, p_active boolean)
 returns table(id uuid, active boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_pattern text;
  v_problem text;
begin
  -- Gate = flag_patterns_update USING = WITH CHECK (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Changing a flag pattern requires the support or super_admin role'
      using errcode = '42501';
  end if;

  if p_active is null then
    raise exception 'p_active is required' using errcode = '22023';
  end if;

  -- Switching a pattern on applies the same breadth rule as adding one.
  if p_active then
    select f.pattern into v_pattern from admin.flag_patterns f where f.id = p_id;
    v_problem := admin.flag_pattern_breadth_problem(v_pattern);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = '22023';
    end if;
  end if;

  return query
    update admin.flag_patterns f set active = p_active where f.id = p_id
    returning f.id, f.active;
end
$function$;

-- ── 4: certificate_dispatch checks the role first ────────────────────────────
create or replace function public.certificate_dispatch(p_ad_certificate_id uuid, p_courier text, p_tracking text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.certificate_orders;
begin
  -- Role first: an unauthorised caller learns nothing about the order.
  if not public.certificate_fulfiller() then
    raise exception 'not authorized: certificate fulfilment requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_courier), '') = '' or coalesce(btrim(p_tracking), '') = '' then
    raise exception 'a dispatched parcel needs both a courier and a tracking number'
      using errcode = '22023';
  end if;
  select * into c from public.certificate_orders where id = p_ad_certificate_id;
  if found and (coalesce(btrim(c.address_line), '') = '' or coalesce(btrim(c.postal_code), '') = '') then
    raise exception 'this vendor had no delivery address on file when they ordered - collect one before dispatch'
      using errcode = '22023';
  end if;
  return public.certificate_apply(
    p_ad_certificate_id, 'dispatched', array['printed'],
    btrim(p_courier), btrim(p_tracking), null,
    'Your certificate is on its way',
    'Courier: ' || btrim(p_courier) || ' - Tracking: ' || btrim(p_tracking));
end $function$;

-- ── 5: the admin roster is for super admins and managers ─────────────────────
create or replace function public.admin_list_admins()
 returns table(id uuid, email text, full_name text, admin_role admin_role_type)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['super_admin', 'manager']::public.admin_role_type[]), false) then
    raise exception 'not authorized: the admin roster is for super admins and managers' using errcode = '42501';
  end if;
  return query
    select au.id, p.email, p.full_name, au.admin_role
      from admin.admin_users au
      join public.profiles p on p.id = au.id
     where au.is_active
     order by au.admin_role, p.email;
end
$function$;

-- ── 6: ad_bump_window ────────────────────────────────────────────────────────
alter function public.ad_bump_window() set search_path = '';

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.set_account_status(uuid, account_status_type, uuid, text, uuid)'::regprocedure;
  if v_src !~ 'You cannot change the status of your own account' or v_src !~ 'Only a super admin can change the status' then
    raise exception 'self-check: set_account_status guards missing';
  end if;
  if (select prosrc from pg_proc where oid = 'public.request_ad_changes(uuid, text, text)'::regprocedure) !~ 'a note is required' then
    raise exception 'self-check: request_ad_changes note guard missing';
  end if;
  if (select prosrc from pg_proc where oid = 'public.admin_flag_pattern_add(text, text, boolean)'::regprocedure) !~ 'flag_pattern_breadth_problem'
     or (select prosrc from pg_proc where oid = 'public.admin_flag_pattern_update(uuid, boolean)'::regprocedure) !~ 'flag_pattern_breadth_problem' then
    raise exception 'self-check: flag pattern breadth guard missing';
  end if;
  if position('certificate_fulfiller' in (select prosrc from pg_proc where oid = 'public.certificate_dispatch(uuid, text, text)'::regprocedure))
     > position('courier' in (select prosrc from pg_proc where oid = 'public.certificate_dispatch(uuid, text, text)'::regprocedure)) then
    raise exception 'self-check: certificate_dispatch does not check the role first';
  end if;
  if (select prosrc from pg_proc where oid = 'public.admin_list_admins()'::regprocedure) !~ 'manager' then
    raise exception 'self-check: admin_list_admins gate missing';
  end if;

  -- The breadth rule: refuses the broad, keeps the specific, and every live pattern passes.
  if admin.flag_pattern_breadth_problem('.*') is null
     or admin.flag_pattern_breadth_problem('\d+') is null
     or admin.flag_pattern_breadth_problem('\ybank transfer\y') is not null
     or admin.flag_pattern_breadth_problem('(') is not null
     or exists (select 1 from admin.flag_patterns f where f.active and admin.flag_pattern_breadth_problem(f.pattern) is not null) then
    raise exception 'self-check: flag_pattern_breadth_problem misjudges a pattern';
  end if;

  -- No client role may call the helper; the patched functions keep their grants.
  if has_function_privilege('anon', 'admin.flag_pattern_breadth_problem(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'admin.flag_pattern_breadth_problem(text)', 'EXECUTE') then
    raise exception 'self-check: flag_pattern_breadth_problem is client-callable';
  end if;
  if not has_function_privilege('authenticated', 'public.set_account_status(uuid, account_status_type, uuid, text, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_list_admins()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.certificate_dispatch(uuid, text, text)', 'EXECUTE') then
    raise exception 'self-check: a patched function lost its authenticated grant';
  end if;

  if not exists (select 1 from pg_proc p, unnest(p.proconfig) c
                  where p.oid = 'public.ad_bump_window()'::regprocedure and c like 'search_path=%') then
    raise exception 'self-check: ad_bump_window has no pinned search_path';
  end if;
end
$check$;
