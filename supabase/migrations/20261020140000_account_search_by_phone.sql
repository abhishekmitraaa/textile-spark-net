-- Cosora-Admin › Accounts finds people by phone number (2026-10-20 admin audit, low list #16; Mitra: "go on
-- with the low list").
--
-- Sign-in is mobile + OTP only, so many buyers have no email and often no name, and a fraud report may give
-- nothing but a number. admin_profile_search matched name, email and exact id. It now also matches the
-- digits of the sign-in number (auth.users.phone, stored without "+") and the profile number
-- (profiles.phone): "+91 98765 43210", "98765-43210" and "9876543210" all find +919876543210. At least 6
-- digits, so a short run of digits can't list everyone.
--
-- The number is matched, never returned: the result columns are unchanged, so a search can't be used to
-- read numbers (Support reveals a number through the audited reveal-contact path).
--
-- The pre-check stops the file if admin_profile_search isn't 20261020120000's version.

do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.admin_profile_search(text,integer)'::regprocedure), chr(13), ''))
     <> '9f7ccc42a331bd33232e9440aace2267' then
    raise exception 'pre-check: public.admin_profile_search is not the version this migration was written against';
  end if;
end
$pin$;

CREATE OR REPLACE FUNCTION public.admin_profile_search(p_term text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, full_name text, email text, account_status account_status_type, active_role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_term   text := btrim(coalesce(p_term, ''));
  v_like   text;
  v_digits text;
begin
  if not coalesce(public.is_admin(), false)
     or public.admin_role() is null
     or public.admin_role() not in ('super_admin', 'support', 'manager') then
    raise exception 'Searching accounts requires the super admin, support or manager role' using errcode = '42501';
  end if;
  if length(v_term) < 2 then
    return;
  end if;
  -- % and _ in the term match themselves: "__" used to match every account.
  v_like := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- A phone search: the term is a number (digits with spaces, dashes, dots, brackets or a leading +).
  if v_term ~ '^\+?[0-9 ().-]+$' then
    v_digits := regexp_replace(v_term, '\D', '', 'g');
    if length(v_digits) < 6 then v_digits := null; end if;
  end if;
  return query
    select p.id, p.full_name, p.email, p.account_status, p.active_role, p.created_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.full_name ilike v_like
       or p.email ilike v_like
       or p.id::text = lower(v_term)
       or (v_digits is not null and (
             regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'
          or regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'))
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$function$;
