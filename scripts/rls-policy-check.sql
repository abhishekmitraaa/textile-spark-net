-- ─────────────────────────────────────────────────────────────
-- RLS once-per-query check, on the policies a DATABASE holds (2026-10-13).
--
-- The same rule as scripts/rls-policy-check.mjs (which reads migration files), read from
-- pg_policies, so it also sees policies made by `execute` and by the SQL editor. It is the
-- two performance-advisor lints admin completion Phase 12 took to zero:
--   auth_rls_initplan             a policy calls auth.uid(), is_admin(), admin_role(),
--                                 account_is_active() or account_not_deleted() outside (select …)
--   multiple_permissive_policies  one role has more than one permissive policy for the same
--                                 command on a table (a FOR ALL policy counts for every command)
--
-- Read-only. Each offender is one FAIL line; the last line is the tally.
-- Local stack:  docker exec -i supabase_db_localstack psql -U postgres -At < scripts/rls-policy-check.sql
-- Production:   run it as one statement through execute_sql or the SQL editor after an apply.
-- ─────────────────────────────────────────────────────────────
with pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.permissive, p.roles,
         coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as body
    from pg_policies p
   where p.schemaname = 'public'
), bare as (
  -- Postgres prints a wrapped call as "( SELECT auth.uid() AS uid)": take those out, and
  -- whatever call is left is a bare one.
  select schemaname, tablename, policyname,
         (regexp_match(
            regexp_replace(body,
              'SELECT (public\.)?(auth\.uid|auth\.role|auth\.jwt|is_admin|admin_role|account_is_active|account_not_deleted)\(',
              'SELECT WRAPPED(', 'g'),
            '(auth\.uid|auth\.role|auth\.jwt|is_admin|admin_role|account_is_active|account_not_deleted)\('))[1] as fn
    from pol
), roles as (
  select unnest(array['anon', 'authenticated']) as role
), cmds as (
  select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as cmd
), overlap as (
  select pol.schemaname, pol.tablename, roles.role, cmds.cmd,
         count(*) as n, string_agg(pol.policyname, ', ' order by pol.policyname) as names
    from pol
    cross join roles
    cross join cmds
   where pol.permissive = 'PERMISSIVE'
     and (pol.cmd = cmds.cmd or pol.cmd = 'ALL')
     and (pol.roles && array[roles.role::name] or pol.roles && array['public'::name])
   group by pol.schemaname, pol.tablename, roles.role, cmds.cmd
  having count(*) > 1
), findings as (
  select 1 as ord, 'FAIL once-per-query  ' || schemaname || '.' || tablename || '  policy ' || policyname
                   || ' calls ' || fn || '() outside (select …)' as line
    from bare where fn is not null
  union all
  select 2, 'FAIL one-policy-per-command  ' || schemaname || '.' || tablename || '  ' || cmd || ' for ' || role
            || ' is decided by ' || n || ' policies: ' || names
    from overlap
)
select line from (
  select ord, line from findings
  union all
  select 9, 'rls-policy-check: ' || (select count(*) from pol) || ' policies, '
            || (select count(*) from bare where fn is not null) || ' with a bare call, '
            || (select count(*) from overlap) || ' command(s) decided by more than one policy'
) t
order by ord, line;
