-- Staff registry check (2026-10-01): admin.staff_members, the ID and work-email
-- generators, the admin_staff_* functions and admin_audit_record's staff rows.
--
-- One DO block, run as postgres (MCP execute_sql). It changes rows only inside its
-- own transaction and ends with RAISE EXCEPTION, so nothing is kept; the result is
-- the exception text. To rehearse the migration, paste it above this block in the
-- same call.
--
-- Fixtures, all rolled back: demo-vendor (2222…) is made a manager and demo-buyer
-- (1111…) a support admin, and demo-buyer stands in for a registered staff account.

do $t$
declare
  buyer   constant uuid := '11111111-1111-1111-1111-111111111111';
  vendor  constant uuid := '22222222-2222-2222-2222-222222222222';
  results text[] := '{}';
  fails   int := 0;
  r       record;
  v_text  text;
  v_n     int;
begin
  -- Fixture roles.
  insert into admin.admin_users (id, admin_role, is_active) values (vendor, 'manager', true)
    on conflict (id) do update set admin_role = 'manager', is_active = true;
  insert into admin.admin_users (id, admin_role, is_active) values (buyer, 'support', true)
    on conflict (id) do update set admin_role = 'support', is_active = true;

  -- ── As the service role (the edge function) ──────────────────────────────
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- S1 a two-word name
  select * into r from public.admin_staff_identifiers('  Asha   Patel ', 'asha.personal@example.com');
  if r.employee_id ~ '^EMP-[0-9]{4,}$' and r.work_email = 'asha.patel@cosora.in' then
    results := results || format('S1 ok %s %s', r.employee_id, r.work_email);
  else fails := fails + 1; results := results || format('S1 FAIL %s %s', r.employee_id, r.work_email); end if;

  -- S2 accents fold
  select * into r from public.admin_staff_identifiers('José Ñúñez', 'jose@example.com');
  if r.work_email = 'jose.nunez@cosora.in' then results := results || 'S2 ok'::text;
  else fails := fails + 1; results := results || ('S2 FAIL ' || r.work_email); end if;

  -- S3 no Latin letters: the employee ID
  select * into r from public.admin_staff_identifiers('आशा पटेल', 'asha2@example.com');
  if r.work_email = lower(replace(r.employee_id, '-', '')) || '@cosora.in' then results := results || ('S3 ok ' || r.work_email);
  else fails := fails + 1; results := results || ('S3 FAIL ' || r.work_email); end if;

  -- S4 one word; three words use first and last
  select * into r from public.admin_staff_identifiers('Madhuri', 'm@example.com');
  v_text := r.work_email;
  select * into r from public.admin_staff_identifiers('Ravi Kumar Sharma', 'r@example.com');
  if v_text = 'madhuri@cosora.in' and r.work_email = 'ravi.sharma@cosora.in' then results := results || 'S4 ok'::text;
  else fails := fails + 1; results := results || format('S4 FAIL %s %s', v_text, r.work_email); end if;

  -- S5 record a row (demo-buyer stands in), then the same name is made unique
  perform public.admin_staff_record(buyer, 'EMP-9999', 'Asha Patel', 'asha.patel@cosora.in',
                                    'Asha.Personal@example.com', '+919876543210', vendor);
  select * into r from public.admin_staff_identifiers('Asha Patel', 'someone.else@example.com');
  if r.work_email = 'asha.patel2@cosora.in' then results := results || 'S5 ok'::text;
  else fails := fails + 1; results := results || ('S5 FAIL ' || r.work_email); end if;

  -- S7 the same personal email again (any case) is refused
  begin
    perform public.admin_staff_identifiers('Asha P', 'ASHA.personal@example.com');
    fails := fails + 1; results := results || 'S7 FAIL accepted'::text;
  exception when unique_violation then
    get stacked diagnostics v_text = pg_exception_hint;
    if v_text = 'already_registered' then results := results || 'S7 ok'::text;
    else fails := fails + 1; results := results || ('S7 FAIL hint ' || coalesce(v_text, 'null')); end if;
  end;

  -- S8 password events
  perform public.admin_staff_password_event(buyer, 'issued', 'shown');
  execute 'reset role';  -- the service role can't read the admin schema; postgres checks
  select temp_password_delivery, password_changed_at is null as pending into r
    from admin.staff_members where user_id = buyer;
  if r.temp_password_delivery = 'shown' and r.pending then results := results || 'S8a ok'::text;
  else fails := fails + 1; results := results || 'S8a FAIL'::text; end if;
  execute 'set local role service_role';
  perform public.admin_staff_password_event(buyer, 'changed');
  execute 'reset role';
  if (select password_changed_at is not null from admin.staff_members where user_id = buyer) then results := results || 'S8b ok'::text;
  else fails := fails + 1; results := results || 'S8b FAIL'::text; end if;
  execute 'set local role service_role';
  begin
    perform public.admin_staff_password_event(buyer, 'bogus');
    fails := fails + 1; results := results || 'S8c FAIL accepted'::text;
  exception when sqlstate '22023' then results := results || 'S8c ok'::text;
  end;
  begin
    perform public.admin_staff_password_event(vendor, 'changed');
    fails := fails + 1; results := results || 'S8d FAIL accepted'::text;
  exception when sqlstate 'P0002' then results := results || 'S8d ok'::text;
  end;
  begin
    perform public.admin_staff_password_event(buyer, 'issued', 'sms');
    fails := fails + 1; results := results || 'S8e FAIL accepted'::text;
  exception when sqlstate '22023' then results := results || 'S8e ok'::text;
  end;

  -- S9 admin_staff_get carries the role
  select * into r from public.admin_staff_get(buyer);
  if r.employee_id = 'EMP-9999' and r.admin_role = 'support' and r.is_active then results := results || 'S9 ok'::text;
  else fails := fails + 1; results := results || 'S9 FAIL'::text; end if;

  -- S10 the Admin Log takes the directory's insert and update, and no other new rows
  perform public.admin_audit_record(vendor, 'insert', 'admin.staff_members', buyer::text,
                                    '{"employee_id":"EMP-9999"}'::jsonb, 'edge:admin-staff');
  perform public.admin_audit_record(vendor, 'update', 'admin.staff_members', buyer::text,
                                    '{"temporary_password":"reissued"}'::jsonb, 'edge:admin-staff');
  begin
    perform public.admin_audit_record(vendor, 'update', 'public.profiles', 'y', '{}'::jsonb, 'z');
    fails := fails + 1; results := results || 'S10 FAIL an update on another table accepted'::text;
  exception when sqlstate '22023' then results := results || 'S10a ok'::text;
  end;
  perform public.admin_audit_record(vendor, 'invite', 'admin.admin_users', buyer::text, '{}'::jsonb, 'edge:admin-invite');
  execute 'reset role';
  select count(*) into v_n from admin.audit_log
   where actor_id = vendor and target_table = 'admin.staff_members' and action in ('insert', 'update') and at >= now() - interval '1 minute';
  if v_n = 2 then results := results || 'S10b ok'::text; else fails := fails + 1; results := results || ('S10b FAIL rows ' || v_n); end if;

  -- ── As signed-in accounts ────────────────────────────────────────────────
  -- S11 a signed-in caller can't use the service-role functions
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_staff_identifiers('A B', 'ab@example.com');
    fails := fails + 1; results := results || 'S11 FAIL identifiers'::text;
  exception when insufficient_privilege then results := results || 'S11a ok'::text;
  end;
  begin
    perform public.admin_staff_record(vendor, 'EMP-9998', 'A B', 'a.b@cosora.in', 'ab@example.com', '+911234567890', vendor);
    fails := fails + 1; results := results || 'S11 FAIL record'::text;
  exception when insufficient_privilege then results := results || 'S11b ok'::text;
  end;
  begin
    perform public.admin_audit_record(vendor, 'register', 'x', 'y', '{}'::jsonb, 'z');
    fails := fails + 1; results := results || 'S11 FAIL audit'::text;
  exception when insufficient_privilege then results := results || 'S11c ok'::text;
  end;
  begin
    perform 1 from admin.staff_members;
    fails := fails + 1; results := results || 'S11 FAIL table read'::text;
  exception when insufficient_privilege then results := results || 'S11d ok'::text;
  end;

  -- S12 the manager reads the directory
  select count(*) into v_n from public.admin_staff_list() where employee_id = 'EMP-9999' and personal_email = 'Asha.Personal@example.com';
  if v_n = 1 then results := results || 'S12 ok'::text; else fails := fails + 1; results := results || ('S12 FAIL ' || v_n); end if;

  -- S13 support is refused
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_staff_list();
    fails := fails + 1; results := results || 'S13 FAIL support read the directory'::text;
  exception when insufficient_privilege then results := results || 'S13 ok'::text;
  end;
  execute 'reset role';

  -- S14 signed out is refused
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.admin_staff_list();
    fails := fails + 1; results := results || 'S14 FAIL anon'::text;
  exception when insufficient_privilege then results := results || 'S14 ok'::text;
  end;
  execute 'reset role';

  raise exception 'STAFF REGISTRY CHECK: % failed of %. %', fails, array_length(results, 1), array_to_string(results, ' | ');
end
$t$;
