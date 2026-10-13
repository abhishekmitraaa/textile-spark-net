-- What the delivery team can do (2026-10-13). Certificate fulfilment is day-to-day dispatch
-- work, and until now only super admins and finance admins could do it: two roles with far
-- wider authority. The delivery team works the Certificates page and nothing else.
--
-- Three places name who fulfils certificates, and they change together here:
--   * certificate_fulfiller(): the gate inside every certificate_* write function
--     (mark printed, dispatch, delivered, returned, cancel);
--   * the certificate_orders_read policy: which admin roles read the orders;
--   * admin.is_team_role(): the roles a manager may give a teammate.
-- Cosora-Admin mirrors them in src/lib/roles.ts (SECTION_READ / SECTION_WRITE certificates,
-- TEAM_ROLES) and in the admin-invite and admin-staff functions. The database decides; the
-- roles file only hides buttons.
--
-- The delivery team reads certificate_orders only. An order carries the delivery address as
-- a snapshot taken at purchase, so the role needs no reader of vendors' private details.

create or replace function public.certificate_fulfiller()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.is_admin() and public.admin_role()
           in ('super_admin', 'finance_admin', 'delivery_team'), false);
$function$;

revoke all on function public.certificate_fulfiller() from public, anon, authenticated;

alter policy certificate_orders_read on public.certificate_orders
  using (
    coalesce(vendor_id = (select auth.uid()), false)
    or (
      coalesce((select public.is_admin()), false)
      and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'delivery_team']::public.admin_role_type[])
    )
  );

create or replace function admin.is_team_role(p_role public.admin_role_type)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_role in ('product_moderator', 'vendor_ops', 'ads_moderator', 'finance_admin', 'support', 'account_manager', 'delivery_team')
$function$;

-- Self-check.
do $check$
begin
  if not admin.is_team_role('delivery_team') or admin.is_team_role('super_admin') or admin.is_team_role('manager') then
    raise exception 'self-check: admin.is_team_role() is wrong';
  end if;
  if position('delivery_team' in (select prosrc from pg_proc where oid = 'public.certificate_fulfiller()'::regprocedure)) = 0 then
    raise exception 'self-check: certificate_fulfiller() does not admit the delivery team';
  end if;
  if position('delivery_team' in (select qual from pg_policies
                                    where schemaname = 'public' and tablename = 'certificate_orders'
                                      and policyname = 'certificate_orders_read')) = 0 then
    raise exception 'self-check: certificate_orders_read does not admit the delivery team';
  end if;
  if has_function_privilege('authenticated', 'public.certificate_fulfiller()', 'EXECUTE')
     or has_function_privilege('anon', 'public.certificate_fulfiller()', 'EXECUTE') then
    raise exception 'self-check: certificate_fulfiller() is callable by a browser role';
  end if;
end
$check$;
