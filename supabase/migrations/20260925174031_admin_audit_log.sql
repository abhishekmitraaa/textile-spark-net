-- ─────────────────────────────────────────────────────────────
-- MPF-26, part 2: the Admin Log.
--
-- MPF-26 found that FAQ edits and deletes left no record of who made them or
-- what the text was. Mitra's fix: an Admin Log in Cosora-Admin, readable only by
-- a managerial role (super_admin and the new manager), that tracks each admin's
-- activity and changes, with date and time.
--
-- WHAT IS RECORDED, in admin.audit_log:
--   - every row an active admin inserts, updates or deletes in the tables the
--     admin panel writes (list below), whichever path made the change: an
--     admin_* RPC, a moderation RPC, or a direct table write under RLS. The
--     trigger reads the caller from the JWT, which a SECURITY DEFINER RPC keeps,
--     so the admin who clicked is the actor. An update records only the columns
--     that changed, as {"column": {"from": …, "to": …}}; an insert or delete
--     records the row;
--   - sign-in and sign-out of the admin panel (admin_audit_session(), called by
--     Cosora-Admin);
--   - invites and refunds made by the two admin edge functions, which write with
--     the service-role key and so can't be attributed by the trigger. They record
--     themselves through admin_audit_record(), service_role only.
--
-- WHAT IS NOT: writes by non-admins; writes with no JWT user (cron, service role,
-- migrations); changes made by another trigger (pg_trigger_depth() > 1: the admin's
-- own action is recorded, its side effects are not); and counters and derived
-- columns (views, impressions, clicks, likes, ratings, embeddings, search text,
-- updated_at), so an admin browsing the site isn't logged as changing anything.
-- `own_row` marks a change to the admin's own row, for example an admin who is
-- also a vendor editing their own product.
--
-- APPEND-ONLY: no client grant on the table, RLS on with no policy, and a
-- trigger that refuses UPDATE and DELETE for everyone. Read it through
-- admin_audit_log_list() and admin_audit_log_actors(), super_admin and manager
-- only.
-- ─────────────────────────────────────────────────────────────

create table if not exists admin.audit_log (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  actor_id      uuid,
  actor_role    public.admin_role_type,
  actor_name    text,
  action        text not null
                check (action in ('insert', 'update', 'delete', 'sign_in', 'sign_out', 'invite', 'refund')),
  target_table  text,
  target_id     text,
  own_row       boolean not null default false,
  changes       jsonb,
  source        text not null default 'database'
);

create index if not exists audit_log_at_idx on admin.audit_log (at desc, id desc);
create index if not exists audit_log_actor_idx on admin.audit_log (actor_id, at desc);

comment on table admin.audit_log is
  'Admin Log (MPF-26): every admin change and sign-in, append-only. Read through admin_audit_log_list().';

alter table admin.audit_log enable row level security;
revoke all on admin.audit_log from public, anon, authenticated;

create or replace function admin.audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The Admin Log is append-only: rows can''t be changed or deleted'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_audit_log_append_only on admin.audit_log;
create trigger trg_audit_log_append_only
  before update or delete on admin.audit_log
  for each row execute function admin.audit_log_append_only();

-- The actor's name as the log should keep it, even if the account changes later.
create or replace function admin.audit_actor_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email) from public.profiles p where p.id = p_uid;
$$;

revoke all on function admin.audit_actor_name(uuid) from public, anon, authenticated;

-- AFTER ROW trigger on each audited table. TG_ARGV[0] is the column that names
-- the row's owner ('' when there is none), for `own_row`.
create or replace function admin.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.admin_role_type;
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb;
  v_owner   text := coalesce(tg_argv[0], '');
  v_skip    text[] := array[
    'updated_at', 'embedding', 'fts', 'search_text', 'catalog_embedding',
    'catalog_embedding_updated_at', 'recommended_product_ids', 'category_name',
    'views_count', 'enquiries_count', 'sold_count', 'rating_avg', 'reviews_count',
    'likes_count', 'impressions', 'clicks', 'followers_count', 'profile_score',
    'last_message', 'last_message_at'];
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return null;
  end if;
  select u.admin_role into v_role from admin.admin_users u where u.id = v_uid and u.is_active;
  if v_role is null then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old) - v_skip; end if;
  if tg_op in ('UPDATE', 'INSERT') then v_new := to_jsonb(new) - v_skip; end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k))
      into v_changes
      from jsonb_object_keys(v_new) as k
     where (v_old -> k) is distinct from (v_new -> k);
    if v_changes is null then
      return null;  -- only counters or derived columns moved
    end if;
  else
    v_changes := coalesce(v_new, v_old);
  end if;

  insert into admin.audit_log
    (actor_id, actor_role, actor_name, action, target_table, target_id, own_row, changes)
  values (
    v_uid, v_role, admin.audit_actor_name(v_uid), lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_owner <> '' and coalesce(v_new ->> v_owner, v_old ->> v_owner) = v_uid::text,
    v_changes
  );
  return null;
end;
$$;

revoke all on function admin.audit_row_change() from public, anon, authenticated;

-- The tables the admin panel writes (its RPCs and its direct updates), with each
-- one's owner column. profiles is audited only when account_status is set
-- (set_account_status); a profile edit is not admin activity.
do $attach$
declare
  r record;
begin
  for r in select * from (values
    ('public', 'faqs',                 ''),
    ('admin',  'account_suspensions',  'profile_id'),
    ('public', 'conversations',        ''),
    ('admin',  'conversation_reviews', ''),
    ('public', 'vendor_documents',     'vendor_id'),
    ('public', 'advertisements',       'vendor_id'),
    ('public', 'certificate_orders',   'vendor_id'),
    ('public', 'products',             'vendor_id'),
    ('public', 'product_videos',       'vendor_id'),
    ('public', 'catalogues',           'vendor_id'),
    ('admin',  'admin_users',          'id'),
    ('admin',  'keyword_blocklist',    ''),
    ('admin',  'flag_patterns',        ''),
    ('admin',  'admin_flags',          ''),
    ('admin',  'chat_block_reasons',   ''),
    ('public', 'vendor_profiles',      'id'),
    ('public', 'vendor_subscriptions', 'vendor_id')
  ) as t(sch, tbl, owner_col) loop
    execute format('drop trigger if exists trg_admin_audit on %I.%I', r.sch, r.tbl);
    execute format(
      'create trigger trg_admin_audit after insert or update or delete on %I.%I '
      'for each row execute function admin.audit_row_change(%L)', r.sch, r.tbl, r.owner_col);
  end loop;
end
$attach$;

drop trigger if exists trg_admin_audit on public.profiles;
create trigger trg_admin_audit
  after update of account_status on public.profiles
  for each row execute function admin.audit_row_change('id');

-- Sign-in and sign-out, called by Cosora-Admin. A non-admin's call records nothing.
create or replace function public.admin_audit_session(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.admin_role_type;
begin
  if p_action not in ('sign_in', 'sign_out') then
    raise exception 'unknown session action %', p_action using errcode = '22023';
  end if;
  select u.admin_role into v_role from admin.admin_users u where u.id = v_uid and u.is_active;
  if v_role is null then
    return;
  end if;
  insert into admin.audit_log (actor_id, actor_role, actor_name, action, source)
  values (v_uid, v_role, admin.audit_actor_name(v_uid), p_action, 'admin-app');
end;
$$;

revoke all on function public.admin_audit_session(text) from public, anon, authenticated;
grant execute on function public.admin_audit_session(text) to authenticated;

-- For the two admin edge functions, which act with the service-role key on behalf
-- of the admin whose JWT they checked. service_role only.
create or replace function public.admin_audit_record(
  p_actor uuid, p_action text, p_target_table text, p_target_id text, p_changes jsonb, p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.admin_role_type;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admin_audit_record is for the admin edge functions only' using errcode = '42501';
  end if;
  if p_action not in ('invite', 'refund') then
    raise exception 'unknown audit action %', p_action using errcode = '22023';
  end if;
  select u.admin_role into v_role from admin.admin_users u where u.id = p_actor;
  insert into admin.audit_log
    (actor_id, actor_role, actor_name, action, target_table, target_id, changes, source)
  values
    (p_actor, v_role, admin.audit_actor_name(p_actor), p_action, p_target_table, p_target_id,
     p_changes, coalesce(nullif(p_source, ''), 'edge-function'));
end;
$$;

revoke all on function public.admin_audit_record(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_audit_record(uuid, text, text, text, jsonb, text) to service_role;

-- The readers: super_admin and manager only.
create or replace function public.admin_audit_log_list(
  p_actor     uuid        default null,
  p_table     text        default null,
  p_action    text        default null,
  p_from      timestamptz default null,
  p_to        timestamptz default null,
  p_before_id bigint      default null,
  p_limit     integer     default 100
)
returns table (
  id bigint, at timestamptz, actor_id uuid, actor_role public.admin_role_type, actor_name text,
  action text, target_table text, target_id text, own_row boolean, changes jsonb, source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'manager'), false) then
    raise exception 'not authorized: the Admin Log requires the super_admin or manager role'
      using errcode = '42501';
  end if;
  return query
    select l.id, l.at, l.actor_id, l.actor_role, l.actor_name, l.action, l.target_table,
           l.target_id, l.own_row, l.changes, l.source
      from admin.audit_log l
     where (p_actor is null or l.actor_id = p_actor)
       and (p_table is null or l.target_table = p_table)
       and (p_action is null or l.action = p_action)
       and (p_from is null or l.at >= p_from)
       and (p_to is null or l.at < p_to)
       and (p_before_id is null or l.id < p_before_id)
     order by l.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer) from public, anon, authenticated;
grant execute on function public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer) to authenticated;

create or replace function public.admin_audit_log_actors()
returns table (actor_id uuid, actor_name text, actor_role public.admin_role_type, entries bigint, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'manager'), false) then
    raise exception 'not authorized: the Admin Log requires the super_admin or manager role'
      using errcode = '42501';
  end if;
  return query
    select distinct on (l.actor_id) l.actor_id, l.actor_name, l.actor_role,
           count(*) over (partition by l.actor_id), max(l.at) over (partition by l.actor_id)
      from admin.audit_log l
     where l.actor_id is not null
     order by l.actor_id, l.id desc;
end;
$$;

revoke all on function public.admin_audit_log_actors() from public, anon, authenticated;
grant execute on function public.admin_audit_log_actors() to authenticated;

-- Self-check.
do $check$
declare
  v_missing text;
begin
  select string_agg(t, ', ') into v_missing
    from unnest(array[
      'public.faqs', 'admin.account_suspensions', 'public.conversations', 'admin.conversation_reviews',
      'public.vendor_documents', 'public.advertisements', 'public.certificate_orders', 'public.products',
      'public.product_videos', 'public.catalogues', 'admin.admin_users', 'admin.keyword_blocklist',
      'admin.flag_patterns', 'admin.admin_flags', 'admin.chat_block_reasons', 'public.vendor_profiles',
      'public.vendor_subscriptions', 'public.profiles']) as t
   where not exists (select 1 from pg_trigger g where g.tgrelid = t::regclass and g.tgname = 'trg_admin_audit' and g.tgenabled = 'O');
  if v_missing is not null then
    raise exception 'self-check: no audit trigger on %', v_missing;
  end if;
  if has_table_privilege('authenticated', 'admin.audit_log', 'select')
     or has_table_privilege('authenticated', 'admin.audit_log', 'insert') then
    raise exception 'self-check: clients can reach admin.audit_log';
  end if;
  if has_function_privilege('authenticated', 'public.admin_audit_record(uuid, text, text, text, jsonb, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_audit_log_list(uuid, text, text, timestamptz, timestamptz, bigint, integer)', 'execute')
     or has_function_privilege('anon', 'public.admin_audit_session(text)', 'execute') then
    raise exception 'self-check: an audit function is callable by the wrong role';
  end if;
end
$check$;
