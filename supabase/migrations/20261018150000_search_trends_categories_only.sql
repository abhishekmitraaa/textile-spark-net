-- Trending searches: categories only, for now (Mitra, 2026-10-18).
--
-- The push security review of 20261018120000 found that a signed-out visitor is counted by the session id
-- its own browser sends, and log_engagement_event is open to anyone by design, so one script posing as 3
-- guest sessions can put any words that pass the filters on /search. Asked how terms should be published,
-- Mitra chose "Categories only for now": the public list shows the most searched categories (Cosora's own
-- names) and no typed term, until a better fix (staff approval, or counting signed-in accounts only).
--
--   * New switch `search_trending_terms`, created off: typed terms reach only the accounts it lists (and
--     everyone if it is ever turned on). trending_searches() returns `terms: []` otherwise. Staff still see
--     the terms and their counts in Cosora-Admin; admin_search_trends() now reports this switch too.
--   * A change to either switch queues the site-config rebuild.
--   * admin.search_trend_terms(): the "http"/"www" check is case-insensitive (`!~*`): after NFKC, full-width
--     capitals became upper-case ASCII and passed (security review of 20261018140000).
--
-- Guards: each replaced function must be the body the earlier migrations created.

do $guard$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure) <> 'a366535caf0c31d79efcfe8a13f4ba95'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.trending_searches()'::regprocedure) <> 'a7827fbd8c476556cd721ecf413be9bc'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'public.admin_search_trends()'::regprocedure) <> '6810083ba1b42a9438c839b828205ee5' then
    raise exception 'guard: a trending-searches function is not the body the earlier migrations created';
  end if;
end
$guard$;

insert into public.feature_flags (key, description, enabled)
values ('search_trending_terms',
        'Typed search terms in /search''s trending list. Off: only the most searched categories are shown (Mitra, 2026-10-18: "Categories only for now"), because a script can pose as 3 visitors. Turn on only with a fix for that.',
        false)
on conflict (key) do nothing;

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
     -- After NFKC (full-width letters, digits and punctuation become plain ones): at most 4 digits of any
     -- script in the whole term (a phone number split into groups, or written in Devanagari, Gujarati,
     -- Bengali, Tamil, Arabic… digits, is still one), and no "@", no dot of any kind, no "http" or "www" in any case, so
     -- no email, link or host name however it is spaced. A filter can always be written round (claude.md);
     -- this keeps the obvious out, and staff take down the rest.
     and char_length(regexp_replace(normalize(c.q, NFKC), '[^[:digit:]]', '', 'g')) <= 4
     and normalize(c.q, NFKC) !~* '[@.。｡]|https?|www'
     and not exists (select 1 from admin.search_trend_hidden h where h.term_norm = c.q and h.hidden)
$function$;

revoke all on function admin.search_trend_terms(date, date) from public, anon, authenticated;

create or replace function public.trending_searches()
returns jsonb
language sql stable security definer set search_path = '' as $function$
  with s as (
    select public.search_trending_on() as shown,
           coalesce((select f.enabled from public.feature_flags f where f.key = 'search_trending'), false) as everyone,
           -- Typed terms need their own switch (20261018150000): while it is off, only categories are shown.
           admin.feature_on_for('search_trending_terms', (select auth.uid())) as terms_on
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
    'terms', case when s.shown and s.terms_on and r.id is not null then coalesce((
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
    'terms_switch', (select jsonb_build_object('enabled', f.enabled, 'listed', cardinality(f.allow_profile_ids))
                       from public.feature_flags f where f.key = 'search_trending_terms'),
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

revoke all on function public.admin_search_trends() from public, anon, authenticated;
grant execute on function public.admin_search_trends() to authenticated;

drop trigger if exists trg_feature_flags_search_trending_snapshot on public.feature_flags;
create trigger trg_feature_flags_search_trending_snapshot
  after update on public.feature_flags
  for each row when (new.key in ('search_trending', 'search_trending_terms')
                     and (new.enabled, new.allow_profile_ids) is distinct from (old.enabled, old.allow_profile_ids))
  execute function public.site_config_queue_snapshot();

select admin.search_trends_refresh('manual');

do $check$
begin
  if not exists (select 1 from public.feature_flags where key = 'search_trending_terms') then
    raise exception 'self-check: the search_trending_terms switch is missing';
  end if;
  if (select p.prosrc from pg_proc p where p.oid = 'admin.search_trend_terms(date,date)'::regprocedure)
     !~ 'having count\(qv\.visitor\) >= 3' then
    raise exception 'self-check: the 3-visitor floor on trending terms is missing';
  end if;
  if position('search_trending_terms' in (select p.prosrc from pg_proc p where p.oid = 'public.trending_searches()'::regprocedure)) = 0 then
    raise exception 'self-check: trending_searches() does not check the terms switch';
  end if;
  if not has_function_privilege('anon', 'public.trending_searches()', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_search_trends()', 'EXECUTE')
     or has_function_privilege('authenticated', 'admin.search_trend_terms(date,date)', 'EXECUTE') then
    raise exception 'self-check: grants on the trending-searches functions are wrong';
  end if;
  -- With the terms switch off for everyone, a signed-out caller never gets a typed term.
  if (select f.enabled from public.feature_flags f where f.key = 'search_trending_terms') = false
     and jsonb_array_length(public.trending_searches() -> 'terms') <> 0 then
    raise exception 'self-check: trending_searches() returns terms while search_trending_terms is off';
  end if;
end
$check$;
