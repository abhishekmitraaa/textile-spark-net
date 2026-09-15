-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 2b: RECONCILE → MIRROR → FLIP.
--
-- Spec: documentation/admin-separation-spec.md. Rolling context:
-- documentation/admin-separation-context.md. Follows 20260915140000 (Q-17).
--
-- After this migration admin.admin_users is the single source of truth for who
-- is an admin and in which role: public.is_admin() and public.admin_role() read
-- it. Every one of the 70 admin-gated RLS policies, the 9 admin-gated trigger
-- functions and the review RPCs reach identity only through those two functions
-- (verified live in Phase 0: 0 policies read the profiles columns inline), so the
-- whole authorization surface moves with this one body swap.
--
-- The WRITE path does not move this phase. Admins.tsx and the admin-invite edge
-- function keep writing public.profiles.is_admin/admin_role; a mirror trigger
-- carries every such write into admin.admin_users in the same transaction, so
-- promotion, demotion and role changes keep working with no app change.
--
-- ORDER IS THE POINT — one transaction, no drift window:
--   0. LOCK public.profiles against concurrent writes (SHARE ROW EXCLUSIVE;
--      reads are unaffected). Without it, an admin write committed by another
--      session between step 1's snapshot and step 2's CREATE TRIGGER would be
--      in neither the reconcile nor the mirror.
--   1. RECONCILE admin.admin_users to exactly the current profiles admin state,
--      then ASSERT they are equal.
--   2. MIRROR trigger live.
--   3. FLIP the two accessors, then ASSERT per-profile parity with the profiles
--      columns for every row. Either assertion failing aborts the whole
--      migration, so the accessors can never be left reading a stale table.
--
-- Preserved on the accessors: name, signature, return type, LANGUAGE sql, STABLE,
-- SECURITY DEFINER, owner (postgres) and the exact EXECUTE grants (PUBLIC, anon,
-- authenticated, service_role) — CREATE OR REPLACE keeps OID, owner and ACL, so
-- every policy bound to them is untouched. search_path goes from 'public' to ''
-- because both bodies are now fully schema-qualified.
--
-- Semantics, precisely: old is_admin() = coalesce(profiles.is_admin, false);
-- new = an ACTIVE admin_users row exists. Old admin_role() returned
-- profiles.admin_role even when is_admin was false; new returns NULL unless the
-- row is active. Identical today (0 rows with a role but is_admin = false), and
-- every gate pairs admin_role() with is_admin() anyway. With 20260915140000's
-- CHECK, is_admin() = true now implies a non-null role.
--
-- Demote = is_active = false (row kept, spec Q-12); a deleted profile deletes its
-- row (admin_users also cascades from auth.users).
--
-- ── DOWN PATH (manual; restores the exact pre-2b behaviour) ──────────────────
-- profiles.is_admin/admin_role are still maintained by every writer, so putting
-- the old bodies back fully restores prior behaviour. The mirror trigger and the
-- 2a constraint are harmless if left in place.
--
--   create or replace function public.is_admin()
--    returns boolean
--    language sql
--    stable security definer
--    set search_path to 'public'
--   as $function$
--     select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
--   $function$;
--
--   create or replace function public.admin_role()
--    returns admin_role_type
--    language sql
--    stable security definer
--    set search_path to 'public'
--   as $function$
--     select admin_role from public.profiles where id = auth.uid();
--   $function$;
--
--   -- optional, only if the mirror itself must go:
--   -- drop trigger if exists trg_profiles_sync_admin_users on public.profiles;
--   -- drop function if exists admin.sync_from_profiles();
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. No concurrent profiles writes for the duration of this transaction.
lock table public.profiles in share row exclusive mode;

-- 1. RECONCILE admin.admin_users to the current profiles admin state.
insert into admin.admin_users (id, admin_role, is_active)
select id, admin_role, true from public.profiles
where is_admin = true and admin_role is not null
on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;

update admin.admin_users a set is_active = false
where not exists (
  select 1 from public.profiles p
  where p.id = a.id and p.is_admin = true and p.admin_role is not null);

do $$
declare
  v_diff int;
begin
  select count(*) into v_diff from (
    (select id, admin_role from public.profiles where is_admin = true and admin_role is not null
     except
     select id, admin_role from admin.admin_users where is_active)
    union all
    (select id, admin_role from admin.admin_users where is_active
     except
     select id, admin_role from public.profiles where is_admin = true and admin_role is not null)
  ) d;
  if v_diff <> 0 then
    raise exception 'Phase 2b aborted: admin.admin_users differs from profiles after reconcile (% rows)', v_diff;
  end if;
end
$$;

-- 2. MIRROR: every profiles admin write is carried into admin.admin_users.
create or replace function admin.sync_from_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from admin.admin_users where id = old.id;
    return old;
  end if;
  if new.is_admin and new.admin_role is not null then
    insert into admin.admin_users (id, admin_role, is_active)
    values (new.id, new.admin_role, true)
    on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
  else
    update admin.admin_users set is_active = false where id = new.id;
  end if;
  return new;
end
$$;

alter function admin.sync_from_profiles() owner to postgres;
revoke all on function admin.sync_from_profiles() from public, anon, authenticated;

create or replace trigger trg_profiles_sync_admin_users
after insert or update of is_admin, admin_role or delete on public.profiles
for each row execute function admin.sync_from_profiles();

-- 3. FLIP the two gates to read admin.admin_users (grants untouched).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from admin.admin_users where id = auth.uid() and is_active)
$$;

create or replace function public.admin_role()
returns public.admin_role_type
language sql
stable
security definer
set search_path = ''
as $$
  select admin_role from admin.admin_users where id = auth.uid() and is_active
$$;

-- No uuid-argument variants of public.is_admin/admin_role exist (Phase 0, re-confirmed 2026-09-15).

-- Post-flip assertion: for every profile, the flipped accessors agree with the
-- profiles columns the old accessors read.
do $$
declare
  r record;
  v_bad int := 0;
begin
  for r in select id, is_admin, admin_role from public.profiles loop
    perform set_config('request.jwt.claim.sub', r.id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    if public.is_admin() is distinct from r.is_admin
       or public.admin_role() is distinct from r.admin_role then
      v_bad := v_bad + 1;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if v_bad <> 0 then
    raise exception 'Phase 2b aborted: flipped accessors disagree with profiles for % profile(s)', v_bad;
  end if;
end
$$;
