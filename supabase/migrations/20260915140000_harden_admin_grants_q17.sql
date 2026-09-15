-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 2a: CLOSE Q-17 BEFORE TOUCHING IDENTITY.
--
-- Spec: documentation/admin-separation-spec.md (Q-17). Rolling context:
-- documentation/admin-separation-context.md.
--
-- THE HOLE (found in Phase 1, 2026-09-15; 0 affected rows today):
-- enforce_admin_grants() guards admin columns with
--
--   not (public.is_admin() and public.admin_role() = 'super_admin')
--
-- For a profile with is_admin = true and admin_role = NULL that expression is
-- `not (true and null)` = NULL, and plpgsql's `IF NULL` does not run the THEN
-- branch. So on UPDATE the "Only a super_admin may change admin status" raise is
-- skipped, and on INSERT the sanitising reset is skipped: a role-less admin
-- could change anyone's is_admin/admin_role, including their own. Proven live in
-- a rolled-back probe: a promoted-but-role-less demo-buyer toggled its own
-- is_admin with no error. RLS policies were never affected — `R{…}` gates
-- evaluate NULL in a USING clause, which denies.
--
-- THE FIX, two independent layers:
--   1. The guard is null-safe in BOTH branches:
--        not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false)
--      Nothing else in the function changes (body otherwise byte-identical to
--      the live definition read 2026-09-15, md5 108dc6f470e0b9c0acbc8fe158214032).
--   2. The state itself becomes unrepresentable:
--        profiles_admin_requires_role CHECK (not is_admin or admin_role is not null)
--      0 violating rows exist, so it validates on creation. Every writer already
--      sets both columns in one statement (Admins.tsx promote/demote, admin-invite
--      after validating the role against admin_role_values(), seed-test-admins.sql,
--      qc/seed.sql), so no legitimate write path is affected.
--
-- For a real, role-bearing admin nothing changes: `coalesce(x, false)` equals x
-- whenever x is not NULL, and x is only NULL for the role-less state the CHECK
-- now forbids.
--
-- Additive: one function body replaced (CREATE OR REPLACE keeps owner, grants and
-- the trigger binding), one constraint added. Single transaction.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_admin_grants()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
      new.is_admin       := false;
      new.admin_role     := null;
      new.account_status := 'active';
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.admin_role is distinct from old.admin_role
      or new.is_admin is distinct from old.is_admin)
     and not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
    raise exception 'Only a super_admin may change admin status or admin roles'
      using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'account_status is set only via set_account_status()'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

alter table public.profiles
  add constraint profiles_admin_requires_role
  check (not is_admin or admin_role is not null);
