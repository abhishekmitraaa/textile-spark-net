-- Admin completion, Phase 1d (Mitra, 2026-09-27): the client roles lose TRUNCATE,
-- TRIGGER and REFERENCES on every table in public.
--
-- Supabase's default grants gave anon and authenticated ALL on each new table.
-- PostgREST only ever needs SELECT / INSERT / UPDATE / DELETE, and RLS governs
-- those. TRUNCATE is worse than unused: it is not subject to RLS at all, so any
-- future path that let a client run it (a SECURITY INVOKER function with dynamic
-- SQL, say) would empty a table past every policy. TRIGGER and REFERENCES are
-- DDL-only privileges. Removing all three changes nothing the apps do today.
--
-- The default-privilege change covers tables that postgres creates from now on
-- (every migration here runs as postgres).

do $revoke$
declare
  r record;
begin
  for r in
    select c.oid::regclass as rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, trigger, references on table %s from anon, authenticated', r.rel);
  end loop;
end
$revoke$;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
       or has_table_privilege('anon', c.oid, 'TRIGGER') or has_table_privilege('authenticated', c.oid, 'TRIGGER')
       or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('authenticated', c.oid, 'REFERENCES'));
  if v_bad > 0 then
    raise exception 'self-check: % public tables still grant TRUNCATE, TRIGGER or REFERENCES to a client role', v_bad;
  end if;

  -- The grants PostgREST needs are untouched (RLS governs them).
  if not has_table_privilege('anon', 'public.products', 'SELECT')
     or not has_table_privilege('authenticated', 'public.rfqs', 'INSERT')
     or not has_table_privilege('authenticated', 'public.messages', 'INSERT')
     or not has_table_privilege('authenticated', 'public.vendor_profiles', 'UPDATE') then
    raise exception 'self-check: a SELECT/INSERT/UPDATE grant was lost';
  end if;
end
$check$;
