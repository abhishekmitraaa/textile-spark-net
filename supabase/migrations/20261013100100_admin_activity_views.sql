-- What each admin looks at (2026-10-13; Mitra, 2026-10-11: track each admin's activity, for
-- super admins and managers; ToDo "Decide how long admin page visits stay in the Admin Log").
--
-- The Admin Log (admin.audit_log) records what admins CHANGE, and sign-ins. This adds what they
-- LOOK AT: pages visited and records opened in Cosora-Admin.
--
-- It is its own table, admin.activity_views, not more rows in admin.audit_log. The Admin Log
-- is append-only for everyone, and that rule stays whole: page visits are high-volume and are
-- deleted after 180 days, which would have needed an exception carved into the append-only
-- trigger of the one table that must never lose a row.
--
--   kind 'page'    a page of the panel was opened             kept 180 days
--   kind 'record'  one record was opened (a vendor, a chat…)  kept for good
--
-- Writer: public.admin_activity_record(), called by Cosora-Admin for the signed-in admin.
-- The actor, role and name come from the session, never from the caller. The same view
-- within a minute is recorded once.
-- Readers: public.admin_activity_list() and public.admin_activity_summary(), super admins and
-- managers only, like the Admin Log.
-- Retention: admin.activity_views_prune(), from the daily job `admin-activity-prune`
-- (03:13 UTC; a new job, asked for by Mitra on 2026-10-13).
--
-- The staff notice (Cosora-Admin src/lib/activityNotice.ts) says pages and records are
-- recorded, from the release that ships this.

-- Is this a path inside the panel? One rule for the table's CHECK and the writer.
create or replace function admin.activity_path_ok(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_path is not null
     and left(p_path, 1) = '/'
     and left(p_path, 2) <> '//'
     and position(chr(92) in p_path) = 0
     and p_path !~ '[[:cntrl:]]'
$function$;

revoke all on function admin.activity_path_ok(text) from public, anon, authenticated;

create table if not exists admin.activity_views (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid not null,
  actor_role   text,
  actor_name   text,
  kind         text not null check (kind in ('page', 'record')),
  -- A path inside the panel: one leading slash, then no second slash, no backslash and no
  -- control character. The Activity tab shows it as a link, and two slashes (or a slash and
  -- a backslash) at the start would make that a link to another site.
  path         text not null check (char_length(path) between 1 and 200 and admin.activity_path_ok(path)),
  target_table text check (target_table is null or char_length(target_table) <= 60),
  target_id    text check (target_id is null or char_length(target_id) <= 80),
  label        text check (label is null or char_length(label) <= 120),
  constraint activity_views_record_has_target
    check (kind <> 'record' or (target_table is not null and target_id is not null))
);

comment on table admin.activity_views is
  'Pages visited and records opened by admins in Cosora-Admin. Written only by public.admin_activity_record(); read by super admins and managers through admin_activity_list() / admin_activity_summary(). Page visits are deleted after 180 days by admin.activity_views_prune(); record views are kept.';

create index if not exists activity_views_actor_at_idx on admin.activity_views (actor_id, at desc);
create index if not exists activity_views_at_idx on admin.activity_views (at desc);
create index if not exists activity_views_page_at_idx on admin.activity_views (at) where kind = 'page';

alter table admin.activity_views enable row level security;
revoke all on admin.activity_views from public, anon, authenticated;

-- ── Writer ──────────────────────────────────────────────────────────────────
create or replace function public.admin_activity_record(
  p_kind         text,
  p_path         text,
  p_target_table text default null,
  p_target_id    text default null,
  p_label        text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid   uuid := auth.uid();
  v_path  text := left(btrim(coalesce(p_path, '')), 200);
  v_table text := nullif(left(btrim(coalesce(p_target_table, '')), 60), '');
  v_id    text := nullif(left(btrim(coalesce(p_target_id, '')), 80), '');
  v_label text := nullif(left(btrim(coalesce(p_label, '')), 120), '');
begin
  if v_uid is null or not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admin activity is recorded for admins only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('page', 'record') then
    raise exception 'unknown activity kind %', p_kind using errcode = '22023';
  end if;
  if not admin.activity_path_ok(v_path) then
    raise exception 'a path inside the panel is required' using errcode = '22023';
  end if;
  if p_kind = 'record' and (v_table is null or v_id is null) then
    raise exception 'a record view names its record' using errcode = '22023';
  end if;
  if p_kind = 'page' then
    v_table := null;
    v_id := null;
  end if;

  -- The same view again within a minute (a refresh, a re-render) is one view.
  if exists (
    select 1
      from admin.activity_views v
     where v.actor_id = v_uid
       and v.at > now() - interval '1 minute'
       and v.kind = p_kind
       and v.path = v_path
       and v.target_table is not distinct from v_table
       and v.target_id is not distinct from v_id
  ) then
    return false;
  end if;

  insert into admin.activity_views (actor_id, actor_role, actor_name, kind, path, target_table, target_id, label)
  values (v_uid, public.admin_role()::text, admin.audit_actor_name(v_uid), p_kind, v_path, v_table, v_id, v_label);
  return true;
end
$function$;

comment on function public.admin_activity_record(text, text, text, text, text) is
  'Records that the signed-in admin opened a page (kind page) or a record (kind record) in Cosora-Admin. The actor comes from the session. The same view within a minute is recorded once; returns whether a row was written.';

revoke all on function public.admin_activity_record(text, text, text, text, text) from public, anon;
grant execute on function public.admin_activity_record(text, text, text, text, text) to authenticated;

-- ── Readers: super admins and managers ──────────────────────────────────────
create or replace function admin.activity_reader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'manager']::public.admin_role_type[]), false)
$function$;

revoke all on function admin.activity_reader() from public, anon, authenticated;

create or replace function public.admin_activity_list(
  p_actor  uuid        default null,
  p_kind   text        default null,
  p_before timestamptz default null,
  p_limit  integer     default 50
)
returns table (
  id bigint, at timestamptz, actor_id uuid, actor_role text, actor_name text,
  kind text, path text, target_table text, target_id text, label text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not admin.activity_reader() then
    raise exception 'not authorized: admin activity is for super admins and managers' using errcode = '42501';
  end if;
  return query
    select v.id, v.at, v.actor_id, v.actor_role, v.actor_name, v.kind, v.path, v.target_table, v.target_id, v.label
      from admin.activity_views v
     where (p_actor is null or v.actor_id = p_actor)
       and (p_kind is null or v.kind = p_kind)
       and (p_before is null or v.at < p_before)
     order by v.at desc, v.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end
$function$;

revoke all on function public.admin_activity_list(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.admin_activity_list(uuid, text, timestamptz, integer) to authenticated;

-- One row per active admin: what they did in the window, and when they were last seen.
create or replace function public.admin_activity_summary(p_days integer default 30)
returns table (
  actor_id uuid, actor_name text, actor_role text,
  pages integer, records integer, changes integer, sign_ins integer, last_seen timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 180));
begin
  if not admin.activity_reader() then
    raise exception 'not authorized: admin activity is for super admins and managers' using errcode = '42501';
  end if;
  return query
    with views as (
      select v.actor_id,
             (count(*) filter (where v.kind = 'page'))::integer   as pages,
             (count(*) filter (where v.kind = 'record'))::integer as records,
             max(v.at) as last_at
        from admin.activity_views v
       where v.at >= v_since
       group by v.actor_id
    ), log as (
      select l.actor_id,
             (count(*) filter (where l.action in ('insert', 'update', 'delete', 'invite', 'refund')))::integer as changes,
             (count(*) filter (where l.action = 'sign_in'))::integer as sign_ins,
             max(l.at) as last_at
        from admin.audit_log l
       where l.at >= v_since and l.actor_id is not null
       group by l.actor_id
    )
    select u.id,
           admin.audit_actor_name(u.id),
           u.admin_role::text,
           coalesce(vw.pages, 0), coalesce(vw.records, 0),
           coalesce(lg.changes, 0), coalesce(lg.sign_ins, 0),
           nullif(greatest(coalesce(vw.last_at, '-infinity'), coalesce(lg.last_at, '-infinity')), '-infinity')
      from admin.admin_users u
      left join views vw on vw.actor_id = u.id
      left join log   lg on lg.actor_id = u.id
     where u.is_active
     order by 8 desc nulls last, 2;
end
$function$;

revoke all on function public.admin_activity_summary(integer) from public, anon;
grant execute on function public.admin_activity_summary(integer) to authenticated;

-- ── Retention ───────────────────────────────────────────────────────────────
-- Page visits older than 180 days go. Record views stay, and admin.audit_log is not touched.
create or replace function admin.activity_views_prune()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  delete from admin.activity_views v
   where v.kind = 'page'
     and v.at < now() - interval '180 days';
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

revoke all on function admin.activity_views_prune() from public, anon, authenticated;

-- The daily job, where pg_cron is installed (a database without it gets no job).
do $job$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'admin-activity-prune';
    perform cron.schedule('admin-activity-prune', '13 3 * * *', 'select admin.activity_views_prune();');
  end if;
end
$job$;

-- Self-check.
do $check$
begin
  if has_table_privilege('authenticated', 'admin.activity_views', 'SELECT')
     or has_table_privilege('authenticated', 'admin.activity_views', 'INSERT')
     or has_table_privilege('anon', 'admin.activity_views', 'SELECT') then
    raise exception 'self-check: admin.activity_views is reachable by a browser role';
  end if;
  if has_function_privilege('anon', 'public.admin_activity_record(text, text, text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_activity_list(uuid, text, timestamptz, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_activity_summary(integer)', 'EXECUTE') then
    raise exception 'self-check: an activity function is callable signed out';
  end if;
  if has_function_privilege('authenticated', 'admin.activity_views_prune()', 'EXECUTE') then
    raise exception 'self-check: the prune is callable by a browser role';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'admin-activity-prune' and schedule = '13 3 * * *') then
    raise exception 'self-check: the admin-activity-prune job is not scheduled';
  end if;
end
$check$;
