-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 1: THE FOUNDATION, AND NOTHING ELSE.
--
-- Spec: documentation/admin-separation-spec.md (frozen 2026-09-15).
-- Rolling context: documentation/admin-separation-context.md.
--
-- Cosora's admins are rows in public.profiles (is_admin, admin_role), and every
-- admin gate in the database (70 RLS policies on 37 tables, 9 trigger functions,
-- the review RPCs) reaches them through public.is_admin() / public.admin_role().
-- The workstream moves admin identity into its own `admin` schema in this SAME
-- project: revoked from the client roles and never exposed to PostgREST.
--
-- This migration only stands the new store up beside the old one:
--
--   * schema `admin`, locked down (no usage, no table grants, no default grants
--     to public / anon / authenticated);
--   * admin.admin_users, keyed to auth.users, typed with the EXISTING
--     public.admin_role_type enum (no duplicate enum);
--   * seeded from the current admins;
--   * two PARALLEL accessors, admin.is_admin(uid) and admin.role_of(uid), which
--     exist only so parity with the live accessors can be proven.
--
-- ZERO BEHAVIOUR CHANGE, by construction:
--   * public.is_admin() / public.admin_role() are NOT touched; they still read
--     public.profiles. Nothing in production calls the admin.* functions.
--   * No existing table, column, policy, trigger or function is altered.
--   * `admin` is NOT added to the API's exposed schemas (public, graphql_public).
--
-- Grants, precisely (from the live pg_default_acl, Phase 0):
--   * Supabase's default grants to anon/authenticated are registered PER SCHEMA
--     (public, storage, graphql*), with no global default, so objects created in
--     `admin` get no client grants automatically. The revokes below are explicit
--     anyway, so the intent survives a later mistaken grant.
--   * Postgres itself grants EXECUTE on every new function to PUBLIC, and a
--     per-schema ALTER DEFAULT PRIVILEGES cannot remove that built-in default,
--     so each function is revoked from PUBLIC individually.
--   * EXECUTE is granted to `authenticated` as briefed, but it is inert while
--     `authenticated` has no USAGE on `admin`. Parity is proven as postgres.
--     Phase 2 keeps every policy calling public.is_admin()/admin_role()
--     (SECURITY DEFINER), never admin.* directly.
--
-- Additive only. Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The schema.
create schema if not exists admin;
alter schema admin owner to postgres;

-- 2. Lock it down.
revoke all on schema admin from public, anon, authenticated;
revoke all on all tables in schema admin from public, anon, authenticated;
alter default privileges in schema admin revoke all on tables from public, anon, authenticated;
alter default privileges in schema admin revoke all on sequences from public, anon, authenticated;
alter default privileges in schema admin revoke all on functions from public, anon, authenticated;

-- 3. The isolated admin identity store.
create table if not exists admin.admin_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  admin_role public.admin_role_type not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  note       text
);
alter table admin.admin_users owner to postgres;
alter table admin.admin_users enable row level security;
-- No policies yet: with the schema revoked and unexposed, no client can reach it.
revoke all on table admin.admin_users from public, anon, authenticated;

comment on table admin.admin_users is
  'Admin identity (admin-schema separation, Phase 1). Seeded from public.profiles; '
  'not yet authoritative — public.is_admin()/admin_role() still read profiles until Phase 2.';

-- 4. Seed from the current admins (the spec's exact query).
--    A profile with is_admin = true but a NULL admin_role is NOT seeded and no
--    role is invented for it; it is reported below for a manual decision.
insert into admin.admin_users (id, admin_role)
select id, admin_role from public.profiles
where is_admin = true and admin_role is not null
on conflict (id) do nothing;

do $$
declare
  r record;
begin
  for r in
    select id from public.profiles where is_admin = true and admin_role is null
  loop
    raise notice 'admin.admin_users seed: skipped profile % (is_admin = true, admin_role is null) — needs a manual role decision', r.id;
  end loop;
end
$$;

-- 5. Parallel, read-only accessors over the NEW store. They do not replace the
--    live public.is_admin() / public.admin_role().
create or replace function admin.role_of(uid uuid)
returns public.admin_role_type
language sql
stable
security definer
set search_path = ''
as $$
  select u.admin_role
    from admin.admin_users u
   where u.id = uid
     and u.is_active;
$$;

create or replace function admin.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from admin.admin_users u
     where u.id = uid
       and u.is_active
  );
$$;

alter function admin.role_of(uuid) owner to postgres;
alter function admin.is_admin(uuid) owner to postgres;

revoke all on function admin.role_of(uuid) from public, anon, authenticated;
revoke all on function admin.is_admin(uuid) from public, anon, authenticated;
grant execute on function admin.role_of(uuid) to authenticated;
grant execute on function admin.is_admin(uuid) to authenticated;
