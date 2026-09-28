-- Admin completion, Phase 8 (Mitra, 2026-09-28): Live Activity, native.
--
-- Mitra chose "native dashboard + Clarity". Cosora-Admin's Live Activity page was only a
-- link to Microsoft Clarity. It now also reads Cosora's own engagement events, which the
-- buyer site already writes through log_engagement_event():
--
--   admin_live_activity(minutes)  one JSON answer:
--     active_now       visitors in the last 5 minutes, signed in and guest
--     active_window    the same over the window (5 minutes to 24 hours, default 60)
--     per_minute       events and visitors for each of the last 60 minutes
--     by_type          events per type in the window
--     top_products     most-viewed products in the window (views, visitors)
--     top_vendors      vendors with the most buyer actions in the window
--     top_searches     searches made by at least 3 different visitors in the window.
--                      Fewer and the query isn't shown: a rare search can identify the
--                      person who typed it (the same floor as vendor_buyer_geography).
--
-- A visitor is a signed-in viewer_id, or a guest's session_id (one browser tab session;
-- log_engagement_event keeps it only when signed out). "Active" means at least one
-- tracked event: a page with nothing tracked on it doesn't count. Impressions (an ad or
-- a vendor shown in search results) count in by_type and per_minute, but they aren't
-- buyer actions, so top_vendors leaves them out. A search logs one impression per
-- vendor shown, so top_searches counts visitors, not rows.
-- Readable by every active admin, like the page ("traction" in roles.ts).

create index if not exists engagement_events_created_idx on public.engagement_events (created_at desc);

create or replace function public.admin_live_activity(p_minutes int default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_minutes int := least(greatest(coalesce(p_minutes, 60), 5), 1440);
  v_since   timestamptz := now() - make_interval(mins => v_minutes);
  v_result  jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;

  with ev as (
    select e.event_type, e.product_id, e.vendor_id, e.query_text, e.created_at,
           e.viewer_id is not null as signed_in,
           coalesce(e.viewer_id::text, 's:' || e.session_id) as visitor
      from public.engagement_events e
     where e.created_at > least(v_since, now() - interval '60 minutes')
  )
  select jsonb_build_object(
    'generated_at',   now(),
    'window_minutes', v_minutes,
    'active_now', (select jsonb_build_object(
        'visitors',  count(distinct ev.visitor),
        'signed_in', count(distinct ev.visitor) filter (where ev.signed_in),
        'guests',    count(distinct ev.visitor) filter (where not ev.signed_in))
        from ev where ev.created_at > now() - interval '5 minutes'),
    'active_window', (select jsonb_build_object(
        'visitors',  count(distinct ev.visitor),
        'signed_in', count(distinct ev.visitor) filter (where ev.signed_in),
        'guests',    count(distinct ev.visitor) filter (where not ev.signed_in),
        'events',    count(*))
        from ev where ev.created_at > v_since),
    'per_minute', (select coalesce(jsonb_agg(jsonb_build_object(
                     'minute', m.minute, 'events', coalesce(c.events, 0), 'visitors', coalesce(c.visitors, 0))
                     order by m.minute), '[]'::jsonb)
                     from generate_series(date_trunc('minute', now()) - interval '59 minutes',
                                          date_trunc('minute', now()), interval '1 minute') as m(minute)
                     left join (select date_trunc('minute', ev.created_at) as minute,
                                       count(*) as events, count(distinct ev.visitor) as visitors
                                  from ev where ev.created_at > now() - interval '60 minutes'
                                 group by 1) c on c.minute = m.minute),
    'by_type', (select coalesce(jsonb_object_agg(t.event_type, t.n), '{}'::jsonb)
                  from (select ev.event_type, count(*) as n from ev where ev.created_at > v_since group by 1) t),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', t.product_id, 'name', p.name, 'vendor', v.brand_name, 'views', t.views, 'visitors', t.visitors)
                       order by t.views desc, t.visitors desc), '[]'::jsonb)
                       from (select ev.product_id, count(*) as views, count(distinct ev.visitor) as visitors
                               from ev
                              where ev.created_at > v_since and ev.event_type = 'product_view' and ev.product_id is not null
                              group by 1 order by 2 desc, 3 desc limit 5) t
                       left join public.products p on p.id = t.product_id
                       left join public.vendor_profiles v on v.id = p.vendor_id),
    'top_vendors', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', t.vendor_id, 'name', v.brand_name, 'actions', t.actions, 'visitors', t.visitors)
                      order by t.actions desc, t.visitors desc), '[]'::jsonb)
                      from (select ev.vendor_id, count(*) as actions, count(distinct ev.visitor) as visitors
                              from ev
                             where ev.created_at > v_since
                               and ev.event_type not in ('ad_impression', 'search_impression')
                             group by 1 order by 2 desc, 3 desc limit 5) t
                      left join public.vendor_profiles v on v.id = t.vendor_id),
    'top_searches', (select coalesce(jsonb_agg(jsonb_build_object('query', left(t.q, 100), 'visitors', t.visitors)
                       order by t.visitors desc, t.q), '[]'::jsonb)
                       from (select regexp_replace(lower(btrim(ev.query_text)), '\s+', ' ', 'g') as q,
                                    count(distinct ev.visitor) as visitors
                               from ev
                              where ev.created_at > v_since and ev.event_type = 'search_impression'
                                and btrim(coalesce(ev.query_text, '')) <> ''
                              group by 1
                             having count(distinct ev.visitor) >= 3
                              order by 2 desc, 1 limit 10) t)
  ) into v_result;
  return v_result;
end
$function$;

revoke all on function public.admin_live_activity(int) from public, anon, authenticated;
grant execute on function public.admin_live_activity(int) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if has_function_privilege('anon', 'public.admin_live_activity(int)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_live_activity(int)', 'EXECUTE') then
    raise exception 'self-check: admin_live_activity() grants are wrong';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.admin_live_activity(int)'::regprocedure) then
    raise exception 'self-check: admin_live_activity() is not SECURITY DEFINER';
  end if;
  if (select p.prosrc from pg_proc p where p.oid = 'public.admin_live_activity(int)'::regprocedure)
     !~ 'having count\(distinct ev\.visitor\) >= 3' then
    raise exception 'self-check: the 3-visitor floor on searches is missing';
  end if;
end
$check$;
