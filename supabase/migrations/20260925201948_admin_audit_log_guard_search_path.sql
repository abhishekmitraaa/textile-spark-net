-- ─────────────────────────────────────────────────────────────
-- MPF-26, part 3: pin the search_path of the Admin Log's append-only guard.
--
-- The security advisor flagged admin.audit_log_append_only() (from
-- 20260925174031) as `function_search_path_mutable`. It only raises, and names no
-- object, so nothing could be redirected through it. Pinned anyway, like every
-- other function in this project.
-- ─────────────────────────────────────────────────────────────

alter function admin.audit_log_append_only() set search_path = '';

-- Self-check.
do $check$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'admin' and p.proname = 'audit_log_append_only'
                    and p.proconfig @> array['search_path=""']) then
    raise exception 'self-check: admin.audit_log_append_only() search_path not pinned';
  end if;
end
$check$;
