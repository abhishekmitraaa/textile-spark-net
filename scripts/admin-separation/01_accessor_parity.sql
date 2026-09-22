-- ─────────────────────────────────────────────────────────────────────────────
-- HISTORICAL — THIS HARNESS CANNOT RUN ANY MORE, AND IS KEPT AS THE RECORD.
--
-- It compares is_admin() / admin_role() against the profiles.is_admin / profiles.admin_role COLUMNS (the Phase 1-2 parity proof).
-- Admin-schema separation Phase 5c (2026-09-22, migration 20260922180000) DROPPED
-- those columns and the mirror trigger, so every statement below would fail with
-- 42703 (undefined_column). admin.admin_users is now the sole source of truth, and
-- there is nothing left to compare it against.
--
-- What replaced it: harness 11 (the identity RPCs) and, for the role matrix,
-- harness 02. Do not "fix" this file — the thing it tested no longer exists.
-- The guard below stops it before it can half-run.
-- ─────────────────────────────────────────────────────────────────────────────
do $historical$
begin
  raise exception 'HISTORICAL harness 01_accessor_parity.sql: it tested the pre-5c profiles admin columns / mirror, dropped on 2026-09-22. Use harness 11 (identity RPCs) or 02 (role matrix).';
end
$historical$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 01 — accessor parity.
--
-- For every profile, impersonates that user (request.jwt.claims) and compares
-- public.is_admin() / public.admin_role() with profiles.is_admin / admin_role.
-- Expect: is_admin_mismatch=0 admin_role_mismatch=0 while profiles is still the
-- mirrored write target (Phases 2–4).
--
-- HOW TO RUN: execute this whole file as ONE statement (Supabase MCP execute_sql,
-- or psql as postgres). It never commits: the report comes back as the text of
-- a deliberate `raise exception` (P0001), which rolls everything back.
-- ─────────────────────────────────────────────────────────────────────────────
do $parity$
declare
  r record; fa boolean; fr text; out text := ''; mis_a int := 0; mis_r int := 0; n int := 0;
begin
  for r in select id, is_admin, admin_role::text as admin_role from public.profiles order by id loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', r.id::text, true);
    fa := public.is_admin(); fr := public.admin_role()::text;
    n := n + 1;
    if fa is distinct from r.is_admin then mis_a := mis_a + 1; end if;
    if fr is distinct from r.admin_role then mis_r := mis_r + 1; end if;
    out := out || left(r.id::text, 8) || ' is_admin()=' || fa || ' admin_role()=' || coalesce(fr, 'null') || ' | profiles.is_admin=' || r.is_admin || ' profiles.admin_role=' || coalesce(r.admin_role, 'null') || E'\n';
  end loop;
  raise exception 'PARITY (rolled back) rows=% is_admin_mismatch=% admin_role_mismatch=% %', n, mis_a, mis_r, E'\n' || out;
end
$parity$
