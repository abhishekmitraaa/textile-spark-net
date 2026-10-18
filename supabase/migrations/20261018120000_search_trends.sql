-- Trending searches on /search, measured from Cosora's own searches (2026-10-18).
--
-- The search page used to carry hardcoded "Popular keywords" and "Trending Keywords" lists, removed in
-- September because nothing measured them (claude.md: "No fabricated data on the search surfaces",
-- "Curated is not trending"). This brings the section back with real numbers. The first ask was Google
-- Trends; its official API is an invite-only alpha and there are no keys, so the source is the searches
-- buyers make here. An outside source can later feed the same tables.
--
-- WHAT COUNTS: engagement_events 'search_impression' rows (SearchResults.tsx logs one per seller shown,
-- so a counted term had real results) and 'search_click' rows (the product clicked gives its category).
-- A visitor is coalesce(viewer_id, 's:' || session_id), and a term is lower-cased, trimmed and its
-- spaces collapsed: the same definitions as admin_live_activity() (20260928145827).
--
-- THE RULES (decided 2026-10-18):
--   * Window ladder. The list is for yesterday (India time). When fewer than 5 terms qualify, it widens
--     to the 7 days to yesterday, then the 30. The window is stored, so the page can say which:
--     "Trending yesterday", "this week", "this month".
--   * Privacy floor. A typed term is published only once at least 3 different visitors searched it in
--     the window, as on Live Activity: a rare search can identify the person who made it. Staff
--     (active admin.admin_users) don't count. Terms with 5+ digits in a row, an "@", or a link are never
--     published, whatever their count, nor anything shorter than 2 or longer than 40 characters.
--   * Categories ("the type of article") are Cosora's own names, so they need no floor: a category
--     counts each visitor who clicked a search result in it, or searched its name ("shirt" and "shirts"
--     both find "Shirt"; "dresses" finds "Dress").
--   * Staff may hide a term (admin_search_trend_hide, with a reason, in the Admin Log). A hidden term,
--     or a category of that name, is left out of every later list. Unhiding keeps the row as history.
--
-- STORAGE: one admin.search_trend_runs row per computation and its admin.search_trend_items. A refresh
-- only inserts; the list in force is the newest run. Visitor counts stay in the admin schema; the public
-- reader returns words only.
--
-- READ PATH: public.trending_searches() (anyone). site-config-snapshot puts what it returns to a
-- signed-out caller into site-config/site.json, which the buyer app already loads on every page, so
-- buyers read the CDN, not the database. A new run queues that rebuild (trg_search_trend_runs_snapshot),
-- and so does a change to the switch. While the switch is on only for listed accounts, the file holds no
-- terms and those accounts read the function directly.
--
-- SWITCH: search_trending, created off. The daily job is a separate migration
-- (20261018120100_search_trends_job.sql), because a new scheduled job is Mitra's call.

-- ── 1. The switch ────────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('search_trending',
        'Buyers see "Trending" searches and the most searched categories on /search, measured from Cosora''s own searches. While off, only the listed accounts see them.',
        false)
on conflict (key) do nothing;

-- Is the list shown to this caller? Callable signed out, like featured_listings_on().
create or replace function public.search_trending_on()
returns boolean
language sql stable security definer set search_path = '' as $function$
  select admin.feature_on_for('search_trending', (select auth.uid()))
$function$;
revoke all on function public.search_trending_on() from public;
grant execute on function public.search_trending_on() to anon, authenticated, service_role;

-- ── 2. Tables ────────────────────────────────────────────────────────────────
-- A search term as it is counted: lower case, trimmed, one space between words.
create or replace function admin.search_term_norm(p_text text)
returns text
language sql immutable set search_path = '' as $function$
  select regexp_replace(lower(btrim(coalesce(p_text, ''))), '\s+', ' ', 'g')
$function$;
revoke all on function admin.search_term_norm(text) from public, anon, authenticated;

create table if not exists admin.search_trend_runs (
  id               bigint generated always as identity primary key,
  computed_at      timestamptz not null default now(),
  -- The day the list is for: yesterday in India when it was computed. The window ends on it.
  ist_day          date not null,
  trend_window     text not null constraint search_trend_runs_window check (trend_window in ('day', 'week', 'month')),
  window_start     date not null,
  terms_found      integer not null default 0,
  categories_found integer not null default 0,
  source           text not null constraint search_trend_runs_source check (source in ('job', 'hide', 'unhide', 'manual')),
  constraint search_trend_runs_window_order check (window_start <= ist_day)
);
create index if not exists search_trend_runs_newest_idx on admin.search_trend_runs (id desc);

create table if not exists admin.search_trend_items (
  run_id   bigint not null references admin.search_trend_runs (id) on delete cascade,
  kind     text not null constraint search_trend_items_kind check (kind in ('term', 'category')),
  rank     smallint not null constraint search_trend_items_rank check (rank between 1 and 10),
  label    text not null constraint search_trend_items_label check (char_length(label) between 2 and 60),
  visitors integer not null,
  -- Visitor-days: how many (visitor, day) pairs searched it. Over one day it equals visitors.
  searches integer not null,
  primary key (run_id, kind, rank)
);

create table if not exists admin.search_trend_hidden (
  -- Its own id, because the Admin Log names a row by `id` (admin.audit_row_change).
  id         uuid primary key default gen_random_uuid(),
  term_norm  text not null unique
    constraint search_trend_hidden_norm check (term_norm = admin.search_term_norm(term_norm) and char_length(term_norm) between 1 and 100),
  hidden     boolean not null default true,
  reason     text not null constraint search_trend_hidden_reason check (char_length(btrim(reason)) between 3 and 500),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table admin.search_trend_runs enable row level security;
alter table admin.search_trend_items enable row level security;
alter table admin.search_trend_hidden enable row level security;
revoke all on admin.search_trend_runs, admin.search_trend_items, admin.search_trend_hidden from public, anon, authenticated;

drop trigger if exists trg_admin_audit on admin.search_trend_hidden;
create trigger trg_admin_audit after insert or update or delete on admin.search_trend_hidden
  for each row execute function admin.audit_row_change('');

-- The nightly scan reads search rows across every seller; the existing indexes all lead with vendor_id.
create index if not exists engagement_events_search_time_idx
  on public.engagement_events (event_type, created_at)
  where event_type in ('search_impression', 'search_click');

-- ── 3. Counting ──────────────────────────────────────────────────────────────
-- Both counting functions run once a night over every search in the window, so they are written for
-- volume (measured on 1M events, technicalimplementation.md): the term expression is written out rather
-- than calling admin.search_term_norm() (a function with a SET clause is never inlined, so it would run
-- per row), staff are read once into an array (an InitPlan), distinct counts are plain grouping steps (no sorts), and
-- the filters on the words run after grouping, on one row per term.

-- Terms searched by at least 3 visitors between two India dates (inclusive), ranked.
create or replace function admin.search_trend_terms(p_from date, p_to date)
returns table (rank integer, label text, visitors integer, searches integer)
language sql stable security definer set search_path = '' as $function$
  with ev as (
    -- Same as admin.search_term_norm(): lower case, trimmed, one space between words.
    select regexp_replace(lower(btrim(e.query_text)), '\s+', ' ', 'g') as q,
           coalesce(e.viewer_id::text, 's:' || e.session_id) as visitor,
           (e.created_at at time zone 'Asia/Kolkata')::date as d
      from public.engagement_events e
     where e.event_type = 'search_impression'
       and e.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and e.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
       and e.query_text is not null
       and coalesce(e.viewer_id::text, e.session_id) is not null
       and coalesce(e.viewer_id <> all (array(select a.id from admin.admin_users a where a.is_active)), true)
  ), qvd as (
    select ev.q, ev.visitor, ev.d from ev group by ev.q, ev.visitor, ev.d
  ), qv as (
    select qvd.q, qvd.visitor, count(*) as days from qvd group by qvd.q, qvd.visitor
  ), counted as (
    select qv.q, count(qv.visitor)::integer as visitors, sum(qv.days)::integer as searches
      from qv
     group by qv.q
    having count(qv.visitor) >= 3
  )
  select (row_number() over (order by c.visitors desc, c.searches desc, c.q))::integer, c.q, c.visitors, c.searches
    from counted c
   where char_length(c.q) between 2 and 40
     and c.q !~ '[0-9]{5,}'
     and c.q !~ '@|https?:|www\.|\.(com|in|net|org)\M'
     and not exists (select 1 from admin.search_trend_hidden h where h.term_norm = c.q and h.hidden)
$function$;

-- Categories by visitors who clicked a search result in them or searched their name, ranked.
create or replace function admin.search_trend_categories(p_from date, p_to date)
returns table (rank integer, label text, visitors integer, searches integer)
language sql stable security definer set search_path = '' as $function$
  with ev as (
    select e.event_type, e.product_id,
           regexp_replace(lower(btrim(coalesce(e.query_text, ''))), '\s+', ' ', 'g') as q,
           coalesce(e.viewer_id::text, 's:' || e.session_id) as visitor,
           (e.created_at at time zone 'Asia/Kolkata')::date as d
      from public.engagement_events e
     where e.event_type in ('search_impression', 'search_click')
       and e.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
       and e.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
       and coalesce(e.viewer_id::text, e.session_id) is not null
       and coalesce(e.viewer_id <> all (array(select a.id from admin.admin_users a where a.is_active)), true)
  ), cats as (
    select c.id, c.name, regexp_replace(lower(btrim(c.name)), '\s+', ' ', 'g') as n from public.categories c
  ), named as (
    -- Each distinct term against each category name, once: "shirt"/"shirts" → Shirt, "dresses" → Dress.
    select t.q, k.n
      from (select distinct ev.q from ev where ev.event_type = 'search_impression' and ev.q <> '') t
      join cats k on (k.n in (t.q, t.q || 's', t.q || 'es') or t.q in (k.n || 's', k.n || 'es'))
  ), hits as (
    select k.n, ev.visitor, ev.d
      from ev
      join public.products p on p.id = ev.product_id
      join cats k on k.id = p.category_id
     where ev.event_type = 'search_click'
    union all
    select nm.n, ev.visitor, ev.d
      from ev
      join named nm on nm.q = ev.q
     where ev.event_type = 'search_impression'
  ), nvd as (
    select h.n, h.visitor, h.d from hits h group by h.n, h.visitor, h.d
  ), nv as (
    select nvd.n, nvd.visitor, count(*) as days from nvd group by nvd.n, nvd.visitor
  ), counted as (
    select nv.n, (select min(k.name) from cats k where k.n = nv.n) as label,
           count(nv.visitor)::integer as visitors, sum(nv.days)::integer as searches
      from nv
     group by nv.n
  )
  select (row_number() over (order by c.visitors desc, c.searches desc, c.label))::integer, c.label, c.visitors, c.searches
    from counted c
   where char_length(c.label) between 2 and 60
     and not exists (select 1 from admin.search_trend_hidden x where x.term_norm = c.n and x.hidden)
$function$;

-- Computes and stores the list in force. Called by the daily job and after a hide or unhide.
create or replace function admin.search_trends_refresh(p_source text default 'job', p_now timestamptz default now())
returns bigint
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_day    date := (p_now at time zone 'Asia/Kolkata')::date - 1;
  v_window text;
  v_start  date;
  v_terms  integer;
  v_cats   integer;
  v_run    bigint;
  w        record;
begin
  if p_source not in ('job', 'hide', 'unhide', 'manual') then
    raise exception 'search_trends_refresh: unknown source %', p_source using errcode = '22023';
  end if;
  -- One computation at a time, so two hides at once can't publish lists out of order.
  perform pg_advisory_xact_lock(hashtext('admin.search_trends_refresh'));

  for w in select * from (values ('day', 0, 1), ('week', 6, 2), ('month', 29, 3)) as v(name, back, ord) order by v.ord loop
    v_window := w.name;
    v_start  := v_day - w.back;
    select count(*) into v_terms from admin.search_trend_terms(v_start, v_day);
    exit when v_terms >= 5;
  end loop;

  insert into admin.search_trend_runs (ist_day, trend_window, window_start, source)
  values (v_day, v_window, v_start, p_source)
  returning id into v_run;

  insert into admin.search_trend_items (run_id, kind, rank, label, visitors, searches)
  select v_run, 'term', t.rank, t.label, t.visitors, t.searches
    from admin.search_trend_terms(v_start, v_day) t where t.rank <= 10;
  get diagnostics v_terms = row_count;

  insert into admin.search_trend_items (run_id, kind, rank, label, visitors, searches)
  select v_run, 'category', c.rank, c.label, c.visitors, c.searches
    from admin.search_trend_categories(v_start, v_day) c where c.rank <= 6;
  get diagnostics v_cats = row_count;

  update admin.search_trend_runs set terms_found = v_terms, categories_found = v_cats where id = v_run;
  return v_run;
end
$function$;

revoke all on function admin.search_trend_terms(date, date), admin.search_trend_categories(date, date),
  admin.search_trends_refresh(text, timestamptz) from public, anon, authenticated;

-- ── 4. The public reader ─────────────────────────────────────────────────────
-- Words only, never counts. `public` says the switch is on for everyone (the snapshot then carries the
-- list); `shown` says it is on for this caller. When it isn't, the lists are empty.
create or replace function public.trending_searches()
returns jsonb
language sql stable security definer set search_path = '' as $function$
  with s as (
    select public.search_trending_on() as shown,
           coalesce((select f.enabled from public.feature_flags f where f.key = 'search_trending'), false) as everyone
  ), r as (
    select x.id, x.ist_day, x.trend_window, x.window_start, x.computed_at
      from admin.search_trend_runs x order by x.id desc limit 1
  )
  select jsonb_build_object(
    'version', 1,
    'public', s.everyone,
    'shown', s.shown,
    'window', case when s.shown then r.trend_window end,
    'ist_day', case when s.shown then r.ist_day end,
    'window_start', case when s.shown then r.window_start end,
    'computed_at', case when s.shown then r.computed_at end,
    'terms', case when s.shown and r.id is not null then coalesce((
        select jsonb_agg(jsonb_build_object('label', i.label) order by i.rank)
          from admin.search_trend_items i where i.run_id = r.id and i.kind = 'term'), '[]'::jsonb)
      else '[]'::jsonb end,
    'categories', case when s.shown and r.id is not null then coalesce((
        select jsonb_agg(jsonb_build_object('label', i.label) order by i.rank)
          from admin.search_trend_items i where i.run_id = r.id and i.kind = 'category'), '[]'::jsonb)
      else '[]'::jsonb end)
    from s left join r on true
$function$;
revoke all on function public.trending_searches() from public;
grant execute on function public.trending_searches() to anon, authenticated, service_role;

-- ── 5. Cosora-Admin › Trending searches ──────────────────────────────────────
-- Read: super admins, managers and support. Hide and unhide: super admins and support (they already
-- moderate what users write: chats, FAQs).
create or replace function admin.require_search_trends(p_write boolean)
returns void
language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(public.admin_role()::text, '') not in ('super_admin', 'support', 'manager')
     or (p_write and coalesce(public.admin_role()::text, '') not in ('super_admin', 'support')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end
$function$;
revoke all on function admin.require_search_trends(boolean) from public, anon, authenticated;

create or replace function public.admin_search_trends()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_run admin.search_trend_runs;
begin
  perform admin.require_search_trends(false);
  select * into v_run from admin.search_trend_runs order by id desc limit 1;
  return jsonb_build_object(
    'switch', (select jsonb_build_object('enabled', f.enabled, 'listed', cardinality(f.allow_profile_ids))
                 from public.feature_flags f where f.key = 'search_trending'),
    'run', case when v_run.id is null then null else jsonb_build_object(
             'id', v_run.id, 'computed_at', v_run.computed_at, 'ist_day', v_run.ist_day,
             'window', v_run.trend_window, 'window_start', v_run.window_start, 'source', v_run.source) end,
    'terms', coalesce((select jsonb_agg(jsonb_build_object('rank', i.rank, 'label', i.label,
                 'visitors', i.visitors, 'searches', i.searches) order by i.rank)
               from admin.search_trend_items i where i.run_id = v_run.id and i.kind = 'term'), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('rank', i.rank, 'label', i.label,
                 'visitors', i.visitors, 'searches', i.searches) order by i.rank)
               from admin.search_trend_items i where i.run_id = v_run.id and i.kind = 'category'), '[]'::jsonb),
    'hidden', coalesce((select jsonb_agg(jsonb_build_object('term', h.term_norm, 'hidden', h.hidden,
                 'reason', h.reason, 'updated_at', h.updated_at,
                 'updated_by_name', admin.audit_actor_name(h.updated_by)) order by h.hidden desc, h.updated_at desc)
               from admin.search_trend_hidden h), '[]'::jsonb),
    'recent_runs', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'computed_at', x.computed_at,
                 'ist_day', x.ist_day, 'window', x.trend_window, 'terms', x.terms_found,
                 'categories', x.categories_found, 'source', x.source) order by x.id desc)
               from (select * from admin.search_trend_runs order by id desc limit 14) x), '[]'::jsonb));
end
$function$;

create or replace function public.admin_search_trend_hide(p_term text, p_reason text)
returns bigint
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_term text := admin.search_term_norm(p_term);
begin
  perform admin.require_search_trends(true);
  if char_length(v_term) not between 1 and 100 then
    raise exception 'Give the term to hide (at most 100 characters).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Say why it is hidden (3 to 500 characters).' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', 'Trending search hidden: ' || left(btrim(p_reason), 470), true);
  insert into admin.search_trend_hidden as h (term_norm, hidden, reason, updated_by, updated_at)
  values (v_term, true, btrim(p_reason), auth.uid(), now())
  on conflict (term_norm) do update
     set hidden = true, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at
   where h.term_norm = excluded.term_norm;
  return admin.search_trends_refresh('hide');
end
$function$;

create or replace function public.admin_search_trend_unhide(p_term text, p_reason text)
returns bigint
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_term text := admin.search_term_norm(p_term);
begin
  perform admin.require_search_trends(true);
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Say why it may be shown again (3 to 500 characters).' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', 'Trending search shown again: ' || left(btrim(p_reason), 470), true);
  update admin.search_trend_hidden
     set hidden = false, reason = btrim(p_reason), updated_by = auth.uid(), updated_at = now()
   where term_norm = v_term and hidden;
  if not found then
    raise exception 'That term isn''t hidden.' using errcode = 'P0002';
  end if;
  return admin.search_trends_refresh('unhide');
end
$function$;

revoke all on function public.admin_search_trends(), public.admin_search_trend_hide(text, text),
  public.admin_search_trend_unhide(text, text) from public, anon, authenticated;
grant execute on function public.admin_search_trends(), public.admin_search_trend_hide(text, text),
  public.admin_search_trend_unhide(text, text) to authenticated;

-- ── 6. Snapshot: a new list, or a change to the switch, rebuilds site-config/site.json ──
drop trigger if exists trg_search_trend_runs_snapshot on admin.search_trend_runs;
create trigger trg_search_trend_runs_snapshot
  after insert on admin.search_trend_runs
  for each statement execute function public.site_config_queue_snapshot();

drop trigger if exists trg_feature_flags_search_trending_snapshot on public.feature_flags;
create trigger trg_feature_flags_search_trending_snapshot
  after update on public.feature_flags
  for each row when (new.key = 'search_trending' and (new.enabled, new.allow_profile_ids) is distinct from (old.enabled, old.allow_profile_ids))
  execute function public.site_config_queue_snapshot();

-- ── 7. A first list, so the page has one before the job's first run ──────────
select admin.search_trends_refresh('manual');

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  f text;
  t text;
begin
  if not exists (select 1 from public.feature_flags where key = 'search_trending') then
    raise exception 'self-check: the search_trending switch is missing';
  end if;
  foreach t in array array['admin.search_trend_runs', 'admin.search_trend_items', 'admin.search_trend_hidden'] loop
    if has_table_privilege('anon', t, 'SELECT') or has_table_privilege('authenticated', t, 'SELECT')
       or has_table_privilege('authenticated', t, 'INSERT') or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception 'self-check: a client role can reach %', t;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      raise exception 'self-check: RLS is off on %', t;
    end if;
  end loop;
  -- The privacy floor is the point of this feature: refuse a version without it.
  if (select p.prosrc from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure)
     !~ 'having count\(qv\.visitor\) >= 3' then
    raise exception 'self-check: the 3-visitor floor on trending terms is missing';
  end if;
  foreach f in array array['public.trending_searches()', 'public.search_trending_on()'] loop
    if not has_function_privilege('anon', f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % must be SECURITY DEFINER and callable signed out', f;
    end if;
  end loop;
  foreach f in array array['public.admin_search_trends()', 'public.admin_search_trend_hide(text,text)',
                           'public.admin_search_trend_unhide(text,text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  foreach f in array array['admin.search_trends_refresh(text,timestamptz)', 'admin.search_trend_terms(date,date)',
                           'admin.search_trend_categories(date,date)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: % is callable by a client', f;
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgname in ('trg_search_trend_runs_snapshot', 'trg_feature_flags_search_trending_snapshot')
        or (tgname = 'trg_admin_audit' and tgrelid = 'admin.search_trend_hidden'::regclass)) <> 3 then
    raise exception 'self-check: a search trends trigger is missing';
  end if;
  -- Signed out with the switch off, nothing is shown.
  if (select coalesce(f.enabled, false) from public.feature_flags f where f.key = 'search_trending') = false
     and jsonb_array_length(public.trending_searches() -> 'terms') <> 0 then
    raise exception 'self-check: trending_searches() shows terms while the switch is off';
  end if;
end
$check$;
